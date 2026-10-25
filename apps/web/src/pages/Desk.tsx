import {
  formatPercent,
  formatPrice,
  formatSignedPrice,
  formatVolume,
  type DeskRow,
} from "@atrium/domain";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getDesk, stampVisit } from "../api";
import { Spark } from "../components/Chart";
import { usePolled } from "../hooks/usePolled";

function direction(value: number | null | undefined): "up" | "down" | "flat" {
  if (value === null || value === undefined || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

function feedLabel(status: string): string {
  if (status === "live") return "Live";
  if (status === "delayed") return "Delayed";
  return "Stale";
}

function summarize(rows: DeskRow[]) {
  let higher = 0;
  let lower = 0;
  let flat = 0;
  let pending = 0;
  let unmeasured = 0;
  for (const row of rows) {
    if (!row.quote) {
      pending += 1;
      continue;
    }
    if (row.quote.sinceVisit === null) {
      unmeasured += 1;
      continue;
    }
    if (row.quote.sinceVisit > 0) higher += 1;
    else if (row.quote.sinceVisit < 0) lower += 1;
    else flat += 1;
  }
  return { higher, lower, flat, pending, unmeasured };
}

export function DeskPage() {
  const desk = usePolled("desk", getDesk, 2000);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Desk · Atrium";
  }, []);

  async function onStamp() {
    setPending(true);
    setFormError(null);
    try {
      await stampVisit();
      await desk.reload();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The visit could not be stamped.");
    } finally {
      setPending(false);
    }
  }

  const data = desk.data;
  const rows = data?.rows ?? [];
  const counts = summarize(rows);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{data?.book?.name ?? "Desk"}</h1>
          <p className="lede">
            {data?.book
              ? `${rows.length} ${rows.length === 1 ? "name" : "names"} in the open book.`
              : "Create a book to start the desk."}
          </p>
        </div>
        {data?.book ? (
          <button type="button" className="button" onClick={() => void onStamp()} disabled={pending}>
            {pending ? "Stamping" : "Stamp visit"}
          </button>
        ) : (
          <Link className="button" to="/books">
            Open books
          </Link>
        )}
      </div>
      {data?.session.name === "closed" ? (
        <p className="note">New York is closed. Prints on this desk are the simulator tape and stay marked Delayed.</p>
      ) : (
        <p className="note">Simulator tape. Prices are generated for the desk, not a licensed feed.</p>
      )}
      {data?.stampedAt ? (
        <p className="summary">
          {counts.higher} higher, {counts.lower} lower, {counts.flat} unchanged since the last visit.
        </p>
      ) : (
        <p className="summary">Stamp a visit to measure the next move.</p>
      )}
      {formError ? (
        <p className="form-error" role="alert">
          {formError}
        </p>
      ) : null}
      {desk.error ? (
        <p className="form-error" role="alert">
          {desk.error}
        </p>
      ) : null}
      {!desk.ready ? <p className="note">Receiving the tape.</p> : null}
      {data?.book && rows.length === 0 ? <p className="note">This book has no symbols.</p> : null}
      {rows.length > 0 ? (
        <div className="table-wrap">
          <table>
            <caption className="sr">Open book, ordered as arranged</caption>
            <thead>
              <tr>
                <th scope="col">Symbol</th>
                <th scope="col">Name</th>
                <th scope="col" className="num">
                  Last
                </th>
                <th scope="col" className="num">
                  Change
                </th>
                <th scope="col" className="num">
                  Since visit
                </th>
                <th scope="col" className="num">
                  Volume
                </th>
                <th scope="col">Feed</th>
                <th scope="col">Trace</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.ticker}>
                  <th scope="row">
                    <Link className="row-link" to={`/symbol/${row.ticker}`}>
                      {row.ticker}
                    </Link>
                  </th>
                  <td>{row.name}</td>
                  <td className="num mono">{row.quote ? formatPrice(row.quote.last) : "—"}</td>
                  <td className={`num mono ${direction(row.quote?.change)}`}>
                    {row.quote ? `${formatSignedPrice(row.quote.change)} · ${formatPercent(row.quote.changePercent)}` : "—"}
                  </td>
                  <td className={`num mono ${direction(row.quote?.sinceVisit)}`}>
                    {row.quote?.sinceVisit === null || row.quote?.sinceVisit === undefined
                      ? "—"
                      : `${formatSignedPrice(row.quote.sinceVisit)} · ${formatPercent(row.quote.sinceVisitPercent ?? Number.NaN)}`}
                  </td>
                  <td className="num mono">{row.quote ? formatVolume(row.quote.volume) : "—"}</td>
                  <td className={row.quote ? `feed feed-${row.quote.status}` : ""}>
                    {row.quote ? feedLabel(row.quote.status) : "Waiting"}
                  </td>
                  <td>
                    <Spark values={row.quote?.trace ?? []} positive={direction(row.quote?.change) !== "down"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
