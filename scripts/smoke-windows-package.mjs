import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

if (process.platform !== "win32") throw new Error("The Windows package smoke test must run on Windows.");

const executable = path.join(process.cwd(), "release", "desktop", "win-unpacked", "Lab Fleet.exe");
const port = 45991;
const child = spawn(executable, [`--remote-debugging-port=${port}`], {
  env: { ...process.env, LAB_FLEET_SMOKE: "1" },
  stdio: "ignore",
  windowsHide: true
});

try {
  const target = await waitForTarget(port);
  const result = await inspectRenderer(target.webSocketDebuggerUrl);
  if (result.labFleet !== "object") throw new Error("The Electron preload bridge was not exposed.");
  if (result.rootChildren < 1 || !result.text.includes("Lab Fleet")) throw new Error("The renderer did not produce visible application content.");
  process.stdout.write("Windows package smoke test passed: preload bridge and renderer are healthy.\n");
} finally {
  child.kill();
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (child.exitCode === null) spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
}

async function waitForTarget(portNumber) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${portNumber}/json`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page" && target.title === "Lab Fleet");
      if (page) return page;
    } catch {
      // Electron may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("The packaged Electron renderer did not start.");
}

async function inspectRenderer(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const exceptions = [];
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.text);
  });
  socket.send(JSON.stringify({ id: 1, method: "Runtime.enable" }));
  const response = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Renderer inspection timed out.")), 5000);
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== 2) return;
      clearTimeout(timeout);
      resolve(message);
    });
    socket.send(JSON.stringify({
      id: 2,
      method: "Runtime.evaluate",
      params: {
        expression: "({ text: document.body.innerText, labFleet: typeof window.labFleet, rootChildren: document.querySelector('#root')?.childElementCount ?? 0 })",
        returnByValue: true
      }
    }));
  });
  socket.close();
  if (exceptions.length) throw new Error(`Renderer exception: ${exceptions.join("; ")}`);
  return response.result.result.value;
}
