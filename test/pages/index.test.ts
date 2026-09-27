import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../../src/index";
import { seedFixture } from "../fixtures";
import { newTrip } from "../trip-helpers";

describe("ページ", () => {
	it("GET / がホームを返し、地図への入口がある", async () => {
		const res = await app.request("/", {}, env);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain('href="/map"');
	});

	it("GET /map が地図の器と map.js を返す", async () => {
		const res = await app.request("/map", {}, env);
		expect(res.status).toBe(200);
		const html = await res.text();
		// map.js は #map に載るので、器と読み込みの両方が要る
		expect(html).toContain('<div id="map">');
		expect(html).toContain("/static/map.js");
	});
});

describe("旅程の画面", () => {
	beforeEach(seedFixture);

	it("GET /trips に旅程の一覧が出る", async () => {
		await newTrip();
		const html = await (await app.request("/trips", {}, env)).text();
		expect(html).toContain("姫路");
	});

	it("GET /trips に作成フォームがある", async () => {
		const html = await (await app.request("/trips", {}, env)).text();
		expect(html).toContain('id="new-trip"');
	});

	it("GET /trips/:id は自分の旅程なら編集画面を返す", async () => {
		const trip = await newTrip();
		expect((await app.request(`/trips/${trip.id}`, {}, env)).status).toBe(200);
	});

	it("GET /trips/:id は無い旅程なら 404", async () => {
		expect((await app.request("/trips/missing", {}, env)).status).toBe(404);
	});
});
