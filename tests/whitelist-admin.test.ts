import { beforeAll, beforeEach, afterEach, describe, it, expect } from "vitest";
import { fixture } from "./whitelist-fixture";
import { createAdminPasswordHash } from "../server/whitelist-admin-auth";

describe("password-protected whitelist administration", () => {
  const password = "Synthetic-QA-password-2026!";
  const origin = "https://pitlane.example";
  let verifier: string;
  let f: ReturnType<typeof fixture>;
  beforeAll(async () => {
    verifier = await createAdminPasswordHash(password);
  });
  beforeEach(() => {
    f = fixture();
  });
  afterEach(() => f.sql.close());
  async function request(
    path: string,
    data?: unknown,
    cookie?: string,
    override = {},
    headers = {},
  ) {
    return (await f.run(
      new Request(origin + "/api/admin/whitelist/" + path, {
        method: data === undefined ? "GET" : "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        body: data === undefined ? undefined : JSON.stringify(data),
      }),
      {
        ENVIRONMENT: "production",
        APP_ORIGIN: origin,
        WHITELIST_ADMIN_PASSWORD_HASH: verifier,
        ...override,
      },
    ))!;
  }
  async function login() {
    const response = await request("login", { password });
    expect(response.status).toBe(200);
    const header = response.headers.get("Set-Cookie")!;
    expect(header).toMatch(/HttpOnly; SameSite=Strict; Max-Age=28800; Secure/);
    return header.split(";")[0];
  }
  it("requires a password, grants a session, never returns the verifier, and revokes logout", async () => {
    expect((await request("applications")).status).toBe(401);
    expect((await request("login", { password: "wrong" })).status).toBe(401);
    const cookie = await login();
    const config = await request("config", undefined, cookie);
    expect(config.status).toBe(200);
    expect(await config.text()).not.toContain(verifier);
    expect((await request("applications.csv", undefined, cookie)).status).toBe(
      200,
    );
    expect((await request("logout", {}, cookie)).status).toBe(200);
    expect((await request("applications.csv", undefined, cookie)).status).toBe(
      401,
    );
  });
  it("rejects forged, expired and old-password sessions", async () => {
    expect(
      (await request("config", undefined, "pitlane_admin=" + "1".repeat(64)))
        .status,
    ).toBe(401);
    const cookie = await login();
    const rotated = await createAdminPasswordHash("A-different-test-password!");
    expect(
      (
        await request("config", undefined, cookie, {
          WHITELIST_ADMIN_PASSWORD_HASH: rotated,
        })
      ).status,
    ).toBe(401);
    f.sql.exec("UPDATE whitelist_admin_sessions SET expires=0");
    expect((await request("config", undefined, cookie)).status).toBe(401);
  });
  it("rejects cross-origin login, logout and settings changes", async () => {
    const foreign = { Origin: "https://foreign.example" };
    expect(
      (await request("login", { password }, undefined, {}, foreign)).status,
    ).toBe(403);
    const cookie = await login();
    expect((await request("logout", {}, cookie, {}, foreign)).status).toBe(403);
    expect((await request("config", {}, cookie, {}, foreign)).status).toBe(403);
  });
  it("limits password attempts per network to five in fifteen minutes", async () => {
    for (let i = 0; i < 5; i++)
      expect((await request("login", { password: "wrong" })).status).toBe(401);
    const response = await request("login", { password });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");
    expect(
      (
        await request(
          "login",
          { password },
          undefined,
          {},
          { "CF-Connecting-IP": "192.0.2.1" },
        )
      ).status,
    ).toBe(200);
  });
  it("fails closed without a configured password and disables the localhost shortcut when configured", async () => {
    expect(
      (
        await request("login", { password }, undefined, {
          WHITELIST_ADMIN_PASSWORD_HASH: undefined,
        })
      ).status,
    ).toBe(503);
    expect(
      (
        await f.run(
          new Request("http://127.0.0.1:5173/api/admin/whitelist/config"),
          { WHITELIST_ADMIN_PASSWORD_HASH: verifier },
        )
      )?.status,
    ).toBe(401);
  });
});
