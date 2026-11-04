// Actual work-pose renderer. Test state is local to this page, never sent to Worker.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 920, height: 560 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/__work_animation_test__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><script type="module">
  import Phaser from '/node_modules/.vite/deps/phaser.js';
  import {applyWorkPose,WORK_TEXTURES} from '/src/scene/work-animation.ts';
  class TestScene extends Phaser.Scene {
    preload(){for(const texture of WORK_TEXTURES)this.load.spritesheet(texture,'/art/'+texture+'.webp',{frameWidth:192,frameHeight:192});}
    create(){
      this.add.text(22,18,'Gus / four work directions / raised and extended tool',{fontSize:'20px',color:'#26332b'});
      const sprites=[];
      for(let row=0;row<2;row++)for(let facing=0;facing<4;facing++){
        const x=115+facing*225,y=225+row*245;
        this.add.ellipse(x,y,55,17,0x657260,0.3);
        const sprite=this.add.sprite(x,0,WORK_TEXTURES[0],0).setOrigin(0.5,184/192).setScale(1);
        const container=this.add.container(0,y,[sprite]);
        applyWorkPose(sprite,facing,row*360);
        this.add.text(x,y+24,['Front right','Front left','Back right','Back left'][facing]+' / '+(row?'press':'lift'),{fontSize:'15px',color:'#26332b'}).setOrigin(0.5);
        sprites.push({sprite,container,facing});
      }
      window.qa={inspect:()=>sprites.map(({sprite,container,facing})=>({texture:sprite.texture.key,frame:Number(sprite.frame.name),flip:sprite.flipX,x:sprite.x,y:container.y,origin:sprite.originY,facing})),advance:()=>sprites.forEach(({sprite,facing},i)=>applyWorkPose(sprite,facing,(i<4?1:0)*360))};
    }
  }
  new Phaser.Game({type:Phaser.AUTO,width:920,height:560,backgroundColor:'#d8d8c9',scene:TestScene,audio:{noAudio:true}});
  </script></body></html>`,
    }),
  );
  await page.goto("http://127.0.0.1:5173/__work_animation_test__");
  await page.waitForFunction(() => window.qa?.inspect().length === 8);
  const before = await page.evaluate(() => qa.inspect());
  assert.deepEqual(
    before.map((s) => s.frame),
    [0, 0, 0, 0, 1, 1, 1, 1],
  );
  assert.deepEqual(
    before.map((s) => s.flip),
    [false, true, false, false, false, true, false, false],
  );
  await fs.mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/gus-work-renderer.png" });
  await page.evaluate(() => qa.advance());
  const after = await page.evaluate(() => qa.inspect());
  assert.deepEqual(
    after.map((s) => s.frame),
    [1, 1, 1, 1, 0, 0, 0, 0],
  );
  assert.deepEqual(
    after.map((s) => [s.x, s.y, s.origin]),
    before.map((s) => [s.x, s.y, s.origin]),
  );
  assert.deepEqual(errors, []);
  console.log(
    "Work pose renderer passed: eight poses, four directions, mirrored front-left, phase changes preserve object anchors. Inspect foot alignment in test-results/gus-work-renderer.png.",
  );
} finally {
  await browser.close();
}
