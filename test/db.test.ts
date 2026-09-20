import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb } from "../src/db/client.ts";
import { games } from "../src/db/schema/master.ts";
import { users } from "../src/db/schema/users.ts";
import app from "../src/index.ts";

const CHECK_FAILED = /CHECK constraint failed: users_status_check/;

describe("D1 接続", () => {
	it("マイグレーションが適用され、テーブルが引ける", async () => {
		const db = createDb(env.mitorek_db);
		expect(await db.select().from(games)).toEqual([]);
	});

	it("書いた行が読める", async () => {
		const db = createDb(env.mitorek_db);
		await db.insert(games).values({ id: "dqw", name: "DQW" });
		const rows = await db.select().from(games);
		expect(rows).toEqual([
			{ id: "dqw", name: "DQW", note: null, sourceUrl: null },
		]);
	});

	it("GET /health/db がバインディング経由でクエリできる", async () => {
		const res = await app.request("/health/db", {}, env);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ games: 0, ok: true });
	});
});

describe("CHECK 制約", () => {
	it("列挙にない status を DB が拒否する", async () => {
		const db = createDb(env.mitorek_db);
		const error = await db
			.run(
				sql`INSERT INTO users (id, email, status) VALUES ('u1', 'a@example.com', 'bogus')`,
			)
			.catch((reason: unknown) => reason);
		// drizzle が元のエラーを包むので、D1 のメッセージは cause 側に入る
		expect(String((error as Error).cause)).toMatch(CHECK_FAILED);
	});

	it("列挙にある status は通る", async () => {
		const db = createDb(env.mitorek_db);
		await db
			.insert(users)
			.values({ email: "a@example.com", id: "u1", status: "active" });
		const [row] = await db.select().from(users);
		expect(row?.status).toBe("active");
	});
});
