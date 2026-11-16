import { useEffect, useRef } from "react";
import { getEngine } from "@/lib/audio/engine";

export function dbToMeter(db: number) {
  if (db <= -48) return 0;
  if (db >= 6) return 1;
  if (db < 0) return ((db + 48) / 48) * 0.85;
  return 0.85 + (db / 6) * 0.15;
}

export function useEngineFrame(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => getEngine().onFrame(() => ref.current()), []);
}

export function Meter({ index, label }: { index: number; label: string }) {
  const fillRef = useRef<HTMLSpanElement>(null);
  const holdRef = useRef<HTMLSpanElement>(null);
  const hold = useRef(-80);

  useEngineFrame(() => {
    const db = getEngine().peaks[index] ?? -80;
    if (db > hold.current) hold.current = db;
    else hold.current = Math.max(db, hold.current - 0.35);
    const fill = fillRef.current;
    const mark = holdRef.current;
    if (!fill || !mark) return;
    const level = dbToMeter(db);
    fill.style.transform = `scaleY(${level})`;
    fill.dataset.zone = db > -3 ? "hot" : db > -12 ? "warn" : "ok";
    mark.style.bottom = `${dbToMeter(hold.current) * 100}%`;
    fill.dataset.db = db.toFixed(1);
  });

  return (
    <div className="meter" aria-hidden="true" data-meter={label}>
      <span ref={fillRef} className="meter-fill" />
      <span ref={holdRef} className="meter-hold" />
    </div>
  );
}

export function OutReadout() {
  const ref = useRef<HTMLSpanElement>(null);
  const hot = useRef(0);
  useEngineFrame(() => {
    const engine = getEngine();
    const db = Math.max(engine.peaks[6] ?? -80, engine.peaks[7] ?? -80);
    const el = ref.current;
    if (!el) return;
    if (db > -0.5) hot.current = 40;
    else if (hot.current > 0) hot.current -= 1;
    const text = db <= -59 ? "−∞" : `${db >= 0 ? "+" : "−"}${Math.abs(db).toFixed(1)}`;
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle("is-hot", hot.current > 0);
    el.dataset.db = db.toFixed(1);
  });
  return (
    <span ref={ref} className="readout" data-out="master">
      −∞
    </span>
  );
}

export function GainReduction() {
  const fill = useRef<HTMLSpanElement>(null);
  const num = useRef<HTMLSpanElement>(null);
  useEngineFrame(() => {
    const gr = getEngine().gr;
    if (fill.current) fill.current.style.transform = `scaleX(${Math.min(1, gr / 18)})`;
    if (num.current) {
      const text = gr.toFixed(1);
      if (num.current.textContent !== text) num.current.textContent = text;
    }
  });
  return (
    <div className="gr" aria-hidden="true">
      <span className="micro">GR</span>
      <div className="gr-track">
        <span ref={fill} className="gr-fill" />
      </div>
      <span ref={num} className="gr-num">
        0.0
      </span>
    </div>
  );
}
