import type { Listing } from "./types.js";

export const UNIVERSE: readonly Listing[] = [
  { ticker: "AAPL", name: "Apple", venue: "NASDAQ", base: 228.4 },
  { ticker: "MSFT", name: "Microsoft", venue: "NASDAQ", base: 428.2 },
  { ticker: "NVDA", name: "NVIDIA", venue: "NASDAQ", base: 138.5 },
  { ticker: "AMZN", name: "Amazon", venue: "NASDAQ", base: 198.1 },
  { ticker: "GOOGL", name: "Alphabet", venue: "NASDAQ", base: 172.3 },
  { ticker: "META", name: "Meta Platforms", venue: "NASDAQ", base: 590.4 },
  { ticker: "AVGO", name: "Broadcom", venue: "NASDAQ", base: 178.6 },
  { ticker: "TSLA", name: "Tesla", venue: "NASDAQ", base: 248.9 },
  { ticker: "COST", name: "Costco", venue: "NASDAQ", base: 890.2 },
  { ticker: "NFLX", name: "Netflix", venue: "NASDAQ", base: 760.1 },
  { ticker: "JPM", name: "JPMorgan Chase", venue: "NYSE", base: 224.8 },
  { ticker: "XOM", name: "Exxon Mobil", venue: "NYSE", base: 118.4 },
  { ticker: "JNJ", name: "Johnson & Johnson", venue: "NYSE", base: 162.7 },
  { ticker: "V", name: "Visa", venue: "NYSE", base: 312.5 },
  { ticker: "UNH", name: "UnitedHealth", venue: "NYSE", base: 560.3 },
  { ticker: "WMT", name: "Walmart", venue: "NYSE", base: 82.4 },
  { ticker: "PG", name: "Procter & Gamble", venue: "NYSE", base: 168.9 },
  { ticker: "HD", name: "Home Depot", venue: "NYSE", base: 400.2 },
  { ticker: "BAC", name: "Bank of America", venue: "NYSE", base: 42.15 },
  { ticker: "KO", name: "Coca-Cola", venue: "NYSE", base: 68.4 },
];

const byTicker = new Map(UNIVERSE.map((listing) => [listing.ticker, listing]));

export function findListing(ticker: string): Listing | undefined {
  return byTicker.get(ticker.trim().toUpperCase());
}

export function searchUniverse(query: string, limit = 8): Listing[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const ranked = UNIVERSE.map((listing) => {
    const ticker = listing.ticker.toLowerCase();
    const name = listing.name.toLowerCase();
    let rank = 0;
    if (ticker === needle) rank = 0;
    else if (ticker.startsWith(needle)) rank = 1;
    else if (name.includes(needle)) rank = 2;
    else rank = -1;
    return { listing, rank };
  }).filter((item) => item.rank >= 0);
  ranked.sort((a, b) => a.rank - b.rank || a.listing.ticker.localeCompare(b.listing.ticker));
  return ranked.slice(0, limit).map((item) => item.listing);
}
