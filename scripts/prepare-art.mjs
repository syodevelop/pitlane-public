// Mechanical export only: measure alpha, split original generated atlas cells,
// normalize foot/wheel anchors, resize and encode WebP. No drawing or content synthesis.
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
// Preview exports do not touch assets used by an active browser playthrough.
const preview = process.argv.includes("--preview");
const launch = process.argv.includes("--launch");
const outputDirectory = preview ? "test-results/art-preview" : "public/art";
const reportPath = launch
  ? "art/launch-export-report.json"
  : preview
    ? "test-results/art-preview/export-report.json"
    : "art/export-report.json";
const legacySources = [
  {
    id: "guardrail",
    file: "guardrail-pair-v3.png",
    columns: 2,
    rows: 1,
    cellWidth: 384,
    cellHeight: 256,
    contentHeight: 224,
  },
  ...["rustback", "club-coupe", "track-gt", "enduro", "prototype"].map(
    (id) => ({
      id: id + "-rear",
      file: id + "-rear-pair-" + (id === "prototype" ? "v2.png" : "v1.png"),
      columns: 2,
      rows: 1,
      cellWidth: 384,
      cellHeight: 320,
      contentHeight: 280,
    }),
  ),
  {
    id: "team-trolley",
    file: "team-trolley-pair-v1.png",
    columns: 2,
    rows: 1,
    cellWidth: 256,
    cellHeight: 256,
    contentHeight: 232,
  },
  {
    id: "engine-stand",
    file: "engine-stand-pair-v1.png",
    columns: 2,
    rows: 1,
    cellWidth: 256,
    cellHeight: 256,
    contentHeight: 232,
  },
  {
    id: "service-station-upgraded",
    file: "service-station-upgraded-v1.png",
    columns: 1,
    rows: 1,
    cellWidth: 256,
    cellHeight: 256,
    contentHeight: 232,
  },
  {
    id: "rustback-upgrade",
    file: "rustback-upgrade-pair-v3.png",
    columns: 2,
    rows: 1,
    cellWidth: 384,
    cellHeight: 320,
    contentHeight: 280,
  },
  ...["track-gt", "enduro", "prototype"].map((id) => ({
    id,
    file: id + (id === "enduro" ? "-pair-v2.png" : "-pair-v1.png"),
    columns: 2,
    rows: 1,
    cellWidth: 384,
    cellHeight: 320,
    contentHeight: 280,
  })),
  {
    id: "club-coupe",
    file: "club-coupe-pair-v1.png",
    columns: 2,
    rows: 1,
    cellWidth: 384,
    cellHeight: 320,
    contentHeight: 280,
  },
  ...["crew", "dash", "juno"].flatMap((character) =>
    ["front", "back", "work-front", "work-back"].map((view) => ({
      id: character + "-" + view,
      file: character + "-" + view + "-v1.png",
      columns: 2,
      rows: 1,
      cellWidth: 192,
      cellHeight: 192,
      contentHeight: 168,
      anchorFromFeet: true,
    })),
  ),
  ...["front", "back"].map((facing) => ({
    id: "gus-stock-" + facing,
    file: "gus-stock-" + facing + "-v1.png",
    columns: 2,
    rows: 1,
    cellWidth: 192,
    cellHeight: 192,
    contentHeight: 168,
    anchorFromFeet: true,
    // Measured near-boot alignment; the front tire would bias an alpha-only anchor.
    anchorXs: facing === "front" ? [512, 1288] : [502, 1420],
  })),
  ...["front", "back-right", "back-left"].map((facing) => ({
    id: "gus-work-" + facing,
    file: "gus-work-" + facing + "-v1.png",
    columns: 2,
    rows: 1,
    cellWidth: 192,
    cellHeight: 192,
    contentHeight: 168,
    anchorFromFeet: true,
  })),
  {
    id: "reception",
    file: "reception-v1.png",
    columns: 1,
    rows: 1,
    cellWidth: 256,
    cellHeight: 256,
    contentHeight: 232,
  },
  {
    id: "workbench",
    file: "workbench-v1.png",
    columns: 1,
    rows: 1,
    cellWidth: 256,
    cellHeight: 256,
    contentHeight: 232,
  },
  {
    id: "stock-rack",
    file: "stock-rack-v1.png",
    columns: 1,
    rows: 1,
    cellWidth: 256,
    cellHeight: 256,
    contentHeight: 232,
  },
  {
    id: "circuit-desk",
    file: "circuit-desk-v1.png",
    columns: 1,
    rows: 1,
    cellWidth: 256,
    cellHeight: 256,
    contentHeight: 232,
  },
  {
    id: "gus",
    file: "gus-sheet-v2.png",
    columns: 5,
    rows: 4,
    cellWidth: 128,
    cellHeight: 192,
    contentHeight: 168,
  },
  {
    id: "rustback",
    file: "rustback-pair-v2.png",
    columns: 2,
    rows: 1,
    cellWidth: 384,
    cellHeight: 320,
    contentHeight: 280,
  },
  {
    id: "service-station",
    file: "service-station-v1.png",
    columns: 1,
    rows: 1,
    cellWidth: 256,
    cellHeight: 256,
    contentHeight: 232,
  },
];
const sources = launch
  ? ["gus", "dash", "juno"].map((name) => ({
      id: `launch-${name}`,
      file: `launch-${name}-v1.png`,
      columns: 4,
      rows: 2,
      cellWidth: 192,
      cellHeight: 192,
      contentHeight: 168,
      anchorFromFeet: true,
    }))
  : legacySources;
const browser = await chromium.launch({ channel: "msedge", headless: true });
await fs.mkdir(outputDirectory, { recursive: true });
const report = [];
try {
  const page = await browser.newPage();
  for (const spec of sources) {
    const bytes = await fs.readFile(`art/masters/${spec.file}`);
    const result = await page.evaluate(
      async ({ spec, source }) => {
        const image = new Image();
        image.src = source;
        await image.decode();
        const input = document.createElement("canvas");
        input.width = image.width;
        input.height = image.height;
        const ctx = input.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, input.width, input.height).data;
        const boxes = [];
        let transparent = 0;
        for (let i = 3; i < pixels.length; i += 4)
          if (pixels[i] === 0) transparent++;
        if (transparent < input.width * input.height * 0.1)
          throw new Error("Source has no usable transparent margins.");
        // Generated sheets may be slightly nonuniform. Locate genuinely empty gutters
        // near each nominal division instead of cutting feet at a guessed grid line.
        const seams = (
          count,
          size,
          horizontal,
          otherMin = 0,
          otherMax = horizontal ? input.width : input.height,
        ) => {
          const cuts = [0];
          for (let division = 1; division < count; division++) {
            const nominal = (size * division) / count;
            let best = -1,
              score = Infinity;
            for (
              let candidate = Math.floor(nominal - (size / count) * 0.2);
              candidate <= Math.ceil(nominal + (size / count) * 0.2);
              candidate++
            ) {
              let opaque = 0;
              for (let other = otherMin; other < otherMax; other++) {
                const x = horizontal ? other : candidate,
                  y = horizontal ? candidate : other;
                if (pixels[(y * input.width + x) * 4 + 3] >= 16) opaque++;
              }
              const cost = opaque * 1e6 + Math.abs(candidate - nominal);
              if (cost < score) {
                score = cost;
                best = candidate;
              }
            }
            if (score >= 1e6)
              throw new Error(
                `No empty atlas gutter for ${spec.id} division ${division} (${horizontal ? "row" : "column"}, span ${otherMin}..${otherMax}, best ${best}, opaque ${Math.floor(score / 1e6)}).`,
              );
            cuts.push(best);
          }
          return [...cuts, size];
        };
        const xs = seams(spec.columns, input.width, false);
        const rowCuts = Array.from({ length: spec.columns }, (_, column) =>
          spec.perColumnRows
            ? seams(spec.rows, input.height, true, xs[column], xs[column + 1])
            : seams(spec.rows, input.height, true),
        );
        for (let row = 0; row < spec.rows; row++)
          for (let column = 0; column < spec.columns; column++) {
            const left = xs[column],
              right = xs[column + 1];
            const top = rowCuts[column][row],
              bottom = rowCuts[column][row + 1];
            let x0 = right,
              y0 = bottom,
              x1 = left,
              y1 = top;
            for (let y = top; y < bottom; y++)
              for (let x = left; x < right; x++) {
                if (pixels[(y * input.width + x) * 4 + 3] >= 16) {
                  x0 = Math.min(x0, x);
                  y0 = Math.min(y0, y);
                  x1 = Math.max(x1, x);
                  y1 = Math.max(y1, y);
                }
              }
            if (x0 >= x1 || y0 >= y1) throw new Error("Empty atlas frame.");
            let footLeft = x1,
              footRight = x0;
            for (let y = Math.floor(y0 + (y1 - y0) * 0.8); y <= y1; y++)
              for (let x = x0; x <= x1; x++)
                if (pixels[(y * input.width + x) * 4 + 3] >= 16) {
                  footLeft = Math.min(footLeft, x);
                  footRight = Math.max(footRight, x);
                }
            boxes.push({
              row,
              column,
              x: x0,
              y: y0,
              w: x1 - x0 + 1,
              h: y1 - y0 + 1,
              anchorX:
                spec.anchorXs?.[row * spec.columns + column] ??
                (spec.anchorFromFeet
                  ? (footLeft + footRight) / 2
                  : (x0 + x1 + 1) / 2),
              touchesCellEdge:
                x0 <= left || x1 >= right - 1 || y0 <= top || y1 >= bottom - 1,
            });
          }
        const scale = Math.min(
          spec.contentHeight / Math.max(...boxes.map((b) => b.h)),
          (spec.cellWidth - 16) /
            Math.max(
              ...boxes.map(
                (b) => 2 * Math.max(b.anchorX - b.x, b.x + b.w - b.anchorX),
              ),
            ),
        );
        const canvas = document.createElement("canvas");
        canvas.width = spec.cellWidth * spec.columns;
        canvas.height = spec.cellHeight * spec.rows;
        const out = canvas.getContext("2d");
        out.imageSmoothingQuality = "high";
        for (const box of boxes) {
          const w = box.w * scale,
            h = box.h * scale;
          out.drawImage(
            image,
            box.x,
            box.y,
            box.w,
            box.h,
            box.column * spec.cellWidth +
              spec.cellWidth / 2 +
              (box.x - box.anchorX) * scale,
            box.row * spec.cellHeight + spec.cellHeight - 8 - h,
            w,
            h,
          );
        }
        return {
          uri: canvas.toDataURL("image/webp", 0.9),
          dimensions: [image.width, image.height],
          output: [canvas.width, canvas.height],
          transparentRatio: transparent / (image.width * image.height),
          boxes,
          scale,
        };
      },
      { spec, source: `data:image/png;base64,${bytes.toString("base64")}` },
    );
    if (!result.uri.startsWith("data:image/webp;"))
      throw new Error("WebP encoder unavailable.");
    const output = Buffer.from(result.uri.split(",")[1], "base64");
    await fs.writeFile(`${outputDirectory}/${spec.id}.webp`, output);
    delete result.uri;
    report.push({
      ...spec,
      ...result,
      bytes: output.length,
      anchor: [0.5, (spec.cellHeight - 8) / spec.cellHeight],
    });
  }
} finally {
  await browser.close();
}
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify(
    report.map(({ id, dimensions, output, bytes, boxes }) => ({
      id,
      dimensions,
      output,
      bytes,
      framesTouchingCellEdge: boxes.filter((b) => b.touchesCellEdge).length,
    })),
    null,
    2,
  ),
);
