import { randomUUID } from "node:crypto";
import { findListing, validateBookName, type BookSymbol, type BookView, type Venue } from "@atrium/domain";
import type { Db, Queryable } from "./db.js";
import { transaction } from "./db.js";
import { HttpError } from "./parse.js";
import { flag, num, text } from "./parse.js";

function mapSymbols(rows: Record<string, unknown>[]): BookSymbol[] {
  return rows.map((row) => {
    const ticker = text(row.ticker);
    const listing = findListing(ticker);
    return {
      ticker,
      name: listing?.name ?? ticker,
      venue: (listing?.venue ?? "NASDAQ") as Venue,
      position: num(row.position),
    };
  });
}

async function readBook(db: Queryable, id: string): Promise<BookView | null> {
  const book = await db.query("SELECT id, name, is_open FROM books WHERE id = $1", [id]);
  const row = book.rows[0];
  if (!row) return null;
  const symbols = await db.query(
    "SELECT ticker, position FROM book_symbols WHERE book_id = $1 ORDER BY position ASC, ticker ASC",
    [id],
  );
  return {
    id: text(row.id),
    name: text(row.name),
    isOpen: flag(row.is_open),
    symbols: mapSymbols(symbols.rows),
  };
}

export async function listBooks(db: Queryable): Promise<BookView[]> {
  const books = await db.query("SELECT id FROM books ORDER BY is_open DESC, created_at ASC");
  const views: BookView[] = [];
  for (const row of books.rows) {
    const book = await readBook(db, text(row.id));
    if (book) views.push(book);
  }
  return views;
}

export async function createBook(db: Db, name: string): Promise<BookView> {
  const validated = validateBookName(name);
  if (!validated.ok) throw new HttpError(400, validated.error);
  const id = randomUUID();
  await transaction(db, async (client) => {
    await client.query("SELECT id FROM schema_lock WHERE id = 1 FOR UPDATE");
    const count = await client.query("SELECT COUNT(*)::int AS count FROM books");
    const isOpen = num(count.rows[0]?.count ?? 0) === 0;
    await client.query("INSERT INTO books (id, name, is_open) VALUES ($1, $2, $3)", [
      id,
      validated.name,
      isOpen,
    ]);
  });
  const book = await readBook(db, id);
  if (!book) throw new Error("Book insert did not persist.");
  return book;
}

export async function updateBook(
  db: Db,
  id: string,
  patch: { name?: string; isOpen?: boolean },
): Promise<BookView> {
  const name = patch.name === undefined ? undefined : validateBookName(patch.name);
  if (name && !name.ok) throw new HttpError(400, name.error);
  if (patch.isOpen === false) {
    throw new HttpError(400, "Open another book. The desk keeps one book open.");
  }
  await transaction(db, async (client) => {
    const existing = await readBook(client, id);
    if (!existing) throw new HttpError(404, "Book not found.");
    if (name?.ok) {
      await client.query("UPDATE books SET name = $2 WHERE id = $1", [id, name.name]);
    }
    if (patch.isOpen === true) {
      await client.query("UPDATE books SET is_open = FALSE WHERE is_open = TRUE");
      await client.query("UPDATE books SET is_open = TRUE WHERE id = $1", [id]);
    }
  });
  const book = await readBook(db, id);
  if (!book) throw new HttpError(404, "Book not found.");
  return book;
}

export async function deleteBook(db: Db, id: string): Promise<void> {
  await transaction(db, async (client) => {
    const existing = await readBook(client, id);
    if (!existing) throw new HttpError(404, "Book not found.");
    await client.query("DELETE FROM books WHERE id = $1", [id]);
    if (existing.isOpen) {
      await client.query(
        `UPDATE books SET is_open = TRUE
         WHERE id = (SELECT id FROM books ORDER BY created_at ASC LIMIT 1)`,
      );
    }
  });
}

export async function addSymbol(db: Db, bookId: string, ticker: string): Promise<BookView> {
  const listing = findListing(ticker);
  if (!listing) throw new HttpError(400, `${ticker.trim().toUpperCase() || "That symbol"} is not in the Atrium universe.`);
  await transaction(db, async (client) => {
    const existing = await readBook(client, bookId);
    if (!existing) throw new HttpError(404, "Book not found.");
    if (existing.symbols.some((symbol) => symbol.ticker === listing.ticker)) {
      throw new HttpError(409, `${listing.ticker} is already in this book.`);
    }
    const position = existing.symbols.reduce((max, symbol) => Math.max(max, symbol.position), -1) + 1;
    await client.query("INSERT INTO book_symbols (book_id, ticker, position) VALUES ($1, $2, $3)", [
      bookId,
      listing.ticker,
      position,
    ]);
  });
  const book = await readBook(db, bookId);
  if (!book) throw new HttpError(404, "Book not found.");
  return book;
}

export async function removeSymbol(db: Db, bookId: string, ticker: string): Promise<BookView> {
  const symbol = ticker.trim().toUpperCase();
  await transaction(db, async (client) => {
    const existing = await readBook(client, bookId);
    if (!existing) throw new HttpError(404, "Book not found.");
    const removed = await client.query("DELETE FROM book_symbols WHERE book_id = $1 AND ticker = $2", [
      bookId,
      symbol,
    ]);
    if (removed.rowCount === 0) throw new HttpError(404, `${symbol} is not in this book.`);
  });
  const book = await readBook(db, bookId);
  if (!book) throw new HttpError(404, "Book not found.");
  return book;
}
