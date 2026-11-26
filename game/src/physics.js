// The flight model: one fixed step of a forgiving arcade sim. Speed chases the
// throttle, bank turns the plane, pitch trades speed for height, and below the
// stall speed the wings give up and the plane sinks. Gear and flaps are real
// here: gear down drags, flaps lower the stall and drag more, and a landing
// needs the gear down — a belly arrival is a crash. A gentle NW breeze pushes
// the plane sideways whenever it is airborne. The ground (land or sea) is
// asked every step: a gentle touch on a runway with the gear down is a
// landing, anything else is a crash.

import * as THREE from 'three';
import { AIRFIELD, PLANE, RUNWAY, STEP, WIND, WORLD } from './config.js';

export const EVENT_NONE = 0;
export const EVENT_CRASH = 1;
export const EVENT_LANDED = 2;
export const EVENT_RING = 4;
export const EVENT_FUEL_EMPTY = 8;

/** Height of the plane's origin above the surface when the wheels touch. */
const CONTACT = 1.75;

const GRAVITY = 9.81;
const DEG = Math.PI / 180;
// Wind blows FROM fromDeg, so the drift vector points the opposite way.
const WIND_RAD = ((WIND.fromDeg + 180) % 360) * DEG;
const WIND_MS = WIND.knots * 0.514444;
export const WIND_VECTOR = new THREE.Vector3(-Math.sin(WIND_RAD) * WIND_MS, 0, Math.cos(WIND_RAD) * WIND_MS);

export function createFlight(groundHeight, sampleWeather = null) {
  const state = freshState();

  function freshState() {
    return {
      position: new THREE.Vector3(RUNWAY.x, 3 + CONTACT, RUNWAY.z - RUNWAY.length / 2 + 70),
      heading: 0,
      pitch: 0,
      roll: 0,
      speed: 0,
      throttle: 0,
      fuel: PLANE.startFuel,
      damage: 0,
      verticalSpeed: 0,
      onGround: true,
      landed: false,
      crashed: false,
      gearDown: true,
      flaps: 0,
      deliverQueued: false,
      touchdown: null,
      time: 0,
      distance: 0,
    };
  }

  function reset() {
    const fresh = freshState();
    Object.assign(state, fresh);
    state.position.copy(fresh.position);
  }

  function onRunway(x, z) {
    return (
      (Math.abs(x - RUNWAY.x) < RUNWAY.width / 2 + 4 && Math.abs(z - RUNWAY.z) < RUNWAY.length / 2 + 10) ||
      (Math.abs(x - AIRFIELD.x) < AIRFIELD.width / 2 + 4 && Math.abs(z - AIRFIELD.z) < AIRFIELD.length / 2 + 10)
    );
  }

  /** Which strip the point is over: 'home', 'harbour', or null. */
  function stripAt(x, z) {
    if (Math.abs(x - RUNWAY.x) < RUNWAY.width / 2 + 4 && Math.abs(z - RUNWAY.z) < RUNWAY.length / 2 + 10) return 'home';
    if (Math.abs(x - AIRFIELD.x) < AIRFIELD.width / 2 + 4 && Math.abs(z - AIRFIELD.z) < AIRFIELD.length / 2 + 10) return 'harbour';
    return null;
  }

  function toggleGear() {
    state.gearDown = !state.gearDown;
    return state.gearDown;
  }

  function cycleFlaps() {
    state.flaps = (state.flaps + 1) % (PLANE.flapStages + 1);
    return state.flaps;
  }

  /** The stall speed right now: flaps buy lift, so they buy a lower stall. */
  function stallSpeed() {
    return PLANE.stallSpeed - state.flaps * PLANE.flapStallDropPerStage;
  }

  /**
   * Advance one step. `controls` is { roll, pitch, throttleDelta, brake } in -1..1.
   * Returns EVENT_* flags for the frame.
   */
  function step(controls, dt = STEP) {
    if (state.crashed || state.landed) return EVENT_NONE;
    let events = EVENT_NONE;
    state.time += dt;

    // Throttle: W/S nudge it, brake cuts it fast.
    state.throttle = Math.max(0, Math.min(1, state.throttle + controls.throttleDelta * dt * 0.55));
    if (controls.brake) state.throttle = Math.max(0, state.throttle - dt * 1.4);
    if (state.fuel <= 0 && state.throttle > 0) {
      state.throttle = 0;
      events |= EVENT_FUEL_EMPTY;
    }

    // Fuel burns with throttle; a dry tank means gliding home.
    if (state.throttle > 0 && state.fuel > 0) {
      state.fuel = Math.max(0, state.fuel - (PLANE.fuelBurnPerSecond + PLANE.fuelBurnThrottle * state.throttle) * dt);
    }

    const stall = stallSpeed();
    const stalled = state.speed < stall && !state.onGround;
    const authority = stalled ? 0.35 : 1;

    // Bank toward the stick, then turn at the rate a banked wing gives.
    const targetRoll = controls.roll * PLANE.maxBankDeg * DEG;
    state.roll += (targetRoll - state.roll) * Math.min(1, dt * 3.2);
    const turnRate = (GRAVITY * Math.tan(state.roll)) / Math.max(state.speed, 12);
    state.heading += turnRate * dt * PLANE.turnAuthority * authority;

    // Pitch: the stick sets the target; a slow plane cannot hold it. On the
    // takeoff roll the plane rotates by itself once it has flying speed.
    const rotating = state.onGround && state.speed >= stall + 4;
    const pitchInput = rotating && controls.pitch > -0.5 ? Math.max(controls.pitch, 0.35) : controls.pitch;
    const targetPitch = pitchInput * PLANE.maxPitchDeg * DEG * authority;
    state.pitch += (targetPitch - state.pitch) * Math.min(1, dt * 2.6);

    // Speed chases the throttle setting; drag grows with the square of speed.
    // Gear and flaps shave the top end; on the ground the throttle only taxis.
    const dragLoss = (state.gearDown ? PLANE.gearDragSpeedLoss : 0) + state.flaps * PLANE.flapDragSpeedLossPerStage;
    const targetSpeed = state.onGround
      ? (controls.brake ? 0 : state.throttle * 48)
      : PLANE.minSpeed + state.throttle * (PLANE.maxSpeed - PLANE.minSpeed - dragLoss);
    const drag = controls.brake && state.onGround ? 3.2 : 0.55;
    state.speed += (targetSpeed - state.speed) * Math.min(1, dt * drag);
    if (state.brake && !state.onGround) state.speed = Math.max(PLANE.minSpeed, state.speed - dt * 6);

    // Takeoff roll: the plane stays planted until it has flying speed.
    if (state.onGround && state.speed < stall + 4) {
      state.pitch = 0;
      state.roll = 0;
    }
    if (state.onGround && state.speed >= stall + 4 && state.pitch > 0.02) {
      state.onGround = false;
    }

    // The squall, sampled where the plane is: gusts shove it along the
    // front's travel and turbulence worries at the wings. Airborne only.
    let squall = null;
    if (!state.onGround && sampleWeather) {
      squall = sampleWeather(state.position.x, state.position.z, state.time);
      if (squall.intensity > 0.01) {
        state.roll += Math.sin(state.time * 6.3) * 0.55 * squall.intensity * dt;
        state.pitch += Math.sin(state.time * 5.1 + 1.7) * 0.32 * squall.intensity * dt;
      }
    }

    // Climb from pitch and lift; sink when stalled or dragging the gear.
    const climb = state.speed * Math.sin(state.pitch);
    let sink = stalled ? (stall - state.speed) * 0.55 : 0;
    if (!state.onGround && state.gearDown && state.speed < PLANE.cruiseSpeed) sink += PLANE.gearSinkPenalty * 0.4;
    state.verticalSpeed = climb - sink;
    if (squall && squall.intensity > 0.01) {
      state.verticalSpeed += Math.sin(state.time * 4.3 + 0.6) * 1.5 * squall.intensity;
    }

    const forward = new THREE.Vector3(-Math.sin(state.heading), 0, Math.cos(state.heading));
    const before = state.position.clone();
    state.position.addScaledVector(forward, state.speed * dt);
    state.position.y += state.verticalSpeed * dt;
    // The breeze (and the squall's gust) only push a plane in the air.
    if (!state.onGround) state.position.addScaledVector(WIND_VECTOR, dt);
    if (squall && squall.intensity > 0.01) state.position.addScaledVector(squall.gust, dt);
    state.distance += state.position.distanceTo(before);

    // Stay inside the chart; reflect the heading at the edge.
    if (Math.abs(state.position.x) > WORLD.halfWidth - 40) {
      state.position.x = Math.sign(state.position.x) * (WORLD.halfWidth - 40);
      state.heading = -state.heading;
    }
    if (Math.abs(state.position.z) > WORLD.halfLength - 40) {
      state.position.z = Math.sign(state.position.z) * (WORLD.halfLength - 40);
      state.heading = Math.PI - state.heading;
    }

    // Rollout completion: a plane that touched down on a strip and has
    // slowed to a taxi crawl is landed, even though the contact branch
    // below only runs for airborne planes.
    if (state.onGround && state.touchdown && state.speed < 12 && stripAt(state.position.x, state.position.z)) {
      state.landed = true;
      return EVENT_LANDED;
    }

    // The ground question, asked every step — but only of a plane that is
    // actually airborne: a parked or rolling plane already rests at CONTACT.
    const ground = groundHeight(state.position.x, state.position.z);
    const clearance = state.position.y - ground;
    if (!state.onGround && clearance <= CONTACT) {
      const strip = stripAt(state.position.x, state.position.z);
      const softTouch = state.verticalSpeed > -PLANE.landingMaxSink;
      if (strip && softTouch && state.gearDown) {
        // Touchdown on a strip, gear down: record how good it was, roll out,
        // and stop to finish.
        state.touchdown = {
          strip,
          sink: state.verticalSpeed,
          speed: state.speed,
          x: state.position.x,
          z: state.position.z,
          flaps: state.flaps,
        };
        state.position.y = ground + CONTACT;
        state.onGround = true;
        state.verticalSpeed = 0;
        state.pitch = 0;
        state.roll = 0;
        if (state.speed < 12) {
          state.landed = true;
          return EVENT_LANDED;
        }
      } else {
        // Hard contact, water, or a belly arrival with the gear up: a crash,
        // with damage scaled by how hard the hit was.
        const impact = Math.abs(state.verticalSpeed) + state.speed * 0.35;
        state.damage += Math.max(PLANE.damageOnHardHit, impact * 2.2);
        if (strip && !state.gearDown) state.damage += 30;
        state.crashed = true;
        state.position.y = ground + CONTACT;
        return EVENT_CRASH;
      }
    }
    return events;
  }

  return { state, step, reset, onRunway, stripAt, toggleGear, cycleFlaps, stallSpeed };
}
