// Real local Workers for staged closure and published production. Never deploys or uses player saves.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const port = 8788,
  inspector = 9231;
async function vacant(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  await new Promise((resolve) => server.close(resolve));
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
fs.mkdirSync("test-results/release-environments", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const environment of ["staging", "production"]) {
    const open = environment === "production";
    await vacant(port);
    await vacant(inspector);
    const log = fs.openSync(
      `test-results/release-environments/${environment}.log`,
      "w",
    );
    const child = spawn(
      process.execPath,
      [
        "node_modules/wrangler/bin/wrangler.js",
        "dev",
        "--local",
        "--env",
        environment,
        "--ip",
        "127.0.0.1",
        "--port",
        String(port),
        "--inspector-port",
        String(inspector),
        "--persist-to",
        `test-results/release-environments/${environment}-state`,
      ],
      {
        windowsHide: true,
        stdio: ["ignore", log, log],
        env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "true" },
      },
    );
    fs.closeSync(log);
    let error;
    child.on("error", (e) => {
      error = e;
    });
    try {
      let ready = false;
      for (let attempt = 0; attempt < 45; attempt++) {
        if (error) throw error;
        if (child.exitCode !== null)
          throw Error(environment + " exited; inspect its log");
        try {
          const r = await fetch(`http://127.0.0.1:${port}/api/health`, {
            signal: AbortSignal.timeout(1000),
          });
          const health = await r.json();
          assert.equal(health.environment, environment);
          assert.equal(health.capabilities.gameplay, open);
          assert.equal(health.capabilities.newMoney, false);
          ready = true;
          break;
        } catch {
          await sleep(700);
        }
      }
      assert.ok(ready, environment + " did not become ready");
      assert.equal(
        (await fetch(`http://127.0.0.1:${port}/api/state`)).status,
        open ? 401 : 503,
      );
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
      const api = [],
        errors = [];
      page.on("request", (r) => {
        if (new URL(r.url()).pathname.startsWith("/api/")) api.push(r.url());
      });
      page.on("pageerror", (e) => errors.push(e.message));
      const response = await page.goto(`http://127.0.0.1:${port}/play`, {
        waitUntil: "networkidle",
      });
      assert.equal(response.status(), 200);
      if (open) {
        await page.getByRole("button", { name: "Connect wallet", exact: true }).waitFor();
        const config = await (await fetch(`http://127.0.0.1:${port}/api/config`)).json();
        assert.equal(config.phase, "DEMO");
        assert.equal(config.published, true);
      } else {
        await page.getByRole("heading", { name: "Coming soon", exact: true }).waitFor();
        assert.equal(await page.getByRole("button", { name: "Connect wallet", exact: true }).count(), 0);
        assert.deepEqual(api, []);
      }
      assert.equal(await page.locator(".token-launch").count(), 0);
      assert.deepEqual(errors, []);
      await page.screenshot({
        path: `docs/qa/release-${environment}-worker-mobile.png`,
        fullPage: true,
      });
      const invalid = await page.goto(`http://127.0.0.1:${port}/leaderboard`, {
        waitUntil: "networkidle",
      });
      assert.equal(invalid.status(), 404);
      await page.getByRole("heading", { name: "Page not found." }).waitFor();
      await page.close();
      console.log(
        `${environment}: real local Worker served the configured release, authenticated API protected, unknown document HTTP 404.`,
      );
    } finally {
      // Kill only the process tree this test created; never the regular 8787 server.
      if (child.pid && child.exitCode === null) {
        if (process.platform === "win32")
          spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            windowsHide: true,
            stdio: "ignore",
          });
        else child.kill("SIGTERM");
      }
      await sleep(500);
    }
  }
} finally {
  await browser.close();
}
await vacant(port);
await vacant(inspector);
console.log(
  "Release environment checks passed; test ports released. No deployment, production connection or existing save mutation.",
);
