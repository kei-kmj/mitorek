import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { addImage, deleteImage, imageResponse } from "../../src/models/images";
import { createVisit, deleteVisit, listVisits } from "../../src/models/visits";
import type { Visit } from "../../src/schemas/visits";
import { insertOthersVisit, ME, seedFixture } from "../fixtures";
import { testDb } from "../trip-helpers";

/** Exif (APP1) 入りの小さな JPEG もどき: SOI, APP1, SOS…EOI */
const EXIF = [0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
const SCAN = [0xff, 0xda, 0x00, 0x02, 0x11, 0xff, 0xd9];
const JPEG_WITH_EXIF = new Uint8Array([0xff, 0xd8, ...EXIF, ...SCAN]);
const JPEG_STRIPPED = [0xff, 0xd8, ...SCAN];
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

const bucket = env.mitorek_images;

const add = (visitId: string, bytes: Uint8Array, type = "image/jpeg") =>
	addImage(testDb(), ME, {
		body: {
			caption: "天守",
			file: new File([bytes], "photo.jpg", { type }),
		},
		bucket,
		visitId,
	});
const view = (imageId: string) =>
	imageResponse(testDb(), ME, { bucket, imageId });

let visit: Visit;

beforeEach(async () => {
	await seedFixture();
	visit = await createVisit(testDb(), ME, { spotId: "castle" });
});

describe("addImage", () => {
	it("位置情報 (Exif) を消して保存する", async () => {
		const image = await add(visit.id, JPEG_WITH_EXIF);
		const stored = await view(image.id);
		expect([...new Uint8Array(await stored.arrayBuffer())]).toEqual(
			JPEG_STRIPPED,
		);
	});

	it("足した写真は訪問の一覧に出る", async () => {
		const image = await add(visit.id, JPEG_WITH_EXIF);
		const list = await listVisits(testDb(), ME, "castle");
		expect(list[0]?.images.map((i) => i.id)).toEqual([image.id]);
	});

	it.each([
		// 宣言された種類は見ず、中身のバイトで判定する
		["image/jpeg と名乗る PNG", "image/jpeg"],
		["PNG", "image/png"],
	])("%s は 400", async (_, type) => {
		await expect(add(visit.id, PNG, type)).rejects.toMatchObject({
			status: 400,
		});
	});

	it("他人の訪問には足せない (404)", async () => {
		await insertOthersVisit();
		await expect(add("others", JPEG_WITH_EXIF)).rejects.toMatchObject({
			status: 404,
		});
	});
});

describe("imageResponse", () => {
	it("本人は JPEG として見られる", async () => {
		const image = await add(visit.id, JPEG_WITH_EXIF);
		expect((await view(image.id)).headers.get("content-type")).toBe(
			"image/jpeg",
		);
	});
});

describe("deleteImage", () => {
	it("写真を消すと R2 からも消え、見られなくなる", async () => {
		const image = await add(visit.id, JPEG_WITH_EXIF);
		await deleteImage(testDb(), ME, { bucket, imageId: image.id });
		await expect(view(image.id)).rejects.toMatchObject({ status: 404 });
		expect((await bucket.list()).objects).toEqual([]);
	});
});

describe("deleteVisit と写真", () => {
	it("訪問を取り消すと、その写真も R2 から消える", async () => {
		const image = await add(visit.id, JPEG_WITH_EXIF);
		await deleteVisit(testDb(), ME, { bucket, visitId: visit.id });
		await expect(view(image.id)).rejects.toMatchObject({ status: 404 });
		expect((await bucket.list()).objects).toEqual([]);
	});
});
