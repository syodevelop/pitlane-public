// Mechanical format conversion only; keep the generated artwork and dimensions intact.
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage();
  for (const id of ["quick-service", "tire-service", "engine-work"]) {
    const source = await fs.readFile(`art/generated/docs-service-v1/${id}.png`);
    const result = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d").drawImage(image, 0, 0);
      return {
        width: canvas.width,
        height: canvas.height,
        url: canvas.toDataURL("image/webp", 0.92),
      };
    }, source.toString("base64"));
    assert.equal(result.width, 1536);
    assert.equal(result.height, 1024);
    assert.ok(result.url.startsWith("data:image/webp;base64,"));
    const bytes = Buffer.from(result.url.split(",")[1], "base64");
    const output = `public/art/docs-${id}-v1.webp`;
    await fs.writeFile(output, bytes);
    console.log(`${output}: ${result.width}x${result.height}, ${bytes.length} bytes`);
  }
} finally {
  await browser.close();
}
