// Real local Worker and real timers. Session checkpoint is ignored; no key is saved.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { chromium } from "@playwright/test";
import {
  SERVICES,
  STATIONS,
  ANNEX,
  BALANCE_VERSION,
} from "../packages/game-core/index.ts";
const origin = "http://127.0.0.1:5173",
  base = origin + "/api/",
  file = "test-results/annex-live-session.json";
await fs.mkdir("test-results", { recursive: true });
let saved = await fs
    .readFile(file, "utf8")
    .then(JSON.parse)
    .catch((e) => {
      if (e.code === "ENOENT") return { phase: "earn" };
      throw e;
    }),
  state;
const checkpoint = () => fs.writeFile(file, JSON.stringify(saved));
async function request(path, data) {
  const r = await fetch(base + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      ...(saved.address ? { "X-Pitlane-Account": saved.address } : {}),
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
      ...(saved.cookie ? { Cookie: saved.cookie } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const body = await r.json();
  assert.equal(r.status, 200, JSON.stringify(body));
  if (r.headers.get("set-cookie")) {
    saved.cookie = r.headers.get("set-cookie").split(";")[0];
    await checkpoint();
  }
  return body;
}
assert.equal((await request("health")).environment, "local");
if (!saved.cookie) {
  const account = privateKeyToAccount(generatePrivateKey());
  saved.address = account.address;
  const challenge = await request("auth/challenge", {
    address: account.address,
  });
  const signature = await account.signMessage({ message: challenge.message });
  await request("auth/verify", {
    address: account.address,
    message: challenge.message,
    signature,
  });
}
const refresh = async () => (state = (await request("state")).state);
await refresh();
async function send(command) {
  if (!saved.pending) {
    saved.pending = {
      schemaVersion: 2,
      ruleset: BALANCE_VERSION,
      generation: state.progress.generation,
      id: crypto.randomUUID(),
      version: state.progress.revision,
      command,
    };
    await checkpoint();
  }
  state = (await request("command", saved.pending)).state;
  delete saved.pending;
  await checkpoint();
}
if (saved.pending) await send(saved.pending.command);
if (!state.profile.character) await send({ type: "select", character: "Gus" });
async function until(predicate, timeout = 180000) {
  const end = Date.now() + timeout;
  while (!predicate(await refresh())) {
    assert(Date.now() < end, "Timed out waiting for real Worker");
    await new Promise((r) => setTimeout(r, 1000));
  }
}
async function idle(id) {
  await until(
    (g) => !g.progress.actors[id].travel && !g.progress.actors[id].taskId,
  );
}
async function move(id, target) {
  await idle(id);
  const a = state.progress.actors[id];
  if (Math.hypot(a.position.x - target.x, a.position.y - target.y) < 1) return;
  await send({ type: "navigate", actorId: id, target });
  await until((g) => !g.progress.actors[id].travel);
  assert.deepEqual(state.progress.actors[id].position, target);
}
async function deliver(id, station, position, needed) {
  const stock = () =>
    position === 0
      ? state.progress.stock[station]
      : (state.progress.secondaryStock?.[station] ?? 0);
  while (stock() < needed) {
    if (!state.progress.actors[id].carrying) {
      await move(id, STATIONS.stock);
      await send({ type: "pickUp", actorId: id, station: "stock", amount: 2 });
      await idle(id);
    }
    await move(id, position === 0 ? STATIONS[station] : ANNEX[station]);
    await send({
      type: "putDown",
      actorId: id,
      station,
      amount: Math.min(state.progress.actors[id].carrying, needed - stock()),
    });
  }
  await move(id, position === 0 ? STATIONS[station] : ANNEX[station]);
}
async function finishJob(jobId) {
  while (state.progress.jobs[jobId].status !== "completed") {
    const job = state.progress.jobs[jobId];
    if (job.status === "working") {
      await idle("player");
      continue;
    }
    const step = SERVICES[job.kind].steps[job.step];
    await deliver("player", step.station, 0, step.parts);
    await send({
      type: "startWork",
      actorId: "player",
      kind: "service",
      jobId,
    });
    console.log(
      "Started " + SERVICES[job.kind].label + " step " + (job.step + 1) + ".",
    );
    await idle("player");
  }
  console.log(
    "Completed order. Credits " +
      state.progress.credits +
      " / REP " +
      state.progress.rep +
      ".",
  );
}
if (saved.phase === "earn") {
  while (
    state.progress.credits < 1200 ||
    Object.values(state.progress.jobs).some((j) => j.status !== "completed")
  ) {
    let job = Object.values(state.progress.jobs).find(
      (j) => j.status === "accepted" || j.status === "working",
    );
    if (!job) {
      await move("player", STATIONS.reception);
      await send({ type: "interact", station: "reception" });
      job = Object.values(state.progress.jobs).find(
        (j) => j.status === "offered",
      );
      assert(job);
      await send({ type: "acceptService", jobId: job.id });
    }
    await finishJob(job.id);
  }
  saved.phase = "invest";
  await checkpoint();
}
if (saved.phase === "invest") {
  await move("player", STATIONS.reception);
  if (!Object.values(state.progress.actors).some((a) => a.role === "Mechanic"))
    await send({ type: "hire", role: "Mechanic" });
  if (!state.progress.upgrades.capacity)
    await send({ type: "upgrade", target: "capacity" });
  saved.helper = Object.values(state.progress.actors).find(
    (a) => a.role === "Mechanic",
  ).id;
  saved.phase = "prepare";
  await checkpoint();
  console.log("Earned purchase complete: Mechanic and Customer capacity.");
}
if (saved.phase === "prepare") {
  await move("player", STATIONS.reception);
  await send({ type: "interact", station: "reception" });
  let jobs = Object.values(state.progress.jobs).filter(
    (j) => j.kind === "tires" && j.status === "accepted",
  );
  while (jobs.length < 2) {
    const offered = Object.values(state.progress.jobs).find(
      (j) => j.kind === "tires" && j.status === "offered",
    );
    assert(offered, "A balanced new pack must offer two Tires");
    await send({ type: "acceptService", jobId: offered.id });
    jobs = Object.values(state.progress.jobs).filter(
      (j) => j.kind === "tires" && j.status === "accepted",
    );
  }
  saved.jobs = jobs.map((j) => j.id);
  await deliver("player", "tires", 0, 1);
  await deliver(saved.helper, "tires", 1, 1);
  saved.before = {
    credits: state.progress.credits,
    rep: state.progress.rep,
    primary: state.progress.stock.tires,
    secondary: state.progress.secondaryStock.tires,
  };
  saved.phase = "start";
  await checkpoint();
}
if (saved.phase === "start") {
  for (const [i, id] of ["player", saved.helper].entries())
    if (state.progress.jobs[saved.jobs[i]].status === "accepted")
      await send({
        type: "startWork",
        actorId: id,
        kind: "service",
        jobId: saved.jobs[i],
      });
  const tasks = ["player", saved.helper].map(
    (id) => state.progress.tasks[state.progress.actors[id].taskId],
  );
  assert(
    tasks.every((t) => t?.status === "started"),
    "Both tasks must truly be concurrent",
  );
  assert.deepEqual(
    tasks.map((t) => t.workPosition),
    [0, 1],
  );
  assert.equal(state.progress.stock.tires, saved.before.primary - 1);
  assert.equal(state.progress.secondaryStock.tires, saved.before.secondary - 1);
  saved.tasks = tasks.map((t) => ({
    id: t.id,
    endsAt: t.endsAt,
    workPosition: t.workPosition,
  }));
  saved.phase = "capture";
  await checkpoint();
}
if (saved.phase === "capture") {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const split = saved.cookie.indexOf("=");
    await context.addCookies([
      {
        name: saved.cookie.slice(0, split),
        value: saved.cookie.slice(split + 1),
        url: origin,
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);
    await context.addInitScript((address) => {
      window.ethereum = {
        request: async ({ method }) => {
          if (["eth_accounts", "eth_requestAccounts"].includes(method))
            return [address];
          if (method === "eth_chainId") return "0x1237";
          throw Error("No new signature expected");
        },
        on() {},
        removeListener() {},
      };
    }, saved.address);
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + "/play");
    if (
      await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .isVisible()
    )
      await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
    await page.locator("canvas").waitFor();
    await refresh();
    assert(
      saved.tasks.every(
        (t) => state.progress.tasks[t.id]?.status === "started",
      ),
      "Capture must occur during actual work",
    );
    await fs.mkdir("docs/qa", { recursive: true });
    await page
      .locator(".garage-visual")
      .screenshot({ path: "docs/qa/annex-live-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel("Controlled worker").selectOption(saved.helper);
    await page.waitForFunction(
      () => document.querySelector("canvas")?.width === 550,
    );
    await page.waitForTimeout(250);
    await page
      .locator(".garage-visual")
      .screenshot({ path: "docs/qa/annex-live-mobile.png" });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.reload();
    await page.locator("canvas").waitFor();
    await refresh();
    for (const t of saved.tasks)
      assert.equal(state.progress.tasks[t.id].endsAt, t.endsAt);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
  saved.phase = "settle";
  await checkpoint();
}
await until((g) =>
  saved.tasks.every((t) => g.progress.tasks[t.id]?.status === "completed"),
);
assert.equal(state.progress.credits, saved.before.credits + 160);
assert.equal(state.progress.rep, saved.before.rep + 20);
const result = {
  credits: state.progress.credits,
  rep: state.progress.rep,
  completed: state.progress.completed,
  upgrades: state.progress.upgrades,
  tasks: saved.tasks,
  checks: [
    "real SIWE",
    "earned capacity and helper",
    "separate physical stock",
    "two concurrent server tasks",
    "desktop/mobile",
    "reload preserves endsAt",
    "exact +160 Credits/+20 REP",
  ],
};
await refresh();
assert.equal(state.progress.rep, result.rep);
await fs.writeFile(
  "docs/qa/annex-live-result.json",
  JSON.stringify(result, null, 2) + "\n",
);
await request("auth/logout", {});
await fs.unlink(file);
console.log("Annex live passed: " + JSON.stringify(result));
