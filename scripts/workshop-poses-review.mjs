import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const out = "docs/qa/workshop-polish-2026-11-02";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1200, height: 800 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/__workshop_pose_review__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><style>body{margin:0;background:#ded8c6}h1{position:absolute;top:15px;left:30px;font:24px sans-serif;color:#243039}</style><h1>Gus · Dash · Juno / work animation review</h1><script type="module">
 import * as T from '/node_modules/.vite/deps/three.js';
 import {CrewActor,preloadCrew} from '/src/scene/gus-model.ts';
 await preloadCrew();
 const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1200,800);renderer.setClearColor('#ded8c6');document.body.appendChild(renderer.domElement);
 const scene=new T.Scene(),camera=new T.OrthographicCamera(-5.5,5.5,3.66,-3.66,.1,50);camera.position.set(3,7,12);camera.lookAt(0,1.2,0);
 scene.add(new T.HemisphereLight(0xffffff,0x73716b,2.1));const light=new T.DirectionalLight(0xffdfb2,2.2);light.position.set(-4,8,6);scene.add(light);
 const actors=['gus','dash','juno'].map((c,i)=>{const a=new CrewActor(c);a.model.position.x=(i-1)*3.2;scene.add(a.model);return a;});
 window.qa={render:(kind,phase)=>{for(const [i,a] of actors.entries()){
   a.setCarriedWheel(kind==='carry');a.setEnginePart(kind==='part');
   const z=kind==='wipe'? .8 : .92,y=kind==='wipe'?.9:kind==='wheel'?.48:1.65;
   a.setWork(['idle','carry','part'].includes(kind)?undefined:{kind,heading:0,target:new T.Vector3((i-1)*3.2+.12,y,z),progress:phase});
   for(let j=0;j<40;j++)a.update(1/60,0,0,false);
 }renderer.render(scene,camera);return actors.map(a=>{const hand=a.model.getObjectByName('HandR').getWorldPosition(new T.Vector3());return hand.toArray();});}};
 </script>`,
    }),
  );
  await page.goto("http://127.0.0.1:5173/__workshop_pose_review__");
  await page.waitForFunction(() => window.qa, { timeout: 60000 });
  for (const kind of [
    "idle",
    "wipe",
    "repair",
    "diagnose",
    "bench",
    "wheel",
    "install",
    "carry",
    "part",
  ]) {
    const hands = await page.evaluate((kind) => qa.render(kind, 0.45), kind);
    expect(hands.flat().every(Number.isFinite)).toBe(true);
    await page.screenshot({ path: `${out}/crew-${kind}.png` });
  }
  expect(errors).toEqual([]);
  console.log(
    "PASS three characters, nine pose states, finite hand positions and no WebGL errors.",
  );
} finally {
  await browser.close();
}
