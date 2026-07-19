import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { spawnSync } from "node:child_process";
import { createPlatformAdapter } from "./platform.js";
import { StateStore } from "./state-store.js";

async function main(): Promise<void> {
  const command = process.argv[2];
  const platform = createPlatformAdapter();
  if (command === "reset") {
    if (!platform.isAdministrator()) throw new Error("Run lab-fleetctl reset with administrator privileges.");
    const prompt = createInterface({ input: stdin, output: stdout });
    const answer = await prompt.question('Type "RESET LAB FLEET" to delete this device identity and enrollment: ');
    prompt.close();
    if (answer !== "RESET LAB FLEET") throw new Error("Reset cancelled.");
    controlService(platform.platform, "stop");
    await new StateStore(platform.stateDirectory).reset();
    controlService(platform.platform, "start");
    stdout.write("Lab Fleet local state was removed. Restart the agent to configure this device again.\n");
    return;
  }
  if (command === "firewall") {
    if (platform.platform === "linux") {
      stdout.write("sudo ufw allow 45820/tcp comment 'Lab Fleet host'\n");
      stdout.write("sudo ufw allow 5353/udp comment 'Lab Fleet discovery'\n");
    } else {
      stdout.write("Windows firewall rules are installed by the Lab Fleet MSI for Domain and Private profiles.\n");
    }
    return;
  }
  stdout.write("Usage: lab-fleetctl <reset|firewall>\n");
}

function controlService(platform: "linux" | "windows", action: "start" | "stop"): void {
  if (process.env.LAB_FLEET_DEV === "1") return;
  const command = platform === "windows" ? "sc.exe" : "systemctl";
  const args = platform === "windows" ? [action, "LabFleetAgent"] : [action, "lab-fleet-agent.service"];
  const result = spawnSync(command, args, { stdio: "ignore", windowsHide: true });
  if (result.status !== 0 && action === "stop") {
    throw new Error("Could not stop the Lab Fleet service before reset.");
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
