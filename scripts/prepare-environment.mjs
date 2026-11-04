// Mechanical resize/encoding of original opaque image_gen materials only.
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
const specs = [
  {
    id: "concrete-material",
    file: "concrete-material-v1.png",
    width: 512,
    height: 512,
  },
  {
    id: "asphalt-material",
    file: "asphalt-material-v1.png",
    width: 512,
    height: 512,
  },
  {
    id: "grass-material",
    file: "grass-material-v1.png",
    width: 512,
    height: 512,
  },
  {
    id: "garage-wall-panel",
    file: "garage-wall-panel-v1.png",
    width: 768,
    height: 256,
  },
];
const browser = await chromium.launch({ channel: "msedge", headless: true }),
  report = [];
try {
  const page = await browser.newPage();
  for (const spec of specs) {
    const data = await fs.readFile("art/masters/" + spec.file);
    const result = await page.evaluate(
      async ({ spec, source }) => {
        const image = new Image();
        image.src = source;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = spec.width;
        canvas.height = spec.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(image, 0, 0, spec.width, spec.height);
        const pixels = ctx.getImageData(0, 0, spec.width, spec.height).data;
        let nonOpaque = 0;
        for (let i = 3; i < pixels.length; i += 4)
          if (pixels[i] !== 255) nonOpaque++;
        return {
          dimensions: [image.width, image.height],
          nonOpaque,
          uri: canvas.toDataURL("image/webp", 0.88),
        };
      },
      { spec, source: "data:image/png;base64," + data.toString("base64") },
    );
    if (result.nonOpaque || !result.uri.startsWith("data:image/webp;"))
      throw Error("Invalid opaque material " + spec.id);
    const output = Buffer.from(result.uri.split(",")[1], "base64");
    delete result.uri;
    await fs.writeFile("public/art/" + spec.id + ".webp", output);
    report.push({ ...spec, ...result, bytes: output.length });
  }
} finally {
  await browser.close();
}
await fs.writeFile(
  "art/environment-export-report.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
