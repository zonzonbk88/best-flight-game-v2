// The aircraft: a small single-prop courier plane built from primitives — a
// tapered fuselage, a low wing with dihedral, a tailplane and fin, a spinning
// two-blade prop, fixed gear and wingtip nav lights. It looks assembled, not drawn.

import * as THREE from 'three';
import { PALETTE } from './config.js';

/**
 * The Vietnamese flag, drawn procedurally on a canvas — red field, one
 * yellow five-pointed star — so the livery needs no image asset and no
 * network. Used on the tail fin and as wing-top decals.
 */
function vietnamFlagTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#da251d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Five-pointed star, one point up, centred on the flag.
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const outer = 62;
  const inner = outer * 0.382;
  ctx.fillStyle = '#ffde00';
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createAircraft() {
  const group = new THREE.Group();
  const cream = new THREE.MeshLambertMaterial({ color: PALETTE.planeCream });
  const red = new THREE.MeshLambertMaterial({ color: PALETTE.planeRed });
  const dark = new THREE.MeshLambertMaterial({ color: PALETTE.planeDark });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fd4e8, transparent: true, opacity: 0.85 });

  // Fuselage: a nose cone, a long body and a tapering tail cone.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.55, 4.6, 10), cream);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0, -0.4);
  group.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.4, 10), red);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0, 2.6);
  group.add(nose);
  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.2, 10), cream);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.set(0, 0.1, -3.6);
  group.add(tailCone);

  // Canopy: a flattened glass bubble over the cockpit.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 8), glass);
  canopy.scale.set(0.85, 0.62, 1.7);
  canopy.position.set(0, 0.62, 0.7);
  group.add(canopy);

  // Main wing: two halves with a gentle dihedral, red tips.
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.14, 1.5), cream);
    wing.position.set(side * 2.5, 0.12, 0.1);
    wing.rotation.z = side * 0.07;
    group.add(wing);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 1.5), red);
    tip.position.set(side * 4.8, 0.28, 0.1);
    tip.rotation.z = side * 0.07;
    group.add(tip);
    // Wingtip nav light: red port, green starboard.
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff2222 : 0x22ff66 }),
    );
    light.position.set(side * 5.05, 0.3, 0.1);
    group.add(light);
  }

  // Tailplane and fin. The fin wears the Vietnamese flag on both faces —
  // a box whose broad ±X sides take the flag material, edges stay ember red.
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.9), red);
  tailplane.position.set(0, 0.22, -4.3);
  group.add(tailplane);
  const flagMat = new THREE.MeshBasicMaterial({ map: vietnamFlagTexture() });
  const fin = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 1.5, 1.1),
    [flagMat, flagMat, red, red, red, red],
  );
  fin.position.set(0, 0.85, -4.35);
  fin.rotation.x = -0.12;
  group.add(fin);
  // Wing-top flag decals: flat panels lying on each wing (on dihedral pivots,
  // like the flaps), so the flag reads from the chase camera above and behind
  // as well as from the side.
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 2.5, 0.21, 0.1);
    pivot.rotation.z = side * 0.07;
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.13), flagMat);
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(side * 0.15, 0.012, 0);
    pivot.add(decal);
    group.add(pivot);
  }

  // Retractable landing gear: two legs, two wheels, one tail wheel, all in
  // one group the renderer folds away when the gear comes up.
  const gearGroup = new THREE.Group();
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6), dark);
    leg.position.set(side * 0.7, -0.75, 0.9);
    leg.rotation.z = side * 0.25;
    gearGroup.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 10), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 0.85, -1.2, 0.9);
    gearGroup.add(wheel);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.14, 8), dark);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -0.55, -4.2);
  gearGroup.add(tailWheel);
  group.add(gearGroup);

  // Flaps: hinged panels on the wing's trailing edge, drooping by stage.
  const flaps = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 1.9, 0.1, -0.62);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.09, 0.85), red);
    panel.position.set(side * 1.2, 0, -0.4);
    pivot.add(panel);
    group.add(pivot);
    flaps.push(pivot);
  }

  // Propeller: a spinner cone and two blades on a hub that spins with throttle.
  const prop = new THREE.Group();
  prop.position.set(0, 0, 3.35);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 10), red);
  spinner.rotation.x = Math.PI / 2;
  prop.add(spinner);
  for (const angle of [0, Math.PI]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.6, 0.08), dark);
    blade.position.set(0, 0, 0.1);
    const holder = new THREE.Group();
    holder.rotation.z = angle;
    holder.add(blade);
    prop.add(holder);
  }
  group.add(prop);

  // A faint translucent disc the prop sweeps, so the spin reads at speed.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.35, 24),
    new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.08, side: THREE.DoubleSide }),
  );
  disc.position.set(0, 0, 3.32);
  group.add(disc);

  return {
    group,
    /** Spin the prop; rate follows throttle and airspeed. */
    spinProp(dt, rate) {
      prop.rotation.z += dt * rate;
    },
    /** Fold the gear away or drop it, matching the flight model's state. */
    setGear(down) {
      gearGroup.visible = down;
    },
    /** Droop the flap panels: stage 0 flush, 1 half, 2 full. */
    setFlaps(stage) {
      const angle = -stage * 0.38; // trailing edge droops down, not up
      for (const pivot of flaps) pivot.rotation.x = angle;
    },
  };
}
