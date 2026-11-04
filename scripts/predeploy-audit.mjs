import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
const origin = "http://127.0.0.1:8877";
const site = JSON.parse(await readFile("config/site.json", "utf8"));
const out = "docs/qa/predeploy-2026-10-28";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const result = { routes: [], viewports: [], performance: [], errors: [] };
try {
  const context = await browser.newContext({
    extraHTTPHeaders: {
      "CF-Connecting-IP": `192.0.2.${Math.floor(Math.random() * 250) + 1}`,
    },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => result.errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !/Failed to load resource/.test(message.text())
    )
      result.errors.push(message.text());
  });
  for (const [path, status] of [
    ["/", 200],
    ["/docs", 200],
    ["/whitelist", 200],
    ["/play", 200],
    ["/privacy", 404],
    ["/terms", 404],
    [site.adminPath, 200],
    ["/missing-page", 404],
    ["/admin", 404],
    ["/unavailable", 503],
  ]) {
    const response = await page.goto(origin + path, {
      waitUntil: "networkidle",
    });
    assert.equal(response.status(), status, path);
    assert.equal(await page.title(), "Pitlane");
    await expect(page.locator("main:visible h1")).toBeVisible();
    assert.equal(response.headers()["x-content-type-options"], "nosniff");
    assert.ok(
      response
        .headers()
        ["content-security-policy"].includes("frame-ancestors 'none'"),
    );
    const html = await response.text();
    assert.ok(html.includes('property="og:image"'));
    result.routes.push({ path, status, title: "Pitlane" });
  }
  for (const [path, type] of [
    ["/robots.txt", "text/plain"],
    ["/sitemap.xml", "application/xml"],
    ["/favicon.ico", "image/"],
    ["/brand/pitlane-share-v1.jpg", "image/jpeg"],
    ["/site.webmanifest", "application/manifest"],
    ["/fonts/Barlow-Condensed-italic-latin.woff2", "font/woff2"],
  ]) {
    const response = await context.request.get(origin + path);
    assert.equal(response.status(), 200, path);
    assert.ok(
      response.headers()["content-type"].includes(type),
      JSON.stringify({ path, type: response.headers()["content-type"] }),
    );
  }
  assert.equal(
    (
      await context.request.get(
        origin + "/api/admin/whitelist/applications.csv",
      )
    ).status(),
    401,
  );
  await page.goto(origin + site.adminPath);
  await page.getByLabel("Admin password").fill("wrong-password");
  await page.getByRole("button", { name: "Open admin" }).click();
  await expect(page.getByRole("alert")).toHaveText("Incorrect password.");
  await page.getByLabel("Admin password").fill("Synthetic-QA-password-2026!");
  await page.getByRole("button", { name: "Open admin" }).click();
  await expect(
    page.getByRole("heading", { name: "Task destinations" }),
  ).toBeVisible();
  await page.getByLabel("X profile URL").fill("https://x.com/playpitlane");
  await page.getByLabel("Post ID", { exact: true }).fill("2114015920498823592");
  await page.getByRole("combobox").selectOption("open");
  await page.getByRole("button", { name: "Save campaign" }).click();
  await expect(page.getByRole("status")).toContainText("Settings saved");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Task destinations" }),
  ).toBeVisible();
  result.admin = {
    passwordLogin: true,
    sessionSurvivesReload: true,
    unauthenticatedExportDenied: true,
  };

  for (const [width, height] of [
    [1440, 900],
    [1366, 768],
    [768, 1024],
    [390, 844],
    [360, 640],
    [320, 568],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    for (const path of ["/", "/docs", "/whitelist", "/missing-page", "/play"]) {
      await page.goto(origin + path, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${path}: horizontal overflow at ${width}`,
      );
      if (path === "/") {
        assert.ok(await page.locator(".launch-play").isVisible());
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollHeight <= innerHeight,
          ),
          `Home vertical overflow at ${width}`,
        );
        await page.screenshot({ path: `${out}/home-${width}x${height}.png` });
      }
      if (path === "/whitelist")
        await page.screenshot({
          path: `${out}/whitelist-${width}x${height}.png`,
        });
    }
    result.viewports.push({ width, height, passed: true });
  }

  const visitor = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await visitor.route("https://x.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "Local social-link fixture. No action on X.",
    }),
  );
  const form = await visitor.newPage();
  form.on("pageerror", (error) => result.errors.push(error.message));
  form.on("popup", (popup) =>
    popup
      .waitForLoadState()
      .then(() => popup.close())
      .catch(() => {}),
  );
  await form.goto(origin + "/whitelist", { waitUntil: "networkidle" });
  for (const task of ["Follow", "Like", "Repost", "Quote"])
    await form
      .getByRole("link", { name: new RegExp(`^${task}.*opens in a new tab`) })
      .tap();
  await expect(form.locator(".wl-task.is-complete")).toHaveCount(4);
  await form.getByRole("button", { name: "Your details", exact: true }).tap();
  const wallet = "0x" + Date.now().toString(16).padStart(40, "1");
  const handle = "qa_" + Date.now().toString(36);
  await form.getByLabel("Your EVM wallet address").fill(wallet);
  await form.getByLabel("Your X handle").fill(handle);
  await form
    .getByLabel("Why do you want to join Pitlane?")
    .fill("Isolated predeployment test.");
  await form.getByRole("button", { name: "Submit for Whitelist" }).tap();
  await expect(
    form.getByRole("heading", { name: "Application received." }),
  ).toBeVisible();
  await form.reload();
  await expect(
    form.getByRole("heading", { name: "Application received." }),
  ).toBeVisible();
  await form.screenshot({
    path: `${out}/mobile-receipt.png`,
    animations: "disabled",
  });
  await page.goto(origin + site.adminPath, { waitUntil: "networkidle" });
  await expect(
    page.getByRole("cell", { name: "@" + handle, exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export all CSV" }).click();
  const download = await downloadPromise;
  const csv = await readFile(await download.path(), "utf8");
  assert.ok(csv.includes(`"${handle}","${wallet}"`));
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Admin password")).toBeVisible();
  assert.equal(
    (
      await context.request.get(
        origin + "/api/admin/whitelist/applications.csv",
      )
    ).status(),
    401,
  );
  result.whitelist = {
    realLocalWorker: true,
    realLocalD1: true,
    submitted: true,
    receiptAfterReload: true,
    visibleInAdmin: true,
    exported: true,
    logoutRevoked: true,
  };
  await visitor.close();

  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const reading = await noScript.newPage();
  await reading.goto(origin + "/docs");
  await expect(reading.locator("main h1")).toBeVisible();
  await noScript.close();
  result.withoutJavaScript = true;
  const broken = await browser.newContext({ serviceWorkers: "block" });
  await broken.route("**/assets/*.js", (route) => route.abort());
  const brokenPage = await broken.newPage();
  await brokenPage.goto(origin + "/");
  await expect(brokenPage.locator(".boot-notice[role=alert]")).toContainText(
    "could not finish loading",
    { timeout: 18000 },
  );
  result.missingJavaScriptFallback = true;
  await broken.close();
  await page.goto(origin + "/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.goto(origin + "/docs");
  await expect(
    page.getByRole("heading", { name: "You're offline." }),
  ).toBeVisible();
  result.offlineFallback = true;
  await context.setOffline(false);
  await context.close();

  for (const profile of [
    { name: "desktop", width: 1440, height: 900, cpu: 1, latency: 0, mbps: 0 },
    {
      name: "mobile-4g",
      width: 390,
      height: 844,
      cpu: 4,
      latency: 80,
      mbps: 4,
    },
  ]) {
    for (let run = 1; run <= 3; run++) {
      const ctx = await browser.newContext({
        viewport: { width: profile.width, height: profile.height },
        isMobile: profile.name !== "desktop",
        hasTouch: profile.name !== "desktop",
        serviceWorkers: "block",
      });
      const pg = await ctx.newPage();
      const cdp = await ctx.newCDPSession(pg);
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
      if (profile.mbps)
        await cdp.send("Network.emulateNetworkConditions", {
          offline: false,
          latency: profile.latency,
          downloadThroughput: (profile.mbps * 1000000) / 8,
          uploadThroughput: 1000000 / 8,
          connectionType: "cellular4g",
        });
      await pg.addInitScript(() => {
        window.audit = {
          lcp: 0,
          cls: 0,
          longTasks: [],
          interactions: [],
          shifts: [],
        };
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) window.audit.lcp = e.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries())
            if (!e.hadRecentInput) {
              window.audit.cls += e.value;
              window.audit.shifts.push({
                value: e.value,
                nodes: e.sources?.map((s) => s.node?.className),
              });
            }
        }).observe({ type: "layout-shift", buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries())
            window.audit.longTasks.push(e.duration);
        }).observe({ type: "longtask", buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries())
            if (e.interactionId) window.audit.interactions.push(e.duration);
        }).observe({ type: "event", buffered: true, durationThreshold: 16 });
      });
      await pg.goto(origin, { waitUntil: "networkidle" });
      await pg.evaluate(() => document.fonts.ready);
      await pg.locator(".launch-backdrop").evaluate((img) => img.decode());
      await pg.locator(".launch-play").click();
      await pg.keyboard.press("Escape");
      const metrics = await pg.evaluate(() => ({
        ...window.audit,
        fcp: performance.getEntriesByName("first-contentful-paint")[0]
          ?.startTime,
        resources: performance
          .getEntriesByType("resource")
          .map((r) => ({
            name: new URL(r.name).pathname,
            size: r.encodedBodySize,
            duration: r.duration,
            responseEnd: r.responseEnd,
          })),
      }));
      metrics.jsGzipBytes = 0;
      for (const resource of metrics.resources.filter(
        (r) => r.name.endsWith(".js") && r.name.startsWith("/assets/"),
      ))
        metrics.jsGzipBytes += gzipSync(
          await readFile("dist" + resource.name),
        ).length;
      result.performance.push({ profile: profile.name, run, ...metrics });
      await ctx.close();
    }
  }
  assert.deepEqual(result.errors, []);
  console.log(
    JSON.stringify(
      {
        routes: result.routes.length,
        viewports: result.viewports.length,
        whitelist: result.whitelist,
        performance: result.performance.map(
          ({
            profile,
            run,
            lcp,
            cls,
            fcp,
            longTasks,
            interactions,
            jsGzipBytes,
          }) => ({
            profile,
            run,
            lcp,
            cls,
            fcp,
            longTasks,
            interactions,
            jsGzipBytes,
          }),
        ),
      },
      null,
      2,
    ),
  );
} catch (error) {
  result.failure = String(error.stack || error);
  throw error;
} finally {
  await writeFile(`${out}/results.json`, JSON.stringify(result, null, 2));
  await browser.close();
}
