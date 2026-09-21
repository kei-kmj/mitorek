import { Layout } from "../components/layout";
import { iconEmoji } from "../lib/emoji";
import type { Collection } from "../schemas/collections";
import { DEFAULT_RADIUS_M, MAX_RADIUS_M } from "../schemas/geo";

const METERS_PER_KM = 1000;
/** 近傍検索の半径の選択肢 (m) */
// biome-ignore lint/style/noMagicNumbers: 選択肢そのものが値。名前を付けても情報が増えない
const RADIUS_OPTIONS = [1000, DEFAULT_RADIUS_M, 5000, 10_000, MAX_RADIUS_M];

/** 地図: 全スポットを表示し、コレクション・未訪問で切り替える。地図クリックで近傍の未訪問を出す */
export const MapPage = ({ collections }: { collections: Collection[] }) => (
	<Layout leaflet={true} script="/static/map.js" title="地図">
		<main class="map-layout">
			<aside class="panel">
				<section>
					<h2>コレクション</h2>
					<ul class="collections">
						{collections.map((c) => (
							<li>
								<label>
									<input
										checked={true}
										data-emoji={iconEmoji(c.icon)}
										data-name={c.name}
										name="collection"
										type="checkbox"
										value={c.id}
									/>
									<span class="emoji">{iconEmoji(c.icon)}</span>
									{c.name}
									<span class="count">
										{c.visited} / {c.total}
									</span>
								</label>
							</li>
						))}
					</ul>
					<label>
						<input id="unvisited-only" type="checkbox" />
						未訪問だけ表示
					</label>
				</section>
				<section>
					<h2>近くの未訪問</h2>
					<p class="hint">
						地図をクリックすると、その地点から半径内の未訪問スポットを直線距離で出します。
					</p>
					<label>
						半径
						<select id="radius">
							{RADIUS_OPTIONS.map((m) => (
								<option selected={m === DEFAULT_RADIUS_M} value={m}>
									{m / METERS_PER_KM} km
								</option>
							))}
						</select>
					</label>
					<div class="nearby-head">
						<p class="hint" id="nearby-status" />
						<button hidden={true} id="nearby-clear" type="button">
							クリア
						</button>
					</div>
					<ol class="nearby" id="nearby-list" />
				</section>
			</aside>
			<div id="map" />
		</main>
	</Layout>
);
