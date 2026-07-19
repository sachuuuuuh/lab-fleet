import { AgentCore } from "./agent-core.js";
import { LocalIpcServer } from "./ipc.js";
import { createPlatformAdapter } from "./platform.js";

const platform = createPlatformAdapter();
const core = new AgentCore({ platform });
const ipc = new LocalIpcServer(platform.ipcPath, core);

async function start(): Promise<void> {
  await core.initialize();
  await ipc.start();
  process.stdout.write(`Lab Fleet agent ready on ${platform.ipcPath}\n`);
}

async function stop(): Promise<void> {
  await ipc.stop();
  await core.stop();
  process.exit(0);
}

process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

start().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});

