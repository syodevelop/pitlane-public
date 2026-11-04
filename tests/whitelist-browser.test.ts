import { it, expect } from "vitest";
import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { fixture, links } from "./whitelist-fixture";
import { SITE } from "../shared/site";
import { postIntentLinks } from "../shared/whitelist";

// Opt-in browser QA uses the actual route handler + an isolated SQLite database.
// No public X actions, campaign settings or player data are changed.
it.skipIf(process.env.PITLANE_WHITELIST_BROWSER !== "1")(
  "whitelist: admin, four link clicks, form, saved receipt, responsive layout",
  async () => {
    const out = "docs/qa/launch-whitelist-2026-10-28";
    const postId = "2114015920498823592";
    const intents = postIntentLinks(postId)!;
    await mkdir(out, { recursive: true });
    const browser = await chromium.launch({
      channel: "msedge",
      headless: true,
    });
    const base = "http://127.0.0.1:5173";
    const errors: string[] = [];
    try {
      for (const [width, height, label] of [
        [1440, 900, "desktop"],
        [1366, 768, "laptop"],
        [390, 844, "mobile"],
        [360, 640, "small"],
        [844, 390, "landscape"],
        [320, 568, "tiny"],
      ] as const) {
        const f = fixture();
        const context = await browser.newContext({
          viewport: { width, height },
          acceptDownloads: true,
        });
        await context.route("**/api/**", async (route) => {
          const request = route.request();
          const req = new Request(request.url(), {
            method: request.method(),
            headers: await request.allHeaders(),
            body: request.postData(),
          });
          const response = await f.run(req);
          if (!response)
            throw new Error(
              "Unexpected non-whitelist API call: " + request.url(),
            );
          await route.fulfill({
            status: response.status,
            headers: Object.fromEntries(response.headers),
            body: await response.text(),
          });
        });
        await context.route("https://x.com/**", (route) =>
          route.fulfill({
            status: 200,
            contentType: "text/html",
            body: "<p>Local QA destination. No X action performed.</p>",
          }),
        );
        await context.addInitScript(() => {
          Object.defineProperty(window, "ethereum", {
            get() {
              throw Error("Unexpected wallet access");
            },
          });
        });
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        page.on("pageerror", (e) => errors.push(e.message));
        const goto = async (path: string) => {
          await page.goto(base + path, { waitUntil: "networkidle" });
          await page.evaluate(() => document.fonts.ready);
        };
        const fits = async () => {
          await page.mouse.wheel(0, 600);
          const metrics = await page.locator(".wl-panel").evaluate((el) => ({
            top: el.getBoundingClientRect().top,
            bottom: el.getBoundingClientRect().bottom,
            header: document.querySelector("header")!.getBoundingClientRect()
              .bottom,
            h: innerHeight,
            w: innerWidth,
            sw: document.documentElement.scrollWidth,
            sh: document.documentElement.scrollHeight,
            y: scrollY,
          }));
          expect(metrics.top).toBeGreaterThanOrEqual(metrics.header);
          expect(metrics.bottom).toBeLessThanOrEqual(metrics.h);
          expect([metrics.sw, metrics.sh, metrics.y]).toEqual([
            metrics.w,
            metrics.h,
            0,
          ]);
        };
        await goto("/whitelist");
        expect(
          await page
            .getByRole("button", { name: "02 Your details", exact: true })
            .isDisabled(),
        ).toBe(true);
        await page
          .getByRole("button", { name: "02 Your details", exact: true })
          .evaluate((el) => (el as HTMLButtonElement).click());
        expect(await page.locator(".wl-form").count()).toBe(0);
        expect(await page.locator(".whitelist-page").innerText()).not.toMatch(
          /coming soon|preview form|official task links|exclusive|community perks|front.row seat|what.s next|click a task|about the collection/i,
        );
        expect(
          await page.locator(".wl-panel-footer > a").getAttribute("href"),
        ).toBe("/docs#overview");
        expect(
          await page
            .locator(".wl-panel-description")
            .evaluate((el) => getComputedStyle(el).fontFamily),
        ).toContain("Barlow Condensed");
        await fits();
        await page.screenshot({ path: `${out}/${label}-unconfigured.png` });
        await goto(SITE.adminPath);
        await page
          .getByLabel("X profile URL", { exact: true })
          .fill(links.follow);
        await page.getByLabel("Post ID", { exact: true }).fill(postId);
        await page.getByText("Generated task links", { exact: true }).click();
        for (const [id, title] of [
          ["like", "Like"],
          ["repost", "Repost"],
          ["quote", "Quote"],
        ] as const) {
          const input = page.getByLabel(`${title} intent link`, {
            exact: true,
          });
          expect(await input.inputValue()).toBe(intents[id]);
          expect(await input.getAttribute("readonly")).not.toBeNull();
        }
        await page.getByRole("combobox").selectOption("open");
        await page
          .getByRole("button", { name: "Save campaign", exact: true })
          .click();
        await page
          .getByRole("status")
          .filter({ hasText: "Settings saved" })
          .waitFor();
        await page.reload({ waitUntil: "networkidle" });
        expect(
          await page.getByLabel("Post ID", { exact: true }).inputValue(),
        ).toBe(postId);
        expect(
          await page.getByLabel("X profile URL", { exact: true }).inputValue(),
        ).toBe(links.follow);
        await page.screenshot({
          path: `${out}/${label}-admin.png`,
          fullPage: true,
        });
        await goto("/whitelist");
        await fits();
        await page.screenshot({ path: `${out}/${label}-open.png` });
        expect(
          await page
            .getByRole("button", { name: "Your details", exact: true })
            .isDisabled(),
        ).toBe(true);
        const before = await page.evaluate(async () => {
          const res = await fetch("/api/whitelist/applications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              revision: 2,
              wallet: "0x" + "1".repeat(40),
              handle: "qa",
            }),
          });
          return res.status;
        });
        expect(before).toBe(409);
        for (let i = 0; i < 4; i++) {
          const task = page.locator("a.wl-task").nth(i);
          const popupPromise = page.waitForEvent("popup");
          if (i === 0) {
            await task.focus();
            await page.keyboard.press("Enter");
          } else await task.click();
          const popup = await popupPromise;
          await popup.waitForLoadState();
          expect(popup.url()).toBe(
            [links.follow, intents.like, intents.repost, intents.quote][i],
          );
          await popup.close();
          await page.waitForFunction(
            (count) =>
              document.querySelectorAll(".wl-task.is-complete").length ===
              count,
            i + 1,
          );
          expect(
            await page
              .getByRole("button", { name: "02 Your details", exact: true })
              .isDisabled(),
          ).toBe(i < 3);
          expect(
            await page
              .getByRole("button", { name: "Your details", exact: true })
              .isDisabled(),
          ).toBe(i < 3);
          if (i === 2) {
            await page.reload({ waitUntil: "networkidle" });
            expect(await page.locator(".wl-task.is-complete").count()).toBe(3);
            expect(await page.locator(".wl-form").count()).toBe(0);
            expect(
              await page
                .getByRole("button", { name: "02 Your details", exact: true })
                .isDisabled(),
            ).toBe(true);
          }
        }
        await page
          .getByRole("button", { name: "Your details", exact: true })
          .click();
        expect(
          await page
            .locator("#wl-panel-title")
            .evaluate((el) => el === document.activeElement),
        ).toBe(true);
        await fits();
        await page.screenshot({ path: `${out}/${label}-form.png` });
        await page.reload({ waitUntil: "networkidle" });
        await page.getByLabel("Your EVM wallet address").fill("invalid");
        await page.getByLabel("Your X handle").fill("@crew_test");
        await page
          .getByRole("button", { name: "Submit for Whitelist" })
          .click();
        expect(
          await page
            .locator("input[name=wallet]")
            .evaluate((el) => (el as HTMLInputElement).validity.valid),
        ).toBe(false);
        await page
          .getByLabel("Your EVM wallet address")
          .fill("0x" + "0".repeat(40));
        await page
          .getByRole("button", { name: "Submit for Whitelist" })
          .click();
        await page
          .getByRole("alert")
          .filter({ hasText: "valid Ethereum" })
          .waitFor();
        await fits();
        await page.screenshot({ path: `${out}/${label}-validation.png` });
        await page
          .getByLabel("Your EVM wallet address")
          .fill("0x" + "1".repeat(40));
        await page
          .getByLabel("Why do you want to join Pitlane?")
          .fill("The cars and the crew. QA fixture.");
        await page
          .getByRole("button", { name: "Submit for Whitelist" })
          .click();
        await page
          .getByRole("heading", { name: "Application received." })
          .waitFor();
        await fits();
        await page.screenshot({ path: `${out}/${label}-received.png` });
        await page.reload({ waitUntil: "networkidle" });
        await page
          .getByRole("heading", { name: "Application received." })
          .waitFor();
        await goto(SITE.adminPath);
        await page
          .getByRole("cell", { name: "@crew_test", exact: true })
          .waitFor();
        const downloadPromise = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export all CSV" }).click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toBe("pitlane-whitelist.csv");
        expect(await readFile((await download.path())!, "utf8")).toBe(
          `handle,wallet\r\n"crew_test","0x${"1".repeat(40)}"\r\n`,
        );
        await context.close();
        f.sql.close();
      }
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  },
  120000,
);
