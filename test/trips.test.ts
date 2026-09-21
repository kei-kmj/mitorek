import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { trips } from "../src/db/schema/itinerary";
import app from "../src/index";
import {
	addStops,
	call,
	names,
	newTrip,
	OTHER,
	seedTripFixture,
} from "./trip-helpers";

const MISSING_DATES = /startDate and endDate/;
const REMOVED_DATE = /2026-10-12/;

beforeEach(seedTripFixture);

describe("旅程の作成", () => {
	it("期間の日が自動でできる", async () => {
		const trip = await newTrip();
		expect(trip.status).toBe("planning");
		expect(trip.days.map((d) => d.date)).toEqual([
			"2026-10-10",
			"2026-10-11",
			"2026-10-12",
		]);
	});

	it("延期以外で日付が無い・31 日を超える期間は 400 を { error } で返す", async () => {
		const noDates = await call("POST", "/trips", { title: "x" });
		expect(noDates.status).toBe(400);
		expect(noDates.json.error?.message).toMatch(MISSING_DATES);
		const tooLong = await call("POST", "/trips", {
			endDate: "2026-12-31",
			startDate: "2026-10-01",
			title: "x",
		});
		expect(tooLong.status).toBe(400);
	});

	it("延期なら日付なしで作れて、日はできない", async () => {
		const { json, status } = await call("POST", "/trips", {
			status: "postponed",
			title: "いつか",
		});
		expect(status).toBe(201);
		expect(json.days).toEqual([]);
	});
});

describe("楽観ロックと期間の変更", () => {
	it("古い updatedAt での変更は 409 で、何も変わらない", async () => {
		const trip = await newTrip();
		const first = await call("PATCH", `/trips/${trip.id}`, {
			title: "A",
			updatedAt: trip.updatedAt,
		});
		expect(first.status).toBe(200);
		const stale = await call("PATCH", `/trips/${trip.id}`, {
			title: "B",
			updatedAt: trip.updatedAt,
		});
		expect(stale.status).toBe(409);
		expect((await call("GET", `/trips/${trip.id}`)).json.title).toBe("A");
	});

	it("地点が入った日が期間から外れるときは確認 (removeDaysWithStops) が要る", async () => {
		let trip = await newTrip();
		trip = (
			await call("POST", `/trips/${trip.id}/days/${trip.days[2]?.id}/stops`, {
				place: { id: "castle", type: "spot" },
				updatedAt: trip.updatedAt,
			})
		).json;
		const shrink = { endDate: "2026-10-11", updatedAt: trip.updatedAt };
		const ng = await call("PATCH", `/trips/${trip.id}`, shrink);
		expect(ng.status).toBe(409);
		expect(ng.json.error?.message).toMatch(REMOVED_DATE);
		const ok = await call("PATCH", `/trips/${trip.id}`, {
			...shrink,
			removeDaysWithStops: true,
		});
		expect(ok.json.days.map((d) => d.date)).toEqual([
			"2026-10-10",
			"2026-10-11",
		]);
	});

	it("期間を延ばすと日が増え、既存の日と中身は残る", async () => {
		let trip = await addStops(await newTrip(), [
			{ id: "castle", type: "spot" },
		]);
		trip = (
			await call("PATCH", `/trips/${trip.id}`, {
				endDate: "2026-10-13",
				updatedAt: trip.updatedAt,
			})
		).json;
		expect(trip.days).toHaveLength(4);
		expect(names(trip)).toEqual(["姫路城"]);
	});
});

describe("他人の旅程と削除", () => {
	it("他人の旅程は見えない (404)", async () => {
		await createDb(env.mitorek_db).insert(trips).values({
			endDate: "2026-10-10",
			id: "others-trip",
			startDate: "2026-10-10",
			title: "他人",
			userId: OTHER,
		});
		expect((await call("GET", "/trips/others-trip")).status).toBe(404);
		expect((await call("GET", "/trips")).json).toEqual([]);
	});

	it("削除すると一覧から消える", async () => {
		const trip = await newTrip();
		const res = await call(
			"DELETE",
			`/trips/${trip.id}?updatedAt=${trip.updatedAt}`,
		);
		expect(res.status).toBe(200);
		expect((await call("GET", "/trips")).json).toEqual([]);
	});
});

describe("旅程の画面", () => {
	it("GET /trips に一覧と作成フォームが出る", async () => {
		await newTrip();
		const res = await app.request("/trips", {}, env);
		const html = await res.text();
		expect(html).toContain("姫路");
		expect(html).toContain('id="new-trip"');
	});

	it("GET /trips/:id は自分の旅程なら編集画面、無ければ 404", async () => {
		const trip = await newTrip();
		expect((await app.request(`/trips/${trip.id}`, {}, env)).status).toBe(200);
		expect((await app.request("/trips/missing", {}, env)).status).toBe(404);
	});
});
