const {chromium}=require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({ignoreHTTPSErrors:true,viewport:{width:1520,height:1250},deviceScaleFactor:1.3});
const e=[];p.on('pageerror',x=>e.push('PAGEERROR '+x.message));p.on('console',m=>{if(m.type()==='error')e.push('CONSOLE '+m.text());});
await p.goto('file://'+path.resolve(__dirname,'zoom.html'),{waitUntil:'load'});
try{await p.waitForFunction('window.__pronto===true',{timeout:120000});}catch(x){e.push('TIMEOUT');}
console.log('ERR',JSON.stringify(e)); console.log('INTERNO', await p.evaluate('window.__errore||null'));
await p.locator('#c').screenshot({path:path.resolve(__dirname,'zoom.png')});await b.close();})();
