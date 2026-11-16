export type GrooveId = "house" | "boom" | "broken";

export type Hit = { vel: number; notes: number[]; dur: number };

export type Pattern = {
  kick: Float32Array;
  snare: Float32Array;
  hat: Float32Array;
  hatOpen: Float32Array;
  bass: Map<number, Hit>;
  chord: Map<number, Hit>;
  lead: Map<number, Hit>;
};

export const GROOVE_META: Record<GrooveId, { label: string; bpm: number; swing: number }> = {
  house: { label: "House", bpm: 104, swing: 14 },
  boom: { label: "Boom", bpm: 86, swing: 0 },
  broken: { label: "Broken", bpm: 112, swing: 62 },
};

const STEPS = 64;

function mapHits(hits: Array<[number, number, number[], number]>) {
  const m = new Map<number, Hit>();
  for (const [step, vel, notes, dur] of hits) m.set(step, { vel, notes, dur });
  return m;
}

function house(): Pattern {
  const kick = new Float32Array(STEPS);
  const snare = new Float32Array(STEPS);
  const hat = new Float32Array(STEPS);
  const hatOpen = new Float32Array(STEPS);
  for (let i = 0; i < STEPS; i += 4) kick[i] = 0.98;
  kick[46] = 0.34;
  for (let bar = 0; bar < 4; bar++) {
    snare[bar * 16 + 4] = 0.94;
    snare[bar * 16 + 12] = 0.9;
  }
  snare[26] = 0.2;
  snare[58] = 0.24;
  for (let i = 0; i < STEPS; i++) {
    if (i % 16 === 14) {
      hatOpen[i] = 0.78;
      continue;
    }
    hat[i] = i % 2 === 0 ? (i % 4 === 0 ? 0.32 : 0.4) : 0.6;
  }
  const bass = mapHits([
    [0, 0.95, [33], 0.18],
    [3, 0.4, [33], 0.1],
    [6, 0.72, [36], 0.15],
    [8, 0.9, [33], 0.18],
    [11, 0.62, [40], 0.14],
    [14, 0.48, [31], 0.12],
    [16, 0.95, [29], 0.18],
    [19, 0.42, [29], 0.1],
    [22, 0.7, [36], 0.15],
    [24, 0.9, [29], 0.18],
    [27, 0.58, [33], 0.14],
    [30, 0.5, [36], 0.12],
    [32, 0.96, [36], 0.18],
    [35, 0.48, [31], 0.12],
    [38, 0.7, [40], 0.15],
    [40, 0.9, [36], 0.18],
    [43, 0.55, [38], 0.13],
    [46, 0.46, [35], 0.12],
    [48, 0.96, [31], 0.18],
    [51, 0.6, [38], 0.14],
    [54, 0.5, [29], 0.12],
    [56, 0.9, [31], 0.18],
    [59, 0.64, [35], 0.14],
    [62, 0.48, [38], 0.12],
  ]);
  const chord = mapHits([
    [0, 0.7, [57, 60, 64], 1.85],
    [16, 0.68, [53, 57, 60], 1.85],
    [32, 0.7, [55, 60, 64], 1.85],
    [48, 0.7, [55, 59, 62], 1.9],
  ]);
  const lead = mapHits([
    [2, 0.66, [64], 0.18],
    [7, 0.52, [67], 0.16],
    [10, 0.48, [64], 0.14],
    [18, 0.72, [69], 0.2],
    [22, 0.58, [67], 0.16],
    [27, 0.62, [65], 0.2],
    [34, 0.68, [64], 0.18],
    [40, 0.56, [62], 0.18],
    [45, 0.5, [60], 0.16],
    [50, 0.7, [59], 0.22],
    [56, 0.58, [62], 0.18],
    [61, 0.46, [59], 0.2],
  ]);
  return { kick, snare, hat, hatOpen, bass, chord, lead };
}

function boom(): Pattern {
  const kick = new Float32Array(STEPS);
  const snare = new Float32Array(STEPS);
  const hat = new Float32Array(STEPS);
  const hatOpen = new Float32Array(STEPS);
  const kicks: Array<[number, number]> = [
    [0, 1],
    [10, 0.72],
    [16, 1],
    [22, 0.5],
    [32, 1],
    [43, 0.74],
    [48, 1],
    [56, 0.78],
    [62, 0.36],
  ];
  for (const [i, v] of kicks) kick[i] = v;
  for (let bar = 0; bar < 4; bar++) {
    snare[bar * 16 + 4] = 0.96;
    snare[bar * 16 + 12] = 0.92;
  }
  snare[23] = 0.18;
  snare[55] = 0.22;
  for (let i = 0; i < STEPS; i += 2) hat[i] = i % 8 === 0 ? 0.5 : 0.3;
  hatOpen[30] = 0.66;
  hatOpen[62] = 0.6;
  hat[30] = 0;
  hat[62] = 0;
  const bass = mapHits([
    [0, 0.9, [33], 0.48],
    [8, 0.55, [33], 0.32],
    [16, 0.9, [29], 0.5],
    [24, 0.5, [29], 0.28],
    [32, 0.92, [36], 0.46],
    [40, 0.58, [40], 0.32],
    [48, 0.9, [31], 0.48],
    [56, 0.6, [38], 0.36],
  ]);
  const chord = mapHits([
    [0, 0.62, [57, 60, 64, 67], 2.3],
    [16, 0.6, [53, 57, 60, 64], 2.3],
    [32, 0.62, [55, 59, 64, 67], 2.3],
    [48, 0.62, [50, 55, 59, 65], 2.3],
  ]);
  const lead = mapHits([
    [6, 0.55, [60], 0.28],
    [18, 0.7, [69], 0.36],
    [36, 0.6, [64], 0.3],
    [42, 0.5, [62], 0.24],
    [52, 0.66, [59], 0.4],
  ]);
  return { kick, snare, hat, hatOpen, bass, chord, lead };
}

function broken(): Pattern {
  const kick = new Float32Array(STEPS);
  const snare = new Float32Array(STEPS);
  const hat = new Float32Array(STEPS);
  const hatOpen = new Float32Array(STEPS);
  const kicks: Array<[number, number]> = [
    [0, 1],
    [7, 0.86],
    [10, 0.42],
    [16, 1],
    [26, 0.88],
    [32, 1],
    [39, 0.8],
    [48, 1],
    [54, 0.76],
    [58, 0.48],
  ];
  for (const [i, v] of kicks) kick[i] = v;
  for (let bar = 0; bar < 4; bar++) {
    snare[bar * 16 + 4] = 0.88;
    snare[bar * 16 + 12] = 0.84;
  }
  for (let i = 0; i < STEPS; i++) {
    if (i % 16 === 11) {
      hatOpen[i] = 0.7;
      continue;
    }
    hat[i] = i % 2 === 0 ? 0.2 : 0.56;
  }
  const bass = mapHits([
    [0, 0.92, [33], 0.14],
    [6, 0.55, [33], 0.12],
    [8, 0.78, [36], 0.14],
    [14, 0.5, [31], 0.12],
    [16, 0.92, [29], 0.14],
    [22, 0.7, [36], 0.13],
    [24, 0.8, [29], 0.14],
    [30, 0.52, [33], 0.12],
    [32, 0.94, [36], 0.14],
    [38, 0.6, [31], 0.12],
    [40, 0.78, [40], 0.14],
    [46, 0.5, [38], 0.12],
    [48, 0.92, [31], 0.14],
    [54, 0.66, [35], 0.13],
    [56, 0.8, [31], 0.14],
    [62, 0.5, [29], 0.12],
  ]);
  const stab = 0.32;
  const chord = mapHits([
    [0, 0.66, [57, 60, 64], stab],
    [10, 0.48, [57, 60, 64], 0.22],
    [16, 0.64, [53, 57, 60], stab],
    [26, 0.46, [53, 57, 60], 0.22],
    [32, 0.66, [55, 60, 64], stab],
    [42, 0.48, [55, 60, 64], 0.22],
    [48, 0.66, [55, 59, 62], stab],
    [58, 0.5, [55, 59, 62], 0.22],
  ]);
  const lead = mapHits([
    [3, 0.6, [64], 0.14],
    [8, 0.55, [67], 0.12],
    [12, 0.62, [69], 0.16],
    [19, 0.7, [72], 0.16],
    [24, 0.58, [69], 0.14],
    [28, 0.52, [67], 0.14],
    [35, 0.64, [64], 0.15],
    [41, 0.5, [62], 0.14],
    [44, 0.58, [64], 0.12],
    [51, 0.66, [62], 0.16],
    [57, 0.55, [59], 0.16],
    [60, 0.6, [67], 0.18],
  ]);
  return { kick, snare, hat, hatOpen, bass, chord, lead };
}

const cache: Partial<Record<GrooveId, Pattern>> = {};

export function getPattern(id: GrooveId): Pattern {
  if (!cache[id]) {
    cache[id] = id === "boom" ? boom() : id === "broken" ? broken() : house();
  }
  return cache[id] as Pattern;
}
