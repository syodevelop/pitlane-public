// Shared home/whitelist navigation and responsive form. All submissions are mocked.
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const origin = process.env.PITLANE_TEST_ORIGIN || "http://127.0.0.1:5173";
const out = "docs/qa/whitelist-shared-scene-2026-10-28";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  for (const [width, height, name] of [
    [1440, 900, "desktop"],
    [1366, 768, "laptop"],
    [390, 844, "mobile"],
    [320, 568, "small-mobile"],
    [844, 390, "landscape"],
  ]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const completed = new Set(),
      submissions = [],
      errors = [],
      requests = [],
      documents = [];
    let receipt = null;
    await context.route("https://x.com/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "Mock social destination",
      }),
    );
    await context.route("**/api/whitelist/**", async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname;
      requests.push(path);
      if (path.endsWith("/checkpoint"))
        completed.add(request.postDataJSON().task);
      if (path.endsWith("/applications")) {
        submissions.push(request.postDataJSON());
        receipt = "mock-application";
      }
      const data = path.endsWith("/config")
        ? {
            revision: 1,
            state: "open",
            completed: [...completed],
            receipt,
            localPreview: true,
            links: Object.fromEntries(
              ["follow", "like", "repost", "quote"].map((task) => [
                task,
                `https://x.com/pitlane-test/${task}`,
              ]),
            ),
          }
        : path.endsWith("/checkpoint")
          ? { completed: [...completed] }
          : { receipt };
      await route.fulfill({ json: data });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame())
        documents.push(request.url());
    });
    page.on("popup", (popup) =>
      popup
        .waitForLoadState()
        .then(() => popup.close())
        .catch(() => {}),
    );
    const ready = async () => {
      await page.evaluate(() => document.fonts.ready);
      await page
        .locator(".landing-scene .launch-backdrop")
        .evaluate((image) => image.decode());
      await page
        .locator('.landing-whitelist[data-active="true"]')
        .evaluate(async (el) => {
          await Promise.all(
            el
              .getAnimations()
              .map((animation) => animation.finished.catch(() => {})),
          );
        })
        .catch(() => {});
    };
    const bounds = async (label) => {
      const panel = await page.locator(".wl-panel").boundingBox(),
        header = await page.locator(".site-header").boundingBox();
      assert.ok(
        panel.x >= 0 &&
          panel.y >= header.height &&
          panel.x + panel.width <= width + 1 &&
          panel.y + panel.height <= height + 1,
        JSON.stringify({ name, label, panel, header }),
      );
      assert.equal(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth > innerWidth ||
            document.documentElement.scrollHeight > innerHeight,
        ),
        false,
        `${name} ${label} document overflow`,
      );
      assert.equal(
        await page
          .locator(".wl-panel")
          .evaluate((el) => el.scrollWidth > el.clientWidth),
        false,
      );
    };
    const menu = async () => {
      if (width <= 600)
        await page.getByRole("button", { name: "Menu" }).click();
    };
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    assert.equal(
      requests.length,
      0,
      "Home must not load whitelist data before the first visit",
    );
    await page.evaluate(() => {
      window.sceneMarker = document.querySelector(
        ".landing-scene .launch-backdrop",
      );
    });
    const initialBackground = await page
      .locator(".landing-scene .launch-backdrop")
      .boundingBox();
    await menu();
    await page.getByRole("link", { name: "Whitelist", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/whitelist`);
    await ready();
    await expect(
      page.getByRole("heading", { name: "Whitelist Form" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Build your Racing team" }),
    ).toHaveCount(0);
    assert.equal(
      await page.evaluate(
        () =>
          window.sceneMarker ===
          document.querySelector(".landing-scene .launch-backdrop"),
      ),
      true,
    );
    assert.deepEqual(
      await page.locator(".landing-scene .launch-backdrop").boundingBox(),
      initialBackground,
    );
    assert.equal(await page.locator(".launch-backdrop").count(), 1);
    assert.equal(await page.locator(".wl-scene").count(), 0);
    if (width <= 600)
      await expect(page.getByRole("button", { name: "Menu" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    await bounds("checklist");
    await page.screenshot({ path: `${out}/${name}-checklist.png` });
    await expect(
      page.getByRole("button", { name: /02 Your details/ }),
    ).toBeDisabled();
    await page.locator("#wl-panel-title").focus();
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() => !!document.activeElement.closest(".wl-tasks")),
      true,
      "Tab moves from the heading into the task links",
    );
    for (const task of ["Follow", "Like", "Repost", "Quote"]) {
      const link = page.getByRole("link", {
        name: new RegExp(`^${task}.*opens in a new tab`),
      });
      await link.click();
    }
    await expect(page.locator(".wl-task.is-complete")).toHaveCount(4);
    await page.locator(".wl-tasks + .wl-primary").click();
    await page.getByLabel("Your X handle").fill("@pitlane_test");
    await page
      .getByLabel("Your EVM wallet address")
      .fill("0x1111111111111111111111111111111111111111");
    await page
      .getByLabel("Why do you want to join Pitlane?")
      .fill("Shared garage scene test");
    await bounds("details");
    await page.screenshot({ path: `${out}/${name}-details.png` });
    await page.goBack();
    await expect(page).toHaveURL(`${origin}/`);
    await expect(
      page.getByRole("heading", { name: "Whitelist Form" }),
    ).toHaveCount(0);
    await page.goForward();
    await expect(page).toHaveURL(`${origin}/whitelist`);
    await ready();
    await expect(page.getByLabel("Your X handle")).toHaveValue("@pitlane_test");
    await page.getByRole("link", { name: "Back to home", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/`);
    await menu();
    await page.getByRole("link", { name: "Whitelist", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Your X handle")).toHaveValue("@pitlane_test");
    assert.equal(
      documents.length,
      1,
      "No document reloads while switching between the two routes",
    );
    const configCalls = requests.filter((url) =>
      url.endsWith("/config"),
    ).length;
    assert.ok(
      configCalls <= 2,
      "Kept form should not reload its config (StrictMode runs mount twice in dev)",
    );
    await page.getByRole("button", { name: "Submit for Whitelist" }).click();
    await expect(
      page.getByRole("heading", { name: "Application received." }),
    ).toBeVisible();
    assert.equal(submissions.length, 1);
    assert.equal(submissions[0].handle, "@pitlane_test");
    await bounds("received");

    // Fresh direct navigation gets the form immediately, with its own entrance animation.
    completed.clear();
    receipt = null;
    await page.goto(`${origin}/whitelist`, { waitUntil: "domcontentloaded" });
    await page.locator(".landing-whitelist").waitFor({ state: "attached" });
    const animation = await page
      .locator(".landing-whitelist")
      .evaluate((el) => {
        const css = getComputedStyle(el);
        return [css.animationName, css.animationDuration];
      });
    assert.deepEqual(animation, ["whitelist-arrive", "0.38s"]);
    assert.equal(await page.locator(".landing-home").getAttribute("inert"), "");
    await ready();
    await expect(
      page.getByRole("heading", { name: "Whitelist Form" }),
    ).toBeVisible();
    await page.reload({ waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: "Whitelist Form" }),
    ).toBeVisible();
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await page
        .locator(".landing-whitelist")
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    assert.deepEqual(errors, []);
    results.push({
      name,
      viewport: [width, height],
      sharedBackground: true,
      history: true,
      preservedDraft: true,
      directEntrance: animation,
      reducedMotion: true,
      mockSubmission: true,
      overflow: false,
    });
    console.log(`${name}: passed`);
    await context.close();
  }
} finally {
  await browser.close();
}
await fs.writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
