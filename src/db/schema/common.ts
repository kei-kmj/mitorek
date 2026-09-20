import { sql } from "drizzle-orm";

/** `DEFAULT (datetime('now'))` 相当。SQLite に現在時刻を書かせる */
export const now = sql`(datetime('now'))`;

/**
 * CHECK (col IN ('a','b')) を列挙から組み立てる。
 * DDL にバインドパラメータは埋められないので、値はリテラルとして直接埋め込む。
 */
export const oneOf = (column: unknown, values: readonly string[]) =>
	sql`${column} IN (${sql.raw(
		values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", "),
	)})`;
