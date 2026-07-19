import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { Capability, Platform } from "@lab-fleet/shared";

export interface PlatformAdapter {
  platform: Platform;
  osVersion: string;
  stateDirectory: string;
  ipcPath: string;
  capabilities: Capability[];
  isAdministrator(): boolean;
}

export interface PlatformOptions {
  platform?: Platform;
  stateDirectory?: string;
  ipcPath?: string;
}

export function createPlatformAdapter(options: PlatformOptions = {}): PlatformAdapter {
  const platform = options.platform ?? detectPlatform();
  const development = process.env.LAB_FLEET_DEV === "1";
  const stateDirectory =
    options.stateDirectory ??
    process.env.LAB_FLEET_STATE_DIR ??
    (development
      ? path.join(os.tmpdir(), "lab-fleet-dev", process.env.LAB_FLEET_INSTANCE ?? "agent")
      : platform === "windows"
        ? path.join(process.env.ProgramData ?? "C:\\ProgramData", "LabFleet")
        : "/var/lib/lab-fleet");

  const instance = process.env.LAB_FLEET_INSTANCE?.replace(/[^A-Za-z0-9_-]/g, "") ?? "agent";
  const ipcPath =
    options.ipcPath ??
    process.env.LAB_FLEET_IPC_PATH ??
    (platform === "windows"
      ? `\\\\.\\pipe\\lab-fleet-${instance}`
      : development
        ? path.join(stateDirectory, `${instance}.sock`)
        : "/run/lab-fleet/agent.sock");

  return {
    platform,
    osVersion: `${os.type()} ${os.release()}`,
    stateDirectory,
    ipcPath,
    capabilities: ["presence", "secure-enrollment"],
    isAdministrator: () => {
      if (platform === "windows") {
        if (development) return process.env.LAB_FLEET_ADMIN === "1";
        return spawnSync("net.exe", ["session"], { stdio: "ignore", windowsHide: true }).status === 0;
      }
      return typeof process.getuid === "function" && process.getuid() === 0;
    }
  };
}

function detectPlatform(): Platform {
  if (process.platform === "win32") return "windows";
  if (process.platform === "linux") return "linux";
  throw new Error(`Unsupported platform: ${process.platform}`);
}
