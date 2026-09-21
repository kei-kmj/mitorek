import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import type { Env } from "../env";
import { collectionsApp } from "./collections";
import { spotsApp } from "./spots";
import { stationsApp } from "./stations";

const api = new Hono<Env>();

api.route("/collections", collectionsApp);
api.route("/spots", spotsApp);
api.route("/stations", stationsApp);

api.get(
	"/openapi.json",
	openAPIRouteHandler(api, {
		documentation: {
			info: { title: "mitorek API", version: "0.1.0" },
			servers: [{ url: "/api" }],
		},
	}),
);
api.get("/docs", Scalar({ url: "/api/openapi.json" }));

export { api };
