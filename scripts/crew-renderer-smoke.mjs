// Actual GarageActors renderer under controlled states; no server gameplay or earnings.
import {chromium} from '@playwright/test';
import {createGarage,BALANCE_VERSION} from '../packages/game-core/index.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=createGarage('crew-review','crew-review','demo',{now:1,seed:1,balanceVersion:BALANCE_VERSION});
const subject=process.argv.find(a=>a.startsWith('--character='))?.split('=')[1] || 'crew';
assert.ok(['crew','dash','juno'].includes(subject));
const actorId=subject==='crew'?'helper':'player';
const detail=process.argv.includes('--detail');
base.profile.character=subject==='crew'?'Gus':subject==='dash'?'Dash':'Juno';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1000,height:1850},deviceScaleFactor:detail?3:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/__crew_renderer_test__',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><body style="margin:0"><script type="module">
    import Phaser from '/node_modules/.vite/deps/phaser.js';
    import {GarageActors} from '/src/scene/actors.ts';
    import {PAIRED_TEXTURES} from '/src/scene/character-animation.ts';
    import {project,unproject} from '/src/scene/coordinates.ts';
    const subject=${JSON.stringify(subject)},actorId=${JSON.stringify(actorId)},base=${JSON.stringify(base)},dirs=[[1,1],[-1,1],[1,-1],[-1,-1]];
    class Review extends Phaser.Scene {
      preload(){for(const name of ['gus','dash','juno'])this.load.spritesheet('launch-'+name,'/art/launch-'+name+'.webp',{frameWidth:192,frameHeight:192});this.load.spritesheet('gus','/art/gus.webp',{frameWidth:128,frameHeight:192});for(const key of PAIRED_TEXTURES)this.load.spritesheet(key,'/art/'+key+'.webp',{frameWidth:192,frameHeight:192});}
      create(){
        this.add.text(20,15,'PITLANE / ${subject.toUpperCase()} / actual renderer, no gameplay rewards',{fontSize:'20px',color:'#26332b'});
        const records=[];
        for(let row=0;row<8;row++)for(let facing=0;facing<4;facing++){
          const g=structuredClone(base),a={...g.progress.actors.player,id:actorId,role:actorId==='helper'?'Mechanic':'Player'};
          g.progress.actors={[actorId]:a};
          const x=125+250*facing,y=210+225*row,[dx,dy]=dirs[facing];
          const distance=row===2?37.5:12.5;
          a.position=unproject({x:x-dx*distance/Math.SQRT2,y:y-dy*distance/Math.SQRT2});
          const renderer=new GarageActors(this);renderer.update(g,actorId,0);
          const target=unproject({x,y});
          a.travel={from:a.position,to:{x:target.x*2-a.position.x,y:target.y*2-a.position.y},startsAt:0,endsAt:2000};
          a.carrying=row===3?2:0;renderer.update(g,actorId,1000);
          if(row===0||row>=4){a.position=target;a.travel=null;}
          if(row>=4){a.taskId='work';const station=row<6?'quick':'stock',eq=project(row<6?{x:470,y:100}:{x:95,y:100});a.position=unproject({x:eq.x+8-dx*30,y:eq.y-45-dy*30});g.progress.tasks.work={id:'work',actorId,kind:row<6?'service':'stock',station,startsAt:1000,endsAt:20000,status:'started'};}
          // Use valid stations, then move only the rendered root into the inspection grid.
          const now=row===5?1360:row===7?1700:1000;renderer.update(g,actorId,now);
          const root=this.children.list.filter(o=>o instanceof Phaser.GameObjects.Container && o.list.some(c=>c instanceof Phaser.GameObjects.Sprite)).at(-1);
          root.setPosition(x,y);records.push({row,facing,sprite:root.list[2].visible,texture:root.list[2].texture.key,frame:Number(root.list[2].frame.name),walking:root.list[4].visible,mirror:root.list[4].scaleX,markerShapes:root.list[3].list.slice(0,2).some(c=>c.visible)});
          this.add.text(x,y+28,['Idle','Walk A','Walk B','Carry','Tool ready','Tool press','Stock empty','Stock lift'][row]+' / '+['FR','FL','BR','BL'][facing],{fontSize:'15px',color:'#26332b'}).setOrigin(.5);
        }
        window.records=records;
      }
    }
    new Phaser.Game({type:Phaser.AUTO,width:1000,height:1850,backgroundColor:'#d8d8c9',scene:Review,audio:{noAudio:true}});
    </script></body></html>`}));
  await page.goto('http://127.0.0.1:5173/__crew_renderer_test__');
  await page.waitForFunction(()=>window.records?.length===32);
  const records=await page.evaluate(()=>window.records);
  for(const r of records){
    assert.equal(r.markerShapes,false,'No geometric body remains for staff');
    assert.equal(r.walking,r.row>=1&&r.row<=3);
    if(r.walking)assert.equal(r.mirror,r.facing===1||r.facing===(subject==='crew'?3:2)?-1:1);
    else {assert.equal(r.sprite,true);assert.equal(r.frame,subject==='crew'?(r.row===5||r.row===7?1:0):(r.facing<2?0:4)+(r.row===4?2:r.row===5?3:r.row===7?1:0));}
  }
  assert.deepEqual(errors,[]);
  await fs.mkdir('test-results',{recursive:true});
  await page.screenshot(detail ? {path:'test-results/'+subject+'-gait-detail.png',clip:{x:570,y:550,width:115,height:130}} : {path:'test-results/'+subject+'-renderer.png'});
  console.log(subject+' renderer passed: 32 poses, four facings, walk/carry, tool and stock cycles, no placeholder body. Inspect test-results/'+subject+'-renderer.png.');
} finally {await browser.close();}
