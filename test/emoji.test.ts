import { describe, expect, it } from "vitest";
import { iconEmoji } from "../src/lib/emoji";

describe("コレクションのアイコン", () => {
	it("コードポイントの 16 進を絵文字に戻し、未設定は 📍", () => {
		expect(iconEmoji("1f3ef")).toBe("🏯");
		expect(iconEmoji(null)).toBe("📍");
	});

	it("'-' で繋いだものは 1 つの絵文字に合成する (異体字セレクタ付き)", () => {
		// ❤️ = 2764 + fe0f。'-' で切らずに 1 つの数値として読むと別の字になる
		expect([...iconEmoji("2764-fe0f")].map((c) => c.codePointAt(0))).toEqual([
			0x27_64, 0xfe_0f,
		]);
	});
});
