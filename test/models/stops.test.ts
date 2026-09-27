import { beforeEach, describe, expect, it } from "vitest";
import {
	addStop,
	deleteStop,
	putLeg,
	reorderStops,
	updateStop,
} from "../../src/models/stops";
import type { StopCreateBody, TripDetail } from "../../src/schemas/trips";
import { ME, seedFixture } from "../fixtures";
import { addStops, names, newTrip, testDb } from "../trip-helpers";

beforeEach(seedFixture);

const stopIds = (trip: TripDetail) =>
	trip.days[0]?.stops.map((s) => s.id) ?? [];

const add = (
	trip: TripDetail,
	place: StopCreateBody["place"],
	index?: number,
) =>
	addStop(testDb(), ME, {
		body: { index, place, updatedAt: trip.updatedAt },
		dayId: trip.days[0]?.id ?? "",
		tripId: trip.id,
	});

/** 1 日目に 駅 → 姫路城 の旅程 */
const twoStops = async () =>
	addStops(await newTrip(), [
		{ id: "himeji", type: "station" },
		{ id: "castle", type: "spot" },
	]);

describe("addStop", () => {
	it.each([
		["スポット", "castle", "spot", "姫路城"],
		["駅", "himeji", "station", "姫路"],
		["自分の地点", "hotel", "custom", "駅前ホテル"],
	] as const)("%s を足せる", async (_, id, type, name) => {
		const trip = await add(await newTrip(), { id, type });
		expect(trip.days[0]?.stops[0]?.place).toMatchObject({ id, name, type });
	});

	it("index の位置に差し込む", async () => {
		const trip = await add(
			await twoStops(),
			{ id: "hotel", type: "custom" },
			0,
		);
		expect(names(trip)).toEqual(["駅前ホテル", "姫路", "姫路城"]);
	});

	it("index を省けば末尾に足す", async () => {
		const trip = await add(await twoStops(), { id: "hotel", type: "custom" });
		expect(names(trip)).toEqual(["姫路", "姫路城", "駅前ホテル"]);
	});

	it("他人の登録地点は 404", async () => {
		await expect(
			add(await newTrip(), { id: "others", type: "custom" }),
		).rejects.toMatchObject({ status: 404 });
	});
});

describe("reorderStops", () => {
	it("並べ替えると、隣り合わなくなった移動は消える", async () => {
		let trip = await addStops(await newTrip(), [
			{ id: "himeji", type: "station" },
			{ id: "castle", type: "spot" },
			{ id: "hotel", type: "custom" },
		]);
		const [a, b, c] = stopIds(trip);
		// updatedAt を引き継ぐので逐次に送る
		for (const [from, mode] of [
			[a, "walk"],
			[b, "bus"],
		] as const) {
			// biome-ignore lint/performance/noAwaitInLoops: updatedAt を引き継ぐので逐次
			trip = await putLeg(testDb(), ME, {
				body: { mode, updatedAt: trip.updatedAt },
				stopId: from ?? "",
				tripId: trip.id,
			});
		}
		trip = await reorderStops(testDb(), ME, {
			body: { stopIds: [a, c, b] as string[], updatedAt: trip.updatedAt },
			dayId: trip.days[0]?.id ?? "",
			tripId: trip.id,
		});
		expect(names(trip)).toEqual(["姫路", "駅前ホテル", "姫路城"]);
		// a→b も b→c も隣り合わなくなったので消える
		expect(trip.days[0]?.stops.map((s) => s.leg)).toEqual([null, null, null]);
	});

	it.each([
		["足りない", (a: string) => [a]],
		["重複がある", (a: string) => [a, a]],
		["無い stop がある", (a: string) => [a, "missing"]],
	])("並びにその日の stop が%sなら 400", async (_, order) => {
		const trip = await twoStops();
		await expect(
			reorderStops(testDb(), ME, {
				body: {
					stopIds: order(stopIds(trip)[0] ?? ""),
					updatedAt: trip.updatedAt,
				},
				dayId: trip.days[0]?.id ?? "",
				tripId: trip.id,
			}),
		).rejects.toMatchObject({ status: 400 });
	});
});

describe("putLeg", () => {
	it("次の地点への移動を入れる", async () => {
		const before = await twoStops();
		const trip = await putLeg(testDb(), ME, {
			body: {
				departTime: "09:00",
				mode: "walk",
				updatedAt: before.updatedAt,
				url: "https://www.jorudan.co.jp/",
			},
			stopId: stopIds(before)[0] ?? "",
			tripId: before.id,
		});
		expect(trip.days[0]?.stops[0]?.leg).toMatchObject({
			departTime: "09:00",
			mode: "walk",
		});
	});

	it("最後の stop には次が無いので 400", async () => {
		const trip = await twoStops();
		await expect(
			putLeg(testDb(), ME, {
				body: { mode: "walk", updatedAt: trip.updatedAt },
				stopId: stopIds(trip)[1] ?? "",
				tripId: trip.id,
			}),
		).rejects.toMatchObject({ status: 400 });
	});
});

describe("updateStop", () => {
	it("送った時刻とメモだけ変える", async () => {
		const before = await twoStops();
		const trip = await updateStop(testDb(), ME, {
			body: { arriveTime: "10:30", memo: "北口", updatedAt: before.updatedAt },
			stopId: stopIds(before)[0] ?? "",
			tripId: before.id,
		});
		expect(trip.days[0]?.stops[0]).toMatchObject({
			arriveTime: "10:30",
			departTime: null,
			memo: "北口",
		});
	});
});

describe("deleteStop", () => {
	it("消すと残りが詰まる", async () => {
		const before = await twoStops();
		const trip = await deleteStop(testDb(), ME, {
			stopId: stopIds(before)[0] ?? "",
			tripId: before.id,
			updatedAt: before.updatedAt,
		});
		expect(names(trip)).toEqual(["姫路城"]);
	});
});
