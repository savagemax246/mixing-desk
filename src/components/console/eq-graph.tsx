import { useEffect, useRef } from "react";
import { curveDb, type BandSpec } from "@/lib/audio/eq";
import { getEngine } from "@/lib/audio/engine";
import {
  MASTER_RANGES,
  clamp,
  formatDb,
  formatHz,
  type Channel,
  type ConsoleData,
  type EqBand,
} from "@/lib/console-model";
import { useConsole } from "@/lib/console-store";

const DB_SPAN = 14;

type NodeHit = { kind: "hpf" } | { kind: "low" } | { kind: "mid" } | { kind: "high" } | { kind: "master"; index: number };

type Box = { left: number; top: number; plotW: number; plotH: number; width: number; height: number };

function boxOf(width: number, height: number): Box {
  const left = 34;
  const top = 10;
  const plotW = Math.max(1, width - left - 10);
  const plotH = Math.max(1, height - top - 20);
  return { left, top, plotW, plotH, width, height };
}

function freqToX(freq: number, box: Box) {
  const t = (Math.log(freq) - Math.log(20)) / (Math.log(20000) - Math.log(20));
  return box.left + clamp(t, 0, 1) * box.plotW;
}

function xToFreq(x: number, box: Box) {
  const t = clamp((x - box.left) / box.plotW, 0, 1);
  return Math.exp(Math.log(20) + t * (Math.log(20000) - Math.log(20)));
}

function dbToY(db: number, box: Box) {
  const t = (DB_SPAN - db) / (DB_SPAN * 2);
  return box.top + clamp(t, 0, 1) * box.plotH;
}

function yToDb(y: number, box: Box) {
  const t = clamp((y - box.top) / box.plotH, 0, 1);
  return DB_SPAN - t * DB_SPAN * 2;
}

function channelBands(channel: Channel): BandSpec[] {
  return [
    { type: "highpass", freq: channel.hpf, q: 0.707, gain: 0 },
    { type: "lowshelf", freq: channel.lowFreq, q: 1, gain: channel.lowGain },
    { type: "peaking", freq: channel.midFreq, q: channel.midQ, gain: channel.midGain },
    { type: "highshelf", freq: channel.highFreq, q: 1, gain: channel.highGain },
  ];
}

function masterBands(bands: EqBand[]): BandSpec[] {
  return bands.map((band) => ({ type: "peaking", freq: band.freq, q: band.q, gain: band.gain }));
}

function bandsFor(state: ConsoleData): BandSpec[] {
  if (state.focus.kind === "master") return masterBands(state.masterEq);
  return channelBands(state.channels[state.focus.index] ?? state.channels[0]!);
}

function nodeList(state: ConsoleData): NodeHit[] {
  if (state.focus.kind === "master") return state.masterEq.map((_, index) => ({ kind: "master", index }));
  return [{ kind: "hpf" }, { kind: "low" }, { kind: "mid" }, { kind: "high" }];
}

function nodePos(node: NodeHit, state: ConsoleData, box: Box, sampleRate: number) {
  const bands = bandsFor(state);
  if (state.focus.kind === "channel") {
    const channel = state.channels[state.focus.index];
    if (!channel) return { x: 0, y: 0 };
    if (node.kind === "hpf") {
      return { x: freqToX(channel.hpf, box), y: dbToY(curveDb(bands, channel.hpf, sampleRate), box) };
    }
    if (node.kind === "low") return { x: freqToX(channel.lowFreq, box), y: dbToY(channel.lowGain, box) };
    if (node.kind === "mid") return { x: freqToX(channel.midFreq, box), y: dbToY(channel.midGain, box) };
    if (node.kind === "high") return { x: freqToX(channel.highFreq, box), y: dbToY(channel.highGain, box) };
  }
  if (node.kind === "master") {
    const band = state.masterEq[node.index];
    if (!band) return { x: 0, y: 0 };
    return { x: freqToX(band.freq, box), y: dbToY(band.gain, box) };
  }
  return { x: 0, y: 0 };
}

function nodeQ(node: NodeHit, state: ConsoleData) {
  if (node.kind === "mid" && state.focus.kind === "channel") return state.channels[state.focus.index]?.midQ ?? 1;
  if (node.kind === "master") return state.masterEq[node.index]?.q ?? 1;
  return 1;
}

function applyNode(node: NodeHit, freq: number, gain: number, q: number | null) {
  const api = useConsole.getState();
  const g = clamp(gain, -12, 12);
  if (api.focus.kind === "channel") {
    const index = api.focus.index;
    if (node.kind === "hpf") api.setChannel(index, { hpf: clamp(freq, 20, 500) });
    if (node.kind === "low") api.setChannel(index, { lowFreq: clamp(freq, 50, 480), lowGain: g });
    if (node.kind === "mid") {
      api.setChannel(index, {
        midFreq: clamp(freq, 180, 7500),
        midGain: g,
        ...(q !== null ? { midQ: clamp(q, 0.35, 8) } : {}),
      });
    }
    if (node.kind === "high") api.setChannel(index, { highFreq: clamp(freq, 1200, 16000), highGain: g });
    return;
  }
  if (node.kind === "master") {
    const range = MASTER_RANGES[node.index] ?? [40, 16000];
    api.setMasterEq(node.index, {
      freq: clamp(freq, range[0], range[1]),
      gain: g,
      ...(q !== null ? { q: clamp(q, 0.35, 8) } : {}),
    });
  }
}

function resetNode(node: NodeHit) {
  const api = useConsole.getState();
  if (api.focus.kind === "channel") {
    const index = api.focus.index;
    if (node.kind === "hpf") api.setChannel(index, { hpf: 28 });
    if (node.kind === "low") api.setChannel(index, { lowGain: 0 });
    if (node.kind === "mid") api.setChannel(index, { midGain: 0 });
    if (node.kind === "high") api.setChannel(index, { highGain: 0 });
    return;
  }
  if (node.kind === "master") api.setMasterEq(node.index, { gain: 0 });
}

function readoutFor(state: ConsoleData, active: NodeHit | null) {
  if (active?.kind === "master") {
    const band = state.masterEq[active.index];
    if (!band) return "";
    return `${formatHz(band.freq)}   ${formatDb(band.gain)}   Q ${band.q.toFixed(2)}`;
  }
  if (state.focus.kind === "channel") {
    const channel = state.channels[state.focus.index];
    if (!channel) return "";
    if (active?.kind === "hpf") return `HPF ${formatHz(channel.hpf)}`;
    if (active?.kind === "low") return `Low ${formatHz(channel.lowFreq)}   ${formatDb(channel.lowGain)}`;
    if (active?.kind === "mid") {
      return `Mid ${formatHz(channel.midFreq)}   ${formatDb(channel.midGain)}   Q ${channel.midQ.toFixed(2)}`;
    }
    if (active?.kind === "high") return `High ${formatHz(channel.highFreq)}   ${formatDb(channel.highGain)}`;
    return `HPF ${formatHz(channel.hpf)}   L ${formatDb(channel.lowGain)}   M ${formatDb(channel.midGain)}   H ${formatDb(channel.highGain)}`;
  }
  return state.masterEq.map((band) => formatDb(band.gain)).join("  ");
}

function cssVar(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function hexToRgba(hex: string, alpha: number) {
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return `rgba(232,230,225,${alpha})`;
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function EqGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ node: NodeHit; startQ: number; startY: number; qMode: boolean } | null>(null);
  const focusKind = useConsole((state) => state.focus.kind);
  const focusIndex = useConsole((state) => (state.focus.kind === "channel" ? state.focus.index : -1));
  const bypass = useConsole((state) =>
    state.focus.kind === "master" ? state.masterEqBypass : (state.channels[state.focus.index]?.eqBypass ?? false),
  );
  const targetName = useConsole((state) =>
    state.focus.kind === "master" ? "Master" : (state.channels[state.focus.index]?.name ?? "Channel"),
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width < 2 || height < 2) {
        frame = requestAnimationFrame(draw);
        return;
      }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const bw = Math.floor(width * dpr);
      const bh = Math.floor(height * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const box = boxOf(width, height);
      const state = useConsole.getState();
      const sampleRate = getEngine().sampleRate;
      const ink = cssVar("--color-ink", "#e8e6e1");
      const muted = cssVar("--color-muted", "#9a968e");
      const canvasColor = cssVar("--color-canvas", "#0e0f11");
      const bypassed =
        state.focus.kind === "master" ? state.masterEqBypass : (state.channels[state.focus.index]?.eqBypass ?? false);
      const bands = bandsFor(state);

      ctx.clearRect(0, 0, width, height);
      ctx.font = "11px 'IBM Plex Mono', ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 1;
      ctx.strokeStyle = hexToRgba(ink, 0.12);
      for (const db of [12, 6, 0, -6, -12]) {
        const y = dbToY(db, box);
        ctx.beginPath();
        ctx.moveTo(box.left, y);
        ctx.lineTo(box.left + box.plotW, y);
        ctx.stroke();
        ctx.fillStyle = muted;
        ctx.textAlign = "right";
        ctx.fillText(db > 0 ? `+${db}` : String(db), box.left - 6, y);
      }
      ctx.strokeStyle = hexToRgba(ink, 0.28);
      ctx.beginPath();
      const zero = dbToY(0, box);
      ctx.moveTo(box.left, zero);
      ctx.lineTo(box.left + box.plotW, zero);
      ctx.stroke();

      const freqLabels = width < 560 ? [100, 1000, 10000] : [50, 100, 200, 500, 1000, 2000, 5000, 10000];
      ctx.fillStyle = muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      for (const freq of freqLabels) {
        const x = freqToX(freq, box);
        ctx.strokeStyle = hexToRgba(ink, 0.08);
        ctx.beginPath();
        ctx.moveTo(x, box.top);
        ctx.lineTo(x, box.top + box.plotH);
        ctx.stroke();
        const label = freq >= 1000 ? `${freq / 1000}k` : String(freq);
        ctx.fillText(label, x, box.top + box.plotH + 14);
      }

      const spectrum = getEngine().spectrum;
      let peak = 0;
      for (let i = 0; i < spectrum.length; i++) peak = Math.max(peak, spectrum[i] ?? 0);
      if (peak > 0 && getEngine().ready) {
        const nyquist = sampleRate / 2;
        ctx.beginPath();
        ctx.moveTo(box.left, box.top + box.plotH);
        for (let x = 0; x <= box.plotW; x += 2) {
          const freq = xToFreq(box.left + x, box);
          const bin = Math.min(spectrum.length - 1, Math.round((freq / nyquist) * (spectrum.length - 1)));
          const mag = (spectrum[bin] ?? 0) / 255;
          const y = box.top + (1 - mag) * box.plotH;
          ctx.lineTo(box.left + x, y);
        }
        ctx.lineTo(box.left + box.plotW, box.top + box.plotH);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(ink, 0.1);
        ctx.fill();
      }

      ctx.beginPath();
      const steps = Math.max(48, Math.floor(box.plotW / 3));
      for (let i = 0; i <= steps; i++) {
        const freq = 20 * (20000 / 20) ** (i / steps);
        const db = curveDb(bands, freq, sampleRate);
        const x = freqToX(freq, box);
        const y = dbToY(db, box);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.75;
      ctx.setLineDash(bypassed ? [4, 4] : []);
      ctx.stroke();
      ctx.setLineDash([]);

      const active = drag.current?.node ?? null;
      for (const node of nodeList(state)) {
        const pos = nodePos(node, state, box, sampleRate);
        const selected = active?.kind === node.kind && (node.kind !== "master" || active.kind !== "master" || active.index === node.index);
        ctx.beginPath();
        if (node.kind === "hpf") {
          ctx.moveTo(pos.x, pos.y - 6);
          ctx.lineTo(pos.x + 6, pos.y);
          ctx.lineTo(pos.x, pos.y + 6);
          ctx.lineTo(pos.x - 6, pos.y);
          ctx.closePath();
        } else {
          ctx.arc(pos.x, pos.y, selected ? 6.5 : 5, 0, Math.PI * 2);
        }
        ctx.fillStyle = canvasColor;
        ctx.fill();
        ctx.lineWidth = selected ? 2 : 1.5;
        ctx.strokeStyle = ink;
        ctx.stroke();
      }

      const text = readoutFor(state, active);
      const readout = readoutRef.current;
      if (readout && readout.textContent !== text) readout.textContent = text;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  const localPoint = (event: { clientX: number; clientY: number }) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  const hit = (x: number, y: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return null;
    const box = boxOf(wrap.clientWidth, wrap.clientHeight);
    const state = useConsole.getState();
    let best: { node: NodeHit; dist: number } | null = null;
    for (const node of nodeList(state)) {
      const pos = nodePos(node, state, box, getEngine().sampleRate);
      const dist = Math.hypot(pos.x - x, pos.y - y);
      if (dist < 18 && (!best || dist < best.dist)) best = { node, dist };
    }
    return best?.node ?? null;
  };

  return (
    <section className="eq-pane" aria-label="Equalizer">
      <header className="pane-head">
        <div className="pane-title">
          <h2>EQ</h2>
          <span className="pane-target">{targetName}</span>
          {bypass ? <span className="bypass-note">Bypassed</span> : null}
        </div>
        <span ref={readoutRef} className="eq-readout" />
        <button
          type="button"
          className={bypass ? "key key-on" : "key"}
          aria-pressed={bypass}
          onClick={() => {
            const api = useConsole.getState();
            if (focusKind === "master") api.setMaster({ masterEqBypass: !api.masterEqBypass });
            else api.setChannel(focusIndex < 0 ? 0 : focusIndex, { eqBypass: !bypass });
          }}
        >
          Bypass
        </button>
      </header>
      <div
        ref={wrapRef}
        className="eq-canvas-wrap"
        onPointerDown={(event) => {
          const point = localPoint(event);
          const node = hit(point.x, point.y);
          if (!node) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { node, startQ: nodeQ(node, useConsole.getState()), startY: event.clientY, qMode: event.shiftKey };
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const wrap = wrapRef.current;
          if (!wrap) return;
          const box = boxOf(wrap.clientWidth, wrap.clientHeight);
          const point = localPoint(event);
          const state = useConsole.getState();
          const pos = nodePos(current.node, state, box, getEngine().sampleRate);
          const tunable = current.node.kind === "mid" || current.node.kind === "master";
          if (event.shiftKey && tunable) {
            if (!current.qMode) {
              current.qMode = true;
              current.startY = event.clientY;
              current.startQ = nodeQ(current.node, state);
            }
            const nextQ = clamp(current.startQ * Math.exp((current.startY - event.clientY) / 110), 0.35, 8);
            applyNode(current.node, xToFreq(pos.x, box), yToDb(pos.y, box), nextQ);
            return;
          }
          if (current.node.kind === "hpf") {
            applyNode(current.node, xToFreq(point.x, box), 0, null);
            return;
          }
          applyNode(current.node, xToFreq(point.x, box), yToDb(point.y, box), null);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onDoubleClick={(event) => {
          const point = localPoint(event);
          const node = hit(point.x, point.y);
          if (node) resetNode(node);
        }}
      >
        <canvas ref={canvasRef} />
      </div>
    </section>
  );
}
