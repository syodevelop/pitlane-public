import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { handleWhitelist } from "../server/whitelist";

// Real SQLite executes the migration and every handler query without touching player data.
export function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync("migrations/0002_whitelist.sql", "utf8"));
  sql.exec(readFileSync("migrations/0003_whitelist_admin.sql", "utf8"));
  const prepare = (query: string, values: SQLInputValue[] = []) => ({
    bind: (...args: SQLInputValue[]) => prepare(query, args),
    first: async () => sql.prepare(query).get(...values) ?? null,
    all: async () => ({
      results: sql.prepare(query).all(...values),
      success: true,
    }),
    run: async () => ({
      success: true,
      meta: sql.prepare(query).run(...values),
    }),
  });
  const db = {
    prepare,
    batch: async (items: ReturnType<typeof prepare>[]) =>
      Promise.all(items.map((item) => item.run())),
  } as unknown as D1Database;
  const env = {
    ENVIRONMENT: "local",
    APP_ORIGIN: "http://127.0.0.1:5173",
    PROJECTIONS: db,
  };
  const run = (req: Request, override = {}) =>
    handleWhitelist(
      req,
      { ...env, ...override },
      (req) => req.json() as Promise<Record<string, unknown>>,
    );
  return { sql, run, env };
}
export const links = {
  follow: "https://x.com/pitlane_fixture",
  like: "https://x.com/pitlane_fixture/status/123",
  repost: "https://x.com/pitlane_fixture/status/123",
  quote: "https://x.com/pitlane_fixture/status/123",
};
