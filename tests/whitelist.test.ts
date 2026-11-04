import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  configuredPostId,
  postIntentLinks,
  validCampaignLink,
  xPostId,
} from "../shared/whitelist";
import { fixture, links } from "./whitelist-fixture";
const wallet = "0x1111111111111111111111111111111111111111";
const postId = "2114015920498823592";

describe("X post intents", () => {
  it("keeps long IDs exact, accepts post URLs and restores saved settings", () => {
    const intents = postIntentLinks(postId)!;
    expect(intents).toEqual({
      like: `https://x.com/intent/like?tweet_id=${postId}`,
      repost: `https://x.com/intent/retweet?tweet_id=${postId}`,
      quote: `https://x.com/intent/tweet?url=https%3A%2F%2Fx.com%2Fi%2Fstatus%2F${postId}`,
    });
    expect(
      postIntentLinks(` https://x.com/tryloopi/status/${postId}?s=20 `),
    ).toEqual(intents);
    expect(xPostId(`https://twitter.com/i/status/${postId}`)).toBe(postId);
    expect(configuredPostId({ ...links, ...intents })).toBe(postId);
    expect(configuredPostId(links)).toBe("123");
    expect(configuredPostId({ ...links, like: intents.like })).toBe("");
    for (const invalid of [
      "",
      "0",
      "0123",
      "1e19",
      "123&text=oops",
      "18446744073709551616",
      Number(postId),
      "https://evil.example/name/status/123",
    ])
      expect(postIntentLinks(invalid)).toBeNull();
  });
});
describe("whitelist storage and access", () => {
  let f: ReturnType<typeof fixture>,
    cookie = "";
  beforeEach(() => {
    f = fixture();
    cookie = "";
  });
  afterEach(() => f.sql.close());
  async function call(
    path: string,
    data?: unknown,
    headers: Record<string, string> = {},
  ) {
    const response = (await f.run(
      new Request("http://127.0.0.1:8787/api/" + path, {
        method: data ? "POST" : "GET",
        headers: {
          Origin: f.env.APP_ORIGIN,
          Cookie: cookie,
          "Content-Type": "application/json",
          ...headers,
        },
        body: data ? JSON.stringify(data) : undefined,
      }),
    ))!;
    if (response.headers.has("Set-Cookie"))
      cookie = response.headers.get("Set-Cookie")!.split(";")[0];
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
    };
  }
  async function open() {
    await call("admin/whitelist/config", { revision: 1, state: "open", links });
    await call("whitelist/config");
  }
  async function complete() {
    await Promise.all(
      Object.keys(links).map((task) =>
        call("whitelist/checkpoint", { task, revision: 2 }),
      ),
    );
  }
  it("starts closed and rejects submissions before four clicks", async () => {
    expect((await call("whitelist/config")).body.state).toBe("closed");
    expect(
      (
        await call("whitelist/applications", {
          revision: 1,
          wallet,
          handle: "test",
        })
      ).status,
    ).toBe(409);
    await open();
    expect(
      (
        await call("whitelist/applications", {
          revision: 2,
          wallet,
          handle: "test",
        })
      ).status,
    ).toBe(409);
    expect(
      f.sql.prepare("SELECT COUNT(*) n FROM whitelist_applications").get()?.n,
    ).toBe(0);
  });
  it("counts concurrent clicks, saves once and restores receipt", async () => {
    await open();
    await complete();
    expect((await call("whitelist/config")).body.completed).toHaveLength(4);
    const payload = {
      revision: 2,
      wallet,
      handle: "@Test_User",
      reason: "Cars",
    };
    const results = await Promise.all([
      call("whitelist/applications", payload),
      call("whitelist/applications", payload),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(results[0].body.receipt).toBe(results[1].body.receipt);
    expect((await call("whitelist/config")).body.receipt).toBe(
      results[0].body.receipt,
    );
    const admin = await call("admin/whitelist/applications");
    expect(admin.body.total).toBe(1);
    expect((admin.body.applications as { handle: string }[])[0].handle).toBe(
      "test_user",
    );
    cookie = "";
    await call("whitelist/config");
    await complete();
    expect((await call("whitelist/applications", payload)).status).toBe(409);
  });
  it("validates wallet, handle, optional length and honeypot", async () => {
    await open();
    await complete();
    for (const changes of [
      { wallet: "0x" + "0".repeat(40) },
      { wallet: "invalid" },
      { handle: "https://x.com/name" },
      { reason: "a".repeat(501) },
      { website: "spam" },
    ]) {
      expect(
        (
          await call("whitelist/applications", {
            revision: 2,
            wallet,
            handle: "test",
            ...changes,
          })
        ).status,
      ).toBe(400);
    }
    expect(
      (
        await call("whitelist/applications", {
          revision: 2,
          wallet,
          handle: "test",
        })
      ).status,
    ).toBe(201);
  });
  it("invalidates old checkpoints when the owner changes links", async () => {
    await open();
    await complete();
    expect(
      (
        await call("admin/whitelist/config", {
          revision: 2,
          state: "open",
          links,
        })
      ).status,
    ).toBe(200);
    expect((await call("whitelist/config")).body.completed).toEqual([]);
    expect(
      (
        await call("whitelist/applications", {
          revision: 2,
          wallet,
          handle: "test",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call("whitelist/applications", {
          revision: 3,
          wallet,
          handle: "test",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call("admin/whitelist/config", {
          revision: 2,
          state: "open",
          links,
        })
      ).status,
    ).toBe(409);
  });
  it("rejects unsafe, empty or incomplete task links", async () => {
    for (const url of [
      "javascript:alert(1)",
      "https://x.com.evil.com/test",
      "https://evil.com/test",
      "http://x.com/test",
      "https://x.com",
      "https://user:password@x.com/test",
      "https://x.com:444/test",
    ])
      expect(validCampaignLink(url)).toBe(false);
    expect(validCampaignLink("https://x.com/intent/like?tweet_id=123")).toBe(
      true,
    );
    expect(
      (
        await call("admin/whitelist/config", {
          revision: 1,
          state: "open",
          links: { ...links, like: "" },
        })
      ).status,
    ).toBe(400);
  });
  it("builds all three intents server-side from one post ID", async () => {
    for (const invalid of ["", "1e19", Number(postId), "123&other=456"])
      expect(
        (
          await call("admin/whitelist/config", {
            revision: 1,
            state: "open",
            followUrl: links.follow,
            postId: invalid,
          })
        ).status,
      ).toBe(400);
    expect(
      (
        await call("admin/whitelist/config", {
          revision: 1,
          state: "open",
          followUrl: links.follow,
          postId,
        })
      ).status,
    ).toBe(200);
    const saved = (await call("admin/whitelist/config")).body.config as {
      links: typeof links;
    };
    expect(saved.links).toEqual({
      follow: links.follow,
      ...postIntentLinks(postId),
    });
    expect((await call("whitelist/config")).body.links).toEqual(saved.links);
  });
  it("exports all applications across batches with only handle and wallet", async () => {
    const insert = f.sql.prepare(
      "INSERT INTO whitelist_applications(id,session_id,wallet,handle,reason,revision,links,created_at) VALUES(?,?,?,?,?,1,'{}',1000)",
    );
    const count = 1005;
    for (let i = 0; i < count; i++)
      insert.run(
        `id-${i}`,
        `session-${i}`,
        `0x${(i + 1).toString(16).padStart(40, "0")}`,
        `crew_${i}`,
        "Private optional answer",
      );
    const shown = await call("admin/whitelist/applications");
    expect(shown.body.applications).toHaveLength(100);
    expect(shown.body.total).toBe(count);
    const response = (await f.run(
      new Request("http://127.0.0.1:8787/api/admin/whitelist/applications.csv"),
    ))!;
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("Content-Disposition")).toContain(
      'filename="pitlane-whitelist.csv"',
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    // A submission arriving during an export is included in the next export.
    insert.run(
      "new-id",
      "new-session",
      wallet,
      "new_crew",
      "Later application",
    );
    const csv = await response.text();
    const rows = csv.trimEnd().split("\r\n");
    expect(rows[0]).toBe("handle,wallet");
    expect(rows).toHaveLength(count + 1);
    expect(new Set(rows.slice(1)).size).toBe(count);
    for (let i = 0; i < count; i++)
      expect(rows).toContain(
        `"crew_${i}","0x${(i + 1).toString(16).padStart(40, "0")}"`,
      );
    expect(csv).not.toMatch(/new_crew|Private optional answer|session-/);
    const next = (await f.run(
      new Request("http://127.0.0.1:8787/api/admin/whitelist/applications.csv"),
    ))!;
    expect((await next.text()).trimEnd().split("\r\n")).toHaveLength(count + 2);
  });
  it("protects CSV access and exports a header for an empty list", async () => {
    const req = new Request(
      "https://pitlane.example/api/admin/whitelist/applications.csv",
    );
    const secret = "csv-secret-".repeat(4);
    expect(
      (
        await f.run(req, {
          ENVIRONMENT: "production",
          WHITELIST_ADMIN_TOKEN: secret,
        })
      )?.status,
    ).toBe(401);
    const response = (await f.run(
      new Request(req, { headers: { Authorization: `Bearer ${secret}` } }),
      {
        ENVIRONMENT: "production",
        WHITELIST_ADMIN_TOKEN: secret,
      },
    ))!;
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("handle,wallet\r\n");
    expect((await call("whitelist/applications.csv")).status).toBe(404);
  });
  it("blocks foreign-origin writes and protects nonlocal admin", async () => {
    expect(
      (
        await call(
          "admin/whitelist/config",
          { revision: 1, state: "open", links },
          { Origin: "https://evil.example" },
        )
      ).status,
    ).toBe(403);
    const req = new Request(
      "https://pitlane.example/api/admin/whitelist/applications",
    );
    expect((await f.run(req, { ENVIRONMENT: "production" }))?.status).toBe(401);
    const secret = "x".repeat(40);
    expect(
      (
        await f.run(
          new Request(req, { headers: { Authorization: "Bearer wrong" } }),
          { ENVIRONMENT: "production", WHITELIST_ADMIN_TOKEN: secret },
        )
      )?.status,
    ).toBe(401);
    expect(
      (
        await f.run(
          new Request(req, { headers: { Authorization: "Bearer " + secret } }),
          { ENVIRONMENT: "production", WHITELIST_ADMIN_TOKEN: secret },
        )
      )?.status,
    ).toBe(200);
    expect((await call("whitelist/applications")).status).toBe(404);
  });
  it("rate-limits requests without exposing submissions in public config", async () => {
    const response = await call("whitelist/config");
    expect(Object.keys(response.body)).not.toContain("applications");
    for (let i = 1; i < 120; i++)
      expect((await call("whitelist/config")).status).toBe(200);
    expect((await call("whitelist/config")).status).toBe(429);
  });
});
