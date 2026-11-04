// Capture the current game renderer without UI or server/player mutations.
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";

const out = "docs/qa/docs-workshop-capture-2026-10-25";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    const { GarageWorld, preloadGarageCrew } =
      await import("/src/scene/garage-world.ts");
    const { DEFAULT_GARAGE_CAMERA } =
      await import("/src/scene/garage-camera.ts");
    await preloadGarageCrew();
    document.body.replaceChildren();
    document.body.style.cssText = "margin:0;overflow:hidden";
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:0";
    document.body.append(host);
    const position = { x: 90, y: 180 };
    const world = new GarageWorld(host, "gus", position);
    world.actor.setGait("relaxed");
    // Stop the existing customer at its normal service destination.
    let seconds = 0;
    while (world.traffic.phase !== "stopped" && seconds < 35) {
      world.traffic.update(1 / 60);
      seconds += 1 / 60;
    }
    if (world.traffic.phase !== "stopped")
      throw new Error("Customer did not arrive");
    window.docsWorkshop = { world, position, defaults: DEFAULT_GARAGE_CAMERA };
  });
  for (const [name, yaw, tilt, zoom, heading] of [
    ["side-front", -105, 42, 1.6, -1.6],
  ]) {
    await page.evaluate(
      ({ yaw, tilt, zoom, heading }) => {
        const { world, position, defaults } = window.docsWorkshop;
        world.setCameraSettings({
          ...defaults,
          yaw,
          tilt,
          zoom,
          follow: false,
          anchorX: 145,
          anchorY: 168,
          offsetZ: 0,
          offsetX: 0,
        });
        world.update(position, { x: 0, y: 0 }, 0, false);
        for (let i = 0; i < 60; i++)
          world.actor.update(1 / 60, heading, 0, false);
        // Frame the car and crew clearly at the guide's 240px display width.
        world.camera.zoom = 1.4;
        world.camera.updateProjectionMatrix();
        world.renderer.render(world.scene, world.camera);
      },
      { yaw, tilt, zoom, heading },
    );
    // Wait for any observer callbacks, then render with the final viewport size.
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => {
            const { world } = window.docsWorkshop;
            world.renderer.render(world.scene, world.camera);
            resolve();
          }),
        ),
    );
    await page.locator("canvas").screenshot({ path: `${out}/${name}.png` });
    const encoded = await page.evaluate(() => {
      const { world } = window.docsWorkshop;
      world.renderer.render(world.scene, world.camera);
      return world.renderer.domElement
        .toDataURL("image/webp", 0.92)
        .split(",")[1];
    });
    await fs.writeFile(
      "public/art/docs-workshop-game-v1.webp",
      Buffer.from(encoded, "base64"),
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "Saved public/art/docs-workshop-game-v1.webp: 1440×900, current GarageWorld renderer, no HUD.",
  );
  await page.evaluate(() => window.docsWorkshop.world.dispose());
} finally {
  await browser.close();
}
