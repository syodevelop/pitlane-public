// Real installed EthereumProvider + AppKit, fake HTTP catalogue and WS relay.
// No wallet, real pairing, signature or external network is used by this review.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
import { preview } from "vite";
const server = await preview({
  preview: { host: "127.0.0.1", port: 5174, strictPort: true, open: false },
});
const origin = "http://127.0.0.1:5174";
const config = {
  projectId: "1".repeat(32),
  appOrigin: origin,
  chainId: 4663,
  chainName: "Robinhood Chain",
  rpcUrl: "https://rpc.invalid/",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
};
const browser = await chromium.launch({ channel: "msedge", headless: true });
const mobile = process.argv.includes("--mobile");
const page = await browser.newPage({
  viewport: mobile
    ? { width: 390, height: 844 }
    : { width: 1440, height: 1000 },
  isMobile: mobile,
  hasTouch: mobile,
});
page.setDefaultTimeout(20000);
await page.addInitScript(() => {
  window.__testWalletLinkReady = false;
  window.open = (value) => {
    const url = new URL(String(value));
    window.__testWalletLinkReady =
      url.hostname === "wallet.invalid" &&
      (url.searchParams.get("uri") || "").startsWith("wc:");
    return null;
  };
});
const errors = [],
  http = new Set(),
  relay = new Set();
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.origin === origin) return route.continue();
  http.add(url.origin + url.pathname);
  let data = {};
  if (url.pathname.endsWith("/project-limits"))
    data = {
      planLimits: {
        tier: "starter",
        isAboveMauLimit: false,
        isAboveRpcLimit: false,
      },
    };
  else if (url.pathname.endsWith("/getWallets"))
    data = {
      data: [
        {
          id: "pitlane-test-wallet",
          name: "Test Wallet",
          supports_wc: true,
          homepage: "https://wallet.invalid",
          mobile_link: "https://wallet.invalid/wc",
          desktop_link: "https://wallet.invalid/wc",
          chains: ["eip155:4663"],
        },
      ],
      count: 1,
    };
  else if (url.pathname.endsWith("/config")) data = { features: {} };
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(data),
    headers: { "access-control-allow-origin": "*" },
  });
});
await page.routeWebSocket("**/*", (socket) => {
  if (new URL(socket.url()).hostname === "127.0.0.1") {
    socket.connectToServer();
    return;
  }
  socket.onMessage((raw) => {
    const payload = JSON.parse(String(raw));
    relay.add(payload.method);
    socket.send(
      JSON.stringify({
        id: payload.id,
        jsonrpc: "2.0",
        result: payload.method?.includes("subscribe")
          ? "test-subscription"
          : true,
      }),
    );
  });
});
await page.route("**/api/config", async (route) => {
  const response = await route.fetch();
  await route.fulfill({
    response,
    json: { ...(await response.json()), walletConnect: config },
  });
});
try {
  await page.goto(origin + "/play");
  await page
    .getByRole("button", { name: "Connect external wallet", exact: true })
    .click();
  await page.locator("w3m-modal").waitFor({ state: "visible" });
  const ready = () =>
    mobile
      ? page.getByText("Test Wallet", { exact: true }).waitFor()
      : page.getByTestId("wui-qr-code").waitFor({ state: "visible" });
  await ready();
  await fs.mkdir("docs/qa", { recursive: true });
  await page.evaluate(() => {
    const label = document.createElement("p");
    label.textContent = "SDK UI REVIEW / FAKE RELAY / NO REAL WALLET";
    label.style.cssText =
      "position:fixed;top:0;left:0;z-index:20000;background:white;color:black;padding:8px;font:12px monospace;pointer-events:none";
    document.body.append(label);
  });
  await page.screenshot({
    path: `docs/qa/appkit-${mobile ? "mobile" : "desktop"}.png`,
    fullPage: !mobile,
    animations: "disabled",
  });
  if (mobile) {
    await page.getByText("Test Wallet", { exact: true }).click();
    await page.waitForFunction(() => window.__testWalletLinkReady);
    await page.screenshot({
      path: "docs/qa/appkit-mobile-link.png",
      fullPage: false,
      animations: "disabled",
    });
  }
  assert.equal(
    await page.getByText("Continue with Google", { exact: false }).count(),
    0,
  );
  assert.equal(await page.getByText("Email", { exact: true }).count(), 0);
  await page.getByTestId("w3m-header-close").click();
  await page.getByRole("alert").filter({ hasText: "try again" }).waitFor();
  await page
    .getByRole("button", { name: "Connect external wallet", exact: true })
    .click();
  await ready();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Connect external wallet", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Connect external wallet", exact: true })
      .isEnabled(),
    true,
  );
  assert.equal(await page.locator("canvas").count(), 0);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: "Real SDK modal ready, cancel and reopen passed",
      layout: mobile ? "390px touch emulation" : "desktop",
      mobileLinkGeneratedAndIntercepted: mobile,
      fakeHttpPaths: [...http],
      fakeRelayMethods: [...relay],
      limits:
        "No actual relay/catalogue, link launch, signing or phone round trip",
    }),
  );
} catch (error) {
  await page.screenshot({
    path: "test-results/appkit-failure.png",
    fullPage: true,
  });
  console.log(
    JSON.stringify({
      errors,
      http: [...http],
      relay: [...relay],
      alert: await page.locator("[role=alert]").allTextContents(),
    }),
  );
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
