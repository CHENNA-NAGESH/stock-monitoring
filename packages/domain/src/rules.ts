import { findListing } from "./universe.js";
import { CONDITIONS, type AlertCondition } from "./types.js";

export interface RuleDraft {
  ticker: string;
  condition: AlertCondition;
  threshold: number;
  windowMinutes: number | null;
}

export function validateBookName(name: string): { ok: true; name: string } | { ok: false; error: string } {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < 1 || trimmed.length > 40) {
    return { ok: false, error: "A book name needs 1 to 40 characters." };
  }
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '&.,-]*$/u.test(trimmed)) {
    return { ok: false, error: "Use letters, numbers, spaces, and & ' . , - in the book name." };
  }
  return { ok: true, name: trimmed };
}

export function validateRule(input: {
  ticker: string;
  condition: string;
  threshold: number;
  windowMinutes?: number | null;
}): { ok: true; rule: RuleDraft } | { ok: false; error: string } {
  const ticker = input.ticker.trim().toUpperCase();
  if (!findListing(ticker)) {
    return { ok: false, error: `${ticker || "That symbol"} is not in the Atrium universe.` };
  }
  if (!CONDITIONS.includes(input.condition as AlertCondition)) {
    return { ok: false, error: "Choose a price cross, move from open, rolling move, or volume multiple." };
  }
  const condition = input.condition as AlertCondition;
  if (!Number.isFinite(input.threshold)) {
    return { ok: false, error: "Threshold must be a finite number." };
  }
  const threshold = input.threshold;
  let windowMinutes: number | null = null;

  if (condition === "price_cross") {
    if (threshold <= 0 || threshold > 1_000_000) {
      return { ok: false, error: "A price cross uses a level above 0 and at most 1,000,000." };
    }
  } else if (condition === "move_from_open" || condition === "rolling_move") {
    if (threshold === 0 || Math.abs(threshold) > 100) {
      return { ok: false, error: "A percent move uses a non-zero threshold within 100." };
    }
    if (condition === "rolling_move") {
      const window = input.windowMinutes;
      if (window === undefined || window === null || !Number.isInteger(window) || window < 1 || window > 240) {
        return { ok: false, error: "A rolling move needs a window from 1 to 240 minutes." };
      }
      windowMinutes = window;
    }
  } else if (threshold < 1.1 || threshold > 100) {
    return { ok: false, error: "A volume multiple is between 1.1 and 100." };
  }

  return { ok: true, rule: { ticker, condition, threshold, windowMinutes } };
}
