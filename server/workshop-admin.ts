import { isWhitelistAdmin, type AdminEnv } from "./whitelist-admin-auth";
import type { WorkshopPlayerRow } from "../shared/workshop-account";
export async function handleWorkshopPlayers(req: Request, env: AdminEnv) {
  const url = new URL(req.url);
  // Reuse the existing protected admin cookie and its restricted path.
  if (url.pathname !== "/api/admin/whitelist/players") return null;
  const reply = (value: unknown, status = 200) =>
    Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
  if (!(await isWhitelistAdmin(req, env)))
    return reply({ error: "Admin access required." }, 401);
  if (req.method !== "GET") return reply({ error: "Method not allowed." }, 405);
  if (!env.PROJECTIONS)
    return reply({ error: "Player storage is unavailable." }, 503);
  const search = (url.searchParams.get("wallet") || "").toLowerCase().trim();
  if (search && !/^(?:0x)?[a-f0-9]{1,40}$/.test(search))
    return reply({ error: "Enter a wallet address or address fragment." }, 400);
  const offset = Number(url.searchParams.get("offset") || 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1e7)
    return reply({ error: "Invalid page." }, 400);
  const db = env.PROJECTIONS,
    filter = `%${search}%`;
  const [rows, count, stats] = await Promise.all([
    db
      .prepare(
        "SELECT * FROM workshop_players WHERE wallet LIKE ? ORDER BY last_seen DESC,wallet LIMIT 50 OFFSET ?",
      )
      .bind(filter, offset)
      .all<WorkshopPlayerRow>(),
    db
      .prepare(
        "SELECT COUNT(*) AS total FROM workshop_players WHERE wallet LIKE ?",
      )
      .bind(filter)
      .first<{ total: number }>(),
    db
      .prepare(
        "SELECT COUNT(*) AS total,COALESCE(SUM(play_seconds),0) AS playSeconds,COALESCE(SUM(last_seen>=?),0) AS recent FROM workshop_players",
      )
      .bind(Date.now() - 300000)
      .first(),
  ]);
  return reply({
    players: rows.results,
    total: count?.total || 0,
    stats,
    offset,
    limit: 50,
  });
}
