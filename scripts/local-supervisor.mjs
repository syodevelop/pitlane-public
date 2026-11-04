// Local development only. No network listener, saved credentials or gameplay data.
import { spawn } from "node:child_process";
import { appendFileSync, openSync, closeSync } from "node:fs";
import { fileURLToPath } from "node:url";
const [name, prefix] = process.argv.slice(2);
if (!["api", "web"].includes(name) || !prefix)
  throw Error("Expected api|web and log prefix");
const cwd = fileURLToPath(new URL("..", import.meta.url));
const args =
  name === "web"
    ? ["scripts/local-web.mjs"]
    : [
        "node_modules/wrangler/bin/wrangler.js",
        "dev",
        "--ip",
        "127.0.0.1",
        "--port",
        "8787",
      ];
const log = (message) =>
  appendFileSync(
    prefix + ".lifecycle.log",
    `${new Date().toISOString()} ${message}\n`,
  );
for (let restart = 0; restart <= 3; restart++) {
  const output = prefix + (restart ? `-retry${restart}` : "");
  const stdout = openSync(output + ".stdout.log", "a"),
    stderr = openSync(output + ".stderr.log", "a");
  let child;
  try {
    // Direct files avoid waiting for redirected pipes held by subprocesses.
    child = spawn(process.execPath, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", stdout, stderr],
    });
  } finally {
    closeSync(stdout);
    closeSync(stderr);
  }
  log(
    `Started ${name}. Node PID ${child.pid}; supervisor PID ${process.pid}; restart ${restart}; output ${output}.`,
  );
  const result = await new Promise((resolve) => {
    child.once("error", (error) => resolve({ error: error.message }));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  if (result.error) {
    log(`Launch failed: ${result.error}`);
    process.exitCode = 1;
    break;
  }
  log(
    `${name} exited with code ${result.code}, signal ${result.signal || "none"}.`,
  );
  // Only the observed native crash recovers; manual/configuration stops remain stopped.
  if (
    name !== "web" ||
    result.code === null ||
    result.code >>> 0 !== 0xc0000409 ||
    restart === 3
  )
    break;
  log(
    `Recovering web after 0xC0000409 in 2 seconds. Attempt ${restart + 1}/3. Progress is untouched.`,
  );
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
