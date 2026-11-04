// Background Vite has no interactive terminal. Vite otherwise treats stdin EOF as
// a request to stop, including when an inherited Codex/PowerShell pipe closes later.
process.env.CI = "true";
const { createServer } = await import("vite");
process.stdin.on("end", () => {
  console.log(
    `${new Date().toISOString()} Terminal input closed; local web stays running.`,
  );
});
process.stdin.resume();
const port = Number(process.env.PITLANE_WEB_PORT || 5173);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid local web port.");
process.on("exit", (code) => {
  console.log(
    `${new Date().toISOString()} Local web process exited (${code}).`,
  );
});
const server = await createServer({
  // Separate test ports must not rewrite the active preview's optimizer cache.
  ...(port !== 5173 ? { cacheDir: `node_modules/.vite-local-${port}` } : {}),
  server: { host: "127.0.0.1", port, strictPort: true },
});
await server.listen();
server.printUrls();
