// Real public React/SVG pages, no authentication or game fixtures.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [],
    api = [],
    game = [],
    failedArt = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    const p = new URL(r.url()).pathname;
    if (p.startsWith("/api/")) api.push(p);
    if (/phaser|\/src\/(Garage|GarageGame)\.tsx$/.test(p)) game.push(p);
  });
  page.on("response", (r) => {
    if (r.url().includes("/art/") && r.status() >= 400)
      failedArt.push({ url: r.url(), status: r.status() });
  });
  await page.addInitScript(() => {
    window.walletCalls = [];
    window.ethereum = {
      request: async (args) => {
        window.walletCalls.push(args);
        throw Error("Public page requested a wallet");
      },
    };
  });
  await fs.mkdir("docs/qa/launch", { recursive: true });
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".launch-backdrop").evaluate((image) => image.decode());
  assert.equal(await page.locator("canvas").count(), 0);
  for (const [width, height] of [
    [1672, 941],
    [1440, 900],
    [2560, 1080],
    [768, 1024],
    [390, 844],
    [320, 568],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const bounds = await page.evaluate(() => {
      const nodes = [
        ...document.querySelectorAll(
          "header nav a, header .nav-play, .launch-copy h1 strong, .launch-copy p, .launch-play",
        ),
      ];
      return {
        scroll: [
          document.documentElement.scrollWidth,
          document.documentElement.scrollHeight,
        ],
        content: nodes.map((n) => {
          const r = n.getBoundingClientRect();
          return {
            text: n.textContent,
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
          };
        }),
      };
    });
    assert.deepEqual(
      bounds.scroll,
      [width, height],
      "Home must occupy exactly one viewport",
    );
    for (const r of bounds.content)
      assert.ok(
        r.left >= -1 &&
          r.right <= width + 1 &&
          r.top >= 0 &&
          r.bottom <= height,
        JSON.stringify({ width, height, r }),
      );
    await page.mouse.wheel(0, 1000);
    assert.equal(await page.evaluate(() => scrollY), 0);
    await page.screenshot({
      path: "docs/qa/launch/home-" + width + "x" + height + ".png",
      fullPage: true,
    });
  }
  assert.deepEqual(await page.evaluate(() => window.walletCalls), []);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/docs", "/faq", "/missing-page"]) {
      await page.goto("http://127.0.0.1:5173" + route, {
        waitUntil: "networkidle",
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        route + " overflow at " + width,
      );
      assert.deepEqual(await page.evaluate(() => window.walletCalls), []);
      if (route === "/missing-page" || route === "/faq")
        await page.getByRole("heading", { name: "Off the racing line." }).waitFor();
      if (width === 390 || width === 1440) {
        if (route === "/docs") {
          await page.screenshot({
            path: `docs/qa/${route.slice(1)}-${width === 390 ? "mobile" : "desktop"}.png`,
          });
        }
      }
      await page.reload({ waitUntil: "networkidle" });
      await page.locator("main h1").waitFor();
    }
  }
  assert.deepEqual(
    api,
    [],
    "Public pages must not create or poll a game session",
  );
  assert.deepEqual(game, [], "Public pages must not load the game renderer");
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  assert.equal(await page.locator(":focus").innerText(), "Skip to content");
  await page.keyboard.press("Enter");
  assert.equal(await page.locator(":focus").getAttribute("id"), "home-content");
  await page.getByRole("link", { name: "Pitlane home", exact: true }).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement?.textContent),
    "Docs",
  );
  await page.keyboard.press("Enter");
  await page.waitForURL("**/docs");
  const touch = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await touch.goto("http://127.0.0.1:5173/docs");
  await touch.locator(".guide-mobile-index summary").tap();
  await touch.locator('.guide-mobile-index a[href="#starter-packs"]').tap();
  await touch.waitForURL("**/docs#starter-packs");
  assert.equal(await touch.locator(".guide-mobile-index").evaluate(el => el.open), false);
  await touch.close();
  assert.deepEqual(failedArt, []);
  assert.deepEqual(errors, []);
  await page.goto("http://127.0.0.1:5173/play", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "The garage opens soon.", level: 1 }).waitFor();
  assert.equal(await page.locator("canvas").count(), 0);
  assert.deepEqual(await page.evaluate(() => window.walletCalls), []);
  assert.deepEqual(api, []);
  assert.deepEqual(game, []);
  console.log(
    "Public site passed: full-viewport original art, no scroll or clipped controls at seven sizes, 320/390/768/1440 document widths, direct routes and refresh, not-found UI, no public wallet/API/Phaser requests; Direct Play shows the launch announcement without loading the game.",
  );
} finally {
  await browser.close();
}
