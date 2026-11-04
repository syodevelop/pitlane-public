import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const output="docs/qa/walk-options";
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:"msedge",headless:true});
try {
  const page=await browser.newPage({viewport:{width:1400,height:850}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("http://127.0.0.1:5173/");
  const report=await page.evaluate(async()=>{
    const {GusModel,preloadCrew}=await import("/src/scene/gus-model.ts");
    await preloadCrew();
    document.body.replaceChildren();document.body.style.cssText="margin:0;display:grid;grid-template-columns:repeat(6,1fr);background:#e8e3d9;color:#20242b;font:16px Arial";
    const report=[];
    for(const character of ["gus","dash","juno"])for(const gait of ["original","relaxed"]){
      const g=new GusModel(420,character);g.setGait(gait);g.yaw=Math.PI/2;
      const samples=[],wraps=[];
      let previousPhase=0;
      for(let i=0;i<240;i++){
        g.update(1/60,Math.PI/2,92,false);
        if(i>90 && g.stride<previousPhase)wraps.push(i/60);
        previousPhase=g.stride;
        if(i<90)continue;
        const feet=["L","R"].map(side=>{const sole=g.model.getObjectByName("BootSole"+side);sole.geometry.computeBoundingBox();return sole.geometry.boundingBox.clone().applyMatrix4(sole.matrixWorld).min.y;});
        const footX=["L","R"].map(side=>g.model.getObjectByName("BootSole"+side).matrixWorld.elements[12]);
        samples.push({feet,footX,hip:g.model.getObjectByName("Hips").position.y});
      }
      const low=Math.min(...samples.flatMap(s=>s.feet)),lift=Math.max(...samples.flatMap(s=>s.feet));
      const plantedMax=Math.max(...samples.map(s=>Math.min(...s.feet)));
      const slips=[];
      for(let i=1;i<samples.length;i++)for(let side=0;side<2;side++) {
        const a=samples[i-1],b=samples[i],dx=b.footX[side]-a.footX[side];
        if(a.feet[side]<.01 && b.feet[side]<.01 && dx<0)slips.push(Math.abs(dx*60*(216/3.5)+92));
      }
      const plantedSlipPxPerSecond=slips.reduce((a,b)=>a+b,0)/slips.length;
      const panel=document.createElement("section"),label=document.createElement("p");label.textContent=`${character} · ${gait === "original"?"A / Current":"B / Lower steps"}`;
      panel.append(label,g.renderer.domElement);g.renderer.domElement.style.cssText="width:100%;height:auto";document.body.append(panel);
      for(let i=0;i<180;i++)g.update(1/60,Math.PI/2,0,true);
      const restWeight=g.walkWeight;
      // Return to walking for the side-by-side screenshot.
      for(let i=0;i<135;i++)g.update(1/60,Math.PI/2,92,false);
      const cycleSeconds=wraps.length>1?(wraps.at(-1)-wraps[0])/(wraps.length-1):null;
      report.push({character,gait,low,lift,plantedMax,restWeight,cycleSeconds,plantedSlipPxPerSecond});
    }
    return report;
  });
  for(const row of report){
    assert(row.low>-.025,`${row.character}/${row.gait}: no floor penetration`);
    assert(row.plantedMax<.035,`${row.character}/${row.gait}: one grounded foot`);
    assert(row.restWeight<.001,`${row.character}/${row.gait}: walk settles at rest`);
    if(row.gait==="relaxed")assert(Math.abs(row.cycleSeconds-1.08)<.02,`${row.character}: slower 1.08-second cycle`);
    if(row.gait==="relaxed")assert(row.plantedSlipPxPerSecond<5,`${row.character}: slower cadence must still match travel speed`);
  }
  for(const character of ["gus","dash","juno"]){
    const a=report.find(r=>r.character===character&&r.gait==="original"),b=report.find(r=>r.character===character&&r.gait==="relaxed");
    assert(b.lift<a.lift*.65 && b.lift>.05,`${character}: B meaningfully reduces foot lift`);
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile(`${output}/motion.json`,JSON.stringify(report,null,2));
  await page.screenshot({path:`${output}/comparison.png`});
  console.log(report);
}finally{await browser.close();}
