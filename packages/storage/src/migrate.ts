import { randomUUID } from "node:crypto";
import { DEFAULT_BOOK_NAME, DEFAULT_TICKERS } from "@atrium/domain";
import type { Db } from "./db.js";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS schema_lock (
    id INTEGER PRIMARY KEY
  )`,
  `INSERT INTO schema_lock (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_open BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS books_one_open_idx ON books (is_open) WHERE is_open`,
  `CREATE TABLE IF NOT EXISTS book_symbols (
    book_id TEXT NOT NULL REFERENCES books (id) ON DELETE CASCADE,
    ticker TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (book_id, ticker)
  )`,
  `CREATE TABLE IF NOT EXISTS quotes (
    ticker TEXT PRIMARY KEY,
    last DOUBLE PRECISION NOT NULL,
    change DOUBLE PRECISION NOT NULL,
    change_percent DOUBLE PRECISION NOT NULL,
    volume DOUBLE PRECISION NOT NULL,
    open DOUBLE PRECISION NOT NULL,
    previous_close DOUBLE PRECISION NOT NULL,
    session TEXT NOT NULL CHECK (session IN ('pre-market', 'regular', 'after-hours', 'closed')),
    session_date TEXT NOT NULL,
    as_of TIMESTAMPTZ NOT NULL,
    stored_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('live', 'delayed', 'stale'))
  )`,
  `CREATE TABLE IF NOT EXISTS quote_bars (
    ticker TEXT NOT NULL,
    bucket TIMESTAMPTZ NOT NULL,
    open DOUBLE PRECISION NOT NULL,
    high DOUBLE PRECISION NOT NULL,
    low DOUBLE PRECISION NOT NULL,
    close DOUBLE PRECISION NOT NULL,
    volume DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (ticker, bucket)
  )`,
  `CREATE INDEX IF NOT EXISTS quote_bars_ticker_bucket_idx ON quote_bars (ticker, bucket DESC)`,
  `CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY,
    ticker TEXT NOT NULL,
    condition TEXT NOT NULL CHECK (condition IN ('price_cross', 'move_from_open', 'rolling_move', 'volume_multiple')),
    threshold DOUBLE PRECISION NOT NULL,
    window_minutes INTEGER,
    armed BOOLEAN NOT NULL DEFAULT TRUE,
    latched BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    rule_id TEXT NOT NULL REFERENCES rules (id) ON DELETE CASCADE,
    fired_at TIMESTAMPTZ NOT NULL,
    last DOUBLE PRECISION NOT NULL,
    change_percent DOUBLE PRECISION NOT NULL,
    volume DOUBLE PRECISION NOT NULL,
    session TEXT NOT NULL CHECK (session IN ('pre-market', 'regular', 'after-hours', 'closed')),
    as_of TIMESTAMPTZ NOT NULL,
    seen BOOLEAN NOT NULL DEFAULT FALSE
  )`,
  `CREATE INDEX IF NOT EXISTS events_fired_at_idx ON events (fired_at DESC)`,
  `CREATE INDEX IF NOT EXISTS events_rule_id_idx ON events (rule_id)`,
  `CREATE TABLE IF NOT EXISTS visit_marks (
    ticker TEXT PRIMARY KEY,
    price DOUBLE PRECISION NOT NULL,
    marked_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS desk_state (
    id INTEGER PRIMARY KEY,
    last_seen_at TIMESTAMPTZ
  )`,
  `INSERT INTO desk_state (id, last_seen_at) VALUES (1, NULL) ON CONFLICT (id) DO NOTHING`,
];

export async function migrate(db: Db): Promise<void> {
  for (const statement of STATEMENTS) {
    await db.query(statement);
  }
  await db.withClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query("SELECT id FROM schema_lock WHERE id = 1 FOR UPDATE");
      const existing = await client.query("SELECT id FROM books LIMIT 1");
      if (existing.rowCount === 0) {
        const bookId = randomUUID();
        await client.query("INSERT INTO books (id, name, is_open) VALUES ($1, $2, TRUE)", [
          bookId,
          DEFAULT_BOOK_NAME,
        ]);
        for (let index = 0; index < DEFAULT_TICKERS.length; index += 1) {
          const ticker = DEFAULT_TICKERS[index];
          if (!ticker) continue;
          await client.query("INSERT INTO book_symbols (book_id, ticker, position) VALUES ($1, $2, $3)", [
            bookId,
            ticker,
            index,
          ]);
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}
