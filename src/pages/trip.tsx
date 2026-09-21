import { Layout } from "../components/layout";
import { iconEmoji } from "../lib/emoji";
import type { Collection } from "../schemas/collections";

/**
 * 旅程の編集。中身は /static/trip.js が /api/trips/:id から描く。
 * スポットの絵文字はコレクションから引くので、表を data 属性で渡す
 */
export const TripPage = ({
	collections,
	title,
	tripId,
}: {
	collections: Collection[];
	title: string;
	tripId: string;
}) => (
	<Layout script="/static/trip.js" stylesheet="/static/trip.css" title={title}>
		<main
			class="page trip-editor"
			data-collections={JSON.stringify(
				Object.fromEntries(collections.map((c) => [c.id, iconEmoji(c.icon)])),
			)}
			data-trip-id={tripId}
			id="trip"
		>
			<p class="hint">
				<a href="/trips">← おでかけプラン一覧</a>
			</p>
			<p class="hint" id="trip-status">
				読み込み中…
			</p>
		</main>
	</Layout>
);
