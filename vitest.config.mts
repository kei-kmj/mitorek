import {
	cloudflareTest,
	readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// マイグレーションは Node 側で読み、バインディング経由でテスト環境に渡す
const migrations = await readD1Migrations("./migrations");

export default defineConfig({
	plugins: [
		cloudflareTest({
			miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
			wrangler: { configPath: "./wrangler.jsonc" },
		}),
	],
	test: { setupFiles: ["./test/setup.ts"] },
});
