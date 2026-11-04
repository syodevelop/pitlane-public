import source from "./docs.en.md?raw";

export type GuideBlock =
  | { kind: "paragraph" | "heading"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "table"; headers: string[]; rows: string[][] };

export type GuideSection = {
  id: string;
  title: string;
  label: string;
  blocks: GuideBlock[];
};

const labels: Record<string, string> = {
  overview: "Overview",
  "getting-started": "Getting started",
  "starter-packs": "Starter packs",
  garage: "Your garage",
  service: "Customer service",
  "cars-and-racing": "Cars & racing",
  crew: "Characters & crew",
  rep: "Reputation",
  "ptln-and-funding": "PTLN & funding",
  rewards: "Rewards",
  "balances-and-payments": "Balances & payments",
  "early-access-and-nft": "NFT & Whitelist",
  safety: "Safety",
};

// The supplied editorial Markdown is the only Docs source. This deliberately
// supports its small, controlled subset; HTML is never injected into the page.
function parseBlocks(text: string): GuideBlock[] {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      if (/^#{2,3} /.test(block))
        return { kind: "heading", text: block.replace(/^#{2,3} /, "") };
      if (block.startsWith("|")) {
        const rows = block.split("\n").map((row) =>
          row
            .trim()
            .slice(1, -1)
            .split("|")
            .map((cell) => cell.trim()),
        );
        if (rows.length < 3 || !rows[1].every((cell) => /^:?-+:?$/.test(cell)))
          throw new Error("Invalid guide table");
        if (rows.some((row) => row.length !== rows[0].length))
          throw new Error("Inconsistent guide table columns");
        return { kind: "table", headers: rows[0], rows: rows.slice(2) };
      }
      if (block.startsWith("- "))
        return {
          kind: "list",
          items: block.split("\n").map((line) => line.replace(/^- /, "")),
        };
      if (/^[#<>]/.test(block)) throw new Error("Unsupported guide block");
      return { kind: "paragraph", text: block.replace(/\n/g, " ") };
    });
}

export function parseGuide(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const parts = normalized.split(/<a id="([a-z0-9-]+)"><\/a>/);
  parts.shift();
  const sections: GuideSection[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const id = parts[i];
    const body = parts[i + 1].trim();
    const title = body.match(/^## (.+)\n/)?.[1];
    if (!title || !labels[id] || sections.some((s) => s.id === id))
      throw new Error(`Invalid guide section: ${id}`);
    sections.push({
      id,
      title,
      label: labels[id],
      blocks: parseBlocks(body.slice(body.indexOf("\n") + 1)),
    });
  }
  if (sections.length !== Object.keys(labels).length)
    throw new Error("The guide must include all sections");
  return {
    sections,
  };
}

export const guide = parseGuide(source);
