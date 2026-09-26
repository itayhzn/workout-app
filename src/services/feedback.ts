import { loadTimerSound } from "./settings";

let ctx: AudioContext | undefined;

/** Must be called from a user gesture (e.g. Complete Set) so iOS allows audio later. */
export function primeAudio(): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    /* audio unsupported */
  }
}

function tone(freq: number, start: number, duration: number) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  osc.type = "sine";
  gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.05);
}

export function restFinishedFeedback(): void {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* unsupported */
  }
  if (!loadTimerSound()) return;
  try {
    if (!ctx) primeAudio();
    tone(880, 0, 0.18);
    tone(880, 0.25, 0.18);
    tone(1320, 0.5, 0.35);
  } catch {
    /* unsupported */
  }
}

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

function play(fn: () => void) {
  if (!loadTimerSound()) return;
  try {
    if (!ctx) primeAudio();
    fn();
  } catch {
    /* unsupported */
  }
}

/** Short tick for the last 3 seconds of an interval step. */
export function countdownTick(): void {
  play(() => tone(660, 0, 0.1));
}

/** Signals the start of a new interval phase. */
export function intervalPhaseFeedback(phase: "work" | "rest" | "prep" | "done"): void {
  if (phase === "work") {
    vibrate(300);
    play(() => {
      tone(1320, 0, 0.12);
      tone(1320, 0.16, 0.25);
    });
  } else if (phase === "done") {
    vibrate([200, 100, 200, 100, 400]);
    play(() => {
      tone(880, 0, 0.15);
      tone(1100, 0.2, 0.15);
      tone(1320, 0.4, 0.4);
    });
  } else {
    vibrate(120);
    play(() => tone(520, 0, 0.3));
  }
}

let wakeLock: { release: () => Promise<void> } | undefined;

/** Keeps the screen on while an interval sequence runs (hands-free workouts). Best effort. */
export async function holdWakeLock(on: boolean): Promise<void> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
    if (on && !wakeLock && nav.wakeLock && document.visibilityState === "visible") wakeLock = await nav.wakeLock.request("screen");
    if (!on && wakeLock) {
      const lock = wakeLock;
      wakeLock = undefined;
      await lock.release();
    }
  } catch {
    wakeLock = undefined;
  }
}
