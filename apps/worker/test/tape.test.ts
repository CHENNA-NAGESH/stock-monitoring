import assert from "node:assert/strict";
import test from "node:test";
import { findListing, openingGap } from "@atrium/domain";
import { buildBackfill, stepTape } from "../src/tape.js";

test("a closed New York session prints a delayed tape from the listing base", () => {
  const listing = findListing("AAPL");
  if (!listing) throw new Error("missing AAPL");
  const now = new Date("2026-10-25T04:31:00.000Z");
  const step = stepTape({ listing, previous: null, now, random: () => 0.5 });
  const expectedOpen = Math.round(listing.base * (1 + openingGap("AAPL", "2026-10-25")) * 100) / 100;
  assert.equal(step.quote.session, "closed");
  assert.equal(step.quote.status, "delayed");
  assert.equal(step.quote.sessionDate, "2026-10-25");
  assert.equal(step.quote.previousClose, listing.base);
  assert.equal(step.quote.open, expectedOpen);
  assert.equal(step.previousLast, step.quote.last);
  assert.equal(step.barVolume, 500);
  assert.equal(step.quote.volume, 500);
});

test("a new session date rolls the previous last into the previous close", () => {
  const listing = findListing("MSFT");
  if (!listing) throw new Error("missing MSFT");
  const sunday = new Date("2026-10-25T04:31:00.000Z");
  const first = stepTape({ listing, previous: null, now: sunday, random: () => 0.5 });
  const monday = new Date("2026-10-26T14:30:00.000Z");
  const next = stepTape({ listing, previous: first.quote, now: monday, random: () => 0.5 });
  assert.equal(next.quote.session, "regular");
  assert.equal(next.quote.status, "live");
  assert.equal(next.quote.previousClose, first.quote.last);
  assert.equal(next.quote.volume, next.barVolume);
  assert.equal(next.barVolume, Math.floor(2_000 + 0.5 * 20_000));
});

test("backfill stops one minute before the current bucket", () => {
  const listing = findListing("NVDA");
  if (!listing) throw new Error("missing NVDA");
  const now = new Date("2026-10-26T14:30:20.000Z");
  const step = stepTape({ listing, previous: null, now, random: () => 0.5 });
  const bars = buildBackfill(step.quote, now, 90);
  assert.equal(bars.length, 90);
  const current = Math.floor(now.getTime() / 60_000) * 60_000;
  assert.equal(bars.at(-1)?.bucket, new Date(current - 60_000).toISOString());
  assert.ok(bars.every((bar) => bar.high >= bar.close && bar.close >= bar.low));
});
