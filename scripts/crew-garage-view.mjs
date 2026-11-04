// Full production React/Phaser UI, isolated fixture state. Does not grant a helper
// or rewards to a server profile; the first real hire is covered by test:development.
import {chromium} from '@playwright/test';
import {createGarage,BALANCE_VERSION,STATIONS} from '../packages/game-core/index.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const now=Date.now();
const g=createGarage('crew-layout','crew-layout','demo',{now,seed:1,balanceVersion:BALANCE_VERSION});
g.profile.character='Gus';
g.progress.actors.player.position={...STATIONS.stock};
g.progress.actors.player.carrying=2;
g.progress.actors.helper={id:'helper',role:'Mechanic',level:1,position:{...STATIONS.tires},travel:null,carrying:0,taskId:'helper-work'};
const job=Object.values(g.progress.jobs).find(j=>j.kind==='tires');
job.status='working';job.acceptedAt=now-10000;
g.progress.tasks['helper-work']={id:'helper-work',actorId:'helper',kind:'service',station:'tires',jobId:job.id,carId:null,preparation:null,step:0,startsAt:now-10000,endsAt:now+50000,processedAt:null,status:'started',parts:1,outputParts:0,rate:1000,balanceVersion:BALANCE_VERSION};
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[],api=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))api.push(r.url());});
  await page.route('**/__crew_garage_review__',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/style.css"></head><body><main id="root" style="padding:24px"></main><script type="module">
    import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
    const {default:React}=await import('/node_modules/.vite/deps/react.js');
    const {default:ReactDOM}=await import('/node_modules/.vite/deps/react-dom_client.js');
    const {default:GarageGame}=await import('/src/GarageGame.tsx');
    const state=${JSON.stringify(g)},root=ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(React.Fragment,null,React.createElement('p',null,'Renderer review · fixture state · no server rewards'),React.createElement(GarageGame,{state,now:${now},offset:0,busy:false,send:()=>{},openLeaderboard:()=>{}})));
  </script></body></html>`}));
  await page.goto('http://127.0.0.1:5173/__crew_garage_review__');
  await page.locator('canvas').waitFor();
  await page.getByLabel('Controlled worker').selectOption('helper');
  await fs.mkdir('test-results',{recursive:true});
  await page.locator('.garage-visual').screenshot({path:'test-results/crew-garage-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>{
    const canvas=document.querySelector('canvas');
    return canvas?.width===550 && canvas.height===620;
  });
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const dimensions=await page.locator('canvas').evaluate(canvas=>{
    const rect=canvas.getBoundingClientRect();
    return {width:canvas.width,height:canvas.height,displayWidth:rect.width,displayHeight:rect.height,style:canvas.getAttribute('style')};
  });
  assert.ok(Math.abs(dimensions.width/dimensions.height-dimensions.displayWidth/dimensions.displayHeight)<0.01,JSON.stringify(dimensions));
  await page.locator('.garage-visual').screenshot({path:'test-results/crew-garage-mobile.png'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal(await page.locator('canvas').count(),1);
  await page.getByLabel('Controlled worker').selectOption('player');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.locator('.garage-visual').screenshot({path:'test-results/crew-garage-player-mobile.png'});
  await page.setViewportSize({width:1440,height:1000});
  await page.waitForFunction(()=>{
    const c=document.querySelector('canvas'),r=c?.getBoundingClientRect();
    return c?.width===1100 && c.height===650 && Math.abs(r.width/r.height-1100/650)<.01;
  });
  assert.equal(await page.locator('canvas').count(),1);
  assert.deepEqual(api,[]);
  assert.deepEqual(errors,[]);
  console.log('Full garage renderer passed: original helper, desktop/mobile, control switch, one canvas, no overflow or API requests. Fixture-only visual evidence.');
} finally {await browser.close();}
