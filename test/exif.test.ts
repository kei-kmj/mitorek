import { describe, expect, it } from "vitest";
import { isJpeg, stripJpegMetadata } from "../src/lib/exif";

/** マーカーと中身から JPEG のセグメントを作る (長さは中身 + 2) */
const segment = (marker: number, body: number[]) => [
	0xff,
	marker,
	Math.floor((body.length + 2) / 256),
	(body.length + 2) % 256,
	...body,
];

const SOI = [0xff, 0xd8];
const APP0 = segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00]);
/** Exif (位置情報が入る) */
const APP1 = segment(0xe1, [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 1, 2, 3]);
const DQT = segment(0xdb, [0, 1, 2, 3]);
/** SOS 以降 (画像本体) と EOI */
const SCAN = [0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0x00, 0x33, 0xff, 0xd9];

const jpeg = (...parts: number[][]) => new Uint8Array(parts.flat());

describe("JPEG のメタデータ除去", () => {
	it("APP1 (Exif) を落とし、ほかのセグメントと画像本体はそのまま残す", () => {
		const out = stripJpegMetadata(jpeg(SOI, APP0, APP1, DQT, SCAN));
		expect([...out]).toEqual([...jpeg(SOI, APP0, DQT, SCAN)]);
	});

	it("メタデータが無ければ中身は変わらない", () => {
		const input = jpeg(SOI, APP0, DQT, SCAN);
		expect([...stripJpegMetadata(input)]).toEqual([...input]);
	});

	it("JPEG でないもの・途中で切れたものは例外にする", () => {
		const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
		expect(isJpeg(png)).toBe(false);
		expect(() => stripJpegMetadata(png)).toThrow();
		expect(() => stripJpegMetadata(jpeg(SOI, APP1.slice(0, 6)))).toThrow();
	});
});
