import { CONDITION_LABEL, CONDITIONS, formatPrice, formatWhen, type AlertCondition } from "@atrium/domain";
import { useEffect, useState, type FormEvent } from "react";
import { createRule, deleteRule, getEvents, getRules, markAllEventsSeen, markEventSeen, setRuleArmed } from "../api";
import { usePolled } from "../hooks/usePolled";

const HELP: Record<AlertCondition, string> = {
  price_cross: "Level in dollars. The rule fires when the last trade crosses it.",
  move_from_open: "Percent from the session open. Use a negative number for a drop.",
  rolling_move: "Percent across the window.",
  volume_multiple: "Multiple of recent volume. Minimum 1.1.",
};

export function AlertsPage() {
  const rules = usePolled("rules", getRules, 2000);
  const events = usePolled("events", getEvents, 2000);
  const [ticker, setTicker] = useState("AAPL");
  const [condition, setCondition] = useState<AlertCondition>("price_cross");
  const [threshold, setThreshold] = useState("");
  const [windowMinutes, setWindowMinutes] = useState("15");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Alerts · Atrium";
  }, []);

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setFormError(null);
    try {
      await action();
      await Promise.all([rules.reload(), events.reload()]);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The alert could not be saved.");
    } finally {
      setPending(false);
    }
  }

  function onCreate(event: FormEvent) {
    event.preventDefault();
    const level = Number(threshold);
    const windowValue = Number(windowMinutes);
    void run(() =>
      createRule({
        ticker,
        condition,
        threshold: level,
        ...(condition === "rolling_move" ? { windowMinutes: windowValue } : {}),
      }),
    );
  }

  const parsed = Number(threshold);
  const unseen = (events.data?.events ?? []).filter((item) => !item.seen).length;

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Alerts</h1>
          <p className="lede">Rules fire once, then wait until the condition clears. Events stay on this desk.</p>
        </div>
        {unseen > 0 ? (
          <button type="button" className="button quiet" disabled={pending} onClick={() => void run(() => markAllEventsSeen())}>
            Mark all seen
          </button>
        ) : null}
      </div>
      <form className="rule-form" onSubmit={onCreate}>
        <label>
          Symbol
          <input value={ticker} onChange={(event) => setTicker(event.target.value)} autoCapitalize="characters" />
        </label>
        <label>
          Condition
          <select value={condition} onChange={(event) => setCondition(event.target.value as AlertCondition)}>
            {CONDITIONS.map((item) => (
              <option key={item} value={item}>
                {CONDITION_LABEL[item]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Threshold
          <input
            inputMode="decimal"
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            placeholder={condition === "price_cross" ? "230" : condition === "volume_multiple" ? "2" : "1.5"}
          />
        </label>
        {condition === "rolling_move" ? (
          <label>
            Window minutes
            <input inputMode="numeric" value={windowMinutes} onChange={(event) => setWindowMinutes(event.target.value)} />
          </label>
        ) : null}
        <button
          className="button"
          type="submit"
          disabled={pending || ticker.trim().length === 0 || threshold.trim().length === 0 || !Number.isFinite(parsed)}
        >
          Arm rule
        </button>
      </form>
      <p className="note">{HELP[condition]}</p>
      {formError ? (
        <p className="form-error" role="alert">
          {formError}
        </p>
      ) : null}
      {rules.error ? (
        <p className="form-error" role="alert">
          {rules.error}
        </p>
      ) : null}
      <h2>Rules</h2>
      {(rules.data?.rules.length ?? 0) === 0 && rules.ready ? <p className="note">No rules armed.</p> : null}
      <ul className="rules">
        {(rules.data?.rules ?? []).map((rule) => (
          <li key={rule.id}>
            <span className="mono">{rule.ticker}</span>
            <span>{CONDITION_LABEL[rule.condition]}</span>
            <span className="mono">
              {rule.condition === "price_cross" ? formatPrice(rule.threshold) : rule.threshold}
              {rule.windowMinutes ? ` · ${rule.windowMinutes}m` : ""}
            </span>
            <span className="faint">{rule.armed ? "Armed" : "Paused"}</span>
            <button
              type="button"
              className="text-button"
              disabled={pending}
              onClick={() => void run(() => setRuleArmed(rule.id, !rule.armed))}
            >
              {rule.armed ? "Pause" : "Arm"}
            </button>
            <button type="button" className="text-button" disabled={pending} onClick={() => void run(() => deleteRule(rule.id))}>
              Delete
            </button>
          </li>
        ))}
      </ul>
      <h2>Events</h2>
      {events.error ? (
        <p className="form-error" role="alert">
          {events.error}
        </p>
      ) : null}
      {(events.data?.events.length ?? 0) === 0 && events.ready ? (
        <p className="note">Armed rules will write events here.</p>
      ) : null}
      <ul className="events">
        {(events.data?.events ?? []).map((event) => (
          <li key={event.id} className={event.seen ? "seen" : "unseen"}>
            <span className="mono">{event.ticker}</span>
            <span>
              {CONDITION_LABEL[event.condition]} {event.condition === "price_cross" ? formatPrice(event.threshold) : event.threshold}
            </span>
            <span className="mono">{formatWhen(event.firedAt)}</span>
            <span className="mono">Last {formatPrice(event.last)}</span>
            <span className="faint">{event.session}</span>
            {event.seen ? (
              <span className="faint">Seen</span>
            ) : (
              <button type="button" className="text-button" disabled={pending} onClick={() => void run(() => markEventSeen(event.id))}>
                Mark seen
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
