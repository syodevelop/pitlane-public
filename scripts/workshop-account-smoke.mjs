import {chromium,expect} from '@playwright/test';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.PITLANE_ORIGIN||'http://127.0.0.1:8877';
if(!/^http:\/\/127\.0\.0\.1:/.test(origin))throw Error('Use the isolated local runtime for synthetic account testing.');
const site=JSON.parse(await fs.readFile('config/site.json','utf8'));
const out='docs/qa/workshop-accounts-2026-11-02';await fs.mkdir(out,{recursive:true});
const a=privateKeyToAccount(generatePrivateKey()), b=privateKeyToAccount(generatePrivateKey());
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900}}),errors=[],results=[];
async function pageFor(account,ctx=context) {
  const page=await ctx.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('signTestMessage',async({encoded,address})=>{
    const signer=[a,b].find(s=>s.address.toLowerCase()===address.toLowerCase());assert.ok(signer);
    return signer.signMessage({message:{raw:encoded}});
  });
  await page.addInitScript(({address})=>{
    const listeners=new Map();
    const qa=window.walletQA={address,change(address){qa.address=address;for(const cb of listeners.get('accountsChanged')||[])cb([address]);}};
    window.ethereum={async request({method,params}){
      if(method==='eth_accounts'||method==='eth_requestAccounts')return [qa.address];
      if(method==='eth_chainId')return '0x1';
      if(method==='personal_sign')return window.signTestMessage({encoded:params[0],address:params[1]});
      throw Error('Unsupported mock wallet request');
    },on(name,cb){const set=listeners.get(name)||new Set();set.add(cb);listeners.set(name,set);},removeListener(name,cb){listeners.get(name)?.delete(cb);}};
    localStorage.setItem('pitlane.workshop.v1',JSON.stringify({version:1,character:'gus',credits:999999}));
  },{address:account.address});
  return page;
}
async function call(page,path,data,account=a.address){return page.evaluate(async({path,data,account})=>{
  const r=await fetch('/api/'+path,{method:data===undefined?'GET':'POST',headers:{'X-Pitlane-Account':account,...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,body:await r.json()};
},{path,data,account});}
const page=await pageFor(a),pressed=new Set();
const data=()=>page.locator('.workshop-stage').evaluate(el=>({...el.dataset}));
async function keys(next){for(const k of pressed)if(!next.includes(k)){await page.keyboard.up(k);pressed.delete(k);}for(const k of next)if(!pressed.has(k)){await page.keyboard.down(k);pressed.add(k);}}
async function walk(x,z){await page.locator('.workshop-stage').focus();const end=Date.now()+25000;while(Date.now()<end){const d=await data(),dx=x-Number(d.x),dz=z-Number(d.z);if(Math.hypot(dx,dz)<.23){await keys([]);await page.waitForTimeout(250);return;}const angle=14*Math.PI/180,vx=dx*Math.cos(angle)-dz*Math.sin(angle),vy=dx*Math.sin(angle)+dz*Math.cos(angle),next=[];if(Math.abs(vx)>.13)next.push(vx>0?'d':'a');if(Math.abs(vy)>.13)next.push(vy>0?'s':'w');await keys(next);await page.waitForTimeout(75);}await keys([]);throw Error('walk timeout '+JSON.stringify(await data()));}
try {
  await page.goto(origin+'/');
  await expect(page.locator('.site-header a[href="/play"]')).toHaveCount(1);
  await page.locator('.site-header a[href="/play"]').click();await expect(page).toHaveURL(origin+'/play');
  await page.goto(origin+'/');await page.locator('.launch-play').click();await expect(page).toHaveURL(origin+'/play');
  await expect(page.getByRole('button',{name:'Sign in to Pitlane',exact:true})).toBeVisible();
  expect(await page.locator('.workshop-stage').count()).toBe(0);
  await page.screenshot({path:out+'/wallet-entry.png'});
  await page.getByRole('button',{name:'Sign in to Pitlane',exact:true}).click();
  await expect(page.getByRole('button',{name:'Choose Juno',exact:true})).toBeVisible();
  await page.screenshot({path:out+'/crew-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:out+'/crew-mobile.png'});
  await expect(page.getByRole('button',{name:'Choose Juno',exact:true})).toBeInViewport();
  await page.setViewportSize({width:320,height:568});await expect(page.getByRole('button',{name:'Choose Juno',exact:true})).toBeInViewport();await page.screenshot({path:out+'/crew-small-mobile.png'});
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button',{name:'Choose Juno',exact:true}).click();
  await page.getByRole('button',{name:'Confirm Juno',exact:true}).click();
  await page.locator('.workshop-hud').waitFor({timeout:60000});
  expect((await data()).credits).toBe('0');expect((await data()).character).toBe('juno');
  expect((await call(page,'workshop/character',{character:'dash'})).status).toBe(409);
  await page.waitForFunction(()=>document.querySelector('.workshop-stage')?.dataset.status==='service');
  const points=JSON.parse((await data()).points);
  await walk(2.1,1.15);await walk(points[0].x,1.15);await walk(points[0].x,points[0].z);
  await page.waitForFunction(()=>Number(document.querySelector('.workshop-stage').dataset.progress)>.1);
  await page.waitForFunction(id=>document.querySelector('.workshop-stage').dataset.active!==id,points[0].id);
  await walk(points[0].x,1.15);await walk(points[1].x,1.15);await walk(points[1].x,points[1].z);
  await page.waitForFunction(()=>document.querySelector('.workshop-stage').dataset.serviced==='1');
  await walk(8.3,points[1].z);await walk(8.3,9.45);await walk(2.35,9.45);await walk(2.35,7.4);
  await page.waitForFunction(()=>document.querySelector('.workshop-stage').dataset.credits==='50');
  await expect.poll(async()=> (await call(page,'workshop/state')).body.state.credits).toBe(50);
  let saved=(await call(page,'workshop/state')).body;expect(saved.playSeconds).toBeGreaterThan(10);
  await page.reload();await page.locator('.workshop-hud').waitFor({timeout:60000});
  expect((await data()).credits).toBe('50');expect((await data()).character).toBe('juno');
  await page.route('**/api/workshop/save',route=>route.abort());
  await expect(page.getByRole('button',{name:'Retry save',exact:true})).toBeVisible({timeout:15000});
  await page.unroute('**/api/workshop/save');await page.getByRole('button',{name:'Retry save',exact:true}).click();
  await expect(page.getByRole('button',{name:'Retry save',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Pause and settings'}).click();
  await page.waitForTimeout(6000);const before=(await call(page,'workshop/state')).body.playSeconds;
  await page.waitForTimeout(6000);expect((await call(page,'workshop/state')).body.playSeconds).toBe(before);
  await page.getByRole('button',{name:'Save & sign out'}).click();
  await expect(page.getByRole('button',{name:'Connect wallet',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Connect wallet',exact:true}).click();await page.getByRole('button',{name:'Sign in to Pitlane',exact:true}).click();
  await page.locator('.workshop-hud').waitFor({timeout:60000});expect((await data()).character).toBe('juno');expect((await data()).credits).toBe('50');
  results.push('signed login, permanent character, local save ignored, real job +50, cloud reload, paused play time, logout/login');
  const admin=await context.newPage();await admin.goto(origin+site.adminPath);
  await admin.getByLabel('Admin password').fill('Synthetic-QA-password-2026!');await admin.getByRole('button',{name:'Open admin',exact:true}).click();
  await expect(admin.getByRole('heading',{name:/Game players/})).toBeVisible();
  await admin.getByLabel('Find wallet').fill(a.address);await admin.getByRole('button',{name:'Search',exact:true}).click();
  await expect(admin.getByRole('button',{name:'Search',exact:true})).toBeEnabled();
  await expect(admin.getByRole('cell',{name:'50',exact:true})).toBeVisible();
  await admin.screenshot({path:out+'/players-admin.png',fullPage:true});
  await admin.getByRole('button',{name:'Whitelist',exact:true}).click();await expect(admin.getByRole('heading',{name:'Task destinations'})).toBeVisible();
  results.push('password-protected player list shows earned Credits and character; whitelist remains available');
  const second=await pageFor(a);await second.goto(origin+'/play');await second.locator('.workshop-hud').waitFor({timeout:60000});
  await expect(page.getByRole('button',{name:'Reopen saved garage'})).toBeVisible({timeout:15000});
  await second.evaluate(address=>window.walletQA.change(address),b.address);
  await expect(second.getByRole('button',{name:'Connect wallet',exact:true})).toBeVisible();
  await second.getByRole('button',{name:'Connect wallet',exact:true}).click();await second.getByRole('button',{name:'Sign in to Pitlane',exact:true}).click();
  await expect(second.getByRole('button',{name:'Choose Gus',exact:true})).toBeVisible();
  const other=await call(second,'workshop/state',undefined,b.address);expect(other.body.character).toBeNull();expect(other.body.state).toBeNull();
  expect((await call(second,'workshop/save',{},a.address)).status).toBe(401);
  results.push('second tab takes ownership; account change gates game; wallets remain isolated');
  expect(errors).toEqual([]);
  console.log('PASS',results);
}catch(e){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});console.log('STATE',await data().catch(()=>null));throw e;}
finally{await keys([]).catch(()=>{});await fs.writeFile(out+'/result.json',JSON.stringify({results,errors},null,2));await browser.close();}
