// Recorded renderer review only. No HTTP commands, wallet or rewards.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createGarage, BALANCE_VERSION } from "../packages/game-core/index.ts";
const state = createGarage("motion-review", "motion-review", "demo", {
  now: 1,
  seed: 1,
  balanceVersion: BALANCE_VERSION,
});
const character =
  process.argv.find((a) => a.startsWith("--character="))?.split("=")[1] ||
  "Gus";
assert.ok(["Gus", "Dash", "Juno"].includes(character));
state.profile.character = character;
const crew = process.argv.includes("--crew");
const actorId = crew ? "helper" : "player";
const outputName = crew
  ? "crew-v1-motion"
  : character === "Gus"
    ? "v5-pilot-motion"
    : character.toLowerCase() + "-v1-motion";
if (crew)
  state.progress.actors = {
    helper: { ...state.progress.actors.player, id: "helper", role: "Mechanic" },
  };
await fs.mkdir("test-results/motion", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 960, height: 540 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.route("**/__pilot_motion_review__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><script type="module">
    import Phaser from '/node_modules/.vite/deps/phaser.js';
    import {GarageActors} from '/src/scene/actors.ts';
    import {WORK_TEXTURES} from '/src/scene/work-animation.ts';
    import {PAIRED_TEXTURES} from '/src/scene/character-animation.ts';
    import {project,unproject} from '/src/scene/coordinates.ts';
    const actorId=${JSON.stringify(actorId)},base=${JSON.stringify(state)}, directions=[[1,1],[-1,1],[1,-1],[-1,-1]];
    class Review extends Phaser.Scene {
      preload(){for(const name of ['gus','dash','juno'])this.load.spritesheet('launch-'+name,'/art/launch-'+name+'.webp',{frameWidth:192,frameHeight:192});this.load.spritesheet('gus','/art/gus.webp',{frameWidth:128,frameHeight:192});for(const key of [...WORK_TEXTURES,...PAIRED_TEXTURES])this.load.spritesheet(key,'/art/'+key+'.webp',{frameWidth:192,frameHeight:192});}
      create(){
        this.add.text(22,18,'PITLANE / ${crew ? "CREW" : character.toUpperCase()} / MOTION REVIEW',{fontSize:'22px',color:'#26332b'});
        this.add.text(22,48,'Actual actor renderer. Fixture only: no gameplay, rewards or wallet.',{fontSize:'13px',color:'#26332b'});
        this.items=[];this.start=performance.now();this.seen=new Set();
        for(let row=0;row<2;row++)for(let i=0;i<4;i++){
          const g=structuredClone(base),actor=g.progress.actors[actorId],[dx,dy]=directions[i];
          const center={x:120+i*240,y:225+row*230};
          actor.position=unproject({x:center.x-dx,y:center.y-dy});
          const renderer=new GarageActors(this);renderer.update(g,actorId,1);
          actor.travel={from:unproject({x:center.x-dx,y:center.y-dy}),to:unproject({x:center.x+dx,y:center.y+dy}),startsAt:0,endsAt:2};
          renderer.update(g,actorId,1);actor.position=unproject(center);actor.travel=null;
          if(row===0){const eq=project({x:470,y:100});actor.position=unproject({x:eq.x+8-dx*30,y:eq.y-45-dy*30});actor.taskId='work';g.progress.tasks.work={id:'work',actorId,kind:'service',station:'quick',status:'started',startsAt:1,endsAt:20000};}
          else actor.carrying=i>1?2:0;
          this.items.push({g,renderer,row,i,center,dx,dy});
          this.add.text(center.x,center.y+(row===0?32:60),(row===0?'Work ':'Walk / diagonal ')+(i>1&&row===1?'/ carrying':'')+(row===0?[' / front right',' / front left',' / back right',' / back left'][i]:String(i+1)),{fontSize:'12px',color:'#26332b'}).setOrigin(0.5);
        }
        window.qa={seen:()=>this.seen.size};
      }
      update(){if(!this.items)return;const elapsed=performance.now()-this.start+1;
        for(const item of this.items){const {g,renderer,row,i,center,dx,dy}=item,actor=g.progress.actors[actorId];
          if(row===1){const phase=elapsed%1600,sign=Math.floor(elapsed/1600)%2?-1:1;actor.travel={from:unproject({x:center.x-dx*sign*60,y:center.y-dy*sign*24}),to:unproject({x:center.x+dx*sign*60,y:center.y+dy*sign*24}),startsAt:elapsed-phase,endsAt:elapsed-phase+1600};}
          renderer.update(g,actorId,elapsed);if(row===0)renderer.visuals.get(actorId).root.setPosition(center.x,center.y);
          if(row===0)this.seen.add(i+':'+(Math.floor(elapsed/360)%2));
        }
      }
    }
    new Phaser.Game({type:Phaser.AUTO,width:960,height:540,backgroundColor:'#d3d4c5',scene:Review,audio:{noAudio:true}});
  </script></body></html>`,
    }),
  );
  await page.goto("http://127.0.0.1:5173/__pilot_motion_review__");
  await page.waitForFunction(() => window.qa?.seen() === 8);
  await page.evaluate(() => {
    const stream = document.querySelector("canvas").captureStream(30);
    const type = "video/webm;codecs=vp9";
    if (!MediaRecorder.isTypeSupported(type))
      throw new Error("Browser WebM encoder unavailable.");
    const recorder = new MediaRecorder(stream, { mimeType: type });
    const chunks = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    window.stopReview = () =>
      new Promise((resolve) => {
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve(
            Array.from(
              new Uint8Array(await new Blob(chunks, { type }).arrayBuffer()),
            ),
          );
        };
        recorder.stop();
      });
    recorder.start();
  });
  await page.waitForTimeout(6500);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: "test-results/" + outputName + "-frame.png" });
  const bytes = await page.evaluate(() => window.stopReview());
  assert.ok(bytes.length > 1000, "Recorded clip must contain encoded frames");
  await fs.writeFile("docs/qa/" + outputName + ".webm", Buffer.from(bytes));
  const playback = await context.newPage();
  await playback.setContent(
    '<!doctype html><body style="margin:0"><video hidden muted preload="auto"></video><canvas width="960" height="540"></canvas></body>',
  );
  // Blob seeking works without an HTTP range server. A route returning 200 for
  // every Range request silently reset currentTime to zero in Edge.
  await playback.evaluate((bytes) => {
    document.querySelector("video").src = URL.createObjectURL(
      new Blob([new Uint8Array(bytes)], { type: "video/webm" }),
    );
  }, bytes);
  await playback.waitForFunction(
    () => document.querySelector("video").readyState >= 2,
  );
  const decoded = new Set();
  for (const time of [0.2, 0.56, 0.92]) {
    const frame = await playback.evaluate(async (time) => {
      const video = document.querySelector("video");
      await new Promise((resolve) => {
        video.addEventListener("seeked", resolve, { once: true });
        video.currentTime = time;
      });
      const canvas = document.querySelector("canvas");
      canvas.getContext("2d").drawImage(video, 0, 0);
      return { time: video.currentTime, data: canvas.toDataURL("image/png") };
    }, time);
    assert.ok(
      Math.abs(frame.time - time) < 0.05,
      "Decoder must seek to the requested phase",
    );
    decoded.add(frame.data);
    await fs.writeFile(
      `test-results/motion/${outputName}-${time}.png`,
      Buffer.from(frame.data.split(",")[1], "base64"),
    );
  }
  assert.equal(
    decoded.size,
    3,
    "Motion review must contain distinct decoded phases",
  );
  await context.close();
  console.log(
    "Saved " +
      outputName +
      ".webm: actual actor renderer without pose overrides. Work phases observed in all directions. Visual review artifact, not a gameplay test.",
  );
} finally {
  await browser.close();
}
