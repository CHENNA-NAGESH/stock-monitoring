import { API_PORT, DEV_DATABASE_URL, DEV_REDIS_URL, STALE_AFTER_SECONDS } from "@atrium/config";
import { createDb, createRedisCache, migrate, type Db, type QuoteCache } from "@atrium/storage";
import { createApp } from "./app.js";

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number.`);
  return value;
}

async function waitForDatabase(url: string): Promise<Db> {
  let last = "database is not ready";
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    const db = createDb(url);
    try {
      await db.query("SELECT 1 AS ok");
      await migrate(db);
      return db;
    } catch (error) {
      last = error instanceof Error ? error.message : last;
      await db.close();
      if (attempt === 1 || attempt % 10 === 0) console.error(`waiting for postgres (${attempt}/90): ${last}`);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw new Error(`Postgres was not ready: ${last}`);
}

async function waitForCache(url: string): Promise<QuoteCache> {
  let last = "redis is not ready";
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    const cache = createRedisCache(url);
    try {
      if (await cache.ping()) return cache;
      last = "redis did not answer PING";
    } catch (error) {
      last = error instanceof Error ? error.message : last;
    }
    await cache.close();
    if (attempt === 1 || attempt % 10 === 0) console.error(`waiting for redis (${attempt}/90): ${last}`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Redis was not ready: ${last}`);
}

async function main() {
  const port = readNumber("PORT", API_PORT);
  const host = process.env.HOST ?? "127.0.0.1";
  const staleAfterSeconds = readNumber("STALE_AFTER_SECONDS", STALE_AFTER_SECONDS);
  const databaseUrl = process.env.DATABASE_URL ?? DEV_DATABASE_URL;
  const redisUrl = process.env.REDIS_URL ?? DEV_REDIS_URL;
  const db = await waitForDatabase(databaseUrl);
  const cache = await waitForCache(redisUrl);
  const app = createApp({ db, cache, staleAfterSeconds });
  const server = app.listen(port, host, () => {
    console.log(`Atrium API listening on http://${host}:${port}`);
  });

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    server.close();
    await cache.close();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
