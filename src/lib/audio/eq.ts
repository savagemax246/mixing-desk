export type BiquadKind = "highpass" | "lowshelf" | "highshelf" | "peaking";

export type BandSpec = {
  type: BiquadKind;
  freq: number;
  q: number;
  gain: number;
};

type Coeff = { b0: number; b1: number; b2: number; a1: number; a2: number };

function design(spec: BandSpec, sampleRate: number): Coeff {
  const nyquist = sampleRate * 0.49;
  const freq = Math.min(nyquist, Math.max(10, spec.freq));
  const q = Math.max(0.05, spec.q);
  const A = 10 ** (spec.gain / 40);
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  let b0 = 1;
  let b1 = 0;
  let b2 = 0;
  let a0 = 1;
  let a1 = 0;
  let a2 = 0;

  if (spec.type === "highpass") {
    const alpha = sin / (2 * q);
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
    a0 = 1 + alpha;
    a1 = -2 * cos;
    a2 = 1 - alpha;
  } else if (spec.type === "peaking") {
    const alpha = sin / (2 * q);
    b0 = 1 + alpha * A;
    b1 = -2 * cos;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a1 = -2 * cos;
    a2 = 1 - alpha / A;
  } else {
    const S = Math.max(0.05, q);
    const alpha = (sin / 2) * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);
    const two = 2 * Math.sqrt(A) * alpha;
    if (spec.type === "lowshelf") {
      b0 = A * (A + 1 - (A - 1) * cos + two);
      b1 = 2 * A * (A - 1 - (A + 1) * cos);
      b2 = A * (A + 1 - (A - 1) * cos - two);
      a0 = A + 1 + (A - 1) * cos + two;
      a1 = -2 * (A - 1 + (A + 1) * cos);
      a2 = A + 1 + (A - 1) * cos - two;
    } else {
      b0 = A * (A + 1 + (A - 1) * cos + two);
      b1 = -2 * A * (A - 1 + (A + 1) * cos);
      b2 = A * (A + 1 + (A - 1) * cos - two);
      a0 = A + 1 - (A - 1) * cos + two;
      a1 = 2 * (A - 1 - (A + 1) * cos);
      a2 = A + 1 - (A - 1) * cos - two;
    }
  }

  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

export function bandDb(spec: BandSpec, freq: number, sampleRate: number) {
  const c = design(spec, sampleRate);
  const w = (2 * Math.PI * Math.min(freq, sampleRate * 0.49)) / sampleRate;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const c2 = Math.cos(2 * w);
  const s2 = Math.sin(2 * w);
  const nr = c.b0 + c.b1 * cw + c.b2 * c2;
  const ni = c.b1 * sw + c.b2 * s2;
  const dr = 1 + c.a1 * cw + c.a2 * c2;
  const di = c.a1 * sw + c.a2 * s2;
  const mag = Math.sqrt(nr * nr + ni * ni) / Math.max(1e-12, Math.sqrt(dr * dr + di * di));
  return 20 * Math.log10(Math.max(mag, 1e-8));
}

export function curveDb(bands: BandSpec[], freq: number, sampleRate: number) {
  let sum = 0;
  for (const band of bands) sum += bandDb(band, freq, sampleRate);
  return sum;
}
