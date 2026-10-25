import { useEffect, useState, type FormEvent } from "react";
import { addSymbol, createBook, getBooks, openBook, removeBook, removeSymbol } from "../api";
import { usePolled } from "../hooks/usePolled";

export function BooksPage() {
  const books = usePolled("books", getBooks, 2000);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [symbolDrafts, setSymbolDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    document.title = "Books · Atrium";
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    try {
      await createBook(name);
      setName("");
      await books.reload();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The book could not be created.");
    } finally {
      setPending(false);
    }
  }

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setFormError(null);
    try {
      await action();
      await books.reload();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The book could not be updated.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Books</h1>
          <p className="lede">One book stays open on the desk. Add names from the universe.</p>
        </div>
      </div>
      <form className="inline-form" onSubmit={(event) => void onCreate(event)}>
        <label htmlFor="book-name">New book</label>
        <input
          id="book-name"
          value={name}
          maxLength={40}
          onChange={(event) => setName(event.target.value)}
          placeholder="Overnight"
        />
        <button className="button" type="submit" disabled={pending || name.trim().length === 0}>
          Create book
        </button>
      </form>
      {formError ? (
        <p className="form-error" role="alert">
          {formError}
        </p>
      ) : null}
      {books.error ? (
        <p className="form-error" role="alert">
          {books.error}
        </p>
      ) : null}
      <div className="stack">
        {(books.data?.books ?? []).map((book) => (
          <article key={book.id} className="book">
            <div className="book-head">
              <h2>
                {book.name}
                {book.isOpen ? <span className="open-mark">Open</span> : null}
              </h2>
              <div className="actions">
                {book.isOpen ? null : (
                  <button type="button" className="button quiet" disabled={pending} onClick={() => void run(() => openBook(book.id))}>
                    Make open
                  </button>
                )}
                {confirmId === book.id ? (
                  <>
                    <button
                      type="button"
                      className="button danger"
                      disabled={pending}
                      onClick={() =>
                        void run(async () => {
                          await removeBook(book.id);
                          setConfirmId(null);
                        })
                      }
                    >
                      Confirm delete
                    </button>
                    <button type="button" className="button quiet" onClick={() => setConfirmId(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button type="button" className="button quiet" onClick={() => setConfirmId(book.id)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
            {book.symbols.length === 0 ? <p className="note">No symbols yet.</p> : null}
            <ul className="symbols">
              {book.symbols.map((symbol) => (
                <li key={symbol.ticker}>
                  <span className="mono">{symbol.ticker}</span>
                  <span>{symbol.name}</span>
                  <span className="faint">{symbol.venue}</span>
                  <button
                    type="button"
                    className="text-button"
                    disabled={pending}
                    onClick={() => void run(() => removeSymbol(book.id, symbol.ticker))}
                  >
                    Remove {symbol.ticker}
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                const ticker = symbolDrafts[book.id] ?? "";
                void run(async () => {
                  await addSymbol(book.id, ticker);
                  setSymbolDrafts((current) => ({ ...current, [book.id]: "" }));
                });
              }}
            >
              <label htmlFor={`add-${book.id}`}>Add symbol</label>
              <input
                id={`add-${book.id}`}
                value={symbolDrafts[book.id] ?? ""}
                onChange={(event) => setSymbolDrafts((current) => ({ ...current, [book.id]: event.target.value }))}
                placeholder="AAPL"
                autoCapitalize="characters"
              />
              <button className="button quiet" type="submit" disabled={pending || (symbolDrafts[book.id] ?? "").trim().length === 0}>
                Add
              </button>
            </form>
          </article>
        ))}
      </div>
    </section>
  );
}
