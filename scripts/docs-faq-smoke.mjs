// Focused public-content QA. No game session, wallet login or monetary actions.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { SITE } from "../shared/site.ts";

const base = process.env.PITLANE_PREVIEW_URL || "http://127.0.0.1:5173";
const output = "docs/qa/docs-text-only-2026-10-26";
const source = await fs.readFile("src/content/docs.en.md", "utf8");
const anchors = [...source.matchAll(/<a id="([a-z0-9-]+)"><\/a>/g)].map(
  (match) => match[1],
);
assert.equal(anchors.length, 13);
assert.equal(new Set(anchors).size, 13);
await fs.mkdir(output, { recursive: true });

// Real scrollbar geometry matters: hiding scrollbars masks root-gutter/vw shifts.
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  ignoreDefaultArgs: ["--hide-scrollbars"],
});
const errors = [],
  requests = [];
const results = [];
try {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.walletCalls = [];
    window.ethereum = {
      request: async (args) => {
        window.walletCalls.push(args);
        throw Error("Unexpected wallet request");
      },
    };
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      path.startsWith("/api/") ||
      /\/src\/(Play|Garage|GarageGame)\.(tsx|ts)$/.test(path)
    )
      requests.push(path);
  });
  const goto = async (path) => {
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
  };
  const noOverflow = async () =>
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `Page overflow: ${page.url()}`,
    );
  const headerGeometry = () =>
    page.locator(".site-header").evaluate((header) =>
      [...header.querySelectorAll(".wordmark, .site-menu-toggle, nav > a, .nav-play")]
        .filter((el) => el.getClientRects().length && getComputedStyle(el).visibility === "visible")
        .map((el) => {
          const box = el.getBoundingClientRect(),
            style = getComputedStyle(el);
          return {
            text: el.textContent.trim(),
            rect: [box.x, box.y, box.width, box.height].map(
              (value) => Math.round(value * 10) / 10,
            ),
            font: el.textContent.trim() ? [
              style.fontFamily,
              style.fontSize,
              style.fontWeight,
              style.letterSpacing,
            ] : null,
          };
        }),
    );
  const targetVisible = async (id) => {
    const bounds = await page.locator(`[id="${id}"]`).boundingBox();
    const header = await page.locator("header").boundingBox();
    // At the document end, the browser cannot scroll a short final section
    // any higher. Its heading must still be fully visible below the header.
    const atDocumentEnd = await page.evaluate(
      () => scrollY > 0 && scrollY + innerHeight >= document.documentElement.scrollHeight - 2,
    );
    assert.ok(
      bounds.y >= header.height &&
        (bounds.y < header.height + 80 ||
          (atDocumentEnd && bounds.y + bounds.height <= page.viewportSize().height)),
      `${id} hidden or misplaced: ${bounds.y}`,
    );
  };

  for (const [width, height, device] of [
    [1440, 1000, "desktop"],
    [390, 844, "mobile"],
  ]) {
    await page.setViewportSize({ width, height });
    await goto("/");
    await page.mouse.wheel(0, 900);
    assert.deepEqual(
      await page.evaluate(() => [
        document.documentElement.scrollWidth,
        document.documentElement.scrollHeight,
        scrollY,
      ]),
      [width, height, 0],
    );
    const underline = await page.locator("header .wordmark").evaluate((el) => {
      const style = getComputedStyle(el, "::after");
      return {
        background: style.backgroundColor,
        width: parseFloat(style.width),
        right: parseFloat(style.right),
      };
    });
    assert.equal(underline.background, "rgb(255, 46, 38)");
    assert.ok(underline.width > 0 && underline.right > 0);
    await page.screenshot({ path: `${output}/home-${device}.png` });
    const homeHeader = await headerGeometry();

    if (device === "mobile") await page.locator(".site-menu-toggle").click();
    await page.locator('#site-navigation a[href="/docs"]').click();
    await page.waitForURL(base + "/docs");
    await page.evaluate(() => document.fonts.ready);
    if (device === "desktop")
      assert.ok(
        await page.evaluate(() => document.documentElement.clientWidth < innerWidth),
        "Docs regression check must include a real document scrollbar",
      );
    assert.deepEqual(
      await headerGeometry(),
      homeHeader,
      "Docs header must match Home exactly",
    );
    await noOverflow();
    assert.equal(await page.locator("article > section").count(), 13);
    assert.equal(await page.locator("article img, article figure, article figcaption").count(), 0);
    assert.equal(await page.locator('a[href="/faq"]').count(), 0);
    assert.equal(await page.locator(".guide-notice").count(), 0);
    assert.equal(
      await page
        .locator("footer")
        .innerText()
        .then((text) => text.includes("LOCAL PREVIEW")),
      false,
    );
    assert.equal(
      await page.locator("#site-navigation .site-nav-social").getAttribute("href"),
      SITE.xUrl,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollHeight > innerHeight,
      ),
    );
    // Every source paragraph, heading, list entry and table cell is retained.
    const rendered = (await page.locator("main").innerText()).replace(
      /\s+/g,
      " ",
    );
    for (const line of source.split(/\r?\n/)) {
      if (!line.trim() || /^# |^<a |^\|[-:|]+\|$/.test(line)) continue;
      const bits = line.startsWith("|")
        ? line.slice(1, -1).split("|")
        : [line.replace(/^(?:#{2,3} |[>-] )/, "")];
      for (const bit of bits) {
        const plain = bit.replace(/\*\*/g, "").trim().replace(/\s+/g, " ");
        assert.ok(rendered.includes(plain), `Missing Docs text: ${plain}`);
      }
    }
    await page.screenshot({ path: `${output}/docs-${device}.png` });
    if (device === "mobile") {
      const contents = page.locator(".guide-mobile-index");
      await contents.locator("summary").focus();
      await page.keyboard.press("Enter");
      assert.ok(await contents.evaluate((el) => el.open));
      await contents.getByRole("link", { name: /Starter packs/ }).click();
      await page.waitForURL("**/docs#starter-packs");
      assert.equal(await contents.evaluate((el) => el.open), false);
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        "starter-packs",
      );
      await targetVisible("starter-packs");
      await noOverflow();
      assert.ok(
        await page
          .locator(".guide-table-scroll")
          .first()
          .evaluate((el) => el.scrollWidth > el.clientWidth),
      );
      const menu = page.locator(".site-menu-toggle");
      await menu.click();
      assert.equal(await menu.getAttribute("aria-expanded"), "true");
      assert.ok(
        await page
          .locator(".site-header")
          .getByRole("button", { name: "Play", exact: true })
          .isVisible(),
      );
      await page.keyboard.press("Escape");
      assert.equal(
        await page
          .getByRole("button", { name: /^Menu/ })
          .getAttribute("aria-expanded"),
        "false",
      );
      assert.equal(
        await page.evaluate(() => document.activeElement.className),
        "site-menu-toggle",
      );
    } else {
      for (const id of anchors) {
        await page.locator(`.guide-index a[href="#${id}"]`).click();
        await page.waitForURL(`**/docs#${id}`);
        await targetVisible(id);
        assert.equal(await page.evaluate(() => document.activeElement.id), id);
      }
      await page.locator('.guide-index a[href="#safety"][aria-current="location"]').waitFor();
    }
    await goto("/docs#balances-and-payments");
    await targetVisible("balances-and-payments");
    await page.reload({ waitUntil: "networkidle" });
    await targetVisible("balances-and-payments");

    assert.deepEqual(await page.evaluate(() => window.walletCalls), []);
    await goto("/faq");
    await page.getByRole("heading", { name: "Off the racing line." }).waitFor();
    assert.equal(await page.locator('a[href="/faq"]').count(), 0);
    await noOverflow();
    results.push(
      `${device} ${width}×${height}: identical header geometry, text-only Docs, reading, layout, keyboard, deep links, home fixed, FAQ removed`,
    );
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(
    requests,
    [],
    "Public guides must not request game state or load Play",
  );
  await fs.writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        base,
        results,
        anchors,
        pageErrors: errors,
        gameRequests: requests,
      },
      null,
      2,
    ),
  );
  console.log(results.join("\n"));
} finally {
  await browser.close();
}
