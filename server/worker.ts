import { DurableObject } from "cloudflare:workers";
import { getAddress, isAddress, verifyMessage, type Hex } from "viem";
import { createSiweMessage } from "viem/siwe";
import {
  parseCommandEnvelope,
  ProtocolError,
  SCHEMA_VERSION,
  errorCode,
  commandFingerprint,
} from "../packages/protocol";
import { releaseCapabilities, type ReleaseConfig } from "../shared/release";
import localRelease from "../config/local.json";
import stagingRelease from "../config/staging.json";
import productionRelease from "../config/production.json";
import {
  settle as settleLegacy,
  type State as LegacyState,
} from "../shared/game";
import {
  BALANCE_VERSION,
  execute,
  RuleError as GameError,
  settle,
  type Garage,
  type Command,
} from "../packages/game-core";
import { PlayerRepository } from "./player-repository";
import { PlayerDelivery, deliverPlayerEvents } from "./player-delivery";
import { PlayerActivity } from "./player-activity";
import { publicSite, unavailableDocument } from "./public-document";
import { secureSiteResponse } from "./site-security";
import { handleWhitelist } from "./whitelist";
import { publicWalletConfig } from "../shared/wallet-config";
import { WorkshopAccounts, WorkshopConflict } from "./workshop-account";
import { handleWorkshopPlayers } from "./workshop-admin";
import {
  accountBindingMatches,
  CHALLENGE_MS,
  LOGIN_STATEMENT,
  sessionContext,
  validLoginContext,
} from "./auth-context";

interface Env {
  PLAYERS: DurableObjectNamespace<PlayerDO>;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  APP_ORIGIN: string;
  CHAIN_ID: string;
  PROJECTIONS?: D1Database;
  WHITELIST_ADMIN_TOKEN?: string;
  WHITELIST_ADMIN_PASSWORD_HASH?: string;
}
const SESSION_MS = 12 * 60 * 60 * 1000;
const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(
    {
      ...(data as Record<string, unknown>),
      schemaVersion: SCHEMA_VERSION,
      ...(status >= 400 ? { code: errorCode(status) } : {}),
    },
    {
      status,
      headers: { "Cache-Control": "no-store", ...headers },
    },
  );
const reply = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) => ({ data, status, headers });
const fromRpc = async (result: Promise<ReturnType<typeof reply>>) => {
  const r = await result;
  return json(r.data, r.status, r.headers);
};
const random = () => crypto.randomUUID().replaceAll("-", "");
const digest = async (s: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
function cookie(req: Request, key: string) {
  return req.headers
    .get("Cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${key}=`))
    ?.slice(key.length + 1);
}
function sessionCookie(value: string, origin: string, age = 43200) {
  return `pitlane_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${origin.startsWith("https:") ? "; Secure" : ""}`;
}
async function body(req: Request): Promise<Record<string, unknown>> {
  if (!req.headers.get("Content-Type")?.startsWith("application/json"))
    throw new GameError("Expected JSON.");
  if (!req.body) throw new ProtocolError("Expected JSON body.");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    length += next.value.byteLength;
    if (length > 8192) {
      await reader.cancel();
      throw new ProtocolError("Request too large.");
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  try {
    const b: unknown = JSON.parse(text);
    if (!b || typeof b !== "object" || Array.isArray(b)) throw 0;
    return b as Record<string, unknown>;
  } catch {
    throw new GameError("Invalid JSON.");
  }
}

export class PlayerDO extends DurableObject<Env> {
  private repository: PlayerRepository;
  private delivery: PlayerDelivery;
  private activity: PlayerActivity;
  private workshop: WorkshopAccounts;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS player (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)`,
    );
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS auth (id INTEGER PRIMARY KEY CHECK(id=1), message TEXT NOT NULL, expires INTEGER NOT NULL, last_challenge INTEGER NOT NULL)`,
    );
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL)`,
    );
    if (
      !ctx.storage.sql
        .exec<{ name: string }>("PRAGMA table_info(sessions)")
        .toArray()
        .some((column) => column.name === "context")
    )
      ctx.storage.sql.exec("ALTER TABLE sessions ADD COLUMN context TEXT");
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, payload TEXT NOT NULL)`,
    );
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, at INTEGER NOT NULL, text TEXT NOT NULL)`,
    );
    this.repository = new PlayerRepository(ctx.storage.sql);
    this.delivery = new PlayerDelivery(ctx.storage.sql);
    this.activity = new PlayerActivity(ctx.storage.sql);
    this.workshop = new WorkshopAccounts(ctx.storage.sql);
  }
  private context(g: Garage) {
    return {
      now: Date.now(),
      seed: g.progress.seed,
      balanceVersion: BALANCE_VERSION,
    };
  }
  private sessionExpires(hash: string) {
    return this.ctx.storage.sql
      .exec<{ expires: number }>(
        "SELECT expires FROM sessions WHERE hash=? AND context=?",
        hash,
        sessionContext(this.env),
      )
      .toArray()
      .find((s) => s.expires > Date.now())?.expires;
  }
  private authorized(hash: string) {
    return this.sessionExpires(hash) !== undefined;
  }
  private async mutate<T>(action: () => T, resumeParked = false): Promise<T> {
    const outcome = await this.ctx.blockConcurrencyWhile(async () => {
      try {
        const value = await this.ctx.storage.transaction(async () => {
          const result = action();
          await this.schedule(resumeParked);
          return result;
        });
        return { ok: true as const, value };
      } catch (error) {
        // Expected rule conflicts must not escape blockConcurrencyWhile and
        // reset the object. The storage transaction has already rolled back.
        return { ok: false as const, error };
      }
    });
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  }
  private async schedule(resumeParked: boolean) {
    // Called only inside mutate: SQL changes and the next alarm commit together.
    if (!this.repository.hasCurrent()) return;
    const s = this.repository.load(this.repository.identity()!, Date.now());
    const deadlines = [
      ...Object.values(s.progress.tasks),
      ...Object.values(s.progress.races),
    ]
      .filter((v) => v.status === "started")
      .map((v) => v.endsAt);
    if (this.env.PROJECTIONS) {
      this.delivery.schedule(Date.now(), resumeParked);
      const deliveryAt = this.delivery.due();
      if (deliveryAt !== null) deadlines.push(deliveryAt);
    }
    const existing = await this.ctx.storage.getAlarm();
    if (deadlines.length) {
      const deadline = Math.max(Date.now() + 1, Math.min(...deadlines));
      if (existing === null || existing !== deadline)
        await this.ctx.storage.setAlarm(deadline);
    } else if (existing !== null) await this.ctx.storage.deleteAlarm();
  }
  private async projectEvents() {
    if (!this.env.PROJECTIONS) return;
    const rows = await this.mutate(() => this.delivery.claim(Date.now()));
    if (!rows.length) return;
    try {
      await deliverPlayerEvents(this.env.PROJECTIONS, rows);
      await this.mutate(() => this.delivery.acknowledge(rows, Date.now()));
    } catch {
      await this.mutate(() => this.delivery.failed(Date.now()));
    }
  }
  async alarm() {
    // Old alarms can fire before the first authenticated migration has an address.
    if (!this.repository.hasCurrent()) {
      let deadline: number | undefined;
      this.ctx.storage.transactionSync(() => {
        const row = this.ctx.storage.sql
          .exec<{ data: string }>("SELECT data FROM player WHERE id=1")
          .toArray()[0];
        if (!row) return;
        const s = settleLegacy(JSON.parse(row.data) as LegacyState, Date.now());
        this.ctx.storage.sql.exec(
          "UPDATE player SET data=? WHERE id=1",
          JSON.stringify(s),
        );
        deadline = [s.work?.endsAt, s.race?.endsAt]
          .filter((n): n is number => n !== undefined)
          .sort((a, b) => a - b)[0];
      });
      if (deadline !== undefined)
        await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, deadline));
      return;
    }
    await this.mutate(() => {
      const original = this.repository.load(
        this.repository.identity()!,
        Date.now(),
      );
      const s = settle(original, this.context(original)).state;
      if (s.progress.revision !== original.progress.revision)
        this.repository.save(s);
    });
    await this.projectEvents();
  }
  async challenge(address: string) {
    const now = Date.now();
    const prior = this.ctx.storage.sql
      .exec<{ last_challenge: number }>(
        "SELECT last_challenge FROM auth WHERE id=1",
      )
      .toArray()[0];
    if (prior && now - prior.last_challenge < 2000)
      return reply(
        { error: "Please wait a moment before signing again." },
        429,
      );
    const expires = now + CHALLENGE_MS;
    const message = createSiweMessage({
      address: getAddress(address),
      chainId: Number(this.env.CHAIN_ID),
      domain: new URL(this.env.APP_ORIGIN).host,
      uri: this.env.APP_ORIGIN,
      version: "1",
      nonce: random(),
      issuedAt: new Date(now),
      expirationTime: new Date(expires),
      requestId: this.env.ENVIRONMENT,
      statement: LOGIN_STATEMENT,
    });
    this.ctx.storage.sql.exec(
      "INSERT INTO auth VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET message=excluded.message,expires=excluded.expires,last_challenge=excluded.last_challenge",
      message,
      expires,
      now,
    );
    return reply({ message, chainId: Number(this.env.CHAIN_ID), expires });
  }
  async login(address: string, signature: Hex, message: string) {
    const challenge = this.ctx.storage.sql
      .exec<{ message: string; expires: number }>(
        "SELECT message,expires FROM auth WHERE id=1",
      )
      .toArray()[0];
    if (
      !challenge ||
      challenge.expires <= Date.now() ||
      challenge.message !== message ||
      !validLoginContext(message, address, this.env, Date.now())
    )
      return reply(
        { error: "Sign-in expired or already used. Request a new message." },
        401,
      );
    let valid = false;
    try {
      valid = await verifyMessage({
        address: getAddress(address),
        message,
        signature,
      });
    } catch {
      /* Invalid signature. */
    }
    if (!valid)
      return reply({ error: "The signature does not match this wallet." }, 401);
    const token = random() + random();
    const hash = await digest(token);
    // Re-check after async verification. A nonce is consumed exactly once.
    const accepted = this.ctx.storage.transactionSync(() => {
      const current = this.ctx.storage.sql
        .exec<{ message: string; expires: number }>(
          "SELECT message,expires FROM auth WHERE id=1",
        )
        .toArray()[0];
      if (
        !current ||
        current.message !== message ||
        current.expires <= Date.now()
      )
        return false;
      this.ctx.storage.sql.exec("UPDATE auth SET expires=0 WHERE id=1");
      this.ctx.storage.sql.exec(
        "DELETE FROM sessions WHERE expires<=?",
        Date.now(),
      );
      this.ctx.storage.sql.exec(
        "INSERT INTO sessions(hash,expires,context) VALUES(?,?,?)",
        hash,
        Date.now() + SESSION_MS,
        sessionContext(this.env),
      );
      return true;
    });
    if (accepted) {
      const legacy = this.ctx.storage.sql.exec<{ character: string | null }>("SELECT character FROM game_profile WHERE id=1").toArray()[0];
      this.workshop.login(address, Date.now(), legacy?.character);
      await this.workshop.project(this.env.PROJECTIONS);
    }
    return accepted
      ? reply({ authenticated: true, address }, 200, {
          "Set-Cookie": sessionCookie(
            `${address}.${token}`,
            this.env.APP_ORIGIN,
          ),
        })
      : reply({ error: "This sign-in message was already used." }, 401);
  }
  async logout(hash: string) {
    this.ctx.storage.sql.exec("DELETE FROM sessions WHERE hash=?", hash);
    this.activity.revoke(hash);
    return reply({ authenticated: false }, 200, {
      "Set-Cookie": sessionCookie("", this.env.APP_ORIGIN, 0),
    });
  }
  async workshopRequest(hash: string, address: string, action: string, input: Record<string, unknown> = {}) {
    if (!this.authorized(hash)) return reply({ error: "Sign in with your wallet to continue." }, 401);
    try {
      const row = this.ctx.storage.transactionSync(() => {
        const legacy = this.ctx.storage.sql.exec<{ character: string | null }>("SELECT character FROM game_profile WHERE id=1").toArray()[0];
        const current = this.workshop.ensure(address, Date.now(), legacy?.character);
        if (action === "character") return this.workshop.choose(input.character, Date.now());
        if (action === "open") return this.workshop.open(crypto.randomUUID(), Date.now());
        if (action === "save") return this.workshop.save(input, Date.now());
        return current;
      });
      await this.workshop.project(this.env.PROJECTIONS);
      return reply({ ...this.workshop.snapshot(row), ...(action === "open" ? { writer: row.writer } : {}) });
    } catch (e) {
      if (e instanceof WorkshopConflict) return reply({ error: e.message }, 409);
      throw e;
    }
  }
  async heartbeat(hash: string, address: string, generation: string) {
    const expires = this.sessionExpires(hash);
    if (!expires)
      return reply({ error: "Sign in with your wallet to continue." }, 401);
    return this.mutate(() => {
      const state = this.repository.load(address, Date.now());
      if (generation !== state.progress.generation)
        return reply(
          { error: "Progress generation changed. Reload your garage." },
          409,
        );
      const now = Date.now();
      const activeUntil = this.activity.touch(hash, now, expires);
      return reply({ activeUntil, now });
    });
  }
  async state(hash: string, address: string) {
    if (!this.authorized(hash))
      return reply({ error: "Sign in with your wallet to continue." }, 401);
    let s!: Garage;
    await this.mutate(() => {
      const before = this.repository.load(address, Date.now());
      s = settle(before, this.context(before)).state;
      if (s.progress.revision !== before.progress.revision)
        this.repository.save(s);
    }, true);
    return reply({ state: s, address, now: Date.now() });
  }
  async command(
    hash: string,
    address: string,
    id: string,
    expectedVersion: number,
    generation: string,
    command: Command,
  ) {
    if (!this.authorized(hash))
      return reply({ error: "Sign in with your wallet to continue." }, 401);
    let result!: Garage;
    let duplicate = false;
    try {
      await this.mutate(() => {
        const original = this.repository.load(address, Date.now());
        if (generation !== original.progress.generation)
          throw new GameError(
            "Progress generation changed. Reload your garage.",
          );
        this.activity.touch(
          hash,
          Date.now(),
          this.sessionExpires(hash) ?? Date.now(),
        );
        const prior = this.repository.priorCommand(generation, id);
        const payload = commandFingerprint(command);
        if (prior !== undefined) {
          if (prior !== payload)
            throw new GameError("Command ID reused with a different action.");
          result = settle(original, this.context(original)).state;
          this.repository.save(result);
          duplicate = true;
          return;
        }
        if (original.progress.revision !== expectedVersion)
          throw new GameError(
            "Garage updated in another request. Refresh and try again.",
          );
        result = execute(
          original,
          { id, command },
          this.context(original),
        ).state;
        this.repository.save(result);
        this.repository.rememberCommand(generation, id, payload);
      }, true);
      return reply({ state: result, address, now: Date.now(), duplicate });
    } catch (error) {
      if (error instanceof GameError)
        return reply({ error: error.message }, 409);
      throw error;
    }
  }
}

const worker = {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    try {
      const release = (
        {
          local: localRelease,
          staging: stagingRelease,
          production: productionRelease,
        } as Record<string, ReleaseConfig>
      )[env.ENVIRONMENT];
      if (!release) return json({ error: "Unknown environment." }, 503);
      if (!url.pathname.startsWith("/api/")) return publicSite(req, env.ASSETS, release);
      const capabilities = releaseCapabilities(release);
      if (req.method === "GET" && url.pathname === "/api/health")
        return json({
          status: "ok",
          environment: env.ENVIRONMENT,
          ruleset: BALANCE_VERSION,
          capabilities,
        });
      if (req.method === "POST" && req.headers.get("Origin") !== env.APP_ORIGIN)
        return json({ error: "Origin not allowed." }, 403);
      const workshopAdmin = await handleWorkshopPlayers(req, env);
      if (workshopAdmin) return workshopAdmin;
      const whitelist = await handleWhitelist(req, env, body);
      if (whitelist) return whitelist;
      if (req.method === "GET" && url.pathname === "/api/config")
        return json({
          chainId: Number(env.CHAIN_ID),
          walletConnect: publicWalletConfig(
            release.walletConnect,
            env.APP_ORIGIN,
            Number(env.CHAIN_ID),
          ),
          economy: "closed",
          ruleset: BALANCE_VERSION,
          phase: release.phase,
          published: release.published,
          capabilities,
        });
      if (!capabilities.gameplay)
        return json({ error: "This environment is closed." }, 503);
      if (
        req.method === "POST" &&
        ["/api/auth/challenge", "/api/auth/verify"].includes(url.pathname)
      ) {
        const b = await body(req);
        if (typeof b.address !== "string" || !isAddress(b.address))
          return json({ error: "Invalid wallet address." }, 400);
        const address = b.address.toLowerCase();
        const player = env.PLAYERS.getByName(address);
        if (url.pathname.endsWith("challenge"))
          return await fromRpc(player.challenge(address));
        if (
          typeof b.message !== "string" ||
          typeof b.signature !== "string" ||
          !/^0x[0-9a-fA-F]{130}$/.test(b.signature)
        )
          return json({ error: "Invalid signed message." }, 400);
        return await fromRpc(
          player.login(address, b.signature as Hex, b.message),
        );
      }
      const session = cookie(req, "pitlane_session")?.split(".");
      if (
        !session ||
        session.length !== 2 ||
        !isAddress(session[0]) ||
        !/^[a-f0-9]{64}$/.test(session[1])
      )
        return json({ error: "Sign in with your wallet to continue." }, 401);
      const address = session[0].toLowerCase(),
        hash = await digest(session[1]),
        player = env.PLAYERS.getByName(address);
      // The cookie is shared across tabs. A stale tab must never operate on a
      // different wallet just because another tab replaced that cookie.
      const expected = req.headers.get("X-Pitlane-Account");
      if (
        (expected !== null || req.method === "POST") &&
        !accountBindingMatches(expected, address)
      )
        return json(
          { error: "Your sign-in account changed. Connect and sign in again." },
          401,
        );
      if (req.method === "POST" && url.pathname === "/api/auth/logout")
        return await fromRpc(player.logout(hash));
      if (req.method === "GET" && url.pathname === "/api/state")
        return await fromRpc(player.state(hash, address));
      if (req.method === "GET" && url.pathname === "/api/workshop/state")
        return await fromRpc(player.workshopRequest(hash, address, "state"));
      if (req.method === "POST" && ["/api/workshop/character", "/api/workshop/open", "/api/workshop/save"].includes(url.pathname))
        return await fromRpc(player.workshopRequest(hash, address, url.pathname.split("/").at(-1)!, await body(req)));
      if (req.method === "POST" && url.pathname === "/api/heartbeat") {
        const b = await body(req);
        if (
          Object.keys(b).sort().join(",") !==
            "generation,ruleset,schemaVersion" ||
          b.schemaVersion !== SCHEMA_VERSION ||
          b.ruleset !== BALANCE_VERSION ||
          typeof b.generation !== "string" ||
          b.generation.length > 180
        )
          throw new ProtocolError(
            "This game version has changed. Reload before continuing.",
          );
        return await fromRpc(player.heartbeat(hash, address, b.generation));
      }
      if (req.method === "POST" && url.pathname === "/api/command") {
        const b = parseCommandEnvelope(await body(req));
        return await fromRpc(
          player.command(
            hash,
            address,
            b.id,
            b.version as number,
            b.generation,
            b.command as Command,
          ),
        );
      }
      return json({ error: "Not found." }, 404);
    } catch (error) {
      if (!url.pathname.startsWith("/api/")) return unavailableDocument(req);
      if (error instanceof GameError || error instanceof ProtocolError)
        return json({ error: error.message }, 400);
      // Never log authentication payloads, cookies or signatures.
      return json(
        {
          error:
            "The server could not save this action. Retry with the same request.",
        },
        503,
      );
    }
  },
} satisfies ExportedHandler<Env>;

export default { async fetch(req: Request, env: Env) { return secureSiteResponse(await worker.fetch(req, env), req); } } satisfies ExportedHandler<Env>;
