import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const output = 'docs/qa/service-court-v4'; await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
if (process.argv.includes('--check-video')) {
  try {
    const page=await browser.newPage({viewport:{width:1280,height:720}});
    await page.goto('http://127.0.0.1:5173/');
    await page.evaluate(async()=>{
      document.body.replaceChildren();document.body.style.cssText='margin:0;background:#181c20';
      const v=document.createElement('video');v.style.cssText='display:block;width:1280px;height:720px';v.muted=true;document.body.append(v);
      v.src='/docs/qa/service-court-v4/service-route.webm';
      await new Promise((resolve,reject)=>{v.onloadeddata=resolve;v.onerror=()=>reject(new Error('Video cannot decode'));});
    });
    for(const [time,name] of [[9,'video-stop-check.png'],[25,'video-exit-check.png']]){
      const info=await page.evaluate(async time=>{
        const v=document.querySelector('video');v.currentTime=time;
        await new Promise(resolve=>v.onseeked=resolve);
        return {width:v.videoWidth,height:v.videoHeight,time:v.currentTime,error:v.error?.message};
      },time);
      assert.equal(info.width,1280);assert.equal(info.error,undefined);
      await page.screenshot({path:output+'/'+name});console.log(info);
    }
  } finally {await browser.close();}
  process.exit(0);
}
try {
  const context = await browser.newContext({ viewport: { width: 1672, height: 941 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.evaluate(async () => {
    const { GarageWorld, preloadGarageCrew } = await import('/src/scene/garage-world.ts'); await preloadGarageCrew();
    document.body.replaceChildren(); document.body.style.cssText = 'margin:0;overflow:hidden';
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0'; document.body.append(host);
    const world = new GarageWorld(host, 'gus', { x: 90, y: 180 }); window.serviceReview = world;
    world.actor.setGait('relaxed');
    window.stepService = (seconds) => { for (let i = 0; i < seconds * 60; i++) world.update({ x: 90, y: 180 }, { x: 0, y: 0 }, 1 / 60, false); };
  });
  await page.evaluate(() => window.stepService(4));
  await page.screenshot({ path: output + '/01-arriving.png' });
  const arrival = await page.evaluate(() => {
    const w = window.serviceReview;
    let time = 0;
    while (w.traffic.phase !== 'stopped' && time < 35) { w.traffic.update(1/60); time += 1/60; }
    w.update({x:90,y:180},{x:0,y:0},0,false);
    return { time, traffic: w.traffic.root.userData, calls: w.renderer.info.render.calls, triangles: w.renderer.info.render.triangles };
  });
  assert.equal(arrival.traffic.phase, 'stopped'); assert.equal(arrival.traffic.speed, 0);
  await page.screenshot({ path: output + '/02-service-stop.png' });
  await page.evaluate(() => {
    const w = window.serviceReview; w.setOverview(true); w.update({x:90,y:180},{x:0,y:0},0,false);
  });
  await page.screenshot({ path: output + '/03-overview.png' });
  await page.evaluate(() => {
    const w = window.serviceReview;
    w.camera.top = 4.1; w.camera.bottom = -4.1; w.camera.left = -7.3; w.camera.right = 7.3; w.camera.updateProjectionMatrix();
    w.camera.position.set(12,9,-2); w.camera.lookAt(5.33,.65,5.2); w.renderer.render(w.scene,w.camera);
  });
  await page.screenshot({ path: output + '/04-car-detail.png' });
  await page.evaluate(() => { const w = window.serviceReview; w.setOverview(false); window.stepService(14); });
  const leaving = await page.evaluate(() => window.serviceReview.traffic.root.userData);
  assert.equal(leaving.phase, 'departing'); assert(leaving.z < 5.2);
  await page.screenshot({ path: output + '/05-departing.png' });
  // It must complete repeatable visual cycles without ever making an economy call.
  const cycles = await page.evaluate(() => { const w = window.serviceReview; for(let i=0;i<110*60;i++) w.traffic.update(1/60); return w.traffic.root.userData; });
  assert(cycles.cycles >= 2); assert(cycles.rewardFree);
  // A character in the route stops the customer safely; clearing it resumes.
  const yielding = await page.evaluate(() => {
    const t = window.serviceReview.traffic; t.distance=35; t.phase='arriving'; t.speed=0;
    for(let i=0;i<600;i++)t.update(1/60,{x:5.333333,z:7.5});
    const stopped = {...t.root.userData};
    for(let i=0;i<600;i++)t.update(1/60,{x:2.88,z:5.76});
    return { stopped, clear: t.root.userData };
  });
  assert(yielding.stopped.yielding); assert(yielding.stopped.speed < .01); assert(yielding.clear.distance > yielding.stopped.distance);
  await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(200);
  await page.evaluate(() => { const w = window.serviceReview; w.update({x:90,y:180},{x:0,y:0},0,false); });
  await page.screenshot({path:output+'/06-mobile.png'});
  assert.deepEqual(errors, []);
  await fs.writeFile(output+'/review.json',JSON.stringify({arrival,leaving,cycles,yielding,errors},null,2));
  if (process.argv.includes('--export')) {
    const exported = await page.evaluate(async () => {
      const w = window.serviceReview, {exportGarage} = await import('/scripts/garage-export.ts');
      w.setRoofsVisible(true);
      const architecture = await exportGarage(w.architecture.root);
      const car = w.traffic.client.root.clone(); car.position.set(0,0,0); car.rotation.set(0,0,0);
      return {architecture, car:await exportGarage(car)};
    });
    const directory='art/models/garage-3d-v4'; await fs.mkdir(directory,{recursive:true});
    const report={source:'Original repository-authored geometry, existing v2 surface textures', runtime:'src/scene/garage-architecture.ts', traffic:'src/scene/service-traffic.ts', model:'src/scene/service-car.ts', assets:[]};
    for (const [name, base64] of [['garage-3d-v4.glb',exported.architecture],['club-23.glb',exported.car]]) {
      const bytes=Buffer.from(base64,'base64'); assert.equal(bytes.subarray(0,4).toString(),'glTF');
      await fs.writeFile(`${directory}/${name}`,bytes);
      report.assets.push({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    }
    await fs.writeFile(`${directory}/model-report.json`,JSON.stringify(report,null,2));
    console.log(report.assets);
  }
  await page.evaluate(()=>window.serviceReview.dispose());
  await page.setViewportSize({width:1280,height:720});
  await page.goto(pathToFileURL(path.resolve('art/models/garage-3d-v4/preview.html')).href);
  await page.waitForFunction(()=>!document.getElementById('loading'));
  await page.getByRole('button',{name:'Car detail',exact:true}).click();
  await page.screenshot({path:output+'/07-car-viewer.png'});
  await page.mouse.move(800,450);await page.mouse.down();await page.mouse.move(990,480,{steps:12});await page.mouse.up();
  await page.screenshot({path:output+'/08-car-orbit.png'});
  await page.getByRole('button',{name:'Box 02',exact:true}).click();
  await page.getByRole('button',{name:'Box 03',exact:true}).click();
  await page.getByRole('button',{name:'Replay arrival',exact:true}).click();
  await page.screenshot({path:output+'/09-route-viewer.png'});
  if (process.argv.includes('--video')) {
    const base64=await page.evaluate(async()=>{
      const canvas=document.querySelector('canvas');
      const stream=canvas.captureStream(30), chunks=[];
      const type=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';
      const recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:6500000});
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
      const done=new Promise(resolve=>recorder.onstop=resolve);
      recorder.start(1000);await new Promise(resolve=>setTimeout(resolve,34000));recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
      const blob=new Blob(chunks,{type:'video/webm'});
      return new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob)});
    });
    await fs.writeFile(output+'/service-route.webm',Buffer.from(base64,'base64'));
    console.log('Recorded 34 seconds of the actual WebGL route.');
  }
  assert.deepEqual(errors, []);
  console.log({arrival, cycles:cycles.cycles, yielding:yielding.stopped.yielding,errors});
} finally { await browser.close(); }
