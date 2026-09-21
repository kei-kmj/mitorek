import type { Context, MiddlewareHandler } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import type { Type } from "arktype"
import type { DrizzleD1Database } from "drizzle-orm/d1"
import type { Env, UserId } from "../env"

/** ハンドラに注入されるもの。FastAPI の Depends() 相当 */
export type Deps<Q, P, B> = {
  query: Q
  param: P
  body: B
  db: DrizzleD1Database
  userId: UserId
  c: Context<Env>
}

type Opts<Q, P, B> = {
  summary: string
  tags?: string[]
  query?: Type<Q>
  param?: Type<P>
  body?: Type<B>
  response: Type<unknown>
  status?: 200 | 201                       // 既定 200。作成系は 201
}

/**
 * describeRoute + validator + 依存の取り出し を 1 つにまとめる。
 * 正常系 (200) だけを扱う。404 などは HTTPException を投げ、onError が JSON にする。
 */
export function route<Q = undefined, P = undefined, B = undefined>(
  o: Opts<Q, P, B>,
  fn: (d: Deps<Q, P, B>) => Promise<unknown>,
): MiddlewareHandler<Env>[] {
  const describe = describeRoute({
    summary: o.summary,
    tags: o.tags,
    responses: {
      [o.status ?? 200]: { description: "OK", content: { "application/json": { schema: resolver(o.response) } } },
    },
  })
  const validators: MiddlewareHandler[] = []
  if (o.query) validators.push(validator("query", o.query))
  if (o.param) validators.push(validator("param", o.param))
  if (o.body) validators.push(validator("json", o.body))

  const handler: MiddlewareHandler<Env> = async (c) => {
    // validator が積んだ検証済み値を取り出す。型は Opts の Type<Q> 等から Deps に結び付ける
    const valid = (target: "query" | "param" | "json") =>
      (c.req as unknown as { valid: (t: string) => unknown }).valid(target)
    return c.json(
      (await fn({
        query: (o.query ? valid("query") : undefined) as Q,
        param: (o.param ? valid("param") : undefined) as P,
        body: (o.body ? valid("json") : undefined) as B,
        db: c.var.db,
        userId: c.var.userId,
        c,
      })) as object,
      o.status ?? 200,
    )
  }
  return [describe, ...validators, handler]
}
