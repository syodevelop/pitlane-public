import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
const out = "docs/qa/whitelist-final-copy-2026-10-25";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error(e.message));
  for (const [width, height, label] of [
    [1440, 900, "desktop"],
    [1366, 768, "laptop"],
    [390, 844, "mobile"],
    [360, 640, "small"],
    [844, 390, "landscape"],
    [320, 568, "tiny"],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("http://127.0.0.1:5173/whitelist", {
      waitUntil: "networkidle",
    });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${out}/${label}-live.png` });
    console.log(
      label,
      await page.locator(".wl-panel").evaluate((e) => ({
        top: e.getBoundingClientRect().top,
        bottom: e.getBoundingClientRect().bottom,
        height: innerHeight,
        scroll: document.documentElement.scrollHeight,
        alert: document.querySelector("[role=alert]")?.textContent,
      })),
    );
  }
} finally {
  await browser.close();
}
