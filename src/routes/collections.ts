import { Hono } from "hono";
import type { Env } from "../env";
import { route } from "../lib/route";
import { listCollections } from "../models/collections";
import { Collection } from "../schemas/collections";

const collectionsApp = new Hono<Env>();

/** GET /api/collections — コレクション一覧と到達数 */
collectionsApp.get(
	"/",
	...route(
		{
			response: Collection.array(),
			summary: "コレクション一覧 (スポット数・訪問済み数付き)",
			tags: ["collections"],
		},
		({ db, userId }) => listCollections(db, userId),
	),
);

export { collectionsApp };
