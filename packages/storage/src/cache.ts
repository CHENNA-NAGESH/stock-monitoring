import type { StoredQuote } from "@atrium/domain";
import { Redis } from "ioredis";

const PREFIX = "atrium:quote:";

export interface QuoteCache {
  getMany(tickers: string[]): Promise<Map<string, StoredQuote>>;
  setMany(quotes: StoredQuote[]): Promise<void>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export function createMemoryCache(): QuoteCache {
  const quotes = new Map<string, StoredQuote>();
  return {
    async getMany(tickers) {
      const result = new Map<string, StoredQuote>();
      for (const ticker of tickers) {
        const quote = quotes.get(ticker);
        if (quote) result.set(ticker, quote);
      }
      return result;
    },
    async setMany(next) {
      for (const quote of next) quotes.set(quote.ticker, quote);
    },
    async ping() {
      return true;
    },
    async close() {
      quotes.clear();
    },
  };
}

function parseStoredQuote(raw: string): StoredQuote | null {
  try {
    const value = JSON.parse(raw) as Partial<StoredQuote>;
    if (!value || typeof value.ticker !== "string" || typeof value.last !== "number") return null;
    if (!Number.isFinite(value.last)) return null;
    return value as StoredQuote;
  } catch {
    return null;
  }
}

export function createRedisCache(url: string): QuoteCache {
  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    retryStrategy(times) {
      if (times > 8) return null;
      return Math.min(times * 200, 1_000);
    },
  });
  let logged = false;
  redis.on("error", (error: Error) => {
    if (logged) return;
    logged = true;
    console.error("redis", error.message);
  });

  return {
    async getMany(tickers) {
      const result = new Map<string, StoredQuote>();
      if (tickers.length === 0) return result;
      const pipeline = redis.pipeline();
      for (const ticker of tickers) pipeline.get(`${PREFIX}${ticker}`);
      const rows = await pipeline.exec();
      if (!rows) return result;
      rows.forEach((row, index) => {
        const ticker = tickers[index];
        if (!ticker || !row) return;
        if (row[0]) throw row[0];
        if (typeof row[1] !== "string") return;
        const quote = parseStoredQuote(row[1]);
        if (quote) result.set(ticker, quote);
      });
      return result;
    },
    async setMany(quotes) {
      if (quotes.length === 0) return;
      const pipeline = redis.pipeline();
      for (const quote of quotes) pipeline.set(`${PREFIX}${quote.ticker}`, JSON.stringify(quote));
      const rows = await pipeline.exec();
      const failure = rows?.find((row) => row[0]);
      if (failure?.[0]) throw failure[0];
    },
    async ping() {
      try {
        if (redis.status !== "ready") {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
              cleanup();
              reject(new Error("redis connect timeout"));
            }, 2_000);
            const onReady = () => {
              cleanup();
              resolve();
            };
            const onEnd = () => {
              cleanup();
              reject(new Error("redis connection closed"));
            };
            const cleanup = () => {
              clearTimeout(timer);
              redis.off("ready", onReady);
              redis.off("end", onEnd);
            };
            redis.once("ready", onReady);
            redis.once("end", onEnd);
            if (redis.status === "ready") onReady();
          });
        }
        return (await redis.ping()) === "PONG";
      } catch {
        return false;
      }
    },
    async close() {
      try {
        await redis.quit();
      } catch {
        redis.disconnect();
      }
    },
  };
}
