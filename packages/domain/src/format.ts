import { getSession } from "./session.js";
import type { FeedStatus } from "./types.js";

export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatSignedPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPrice(value)}`;
}

export function formatVolume(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}b`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}m`;
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value));
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const session = getSession(date);
  return `${session.date} ${session.clock} ET`;
}

export function resolveFeedStatus(
  status: FeedStatus,
  storedAt: string,
  now: Date,
  staleAfterSeconds: number,
): FeedStatus {
  const stored = new Date(storedAt).getTime();
  if (!Number.isFinite(stored)) return "stale";
  if (now.getTime() - stored > staleAfterSeconds * 1000) return "stale";
  return status;
}

export interface Plot {
  width: number;
  height: number;
  pad: number;
  min: number;
  max: number;
}

export function plotFrame(values: readonly number[], width: number, height: number, pad: number): Plot {
  const finite = values.filter((value) => Number.isFinite(value));
  const min = finite.length ? Math.min(...finite) : 0;
  const max = finite.length ? Math.max(...finite) : 1;
  return { width, height, pad, min, max: max === min ? min + 1 : max };
}

export function plotX(plot: Plot, index: number, count: number): number {
  if (count <= 1) return plot.width / 2;
  return plot.pad + (index / (count - 1)) * (plot.width - plot.pad * 2);
}

export function plotY(plot: Plot, value: number): number {
  const span = plot.max - plot.min || 1;
  return plot.pad + (1 - (value - plot.min) / span) * (plot.height - plot.pad * 2);
}

export function plotLine(values: readonly number[], width: number, height: number, pad: number): string {
  if (values.length === 0) return "";
  const plot = plotFrame(values, width, height, pad);
  return values
    .map((value, index) => `${plotX(plot, index, values.length).toFixed(2)},${plotY(plot, value).toFixed(2)}`)
    .join(" ");
}

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function openingGap(ticker: string, sessionDate: string): number {
  const hash = hashString(`${ticker}:${sessionDate}`);
  return ((hash % 201) - 100) / 10_000;
}
