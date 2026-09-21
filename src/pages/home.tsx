import { Layout } from "../components/layout";
import { iconEmoji } from "../lib/emoji";
import type { Collection } from "../schemas/collections";

/** ホーム: コレクションごとの到達状況と、各画面への入口 */
export const HomePage = ({ collections }: { collections: Collection[] }) => (
	<Layout>
		<main class="home">
			<section>
				<h1>到達状況</h1>
				<ul class="progress-list">
					{collections.map((c) => (
						<li>
							<span class="emoji">{iconEmoji(c.icon)}</span>
							<span class="name">{c.name}</span>
							<progress max={c.total} value={c.visited} />
							<span class="count">
								{c.visited} / {c.total}（未訪問 {c.total - c.visited}）
							</span>
						</li>
					))}
				</ul>
			</section>
			<section>
				<h2>画面</h2>
				<ul class="entry-list">
					<li>
						<a href="/map">地図</a>
						<span class="hint">
							全スポットを地図に出し、コレクション・未訪問で絞り込む。近くの未訪問も探せる
						</span>
					</li>
				</ul>
			</section>
		</main>
	</Layout>
);
