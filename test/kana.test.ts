import { describe, expect, it } from "vitest";
import { queryVariants, squash, toHiragana, toKatakana } from "../src/lib/kana";

describe("かなの表記ゆれ", () => {
	it("ひらがな ⇔ カタカナ", () => {
		expect(toKatakana("ながしま")).toBe("ナガシマ");
		expect(toHiragana("ナガシマ")).toBe("ながしま");
		// 漢字・英字はそのまま
		expect(toKatakana("姫路じょう")).toBe("姫路ジョウ");
	});

	it("長音・空白・中黒を無視する", () => {
		expect(squash("ナガシマ スパーランド・本館")).toBe(
			"ナガシマスパランド本館",
		);
	});

	it("検索語はカタカナ版とひらがな版にする", () => {
		expect(queryVariants("なかしますぱーらんど")).toEqual([
			"ナカシマスパランド",
			"なかしますぱらんど",
		]);
		// かなを含まなければ 1 つ
		expect(queryVariants("姫路")).toEqual(["姫路"]);
	});
});
