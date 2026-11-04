import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const data = async (path, mime) => `data:${mime};base64,${(await fs.readFile(path)).toString('base64')}`;
const art = await data('public/art/launch-garage-v2.png','image/png');
const titleFont = await data('public/fonts/Barlow-Condensed-italic-latin.woff2','font/woff2');
const brandFont = await data('public/fonts/Exo-2-800-latin.woff2','font/woff2');
const regularFont = await data('public/fonts/Barlow-Condensed-400-latin.woff2','font/woff2');
const browser = await chromium.launch({channel:'msedge'});
try {
 const page = await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
 await page.setContent(`<!doctype html><html><head><style>
 @font-face{font-family:Title;src:url('${titleFont}');font-weight:900;font-style:italic}
 @font-face{font-family:Brand;src:url('${brandFont}');font-weight:800;font-style:italic}
 @font-face{font-family:Copy;src:url('${regularFont}')}
 *{box-sizing:border-box}body{margin:0;width:1200px;height:630px;overflow:hidden;background:#222126;color:#fff8ef}img{position:absolute;width:100%;height:100%;object-fit:cover;object-position:50% 50%}.shade{position:absolute;inset:0;background:linear-gradient(90deg,#111823a0,transparent 66%)}.brand{position:absolute;left:64px;top:50px;font:800 italic 62px/1 Brand;letter-spacing:.035em}.brand:after{content:'';position:absolute;right:5px;bottom:-7px;width:34px;height:7px;background:#ff2e26}.copy{position:absolute;left:64px;top:233px}h1{margin:0;font:900 italic 77px/.98 Title;letter-spacing:.015em;text-shadow:0 3px 8px #0005}strong{display:block;font-weight:900;color:#ff2c24}p{font:27px/1.3 Copy;letter-spacing:.015em;margin-top:22px;text-shadow:0 2px 6px #000}
 </style></head><body><img src="${art}" alt=""><div class="shade"></div><div class="brand">pitlane</div><div class="copy"><h1>BUILD YOUR<strong>RACING TEAM</strong></h1><p>From the workshop to the podium</p></div></body></html>`);
 await page.evaluate(()=>document.fonts.ready);
 await page.locator('img').evaluate(el=>el.decode());
 await page.screenshot({path:'public/brand/pitlane-share-v1.jpg',type:'jpeg',quality:88});
 console.log('Saved 1200 x 630 sharing card:',(await fs.stat('public/brand/pitlane-share-v1.jpg')).size,'bytes');
} finally { await browser.close(); }
