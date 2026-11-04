import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  publicRelease,
  serializePublicRelease,
} from "../shared/public-release.ts";

const base = {
  environment: "production",
  phase: "DEMO",
  published: false,
  gameplayEnabled: true,
  moneyRequested: false,
  money: null,
};
const cases = [
  ["unpublished", base, "Coming soon", false],
  ["demo", { ...base, published: true }, "Demo is open", true],
  [
    "closed",
    { ...base, published: true, phase: "CLOSED" },
    "Demo closed",
    false,
  ],
  [
    "prelaunch",
    { ...base, phase: "PRELAUNCH" },
    "Full game coming soon",
    false,
  ],
  ["live", { ...base, published: true, phase: "LIVE" }, "Garage is open", true],
  [
    "paused",
    { ...base, published: true, phase: "PAUSED_MONEY" },
    "Token operations paused",
    true,
  ],
  [
    "maintenance",
    { ...base, published: true, gameplayEnabled: false },
    "Garage temporarily closed",
    false,
  ],
  ["invalid", null, "Garage access unavailable", false],
];
// Pure UI fixture. No release file is modified and no external link is opened.
const tokenConfig = {
  ...base,
  phase: "LIVE",
  published: true,
  publicSite: {
    approved: true,
    tokenLaunchConfirmed: true,
    tokenTicker: "PTLN",
    xUrl: "https://x.com/test_fixture",
    launchAt: "2026-11-01T12:00:00Z",
  },
  money: {
    approved: true,
    verifiedToken: true,
    testOnly: false,
    chainId: 1,
    token: "0x" + "1".repeat(40),
    ponsUrl: "https://ponsfamily.com/test-fixture",
    treasury: "PRIVATE_TREASURY",
    feeCollector: "PRIVATE_FEES",
    withdrawalMinimum: "12345",
  },
};
// moneyRequested is false, so missing future-policy fixture fields cannot enable money.
// publicRelease still runs moneyBlockers, whose legacy shape expects these strings.
Object.assign(tokenConfig.money, {
  schemaVersion: 1,
  decimals: 18,
  version: "TEST_ONLY",
  shop: "0x" + "2".repeat(40),
  finalityPolicy: "CONFIG_UNDECIDED",
  catalogVersion: "CONFIG_UNDECIDED",
  allocationPolicy: "CONFIG_UNDECIDED",
  operatorProcedureVersion: "CONFIG_UNDECIDED",
});

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  await fs.mkdir("docs/qa", { recursive: true });
  const page = await browser.newPage();
  let fixture = null;
  const requests = [],
    errors = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/"))
      requests.push(new URL(r.url()).pathname);
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.walletCalls = [];
    window.ethereum = {
      request: async (p) => {
        window.walletCalls.push(p);
        throw Error("Unexpected wallet call");
      },
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          if (window.rejectCopy) throw Error("Clipboard permission denied");
          window.copiedText = text;
        },
      },
    });
  });
  await page.route(
    (url) =>
      url.origin === "http://127.0.0.1:5173" &&
      ["/", "/play", "/docs"].includes(url.pathname),
    async (route) => {
      const response = await route.fetch();
      let html = await response.text();
      html = html.replace(
        /<script\b[^>]*\bid="pitlane-public-release"[^>]*>[\s\S]*?<\/script>/g,
        "",
      );
      const data = fixture ? serializePublicRelease(fixture) : "{invalid";
      html = html.replace(
        "</head>",
        `<script type="application/json" id="pitlane-public-release">${data}</script></head>`,
      );
      html = html.replace(
        "</body>",
        '<div style="position:fixed;bottom:0;left:0;background:#fff;color:#26332b;padding:5px;font:11px monospace;z-index:10000">RELEASE UI FIXTURE / NOT A PUBLIC LAUNCH</div></body>',
      );
      await route.fulfill({ response, body: html });
    },
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const [name, config, heading, open] of cases) {
      fixture = config ? publicRelease(config) : null;
      requests.length = 0;
      await page.goto("http://127.0.0.1:5173/play", {
        waitUntil: "networkidle",
      });
      if (open)
        await page
          .getByRole("button", { name: "Connect wallet", exact: true })
          .waitFor();
      else {
        await page
          .getByRole("heading", { name: heading, exact: true })
          .waitFor();
        assert.equal(
          await page
            .getByRole("button", { name: "Connect wallet", exact: true })
            .count(),
          0,
        );
        assert.deepEqual(
          requests,
          [],
          name + " must not request a player session",
        );
      }
      assert.deepEqual(
        await page.evaluate(() =>
          window.walletCalls.map((call) => call.method).sort(),
        ),
        open ? ["eth_accounts", "eth_chainId"] : [],
      );
      await page.getByRole("heading", { name: heading, exact: true }).waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        name + " overflow at " + width,
      );
      await page.screenshot({ path: `docs/qa/release-${name}-${width}.png` });
      if (open) {
        await page.goto("http://127.0.0.1:5173/docs", { waitUntil: "networkidle" });
        await page
          .getByRole("heading", { name: heading, exact: true })
          .waitFor();
      }
    }
  }
  fixture = publicRelease(tokenConfig);
  requests.length = 0;
  await page.goto("http://127.0.0.1:5173/docs", { waitUntil: "networkidle" });
  const link = page.getByRole("link", { name: "Buy on Pons" });
  assert.equal(await link.getAttribute("target"), "_blank");
  assert.equal(await link.getAttribute("rel"), "noopener noreferrer");
  assert.equal(
    await page
      .getByRole("link", { name: "X", exact: true })
      .getAttribute("href"),
    tokenConfig.publicSite.xUrl,
  );
  await page.getByRole("button", { name: "Copy contract address" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Contract address copied." })
    .waitFor();
  assert.equal(
    await page.evaluate(() => window.copiedText),
    tokenConfig.money.token,
  );
  await page.evaluate(() => {
    window.rejectCopy = true;
  });
  await page.getByRole("button", { name: "Copy contract address" }).click();
  await page.getByRole("status").filter({ hasText: "Copy failed." }).waitFor();
  await page.locator(".token-launch").evaluate((el) => {
    const label = document.createElement("p");
    label.textContent = "UI FIXTURE / NOT A LAUNCHED TOKEN";
    el.prepend(label);
  });
  await page
    .locator(".token-launch")
    .screenshot({ path: "docs/qa/release-token-copy-failure-mobile.png" });
  assert.equal(
    await page.locator("time").getAttribute("datetime"),
    tokenConfig.publicSite.launchAt,
  );
  assert.match(await page.locator("time").innerText(), /UTC$/);
  fixture = publicRelease({ ...tokenConfig, phase: "PAUSED_MONEY" });
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(
    await page.getByRole("link", { name: "Buy on Pons" }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("button", { name: "Copy contract address" }).count(),
    1,
  );
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);

  // Real Worker HTML delivery, not the browser fixtures above.
  for (const path of [
    "/",
    "/play",
    "/docs",
    "/faq",
    "/unknown",
    "/config/production.json",
  ]) {
    const r = await fetch("http://127.0.0.1:8787" + path);
    assert.equal(
      r.status,
      ["/faq", "/unknown", "/config/production.json"].includes(path) ? 404 : 200,
    );
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("set-cookie"), null);
    const html = await r.text(),
      match = html.match(
        /<script[^>]+id="pitlane-public-release"[^>]*>([\s\S]*?)<\/script>/,
      );
    assert.ok(match, "Worker must inject public bootstrap data");
    const data = JSON.parse(match[1]);
    assert.equal(data.localPreview, true);
    assert.equal(data.token, null);
    assert.equal("money" in data, false);
    assert.equal("APP_ORIGIN" in data, false);
  }
  const head = await fetch("http://127.0.0.1:8787/docs", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  const post = await fetch("http://127.0.0.1:8787/docs", { method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(
    (await fs.readFile("dist/index.html", "utf8")).includes(
      "pitlane-public-release",
    ),
    false,
    "Build artifacts must not embed local environment configuration",
  );
  console.log(
    "Release UI passed: all phases and closed gate, desktop/mobile, no closed-session calls, approved synthetic token copy success/failure, safe link attributes, UTC display, paused buy hidden; real Worker HTML/404/HEAD/no-store and environment-neutral build checked. Fixtures do not approve a launch or transfer tokens.",
  );
} finally {
  await browser.close();
}
