export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

export function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Expected a number from Postgres.");
  return parsed;
}

export function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected text from Postgres.");
  return value;
}

export function flag(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

export function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  throw new Error("Expected a timestamp from Postgres.");
}

export function nullableIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return iso(value);
}
