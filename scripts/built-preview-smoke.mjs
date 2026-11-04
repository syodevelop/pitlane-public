import { preview } from "vite";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
// Separate preview port, strict binding: no takeover and no user server restart.
const server = await preview({
  preview: { host: "127.0.0.1", port: 5174, strictPort: true, open: false },
});
let browser;
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage(),
    errors = [],
    api = [],
    phaser = [],
    wallet = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    const p = new URL(r.url()).pathname;
    if (p.startsWith("/api/")) api.push(p);
    if (p.includes("/phaser-")) phaser.push(p);
    if (/external-wallet-|ApiController-|w3m-modal-|core-/.test(p))
      wallet.push(p);
  });
  await page.goto("http://127.0.0.1:5174/", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Local garage preview" }).waitFor();
  assert.deepEqual(api, []);
  assert.deepEqual(phaser, []);
  assert.deepEqual(wallet, []);
  await page.goto("http://127.0.0.1:5174/play", { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  assert.deepEqual(wallet, []);
  console.log(
    "Built local preview passed: environment injected at serving time, no Home API/Phaser load, wallet gate and API proxy. No sign-in on the alternate-origin test port.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
