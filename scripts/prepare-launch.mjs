// Mechanical export of generated originals; never paints or synthesizes art.
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
// Current landing ships the native PNG without a lossy re-encode. V1 exports
// remain reproducible for historical references; Home explicitly selects v2.
await fs.copyFile("art/masters/launch-garage-v2.png", "public/art/launch-garage-v2.png");
await fs.copyFile("art/masters/play-city-centered-v1.png", "public/art/play-city-centered-v1.png");
await fs.copyFile("art/masters/garage-interior-v1.png", "public/art/garage-interior-v1.png");
await fs.copyFile("art/masters/garage-interior-v2.png", "public/art/garage-interior-v2.png");
await fs.copyFile("art/masters/garage-interior-v3.png", "public/art/garage-interior-v3.png");
await fs.copyFile("art/masters/garage-interior-v4.png", "public/art/garage-interior-v4.png");
execFileSync(process.execPath, ["scripts/prepare-idle.mjs"], { stdio: "inherit" });
await fs.copyFile("art/masters/garage-floor-detail-v1.png", "public/art/garage-floor-detail-v1.png");
execFileSync(process.execPath, ["scripts/prepare-walk-v3.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/prepare-walk.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/prepare-art.mjs", "--launch"], {
  stdio: "inherit",
});
const reports = JSON.parse(
  await fs.readFile("art/launch-export-report.json", "utf8"),
);
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage();
  for (const item of [
    ...reports,
    { id: "launch-garage", file: "launch-garage-v1.png" },
  ]) {
    const source =
      "data:image/png;base64," +
      (await fs.readFile(`art/masters/${item.file}`)).toString("base64");
    const uri = await page.evaluate(
      async ({ source, box }) => {
        const image = new Image();
        image.src = source;
        await image.decode();
        const c = document.createElement("canvas");
        c.width = box ? 300 : image.width;
        c.height = box ? 500 : image.height;
        const ctx = c.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        if (box) {
          const s = Math.min(460 / box.h, 280 / box.w);
          ctx.drawImage(
            image,
            box.x,
            box.y,
            box.w,
            box.h,
            (300 - box.w * s) / 2,
            480 - box.h * s,
            box.w * s,
            box.h * s,
          );
        } else ctx.drawImage(image, 0, 0);
        return c.toDataURL("image/webp", 0.93);
      },
      { source, box: item.boxes?.[0] },
    );
    const destination = `public/art/${item.id}${item.boxes ? "-portrait" : ""}.webp`;
    await fs.writeFile(destination, Buffer.from(uri.split(",")[1], "base64"));
    console.log(destination);
  }
} finally {
  await browser.close();
}
