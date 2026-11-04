import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

// Provider permission/events are simulated; SIWE, cookies and gameplay use the
// real local Worker. Keys/signatures are never written to disk or logs.
const a = privateKeyToAccount(generatePrivateKey()),
  b = privateKeyToAccount(generatePrivateKey());
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const errors = [];
let holdSignature = false,
  releaseSignature,
  signatureStarted;
async function pageFor(account) {
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.exposeFunction("signTestMessage", async ({ encoded, account }) => {
    const signer = [a, b].find(
      (s) => s.address.toLowerCase() === account.toLowerCase(),
    );
    assert.ok(signer);
    if (holdSignature) {
      holdSignature = false;
      signatureStarted?.();
      await new Promise((resolve) => {
        releaseSignature = resolve;
      });
    }
    return signer.signMessage({ message: { raw: encoded } });
  });
  await page.addInitScript(
    ({ account }) => {
      const listeners = new Map();
      const qa = (window.walletQA = {
        account,
        chain: "0x1237",
        emit(name) {
          for (const callback of listeners.get(name) || []) callback();
        },
        change(account) {
          qa.account = account;
          qa.emit("accountsChanged");
        },
      });
      window.ethereum = {
        async request({ method, params }) {
          if (method === "eth_requestAccounts") {
            qa.emit("accountsChanged");
            return [qa.account];
          }
          if (method === "eth_accounts") return qa.account ? [qa.account] : [];
          if (method === "eth_chainId") return qa.chain;
          if (method === "personal_sign")
            return window.signTestMessage({
              encoded: params[0],
              account: params[1],
            });
          throw new Error("Unsupported mock wallet method");
        },
        on(name, callback) {
          const set = listeners.get(name) || new Set();
          set.add(callback);
          listeners.set(name, set);
        },
        removeListener(name, callback) {
          listeners.get(name)?.delete(callback);
        },
      };
    },
    { account: account.address },
  );
  return page;
}
async function login(page) {
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sign in to Pitlane", exact: true })
    .click();
}
try {
  const one = await pageFor(a);
  await one.goto("http://127.0.0.1:5173/play");
  await login(one); // Permission accountsChanged must not cancel a normal connect.
  await one.getByRole("button", { name: "Choose Gus", exact: true }).click();
  let commands = 0;
  one.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/command") commands++;
  });
  // A provider that omits events must still be checked immediately before a command.
  await one.evaluate(() => {
    window.walletQA.chain = "0xaa36a7";
  });
  await one.getByRole("button", { name: "Confirm Gus", exact: true }).click();
  await one.getByRole("alert").filter({ hasText: "Robinhood Chain" }).waitFor();
  assert.equal(commands, 0);
  assert.equal(await one.locator("canvas").count(), 0);
  await one.reload(); // Correct chain from provider init; selection was never spent.
  await one.getByRole("button", { name: "Choose Gus", exact: true }).click();
  await one.getByRole("button", { name: "Confirm Gus", exact: true }).click();
  await one.locator("canvas").waitFor();
  await one.evaluate(() => localStorage.clear());
  await one.reload();
  await one.locator("canvas").waitFor();
  assert.equal(
    await one.getByRole("button", { name: "Choose Gus", exact: true }).count(),
    0,
  );

  const two = await pageFor(b);
  await two.goto("http://127.0.0.1:5173/play");
  // A's shared cookie is insufficient to open A's garage through B's provider.
  await two
    .getByRole("button", { name: "Connect wallet", exact: true })
    .waitFor();
  assert.equal(await two.locator("canvas").count(), 0);
  await login(two);
  await two.getByRole("button", { name: "Choose Juno", exact: true }).click();
  await two.getByRole("button", { name: "Confirm Juno", exact: true }).click();
  await two.locator("canvas").waitFor();
  await one.getByRole("alert").filter({ hasText: "another tab" }).waitFor();
  assert.equal(await one.locator("canvas").count(), 0);
  await fs.mkdir("docs/qa", { recursive: true });
  await one.screenshot({
    path: "docs/qa/auth-account-change-desktop.png",
    fullPage: true,
  });
  await one.setViewportSize({ width: 390, height: 844 });
  await one.screenshot({
    path: "docs/qa/auth-account-change-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await one.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );

  // Return from a hidden app without a provider event revalidates the account.
  await two.evaluate((account) => {
    window.walletQA.account = account;
    document.dispatchEvent(new Event("visibilitychange"));
  }, a.address);
  await two
    .getByRole("button", { name: "Connect wallet", exact: true })
    .waitFor();
  assert.equal(await two.locator("canvas").count(), 0);

  // A late signature after a network change must never be submitted to verify.
  const three = await pageFor(a);
  await three.goto("http://127.0.0.1:5173/play");
  let verifies = 0;
  three.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/auth/verify") verifies++;
  });
  holdSignature = true;
  const started = new Promise((resolve) => {
    signatureStarted = resolve;
  });
  await login(three);
  await started;
  await three.evaluate(() => {
    window.walletQA.chain = "0x1";
    window.walletQA.emit("chainChanged");
  });
  releaseSignature();
  await three
    .getByRole("button", { name: "Connect wallet", exact: true })
    .waitFor();
  await three.waitForTimeout(400);
  assert.equal(verifies, 0);
  assert.equal(await three.locator("canvas").count(), 0);

  // The server may finish verify after the UI has invalidated its operation.
  // Hold that actual response, change account, then let Set-Cookie arrive.
  await three.reload();
  await three.waitForTimeout(2100); // Server nonce issuance throttle.
  let releaseVerify, sawVerify;
  const held = new Promise((resolve) => {
    sawVerify = resolve;
  });
  await three.route("**/api/auth/verify", async (route) => {
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    sawVerify();
    await new Promise((resolve) => {
      releaseVerify = resolve;
    });
    await route.fulfill({ response });
  });
  await login(three);
  await held;
  await three.evaluate((account) => window.walletQA.change(account), b.address);
  releaseVerify();
  await three
    .getByRole("button", { name: "Connect wallet", exact: true })
    .waitFor();
  await three.waitForTimeout(400);
  assert.equal(await three.locator("canvas").count(), 0);
  assert.equal(
    await three
      .getByRole("button", { name: "Choose Gus", exact: true })
      .count(),
    0,
  );
  await three.unroute("**/api/auth/verify");
  await login(three);
  await three.locator("canvas").waitFor();
  const result = await three.evaluate(async (account) => {
    const response = await fetch("/api/state", {
      headers: { "X-Pitlane-Account": account },
    });
    return response.json();
  }, b.address);
  assert.equal(result.address, b.address.toLowerCase());
  assert.equal(result.state.profile.character, "Juno");
  await three.getByRole("button", { name: "Sign out", exact: true }).click();
  await three
    .getByRole("button", { name: "Connect wallet", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Auth browser passed: normal connect event, silent wrong chain blocks commands, reload/storage deletion preserves selection, two-tab account isolation, visibility revalidation, stale signature and late verification, matching-account recovery, logout. Edge desktop plus 390px layout; simulated provider, no real mobile wallet round trip.",
  );
} finally {
  await browser.close();
}
