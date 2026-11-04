import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const account = privateKeyToAccount(generatePrivateKey());
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
let loads = 0,
  releaseSign,
  startedSign;
const errors = [],
  methods = [];
const config = {
  projectId: "1".repeat(32),
  appOrigin: "http://127.0.0.1:5173",
  chainId: 4663,
  chainName: "Robinhood Chain",
  rpcUrl: "https://rpc.invalid/",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
};
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.exposeFunction("externalTestSign", async (encoded) => {
    startedSign?.();
    await new Promise((resolve) => {
      releaseSign = resolve;
    });
    return account.signMessage({ message: { raw: encoded } });
  });
  await page.route("**/api/config", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, walletConnect: config } });
  });
  // No real connector credentials or relay access. Replace only the adapter
  // boundary; use the real UI/session hook and local Worker for authentication.
  await page.route("**/src/external-wallet.ts*", async (route) => {
    loads++;
    await route.fulfill({
      contentType: "text/javascript",
      body: `
      const listeners=new Map();
      const emit=name=>{for(const cb of listeners.get(name)||[])cb()};
      const account=${JSON.stringify(account.address)};
      let connected=sessionStorage.getItem('mock:external-connected')==='yes';
      const methods=[];window.externalTestMethods=methods;
      const provider={
        on(name,callback){const set=listeners.get(name)||new Set();set.add(callback);listeners.set(name,set)},
        removeListener(name,callback){listeners.get(name)?.delete(callback)},
        async enable(){
          if(connected)return[account];
          const dialog=document.createElement('dialog');dialog.innerHTML='<p>TEST CONNECTOR / no real wallet or relay</p><button>Test approve</button><button>Test cancel</button>';document.body.append(dialog);dialog.showModal();
          return new Promise((resolve,reject)=>{
            dialog.querySelectorAll('button')[0].onclick=()=>{connected=true;sessionStorage.setItem('mock:external-connected','yes');emit('accountsChanged');emit('chainChanged');dialog.remove();resolve([account])};
            dialog.querySelectorAll('button')[1].onclick=()=>{dialog.remove();reject(Error('Connection cancelled. Try again.'))};
          });
        },
        async request({method,params}){methods.push(method);if(method==='eth_accounts')return connected?[account]:[];if(method==='eth_chainId')return '0x1237';if(method==='personal_sign')return window.externalTestSign(params[0]);throw Error('Unexpected wallet method '+method)},
        async disconnect(){connected=false;sessionStorage.removeItem('mock:external-connected');emit('disconnect')}
      };
      export async function externalWallet(config){if(config.appOrigin!==location.origin)throw Error('Wrong origin');return provider}
    `,
    });
  });
  await page.goto("http://127.0.0.1:5173/play");
  const connect = page.getByRole("button", {
    name: "Connect external wallet",
    exact: true,
  });
  await connect.waitFor();
  assert.equal(await connect.isEnabled(), true);
  assert.equal(loads, 0);
  assert.equal(await page.evaluate(() => typeof window.ethereum), "undefined");
  await connect.tap();
  await page.getByRole("button", { name: "Test cancel", exact: true }).tap();
  await page.getByRole("alert").filter({ hasText: "cancelled" }).waitFor();
  assert.equal(await page.locator("canvas").count(), 0);
  await connect.tap();
  await page.getByRole("button", { name: "Test approve", exact: true }).tap();
  await page.getByText("Connected, not signed in", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Change wallet", exact: true }).tap();
  assert.equal(
    await page.evaluate(() =>
      sessionStorage.getItem("mock:external-connected"),
    ),
    null,
  );
  await connect.tap();
  await page.getByRole("button", { name: "Test approve", exact: true }).tap();
  await page.getByText("Connected, not signed in", { exact: false }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Choose Gus", exact: true }).count(),
    0,
  );
  // A normal browser app switch does not cancel the pending personal_sign.
  const started = new Promise((resolve) => {
    startedSign = resolve;
  });
  await page
    .getByRole("button", { name: "Sign in to Pitlane", exact: true })
    .tap();
  await started;
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(150);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  releaseSign();
  await page.getByRole("button", { name: "Choose Dash", exact: true }).tap();
  await page.getByRole("button", { name: "Confirm Dash", exact: true }).tap();
  await page.locator("canvas").waitFor();
  methods.push(...(await page.evaluate(() => window.externalTestMethods)));
  assert.equal(loads, 1);
  await page.reload();
  await page.locator("canvas").waitFor();
  assert.equal(loads, 2); // Same-tab connector choice restores; no automatic new pairing.
  assert.equal(
    await page
      .getByRole("button", { name: "Test approve", exact: true })
      .count(),
    0,
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).tap();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .waitFor();
  methods.push(...(await page.evaluate(() => window.externalTestMethods)));
  assert.ok(methods.includes("personal_sign"));
  assert.ok(
    methods.every((method) =>
      ["eth_accounts", "eth_chainId", "personal_sign"].includes(method),
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "External adapter browser boundary passed: lazy load, no injected wallet, cancel/retry, connect alone does not authenticate, pending signature on blur/focus, real SIWE, Dash selection, same-tab reload, logout and 390px touch layout. Adapter/modal simulated; no real relay, QR, deep link or phone round trip tested.",
  );
} finally {
  await browser.close();
}
