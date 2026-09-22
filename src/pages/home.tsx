import { Layout } from "../components/layout";
import { iconEmoji } from "../lib/emoji";
import type { Collection } from "../schemas/collections";
import type { TripSummary } from "../schemas/trips";
import { formatPeriod, STATUS_LABEL } from "./trip-labels";

const PERCENT = 100;
/** ホームに並べるおでかけプランの数。これより多ければ「すべて見る」 */
const RECENT_TRIPS = 3;

/** コンプリート率 (%)。全部回るまで 100% にならないよう切り捨てる */
const completionRate = (c: Collection) => {
	if (c.total === 0) {
		return 0;
	}
	return Math.floor((c.visited / c.total) * PERCENT);
};

/** ホーム: コレクションごとのコンプリート率、最近のおでかけプラン、各画面への入口 */
export const HomePage = ({
	collections,
	trips,
}: {
	collections: Collection[];
	trips: TripSummary[];
}) => (
	<Layout>
		<main class="home">
			<section>
				<h1>コンプリート率</h1>
				<ul class="progress-list">
					{collections.map((c) => (
						<li>
							<span class="emoji">{iconEmoji(c.icon)}</span>
							<span class="name">{c.name}</span>
							<span class="rate">{completionRate(c)}%</span>
							<progress max={c.total} value={c.visited} />
							<span class="count">
								{c.visited} / {c.total}（未踏 {c.total - c.visited}）
							</span>
						</li>
					))}
				</ul>
			</section>
			<section>
				<h2>おでかけプラン</h2>
				{trips.length === 0 && <p class="hint">まだありません。</p>}
				<ul class="trip-list">
					{trips.slice(0, RECENT_TRIPS).map((t) => (
						<li>
							<a href={`/trips/${t.id}`}>{t.title}</a>
							<span class="hint">
								{formatPeriod(t.startDate, t.endDate)}・{STATUS_LABEL[t.status]}
							</span>
						</li>
					))}
				</ul>
				<p class="trip-actions">
					<a class="button-primary" href="/trips#new-trip">
						＋ 新しいおでかけプランを作る
					</a>
					{trips.length > RECENT_TRIPS && (
						<a href="/trips">すべて見る ({trips.length} 件)</a>
					)}
				</p>
			</section>
			<section>
				<h2>画面</h2>
				<ul class="entry-list">
					<li>
						<a href="/trips">おでかけプラン</a>
						<span class="hint">
							行く日ごとにスポット・駅・宿を並べ、移動や時刻を入れる。旅の後は振り返りで「行った」を記録
						</span>
					</li>
					<li>
						<a href="/map">地図</a>
						<span class="hint">
							全スポットを地図に出し、コレクション・未踏で絞り込む。近くの未踏も探せる
						</span>
					</li>
				</ul>
			</section>
		</main>
	</Layout>
);
