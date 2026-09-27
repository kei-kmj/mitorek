/**
 * 検索の表記ゆれを吸収する。ひらがな・カタカナは同じとみなし、長音「ー」・空白・中黒「・」は無視する
 */

/** ぁ (U+3041) 〜 ゖ (U+3096) とカタカナ ァ 〜 ヶ の差 */
const KANA_OFFSET = 0x60;
const HIRAGANA = /[ぁ-ゖ]/gu;
const KATAKANA = /[ァ-ヶ]/gu;

/** SQL 側 (models/places.ts の squashSql) が replace で落とす文字。ここが唯一の出どころ */
const IGNORED_CHARS = ["ー", " ", "　", "・"] as const;

const IGNORED = new RegExp(`[${IGNORED_CHARS.join("")}\\s]`, "gu");

const shift = (char: string, delta: number) =>
	String.fromCodePoint((char.codePointAt(0) ?? 0) + delta);

export const toKatakana = (s: string): string =>
	s.replaceAll(HIRAGANA, (char) => shift(char, KANA_OFFSET));

export const toHiragana = (s: string): string =>
	s.replaceAll(KATAKANA, (char) => shift(char, -KANA_OFFSET));

export const squash = (s: string): string => s.replaceAll(IGNORED, "");

/**
 * 名前 (カタカナが多い) にもふりがな (ひらがな) にも当たるよう、両方の版で探す。
 * 同じものになれば 1 つ
 */
export const queryVariants = (q: string): string[] => {
	const base = squash(q);
	return [...new Set([toKatakana(base), toHiragana(base)])].filter(
		(v) => v.length > 0,
	);
};

export { IGNORED_CHARS };
