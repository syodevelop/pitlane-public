import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const origin = process.env.PITLANE_ORIGIN || "http://127.0.0.1:5173",
  out = "docs/qa/workshop-2026-11-01";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const stage = page.locator(".workshop-stage"),
  data = () => stage.evaluate((e) => ({ ...e.dataset }));
const pressed = new Set();
async function keys(next) {
  for (const k of pressed)
    if (!next.includes(k)) {
      await page.keyboard.up(k);
      pressed.delete(k);
    }
  for (const k of next)
    if (!pressed.has(k)) {
      await page.keyboard.down(k);
      pressed.add(k);
    }
}
async function walk(x, z) {
  await stage.focus();
  const end = Date.now() + 22000;
  while (Date.now() < end) {
    const d = await data(),
      dx = x - Number(d.x),
      dz = z - Number(d.z);
    if (Math.hypot(dx, dz) < 0.21) {
      await keys([]);
      await page.waitForTimeout(300);
      return;
    }
    const a = (14 * Math.PI) / 180,
      vx = dx * Math.cos(a) - dz * Math.sin(a),
      vy = dx * Math.sin(a) + dz * Math.cos(a),
      next = [];
    if (Math.abs(vx) > 0.12) next.push(vx > 0 ? "d" : "a");
    if (Math.abs(vy) > 0.12) next.push(vy > 0 ? "s" : "w");
    await keys(next);
    await page.waitForTimeout(75);
  }
  await keys([]);
  throw Error(
    "walk timeout " + JSON.stringify({ target: { x, z }, at: await data() }),
  );
}
try {
  await page.addInitScript(() => {
    if (!localStorage.getItem("pitlane.workshop.v1"))
      localStorage.setItem(
        "pitlane.workshop.v1",
        JSON.stringify({
          version: 1,
          character: "dash",
          position: { x: 13.6, z: 7.8 },
          credits: 500,
          serviced: 10,
          tools: 1,
          carried: null,
          collectProgress: 0,
          order: {
            number: 11,
            kind: "repair",
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
        }),
      );
  });
  await page.goto(origin + "/play");
  await page.locator(".workshop-hud").waitFor({ timeout: 60000 });
  await expect(stage).toHaveAttribute("data-race-phase", "idle");
  const prep = JSON.parse((await data()).racePrepPoint);
  await walk(prep.x, prep.z);
  await expect(stage).toHaveAttribute("data-active", "team-prepare");
  await page.screenshot({ path: out + "/sprint-inspection.png" });
  await expect(stage).toHaveAttribute("data-race-preparation", "1", {
    timeout: 12000,
  });
  await walk(13.6, 8.7);
  await walk(18.45, 8.7);
  await walk(18.45, 8.25);
  await page.getByRole("button", { name: "Open team desk" }).click();
  await expect(
    page.getByRole("dialog", { name: "Build your first racer." }),
  ).toBeVisible();
  await page.screenshot({ path: out + "/sprint-desk.png" });
  await page.getByRole("button", { name: "Enter Coastal Sprint" }).click();
  await expect(stage).toHaveAttribute("data-race-phase", "leaving");
  await page.waitForTimeout(4000);
  await page.screenshot({ path: out + "/sprint-departure.png" });
  await walk(13.6, 8.7);
  await walk(13.6, 7.8);
  await walk(9.5, 7.8);
  await expect(stage).toHaveAttribute("data-race-phase", "racing", {
    timeout: 20000,
  });
  // Reload a running event: timer and outcome must not restart or award early.
  await page.reload();
  await page.locator(".workshop-hud").waitFor({ timeout: 60000 });
  await expect(stage).toHaveAttribute("data-race-phase", "racing");
  await expect(stage).toHaveAttribute("data-credits", "500");
  await page.getByRole("button", { name: "Pause and settings" }).click();
  const paused = Number((await data()).raceElapsed);
  await page.waitForTimeout(800);
  expect(Number((await data()).raceElapsed)).toBe(paused);
  await page.getByRole("button", { name: "Back to work" }).click();
  const customer = JSON.parse((await data()).points)[0];
  await walk(8.3, 9.1);
  await walk(2.5, 9.1);
  await walk(customer.x, customer.z);
  await expect(stage).toHaveAttribute("data-serviced", "11", {
    timeout: 16000,
  });
  await page.screenshot({ path: out + "/sprint-customer-during-race.png" });
  await walk(2.5, 8.7);
  await walk(9.4, 8.7);
  await walk(9.5, 7.8);
  await walk(13.6, 7.8);
  await walk(13.6, 8.7);
  await expect(stage).toHaveAttribute("data-race-phase", "returning", {
    timeout: 60000,
  });
  await page.waitForTimeout(13000);
  await page.screenshot({ path: out + "/sprint-return.png" });
  await walk(12.6, 6.5);
  await expect(stage).toHaveAttribute("data-race-phase", "result", {
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Open race report" }).click();
  await page.screenshot({ path: out + "/sprint-result.png" });
  await page.getByRole("button", { name: "Collect 70 Credits" }).click();
  await expect(stage).toHaveAttribute("data-race-rep", "2");
  await expect(stage).toHaveAttribute("data-race-completed", "1");
  const earned = Number((await data()).credits);
  expect(earned).toBeGreaterThanOrEqual(570);
  await walk(18.45, 8.7);
  await walk(18.45, 8.25);
  await page.getByRole("button", { name: "Open team desk" }).click();
  await page
    .getByRole("button", {
      name: "Upgrade Engine for 100 Credits",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Upgrade Engine for 160 Credits",
      exact: true,
    })
    .click();
  await expect(page.locator(".race-forecast")).toContainText("52 / Silver");
  await expect(
    page.getByRole("button", { name: "Inspect the car before entering" }),
  ).toBeDisabled();
  await page.screenshot({ path: out + "/sprint-upgraded.png" });
  await page.keyboard.press("Escape");
  await expect(page.locator(".race-desk")).not.toBeVisible();
  await page.reload();
  await page.locator(".workshop-hud").waitFor({ timeout: 60000 });
  await expect(stage).toHaveAttribute("data-credits", String(earned - 260));
  await expect(stage).toHaveAttribute("data-race-completed", "1");
  for (const [width, height] of [
    [390, 844],
    [320, 568],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.getByRole("button", { name: "Open team desk" }).click();
    const bounds = await page
      .locator(".race-desk")
      .evaluate((e) => ({
        scroll: e.scrollWidth,
        width: e.clientWidth,
        rect: e.getBoundingClientRect().toJSON(),
        body: document.documentElement.scrollHeight,
        view: innerHeight,
      }));
    expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1);
    expect(bounds.rect.x).toBeGreaterThanOrEqual(0);
    expect(bounds.rect.y).toBeGreaterThanOrEqual(0);
    expect(bounds.body).toBeLessThanOrEqual(bounds.view);
    await page.screenshot({ path: out + `/sprint-mobile-${width}.png` });
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() =>
        document.querySelector(".race-desk").contains(document.activeElement),
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.locator(".race-desk")).not.toBeVisible();
  }
  expect(errors).toEqual([]);
  await fs.writeFile(
    out + "/racing.json",
    JSON.stringify(
      {
        passed: true,
        inspection: true,
        departureAndReturn: true,
        customerDuringRace: true,
        pauseAndReload: true,
        resultOnce: true,
        upgradeForecast: true,
        mobile: [390, 320, 844],
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS inspection, real departure/race/return, customer work during race, save/reload, result, upgrades and mobile keyboard UI.",
  );
} catch (error) {
  await page.screenshot({ path: out + "/sprint-failure.png" }).catch(() => {});
  console.log("FAIL STATE", await data().catch(() => null));
  throw new Error(error.message.split("Call log:")[0]);
} finally {
  await keys([]).catch(() => {});
  await browser.close();
}
