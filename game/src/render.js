// Drawing only: the Three.js scene, the chase camera and the sky. The renderer
// owns no rules — it takes the flight state and the mission status and paints
// what is there. The camera trails the plane on a spring, looks ahead of the
// nose, and widens its field of view with speed so fast flight feels fast.

import * as THREE from 'three';
import { AIRFIELD, PALETTE, RING, RUNWAY, WORLD } from './config.js';
import { createAircraft } from './aircraft.js';
import { createTerrain } from './terrain.js';
import { createWeather } from './weather.js';

/** A rain-streak texture, drawn procedurally: slanted slate streaks on clear. */
function rainTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 130; i += 1) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const len = 26 + Math.random() * 46;
    ctx.strokeStyle = `rgba(226, 238, 240, ${0.05 + Math.random() * 0.13})`;
    ctx.lineWidth = 1 + Math.random() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - len * 0.18, y + len);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(7, 1);
  return tex;
}

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const CAMERA_DISTANCE = 13;
const CAMERA_HEIGHT = 4.2;
const CAMERA_SMOOTH = 5.5;

export function createRenderer(canvas, seed) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PALETTE.fog, WORLD.fogNear, WORLD.fogFar);

  // A sky dome with a three-stop gradient shader: deep teal overhead, a
  // petrol shoulder, ember amber at the horizon — the EMBERLINE light.
  const skyGeo = new THREE.SphereGeometry(6800, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyTop) },
      mid: { value: new THREE.Color(PALETTE.skyMid) },
      bottom: { value: new THREE.Color(PALETTE.skyBottom) },
    },
    vertexShader: 'varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'varying vec3 vPos; uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;',
      'void main() {',
      '  float h = normalize(vPos).y;',
      '  vec3 c = h > 0.22 ? mix(mid, top, smoothstep(0.22, 0.75, h)) : mix(bottom, mid, smoothstep(-0.04, 0.22, h));',
      '  gl_FragColor = vec4(c, 1.0);',
      '}',
    ].join('\n'),
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // Last light: a low western sun in ember amber, teal sky-fill from above.
  const hemi = new THREE.HemisphereLight(0x9fc4c9, 0x54482e, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 1.75);
  sun.position.set(-1900, 430, -650);
  scene.add(sun);

  const terrain = createTerrain(seed);
  scene.add(terrain.buildGround());
  scene.add(terrain.buildSea());
  scene.add(terrain.buildRunwayStrip(RUNWAY));
  scene.add(terrain.buildRunwayStrip(AIRFIELD));
  scene.add(terrain.buildLighthouse());
  scene.add(terrain.buildClinic());
  scene.add(terrain.buildTrees());
  const clouds = terrain.buildClouds();
  scene.add(clouds);

  const aircraft = createAircraft();
  scene.add(aircraft.group);

  // The squall's rain curtain: two tall translucent walls on the front line,
  // a darker leading edge and a paler trailing skirt. Shared with the flight
  // model and the HUD through renderer.weather, so all three agree.
  const weather = createWeather(seed);
  const curtainTex = rainTexture();
  function makeCurtain(opacity) {
    const mat = new THREE.MeshBasicMaterial({
      map: curtainTex,
      color: 0x46545e,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: true,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6200, 460), mat);
    mesh.position.y = 230;
    scene.add(mesh);
    return mesh;
  }
  const curtainLead = makeCurtain(0.42);
  const curtainTrail = makeCurtain(0.2);

  // Ring meshes, rebuilt when the mission changes; each keeps its own kind.
  let ringMeshes = [];
  let ringGroup = null;
  let dropGroup = null;

  /** Rings come as { pos, kind } entries; heading faces the route's travel. */
  function setRings(entries, positionsOnly = null) {
    const list = positionsOnly
      ? positionsOnly.map((pos) => ({ pos, kind: 'guide' }))
      : entries;
    if (ringGroup) scene.remove(ringGroup);
    ringGroup = new THREE.Group();
    ringMeshes = list.map((entry, i) => {
      const next = list[i + 1];
      const prev = list[i - 1];
      const ref = next || prev;
      const heading = ref ? Math.atan2(ref.pos.x - entry.pos.x, ref.pos.z - entry.pos.z) : 0;
      const mesh = terrain.buildRingMesh(entry.pos, entry.kind, heading);
      ringGroup.add(mesh);
      return mesh;
    });
    scene.add(ringGroup);
  }

  /** Drop-zone markers for the zones not yet served. */
  function setDropZones(drops) {
    if (dropGroup) scene.remove(dropGroup);
    dropGroup = new THREE.Group();
    for (const d of drops) {
      if (!d.done) dropGroup.add(terrain.buildDropZone(d));
    }
    scene.add(dropGroup);
  }

  // A beacon arrow above the next target so the pilot can find it from afar.
  const beacon = new THREE.Mesh(
    new THREE.ConeGeometry(4, 12, 8),
    new THREE.MeshBasicMaterial({ color: PALETTE.ringNext, transparent: true, opacity: 0.8 }),
  );
  beacon.rotation.x = Math.PI;
  scene.add(beacon);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 12000);
  const cameraTarget = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);

  function placeAircraft(flight) {
    const s = flight.state;
    aircraft.group.position.copy(s.position);
    aircraft.group.rotation.set(0, 0, 0);
    // The model's nose points +Z; the flight model's forward is (-sin h, 0, cos h),
    // so the yaw is the negative of the heading.
    aircraft.group.rotateY(-s.heading);
    aircraft.group.rotateX(-s.pitch);
    aircraft.group.rotateZ(s.roll);
    aircraft.setGear(s.gearDown);
    aircraft.setFlaps(s.flaps);
    aircraft.spinProp(1 / 60, 4 + s.throttle * 40 + s.speed * 0.6);
  }

  function updateCamera(flight, dt) {
    const s = flight.state;
    const forward = new THREE.Vector3(-Math.sin(s.heading), 0, Math.cos(s.heading));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const desired = s.position.clone()
      .addScaledVector(forward, -CAMERA_DISTANCE)
      .addScaledVector(right, s.roll * 4)
      .add(new THREE.Vector3(0, CAMERA_HEIGHT - s.pitch * 6, 0));
    const ground = terrain.groundHeight(desired.x, desired.z);
    desired.y = Math.max(desired.y, ground + 3);
    camera.position.lerp(desired, Math.min(1, dt * CAMERA_SMOOTH));
    lookTarget.copy(s.position).addScaledVector(forward, 26);
    lookTarget.y += 2;
    cameraTarget.lerp(lookTarget, Math.min(1, dt * 7));
    camera.lookAt(cameraTarget);
    const targetFov = 62 + Math.max(0, (s.speed - 40) / 40) * 12;
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
  }

  let time = 0;

  return {
    terrain,
    weather,
    /** Paint one frame for the given flight, mission status and screen. */
    draw(flight, missionStatus, screen, dt) {
      time += dt;
      placeAircraft(flight);
      const s = flight.state;
      if (screen === SCREEN_TITLE) {
        // The title camera sways gently on the east side of the parked
        // plane, looking west into the sunset: the plane sits right of the
        // briefing panel, backlit, wing flags up, sea and hills behind it.
        const angle = Math.PI / 2 + Math.sin(time * 0.1) * 0.3;
        camera.position.set(
          s.position.x + Math.sin(angle) * 26,
          s.position.y + 6.5,
          s.position.z + Math.cos(angle) * 26,
        );
        // Aiming north of the plane pushes it right of the briefing panel.
        camera.lookAt(s.position.x, s.position.y + 0.5, s.position.z + 13);
        camera.fov = 58;
        camera.updateProjectionMatrix();
      } else {
        updateCamera(flight, dt);
      }
      // Rings pulse; the next guide ring bobs and its beacon spins above it.
      for (let i = 0; i < ringMeshes.length; i += 1) {
        const mesh = ringMeshes[i];
        const pulse = 1 + Math.sin(time * 3 + i) * 0.05;
        mesh.scale.setScalar(pulse);
      }
      const targetPos = missionStatus && missionStatus.nextTarget ? missionStatus.nextTarget.pos : null;
      if (targetPos) {
        beacon.visible = true;
        beacon.position.set(targetPos.x, targetPos.y + RING.radius + 26, targetPos.z);
        beacon.rotation.y = time * 2;
        beacon.position.y += Math.sin(time * 2) * 2;
      } else {
        beacon.visible = false;
      }
      // Clouds drift slowly across the chart.
      clouds.position.x = (time * 1.6) % 160;
      clouds.position.z = (time * 0.9) % 120;
      // The squall curtain stands on the front line, facing its own travel.
      const wxT = missionStatus ? missionStatus.elapsed : 0;
      const band = weather.bandAt(wxT);
      const facing = Math.atan2(band.dirX, band.dirZ);
      curtainLead.position.set(band.cx, 230, band.cz);
      curtainLead.rotation.y = facing;
      curtainTrail.position.set(band.cx - band.dirX * 330, 230, band.cz - band.dirZ * 330);
      curtainTrail.rotation.y = facing;
      // The curtain is a 6 km wall: without a distance fade it would hang
      // on the horizon at full strength all sortie. It earns its opacity
      // only as it actually bears down on the camera.
      const frontDist = Math.abs(weather.distanceToFront(camera.position.x, camera.position.z, wxT));
      const fade = Math.max(0.03, Math.min(1, 1.2 - frontDist / 2400));
      curtainLead.material.opacity = 0.42 * fade;
      curtainTrail.material.opacity = 0.2 * fade;
      sky.position.copy(camera.position);
      renderer.render(scene, camera);
    },
    setRings,
    setDropZones,
    resize,
    /**
     * Put the chase camera where the spring would have settled, at once: the
     * screenshot scenes stage the flight synchronously, so the camera has had
     * no frames to catch up and would otherwise start at the origin.
     */
    snapCamera(flight) {
      const s = flight.state;
      const forward = new THREE.Vector3(-Math.sin(s.heading), 0, Math.cos(s.heading));
      const right = new THREE.Vector3(forward.z, 0, -forward.x);
      camera.position.copy(s.position)
        .addScaledVector(forward, -CAMERA_DISTANCE)
        .addScaledVector(right, s.roll * 4)
        .add(new THREE.Vector3(0, CAMERA_HEIGHT - s.pitch * 6, 0));
      const ground = terrain.groundHeight(camera.position.x, camera.position.z);
      camera.position.y = Math.max(camera.position.y, ground + 3);
      cameraTarget.copy(s.position).addScaledVector(forward, 26);
      cameraTarget.y += 2;
      camera.lookAt(cameraTarget);
      camera.fov = 62 + Math.max(0, (s.speed - 40) / 40) * 12;
      camera.updateProjectionMatrix();
    },
  };
}
