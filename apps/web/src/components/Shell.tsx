import { getSession, searchUniverse, type SessionSnapshot } from "@atrium/domain";
import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { getMeta } from "../api";
import { usePolled } from "../hooks/usePolled";

export function Shell() {
  const meta = usePolled("meta", getMeta, 2000);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const session = getSession(now);
  const unseen = meta.data?.unseenEvents ?? 0;

  return (
    <div className="app">
      <a className="skip" href="#content">
        Skip to the desk
      </a>
      <header className="topbar">
        <Link to="/" className="wordmark">
          Atrium
        </Link>
        <Command />
        <SessionReadout session={session} tape={meta.data ? "Simulator tape" : "Connecting"} />
      </header>
      <nav className="nav" aria-label="Desk">
        <NavLink to="/" end className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          Desk
        </NavLink>
        <NavLink to="/books" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          Books
        </NavLink>
        <NavLink to="/alerts" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          Alerts
          {unseen > 0 ? <span className="badge">{unseen}</span> : null}
        </NavLink>
      </nav>
      {meta.error ? (
        <p className="banner" role="status">
          {meta.error}
        </p>
      ) : null}
      <main id="content" className="page">
        <Outlet />
      </main>
    </div>
  );
}

function SessionReadout({ session, tape }: { session: SessionSnapshot; tape: string }) {
  return (
    <p className={`session session-${session.name}`}>
      <span className="dot" aria-hidden="true" />
      <strong>{session.label}</strong>
      <span className="mono">{session.clock} ET</span>
      <span className="tape">{tape}</span>
    </p>
  );
}

function Command() {
  const navigate = useNavigate();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const results = searchUniverse(query, 6);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function go(ticker: string) {
    setQuery("");
    setOpen(false);
    setError(null);
    navigate(`/symbol/${ticker}`);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const chosen = results[active];
    if (chosen) {
      go(chosen.ticker);
      return;
    }
    const exact = searchUniverse(query, 1).find((listing) => listing.ticker === query.trim().toUpperCase());
    if (exact) {
      go(exact.ticker);
      return;
    }
    setError("Not in the universe.");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <form className="command" role="search" onSubmit={onSubmit}>
      <label className="sr" htmlFor="symbol-jump">
        Jump to a symbol
      </label>
      <input
        id="symbol-jump"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder="Jump to a symbol"
        value={query}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setError(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
      />
      {error ? (
        <p className="command-error" role="status">
          {error}
        </p>
      ) : null}
      {open && results.length > 0 ? (
        <ul id={listId} role="listbox" className="command-list">
          {results.map((listing, index) => (
            <li key={listing.ticker} role="option" aria-selected={index === active}>
              <button
                type="button"
                className={index === active ? "command-option active" : "command-option"}
                onMouseDown={(event) => {
                  event.preventDefault();
                  go(listing.ticker);
                }}
              >
                <span className="mono">{listing.ticker}</span>
                <span>{listing.name}</span>
                <span className="faint">{listing.venue}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
