/* Un ritaglio ingrandito della striscia: le grazie e i giunti si giudicano
   solo da vicino, e la striscia intera li rimpicciolisce troppo. */
const {chromium}=require('playwright');const path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({ignoreHTTPSErrors:true,viewport:{width:1460,height:1700},deviceScaleFactor:3});
  const e=[];p.on('pageerror',x=>e.push('PAGEERROR '+x.message));
  await p.goto('file://'+path.resolve(__dirname,'banco.html'),{waitUntil:'load'});
  try{await p.waitForFunction('window.__pronto===true',{timeout:120000});}catch(x){e.push('TIMEOUT');}
  const RIGA=175;
  /* le righe p=0 e p=0.30, meta' sinistra */
  await p.locator('#strip').screenshot({path:path.resolve(__dirname,'dettaglio.png'),
    clip:{x:150,y:0,width:700,height:RIGA*3}});
  console.log('ERR',JSON.stringify(e));
  await b.close();
})();
