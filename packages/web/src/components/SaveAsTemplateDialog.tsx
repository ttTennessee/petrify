import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSaveAsTemplate } from "../api/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

interface Props {
  workflowId: string;
  onClose: () => void;
}

export function SaveAsTemplateDialog({ workflowId, onClose }: Props) {
  const { t } = useTranslation("templates");
  const { t: tc } = useTranslation("common");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const qc = useQueryClient();
  const save = useSaveAsTemplate();

  const submit = async () => {
    if (!name.trim()) return;
    const tags = tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    await save.mutateAsync({
      workflowId,
      name: name.trim(),
      description: description.trim() || undefined,
      tags,
    });
    qc.invalidateQueries({ queryKey: ["templates"] });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("save_as.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">{t("save_as.name_label")}</Label>
            <Input
              id="tpl-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("save_as.name_placeholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-desc">{tc("description")}</Label>
            <Textarea
              id="tpl-desc"
              className="h-20 resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-tags">{t("save_as.tags_label")}</Label>
            <Input
              id="tpl-tags"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder={t("save_as.tags_placeholder")}
            />
          </div>
          {save.isError && (
            <p className="text-xs text-destructive">
              {(save.error as Error).message}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={submit}
            disabled={!name.trim() || save.isPending}
          >
            {save.isPending ? t("save_as.saving") : t("save_as.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
