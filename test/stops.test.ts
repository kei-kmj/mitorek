import { beforeEach, describe, expect, it } from "vitest";
import {
	addStops,
	call,
	names,
	newTrip,
	seedTripFixture,
} from "./trip-helpers";

beforeEach(seedTripFixture);

describe("立ち寄りの追加", () => {
	it("スポット・駅・自分の地点を足せて、index で差し込める", async () => {
		let trip = await addStops(await newTrip(), [
			{ id: "himeji", type: "station" },
			{ id: "castle", type: "spot" },
		]);
		trip = (
			await call("POST", `/trips/${trip.id}/days/${trip.days[0]?.id}/stops`, {
				index: 0,
				place: { id: "hotel", type: "custom" },
				updatedAt: trip.updatedAt,
			})
		).json;
		expect(names(trip)).toEqual(["駅前ホテル", "姫路", "姫路城"]);
		expect(trip.days[0]?.stops[0]?.place).toMatchObject({
			kind: "hotel",
			type: "custom",
		});
	});

	it("他人の登録地点は 404", async () => {
		const trip = await newTrip();
		const res = await call(
			"POST",
			`/trips/${trip.id}/days/${trip.days[0]?.id}/stops`,
			{ place: { id: "others", type: "custom" }, updatedAt: trip.updatedAt },
		);
		expect(res.status).toBe(404);
	});
});

describe("並べ替えと移動", () => {
	it("並べ替えると、隣り合わなくなった移動は消える", async () => {
		let trip = await addStops(await newTrip(), [
			{ id: "himeji", type: "station" },
			{ id: "castle", type: "spot" },
			{ id: "hotel", type: "custom" },
		]);
		const [a, b, c] = trip.days[0]?.stops.map((s) => s.id) ?? [];
		const putLeg = async (from: string | undefined, mode: string) =>
			(
				await call("PUT", `/trips/${trip.id}/stops/${from}/leg`, {
					mode,
					updatedAt: trip.updatedAt,
				})
			).json;
		// updatedAt を引き継ぐので逐次に送る
		trip = await putLeg(a, "walk");
		trip = await putLeg(b, "bus");
		trip = (
			await call("PUT", `/trips/${trip.id}/days/${trip.days[0]?.id}/order`, {
				stopIds: [a, c, b],
				updatedAt: trip.updatedAt,
			})
		).json;
		expect(names(trip)).toEqual(["姫路", "駅前ホテル", "姫路城"]);
		// a→b も b→c も隣り合わなくなったので消える
		expect(trip.days[0]?.stops.map((s) => s.leg)).toEqual([null, null, null]);
	});

	it("移動は次の地点がある stop だけ。最後の stop は 400", async () => {
		const trip = await addStops(await newTrip(), [
			{ id: "himeji", type: "station" },
			{ id: "castle", type: "spot" },
		]);
		const [first, last] = trip.days[0]?.stops ?? [];
		const ok = await call("PUT", `/trips/${trip.id}/stops/${first?.id}/leg`, {
			departTime: "09:00",
			mode: "walk",
			updatedAt: trip.updatedAt,
			url: "https://www.jorudan.co.jp/",
		});
		expect(ok.json.days[0]?.stops[0]?.leg).toMatchObject({
			departTime: "09:00",
			mode: "walk",
		});
		const ng = await call("PUT", `/trips/${trip.id}/stops/${last?.id}/leg`, {
			mode: "walk",
			updatedAt: ok.json.updatedAt,
		});
		expect(ng.status).toBe(400);
	});
});

describe("立ち寄りの変更と削除", () => {
	it("時刻とメモを変え、消すと残りが詰まる", async () => {
		let trip = await addStops(await newTrip(), [
			{ id: "himeji", type: "station" },
			{ id: "castle", type: "spot" },
		]);
		const [first] = trip.days[0]?.stops ?? [];
		trip = (
			await call("PATCH", `/trips/${trip.id}/stops/${first?.id}`, {
				arriveTime: "10:30",
				memo: "北口",
				updatedAt: trip.updatedAt,
			})
		).json;
		expect(trip.days[0]?.stops[0]).toMatchObject({
			arriveTime: "10:30",
			memo: "北口",
		});
		trip = (
			await call(
				"DELETE",
				`/trips/${trip.id}/stops/${first?.id}?updatedAt=${trip.updatedAt}`,
			)
		).json;
		expect(names(trip)).toEqual(["姫路城"]);
	});
});
