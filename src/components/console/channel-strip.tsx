import { useRef, useState } from "react";
import { toast } from "sonner";
import { Knob, Slider } from "@/components/console/controls";
import { Meter, OutReadout } from "@/components/console/meter";
import { getEngine } from "@/lib/audio/engine";
import { loadChannelFile } from "@/lib/audio/load-file";
import {
  SOURCES,
  UNITY_FADER,
  dbToFader,
  faderToDb,
  formatDb,
  formatDbShort,
  formatHzShort,
  formatPan,
  type SourceKind,
} from "@/lib/console-model";
import { useConsole } from "@/lib/console-store";

const MARKS = [
  { db: 6, label: "+6" },
  { db: 0, label: "0" },
  { db: -12, label: "−12" },
  { db: -30, label: "−30" },
];

function isSource(value: string): value is SourceKind {
  return SOURCES.some((source) => source.id === value);
}

function FaderScale() {
  return (
    <div className="fader-scale" aria-hidden="true">
      {MARKS.map((mark) => (
        <span key={mark.label} style={{ top: `${(1 - dbToFader(mark.db)) * 100}%` }}>
          {mark.label}
        </span>
      ))}
      <span style={{ top: "100%" }}>−∞</span>
    </div>
  );
}

export function ChannelStrip({ index }: { index: number }) {
  const channel = useConsole((state) => state.channels[index]);
  const selected = useConsole((state) => state.focus.kind === "channel" && state.focus.index === index);
  const micHere = useConsole((state) => state.micChannel === index);
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  if (!channel) return null;

  return (
    <article
      className={selected ? (over ? "strip is-selected is-drop" : "strip is-selected") : over ? "strip is-drop" : "strip"}
      onPointerDown={() => useConsole.getState().focusChannel(index)}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        const file = event.dataTransfer.files?.[0];
        if (file) void loadChannelFile(index, file);
      }}
    >
      <div className="name-row">
        <span className="ch-index">{String(index + 1).padStart(2, "0")}</span>
        <input
          className="name-in"
          aria-label={`Channel ${index + 1} name`}
          value={channel.name}
          maxLength={24}
          onChange={(event) => useConsole.getState().setChannel(index, { name: event.target.value })}
        />
      </div>
      <select
        className="source-select"
        aria-label={`${channel.name} source`}
        value={channel.source}
        onChange={(event) => {
          const next = event.target.value;
          if (!isSource(next)) return;
          if (next === "mic") {
            void (async () => {
              const ok = await getEngine().armMic();
              if (!ok) {
                toast.error("Microphone unavailable.");
                return;
              }
              useConsole.getState().claimMic(index);
              toast("Mic is live. Headphones avoid feedback.");
            })();
            return;
          }
          if (next === "file") {
            useConsole.getState().setChannel(index, { source: "file" });
            if (!getEngine().hasFile(index)) fileRef.current?.click();
            return;
          }
          useConsole.getState().setChannel(index, { source: next });
        }}
      >
        {SOURCES.map((source) => (
          <option key={source.id} value={source.id}>
            {source.label}
          </option>
        ))}
      </select>
      <input
        ref={fileRef}
        className="sr-only"
        type="file"
        accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aac,.aiff,.webm"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void loadChannelFile(index, file);
        }}
      />
      {channel.source === "file" ? (
        <button type="button" className="file-line" onClick={() => fileRef.current?.click()}>
          {channel.fileName && getEngine().hasFile(index) ? channel.fileName : channel.fileName ? "Reload file" : "Load audio"}
        </button>
      ) : null}
      {channel.source === "mic" ? (
        micHere ? (
          <p className="file-line is-live">Mic live</p>
        ) : (
          <button
            type="button"
            className="file-line"
            onClick={() => {
              void (async () => {
                const ok = await getEngine().armMic();
                if (!ok) {
                  toast.error("Microphone unavailable.");
                  return;
                }
                useConsole.getState().claimMic(index);
                toast("Mic is live. Headphones avoid feedback.");
              })();
            }}
          >
            Arm mic
          </button>
        )
      ) : null}
      <div className="knob-grid">
        <Knob
          label="HPF"
          value={channel.hpf}
          min={20}
          max={500}
          curve="log"
          defaultValue={30}
          format={formatHzShort}
          onChange={(hpf) => useConsole.getState().setChannel(index, { hpf })}
        />
        <Knob
          label="Trim"
          value={channel.trim}
          min={-12}
          max={12}
          defaultValue={0}
          detent={0}
          format={formatDbShort}
          onChange={(trim) => useConsole.getState().setChannel(index, { trim })}
        />
        <Knob
          label="Pan"
          value={channel.pan}
          min={-1}
          max={1}
          defaultValue={0}
          detent={0}
          format={formatPan}
          onChange={(pan) => useConsole.getState().setChannel(index, { pan })}
        />
      </div>
      <div className={channel.eqBypass ? "knob-grid is-dim" : "knob-grid"}>
        <Knob
          label="Low"
          value={channel.lowGain}
          min={-12}
          max={12}
          defaultValue={0}
          detent={0}
          format={formatDbShort}
          onChange={(lowGain) => useConsole.getState().setChannel(index, { lowGain })}
        />
        <Knob
          label="Mid"
          value={channel.midGain}
          min={-12}
          max={12}
          defaultValue={0}
          detent={0}
          format={formatDbShort}
          onChange={(midGain) => useConsole.getState().setChannel(index, { midGain })}
        />
        <Knob
          label="High"
          value={channel.highGain}
          min={-12}
          max={12}
          defaultValue={0}
          detent={0}
          format={formatDbShort}
          onChange={(highGain) => useConsole.getState().setChannel(index, { highGain })}
        />
      </div>
      <div className="send-row">
        <span className="micro">Send</span>
        <Slider
          label={`${channel.name} reverb send`}
          orientation="horizontal"
          min={0}
          max={1}
          value={channel.send}
          defaultValue={0}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={(send) => useConsole.getState().setChannel(index, { send })}
        />
        <span className="send-value">{Math.round(channel.send * 100)}</span>
      </div>
      <div className="fader-row">
        <Meter index={index} label={channel.name} />
        <Slider
          label={`${channel.name} level`}
          orientation="vertical"
          min={0}
          max={1}
          value={channel.fader}
          defaultValue={UNITY_FADER}
          detent={UNITY_FADER}
          format={(value) => formatDb(faderToDb(value))}
          onChange={(fader) => useConsole.getState().setChannel(index, { fader })}
        />
        <FaderScale />
      </div>
      <span className="readout">{formatDb(faderToDb(channel.fader))}</span>
      <div className="btn-row">
        <button
          type="button"
          className={channel.mute ? "key key-mute" : "key"}
          aria-pressed={channel.mute}
          aria-label={`Mute ${channel.name}`}
          onClick={() => useConsole.getState().setChannel(index, { mute: !channel.mute })}
        >
          M
        </button>
        <button
          type="button"
          className={channel.solo ? "key key-solo" : "key"}
          aria-pressed={channel.solo}
          aria-label={`Solo ${channel.name}`}
          onClick={() => useConsole.getState().setChannel(index, { solo: !channel.solo })}
        >
          S
        </button>
        <button
          type="button"
          className={channel.polarity ? "key key-on" : "key"}
          aria-pressed={channel.polarity}
          aria-label={`Invert polarity on ${channel.name}`}
          onClick={() => useConsole.getState().setChannel(index, { polarity: !channel.polarity })}
        >
          Ø
        </button>
      </div>
    </article>
  );
}

export function MasterStrip() {
  const fader = useConsole((state) => state.masterFader);
  const selected = useConsole((state) => state.focus.kind === "master");
  const limiterOn = useConsole((state) => state.limiterOn);
  return (
    <article
      className={selected ? "strip strip-master is-selected" : "strip strip-master"}
      onPointerDown={() => useConsole.getState().focusMaster()}
    >
      <div className="name-row">
        <span className="ch-index">M</span>
        <span className="master-name">Master</span>
      </div>
      <p className="master-note">Output</p>
      <div className="fader-row master-fader">
        <div className="meter-pair">
          <Meter index={6} label="Left" />
          <Meter index={7} label="Right" />
        </div>
        <Slider
          label="Master level"
          orientation="vertical"
          min={0}
          max={1}
          value={fader}
          defaultValue={UNITY_FADER}
          detent={UNITY_FADER}
          format={(value) => formatDb(faderToDb(value))}
          onChange={(masterFader) => useConsole.getState().setMaster({ masterFader })}
        />
        <FaderScale />
      </div>
      <OutReadout />
      <button
        type="button"
        className={limiterOn ? "key key-on" : "key"}
        aria-pressed={limiterOn}
        onClick={() => useConsole.getState().setMaster({ limiterOn: !limiterOn })}
      >
        Limiter
      </button>
    </article>
  );
}
