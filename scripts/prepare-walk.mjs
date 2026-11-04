// Mechanical atlas export from image_gen masters: no painted or synthesized poses.
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const report = [];
try {
  const page = await browser.newPage();
  for (const name of ["gus", "dash", "juno"]) {
    const source = await fs.readFile(`art/masters/walk-${name}-v2.png`);
    const result = await page.evaluate(async (base64) => {
      const img = new Image();
      img.src = "data:image/png;base64," + base64;
      await img.decode();
      const input = document.createElement("canvas");
      input.width = img.width;
      input.height = img.height;
      const ctx = input.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, img.width, img.height).data;
      const output = document.createElement("canvas");
      output.width = 768;
      output.height = 1536;
      const out = output.getContext("2d");
      const boxes = [];
      for (let row = 0; row < 8; row++)
        for (let col = 0; col < 4; col++) {
          const x0 = (col * img.width) / 4,
            y0 = (row * img.height) / 8,
            w = img.width / 4,
            h = img.height / 8;
          let left = w,
            top = h,
            right = 0,
            bottom = 0;
          for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++)
              if (data[((y0 + y) * img.width + x0 + x) * 4 + 3] > 80) {
                left = Math.min(left, x);
                right = Math.max(right, x);
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
              }
          if (right <= left || bottom <= top) throw Error("Empty sprite cell");
          const height = bottom - top + 1,
            scale = 170 / height;
          // Anchor upper torso, not the stride's shifting outer boot edge.
          let sum = 0,
            count = 0;
          for (let y = top; y < top + height * 0.55; y++)
            for (let x = left; x <= right; x++)
              if (
                data[((y0 + Math.floor(y)) * img.width + x0 + x) * 4 + 3] > 128
              ) {
                sum += x;
                count++;
              }
          const center = count ? sum / count : (left + right) / 2;
          const sx = Math.max(0, left - 2),
            sy = Math.max(0, top - 2),
            sw = Math.min(w - sx, right - left + 5),
            sh = Math.min(h - sy, height + 4);
          out.drawImage(
            img,
            x0 + sx,
            y0 + sy,
            sw,
            sh,
            col * 192 + 96 + (sx - center) * scale,
            row * 192 + 182 + (sy - bottom - 1) * scale,
            sw * scale,
            sh * scale,
          );
          boxes.push({ row, col, left, top, right, bottom, center });
        }
      return { uri: output.toDataURL("image/png"), boxes };
    }, source.toString("base64"));
    await fs.writeFile(
      `public/art/walk-${name}-v2.png`,
      Buffer.from(result.uri.split(",")[1], "base64"),
    );
    report.push({ name, frames: result.boxes });
  }
  await fs.writeFile(
    "art/walk-v2-export.json",
    JSON.stringify(report, null, 2) + "\n",
  );
} finally {
  await browser.close();
}
