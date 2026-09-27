/// <reference types="@cloudflare/vitest-pool-workers/types" />

// vitest.config.mts が miniflare のバインディングとして渡す。テストのときだけ env に居る
declare namespace Cloudflare {
	interface Env {
		TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
	}
}
