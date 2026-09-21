import { Hono } from "hono";
import type { Env } from "../env";
import { listCollections } from "../models/collections";
import { HomePage } from "./home";
import { MapPage } from "./map";

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

export { pages };
