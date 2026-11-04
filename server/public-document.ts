import {
  RELEASE_ELEMENT_ID,
  publicRelease,
  serializePublicRelease,
} from "../shared/public-release";
import type { ReleaseConfig } from "../shared/release";
import {
  DOCUMENT_PATHS,
  PUBLIC_PATHS,
  SITE,
  documentAsset,
  pageMetadata,
} from "../shared/site";
import { fallbackHtml } from "../shared/site-fallback";
export function unavailableDocument(req: Request) {
  return new Response(req.method === "HEAD" ? null : fallbackHtml(), {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "120",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
// Public documents never read player state, create sessions or expose application data.
export async function publicDocument(
  req: Request,
  assets: Fetcher,
  release: ReleaseConfig,
  status = 200,
) {
  try {
    const path = new URL(req.url).pathname;
    const asset = await assets.fetch(
      new Request(new URL(documentAsset(path), req.url)),
    );
    if (!asset.ok) return unavailableDocument(req);
    const headers = new Headers(asset.headers);
    headers.set("Cache-Control", "no-store");
    for (const key of [
      "ETag",
      "Last-Modified",
      "Content-Length",
      "Content-Encoding",
    ])
      headers.delete(key);
    headers.set("Content-Type", "text/html; charset=utf-8");
    if (
      release.environment !== "production" ||
      pageMetadata(path).robots.startsWith("noindex")
    )
      headers.set("X-Robots-Tag", "noindex, nofollow");
    if (status === 503) headers.set("Retry-After", "120");
    if (req.method === "HEAD") return new Response(null, { status, headers });
    if (status !== 200) return new Response(asset.body, { status, headers });
    const data = serializePublicRelease(publicRelease(release));
    return new HTMLRewriter()
      .on("head", {
        element(el) {
          el.append(
            `<script type="application/json" id="${RELEASE_ELEMENT_ID}">${data}</script>`,
            { html: true },
          );
        },
      })
      .transform(new Response(asset.body, { status, headers }));
  } catch {
    return unavailableDocument(req);
  }
}
export async function publicSite(
  req: Request,
  assets: Fetcher,
  release: ReleaseConfig,
) {
  const url = new URL(req.url),
    path = url.pathname;
  if (!["GET", "HEAD"].includes(req.method))
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  const clean = path === "/index.html" ? "/" : path.replace(/\/$/, "") || "/";
  if (path !== clean && DOCUMENT_PATHS.includes(clean))
    return new Response(null, {
      status: 308,
      headers: { Location: clean + url.search },
    });
  if (path === "/robots.txt")
    return new Response(
      req.method === "HEAD"
        ? null
        : release.environment === "production"
          ? `User-agent: *\nDisallow: /api/\nDisallow: /pages/\nSitemap: ${SITE.origin}/sitemap.xml\n`
          : "User-agent: *\nDisallow: /\n",
      {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      },
    );
  if (path === "/sitemap.xml")
    return new Response(
      req.method === "HEAD"
        ? null
        : `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${PUBLIC_PATHS.filter(
            (p) => p !== "/play",
          )
            .map((p) => `<url><loc>${SITE.origin}${p}</loc></url>`)
            .join("")}</urlset>`,
      {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      },
    );
  if (DOCUMENT_PATHS.includes(path))
    return publicDocument(
      req,
      assets,
      release,
      path === "/unavailable" ? 503 : 200,
    );
  const staticFile =
    ["/assets/", "/art/", "/fonts/", "/brand/", "/models/"].some((prefix) =>
      path.startsWith(prefix),
    ) ||
    [
      "/favicon.ico",
      "/site.webmanifest",
      "/boot.js",
      "/sw.js",
      "/offline.html",
    ].includes(path);
  if (staticFile) {
    const asset = await assets.fetch(req);
    const headers = new Headers(asset.headers);
    headers.set(
      "Cache-Control",
      path === "/sw.js" || path === "/boot.js" || path === "/offline.html"
        ? "no-cache"
        : path.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=86400",
    );
    if (path === "/offline.html")
      headers.set("X-Robots-Tag", "noindex, nofollow");
    return new Response(asset.body, { status: asset.status, headers });
  }
  return publicDocument(req, assets, release, 404);
}
