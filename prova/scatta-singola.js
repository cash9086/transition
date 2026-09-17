const { chromium } = require('playwright'); const path=require('path');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({ignoreHTTPSErrors:true,viewport:{width:1300,height:1100},deviceScaleFactor:1.6});
const e=[];p.on('pageerror',x=>e.push(''+x.message));
await p.goto('file://'+path.resolve(__dirname,'singola.html'),{waitUntil:'load'});
try{await p.waitForFunction('window.__pronto===true',{timeout:180000});}catch(x){e.push('TIMEOUT');}
console.log(JSON.stringify({d:await p.evaluate('window.__diag||null'),e}));
await p.locator('#c').screenshot({path:path.resolve(__dirname,'singola.png')});await b.close();})();
