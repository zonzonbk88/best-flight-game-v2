// EMBERLINE — every tuning number, colour and stage constant in one place.
// The world is a coastal archipelago: open sea at y = 0, islands rising out of
// it, two airfields, a lighthouse, and three courier stages flown between
// them. All distances in metres, speeds in m/s, headings in radians where the
// nose direction is (-sin h, 0, cos h): heading 0 flies toward +Z ("north" on
// the minimap, which draws +Z up).

export const STEP = 1 / 60;

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const WORLD = {
  halfWidth: 2600,
  halfLength: 3200,
  seaLevel: 0,
  fogNear: 260,
  fogFar: 3400,
};

/**
 * The islands. `radius` is the shoreline radius (where the height falls to
 * sea level); `peak` is the summit height before noise. Runway islands carry
 * a flattened pad, added by the terrain builder from RUNWAY / AIRFIELD.
 */
export const ISLANDS = [
  { id: 'northhaven', name: 'Northhaven', x: -1050, z: -1750, radius: 700, peak: 80 },
  { id: 'clinic', name: 'Clinic Isle', x: -1150, z: -350, radius: 430, peak: 55 },
  { id: 'ridge', name: 'Ridge Island', x: 420, z: 260, radius: 620, peak: 185 },
  { id: 'lighthouse', name: 'Gull Rock', x: 1080, z: -520, radius: 150, peak: 26 },
  { id: 'harbour', name: 'Harbour Island', x: 980, z: 2080, radius: 700, peak: 66 },
  { id: 'east', name: 'East Holm', x: 1500, z: 900, radius: 380, peak: 60 },
  { id: 'west', name: 'West Holm', x: -1500, z: 1250, radius: 340, peak: 48 },
  { id: 'north', name: 'Far Skerry', x: -700, z: 2750, radius: 300, peak: 40 },
];

/** Home runway on Northhaven: centre, heading along +Z, dimensions. */
export const RUNWAY = {
  x: -260,
  z: -1560,
  heading: 0,
  length: 460,
  width: 28,
  name: 'Northhaven',
};

/** Second airfield, on Harbour Island to the north. */
export const AIRFIELD = {
  x: 240,
  z: 1980,
  heading: 0,
  length: 420,
  width: 26,
  name: 'Harbour',
};

/** The lighthouse stands on Gull Rock, east of the stage-1 route. */
export const LIGHTHOUSE = { x: 1080, z: -520 };

/** The clinic: an airdrop zone on Clinic Isle, west of the home island. */
export const CLINIC = { x: -1150, z: -350, radius: 230 };

/** A steady sea breeze for every sortie: from the north-west, gentle. */
export const WIND = {
  fromDeg: 315,
  label: 'NW',
  knots: 3,
};

export const PLANE = {
  cruiseSpeed: 48,
  maxSpeed: 62,
  minSpeed: 18,
  stallSpeed: 22,
  maxBankDeg: 58,
  maxPitchDeg: 26,
  climbRate: 9,
  turnAuthority: 1.0,
  fuelCapacity: 100,
  fuelBurnPerSecond: 0.08,
  fuelBurnThrottle: 0.17,
  damageOnHardHit: 34,
  landingMaxSink: 6,
  landingMaxSpeed: 34,
  startFuel: 100,
  // Landing gear: down adds drag (a slower top end and a touch more sink).
  gearDragSpeedLoss: 7,
  gearSinkPenalty: 0.7,
  // Flaps: each stage adds lift (lower stall) and drag (lower top speed).
  flapStallDropPerStage: 4,
  flapDragSpeedLossPerStage: 5,
  flapStages: 2,
  flapLabels: ['IN', '1/2', 'FULL'],
};

export const RING = {
  radius: 20,
  tube: 1.6,
  guidePoints: 100,
  optionalPoints: 50,
  cleanBonus: 25,
};

/**
 * The three stages. Routes themselves (ring positions, delivery zones) are
 * built in terrain.js from the island layout; this table is the brief the
 * HUD shows and the clock the mission runs against.
 */
export const STAGES = [
  {
    id: 'stage-1',
    key: '1',
    stage: '1/3',
    tag: 'MEDICINE',
    name: 'Deliver clinic medicine',
    short: 'Follow the coastal guide to Clinic Isle, drop the medicine, come home.',
    detail: 'Thread the amber guide hoops along the coast — pale hoops are optional bonuses. Drop the medicine inside the clinic circle (SPACE, low), then bring her home to Northhaven before the light goes.',
    stops: ['Clinic', 'Ridge', 'Home'],
    timeLimit: 420,
  },
  {
    id: 'stage-2',
    key: '2',
    stage: '2/3',
    tag: 'FREIGHT',
    name: 'Harbour freight run',
    short: 'Thread the Ridge Island gates, drop freight at Harbour, land there.',
    detail: 'A longer leg north: guide rings climb around Ridge Island, the freight drops over Harbour town, and the stage ends with a landing on the Harbour strip.',
    stops: ['Ridge', 'Harbour'],
    timeLimit: 480,
  },
  {
    id: 'stage-3',
    key: '3',
    stage: '3/3',
    tag: 'CIRCUIT',
    name: 'The island circuit',
    short: 'Clinic drop, Ridge gates, Harbour drop — then all the way home.',
    detail: 'The full circuit in one tank: medicine to the clinic, gates around the Ridge, freight over Harbour, and a long sea crossing back to a landing at Northhaven.',
    stops: ['Clinic', 'Ridge', 'Harbour', 'Home'],
    timeLimit: 600,
  },
];

// Backwards-compatible name: the title screen and older code say "missions".
export const MISSIONS = STAGES;

/**
 * The EMBERLINE identity: last light over the islands. Deep petrol-teal sky
 * and sea, an ember-amber horizon, dusky olive hills, pale gold beaches.
 * The HUD accent is the same ember amber; the "next" marker is a hot teal
 * that cuts against the warm world. Nothing here is a pale daytime blue.
 */
export const PALETTE = {
  skyTop: 0x10394f,
  skyMid: 0x3d7a86,
  skyBottom: 0xf7a94b,
  fog: 0xdfb287,
  sun: 0xffb36b,
  seaShallow: 0x2f8f83,
  seaMid: 0x14607a,
  seaDeep: 0x0a3247,
  grass: 0x5d7d3c,
  grassDry: 0x8f8a4c,
  hill: 0x77894a,
  rock: 0x7a6a58,
  sand: 0xdcb87e,
  runway: 0x33373d,
  runwayMark: 0xf5eeda,
  planeCream: 0xf5efe2,
  planeRed: 0xc7501f,
  planeDark: 0x23272e,
  ring: 0xffb454,
  ringNext: 0x2fe8c8,
  ringOptional: 0xf3e3bb,
  tree: 0x1f4630,
  treeTrunk: 0x4a3826,
  lighthouseWhite: 0xf4f1e6,
  lighthouseRed: 0xb23a1e,
  clinicRoof: 0x9c4526,
};

export const FONT = '"Avenir Next", "Segoe UI", system-ui, -apple-system, sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'emberline.best';
export const BEST_MISSION_KEY = 'emberline.best-stage';
