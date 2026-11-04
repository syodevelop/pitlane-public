import { spawn } from "node:child_process";
import assert from "node:assert/strict";
// A separate test-only port; never stop an existing preview or touch saves.
const child = spawn(process.execPath, ["scripts/local-web.mjs"], {
  env: { ...process.env, PITLANE_WEB_PORT: "5174" },
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});
let output = "";
child.stdout.on("data", (b) => (output += b.toString()));
child.stderr.on("data", (b) => (output += b.toString()));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  let ready = false;
  for (let i = 0; i < 30; i++) {
    assert.equal(child.exitCode, null, output);
    if (output.includes("127.0.0.1:5174")) {
      ready = true;
      break;
    }
    await wait(300);
  }
  assert.ok(ready, output);
  assert.equal((await fetch("http://127.0.0.1:5174/play")).status, 200);
  child.stdin.end();
  await wait(1500);
  assert.ok(
    output.includes("Terminal input closed"),
    "Test must observe actual stdin EOF. " + output,
  );
  assert.equal(
    child.exitCode,
    null,
    "Background preview must survive stdin EOF. " + output,
  );
  assert.equal((await fetch("http://127.0.0.1:5174/play")).status, 200);
  assert.equal((await fetch("http://127.0.0.1:5174/api/health")).status, 200);
  console.log(
    "Background preview passed: remains reachable after stdin closes; /play and API proxy return 200.",
  );
} finally {
  if (child.exitCode === null) {
    const ended = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    await ended;
  }
}
