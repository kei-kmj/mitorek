import { describe, expect, it } from "vitest";
import app from "../src/index";

describe("smoke", () => {
	it("1 + 1 = 2", () => {
		expect(1 + 1).toBe(2);
	});

	it("GET / returns Hello Hono", async () => {
		const res = await app.request("/");
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("Hello Hono");
	});
});
