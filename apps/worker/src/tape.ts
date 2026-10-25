import {
  getSession,
  openingGap,
  type Listing,
  type StoredQuote,
} from "@atrium/domain";

export interface BarDraft {
  ticker: string;
  bucket: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TapeStep {
  quote: StoredQuote;
  previousLast: number;
  barVolume: number;
}

function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

export function stepTape(input: {
  listing: Listing;
  previous: StoredQuote | null;
  now: Date;
  random: () => number;
}): TapeStep {
  const session = getSession(input.now);
  const sameSession = input.previous !== null && input.previous.sessionDate === session.date;
  const previousClose = sameSession ? input.previous!.previousClose : (input.previous?.last ?? input.listing.base);
  const open = sameSession ? input.previous!.open : previousClose * (1 + openingGap(input.listing.ticker, session.date));
  const anchor = sameSession ? input.previous!.last : open;
  const walked = Math.max(0.01, anchor * (1 + (input.random() - 0.5) * 0.0012));
  const last = roundPrice(walked);
  const roundedOpen = roundPrice(open);
  const roundedClose = roundPrice(previousClose);
  const barVolume =
    session.name === "regular" ? Math.floor(2_000 + input.random() * 20_000) : Math.floor(100 + input.random() * 800);
  const change = roundPrice(last - roundedClose);
  const changePercent = roundedClose === 0 ? 0 : (change / roundedClose) * 100;
  return {
    previousLast: sameSession ? input.previous!.last : last,
    barVolume,
    quote: {
      ticker: input.listing.ticker,
      last,
      change,
      changePercent,
      volume: (sameSession ? input.previous!.volume : 0) + barVolume,
      open: roundedOpen,
      previousClose: roundedClose,
      session: session.name,
      sessionDate: session.date,
      asOf: input.now.toISOString(),
      storedAt: input.now.toISOString(),
      status: session.name === "regular" ? "live" : "delayed",
    },
  };
}

export function buildBackfill(quote: StoredQuote, now: Date, minutes = 90): BarDraft[] {
  const current = Math.floor(now.getTime() / 60_000) * 60_000;
  const bars: BarDraft[] = [];
  for (let index = minutes; index >= 1; index -= 1) {
    const progress = (minutes - index) / Math.max(minutes - 1, 1);
    const wave = Math.sin(index / 3) * quote.open * 0.0015;
    const close = roundPrice(Math.max(0.01, quote.open + (quote.last - quote.open) * progress + wave));
    bars.push({
      ticker: quote.ticker,
      bucket: new Date(current - index * 60_000).toISOString(),
      open: close,
      high: roundPrice(close * 1.001),
      low: roundPrice(close * 0.999),
      close,
      volume: 1_000 + (index % 7) * 100,
    });
  }
  return bars;
}

export function minuteBucket(now: Date): string {
  return new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString();
}
