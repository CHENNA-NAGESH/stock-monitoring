import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { searchUniverse } from "@atrium/domain";
import {
  HttpError,
  addSymbol,
  createBook,
  createRule,
  deleteBook,
  deleteRule,
  getDesk,
  getMeta,
  getSymbolPage,
  listBooks,
  listEvents,
  listRules,
  markAllEventsSeen,
  markEventSeen,
  pingDb,
  removeSymbol,
  setRuleArmed,
  stampVisit,
  updateBook,
  type Db,
  type QuoteCache,
} from "@atrium/storage";

export interface AppDeps {
  db: Db;
  cache: QuoteCache;
  staleAfterSeconds: number;
  now?: () => Date;
}

const bookBody = z.object({ name: z.string() });
const bookPatch = z
  .object({
    name: z.string().optional(),
    isOpen: z.boolean().optional(),
  })
  .refine((value) => value.name !== undefined || value.isOpen !== undefined, {
    message: "Provide a name or isOpen.",
  });
const tickerBody = z.object({ ticker: z.string() });
const ruleBody = z.object({
  ticker: z.string(),
  condition: z.string(),
  threshold: z.coerce.number(),
  windowMinutes: z.coerce.number().optional(),
});
const armedBody = z.object({ armed: z.boolean() });

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

function param(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function send(res: Response, status: number, body: unknown) {
  res.status(status).json(body);
}

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));
  const now = () => deps.now?.() ?? new Date();

  app.get("/healthz", (_req, res) => {
    send(res, 200, { ok: true });
  });

  app.get(
    "/readyz",
    wrap(async (_req, res) => {
      const postgres = await pingDb(deps.db);
      const redis = await deps.cache.ping();
      send(res, postgres && redis ? 200 : 503, { ok: postgres && redis, postgres, redis });
    }),
  );

  app.get(
    "/api/meta",
    wrap(async (_req, res) => {
      send(res, 200, await getMeta(deps.db, now(), deps.staleAfterSeconds));
    }),
  );

  app.get(
    "/api/desk",
    wrap(async (_req, res) => {
      send(res, 200, await getDesk(deps.db, deps.cache, now(), deps.staleAfterSeconds));
    }),
  );

  app.post(
    "/api/desk/visit",
    wrap(async (_req, res) => {
      const stamped = now();
      await stampVisit(deps.db, stamped);
      send(res, 200, await getDesk(deps.db, deps.cache, stamped, deps.staleAfterSeconds));
    }),
  );

  app.get(
    "/api/books",
    wrap(async (_req, res) => {
      send(res, 200, { books: await listBooks(deps.db) });
    }),
  );

  app.post(
    "/api/books",
    wrap(async (req, res) => {
      const body = bookBody.parse(req.body);
      send(res, 201, await createBook(deps.db, body.name));
    }),
  );

  app.patch(
    "/api/books/:id",
    wrap(async (req, res) => {
      const body = bookPatch.parse(req.body);
      const id = param(req.params.id);
      if (!id) throw new HttpError(400, "Book not found.");
      send(res, 200, await updateBook(deps.db, id, body));
    }),
  );

  app.delete(
    "/api/books/:id",
    wrap(async (req, res) => {
      const id = param(req.params.id);
      if (!id) throw new HttpError(400, "Book not found.");
      await deleteBook(deps.db, id);
      send(res, 200, { ok: true });
    }),
  );

  app.post(
    "/api/books/:id/symbols",
    wrap(async (req, res) => {
      const id = param(req.params.id);
      if (!id) throw new HttpError(400, "Book not found.");
      const body = tickerBody.parse(req.body);
      send(res, 201, await addSymbol(deps.db, id, body.ticker));
    }),
  );

  app.delete(
    "/api/books/:id/symbols/:ticker",
    wrap(async (req, res) => {
      const id = param(req.params.id);
      const ticker = param(req.params.ticker);
      if (!id || !ticker) throw new HttpError(400, "Book not found.");
      send(res, 200, await removeSymbol(deps.db, id, ticker));
    }),
  );

  app.get("/api/symbols", (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q : "";
    send(res, 200, { results: searchUniverse(query) });
  });

  app.get(
    "/api/symbols/:ticker",
    wrap(async (req, res) => {
      const ticker = param(req.params.ticker);
      if (!ticker) throw new HttpError(400, "Symbol not found.");
      const page = await getSymbolPage(deps.db, deps.cache, ticker, now(), deps.staleAfterSeconds);
      if (!page) throw new HttpError(404, "Symbol not found.");
      send(res, 200, page);
    }),
  );

  app.get(
    "/api/rules",
    wrap(async (_req, res) => {
      send(res, 200, { rules: await listRules(deps.db) });
    }),
  );

  app.post(
    "/api/rules",
    wrap(async (req, res) => {
      const body = ruleBody.parse(req.body);
      send(res, 201, await createRule(deps.db, body));
    }),
  );

  app.patch(
    "/api/rules/:id",
    wrap(async (req, res) => {
      const id = param(req.params.id);
      if (!id) throw new HttpError(400, "Rule not found.");
      const body = armedBody.parse(req.body);
      send(res, 200, await setRuleArmed(deps.db, id, body.armed));
    }),
  );

  app.delete(
    "/api/rules/:id",
    wrap(async (req, res) => {
      const id = param(req.params.id);
      if (!id) throw new HttpError(400, "Rule not found.");
      await deleteRule(deps.db, id);
      send(res, 200, { ok: true });
    }),
  );

  app.get(
    "/api/events",
    wrap(async (_req, res) => {
      send(res, 200, { events: await listEvents(deps.db) });
    }),
  );

  app.post(
    "/api/events/seen-all",
    wrap(async (_req, res) => {
      send(res, 200, { updated: await markAllEventsSeen(deps.db) });
    }),
  );

  app.post(
    "/api/events/:id/seen",
    wrap(async (req, res) => {
      const id = param(req.params.id);
      if (!id) throw new HttpError(400, "Event not found.");
      send(res, 200, await markEventSeen(deps.db, id));
    }),
  );

  app.use("/api", (_req, res) => {
    send(res, 404, { error: "Not found." });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      send(res, error.status, { error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      send(res, 400, { error: error.issues[0]?.message ?? "Check the form and try again." });
      return;
    }
    if (error instanceof SyntaxError && "body" in error) {
      send(res, 400, { error: "The request body was not valid JSON." });
      return;
    }
    console.error(error);
    send(res, 500, { error: "The desk could not complete that request." });
  });

  return app;
}
