import type { AlertCondition, BarPoint } from "./types.js";

export interface CrossSample {
  last: number;
  previousLast: number;
}

export interface LevelSample {
  last: number;
  anchor: number;
}

const CROSS_RESET_DISTANCE = 0.002;

function side(price: number, level: number): -1 | 0 | 1 {
  const diff = price - level;
  const epsilon = Math.max(Math.abs(level) * 1e-6, 1e-6);
  if (Math.abs(diff) <= epsilon) return 0;
  return diff > 0 ? 1 : -1;
}

export function evaluatePriceCross(
  threshold: number,
  sample: CrossSample,
  latched: boolean,
): { fire: boolean; latched: boolean } {
  const previousSide = side(sample.previousLast, threshold);
  const nextSide = side(sample.last, threshold);
  const crossed = previousSide !== 0 && nextSide !== 0 && previousSide !== nextSide;
  if (crossed && !latched) return { fire: true, latched: true };
  if (latched) {
    const distance = Math.abs(sample.last - threshold) / Math.max(Math.abs(threshold), 1e-6);
    const settled = previousSide === nextSide && nextSide !== 0 && distance >= CROSS_RESET_DISTANCE;
    if (settled) return { fire: false, latched: false };
    return { fire: false, latched: true };
  }
  return { fire: false, latched: false };
}

export function levelActive(threshold: number, sample: LevelSample): boolean {
  if (!(sample.anchor > 0) || !Number.isFinite(sample.last)) return false;
  const move = ((sample.last - sample.anchor) / sample.anchor) * 100;
  return threshold > 0 ? move >= threshold : move <= threshold;
}

export function evaluateLevel(
  threshold: number,
  sample: LevelSample,
  latched: boolean,
): { fire: boolean; latched: boolean } {
  const active = levelActive(threshold, sample);
  if (active && !latched) return { fire: true, latched: true };
  if (!active && latched) return { fire: false, latched: false };
  return { fire: false, latched };
}

export function evaluateVolumeMultiple(
  threshold: number,
  volume: number,
  averageVolume: number | null,
  latched: boolean,
): { fire: boolean; latched: boolean } {
  const active =
    averageVolume !== null && averageVolume > 0 && volume >= threshold * averageVolume;
  if (active && !latched) return { fire: true, latched: true };
  if (!active && latched) return { fire: false, latched: false };
  return { fire: false, latched };
}

export function priceAtOrBefore(bars: readonly BarPoint[], at: number): number | null {
  let found: number | null = null;
  for (const bar of bars) {
    if (bar.t <= at) found = bar.close;
    else break;
  }
  return found;
}

export function rollingReference(
  bars: readonly BarPoint[],
  nowMs: number,
  windowMinutes: number,
): number | null {
  return priceAtOrBefore(bars, nowMs - windowMinutes * 60_000);
}

export function averageCompletedVolume(
  bars: readonly BarPoint[],
  nowMs: number,
): number | null {
  const currentMinute = Math.floor(nowMs / 60_000);
  const byMinute = new Map<number, number>();
  for (const bar of bars) {
    const minute = Math.floor(bar.t / 60_000);
    if (minute === currentMinute) continue;
    byMinute.set(minute, (byMinute.get(minute) ?? 0) + bar.volume);
  }
  const volumes = [...byMinute.entries()]
    .sort((a, b) => a[0] - b[0])
    .map((entry) => entry[1])
    .slice(-20);
  if (volumes.length < 3) return null;
  return volumes.reduce((sum, value) => sum + value, 0) / volumes.length;
}

export interface RuleDecisionInput {
  condition: AlertCondition;
  threshold: number;
  windowMinutes: number | null;
  latched: boolean;
  last: number;
  previousLast: number;
  open: number;
  volume: number;
  bars: readonly BarPoint[];
  nowMs: number;
}

export function decideRule(input: RuleDecisionInput): { fire: boolean; latched: boolean } {
  switch (input.condition) {
    case "price_cross":
      return evaluatePriceCross(
        input.threshold,
        { last: input.last, previousLast: input.previousLast },
        input.latched,
      );
    case "move_from_open":
      return evaluateLevel(input.threshold, { last: input.last, anchor: input.open }, input.latched);
    case "rolling_move": {
      if (input.windowMinutes === null) return { fire: false, latched: input.latched };
      const reference = rollingReference(input.bars, input.nowMs, input.windowMinutes);
      if (reference === null) return { fire: false, latched: input.latched };
      return evaluateLevel(
        input.threshold,
        { last: input.last, anchor: reference },
        input.latched,
      );
    }
    case "volume_multiple":
      return evaluateVolumeMultiple(
        input.threshold,
        input.volume,
        averageCompletedVolume(input.bars, input.nowMs),
        input.latched,
      );
    default:
      return { fire: false, latched: input.latched };
  }
}
