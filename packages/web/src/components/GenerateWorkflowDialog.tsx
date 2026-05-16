import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAdapters } from "../api/adapters";
import { useGenerateWorkflow,type GenerateApiError } from "../api/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./ui/select";
import { Label } from "./ui/label";

interface Props {
  projectId: string;
  open: boolean;
  onClose: () => void;
}

export function GenerateWorkflowDialog({ projectId, open, onClose }: Props) {
  const { t } = useTranslation("workflow");
  const nav = useNavigate();
  const { data: adapters, isLoading: adaptersLoading } = useAdapters();
  const generate = useGenerateWorkflow(projectId);
  const [adapter, setAdapter] = useState<string>("");

  const eligible = useMemo(
    () =>
      (adapters ?? []).filter(
        (a) => a.enabled === 1 && a.kind !== "builtin",
      ),
    [adapters],
  );

  async function onSubmit() {
    if (!adapter) return;
    try {
      const r = await generate.mutateAsync(adapter);
      onClose();
      nav(`/workflows/${r.workflowId}`);
    } catch {
      // error surfaced via generate.error
    }
  }

  const err = generate.error as GenerateApiError | null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("generate.title")}</DialogTitle>
          <DialogDescription>{t("generate.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="adapter-select" className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("generate.adapter_label")}
            </Label>
            <Select value={adapter} onValueChange={setAdapter}>
              <SelectTrigger id="adapter-select">
                <SelectValue
                  placeholder={
                    adaptersLoading
                      ? t("generate.loading_adapters")
                      : eligible.length === 0
                        ? t("generate.no_adapters")
                        : t("generate.pick_adapter")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {eligible.map((a) => (
                  <SelectItem key={a.name} value={a.name}>
                    <span className="font-mono text-xs">{a.name}</span>
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      {a.kind}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {err && (
            <div className="space-y-2 border-l-2 border-destructive pl-3">
              <p className="font-mono text-[11px] text-destructive">
                {err.stage ? `[${err.stage}] ` : ""}
                {err.message}
                {err.attempts ? ` · ${err.attempts} attempt(s)` : ""}
              </p>
              {err.raw && (
                <details className="text-[10px]">
                  <summary className="cursor-pointer font-mono text-muted-foreground">
                    {t("generate.show_raw")}
                  </summary>
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-muted-foreground">
                    {err.raw}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={generate.isPending}>
            {t("generate.cancel")}
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!adapter || generate.isPending}
          >
            {generate.isPending
              ? t("generate.running")
              : err
                ? t("generate.retry")
                : t("generate.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
