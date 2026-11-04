import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const origin=process.env.PITLANE_ORIGIN||'http://127.0.0.1:5173',out='docs/qa/workshop-2026-11-01';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const stage=page.locator('.workshop-stage'), data=()=>stage.evaluate(e=>({...e.dataset}));
const pressed=new Set();
async function keys(next){for(const k of pressed)if(!next.includes(k)){await page.keyboard.up(k);pressed.delete(k)}for(const k of next)if(!pressed.has(k)){await page.keyboard.down(k);pressed.add(k)}}
async function walk(x,z){await stage.focus();const end=Date.now()+22000;while(Date.now()<end){const d=await data(),dx=x-Number(d.x),dz=z-Number(d.z);if(Math.hypot(dx,dz)<.21){await keys([]);await page.waitForTimeout(300);return;}const a=14*Math.PI/180,vx=dx*Math.cos(a)-dz*Math.sin(a),vy=dx*Math.sin(a)+dz*Math.cos(a),next=[];if(Math.abs(vx)>.12)next.push(vx>0?'d':'a');if(Math.abs(vy)>.12)next.push(vy>0?'s':'w');await keys(next);await page.waitForTimeout(75)}await keys([]);throw Error('walk timeout '+JSON.stringify({target:{x,z},at:await data()}))}
try {
 await page.addInitScript(()=>{
  if(!localStorage.getItem('pitlane.workshop.v1')) localStorage.setItem('pitlane.workshop.v1',JSON.stringify({version:1,character:'dash',position:{x:9.5,z:7.8},credits:495,serviced:10,tools:1,carried:null,collectProgress:0,order:{number:11,kind:'front',status:'service',progress:{'front-left':.4}},reward:null,milestoneSeen:true}));
  localStorage.setItem('pitlane.garageCamera.v1',JSON.stringify({version:1,tilt:79,yaw:130,zoom:1.6,offsetX:4,offsetZ:5,targetHeight:3,follow:false,anchorX:0,anchorY:0}));
 });
 await page.goto(origin+'/play');await page.locator('.workshop-hud').waitFor({timeout:60000});
 await expect(stage).toHaveAttribute('data-camera-tilt','52');await expect(stage).toHaveAttribute('data-camera-rotation','14');await expect(stage).toHaveAttribute('data-camera-zoom','1');await expect(stage).toHaveAttribute('data-camera-height','0');await expect(stage).toHaveAttribute('data-camera-offset-z','-0.6');await expect(stage).toHaveAttribute('data-camera-follow','true');
 await expect(page.getByRole('button',{name:'Camera',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Pause and settings'}).click();await expect(page.getByRole('combobox',{name:'Crew lead'})).toHaveCount(0);await page.getByRole('button',{name:'Back to work'}).click();
 await page.screenshot({path:out+'/team-garage-locked.png'});
 await page.getByRole('button',{name:'Open Team Garage'}).click();await expect(stage).toHaveAttribute('data-team-unlocked','true');await expect(stage).toHaveAttribute('data-credits','195');
 await page.screenshot({path:out+'/team-garage-open.png'});
 await walk(12.8,7.8);await expect(page.getByRole('region',{name:'Your Rustback'})).toBeVisible();
 await walk(13.65,7.8);
 const points=JSON.parse((await data()).teamPoints);
 await walk(13.65,points[0].z);
 for(const [i,p]of points.entries()){
  await walk(p.x,p.z);await expect(stage).toHaveAttribute('data-active',p.id);
  await page.waitForFunction(id=>Number(JSON.parse(document.querySelector('.workshop-stage').dataset.teamProgress)[id])>.2,p.id);
  if(i===0){await page.reload();await page.locator('.workshop-hud').waitFor({timeout:60000});await expect(stage).toHaveAttribute('data-team-unlocked','true');expect(JSON.parse((await data()).teamProgress)[p.id]).toBeGreaterThan(.2)}
  await page.screenshot({path:out+`/team-restoration-${i+1}.png`});
  await page.waitForFunction(id=>JSON.parse(document.querySelector('.workshop-stage').dataset.teamProgress)[id]===1,p.id,{timeout:18000});
  if(i===1){await walk(13.65,p.z)}
 }
 await expect(stage).toHaveAttribute('data-team-ready','true');await expect(stage).toHaveAttribute('data-credits','195');await expect(stage).toHaveAttribute('data-serviced','10');
 await page.screenshot({path:out+'/team-rustback-restored.png'});
 await walk(13.65,7.8);await walk(9.5,7.8);await expect(page.getByRole('region',{name:'Current customer job'})).toBeVisible();
 await page.reload();await page.locator('.workshop-hud').waitFor({timeout:60000});await expect(stage).toHaveAttribute('data-team-ready','true');await expect(stage).toHaveAttribute('data-character','dash');
 const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('pitlane.workshop.v1')));expect(save.order.progress['front-left']).toBe(.4);expect(save.credits).toBe(195);
 await page.getByRole('button',{name:'Pause and settings'}).click();await page.getByRole('button',{name:'Start over',exact:true}).click();await page.getByRole('button',{name:'Start a new shift',exact:true}).click();await expect(stage).toHaveAttribute('data-team-unlocked','false');await expect(stage).toHaveAttribute('data-character','dash');
 expect(errors).toEqual([]);await fs.writeFile(out+'/team-garage.json',JSON.stringify({passed:true,fixedCameraIgnoresStorage:true,characterPreserved:true,doorwayTraversal:true,restorationPersists:true,customerUnchanged:true,errors},null,2));
 console.log('PASS fixed camera, locked crew, unlock charge once, passage both ways, restore Rustback, reload partial work and keep customer job.');
}catch(error){await page.screenshot({path:out+'/team-failure.png'}).catch(()=>{});console.log('FAIL STATE',await data().catch(()=>null));throw error}finally{await keys([]).catch(()=>{});await browser.close()}
