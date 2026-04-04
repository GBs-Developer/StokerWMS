let sharedAudioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    sharedAudioCtx = new AudioContext();
  }
  if (sharedAudioCtx.state === "suspended") {
    sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

export type BeepType = "success" | "error" | "warning" | "scan" | "complete";

export function playBeep(type: BeepType) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "success") {
      osc.frequency.value = 880;
      gain.gain.value = 0.15;
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
      setTimeout(() => {
        try {
          const o2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          o2.connect(g2);
          g2.connect(ctx.destination);
          o2.frequency.value = 1320;
          g2.gain.value = 0.15;
          o2.start();
          o2.stop(ctx.currentTime + 0.12);
        } catch {}
      }, 100);
    } else if (type === "error") {
      osc.frequency.value = 200;
      gain.gain.value = 0.2;
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === "warning") {
      osc.frequency.value = 440;
      gain.gain.value = 0.15;
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
      setTimeout(() => {
        try {
          const o2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          o2.connect(g2);
          g2.connect(ctx.destination);
          o2.frequency.value = 330;
          g2.gain.value = 0.15;
          o2.start();
          o2.stop(ctx.currentTime + 0.2);
        } catch {}
      }, 180);
    } else if (type === "scan") {
      osc.frequency.value = 660;
      gain.gain.value = 0.08;
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } else if (type === "complete") {
      osc.frequency.value = 523;
      gain.gain.value = 0.12;
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
      setTimeout(() => {
        try {
          const o2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          o2.connect(g2);
          g2.connect(ctx.destination);
          o2.frequency.value = 659;
          g2.gain.value = 0.12;
          o2.start();
          o2.stop(ctx.currentTime + 0.1);
        } catch {}
      }, 120);
      setTimeout(() => {
        try {
          const o3 = ctx.createOscillator();
          const g3 = ctx.createGain();
          o3.connect(g3);
          g3.connect(ctx.destination);
          o3.frequency.value = 784;
          g3.gain.value = 0.12;
          o3.start();
          o3.stop(ctx.currentTime + 0.15);
        } catch {}
      }, 240);
    }
  } catch {}
}

const STORAGE_KEY = "stoker_sound_enabled";

export function getSoundEnabled(): boolean {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    return val !== "false";
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {}
}

export function beep(type: BeepType) {
  if (getSoundEnabled()) playBeep(type);
}
