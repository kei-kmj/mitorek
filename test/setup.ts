import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach } from "vitest";

// 各テストを空の D1 から始める。reset() は全バインディングのデータを消すので、
// そのつど migrations/ を当て直す
beforeEach(async () => {
	await reset();
	await applyD1Migrations(env.mitorek_db, env.TEST_MIGRATIONS);
});
