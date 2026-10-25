import { formatPrice, formatWhen, getSession, plotFrame, plotX, plotY, type BarView } from "@atrium/domain";

export function SessionChart({
  bars,
  previousClose,
  ticker,
  last,
  positive,
}: {
  bars: BarView[];
  previousClose: number;
  ticker: string;
  last: number;
  positive: boolean;
}) {
  if (bars.length < 2) {
    return <p className="chart-empty">The trace appears after the first minute of prints.</p>;
  }
  const closes = bars.map((bar) => bar.close);
  const plot = plotFrame([...closes, previousClose], 720, 280, 28);
  const line = closes
    .map((value, index) => `${plotX(plot, index, closes.length).toFixed(2)},${plotY(plot, value).toFixed(2)}`)
    .join(" ");
  const baseline = plotY(plot, previousClose);
  const first = bars[0];
  const end = bars[bars.length - 1];
  if (!first || !end) return null;
  const high = Math.max(...closes);
  const low = Math.min(...closes);

  return (
    <figure className="chart">
      <svg
        viewBox="0 0 720 280"
        role="img"
        aria-label={`${ticker} simulator trace, last ${formatPrice(last)}`}
      >
        <line
          x1={28}
          x2={692}
          y1={baseline}
          y2={baseline}
          className="baseline"
        />
        <polyline points={line} className={positive ? "trace up" : "trace down"} />
        <circle
          cx={plotX(plot, closes.length - 1, closes.length)}
          cy={plotY(plot, closes[closes.length - 1] ?? last)}
          r="3.5"
          className={positive ? "trace-dot up" : "trace-dot down"}
        />
        <text x="28" y="268" className="axis">
          {getSession(new Date(first.bucket)).clock}
        </text>
        <text x="692" y="268" textAnchor="end" className="axis">
          {getSession(new Date(end.bucket)).clock}
        </text>
      </svg>
      <figcaption>
        Simulator trace · high {formatPrice(high)} · low {formatPrice(low)} · previous close {formatPrice(previousClose)} ·{" "}
        {formatWhen(end.bucket)}
      </figcaption>
    </figure>
  );
}

export function Spark({ values, positive }: { values: number[]; positive: boolean }) {
  if (values.length < 2) return <span className="spark spark-empty" aria-hidden="true" />;
  const plot = plotFrame(values, 72, 22, 2);
  const line = values
    .map((value, index) => `${plotX(plot, index, values.length).toFixed(2)},${plotY(plot, value).toFixed(2)}`)
    .join(" ");
  return (
    <svg className="spark" viewBox="0 0 72 22" aria-hidden="true">
      <polyline points={line} className={positive ? "trace up" : "trace down"} />
    </svg>
  );
}
