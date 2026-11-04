import { describe, expect, it } from "vitest";
import { createSiweMessage } from "viem/siwe";
import {
  accountBindingMatches,
  CHALLENGE_MS,
  LOGIN_STATEMENT,
  sessionContext,
  validLoginContext,
} from "../server/auth-context";

const env = {
  ENVIRONMENT: "local",
  APP_ORIGIN: "http://127.0.0.1:5173",
  CHAIN_ID: "11155111",
};
const account = "0x1111111111111111111111111111111111111111";
const now = Date.UTC(2026, 9, 19);
const fields = {
  address: account,
  chainId: 11155111,
  domain: "127.0.0.1:5173",
  uri: env.APP_ORIGIN,
  version: "1",
  nonce: "a".repeat(32),
  issuedAt: new Date(now),
  expirationTime: new Date(now + CHALLENGE_MS),
  statement: LOGIN_STATEMENT,
  requestId: "local",
} as const;
describe("purpose-bound authentication", () => {
  it("accepts only the current bounded login context", () => {
    const text = createSiweMessage(fields);
    expect(validLoginContext(text, account, env, now)).toBe(true);
    expect(validLoginContext(text, account, env, now - 1)).toBe(false);
    expect(validLoginContext(text, account, env, now + CHALLENGE_MS - 1)).toBe(
      true,
    );
    expect(validLoginContext(text, account, env, now + CHALLENGE_MS)).toBe(
      false,
    );
    expect(validLoginContext(text, account, env, NaN)).toBe(false);
    expect(
      validLoginContext(
        text,
        "0x2222222222222222222222222222222222222222",
        env,
        now,
      ),
    ).toBe(false);
  });
  it("rejects a validly formed message for another purpose, domain, URI, chain or environment", () => {
    for (const override of [
      { domain: "other.invalid" },
      { uri: "https://other.invalid" },
      { chainId: 1 },
      { requestId: "production" },
      { statement: "Withdraw tokens" },
      { nonce: "12345678" },
      { expirationTime: new Date(now + CHALLENGE_MS + 1) },
    ])
      expect(
        validLoginContext(
          createSiweMessage({ ...fields, ...override }),
          account,
          env,
          now,
        ),
      ).toBe(false);
    const text = createSiweMessage(fields);
    expect(
      validLoginContext(text, account, { ...env, ENVIRONMENT: "staging" }, now),
    ).toBe(false);
    expect(
      validLoginContext(text, account, { ...env, CHAIN_ID: "1" }, now),
    ).toBe(false);
    expect(
      validLoginContext(
        text,
        account,
        { ...env, APP_ORIGIN: "http://127.0.0.1:8787" },
        now,
      ),
    ).toBe(false);
  });
  it("isolates stored sessions even when bindings are accidentally shared", () => {
    const context = sessionContext(env);
    for (const override of [
      { ENVIRONMENT: "production" },
      { APP_ORIGIN: "https://pitlane.invalid" },
      { CHAIN_ID: "1" },
    ])
      expect(sessionContext({ ...env, ...override })).not.toBe(context);
  });
  it("requires the tab's expected wallet for mutations", () => {
    expect(accountBindingMatches(null, account)).toBe(false);
    expect(accountBindingMatches("invalid", account)).toBe(false);
    expect(
      accountBindingMatches(
        "0x2222222222222222222222222222222222222222",
        account,
      ),
    ).toBe(false);
    expect(accountBindingMatches(account, account)).toBe(true);
    expect(
      accountBindingMatches("0x" + "A".repeat(40), "0x" + "a".repeat(40)),
    ).toBe(true);
  });
});
