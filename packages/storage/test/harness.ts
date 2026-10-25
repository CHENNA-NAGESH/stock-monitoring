import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createDb, migrate, type Db } from "../src/index.js";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
    server.on("error", reject);
  });
}

export async function openDatabase(dir: string): Promise<{ db: Db; close: () => Promise<void> }> {
  const pglite = await PGlite.create(dir);
  const port = await freePort();
  const socket = new PGLiteSocketServer({
    db: pglite,
    port,
    host: "127.0.0.1",
    maxConnections: 20,
  });
  await socket.start();
  const candidates = [
    `postgresql://postgres@127.0.0.1:${port}/postgres`,
    `postgresql://postgres@127.0.0.1:${port}/template1`,
  ];
  let last: unknown;
  for (const url of candidates) {
    const db = createDb(url);
    try {
      await db.query("SELECT 1 AS ok");
      return {
        db,
        async close() {
          await db.close();
          await socket.stop();
          await pglite.close();
        },
      };
    } catch (error) {
      last = error;
      await db.close();
    }
  }
  await socket.stop();
  await pglite.close();
  throw last instanceof Error ? last : new Error("Could not connect to the test database.");
}

export async function withDatabase(fn: (db: Db) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "atrium-"));
  const opened = await openDatabase(dir);
  try {
    await migrate(opened.db);
    await fn(opened.db);
  } finally {
    await opened.close();
    await rm(dir, { recursive: true, force: true });
  }
}
