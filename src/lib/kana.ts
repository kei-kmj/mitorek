/**
 * 検索の表記ゆれを吸収する。ひらがな・カタカナは同じとみなし、長音「ー」・空白・中黒「・」は無視する。
 * SQL 側 (squashSql) と同じ文字を落とすこと
 */

/** ぁ (U+3041) 〜 ゖ (U+3096) とカタカナ ァ 〜 ヶ の差 */
const KANA_OFFSET = 0x60;
const HIRAGANA = /[ぁ-ゖ]/gu;
const KATAKANA = /[ァ-ヶ]/gu;
/** 無視する文字: 長音・半角/全角空白・中黒 */
const IGNORED = /[ー\s　・]/gu;

const shift = (c: string, delta: number) =>
	String.fromCodePoint((c.codePointAt(0) ?? 0) + delta);

/** squashSql で落とす文字 (IGNORED と揃える) */
export const IGNORED_CHARS = ["ー", " ", "　", "・"] as const;

export const toKatakana = (s: string) =>
	s.replaceAll(HIRAGANA, (c) => shift(c, KANA_OFFSET));

export const toHiragana = (s: string) =>
	s.replaceAll(KATAKANA, (c) => shift(c, -KANA_OFFSET));

/** 無視する文字を落とす */
export const squash = (s: string) => s.replaceAll(IGNORED, "");

/**
 * 検索語の変形: 無視する文字を落とし、カタカナ版とひらがな版を作る (同じなら 1 つ)。
 * 名前 (カタカナが多い) にもふりがな (ひらがな) にも当たるように
 */
export const queryVariants = (q: string): string[] => {
	const base = squash(q);
	return [...new Set([toKatakana(base), toHiragana(base)])].filter(
		(v) => v.length > 0,
	);
};
