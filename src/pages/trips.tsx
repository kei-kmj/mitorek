import { Layout } from "../components/layout";
import type { TripSummary } from "../schemas/trips";
import { formatPeriod, STATUS_LABEL } from "./trip-labels";

/** 旅程の一覧と、新しい旅程を作るフォーム (送信は /static/trips.js) */
export const TripsPage = ({ trips }: { trips: TripSummary[] }) => (
	<Layout
		script="/static/trips.js"
		stylesheet="/static/trip.css"
		title="おでかけプラン"
	>
		<main class="page">
			<h1>おでかけプラン</h1>
			{trips.length === 0 && (
				<p class="hint">まだおでかけプランがありません。</p>
			)}
			<ul class="trip-list">
				{trips.map((t) => (
					<li>
						<a href={`/trips/${t.id}`}>{t.title}</a>
						<span class="hint">
							{formatPeriod(t.startDate, t.endDate)}・{STATUS_LABEL[t.status]}
						</span>
					</li>
				))}
			</ul>

			<h2>新しいおでかけプラン</h2>
			<form class="trip-form trip-form-main" id="new-trip">
				<label>
					タイトル
					<input maxlength={100} name="title" required={true} type="text" />
				</label>
				<label>
					開始日
					<input name="startDate" required={true} type="date" />
				</label>
				<label>
					終了日
					<input name="endDate" required={true} type="date" />
				</label>
				<button class="primary" type="submit">
					作る
				</button>
				<p class="error" id="new-trip-error" />
			</form>
		</main>
	</Layout>
);
