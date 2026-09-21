import type { MiddlewareHandler } from "hono";
import { createDb } from "../db/client";
import type { Env } from "../env";

/**
 * リクエストごとに db と userId を積む。API と画面の両方で使う。
 * 認証 (better-auth) が入るまでは DEV_USER_ID を固定の利用者として使う
 */
export const injectDeps: MiddlewareHandler<Env> = async (c, next) => {
	c.set("db", createDb(c.env.mitorek_db));
	c.set("userId", c.env.DEV_USER_ID);
	await next();
};
