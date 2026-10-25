import pg from "pg";

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

export interface Queryable {
  query(text: string, params?: unknown[]): Promise<QueryResult>;
}

export interface Db extends Queryable {
  withClient<T>(fn: (client: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

interface PgQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

function wrap(target: PgQueryable): Queryable {
  return {
    async query(text, params = []) {
      const result = await target.query(text, params);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    },
  };
}

export function createDb(databaseUrl: string): Db {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 4,
    connectionTimeoutMillis: 5_000,
  });
  pool.on("error", (error: Error) => {
    console.error("postgres pool error", error.message);
  });
  return {
    query(text, params) {
      return wrap(pool).query(text, params);
    },
    async withClient(fn) {
      const client = await pool.connect();
      try {
        return await fn(wrap(client));
      } finally {
        client.release();
      }
    },
    close() {
      return pool.end();
    },
  };
}

export async function transaction<T>(db: Db, fn: (client: Queryable) => Promise<T>): Promise<T> {
  return db.withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const value = await fn(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}
