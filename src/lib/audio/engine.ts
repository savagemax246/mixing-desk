import { getPattern } from "@/lib/audio/patterns";
import {
  nudge,
  playBass,
  playChord,
  playHat,
  playKick,
  playLead,
  playSnare,
  primeNoise,
  sharedNoise,
} from "@/lib/audio/voices";
import {
  CHANNEL_COUNT,
  type ConsoleData,
  dbToGain,
  faderToDb,
} from "@/lib/console-model";

type LiveState = ConsoleData & { playing: boolean };

type ChNodes = {
  input: GainNode;
  trim: GainNode;
  polarity: GainNode;
  hpf: BiquadFilterNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  pan: StereoPannerNode;
  fader: GainNode;
  duck: GainNode;
  send: GainNode;
  analyser: AnalyserNode;
  meter: Float32Array;
};

function readReduction(node: DynamicsCompressorNode) {
  const reduction = node.reduction as number | AudioParam | undefined;
  if (typeof reduction === "number") return reduction;
  if (reduction && typeof reduction.value === "number") return reduction.value;
  return 0;
}

function makeImpulse(ctx: AudioContext) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * 1.65);
  const buffer = ctx.createBuffer(2, length, rate);
  const taps = [0.006, 0.011, 0.017, 0.023, 0.031];
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * (1 - t) ** 2.7 * 0.45;
    }
    for (const tap of taps) {
      const idx = Math.floor(tap * rate);
      if (idx < length) data[idx] += (c === 0 ? 0.55 : -0.48) * (1 - tap * 8);
    }
    let prev = 0;
    for (let i = 0; i < length; i++) {
      const x = data[i] ?? 0;
      data[i] = x - prev * 0.96;
      prev = x;
    }
  }
  return buffer;
}

export class Engine {
  ctx: AudioContext | null = null;
  readonly peaks = new Float32Array(CHANNEL_COUNT + 2);
  readonly spectrum = new Uint8Array(1024);
  gr = 0;
  displayStep = -1;
  sampleRate = 48000;
  recStarted = 0;
  onRecordingStopped: (() => void) | null = null;

  private bootPromise: Promise<void> | null = null;
  private ch: ChNodes[] = [];
  private bus!: GainNode;
  private sendBus!: GainNode;
  private comp!: DynamicsCompressorNode;
  private makeup!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private masterFader!: GainNode;
  private sideL!: GainNode;
  private sideR!: GainNode;
  private eq: BiquadFilterNode[] = [];
  private spectrumNode!: AnalyserNode;
  private meterL!: AnalyserNode;
  private meterR!: AnalyserNode;
  private meterBufL = new Float32Array(1024);
  private meterBufR = new Float32Array(1024);
  private cache = new Map<string, number>();
  private frames = new Set<() => void>();
  private raf = 0;
  private timer = 0;
  private transportOn = false;
  private nextTime = 0;
  private step = 0;
  private stepTimes: Array<{ step: number; time: number }> = [];
  private files: Array<AudioBuffer | null> = Array.from({ length: CHANNEL_COUNT }, () => null);
  private fileStop: Array<(() => void) | null> = Array.from({ length: CHANNEL_COUNT }, () => null);
  private liveKey: string[] = Array.from({ length: CHANNEL_COUNT }, () => "");
  private liveStop: Array<(() => void) | null> = Array.from({ length: CHANNEL_COUNT }, () => null);
  private micStream: MediaStream | null = null;
  private micNode: MediaStreamAudioSourceNode | null = null;
  private micPending: Promise<boolean> | null = null;
  private rec: MediaRecorder | null = null;
  private recChunks: Blob[] = [];
  private recDest: MediaStreamAudioDestinationNode | null = null;
  private warned = false;

  get ready() {
    return this.ctx !== null;
  }

  hasFile(index: number) {
    return this.files[index] != null;
  }

  onFrame(fn: () => void) {
    this.frames.add(fn);
    return () => {
      this.frames.delete(fn);
    };
  }

  ensure() {
    if (!this.bootPromise) this.bootPromise = this.boot();
    return this.bootPromise;
  }

  private async boot() {
    const ctx = new AudioContext({ latencyHint: "interactive" });
    this.ctx = ctx;
    this.sampleRate = ctx.sampleRate;
    primeNoise(ctx);
    this.build(ctx);
    if (ctx.state === "suspended") await ctx.resume();
    this.tick();
    const state = currentState();
    if (state) this.apply(state);
  }

  private build(ctx: AudioContext) {
    this.bus = ctx.createGain();
    this.bus.channelCount = 2;
    this.bus.channelCountMode = "explicit";
    this.sendBus = ctx.createGain();

    const pre = ctx.createDelay(0.1);
    pre.delayTime.value = 0.026;
    const verb = ctx.createConvolver();
    verb.normalize = false;
    verb.buffer = makeImpulse(ctx);
    const verbHp = ctx.createBiquadFilter();
    verbHp.type = "highpass";
    verbHp.frequency.value = 180;
    const verbLp = ctx.createBiquadFilter();
    verbLp.type = "lowpass";
    verbLp.frequency.value = 6800;
    const verbGain = ctx.createGain();
    verbGain.gain.value = 0.85;
    this.sendBus.connect(pre);
    pre.connect(verb);
    verb.connect(verbHp);
    verbHp.connect(verbLp);
    verbLp.connect(verbGain);
    verbGain.connect(this.bus);

    this.ch = Array.from({ length: CHANNEL_COUNT }, () => {
      const input = ctx.createGain();
      const trim = ctx.createGain();
      const polarity = ctx.createGain();
      const hpf = ctx.createBiquadFilter();
      hpf.type = "highpass";
      const low = ctx.createBiquadFilter();
      low.type = "lowshelf";
      const mid = ctx.createBiquadFilter();
      mid.type = "peaking";
      const high = ctx.createBiquadFilter();
      high.type = "highshelf";
      const pan = ctx.createStereoPanner();
      const fader = ctx.createGain();
      const duck = ctx.createGain();
      const send = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.4;
      input.connect(trim);
      trim.connect(polarity);
      polarity.connect(hpf);
      hpf.connect(low);
      low.connect(mid);
      mid.connect(high);
      high.connect(pan);
      pan.connect(fader);
      fader.connect(duck);
      duck.connect(this.bus);
      duck.connect(send);
      send.connect(this.sendBus);
      duck.connect(analyser);
      return {
        input,
        trim,
        polarity,
        hpf,
        low,
        mid,
        high,
        pan,
        fader,
        duck,
        send,
        analyser,
        meter: new Float32Array(analyser.fftSize),
      };
    });

    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);
    this.bus.connect(splitter);
    const lToMid = ctx.createGain();
    const rToMid = ctx.createGain();
    const lToSide = ctx.createGain();
    const rToSide = ctx.createGain();
    lToMid.gain.value = 0.5;
    rToMid.gain.value = 0.5;
    lToSide.gain.value = 0.5;
    rToSide.gain.value = -0.5;
    const mid = ctx.createGain();
    const side = ctx.createGain();
    splitter.connect(lToMid, 0);
    splitter.connect(lToSide, 0);
    splitter.connect(rToMid, 1);
    splitter.connect(rToSide, 1);
    lToMid.connect(mid);
    rToMid.connect(mid);
    lToSide.connect(side);
    rToSide.connect(side);
    const midL = ctx.createGain();
    const midR = ctx.createGain();
    this.sideL = ctx.createGain();
    this.sideR = ctx.createGain();
    mid.connect(midL);
    mid.connect(midR);
    side.connect(this.sideL);
    side.connect(this.sideR);
    midL.connect(merger, 0, 0);
    this.sideL.connect(merger, 0, 0);
    midR.connect(merger, 0, 1);
    this.sideR.connect(merger, 0, 1);

    let node: AudioNode = merger;
    this.eq = Array.from({ length: 6 }, () => {
      const filter = ctx.createBiquadFilter();
      filter.type = "peaking";
      node.connect(filter);
      node = filter;
      return filter;
    });

    this.spectrumNode = ctx.createAnalyser();
    this.spectrumNode.fftSize = 2048;
    this.spectrumNode.smoothingTimeConstant = 0.82;
    this.spectrumNode.minDecibels = -100;
    this.spectrumNode.maxDecibels = -12;
    node.connect(this.spectrumNode);

    this.comp = ctx.createDynamicsCompressor();
    this.makeup = ctx.createGain();
    this.masterFader = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.08;
    node.connect(this.comp);
    this.comp.connect(this.makeup);
    this.makeup.connect(this.masterFader);
    this.masterFader.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    this.meterL = ctx.createAnalyser();
    this.meterR = ctx.createAnalyser();
    this.meterL.fftSize = 1024;
    this.meterR.fftSize = 1024;
    const outSplit = ctx.createChannelSplitter(2);
    this.limiter.connect(outSplit);
    outSplit.connect(this.meterL, 0);
    outSplit.connect(this.meterR, 1);

    this.recDest = ctx.createMediaStreamDestination();
    this.limiter.connect(this.recDest);
  }

  apply(state: LiveState) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const anySolo = state.channels.some((c) => c.solo);
    state.channels.forEach((ch, i) => {
      const nodes = this.ch[i];
      if (!nodes) return;
      const audible = !ch.mute && (!anySolo || ch.solo);
      const faderDb = audible ? faderToDb(ch.fader) : -80;
      this.glide(nodes.trim.gain, `trim${i}`, dbToGain(ch.trim), now);
      this.glide(nodes.fader.gain, `fader${i}`, dbToGain(faderDb), now);
      this.glide(nodes.send.gain, `send${i}`, ch.send, now);
      this.glide(nodes.pan.pan, `pan${i}`, ch.pan, now);
      const pol = ch.polarity ? -1 : 1;
      if (this.cache.get(`pol${i}`) !== pol) {
        this.cache.set(`pol${i}`, pol);
        nodes.polarity.gain.cancelScheduledValues(now);
        nodes.polarity.gain.setValueAtTime(pol, now);
      }
      const bypass = ch.eqBypass;
      this.glide(nodes.hpf.frequency, `hpf${i}`, bypass ? 20 : ch.hpf, now);
      this.glide(nodes.hpf.Q, `hpfq${i}`, 0.707, now);
      this.glide(nodes.low.frequency, `lf${i}`, ch.lowFreq, now);
      this.glide(nodes.low.gain, `lg${i}`, bypass ? 0 : ch.lowGain, now);
      this.glide(nodes.low.Q, `lq${i}`, 1, now);
      this.glide(nodes.mid.frequency, `mf${i}`, ch.midFreq, now);
      this.glide(nodes.mid.gain, `mg${i}`, bypass ? 0 : ch.midGain, now);
      this.glide(nodes.mid.Q, `mq${i}`, ch.midQ, now);
      this.glide(nodes.high.frequency, `hf${i}`, ch.highFreq, now);
      this.glide(nodes.high.gain, `hg${i}`, bypass ? 0 : ch.highGain, now);
      this.glide(nodes.high.Q, `hq${i}`, 1, now);
      if (!state.pump) {
        nodes.duck.gain.cancelScheduledValues(now);
        nodes.duck.gain.setValueAtTime(1, now);
      }
    });

    state.masterEq.forEach((band, i) => {
      const filter = this.eq[i];
      if (!filter) return;
      const bypass = state.masterEqBypass;
      this.glide(filter.frequency, `meqF${i}`, band.freq, now);
      this.glide(filter.gain, `meqG${i}`, bypass ? 0 : band.gain, now);
      this.glide(filter.Q, `meqQ${i}`, band.q, now);
    });

    this.glide(this.sideL.gain, "widthL", state.width, now);
    this.glide(this.sideR.gain, "widthR", -state.width, now);
    this.glide(this.comp.threshold, "cth", state.compOn ? state.threshold : 0, now);
    this.glide(this.comp.ratio, "cra", state.compOn ? state.ratio : 1, now);
    this.glide(this.comp.attack, "cat", state.compOn ? state.attack : 0.003, now);
    this.glide(this.comp.release, "cre", state.compOn ? state.release : 0.25, now);
    this.glide(this.comp.knee, "ckn", state.compOn ? 10 : 0, now);
    this.glide(this.makeup.gain, "makeup", dbToGain(state.compOn ? state.makeup : 0), now);
    this.glide(this.masterFader.gain, "master", dbToGain(faderToDb(state.masterFader)), now);
    this.glide(this.limiter.threshold, "lth", state.limiterOn ? -1 : 0, now);
    this.glide(this.limiter.ratio, "lra", state.limiterOn ? 20 : 1, now);
    this.glide(this.limiter.attack, "lat", 0.002, now);
    this.glide(this.limiter.release, "lre", state.limiterOn ? 0.08 : 0.25, now);

    if (state.playing && !this.transportOn) this.startTransport();
    else if (!state.playing && this.transportOn) this.stopTransport();
    this.syncLive(state);
    this.syncFiles(state);
  }

  private glide(param: AudioParam, key: string, value: number, now: number) {
    if (!Number.isFinite(value)) return;
    const prev = this.cache.get(key);
    if (prev !== undefined && Math.abs(prev - value) < 1e-4) return;
    this.cache.set(key, value);
    param.cancelScheduledValues(now);
    if (prev === undefined) param.setValueAtTime(value, now);
    else param.setTargetAtTime(value, now, 0.012);
  }

  private startTransport() {
    if (!this.ctx || this.transportOn) return;
    this.transportOn = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.06;
    this.stepTimes = [];
    this.timer = window.setInterval(() => this.pump(), 25);
  }

  private stopTransport() {
    this.transportOn = false;
    this.displayStep = -1;
    this.stepTimes = [];
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
    for (let i = 0; i < CHANNEL_COUNT; i++) this.stopFile(i);
  }

  private pump() {
    if (!this.ctx || !this.transportOn) return;
    const now = this.ctx.currentTime;
    if (this.nextTime < now) this.nextTime = now + 0.02;
    const horizon = now + 0.12;
    let guard = 0;
    while (this.nextTime < horizon && guard++ < 24) {
      this.schedule(this.step, this.nextTime);
      const state = this.read();
      const swing = Math.min(100, Math.max(0, state?.swing ?? 0)) / 100 * 0.48;
      const bpm = Math.min(180, Math.max(60, state?.bpm ?? 104));
      const grid = 60 / bpm / 4;
      const interval = this.step % 2 === 0 ? grid * (1 + swing) : grid * (1 - swing);
      this.stepTimes.push({ step: this.step, time: this.nextTime });
      this.nextTime += interval;
      this.step = (this.step + 1) % 64;
    }
  }

  private read(): LiveState | null {
    return currentState();
  }

  private schedule(step: number, time: number) {
    if (!this.ctx || time < this.ctx.currentTime + 0.004) return;
    const state = this.read();
    if (!state) return;
    try {
      const pattern = getPattern(state.groove);
      const hatTime = time + nudge(step) * 0.65;
      for (let i = 0; i < state.channels.length; i++) {
        const source = state.channels[i]?.source;
        const input = this.ch[i]?.input;
        if (!input) continue;
        if (source === "kick" && pattern.kick[step]! > 0) {
          const vel = pattern.kick[step]!;
          playKick(this.ctx, input, time, vel);
          if (state.pump && vel > 0.55) this.duckBassAndChords(state, time);
        } else if (source === "snare" && pattern.snare[step]! > 0) {
          playSnare(this.ctx, input, time, pattern.snare[step]!);
        } else if (source === "hat") {
          const open = pattern.hatOpen[step] ?? 0;
          if (open > 0) playHat(this.ctx, input, hatTime, open, true);
          else if ((pattern.hat[step] ?? 0) > 0) playHat(this.ctx, input, hatTime, pattern.hat[step]!, false);
        } else if (source === "bass") {
          const hit = pattern.bass.get(step);
          if (hit) playBass(this.ctx, input, time, hit.vel, hit.notes[0] ?? 33, hit.dur);
        } else if (source === "chord") {
          const hit = pattern.chord.get(step);
          if (hit) playChord(this.ctx, input, time, hit.vel, hit.notes, hit.dur);
        } else if (source === "lead") {
          const hit = pattern.lead.get(step);
          if (hit) playLead(this.ctx, input, time + nudge(step), hit.vel, hit.notes[0] ?? 64, hit.dur);
        }
      }
    } catch (err) {
      if (!this.warned) {
        this.warned = true;
        console.error(err);
      }
    }
  }

  private duckBassAndChords(state: ConsoleData, time: number) {
    state.channels.forEach((ch, i) => {
      if (ch.source !== "bass" && ch.source !== "chord") return;
      const gain = this.ch[i]?.duck.gain;
      if (!gain) return;
      gain.cancelScheduledValues(time);
      gain.setValueAtTime(1, time);
      gain.linearRampToValueAtTime(ch.source === "bass" ? 0.55 : 0.4, time + 0.012);
      gain.linearRampToValueAtTime(1, time + 0.22);
    });
  }

  private syncLive(state: ConsoleData) {
    const wantsMic = state.channels.some((c) => c.source === "mic");
    if (!wantsMic) this.releaseMic();
    for (let i = 0; i < CHANNEL_COUNT; i++) {
      const source = state.channels[i]?.source;
      const key = source === "noise" ? "noise" : source === "mic" && this.micStream ? "mic" : "";
      if (this.liveKey[i] === key) continue;
      this.clearLive(i);
      this.liveKey[i] = key;
      if (!this.ctx) continue;
      if (key === "noise") this.startNoise(i);
      if (key === "mic" && this.micStream) this.connectMic(i);
    }
  }

  private startNoise(index: number) {
    if (!this.ctx) return;
    const input = this.ch[index]?.input;
    if (!input) return;
    const src = this.ctx.createBufferSource();
    src.buffer = sharedNoise();
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.18;
    src.connect(gain);
    gain.connect(input);
    src.start();
    this.liveStop[index] = () => {
      try {
        src.stop();
      } catch {
        /* already */
      }
      src.disconnect();
      gain.disconnect();
    };
  }

  private connectMic(index: number) {
    if (!this.ctx || !this.micStream) return;
    if (!this.micNode) this.micNode = this.ctx.createMediaStreamSource(this.micStream);
    try {
      this.micNode.disconnect();
    } catch {
      /* first connect */
    }
    const input = this.ch[index]?.input;
    if (input) this.micNode.connect(input);
  }

  private clearLive(index: number) {
    this.liveStop[index]?.();
    this.liveStop[index] = null;
    if (this.liveKey[index] === "mic") {
      try {
        this.micNode?.disconnect();
      } catch {
        /* noop */
      }
    }
    this.liveKey[index] = "";
  }

  private releaseMic() {
    for (let i = 0; i < CHANNEL_COUNT; i++) {
      if (this.liveKey[i] === "mic") this.clearLive(i);
    }
    try {
      this.micNode?.disconnect();
    } catch {
      /* noop */
    }
    this.micNode = null;
    this.micStream?.getTracks().forEach((track) => track.stop());
    this.micStream = null;
  }

  async armMic() {
    await this.ensure();
    if (this.micStream) return true;
    if (this.micPending) return this.micPending;
    this.micPending = this.requestMic().finally(() => {
      this.micPending = null;
    });
    return this.micPending;
  }

  private async requestMic() {
    if (!navigator.mediaDevices?.getUserMedia || !this.ctx) return false;
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
      return true;
    } catch {
      this.micStream = null;
      return false;
    }
  }

  async loadFile(index: number, file: File) {
    await this.ensure();
    if (!this.ctx) throw new Error("Audio is unavailable");
    const encoded = await file.arrayBuffer();
    const audio = await this.ctx.decodeAudioData(encoded.slice(0));
    this.files[index] = audio;
    this.stopFile(index);
  }

  private syncFiles(state: ConsoleData) {
    for (let i = 0; i < CHANNEL_COUNT; i++) {
      const should = this.transportOn && state.channels[i]?.source === "file" && this.files[i];
      const running = this.fileStop[i] != null;
      if (should && !running) this.startFile(i);
      if (!should && running) this.stopFile(i);
    }
  }

  private startFile(index: number) {
    const buffer = this.files[index];
    const input = this.ch[index]?.input;
    if (!this.ctx || !buffer || !input) return;
    this.stopFile(index);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.85;
    src.connect(gain);
    gain.connect(input);
    src.start();
    this.fileStop[index] = () => {
      try {
        src.stop();
      } catch {
        /* already */
      }
      src.disconnect();
      gain.disconnect();
    };
  }

  private stopFile(index: number) {
    this.fileStop[index]?.();
    this.fileStop[index] = null;
  }

  beginRec() {
    if (!this.ctx || !this.recDest || this.rec) return false;
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    const mime = types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
    if (!mime && typeof MediaRecorder === "undefined") return false;
    try {
      this.recChunks = [];
      this.rec = mime ? new MediaRecorder(this.recDest.stream, { mimeType: mime }) : new MediaRecorder(this.recDest.stream);
      this.rec.ondataavailable = (event) => {
        if (event.data.size) this.recChunks.push(event.data);
      };
      this.rec.onstop = () => {
        const type = this.rec?.mimeType || mime || "audio/webm";
        const blob = new Blob(this.recChunks, { type });
        const ext = type.includes("mp4") || type.includes("aac") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `keel-mix.${ext}`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 2000);
        this.rec = null;
        this.recStarted = 0;
        this.onRecordingStopped?.();
      };
      this.rec.start(250);
      this.recStarted = performance.now();
      return true;
    } catch {
      this.rec = null;
      return false;
    }
  }

  finishRec() {
    if (!this.rec || this.rec.state === "inactive") return;
    try {
      this.rec.stop();
    } catch {
      this.rec = null;
      this.recStarted = 0;
      this.onRecordingStopped?.();
    }
  }

  private tick = () => {
    this.sample();
    if (this.recStarted && performance.now() - this.recStarted > 180000) this.finishRec();
    this.frames.forEach((fn) => fn());
    this.raf = requestAnimationFrame(this.tick);
  };

  private sample() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    while (this.stepTimes.length && (this.stepTimes[0]?.time ?? Infinity) <= now) {
      this.displayStep = this.stepTimes.shift()?.step ?? -1;
    }
    for (let i = 0; i < this.ch.length; i++) {
      const nodes = this.ch[i];
      if (!nodes) continue;
      nodes.analyser.getFloatTimeDomainData(nodes.meter as Float32Array<ArrayBuffer>);
      this.peaks[i] = ballistics(this.peaks[i] ?? -80, peakDb(nodes.meter));
    }
    this.meterL.getFloatTimeDomainData(this.meterBufL);
    this.meterR.getFloatTimeDomainData(this.meterBufR);
    this.peaks[CHANNEL_COUNT] = ballistics(this.peaks[CHANNEL_COUNT] ?? -80, peakDb(this.meterBufL));
    this.peaks[CHANNEL_COUNT + 1] = ballistics(this.peaks[CHANNEL_COUNT + 1] ?? -80, peakDb(this.meterBufR));
    this.gr = Math.abs(readReduction(this.comp));
    this.spectrumNode.getByteFrequencyData(this.spectrum);
  }
}

function peakDb(data: Float32Array) {
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i] ?? 0);
    if (v > peak) peak = v;
  }
  if (peak < 1e-5) return -80;
  return 20 * Math.log10(peak);
}

function ballistics(prev: number, next: number) {
  if (!Number.isFinite(prev)) return next;
  if (next > prev) return next;
  return Math.max(next, prev - 0.75);
}

let engine: Engine | null = null;
let stateReader: (() => LiveState | null) | null = null;

export function bindConsoleState(reader: () => LiveState) {
  stateReader = reader;
}

function currentState() {
  return stateReader?.() ?? null;
}

export function getEngine() {
  if (!engine) {
    engine = new Engine();
    for (let i = 0; i < engine.peaks.length; i++) engine.peaks[i] = -80;
  }
  return engine;
}
