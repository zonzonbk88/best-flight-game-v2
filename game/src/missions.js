// Stages: what the sortie is for. A stage owns its route (guide rings in
// order, optional rings any time, one or two airdrop zones), the clock, the
// score and the win condition; the flight model only flies. Scoring follows
// the AEROWAKE habit: every guide ring pays for precision (how close to the
// hoop's centre you crossed), a run of rings with no damage between them
// builds a "clean" streak worth a bonus each, a drop inside the zone pays
// for a low, centred release, and the final landing pays for touching down
// near the threshold, gently, with the flaps out.

import { AIRFIELD, RING, RUNWAY, STAGES } from './config.js';
import { stageRoute } from './terrain.js';

const DROP_POINTS = 300;
const LAND_POINTS = 250;

export function createMission(stageId, seed) {
  const def = STAGES.find((m) => m.id === stageId) || STAGES[0];
  const route = stageRoute(def.id, seed);
  const guide = route.guide;
  const optional = route.optional.map((pos) => ({ pos, taken: false }));
  const drops = route.drops.map((d) => ({ ...d, done: false }));

  let guideIndex = 0;
  let guideHit = 0;
  let optionalHit = 0;
  let dropsDone = 0;
  let score = 0;
  let elapsed = 0;
  let finished = false;
  let finishReason = '';
  let message = '';
  let messageUntil = 0;
  // The feedback line under the score: what the last scoring event paid.
  let feedback = null;
  let feedbackUntil = 0;
  // Clean streak: rings threaded since the last point of damage.
  let cleanStreak = 0;
  let lastDamage = 0;
  let landingPaid = false;

  function announce(text, now, seconds = 3) {
    message = text;
    messageUntil = now + seconds;
  }

  function nextGuide() {
    return guideIndex < guide.length ? guide[guideIndex] : null;
  }

  /** Rings the renderer draws: guide (with the next flagged) + untaken optionals. */
  function ringList() {
    const list = guide.map((pos, i) => ({
      pos,
      kind: i === guideIndex ? 'next' : 'guide',
      index: i,
    }));
    for (const o of optional) {
      if (!o.taken) list.push({ pos: o.pos, kind: 'optional', index: -1 });
    }
    return list;
  }

  /** The next place the pilot should go: guide ring, then drop, then strip. */
  function nextTarget(flight) {
    const g = nextGuide();
    if (g) return { kind: 'ring', pos: g, label: `Guide ${guideIndex + 1}` };
    const drop = drops.find((d) => !d.done);
    if (drop) return { kind: 'drop', pos: { x: drop.x, y: 60, z: drop.z }, label: `${drop.label} drop zone` };
    const strip = route.landAt === 'harbour' ? AIRFIELD : RUNWAY;
    return { kind: 'strip', pos: { x: strip.x, y: 10, z: strip.z }, label: `Land at ${strip.name}` };
  }

  function scoreRing(flight, basePoints, centre, kind) {
    const s = flight.state;
    const offset = s.position.distanceTo(centre);
    const precision = Math.max(0, Math.min(1, 1 - offset / (RING.radius + 4)));
    let gained = Math.round(basePoints * (0.6 + 0.4 * precision));
    // Clean streak: no new damage since the previous ring.
    let cleanBonus = 0;
    if (s.damage <= lastDamage + 0.01) {
      cleanStreak += 1;
      if (cleanStreak >= 2) cleanBonus = RING.cleanBonus;
    } else {
      cleanStreak = 1;
    }
    lastDamage = s.damage;
    gained += cleanBonus;
    score += gained;
    feedback = {
      gained,
      precision: Math.round(precision * 100),
      cleanStreak,
      cleanBonus,
      kind,
    };
    feedbackUntil = elapsed + 5;
    return gained;
  }

  /**
   * Called every step with the flight and the step's EVENT flags.
   * Returns EVENT flags the loop folds in (EVENT_RING on a score).
   */
  function update(flight, events, dt) {
    if (finished) {
      // A finished stage still pays its landing bonus when the wheels stop.
      if (flight.state.landed && !landingPaid) {
        landingPaid = true;
        score += landingScore(flight);
      }
      return 0;
    }
    elapsed += dt;
    let out = 0;
    const s = flight.state;
    const now = elapsed;

    // Guide ring: crossing within the hoop's reach scores it, in order.
    const target = nextGuide();
    if (target && s.position.distanceTo(target) < RING.radius + 4) {
      const gained = scoreRing(flight, RING.guidePoints, target, 'guide');
      guideHit += 1;
      guideIndex += 1;
      announce(`Guide ${guideHit}/${guide.length} — +${gained}`, now, 2.5);
      out |= 4; // EVENT_RING
    }
    // Optional rings: any untaken one, any time before the stage ends.
    for (const o of optional) {
      if (!o.taken && s.position.distanceTo(o.pos) < RING.radius + 4) {
        o.taken = true;
        optionalHit += 1;
        const gained = scoreRing(flight, RING.optionalPoints, o.pos, 'optional');
        announce(`Optional ring — +${gained}`, now, 2.5);
        out |= 4;
        break;
      }
    }

    // The drop: SPACE queued by the pilot, inside the zone and low.
    if (s.deliverQueued) {
      s.deliverQueued = false;
      const drop = drops.find((d) => !d.done);
      if (drop) {
        const dist = Math.hypot(s.position.x - drop.x, s.position.z - drop.z);
        const agl = s.position.y;
        if (!s.onGround && dist < drop.radius && agl < 130) {
          drop.done = true;
          dropsDone += 1;
          const centred = Math.max(0, 1 - dist / drop.radius);
          const gained = Math.round(DROP_POINTS * (0.7 + 0.3 * centred));
          score += gained;
          feedback = { gained, precision: Math.round(centred * 100), cleanStreak, cleanBonus: 0, kind: 'drop' };
          feedbackUntil = now + 5;
          announce(`${drop.label} drop away — +${gained}. ${dropsDone < drops.length ? 'Next drop ahead.' : 'Now land to finish.'}`, now, 4);
          out |= 4;
        } else if (!s.onGround) {
          announce(dist >= drop.radius ? 'Outside the drop zone — fly into the marked circle.' : 'Too high to drop — come down under 130 m.', now, 3);
        }
      }
    }

    // Landing at the right strip after the last drop ends the stage.
    if (s.landed) {
      const strip = flight.stripAt(s.position.x, s.position.z);
      const want = route.landAt;
      const allDropped = dropsDone >= drops.length;
      finished = true;
      if (strip === want && allDropped) {
        const gained = landingScore(flight);
        score += gained;
        landingPaid = true;
        finishReason = `Stage complete — ${def.name.toLowerCase()} delivered, +${gained} for the landing.`;
      } else if (!allDropped) {
        finishReason = 'Wheels down — but the cargo is still aboard. The stage ends here.';
      } else {
        finishReason = `Down at the wrong strip — this stage ends at ${want === 'harbour' ? AIRFIELD.name : RUNWAY.name}.`;
      }
      announce(finishReason, now, 6);
    }
    if (def.timeLimit > 0 && elapsed > def.timeLimit && !finished) {
      finished = true;
      finishReason = 'Out of time — the sortie ends here.';
      announce(finishReason, now, 6);
    }
    return out;
  }

  /** Landing pay: threshold precision, a gentle sink, flaps out, no damage. */
  function landingScore(flight) {
    const td = flight.state.touchdown;
    if (!td) return 0;
    const strip = td.strip === 'harbour' ? AIRFIELD : RUNWAY;
    const along = Math.abs(td.z - (strip.z - strip.length / 2)); // from the near threshold
    const precision = Math.max(0, 1 - along / strip.length);
    const gentle = Math.max(0, 1 - Math.abs(td.sink) / 6);
    let gained = Math.round(LAND_POINTS * (0.45 * precision + 0.35 * gentle + 0.2 * (td.flaps > 0 ? 1 : 0.4)));
    feedback = { gained, precision: Math.round(precision * 100), cleanStreak, cleanBonus: 0, kind: 'landing' };
    feedbackUntil = elapsed + 8;
    return gained;
  }

  function status(now) {
    const target = nextTarget(null);
    return {
      mission: def,
      score,
      ringsHit: guideHit,
      ringsTotal: guide.length,
      ringIndex: guideIndex,
      optionalHit,
      optionalTotal: optional.length,
      dropsDone,
      dropsTotal: drops.length,
      elapsed,
      timeLeft: def.timeLimit > 0 ? Math.max(0, def.timeLimit - elapsed) : null,
      finished,
      finishReason,
      message: now < messageUntil ? message : '',
      feedback: now < feedbackUntil ? feedback : null,
      nextRing: nextGuide(),
      nextTarget: target,
      allRings: ringList().map((r) => r.pos),
      ringList: ringList(),
      drops: drops.map((d) => ({ ...d })),
      landAt: route.landAt,
      cleanStreak,
    };
  }

  return {
    def,
    update,
    status,
    announce,
    get score() {
      return score;
    },
    get ringsHit() {
      return guideHit;
    },
    get finished() {
      return finished;
    },
    get finishReason() {
      return finishReason;
    },
  };
}
