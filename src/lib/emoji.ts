const HEX = 16;

/** アイコン未設定のコレクションに使う */
const FALLBACK = "📍";

/** collections.icon のコードポイント ('1f3ef' / '2764-fe0f') を絵文字の文字列に戻す */
export const iconEmoji = (codepoint: string | null): string => {
	if (!codepoint) {
		return FALLBACK;
	}
	return String.fromCodePoint(
		...codepoint.split("-").map((hex) => Number.parseInt(hex, HEX)),
	);
};
