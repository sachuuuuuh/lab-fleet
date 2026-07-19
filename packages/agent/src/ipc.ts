import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { chmod, mkdir, rm } from "node:fs/promises";
import net, { type Server, type Socket } from "node:net";
import path from "node:path";
import { localRequestSchema, type AgentEvent } from "@lab-fleet/shared";
import type { AgentCore } from "./agent-core.js";

interface LocalResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export class LocalIpcServer {
  private server: Server | undefined;
  private readonly clients = new Set<Socket>();

  constructor(private readonly ipcPath: string, private readonly core: AgentCore) {}

  async start(): Promise<void> {
    if (process.platform !== "win32") {
      await mkdir(path.dirname(this.ipcPath), { recursive: true });
      await rm(this.ipcPath, { force: true });
    }
    this.server = net.createServer((socket) => this.handleClient(socket));
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      const listenOptions = process.platform === "win32"
        ? { path: this.ipcPath, readableAll: true, writableAll: true }
        : { path: this.ipcPath };
      this.server!.listen(listenOptions, () => {
        this.server!.off("error", reject);
        resolve();
      });
    });
    if (process.platform !== "win32") await chmod(this.ipcPath, 0o666);
    this.core.on("agentEvent", this.broadcast);
  }

  async stop(): Promise<void> {
    this.core.off("agentEvent", this.broadcast);
    for (const client of this.clients) client.destroy();
    await new Promise<void>((resolve) => this.server?.close(() => resolve()) ?? resolve());
    if (process.platform !== "win32") await rm(this.ipcPath, { force: true });
  }

  private handleClient(socket: Socket): void {
    this.clients.add(socket);
    let buffer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buffer += chunk;
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.trim()) void this.handleLine(socket, line);
        newline = buffer.indexOf("\n");
      }
    });
    socket.on("close", () => this.clients.delete(socket));
    socket.on("error", () => this.clients.delete(socket));
  }

  private async handleLine(socket: Socket, line: string): Promise<void> {
    let response: LocalResponse;
    try {
      const request = localRequestSchema.parse(JSON.parse(line));
      response = { id: request.id, ok: true, result: await this.core.invoke(request.command, request.payload) };
    } catch (error) {
      const id = safeId(line);
      response = { id, ok: false, error: error instanceof Error ? error.message : "Agent request failed." };
    }
    socket.write(`${JSON.stringify(response)}\n`);
  }

  private broadcast = (event: AgentEvent): void => {
    const line = `${JSON.stringify(event)}\n`;
    for (const client of this.clients) client.write(line);
  };
}

export class LocalAgentClient extends EventEmitter {
  private socket: Socket | undefined;
  private buffer = "";
  private readonly pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();

  constructor(private readonly ipcPath: string) {
    super();
  }

  async connect(): Promise<void> {
    if (this.socket && !this.socket.destroyed) return;
    this.socket = net.createConnection(this.ipcPath);
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk) => this.handleData(String(chunk)));
    this.socket.on("close", () => this.rejectAll(new Error("The Lab Fleet agent disconnected.")));
    this.socket.on("error", () => undefined);
    await new Promise<void>((resolve, reject) => {
      this.socket!.once("connect", resolve);
      this.socket!.once("error", reject);
    });
  }

  async invoke(command: string, payload?: unknown): Promise<unknown> {
    await this.connect();
    const id = randomUUID();
    const request = { id, command, ...(payload === undefined ? {} : { payload }) };
    return await new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket!.write(`${JSON.stringify(request)}\n`);
    });
  }

  close(): void {
    this.socket?.destroy();
  }

  private handleData(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (line.trim()) this.handleLine(line);
      newline = this.buffer.indexOf("\n");
    }
  }

  private handleLine(line: string): void {
    const message = JSON.parse(line) as LocalResponse | AgentEvent;
    if ("event" in message) {
      this.emit("agentEvent", message);
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.ok) pending.resolve(message.result);
    else pending.reject(new Error(message.error ?? "Agent request failed."));
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

function safeId(line: string): string {
  try {
    const parsed = JSON.parse(line) as { id?: unknown };
    return typeof parsed.id === "string" ? parsed.id : randomUUID();
  } catch {
    return randomUUID();
  }
}
