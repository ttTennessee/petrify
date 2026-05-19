import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTemplates, useInstantiateTemplate } from "../../api/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { cn } from "../../lib/utils";

interface Props {
  projectId: string;
  onClose: () => void;
}

export function FromTemplateDialog({ projectId, onClose }: Props) {
  const { t } = useTranslation("templates");
  const { t: tc } = useTranslation("common");
  const [filter, setFilter] = useState("");
  const { data: templates, isLoading } = useTemplates();
  const inst = useInstantiateTemplate();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);

  const visible = (templates ?? []).filter((t) =>
    filter ? t.name.toLowerCase().includes(filter.toLowerCase()) : true,
  );

  const submit = async () => {
    if (!selected) return;
    const { workflowId } = await inst.mutateAsync({ templateId: selected, projectId });
    qc.invalidateQueries({ queryKey: ["project-workflows", projectId] });
    onClose();
    nav(`/workflows/${workflowId}`);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[80vh] flex-col gap-3 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("from_template.title")}</DialogTitle>
        </DialogHeader>

        <Input
          placeholder={t("from_template.filter")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        <div className="-mx-2 flex-1 overflow-y-auto px-2">
          {isLoading && (
            <p className="p-3 text-sm text-muted-foreground">{tc("loading")}</p>
          )}
          {visible.length === 0 && !isLoading && (
            <p className="p-3 text-sm text-muted-foreground">{t("from_template.empty")}</p>
          )}
          <ul className="space-y-1">
            {visible.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => setSelected(t.id)}
                  className={cn(
                    "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                    selected === t.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <div className="font-medium">{t.name}</div>
                  {t.description && (
                    <div
                      className={cn(
                        "text-xs",
                        selected === t.id
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground",
                      )}
                    >
                      {t.description}
                    </div>
                  )}
                  <div
                    className={cn(
                      "mt-1 flex gap-1 text-[10px]",
                      selected === t.id
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground",
                    )}
                  >
                    <span>{t.origin}</span>
                    {t.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-muted px-1 text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {inst.isError && (
          <p className="text-xs text-destructive">
            {(inst.error as Error).message}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={submit} disabled={!selected || inst.isPending}>
            {inst.isPending ? t("from_template.creating") : t("from_template.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
