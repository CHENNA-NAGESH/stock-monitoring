import assert from "node:assert/strict";
import test from "node:test";
import {
  averageCompletedVolume,
  decideRule,
  evaluateLevel,
  evaluatePriceCross,
  evaluateVolumeMultiple,
  rollingReference,
} from "../src/alerts.js";
import type { BarPoint } from "../src/types.js";

test("price cross fires once and resets only after leaving the level", () => {
  const first = evaluatePriceCross(100, { previousLast: 99, last: 101 }, false);
  assert.deepEqual(first, { fire: true, latched: true });

  const stillNear = evaluatePriceCross(100, { previousLast: 101, last: 100.05 }, true);
  assert.deepEqual(stillNear, { fire: false, latched: true });

  const wobble = evaluatePriceCross(100, { previousLast: 100.05, last: 99.95 }, true);
  assert.deepEqual(wobble, { fire: false, latched: true });

  const far = evaluatePriceCross(100, { previousLast: 100.05, last: 100.3 }, true);
  assert.deepEqual(far, { fire: false, latched: false });

  const back = evaluatePriceCross(100, { previousLast: 100.3, last: 99.5 }, false);
  assert.deepEqual(back, { fire: true, latched: true });
});

test("a latched price cross does not fire again while still latched", () => {
  const again = evaluatePriceCross(100, { previousLast: 99, last: 101 }, true);
  assert.deepEqual(again, { fire: false, latched: true });
});

test("sitting on the threshold is not a cross", () => {
  const touch = evaluatePriceCross(100, { previousLast: 100, last: 100.5 }, false);
  assert.equal(touch.fire, false);
});

test("move from open fires on the way through and clears when it falls back", () => {
  const fire = evaluateLevel(1.5, { last: 101.6, anchor: 100 }, false);
  assert.deepEqual(fire, { fire: true, latched: true });
  const held = evaluateLevel(1.5, { last: 101.6, anchor: 100 }, true);
  assert.deepEqual(held, { fire: false, latched: true });
  const clear = evaluateLevel(1.5, { last: 101.2, anchor: 100 }, true);
  assert.deepEqual(clear, { fire: false, latched: false });
});

test("a positive percent threshold ignores a drop", () => {
  const drop = evaluateLevel(1.5, { last: 98, anchor: 100 }, false);
  assert.equal(drop.fire, false);
});

test("a negative percent threshold fires on a drop", () => {
  const drop = evaluateLevel(-1.5, { last: 98.4, anchor: 100 }, false);
  assert.deepEqual(drop, { fire: true, latched: true });
});

test("rolling reference uses the print at the start of the window", () => {
  const now = Date.parse("2026-10-26T14:30:00.000Z");
  const bars: BarPoint[] = [
    { t: now - 20 * 60_000, close: 10, volume: 1 },
    { t: now - 10 * 60_000, close: 12, volume: 1 },
  ];
  assert.equal(rollingReference(bars, now, 15), 10);
  assert.equal(rollingReference(bars, now, 5), 12);
  assert.equal(rollingReference(bars, now, 30), null);
});

test("volume average ignores the current minute and needs three completed minutes", () => {
  const now = 10 * 60_000 + 5_000;
  const shortBars: BarPoint[] = [
    { t: 8 * 60_000, close: 1, volume: 100 },
    { t: 9 * 60_000, close: 1, volume: 100 },
    { t: 10 * 60_000, close: 1, volume: 9_000 },
  ];
  assert.equal(averageCompletedVolume(shortBars, now), null);

  const bars: BarPoint[] = [
    { t: 6 * 60_000, close: 1, volume: 100 },
    { t: 7 * 60_000, close: 1, volume: 200 },
    { t: 8 * 60_000, close: 1, volume: 300 },
    { t: 10 * 60_000, close: 1, volume: 9_000 },
  ];
  assert.equal(averageCompletedVolume(bars, now), 200);
});

test("volume multiple is edge triggered", () => {
  assert.deepEqual(evaluateVolumeMultiple(2, 2500, 1000, false), { fire: true, latched: true });
  assert.deepEqual(evaluateVolumeMultiple(2, 2500, 1000, true), { fire: false, latched: true });
  assert.deepEqual(evaluateVolumeMultiple(2, 1500, 1000, true), { fire: false, latched: false });
  assert.equal(evaluateVolumeMultiple(2, 2500, null, false).fire, false);
});

test("decideRule keeps a rolling move quiet until the window has history", () => {
  const decision = decideRule({
    condition: "rolling_move",
    threshold: 1,
    windowMinutes: 15,
    latched: false,
    last: 110,
    previousLast: 109,
    open: 100,
    volume: 10,
    bars: [],
    nowMs: Date.parse("2026-10-26T14:30:00.000Z"),
  });
  assert.deepEqual(decision, { fire: false, latched: false });
});
