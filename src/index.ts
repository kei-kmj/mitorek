import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { games } from "./db/schema/master";
import type { Env } from "./env";
import { injectDeps } from "./lib/deps";
import { INTERNAL_SERVER_ERROR } from "./lib/http";
import { pages } from "./pages/index";
import { api } from "./routes/index";

const app = new Hono<Env>();

app.use(injectDeps);

/** D1 バインディングが繋がっているかの確認用。実際にクエリを1本投げる */
app.get("/health/db", async (c) => {
	const rows = await c.var.db.select({ id: games.id }).from(games);
	return c.json({ games: rows.length, ok: true });
});

app.route("/api", api);
app.route("/", pages);

/** エラーは { error: { code, message } } に揃える */
app.onError((err, c) => {
	if (err instanceof HTTPException) {
		return c.json(
			{ error: { code: err.status, message: err.message } },
			err.status,
		);
	}
	// biome-ignore lint/suspicious/noConsole: Workers のログに残す唯一の手段
	console.error(err);
	return c.json(
		{ error: { code: INTERNAL_SERVER_ERROR, message: "internal error" } },
		INTERNAL_SERVER_ERROR,
	);
});

export default app;
