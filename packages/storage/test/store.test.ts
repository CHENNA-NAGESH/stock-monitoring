import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { StoredQuote } from "@atrium/domain";
import {
  createBook,
  createMemoryCache,
  createRule,
  deleteBook,
  evaluateTick,
  getDesk,
  listBooks,
  listEvents,
  migrate,
  stampVisit,
  updateBook,
  upsertQuotes,
  addSymbol,
} from "../src/index.js";
import { openDatabase, withDatabase } from "./harness.js";

function quote(overrides: Partial<StoredQuote> = {}): StoredQuote {
  return {
    ticker: "AAPL",
    last: 230,
    change: 1.6,
    changePercent: 0.7,
    volume: 1_000,
    open: 229,
    previousClose: 228.4,
    session: "closed",
    sessionDate: "2026-10-25",
    asOf: "2026-10-25T04:31:00.000Z",
    storedAt: "2026-10-25T04:31:00.000Z",
    status: "delayed",
    ...overrides,
  };
}

test("migration seeds one open Primary book and can run twice", async () => {
  await withDatabase(async (db) => {
    await migrate(db);
    const books = await listBooks(db);
    assert.equal(books.length, 1);
    assert.equal(books[0]?.name, "Primary");
    assert.equal(books[0]?.isOpen, true);
    assert.equal(books[0]?.symbols.length, 8);
  });
});

test("a book survives a new database connection", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "atrium-persist-"));
  const first = await openDatabase(dir);
  try {
    await migrate(first.db);
    await createBook(first.db, "Overnight");
  } finally {
    await first.close();
  }
  const second = await openDatabase(dir);
  try {
    await migrate(second.db);
    const books = await listBooks(second.db);
    assert.equal(books.filter((book) => book.name === "Primary").length, 1);
    assert.equal(books.filter((book) => book.name === "Overnight").length, 1);
  } finally {
    await second.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("opening a book switches the single open book", async () => {
  await withDatabase(async (db) => {
    const created = await createBook(db, "Secondary");
    assert.equal(created.isOpen, false);
    const opened = await updateBook(db, created.id, { isOpen: true });
    assert.equal(opened.isOpen, true);
    const books = await listBooks(db);
    assert.equal(books.filter((book) => book.isOpen).length, 1);
    assert.equal(books.find((book) => book.isOpen)?.name, "Secondary");
  });
});

test("deleting the open book opens the remaining book", async () => {
  await withDatabase(async (db) => {
    const secondary = await createBook(db, "Secondary");
    const [primary] = await listBooks(db);
    if (!primary) throw new Error("missing primary");
    await deleteBook(db, primary.id);
    const books = await listBooks(db);
    assert.equal(books.length, 1);
    assert.equal(books[0]?.id, secondary.id);
    assert.equal(books[0]?.isOpen, true);
  });
});

test("duplicate symbols are rejected and a fresh quote falls back to Postgres", async () => {
  await withDatabase(async (db) => {
    const [primary] = await listBooks(db);
    if (!primary) throw new Error("missing primary");
    await assert.rejects(addSymbol(db, primary.id, "AAPL"), /already in this book/);
    await upsertQuotes(db, [quote()]);
    const broken = {
      async getMany() {
        throw new Error("redis down");
      },
      async setMany() {
        throw new Error("redis down");
      },
      async ping() {
        return false;
      },
      async close() {
        return undefined;
      },
    };
    const desk = await getDesk(db, broken, new Date("2026-10-25T04:31:10.000Z"), 30);
    const apple = desk.rows.find((row) => row.ticker === "AAPL");
    assert.equal(apple?.quote?.last, 230);
    assert.equal(apple?.quote?.status, "delayed");
  });
});

test("a fresh cache is preferred and a visit stamp measures the next move", async () => {
  await withDatabase(async (db) => {
    const now = new Date("2026-10-25T04:31:10.000Z");
    await upsertQuotes(db, [quote({ last: 230 })]);
    const cache = createMemoryCache();
    await cache.setMany([quote({ last: 231, storedAt: now.toISOString(), asOf: now.toISOString() })]);
    const before = await getDesk(db, cache, now, 30);
    assert.equal(before.rows.find((row) => row.ticker === "AAPL")?.quote?.last, 231);
    assert.equal(before.rows.find((row) => row.ticker === "AAPL")?.quote?.sinceVisit, null);
    await stampVisit(db, now);
    await cache.setMany([quote({ last: 233, storedAt: now.toISOString(), asOf: now.toISOString() })]);
    const after = await getDesk(db, cache, now, 30);
    const apple = after.rows.find((row) => row.ticker === "AAPL")?.quote;
    assert.equal(apple?.sinceVisit, 3);
    assert.ok(after.stampedAt);
    await cache.close();
  });
});

test("a price cross writes one event until the latch clears", async () => {
  await withDatabase(async (db) => {
    const rule = await createRule(db, { ticker: "AAPL", condition: "price_cross", threshold: 100 });
    const now = new Date("2026-10-26T14:30:00.000Z");
    const crossed = quote({
      last: 101,
      previousClose: 99,
      change: 2,
      changePercent: 2,
      open: 100,
      session: "regular",
      sessionDate: "2026-10-26",
      status: "live",
      asOf: now.toISOString(),
      storedAt: now.toISOString(),
    });
    const first = await evaluateTick(db, [{ quote: crossed, previousLast: 99 }], new Map(), now);
    assert.equal(first, 1);
    const second = await evaluateTick(
      db,
      [{ quote: { ...crossed, last: 101.05 }, previousLast: 101 }],
      new Map(),
      now,
    );
    assert.equal(second, 0);
    const events = await listEvents(db);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.ruleId, rule.id);
    assert.equal(events[0]?.seen, false);
  });
});
