import { randomUUID } from "node:crypto";
import {
  decideRule,
  validateRule,
  type AlertCondition,
  type BarPoint,
  type EventView,
  type RuleView,
  type SessionName,
  type StoredQuote,
} from "@atrium/domain";
import type { Queryable } from "./db.js";
import { HttpError, flag, iso, num, text } from "./parse.js";

interface ArmedRule {
  id: string;
  ticker: string;
  condition: AlertCondition;
  threshold: number;
  windowMinutes: number | null;
  latched: boolean;
}

function ruleFromRow(row: Record<string, unknown>): RuleView {
  return {
    id: text(row.id),
    ticker: text(row.ticker),
    condition: text(row.condition) as AlertCondition,
    threshold: num(row.threshold),
    windowMinutes: row.window_minutes === null || row.window_minutes === undefined ? null : num(row.window_minutes),
    armed: flag(row.armed),
    latched: flag(row.latched),
    createdAt: iso(row.created_at),
  };
}

export async function listRules(db: Queryable): Promise<RuleView[]> {
  const result = await db.query("SELECT * FROM rules ORDER BY created_at DESC");
  return result.rows.map(ruleFromRow);
}

export async function createRule(
  db: Queryable,
  input: { ticker: string; condition: string; threshold: number; windowMinutes?: number | null },
): Promise<RuleView> {
  const validated = validateRule(input);
  if (!validated.ok) throw new HttpError(400, validated.error);
  const id = randomUUID();
  await db.query(
    `INSERT INTO rules (id, ticker, condition, threshold, window_minutes, armed, latched)
     VALUES ($1, $2, $3, $4, $5, TRUE, FALSE)`,
    [id, validated.rule.ticker, validated.rule.condition, validated.rule.threshold, validated.rule.windowMinutes],
  );
  const result = await db.query("SELECT * FROM rules WHERE id = $1", [id]);
  const row = result.rows[0];
  if (!row) throw new Error("Rule insert did not persist.");
  return ruleFromRow(row);
}

export async function setRuleArmed(db: Queryable, id: string, armed: boolean): Promise<RuleView> {
  const result = await db.query("UPDATE rules SET armed = $2 WHERE id = $1 RETURNING *", [id, armed]);
  const row = result.rows[0];
  if (!row) throw new HttpError(404, "Rule not found.");
  return ruleFromRow(row);
}

export async function deleteRule(db: Queryable, id: string): Promise<void> {
  const result = await db.query("DELETE FROM rules WHERE id = $1", [id]);
  if (result.rowCount === 0) throw new HttpError(404, "Rule not found.");
}

function eventFromRow(row: Record<string, unknown>): EventView {
  return {
    id: text(row.id),
    ruleId: text(row.rule_id),
    ticker: text(row.ticker),
    condition: text(row.condition) as AlertCondition,
    threshold: num(row.threshold),
    windowMinutes: row.window_minutes === null || row.window_minutes === undefined ? null : num(row.window_minutes),
    firedAt: iso(row.fired_at),
    last: num(row.last),
    changePercent: num(row.change_percent),
    volume: num(row.volume),
    session: text(row.session) as SessionName,
    asOf: iso(row.as_of),
    seen: flag(row.seen),
  };
}

export async function listEvents(db: Queryable): Promise<EventView[]> {
  const result = await db.query(
    `SELECT e.id, e.rule_id, e.fired_at, e.last, e.change_percent, e.volume, e.session, e.as_of, e.seen,
            r.ticker, r.condition, r.threshold, r.window_minutes
     FROM events e
     JOIN rules r ON r.id = e.rule_id
     ORDER BY e.fired_at DESC
     LIMIT 100`,
  );
  return result.rows.map(eventFromRow);
}

export async function markEventSeen(db: Queryable, id: string): Promise<EventView> {
  const result = await db.query("UPDATE events SET seen = TRUE WHERE id = $1 RETURNING id", [id]);
  if (result.rowCount === 0) throw new HttpError(404, "Event not found.");
  const events = await listEvents(db);
  const event = events.find((item) => item.id === id);
  if (!event) throw new HttpError(404, "Event not found.");
  return event;
}

export async function markAllEventsSeen(db: Queryable): Promise<number> {
  const result = await db.query("UPDATE events SET seen = TRUE WHERE seen = FALSE");
  return result.rowCount;
}

async function loadArmedRules(db: Queryable): Promise<ArmedRule[]> {
  const result = await db.query(
    "SELECT id, ticker, condition, threshold, window_minutes, latched FROM rules WHERE armed = TRUE",
  );
  return result.rows.map((row) => ({
    id: text(row.id),
    ticker: text(row.ticker),
    condition: text(row.condition) as AlertCondition,
    threshold: num(row.threshold),
    windowMinutes: row.window_minutes === null || row.window_minutes === undefined ? null : num(row.window_minutes),
    latched: flag(row.latched),
  }));
}

export async function evaluateTick(
  db: Queryable,
  steps: { quote: StoredQuote; previousLast: number }[],
  bars: Map<string, BarPoint[]>,
  now: Date,
): Promise<number> {
  const rules = await loadArmedRules(db);
  let fired = 0;
  for (const rule of rules) {
    const step = steps.find((item) => item.quote.ticker === rule.ticker);
    if (!step) continue;
    const decision = decideRule({
      condition: rule.condition,
      threshold: rule.threshold,
      windowMinutes: rule.windowMinutes,
      latched: rule.latched,
      last: step.quote.last,
      previousLast: step.previousLast,
      open: step.quote.open,
      volume: step.quote.volume,
      bars: bars.get(rule.ticker) ?? [],
      nowMs: now.getTime(),
    });
    if (decision.fire) {
      await db.query(
        `INSERT INTO events (id, rule_id, fired_at, last, change_percent, volume, session, as_of, seen)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)`,
        [
          randomUUID(),
          rule.id,
          now.toISOString(),
          step.quote.last,
          step.quote.changePercent,
          step.quote.volume,
          step.quote.session,
          step.quote.asOf,
        ],
      );
      fired += 1;
    }
    if (decision.latched !== rule.latched) {
      await db.query("UPDATE rules SET latched = $2 WHERE id = $1", [rule.id, decision.latched]);
    }
  }
  return fired;
}
