// Actual Phaser parking presentation. No server commands or economic rewards.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 720, height: 420 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/__vehicle_review__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><body style="margin:0"><script type="module">
    import Phaser from '/node_modules/.vite/deps/phaser.js';
    import {BayVehicle} from '/src/scene/bay-vehicle.ts';
    class Review extends Phaser.Scene {
      preload(){this.load.spritesheet('rustback','/art/rustback.webp',{frameWidth:384,frameHeight:320});}
      create(){
        this.add.text(20,18,'PITLANE / parking transition / renderer fixture',{fontSize:'18px',color:'#263c35'});
        this.add.text(20,48,'Cosmetic parking maneuver. No gameplay, rewards or live race simulation.',{fontSize:'12px',color:'#263c35'});
        this.add.rectangle(350,270,250,150,0xb8b5a0).setStrokeStyle(2,0xe9e6d7);
        const image=this.add.image(350,300,'rustback',1).setOrigin(.5,.975).setDisplaySize(174,145);
        const shadow=this.add.ellipse(354,298,125,34,0x34453d,.24);
        const car=new BayVehicle(this,image,shadow);
        window.qa={sync:(key,frame=1)=>car.sync(key,frame),read:()=>({visible:car.root.visible,x:car.root.x,y:car.root.y,alpha:car.root.alpha,frame:Number(image.frame.name),tweens:this.tweens.getTweensOf(car.root).length,containers:this.children.list.filter(o=>o instanceof Phaser.GameObjects.Container).length})};
      }
    }
    new Phaser.Game({type:Phaser.AUTO,width:720,height:420,backgroundColor:'#c8c4ae',scene:Review,audio:{noAudio:true}});
  </script></body>`,
    }),
  );
  await page.goto("http://127.0.0.1:5173/__vehicle_review__");
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => window.qa.sync("restored-job"));
  let s = await page.evaluate(() => window.qa.read());
  assert.equal(s.visible, true);
  assert.equal(s.x, 350);
  assert.equal(s.tweens, 0, "Reload must not replay arrival");
  await page.evaluate(() => window.qa.sync(null));
  assert.equal(
    (await page.evaluate(() => window.qa.read())).visible,
    false,
    "Race dispatch/bay release hides parked car immediately",
  );
  await page.waitForTimeout(300);
  await fs.mkdir("docs/qa", { recursive: true });
  await page.screenshot({ path: "docs/qa/vehicle-departure.png" });
  await page.waitForFunction(() => window.qa.read().containers === 1);
  await page.evaluate(() => window.qa.sync("next-job"));
  await page.waitForTimeout(300);
  s = await page.evaluate(() => window.qa.read());
  assert.ok(s.x > 350 && s.x < 398);
  assert.ok(s.alpha > 0 && s.alpha < 1);
  await page.screenshot({ path: "docs/qa/vehicle-arrival.png" });
  await page.evaluate(() => window.qa.sync("next-job"));
  await page.waitForFunction(() => window.qa.read().tweens === 0);
  s = await page.evaluate(() => window.qa.read());
  assert.equal(s.x, 350);
  assert.equal(s.y, 300);
  assert.equal(s.alpha, 1);
  await page.screenshot({ path: "docs/qa/vehicle-parked.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    window.qa.sync(null);
    window.qa.sync("returned-car", 0);
  });
  s = await page.evaluate(() => window.qa.read());
  assert.equal(s.frame, 0);
  assert.equal(s.x, 350);
  assert.equal(s.tweens, 0);
  assert.equal(s.containers, 1);
  assert.deepEqual(errors, []);
  console.log(
    "Parking renderer passed: initial restore without replay, arrival, departure cleanup, repeated snapshot, return and reduced motion. Not a physical exit-path or server-settlement test.",
  );
} finally {
  await browser.close();
}
