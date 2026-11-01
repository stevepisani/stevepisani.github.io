// Finished painting/birdwatching activity parts. No interview-specific objects or coordinates.
const wood='#8e7254',cream='#eee5ce';
const box=(size,at,color,more={})=>({shape:'box',size,at,color,round:.08,...more});
const ball=(size,at,color,more={})=>({shape:'sphere',size,at,color,...more});
const cylinder=(size,at,color,more={})=>({shape:'cylinder',size,at,color,...more});
const line=(size,at,path,thick,color)=>({shape:'tube',size,at,path,thick,color});

export function easel() {
  const ps=[box([1.25,.08,.08],[0,.94,.1],wood,{surface:'wood'}),box([1.14,.08,.1],[0,2.12,-.06],wood,{surface:'wood'})];
  for(const x of [-.46,.46])ps.push(box([.075,2.2,.085],[x,1.05,0],wood,{surface:'wood',ground:true}));
  ps.push(box([1.08,1.02,.055],[0,1.53,.08],cream));
  ps.push(box([.14,.14,.06],[0,2.08,.14],wood,{surface:'wood'}));
  return ps;
}

export function paintingTable() {
  const ps=[box([1.6,.11,.7],[0,.79,0],wood,{surface:'wood'}),box([.5,.025,.38],[-.35,.86,.04],cream)];
  for(const x of [-.66,.66])for(const z of [-.23,.23])ps.push(box([.09,.8,.09],[x,.37,z],wood,{surface:'wood',ground:true}));
  // Pigment pans, mixing dish, brush pot and separate brushes share the tabletop anchor.
  for(const [i,color] of ['#486e8a','#b0684d','#b9a260','#64896b'].entries())ps.push(box([.08,.025,.08],[-.52+i*.11,.89,.09],color));
  ps.push(cylinder([.23,.13,.23],[.13,.9,.12],cream),cylinder([.16,.21,.16],[.48,.94,-.1],'#829493'));
  for(const x of [.43,.49,.54])ps.push(cylinder([.016,.34,.016],[x,1.14,-.1],wood));
  ps.push(box([.44,.035,.3],[.45,.87,.17],'#b8aa87',{surface:'cloth'}));
  return ps;
}

export function perchedBird() {
  const ps=[
    // A branch with one fork is a grounded perch, and leaves room for an approach.
    cylinder([.18,1.45,.18],[0,.68,0],wood,{surface:'wood',ground:true}),
    line([1.15,.28,.2],[.2,1.25,0],[[-.5,-.3,0],[0,.2,0],[.5,.5,0]],.09,wood),
    ball([.34,.38,.46],[.1,1.58,.02],'#78857b'),ball([.26,.3,.2],[.1,1.56,.22],'#bd795b'),
    ball([.26,.26,.28],[.1,1.83,.17],'#697970',{joint:'head'}),
    ball([.024,.035,.025],[.222,1.86,.235],'#202d2a',{joint:'head'}),
    ball([.024,.035,.025],[-.022,1.86,.235],'#202d2a',{joint:'head'}),
    {shape:'cone',size:[.09,.14,.08],at:[.1,1.82,.36],turn:[90,0,0],color:'#a29b70',joint:'head'},
    ball([.07,.24,.32],[-.055,1.62,-.04],'#4b6159'),ball([.07,.24,.32],[.255,1.62,-.04],'#4b6159'),
    box([.19,.035,.34],[.1,1.42,-.23],'#4b6159',{turn:[-22,0,0]}),
  ];
  for(const x of [.04,.16])ps.push(cylinder([.018,.13,.018],[x,1.34,.06],'#87765b'));
  return ps;
}

export function woodlandFloor() {
  return [ball([1.2,.44,.8],[.2,.1,0],'#7a8472'),ball([.7,.3,.6],[-.35,.04,.32],'#90957f'),
    ball([.26,.045,.18],[.35,.32,.02],'#617353')];
}

// Approximate authoring envelope; the ready library tree supplies the actual silhouette.
export function treeEnvelope() {
  return [cylinder([.22,3.5,.22],[0,1.6,0],wood,{ground:true}),
    ball([3.6,2.6,3.5],[0,3.85,0],'#6f9462')];
}
