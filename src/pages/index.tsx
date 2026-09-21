import { Hono } from "hono";
import type { Env } from "../env";
import { listCollections } from "../models/collections";
import { findTripDetail, listTrips } from "../models/trips";
import { HomePage } from "./home";
import { MapPage } from "./map";
import { TripPage } from "./trip";
import { TripsPage } from "./trips";

const pages = new Hono<Env>();

/** GET / — ホーム */
pages.get("/", async (c) =>
	c.html(
		<HomePage collections={await listCollections(c.var.db, c.var.userId)} />,
	),
);

/** GET /map — 地図 */
pages.get("/map", async (c) =>
	c.html(
		<MapPage collections={await listCollections(c.var.db, c.var.userId)} />,
	),
);

/** GET /trips — 旅程の一覧と作成 */
pages.get("/trips", async (c) =>
	c.html(<TripsPage trips={await listTrips(c.var.db, c.var.userId)} />),
);

/** GET /trips/:id — 旅程の編集。他人の旅程・無い旅程は 404 */
pages.get("/trips/:id", async (c) => {
	const trip = await findTripDetail(c.var.db, c.var.userId, c.req.param("id"));
	if (!trip) {
		return c.notFound();
	}
	return c.html(
		<TripPage
			collections={await listCollections(c.var.db, c.var.userId)}
			title={trip.title}
			tripId={trip.id}
		/>,
	);
});

export { pages };
