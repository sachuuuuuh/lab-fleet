import type { AgentEvent } from "@lab-fleet/shared";

declare global {
  interface Window {
    labFleet: {
      invoke<T = unknown>(command: string, payload?: unknown): Promise<T>;
      onEvent(callback: (event: AgentEvent) => void): () => void;
    };
  }
}

export {};

