// The HUD: DOM instruments over the 3D view, in EMBERLINE's own language —
// charcoal-teal glass panels with cut corners, ember-amber accents, letterspaced
// small-caps labels and big light numerals. Top-left is the brand and the
// mission panel; top-centre the heading with a compass tape; bottom-left the
// airspeed and altitude with an attitude disc; bottom-centre the power, fuel
// and airframe bars with the GEAR and FLAPS boxes and the weather line;
// bottom-right the chart minimap with the route, the plane and the squall.

import { AIRFIELD, ISLANDS, PLANE, RUNWAY, STAGES, WIND } from './config.js';

const KNOTS_PER_MS = 1.94384;

function compassPoint(headingDeg) {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return points[Math.round(headingDeg / 45) % 8];
}

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function createHud(root) {
  root.innerHTML = `
    <div id="hud" class="hud">
      <div class="hud-topleft">
        <div class="brand"><span class="brand-mark">◆</span> EMBERLINE
          <div class="brand-sub">Island courier service</div>
        </div>
        <div class="panel mission-panel">
          <div class="mp-head"><span id="mp-stage">STAGE 1/3 · MEDICINE</span><span id="mp-timer">07:00</span></div>
          <div id="mp-title" class="mp-title">Deliver clinic medicine</div>
          <div id="mp-detail" class="mp-detail"></div>
          <div id="mp-progress" class="mp-progress"></div>
          <div id="mp-stops" class="mp-stops"></div>
          <div class="mp-nextrow"><span id="mp-next"></span><span id="mp-nextdist"></span></div>
          <div class="mp-scorerow"><span class="mp-score">SCORE <b id="mp-score">0</b></span><span id="mp-best" class="mp-best"></span></div>
          <div id="mp-target" class="mp-target"></div>
          <div id="mp-feedback" class="mp-feedback"></div>
        </div>
      </div>
      <div class="hud-topcenter">
        <div class="hdg-label">HEADING</div>
        <div class="hdg-big"><span id="hdg-num">000</span><span class="hdg-card" id="hdg-card">N</span></div>
        <canvas id="hud-tape" width="300" height="40"></canvas>
      </div>
      <div class="hud-topright">
        <span class="chip">Briefing <b>H</b></span>
        <span class="chip">Sound <b>M</b></span>
        <span class="chip">Pause <b>P</b></span>
      </div>
      <div class="hud-bottomleft">
        <div class="inst">
          <div class="inst-label">AIRSPEED <span class="inst-unit">KT</span></div>
          <div class="inst-big" id="inst-speed">0</div>
          <div class="inst-sub" id="inst-phase">ON GROUND</div>
        </div>
        <div class="att">
          <canvas id="hud-att" width="96" height="96"></canvas>
          <div class="vs-chip" id="inst-vs">+0.0 m/s</div>
        </div>
        <div class="inst">
          <div class="inst-label">ALTITUDE <span class="inst-unit">M</span></div>
          <div class="inst-big" id="inst-alt">0</div>
          <div class="inst-sub" id="inst-agl">0 AGL</div>
        </div>
      </div>
      <div class="hud-bottomcenter">
       <div class="bc-top">
        <div class="bars">
          <div class="bar-row"><span class="bar-label">POWER</span><div class="bar"><div id="bar-power" class="bar-fill power"></div></div><span class="bar-num" id="num-power">0%</span></div>
          <div class="bar-row"><span class="bar-label">FUEL</span><div class="bar"><div id="bar-fuel" class="bar-fill fuel"></div></div><span class="bar-num" id="num-fuel">100%</span></div>
          <div class="bar-row"><span class="bar-label">AIRFRAME</span><div class="bar"><div id="bar-frame" class="bar-fill frame"></div></div><span class="bar-num" id="num-frame">100%</span></div>
        </div>
        <div class="boxes">
          <div class="gbox" id="box-gear"><div class="gbox-head">GEAR <b>G</b></div><div class="gbox-state" id="gear-state">DOWN</div></div>
          <div class="gbox" id="box-flaps"><div class="gbox-head">FLAPS <b>F</b></div><div class="gbox-state" id="flaps-state">IN</div></div>
        </div>
       </div>
        <div class="wx-line" id="wx-line">WIND NW 03 KT</div>
        <div class="plane-name">EL-2 SPARROW · ISLAND COURIER</div>
      </div>
      <div class="hud-bottomright">
        <div class="map-head"><span>ISLAND CHART</span><span>6 KM</span></div>
        <canvas id="hud-map" width="208" height="164"></canvas>
      </div>
      <div class="hud-hints-left">↑↓ CLIMB / DESCEND &nbsp;·&nbsp; ←→ BANK &nbsp;·&nbsp; W S POWER</div>
      <div class="hud-hints-right">HOLD + DRAG TO FLY · WHEEL FOR POWER · <b>SPACE</b> DELIVER · <b>B</b> BRAKE</div>
      <div id="hud-message" class="hud-message"></div>
      <div id="hud-warn" class="hud-warn"></div>
      <div class="hud-crosshair">+</div>
    </div>
    <div id="hud-screen" class="hud-screen"></div>`;

  const el = (id) => root.querySelector(`#${id}`);
  const tape = el('hud-tape');
  const tctx = tape.getContext('2d');
  const att = el('hud-att');
  const actx = att.getContext('2d');
  const map = el('hud-map');
  const mctx = map.getContext('2d');

  function drawTape(headingDeg) {
    const w = tape.width;
    const h = tape.height;
    tctx.clearRect(0, 0, w, h);
    const pxPerDeg = 2.4;
    const cx = w / 2;
    tctx.strokeStyle = 'rgba(253,246,236,0.75)';
    tctx.fillStyle = 'rgba(253,246,236,0.85)';
    tctx.lineWidth = 1;
    tctx.font = '10px "Segoe UI", system-ui, sans-serif';
    tctx.textAlign = 'center';
    for (let d = -60; d <= 60; d += 5) {
      const deg = ((Math.round(headingDeg + d) % 360) + 360) % 360;
      const x = cx + d * pxPerDeg;
      const major = deg % 45 === 0;
      const mid = deg % 15 === 0;
      const len = major ? 13 : mid ? 9 : 5;
      tctx.beginPath();
      tctx.moveTo(x, h - 14);
      tctx.lineTo(x, h - 14 - len);
      tctx.stroke();
      if (major) tctx.fillText(compassPoint(deg), x, 12);
      else if (deg % 30 === 0) tctx.fillText(String(deg).padStart(3, '0'), x, 12);
    }
    // The lubber line: an amber caret at the centre.
    tctx.fillStyle = '#ffb454';
    tctx.beginPath();
    tctx.moveTo(cx - 6, h - 12);
    tctx.lineTo(cx + 6, h - 12);
    tctx.lineTo(cx, h - 3);
    tctx.closePath();
    tctx.fill();
  }

  function drawAttitude(roll, pitch) {
    const w = att.width;
    const cx = w / 2;
    const cy = w / 2;
    const r = 44;
    actx.clearRect(0, 0, w, w);
    actx.save();
    actx.beginPath();
    actx.arc(cx, cy, r, 0, Math.PI * 2);
    actx.clip();
    actx.translate(cx, cy);
    actx.rotate(-roll);
    const pitchPx = Math.max(-34, Math.min(34, pitch * 52));
    actx.fillStyle = '#3d7a86';
    actx.fillRect(-r - 4, -r - 4 + pitchPx, (r + 4) * 2, r + 4);
    actx.fillStyle = '#6b543a';
    actx.fillRect(-r - 4, pitchPx, (r + 4) * 2, r + 4);
    actx.strokeStyle = '#fdf6ec';
    actx.lineWidth = 1.6;
    actx.beginPath();
    actx.moveTo(-r, pitchPx);
    actx.lineTo(r, pitchPx);
    actx.stroke();
    actx.restore();
    // Fixed aircraft symbol + bezel.
    actx.strokeStyle = '#ffb454';
    actx.lineWidth = 2.4;
    actx.beginPath();
    actx.moveTo(cx - 24, cy);
    actx.lineTo(cx - 7, cy);
    actx.lineTo(cx - 7, cy + 5);
    actx.moveTo(cx + 24, cy);
    actx.lineTo(cx + 7, cy);
    actx.lineTo(cx + 7, cy + 5);
    actx.stroke();
    actx.fillStyle = '#ffb454';
    actx.beginPath();
    actx.arc(cx, cy, 2.4, 0, Math.PI * 2);
    actx.fill();
    actx.strokeStyle = 'rgba(253,246,236,0.55)';
    actx.lineWidth = 1;
    actx.beginPath();
    actx.arc(cx, cy, r, 0, Math.PI * 2);
    actx.stroke();
  }

  // World → minimap: the chart is 5.2 × 6.4 km; north (+Z) is up.
  const MAP_SCALE = Math.min(map.width / 5400, map.height / 6600);
  function mapX(x) {
    return map.width / 2 + x * MAP_SCALE;
  }
  function mapY(z) {
    return map.height / 2 - z * MAP_SCALE;
  }

  function drawMap(flight, ms, band) {
    const w = map.width;
    const h = map.height;
    mctx.clearRect(0, 0, w, h);
    mctx.fillStyle = '#0c2a33';
    mctx.fillRect(0, 0, w, h);
    // The squall band: a slate swathe across the chart, hatched at its edge.
    if (band) {
      mctx.save();
      mctx.translate(mapX(band.cx), mapY(band.cz));
      mctx.rotate(Math.atan2(band.dirX, band.dirZ));
      mctx.fillStyle = 'rgba(120, 140, 150, 0.30)';
      mctx.fillRect(-w, -16, w * 2, 32);
      mctx.fillStyle = 'rgba(190, 205, 210, 0.5)';
      mctx.fillRect(-w, -1.5, w * 2, 3);
      mctx.restore();
    }
    // Islands as soft blobs: a sand rim first, then the green on top.
    for (const island of ISLANDS) {
      mctx.fillStyle = 'rgba(220, 184, 126, 0.85)';
      mctx.beginPath();
      mctx.ellipse(mapX(island.x), mapY(island.z), island.radius * 1.38 * MAP_SCALE, island.radius * 1.38 * MAP_SCALE, 0, 0, Math.PI * 2);
      mctx.fill();
      mctx.fillStyle = '#476b3a';
      mctx.beginPath();
      mctx.ellipse(mapX(island.x), mapY(island.z), island.radius * 1.22 * MAP_SCALE, island.radius * 1.22 * MAP_SCALE, 0, 0, Math.PI * 2);
      mctx.fill();
    }
    // Strips.
    mctx.strokeStyle = '#fdf6ec';
    mctx.lineWidth = 2;
    for (const strip of [RUNWAY, AIRFIELD]) {
      mctx.beginPath();
      mctx.moveTo(mapX(strip.x), mapY(strip.z - strip.length / 2));
      mctx.lineTo(mapX(strip.x), mapY(strip.z + strip.length / 2));
      mctx.stroke();
    }
    // Route: guide hoops joined in order, optionals as pale dots.
    const list = ms.ringList || [];
    mctx.strokeStyle = 'rgba(255, 180, 84, 0.9)';
    mctx.lineWidth = 1;
    mctx.beginPath();
    let started = false;
    for (const r of list) {
      if (r.kind === 'optional') continue;
      const x = mapX(r.pos.x);
      const y = mapY(r.pos.z);
      if (!started) {
        mctx.moveTo(x, y);
        started = true;
      } else mctx.lineTo(x, y);
    }
    mctx.stroke();
    for (const r of list) {
      mctx.fillStyle = r.kind === 'next' ? '#2fe8c8' : r.kind === 'optional' ? '#f3e3bb' : '#ffb454';
      mctx.beginPath();
      mctx.arc(mapX(r.pos.x), mapY(r.pos.z), r.kind === 'next' ? 3.4 : 2.4, 0, Math.PI * 2);
      mctx.fill();
    }
    // Drop zones still to serve.
    for (const d of ms.drops || []) {
      if (d.done) continue;
      mctx.strokeStyle = '#2fe8c8';
      mctx.lineWidth = 1.4;
      mctx.beginPath();
      mctx.arc(mapX(d.x), mapY(d.z), d.radius * MAP_SCALE, 0, Math.PI * 2);
      mctx.stroke();
    }
    // The plane: a warm triangle pointing where the nose points.
    const s = flight.state;
    mctx.save();
    mctx.translate(mapX(s.position.x), mapY(s.position.z));
    mctx.rotate(-s.heading);
    mctx.fillStyle = '#fdf6ec';
    mctx.beginPath();
    mctx.moveTo(0, -6);
    mctx.lineTo(4.4, 5);
    mctx.lineTo(0, 2.6);
    mctx.lineTo(-4.4, 5);
    mctx.closePath();
    mctx.fill();
    mctx.restore();
  }

  let lastWarn = '';

  return {
    /** Refresh every readout from the flight, mission status and weather. */
    update(flight, ms, now, extra = {}) {
      const s = flight.state;
      const knots = Math.round(s.speed * KNOTS_PER_MS);
      const hdg = ((s.heading * 180) / Math.PI % 360 + 360) % 360;
      // Mission panel.
      el('mp-stage').textContent = `STAGE ${ms.mission.stage} · ${ms.mission.tag}`;
      el('mp-timer').textContent = ms.timeLeft === null ? '--:--' : formatTime(ms.timeLeft);
      el('mp-title').textContent = ms.mission.name;
      el('mp-detail').textContent = ms.mission.detail;
      el('mp-progress').textContent = `Guide passed ${ms.ringsHit}/${ms.ringsTotal} · Optional hits ${ms.optionalHit}/${ms.optionalTotal} · Drops ${ms.dropsDone}/${ms.dropsTotal}`;
      el('mp-stops').innerHTML = ms.mission.stops.map((stop, i) => {
        const done = i < ms.dropsDone || (ms.finished && i <= ms.dropsDone);
        return `<span class="mp-stop${done ? ' done' : ''}">${stop}</span>`;
      }).join('<span class="mp-sep">—</span>');
      const target = ms.nextTarget;
      if (ms.finished) {
        el('mp-next').textContent = ms.finishReason;
        el('mp-nextdist').textContent = '';
      } else if (target) {
        el('mp-next').textContent = target.kind === 'ring' ? `Next: ${target.label}` : target.kind === 'drop' ? `Drop at ${target.label} — SPACE in the circle` : target.label;
        const d = Math.hypot(target.pos.x - s.position.x, target.pos.z - s.position.z);
        el('mp-nextdist').textContent = d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`;
      }
      el('mp-score').textContent = String(ms.score);
      const best = extra.best || 0;
      el('mp-best').textContent = best > 0 ? `LOCAL BEST ${best}` : '';
      el('mp-target').textContent = best > 0 ? `Next score target: ${best + 1}` : 'No flights logged yet — set the mark.';
      const fb = ms.feedback;
      el('mp-feedback').textContent = fb
        ? `+${fb.gained} · ${fb.precision}% precision${fb.cleanBonus ? ` · clean ${fb.cleanStreak} (+${fb.cleanBonus})` : fb.cleanStreak > 1 ? ` · clean ${fb.cleanStreak}` : ''}`
        : '';
      // Heading + tape.
      el('hdg-num').textContent = String(Math.round(hdg)).padStart(3, '0');
      el('hdg-card').textContent = compassPoint(hdg);
      drawTape(hdg);
      // Instruments.
      el('inst-speed').textContent = String(knots);
      el('inst-alt').textContent = String(Math.max(0, Math.round(s.position.y)));
      el('inst-agl').textContent = `${Math.max(0, Math.round(extra.agl ?? s.position.y))} AGL`;
      el('inst-vs').textContent = `${s.verticalSpeed >= 0 ? '+' : ''}${s.verticalSpeed.toFixed(1)} m/s`;
      el('inst-phase').textContent = s.onGround
        ? (s.speed > 4 ? 'TAKEOFF ROLL' : 'ON GROUND')
        : s.verticalSpeed > 2.5 ? 'CLIMB' : s.verticalSpeed < -2.5 ? 'DESCENT' : s.speed < 30 ? 'APPROACH' : 'CRUISE';
      drawAttitude(s.roll, s.pitch);
      // Bars + boxes.
      el('bar-power').style.width = `${Math.round(s.throttle * 100)}%`;
      el('num-power').textContent = `${Math.round(s.throttle * 100)}%`;
      const fuelPct = Math.round(s.fuel);
      const fuelBar = el('bar-fuel');
      fuelBar.style.width = `${fuelPct}%`;
      fuelBar.classList.toggle('low', fuelPct < 25);
      el('num-fuel').textContent = `${fuelPct}%`;
      const framePct = Math.max(0, 100 - Math.round(s.damage));
      el('bar-frame').style.width = `${framePct}%`;
      el('num-frame').textContent = `${framePct}%`;
      el('gear-state').textContent = s.gearDown ? 'DOWN' : 'UP';
      el('box-gear').classList.toggle('warn-state', !s.gearDown && !s.onGround && (extra.agl ?? 99) < 60);
      el('flaps-state').textContent = PLANE.flapLabels[s.flaps];
      // Weather line: the squall outranks the breeze when it is close.
      const wx = extra.weather;
      const wxLine = el('wx-line');
      if (wx && wx.intensity > 0.04) {
        wxLine.textContent = `SQUALL — GUSTS ${wx.gustKt} KT`;
        wxLine.classList.add('storm');
      } else if (wx && wx.frontDist > 0 && wx.frontDist < 2600) {
        wxLine.textContent = `SQUALL ${(wx.frontDist / 1000).toFixed(1)} KM OUT · WIND ${WIND.label} 0${WIND.knots} KT`;
        wxLine.classList.remove('storm');
      } else {
        wxLine.textContent = `WIND ${WIND.label} 0${WIND.knots} KT`;
        wxLine.classList.remove('storm');
      }
      drawMap(flight, ms, extra.band);
      el('hud-message').textContent = ms.message;
      // Warnings: low fuel, stall, terrain, gear. One beep each change.
      let warn = '';
      if (!s.onGround && !s.gearDown && (extra.agl ?? 99) < 45) warn = 'GEAR UP — LOWER THE GEAR TO LAND';
      else if (s.fuel > 0 && s.fuel < 20) warn = 'LOW FUEL';
      else if (!s.onGround && s.speed < PLANE.stallSpeed - s.flaps * PLANE.flapStallDropPerStage) warn = 'STALL — NOSE DOWN, POWER UP';
      else if (!s.onGround && s.verticalSpeed < -8) warn = 'TERRAIN — PULL UP';
      if (warn !== lastWarn) {
        lastWarn = warn;
        el('hud-warn').textContent = warn;
        if (warn) return 'warn';
      }
      return null;
    },
    /** Show or hide the whole HUD (hidden on the title screen's backdrop). */
    setVisible(visible) {
      el('hud').style.display = visible ? '' : 'none';
    },
    /** The overlay the title / pause / end screens write into. */
    screen(html) {
      el('hud-screen').innerHTML = html;
    },
    clearScreen() {
      el('hud-screen').innerHTML = '';
    },
    /** Drop the panel to the bottom of the screen (title) or centre it again. */
    setTitleMode(on) {
      el('hud-screen').classList.toggle('title-screen', on);
    },
  };
}

/** The title screen's stage picker, as one HTML string for hud.screen(). */
export function titleScreenHtml(best, bestMission) {
  const cards = STAGES.map((m, i) => `
    <button class="mission-card" data-mission="${m.id}">
      <span class="mission-key">${i + 1}</span>
      <span class="mission-name">${m.name}</span>
      <span class="mission-short">${m.short}</span>
    </button>`).join('');
  return `
    <div class="screen-panel">
      <h1>EMBERLINE</h1>
      <p class="screen-tag">Island courier at last light — three stages before dark, and a squall walking in from the north-east.</p>
      <div class="mission-row">${cards}</div>
      <p class="screen-help">Mouse steers · W/S or wheel throttle · A/D bank · B brake · G gear · F flaps · SPACE deliver · P pause · M mute<br>
      Click a stage or press 1, 2 or 3. Gear down and gentle on the strip to finish.</p>
      <p class="screen-best">${best > 0 ? `Best score ${best}${bestMission ? ` — ${bestMission}` : ''}` : 'No flights logged yet — make the first one count.'}</p>
    </div>`;
}

export function pauseScreenHtml(missionName, score) {
  return `
    <div class="screen-panel">
      <h1>PAUSED</h1>
      <p class="screen-tag">${missionName} — score ${score}</p>
      <p class="screen-help">P or Esc to keep flying · R to restart the stage · M to mute</p>
    </div>`;
}

export function endScreenHtml(title, lines, score, best) {
  return `
    <div class="screen-panel">
      <h1>${title}</h1>
      ${lines.map((l) => `<p class="screen-tag">${l}</p>`).join('')}
      <p class="screen-help">Score ${score} · Best ${best}<br>Enter to fly again · 1, 2 or 3 to pick another stage</p>
    </div>`;
}
