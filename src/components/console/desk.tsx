import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { ChannelStrip, MasterStrip } from "@/components/console/channel-strip";
import { Slider } from "@/components/console/controls";
import { Dynamics } from "@/components/console/dynamics";
import { EqGraph } from "@/components/console/eq-graph";
import { useEngineFrame } from "@/components/console/meter";
import { getEngine } from "@/lib/audio/engine";
import { loadChannelFile } from "@/lib/audio/load-file";
import { GROOVE_META, type GrooveId } from "@/lib/audio/patterns";
import { CHANNEL_COUNT, clamp, sanitizeData } from "@/lib/console-model";
import { loadSaved, scenes, scheduleSave, snapshotOf, useConsole } from "@/lib/console-store";

const GROOVES: GrooveId[] = ["house", "boom", "broken"];

async function togglePlay() {
  try {
    await getEngine().ensure();
  } catch {
    toast.error("Audio couldn't start in this browser.");
    return;
  }
  const api = useConsole.getState();
  api.setPlaying(!api.playing);
}

function StepLights() {
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  useEngineFrame(() => {
    const root = rootRef.current;
    const bar = barRef.current;
    if (!root || !bar) return;
    const playing = useConsole.getState().playing;
    const step = playing ? getEngine().displayStep : -1;
    const local = step < 0 ? -1 : step % 16;
    const barNumber = step < 0 ? 1 : Math.floor(step / 16) + 1;
    const text = String(barNumber);
    if (bar.textContent !== text) bar.textContent = text;
    const kids = root.children;
    for (let i = 0; i < kids.length; i++) {
      kids[i]?.classList.toggle("is-on", i === local);
    }
  });
  return (
    <div className="steps-wrap" aria-hidden="true">
      <span ref={barRef} className="bar-num">
        1
      </span>
      <div ref={rootRef} className="steps">
        {Array.from({ length: 16 }, (_, i) => (
          <span key={i} className={i % 4 === 0 ? "step is-beat" : "step"} />
        ))}
      </div>
    </div>
  );
}

function PlayButton() {
  const playing = useConsole((state) => state.playing);
  return (
    <Button variant="primary" data-playing={playing ? "true" : "false"} onClick={() => void togglePlay()}>
      {playing ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
      {playing ? "Stop" : "Play"}
    </Button>
  );
}

function BpmControl() {
  const bpm = useConsole((state) => state.bpm);
  return (
    <div className="bpm">
      <span className="micro">BPM</span>
      <button type="button" className="icon-btn" aria-label="Decrease tempo" onClick={() => useConsole.getState().setBpm(bpm - 1)}>
        −
      </button>
      <input
        className="bpm-input"
        aria-label="Tempo"
        inputMode="numeric"
        value={bpm}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) useConsole.getState().setBpm(next);
        }}
      />
      <button type="button" className="icon-btn" aria-label="Increase tempo" onClick={() => useConsole.getState().setBpm(bpm + 1)}>
        +
      </button>
    </div>
  );
}

function SwingControl() {
  const swing = useConsole((state) => state.swing);
  return (
    <div className="swing">
      <span className="micro">Swing</span>
      <Slider
        label="Swing"
        orientation="horizontal"
        min={0}
        max={100}
        value={swing}
        defaultValue={14}
        format={(value) => String(Math.round(value))}
        onChange={(value) => useConsole.getState().setSwing(value)}
      />
      <span className="send-value">{Math.round(swing)}</span>
    </div>
  );
}

function GrooveSwitch() {
  const groove = useConsole((state) => state.groove);
  return (
    <div className="seg" role="group" aria-label="Groove">
      {GROOVES.map((id) => (
        <button
          key={id}
          type="button"
          className={groove === id ? "seg-btn is-on" : "seg-btn"}
          aria-pressed={groove === id}
          onClick={() => useConsole.getState().setGroove(id)}
        >
          {GROOVE_META[id].label}
        </button>
      ))}
    </div>
  );
}

function PumpButton() {
  const pump = useConsole((state) => state.pump);
  return (
    <button type="button" className={pump ? "key key-on" : "key"} aria-pressed={pump} onClick={() => useConsole.getState().setMaster({ pump: !pump })}>
      Pump
    </button>
  );
}

function SoloClear() {
  const any = useConsole((state) => state.channels.some((channel) => channel.solo));
  if (!any) return null;
  return (
    <Button size="sm" onClick={() => useConsole.getState().clearSolos()}>
      Clear solo
    </Button>
  );
}

function RecButton() {
  const recording = useConsole((state) => state.recording);
  const labelRef = useRef<HTMLSpanElement>(null);
  useEngineFrame(() => {
    const el = labelRef.current;
    const started = getEngine().recStarted;
    if (!el || !started) return;
    const seconds = Math.floor((performance.now() - started) / 1000);
    const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    if (el.textContent !== text) el.textContent = text;
  });
  return (
    <button
      type="button"
      className={recording ? "key key-mute" : "key"}
      aria-pressed={recording}
      onClick={() => {
        void (async () => {
          const api = useConsole.getState();
          if (api.recording) {
            getEngine().finishRec();
            api.setRecording(false);
            return;
          }
          try {
            await getEngine().ensure();
          } catch {
            toast.error("Audio couldn't start.");
            return;
          }
          const ok = getEngine().beginRec();
          if (!ok) {
            toast.error("This browser can't record the mix.");
            return;
          }
          api.setRecording(true);
        })();
      }}
    >
      <span className={recording ? "rec-dot is-on" : "rec-dot"} aria-hidden="true" />
      <span ref={labelRef}>{recording ? "0:00" : "Rec"}</span>
    </button>
  );
}

function PresetMenu({ onSave, onKeys }: { onSave: () => void; onKeys: () => void }) {
  const label = useConsole((state) => state.presetLabel);
  const presets = useConsole((state) => state.userPresets);
  const importRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button size="sm">
            Presets
            <span className="preset-label">{label}</span>
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="menu" align="end" sideOffset={8}>
            <DropdownMenu.Label className="menu-label">Scenes</DropdownMenu.Label>
            {scenes().map((scene) => (
              <DropdownMenu.Item
                key={scene.id}
                className="menu-item"
                onSelect={() => {
                  useConsole.getState().loadData(scene.data);
                  toast(scene.name);
                }}
              >
                <span>{scene.name}</span>
                <span className="menu-detail">{scene.detail}</span>
              </DropdownMenu.Item>
            ))}
            {presets.length ? (
              <>
                <DropdownMenu.Separator className="menu-sep" />
                <DropdownMenu.Label className="menu-label">Your mixes</DropdownMenu.Label>
                {presets.map((preset, index) => (
                  <DropdownMenu.Item key={`${preset.name}-${index}`} className="menu-item" onSelect={() => useConsole.getState().loadPreset(index)}>
                    {preset.name}
                  </DropdownMenu.Item>
                ))}
              </>
            ) : null}
            <DropdownMenu.Separator className="menu-sep" />
            <DropdownMenu.Item className="menu-item" onSelect={onSave}>
              Save mix…
            </DropdownMenu.Item>
            <DropdownMenu.Item className="menu-item" onSelect={() => exportMix()}>
              Export mix
            </DropdownMenu.Item>
            <DropdownMenu.Item className="menu-item" onSelect={() => importRef.current?.click()}>
              Import mix
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="menu-sep" />
            <DropdownMenu.Item className="menu-item" onSelect={onKeys}>
              Keyboard
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <input
        ref={importRef}
        className="sr-only"
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void file.text().then((text) => {
            try {
              const parsed = JSON.parse(text) as unknown;
              const data = sanitizeData(parsed);
              if (!data) {
                toast.error("That file isn't a KEEL mix.");
                return;
              }
              useConsole.getState().loadData(data);
              toast("Mix loaded");
            } catch {
              toast.error("That file isn't a KEEL mix.");
            }
          });
        }}
      />
    </>
  );
}

function exportMix() {
  const data = snapshotOf(useConsole.getState());
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "keel-mix.json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function Desk() {
  const [saveOpen, setSaveOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [presetName, setPresetName] = useState("");

  useEffect(() => {
    loadSaved();
    getEngine().onRecordingStopped = () => useConsole.getState().setRecording(false);
    const unsub = useConsole.subscribe((state) => {
      scheduleSave(state);
      const engine = getEngine();
      if (engine.ready) engine.apply(state);
    });
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (target?.closest("button, a") && event.code === "Space") return;
      if (target?.getAttribute("role") === "slider" && (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End")) {
        return;
      }
      const api = useConsole.getState();
      if (event.code === "Space") {
        event.preventDefault();
        void togglePlay();
        return;
      }
      if (event.key === "m" || event.key === "M") {
        if (api.focus.kind === "channel") {
          const channel = api.channels[api.focus.index];
          if (channel) api.setChannel(api.focus.index, { mute: !channel.mute });
        }
        return;
      }
      if (event.key === "s" || event.key === "S") {
        if (api.focus.kind === "channel") {
          const channel = api.channels[api.focus.index];
          if (channel) api.setChannel(api.focus.index, { solo: !channel.solo });
        }
        return;
      }
      if (event.key >= "1" && event.key <= "6") {
        api.focusChannel(Number(event.key) - 1);
        return;
      }
      if (event.key === "0") {
        api.focusMaster();
        return;
      }
      if (event.key === "[") {
        api.setBpm(api.bpm - 1);
        return;
      }
      if (event.key === "]") {
        api.setBpm(api.bpm + 1);
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const dir = event.key === "ArrowUp" ? 1 : -1;
        const delta = (event.shiftKey ? 0.01 : 0.025) * dir;
        if (api.focus.kind === "master") api.setMaster({ masterFader: clamp(api.masterFader + delta, 0, 1) });
        else {
          const channel = api.channels[api.focus.index];
          if (channel) api.setChannel(api.focus.index, { fader: clamp(channel.fader + delta, 0, 1) });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unsub();
      window.removeEventListener("keydown", onKey);
      getEngine().onRecordingStopped = null;
    };
  }, []);

  return (
    <div
      className="desk"
      data-app="keel"
      onPointerDown={() => {
        void getEngine().ensure().catch(() => undefined);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (!file) return;
        const focus = useConsole.getState().focus;
        const index = focus.kind === "channel" ? focus.index : CHANNEL_COUNT - 1;
        void loadChannelFile(index, file);
      }}
    >
      <header className="topbar">
        <div className="brand">
          <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="6" className="mark-plate" />
            <path fill="currentColor" d="M7.5 6.2h4.4v6.7L18.4 6.2h5.2L15.6 15.2l8.2 10.6h-5.3l-6.6-8.6v8.6H7.5V6.2z" />
            <rect x="13.4" y="27.2" width="5.2" height="1.5" rx="0.4" className="mark-tick" />
          </svg>
          <div>
            <div className="wordmark">KEEL</div>
            <div className="brand-sub">Parametric EQ</div>
          </div>
        </div>
        <div className="transport">
          <PlayButton />
          <StepLights />
          <GrooveSwitch />
          <BpmControl />
          <SwingControl />
          <PumpButton />
          <SoloClear />
        </div>
        <div className="top-actions">
          <RecButton />
          <PresetMenu
            onSave={() => {
              setPresetName("");
              setSaveOpen(true);
            }}
            onKeys={() => setKeysOpen(true)}
          />
        </div>
      </header>
      <div className="stage">
        <div className="analysis">
          <EqGraph />
          <Dynamics />
        </div>
        <Hint />
        <div className="strip-row">
          {Array.from({ length: CHANNEL_COUNT }, (_, index) => (
            <ChannelStrip key={index} index={index} />
          ))}
          <MasterStrip />
        </div>
      </div>
      <Dialog.Root open={saveOpen} onOpenChange={setSaveOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay" />
          <Dialog.Content className="modal">
            <Dialog.Title className="modal-title">Save mix</Dialog.Title>
            <Dialog.Description className="modal-copy">Stored in this browser. Export if you want a file.</Dialog.Description>
            <form
              className="modal-form"
              onSubmit={(event) => {
                event.preventDefault();
                const ok = useConsole.getState().savePreset(presetName);
                if (!ok) {
                  toast.error("Name the mix. You can keep up to 24.");
                  return;
                }
                setSaveOpen(false);
                toast("Mix saved");
              }}
            >
              <input
                className="text-in"
                autoFocus
                placeholder="Name"
                value={presetName}
                maxLength={32}
                onChange={(event) => setPresetName(event.target.value)}
              />
              <div className="modal-actions">
                <Button type="button" onClick={() => setSaveOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary">
                  Save
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={keysOpen} onOpenChange={setKeysOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay" />
          <Dialog.Content className="modal">
            <Dialog.Title className="modal-title">Keyboard</Dialog.Title>
            <Dialog.Description className="modal-copy">Double-click a knob or node to reset it. Shift makes drags finer. On the EQ, shift-drag a peak to change Q.</Dialog.Description>
            <dl className="keys">
              <div>
                <dt>Space</dt>
                <dd>Play or stop</dd>
              </div>
              <div>
                <dt>1–6</dt>
                <dd>Focus a channel</dd>
              </div>
              <div>
                <dt>0</dt>
                <dd>Focus master</dd>
              </div>
              <div>
                <dt>M / S</dt>
                <dd>Mute or solo</dd>
              </div>
              <div>
                <dt>↑ ↓</dt>
                <dd>Nudge the focused fader</dd>
              </div>
              <div>
                <dt>[ ]</dt>
                <dd>Tempo</dd>
              </div>
            </dl>
            <div className="modal-actions">
              <Button variant="primary" onClick={() => setKeysOpen(false)}>
                Close
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Toaster
        theme="dark"
        position="bottom-center"
        toastOptions={{
          style: {
            background: "var(--color-surface)",
            color: "var(--color-ink)",
            border: "1px solid var(--color-line)",
          },
        }}
      />
    </div>
  );
}

function Hint() {
  const playing = useConsole((state) => state.playing);
  const [heard, setHeard] = useState(false);
  useEffect(() => {
    if (playing) setHeard(true);
  }, [playing]);
  if (heard) return null;
  return <p className="hint">Play runs the groove. Noise and the mic stay live without it. Drop an audio file on a channel.</p>;
}
