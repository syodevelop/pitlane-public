import fs from "node:fs/promises";
import { render } from "../.tmp/site-ssr/entry-server.js";
import {
  applyHead,
  PUBLIC_PATHS,
  SITE,
  documentAsset,
} from "../shared/site.ts";
import {
  errorDocumentHtml,
  fallbackHtml,
} from "../shared/site-fallback.ts";
const template = await fs.readFile("dist/index.html", "utf8");
await fs.mkdir("dist/pages", { recursive: true });
for (const path of [...PUBLIC_PATHS, SITE.adminPath]) {
  let html = applyHead(template, path);
  if (path !== SITE.adminPath && path !== "/play")
    html = html.replace(
      '<div id="root"></div>',
      `<div id="root" data-prerendered>${render(path)}</div>`,
    );
  await fs.writeFile("dist" + documentAsset(path), html);
}
// Error documents remain usable when the application's scripts or styles fail.
await fs.writeFile(
  "dist" + documentAsset("/404"),
  errorDocumentHtml("not-found"),
);
await fs.writeFile(
  "dist" + documentAsset("/unavailable"),
  errorDocumentHtml("unavailable"),
);
await fs.writeFile("dist/index.html", applyHead(template, "/"));
await fs.writeFile("public/offline.html", fallbackHtml(true));
await fs.writeFile("dist/offline.html", fallbackHtml(true));
await fs.writeFile("dist/unavailable.html", fallbackHtml(false));
console.log("Prerendered public pages, metadata and offline fallback.");
