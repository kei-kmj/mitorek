import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { findSpot } from "../../src/models/spots";
import { createVisit, deleteVisit, listVisits } from "../../src/models/visits";
import { insertOthersVisit, ME, seedFixture } from "../fixtures";
import { testDb } from "../trip-helpers";

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

beforeEach(seedFixture);

const visited = async () => (await findSpot(testDb(), ME, "castle"))?.visited;
const remove = (visitId: string) =>
	deleteVisit(testDb(), ME, { bucket: env.mitorek_images, visitId });

describe("createVisit", () => {
	it("日時はサーバーの現在時刻 (UTC)、座標は送られたものを持つ", async () => {
		const visit = await createVisit(testDb(), ME, {
			lat: 34.839,
			lng: 134.694,
			spotId: "castle",
		});
		expect(visit.visitedAt).toMatch(ISO_DATETIME);
		expect(visit).toMatchObject({ images: [], lat: 34.839, lng: 134.694 });
	});

	it("記録したスポットは訪問済みになる", async () => {
		await createVisit(testDb(), ME, { spotId: "castle" });
		expect(await visited()).toBe(true);
	});

	it.each([
		["廃止したスポット", "retired"],
		["無いスポット", "missing"],
	])("%s には記録できない (404)", async (_, spotId) => {
		await expect(createVisit(testDb(), ME, { spotId })).rejects.toMatchObject({
			status: 404,
		});
	});
});

describe("listVisits", () => {
	it("記録した訪問が出る", async () => {
		const visit = await createVisit(testDb(), ME, { spotId: "castle" });
		expect((await listVisits(testDb(), ME, "castle")).map((v) => v.id)).toEqual(
			[visit.id],
		);
	});

	it("他人の訪問は出ない", async () => {
		await insertOthersVisit();
		expect(await listVisits(testDb(), ME, "castle")).toEqual([]);
	});
});

describe("deleteVisit", () => {
	it("取り消すと未訪問に戻る", async () => {
		const visit = await createVisit(testDb(), ME, { spotId: "castle" });
		await remove(visit.id);
		expect(await visited()).toBe(false);
	});

	it("他人の訪問は取り消せない (404)", async () => {
		await insertOthersVisit();
		await expect(remove("others")).rejects.toMatchObject({ status: 404 });
	});
});
