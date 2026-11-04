import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createAdminPasswordHash } from "../server/whitelist-admin-auth.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export async function prepareAdminPassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 256
  )
    throw new Error("Use a password between 12 and 256 characters.");
  const hash = await createAdminPasswordHash(password);
  const destination = resolve(root, ".wrangler/deployment/admin-secret.json");
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(
    destination,
    JSON.stringify({ WHITELIST_ADMIN_PASSWORD_HASH: hash }) + "\n",
    { mode: 0o600 },
  );
  const local = resolve(root, ".dev.vars");
  const existing = await readFile(local, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const lines = existing
    .split(/\r?\n/)
    .filter((line) => !/^WHITELIST_ADMIN_PASSWORD_HASH\s*=/.test(line));
  await writeFile(
    local,
    lines.join("\n").trimEnd() + `\nWHITELIST_ADMIN_PASSWORD_HASH="${hash}"\n`,
    { mode: 0o600 },
  );
  console.log(
    "Admin password prepared. Only the salted verifier was saved in ignored local files; nothing was deployed.",
  );
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  process.stdout.write("Admin password (input hidden): ");
  const password = await new Promise((resolvePassword, reject) => {
    let input = "";
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");
    const finish = () => {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.unref?.();
      process.stdout.write("\n");
    };
    process.stdin.on("data", (chunk) => {
      for (const char of chunk) {
        if (char === "\u0003") {
          finish();
          reject(new Error("Cancelled."));
          return;
        }
        if (char === "\r" || char === "\n") {
          finish();
          resolvePassword(input);
          return;
        }
        if (char === "\u007f" || char === "\b") input = input.slice(0, -1);
        else input += char;
      }
    });
    process.stdin.on("end", () => {
      finish();
      resolvePassword(input);
    });
  });
  await prepareAdminPassword(password);
}
