// Immediate, recognizable geometry for the existing stock library. These are fallbacks,
// not generated assets: model words/cache identity stay in planet.js and remain unchanged.
export function stockParts(kind, [w,h,d]) {
  const wood='#a77b53',dark='#38464a',blue='#79a7b6',green='#819879',cream='#f2dfb8';
  const box=(size,at,color=wood,more={})=>({shape:'box',size,at,color,round:Math.min(...size)>.1?.08:0,...more});
  const ball=(size,at,color,more={})=>({shape:'sphere',size,at,color,...more});
  const cylinder=(size,at,color=wood,more={})=>({shape:'cylinder',size,at,color,...more});
  const leg=(x,z,top,width=.06,color=wood)=>box([width,top,width],[x,top/2,z],color,{ground:true});
  if(kind==='chair'||kind==='bench') {
    const bench=kind==='bench',paint=bench?green:blue,seat=h*.48,ps=[box([w,.07,d],[0,seat,0],paint)];
    for(const x of [-w*.36,w*.36])for(const z of [-d*.34,d*.34])ps.push(leg(x,z,seat-.03,.055,bench?dark:wood));
    for(const x of [-w*.42,w*.42])ps.push(box([.055,h-seat,.055],[x,(h+seat)/2,-d*.41],paint));
    for(const y of [seat+(h-seat)*.45,h-.05])ps.push(box([w,.07,.055],[0,y,-d*.41],paint));
    if(bench)for(const x of [-w*.47,w*.47])ps.push(box([.07,.055,d],[x,seat+.17,0],dark));
    return ps;
  }
  if(kind==='table') {
    const ps=[box([w,.07,d],[0,h-.035,0],wood,{surface:'wood'})];
    for(const x of [-w*.4,w*.4])for(const z of [-d*.35,d*.35])ps.push(leg(x,z,h-.07,.075));
    for(const z of [-d*.35,d*.35])ps.push(box([w*.83,.09,.06],[0,h-.13,z]));
    return ps;
  }
  if(kind==='lamp-post')return [cylinder([w*.4,.08,d*.4],[0,.04,0],dark),cylinder([.07,h*.78,.07],[0,h*.39,0],dark,{ground:true}),box([w,.07,d],[0,h*.77,0],dark),box([w,.07,d],[0,h-.035,0],dark),...[-w*.4,w*.4].flatMap(x=>[-d*.4,d*.4].map(z=>box([.035,h*.2,.035],[x,h*.87,z],dark))),ball([w*.5,h*.14,d*.5],[0,h*.87,0],cream,{finish:'glow'})];
  if(kind==='crate') {
    const ps=[box([w,.045,d],[0,.023,0])];
    for(const x of [-w*.46,w*.46])for(const z of [-d*.45,d*.45])ps.push(leg(x,z,h,.055));
    for(const y of [h*.25,h*.53,h*.81]) {for(const z of [-d*.45,d*.45])ps.push(box([w,.09,.045],[0,y,z]));for(const x of [-w*.46,w*.46])ps.push(box([.045,.09,d],[x,y,0]));}
    return ps;
  }
  if(kind==='sack')return [ball([w,h*.86,d],[0,h*.43,0],'#baaa82'),cylinder([w*.3,h*.14,d*.3],[0,h*.93,0],'#9e8a60'),cylinder([w*.34,.025,d*.34],[0,h*.89,0],cream)];
  if(kind==='mailbox')return [box([.08,h*.76,.08],[0,h*.38,0],wood,{ground:true}),box([w,h*.3,d],[0,h*.85,0],'#b05e53',{round:.22}),box([.018,.22,.09],[w*.5,h*.89,0],'#d58b64')];
  if(kind==='planter')return [cylinder([w*.75,h*.4,d*.75],[0,h*.2,0],'#ae7356'),cylinder([w*.82,.055,d*.82],[0,h*.4,0],'#c28c6b'),cylinder([.045,h*.4,.045],[0,h*.57,0],'#607b51'),...[-1,1].map(sign=>ball([w*.67,h*.42,d*.68],[sign*w*.16,h*.67,0],green)),ball([w*.6,h*.3,d*.6],[0,h*.83,0],'#6c8d62')];
  if(kind==='fence') {
    const ps=[];for(const y of [h*.3,h*.68])ps.push(box([w,.07,d*.7],[0,y,0],'#e1d9c9'));
    for(let i=0;i<7;i++){const x=-w*.46+i*w*.92/6;ps.push(box([w*.08,h*.88,d],[x,h*.44,0],'#e1d9c9',{ground:true}),{shape:'cone',size:[w*.113,h*.12,d*1.4],at:[x,h*.94,0],color:'#e1d9c9',turn:[0,45,0]});}
    return ps;
  }
  return [];
}
