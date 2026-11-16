let noiseBuffer: AudioBuffer | null = null;

export function primeNoise(ctx: AudioContext) {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return;
  const seconds = 3;
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    data[i] = pink * 0.11;
  }
  const fade = Math.floor(ctx.sampleRate * 0.02);
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    data[i] *= g;
    data[length - 1 - i] *= g;
  }
  noiseBuffer = buffer;
}

function noise() {
  if (!noiseBuffer) throw new Error("Noise buffer missing");
  return noiseBuffer;
}

export function sharedNoise() {
  return noise();
}

function midiHz(note: number) {
  return 440 * 2 ** ((note - 69) / 12);
}

function drop(nodes: AudioNode[], source: AudioScheduledSourceNode) {
  source.addEventListener("ended", () => {
    for (const node of nodes) {
      try {
        node.disconnect();
      } catch {
        /* already stopped */
      }
    }
  });
}

function burst(
  ctx: AudioContext,
  dest: AudioNode,
  time: number,
  dur: number,
  peak: number,
  type: BiquadFilterType,
  freq: number,
  q: number,
) {
  const src = ctx.createBufferSource();
  const buf = noise();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, time);
  filter.Q.setValueAtTime(q, time);
  const gain = ctx.createGain();
  const level = Math.max(0.0001, peak);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(level, time + Math.min(0.004, dur * 0.25));
  gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  const offset = Math.random() * Math.max(0, buf.duration - dur - 0.02);
  src.start(time, offset, dur + 0.02);
  src.stop(time + dur + 0.03);
  drop([src, filter, gain], src);
}

function tone(
  ctx: AudioContext,
  dest: AudioNode,
  time: number,
  freq: number,
  type: OscillatorType,
  peak: number,
  attack: number,
  dur: number,
  detune = 0,
) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(20, freq), time);
  osc.detune.setValueAtTime(detune, time);
  const gain = ctx.createGain();
  const level = Math.max(0.0001, peak);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(level, time + Math.max(0.004, attack));
  gain.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(attack + 0.02, dur));
  osc.connect(gain);
  gain.connect(dest);
  osc.start(time);
  osc.stop(time + dur + 0.04);
  drop([osc, gain], osc);
  return osc;
}

export function playKick(ctx: AudioContext, dest: AudioNode, time: number, vel: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  const start = 118 + vel * 46;
  osc.frequency.setValueAtTime(start, time);
  osc.frequency.exponentialRampToValueAtTime(54, time + 0.055);
  osc.frequency.exponentialRampToValueAtTime(42, time + 0.16);
  const peak = 0.82 * vel;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), time + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(time);
  osc.stop(time + 0.32);
  burst(ctx, dest, time, 0.018, 0.16 * vel, "highpass", 1400, 0.7);
  drop([osc, gain], osc);
}

export function playSnare(ctx: AudioContext, dest: AudioNode, time: number, vel: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(196, time);
  osc.frequency.exponentialRampToValueAtTime(140, time + 0.12);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.28 * vel, time + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(time);
  osc.stop(time + 0.2);
  drop([osc, gain], osc);
  burst(ctx, dest, time, 0.15, 0.42 * vel, "bandpass", 1850, 0.75);
  burst(ctx, dest, time, 0.045, 0.18 * vel, "highpass", 5200, 0.6);
}

export function playHat(ctx: AudioContext, dest: AudioNode, time: number, vel: number, open: boolean) {
  if (open) {
    burst(ctx, dest, time, 0.18, 0.2 * vel, "highpass", 6200, 0.7);
    burst(ctx, dest, time, 0.12, 0.08 * vel, "bandpass", 10000, 0.8);
    return;
  }
  burst(ctx, dest, time, 0.038, 0.15 * vel, "highpass", 7800, 0.7);
}

export function playBass(ctx: AudioContext, dest: AudioNode, time: number, vel: number, note: number, dur: number) {
  const freq = midiHz(note);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.setValueAtTime(7, time);
  const startF = Math.max(80, freq * (3.2 + vel * 5));
  const endF = Math.max(60, freq * 2);
  filter.frequency.setValueAtTime(startF, time);
  filter.frequency.exponentialRampToValueAtTime(endF, time + Math.max(0.08, dur));
  filter.connect(dest);
  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = "sine";
  sub.frequency.setValueAtTime(freq, time);
  subGain.gain.setValueAtTime(0.0001, time);
  subGain.gain.exponentialRampToValueAtTime(0.46 * vel, time + 0.008);
  subGain.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.05);
  sub.connect(subGain);
  subGain.connect(filter);
  sub.start(time);
  sub.stop(time + dur + 0.08);
  const saw = ctx.createOscillator();
  const sawGain = ctx.createGain();
  saw.type = "sawtooth";
  saw.frequency.setValueAtTime(freq, time);
  saw.detune.setValueAtTime(6, time);
  sawGain.gain.setValueAtTime(0.0001, time);
  sawGain.gain.exponentialRampToValueAtTime(0.1 * vel, time + 0.01);
  sawGain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  saw.connect(sawGain);
  sawGain.connect(filter);
  saw.start(time);
  saw.stop(time + dur + 0.06);
  drop([sub, subGain, saw, sawGain, filter], sub);
}

export function playChord(ctx: AudioContext, dest: AudioNode, time: number, vel: number, notes: number[], dur: number) {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.setValueAtTime(0.6, time);
  filter.frequency.setValueAtTime(900 + vel * 700, time);
  filter.frequency.exponentialRampToValueAtTime(520, time + dur * 0.85);
  filter.connect(dest);
  const nodes: AudioNode[] = [filter];
  let last: OscillatorNode | null = null;
  notes.forEach((note, i) => {
    const freq = midiHz(note);
    const peak = (0.055 * vel) / Math.sqrt(notes.length);
    const tri = ctx.createOscillator();
    const triGain = ctx.createGain();
    tri.type = "triangle";
    tri.frequency.setValueAtTime(freq, time);
    triGain.gain.setValueAtTime(0.0001, time);
    triGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), time + 0.03);
    triGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.72), time + dur * 0.55);
    triGain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    tri.connect(triGain);
    triGain.connect(filter);
    tri.start(time);
    tri.stop(time + dur + 0.05);
    const saw = ctx.createOscillator();
    const sawGain = ctx.createGain();
    saw.type = "sawtooth";
    saw.frequency.setValueAtTime(freq, time);
    saw.detune.setValueAtTime(i % 2 === 0 ? -7 : 8, time);
    sawGain.gain.setValueAtTime(0.0001, time);
    sawGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.45), time + 0.05);
    sawGain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    saw.connect(sawGain);
    sawGain.connect(filter);
    saw.start(time);
    saw.stop(time + dur + 0.05);
    nodes.push(tri, triGain, saw, sawGain);
    last = tri;
  });
  if (last) drop(nodes, last);
}

export function playLead(ctx: AudioContext, dest: AudioNode, time: number, vel: number, note: number, dur: number) {
  const freq = midiHz(note);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.setValueAtTime(4.5, time);
  filter.frequency.setValueAtTime(Math.max(400, freq * 6), time);
  filter.frequency.exponentialRampToValueAtTime(Math.max(180, freq * 1.6), time + dur);
  filter.connect(dest);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, time);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.2 * vel, time + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.08, dur));
  osc.connect(gain);
  gain.connect(filter);
  osc.start(time);
  osc.stop(time + dur + 0.04);
  const sq = ctx.createOscillator();
  const sqGain = ctx.createGain();
  sq.type = "square";
  sq.frequency.setValueAtTime(freq, time);
  sq.detune.setValueAtTime(4, time);
  sqGain.gain.setValueAtTime(0.0001, time);
  sqGain.gain.exponentialRampToValueAtTime(0.035 * vel, time + 0.008);
  sqGain.gain.exponentialRampToValueAtTime(0.0001, time + dur * 0.7);
  sq.connect(sqGain);
  sqGain.connect(filter);
  sq.start(time);
  sq.stop(time + dur + 0.04);
  drop([osc, gain, sq, sqGain, filter], osc);
}

const NUDGE = [0, 0.003, -0.002, 0.004, -0.001, 0.002, 0, -0.003, 0.001, 0.003, -0.002, 0, 0.002, -0.003, 0.001, -0.001];

export function nudge(step: number) {
  return NUDGE[step & 15] ?? 0;
}
