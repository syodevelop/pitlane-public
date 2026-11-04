import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
await fs.mkdir('docs/qa/gus-illustrated-v4',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1400,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5173/');
 const checks=await page.evaluate(async()=>{
  const {GusIllustrated,preloadIllustratedGus}=await import('/src/scene/gus-illustrated.ts');await preloadIllustratedGus();
  document.body.replaceChildren();document.body.style.cssText='margin:0;background:#f9f5ec;color:#212329;display:flex;font:18px Arial;overflow:hidden';
  window.figures=[];
  for(let i=0;i<5;i++){
   const g=new GusIllustrated(700);g.yaw=i*Math.PI/4;g.update(0,g.yaw,0,true);window.figures.push(g);
   const panel=document.createElement('div');panel.style.cssText='width:280px;text-align:center';
   const title=document.createElement('p');title.textContent=['Front','Three quarter','Side','Rear three quarter','Back'][i];panel.append(title);
   g.renderer.domElement.style.cssText='width:280px;height:500px;object-fit:contain';panel.append(g.renderer.domElement);document.body.append(panel);
  }
  const g=window.figures[0],before=Array.from(g.geometry.attributes.position.array);
  const max=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
  let peak=0;for(let i=0;i<90;i++){g.update(1/60,0,100,false);peak=Math.max(peak,max(before,Array.from(g.geometry.attributes.position.array)));}
  const weight=g.walkWeight;
  for(let i=0;i<150;i++)g.update(1/60,0,0,true);
  const stopped=Array.from(g.geometry.attributes.position.array);
  return {walkDisplacement:peak,weight,restWeight:g.walkWeight,reducedRestDisplacement:max(before,stopped)};
 });
 assert(checks.walkDisplacement>2&&checks.weight>.9,'Mesh must animate walking');assert(checks.restWeight<.001&&checks.reducedRestDisplacement<.001,'Reduced-motion rest must settle');
 await page.screenshot({path:'docs/qa/gus-illustrated-v4/turnaround.png'});
 await page.evaluate(()=>{const g=window.figures[1];document.body.replaceChildren(g.renderer.domElement);g.renderer.domElement.style.cssText='height:800px;width:800px;margin:auto';});
 await page.screenshot({path:'docs/qa/gus-illustrated-v4/closeup.png'});
 await fs.writeFile('docs/qa/gus-illustrated-v4/checks.json',JSON.stringify(checks,null,2)+'\n');assert.deepEqual(errors,[]);console.log(checks);
} finally {await browser.close();}
