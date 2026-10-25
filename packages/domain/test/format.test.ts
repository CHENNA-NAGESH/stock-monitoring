import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPercent,
  formatPrice,
  formatVolume,
  formatWhen,
  openingGap,
  plotLine,
  plotY,
  plotFrame,
  resolveFeedStatus,
} from "../src/format.js";
import { validateBookName, validateRule } from "../src/rules.js";
import { searchUniverse } from "../src/universe.js";

test("formatters keep a sign on gains and a scale on volume", () => {
  assert.equal(formatPrice(228.4), "228.40");
  assert.equal(formatPercent(1.2), "+1.20%");
  assert.equal(formatPercent(-0.5), "-0.50%");
  assert.equal(formatPercent(0), "0.00%");
  assert.equal(formatVolume(1_250_000), "1.25m");
  assert.equal(formatVolume(Number.NaN), "—");
});

test("event time is rendered on the New York clock", () => {
  assert.equal(formatWhen("2026-10-26T14:30:00.000Z"), "2026-10-26 10:30:00 ET");
});

test("a fresh live quote stays live and an old one becomes stale", () => {
  const now = new Date("2026-10-26T14:30:30.000Z");
  assert.equal(resolveFeedStatus("live", "2026-10-26T14:30:20.000Z", now, 30), "live");
  assert.equal(resolveFeedStatus("delayed", "2026-10-26T14:29:00.000Z", now, 30), "stale");
  assert.equal(resolveFeedStatus("live", "not-a-date", now, 30), "stale");
});

test("opening gap is stable for a symbol and session date", () => {
  assert.equal(openingGap("AAPL", "2026-10-26"), openingGap("AAPL", "2026-10-26"));
  assert.ok(Math.abs(openingGap("AAPL", "2026-10-26")) <= 0.01);
});

test("a flat trace stays inside the plot frame", () => {
  const frame = plotFrame([10, 10, 10], 100, 40, 4);
  const y = plotY(frame, 10);
  assert.ok(y >= 4 && y <= 36);
  const line = plotLine([10, 12], 100, 40, 4);
  assert.match(line, /^4\.00,/);
  assert.match(line, /96\.00,/);
});

test("book names and rules reject empty or unbounded input", () => {
  const book = validateBookName("  Primary  book ");
  assert.equal(book.ok, true);
  if (book.ok) assert.equal(book.name, "Primary book");
  assert.equal(validateBookName("").ok, false);
  assert.equal(validateBookName("<script>").ok, false);

  const cross = validateRule({ ticker: "aapl", condition: "price_cross", threshold: 230 });
  assert.equal(cross.ok && cross.rule.ticker, "AAPL");
  assert.equal(validateRule({ ticker: "AAPL", condition: "price_cross", threshold: 0 }).ok, false);
  assert.equal(validateRule({ ticker: "NOPE", condition: "price_cross", threshold: 10 }).ok, false);
  assert.equal(
    validateRule({ ticker: "MSFT", condition: "rolling_move", threshold: 1, windowMinutes: 15 }).ok,
    true,
  );
  assert.equal(validateRule({ ticker: "MSFT", condition: "rolling_move", threshold: 1 }).ok, false);
  assert.equal(validateRule({ ticker: "MSFT", condition: "volume_multiple", threshold: 1 }).ok, false);
  assert.equal(validateRule({ ticker: "MSFT", condition: "move_from_open", threshold: -2 }).ok, true);
});

test("symbol search prefers a ticker prefix over a name", () => {
  assert.equal(searchUniverse("").length, 0);
  assert.equal(searchUniverse("nv")[0]?.ticker, "NVDA");
  assert.equal(searchUniverse("apple")[0]?.ticker, "AAPL");
});
