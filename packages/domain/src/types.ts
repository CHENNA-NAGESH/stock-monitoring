export type SessionName = "pre-market" | "regular" | "after-hours" | "closed";
export type FeedStatus = "live" | "delayed" | "stale";
export type Venue = "NASDAQ" | "NYSE";
export type AlertCondition =
  | "price_cross"
  | "move_from_open"
  | "rolling_move"
  | "volume_multiple";

export interface Listing {
  ticker: string;
  name: string;
  venue: Venue;
  base: number;
}

export interface SessionSnapshot {
  name: SessionName;
  label: string;
  asOf: string;
  timezone: "America/New_York";
  clock: string;
  date: string;
}

export interface StoredQuote {
  ticker: string;
  last: number;
  change: number;
  changePercent: number;
  volume: number;
  open: number;
  previousClose: number;
  session: SessionName;
  sessionDate: string;
  asOf: string;
  storedAt: string;
  status: FeedStatus;
}

export interface QuoteView {
  ticker: string;
  name: string;
  venue: Venue;
  last: number;
  change: number;
  changePercent: number;
  volume: number;
  open: number;
  previousClose: number;
  session: SessionName;
  asOf: string;
  storedAt: string;
  status: FeedStatus;
  sinceVisit: number | null;
  sinceVisitPercent: number | null;
  trace: number[];
}

export interface DeskRow {
  ticker: string;
  name: string;
  venue: Venue;
  quote: QuoteView | null;
}

export interface DeskView {
  book: { id: string; name: string } | null;
  session: SessionSnapshot;
  rows: DeskRow[];
  stampedAt: string | null;
  tape: "simulator";
  staleAfterSeconds: number;
}

export interface BookSymbol {
  ticker: string;
  name: string;
  venue: Venue;
  position: number;
}

export interface BookView {
  id: string;
  name: string;
  isOpen: boolean;
  symbols: BookSymbol[];
}

export interface BarView {
  bucket: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SymbolPage {
  listing: Listing;
  session: SessionSnapshot;
  quote: QuoteView | null;
  bars: BarView[];
  tape: "simulator";
}

export interface RuleView {
  id: string;
  ticker: string;
  condition: AlertCondition;
  threshold: number;
  windowMinutes: number | null;
  armed: boolean;
  latched: boolean;
  createdAt: string;
}

export interface EventView {
  id: string;
  ruleId: string;
  ticker: string;
  condition: AlertCondition;
  threshold: number;
  windowMinutes: number | null;
  firedAt: string;
  last: number;
  changePercent: number;
  volume: number;
  session: SessionName;
  asOf: string;
  seen: boolean;
}

export interface MetaView {
  session: SessionSnapshot;
  tape: "simulator";
  unseenEvents: number;
  staleAfterSeconds: number;
  serverTime: string;
}

export interface BarPoint {
  t: number;
  close: number;
  volume: number;
}

export const SESSION_LABEL: Record<SessionName, string> = {
  "pre-market": "Pre-market",
  regular: "Regular",
  "after-hours": "After-hours",
  closed: "Closed",
};

export const CONDITION_LABEL: Record<AlertCondition, string> = {
  price_cross: "Price cross",
  move_from_open: "Move from open",
  rolling_move: "Rolling move",
  volume_multiple: "Volume multiple",
};

export const CONDITIONS: AlertCondition[] = [
  "price_cross",
  "move_from_open",
  "rolling_move",
  "volume_multiple",
];

export const DEFAULT_BOOK_NAME = "Primary";
export const DEFAULT_TICKERS = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "JPM", "XOM"] as const;
