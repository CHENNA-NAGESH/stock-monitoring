import { mkdir } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import pg from "pg";
import { RedisMemoryServer } from "redis-memory-server";
import { DEV_DATABASE_URL, DEV_REDIS_URL } from "@atrium/config";

const dataDir = path.resolve(import.meta.dirname, "../../../.data/pglite");

async function probe(url: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 5_000 });
  try {
    await pool.query("SELECT 1 AS ok");
  } finally {
    await pool.end();
  }
}

async function main() {
  await mkdir(dataDir, { recursive: true });
  const database = await PGlite.create(dataDir);
  const postgres = new PGLiteSocketServer({
    db: database,
    port: 55432,
    host: "127.0.0.1",
    maxConnections: 20,
  });
  await postgres.start();
  const candidates = [DEV_DATABASE_URL, "postgresql://postgres@127.0.0.1:55432/template1"];
  let databaseUrl = "";
  let last: unknown;
  for (const url of candidates) {
    try {
      await probe(url);
      databaseUrl = url;
      break;
    } catch (error) {
      last = error;
    }
  }
  if (!databaseUrl) {
    throw last instanceof Error ? last : new Error("Embedded Postgres did not accept a connection.");
  }

  const redis = new RedisMemoryServer({
    instance: { port: 56379, ip: "127.0.0.1" },
  });
  await redis.start();
  console.log(`Postgres ready at ${databaseUrl}`);
  console.log(`Redis ready at ${DEV_REDIS_URL}`);
  console.log("Atrium infra ready");

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await redis.stop();
    await postgres.stop();
    await database.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
  await new Promise(() => undefined);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
