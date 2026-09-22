import type { Type } from "arktype";
import type { Context, MiddlewareHandler } from "hono";
import {
	type ContentWithResolver,
	describeRoute,
	resolver,
	validator,
} from "hono-openapi";
import type { Db } from "../db/client";
import type { Env, UserId } from "../env";
import { BAD_REQUEST, type CREATED, OK } from "./http";

/** スキーマ未指定なら undefined、指定ありなら検証・変換後 (morph 適用後) の型 */
type Out<S> = S extends Type ? S["infer"] : undefined;

interface Opts<Q, P, B> {
	/**
	 * 応答が JSON でなく画像などのときの MIME (image/jpeg)。
	 * ハンドラは Response を返し、route はそれをそのまま返す
	 */
	binary?: string;
	body?: B;
	/** 本文の形。既定 json。ファイルを受けるときは form (multipart/form-data) */
	bodyFormat?: "json" | "form";
	param?: P;
	query?: Q;
	/** JSON の応答の形。binary のときは要らない */
	response?: Type;
	/** 既定 200。作成系は 201 */
	status?: typeof OK | typeof CREATED;
	summary: string;
	tags?: string[];
}

type Handler = MiddlewareHandler<Env>;

/**
 * Hono の app.get(path, ...handlers) は可変長配列の spread を型で受けないので、
 * 要素数固定のタプルで返す。使わない validator の枠は素通しで埋める
 */
type RouteHandlers = [Handler, Handler, Handler, Handler, Handler];

const passThrough: Handler = async (_c, next) => {
	await next();
};

/** スキーマがあればその validator、なければ素通し。検証失敗は onError と同じ形で 400 を返す */
const validatorOr = (
	target: "query" | "param" | "json" | "form",
	schema: Type | undefined,
): Handler => {
	if (!schema) {
		return passThrough;
	}
	return validator(target, schema, (result, c) => {
		if (result.success) {
			return;
		}
		const message = result.error.map((issue) => issue.message).join("; ");
		return c.json({ error: { code: BAD_REQUEST, message } }, BAD_REQUEST);
	});
};

/** OpenAPI に載せる応答の形。画像などは binary の MIME で、JSON はスキーマから */
const responseContent = (o: {
	binary?: string;
	response?: Type;
}): ContentWithResolver => {
	if (o.binary) {
		return { [o.binary]: { schema: { format: "binary", type: "string" } } };
	}
	return { "application/json": { schema: resolver(o.response as Type) } };
};

/** ハンドラに注入されるもの。FastAPI の Depends() 相当 */
export interface Deps<Q, P, B> {
	body: B;
	c: Context<Env>;
	db: Db;
	param: P;
	query: Q;
	userId: UserId;
}

/**
 * describeRoute + validator + 依存の取り出し を 1 つにまとめる。
 * 正常系 (200) だけを扱う。404 などは HTTPException を投げ、onError が JSON にする。
 */
export const route = <
	QuerySchema extends Type | undefined = undefined,
	ParamSchema extends Type | undefined = undefined,
	BodySchema extends Type | undefined = undefined,
>(
	o: Opts<QuerySchema, ParamSchema, BodySchema>,
	fn: (
		d: Deps<Out<QuerySchema>, Out<ParamSchema>, Out<BodySchema>>,
	) => Promise<unknown>,
): RouteHandlers => {
	const status = o.status ?? OK;
	const bodyTarget = o.bodyFormat ?? "json";
	const describe = describeRoute({
		responses: {
			[status]: { content: responseContent(o), description: "OK" },
		},
		summary: o.summary,
		tags: o.tags,
	});

	const handler: Handler = async (c) => {
		// validator が積んだ検証済み値を取り出す。型は Opts のスキーマから Deps に結び付ける
		const valid = (target: "query" | "param" | "json" | "form") =>
			(c.req as unknown as { valid: (t: string) => unknown }).valid(target);
		const result = await fn({
			body: (o.body && valid(bodyTarget)) as Out<BodySchema>,
			c,
			db: c.var.db,
			param: (o.param && valid("param")) as Out<ParamSchema>,
			query: (o.query && valid("query")) as Out<QuerySchema>,
			userId: c.var.userId,
		});
		// 画像などはハンドラが作った Response をそのまま返す
		if (result instanceof Response) {
			return result;
		}
		return c.json(result as object, status);
	};
	return [
		describe,
		validatorOr("query", o.query),
		validatorOr("param", o.param),
		validatorOr(bodyTarget, o.body),
		handler,
	];
};
