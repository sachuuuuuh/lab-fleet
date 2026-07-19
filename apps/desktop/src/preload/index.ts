import { contextBridge, ipcRenderer } from "electron";
import type { AgentEvent } from "@lab-fleet/shared";

const api = {
  invoke: async <T = unknown>(command: string, payload?: unknown): Promise<T> => {
    return (await ipcRenderer.invoke("lab-fleet:invoke", command, payload)) as T;
  },
  onEvent: (callback: (event: AgentEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AgentEvent): void => callback(payload);
    ipcRenderer.on("lab-fleet:event", listener);
    return () => ipcRenderer.removeListener("lab-fleet:event", listener);
  }
};

contextBridge.exposeInMainWorld("labFleet", api);

