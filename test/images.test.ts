import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { visits } from "../src/db/schema/visits";
import app from "../src/index";
import type { VisitImage } from "../src/schemas/images";
import type { Visit } from "../src/schemas/visits";
import { call, OTHER, seedTripFixture } from "./trip-helpers";

/** Exif (APP1) 入りの小さな JPEG もどき: SOI, APP1, SOS…EOI */
const EXIF = [0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
const SCAN = [0xff, 0xda, 0x00, 0x02, 0x11, 0xff, 0xd9];
const JPEG_WITH_EXIF = new Uint8Array([0xff, 0xd8, ...EXIF, ...SCAN]);
const JPEG_STRIPPED = [0xff, 0xd8, ...SCAN];

const upload = (visitId: string, bytes: Uint8Array, type = "image/jpeg") => {
	const form = new FormData();
	form.append("file", new File([bytes], "photo.jpg", { type }));
	form.append("caption", "天守");
	return app.request(
		`/api/visits/${visitId}/images`,
		{ body: form, method: "POST" },
		env,
	);
};

let visit: Visit;

beforeEach(async () => {
	await seedTripFixture();
	visit = (await call("POST", "/visits", { spotId: "castle" }))
		.json as unknown as Visit;
});

describe("訪問の写真", () => {
	it("位置情報 (Exif) を消して保存し、訪問の一覧に出て、本人は見られる", async () => {
		const res = await upload(visit.id, JPEG_WITH_EXIF);
		expect(res.status).toBe(201);
		const image = (await res.json()) as VisitImage;
		expect(image).toMatchObject({ caption: "天守", visitId: visit.id });

		const list = (await call("GET", "/visits?spotId=castle"))
			.json as unknown as Visit[];
		expect(list[0]?.images.map((i) => i.id)).toEqual([image.id]);

		const got = await app.request(image.url, {}, env);
		expect(got.headers.get("content-type")).toBe("image/jpeg");
		expect([...new Uint8Array(await got.arrayBuffer())]).toEqual(JPEG_STRIPPED);
	});

	it("JPEG 以外は 400、他人の訪問には足せない (404)", async () => {
		const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
		expect((await upload(visit.id, png, "image/png")).status).toBe(400);
		await createDb(env.mitorek_db)
			.insert(visits)
			.values({ id: "others", spotId: "castle", userId: OTHER });
		expect((await upload("others", JPEG_WITH_EXIF)).status).toBe(404);
	});

	it("写真を消すと R2 からも消え、訪問を取り消すと写真も消える", async () => {
		const first = (await (
			await upload(visit.id, JPEG_WITH_EXIF)
		).json()) as VisitImage;
		const second = (await (
			await upload(visit.id, JPEG_WITH_EXIF)
		).json()) as VisitImage;
		expect((await call("DELETE", `/images/${first.id}`)).status).toBe(200);
		expect((await app.request(first.url, {}, env)).status).toBe(404);

		await call("DELETE", `/visits/${visit.id}`);
		expect((await app.request(second.url, {}, env)).status).toBe(404);
		const left = await env.mitorek_images.list();
		expect(left.objects).toEqual([]);
	});
});
