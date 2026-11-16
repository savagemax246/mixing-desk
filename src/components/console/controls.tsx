import { useEffect, useRef, useState } from "react";
import { clamp } from "@/lib/console-model";

type Curve = "lin" | "log";

function toNorm(value: number, min: number, max: number, curve: Curve) {
  const v = clamp(value, min, max);
  if (curve === "log") return (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min));
  return (v - min) / (max - min);
}

function fromNorm(norm: number, min: number, max: number, curve: Curve) {
  const n = clamp(norm, 0, 1);
  if (curve === "log") return Math.exp(Math.log(min) + n * (Math.log(max) - Math.log(min)));
  return min + n * (max - min);
}

function withDetent(norm: number, min: number, max: number, curve: Curve, detent: number | undefined, shift: boolean) {
  if (detent === undefined || shift) return norm;
  const mark = toNorm(detent, min, max, curve);
  return Math.abs(norm - mark) < 0.03 ? mark : norm;
}

type KnobProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  onChange: (value: number) => void;
  format: (value: number) => string;
  curve?: Curve;
  detent?: number;
  disabled?: boolean;
};

export function Knob({
  label,
  value,
  min,
  max,
  defaultValue,
  onChange,
  format,
  curve = "lin",
  detent,
  disabled,
}: KnobProps) {
  const ref = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const drag = useRef<{ y: number; x: number; norm: number } | null>(null);
  const [active, setActive] = useState(false);
  valueRef.current = value;
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (disabled) return;
      event.preventDefault();
      const dir = event.deltaY > 0 ? -1 : 1;
      const step = event.shiftKey ? 0.004 : 0.02;
      const next = withDetent(
        toNorm(valueRef.current, min, max, curve) + dir * step,
        min,
        max,
        curve,
        detent,
        event.shiftKey,
      );
      onChangeRef.current(fromNorm(next, min, max, curve));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [curve, detent, disabled, max, min]);

  const norm = toNorm(value, min, max, curve);
  const angle = -135 + norm * 270;

  return (
    <div className="knob-field">
      <div
        ref={ref}
        className={active ? "knob is-active" : "knob"}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        aria-disabled={disabled || undefined}
        onDoubleClick={() => onChange(defaultValue)}
        onPointerDown={(event) => {
          if (disabled) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { y: event.clientY, x: event.clientX, norm };
          setActive(true);
        }}
        onPointerMove={(event) => {
          if (!drag.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const span = event.shiftKey ? 420 : 150;
          const dy = drag.current.y - event.clientY;
          const dx = (event.clientX - drag.current.x) * 0.35;
          const next = withDetent(drag.current.norm + (dy + dx) / span, min, max, curve, detent, event.shiftKey);
          onChange(fromNorm(next, min, max, curve));
        }}
        onPointerUp={() => {
          drag.current = null;
          setActive(false);
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          let dir = 0;
          if (event.key === "ArrowUp" || event.key === "ArrowRight") dir = 1;
          if (event.key === "ArrowDown" || event.key === "ArrowLeft") dir = -1;
          if (event.key === "Home") {
            event.preventDefault();
            onChange(min);
            return;
          }
          if (event.key === "End") {
            event.preventDefault();
            onChange(max);
            return;
          }
          if (!dir) return;
          event.preventDefault();
          const step = event.shiftKey ? 0.004 : 0.02;
          const next = withDetent(toNorm(value, min, max, curve) + dir * step, min, max, curve, detent, event.shiftKey);
          onChange(fromNorm(next, min, max, curve));
        }}
      >
        <span className="knob-rotor" style={{ transform: `rotate(${angle}deg)` }} />
        <span className="knob-core">{format(value)}</span>
      </div>
      <span className="knob-label">{label}</span>
    </div>
  );
}

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  onChange: (value: number) => void;
  format: (value: number) => string;
  orientation: "vertical" | "horizontal";
  curve?: Curve;
  detent?: number;
};

export function Slider({
  label,
  value,
  min,
  max,
  defaultValue,
  onChange,
  format,
  orientation,
  curve = "lin",
  detent,
}: SliderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const travelRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const drag = useRef<{ pointer: number; shift: boolean; norm: number; x: number; y: number } | null>(null);
  valueRef.current = value;
  onChangeRef.current = onChange;

  const emit = (norm: number, shift: boolean) => {
    const next = withDetent(norm, min, max, curve, detent, shift);
    onChangeRef.current(fromNorm(next, min, max, curve));
  };

  const normFromEvent = (event: { clientX: number; clientY: number }) => {
    const rect = travelRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return toNorm(valueRef.current, min, max, curve);
    if (orientation === "vertical") return clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1);
    return clamp((event.clientX - rect.left) / rect.width, 0, 1);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const dir = event.deltaY > 0 ? -1 : 1;
      const step = event.shiftKey ? 0.004 : 0.02;
      emit(toNorm(valueRef.current, min, max, curve) + dir * step, event.shiftKey);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [curve, detent, max, min, orientation]);

  const norm = toNorm(value, min, max, curve);
  const detentNorm = detent === undefined ? null : toNorm(detent, min, max, curve);
  const capStyle = orientation === "vertical" ? { top: `${(1 - norm) * 100}%` } : { left: `${norm * 100}%` };
  const detentStyle =
    detentNorm === null ? undefined : orientation === "vertical" ? { top: `${(1 - detentNorm) * 100}%` } : { left: `${detentNorm * 100}%` };

  return (
    <div
      ref={ref}
      className={orientation === "vertical" ? "vslider" : "hslider"}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={format(value)}
      onDoubleClick={() => onChange(defaultValue)}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          pointer: event.pointerId,
          shift: event.shiftKey,
          norm,
          x: event.clientX,
          y: event.clientY,
        };
        if (!event.shiftKey) emit(normFromEvent(event), false);
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
        if (event.shiftKey || current.shift) {
          const delta = orientation === "vertical" ? current.y - event.clientY : event.clientX - current.x;
          emit(clamp(current.norm + delta / 220, 0, 1), true);
          return;
        }
        emit(normFromEvent(event), false);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onKeyDown={(event) => {
        let dir = 0;
        if (event.key === "ArrowUp" || event.key === "ArrowRight") dir = 1;
        if (event.key === "ArrowDown" || event.key === "ArrowLeft") dir = -1;
        if (event.key === "Home") {
          event.preventDefault();
          onChange(min);
          return;
        }
        if (event.key === "End") {
          event.preventDefault();
          onChange(max);
          return;
        }
        if (!dir) return;
        event.preventDefault();
        const step = event.shiftKey ? 0.004 : 0.02;
        emit(toNorm(value, min, max, curve) + dir * step, event.shiftKey);
      }}
    >
      <div ref={travelRef} className="slider-travel">
        <span className="slider-slot" />
        {detentStyle ? <span className="slider-detent" style={detentStyle} /> : null}
        <span className="slider-cap" style={capStyle} />
      </div>
    </div>
  );
}
