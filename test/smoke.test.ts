import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";

describe("smoke", () => {
	it("1 + 1 = 2", () => {
		expect(1 + 1).toBe(2);
	});

	it("GET / がホームを返す", async () => {
		const res = await app.request("/", {}, env);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/html");
		const html = await res.text();
		expect(html).toContain("到達状況");
		expect(html).toContain('href="/map"');
		expect(html).not.toContain('<div id="map">');
	});

	it("GET /map が地図ページを返す", async () => {
		const res = await app.request("/map", {}, env);
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain('<div id="map">');
		expect(html).toContain("/static/map.js");
	});
});
