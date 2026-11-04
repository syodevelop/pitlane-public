// Actual Phaser renderer poses under controlled time; not authoritative gameplay evidence.
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createGarage,BALANCE_VERSION} from '../packages/game-core/index.ts';
const state=createGarage('pose-fixture','pose-fixture','demo',{now:1,seed:1,balanceVersion:BALANCE_VERSION});
state.profile.character='Gus';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1000,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/__gait_renderer_test__',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><script type="module">
    import Phaser from '/node_modules/.vite/deps/phaser.js';
    import {GarageActors} from '/src/scene/actors.ts';
    import {unproject} from '/src/scene/coordinates.ts';
    const base=${JSON.stringify(state)};
    class TestScene extends Phaser.Scene {
      preload(){for(const name of ['gus','dash','juno'])this.load.spritesheet('launch-'+name,'/art/launch-'+name+'.webp',{frameWidth:192,frameHeight:192});this.load.spritesheet('gus','/art/gus.webp',{frameWidth:128,frameHeight:192});}
      create(){
        const directions=[[1,1],[-1,1],[1,-1],[-1,-1]],names=['Front right','Front left','Back right','Back left'];
        this.add.text(30,20,'Phaser cutout gait / renderer fixture / original raster source',{fontSize:'20px',color:'#253b31'});
        for(let row=0;row<4;row++)for(let col=0;col<4;col++){
          const time=1000, distance=[50,12.5,37.5,12.5][row];
          const screen={x:145+col*235,y:210+row*205},[dx,dy]=directions[col];
          const g=structuredClone(base), a=g.progress.actors.player;
          a.position=unproject({x:screen.x-dx*distance/Math.SQRT2,y:screen.y-dy*distance/Math.SQRT2});
          const renderer=new GarageActors(this);renderer.update(g,'player',time);
          const target=unproject(screen);
          a.travel={from:a.position,to:{x:target.x*2-a.position.x,y:target.y*2-a.position.y},startsAt:0,endsAt:2000};
          a.carrying=row===3?2:0;
          renderer.update(g,'player',time);
          this.add.text(screen.x,screen.y+25,names[col]+' / '+['passing','contact A','contact B','carry'][row],{fontSize:'14px',color:'#253b31'}).setOrigin(0.5);
        }
        window.ready=true;
      }
    }
    new Phaser.Game({type:Phaser.AUTO,width:1000,height:900,backgroundColor:'#c8c4ae',scene:TestScene,audio:{noAudio:true}});
    </script></body></html>`}));
  await page.goto('http://127.0.0.1:5173/__gait_renderer_test__');
  await page.waitForFunction(()=>window.ready===true);
  await fs.mkdir('test-results',{recursive:true});
  await page.screenshot({path:'test-results/gus-gait-renderer.png'});
  assert.deepEqual(errors,[]);
  console.log('Rendered four facings and three gait phases plus carry using the actual Phaser cutout renderer. Inspect test-results/gus-gait-renderer.png for seams and anchors; this is not a live gameplay test.');
} finally {await browser.close();}
