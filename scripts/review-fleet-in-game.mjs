import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const out = "docs/qa/fleet-v2";
const browser = await chromium.launch({channel:"msedge",headless:true});
try {
  const page = await browser.newPage({viewport:{width:1672,height:941}}), errors=[];
  page.on("pageerror",e=>errors.push(e.message)); await page.goto("http://127.0.0.1:5173/");
  await page.evaluate(async()=>{
    const {GarageWorld,preloadGarageCrew}=await import("/src/scene/garage-world.ts"); await preloadGarageCrew();
    document.body.replaceChildren(); document.body.style.cssText="margin:0;overflow:hidden";
    const host=document.createElement("div");host.style.cssText="position:fixed;inset:0";document.body.append(host);
    window.fleetGame=new GarageWorld(host,"gus",{x:90,y:180});
  });
  const report=[];
  const ids = await page.evaluate(async()=> (await import("/src/scene/fleet-catalogue.ts")).FLEET_IDS);
  const pictured = ["rustback:standard","city-sprint:standard","nightline:upgraded","vector:upgraded","longtail:standard","spire:upgraded"];
  for(const id of ids){
    const state=await page.evaluate(id=>{
      const w=window.fleetGame,t=w.traffic;t.setPreview(id);t.reset();
      let elapsed=0;while(t.phase!=="stopped"&&elapsed<40){t.update(1/60,{x:2.88,z:5.76});elapsed+=1/60;}
      w.update({x:90,y:180},{x:0,y:0},0,false);
      return {...t.root.userData,triangles:w.renderer.info.render.triangles,calls:w.renderer.info.render.calls};
    },id);
    assert.equal(state.phase,"stopped");assert.equal(state.fleetId,id);report.push(state);
    if(pictured.includes(id)) await page.screenshot({path:`${out}/in-game-${id.replace(":","-")}.png`});
    const departed=await page.evaluate(()=>{const w=window.fleetGame;for(let i=0;i<24*60;i++)w.traffic.update(1/60,{x:2.88,z:5.76});return w.traffic.root.userData;});
    assert(departed.cycles>=1,"Every chassis must clear the complete route");
  }
  // Check every exported GLB can be loaded as actual geometry, with its 4 wheel nodes.
  const loaded=await page.evaluate(async()=>{
    const {GLTFLoader}=await import("/node_modules/three/examples/jsm/loaders/GLTFLoader.js");
    const {FLEET_IDS}=await import("/src/scene/fleet-catalogue.ts");const loader=new GLTFLoader(),result=[];
    for(const id of FLEET_IDS){const gltf=await loader.loadAsync("/art/models/fleet-v2/"+id.replace(":","-")+".glb");let wheels=0,meshes=0;
      gltf.scene.traverse(o=>{if(o.name.endsWith("_Wheel"))wheels++;if(o.isMesh){meshes++;o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});
      result.push({id,wheels,meshes});}
    return result;
  });
  assert.equal(loaded.length,30);for(const model of loaded){assert.equal(model.wheels,4);assert(model.meshes>15);}
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{
    const w=window.fleetGame,t=w.traffic;t.setPreview("rustback:standard");t.reset();
    for(let i=0;i<2400 && t.phase!=="stopped";i++)t.update(1/60,{x:2.88,z:5.76});
    w.update({x:90,y:180},{x:0,y:0},0,false);
  });
  await page.screenshot({path:`${out}/in-game-mobile.png`});
  assert.deepEqual(errors,[]);await fs.writeFile(out+"/in-game-review.json",JSON.stringify({report,loaded,errors},null,2));
  await page.evaluate(()=>window.fleetGame.dispose());console.log(JSON.stringify({routeModels:report.length,loadedGLBs:loaded.length,errors}));
}finally{await browser.close();}
