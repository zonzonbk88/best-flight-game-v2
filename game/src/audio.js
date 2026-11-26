// Sound, synthesised live with WebAudio — no audio files, no network. The engine
// is a detuned sawtooth pair whose pitch follows throttle and airspeed, wind is
// filtered noise that grows with speed, and the chimes, thuds and beeps are short
// envelopes. Everything waits for the first user gesture, as browsers require.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windSource = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);

      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 55.7;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineOsc2.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();

      const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      windSource = ctx.createBufferSource();
      windSource.buffer = noiseBuffer;
      windSource.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 480;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windSource.start();
      started = true;
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, when, duration, type = 'sine', volume = 0.25) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + duration + 0.05);
  }

  return {
    /** Call from any user gesture; also resumes a suspended context. */
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    /** Per-frame engine and wind, from throttle (0..1) and airspeed (m/s). */
    update(throttle, speed, flying) {
      if (!started || muted || !ctx) return;
      const t = ctx.currentTime;
      const rpm = 52 + throttle * 68 + speed * 0.35;
      engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
      engineOsc2.frequency.setTargetAtTime(rpm * 1.008, t, 0.08);
      engineGain.gain.setTargetAtTime(flying ? 0.05 + throttle * 0.075 : throttle * 0.04, t, 0.1);
      windGain.gain.setTargetAtTime(Math.max(0, (speed - 18) / 90) * 0.14, t, 0.15);
      windFilter.frequency.setTargetAtTime(380 + speed * 9, t, 0.2);
    },
    ringChime() {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      tone(880, t, 0.35, 'sine', 0.3);
      tone(1318.5, t + 0.09, 0.5, 'sine', 0.28);
    },
    crashThud() {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      tone(70, t, 0.7, 'triangle', 0.5);
      tone(48, t + 0.05, 0.9, 'sine', 0.45);
    },
    landingBeep() {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      tone(660, t, 0.18, 'sine', 0.25);
      tone(990, t + 0.2, 0.3, 'sine', 0.25);
    },
    warningBeep() {
      if (!ctx || muted) return;
      tone(440, ctx.currentTime, 0.15, 'square', 0.12);
    },
    toggleMute() {
      muted = !muted;
      if (ctx && engineGain) engineGain.gain.value = muted ? 0 : 0.05;
      if (ctx && windGain) windGain.gain.value = muted ? 0 : 0.02;
      return muted;
    },
    get muted() {
      return muted;
    },
  };
}
