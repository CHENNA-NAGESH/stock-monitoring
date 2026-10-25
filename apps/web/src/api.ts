import type {
  BookView,
  DeskView,
  EventView,
  Listing,
  MetaView,
  RuleView,
  SymbolPage,
} from "@atrium/domain";

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new ApiError("The desk could not reach the API.");
  }
  const text = await response.text();
  let body: { error?: string } = {};
  if (text) {
    try {
      body = JSON.parse(text) as { error?: string };
    } catch {
      throw new ApiError("The desk received an unreadable response.");
    }
  }
  if (!response.ok) throw new ApiError(body.error || `Request failed (${response.status}).`);
  return body as T;
}

export function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export const getMeta = (signal: AbortSignal) => request<MetaView>("/api/meta", { signal });
export const getDesk = (signal: AbortSignal) => request<DeskView>("/api/desk", { signal });
export const getSymbol = (ticker: string, signal: AbortSignal) =>
  request<SymbolPage>(`/api/symbols/${encodeURIComponent(ticker)}`, { signal });
export const getBooks = (signal: AbortSignal) => request<{ books: BookView[] }>("/api/books", { signal });
export const getRules = (signal: AbortSignal) => request<{ rules: RuleView[] }>("/api/rules", { signal });
export const getEvents = (signal: AbortSignal) => request<{ events: EventView[] }>("/api/events", { signal });

export const searchSymbols = (query: string, signal: AbortSignal) =>
  request<{ results: Listing[] }>(`/api/symbols?q=${encodeURIComponent(query)}`, { signal });

export function createBook(name: string) {
  return request<BookView>("/api/books", { method: "POST", body: JSON.stringify({ name }) });
}

export function openBook(id: string) {
  return request<BookView>(`/api/books/${id}`, { method: "PATCH", body: JSON.stringify({ isOpen: true }) });
}

export function removeBook(id: string) {
  return request<{ ok: boolean }>(`/api/books/${id}`, { method: "DELETE" });
}

export function addSymbol(bookId: string, ticker: string) {
  return request<BookView>(`/api/books/${bookId}/symbols`, {
    method: "POST",
    body: JSON.stringify({ ticker }),
  });
}

export function removeSymbol(bookId: string, ticker: string) {
  return request<BookView>(`/api/books/${bookId}/symbols/${encodeURIComponent(ticker)}`, { method: "DELETE" });
}

export function stampVisit() {
  return request<DeskView>("/api/desk/visit", { method: "POST" });
}

export function createRule(input: {
  ticker: string;
  condition: string;
  threshold: number;
  windowMinutes?: number;
}) {
  return request<RuleView>("/api/rules", { method: "POST", body: JSON.stringify(input) });
}

export function setRuleArmed(id: string, armed: boolean) {
  return request<RuleView>(`/api/rules/${id}`, { method: "PATCH", body: JSON.stringify({ armed }) });
}

export function deleteRule(id: string) {
  return request<{ ok: boolean }>(`/api/rules/${id}`, { method: "DELETE" });
}

export function markEventSeen(id: string) {
  return request<EventView>(`/api/events/${id}/seen`, { method: "POST" });
}

export function markAllEventsSeen() {
  return request<{ updated: number }>("/api/events/seen-all", { method: "POST" });
}
