import { raw } from "hono/html";
import type { Child } from "hono/jsx";

const LEAFLET = "https://unpkg.com/leaflet@1.9.4/dist";

interface Props {
	children: Child;
	/** 地図ページだけ Leaflet を読む */
	leaflet?: boolean;
	/** ページ固有の script (public/ 配下のパス) */
	script?: string;
	title?: string;
}

const pageTitle = (title?: string) => {
	if (!title) {
		return "mitorek";
	}
	return `${title} | mitorek`;
};

/** JSX は DOCTYPE を出さない。無いと標準モードにならず地図の高さ計算が崩れる */
export const Layout = ({ children, leaflet, script, title }: Props) => (
	<>
		{raw("<!DOCTYPE html>")}
		<html lang="ja">
			<head>
				<meta charset="utf-8" />
				<meta content="width=device-width, initial-scale=1" name="viewport" />
				<title>{pageTitle(title)}</title>
				{leaflet && (
					<link
						crossorigin=""
						href={`${LEAFLET}/leaflet.css`}
						integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
						rel="stylesheet"
					/>
				)}
				<link href="/static/app.css" rel="stylesheet" />
			</head>
			<body>
				<header class="site-header">
					<a class="brand" href="/">
						mitorek
					</a>
					<nav class="site-nav">
						<a href="/">ホーム</a>
						<a href="/map">地図</a>
					</nav>
					<span class="tagline">非公式・個人用の旅程ツール</span>
				</header>
				{children}
				{leaflet && (
					<script
						crossorigin=""
						integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
						src={`${LEAFLET}/leaflet.js`}
					/>
				)}
				{script && <script src={script} type="module" />}
			</body>
		</html>
	</>
);
