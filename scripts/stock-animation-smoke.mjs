// Isolated actual Phaser stock-pose renderer; no inventory or gameplay commands.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const preview = process.argv.includes("--preview");
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 920, height: 560 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  if (preview) await page.route("**/art/gus-stock-*.webp", route =>
    route.fulfill({path: "test-results/art-preview/" + new URL(route.request().url()).pathname.split("/").at(-1), contentType: "image/webp"}));
  await page.route("**/__stock_animation_test__", route => route.fulfill({contentType:"text/html", body:`<!doctype html><html><body style="margin:0"><script type="module">
    import Phaser from '/node_modules/.vite/deps/phaser.js';
    import {applyStockPose,STOCK_TEXTURES} from '/src/scene/stock-animation.ts';
    class Review extends Phaser.Scene {
      preload(){for(const key of STOCK_TEXTURES)this.load.spritesheet(key,'/art/'+key+'.webp',{frameWidth:192,frameHeight:192});}
      create(){
        this.add.text(22,18,'Gus / collecting parts / reach and lift',{fontSize:'20px',color:'#26332b'});
        const sprites=[];
        for(let row=0;row<2;row++)for(let facing=0;facing<4;facing++){
          const x=115+225*facing,y=225+245*row;
          this.add.ellipse(x,y,55,17,0x657260,0.3);
          const sprite=this.add.sprite(x,0,STOCK_TEXTURES[0],0).setOrigin(.5,184/192);
          this.add.container(0,y,[sprite]);applyStockPose(sprite,facing,row*700);
          this.add.text(x,y+24,['Front right','Front left','Back right','Back left'][facing]+' / '+(row?'lift':'reach'),{fontSize:'15px',color:'#26332b'}).setOrigin(.5);
          sprites.push({sprite,facing});
        }
        window.qa={inspect:()=>sprites.map(({sprite,facing})=>({facing,frame:Number(sprite.frame.name),flip:sprite.flipX,texture:sprite.texture.key,origin:sprite.originY})),advance:()=>sprites.forEach(({sprite,facing},i)=>applyStockPose(sprite,facing,(i<4?1:0)*700))};
      }
    }
    new Phaser.Game({type:Phaser.AUTO,width:920,height:560,backgroundColor:'#d8d8c9',scene:Review,audio:{noAudio:true}});
    </script></body></html>`}));
  await page.goto("http://127.0.0.1:5173/__stock_animation_test__");
  await page.waitForFunction(()=>window.qa?.inspect().length===8);
  const before=await page.evaluate(()=>qa.inspect());
  assert.deepEqual(before.map(s=>s.frame),[0,0,0,0,1,1,1,1]);
  assert.deepEqual(before.map(s=>s.flip),[false,true,false,true,false,true,false,true]);
  await fs.mkdir("test-results",{recursive:true});
  await page.screenshot({path:"test-results/gus-stock-renderer.png"});
  await page.evaluate(()=>qa.advance());
  const after=await page.evaluate(()=>qa.inspect());
  assert.deepEqual(after.map(s=>s.frame),[1,1,1,1,0,0,0,0]);
  assert.deepEqual(after.map(s=>s.origin),before.map(s=>s.origin));
  assert.deepEqual(errors,[]);
  console.log("Stock renderer passed: reach/lift, four directions, mirrored left facings, fixed origin. Inspect test-results/gus-stock-renderer.png. No inventory changes.");
} finally {await browser.close();}
