# EMBERLINE

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/zonzonbk88/best-flight-game-v2/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/zonzonbk88/best-flight-game-v2/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**EMBERLINE** — an original 3D flight game for the make.fun `best-flight-game-20261126-0057` bounty. You fly the EL-2 *Sparrow*, a small island courier, around a dusk archipelago: thread the guide hoops along the coast, drop cargo into the painted bullseye circles, and land on the strip before the light goes — while a living squall line walks in from the north-east.

## Identity

EMBERLINE has its own face, not a borrowed one: **golden-hour dusk over a petrol-teal sea**. Deep teal sky (0x10394f) over a teal shoulder (0x3d7a86) into an ember-amber horizon (0xf7a94b); sea grading turquoise shallows (0x2f8f83) through mid teal (0x14607a) to deep petrol (0x0a3247); dusky olive hills, pale gold beaches, amber-and-teal HUD language on charcoal cut-corner panels. The Sparrow wears a **Vietnamese flag livery** — red field, yellow star — drawn procedurally on a canvas texture (no image assets): a decal on both faces of the tail fin and on top of both wings, so it reads clearly from the chase camera.

## The hook: a living squall line

One weather front crosses the whole archipelago during every sortie, on a deterministic course. It is drawn in the world as a rain curtain, tracked as a band on the island-chart minimap, and called out on the HUD weather line (`SQUALL — GUSTS 14 KT`, `SQUALL 1.2 KM OUT`). Fly into it and the flight model feels it: gusts along the front's travel, roll/pitch/vertical turbulence that grows with intensity. Plan the route to work ahead of it — or punch through and take the beating. Supporting mechanic: **precision airdrops** — cargo zones are painted as bullseyes, and the drop score scales with how close to the centre circle you release (SPACE, low, inside the zone).

## Stages

Three coastal stages, each with guide hoops (amber, in order), optional bonus hoops (pale gold, any time), scored drops and a landing back on a strip:

1. **Deliver clinic medicine** — coastal guide hoops to Clinic Isle, drop the medicine in the clinic circle, come home to Northhaven.
2. **Harbour freight run** — Ridge Island gates, a freight drop at Harbour, land on the Harbour strip.
3. **The island circuit** — Clinic drop, Ridge gates, Harbour drop, then all the way home.

Scoring rewards precision (hoop centre = more points), clean streaks (+25 bonus from two clean hoops in a row; damage resets the streak), centred drops, and gentle, precise landings (touchdown point, sink rate, flaps). A real flight model underneath: throttle, bank and pitch, stall that drops as the flaps come down, **retractable gear (G)** — drag and sink penalty down, and a belly arrival wrecks the airframe — **two-stage flaps (F)**, fuel that drains with throttle, damage on hard contact, brake rollout on touchdown.

The HUD is a full courier cockpit: mission panel with stage, timer, objective, progress and next-target distance; heading readout with compass tape; big airspeed/altitude numerals with an attitude disc, vertical speed and AGL; POWER / FUEL / AIRFRAME bars; GEAR and FLAPS indicator boxes; the weather line; and the island-chart minimap with islands, strips, route, hoops, drop circles, the plane — and the squall band.

## Controls

Mouse steers (hold + drag) · mouse wheel or W/S throttle · A/D or arrows bank · ArrowUp/Down pitch · **G gear** · **F flaps** · **SPACE deliver** (inside a drop circle, low) · B brake · H briefing · P pause · M mute · 1/2/3 pick a stage · Enter start/restart. Stage cards on the title screen are clickable.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080. `main.ts` is the make.fun entrypoint: it copies `game/` and `screenshots/` to `/output` and writes `/output/dossier.json`. No network at runtime: Three.js is vendored, sounds are synthesised WebAudio, the flag is a canvas texture.

## Layout

- `game/index.html` — page, EMBERLINE CSS, import map (Three.js vendored under `game/vendor/`)
- `game/src/config.js` — world, islands, stages, palette, tuning
- `game/src/random.js` — seeded RNG (mulberry32) so scenes repeat
- `game/src/input.js` — keyboard + mouse controls (gear/flaps/deliver/wheel)
- `game/src/terrain.js` — archipelago heightfield, sea, strips, lighthouse, clinic, pines, clouds, hoops, drop bullseyes, stage routes (hoops auto-lifted to clear the ground)
- `game/src/weather.js` — the squall: front course, gust/turbulence sampling, band position for renderer + minimap
- `game/src/aircraft.js` — the EL-2 Sparrow: retractable gear, drooping flaps, procedural Vietnamese flag livery
- `game/src/physics.js` — flight model: lift, stall, gear/flaps effects, wind + squall, takeoff, landing, crash
- `game/src/missions.js` — stage logic: hoops, precision drops, clean streaks, landing score
- `game/src/audio.js` — synthesised engine, wind, chimes, warnings (WebAudio only)
- `game/src/hud.js` — mission panel, compass tape, instruments, bars, gear/flaps boxes, weather line, island-chart minimap
- `game/src/render.js` — Three.js scene, dusk sky shader, squall rain curtain, chase + title cameras
- `game/src/shots.js` — staged screenshot scenes + autopilot (`?shot=start|play|rings|landing&seed=1`)
- `game/src/main.js` — game loop + title/pause/game-over screens
- `screenshots/` — 4 real renders of the game in headless Chromium
- `vendor/makefun-game.ts` — make.fun's dossier library, vendored by the kit

MIT licensed — see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=clever-condor-18-6731&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
