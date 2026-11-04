import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";

const origin = process.env.PITLANE_ORIGIN || "http://127.0.0.1:5173";
const out = "docs/qa/workshop-2026-11-02";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  for (const [width, height] of [
    [390, 844],
    [320, 568],
    [844, 390],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    await context.addInitScript(() => {
      if (localStorage.getItem("pitlane.workshop.v1")) return;
      localStorage.setItem(
        "pitlane.workshop.v1",
        JSON.stringify({
          version: 1,
          character: "juno",
          position: { x: 29.35, z: 6.5 },
          credits: 400,
          serviced: 18,
          tools: 1,
          carried: null,
          collectProgress: 0,
          order: { number: 7, kind: "repair", status: "service", progress: {} },
          reward: null,
          milestoneSeen: true,
          team: {
            unlocked: true,
            progress: {
              "team-front-left": 1,
              "team-front-right": 1,
              "team-engine": 1,
            },
          },
          racing: {
            upgrades: { engine: 0, grip: 0, reliability: 0 },
            phase: "idle",
            preparation: 0,
            elapsed: 0,
            starts: 3,
            completed: 3,
            rep: 6,
            bestScore: 40,
            run: null,
            lastResult: null,
          },
          mechanic: {
            hired: true,
            enabled: true,
            position: { x: -0.9, z: 8.5 },
            carried: null,
            collectProgress: 0,
            phase: "idle",
            target: null,
            finished: 0,
            earnings: 0,
          },
          performance: {
            unlocked: true,
            number: 1,
            status: "service",
            progress: { diagnose: 1, bench: 0.1, install: 0 },
            carried: false,
            reward: false,
            completed: 0,
          },
        }),
      );
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const stage = page.locator(".workshop-stage");
    try {
      await page.goto(origin + "/play");
      await page.locator(".workshop-hud").waitFor({ timeout: 60000 });
      await page.waitForFunction(
        () =>
          JSON.parse(
            document.querySelector(".workshop-stage").dataset.performance,
          ).progress.bench > 0.2,
      );
      await page.screenshot({
        path: `${out}/performance-mobile-bench-${width}x${height}.png`,
      });
      await page.getByRole("button", { name: "Pause and settings" }).tap();
      const frozen = await stage.getAttribute("data-performance");
      await page.waitForTimeout(600);
      expect(await stage.getAttribute("data-performance")).toBe(frozen);
      await page.getByRole("button", { name: "Manage crew" }).tap();
      const panel = page.getByRole("dialog", { name: "Build your crew." });
      await expect(panel).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(stage).toBeFocused();
      await page.waitForFunction(
        () =>
          JSON.parse(
            document.querySelector(".workshop-stage").dataset.performance,
          ).carried,
      );
      await expect(
        page.getByLabel("Carrying rebuilt alternator"),
      ).toBeVisible();
      await page.screenshot({
        path: `${out}/performance-mobile-carry-${width}x${height}.png`,
      });
      expect(
        await page.evaluate(() => [
          document.documentElement.scrollWidth,
          document.documentElement.scrollHeight,
        ]),
      ).toEqual([width, height]);
      const ticket = page.getByRole("region", {
        name: "Performance customer job",
      });
      expect(await ticket.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
        true,
      );
      const ticketBox = await ticket.boundingBox();
      expect(ticketBox.y).toBeGreaterThanOrEqual(0);
      expect(ticketBox.y + ticketBox.height).toBeLessThanOrEqual(height);
      const before = Number(await stage.getAttribute("data-z"));
      const stick = await page.locator(".workshop-stick").boundingBox();
      expect(ticketBox.y + ticketBox.height).toBeLessThan(stick.y - 8);
      const cdp = await context.newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 + 32 },
        ],
      });
      await page.waitForTimeout(650);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await page.waitForTimeout(200);
      expect(Number(await stage.getAttribute("data-z"))).toBeGreaterThan(
        before + 0.3,
      );
      await page.reload();
      await page.locator(".workshop-hud").waitFor({ timeout: 60000 });
      expect(
        JSON.parse(await stage.getAttribute("data-performance")).carried,
      ).toBe(true);
      await expect(stage).toHaveAttribute("data-character", "juno");
      expect(errors).toEqual([]);
      results.push({
        width,
        height,
        overflow: false,
        repair: true,
        carryReload: true,
        pause: true,
        touchMovement: true,
        focusRestored: true,
        errors,
      });
    } catch (error) {
      await page
        .screenshot({
          path: `${out}/performance-mobile-failure-${width}x${height}.png`,
        })
        .catch(() => {});
      throw error;
    } finally {
      await context.close();
    }
  }
  await fs.writeFile(
    out + "/performance-mobile.json",
    JSON.stringify(results, null, 2),
  );
  console.log("PASS", JSON.stringify(results));
} finally {
  await browser.close();
}
