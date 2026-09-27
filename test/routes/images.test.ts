import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../../src/index";
import { addImage } from "../../src/models/images";
import { createVisit } from "../../src/models/visits";
import { VisitImage } from "../../src/schemas/images";
import type { Visit } from "../../src/schemas/visits";
import { ME, seedFixture } from "../fixtures";
import { call, errorBody, testDb } from "../trip-helpers";

const PRIVATE = /^private/u;

/** 最小の JPEG もどき: SOI, SOS…EOI */
const JPEG = new Uint8Array([
	0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0x11, 0xff, 0xd9,
]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

const upload = (visitId: string, form: FormData) =>
	app.request(
		`/api/visits/${visitId}/images`,
		{ body: form, method: "POST" },
		env,
	);
const formWith = (bytes: Uint8Array, type = "image/jpeg") => {
	const form = new FormData();
	form.append("file", new File([bytes], "photo.jpg", { type }));
	form.append("caption", "天守");
	return form;
};
const saveImage = (visitId: string) =>
	addImage(testDb(), ME, {
		body: { file: new File([JPEG], "photo.jpg", { type: "image/jpeg" }) },
		bucket: env.mitorek_images,
		visitId,
	});

let visit: Visit;

beforeEach(async () => {
	await seedFixture();
	visit = await createVisit(testDb(), ME, { spotId: "castle" });
});

describe("POST /api/visits/:id/images", () => {
	it("multipart で送ると 201 で写真の情報を返す", async () => {
		const res = await upload(visit.id, formWith(JPEG));
		expect(res.status).toBe(201);
		const json = await res.json();
		expect(VisitImage.allows(json)).toBe(true);
		expect(json).toMatchObject({ caption: "天守", visitId: visit.id });
	});

	it.each([
		["file なし", () => new FormData()],
		["JPEG 以外", () => formWith(PNG, "image/png")],
	])("%s は 400", async (_, form) => {
		const res = await upload(visit.id, form());
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual(errorBody(400));
	});

	it("無い訪問は 404", async () => {
		const res = await upload("missing", formWith(JPEG));
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual(errorBody(404));
	});
});

describe("GET /api/images/:id", () => {
	it("200 で JPEG を返し、手元にだけキャッシュさせる", async () => {
		const image = await saveImage(visit.id);
		const res = await app.request(`/api/images/${image.id}`, {}, env);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("image/jpeg");
		expect(res.headers.get("cache-control")).toMatch(PRIVATE);
	});

	it("無い写真は 404", async () => {
		const { json, status } = await call("GET", "/images/missing");
		expect(status).toBe(404);
		expect(json).toEqual(errorBody(404));
	});
});

describe("DELETE /api/images/:id", () => {
	it("200 で消した id を返す", async () => {
		const image = await saveImage(visit.id);
		const { json, status } = await call("DELETE", `/images/${image.id}`);
		expect(status).toBe(200);
		expect(json).toEqual({ id: image.id });
	});

	it("無い写真は 404", async () => {
		const { json, status } = await call("DELETE", "/images/missing");
		expect(status).toBe(404);
		expect(json).toEqual(errorBody(404));
	});
});
