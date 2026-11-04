import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const origin = "http://127.0.0.1:8877";
const out = "docs/qa/predeploy-2026-10-28";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const checks = [];
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.route("https://x.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "Local social fixture" }),
  );
  let failConfig = true,
    failCheckpoint = true,
    loseSubmission = true;
  await context.route("**/api/whitelist/config", (route) =>
    failConfig
      ? route.fulfill({
          status: 503,
          contentType: "text/html",
          body: "Temporary outage",
        })
      : route.continue(),
  );
  await context.route("**/api/whitelist/checkpoint", (route) => {
    if (failCheckpoint) {
      failCheckpoint = false;
      return route.abort();
    }
    return route.continue();
  });
  await context.route("**/api/whitelist/applications", async (route) => {
    if (loseSubmission) {
      loseSubmission = false;
      const response = await route.fetch();
      assert.equal(response.status(), 201);
      await route.abort();
    } else await route.continue();
  });
  const page = await context.newPage();
  page.on("popup", (popup) =>
    popup
      .waitForLoadState()
      .then(() => popup.close())
      .catch(() => {}),
  );
  await page.goto(origin + "/whitelist");
  await expect(page.getByRole("alert")).toContainText("could not be loaded");
  failConfig = false;
  await page.getByRole("button", { name: /Try again/ }).click();
  const follow = page.getByRole("link", {
    name: /^Follow.*opens in a new tab/,
  });
  await follow.click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".wl-task.is-complete")).toHaveCount(0);
  await follow.click();
  for (const name of ["Like", "Repost", "Quote"])
    await page
      .getByRole("link", { name: new RegExp(`^${name}.*opens in a new tab`) })
      .click();
  await expect(page.locator(".wl-task.is-complete")).toHaveCount(4);
  checks.push(
    "configuration retry",
    "failed checkpoint stays incomplete",
    "checkpoint retry",
  );
  await page.getByRole("button", { name: "Your details", exact: true }).click();
  const handle = "qa_" + Date.now().toString(36),
    wallet = "0x" + Date.now().toString(16).padStart(40, "2");
  await page.getByLabel("Your X handle").fill(handle);
  await page.getByLabel("Your EVM wallet address").fill(wallet);
  await page.setViewportSize({ width: 390, height: 360 });
  await page
    .getByLabel("Why do you want to join Pitlane?")
    .fill("Keyboard-height test.");
  const submit = page.getByRole("button", { name: "Submit for Whitelist" });
  await submit.scrollIntoViewIfNeeded();
  const box = await submit.boundingBox();
  assert.ok(
    box.y >= 0 && box.y + box.height <= 360,
    JSON.stringify({ keyboardSubmit: box }),
  );
  const panel = await page.locator(".wl-panel").boundingBox(),
    header = await page.locator("header").boundingBox();
  assert.ok(
    panel.y >= header.y + header.height,
    "Keyboard-height form must stay below the header",
  );
  assert.ok(
    panel.y + panel.height <= 360,
    "Keyboard-height form must stay inside the viewport",
  );
  await page.screenshot({
    path: `${out}/mobile-keyboard-height.png`,
    animations: "disabled",
  });
  checks.push("form reachable with keyboard-height viewport");
  await submit.click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Your X handle")).toHaveValue(handle);
  await expect(page.getByLabel("Your EVM wallet address")).toHaveValue(wallet);
  await submit.click();
  await expect(
    page.getByRole("heading", { name: "Application received." }),
  ).toBeVisible();
  checks.push(
    "lost submission response preserves fields",
    "retry returns the saved application",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `${out}/mobile-receipt-final.png`,
    animations: "disabled",
  });
  await writeFile(`${out}/recovery.json`, JSON.stringify(checks, null, 2));
  console.log(checks.join("\n"));
} finally {
  await browser.close();
}
