import { lazy, Suspense, useEffect, useRef, useState } from "react";
import "./style.css";
import Landing from "./Landing";
import "./launch.css";
import SiteHeader from "./SiteHeader";
import { Docs } from "./Guide";
import "./guide.css";
import "./site-header.css";
import type { PublicRelease } from "../shared/public-release";
import { SITE, pageMetadata } from "../shared/site";
import ContactLinks from "./ContactLinks";
import { SiteError } from "./SiteError";
import "./site-finish.css";
const WorkshopGame = lazy(() => import("./WorkshopGame"));
const WorkshopEntry = lazy(() => import("./WorkshopEntry"));
const WhitelistAdmin = lazy(() => import("./WhitelistAdmin"));
export default function App({
  initialPath,
  release = null,
}: {
  initialPath: string;
  release?: PublicRelease | null;
}) {
  const [route, setRoute] = useState(() => ({
    path: initialPath,
    whitelistVisited: initialPath === "/whitelist",
  }));
  const path = route.path;
  const previousPath = useRef(path);
  useEffect(() => {
    const followLocation = () =>
      setRoute((current) => ({
        path: window.location.pathname,
        whitelistVisited:
          current.whitelistVisited || window.location.pathname === "/whitelist",
      }));
    window.addEventListener("popstate", followLocation);
    return () => window.removeEventListener("popstate", followLocation);
  }, []);
  useEffect(() => {
    if (previousPath.current === path) return;
    previousPath.current = path;
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(
          path === "/whitelist" ? "wl-panel-title" : "launch-title",
        )
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [path]);
  useEffect(() => {
    const meta = pageMetadata(path);
    document.title = meta.title;
    for (const [selector, value] of [
      ['meta[name="description"]', meta.description],
      ['meta[name="robots"]', meta.robots],
      ['meta[property="og:description"]', meta.description],
      ['meta[property="og:url"]', meta.canonical],
      ['meta[name="twitter:description"]', meta.description],
    ] as const)
      if (value)
        document.querySelector(selector)?.setAttribute("content", value);
    if (meta.canonical)
      document
        .querySelector('link[rel="canonical"]')
        ?.setAttribute("href", meta.canonical);
  }, [path]);
  const reading = path === "/docs";
  const whitelist = path === "/whitelist";
  const admin = path === SITE.adminPath;
  const landing = path === "/" || whitelist;
  const playRoute = /^\/play\/?$/.test(path);
  const errorPage = !landing && !reading && !playRoute && !admin;
  const contentId =
    path === "/"
      ? "home-content"
      : whitelist
        ? "whitelist-content"
        : "main-content";
  if (errorPage) return <SiteError unavailable={path === "/unavailable"} />;
  if (playRoute)
    return (
      <Suspense
        fallback={
          <main className="gate" id="main-content" role="status">
            Opening your workshop…
          </main>
        }
      >
        {import.meta.env.DEV &&
        typeof window !== "undefined" &&
        !new URLSearchParams(window.location.search).has("wallet") ? (
          <WorkshopGame />
        ) : (
          <WorkshopEntry />
        )}
      </Suspense>
    );
  return (
    <div
      className={
        landing ? "home-shell" : reading || admin ? "guide-shell" : "site-shell"
      }
      onClick={(event) => {
        // Keep normal links, modifier clicks and new tabs working. Only the two
        // views of the shared landing scene change without a document reload.
        if (
          !landing ||
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        const link =
          event.target instanceof Element
            ? event.target.closest<HTMLAnchorElement>("a[href]")
            : null;
        if (
          !link ||
          link.hasAttribute("download") ||
          (link.target && link.target !== "_self")
        )
          return;
        const url = new URL(link.href, window.location.href);
        if (
          url.origin !== window.location.origin ||
          !["/", "/whitelist"].includes(url.pathname) ||
          url.search ||
          url.hash
        )
          return;
        event.preventDefault();
        if (url.pathname === path) return;
        window.history.pushState(null, "", url.pathname);
        setRoute((current) => ({
          path: url.pathname,
          whitelistVisited:
            current.whitelistVisited || url.pathname === "/whitelist",
        }));
      }}
    >
      <a className="site-skip" href={`#${contentId}`}>
        Skip to content
      </a>
      <SiteHeader path={path} xUrl={release?.xUrl || SITE.xUrl} />
      {landing ? (
        <Landing
          whitelist={whitelist}
          whitelistVisited={route.whitelistVisited}
        />
      ) : path === "/docs" ? (
        <Docs />
      ) : admin ? (
        <Suspense
          fallback={
            <main className="gate" id="main-content" role="status">
              Loading campaign settings…
            </main>
          }
        >
          <WhitelistAdmin />
        </Suspense>
      ) : null}
      {reading && (
        <footer className="site-footer">
          <a className="wordmark" href="/">
            pitlane
          </a>
          <ContactLinks />
        </footer>
      )}
    </div>
  );
}
