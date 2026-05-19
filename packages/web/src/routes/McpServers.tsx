import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useMcpServers,
  useCreateMcpServer,
  usePatchMcpServer,
  useDeleteMcpServer,
  useEnableMcpServer,
  useDisableMcpServer,
  type McpServerRow,
} from "../api/mcp";
import { ServerModal } from "../features/mcp/ServerModal";
import { Section } from "../components/section";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";

export default function McpServers() {
  const { data, isLoading } = useMcpServers();
  const create = useCreateMcpServer();
  const patch = usePatchMcpServer();
  const del = useDeleteMcpServer();
  const enable = useEnableMcpServer();
  const disable = useDisableMcpServer();

  const [modal, setModal] = useState<
    | { mode: "create" }
    | { mode: "edit"; row: McpServerRow }
    | null
  >(null);

  const acting = (name: string) =>
    (enable.isPending && enable.variables === name) ||
    (disable.isPending && disable.variables === name) ||
    (del.isPending && del.variables === name);

  async function onToggle(row: McpServerRow) {
    if (row.enabled) await disable.mutateAsync(row.name);
    else await enable.mutateAsync(row.name);
  }

  return (
    <div className="mx-auto h-full max-w-5xl space-y-10 overflow-y-auto px-8 py-10">
      <Section
        number="05"
        eyebrow="settings"
        title={
          <>
            MCP <span className="italic text-accent">servers</span>
          </>
        }
        subtitle="全局 MCP 服务器池。节点表单中按需勾选启用项。"
        actions={
          <Link
            to="/settings"
            className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            ← settings
          </Link>
        }
      />

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            servers
          </h2>
          <Button size="sm" onClick={() => setModal({ mode: "create" })}>
            新增
          </Button>
        </div>

        {isLoading && (
          <p className="font-mono text-xs text-muted-foreground">loading…</p>
        )}

        <table className="w-full border-y border-border text-xs">
          <thead className="border-b border-border bg-muted/30">
            <tr>
              <Th>name</Th>
              <Th>transport</Th>
              <Th>endpoint</Th>
              <Th>enabled</Th>
              <Th className="text-right">actions</Th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).length === 0 && !isLoading && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center font-mono text-xs text-muted-foreground"
                >
                  暂无 MCP server
                </td>
              </tr>
            )}
            {(data ?? []).map((row) => (
              <tr
                key={row.name}
                className="border-b border-border last:border-b-0 hover:bg-muted/40"
              >
                <td className="px-4 py-3 font-mono text-xs">{row.name}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                  {row.transport}
                </td>
                <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">
                  {row.transport === "stdio"
                    ? `${row.command ?? ""} ${row.args.join(" ")}`.trim() || "—"
                    : row.url || "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "font-mono text-[10px] uppercase",
                      row.enabled ? "text-success" : "text-muted-foreground",
                    )}
                  >
                    {row.enabled ? "on" : "off"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[11px]"
                      disabled={acting(row.name)}
                      onClick={() => setModal({ mode: "edit", row })}
                    >
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[11px]"
                      disabled={acting(row.name)}
                      onClick={() => onToggle(row)}
                    >
                      {row.enabled ? "禁用" : "启用"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 border-destructive/40 px-2 text-[11px] text-destructive hover:bg-destructive/10"
                      disabled={acting(row.name)}
                      onClick={() => {
                        if (confirm(`删除 ${row.name}？`)) del.mutate(row.name);
                      }}
                    >
                      删除
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {modal?.mode === "create" && (
        <ServerModal
          takenNames={(data ?? []).map((r) => r.name)}
          onCreate={(spec) => create.mutateAsync(spec)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.mode === "edit" && (
        <ServerModal
          initial={modal.row}
          onPatch={(p) => patch.mutateAsync({ name: modal.row.name, patch: p })}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}
