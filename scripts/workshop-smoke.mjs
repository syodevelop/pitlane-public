import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const origin=process.env.PITLANE_ORIGIN||'http://127.0.0.1:5173';
const out='docs/qa/workshop-2026-11-01';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const errors=[],results=[];
const page=await browser.newPage({viewport:{width:1440,height:900}});
page.on('pageerror',e=>errors.push(e.message));
const data=()=>page.locator('.workshop-stage').evaluate(e=>({...e.dataset}));
const pressed=new Set();
async function keys(next){for(const k of pressed)if(!next.includes(k)){await page.keyboard.up(k);pressed.delete(k)}for(const k of next)if(!pressed.has(k)){await page.keyboard.down(k);pressed.add(k)}}
async function walk(x,z){await page.locator('.workshop-stage').focus();const end=Date.now()+25000;while(Date.now()<end){if(await page.locator('dialog[aria-label="First shift complete"][open]').count()){await keys([]);return;}const d=await data(),dx=x-Number(d.x),dz=z-Number(d.z);if(Math.hypot(dx,dz)<.23){await keys([]);await page.waitForTimeout(250);return;}const a=14*Math.PI/180,vx=dx*Math.cos(a)-dz*Math.sin(a),vy=dx*Math.sin(a)+dz*Math.cos(a);const next=[];if(Math.abs(vx)>.13)next.push(vx>0?'d':'a');if(Math.abs(vy)>.13)next.push(vy>0?'s':'w');await keys(next);await page.waitForTimeout(75);}await keys([]);throw Error('walk timeout '+JSON.stringify({target:{x,z},at:await data()}));}
async function toPoint(p){const d=await data(),x=Number(d.x),z=Number(d.z);if((x<5.33)!==(p.x<5.33)){if(d.status==='complete'){const outside=x<5.33?2.4:8.3;await walk(outside,z);await walk(outside,9.45);await walk(p.x,9.45);}else{const cross=z>5.2?9.45:1.15;await walk(x,cross);await walk(p.x,cross);}}await walk(p.x,p.z);}
try {
 await page.goto(origin+'/');
 await expect(page.locator('.launch-play')).toHaveAttribute('href','/play');
 await page.locator('.launch-play').click();
 await page.locator('.workshop-hud').waitFor({timeout:60000});
 await expect(page).toHaveURL(origin+'/play');
 let earned=0;
 for(let order=1;order<=5;order++){
  await page.waitForFunction(n=>{const d=document.querySelector('.workshop-stage')?.dataset;return d?.order===String(n)&&d.status==='service';},order,{timeout:60000});
  const points=JSON.parse((await data()).points);
  for(let i=0;i<points.length;i++){
   if(points[i].kind==='wheel'){
    await toPoint(JSON.parse((await data()).supply));
    await page.waitForFunction(()=>document.querySelector('.workshop-stage').dataset.carried==='wheel');
    if(i===0){await page.reload();await page.locator('.workshop-hud').waitFor();expect((await data()).carried).toBe('wheel');await page.screenshot({path:out+'/desktop-wheel-carry.png'});}
   }
   await toPoint(points[i]);
   await page.waitForFunction(()=>Number(document.querySelector('.workshop-stage').dataset.progress)>.12);
   if(order===1&&i===0){
    await page.screenshot({path:out+'/desktop-cleaning-final.png'});
    await page.getByRole('button',{name:'Pause and settings'}).click();const before=await data();await page.waitForTimeout(600);expect((await data()).progress).toBe(before.progress);
    await page.getByRole('button',{name:'Back to work'}).click();
   }
   if(order===2)await page.screenshot({path:out+'/desktop-engine-final.png'});
   if(points[i].kind==='wheel'){await page.waitForFunction(()=>Number(document.querySelector('.workshop-stage').dataset.progress)>.45);await page.screenshot({path:out+'/desktop-wheel-fit.png'});}
   await page.waitForFunction(id=>document.querySelector('.workshop-stage').dataset.active!==id,points[i].id,{timeout:15000});
  }
  await page.waitForFunction(n=>document.querySelector('.workshop-stage').dataset.serviced===String(n),order);
  await toPoint({x:2.35,z:7.4});earned+=[50,65,90,50,80][order-1];
  await page.waitForFunction(n=>Number(document.querySelector('.workshop-stage').dataset.credits)===n,earned-(order>3?150:0));
  if(order===1){await page.reload();await page.locator('.workshop-hud').waitFor();expect((await data()).credits).toBe('50');}
  if(order===3){await toPoint({x:-.4,z:1.95});await page.getByRole('button',{name:'Fit Pro tools'}).click();await expect(page.locator('.workshop-stage')).toHaveAttribute('data-tools','1');await page.screenshot({path:out+'/desktop-upgrade.png'});}
  console.log('order passed',order,JSON.stringify({credits:(await data()).credits,tools:(await data()).tools}));
 }
 await expect(page.getByRole('dialog',{name:'First shift complete'})).toBeVisible();
 await page.screenshot({path:out+'/desktop-first-shift.png'});
 await page.getByRole('button',{name:'Keep working'}).click();
 await page.getByRole('button',{name:'Pause and settings'}).click();
 await expect(page.getByRole('combobox',{name:'Crew lead'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Camera',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Back to work'}).click();
 await page.reload();await page.locator('.workshop-hud').waitFor();expect((await data()).credits).toBe('185');expect((await data()).tools).toBe('1');
 expect(errors).toEqual([]);results.push('5 real keyboard-driven jobs including 2 carried wheels, reload while carrying, rewards, Pro tools, milestone, fixed camera and no character switching');
 console.log('PASS',results);
}catch(error){await page.screenshot({path:out+"/failure.png"}).catch(()=>{});console.log("FAIL STATE",await data().catch(()=>null));throw error;}finally{await keys([]).catch(()=>{});await fs.writeFile(out+'/playthrough.json',JSON.stringify({origin,results,errors},null,2));await browser.close();}
