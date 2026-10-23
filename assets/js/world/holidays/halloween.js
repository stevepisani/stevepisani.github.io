// Halloween on the planet (31 October, assets/js/holidays.js): jack-o'-lanterns lit along the walk
// and round the bar, bats circling the roof, the festoon bulbs orange and purple, and a witch's
// hat on the bartender.
//
// Its own bundle (dist/holidays/halloween.js), loaded by URL only on the day, on world.js's own
// three.js (tools/build-js.mjs). Everything else it needs comes in `kit` from main.js, before the
// first frame, so the planet appears already dressed.
import {
  Group, Mesh, InstancedMesh, Object3D, Vector3, Color, CanvasTexture, SRGBColorSpace,
  SphereGeometry, CylinderGeometry, ShapeGeometry, Shape, MeshStandardMaterial, MeshBasicMaterial, DoubleSide,
} from 'three';

export function decorate({ scene, bar, dirFrom, place, headingToward, trailEdge, nearLandmark, addLamp, solid, colliders, glow, PALETTE, reducedMotion }) {
  const root = new Group();
  root.name = 'halloween';
  scene.add(root);
  const tmp = new Object3D();

  /* ---------- Jack-o'-lanterns ---------- */
  // One ribbed body for them all, the carved face glowing through its emissive map (a face on the
  // sphere's +z side, u = 0.25), and a stem: two draws however many there are.
  const body = new SphereGeometry(1, 32, 18);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new Vector3().fromBufferAttribute(p, i);
    const rib = 1 - 0.07 * (1 - Math.cos(Math.atan2(v.z, v.x) * 9)) / 2;
    p.setXYZ(i, v.x * rib, v.y * 0.78 * (v.y < 0 ? 0.85 : 1), v.z * rib);
  }
  body.computeVertexNormals();
  body.translate(0, 0.68, 0); // sits on its base
  const face = () => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#ffd27a';
    const tri = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
    tri([[96, 100], [122, 100], [110, 70]]);   // eyes
    tri([[134, 100], [160, 100], [146, 70]]);
    tri([[121, 118], [135, 118], [128, 106]]); // nose
    // the grin, with two teeth left in
    tri([[88, 128], [168, 128], [158, 150], [146, 142], [140, 156], [128, 146], [116, 156], [110, 142], [98, 150]]);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  };
  const skin = new MeshStandardMaterial({ color: PALETTE.pumpkin, roughness: 0.55, emissive: new Color(PALETTE.amber), emissiveMap: face(), emissiveIntensity: 4 });
  const stem = new CylinderGeometry(0.06, 0.1, 0.32, 7).translate(0, 1.36, 0);
  const stemSkin = new MeshStandardMaterial({ color: 0x4a4a22, roughness: 0.9 });

  // Where they go: along the walk from where you land (staggered, just off the flagstones, clear of
  // the lanterns), and round the bar (bar-local x, z, size)
  const spots = [];
  const offTrail = (polar, side, size) => {
    for (let a = 0.02; a < 0.2; a += 0.004) {
      const dir = dirFrom(polar, Math.PI / 2 + side * a / Math.sin(polar));
      if (trailEdge(dir) > 0.25 && !nearLandmark(dir, 0.2) && !solid(dir, size + 0.15)) return dir;
    }
    return null;
  };
  [[0.57, 1, 0.24], [0.51, -1, 0.2], [0.45, 1, 0.22], [0.39, -1, 0.26], [0.33, 1, 0.2], [0.27, -1, 0.23]].forEach(([polar, side, size]) => {
    const dir = offTrail(polar, side, size);
    if (!dir) return;
    tmp.scale.setScalar(size);
    // the face turned to the walk, a little back toward where you land, so you see it coming up
    place(tmp, dir, { heading: headingToward(dir, dirFrom(polar + 0.1, Math.PI / 2)), sink: 0.02 });
    spots.push(tmp.matrix.compose(tmp.position, tmp.quaternion, tmp.scale).clone());
    addLamp(tmp.position.clone().addScaledVector(dir, size), 4);
    colliders.push({ center: tmp.position.clone(), radius: size + 0.1 });
  });
  bar.group.updateMatrixWorld(true);
  const onGround = (x, z, size, heading) => { // the planet curves away from the bar's floor
    tmp.scale.setScalar(size);
    place(tmp, bar.group.localToWorld(new Vector3(x, 0, z)).normalize(), { heading, sink: 0.02 });
    spots.push(tmp.matrix.compose(tmp.position, tmp.quaternion, tmp.scale).clone());
  };
  onGround(-2.9, 2.95, 0.3, 0.3);    // by the front torches, a big one and a little one
  onGround(-3.35, 3.3, 0.18, 0.6);
  onGround(2.95, 2.9, 0.26, -0.3);
  // and a little one on the counter, where you see it from your stool, clear of the robot's work
  tmp.position.set(-1.05, 0.25 + 0.95, 0.25);
  tmp.rotation.set(0, 0.35, 0);
  tmp.scale.setScalar(0.09);
  tmp.updateMatrix();
  spots.push(bar.group.matrixWorld.clone().multiply(tmp.matrix));
  const lanterns = new InstancedMesh(body, skin, spots.length), stems = new InstancedMesh(stem, stemSkin, spots.length);
  spots.forEach((m, i) => { lanterns.setMatrixAt(i, m); stems.setMatrixAt(i, m); });
  lanterns.castShadow = stems.castShadow = true;
  root.add(lanterns, stems);

  /* ---------- The bulbs, orange and purple ---------- */
  const bulbs = bar.group.getObjectByName('festoon')?.children.find((o) => o.isInstancedMesh);
  if (bulbs) {
    bulbs.material = glow(0xffffff, 2.6);
    for (let i = 0; i < bulbs.count; i++) bulbs.setColorAt(i, new Color(i % 2 ? PALETTE.hex : PALETTE.pumpkin).multiplyScalar(i % 2 ? 1.6 : 1));
  }

  /* ---------- A witch's hat for the bartender ---------- */
  const head = bar.robot.head;
  if (head) {
    const felt = new MeshStandardMaterial({ color: 0x1c1226, roughness: 0.85, side: DoubleSide });
    const hat = new Group();
    hat.add(new Mesh(new CylinderGeometry(0.3, 0.3, 0.012, 40), felt));
    const cone = new CylinderGeometry(0.004, 0.172, 0.44, 24, 8, true);
    const c = cone.attributes.position;
    for (let i = 0; i < c.count; i++) { const k = c.getY(i) / 0.44 + 0.5; c.setX(i, c.getX(i) + 0.09 * k * k * k); } // the tip flops over
    cone.computeVertexNormals();
    hat.add(new Mesh(cone.translate(0, 0.22, 0), felt));
    hat.add(new Mesh(new CylinderGeometry(0.163, 0.17, 0.045, 24, 1, true).translate(0, 0.03, 0), new MeshStandardMaterial({ color: PALETTE.hex, roughness: 0.5, side: DoubleSide })));
    hat.add(new Mesh(new CylinderGeometry(0.03, 0.03, 0.05, 4).rotateX(Math.PI / 2).translate(0, 0.03, 0.17), glow(PALETTE.amber, 1.4))); // the buckle
    hat.position.set(0, 0.395, 0);
    hat.rotation.z = -0.08;
    head.add(hat);
    if (bar.robot.antenna) bar.robot.antenna.visible = false; // it's under the hat
  }

  /* ---------- Bats round the roof ---------- */
  // Each a body and two scalloped wings, all instanced; they circle the roof at their own height,
  // speed and bob, beating their wings. Under reduced motion there are none.
  const bats = [];
  let wings = null;
  if (!reducedMotion) {
    const wing = new Shape();
    wing.moveTo(0, 0.02);
    wing.quadraticCurveTo(0.12, 0.09, 0.26, 0.05);
    wing.quadraticCurveTo(0.24, -0.02, 0.2, -0.04);
    wing.quadraticCurveTo(0.17, 0, 0.13, -0.03);
    wing.quadraticCurveTo(0.1, 0, 0.06, -0.025);
    wing.quadraticCurveTo(0.04, 0, 0, -0.02);
    const wingGeo = new ShapeGeometry(wing).rotateX(Math.PI / 2);
    const dark = new MeshBasicMaterial({ color: 0x07050b, side: DoubleSide });
    const N = 7;
    const left = new InstancedMesh(wingGeo, dark, N), right = new InstancedMesh(wingGeo, dark, N);
    const bodies = new InstancedMesh(new SphereGeometry(0.035, 8, 6).scale(1, 0.8, 1.7), dark, N);
    for (const m of [left, right, bodies]) { m.frustumCulled = false; root.add(m); }
    for (let i = 0; i < N; i++) bats.push({ r: 3 + (i * 0.37) % 2.4, y: 3.6 + (i * 0.61) % 2.2, w: (0.5 + (i * 0.29) % 0.45) * (i % 3 ? 1 : -1), a: i * 2.4, flap: 9 + (i % 4) });
    wings = { left, right, bodies };
  }
  const frame = new Object3D(), part = new Object3D();
  const set = (mesh, i, x, y, z, rx, ry, rz, flip = 1) => {
    part.position.set(x, y, z);
    part.rotation.set(rx, ry, rz, 'YXZ');
    part.scale.set(flip, 1, 1);
    part.updateMatrix();
    mesh.setMatrixAt(i, frame.matrix.clone().multiply(part.matrix));
  };

  return {
    count: spots.length,
    bats: bats.length,
    update(t) {
      if (!wings) return;
      bats.forEach((b, i) => {
        const a = b.a + t * b.w, beat = Math.sin(t * b.flap + i) * 0.8;
        frame.position.set(Math.cos(a) * b.r, b.y + Math.sin(t * 1.3 + i) * 0.35, Math.sin(a) * b.r);
        frame.rotation.set(0, -a + (b.w > 0 ? 0 : Math.PI), Math.sin(t * 2 + i) * 0.2); // along its circle, banking
        frame.updateMatrix();
        frame.matrix.premultiply(bar.group.matrixWorld);
        set(wings.bodies, i, 0, 0, 0, 0, 0, 0);
        set(wings.left, i, 0.02, 0, 0, 0, 0, beat);
        set(wings.right, i, -0.02, 0, 0, 0, 0, -beat, -1);
      });
      for (const m of Object.values(wings)) m.instanceMatrix.needsUpdate = true;
    },
  };
}
