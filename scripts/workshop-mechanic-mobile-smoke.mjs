import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const origin = process.env.PITLANE_ORIGIN || "http://127.0.0.1:5173",
  out = "docs/qa/workshop-2026-11-01";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true }),
  results = [];
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
      if (!localStorage.getItem("pitlane.workshop.v1"))
        localStorage.setItem(
          "pitlane.workshop.v1",
          JSON.stringify({
            version: 1,
            character: "juno",
            position: { x: 9.3, z: 7.8 },
            credits: 400,
            serviced: 10,
            tools: 1,
            carried: null,
            collectProgress: 0,
            order: {
              number: 6,
              kind: "tires",
              status: "service",
              progress: {},
            },
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
              preparation: 1,
              elapsed: 0,
              starts: 1,
              completed: 1,
              rep: 2,
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
          }),
        );
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + "/play");
    await page.locator(".workshop-hud").waitFor({ timeout: 60000 });
    await page.waitForTimeout(1200);
    const stage = page.locator(".workshop-stage");
    expect(
      await page.evaluate(() => [
        document.documentElement.scrollWidth,
        document.documentElement.scrollHeight,
      ]),
    ).toEqual([width, height]);
    await page.screenshot({
      path: `${out}/mechanic-mobile-${width}x${height}.png`,
    });
    await page.locator(".workshop-crew-line:visible").tap();
    const panel = page.getByRole("dialog", { name: "Build your crew." });
    await expect(panel).toBeVisible();
    expect(await panel.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
      true,
    );
    const frozen = await stage.getAttribute("data-mechanic");
    await page.waitForTimeout(600);
    expect(await stage.getAttribute("data-mechanic")).toBe(frozen);
    await page.getByRole("button", { name: "Send on break" }).tap();
    await expect(
      page.getByRole("button", { name: "Assign to bay 01" }),
    ).toBeVisible();
    await page.screenshot({
      path: `${out}/mechanic-menu-${width}x${height}.png`,
    });
    await page.getByRole("button", { name: "Assign to bay 01" }).tap();
    await page.getByRole("button", { name: "Close team desk" }).tap();
    await expect(stage).toBeFocused();
    const before = Number(await stage.getAttribute("data-x"));
    const stick = await page.locator(".workshop-stick").boundingBox(),
      cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: stick.x + stick.width / 2 - 32, y: stick.y + stick.height / 2 },
      ],
    });
    await page.waitForTimeout(750);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForTimeout(200);
    expect(Number(await stage.getAttribute("data-x"))).toBeLessThan(
      before - 0.3,
    );
    await page.getByRole("button", { name: "Pause and settings" }).tap();
    await page.getByRole("button", { name: "Manage crew" }).tap();
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible();
    await expect(stage).toBeFocused();
    expect(errors).toEqual([]);
    results.push({
      width,
      height,
      overflow: false,
      crewManagement: true,
      pause: true,
      touchMovement: true,
      focusRestored: true,
      errors,
    });
    await context.close();
  }
  await fs.writeFile(
    out + "/mechanic-mobile.json",
    JSON.stringify(results, null, 2),
  );
  console.log("PASS", JSON.stringify(results));
} finally {
  await browser.close();
}
