import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";

// NDJSON JSON-RPC 2.0 client over child stdio. ACP servers (Zed, Claude Code's
// ACP runner) speak newline-delimited JSON-RPC; we only implement the subset we
// need: request/response correlation by `id`, plus notification fan-out.

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface AcpTransportOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

export class AcpTransport extends EventEmitter {
  private child: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private stdoutBuf = "";
  private closed = false;

  constructor(opts: AcpTransportOptions) {
    super();
    this.child = spawn(opts.command, opts.args ?? [], {
      env: { ...process.env, ...(opts.env ?? {}) },
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => this.onStdout(chunk));
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk: string) => {
      this.emit("stderr", chunk);
    });
    this.child.on("exit", (code, signal) => {
      this.closed = true;
      const err = new Error(
        `ACP server exited (code=${code} signal=${signal ?? "none"})`,
      );
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
      this.emit("exit", { code, signal });
    });
    this.child.on("error", (err) => this.emit("error", err));
    // stdin/stdout/stderr can emit their own 'error' events (e.g. EPIPE when the
    // child exits before we finish writing). Without a listener those crash the
    // process. Forward to our own "error" event so callers can decide.
    this.child.stdin.on("error", (err) => this.emit("error", err));
    this.child.stdout.on("error", (err) => this.emit("error", err));
    this.child.stderr.on("error", (err) => this.emit("error", err));
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.closed) {
      return Promise.reject(new Error("ACP transport is closed"));
    }
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
      });
      this.child.stdin.write(payload + "\n", (err) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  notify(method: string, params?: unknown): void {
    if (this.closed) return;
    const payload = JSON.stringify({ jsonrpc: "2.0", method, params });
    this.child.stdin.write(payload + "\n");
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.child.stdin.end();
    } catch {
      /* ignore */
    }
    // Give the server a beat to flush; then force-kill if needed.
    setTimeout(() => {
      if (!this.child.killed) {
        try {
          this.child.kill("SIGTERM");
        } catch {
          /* ignore */
        }
      }
    }, 200);
  }

  private onStdout(chunk: string): void {
    this.stdoutBuf += chunk;
    let nl: number;
    while ((nl = this.stdoutBuf.indexOf("\n")) !== -1) {
      const line = this.stdoutBuf.slice(0, nl).trim();
      this.stdoutBuf = this.stdoutBuf.slice(nl + 1);
      if (!line) continue;
      this.handleLine(line);
    }
  }

  private handleLine(line: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      this.emit("parse-error", line);
      return;
    }
    if (
      !msg ||
      typeof msg !== "object" ||
      (msg as { jsonrpc?: string }).jsonrpc !== "2.0"
    ) {
      return;
    }
    const m = msg as { id?: number | string; method?: string };
    if (typeof m.id === "number" && !("method" in m)) {
      this.handleResponse(msg as JsonRpcResponse);
    } else if (typeof m.method === "string") {
      this.handleIncoming(msg as JsonRpcNotification & { id?: number | string });
    }
  }

  private handleResponse(res: JsonRpcResponse): void {
    const pending = this.pending.get(res.id as number);
    if (!pending) return;
    this.pending.delete(res.id as number);
    if (res.error) {
      pending.reject(
        new Error(`ACP error ${res.error.code}: ${res.error.message}`),
      );
    } else {
      pending.resolve(res.result);
    }
  }

  private handleIncoming(
    msg: JsonRpcNotification & { id?: number | string },
  ): void {
    // For MVP we only consume notifications. Server-originated requests get a
    // method-not-found response so the server doesn't hang forever.
    if (typeof msg.id !== "undefined") {
      const reply = JSON.stringify({
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: -32601, message: `method not implemented: ${msg.method}` },
      });
      this.child.stdin.write(reply + "\n");
      return;
    }
    this.emit("notification", msg);
  }
}
