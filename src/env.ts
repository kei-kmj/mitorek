import type { Db } from "./db/client";

/** 個人データの持ち主。users.id (ULID) */
export type UserId = string;

/** Hono の型パラメータ。ミドルウェアが db と userId を積む */
export interface Env {
	Bindings: CloudflareBindings;
	Variables: { db: Db; userId: UserId };
}
