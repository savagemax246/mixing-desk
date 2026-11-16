import { Knob } from "@/components/console/controls";
import { GainReduction } from "@/components/console/meter";
import { formatDbShort, formatMs, formatRatio } from "@/lib/console-model";
import { useConsole } from "@/lib/console-store";

export function Dynamics() {
  const compOn = useConsole((state) => state.compOn);
  const threshold = useConsole((state) => state.threshold);
  const ratio = useConsole((state) => state.ratio);
  const attack = useConsole((state) => state.attack);
  const release = useConsole((state) => state.release);
  const makeup = useConsole((state) => state.makeup);
  const width = useConsole((state) => state.width);
  const limiterOn = useConsole((state) => state.limiterOn);
  const set = useConsole.getState().setMaster;

  return (
    <section className="dyn-pane" aria-label="Dynamics">
      <header className="pane-head">
        <div className="pane-title">
          <h2>Dynamics</h2>
        </div>
        <button
          type="button"
          className={compOn ? "key key-on" : "key"}
          aria-pressed={compOn}
          onClick={() => useConsole.getState().setMaster({ compOn: !compOn })}
        >
          Comp
        </button>
      </header>
      <GainReduction />
      <div className={compOn ? "knob-grid dyn-grid" : "knob-grid dyn-grid is-dim"}>
        <Knob
          label="Thresh"
          value={threshold}
          min={-40}
          max={0}
          defaultValue={-18}
          format={(value) => formatDbShort(value)}
          onChange={(next) => useConsole.getState().setMaster({ threshold: next })}
        />
        <Knob
          label="Ratio"
          value={ratio}
          min={1}
          max={12}
          defaultValue={2.4}
          format={formatRatio}
          onChange={(next) => useConsole.getState().setMaster({ ratio: next })}
        />
        <Knob
          label="Attack"
          value={attack}
          min={0.001}
          max={0.08}
          curve="log"
          defaultValue={0.012}
          format={(value) => formatMs(value)}
          onChange={(next) => useConsole.getState().setMaster({ attack: next })}
        />
        <Knob
          label="Release"
          value={release}
          min={0.04}
          max={0.6}
          curve="log"
          defaultValue={0.18}
          format={(value) => formatMs(value)}
          onChange={(next) => useConsole.getState().setMaster({ release: next })}
        />
        <Knob
          label="Makeup"
          value={makeup}
          min={0}
          max={12}
          defaultValue={1.5}
          format={(value) => formatDbShort(value)}
          onChange={(next) => useConsole.getState().setMaster({ makeup: next })}
        />
      </div>
      <div className="knob-grid dyn-grid">
        <Knob
          label="Width"
          value={width}
          min={0}
          max={1.6}
          defaultValue={1}
          detent={1}
          format={(value) => (value < 0.03 ? "0" : String(Math.round(value * 100)))}
          onChange={(next) => useConsole.getState().setMaster({ width: next })}
        />
      </div>
      <button
        type="button"
        className={limiterOn ? "key key-on limiter-key" : "key limiter-key"}
        aria-pressed={limiterOn}
        onClick={() => set({ limiterOn: !limiterOn })}
      >
        Limiter −1 dB
      </button>
    </section>
  );
}
