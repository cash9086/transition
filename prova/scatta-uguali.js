const { chromium } = require('playwright'); const path=require('path');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({ignoreHTTPSErrors:true,viewport:{width:1460,height:1700},deviceScaleFactor:1});
const e=[];p.on('pageerror',x=>e.push(''+x.message));
await p.goto('file://'+path.resolve(__dirname,'banco.html')+'?a=Cormorant&pesoA=300',{waitUntil:'load'});
try{await p.waitForFunction('window.__pronto===true',{timeout:180000});}catch(x){e.push('TIMEOUT');}
const d=await p.evaluate('window.__diag||null');
console.log(JSON.stringify({fontOk:d.fontOk, inchiostro:d.inchiostro, errori:e}));
await p.locator('#strip').screenshot({path:path.resolve(__dirname,'striscia-uguali.png')});await b.close();})();
