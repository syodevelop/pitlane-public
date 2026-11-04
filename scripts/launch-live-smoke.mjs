import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const origin = "http://127.0.0.1:5173";
const output = new URL("../docs/qa/launch/live/", import.meta.url);
await fs.mkdir(output, { recursive: true });
const captures = [],
  errors = [];
let browser;
async function shot(page, name, description) {
  await page.screenshot({
    path: new URL(name, output).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
    fullPage: true,
  });
  captures.push({ name, description });
}
try {
  const config = await (await fetch(origin + "/api/config")).json();
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin, { waitUntil: "networkidle" });
  await shot(
    page,
    "01-home-desktop.png",
    "Current landing, desktop 1440x1000, full page.",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(
    page,
    "02-home-mobile.png",
    "Current landing, 390x844 viewport emulation, full page.",
  );
  await page.goto(origin + "/play", { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .waitFor();
  await shot(
    page,
    "03-login-mobile.png",
    "Current wallet gate, mobile viewport; no injected wallet.",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await shot(
    page,
    "04-login-desktop.png",
    "Current wallet gate, desktop; no injected wallet.",
  );

  // Fresh unfunded account, key stays only in this process. No owner wallet,
  // saved cookie, balance override, transport interception or game fixture.
  const account = privateKeyToAccount(generatePrivateKey());
  await page.exposeFunction("reviewSign", (encoded) =>
    account.signMessage({ message: { raw: encoded } }),
  );
  await page.addInitScript(
    ({ address, chain }) => {
      window.ethereum = {
        async request({ method, params }) {
          if (method === "eth_accounts" || method === "eth_requestAccounts")
            return [address];
          if (method === "eth_chainId") return chain;
          if (method === "personal_sign") return window.reviewSign(params[0]);
          throw new Error("Review provider only supports offchain login");
        },
      };
    },
    { address: account.address, chain: "0x" + config.chainId.toString(16) },
  );
  await page.reload({ waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sign in to Pitlane", exact: true })
    .click();
  await page.getByRole("button", { name: "Choose Gus", exact: true }).waitFor();
  await shot(
    page,
    "05-characters-desktop.png",
    "Current character selection after real local SIWE; simulated EOA provider.",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(
    page,
    "06-characters-mobile.png",
    "Current character selection, mobile viewport emulation.",
  );
  await page.getByRole("button", { name: "Choose Gus", exact: true }).click();
  await page.getByRole("button", { name: "Confirm Gus", exact: true }).click();
  await page.locator("canvas").waitFor();
  await page.waitForTimeout(1500);
  await shot(
    page,
    "07-garage-mobile.png",
    "Current live garage, fresh Gus profile, mobile viewport; no gameplay grants or balance overrides.",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(800);
  await shot(
    page,
    "08-garage-desktop.png",
    "Current live garage, same fresh Gus profile, desktop.",
  );
} catch (error) {
  errors.push(error.message);
} finally {
  await browser?.close();
}
await fs.writeFile(
  new URL("capture-status.json", output),
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      origin,
      captures,
      errors,
      limits:
        "Browser wallet provider is simulated; local SIWE, Worker and current UI are real. Mobile means viewport emulation, not a device or external-wallet round trip. No key, cookie, signature, pairing URI or user database is exported.",
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ captured: captures.length, errors }));
if (errors.length) process.exitCode = 1;
