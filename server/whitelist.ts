import { isAddress } from "viem";
import {
  adminSessionRequest,
  isWhitelistAdmin,
  type AdminEnv,
} from "./whitelist-admin-auth";
import {
  WHITELIST_TASKS,
  validCampaignLink,
  postIntentLinks,
  type WhitelistConfig,
  type WhitelistLinks,
} from "../shared/whitelist";

type Env = AdminEnv;
type Session = {
  id: string;
  revision: number;
  mask: number;
  expires: number;
  application_id: string | null;
};
const reply = (value: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
const fail = (error: string, status = 400) => reply({ error }, status);
const cookieToken = (req: Request) =>
  req.headers
    .get("Cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("pitlane_whitelist="))
    ?.slice(18);

async function config(db: D1Database): Promise<WhitelistConfig> {
  const row = await db
    .prepare("SELECT revision,state,links FROM whitelist_config WHERE id=1")
    .first<{ revision: number; state: "closed" | "open"; links: string }>();
  if (!row) throw new Error("Whitelist storage unavailable");
  return {
    revision: row.revision,
    state: row.state,
    links: JSON.parse(row.links) as WhitelistLinks,
  };
}
async function session(req: Request, db: D1Database) {
  const token = cookieToken(req);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return db
    .prepare("SELECT * FROM whitelist_sessions WHERE id=? AND expires>?")
    .bind(await hash(token), Date.now())
    .first<Session>();
}
async function rateLimit(req: Request, db: D1Database) {
  const now = Date.now(),
    window = Math.floor(now / 600000);
  const key = await hash(
    `whitelist:${req.headers.get("CF-Connecting-IP") || "local"}:${window}`,
  );
  const result = await db
    .prepare(
      "INSERT INTO whitelist_rate_limits(key,hits,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 WHERE hits<120",
    )
    .bind(key, now + 1200000)
    .run();
  return result.meta.changes > 0;
}

async function exportApplications(db: D1Database): Promise<Response> {
  // Capture the last inserted row before streaming. Later applications belong
  // to the next export; the admin table's 100-row limit does not apply here.
  const snapshot = await db
    .prepare("SELECT MAX(rowid) AS last_row FROM whitelist_applications")
    .first<{ last_row: number | null }>();
  let cursor = snapshot?.last_row ?? 0;
  const encoder = new TextEncoder();
  const cell = (value: string) =>
    `"${(/^[=+\-@\t\r\n]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("handle,wallet\r\n"));
    },
    async pull(controller) {
      if (cursor <= 0) {
        controller.close();
        return;
      }
      const batch = await db
        .prepare(
          "SELECT rowid AS export_row,handle,wallet FROM whitelist_applications WHERE rowid<=? ORDER BY rowid DESC LIMIT 500",
        )
        .bind(cursor)
        .all<{ export_row: number; handle: string; wallet: string }>();
      const rows = batch.results;
      if (rows.length) {
        cursor = rows[rows.length - 1].export_row - 1;
        controller.enqueue(
          encoder.encode(
            rows
              .map((row) => `${cell(row.handle)},${cell(row.wallet)}\r\n`)
              .join(""),
          ),
        );
      }
      if (rows.length < 500 || cursor <= 0) controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="pitlane-whitelist.csv"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function handleWhitelist(
  req: Request,
  env: Env,
  readBody: (req: Request) => Promise<Record<string, unknown>>,
): Promise<Response | null> {
  const path = new URL(req.url).pathname;
  if (
    !path.startsWith("/api/whitelist/") &&
    !path.startsWith("/api/admin/whitelist/")
  )
    return null;
  const admin = path.startsWith("/api/admin/");
  if (admin) {
    const authResponse = await adminSessionRequest(req, env, readBody);
    if (authResponse) return authResponse;
  }
  if (admin && !(await isWhitelistAdmin(req, env)))
    return fail("Admin access required.", 401);
  if (req.method !== "GET" && req.headers.get("Origin") !== env.APP_ORIGIN)
    return fail("Origin not allowed.", 403);
  const db = env.PROJECTIONS;
  if (!db)
    return fail(
      "Applications are temporarily unavailable. Please try again later.",
      503,
    );
  if (!["GET", "POST"].includes(req.method))
    return fail("Method not allowed.", 405);

  if (admin) {
    if (path === "/api/admin/whitelist/config") {
      if (req.method === "GET")
        return reply({
          config: await config(db),
          local: env.ENVIRONMENT === "local",
        });
      const data = await readBody(req);
      if (
        !["open", "closed"].includes(String(data.state)) ||
        !Number.isSafeInteger(data.revision)
      )
        return fail("Invalid campaign settings.");
      let incoming = data.links as Record<string, unknown> | null;
      if ("postId" in data) {
        const intents = postIntentLinks(data.postId);
        if (!intents && !(data.state === "closed" && data.postId === ""))
          return fail("Enter a valid X post ID or post URL.");
        incoming = {
          follow: data.followUrl,
          ...(intents ?? { like: "", repost: "", quote: "" }),
        };
      }
      const links: Partial<WhitelistLinks> = {};
      for (const task of WHITELIST_TASKS) {
        const value = incoming?.[task.id];
        if (typeof value !== "string" || (value && !validCampaignLink(value)))
          return fail(`Enter a valid X link for ${task.id}.`);
        if (data.state === "open" && !value)
          return fail("Set all four task links before opening applications.");
        links[task.id] = value;
      }
      const result = await db
        .prepare(
          "UPDATE whitelist_config SET revision=revision+1,state=?,links=?,updated_at=? WHERE id=1 AND revision=?",
        )
        .bind(data.state, JSON.stringify(links), Date.now(), data.revision)
        .run();
      if (!result.meta.changes)
        return fail(
          "Settings changed in another tab. Reload before saving.",
          409,
        );
      return reply({ config: await config(db) });
    }
    if (
      path === "/api/admin/whitelist/applications.csv" &&
      req.method === "GET"
    )
      return exportApplications(db);
    if (path === "/api/admin/whitelist/applications" && req.method === "GET") {
      const rows = await db
        .prepare(
          "SELECT id,wallet,handle,reason,revision,created_at FROM whitelist_applications ORDER BY created_at DESC,id DESC LIMIT 100",
        )
        .all();
      const count = await db
        .prepare("SELECT COUNT(*) AS total FROM whitelist_applications")
        .first<{ total: number }>();
      return reply({ applications: rows.results, total: count?.total ?? 0 });
    }
    return fail("Not found.", 404);
  }

  if (!(await rateLimit(req, db)))
    return reply(
      { error: "Too many requests. Please try again in a few minutes." },
      429,
      { "Retry-After": "600" },
    );
  const current = await config(db);
  if (path === "/api/whitelist/config" && req.method === "GET") {
    let visitor = await session(req, db);
    const headers: Record<string, string> = {};
    if (!visitor) {
      await db.batch([
        db
          .prepare("DELETE FROM whitelist_sessions WHERE expires<?")
          .bind(Date.now()),
        db
          .prepare("DELETE FROM whitelist_rate_limits WHERE expires<?")
          .bind(Date.now()),
      ]);
      const token =
        crypto.randomUUID().replaceAll("-", "") +
        crypto.randomUUID().replaceAll("-", "");
      visitor = {
        id: await hash(token),
        revision: current.revision,
        mask: 0,
        expires: Date.now() + 86400000,
        application_id: null,
      };
      await db
        .prepare(
          "INSERT INTO whitelist_sessions(id,revision,mask,expires) VALUES(?,?,0,?)",
        )
        .bind(visitor.id, visitor.revision, visitor.expires)
        .run();
      headers["Set-Cookie"] =
        `pitlane_whitelist=${token}; Path=/api/whitelist; HttpOnly; SameSite=Strict; Max-Age=86400${env.APP_ORIGIN.startsWith("https:") ? "; Secure" : ""}`;
    }
    const mask = visitor.revision === current.revision ? visitor.mask : 0;
    return reply(
      {
        ...current,
        completed: WHITELIST_TASKS.filter(
          (_, index) => mask & (1 << index),
        ).map((task) => task.id),
        receipt: visitor.application_id,
        localPreview: env.ENVIRONMENT === "local",
      },
      200,
      headers,
    );
  }
  if (req.method !== "POST") return fail("Not found.", 404);
  const data = await readBody(req);
  if (data.revision !== current.revision)
    return fail("The campaign has changed. Reload this page to continue.", 409);
  if (
    current.state !== "open" ||
    !WHITELIST_TASKS.every((task) => validCampaignLink(current.links[task.id]))
  )
    return fail("Whitelist applications are not open yet.", 409);
  const visitor = await session(req, db);
  if (!visitor)
    return fail("Your application session expired. Reload and try again.", 401);
  if (path === "/api/whitelist/checkpoint") {
    const index = WHITELIST_TASKS.findIndex((task) => task.id === data.task);
    if (index < 0) return fail("Unknown task.");
    // A recorded click completes a checkpoint. This is deliberately not X verification.
    await db
      .prepare(
        "UPDATE whitelist_sessions SET mask=(CASE WHEN revision=? THEN mask ELSE 0 END) | ?,revision=? WHERE id=?",
      )
      .bind(current.revision, 1 << index, current.revision, visitor.id)
      .run();
    const saved = await session(req, db);
    return reply({
      completed: WHITELIST_TASKS.filter((_, i) => saved!.mask & (1 << i)).map(
        (task) => task.id,
      ),
    });
  }
  if (path === "/api/whitelist/applications") {
    if (visitor.application_id)
      return reply({ receipt: visitor.application_id }, 200);
    if (visitor.revision !== current.revision || visitor.mask !== 15)
      return fail("Open all four task links before submitting.", 409);
    const wallet = typeof data.wallet === "string" ? data.wallet.trim() : "";
    const handle =
      typeof data.handle === "string"
        ? data.handle.trim().replace(/^@/, "").toLowerCase()
        : "";
    const reason = typeof data.reason === "string" ? data.reason.trim() : "";
    if (!isAddress(wallet) || /^0x0{40}$/i.test(wallet))
      return fail("Enter a valid Ethereum wallet address.");
    if (!/^[a-z0-9_]{1,15}$/.test(handle))
      return fail("Enter your X handle, not a profile link.");
    if (reason.length > 500)
      return fail("Keep your answer to 500 characters or fewer.");
    if (data.website) return fail("Could not submit this application.");
    const id = crypto.randomUUID();
    const inserted = await db
      .prepare(
        "INSERT OR IGNORE INTO whitelist_applications(id,session_id,wallet,handle,reason,revision,links,created_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        visitor.id,
        wallet.toLowerCase(),
        handle,
        reason,
        current.revision,
        JSON.stringify(current.links),
        Date.now(),
      )
      .run();
    const existing = await db
      .prepare("SELECT id FROM whitelist_applications WHERE session_id=?")
      .bind(visitor.id)
      .first<{ id: string }>();
    if (!existing)
      return fail("This wallet or X account already has an application.", 409);
    await db
      .prepare("UPDATE whitelist_sessions SET application_id=? WHERE id=?")
      .bind(existing.id, visitor.id)
      .run();
    await db.batch([
      db
        .prepare("DELETE FROM whitelist_sessions WHERE expires<?")
        .bind(Date.now()),
      db
        .prepare("DELETE FROM whitelist_rate_limits WHERE expires<?")
        .bind(Date.now()),
    ]);
    return reply({ receipt: existing.id }, inserted.meta.changes ? 201 : 200);
  }
  return fail("Not found.", 404);
}
