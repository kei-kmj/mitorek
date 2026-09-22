import { applyD1Migrations, env, reset } from "cloudflare:test";
import { describe, expect, it } from "vitest";

/**
 * テーブルを作り直すマイグレーションで、参照している行が消えないこと。
 * D1 では PRAGMA foreign_keys=OFF が効かないので、DROP TABLE が ON DELETE CASCADE を起こしうる
 */
const count = async (table: string) =>
	(
		await env.mitorek_db
			.prepare(`SELECT count(*) AS n FROM ${table}`)
			.first<{ n: number }>()
	)?.n;

describe("マイグレーション", () => {
	it("0001 (trips の作り直し) の後も、日・立ち寄り・移動が残る", async () => {
		await reset();
		// 0000 だけ当ててデータを入れ、残り (0001〜) を後から当てる
		const first = env.TEST_MIGRATIONS.slice(0, 1);
		const rest = env.TEST_MIGRATIONS.slice(1);
		await applyD1Migrations(env.mitorek_db, first);
		await env.mitorek_db.batch(
			[
				"INSERT INTO users (id, email) VALUES ('u', 'u@example.com')",
				"INSERT INTO regions (id, name) VALUES ('r', 'r')",
				"INSERT INTO prefectures (code, country_code, name, region_id, sort_order) VALUES ('JP-20', 'JP', '長野県', 'r', 20)",
				"INSERT INTO stations (id, source, source_code, name, prefecture_code, lat, lng) VALUES ('s1', 't', '1', '松本', 'JP-20', 36.2, 137.9), ('s2', 't', '2', '白馬', 'JP-20', 36.7, 137.8)",
				"INSERT INTO trips (id, user_id, title, start_date, end_date) VALUES ('t', 'u', '旅', '2026-10-10', '2026-10-10')",
				"INSERT INTO days (id, trip_id, date) VALUES ('d', 't', '2026-10-10')",
				"INSERT INTO stops (id, day_id, seq, station_id) VALUES ('a', 'd', 0, 's1'), ('b', 'd', 1, 's2')",
				"INSERT INTO legs (id, from_stop_id, to_stop_id, mode) VALUES ('l', 'a', 'b', 'train')",
				"INSERT INTO links (id, trip_id, label, url) VALUES ('k', 't', '切符', 'https://example.com')",
			].map((q) => env.mitorek_db.prepare(q)),
		);
		await applyD1Migrations(env.mitorek_db, rest);
		expect({
			days: await count("days"),
			legs: await count("legs"),
			links: await count("links"),
			stops: await count("stops"),
			trips: await count("trips"),
		}).toEqual({ days: 1, legs: 1, links: 1, stops: 2, trips: 1 });
		// 新しい状態 (終了) を入れられる
		await env.mitorek_db
			.prepare("UPDATE trips SET status = 'completed' WHERE id = 't'")
			.run();
	});
});
