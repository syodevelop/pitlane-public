export type AdminEnv = {
  ENVIRONMENT: string;
  APP_ORIGIN: string;
  PROJECTIONS?: D1Database;
  WHITELIST_ADMIN_TOKEN?: string;
  WHITELIST_ADMIN_PASSWORD_HASH?: string;
};

const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export const adminDigest = async (value: string) =>
  hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
const equal = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++)
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
};
export async function createAdminPasswordHash(
  password: string,
  salt = crypto.randomUUID().replaceAll("-", ""),
) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const digest = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encoder.encode(salt),
      iterations: 100000,
    },
    key,
    256,
  );
  return `pbkdf2$100000$${salt}$${hex(digest)}`;
}
const validHash = (value: string) =>
  /^pbkdf2\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(value);
const sessionToken = (req: Request) =>
  req.headers
    .get("Cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("pitlane_admin="))
    ?.slice(14);
const cookie = (env: AdminEnv, token = "", age = 0) =>
  `pitlane_admin=${token}; Path=/api/admin/whitelist; HttpOnly; SameSite=Strict; Max-Age=${age}${env.APP_ORIGIN.startsWith("https:") ? "; Secure" : ""}`;
const reply = (value: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });

export async function adminSessionRequest(
  req: Request,
  env: AdminEnv,
  readBody: (req: Request) => Promise<Record<string, unknown>>,
) {
  const path = new URL(req.url).pathname;
  if (
    !["/api/admin/whitelist/login", "/api/admin/whitelist/logout"].includes(
      path,
    )
  )
    return null;
  if (req.method !== "POST")
    return reply({ error: "Method not allowed." }, 405, { Allow: "POST" });
  if (req.headers.get("Origin") !== env.APP_ORIGIN)
    return reply({ error: "Origin not allowed." }, 403);
  const db = env.PROJECTIONS;
  if (!db)
    return reply({ error: "Administration is temporarily unavailable." }, 503);
  if (path.endsWith("/logout")) {
    const token = sessionToken(req);
    if (token)
      await db
        .prepare("DELETE FROM whitelist_admin_sessions WHERE id=?")
        .bind(await adminDigest(token))
        .run();
    return reply({ ok: true }, 200, { "Set-Cookie": cookie(env) });
  }
  const configured = env.WHITELIST_ADMIN_PASSWORD_HASH ?? "";
  if (!validHash(configured))
    return reply(
      { error: "The admin password has not been configured on this server." },
      503,
    );
  const now = Date.now();
  await db.batch([
    db.prepare("DELETE FROM whitelist_rate_limits WHERE expires<?").bind(now),
    db
      .prepare("DELETE FROM whitelist_admin_sessions WHERE expires<?")
      .bind(now),
  ]);
  const key = await adminDigest(
    `admin-login:${req.headers.get("CF-Connecting-IP") || "local"}:${Math.floor(now / 900000)}`,
  );
  const allowed = await db
    .prepare(
      "INSERT INTO whitelist_rate_limits(key,hits,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 WHERE hits<5",
    )
    .bind(key, now + 1800000)
    .run();
  if (!allowed.meta.changes)
    return reply(
      { error: "Too many sign-in attempts. Try again in 15 minutes." },
      429,
      { "Retry-After": "900" },
    );
  const { password } = await readBody(req);
  if (
    typeof password !== "string" ||
    !password ||
    password.length > 256 ||
    !equal(
      await createAdminPasswordHash(password, configured.split("$")[2]),
      configured,
    )
  )
    return reply({ error: "Incorrect password." }, 401);
  const token =
    crypto.randomUUID().replaceAll("-", "") +
    crypto.randomUUID().replaceAll("-", "");
  await db
    .prepare(
      "INSERT INTO whitelist_admin_sessions(id,secret_version,expires) VALUES(?,?,?)",
    )
    .bind(
      await adminDigest(token),
      await adminDigest(configured),
      now + 28800000,
    )
    .run();
  return reply({ ok: true }, 200, { "Set-Cookie": cookie(env, token, 28800) });
}

export async function isWhitelistAdmin(req: Request, env: AdminEnv) {
  // Keep existing localhost fixtures usable. A configured password always disables this shortcut.
  if (
    env.ENVIRONMENT === "local" &&
    !env.WHITELIST_ADMIN_PASSWORD_HASH &&
    !env.WHITELIST_ADMIN_TOKEN &&
    ["127.0.0.1", "localhost", "[::1]"].includes(new URL(req.url).hostname)
  )
    return true;
  const passwordHash = env.WHITELIST_ADMIN_PASSWORD_HASH;
  const token = sessionToken(req);
  if (
    passwordHash &&
    validHash(passwordHash) &&
    token &&
    /^[a-f0-9]{64}$/.test(token) &&
    env.PROJECTIONS
  ) {
    const active = await env.PROJECTIONS.prepare(
      "SELECT id FROM whitelist_admin_sessions WHERE id=? AND secret_version=? AND expires>?",
    )
      .bind(
        await adminDigest(token),
        await adminDigest(passwordHash),
        Date.now(),
      )
      .first();
    if (active) return true;
  }
  // Optional legacy automation token; never use the owner's password as a bearer token.
  const configured = env.WHITELIST_ADMIN_TOKEN;
  const provided = req.headers.get("Authorization")?.replace(/^Bearer /, "");
  return (
    !!configured &&
    configured.length >= 32 &&
    !!provided &&
    provided.length <= 256 &&
    equal(await adminDigest(configured), await adminDigest(provided))
  );
}
