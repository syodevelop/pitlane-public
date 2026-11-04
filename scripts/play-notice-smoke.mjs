// Exercise the public Play announcement without entering the game or opening X.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { releaseCapabilities } from "../shared/release.ts";

const production = JSON.parse(await fs.readFile("config/production.json", "utf8"));
assert.equal(releaseCapabilities(production).gameplay, false);
assert.equal(releaseCapabilities(production).newMoney, false);

const out = "docs/qa/play-closed-2026-10-28";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  ignoreDefaultArgs: ["--hide-scrollbars"],
});
try {
  for (const [width, height, device] of [
    [1440, 1000, "desktop"],
    [390, 844, "mobile"],
    [320, 568, "small-mobile"],
    [844, 390, "landscape"],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [], gameRequests = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => {
      const path = new URL(request.url()).pathname;
      if ((path === "/play" && request.resourceType() !== "document") || /\/src\/(Play|Garage3D|GarageGame)\.tsx$/.test(path) || (path.startsWith("/api/") && !path.startsWith("/api/whitelist")))
        gameRequests.push(path);
    });
    await page.addInitScript(() => {
      window.walletCalls = [];
      window.ethereum = { request: async args => { window.walletCalls.push(args); throw Error("Unexpected wallet request"); } };
    });
    // Click the visible sticky header without Playwright's scrollIntoView,
    // which can itself shift the document after the button's hover transform.
    const clickVisible = async selector => {
      const button = page.locator(selector);
      await button.waitFor({ state: "visible" });
      const box = await button.boundingBox();
      assert.ok(box && box.y >= 0 && box.y + box.height <= height);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    };
    for (const route of ["/", "/docs", "/whitelist", "/play"]) {
      await page.goto(`http://127.0.0.1:5173${route}`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      if (route === "/play") {
        await page.getByRole("heading", { name: "The garage opens soon.", level: 1 }).waitFor();
        assert.equal(await page.locator("canvas").count(), 0);
        assert.equal(await page.getByRole("button", { name: "Connect wallet", exact: true }).count(), 0);
        const card = await page.locator(".error-board").boundingBox();
        assert.equal(await page.locator(".site-header, .launch-backdrop, dialog").count(), 0);
        assert.ok(card.x >= 0 && card.y >= 0 && card.x + card.width <= width && card.y + card.height <= height, JSON.stringify({ width, height, card }));
        assert.equal(await page.locator(".error-board").evaluate(el => el.scrollWidth > el.clientWidth), false);
        await page.getByRole("link", { name: "Back home" }).focus();
        await page.keyboard.press("Enter");
        await page.waitForURL("http://127.0.0.1:5173/");
        await page.goto("http://127.0.0.1:5173/play", { waitUntil: "networkidle" });
        await page.screenshot({ path: `${out}/${device}-direct-play.png` });
        await page.reload({ waitUntil: "networkidle" });
        await page.getByRole("heading", { name: "The garage opens soon.", level: 1 }).waitFor();
        console.log(`${device} ${route}: standalone announcement, bounds and home navigation passed`);
        continue;
      }
      if (route === "/docs") await page.evaluate(() => window.scrollTo(0, 900));
      const originalUrl = page.url(), originalScroll = await page.evaluate(() => scrollY);
      assert.equal(await page.locator('a[href="/play"]').count(), 0);
      const triggers = route === "/" ? [".nav-play", ".launch-play"] : [".nav-play"];
      const dialog = page.getByRole("dialog", { name: "The garage opens soon." });
      for (const trigger of triggers) {
        await clickVisible(trigger);
        await dialog.waitFor();
        assert.equal(page.url(), originalUrl);
        assert.match(await dialog.innerText(), /first week of November/);
        const bounds = await dialog.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height);
        assert.equal(await dialog.evaluate(el => el.scrollWidth > el.clientWidth), false);
        assert.equal(await dialog.evaluate(el => el.scrollHeight > el.clientHeight), false);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.equal(await dialog.locator('a').getAttribute('href'), 'https://x.com/playpitlane');
        assert.equal(await dialog.locator('a').getAttribute('target'), '_blank');
        for (let i = 0; i < 5; i++) {
          await page.keyboard.press("Tab");
          assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)), "Focus escaped the modal");
        }
        await page.keyboard.press("Escape");
        assert.equal(await dialog.count(), 0);
        assert.equal(await page.locator(trigger).evaluate(el => el === document.activeElement), true);
        assert.equal(await page.evaluate(() => scrollY), originalScroll);
      }
      if (width <= 600) {
        await page.locator('.site-menu-toggle').click();
        await clickVisible('.nav-play');
        assert.equal(await page.locator('.site-menu-toggle').getAttribute('aria-expanded'), 'false');
      } else await clickVisible('.nav-play');
      await dialog.waitFor();
      // Background scrolling stays locked; clicking the announcement itself does not dismiss it.
      await page.mouse.move(5, height - 5);
      await page.mouse.wheel(0, 300);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.evaluate(() => scrollY), originalScroll);
      await dialog.getByRole('heading').click();
      assert.ok(await dialog.isVisible());
      await page.screenshot({ path: `${out}/${device}-${route === '/' ? 'home' : route.slice(1)}.png` });
      await dialog.getByRole('button', { name: 'Got it', exact: true }).click();
      assert.equal(await dialog.count(), 0);
      await clickVisible('.nav-play');
      await dialog.getByRole('button', { name: 'Close announcement' }).click();
      assert.equal(await dialog.count(), 0);
      await clickVisible('.nav-play');
      await page.mouse.click(5, 5);
      assert.equal(await dialog.count(), 0);
      assert.equal(page.url(), originalUrl);
      console.log(`${device} ${route}: announcement, bounds, focus, dismissal and unchanged URL passed`);
    }
    for (const route of ["/play/", "/play?debug=1#garage"]) {
      await page.goto(`http://127.0.0.1:5173${route}`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "The garage opens soon.", level: 1 }).waitFor();
      assert.equal(await page.locator("canvas").count(), 0);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(gameRequests, []);
    assert.deepEqual(await page.evaluate(() => window.walletCalls), []);
    await page.close();
  }
} finally { await browser.close(); }
