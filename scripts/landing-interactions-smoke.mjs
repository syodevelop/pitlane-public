import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 } });
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const families = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.querySelector(".home-shell"), NodeFilter.SHOW_TEXT);
    const fonts = new Set(); let node;
    while ((node = walker.nextNode())) if (node.textContent.trim()) fonts.add(getComputedStyle(node.parentElement).fontFamily.split(",")[0].replaceAll('"', ""));
    return [...fonts].sort();
  });
  assert.deepEqual(families, ["Barlow Condensed", "Exo 2"]);
  assert.equal(await page.locator("h1 strong").textContent(), "Racing team");
  assert.ok((await page.locator("h1 strong").boundingBox()).y < 410, "Second line must move to the old first-line position");
  for (const selector of ['nav a[href="/"]', 'nav a[href="/docs"]', 'nav a[href="/whitelist"]', 'nav .unconfigured-link']) {
    const item = page.locator(selector);
    const transform = () => item.evaluate(el => getComputedStyle(el, "::after").transform);
    await page.mouse.move(800, 800); await page.waitForTimeout(280);
    assert.match(await transform(), /^matrix\(0,/);
    await item.hover(); await page.waitForTimeout(280);
    assert.match(await transform(), /^matrix\(1,/);
  }
  for (const selector of [".nav-play", ".launch-play"]) {
    const button = page.locator(selector);
    await page.mouse.move(800, 800); await page.waitForTimeout(180);
    const rest = await button.boundingBox();
    await button.hover(); await page.waitForTimeout(180);
    const hover = await button.boundingBox();
    assert.ok(hover.width < rest.width && hover.y > rest.y, "Play must depress on hover");
  }
  const cta = await page.locator(".launch-play").boundingBox();
  assert.ok(cta.width > 370 && cta.height > 90, "Main CTA is substantially larger");
  await fs.mkdir("docs/qa/launch-v2", { recursive: true });
  await page.screenshot({ path: "docs/qa/launch-v2/play-hover.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await page.locator(".launch-play").evaluate(el => getComputedStyle(el).transitionDuration), "0s");
  assert.equal(await page.locator('nav a[href="/docs"]').evaluate(el => getComputedStyle(el, "::after").transitionDuration), "0s");
  console.log("Landing v2 passed: exactly two rendered font families, raised heading, no final period, larger CTA, all four hover underlines, both depressed Play buttons, reduced motion.");
} finally { await browser.close(); }
