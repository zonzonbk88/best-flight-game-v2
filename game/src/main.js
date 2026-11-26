// Boot and the one loop: input is read every frame, the flight advances in
// fixed 1/60 s steps, and the renderer paints what is there. The game moves
// between four screens: title, play, paused and over. Stages are picked on
// the title screen (click or keys 1–3) and a sortie ends on a crash, a
// landing or the clock. G works the gear, F the flaps, SPACE queues a cargo
// drop, and the squall walks across the chart the whole time.
//
// ?seed=N fixes the islands and the routes. ?shot=start|play|rings|landing
// (with &seed=N) stages that scene instead of running the loop, paints it a
// few times and sets window.__shotReady for a screenshot.

import { BEST_KEY, BEST_MISSION_KEY, STAGES, STEP } from './config.js';
import { createAudio } from './audio.js';
import { createFlight, EVENT_CRASH, EVENT_LANDED, EVENT_RING } from './physics.js';
import { createMission } from './missions.js';
import {
  ACTION_CONFIRM,
  ACTION_DELIVER,
  ACTION_FLAPS,
  ACTION_GEAR,
  ACTION_MISSION_1,
  ACTION_MISSION_2,
  ACTION_MISSION_3,
  ACTION_MUTE,
  ACTION_PAUSE,
  ACTION_RESTART,
  createInput,
} from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createHud, endScreenHtml, pauseScreenHtml, titleScreenHtml } from './hud.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const hudRoot = document.getElementById('hud-root');

const renderer = createRenderer(canvas, seed);
const weather = renderer.weather;
const flight = createFlight(renderer.terrain.groundHeight, weather.sample);
const audio = createAudio();
const hud = createHud(hudRoot);

let mission = createMission('stage-1', seed);
let screen = SCREEN_TITLE;
let best = readBest();
let bestMission = readBestMission();
let ringSyncKey = '';

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function readBestMission() {
  try {
    return window.localStorage.getItem(BEST_MISSION_KEY) || '';
  } catch {
    return '';
  }
}

function saveBest(value, missionName) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
    window.localStorage.setItem(BEST_MISSION_KEY, missionName);
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

/** Weather + chart facts the HUD shows beside the flight numbers. */
function hudExtra() {
  const s = flight.state;
  const elapsed = mission.status(0).elapsed;
  const sample = weather.sample(s.position.x, s.position.z, elapsed);
  return {
    agl: s.position.y - renderer.terrain.groundHeight(s.position.x, s.position.z),
    weather: {
      intensity: sample.intensity,
      gustKt: sample.gustKt,
      frontDist: weather.distanceToFront(s.position.x, s.position.z, elapsed),
    },
    band: weather.bandAt(elapsed),
    best,
  };
}

/** Rebuild the ring/drop-zone meshes when the mission's picture changes. */
function syncScenery(missionStatus) {
  const key = `${missionStatus.ringIndex}|${missionStatus.optionalHit}|${missionStatus.dropsDone}`;
  if (key === ringSyncKey) return;
  ringSyncKey = key;
  renderer.setRings(missionStatus.ringList);
  renderer.setDropZones(missionStatus.drops);
}

function applyMission(stageId) {
  mission = createMission(stageId, seed);
  ringSyncKey = '';
  syncScenery(mission.status(0));
}

function showTitle() {
  screen = SCREEN_TITLE;
  hud.setVisible(false);
  hud.setTitleMode(true);
  hud.screen(titleScreenHtml(best, bestMission));
  status.textContent = 'EMBERLINE. Pick a stage to fly.';
  // Stage cards are buttons in the overlay: clicking one starts that sortie.
  hudRoot.querySelectorAll('.mission-card').forEach((card) => {
    card.addEventListener('click', () => {
      audio.unlock();
      startSortie(card.dataset.mission);
    });
  });
}

function startSortie(stageId) {
  applyMission(stageId);
  flight.reset();
  audio.unlock();
  hud.setTitleMode(false);
  hud.clearScreen();
  hud.setVisible(true);
  screen = SCREEN_PLAY;
  status.textContent = `Flying ${mission.def.name}.`;
}

function endSortie(title, lines) {
  screen = SCREEN_OVER;
  if (mission.score > best) {
    best = mission.score;
    bestMission = mission.def.name;
    saveBest(best, bestMission);
  }
  hud.screen(endScreenHtml(title, lines, mission.score, best));
  status.textContent = `${title}. Score ${mission.score}. Best ${best}.`;
}

function runShot(name) {
  applyMission('stage-1');
  const staged = stageShot(name, flight, mission, renderer);
  const missionStatus = mission.status(performance.now() / 1000);
  syncScenery(missionStatus);
  if (staged.screen === SCREEN_TITLE) {
    hud.setVisible(false);
    hud.setTitleMode(true);
    hud.screen(titleScreenHtml(0, ''));
  } else {
    hud.setVisible(true);
    hud.setTitleMode(false);
    hud.clearScreen();
    hud.update(flight, missionStatus, performance.now() / 1000, hudExtra());
  }
  let painted = 0;
  function paint() {
    renderer.draw(flight, mission.status(performance.now() / 1000), staged.screen, STEP);
    painted += 1;
    if (painted < 5) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  if (staged.screen !== SCREEN_TITLE) renderer.snapCamera(flight);
  window.__shotState = {
    screen: staged.screen,
    crashed: flight.state.crashed,
    landed: flight.state.landed,
    score: mission.score,
    rings: mission.ringsHit,
    damage: Math.round(flight.state.damage),
    fuel: Math.round(flight.state.fuel),
    gearDown: flight.state.gearDown,
    flaps: flight.state.flaps,
    x: Math.round(flight.state.position.x),
    y: Math.round(flight.state.position.y),
    z: Math.round(flight.state.position.z),
    heading: Math.round(((flight.state.heading * 180) / Math.PI % 360 + 360) % 360),
    elapsed: Math.round(mission.status(0).elapsed),
  };
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let accumulator = 0;
  let last = performance.now();
  let wasWarned = false;

  // A read-only snapshot for the play-test driver (and for anyone poking at
  // the game in devtools): screen, flight numbers and stage progress.
  window.__emberline = {
    snapshot() {
      const s = flight.state;
      const ms = mission.status(0);
      return {
        screen,
        stage: mission.def.id,
        speed: Math.round(s.speed * 10) / 10,
        alt: Math.round(s.position.y),
        fuel: Math.round(s.fuel),
        score: mission.score,
        guide: ms.ringsHit,
        optional: ms.optionalHit,
        drops: ms.dropsDone,
        x: Math.round(s.position.x),
        z: Math.round(s.position.z),
        heading: Math.round(((s.heading * 180) / Math.PI % 360 + 360) % 360),
        throttle: Math.round(s.throttle * 100) / 100,
        gearDown: s.gearDown,
        flaps: s.flaps,
        onGround: s.onGround,
        crashed: s.crashed,
        landed: s.landed,
      };
    },
  };

  showTitle();

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      status.textContent = muted ? 'Sound muted.' : 'Sound on.';
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_MISSION_1) startSortie(STAGES[0].id);
      else if (actions & ACTION_MISSION_2) startSortie(STAGES[1].id);
      else if (actions & ACTION_MISSION_3) startSortie(STAGES[2].id);
      else if (actions & (ACTION_CONFIRM | ACTION_DELIVER)) startSortie('stage-1');
      return;
    }
    if (screen === SCREEN_OVER) {
      if (actions & ACTION_MISSION_1) startSortie(STAGES[0].id);
      else if (actions & ACTION_MISSION_2) startSortie(STAGES[1].id);
      else if (actions & ACTION_MISSION_3) startSortie(STAGES[2].id);
      else if (actions & (ACTION_CONFIRM | ACTION_DELIVER)) startSortie(mission.def.id);
      return;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      hud.screen(pauseScreenHtml(mission.def.name, mission.score));
      status.textContent = 'Paused.';
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      hud.clearScreen();
      status.textContent = 'Playing.';
    } else if (actions & ACTION_RESTART && screen === SCREEN_PLAY) {
      startSortie(mission.def.id);
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_GEAR) {
        const down = flight.toggleGear();
        status.textContent = down ? 'Gear down.' : 'Gear up.';
      }
      if (actions & ACTION_FLAPS) {
        flight.cycleFlaps();
        status.textContent = 'Flaps cycled.';
      }
      if (actions & ACTION_DELIVER) {
        flight.state.deliverQueued = true;
      }
    }
  }

  function step() {
    if (screen !== SCREEN_PLAY) return;
    const controls = input.readControls();
    const events = flight.step(controls);
    const missionEvents = mission.update(flight, events, STEP);
    if (events & EVENT_RING || missionEvents & EVENT_RING) audio.ringChime();
    if (events & EVENT_CRASH) {
      audio.crashThud();
      endSortie('CRASHED', [
        mission.finishReason || 'The islands win this round.',
        `You threaded ${mission.ringsHit} guide hoop${mission.ringsHit === 1 ? '' : 's'} before the ground caught you.`,
      ]);
    } else if (events & EVENT_LANDED) {
      audio.landingBeep();
      endSortie(mission.finished ? 'STAGE COMPLETE' : 'LANDED', [
        mission.finishReason || 'Wheels down, engine off.',
        `Guide hoops: ${mission.ringsHit}. Score ${mission.score}.`,
      ]);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const missionStatus = mission.status(now / 1000);
    syncScenery(missionStatus);
    renderer.draw(flight, missionStatus, screen, STEP);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
      const warn = hud.update(flight, missionStatus, now / 1000, hudExtra());
      if (warn === 'warn' && !wasWarned) {
        audio.warningBeep();
        wasWarned = true;
      } else if (!warn) {
        wasWarned = false;
      }
      audio.update(flight.state.throttle, flight.state.speed, !flight.state.onGround);
    }
  }

  // Leaving the tab pauses a running sortie rather than letting fuel burn unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      hud.screen(pauseScreenHtml(mission.def.name, mission.score));
      status.textContent = 'Paused.';
    }
  });

  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
