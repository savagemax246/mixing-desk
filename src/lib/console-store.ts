import { create } from "zustand";
import { bindConsoleState } from "@/lib/audio/engine";
import {
  CHANNEL_COUNT,
  type Channel,
  type ConsoleData,
  type EqBand,
  type Focus,
  type UserPreset,
  cloneData,
  defaultData,
  sanitizeData,
} from "@/lib/console-model";
import { GROOVE_META, type GrooveId } from "@/lib/audio/patterns";

const STORAGE_KEY = "keel-console-v1";

export type ConsoleStore = ConsoleData & {
  playing: boolean;
  recording: boolean;
  micChannel: number | null;
  userPresets: UserPreset[];
  setChannel: (index: number, patch: Partial<Channel>) => void;
  setMasterEq: (index: number, patch: Partial<EqBand>) => void;
  setMaster: (patch: Partial<Pick<ConsoleData, "masterFader" | "masterEqBypass" | "width" | "compOn" | "threshold" | "ratio" | "attack" | "release" | "makeup" | "limiterOn" | "pump">>) => void;
  setBpm: (bpm: number) => void;
  setSwing: (swing: number) => void;
  setGroove: (groove: GrooveId) => void;
  setPlaying: (playing: boolean) => void;
  setRecording: (recording: boolean) => void;
  focusChannel: (index: number) => void;
  focusMaster: () => void;
  clearSolos: () => void;
  claimMic: (index: number | null) => void;
  loadData: (data: ConsoleData) => void;
  savePreset: (name: string) => boolean;
  loadPreset: (index: number) => void;
};

function dataOf(state: ConsoleStore): ConsoleData {
  return {
    channels: state.channels,
    masterFader: state.masterFader,
    masterEq: state.masterEq,
    masterEqBypass: state.masterEqBypass,
    width: state.width,
    compOn: state.compOn,
    threshold: state.threshold,
    ratio: state.ratio,
    attack: state.attack,
    release: state.release,
    makeup: state.makeup,
    limiterOn: state.limiterOn,
    bpm: state.bpm,
    swing: state.swing,
    groove: state.groove,
    pump: state.pump,
    focus: state.focus,
    presetLabel: state.presetLabel,
  };
}

export function snapshotOf(state: ConsoleStore) {
  return cloneData(dataOf(state));
}

export const useConsole = create<ConsoleStore>((set, get) => ({
  ...defaultData(),
  playing: false,
  recording: false,
  micChannel: null,
  userPresets: [],
  setChannel: (index, patch) =>
    set((state) => {
      let micChannel = state.micChannel;
      if (patch.source && patch.source !== "mic" && micChannel === index) micChannel = null;
      return {
        micChannel,
        presetLabel: state.presetLabel,
        channels: state.channels.map((channel, i) => (i === index ? { ...channel, ...patch } : channel)),
      };
    }),
  setMasterEq: (index, patch) =>
    set((state) => ({
      masterEq: state.masterEq.map((band, i) => (i === index ? { ...band, ...patch } : band)),
    })),
  setMaster: (patch) => set(patch),
  setBpm: (bpm) => set({ bpm: Math.round(Math.min(180, Math.max(60, bpm))) }),
  setSwing: (swing) => set({ swing: Math.min(100, Math.max(0, swing)) }),
  setGroove: (groove) =>
    set({
      groove,
      bpm: GROOVE_META[groove].bpm,
      swing: GROOVE_META[groove].swing,
    }),
  setPlaying: (playing) => set({ playing }),
  setRecording: (recording) => set({ recording }),
  focusChannel: (index) => set({ focus: { kind: "channel", index } satisfies Focus }),
  focusMaster: () => set({ focus: { kind: "master" } }),
  clearSolos: () =>
    set((state) => ({
      channels: state.channels.map((channel) => (channel.solo ? { ...channel, solo: false } : channel)),
    })),
  claimMic: (index) =>
    set((state) => ({
      micChannel: index,
      channels: state.channels.map((channel, i) => {
        if (index === null) return channel;
        if (i === index) return { ...channel, source: "mic" as const };
        if (channel.source === "mic") return { ...channel, source: "off" as const };
        return channel;
      }),
    })),
  loadData: (data) =>
    set((state) => ({
      ...cloneData(data),
      userPresets: state.userPresets,
      playing: state.playing,
      recording: state.recording,
      micChannel: data.channels.some((channel) => channel.source === "mic") ? state.micChannel : null,
    })),
  savePreset: (name) => {
    const trimmed = name.trim().slice(0, 32);
    if (!trimmed) return false;
    const snapshot = snapshotOf({ ...get(), presetLabel: trimmed });
    set((state) => {
      if (state.userPresets.length >= 24 && !state.userPresets.some((preset) => preset.name === trimmed)) {
        return state;
      }
      const existing = state.userPresets.findIndex((preset) => preset.name === trimmed);
      const entry = { name: trimmed, snapshot };
      const userPresets =
        existing >= 0
          ? state.userPresets.map((preset, i) => (i === existing ? entry : preset))
          : [...state.userPresets, entry];
      return { userPresets, presetLabel: trimmed };
    });
    return get().presetLabel === trimmed;
  },
  loadPreset: (index) => {
    const preset = get().userPresets[index];
    if (!preset) return;
    get().loadData(preset.snapshot);
  },
}));

bindConsoleState(() => {
  const state = useConsole.getState();
  return { ...dataOf(state), playing: state.playing };
});

export function partialize(state: ConsoleStore) {
  return {
    ...snapshotOf(state),
    userPresets: state.userPresets,
  };
}

export function loadSaved() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { data?: unknown; userPresets?: unknown };
    const data = sanitizeData(parsed.data);
    const userPresets = Array.isArray(parsed.userPresets)
      ? parsed.userPresets.flatMap((entry) => {
          if (!entry || typeof entry !== "object") return [];
          const name = "name" in entry && typeof entry.name === "string" ? entry.name.trim().slice(0, 32) : "";
          const snapshot = "snapshot" in entry ? sanitizeData(entry.snapshot) : null;
          if (!name || !snapshot) return [];
          return [{ name, snapshot }];
        }).slice(0, 24)
      : [];
    if (data) useConsole.getState().loadData(data);
    if (userPresets.length) useConsole.setState({ userPresets });
    if (data) useConsole.setState({ presetLabel: data.presetLabel });
  } catch {
    /* ignore broken local saves */
  }
}

let saveTimer = 0;

export function scheduleSave(state: ConsoleStore) {
  if (typeof window === "undefined") return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const payload = {
      data: snapshotOf(state),
      userPresets: state.userPresets,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, 250);
}

export function scenes(): Array<{ id: string; name: string; detail: string; data: ConsoleData }> {
  const session = defaultData();
  const punch = cloneData(session);
  punch.presetLabel = "Punch";
  punch.threshold = -22;
  punch.ratio = 4.2;
  punch.attack = 0.006;
  punch.makeup = 3;
  punch.channels = punch.channels.map((channel, index) => {
    if (index === 0) return { ...channel, fader: 0.86, lowGain: 4, lowFreq: 90 };
    if (index === 3) return { ...channel, fader: 0.84, lowGain: 3.4 };
    return channel;
  });
  punch.masterEq = punch.masterEq.map((band, index) => (index === 0 ? { ...band, gain: 2.6 } : band));

  const air = cloneData(session);
  air.presetLabel = "Air";
  air.width = 1.32;
  air.threshold = -16;
  air.ratio = 1.8;
  air.makeup = 1;
  air.channels = air.channels.map((channel, index) => {
    if (index === 2) return { ...channel, highGain: 4, send: 0.16 };
    if (index === 5) return { ...channel, highGain: 3.4, send: 0.24 };
    if (index === 4) return { ...channel, send: 0.36, highGain: 2.4 };
    return channel;
  });
  air.masterEq = air.masterEq.map((band, index) => (index === 5 ? { ...band, gain: 3.6 } : index === 4 ? { ...band, gain: 2.2 } : band));

  const night = cloneData(session);
  night.presetLabel = "Night";
  night.width = 0.86;
  night.threshold = -20;
  night.ratio = 2.8;
  night.pump = true;
  night.channels = night.channels.map((channel) => ({
    ...channel,
    highGain: Math.min(channel.highGain, 0) - 1.5,
    send: Math.min(1, channel.send + 0.1),
  }));
  night.masterEq = night.masterEq.map((band, index) => {
    if (index === 4) return { ...band, gain: -1.4 };
    if (index === 5) return { ...band, gain: -2.6 };
    if (index === 0) return { ...band, gain: 2 };
    return band;
  });

  const radio = cloneData(session);
  radio.presetLabel = "Radio";
  radio.threshold = -26;
  radio.ratio = 6;
  radio.makeup = 4.5;
  radio.attack = 0.008;
  radio.release = 0.12;
  radio.width = 0.92;
  radio.masterEq = radio.masterEq.map((band, index) => {
    if (index === 0) return { ...band, gain: -0.6 };
    if (index === 3) return { ...band, gain: 2.8 };
    if (index === 4) return { ...band, gain: 2.4 };
    return band;
  });

  const wide = cloneData(session);
  wide.presetLabel = "Wide";
  wide.width = 1.45;
  wide.channels = wide.channels.map((channel, index) => {
    const pans = [0, -0.4, 0.62, 0, -0.7, 0.74];
    return { ...channel, pan: pans[index] ?? channel.pan, send: Math.min(1, channel.send + 0.06) };
  });

  const dry = cloneData(session);
  dry.presetLabel = "Dry";
  dry.compOn = false;
  dry.pump = false;
  dry.width = 1;
  dry.masterEqBypass = false;
  dry.masterEq = dry.masterEq.map((band) => ({ ...band, gain: 0 }));
  dry.channels = dry.channels.map((channel) => ({
    ...channel,
    send: 0,
    trim: 0,
    lowGain: 0,
    midGain: 0,
    highGain: 0,
    hpf: channel.source === "hat" ? 40 : 20,
    eqBypass: false,
  }));

  return [
    { id: "session", name: "Session", detail: "Balanced groove", data: session },
    { id: "punch", name: "Punch", detail: "Kick, bass, faster comp", data: punch },
    { id: "air", name: "Air", detail: "Open top and space", data: air },
    { id: "night", name: "Night", detail: "Darker, wetter", data: night },
    { id: "radio", name: "Radio", detail: "Dense and forward", data: radio },
    { id: "wide", name: "Wide", detail: "Hard pans, extra width", data: wide },
    { id: "dry", name: "Dry", detail: "Flat EQ, no space", data: dry },
  ];
}

export const CHANNEL_TOTAL = CHANNEL_COUNT;
