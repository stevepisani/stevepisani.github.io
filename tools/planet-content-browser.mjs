// Authored controls: actual canvas ink/extent plus message-facing close and whole-place views.
// Called by the existing offline smoke host; never reads an interview or requests a model.
export async function contentMessages(page,shot,{base,rpc,packPlanet}) {
  const timings=[];
  for(const angle of [0,65]) {
    const a=angle*Math.PI/180,long='An observatory welcomes peculiar star maps and carefully repaired instruments';
    const spec={version:1,slug:'test-message-surface',who:{name:'Message surface control'},arrival:'overview',reveal:'message',look:{sky:{period:'day'}},things:[
      {id:'activity',name:'A broad shared work area',at:{bearing:0,distance:6},solid:false,role:'focus',parts:[{shape:'box',size:[5,.12,4],color:'#788a77'}]},
      {id:'message',name:'A readable personal message',near:{of:'activity',side:'left',gap:.5},turn:70,frameWith:'activity',role:'focus',parts:[
        {shape:'box',size:[1.8,.7,.06],at:[0,1.1,0],turn:[0,angle,0],color:'#d4c6a4'},
        {shape:'box',size:[.08,1.1,.08],at:[0,.55,0],color:'#8b7661'},
        {shape:'text',text:'Garden after rain',size:[1.6,.35,.02],at:[Math.sin(a)*.05,1.1,Math.cos(a)*.05],turn:[0,angle,0],color:'#253f37'}]},
      {id:'long-label',name:'A complete long label',near:{of:'activity',side:'right',gap:.2},role:'support',solid:false,parts:[{shape:'text',text:long,size:[2,.4,.02],at:[0,1,0],color:'#ffffff'}]}
    ]};
    const result=(await rpc({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'prepare_planet',arguments:{spec}}},{})).result;
    if(result.isError)throw Error(result.content[0].text);
    const started=performance.now();
    await page.goto('about:blank');await page.goto(`${base}/p/preview/?test=1#${await packPlanet(result.structuredContent.spec)}`);
    await page.waitForFunction(()=>window.__planet?.ready,null,{timeout:120000});await page.locator('#veil').waitFor({state:'hidden'});
    await page.evaluate(()=>document.fonts.ready); // verify the painted metrics after late webfont settlement too
    const observe=()=>page.evaluate(()=>{
      const w=window.__planet,frame=w.opening(),matrices=w.spec.things.map(t=>({id:t.id,matrix:t.root.matrixWorld.toArray()})),labels=[];
      for(const thing of w.spec.things)thing.root.traverse(m=>{if(!m.userData.content)return;const c=m.material.map.image,x=c.getContext('2d'),data=x.getImageData(0,0,c.width,c.height).data;let left=c.width,right=0;for(let y=0;y<c.height;y++)for(let p=0;p<c.width;p++)if(data[(y*c.width+p)*4+3]){left=Math.min(left,p);right=Math.max(right,p);}labels.push({id:thing.id,extent:x.measureText(m.userData.content.text).width,drawnExtent:m.userData.content.drawnExtent,font:x.font,drawnFont:m.userData.content.drawnFont,width:c.width,left,right});});
      return {fits:frame.fits,content:frame.content,labels,matrices};
    });
    const close=await observe(),readyMs=performance.now()-started;
    if(!close.fits||!close.content?.meetsBudget)throw Error('The real message does not have a clear front close view: '+JSON.stringify(close.content));
    if(close.labels.length!==2||close.labels.some(l=>l.font!==l.drawnFont||Math.abs(l.extent-l.drawnExtent)>.5||l.width>2048||l.drawnExtent>l.width-63||l.left<14||l.right>=l.width-14))throw Error('Actual text canvas ink or complete text extent clips: '+JSON.stringify(close.labels));
    await shot(`content-${angle}-close`);
    const wholeStarted=performance.now();
    await page.getByRole('button',{name:'Whole place',exact:true}).click();await page.waitForFunction(()=>!window.__planet.opening().detail&&!window.__planet.busy());
    const whole=await observe();timings.push({angle,readyMs,wholePlaceMs:performance.now()-wholeStarted});
    if(!whole.fits||whole.content?.facing<.5||whole.content?.visibleFraction<.8)throw Error('Whole place hides the message face: '+JSON.stringify(whole.content));
    if(JSON.stringify(close.matrices)!==JSON.stringify(whole.matrices))throw Error('A view change mutated original object transforms');
    await shot(`content-${angle}-whole`);
  }
  return timings;
}
