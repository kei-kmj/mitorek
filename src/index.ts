import { Hono } from "hono";
import { createDb } from "./db/client";
import { games } from "./db/schema/master";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.get("/", (c) => c.text("Hello Hono!"));

/** D1 バインディングが繋がっているかの確認用。実際にクエリを1本投げる */
app.get("/health/db", async (c) => {
	const db = createDb(c.env.mitorek_db);
	const rows = await db.select({ id: games.id }).from(games);
	return c.json({ games: rows.length, ok: true });
});

export default app;
