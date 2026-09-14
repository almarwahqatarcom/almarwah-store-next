// A short, pleasant two-note notification chime (C5 → E5), synthesized
// entirely with the Web Audio API — no audio file to host or ship. Used
// for real-time events a visitor should notice without staring at the
// screen (e.g. their tracked order's status changing).
export function playChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [523.25, 659.25].forEach((freq, i) => {
      const start = now + i * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.42);
    });
    // Closing the context frees the audio thread once the chime has
    // finished — harmless to skip if it errors (context may already be
    // closing on some browsers).
    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch {
    // Never let a failed chime (autoplay policy, no audio hardware,
    // browser quirks) break whatever real feature triggered it.
  }
}
