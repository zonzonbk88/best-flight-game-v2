// Keyboard + mouse, read as one frame's worth of pilot intent.
// The pointer steers (bank and pitch follow it, hold and drag to aim), W/S or
// the mouse wheel work the throttle, A/D or Left/Right bank, B is the brake,
// G cycles the landing gear, F cycles the flaps, SPACE is the DELIVER action,
// P pauses, M mutes, Enter confirms on menus. Pointer lock is never required:
// the game must play in a plain window, and a screenshot run has no pointer.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_MISSION_1 = 8;
export const ACTION_MISSION_2 = 16;
export const ACTION_MISSION_3 = 32;
export const ACTION_RESTART = 64;
export const ACTION_GEAR = 128;
export const ACTION_FLAPS = 256;
export const ACTION_DELIVER = 512;

const KEY_ACTIONS = {
  Enter: ACTION_CONFIRM,
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  KeyM: ACTION_MUTE,
  Digit1: ACTION_MISSION_1,
  Digit2: ACTION_MISSION_2,
  Digit3: ACTION_MISSION_3,
  KeyR: ACTION_RESTART,
  KeyG: ACTION_GEAR,
  KeyF: ACTION_FLAPS,
  Space: ACTION_DELIVER,
};

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  // Pointer in -1..1 across the window, 0 at centre; the pilot steers toward it.
  let pointerX = 0;
  let pointerY = 0;
  let pointerSeen = false;
  let mouseDown = false;
  // Queued frames of wheel throttle: one notch is worth about a tenth of the lever.
  let wheelFrames = 0;

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action) actions |= action;
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onPointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    pointerX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
    pointerY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
    pointerSeen = true;
  }

  function onPointerDown(event) {
    mouseDown = true;
    onPointerMove(event);
  }

  function onPointerUp() {
    mouseDown = false;
  }

  function onWheel(event) {
    // Scroll up (negative deltaY) is more power, down is less.
    wheelFrames += event.deltaY < 0 ? 12 : -12;
    wheelFrames = Math.max(-60, Math.min(60, wheelFrames));
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: true });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    keys.clear();
    mouseDown = false;
    wheelFrames = 0;
  });

  return {
    /** Actions pressed since the last call; each is reported once. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Steering for this frame: { roll, pitch, throttleDelta, brake }. */
    readControls() {
      let roll = 0;
      let pitch = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) roll -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) roll += 1;
      // Pitch is positive for climb: ArrowUp climbs, and the pointer steers
      // toward where it sits (above centre climbs, below centre descends).
      if (keys.has('ArrowUp')) pitch += 1;
      if (keys.has('ArrowDown')) pitch -= 1;
      if (pointerSeen) {
        // The pointer is the finer instrument: blend it in over the keys.
        roll += pointerX * 0.9;
        pitch += -pointerY * 0.8;
      }
      let throttleDelta = 0;
      if (keys.has('KeyW')) throttleDelta += 1;
      if (keys.has('KeyS')) throttleDelta -= 1;
      if (wheelFrames !== 0) {
        throttleDelta += Math.sign(wheelFrames);
        wheelFrames -= Math.sign(wheelFrames);
      }
      return {
        roll: Math.max(-1, Math.min(1, roll)),
        pitch: Math.max(-1, Math.min(1, pitch)),
        throttleDelta,
        brake: keys.has('KeyB'),
      };
    },
  };
}
