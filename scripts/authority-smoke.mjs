// Real isolated local Worker, D1 and persisted SQLite. No owner saves or remote resources.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { DatabaseSync } from "node:sqlite";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { STATIONS } from "../packages/game-core/map.ts";
const root = path.resolve("test-results", `authority-${Date.now()}`);
fs.mkdirSync(root, { recursive: true });
const persistence = path.join(root, "state"),
  port = 8789,
  inspector = 9232;
const origin = "http://127.0.0.1:5173",
  base = `http://127.0.0.1:${port}/api/`;
const account = privateKeyToAccount(generatePrivateKey());
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let child,
  cookie = "",
  state,
  starts = 0;
// GET reports its observation time even when it settles no transition.
const gameplay = (progress) => JSON.stringify({ ...progress, lastNow: 0 });
async function vacant(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  await new Promise((resolve) => server.close(resolve));
}
async function start() {
  await vacant(port);
  await vacant(inspector);
  const log = fs.openSync(path.join(root, `worker-${++starts}.log`), "w");
  child = spawn(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "dev",
      "--local",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--inspector-port",
      String(inspector),
      "--persist-to",
      persistence,
    ],
    {
      windowsHide: true,
      stdio: ["ignore", log, log],
      env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "true" },
    },
  );
  fs.closeSync(log);
  for (let attempt = 0; attempt < 50; attempt++) {
    assert.equal(child.exitCode, null, "Worker exited; inspect isolated log");
    try {
      if (
        (await fetch(base + "health", { signal: AbortSignal.timeout(500) })).ok
      )
        return;
    } catch {}
    await sleep(400);
  }
  throw Error("Isolated Worker did not become ready");
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const ended = new Promise((resolve) => child.once("exit", resolve));
  if (process.platform === "win32")
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  else child.kill();
  await ended;
  child = undefined;
  await sleep(300);
}
async function req(route, data, expected = 200, headers = {}) {
  const response = await fetch(base + route, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      "X-Pitlane-Account": account.address,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const body = await response.json();
  assert.equal(response.status, expected, body.error || route);
  if (response.headers.has("set-cookie"))
    cookie = response.headers.get("set-cookie").split(";")[0];
  return body;
}
const envelope = (command) => ({
  schemaVersion: 2,
  ruleset: "garage-v0.2-prototype",
  generation: state.progress.generation,
  id: crypto.randomUUID(),
  version: state.progress.revision,
  command,
});
async function command(command) {
  const result = await req("command", envelope(command));
  state = result.state;
  return result;
}
async function move(station) {
  await command({
    type: "navigate",
    actorId: "player",
    target: STATIONS[station],
  });
  const travel = state.progress.actors.player.travel;
  if (travel) await sleep(Math.max(0, travel.endsAt - Date.now() + 100));
  state = (await req("state")).state;
}
async function finishWork({ restart = false, expireActivity = false } = {}) {
  const id = state.progress.actors.player.taskId;
  const task = state.progress.tasks[id];
  assert.equal(task.status, "started");
  await req("command", envelope({ type: "completeWork", taskId: id }), 409);
  const until = Math.max(
    task.endsAt + 150,
    expireActivity ? Date.now() + 91_000 : 0,
  );
  if (restart) await stop();
  console.log(
    `Waiting for real ${task.kind} deadline${restart ? " with Worker stopped" : ""}.`,
  );
  await sleep(Math.max(0, until - Date.now()));
  if (restart) await start();
  state = (await req("state")).state;
  assert.equal(state.progress.tasks[id].status, "completed");
  assert.equal(state.progress.tasks[id].endsAt, task.endsAt);
  const completed = gameplay(state.progress);
  state = (await req("state")).state;
  assert.equal(gameplay(state.progress), completed);
}
async function collect() {
  await move("stock");
  await command({
    type: "pickUp",
    actorId: "player",
    station: "stock",
    amount: 2,
  });
  await finishWork();
}
async function finishStageSix() {
  console.log(
    "Full stage-6 acceptance: earned Credits, scored service, restoration, preparation, race and concurrent spending. No balance or clock overrides.",
  );
  await start();
  state = (await req("state")).state;
  await move("reception");
  const offered = Object.values(state.progress.jobs).filter(
    (job) => job.kind === "tires" || job.kind === "quick",
  );
  const first = offered.find((job) => job.kind === "tires"),
    waiting = offered.find((job) => job.kind === "quick");
  await command({ type: "acceptService", jobId: first.id });
  await command({ type: "acceptService", jobId: waiting.id });
  const orders = [
    first,
    waiting,
    ...offered.filter((job) => job.id !== first.id && job.id !== waiting.id),
  ];
  for (let index = 0; index < orders.length; index++) {
    const job = orders[index];
    if (index > 1) {
      await move("reception");
      await command({ type: "acceptService", jobId: job.id });
    }
    if (!state.progress.actors.player.carrying) await collect();
    await move(job.kind);
    await command({
      type: "putDown",
      actorId: "player",
      station: job.kind,
      amount: 1,
    });
    const repBefore = state.progress.rep,
      creditsBefore = state.progress.credits;
    const steps = job.kind === "quick" ? 2 : 1;
    for (let step = 0; step < steps; step++) {
      await command({
        type: "startWork",
        actorId: "player",
        kind: "service",
        jobId: job.id,
      });
      await finishWork({ restart: index === 0, expireActivity: index === 0 });
    }
    assert.equal(state.progress.rep, repBefore + job.rep);
    assert.equal(state.progress.credits, creditsBefore + job.credits);
    if (index === 0) {
      assert.equal(state.progress.jobs[waiting.id].status, "accepted");
      assert.equal(state.progress.jobs[waiting.id].step, 0);
      assert.equal(
        Object.values(state.progress.tasks).filter(
          (task) => task.status === "started",
        ).length,
        0,
      );
    }
  }
  assert.equal(state.progress.credits, 400);
  assert.equal(state.progress.rep, 50);
  await move("reception");
  const purchase = envelope({ type: "upgrade", target: "quickTools" });
  const rival = { ...purchase, id: crypto.randomUUID() };
  const send = async (body) => {
    const response = await fetch(base + "command", {
      method: "POST",
      headers: {
        Origin: origin,
        "X-Pitlane-Account": account.address,
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
      request: body,
    };
  };
  const results = await Promise.all([send(purchase), send(rival)]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  const winner = results.find((result) => result.status === 200);
  state = winner.body.state;
  assert.equal(state.progress.credits, 0);
  assert.equal(state.progress.upgrades.quickTools, 1);
  assert.equal((await req("command", winner.request)).duplicate, true);
  await collect();
  await move("starter");
  await command({
    type: "putDown",
    actorId: "player",
    station: "starter",
    amount: 2,
  });
  const carId = Object.values(state.progress.cars).find(
    (car) => car.source === "starter",
  ).id;
  await command({
    type: "startWork",
    actorId: "player",
    kind: "restore",
    carId,
  });
  await finishWork({ restart: true });
  assert.equal(state.progress.cars[carId].restored, true);
  await collect();
  await move("starter");
  await command({
    type: "putDown",
    actorId: "player",
    station: "starter",
    amount: 1,
  });
  await command({
    type: "startWork",
    actorId: "player",
    kind: "prepare",
    carId,
    preparation: "sprint",
  });
  await finishWork();
  await move("race");
  await command({ type: "dispatchRace", carId, kind: "tutorial" });
  const race = Object.values(state.progress.races).find(
    (race) => race.status === "started",
  );
  const raceStart = {
    rep: state.progress.rep,
    credits: state.progress.credits,
  };
  await req("command", envelope({ type: "resolveRace", raceId: race.id }), 409);
  await req(
    "command",
    envelope({ type: "dispatchRace", carId, kind: "tutorial" }),
    409,
  );
  await stop();
  console.log("Tutorial race started; Worker stopped until its real deadline.");
  await sleep(Math.max(0, race.endsAt - Date.now() + 150));
  await start();
  state = (await req("state")).state;
  assert.equal(state.progress.races[race.id].status, "completed");
  assert.deepEqual(state.progress.races[race.id].inputs, race.inputs);
  assert.equal(state.progress.rep, raceStart.rep + race.rep);
  assert.equal(state.progress.credits, raceStart.credits + race.credits);
  assert.equal(state.progress.races[race.id].contributionWeight, 0);
  const final = gameplay(state.progress);
  state = (await req("state")).state;
  assert.equal(gameplay(state.progress), final);
  assert.equal(
    Object.values(state.progress.races).filter(
      (race) => race.status === "started",
    ).length,
    0,
  );
  await stop();
  console.log(
    "Full stage-6 acceptance passed: queued work stayed unstarted after grace; service/restoration/race survived process restart; early completion and parallel race rejected; concurrent 400-Credit spending committed once; repeated settlement added no rewards.",
  );
}
function databases(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { recursive: true })
    .filter((file) => file.endsWith(".sqlite"))
    .map((file) => path.join(directory, file));
}
function findDatabase(table) {
  for (const file of databases(persistence)) {
    const db = new DatabaseSync(file);
    if (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(table)
    )
      return db;
    db.close();
  }
  throw Error(`Isolated database with ${table} not found`);
}
try {
  // Intentionally omit the D1 migration first: the projection is unavailable.
  await start();
  const challenge = await req("auth/challenge", { address: account.address });
  const signature = await account.signMessage({ message: challenge.message });
  await req("auth/verify", {
    address: account.address,
    message: challenge.message,
    signature,
  });
  state = (await req("state")).state;
  await command({ type: "select", character: "Gus" });
  const beat = {
    schemaVersion: 2,
    ruleset: "garage-v0.2-prototype",
    generation: state.progress.generation,
  };
  const before = gameplay(state.progress);
  const active = await req("heartbeat", beat);
  assert.equal(active.activeUntil - active.now, 90_000);
  await req("heartbeat", { ...beat, now: 0 }, 400);
  await req("heartbeat", { ...beat, generation: "retired" }, 409);
  await req("heartbeat", beat, 401, {
    "X-Pitlane-Account": "0x2222222222222222222222222222222222222222",
  });
  state = (await req("state")).state;
  assert.equal(
    gameplay(state.progress),
    before,
    "Heartbeat must not mutate gameplay",
  );
  await command({ type: "move", actorId: "player", target: { x: 95, y: 100 } });
  await sleep(2500);
  state = (await req("state")).state;
  const pickup = envelope({
    type: "pickUp",
    actorId: "player",
    station: "stock",
    amount: 2,
  });
  state = (await req("command", pickup)).state;
  const taskId = state.progress.actors.player.taskId,
    deadline = state.progress.tasks[taskId].endsAt;
  await req("command", envelope({ type: "completeWork", taskId }), 409);
  await stop();
  let source = findDatabase("game_outbox");
  assert.ok(
    source
      .prepare(
        "SELECT count(*) AS n FROM game_outbox WHERE delivered_at IS NULL",
      )
      .get().n > 0,
  );
  assert.ok(
    source.prepare("SELECT attempts FROM projection_delivery").get().attempts >
      0,
    "D1 failure must be recorded",
  );
  source.close();
  const migration = spawnSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "migrations",
      "apply",
      "PROJECTIONS",
      "--local",
      "--persist-to",
      persistence,
    ],
    {
      windowsHide: true,
      encoding: "utf8",
      env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
    },
  );
  assert.equal(migration.status, 0, "Local migration failed");
  await start();
  await sleep(Math.max(0, deadline - Date.now() + 200));
  state = (await req("state")).state;
  assert.equal(state.progress.actors.player.carrying, 2);
  assert.equal(state.progress.rep, 0);
  assert.equal(state.progress.tasks[taskId].endsAt, deadline);
  const completed = gameplay(state.progress);
  const duplicate = await req("command", pickup);
  assert.equal(duplicate.duplicate, true);
  assert.equal(gameplay(duplicate.state.progress), completed);
  await sleep(12_000);
  await stop();
  source = findDatabase("game_outbox");
  assert.equal(
    source
      .prepare(
        "SELECT count(*) AS n FROM game_outbox WHERE delivered_at IS NULL",
      )
      .get().n,
    0,
  );
  const eventCount = source
    .prepare("SELECT count(*) AS n FROM game_outbox")
    .get().n;
  // Simulate lost acknowledgement after successful D1 commit, not new gameplay.
  source.exec(
    "UPDATE game_outbox SET delivered_at=NULL; UPDATE projection_delivery SET attempts=0,next_at=0",
  );
  source.close();
  await start();
  await req("state");
  await sleep(3000);
  await stop();
  const projection = findDatabase("player_events");
  assert.equal(
    projection.prepare("SELECT count(*) AS n FROM player_events").get().n,
    eventCount,
  );
  projection.close();
  source = findDatabase("game_outbox");
  assert.equal(
    source
      .prepare(
        "SELECT count(*) AS n FROM game_outbox WHERE delivered_at IS NULL",
      )
      .get().n,
    0,
  );
  source.close();
  // Conflicting content under the same key must fail, never silently overwrite.
  source = findDatabase("game_outbox");
  const original = source
    .prepare("SELECT id,payload FROM game_outbox LIMIT 1")
    .get();
  source.exec(
    "UPDATE game_outbox SET delivered_at=NULL; UPDATE projection_delivery SET attempts=0,next_at=0",
  );
  source.close();
  let conflicting = findDatabase("player_events");
  conflicting
    .prepare(
      "UPDATE player_events SET payload='conflicting-test-fixture' WHERE event_id=?",
    )
    .run(original.id);
  conflicting.close();
  await start();
  await req("state");
  await sleep(2500);
  await stop();
  source = findDatabase("game_outbox");
  assert.ok(
    source.prepare("SELECT attempts FROM projection_delivery").get().attempts >
      0,
  );
  assert.equal(
    source
      .prepare(
        "SELECT count(*) AS n FROM game_outbox WHERE delivered_at IS NULL",
      )
      .get().n,
    eventCount,
  );
  source.close();
  conflicting = findDatabase("player_events");
  conflicting
    .prepare("UPDATE player_events SET payload=? WHERE event_id=?")
    .run(original.payload, original.id);
  conflicting.close();
  await start();
  await req("state");
  await sleep(8000);
  await stop();
  source = findDatabase("game_outbox");
  assert.equal(
    source
      .prepare(
        "SELECT count(*) AS n FROM game_outbox WHERE delivered_at IS NULL",
      )
      .get().n,
    0,
  );
  source.close();
  if (process.argv.includes("--full")) await finishStageSix();
  console.log(
    "Authority passed: real Worker restart preserves a started deadline; offline stock settles once; heartbeat has no gameplay effect; wrong actor/context rejected; unavailable D1 preserves progress; recovery and lost-ack replay deliver each event once; conflicting projection payload blocks acknowledgement until repaired. Isolated local resources only.",
  );
} finally {
  await stop();
}
