import type { Type } from "arktype";
import type { Context, MiddlewareHandler } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import type { Db } from "../db/client";
import type { Env, UserId } from "../env";
import { type CREATED, OK } from "./http";

/** スキーマ未指定なら undefined、指定ありなら検証・変換後 (morph 適用後) の型 */
type Out<S> = S extends Type ? S["infer"] : undefined;

interface Opts<Q, P, B> {
	body?: B;
	param?: P;
	query?: Q;
	response: Type;
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

/** スキーマがあればその validator、なければ素通し */
const validatorOr = (
	target: "query" | "param" | "json",
	schema: Type | undefined,
): Handler => {
	if (!schema) {
		return passThrough;
	}
	return validator(target, schema);
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
	const describe = describeRoute({
		responses: {
			[status]: {
				content: { "application/json": { schema: resolver(o.response) } },
				description: "OK",
			},
		},
		summary: o.summary,
		tags: o.tags,
	});

	const handler: Handler = async (c) => {
		// validator が積んだ検証済み値を取り出す。型は Opts のスキーマから Deps に結び付ける
		const valid = (target: "query" | "param" | "json") =>
			(c.req as unknown as { valid: (t: string) => unknown }).valid(target);
		const result = await fn({
			body: (o.body && valid("json")) as Out<BodySchema>,
			c,
			db: c.var.db,
			param: (o.param && valid("param")) as Out<ParamSchema>,
			query: (o.query && valid("query")) as Out<QuerySchema>,
			userId: c.var.userId,
		});
		return c.json(result as object, status);
	};
	return [
		describe,
		validatorOr("query", o.query),
		validatorOr("param", o.param),
		validatorOr("json", o.body),
		handler,
	];
};
