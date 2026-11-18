// Real MCP card + official host bridge; synthetic read-only tool responses, no private API.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import * as esbuild from 'esbuild';
import {chromium} from 'playwright';
const script=(await esbuild.build({entryPoints:['assets/js/mcp-app/widget.js'],bundle:true,write:false,format:'iife',logLevel:'error'})).outputFiles[0].text;
const card=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main id="app"></main><script>${script}</script>`;
const items=[{id:'synthetic-top',name:'Synthetic linen shirt',category:'tops',colour:'Blue'},{id:'synthetic-shoe',name:'Synthetic walking shoes',category:'shoes',colour:'Black'}];
async function fixture(theme,fullscreen){
 const host=(await esbuild.build({stdin:{resolveDir:resolve('.'),contents:`
 import {AppBridge,PostMessageTransport} from '@modelcontextprotocol/ext-apps/app-bridge';
 const frame=document.getElementById('card'),items=${JSON.stringify(items)};
 const context={theme:${JSON.stringify(theme)},displayMode:'inline',availableDisplayModes:${JSON.stringify(fullscreen?['inline','fullscreen']:['inline'])},locale:'en-US'};
 const bridge=new AppBridge(null,{name:'focus-test',version:'1.0.0'},{serverTools:{},updateModelContext:{text:{}}},{hostContext:context});
 bridge.onrequestdisplaymode=async({mode})=>{context.displayMode=mode;bridge.setHostContext(context);return {mode};};
 bridge.onupdatemodelcontext=async()=>({});
 bridge.oncalltool=async({name,arguments:args})=>{if(name!=='get_item')throw Error('Read-only fixture');return {content:[],structuredContent:{view:'garment',item:items.find(i=>i.id===args.id),photos:[],product:{},variant:{},owned_item:{}}};};
 bridge.onsizechange=({height})=>{if(height)frame.style.height=height+'px';};
 bridge.oninitialized=()=>{bridge.sendToolInput({arguments:{}});bridge.sendToolResult({content:[],structuredContent:{view:'closet',items}});};
 bridge.connect(new PostMessageTransport(frame.contentWindow,frame.contentWindow)).then(()=>{frame.srcdoc=${JSON.stringify(card)};});
 `},bundle:true,write:false,format:'iife',logLevel:'error'})).outputFiles[0].text;
 return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic MCP focus walkthrough</title><body style="margin:16px;background:${theme==='dark'?'#1b1d22':'#fbf8f3'};color:${theme==='dark'?'#f2efe8':'#1d1b18'};font:16px system-ui"><p>Synthetic MCP focus walkthrough — read-only examples</p><div style="max-width:440px"><iframe id="card" sandbox="allow-scripts" style="width:100%;height:300px;border:0"></iframe></div><script>${host.replaceAll('</script','<\\/script')}</script>`;
}
const browser=await chromium.launch({headless:true});
try{
 for(const width of [1280,390])for(const theme of ['light','dark'])for(const fullscreen of [true,false]){
  const page=await browser.newPage({viewport:{width,height:900}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('http**://**',route=>route.abort());
  const html=await fixture(theme,fullscreen);
  if(width===390&&theme==='light'&&fullscreen)writeFileSync('/tmp/sjpj-mcp-focus-walkthrough.html',html);
  await page.setContent(html);
  const card=page.frameLocator('#card'), tile=card.getByRole('button',{name:/Synthetic linen shirt/});
  await tile.focus();await tile.press('Enter');
  const heading=card.getByRole('heading',{name:'Synthetic linen shirt'});
  await heading.waitFor();
  assert.equal(await heading.evaluate(n=>document.activeElement===n),true,'Opening a garment focuses its heading');
  await heading.press('Shift+Tab');
  const back=card.getByRole('button',{name:'‹ Back'});
  assert.equal(await back.evaluate(n=>document.activeElement===n),true);
  await back.press('Enter');await tile.waitFor();
  assert.equal(await tile.evaluate(n=>document.activeElement===n),true,'Back returns to the originating garment');
  if(fullscreen){
   const tops=card.getByRole('button',{name:'Tops 1',exact:true});await tops.focus();await tops.press('Enter');
   assert.equal(await tops.evaluate(n=>document.activeElement===n),true,'Filtering preserves the selected control');
   await tops.press('Tab');
   assert.equal(await card.getByRole('button',{name:'Shoes 1',exact:true}).evaluate(n=>document.activeElement===n),true,'Tab continues to the next filter');
  }
  assert.equal(await card.locator('body').evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`/tmp/sjpj-mcp-focus-${width}-${theme}-${fullscreen}.png`,fullPage:true});
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('MCP card focus: desktop/phone, light/dark, fullscreen/inline fallback, garment Back and filter keyboard continuity passed.');
}finally{await browser.close();}
