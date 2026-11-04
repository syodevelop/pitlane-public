import { useEffect, useRef, useState } from "react";
import { guide, type GuideBlock } from "./content/guide";

function Inline({ text }: { text: string }) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, index) =>
      part.startsWith("**") ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : (
        part
      ),
    );
}

function Blocks({ blocks, title }: { blocks: GuideBlock[]; title: string }) {
  return blocks.map((block, index) => {
    if (block.kind === "heading")
      return (
        <h3 key={index}>
          <Inline text={block.text} />
        </h3>
      );
    if (block.kind === "paragraph")
      return (
        <p key={index}>
          <Inline text={block.text} />
        </p>
      );
    if (block.kind === "list")
      return (
        <ul key={index}>
          {block.items.map((item) => (
            <li key={item}>
              <Inline text={item} />
            </li>
          ))}
        </ul>
      );
    if (block.kind === "table")
      return (
        <div className="guide-table" key={index}>
          <p className="guide-table-hint">
            Scroll the table horizontally to see all columns.
          </p>
          <div
            className="guide-table-scroll"
            tabIndex={0}
            role="region"
            aria-label={`${title} table. Scroll horizontally for all columns.`}
          >
            <table>
              <thead>
                <tr>
                  {block.headers.map((cell) => (
                    <th scope="col" key={cell}>
                      <Inline text={cell} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, colIndex) =>
                      colIndex === 0 ? (
                        <th scope="row" key={colIndex}>
                          <Inline text={cell} />
                        </th>
                      ) : (
                        <td key={colIndex}>
                          <Inline text={cell} />
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    return null;
  });
}

function GuideHero() {
  return (
    <div className="guide-hero">
      <div className="guide-kicker">GAME GUIDE</div>
      <h1 id="guide-title">Pitlane Docs</h1>
    </div>
  );
}

type IndexEntry = { id: string; label: string };
function Contents({
  entries,
  active,
  label = "Contents",
}: {
  entries: IndexEntry[];
  active: string;
  label?: string;
}) {
  const mobile = useRef<HTMLDetailsElement>(null);
  const links = (
    <ol>
      {entries.map((entry, index) => (
        <li key={entry.id}>
          <a
            href={`#${entry.id}`}
            aria-current={active === entry.id ? "location" : undefined}
            onClick={() => {
              if (mobile.current) mobile.current.open = false;
              // Run after the mobile contents collapses so the target stays below the header.
              requestAnimationFrame(() => focusAnchor(entry.id));
            }}
          >
            <span className="guide-index-number">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span>{entry.label}</span>
          </a>
        </li>
      ))}
    </ol>
  );
  return (
    <>
      <nav className="guide-index" aria-label={label}>
        <span className="guide-kicker">{label}</span>
        {links}
      </nav>
      <details className="guide-mobile-index" ref={mobile}>
        <summary>
          {label}
          <span aria-hidden="true">+</span>
        </summary>
        <nav aria-label={`Mobile ${label.toLowerCase()}`}>{links}</nav>
      </details>
    </>
  );
}

function focusAnchor(id: string) {
  const element = document.getElementById(id);
  if (!element) return;
  element.scrollIntoView({ block: "start", behavior: "instant" });
  element.focus({ preventScroll: true });
}

function useGuideAnchors() {
  const [active, setActive] = useState("");
  useEffect(() => {
    let frame = 0;
    function followHash() {
      try {
        const id = decodeURIComponent(window.location.hash.slice(1));
        frame = requestAnimationFrame(() => focusAnchor(id));
      } catch {
        /* A malformed external hash does not prevent reading. */
      }
    }
    followHash();
    window.addEventListener("hashchange", followHash);
    const update = () => {
      const headings = [
        ...document.querySelectorAll<HTMLElement>("[data-guide-anchor]"),
      ];
      const atBottom =
        window.scrollY > 0 &&
        window.scrollY + window.innerHeight >=
          document.documentElement.scrollHeight - 2;
      const current = atBottom
        ? headings.at(-1)
        : (headings
            .filter((node) => node.getBoundingClientRect().top <= 160)
            .at(-1) ?? headings[0]);
      setActive(current?.id ?? "");
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", followHash);
      window.removeEventListener("scroll", update);
    };
  }, []);
  return active;
}

export function Docs() {
  const active = useGuideAnchors();
  return (
    <main
      className="guide-main"
      id="main-content"
      tabIndex={-1}
      aria-labelledby="guide-title"
    >
      <GuideHero />
      <div className="guide-layout">
        <aside>
          <Contents entries={guide.sections} active={active} />
        </aside>
        <article className="guide-article" aria-label="Pitlane game guide">
          {guide.sections.map((section, index) => (
            <section
              className="guide-section"
              key={section.id}
              aria-labelledby={section.id}
            >
              <span className="guide-section-number">
                {String(index + 1).padStart(2, "0")} / {section.label}
              </span>
              <h2 id={section.id} data-guide-anchor tabIndex={-1}>
                {section.title}
                <a
                  className="guide-permalink"
                  href={`#${section.id}`}
                  aria-label={`Link to ${section.label}`}
                >
                  #
                </a>
              </h2>
              <div className="guide-section-content">
                <Blocks blocks={section.blocks} title={section.label} />
              </div>
            </section>
          ))}
        </article>
      </div>
    </main>
  );
}
