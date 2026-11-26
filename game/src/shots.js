// The screenshot scenes behind ?shot=start|play|rings|landing. Each one plays
// the real rules forward from a fresh world, steered by a simple autopilot
// (aim at the next target, work the gear and flaps like a pilot, drop the
// cargo in the clinic circle, come home and land), so the frame is what a
// short game really looks like and the same seed always gives the same frame.

import { RUNWAY, STEP } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 26;
// 56 s, not the 52 s the last hoop is threaded at: capture it at the hoop
// and the hoop's own near arc fills the frame edge like a glitch wall.
const RINGS_SECONDS = 56;

/** Steer toward a point: roll to turn, pitch to hold height, throttle to hold speed. */
function steerToward(flight, aim, wantAlt, targetSpeed) {
  const s = flight.state;
  let wantHeading = Math.atan2(-(aim.x - s.position.x), aim.z - s.position.z);
  let diff = wantHeading - s.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const dist = Math.hypot(aim.x - s.position.x, aim.z - s.position.z);
  const speed = Math.abs(diff) > 0.5 ? Math.min(targetSpeed, 40) : dist < 260 ? Math.min(targetSpeed, 37) : targetSpeed;
  return {
    roll: Math.max(-1, Math.min(1, diff * 1.8 - s.roll * 1.2)),
    pitch: Math.max(-0.7, Math.min(1, (wantAlt - s.position.y) * 0.045)),
    throttleDelta: s.speed < speed - 1 ? 1 : s.speed > speed + 1 ? -1 : 0,
    brake: false,
    headingError: diff,
  };
}

/**
 * Fly the stage's own logic: next guide hoop, then the drop, then home.
 * `prevPoint` tracks where the plane came from so hoops are approached
 * along the route, not orbited.
 */
function autopilotStage(flight, mission, cruise = 50) {
  const s = flight.state;
  const ms = mission.status(0);
  const target = ms.nextTarget;
  // Housekeeping a pilot would do: gear up once she's climbing, and the
  // drop pressed when the zone is underneath and the height is right.
  if (!s.onGround && s.speed > 33 && s.gearDown && target.kind !== 'strip') flight.toggleGear();
  if (target.kind === 'drop') {
    const d = Math.hypot(target.pos.x - s.position.x, target.pos.z - s.position.z);
    if (!s.onGround && d < 120 && s.position.y < 115) s.deliverQueued = true;
    return steerToward(flight, target.pos, 58, 44);
  }
  if (target.kind === 'strip') return autopilotLanding(flight);
  // A hoop: approach along the line from the previous hoop (or the strip).
  const prev = ms.ringIndex > 0 ? ms.allRings[ms.ringIndex - 1] : { x: RUNWAY.x, z: RUNWAY.z - 300 };
  const dirX = target.pos.x - prev.x;
  const dirZ = target.pos.z - prev.z;
  const len = Math.hypot(dirX, dirZ) || 1;
  const behind = { x: target.pos.x - (dirX / len) * 260, z: target.pos.z - (dirZ / len) * 260 };
  const direct = Math.hypot(target.pos.x - s.position.x, target.pos.z - s.position.z);
  const aim = direct < 300 ? target.pos : behind;
  return steerToward(flight, aim, target.pos.y, cruise);
}

/** Final approach: join the strip's axis at a safe height, then glide down it. */
function autopilotLanding(flight) {
  const s = flight.state;
  // Wheels on the strip: stop steering, brake straight to a halt. (Steering
  // past the centre flips the approach side and the "final" turns around on
  // the ground — the one way this autopilot ever crashed a good landing.)
  if (s.touchdown) return { roll: 0, pitch: 0, throttleDelta: -1, brake: true };
  const strip = { x: RUNWAY.x, z: RUNWAY.z };
  const distToStrip = Math.hypot(strip.x - s.position.x, strip.z - s.position.z);
  // Gear and flaps out in good time, like the checklist says.
  if (!s.gearDown && distToStrip < 720) flight.toggleGear();
  if (s.gearDown && distToStrip < 460 && s.flaps < 1) flight.cycleFlaps();
  if (s.gearDown && distToStrip < 300 && s.flaps < 2) flight.cycleFlaps();
  // The approach comes from whichever side of the strip the plane is on:
  // the entry gate sits 880 m out along the axis, over the flattened apron.
  const fromNorth = s.position.z > strip.z;
  const base = fromNorth ? Math.PI : 0;
  const entry = { x: strip.x, z: strip.z + (fromNorth ? 880 : -880) };
  const distToEntry = Math.hypot(entry.x - s.position.x, entry.z - s.position.z);
  const lateral = Math.abs(s.position.x - strip.x);
  const onFinal = distToStrip < 900 && lateral < 170;
  if (!onFinal && distToEntry > 60) {
    // Transit to the gate at a height that clears the island shoulders.
    return steerToward(flight, entry, 104, 46);
  }
  const ground = 3;
  const wantHeading = base + Math.cos(base) * Math.atan2(s.position.x - strip.x, 220);
  const along = Math.max(0, (s.position.z - strip.z) * (fromNorth ? 1 : -1));
  // The glide aims below wheel height at the threshold, so the plane settles
  // onto the strip instead of floating level a metre above it forever.
  const wantAlt = ground + Math.max(0.4, along * 0.07);
  let diff = wantHeading - s.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return {
    roll: Math.max(-1, Math.min(1, diff * 1.6 - s.roll * 0.8)),
    pitch: Math.max(-0.35, Math.min(0.5, (wantAlt - s.position.y) * 0.04)),
    throttleDelta: s.speed < 27 ? 1 : s.speed > 31 ? -1 : 0,
    // Once the wheels are down, brake: the strip is only 460 m long.
    brake: s.onGround,
  };
}

/**
 * Set the flight and mission to the named scene and return the screen to
 * draw. Names: start, play, rings, landing (any other is start).
 */
export function stageShot(name, flight, mission, renderer) {
  flight.reset();
  if (name !== 'play' && name !== 'rings' && name !== 'landing') {
    // Parked on the home strip, engine idling, title screen over the dusk.
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      flight.step({ roll: 0, pitch: 0, throttleDelta: 0, brake: false });
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'landing') {
    // Fly the whole stage — hoops, the clinic drop — then bring her home.
    let seconds = 0;
    while (seconds < 420 && !flight.state.landed && !flight.state.crashed) {
      const controls = autopilotStage(flight, mission, 52);
      flight.step(controls);
      mission.update(flight, 0, STEP);
      seconds += STEP;
      if (flight.state.landed || flight.state.crashed) break;
    }
    const over = flight.state.crashed;
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: mission.score };
  }
  const limit = name === 'rings' ? RINGS_SECONDS : PLAY_SECONDS;
  for (let t = 0; t < limit; t += STEP) {
    flight.step(autopilotStage(flight, mission, name === 'rings' ? 50 : 54));
    mission.update(flight, 0, STEP);
    if (flight.state.crashed || mission.finished) break;
  }
  const over = flight.state.crashed;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: mission.score };
}
