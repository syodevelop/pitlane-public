// Mechanical atlas export from image_gen masters: no painted or synthesized poses.
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const report = [];
try {
  const page = await browser.newPage();
  for (const name of ["gus", "dash", "juno"]) {
    const source = await fs.readFile(`art/masters/idle-${name}-v1.png`);
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
      output.height = 960;
      const out = output.getContext("2d");
      const boxes = [];
      // Extract complete alpha-connected bodies, not guessed row boundaries.
      const seen = new Uint8Array(img.width * img.height),
        queue = new Int32Array(seen.length),
        parts = [];
      for (let seed = 0; seed < seen.length; seed++) {
        if (seen[seed] || data[seed * 4 + 3] <= 128) continue;
        let head = 0,
          tail = 1,
          l = img.width,
          t = img.height,
          r = 0,
          b = 0;
        queue[0] = seed;
        seen[seed] = 1;
        while (head < tail) {
          const p = queue[head++],
            x = p % img.width,
            y = Math.floor(p / img.width);
          l = Math.min(l, x);
          r = Math.max(r, x);
          t = Math.min(t, y);
          b = Math.max(b, y);
          for (const n of [
            x > 0 ? p - 1 : -1,
            x < img.width - 1 ? p + 1 : -1,
            y > 0 ? p - img.width : -1,
            y < img.height - 1 ? p + img.width : -1,
          ])
            if (n >= 0 && !seen[n] && data[n * 4 + 3] > 128) {
              seen[n] = 1;
              queue[tail++] = n;
            }
        }
        if (tail > 2000 && b - t > 80) parts.push({ l, t, r, b });
      }
      if (parts.length !== 20)
        throw Error("Expected 20 complete idle figures, got " + parts.length);
      parts.sort((a, b) => a.t + a.b - (b.t + b.b));
      for (let row = 0; row < 5; row++) {
        const group = parts
          .slice(row * 4, row * 4 + 4)
          .sort((a, b) => a.l - b.l);
        for (let col = 0; col < 4; col++) {
          const part = group[col],
            x0 = 0,
            y0 = 0,
            w = img.width,
            h = img.height;
          const left = part.l,
            top = part.t,
            right = part.r,
            bottom = part.b;
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
      }
      return { uri: output.toDataURL("image/png"), boxes };
    }, source.toString("base64"));
    await fs.writeFile(
      `public/art/idle-${name}-v1.png`,
      Buffer.from(result.uri.split(",")[1], "base64"),
    );
    report.push({ name, frames: result.boxes });
  }
  await fs.writeFile(
    "art/idle-v1-export.json",
    JSON.stringify(report, null, 2) + "\n",
  );
} finally {
  await browser.close();
}
