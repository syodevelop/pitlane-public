// Real local SIWE/Worker; simulated EOA and document visibility, not a phone OS test.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const account = privateKeyToAccount(generatePrivateKey());
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
const errors = [],
  beats = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", async (response) => {
  if (new URL(response.url()).pathname === "/api/heartbeat" && response.ok())
    beats.push(await response.json());
});
await page.exposeFunction("signTestMessage", (encoded) =>
  account.signMessage({ message: { raw: encoded } }),
);
await page.addInitScript(
  ({ account }) => {
    window.qaHidden = false;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => window.qaHidden,
    });
    window.ethereum = {
      request: async ({ method, params }) => {
        if (method === "eth_accounts" || method === "eth_requestAccounts")
          return [account];
        if (method === "eth_chainId") return "0x1237";
        if (method === "personal_sign")
          return window.signTestMessage(params[0]);
        throw Error("Unexpected wallet method");
      },
    };
  },
  { account: account.address },
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  await page.goto("http://127.0.0.1:5173/play");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sign in to Pitlane", exact: true })
    .click();
  await page.getByRole("button", { name: "Choose Gus", exact: true }).click();
  await page.getByRole("button", { name: "Confirm Gus", exact: true }).click();
  await page.locator("canvas").waitFor();
  const initial = await page.evaluate(
    async () => (await (await fetch("/api/state")).json()).state.progress,
  );
  await sleep(21_000);
  assert.ok(beats.length >= 2, "Visible garage must renew without clicking");
  await page.evaluate(() => {
    window.qaHidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await sleep(500);
  const hiddenCount = beats.length;
  const expires = beats.at(-1).activeUntil;
  console.log(
    "Visible garage renews activity without clicks; checking hidden-tab silence through the 90-second grace.",
  );
  await sleep(Math.max(0, expires - Date.now() + 1000));
  assert.equal(beats.length, hiddenCount);
  await page.evaluate(() => {
    window.qaHidden = false;
    for (let i = 0; i < 20; i++)
      document.dispatchEvent(new Event("visibilitychange"));
  });
  await sleep(1500);
  assert.equal(
    beats.length,
    hiddenCount + 1,
    "Visibility events must be coalesced",
  );
  const final = await page.evaluate(
    async () => (await (await fetch("/api/state")).json()).state.progress,
  );
  for (const key of ["credits", "rep", "revision", "sequence", "partsIssued"])
    assert.equal(final[key], initial[key]);
  assert.deepEqual(final.events, initial.events);
  assert.deepEqual(errors, []);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  console.log(
    "Activity browser passed: renews without manual work, hidden tab sends no heartbeat through grace, return coalesces events, gameplay/resources/event sequence unchanged. Visibility and wallet are simulated; no external-wallet device claim.",
  );
} finally {
  await browser.close();
}
