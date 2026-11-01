// Small, supported architectural assemblies, independent of the activity inside them.
// Geometry is ordinary bounded parts, shared by preparation and the first-frame renderer.
const box=(size,at,color,extra={})=>({shape:'box',size,at,color,round:.06,...extra});
export function windowBay(color,wood) {
  return [
    box([1.98,.78,.25],[0,.37,0],color,{ground:true}),
    // Recessed lower panels and a substantial sill make a wall, rather than a glass screen.
    ...[-.48,.48].map(x=>box([.82,.47,.035],[x,.39,.145],wood,{surface:'wood'})),
    box([2.08,.12,.38],[0,.81,.04],wood,{surface:'wood'}),
    ...[-.94,.94].map(x=>box([.14,2.84,.25],[x,1.4,0],wood,{ground:true,surface:'wood'})),
    box([1.98,.22,.3],[0,2.73,0],color),
    box([2.12,.12,.39],[0,2.88,0],wood,{surface:'wood'}),
    box([1.72,1.68,.045],[0,1.74,-.06],'#b0cad0',{finish:'glass'}),
    box([.065,1.8,.12],[0,1.74,.02],wood,{surface:'wood'}),
    box([1.78,.065,.12],[0,1.74,.02],wood,{surface:'wood'}),
    box([1.78,.065,.12],[0,2.59,.02],wood,{surface:'wood'}),
  ];
}

// Rear pitch is high, eaves lower; the underside is real from walking and reverse views.
// Four individual feet meet the terrain. No solid bounding disc blocks the open entrances.
export function canopy(wood) {
  const parts=[];
  for(const x of [-3.04,3.04])for(const z of [-3.45,1.4]) {
    parts.push(box([.2,3.12,.2],[x,1.53,z],wood,{ground:true,surface:'wood'}));
    parts.push(box([.34,.16,.34],[x,.08,z],'#92877b',{ground:true}));
  }
  for(const z of [-3.45,1.4])parts.push(box([6.35,.2,.22],[0,3,z],wood,{surface:'wood'}));
  for(const x of [-3.04,3.04])parts.push(box([.2,.2,5.1],[x,3,-1.025],wood,{surface:'wood'}));
  // A connected pitched shell, with thickness and projecting eaves. No solid roof prism.
  parts.push({shape:'extrude',size:[6.75,1.35,5.55],at:[0,3.64,-1.025],color:'#626e70',outline:[[0,0],[.5,1],[1,0],[.96,0],[.5,.9],[.04,0]]});
  parts.push(box([.16,.14,5.65],[0,4.28,-1.025],wood,{surface:'wood'}));
  // Exposed gable rafters connect the ridge to the eaves on both ends.
  for(const z of [-3.71,1.66])for(const sign of [-1,1])parts.push({shape:'tube',size:[3.2,1.25,.12],at:[sign*1.6,3.61,z],color:wood,surface:'wood',path:[[-.5,sign*.5,0],[.5,-sign*.5,0]],thick:.12});
  return parts;
}

export function windowSeat(wood) {
  return [
    box([1.65,.16,.64],[0,.48,0],wood,{surface:'wood'}),
    box([1.58,.13,.59],[0,.625,.02],'#688f91',{surface:'cloth'}),
    box([1.65,.42,.12],[0,.78,-.27],wood,{surface:'wood'}),
    ...[-.68,.68].flatMap(x=>[-.21,.21].map(z=>box([.12,.49,.12],[x,.23,z],wood,{ground:true,surface:'wood'}))),
    ...[-.67,.67].map(x=>box([.12,.12,.65],[x,.79,0],wood,{surface:'wood'})),
  ];
}
