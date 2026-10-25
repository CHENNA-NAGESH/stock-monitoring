import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryCache } from "@atrium/storage";
import { withDatabase } from "../../../packages/storage/test/harness.js";
import { createApp } from "../src/app.js";

async function listen(app: ReturnType<typeof createApp>): Promise<{ port: number; close: () => Promise<void> }> {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

test("books survive another request and unknown symbols are rejected", async () => {
  await withDatabase(async (db) => {
    const app = createApp({
      db,
      cache: createMemoryCache(),
      staleAfterSeconds: 30,
      now: () => new Date("2026-10-25T04:31:00.000Z"),
    });
    const server = await listen(app);
    try {
      const health = await fetch(`http://127.0.0.1:${server.port}/healthz`);
      assert.equal(health.status, 200);
      const created = await fetch(`http://127.0.0.1:${server.port}/api/books`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Overnight" }),
      });
      assert.equal(created.status, 201);
      const listed = await fetch(`http://127.0.0.1:${server.port}/api/books`);
      const body = (await listed.json()) as { books: { name: string }[] };
      assert.equal(body.books.some((book) => book.name === "Overnight"), true);
      const missing = await fetch(`http://127.0.0.1:${server.port}/api/symbols/NOPE`);
      assert.equal(missing.status, 404);
      const badRule = await fetch(`http://127.0.0.1:${server.port}/api/rules`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker: "AAPL", condition: "price_cross", threshold: 0 }),
      });
      assert.equal(badRule.status, 400);
      const meta = await fetch(`http://127.0.0.1:${server.port}/api/meta`);
      const metaBody = (await meta.json()) as { session: { name: string }; tape: string };
      assert.equal(metaBody.session.name, "closed");
      assert.equal(metaBody.tape, "simulator");
    } finally {
      await server.close();
    }
  });
});
