import {
  formatPercent,
  formatPrice,
  formatSignedPrice,
  formatVolume,
  formatWhen,
  SESSION_LABEL,
} from "@atrium/domain";
import { useCallback, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { getSymbol } from "../api";
import { SessionChart } from "../components/Chart";
import { usePolled } from "../hooks/usePolled";

export function SymbolPage() {
  const params = useParams();
  const ticker = (params.ticker ?? "").toUpperCase();
  const valid = /^[A-Z]{1,5}$/.test(ticker);
  const load = useCallback(
    (signal: AbortSignal) => {
      if (!/^[A-Z]{1,5}$/.test(ticker)) {
        return Promise.reject(new DOMException("Skip", "AbortError"));
      }
      return getSymbol(ticker, signal);
    },
    [ticker],
  );
  const page = usePolled(valid ? ticker : "invalid", load, 2000);

  useEffect(() => {
    document.title = valid ? `${ticker} · Atrium` : "Atrium";
  }, [ticker, valid]);

  if (!valid) {
    return (
      <section>
        <h1>Symbol not found</h1>
        <p className="lede">
          <Link to="/">Return to the desk</Link>
        </p>
      </section>
    );
  }

  const data = page.data;
  const quote = data?.quote ?? null;
  const positive = quote ? quote.change >= 0 : true;

  return (
    <section>
      <p className="kicker">{data?.listing.venue ?? "Listing"}</p>
      <div className="page-head">
        <div>
          <h1>{ticker}</h1>
          <p className="lede">{data?.listing.name ?? (page.error ? "Not in the universe." : "Loading the name")}</p>
        </div>
        {quote ? <p className={`feed feed-${quote.status}`}>{quote.status === "live" ? "Live" : quote.status === "delayed" ? "Delayed" : "Stale"}</p> : null}
      </div>
      {page.error ? (
        <p className="form-error" role="alert">
          {page.error}
        </p>
      ) : null}
      {quote ? (
        <>
          <p className={`price ${positive ? "up" : "down"}`}>{formatPrice(quote.last)}</p>
          <p className={`change-line ${quote.change > 0 ? "up" : quote.change < 0 ? "down" : "flat"}`}>
            {formatSignedPrice(quote.change)} · {formatPercent(quote.changePercent)} from the previous close
            {quote.sinceVisit === null
              ? ""
              : ` · ${formatSignedPrice(quote.sinceVisit)} · ${formatPercent(quote.sinceVisitPercent ?? Number.NaN)} since the visit`}
          </p>
          <SessionChart
            bars={data?.bars ?? []}
            previousClose={quote.previousClose}
            ticker={ticker}
            last={quote.last}
            positive={positive}
          />
          <dl className="facts">
            <div>
              <dt>Open</dt>
              <dd className="mono">{formatPrice(quote.open)}</dd>
            </div>
            <div>
              <dt>Previous close</dt>
              <dd className="mono">{formatPrice(quote.previousClose)}</dd>
            </div>
            <div>
              <dt>Volume</dt>
              <dd className="mono">{formatVolume(quote.volume)}</dd>
            </div>
            <div>
              <dt>As of</dt>
              <dd className="mono">{formatWhen(quote.asOf)}</dd>
            </div>
            <div>
              <dt>Session</dt>
              <dd>{SESSION_LABEL[quote.session]}</dd>
            </div>
            <div>
              <dt>Feed</dt>
              <dd>{quote.status === "live" ? "Live" : quote.status === "delayed" ? "Delayed" : "Stale"}</dd>
            </div>
          </dl>
        </>
      ) : page.error ? null : page.ready ? (
        <p className="note">Waiting for the first print.</p>
      ) : (
        <p className="note">Receiving the tape.</p>
      )}
    </section>
  );
}

export function NotFoundPage() {
  return (
    <section>
      <h1>That page is not on the desk</h1>
      <p className="lede">
        <Link to="/">Return to the desk</Link>
      </p>
    </section>
  );
}
