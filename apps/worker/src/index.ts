import http from "node:http";
import { DEV_DATABASE_URL, DEV_REDIS_URL, WORKER_HEALTH_PORT } from "@atrium/config";
import { createDb, createRedisCache, migrate, pingDb, type Db, type QuoteCache } from "@atrium/storage";
import { loop } from "./loop.js";

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

function startHealth(port: number, host: string, current: () => { db: Db; cache: QuoteCache } | null): http.Server {
  return http
    .createServer((req, res) => {
      void (async () => {
        const url = req.url?.split("?")[0];
        try {
          if (url === "/healthz") {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
            return;
          }
          if (url === "/readyz") {
            const deps = current();
            const postgres = deps ? await pingDb(deps.db) : false;
            const redis = deps ? await deps.cache.ping() : false;
            const ok = postgres && redis;
            res.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok, postgres, redis }));
            return;
          }
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "Not found." }));
        } catch {
          if (!res.headersSent) {
            res.writeHead(500, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: false }));
          }
        }
      })();
    })
    .listen(port, host);
}

async function main() {
  const mode = process.env.VENDOR_MODE ?? "simulator";
  if (mode !== "simulator") {
    throw new Error("VENDOR_MODE must be simulator until a licensed adapter is configured.");
  }
  const port = readNumber("HEALTH_PORT", WORKER_HEALTH_PORT);
  const host = process.env.HOST ?? "127.0.0.1";
  const databaseUrl = process.env.DATABASE_URL ?? DEV_DATABASE_URL;
  const redisUrl = process.env.REDIS_URL ?? DEV_REDIS_URL;
  let deps: { db: Db; cache: QuoteCache } | null = null;
  const server = startHealth(port, host, () => deps);
  const db = await waitForDatabase(databaseUrl);
  const cache = await waitForCache(redisUrl);
  deps = { db, cache };
  console.log(`Atrium worker ready on http://${host}:${port}`);

  let stopped = false;
  const shutdown = async () => {
    if (stopped) return;
    stopped = true;
    server.close();
    await cache.close();
    await db.close();
  };
  process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
  process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));
  await loop(db, cache, () => stopped);
  await shutdown();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
