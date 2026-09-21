import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import type { Env } from "../env";
import { collectionsApp } from "./collections";
import { placesApp } from "./places";
import { spotsApp } from "./spots";
import { stationsApp } from "./stations";
import { stopsApp } from "./stops";
import { tripsApp } from "./trips";

const api = new Hono<Env>();

api.route("/collections", collectionsApp);
api.route("/places", placesApp);
api.route("/spots", spotsApp);
api.route("/stations", stationsApp);
api.route("/trips", tripsApp);
api.route("/trips", stopsApp);

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
