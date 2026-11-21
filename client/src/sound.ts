// 목장 소리: 음원 파일 없이 Web Audio로 만든다 (오늘의 해 ambience.ts 방식).
// - 바람: 분홍 잡음 + 대역 필터, 몇 초마다 세기가 바뀌는 돌풍
// - 새소리: 뉴질랜드 투이처럼 맑은 휘파람과 지저귐
// - 효과음: 양 울음(Baa), 털 깎는 기계 윙윙, 털 날림, 우유, 베일 쿵, 점프

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const VOLUME = 1.4;

function pinkNoise(ctx: AudioContext, seconds = 5) {
  const len = ctx.sampleRate * seconds, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
  }
  return buf;
}

export function createSound() {
  let ctx: AudioContext | null = null, on = true;
  let master!: GainNode, fx!: GainNode, birds!: GainNode, windG!: GainNode, windF!: BiquadFilterNode, pink!: AudioBuffer;
  let clipper: { stop: () => void; level: GainNode } | null = null;
  const timers: number[] = [];

  function build() {
    const c = ctx!;
    const lim = c.createDynamicsCompressor(); lim.threshold.value = -10; lim.ratio.value = 8; lim.connect(c.destination);
    master = c.createGain(); master.gain.value = 0; master.connect(lim);
    pink = pinkNoise(c);
    windF = c.createBiquadFilter(); windF.type = 'bandpass'; windF.frequency.value = 500; windF.Q.value = 0.8;
    windG = c.createGain(); windG.gain.value = 0;
    const w = c.createBufferSource(); w.buffer = pink; w.loop = true; w.start(); w.connect(windF).connect(windG).connect(master);
    birds = c.createGain(); birds.gain.value = 0.06; birds.connect(master);
    fx = c.createGain(); fx.gain.value = 0.55; fx.connect(master);
    gust(); birdLoop();
  }
  function gust() {
    if (!ctx) return;
    const t = ctx.currentTime;
    windG.gain.setTargetAtTime(rand(0.03, 0.1), t, rand(0.8, 2));
    windF.frequency.setTargetAtTime(rand(350, 800), t, 1.5);
    timers.push(window.setTimeout(gust, rand(2000, 4500)));
  }
  function tone(bus: AudioNode, t: number, f0: number, f1: number, dur: number, vol: number, pan = 0, type: OscillatorType = 'sine') {
    const c = ctx!, o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.015, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    const p = c.createStereoPanner(); p.pan.value = pan;
    o.connect(g).connect(p).connect(bus); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(t: number, dur: number, type: BiquadFilterType, freq: number, q: number, vol: number, pan = 0) {
    const c = ctx!, s = c.createBufferSource(); s.buffer = pink;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    const p = c.createStereoPanner(); p.pan.value = pan;
    s.connect(f).connect(g).connect(p).connect(fx); s.start(t, rand(0, 3)); s.stop(t + dur + 0.02);
  }
  function birdLoop() {
    if (!ctx) return;
    const t = ctx.currentTime + 0.05, pan = rand(-0.8, 0.8), v = rand(0.4, 0.9), k = Math.random();
    if (k < 0.4) { const f = rand(1600, 2200); tone(birds, t, f, f * 1.25, 0.25, v, pan); tone(birds, t + 0.32, f * 1.3, f * 0.9, 0.3, v, pan); } // 투이 휘파람
    else if (k < 0.75) { const n = 2 + Math.floor(Math.random() * 3), f = rand(3000, 4500); for (let i = 0; i < n; i++) tone(birds, t + i * 0.13, f, f - rand(500, 1000), 0.08, v, pan); }
    else { const f = rand(4200, 5400); for (let i = 0; i < 8; i++) tone(birds, t + i * 0.035, f + Math.sin(i) * 150, f - 300, 0.03, v * 0.6, pan); }
    timers.push(window.setTimeout(birdLoop, rand(4000, 11000)));
  }
  const ready = () => !!ctx && on && ctx.state === 'running';

  return {
    get started() { return !!ctx; },
    /** 첫 터치 때 호출 (브라우저는 사용자 동작 없이 소리를 못 냄) */
    unlock() {
      if (!on) return;
      if (!ctx) { try { ctx = new AudioContext(); build(); } catch { return; } }
      ctx.resume().then(() => master.gain.setTargetAtTime(VOLUME, ctx!.currentTime, 0.8)).catch(() => {});
    },
    setOn(v: boolean) {
      on = v;
      if (v) this.unlock(); else if (ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      if (!v) this.clipper(false);
    },
    pause() { if (ctx) ctx.suspend().catch(() => {}); },
    resume() { if (ctx && on) ctx.resume().catch(() => {}); },

    /** 양 울음: 떨리는 성대(톱니파) + 입 모양 필터. vol·pan으로 거리와 방향 */
    baa(vol = 1, pan = 0, pitch = 1) {
      if (!ready() || vol < 0.03) return;
      const c = ctx!, t = c.currentTime + 0.02, dur = rand(0.55, 0.8), f = rand(260, 330) * pitch;
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 1.1, t); o.frequency.linearRampToValueAtTime(f, t + 0.12); o.frequency.linearRampToValueAtTime(f * 0.85, t + dur);
      const vib = c.createOscillator(); vib.frequency.value = rand(16, 22); const vg = c.createGain(); vg.gain.value = f * 0.06; vib.connect(vg).connect(o.frequency);
      const trem = c.createOscillator(); trem.frequency.value = rand(14, 20); const tg = c.createGain(); tg.gain.value = 0.35;
      const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.setValueAtTime(700, t); f1.frequency.linearRampToValueAtTime(1100, t + 0.15); f1.Q.value = 3;
      const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 2400; f2.Q.value = 5;
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5 * vol, t + 0.05); g.gain.setValueAtTime(0.5 * vol, t + dur - 0.15); g.gain.linearRampToValueAtTime(0, t + dur);
      trem.connect(tg).connect(g.gain);
      const p = c.createStereoPanner(); p.pan.value = pan;
      const mix = c.createGain(); o.connect(f1).connect(mix); o.connect(f2).connect(mix); mix.connect(g).connect(p).connect(fx);
      for (const n of [o, vib, trem]) { n.start(t); n.stop(t + dur + 0.05); }
    },
    jump() { if (ready()) tone(fx, ctx!.currentTime + 0.01, 300, 620, 0.16, 0.25, 0, 'triangle'); },
    nuzzle() { if (ready()) { const t = ctx!.currentTime; noise(t, 0.25, 'lowpass', 900, 0.7, 0.35); noise(t + 0.18, 0.25, 'lowpass', 800, 0.7, 0.3); } },
    /** 털 깎는 기계: 켜져 있는 동안 윙윙, 털에 닿으면 cut()으로 사각 */
    clipper(run: boolean) {
      if (!run) { clipper?.stop(); clipper = null; return; }
      if (!ready() || clipper) return;
      const c = ctx!, o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 118;
      const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 236;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.2;
      const level = c.createGain(); level.gain.value = 0; level.gain.setTargetAtTime(0.09, c.currentTime, 0.05);
      const m = c.createGain(); m.gain.value = 0.5; o2.connect(m).connect(f); o.connect(f).connect(level).connect(fx);
      o.start(); o2.start();
      clipper = { level, stop: () => { level.gain.setTargetAtTime(0, c.currentTime, 0.04); o.stop(c.currentTime + 0.3); o2.stop(c.currentTime + 0.3); } };
    },
    cut() { if (ready()) noise(ctx!.currentTime, 0.07, 'highpass', 3500, 0.8, 0.18, rand(-0.2, 0.2)); },
    milk() { if (!ready()) return; const t = ctx!.currentTime; for (let i = 0; i < 4; i++) noise(t + i * 0.22, 0.14, 'bandpass', rand(2500, 3200), 2, 0.25); },
    thump() { if (ready()) { const t = ctx!.currentTime; tone(fx, t, 120, 50, 0.25, 0.6); noise(t, 0.12, 'lowpass', 400, 0.7, 0.3); } },
    chime() { if (ready()) { const t = ctx!.currentTime; [784, 988, 1319].forEach((f, i) => tone(fx, t + i * 0.09, f, f, 0.5, 0.18)); } },
    /** 양치기 개 짖는 소리 */
    bark(vol = 1) {
      if (!ready() || vol < 0.05) return;
      const t = ctx!.currentTime;
      for (let i = 0; i < 2; i++) { tone(fx, t + i * 0.16, 520, 300, 0.11, 0.4 * vol, 0, 'sawtooth'); noise(t + i * 0.16, 0.09, 'bandpass', 1300, 1.5, 0.35 * vol); }
    },
    /** 수출선 뱃고동 */
    horn() { if (ready()) { const t = ctx!.currentTime; tone(fx, t, 147, 147, 1.6, 0.4, 0, 'sawtooth'); tone(fx, t, 110, 110, 1.6, 0.35, 0, 'square'); tone(fx, t + 1.9, 147, 147, 0.7, 0.4, 0, 'sawtooth'); } },
    /** 풀 뜯는 소리 */
    munch() { if (ready()) { const t = ctx!.currentTime; noise(t, 0.06, 'bandpass', 1800, 2, 0.16); noise(t + 0.13, 0.06, 'bandpass', 1500, 2, 0.13); } },
    bounce() { if (ready()) tone(fx, ctx!.currentTime, 220, 120, 0.12, 0.25, 0, 'triangle'); },
  };
}
