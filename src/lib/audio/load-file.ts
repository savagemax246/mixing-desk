import { toast } from "sonner";
import { isAudioFile } from "@/lib/console-model";
import { useConsole } from "@/lib/console-store";
import { getEngine } from "@/lib/audio/engine";

export async function loadChannelFile(index: number, file: File) {
  if (!isAudioFile(file)) {
    toast.error("Drop an audio file.");
    return;
  }
  try {
    await getEngine().loadFile(index, file);
    const name = useConsole.getState().channels[index]?.name ?? "channel";
    useConsole.getState().setChannel(index, { source: "file", fileName: file.name });
    useConsole.getState().focusChannel(index);
    toast(`Loaded onto ${name}`);
  } catch {
    toast.error("Couldn't decode that audio file.");
  }
}
