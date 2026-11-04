import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const before = process.argv.includes("--before"),
  out = "docs/qa/workshop-polish-2026-11-02";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  for (const scene of ["service", "team", "performance"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await context.addInitScript((scene) => {
      localStorage.setItem(
        "pitlane.workshop.v1",
        JSON.stringify({
          version: 1,
          character:
            scene === "performance"
              ? "juno"
              : scene === "team"
                ? "dash"
                : "gus",
          position:
            scene === "performance"
              ? { x: 29.35, z: 7.8 }
              : scene === "team"
                ? { x: 18.45, z: 8.25 }
                : { x: 2.3, z: 6.8 },
          credits: 720,
          serviced: 24,
          tools: 1,
          carried: null,
          collectProgress: 0,
          order: { number: 8, kind: "tires", status: "service", progress: {} },
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
            upgrades: { engine: 1, grip: 0, reliability: 0 },
            phase: "idle",
            preparation: 0,
            elapsed: 0,
            starts: 3,
            completed: 3,
            rep: 8,
            bestScore: 40,
            run: null,
            lastResult: null,
          },
          mechanic: {
            hired: true,
            enabled: false,
            position: { x: -0.9, z: 8.5 },
            carried: null,
            collectProgress: 0,
            phase: "break",
            target: null,
            finished: 4,
            earnings: 290,
          },
          performance: {
            unlocked: true,
            number: 1,
            status: "service",
            progress: { diagnose: 1, bench: 0.3, install: 0 },
            carried: false,
            reward: false,
            completed: 0,
          },
        }),
      );
    }, scene);
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:5173/play");
    await page.locator(".workshop-hud").waitFor({ timeout: 60000 });
    await page.waitForTimeout(1600);
    await page.screenshot({
      path: `${out}/${before ? "before" : "after"}-${scene}.png`,
    });
    const data = await page
      .locator(".workshop-stage")
      .evaluate((e) => ({ ...e.dataset }));
    expect(data.cameraTilt).toBe("52");
    expect(data.cameraRotation).toBe("14");
    expect(errors).toEqual([]);
    results.push({
      scene,
      drawCalls: data.drawCalls,
      triangles: data.triangles,
      errors,
    });
    await context.close();
  }
  await fs.writeFile(
    `${out}/${before ? "before" : "after"}.json`,
    JSON.stringify(results, null, 2),
  );
  console.log(results);
} finally {
  await browser.close();
}
