import { TICK_LOCK_KEY, TICK_MS } from "@atrium/config";
import { UNIVERSE } from "@atrium/domain";
import {
  accumulateBars,
  evaluateTick,
  fillBars,
  loadRecentBars,
  loadStoredQuotes,
  pruneBars,
  shortestTrace,
  upsertQuotes,
  type Db,
  type Queryable,
  type QuoteCache,
} from "@atrium/storage";
import { buildBackfill, minuteBucket, stepTape, type TapeStep } from "./tape.js";

function locked(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

export async function runTick(client: Queryable, now = new Date()): Promise<TapeStep[]> {
  const previous = await loadStoredQuotes(client);
  const steps = UNIVERSE.map((listing) =>
    stepTape({
      listing,
      previous: previous.get(listing.ticker) ?? null,
      now,
      random: Math.random,
    }),
  );
  if ((await shortestTrace(client)) < 30) {
    await fillBars(
      client,
      steps.flatMap((step) => buildBackfill(step.quote, now)),
    );
  }
  await upsertQuotes(
    client,
    steps.map((step) => step.quote),
  );
  await accumulateBars(
    client,
    steps.map((step) => ({
      ticker: step.quote.ticker,
      bucket: minuteBucket(now),
      open: step.quote.last,
      high: step.quote.last,
      low: step.quote.last,
      close: step.quote.last,
      volume: step.barVolume,
    })),
  );
  const bars = await loadRecentBars(client, new Date(now.getTime() - 240 * 60_000).toISOString());
  await evaluateTick(client, steps, bars, now);
  return steps;
}

export async function loop(db: Db, cache: QuoteCache, isStopped: () => boolean): Promise<void> {
  let lastPrune = 0;
  await db.withClient(async (client) => {
    while (!isStopped()) {
      const started = Date.now();
      try {
        const lock = await client.query("SELECT pg_try_advisory_lock($1) AS ok", [TICK_LOCK_KEY]);
        if (locked(lock.rows[0]?.ok)) {
          let steps: TapeStep[] | null = null;
          try {
            await client.query("BEGIN");
            try {
              steps = await runTick(client);
              await client.query("COMMIT");
            } catch (error) {
              await client.query("ROLLBACK");
              throw error;
            }
          } finally {
            await client.query("SELECT pg_advisory_unlock($1)", [TICK_LOCK_KEY]);
          }
          if (steps) {
            try {
              await cache.setMany(steps.map((step) => step.quote));
            } catch (error) {
              console.error("quote cache write failed", error instanceof Error ? error.message : error);
            }
          }
        }
        if (started - lastPrune > 60 * 60 * 1000) {
          await pruneBars(client, new Date(started - 5 * 24 * 60 * 60 * 1000).toISOString());
          lastPrune = started;
        }
      } catch (error) {
        console.error("tick failed", error instanceof Error ? error.message : error);
      }
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, TICK_MS - (Date.now() - started))));
    }
  });
}
