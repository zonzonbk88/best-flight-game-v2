// The squall: EMBERLINE's living weather. One dark front crosses the whole
// chart during a sortie — it starts beyond the north-east skerries and walks
// south-west at a steady 6.5 m/s, dragging a band of rain, gusts and
// turbulence with it. It is a pure function of the seed and the mission
// clock, so a staged screenshot and a real flight meet the same storm.
// The flight model samples it for drift and shake; the renderer draws its
// rain curtain; the minimap tracks it; the HUD warns about it.

import * as THREE from 'three';

// Direction of travel: from the north-east toward the south-west.
const TRAVEL = new THREE.Vector2(-0.55, -0.83).normalize();
const FRONT_SPEED = 6.5;
const BAND_SIGMA = 240;
const TRAIL_LENGTH = 800;

export function createWeather(seed) {
  // The seed nudges where the front starts, so no two days open alike.
  const uStart = -2450 - (Math.abs(seed) % 5) * 70;

  /** The front's coordinate along its own travel axis at time t. */
  function frontU(t) {
    return uStart + FRONT_SPEED * t;
  }

  /** A point's coordinate along the travel axis. */
  function axisU(x, z) {
    return x * TRAVEL.x + z * TRAVEL.y;
  }

  /**
   * Weather at a point: { intensity 0..1, gust (m/s vector), gustKt }.
   * Intensity peaks on the front line itself, with a trailing skirt of
   * weaker rain behind it (the side the front has already crossed).
   */
  function sample(x, z, t) {
    const d = axisU(x, z) - frontU(t);
    let intensity = 0;
    if (Math.abs(d) < BAND_SIGMA * 3) intensity = Math.exp(-(d * d) / (2 * BAND_SIGMA * BAND_SIGMA));
    if (d < 0 && d > -TRAIL_LENGTH) intensity = Math.max(intensity, 0.42 * (1 + d / TRAIL_LENGTH));
    intensity = Math.max(0, Math.min(1, intensity));
    // Gusts blow along the front's travel, veering a little as they come.
    const gustSpeed = intensity * 7.5;
    const gust = new THREE.Vector3(TRAVEL.x * gustSpeed, 0, TRAVEL.y * gustSpeed);
    return { intensity, gust, gustKt: Math.round(gustSpeed * 1.94384) };
  }

  /** Where the front line sits at time t, for the renderer and the minimap. */
  function bandAt(t) {
    const u = frontU(t);
    return {
      cx: TRAVEL.x * u,
      cz: TRAVEL.y * u,
      dirX: TRAVEL.x,
      dirZ: TRAVEL.y,
      u,
    };
  }

  /** Signed distance from a point to the front line (positive: not reached yet). */
  function distanceToFront(x, z, t) {
    return axisU(x, z) - frontU(t);
  }

  return { sample, bandAt, distanceToFront, frontU, axisU };
}
