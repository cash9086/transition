const { chromium } = require('playwright'); const path=require('path');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({ignoreHTTPSErrors:true});const e=[];
p.on('pageerror',x=>e.push(''+x.message));
await p.goto('file://'+path.resolve(__dirname,'sweep.html'),{waitUntil:'load'});
try{await p.waitForFunction('window.__pronto===true',{timeout:120000});}catch(x){e.push('TIMEOUT');}
console.log(JSON.stringify({d:await p.evaluate('window.__diag||null'),e},null,1));await b.close();})();
