// A small seeded random source so the valley, the rings and every staged screenshot
// are the same for the same seed. Mulberry32: fast, deterministic, good enough for
// terrain noise and scatter.

export function createRandom(seed) {
  let state = (seed >>> 0) || 1;
  function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    /** A float in [0, 1). */
    next,
    /** A float in [min, max). */
    range(min, max) {
      return min + (max - min) * next();
    },
    /** An integer in [min, max] inclusive. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** One of the given values. */
    pick(values) {
      return values[Math.floor(next() * values.length)];
    },
  };
}

/**
 * Smooth value noise in 2D: a hash of integer lattice points, bilinearly
 * interpolated with a smoothstep, so terrain rolls instead of stepping.
 */
export function makeNoise2D(seed) {
  function hash(ix, iz) {
    let h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1;
  }
  function smooth(t) {
    return t * t * (3 - 2 * t);
  }
  return function noise2D(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const a = hash(ix, iz);
    const b = hash(ix + 1, iz);
    const c = hash(ix, iz + 1);
    const d = hash(ix + 1, iz + 1);
    const u = smooth(fx);
    const v = smooth(fz);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v);
  };
}
