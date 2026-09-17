/* Lo stesso conteggio, due volte: caratteri diversi e caratteri uguali. */
const { chromium } = require('playwright'); const path=require('path');
const CASI = [
  ['caratteri DIVERSI  (Cormorant 300 -> Bodoni Moda 400)', 'da=Cormorant&pesoDa=300&a=%22Bodoni%20Moda%22&pesoA=400'],
  ['caratteri UGUALI   (Cormorant 300 -> Cormorant 300)',   'da=Cormorant&pesoDa=300&a=Cormorant&pesoA=300'],
  ['caratteri UGUALI   (Bodoni 400 -> Bodoni 400)',         'da=%22Bodoni%20Moda%22&pesoDa=400&a=%22Bodoni%20Moda%22&pesoA=400'],
];
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  for(const [nome,q] of CASI){
    const p=await b.newPage({ignoreHTTPSErrors:true,viewport:{width:1300,height:1100},deviceScaleFactor:1.4});
    const e=[]; p.on('pageerror',x=>e.push(''+x.message));
    await p.goto('file://'+path.resolve(__dirname,'singola.html')+'?'+q,{waitUntil:'load'});
    try{ await p.waitForFunction('window.__pronto===true',{timeout:180000}); }catch(x){ e.push('TIMEOUT'); }
    const d=await p.evaluate('window.__diag||[]');
    const tot=d.reduce((a,x)=>a+x.n,0);
    console.log(nome.padEnd(52), 'incroci:', String(tot).padStart(4), e.length?('ERR '+e.join('|')):'');
    if(q.includes('a=Cormorant')) await p.locator('#c').screenshot({path:path.resolve(__dirname,'singola-uguali.png')});
    await p.close();
  }
  await b.close();
})();
