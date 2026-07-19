import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import { LocalAgentClient, createPlatformAdapter } from "@lab-fleet/agent";
import type { AgentEvent } from "@lab-fleet/shared";

const platform = createPlatformAdapter();
const client = new LocalAgentClient(platform.ipcPath);
let mainWindow: BrowserWindow | undefined;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 920,
    minHeight: 640,
    show: false,
    backgroundColor: "#f5f7f6",
    title: "Lab Fleet",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.mjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.labfleet.desktop");
  app.on("browser-window-created", (_, window) => optimizer.watchWindowShortcuts(window));
  ipcMain.handle("lab-fleet:invoke", async (_, command: string, payload?: unknown) => {
    return await client.invoke(command, payload);
  });
  client.on("agentEvent", (event: AgentEvent) => mainWindow?.webContents.send("lab-fleet:event", event));
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => client.close());
