// Renderer-only fixture: no login, server progress, earnings or wallet proof.
// The harness exists only in this Playwright response, never as a public route.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createGarage, BALANCE_VERSION } from '../packages/game-core/index.ts';
const now = Date.now();
const state = createGarage('renderer-fixture', 'visual-test', 'demo', {now, seed: 1, balanceVersion: BALANCE_VERSION});
state.profile.character = 'Gus';
state.progress.actors.player.position = {x:160,y:170};
state.progress.actors.runner = {id:'runner',role:'Runner',level:1,position:{x:490,y:280},travel:null,carrying:0,taskId:null};
const browser = await chromium.launch({channel:'msedge',headless:true});
const page = await browser.newPage({viewport:{width:1000,height:700}});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await fs.mkdir('test-results',{recursive:true});
try {
  await page.route('**/__actor_renderer_test__', route => route.fulfill({contentType:'text/html',body:`
    <!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#c8c4ae;font:16px sans-serif">
    <p>Renderer test fixture — Gus and Runner remain visible when control changes.</p>
    <script type="module">
    import Phaser from '/node_modules/.vite/deps/phaser.js';
    import {GarageActors} from '/src/scene/actors.ts';
    const state=${JSON.stringify(state)};
    let selected='player';
    class TestScene extends Phaser.Scene {
      preload(){for(const name of ['gus','dash','juno'])this.load.spritesheet('launch-'+name,'/art/launch-'+name+'.webp',{frameWidth:192,frameHeight:192});this.load.spritesheet('gus','/art/gus.webp',{frameWidth:128,frameHeight:192});for(const key of ['crew-front','crew-back','crew-work-front','crew-work-back'])this.load.spritesheet(key,'/art/'+key+'.webp',{frameWidth:192,frameHeight:192});}
      create(){this.actors=new GarageActors(this);window.qa={select:id=>selected=id,inspect:()=>{
        const roots=this.children.list.filter(o=>o instanceof Phaser.GameObjects.Container && o.list.some(child=>child instanceof Phaser.GameObjects.Sprite));
        return {count:roots.length,roots:roots.map(root=>({x:root.x,y:root.y,visible:root.visible,selected:root.list[1].visible,sprite:root.list[2].visible,label:root.list[3].list[2].text}))};
      }};}
      update(){this.actors?.update(state,selected,${now});}
    }
    new Phaser.Game({type:Phaser.AUTO,width:1000,height:600,backgroundColor:'#c8c4ae',scene:TestScene,audio:{noAudio:true}});
    </script></body></html>`}));
  await page.goto('http://127.0.0.1:5173/__actor_renderer_test__');
  await page.waitForFunction(()=>window.qa?.inspect().count===2);
  const before=await page.evaluate(()=>window.qa.inspect());
  assert.equal(before.roots.filter(r=>r.sprite).length,2,'Gus and helper must both use visible sprites');
  assert.deepEqual(before.roots.map(r=>r.label),['Gus','Runner']);
  await page.evaluate(()=>window.qa.select('runner'));
  await page.waitForFunction(()=>window.qa.inspect().roots[1].selected);
  const after=await page.evaluate(()=>window.qa.inspect());
  assert.equal(after.count,2);
  assert.deepEqual(after.roots.map(r=>[r.x,r.y,r.sprite,r.visible]),before.roots.map(r=>[r.x,r.y,r.sprite,r.visible]),'Switching control must not move or hide either actor');
  assert.deepEqual(after.roots.map(r=>r.selected),[false,true]);
  await page.screenshot({path:'test-results/actor-renderer-fixture.png'});
  assert.deepEqual(errors,[]);
  console.log('Renderer fixture passed: both actors retained, correct role labels, one selection ring, unchanged positions and visible Gus when controlling Runner. Not an authenticated gameplay test.');
} finally { await browser.close(); }
