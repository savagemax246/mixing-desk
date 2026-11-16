export const CHANNEL_COUNT = 6;

export type GrooveId = "house" | "boom" | "broken";

export type SourceKind =
  | "kick"
  | "snare"
  | "hat"
  | "bass"
  | "chord"
  | "lead"
  | "noise"
  | "file"
  | "mic"
  | "off";

export type Focus = { kind: "master" } | { kind: "channel"; index: number };

export type EqBand = { freq: number; gain: number; q: number };

export type Channel = {
  id: string;
  name: string;
  source: SourceKind;
  fileName: string | null;
  trim: number;
  pan: number;
  send: number;
  mute: boolean;
  solo: boolean;
  polarity: boolean;
  fader: number;
  hpf: number;
  lowGain: number;
  lowFreq: number;
  midGain: number;
  midFreq: number;
  midQ: number;
  highGain: number;
  highFreq: number;
  eqBypass: boolean;
};

export type ConsoleData = {
  channels: Channel[];
  masterFader: number;
  masterEq: EqBand[];
  masterEqBypass: boolean;
  width: number;
  compOn: boolean;
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  makeup: number;
  limiterOn: boolean;
  bpm: number;
  swing: number;
  groove: GrooveId;
  pump: boolean;
  focus: Focus;
  presetLabel: string;
};

export type UserPreset = { name: string; snapshot: ConsoleData };

export const UNITY_FADER = 0.78;

export const SOURCES: { id: SourceKind; label: string }[] = [
  { id: "kick", label: "Kick" },
  { id: "snare", label: "Snare" },
  { id: "hat", label: "Hat" },
  { id: "bass", label: "Bass" },
  { id: "chord", label: "Chords" },
  { id: "lead", label: "Lead" },
  { id: "noise", label: "Noise" },
  { id: "file", label: "Audio file" },
  { id: "mic", label: "Microphone" },
  { id: "off", label: "Off" },
];

const SOURCE_IDS = new Set<string>(SOURCES.map((s) => s.id));

export const MASTER_RANGES: Array<[number, number]> = [
  [35, 140],
  [120, 400],
  [280, 1000],
  [700, 2400],
  [1600, 6200],
  [4000, 16000],
];

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function dbToGain(db: number) {
  if (db <= -79) return 0;
  return 10 ** (db / 20);
}

export function faderToDb(t: number) {
  const x = clamp(t, 0, 1);
  if (x <= 0.0008) return -80;
  if (x < UNITY_FADER) {
    const n = x / UNITY_FADER;
    return -60 * (1 - n) ** 1.45;
  }
  return ((x - UNITY_FADER) / (1 - UNITY_FADER)) * 6;
}

export function dbToFader(db: number) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (faderToDb(mid) < db) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function formatDb(db: number) {
  if (!Number.isFinite(db) || db <= -59) return "−∞";
  const rounded = Math.round(db * 10) / 10;
  const abs = Math.abs(rounded).toFixed(1);
  if (rounded > 0.05) return `+${abs}`;
  if (rounded < -0.05) return `−${abs}`;
  return "0.0";
}

export function formatDbShort(db: number) {
  if (!Number.isFinite(db) || db <= -59) return "−∞";
  const rounded = Math.round(db);
  if (rounded > 0) return `+${rounded}`;
  if (rounded < 0) return `−${Math.abs(rounded)}`;
  return "0";
}

export function formatHz(hz: number) {
  if (hz >= 1000) {
    const v = hz / 1000;
    const text = v >= 10 ? v.toFixed(0) : v.toFixed(v >= 2 ? 1 : 2);
    return `${text.replace(/\.0$/, "")} kHz`;
  }
  return `${Math.round(hz)} Hz`;
}

export function formatHzShort(hz: number) {
  if (hz >= 1000) {
    const v = hz / 1000;
    const text = v >= 10 ? v.toFixed(0) : v.toFixed(1);
    return `${text.replace(/\.0$/, "")}k`;
  }
  return String(Math.round(hz));
}

export function formatPan(p: number) {
  if (Math.abs(p) < 0.03) return "C";
  const n = Math.round(Math.abs(p) * 100);
  return p < 0 ? `L${n}` : `R${n}`;
}

export function formatMs(seconds: number) {
  return `${Math.round(seconds * 1000)}`;
}

export function formatRatio(r: number) {
  return r >= 10 ? `${r.toFixed(0)}:1` : `${r.toFixed(1)}:1`;
}

function num(v: unknown, fallback: number, min: number, max: number) {
  return typeof v === "number" && Number.isFinite(v) ? clamp(v, min, max) : fallback;
}

function cleanName(v: unknown, fallback: string, max = 24) {
  if (typeof v !== "string") return fallback;
  const t = v.replace(/\s+/g, " ").trim().slice(0, max);
  return t || fallback;
}

const CHANNEL_SEED: Array<Pick<
  Channel,
  | "name"
  | "source"
  | "fader"
  | "pan"
  | "send"
  | "hpf"
  | "lowGain"
  | "lowFreq"
  | "midGain"
  | "midFreq"
  | "midQ"
  | "highGain"
  | "highFreq"
>> = [
  {
    name: "Kick",
    source: "kick",
    fader: 0.8,
    pan: 0,
    send: 0.03,
    hpf: 28,
    lowGain: 2.4,
    lowFreq: 100,
    midGain: 0,
    midFreq: 250,
    midQ: 0.9,
    highGain: -1.6,
    highFreq: 6500,
  },
  {
    name: "Snare",
    source: "snare",
    fader: 0.74,
    pan: -0.06,
    send: 0.16,
    hpf: 90,
    lowGain: -1.2,
    lowFreq: 180,
    midGain: 2.2,
    midFreq: 1800,
    midQ: 1.15,
    highGain: 1.6,
    highFreq: 7200,
  },
  {
    name: "Hat",
    source: "hat",
    fader: 0.6,
    pan: 0.22,
    send: 0.1,
    hpf: 240,
    lowGain: -2.5,
    lowFreq: 320,
    midGain: 0.6,
    midFreq: 4500,
    midQ: 0.9,
    highGain: 2.8,
    highFreq: 8500,
  },
  {
    name: "Bass",
    source: "bass",
    fader: 0.78,
    pan: 0,
    send: 0.04,
    hpf: 26,
    lowGain: 2,
    lowFreq: 90,
    midGain: -1.2,
    midFreq: 420,
    midQ: 0.85,
    highGain: -3.2,
    highFreq: 2400,
  },
  {
    name: "Chords",
    source: "chord",
    fader: 0.58,
    pan: -0.28,
    send: 0.28,
    hpf: 140,
    lowGain: -0.8,
    lowFreq: 220,
    midGain: 0.8,
    midFreq: 1400,
    midQ: 1,
    highGain: 1.4,
    highFreq: 7800,
  },
  {
    name: "Lead",
    source: "lead",
    fader: 0.64,
    pan: 0.34,
    send: 0.18,
    hpf: 180,
    lowGain: -1.5,
    lowFreq: 260,
    midGain: 2,
    midFreq: 2800,
    midQ: 1.25,
    highGain: 2.2,
    highFreq: 7000,
  },
];

export function defaultChannel(index: number): Channel {
  const seed = CHANNEL_SEED[index] ?? CHANNEL_SEED[0];
  return {
    id: `ch-${index + 1}`,
    name: seed.name,
    source: seed.source,
    fileName: null,
    trim: 0,
    pan: seed.pan,
    send: seed.send,
    mute: false,
    solo: false,
    polarity: false,
    fader: seed.fader,
    hpf: seed.hpf,
    lowGain: seed.lowGain,
    lowFreq: seed.lowFreq,
    midGain: seed.midGain,
    midFreq: seed.midFreq,
    midQ: seed.midQ,
    highGain: seed.highGain,
    highFreq: seed.highFreq,
    eqBypass: false,
  };
}

export function defaultMasterEq(): EqBand[] {
  return [
    { freq: 80, gain: 1.2, q: 1 },
    { freq: 220, gain: 0.2, q: 1.1 },
    { freq: 520, gain: -0.8, q: 1.05 },
    { freq: 1250, gain: 0.7, q: 1.1 },
    { freq: 3200, gain: 1.3, q: 1 },
    { freq: 8200, gain: 1.7, q: 0.9 },
  ];
}

export function defaultData(): ConsoleData {
  return {
    channels: Array.from({ length: CHANNEL_COUNT }, (_, i) => defaultChannel(i)),
    masterFader: 0.74,
    masterEq: defaultMasterEq(),
    masterEqBypass: false,
    width: 1,
    compOn: true,
    threshold: -18,
    ratio: 2.4,
    attack: 0.012,
    release: 0.18,
    makeup: 1.5,
    limiterOn: true,
    bpm: 104,
    swing: 14,
    groove: "house",
    pump: true,
    focus: { kind: "channel", index: 0 },
    presetLabel: "Session",
  };
}

function cleanChannel(raw: unknown, index: number): Channel {
  const base = defaultChannel(index);
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Partial<Channel>;
  const source = typeof o.source === "string" && SOURCE_IDS.has(o.source) ? (o.source as SourceKind) : base.source;
  return {
    id: cleanName(o.id, base.id, 16),
    name: cleanName(o.name, base.name),
    source,
    fileName: typeof o.fileName === "string" && o.fileName.trim() ? cleanName(o.fileName, "", 80) || null : null,
    trim: num(o.trim, base.trim, -12, 12),
    pan: num(o.pan, base.pan, -1, 1),
    send: num(o.send, base.send, 0, 1),
    mute: Boolean(o.mute),
    solo: Boolean(o.solo),
    polarity: Boolean(o.polarity),
    fader: num(o.fader, base.fader, 0, 1),
    hpf: num(o.hpf, base.hpf, 20, 500),
    lowGain: num(o.lowGain, base.lowGain, -12, 12),
    lowFreq: num(o.lowFreq, base.lowFreq, 50, 480),
    midGain: num(o.midGain, base.midGain, -12, 12),
    midFreq: num(o.midFreq, base.midFreq, 180, 7500),
    midQ: num(o.midQ, base.midQ, 0.35, 8),
    highGain: num(o.highGain, base.highGain, -12, 12),
    highFreq: num(o.highFreq, base.highFreq, 1200, 16000),
    eqBypass: Boolean(o.eqBypass),
  };
}

function cleanBand(raw: unknown, index: number): EqBand {
  const base = defaultMasterEq()[index] ?? { freq: 1000, gain: 0, q: 1 };
  const range = MASTER_RANGES[index] ?? [40, 16000];
  if (!raw || typeof raw !== "object") return { ...base };
  const o = raw as Partial<EqBand>;
  return {
    freq: num(o.freq, base.freq, range[0], range[1]),
    gain: num(o.gain, base.gain, -12, 12),
    q: num(o.q, base.q, 0.35, 8),
  };
}

export function sanitizeData(raw: unknown): ConsoleData | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<ConsoleData>;
  if (!Array.isArray(o.channels) || o.channels.length !== CHANNEL_COUNT) return null;
  const base = defaultData();
  const groove: GrooveId = o.groove === "boom" || o.groove === "broken" || o.groove === "house" ? o.groove : "house";
  let focus: Focus = base.focus;
  if (o.focus && typeof o.focus === "object") {
    if (o.focus.kind === "master") focus = { kind: "master" };
    else if (o.focus.kind === "channel" && typeof o.focus.index === "number") {
      focus = { kind: "channel", index: clamp(Math.round(o.focus.index), 0, CHANNEL_COUNT - 1) };
    }
  }
  return {
    channels: o.channels.map((c, i) => cleanChannel(c, i)),
    masterFader: num(o.masterFader, base.masterFader, 0, 1),
    masterEq: Array.from({ length: 6 }, (_, i) => cleanBand(o.masterEq?.[i], i)),
    masterEqBypass: Boolean(o.masterEqBypass),
    width: num(o.width, base.width, 0, 1.6),
    compOn: o.compOn !== false,
    threshold: num(o.threshold, base.threshold, -40, 0),
    ratio: num(o.ratio, base.ratio, 1, 12),
    attack: num(o.attack, base.attack, 0.001, 0.08),
    release: num(o.release, base.release, 0.04, 0.6),
    makeup: num(o.makeup, base.makeup, 0, 12),
    limiterOn: o.limiterOn !== false,
    bpm: Math.round(num(o.bpm, base.bpm, 60, 180)),
    swing: num(o.swing, base.swing, 0, 100),
    groove,
    pump: o.pump !== false,
    focus,
    presetLabel: cleanName(o.presetLabel, "Custom", 32),
  };
}

export function cloneData(data: ConsoleData): ConsoleData {
  return {
    ...data,
    channels: data.channels.map((c) => ({ ...c })),
    masterEq: data.masterEq.map((b) => ({ ...b })),
    focus: data.focus.kind === "master" ? { kind: "master" } : { kind: "channel", index: data.focus.index },
  };
}

export function isAudioFile(file: File) {
  if (file.type.startsWith("audio/") || file.type === "video/mp4") return true;
  return /\.(wav|mp3|ogg|flac|m4a|aac|aiff|aif|webm|mp4|caf)$/i.test(file.name);
}
