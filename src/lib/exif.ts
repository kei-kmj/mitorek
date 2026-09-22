/**
 * JPEG から位置情報などのメタデータ (APP1 = Exif / XMP、APP13 = IPTC) を落とす。
 * 画面側でも縮小・再エンコードで消えるが、送られてきたものは信じずにここで必ず落とす (docs/design.md 横断的な決め事)。
 * 画像そのもの (SOS 以降) には手を付けない
 */

const SOI = 0xd8;
const SOS = 0xda;
const EOI = 0xd9;
const MARKER = 0xff;
const APP1 = 0xe1;
const APP13 = 0xed;
/** 長さを持たないマーカー (RST0〜7, TEM) */
const RST0 = 0xd0;
const RST7 = 0xd7;
const TEM = 0x01;
/** マーカー (2 バイト) の後ろに、長さ (2 バイト、自分を含む) が続く */
const MARKER_BYTES = 2;
const DROPPED = new Set([APP1, APP13]);

type Segment =
	/** 画像本体 (SOS 以降)。ここで読むのをやめる */
	| { end: number; kind: "scan" }
	| { end: number; keep: boolean; kind: "segment" };

const hasNoLength = (m: number) => m === TEM || (m >= RST0 && m <= RST7);

/** i から始まるセグメントを読む。壊れていれば例外 */
const readSegment = (bytes: Uint8Array, i: number): Segment => {
	if (bytes[i] !== MARKER) {
		throw new Error(`broken JPEG at ${i}`);
	}
	const marker = bytes[i + 1] ?? EOI;
	if (marker === SOS || marker === EOI) {
		return { end: bytes.length, kind: "scan" };
	}
	if (hasNoLength(marker)) {
		return { end: i + MARKER_BYTES, keep: true, kind: "segment" };
	}
	if (i + MARKER_BYTES * 2 > bytes.length) {
		throw new Error(`broken JPEG segment at ${i}`);
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const end = i + MARKER_BYTES + view.getUint16(i + MARKER_BYTES);
	if (end > bytes.length) {
		throw new Error(`broken JPEG segment at ${i}`);
	}
	return { end, keep: !DROPPED.has(marker), kind: "segment" };
};

const concat = (parts: Uint8Array[]): Uint8Array => {
	const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
};

/** JPEG か (先頭が SOI) */
export const isJpeg = (bytes: Uint8Array) =>
	bytes[0] === MARKER && bytes[1] === SOI;

/**
 * メタデータを落とした JPEG を返す。JPEG として読めない形なら例外にする
 * (壊れたものや JPEG 以外を、そのまま保存しないため)
 */
export const stripJpegMetadata = (bytes: Uint8Array): Uint8Array => {
	if (!isJpeg(bytes)) {
		throw new Error("not a JPEG");
	}
	const kept: Uint8Array[] = [bytes.subarray(0, MARKER_BYTES)];
	let i = MARKER_BYTES;
	while (i < bytes.length) {
		const segment = readSegment(bytes, i);
		if (segment.kind === "scan" || segment.keep) {
			kept.push(bytes.subarray(i, segment.end));
		}
		i = segment.end;
	}
	return concat(kept);
};
