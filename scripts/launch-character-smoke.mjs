// Isolated renderer fixtures: never commands, balances, login bypass or public routes.
import { chromium } from "@playwright/test";
import { createGarage, BALANCE_VERSION } from "../packages/game-core/index.ts";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  await fs.mkdir("docs/qa/launch", { recursive: true });
  for (const character of ["Gus", "Dash", "Juno"]) {
    const state = createGarage("launch-art-fixture", "fixture", "demo", {
      now: 1,
      seed: 1,
      balanceVersion: BALANCE_VERSION,
    });
    state.profile.character = character;
    const page = await browser.newPage({
      viewport: { width: 1000, height: 1760 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/__launch_pose_fixture__", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><body style="margin:0"><script type="module">
      import Phaser from '/node_modules/.vite/deps/phaser.js';
      import { GarageActors } from '/src/scene/actors.ts';
      import { LAUNCH_TEXTURES } from '/src/scene/launch-character.ts';
      import { project, unproject } from '/src/scene/coordinates.ts';
      import { STATIONS } from '/packages/game-core/index.ts';
      const base=${JSON.stringify(state)}, dirs=[[1,1],[-1,1],[1,-1],[-1,-1]];
      class Review extends Phaser.Scene {
        preload(){this.load.spritesheet('gus','/art/gus.webp',{frameWidth:128,frameHeight:192});for(const key of LAUNCH_TEXTURES)this.load.spritesheet(key,'/art/'+key+'.webp',{frameWidth:192,frameHeight:192});}
        create(){
          this.add.text(20,15,'${character} / current Phaser renderer / fixture only',{fontSize:'20px',color:'#26332b'});
          const records=[];
          for(let row=0;row<8;row++)for(let facing=0;facing<4;facing++){
            const g=structuredClone(base), a=g.progress.actors.player, [dx,dy]=dirs[facing];
            const target={x:125+250*facing,y:220+215*row}, distance=row===2?37.5:12.5;
            a.position=unproject({x:target.x-dx*distance/Math.SQRT2,y:target.y-dy*distance/Math.SQRT2});
            const r=new GarageActors(this);r.update(g,'player',0);
            const to=unproject(target);a.travel={from:a.position,to:{x:to.x*2-a.position.x,y:to.y*2-a.position.y},startsAt:0,endsAt:2000};
            a.carrying=row===3?2:0;r.update(g,'player',1000);
            if(row===0||row>=4){a.position=to;a.travel=null;}
            if(row>=4){
              const station=row<6?'quick':'stock',eq=project(STATIONS[station]);
              a.position=unproject({x:eq.x+8-dx*30,y:eq.y-45-dy*30});a.taskId='work';
              g.progress.tasks.work={id:'work',actorId:'player',kind:row<6?'service':'stock',station,startsAt:1000,endsAt:20000,status:'started'};
            }
            r.update(g,'player',row===5?1360:row===7?1700:1000);
            const v=r.visuals.get('player');v.root.setPosition(target.x,target.y).setScale(1.35);
            records.push({row,facing,actualFacing:v.facing,texture:v.sprite.texture.key,frame:Number(v.sprite.frame.name),visible:v.sprite.visible,walking:v.walkRig.visible,mirror:v.walkRig.scaleX,torso:v.torso.texture.key,torsoFrame:Number(v.torso.frame.name),legs:v.legs.map(l=>l.texture.key),origin:v.sprite.originY,flip:v.sprite.flipX});
            this.add.text(target.x,target.y+28,['Idle','Walk A','Walk B','Carry','Tool ready','Tool press','Stock empty','Stock lift'][row]+' / '+['FR','FL','BR','BL'][facing],{fontSize:'15px',color:'#26332b'}).setOrigin(.5);
          }window.records=records;
        }
      }
      new Phaser.Game({type:Phaser.AUTO,width:1000,height:1760,backgroundColor:'#ede8dc',scene:Review,audio:{noAudio:true}});
    </script></body></html>`,
      }),
    );
    await page.goto("http://127.0.0.1:5173/__launch_pose_fixture__");
    await page.waitForFunction(() => window.records?.length === 32);
    for (const r of await page.evaluate(() => window.records)) {
      const texture = `launch-${character.toLowerCase()}`,
        base = r.facing < 2 ? 0 : 4;
      assert.equal(r.actualFacing, r.facing);
      assert.equal(r.walking, r.row >= 1 && r.row <= 3);
      assert.equal(r.origin, 184 / 192);
      if (r.walking) {
        assert.equal(r.mirror, r.facing === 1 || r.facing === 2 ? -1 : 1);
        assert.equal(r.torso, texture);
        assert.deepEqual(r.legs, [texture, texture]);
        assert.equal(r.torsoFrame, base + Number(r.row === 3));
        assert.equal(r.visible, false);
      } else {
        assert.equal(r.texture, texture);
        assert.equal(r.visible, true);
        assert.equal(
          r.frame,
          base + (r.row === 4 ? 2 : r.row === 5 ? 3 : r.row === 7 ? 1 : 0),
        );
        assert.equal(r.flip, r.facing === 1 || r.facing === 2);
      }
    }
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: `docs/qa/launch/${character.toLowerCase()}-poses.png`,
    });
    await page.close();
  }
  console.log(
    "Launch characters: 96 actual-renderer poses passed; all leads use new art in idle, walking, carrying, work and stock, all four facings. Visual review images saved. No authoritative gameplay claim.",
  );
} finally {
  await browser.close();
}
