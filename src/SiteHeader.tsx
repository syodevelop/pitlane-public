import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { reserveScrollbarSpace } from "./site-scroll";

const mobileQuery = "(max-width: 600px)";
function subscribeToViewport(notify: () => void) {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}
const isMobileViewport = () => window.matchMedia(mobileQuery).matches;
const serverViewport = () => false;
const links = [
  ["/", "Home"],
  ["/docs", "Docs"],
  ["/whitelist", "Whitelist"],
] as const;

export default function SiteHeader({
  path,
  xUrl,
}: {
  path: string;
  xUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const mobile = useSyncExternalStore(
    subscribeToViewport,
    isMobileViewport,
    serverViewport,
  );
  const toggle = useRef<HTMLButtonElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !inner.current?.contains(event.target)
      )
        setOpen(false);
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      toggle.current?.focus({ preventScroll: true });
    };
    const query = window.matchMedia(mobileQuery);
    const dismissOnDesktop = () => {
      if (!query.matches) setOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissWithEscape);
    query.addEventListener("change", dismissOnDesktop);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissWithEscape);
      query.removeEventListener("change", dismissOnDesktop);
    };
  }, [open]);
  return (
    <header className="site-header" data-menu-open={open}>
      <div className="site-menu-backdrop" aria-hidden="true" />
      <div
        ref={inner}
        className="site-header-inner"
        onBlurCapture={(event) => {
          if (
            open &&
            event.relatedTarget instanceof Node &&
            !event.currentTarget.contains(event.relatedTarget)
          )
            setOpen(false);
        }}
      >
        <a
          className="wordmark"
          href="/"
          aria-label="Pitlane home"
          onClick={() => setOpen(false)}
        >
          pitlane
        </a>
        <button
          ref={toggle}
          type="button"
          className="site-menu-toggle"
          aria-label={open ? "Close menu" : "Menu"}
          aria-expanded={open}
          aria-controls="site-navigation"
          onClick={() => {
            if (!open) reserveScrollbarSpace();
            setOpen((current) => !current);
          }}
        >
          <span className="site-menu-icon" aria-hidden="true">
            <span />
            <span />
          </span>
        </button>
        <nav
          id="site-navigation"
          aria-label="Main navigation"
          data-open={open}
          inert={mobile && !open}
        >
          {links.map(([href, label]) => (
            <a
              key={href}
              href={href}
              aria-current={path === href ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              <span>{label}</span>
              <svg
                className="site-nav-arrow"
                aria-hidden="true"
                viewBox="0 0 24 24"
              >
                <path d="M4 12h15m-6-6 6 6-6 6" />
              </svg>
            </a>
          ))}
          {xUrl && (
            <a
              className="site-nav-social"
              href={xUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
            >
              <span>X</span>
              <svg
                className="site-nav-arrow"
                aria-hidden="true"
                viewBox="0 0 24 24"
              >
                <path d="M4 12h15m-6-6 6 6-6 6" />
              </svg>
            </a>
          )}
        </nav>
        <a className="nav-play" href="/play" onClick={() => setOpen(false)}>
          <span>Play</span>
        </a>
      </div>
    </header>
  );
}
