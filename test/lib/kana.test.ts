import { describe, expect, it } from "vitest";
import {
	queryVariants,
	squash,
	toHiragana,
	toKatakana,
} from "../../src/lib/kana";

describe("toKatakana", () => {
	it.each([
		["ながしま", "ナガシマ"],
		// 漢字はそのまま
		["姫路じょう", "姫路ジョウ"],
	])("%s → %s", (input, output) => {
		expect(toKatakana(input)).toBe(output);
	});
});

describe("toHiragana", () => {
	it("カタカナをひらがなにする", () => {
		expect(toHiragana("ナガシマ")).toBe("ながしま");
	});
});

describe("squash", () => {
	it("長音・空白・中黒を無視する", () => {
		expect(squash("ナガシマ スパーランド・本館")).toBe(
			"ナガシマスパランド本館",
		);
	});
});

describe("queryVariants", () => {
	it.each([
		["なかしますぱーらんど", ["ナカシマスパランド", "なかしますぱらんど"]],
		// かなを含まなければ 1 つ
		["姫路", ["姫路"]],
	])("%s → %j", (input, variants) => {
		expect(queryVariants(input)).toEqual(variants);
	});
});
