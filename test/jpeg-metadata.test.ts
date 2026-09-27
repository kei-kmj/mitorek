import { describe, expect, it } from "vitest";
import { isJpeg, stripJpegMetadata } from "../src/lib/jpeg-metadata";

/** マーカーと中身から、長さの欄を持つセグメントを作る (長さは中身 + 2) */
const lengthPrefixed = (marker: number, body: number[]) => [
	0xff,
	marker,
	Math.floor((body.length + 2) / 256),
	(body.length + 2) % 256,
	...body,
];

/** 長さの欄を持たず、マーカーの 2 バイトで閉じるもの */
const markerOnly = (marker: number) => [0xff, marker];

const SOI = [0xff, 0xd8];
const APP0_JFIF = lengthPrefixed(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00]);
/** 落とす対象: Exif (位置情報が入る) */
const APP1_EXIF = lengthPrefixed(
	0xe1,
	[0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 1, 2, 3],
);
/** 落とす対象: IPTC */
const APP13_IPTC = lengthPrefixed(0xed, [0x50, 0x68, 0x6f, 0x74, 0x6f, 7, 8]);
const DQT = lengthPrefixed(0xdb, [0, 1, 2, 3]);
const TEM = markerOnly(0x01);
const RST0 = markerOnly(0xd0);
const RST7 = markerOnly(0xd7);
/** SOS 以降 (画像本体) と EOI。0xFF が中に出てくる形も含む */
const SCAN = [0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0x00, 0x33, 0xff, 0xd9];

const jpeg = (...parts: number[][]) => new Uint8Array(parts.flat());

describe("JPEG のメタデータ除去", () => {
	it("APP1 と APP13 だけを落とし、長さの欄を持たないマーカーも画像本体もそのまま残す", () => {
		const input = jpeg(
			SOI,
			APP0_JFIF,
			APP1_EXIF,
			TEM,
			APP13_IPTC,
			RST0,
			DQT,
			RST7,
			SCAN,
		);
		// 長さの欄が無いマーカーを読み違えると、この後ろが全部ずれる
		expect([...stripJpegMetadata(input)]).toEqual([
			...jpeg(SOI, APP0_JFIF, TEM, RST0, DQT, RST7, SCAN),
		]);
	});

	it("メタデータが無ければ 1 バイトも変わらない", () => {
		// 画面側が canvas で作り直した JPEG はこの形。普段どおりの入力を壊さないこと
		const input = jpeg(SOI, APP0_JFIF, DQT, SCAN);
		expect([...stripJpegMetadata(input)]).toEqual([...input]);
	});

	it("JPEG でないもの・途中で切れたものは例外にする", () => {
		const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
		expect(isJpeg(png)).toBe(false);
		expect(() => stripJpegMetadata(png)).toThrow();
		// 長さの欄が中身より長い / 長さの欄そのものが足りない
		expect(() => stripJpegMetadata(jpeg(SOI, APP1_EXIF.slice(0, 6)))).toThrow();
		expect(() => stripJpegMetadata(jpeg(SOI, APP1_EXIF.slice(0, 3)))).toThrow();
	});
});
