// Reusable, bounded scene layouts. The model chooses meaning; the engine owns metre-level
// assembly. These are authored miniature props, available immediately, without paid generation.
const DEG = Math.PI / 180;
const P = { wood: '#956647', edge: '#c18b5d', cream: '#fff1d3', teal: '#4c9694', leaf: '#458858', leafLight: '#6aa969', sand: '#d9bd88', warm: '#ffcf83', orange: '#d98a43' };
const shape = (shape, size, at, color, more = {}) => ({ shape, size, at, color, ...more });
const box = (size, at, color, more) => shape('box', size, at, color, { round: 0.15, ...more });
const ball = (size, at, color, more) => shape('sphere', size, at, color, more);
const tube = (size, at, path, thick, color) => shape('tube', size, at, color, { path, thick });
const pos = (x, n) => ({ bearing: Math.atan2(x, n) / DEG, distance: Math.hypot(x, n) });

function palm() {
  const parts = [tube([0.6, 4.1, 0.4], [0, 2, 0], [[0, -0.5, 0], [-0.25, -0.2, 0], [-0.15, 0.2, 0], [0.4, 0.5, 0]], 0.25, P.wood)];
  // A curved blade with a tapered outline: y is the length, then it is laid out from the crown.
  // Turn around z after tipping, rather than rotating a vertical blade around y first.
  for (let i = 0; i < 7; i++) {
    const a = i * Math.PI * 2 / 7;
    const dx = Math.cos(a), dz = Math.sin(a);
    parts.push(tube([3, 0.8, 3], [0.24, 4.02, 0], [[0, 0, 0], [dx * 0.24, 0.3, dz * 0.24], [dx * 0.49, -0.18, dz * 0.49]], 0.045, P.leafLight));
    // Leaves follow the same arch, a small connected row of soft blades, no unsupported fins.
    for (const u of [0.32, 0.62, 0.87]) parts.push(ball([0.56, 0.13, 1.05 - u * 0.2], [0.24 + dx * 1.5 * u, 4.02 + Math.sin(u * Math.PI) * 0.24 - u * u * 0.3, dz * 1.5 * u], i % 2 ? P.leaf : P.leafLight, { turn: [0, 90 - a / DEG, dx * 12] }));
  }
  for (const x of [-0.08, 0.2, 0.42]) parts.push(ball([0.26, 0.29, 0.26], [x, 3.8, 0.1], '#786042'));
  return parts;
}
function cat(color = P.orange) {
  const parts = [
    ball([0.67, 0.85, 0.58], [0, 0.53, 0], color), ball([0.75, 0.64, 0.61], [0, 1.05, 0.05], color),
    ball([0.41, 0.56, 0.15], [0, 0.57, 0.29], P.cream),
    shape('cone', [0.28, 0.35, 0.24], [-0.25, 1.39, 0.02], color, { turn: [0, 0, 12] }),
    shape('cone', [0.28, 0.35, 0.24], [0.25, 1.39, 0.02], color, { turn: [0, 0, -12] }),
    shape('cone', [0.13, 0.22, 0.05], [-0.25, 1.41, 0.135], '#cc9b8f', { turn: [0, 0, 12] }),
    shape('cone', [0.13, 0.22, 0.05], [0.25, 1.41, 0.135], '#cc9b8f', { turn: [0, 0, -12] }),
    ball([0.35, 0.2, 0.16], [-0.15, 0.16, 0.25], P.cream), ball([0.35, 0.2, 0.16], [0.15, 0.16, 0.25], P.cream),
    ball([0.32, 0.23, 0.18], [-0.14, 0.95, 0.32], P.cream), ball([0.32, 0.23, 0.18], [0.14, 0.95, 0.32], P.cream),
    ball([0.11, 0.14, 0.055], [-0.2, 1.12, 0.345], '#42564a'), ball([0.11, 0.14, 0.055], [0.2, 1.12, 0.345], '#42564a'),
    ball([0.045, 0.09, 0.025], [-0.2, 1.12, 0.375], '#232d31'), ball([0.045, 0.09, 0.025], [0.2, 1.12, 0.375], '#232d31'),
    ball([0.1, 0.07, 0.055], [0, 1.0, 0.425], '#b77f76'),
    tube([1.1, 0.7, 0.6], [0.32, 0.4, -0.1], [[0, -0.4, 0], [0.45, -0.2, 0], [0.48, 0.35, 0], [0.3, 0.48, 0]], 0.15, color),
  ];
  for (const x of [-0.16, 0, 0.16]) parts.push(ball([0.075, 0.21, 0.04], [x, 1.25, 0.31], '#9d633b', { turn: [0, 0, x * 80] }));
  for (const y of [0.42, 0.61, 0.8]) parts.push(ball([0.19, 0.065, 0.38], [-0.29, y, -0.015], '#ad6d3c'));
  return parts;
}
function table() {
  const ps = [box([2.5, 0.14, 1.45], [0, 0.86, 0], P.wood), box([2.15, 0.025, 0.36], [0, 0.945, 0], P.teal)];
  for (const x of [-0.97, 0.97]) for (const z of [-0.5, 0.5]) ps.push(box([0.14, 0.86, 0.14], [x, 0.4, z], P.wood));
  for (const x of [-0.75, 0, 0.75]) {
    ps.push(shape('cylinder', [0.42, 0.035, 0.42], [x, 0.96, 0.38], P.cream));
    ps.push(ball([0.25, 0.1, 0.23], [x, 1.025, 0.38], '#ce7b45'));
    ps.push(shape('cylinder', [0.14, 0.23, 0.14], [x + 0.24, 1.05, 0.08], '#b7d7d0'));
  }
  ps.push(shape('lathe', [0.55, 0.16, 0.55], [0.1, 0.99, -0.26], P.cream, { profile: [[0, 0], [0.5, 0.1], [1, 0.8], [1, 1]] }));
  for (const [x,z] of [[0,-0.24],[0.2,-0.24],[0.1,-0.4]]) ps.push(ball([0.18, 0.18, 0.18], [x, 1.1, z], '#d69e47'));
  return ps;
}
function seat() {
  return [box([1.05, 0.12, 0.6], [0, 0.48, 0], P.wood), box([1.03, 0.1, 0.58], [0, 0.59, 0], P.teal), box([1.05, 0.52, 0.12], [0, 0.89, -0.26], P.wood),
    ...[-0.38, 0.38].flatMap((x) => [-0.18, 0.18].map((z) => box([0.09, 0.5, 0.09], [x, 0.23, z], P.wood)))];
}
function garland() {
  const ps = [-1.85,1.85].map((x) => shape('cylinder', [0.12, 3, 0.12], [x, 1.48, 0], P.wood));
  ps.push(tube([3.7, 0.6, 0.1], [0, 2.8, 0], [[-0.5,0.3,0],[0,-0.35,0],[0.5,0.3,0]],0.025,P.wood));
  for (let i = 0; i < 9; i++) { const x = -1.65 + i * 0.41; ps.push(ball([0.12,0.16,0.12],[x,2.6+0.35*(x/1.85)**2,0], P.warm, { finish: 'glow' })); }
  return ps;
}
function beachGarden() {
  const ps = [];
  for (const [x,z,r] of [[-0.42,0.15,0.6],[0.15,-0.12,0.8],[0.5,0.12,0.55]]) {
    ps.push(ball([r,0.5,r*0.7],[x,0.19,z],P.leaf),ball([r*0.65,0.4,r*0.5],[x-0.1,0.38,z],P.leafLight));
    ps.push(shape('cylinder',[0.025,0.42,0.025],[x,0.47,z+0.15],P.leaf));
    ps.push(ball([0.19,0.1,0.19],[x,0.7,z+0.15],P.cream));
    ps.push(ball([0.08,0.08,0.08],[x,0.74,z+0.15],'#e2b65e'));
  }
  return ps;
}
function hammock() {
  const ps = [-1.45,1.45].map((x)=>tube([0.5,2.5,0.2],[x,1.2,0],[[0,-0.5,0],[-Math.sign(x)*0.5,0.5,0]],0.13,P.wood));
  // Five adjoining soft strips form a continuous sagging canvas. This is a sitting place,
  // using the existing sit action rather than promising a separate lying animation.
  for (let i=0;i<5;i++) {
    const x=-0.8+i*0.4, y=0.65+0.45*(x/0.8)**2;
    ps.push(box([0.48,0.07,0.9],[x,y,0],i%2?P.cream:P.teal,{turn:[0,0,x*36]}));
  }
  for (const sign of [-1,1]) ps.push(tube([0.65,1.15,0.1],[sign*1.03,1.55,0],[[sign*0.45,0.5,0],[-sign*0.4,-0.5,0]],0.035,P.cream));
  return ps;
}
function telescope() {
  return [shape('cylinder',[0.22,1.45,0.22],[0,1,0],P.wood),
    ...[-1,0,1].map((i) => tube([1.4,1,1.4],[0,0.5,0],[[0,0.5,0],[Math.cos(i*2.1)*0.45,-0.5,Math.sin(i*2.1)*0.45]],0.09,P.wood)),
    shape('cylinder',[0.55,1.65,0.55],[0,1.65,0],P.cream,{turn:[58,0,0]}),
    shape('torus',[0.6,0.6,0.12],[0,2.08,0.7],P.teal,{turn:[-32,0,0]}),
    ball([0.42,0.42,0.09],[0,2.08,0.74],'#314d59',{turn:[-32,0,0]}),
    shape('cylinder',[0.09,3.5,0.09],[-0.7,1.7,-0.8],P.wood),
    ball([0.9,0.9,0.9],[-0.7,3.55,-0.8],P.teal),
    shape('torus',[1.8,1.8,0.12],[-0.7,3.55,-0.8],P.warm,{turn:[65,15,0]})];
}

export function sceneErrors(spec) {
  if (spec.scenes === undefined) return [];
  const e = [], fail = (at, why) => e.push(`${at}: ${why}`), obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (!Array.isArray(spec.scenes) || spec.scenes.length < 1 || spec.scenes.length > 3) return ['scenes: should have 1 to 3 scenes'];
  const ids = new Set();
  spec.scenes.forEach((s,i) => {
    const at = `scenes[${i}]`;
    if (!obj(s)) return fail(at,'should be an object');
    for (const k of Object.keys(s)) if (!['id','name','kind','note','collection','setting','companion','extras'].includes(k)) fail(`${at}.${k}`,'not part of a scene');
    if (typeof s.id !== 'string' || !/^[a-z][a-z0-9-]{0,17}$/.test(s.id) || ids.has(s.id)) fail(`${at}.id`,'should be a unique short id (18 characters at most)');
    ids.add(s.id);
    if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 40) fail(`${at}.name`,'should be 1 to 40 characters');
    if (!['gathering','lookout'].includes(s.kind)) fail(`${at}.kind`,'should be gathering or lookout');
    if (s.setting !== undefined && s.setting !== 'tropical') fail(`${at}.setting`,'only tropical is available for now');
    if (s.note !== undefined && (typeof s.note !== 'string' || s.note.length > 600)) fail(`${at}.note`,'should be text up to 600 characters');
    if (s.collection !== undefined && !Object.hasOwn(spec.collections || {}, s.collection)) fail(`${at}.collection`,'no such collection');
    if (s.extras !== undefined && (!Array.isArray(s.extras) || s.extras.length > 1 || s.extras.some((x)=>x !== 'hammock'))) fail(`${at}.extras`,'only ["hammock"] is supported for now');
    if (s.companion !== undefined) {
      const c = s.companion;
      if (!obj(c)) return fail(`${at}.companion`,'should be an object');
      for (const k of Object.keys(c)) if (!['kind','name','color','note'].includes(k)) fail(`${at}.companion.${k}`,'not part of a companion');
      if (c.kind !== 'cat') fail(`${at}.companion.kind`,'only cat is available for now');
      if (c.color !== undefined && !(typeof c.color === 'string' && /^#[0-9a-f]{6}$/i.test(c.color))) fail(`${at}.companion.color`,'should be a colour like #d98a43');
      for (const [k,max] of [['name',40],['note',600]]) if (c[k] !== undefined && (typeof c[k] !== 'string' || !c[k].trim() || c[k].length > max)) fail(`${at}.companion.${k}`,`should be 1 to ${max} characters`);
    }
  });

  return e;
}

/** Compile validated semantic scenes into the same bounded things the existing renderer draws. */
export function composePlanet(spec) {
  if (!spec.scenes) return spec;
  const out = structuredClone(spec), scenes = out.scenes;
  delete out.scenes;
  out.things ||= [];
  out.routes = [];
  out.arrival = 'overview';
  let previous = { bearing: 0, distance: 1.2 };
  scenes.forEach((s,i) => {
    const cx = [0, 3.9, -7][i], cn = [6.5, 12.5, 13][i];
    const entrance = pos(cx, cn - 2.2);
    out.routes.push({ from: previous, to: entrance });
    previous = entrance;
    const add = (id,name,x,n,parts,extra={}) => out.things.push({ id: `${s.id}-${id}`, name, at: pos(cx+x,cn+n), parts, ...extra });
    if (s.kind === 'gathering') {
      add('table',s.name,0.45,0,table(),{footprint:[2.5,1.45],note:s.note,collection:s.collection});
      add('seat','A place at the table',-1.5,-0.05,seat(),{turn:90,footprint:[1.05,0.6],use:'sit'});
      add('bench','Room for friends',0.45,1.45,seat(),{footprint:[1.05,0.6],use:'sit'});
      add('lights','Supper lights',0.45,1.9,garland(),{footprint:[3.9,0.18],solid:false,light:{color:P.warm,strength:0.35,at:[0,2.6,0]},use:'switch'});
    } else {
      add('scope',s.name,0,0,telescope(),{footprint:[1.4,1.4],note:s.note,collection:s.collection});
      add('seat','Watch the stars',1.6,-0.25,seat(),{footprint:[1.05,0.6],use:'sit',turn:-40});
      add('lantern','Cove lantern',-1.25,-0.3,[box([0.32,0.5,0.32],[0,0.24,0],P.wood),ball([0.23,0.3,0.23],[0,0.36,0],P.warm,{finish:'glow'})],{footprint:[0.35,0.35],light:{color:P.warm,strength:0.12,at:[0,0.5,0]}});
    }
    if (s.companion) add('cat',s.companion.name || 'Your cat',-0.65,-2.1,cat(s.companion.color),{footprint:[0.7,0.6],note:s.companion.note});
    if (s.extras?.includes('hammock')) add('hammock','A hammock by the water',-5.2,2.3,hammock(),{footprint:[3,1],use:'sit',turn:20});
    if (s.setting === 'tropical') {
      for (const [j,x,n] of [[0,-2.9,1.3],[1,3,2.2]]) add(`palm-${j}`,'Shore palm',x,n,palm(),{footprint:[0.45,0.45],turn:j ? -15:15});
      for (const [j,x,n] of [[0,-2.6,0.7],[1,2.8,1.3]]) add(`garden-${j}`,'Beach flowers',x,n,beachGarden(),{solid:false,footprint:[1.5,0.8]});
      out.look ||= {};
      out.look.ground = { color:P.sand,hills:0.12,...out.look.ground,coast:{bearing:-62,distance:8,radius:4,color:'#368e97'} };
      out.look.sky = {color:'#4d4383',light:'#ffe4be',...out.look.sky};
    }
  });
  return out;
}
