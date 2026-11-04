// Isolated local Cloudflare runtime. No remote requests, migrations or deployment.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync, spawn } from "node:child_process";
import { createAdminPasswordHash } from "../server/whitelist-admin-auth.ts";
const root = process.cwd();
const directory = resolve(root, ".tmp/predeploy");
await mkdir(directory, { recursive: true });
const port = 8877;
const config = {
  name: "pitlane-predeploy-local",
  main: resolve(root, "server/worker.ts"),
  compatibility_date: "2026-10-18",
  vars: {
    ENVIRONMENT: "production",
    APP_ORIGIN: `http://127.0.0.1:${port}`,
    CHAIN_ID: "4663",
  },
  durable_objects: { bindings: [{ name: "PLAYERS", class_name: "PlayerDO" }] },
  migrations: [{ tag: "v1", new_sqlite_classes: ["PlayerDO"] }],
  d1_databases: [
    {
      binding: "PROJECTIONS",
      database_name: "pitlane-predeploy-isolated",
      database_id: "00000000-0000-0000-0000-000000000099",
      migrations_dir: resolve(root, "migrations"),
    },
  ],
  assets: {
    directory: resolve(root, "dist"),
    binding: "ASSETS",
    run_worker_first: true,
    html_handling: "none",
  },
};
const secret = process.argv.includes("--owner-password")
  ? JSON.parse(
      await readFile(
        resolve(root, ".wrangler/deployment/admin-secret.json"),
        "utf8",
      ),
    ).WHITELIST_ADMIN_PASSWORD_HASH
  : await createAdminPasswordHash("Synthetic-QA-password-2026!");
await writeFile(
  resolve(directory, ".dev.vars"),
  `WHITELIST_ADMIN_PASSWORD_HASH="${secret}"\n`,
);
const configPath = resolve(directory, "wrangler.json");
await writeFile(configPath, JSON.stringify(config, null, 2));
const args = [resolve(root, "node_modules/wrangler/bin/wrangler.js")];
const common = [
  "--config",
  configPath,
  "--persist-to",
  resolve(directory, "state"),
];
const env = { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" };
const migrate = spawnSync(
  process.execPath,
  [...args, "d1", "migrations", "apply", "PROJECTIONS", "--local", ...common],
  { stdio: "inherit", windowsHide: true, env },
);
if (migrate.status !== 0) process.exit(migrate.status || 1);
const child = spawn(
  process.execPath,
  [
    ...args,
    "dev",
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
    ...common,
  ],
  { stdio: "inherit", windowsHide: true, env },
);
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("exit", (code) => process.exit(code ?? 0));
