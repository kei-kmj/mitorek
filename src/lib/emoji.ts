const HEX = 16;

const FALLBACK_ICON = "📍";

/**
 * collections.icon は絵文字そのものではなく、'-' で繋いだコードポイントの 16 進
 * ('1f3ef' / '2764-fe0f')。ゲームの画像を使わない決まり (CLAUDE.md) のため
 */
export const iconEmoji = (hexCodepoints: string | null): string => {
	if (!hexCodepoints) {
		return FALLBACK_ICON;
	}
	return String.fromCodePoint(
		...hexCodepoints.split("-").map((hex) => Number.parseInt(hex, HEX)),
	);
};
