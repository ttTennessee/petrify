import { useState } from "react";
import type {
  McpEnvVarSpec,
  McpHttpHeaderSpec,
  McpServerRow,
  McpServerSpec,
  McpServerPatch,
  McpTransport,
} from "../../api/mcp";
import { ApiError } from "../../api/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { cn } from "../../lib/utils";

export interface ServerModalProps {
  initial?: McpServerRow;
  takenNames?: string[];
  onCreate?: (spec: McpServerSpec) => Promise<unknown>;
  onPatch?: (patch: McpServerPatch) => Promise<unknown>;
  onClose: () => void;
}

export function ServerModal({
  initial,
  takenNames,
  onCreate,
  onPatch,
  onClose,
}: ServerModalProps) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [transport, setTransport] = useState<McpTransport>(
    initial?.transport ?? "stdio",
  );
  const [command, setCommand] = useState(initial?.command ?? "");
  const [argsText, setArgsText] = useState((initial?.args ?? []).join(" "));
  const [envText, setEnvText] = useState(envToText(initial?.env ?? []));
  const [url, setUrl] = useState(initial?.url ?? "");
  const [headersText, setHeadersText] = useState(
    headersToText(initial?.headers ?? []),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    const trimmedName = name.trim();
    if (!isEdit) {
      if (!trimmedName) return setError("name 不能为空");
      if (!/^[a-zA-Z0-9_.:-]+$/.test(trimmedName))
        return setError("name 仅允许 [a-zA-Z0-9_.:-]");
      if ((takenNames ?? []).includes(trimmedName))
        return setError(`name '${trimmedName}' 已存在`);
    }

    let spec: McpServerSpec;
    try {
      if (transport === "stdio") {
        if (!command.trim()) return setError("command 不能为空");
        const args =
          argsText.trim().length === 0 ? [] : argsText.trim().split(/\s+/);
        const env = parseEnvText(envText);
        spec = { transport: "stdio", name: trimmedName, command: command.trim(), args, env };
      } else {
        if (!url.trim()) return setError("url 不能为空");
        const headers = parseHeadersText(headersText);
        spec = { transport, name: trimmedName, url: url.trim(), headers };
      }
    } catch (e) {
      return setError((e as Error).message);
    }

    setSubmitting(true);
    try {
      if (isEdit && onPatch) {
        const patch: McpServerPatch =
          spec.transport === "stdio"
            ? {
                transport: "stdio",
                command: spec.command,
                args: spec.args,
                env: spec.env,
              }
            : {
                transport: spec.transport,
                url: spec.url,
                headers: spec.headers,
              };
        await onPatch(patch);
      } else if (onCreate) {
        await onCreate(spec);
      }
      onClose();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `${err.message}${err.issues.length ? ` — ${err.issues.join("; ")}` : ""}`
          : (err as Error).message;
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `编辑 · ${initial?.name}` : "新增 MCP Server"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isEdit}
              placeholder="my-mcp-server"
              className="font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              {isEdit ? "name 不可修改" : "[a-zA-Z0-9_.:-]，全局唯一"}
            </p>
          </Field>

          <Field label="Transport">
            <Select
              value={transport}
              onValueChange={(v) => setTransport(v as McpTransport)}
            >
              <SelectTrigger className="h-8 font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stdio">stdio</SelectItem>
                <SelectItem value="http">http</SelectItem>
                <SelectItem value="sse">sse</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {transport === "stdio" ? (
            <>
              <Field label="Command">
                <Input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="npx"
                  className="font-mono text-xs"
                />
              </Field>
              <Field label="Args (空格分隔)">
                <Input
                  value={argsText}
                  onChange={(e) => setArgsText(e.target.value)}
                  placeholder="-y @modelcontextprotocol/server-filesystem /tmp"
                  className="font-mono text-xs"
                />
              </Field>
              <Field label="Env (KEY=VALUE 每行一条)">
                <Textarea
                  value={envText}
                  onChange={(e) => setEnvText(e.target.value)}
                  rows={3}
                  placeholder="FOO=bar"
                  className="font-mono text-[11px]"
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="URL">
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/mcp"
                  className="font-mono text-xs"
                />
              </Field>
              <Field label="Headers (KEY: VALUE 每行一条)">
                <Textarea
                  value={headersText}
                  onChange={(e) => setHeadersText(e.target.value)}
                  rows={3}
                  placeholder="Authorization: Bearer xxx"
                  className="font-mono text-[11px]"
                />
              </Field>
            </>
          )}

          {error && (
            <div className={cn(
              "rounded-md border border-destructive/30 bg-destructive/10",
              "px-2 py-1 text-[11px] text-destructive",
            )}>
              {error}
            </div>
          )}
          {isEdit && (
            <p className="text-[10px] text-muted-foreground">
              注：保存后会自动禁用，重新启用前请手动开启。
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function envToText(env: McpEnvVarSpec[]): string {
  return env.map((e) => `${e.name}=${e.value}`).join("\n");
}

function parseEnvText(text: string): McpEnvVarSpec[] {
  const out: McpEnvVarSpec[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const eq = line.indexOf("=");
    if (eq < 0) throw new Error(`env 行不是 KEY=VALUE 格式: ${line}`);
    const k = line.slice(0, eq).trim();
    if (!k) throw new Error(`env 行 key 为空: ${line}`);
    out.push({ name: k, value: line.slice(eq + 1) });
  }
  return out;
}

function headersToText(headers: McpHttpHeaderSpec[]): string {
  return headers.map((h) => `${h.name}: ${h.value}`).join("\n");
}

function parseHeadersText(text: string): McpHttpHeaderSpec[] {
  const out: McpHttpHeaderSpec[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon < 0) throw new Error(`header 行不是 KEY: VALUE 格式: ${line}`);
    const k = line.slice(0, colon).trim();
    if (!k) throw new Error(`header 行 key 为空: ${line}`);
    out.push({ name: k, value: line.slice(colon + 1).trim() });
  }
  return out;
}
