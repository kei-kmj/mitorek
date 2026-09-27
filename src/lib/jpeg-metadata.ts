/**
 * 送られてきた画像は信じず、保存の前にここで必ずメタデータを落とす
 * (docs/design.md 横断的な決め事)。画面側の再エンコードでも消えるが、それには頼らない
 */

const MARKER_PREFIX = 0xff;
const MARKER_SIZE = 2;
const AFTER_PREFIX = 1;
const LENGTH_FIELD_SIZE = 2;

const START_OF_IMAGE = 0xd8;
const START_OF_SCAN = 0xda;
const END_OF_IMAGE = 0xd9;
const TEMPORARY = 0x01;
const APP1_EXIF_OR_XMP = 0xe1;
const APP13_IPTC = 0xed;
const FIRST_RESTART = 0xd0;
const LAST_RESTART = 0xd7;

const inclusiveRange = (from: number, to: number) =>
	Array.from({ length: to - from + 1 }, (_unused, step) => from + step);

const METADATA_MARKERS: ReadonlySet<number> = new Set([
	APP1_EXIF_OR_XMP,
	APP13_IPTC,
]);

const IMAGE_DATA_MARKERS: ReadonlySet<number> = new Set([
	START_OF_SCAN,
	END_OF_IMAGE,
]);

const MARKERS_WITHOUT_LENGTH_FIELD: ReadonlySet<number> = new Set([
	TEMPORARY,
	...inclusiveRange(FIRST_RESTART, LAST_RESTART),
]);

/** マーカー 1 つが引き連れるバイトの範囲。画像本体は末尾までの 1 つになる */
interface MarkerSpan {
	readonly end: number;
	readonly marker: number;
	readonly start: number;
}

const brokenSegmentAt = (start: number) =>
	new Error(`broken JPEG segment at ${start}`);

/** 末尾が 0xFF だけで終わっていても、壊れたとはせず読み終わりとして扱う */
const markerAt = (bytes: Uint8Array, start: number): number =>
	bytes[start + AFTER_PREFIX] ?? END_OF_IMAGE;

const bytesAfterMarkerAt = (bytes: Uint8Array, start: number): number =>
	new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(
		start + MARKER_SIZE,
	);

type SpanShape = "lengthPrefixed" | "markerOnly" | "restOfBytes";

const shapeOf = (marker: number): SpanShape => {
	if (IMAGE_DATA_MARKERS.has(marker)) {
		return "restOfBytes";
	}
	if (MARKERS_WITHOUT_LENGTH_FIELD.has(marker)) {
		return "markerOnly";
	}
	return "lengthPrefixed";
};

const lengthPrefixedEnd = (bytes: Uint8Array, start: number): number => {
	if (start + MARKER_SIZE + LENGTH_FIELD_SIZE > bytes.length) {
		throw brokenSegmentAt(start);
	}
	const end = start + MARKER_SIZE + bytesAfterMarkerAt(bytes, start);
	if (end > bytes.length) {
		throw brokenSegmentAt(start);
	}
	return end;
};

const END_BY_SHAPE: Record<
	SpanShape,
	(bytes: Uint8Array, start: number) => number
> = {
	lengthPrefixed: lengthPrefixedEnd,
	markerOnly: (_bytes, start) => start + MARKER_SIZE,
	restOfBytes: (bytes) => bytes.length,
};

const spanEnd = (bytes: Uint8Array, start: number, marker: number): number =>
	END_BY_SHAPE[shapeOf(marker)](bytes, start);

const spanAt = (bytes: Uint8Array, start: number): MarkerSpan => {
	if (bytes[start] !== MARKER_PREFIX) {
		throw new Error(`broken JPEG at ${start}`);
	}
	const marker = markerAt(bytes, start);
	return { end: spanEnd(bytes, start, marker), marker, start };
};

/** 画像本体は末尾までの 1 つとして返るので、そこに当たれば自然に尽きる */
const spansAfterStartOfImage = (bytes: Uint8Array): MarkerSpan[] => {
	const spans: MarkerSpan[] = [];
	let start = MARKER_SIZE;
	while (start < bytes.length) {
		const span = spanAt(bytes, start);
		spans.push(span);
		start = span.end;
	}
	return spans;
};

const isMetadata = ({ marker }: MarkerSpan) => METADATA_MARKERS.has(marker);

const concatBytes = (parts: Uint8Array[]): Uint8Array => {
	const joined = new Uint8Array(
		parts.reduce((total, part) => total + part.length, 0),
	);
	let offset = 0;
	for (const part of parts) {
		joined.set(part, offset);
		offset += part.length;
	}
	return joined;
};

export const isJpeg = (bytes: Uint8Array): boolean =>
	bytes[0] === MARKER_PREFIX && bytes[AFTER_PREFIX] === START_OF_IMAGE;

/** 読めない形は例外にする。壊れたものや JPEG 以外を、そのまま保存しないため */
export const stripJpegMetadata = (bytes: Uint8Array): Uint8Array => {
	if (!isJpeg(bytes)) {
		throw new Error("not a JPEG");
	}
	const startOfImage = bytes.subarray(0, MARKER_SIZE);
	const kept = spansAfterStartOfImage(bytes)
		.filter((span) => !isMetadata(span))
		.map(({ end, start }) => bytes.subarray(start, end));
	return concatBytes([startOfImage, ...kept]);
};
