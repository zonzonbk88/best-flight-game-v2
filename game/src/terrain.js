// The archipelago itself: a seeded heightfield of islands rising out of an
// open sea, a big gradient water plane, two runway strips, a lighthouse,
// scattered pines, drifting clouds and the glowing guide/optional rings.
// terrainHeight(x, z) is the single source of truth for the land — physics,
// the renderer and the screenshots all ask it the same question. The sea is
// a surface, not terrain: groundHeight() folds the waterline in, and that is
// what the flight model collides with.

import * as THREE from 'three';
import { AIRFIELD, CLINIC, ISLANDS, LIGHTHOUSE, PALETTE, RING, RUNWAY, WORLD } from './config.js';
import { createRandom, makeNoise2D } from './random.js';

const TERRAIN_SEGMENTS = 200;
const PAD_HEIGHT = 3;

export function createTerrain(seed) {
  const rng = createRandom(seed);
  const noise = makeNoise2D(seed);
  const noiseFine = makeNoise2D(seed + 31);

  /** One island's smooth dome: 1 at the centre, 0 at the shoreline radius. */
  function islandProfile(island, x, z) {
    const d = Math.hypot(x - island.x, z - island.z);
    const t = d / (island.radius * 1.35);
    if (t >= 1) return 0;
    const s = 1 - t * t;
    return s * s;
  }

  function terrainHeight(x, z) {
    let h = -14; // the seabed, well under the waterline
    for (const island of ISLANDS) {
      const p = islandProfile(island, x, z);
      if (p <= 0) continue;
      const rolling = noise(x * 0.004 + island.x * 0.01, z * 0.004 + island.z * 0.01) * 0.35
        + noiseFine(x * 0.02, z * 0.02) * 0.08;
      const dome = island.peak * p * (1 + rolling * p);
      h = Math.max(h, dome + (1 - p) * -14 * 0.4 - 2);
    }
    // Flatten a pad under each runway so the strips sit level above the sea
    // (with a broad apron, so a departure is not a cliff face), and a plateau
    // under the clinic so a low drop run is not a hill strike.
    h = flattenPad(h, x, z, RUNWAY.x, RUNWAY.z, RUNWAY.length, RUNWAY.width, PAD_HEIGHT, 250);
    h = flattenPad(h, x, z, AIRFIELD.x, AIRFIELD.z, AIRFIELD.length, AIRFIELD.width, PAD_HEIGHT, 250);
    h = flattenPad(h, x, z, CLINIC.x, CLINIC.z, 240, 240, 12, 70);
    return h;
  }

  function flattenPad(h, x, z, cx, cz, length, width, padHeight, margin) {
    const dx = Math.abs(x - cx);
    const dz = Math.abs(z - cz);
    if (dx > width / 2 + margin || dz > length / 2 + margin) return h;
    const edge = Math.max(dx / (width / 2 + margin), dz / (length / 2 + margin));
    const blend = Math.max(0, Math.min(1, (edge - 0.42) / 0.58));
    return padHeight + (h - padHeight) * blend * blend;
  }

  /** Land or sea surface, whichever is higher: what a wheel (or a wing) meets. */
  function groundHeight(x, z) {
    return Math.max(terrainHeight(x, z), WORLD.seaLevel + 0.4);
  }

  /** Build the island mesh with vertex colours: sand rim, grass, hill, rock. */
  function buildGround() {
    const sizeX = WORLD.halfWidth * 2;
    const sizeZ = WORLD.halfLength * 2;
    const geo = new THREE.PlaneGeometry(sizeX, sizeZ, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colours = new Float32Array(pos.count * 3);
    const grass = new THREE.Color(PALETTE.grass);
    const dry = new THREE.Color(PALETTE.grassDry);
    const hill = new THREE.Color(PALETTE.hill);
    const rock = new THREE.Color(PALETTE.rock);
    const sand = new THREE.Color(PALETTE.sand);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = terrainHeight(x, z);
      pos.setY(i, h);
      const n = noiseFine(x * 0.015, z * 0.015);
      if (h < 2.2) {
        // Beach rim (and the drowned seabed beyond it): warm sand.
        c.copy(sand).lerp(new THREE.Color(PALETTE.seaShallow), Math.max(0, Math.min(1, (0.5 - h) / 8)) * 0.6);
      } else {
        c.copy(grass).lerp(dry, Math.max(0, n) * 0.55);
        c.lerp(hill, Math.max(0, Math.min(1, (h - 34) / 70)));
        if (h > 105) c.lerp(rock, Math.min(1, (h - 105) / 80));
      }
      colours[i * 3] = c.r;
      colours[i * 3 + 1] = c.g;
      colours[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    return new THREE.Mesh(geo, mat);
  }

  /**
   * The sea: one large plane whose vertex colours grade from turquoise over
   * the shallows to deep blue offshore, read off the seabed height beneath.
   */
  function buildSea() {
    const size = Math.max(WORLD.halfWidth, WORLD.halfLength) * 2 + 2600;
    const geo = new THREE.PlaneGeometry(size, size, 96, 96);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colours = new Float32Array(pos.count * 3);
    const shallow = new THREE.Color(PALETTE.seaShallow);
    const mid = new THREE.Color(PALETTE.seaMid);
    const deep = new THREE.Color(PALETTE.seaDeep);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const depth = -terrainHeight(x, z); // metres of water over the seabed
      if (depth < 6) c.copy(shallow).lerp(mid, Math.max(0, depth) / 6);
      else c.copy(mid).lerp(deep, Math.min(1, (depth - 6) / 26));
      colours[i * 3] = c.r;
      colours[i * 3 + 1] = c.g;
      colours[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.94 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = WORLD.seaLevel;
    return mesh;
  }

  function buildRunwayStrip(def) {
    const group = new THREE.Group();
    const y = PAD_HEIGHT + 0.35;
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(def.width, def.length),
      new THREE.MeshLambertMaterial({ color: PALETTE.runway }),
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(def.x, y, def.z);
    group.add(strip);
    const markMat = new THREE.MeshBasicMaterial({ color: PALETTE.runwayMark });
    for (let dz = -def.length / 2 + 34; dz < def.length / 2 - 24; dz += 42) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 18), markMat);
      dash.position.set(def.x, y + 0.12, def.z + dz);
      group.add(dash);
    }
    for (const end of [-1, 1]) {
      for (let k = -2; k <= 2; k += 1) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.2, 12), markMat);
        bar.position.set(def.x + k * 4.4, y + 0.12, def.z + end * (def.length / 2 - 12));
        group.add(bar);
      }
    }
    // A windsock on a pole beside the strip.
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 12, 6),
      new THREE.MeshLambertMaterial({ color: 0xdddddd }),
    );
    pole.position.set(def.x + def.width / 2 + 10, PAD_HEIGHT + 6, def.z - def.length / 2 + 30);
    group.add(pole);
    const sock = new THREE.Mesh(
      new THREE.ConeGeometry(1.4, 6, 8),
      new THREE.MeshLambertMaterial({ color: 0xff7a1a }),
    );
    sock.rotation.z = Math.PI / 2;
    sock.position.set(def.x + def.width / 2 + 13, PAD_HEIGHT + 11.4, def.z - def.length / 2 + 30);
    group.add(sock);
    // A small hangar block so the strip reads as an airfield, not a road.
    const hangar = new THREE.Mesh(
      new THREE.BoxGeometry(20, 8, 14),
      new THREE.MeshLambertMaterial({ color: 0x9aa4a8 }),
    );
    hangar.position.set(def.x - def.width / 2 - 22, PAD_HEIGHT + 4, def.z + def.length / 4);
    group.add(hangar);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(22, 1.6, 16),
      new THREE.MeshLambertMaterial({ color: PALETTE.clinicRoof }),
    );
    roof.position.set(def.x - def.width / 2 - 22, PAD_HEIGHT + 8.6, def.z + def.length / 4);
    group.add(roof);
    return group;
  }

  /** The lighthouse on Gull Rock: banded tower, gallery, and a warm lamp. */
  function buildLighthouse() {
    const group = new THREE.Group();
    const base = terrainHeight(LIGHTHOUSE.x, LIGHTHOUSE.z);
    const white = new THREE.MeshLambertMaterial({ color: PALETTE.lighthouseWhite });
    const red = new THREE.MeshLambertMaterial({ color: PALETTE.lighthouseRed });
    const bands = [white, red, white, red, white];
    for (let i = 0; i < bands.length; i += 1) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(3.4 - i * 0.28, 3.7 - i * 0.28, 5.4, 12), bands[i]);
      seg.position.set(LIGHTHOUSE.x, base + 2.7 + i * 5.4, LIGHTHOUSE.z);
      group.add(seg);
    }
    const gallery = new THREE.Mesh(
      new THREE.CylinderGeometry(4.1, 4.1, 1.1, 12),
      new THREE.MeshLambertMaterial({ color: PALETTE.planeDark }),
    );
    gallery.position.set(LIGHTHOUSE.x, base + 27.6, LIGHTHOUSE.z);
    group.add(gallery);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(1.9, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd97a }),
    );
    lamp.position.set(LIGHTHOUSE.x, base + 29.6, LIGHTHOUSE.z);
    group.add(lamp);
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(3.4, 2.6, 12),
      new THREE.MeshLambertMaterial({ color: PALETTE.planeDark }),
    );
    cap.position.set(LIGHTHOUSE.x, base + 32.4, LIGHTHOUSE.z);
    group.add(cap);
    return group;
  }

  /** The clinic: a white block with a red roof and a red-cross drop pad. */
  function buildClinic() {
    const group = new THREE.Group();
    const base = Math.max(terrainHeight(CLINIC.x, CLINIC.z), PAD_HEIGHT);
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(26, 9, 18),
      new THREE.MeshLambertMaterial({ color: 0xf0ece0 }),
    );
    block.position.set(CLINIC.x, base + 4.5, CLINIC.z);
    group.add(block);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(28, 2, 20),
      new THREE.MeshLambertMaterial({ color: PALETTE.clinicRoof }),
    );
    roof.position.set(CLINIC.x, base + 10, CLINIC.z);
    group.add(roof);
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xd23b2e });
    const vBar = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 11), crossMat);
    vBar.position.set(CLINIC.x + 16, base + 0.4, CLINIC.z);
    group.add(vBar);
    const hBar = new THREE.Mesh(new THREE.BoxGeometry(11, 0.3, 3), crossMat);
    hBar.position.set(CLINIC.x + 16, base + 0.4, CLINIC.z);
    group.add(hBar);
    return group;
  }

  function buildTrees() {
    const count = 900;
    const trunkGeo = new THREE.CylinderGeometry(0.7, 1, 5, 5);
    const crownGeo = new THREE.ConeGeometry(4.4, 14, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.treeTrunk });
    const crownMat = new THREE.MeshLambertMaterial({ color: PALETTE.tree });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let placed = 0;
    let guard = 0;
    while (placed < count && guard < count * 30) {
      guard += 1;
      const island = ISLANDS[rng.int(0, ISLANDS.length - 1)];
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * island.radius * 0.92;
      const x = island.x + Math.cos(a) * r;
      const z = island.z + Math.sin(a) * r;
      const h = terrainHeight(x, z);
      if (h < 3 || h > 120) continue; // not on the beach, not on the bare rock
      if (Math.abs(x - RUNWAY.x) < 70 && Math.abs(z - RUNWAY.z) < RUNWAY.length * 0.75) continue;
      if (Math.abs(x - AIRFIELD.x) < 70 && Math.abs(z - AIRFIELD.z) < AIRFIELD.length * 0.75) continue;
      if (Math.hypot(x - CLINIC.x, z - CLINIC.z) < 46) continue;
      if (Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z) < 30) continue;
      const scale = rng.range(0.8, 1.8);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, Math.PI * 2));
      m.compose(new THREE.Vector3(x, h + 2.2 * scale, z), q, new THREE.Vector3(scale, scale, scale));
      trunks.setMatrixAt(placed, m);
      m.compose(new THREE.Vector3(x, h + 9.5 * scale, z), q, new THREE.Vector3(scale, scale, scale));
      crowns.setMatrixAt(placed, m);
      placed += 1;
    }
    trunks.count = placed;
    crowns.count = placed;
    const group = new THREE.Group();
    group.add(trunks);
    group.add(crowns);
    return group;
  }

  function buildClouds() {
    const group = new THREE.Group();
    // Flat-shaded dusk puffs, warm-lit: spheres squashed only a little, so
    // they read as clouds and not as grey discs floating in the sky.
    const mat = new THREE.MeshStandardMaterial({
      color: 0xf3d9b8, roughness: 1, flatShading: true, transparent: true, opacity: 0.92,
    });
    for (let i = 0; i < 22; i += 1) {
      const cloud = new THREE.Group();
      const puffs = rng.int(3, 5);
      for (let p = 0; p < puffs; p += 1) {
        const s = rng.range(30, 66);
        const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 7, 5), mat);
        puff.scale.y = 0.58;
        puff.position.set(rng.range(-52, 52), rng.range(-5, 8), rng.range(-20, 20));
        cloud.add(puff);
      }
      cloud.position.set(
        rng.range(-WORLD.halfWidth, WORLD.halfWidth),
        rng.range(280, 430),
        rng.range(-WORLD.halfLength, WORLD.halfLength),
      );
      group.add(cloud);
    }
    return group;
  }

  /**
   * A glowing ring the plane flies through. `heading` is the direction of
   * travel through it, so the hoop faces the pilot coming down the route.
   * Optional rings wear the paler gold; the next guide ring pulses green.
   */
  function buildRingMesh(position, kind, heading = 0) {
    const geo = new THREE.TorusGeometry(RING.radius, RING.tube, 10, 40);
    const color = kind === 'next' ? PALETTE.ringNext : kind === 'optional' ? PALETTE.ringOptional : PALETTE.ring;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.rotation.y = heading;
    mesh.userData.kind = kind;
    return mesh;
  }

  /**
   * An airdrop zone drawn as a bullseye on the ground — a faint short wall
   * of light, a bright rim and a centre circle — because the drop score is
   * all about how close to the middle the crate lands.
   */
  function buildDropZone(zone) {
    const group = new THREE.Group();
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(zone.radius, zone.radius, 44, 36, 1, true),
      new THREE.MeshBasicMaterial({
        color: PALETTE.ringNext, transparent: true, opacity: 0.05,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    wall.position.set(zone.x, 22, zone.z);
    group.add(wall);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(zone.radius, 36),
      new THREE.MeshBasicMaterial({ color: PALETTE.ringNext, transparent: true, opacity: 0.08, depthWrite: false }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(zone.x, 3.2, zone.z);
    group.add(disc);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(zone.radius, 1.8, 8, 48),
      new THREE.MeshBasicMaterial({ color: PALETTE.ringNext, transparent: true, opacity: 0.9 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(zone.x, 3.5, zone.z);
    group.add(rim);
    const bull = new THREE.Mesh(
      new THREE.TorusGeometry(zone.radius * 0.38, 1.5, 8, 40),
      new THREE.MeshBasicMaterial({ color: PALETTE.ring, transparent: true, opacity: 0.9 }),
    );
    bull.rotation.x = Math.PI / 2;
    bull.position.set(zone.x, 3.5, zone.z);
    group.add(bull);
    return group;
  }

  return {
    terrainHeight,
    groundHeight,
    buildGround,
    buildSea,
    buildRunwayStrip,
    buildLighthouse,
    buildClinic,
    buildTrees,
    buildClouds,
    buildRingMesh,
    buildDropZone,
  };
}

/** A ring at (x, z) with its centre `alt` metres over the sea. */
function ringAt(x, alt, z) {
  return new THREE.Vector3(x, alt, z);
}


/**
 * Guarantee every hoop clears the ground beneath it by a safe margin: the
 * authored altitudes are wishes, the heightfield has the last word.
 */
function liftRoute(route, seed) {
  const sampler = createTerrain(seed);
  const lift = (pos) => {
    pos.y = Math.max(pos.y, sampler.terrainHeight(pos.x, pos.z) + 42);
    return pos;
  };
  route.guide.forEach(lift);
  route.optional.forEach(lift);
  return route;
}

/**
 * The stage routes, built from the island layout with a little seeded jitter
 * so a seed still changes the day's flying. Guide rings are flown in order;
 * optional rings pay less and can be taken any time before the drop.
 */
export function stageRoute(stageId, seed) {
  const rng = createRandom(seed + 1703);
  const j = (v) => v + rng.range(-14, 14);
  if (stageId === 'stage-2') {
    return liftRoute({
      guide: [
        ringAt(j(-120), 85, -820),
        ringAt(j(180), 120, -260),
        ringAt(j(560), 150, 420),
        ringAt(j(620), 110, 980),
        ringAt(j(430), 80, 1560),
      ],
      optional: [
        ringAt(j(1050), 90, -480),
        ringAt(j(-1250), 80, 1150),
        ringAt(j(1420), 95, 880),
      ],
      drops: [{ x: 240, z: 1560, radius: 210, label: 'Harbour' }],
      landAt: 'harbour',
    }, seed);
  }
  if (stageId === 'stage-3') {
    return liftRoute({
      guide: [
        ringAt(j(-700), 75, -1050),
        ringAt(j(-1080), 85, -520),
        ringAt(j(-350), 120, 60),
        ringAt(j(480), 150, 620),
        ringAt(j(560), 100, 1300),
        ringAt(j(330), 75, 1780),
      ],
      optional: [
        ringAt(j(1080), 95, -420),
        ringAt(j(-1480), 85, 1180),
        ringAt(j(1450), 100, 920),
        ringAt(j(-680), 90, 2680),
      ],
      drops: [
        { x: CLINIC.x, z: CLINIC.z, radius: CLINIC.radius, label: 'Clinic' },
        { x: 240, z: 1560, radius: 210, label: 'Harbour' },
      ],
      landAt: 'home',
    }, seed);
  }
  // Stage 1: the clinic medicine run.
  return liftRoute({
    guide: [
      ringAt(j(-420), 70, -1180),
      ringAt(j(-760), 80, -830),
      ringAt(j(-1010), 85, -560),
      ringAt(j(-900), 80, -140),
    ],
    optional: [
      ringAt(j(60), 90, -980),
      ringAt(j(430), 110, -330),
      ringAt(j(-520), 75, 300),
      ringAt(j(1020), 90, -430),
    ],
    drops: [{ x: CLINIC.x, z: CLINIC.z, radius: CLINIC.radius, label: 'Clinic' }],
    landAt: 'home',
  }, seed);
}
