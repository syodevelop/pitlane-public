import settings from "../config/site.json" with { type: "json" };
export const SITE = settings;
export const PUBLIC_PATHS = ["/", "/docs", "/whitelist", "/play"] as const;
export const DOCUMENT_PATHS: readonly string[] = [
  ...PUBLIC_PATHS,
  SITE.adminPath,
  "/unavailable",
];
const descriptions: Record<string, string> = {
  "/": "Build your racing team. Pitlane is a browser garage tycoon, from your first repair to your team's first podium.",
  "/docs":
    "Explore the Pitlane game guide: the workshop, customer jobs, your racing team, characters and progression.",
  "/whitelist":
    "Apply for the Pitlane NFT whitelist. Complete four checkpoints and submit your Ethereum wallet address and X handle.",
  "/play":
    "Play Pitlane. Service customer cars, earn Credits and upgrade your workshop.",
};
export function pageMetadata(path: string) {
  const publicPage = (PUBLIC_PATHS as readonly string[]).includes(path);
  return {
    title: SITE.name,
    description:
      descriptions[path] ||
      "Pitlane. Return to the workshop or follow the official account for updates.",
    canonical: publicPage ? SITE.origin + (path === "/" ? "/" : path) : null,
    robots:
      publicPage && path !== "/play"
        ? "index, follow, max-image-preview:large"
        : "noindex, nofollow",
    image: SITE.origin + "/brand/pitlane-share-v1.jpg",
  };
}
export function documentAsset(path: string) {
  if (path === "/") return "/pages/home.html";
  if (path === SITE.adminPath) return "/pages/desk.html";
  if (path === "/unavailable") return "/pages/unavailable.html";
  return (PUBLIC_PATHS as readonly string[]).includes(path)
    ? `/pages/${path.slice(1)}.html`
    : "/pages/not-found.html";
}
export const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function headMetadata(path: string) {
  const m = pageMetadata(path),
    esc = escapeHtml;
  return `<title>Pitlane</title>
<meta name="description" content="${esc(m.description)}">
<meta name="robots" content="${m.robots}">
${m.canonical ? `<link rel="canonical" href="${m.canonical}">` : ""}
<meta property="og:type" content="website"><meta property="og:site_name" content="Pitlane">
<meta property="og:title" content="Pitlane"><meta property="og:description" content="${esc(m.description)}">
${m.canonical ? `<meta property="og:url" content="${m.canonical}">` : ""}
<meta property="og:image" content="${m.image}"><meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Pitlane: a red race car and Gus in the coastal workshop.">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@playpitlane">
<meta name="twitter:title" content="Pitlane"><meta name="twitter:description" content="${esc(m.description)}">
<meta name="twitter:image" content="${m.image}">
${["/", "/whitelist"].includes(path) ? '<link rel="preload" as="image" href="/art/launch-garage-mobile-v1.avif" type="image/avif" media="(max-width: 600px) and (orientation: portrait)" fetchpriority="high"><link rel="preload" as="image" href="/art/launch-garage-v2.avif" type="image/avif" media="not all and (max-width: 600px) and (orientation: portrait)" fetchpriority="high">' : ""}
${path === "/" ? `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite", name: "Pitlane", url: SITE.origin, description: m.description, inLanguage: "en", sameAs: [SITE.xUrl] })}</script>` : ""}`;
}
export function applyHead(html: string, path: string) {
  return html.replace(
    /<!--site-meta:start-->[\s\S]*?<!--site-meta:end-->/,
    `<!--site-meta:start-->${headMetadata(path)}<!--site-meta:end-->`,
  );
}
