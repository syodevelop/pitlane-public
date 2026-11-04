// Mechanical alpha-bound extraction; retains the generated master unchanged.
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage();
  const source = await fs.readFile("art/masters/gus-illustrated-v4.png");
  const result = await page.evaluate(async (base64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + base64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const seen = new Uint8Array(c.width * c.height),
      queue = new Int32Array(seen.length),
      parts = [];
    for (let seed = 0; seed < seen.length; seed++) {
      if (seen[seed] || d[seed * 4 + 3] < 128) continue;
      let head = 0,
        tail = 1,
        l = c.width,
        t = c.height,
        r = 0,
        b = 0;
      queue[0] = seed;
      seen[seed] = 1;
      while (head < tail) {
        const p = queue[head++],
          x = p % c.width,
          y = Math.floor(p / c.width);
        l = Math.min(l, x);
        r = Math.max(r, x);
        t = Math.min(t, y);
        b = Math.max(b, y);
        for (const n of [
          x > 0 ? p - 1 : -1,
          x < c.width - 1 ? p + 1 : -1,
          y > 0 ? p - c.width : -1,
          y < c.height - 1 ? p + c.width : -1,
        ])
          if (n >= 0 && !seen[n] && d[n * 4 + 3] >= 128) {
            seen[n] = 1;
            queue[tail++] = n;
          }
      }
      if (tail > 10000 && b - t > 300) parts.push({ l, t, r, b });
    }
    if (parts.length !== 5)
      throw Error("Expected five separated figures, found " + parts.length);
    parts.sort((a, b) => a.l - b.l);
    const out = document.createElement("canvas");
    out.width = 2560;
    out.height = 512;
    const o = out.getContext("2d");
    for (let i = 0; i < 5; i++) {
      const p = parts[i],
        h = p.b - p.t + 1,
        s = 456 / h;
      // Center on upper torso rather than boot asymmetry.
      let sum = 0,
        count = 0;
      for (let y = Math.round(p.t + h * 0.26); y < p.t + h * 0.44; y++)
        for (let x = p.l; x <= p.r; x++)
          if (d[(y * c.width + x) * 4 + 3] > 128) {
            sum += x;
            count++;
          }
      const center = sum / count;
      p.center = center;
      p.scale = s;
      const sx = p.l - 2,
        sy = p.t - 2,
        sw = p.r - p.l + 5,
        sh = h + 4;
      o.drawImage(
        img,
        sx,
        sy,
        sw,
        sh,
        i * 512 + 256 + (sx - center) * s,
        486 + (sy - p.b - 1) * s,
        sw * s,
        sh * s,
      );
    }
    return {
      uri: out.toDataURL("image/png"),
      width: img.width,
      height: img.height,
      parts,
    };
  }, source.toString("base64"));
  await fs.writeFile(
    "public/art/gus-illustrated-v4.png",
    Buffer.from(result.uri.split(",")[1], "base64"),
  );
  delete result.uri;
  await fs.writeFile(
    "art/gus-illustrated-v4-export.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(result);
} finally {
  await browser.close();
}
