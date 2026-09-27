import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";

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
