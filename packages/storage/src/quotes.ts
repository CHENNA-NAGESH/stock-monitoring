import {
  findListing,
  getSession,
  resolveFeedStatus,
  UNIVERSE,
  type BarView,
  type DeskView,
  type Listing,
  type MetaView,
  type QuoteView,
  type SessionName,
  type StoredQuote,
  type SymbolPage,
} from "@atrium/domain";
import type { QuoteCache } from "./cache.js";
import type { Queryable } from "./db.js";
import { iso, nullableIso, num, text } from "./parse.js";

interface BarDraft {
  ticker: string;
  bucket: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function rowToQuote(row: Record<string, unknown>): StoredQuote {
  return {
    ticker: text(row.ticker),
    last: num(row.last),
    change: num(row.change),
    changePercent: num(row.change_percent),
    volume: num(row.volume),
    open: num(row.open),
    previousClose: num(row.previous_close),
    session: text(row.session) as SessionName,
    sessionDate: text(row.session_date),
    asOf: iso(row.as_of),
    storedAt: iso(row.stored_at),
    status: text(row.status) as StoredQuote["status"],
  };
}

function toQuoteView(
  stored: StoredQuote,
  listing: Listing | undefined,
  mark: number | null,
  trace: number[],
  now: Date,
  staleAfterSeconds: number,
): QuoteView {
  const sinceVisit = mark === null ? null : stored.last - mark;
  const sinceVisitPercent = mark === null || mark === 0 || sinceVisit === null ? null : (sinceVisit / mark) * 100;
  const points = trace.length > 0 && trace[trace.length - 1] !== stored.last ? [...trace, stored.last] : trace;
  return {
    ticker: stored.ticker,
    name: listing?.name ?? stored.ticker,
    venue: listing?.venue ?? "NASDAQ",
    last: stored.last,
    change: stored.change,
    changePercent: stored.changePercent,
    volume: stored.volume,
    open: stored.open,
    previousClose: stored.previousClose,
    session: stored.session,
    asOf: stored.asOf,
    storedAt: stored.storedAt,
    status: resolveFeedStatus(stored.status, stored.storedAt, now, staleAfterSeconds),
    sinceVisit,
    sinceVisitPercent,
    trace: points.slice(-32),
  };
}

async function readQuotes(
  db: Queryable,
  cache: QuoteCache,
  tickers: string[],
  now: Date,
  staleAfterSeconds: number,
): Promise<Map<string, StoredQuote>> {
  const quotes = new Map<string, StoredQuote>();
  if (tickers.length === 0) return quotes;
  try {
    const cached = await cache.getMany(tickers);
    for (const [ticker, quote] of cached) {
      if (resolveFeedStatus(quote.status, quote.storedAt, now, staleAfterSeconds) === "stale") continue;
      quotes.set(ticker, quote);
    }
  } catch (error) {
    console.error("quote cache read failed", error instanceof Error ? error.message : error);
  }
  const missing = tickers.filter((ticker) => !quotes.has(ticker));
  if (missing.length === 0) return quotes;
  const result = await db.query("SELECT * FROM quotes WHERE ticker = ANY($1::text[])", [missing]);
  for (const row of result.rows) quotes.set(text(row.ticker), rowToQuote(row));
  return quotes;
}

async function loadTraces(db: Queryable, tickers: string[], now: Date): Promise<Map<string, number[]>> {
  const traces = new Map<string, number[]>();
  if (tickers.length === 0) return traces;
  const since = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
  const result = await db.query(
    `SELECT ticker, close FROM quote_bars
     WHERE ticker = ANY($1::text[]) AND bucket >= $2
     ORDER BY ticker ASC, bucket ASC`,
    [tickers, since],
  );
  for (const row of result.rows) {
    const ticker = text(row.ticker);
    const points = traces.get(ticker) ?? [];
    points.push(num(row.close));
    traces.set(ticker, points);
  }
  for (const [ticker, points] of traces) traces.set(ticker, points.slice(-32));
  return traces;
}

export async function getDesk(
  db: Queryable,
  cache: QuoteCache,
  now: Date,
  staleAfterSeconds: number,
): Promise<DeskView> {
  const session = getSession(now);
  const open = await db.query(
    "SELECT id, name FROM books WHERE is_open = TRUE ORDER BY created_at ASC LIMIT 1",
  );
  const book = open.rows[0];
  const state = await db.query("SELECT last_seen_at FROM desk_state WHERE id = 1");
  const stampedAt = nullableIso(state.rows[0]?.last_seen_at);
  if (!book) {
    return { book: null, session, rows: [], stampedAt, tape: "simulator", staleAfterSeconds };
  }
  const bookId = text(book.id);
  const symbols = await db.query(
    "SELECT ticker FROM book_symbols WHERE book_id = $1 ORDER BY position ASC, ticker ASC",
    [bookId],
  );
  const tickers = symbols.rows.map((row) => text(row.ticker));
  const quotes = await readQuotes(db, cache, tickers, now, staleAfterSeconds);
  const marks = tickers.length
    ? await db.query("SELECT ticker, price FROM visit_marks WHERE ticker = ANY($1::text[])", [tickers])
    : { rows: [], rowCount: 0 };
  const markMap = new Map(marks.rows.map((row) => [text(row.ticker), num(row.price)]));
  const traces = await loadTraces(db, tickers, now);
  return {
    book: { id: bookId, name: text(book.name) },
    session,
    stampedAt,
    tape: "simulator",
    staleAfterSeconds,
    rows: tickers.map((ticker) => {
      const listing = findListing(ticker);
      const stored = quotes.get(ticker) ?? null;
      return {
        ticker,
        name: listing?.name ?? ticker,
        venue: listing?.venue ?? "NASDAQ",
        quote: stored
          ? toQuoteView(stored, listing, markMap.get(ticker) ?? null, traces.get(ticker) ?? [], now, staleAfterSeconds)
          : null,
      };
    }),
  };
}

export async function stampVisit(db: Queryable, now: Date): Promise<void> {
  const open = await db.query("SELECT id FROM books WHERE is_open = TRUE ORDER BY created_at ASC LIMIT 1");
  const book = open.rows[0];
  await db.query("UPDATE desk_state SET last_seen_at = $1 WHERE id = 1", [now.toISOString()]);
  if (!book) return;
  const symbols = await db.query("SELECT ticker FROM book_symbols WHERE book_id = $1", [text(book.id)]);
  const tickers = symbols.rows.map((row) => text(row.ticker));
  if (tickers.length === 0) return;
  const quotes = await db.query("SELECT ticker, last FROM quotes WHERE ticker = ANY($1::text[])", [tickers]);
  for (const row of quotes.rows) {
    await db.query(
      `INSERT INTO visit_marks (ticker, price, marked_at) VALUES ($1, $2, $3)
       ON CONFLICT (ticker) DO UPDATE SET price = EXCLUDED.price, marked_at = EXCLUDED.marked_at`,
      [text(row.ticker), num(row.last), now.toISOString()],
    );
  }
}

export async function getSymbolPage(
  db: Queryable,
  cache: QuoteCache,
  ticker: string,
  now: Date,
  staleAfterSeconds: number,
): Promise<SymbolPage | null> {
  const listing = findListing(ticker);
  if (!listing) return null;
  const quotes = await readQuotes(db, cache, [listing.ticker], now, staleAfterSeconds);
  const stored = quotes.get(listing.ticker) ?? null;
  const marks = await db.query("SELECT price FROM visit_marks WHERE ticker = $1", [listing.ticker]);
  const mark = marks.rows[0] ? num(marks.rows[0].price) : null;
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const bars = await db.query(
    `SELECT bucket, open, high, low, close, volume FROM quote_bars
     WHERE ticker = $1 AND bucket >= $2 ORDER BY bucket ASC`,
    [listing.ticker, since],
  );
  const view = stored ? toQuoteView(stored, listing, mark, [], now, staleAfterSeconds) : null;
  return {
    listing,
    session: getSession(now),
    quote: view,
    tape: "simulator",
    bars: bars.rows.map((row) => ({
      bucket: iso(row.bucket),
      open: num(row.open),
      high: num(row.high),
      low: num(row.low),
      close: num(row.close),
      volume: num(row.volume),
    })) satisfies BarView[],
  };
}

async function insertChunks(
  db: Queryable,
  sql: (tuples: string) => string,
  rows: unknown[][],
  width: number,
): Promise<void> {
  const size = 200;
  for (let offset = 0; offset < rows.length; offset += size) {
    const slice = rows.slice(offset, offset + size);
    const values: unknown[] = [];
    const tuples = slice.map((row, index) => {
      values.push(...row);
      const start = index * width;
      return `(${Array.from({ length: width }, (_, column) => `$${start + column + 1}`).join(",")})`;
    });
    await db.query(sql(tuples.join(",")), values);
  }
}

export async function upsertQuotes(db: Queryable, quotes: StoredQuote[]): Promise<void> {
  await insertChunks(
    db,
    (tuples) =>
      `INSERT INTO quotes (
        ticker, last, change, change_percent, volume, open, previous_close,
        session, session_date, as_of, stored_at, status
      ) VALUES ${tuples}
      ON CONFLICT (ticker) DO UPDATE SET
        last = EXCLUDED.last,
        change = EXCLUDED.change,
        change_percent = EXCLUDED.change_percent,
        volume = EXCLUDED.volume,
        open = EXCLUDED.open,
        previous_close = EXCLUDED.previous_close,
        session = EXCLUDED.session,
        session_date = EXCLUDED.session_date,
        as_of = EXCLUDED.as_of,
        stored_at = EXCLUDED.stored_at,
        status = EXCLUDED.status`,
    quotes.map((quote) => [
      quote.ticker,
      quote.last,
      quote.change,
      quote.changePercent,
      quote.volume,
      quote.open,
      quote.previousClose,
      quote.session,
      quote.sessionDate,
      quote.asOf,
      quote.storedAt,
      quote.status,
    ]),
    12,
  );
}

export async function loadStoredQuotes(db: Queryable): Promise<Map<string, StoredQuote>> {
  const result = await db.query("SELECT * FROM quotes");
  return new Map(result.rows.map((row) => [text(row.ticker), rowToQuote(row)]));
}

export async function accumulateBars(db: Queryable, bars: BarDraft[]): Promise<void> {
  await insertChunks(
    db,
    (tuples) =>
      `INSERT INTO quote_bars (ticker, bucket, open, high, low, close, volume)
       VALUES ${tuples}
       ON CONFLICT (ticker, bucket) DO UPDATE SET
         high = GREATEST(quote_bars.high, EXCLUDED.high),
         low = LEAST(quote_bars.low, EXCLUDED.low),
         close = EXCLUDED.close,
         volume = quote_bars.volume + EXCLUDED.volume`,
    bars.map((bar) => [bar.ticker, bar.bucket, bar.open, bar.high, bar.low, bar.close, bar.volume]),
    7,
  );
}

export async function fillBars(db: Queryable, bars: BarDraft[]): Promise<void> {
  await insertChunks(
    db,
    (tuples) =>
      `INSERT INTO quote_bars (ticker, bucket, open, high, low, close, volume)
       VALUES ${tuples}
       ON CONFLICT (ticker, bucket) DO NOTHING`,
    bars.map((bar) => [bar.ticker, bar.bucket, bar.open, bar.high, bar.low, bar.close, bar.volume]),
    7,
  );
}

export async function shortestTrace(db: Queryable): Promise<number> {
  const result = await db.query("SELECT ticker, COUNT(*)::int AS count FROM quote_bars GROUP BY ticker");
  if (result.rows.length < UNIVERSE.length) return 0;
  return Math.min(...result.rows.map((row) => num(row.count)));
}

export async function loadRecentBars(db: Queryable, sinceIso: string): Promise<Map<string, { t: number; close: number; volume: number }[]>> {
  const result = await db.query(
    "SELECT ticker, bucket, close, volume FROM quote_bars WHERE bucket >= $1 ORDER BY bucket ASC",
    [sinceIso],
  );
  const grouped = new Map<string, { t: number; close: number; volume: number }[]>();
  for (const row of result.rows) {
    const ticker = text(row.ticker);
    const points = grouped.get(ticker) ?? [];
    points.push({ t: new Date(iso(row.bucket)).getTime(), close: num(row.close), volume: num(row.volume) });
    grouped.set(ticker, points);
  }
  return grouped;
}

export async function pruneBars(db: Queryable, beforeIso: string): Promise<void> {
  await db.query("DELETE FROM quote_bars WHERE bucket < $1", [beforeIso]);
}

export async function getMeta(db: Queryable, now: Date, staleAfterSeconds: number): Promise<MetaView> {
  const count = await db.query("SELECT COUNT(*)::int AS count FROM events WHERE seen = FALSE");
  return {
    session: getSession(now),
    tape: "simulator",
    unseenEvents: num(count.rows[0]?.count ?? 0),
    staleAfterSeconds,
    serverTime: now.toISOString(),
  };
}

export async function pingDb(db: Queryable): Promise<boolean> {
  try {
    await db.query("SELECT 1 AS ok");
    return true;
  } catch {
    return false;
  }
}
