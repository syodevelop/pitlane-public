import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const origin=process.env.PITLANE_ORIGIN||'http://127.0.0.1:5173',out='docs/qa/workshop-2026-11-01';
const browser=await chromium.launch({channel:'msedge',headless:true});const results=[];
try{
 for(const [width,height]of [[390,844],[320,568],[844,390]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/play');await page.locator('.workshop-hud').waitFor({timeout:60000});
  await page.waitForTimeout(800);
  expect(await page.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.scrollHeight])).toEqual([width,height]);
  const before=await page.locator('.workshop-stage').getAttribute('data-x');
  const stick=await page.locator('.workshop-stick').boundingBox();expect(stick).toBeTruthy();
  const cdp=await context.newCDPSession(page);
  const x=stick.x+stick.width/2+30,y=stick.y+stick.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await page.waitForTimeout(1000);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(300);const after=await page.locator('.workshop-stage').getAttribute('data-x');expect(Number(after)).toBeGreaterThan(Number(before)+.3);
  await page.screenshot({path:`${out}/mobile-${width}x${height}.png`});
  await page.getByRole('button',{name:'Pause and settings'}).tap();await expect(page.getByRole('dialog').filter({hasText:'Taking a pit stop.'})).toBeVisible();
  const resume=await page.getByRole('button',{name:'Back to work'}).boundingBox();expect(resume.y+resume.height).toBeLessThan(height);
  await page.getByRole('button',{name:'Back to work'}).tap();
  await context.addInitScript(()=>localStorage.setItem('pitlane.workshop.v1',JSON.stringify({version:1,character:'gus',position:{x:1,z:7.8},credits:115,serviced:2,tools:0,carried:'wheel',collectProgress:0,order:{number:3,kind:'tires',status:'service',progress:{}},reward:null,milestoneSeen:false})));
  await page.reload();await page.locator('.workshop-hud').waitFor();await page.waitForTimeout(700);
  await expect(page.getByLabel('Carrying one replacement wheel')).toBeVisible();
  expect(await page.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.scrollHeight])).toEqual([width,height]);
  await page.screenshot({path:`${out}/mobile-wheel-${width}x${height}.png`});
  expect(errors).toEqual([]);results.push({width,height,touchMovement:true,carriedWheelHud:true,overflow:false,errors});await context.close();
 }
 const context=await browser.newContext({viewport:{width:1280,height:800}});const page=await context.newPage();
 let fail=true;await page.route('**/art/garage-roof-painted-v1.webp',r=>fail?r.fulfill({status:503,body:'QA unavailable texture'}):r.continue());
 await page.goto(origin+'/play');await page.getByRole('button',{name:'Try again',exact:true}).waitFor({timeout:60000});fail=false;await page.getByRole('button',{name:'Try again',exact:true}).click();await page.locator('.workshop-hud').waitFor();
 results.push({assetFailureRetry:true});await context.close();
 await fs.writeFile(out+'/mobile-and-recovery.json',JSON.stringify(results,null,2));console.log('PASS',JSON.stringify(results));
}finally{await browser.close();}
