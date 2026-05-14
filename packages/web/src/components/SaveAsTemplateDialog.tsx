import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
          <DialogTitle>Save as Template</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Name</Label>
            <Input
              id="tpl-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. cyberpunk story pipeline"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-desc">Description</Label>
            <Textarea
              id="tpl-desc"
              className="h-20 resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-tags">Tags (comma-separated)</Label>
            <Input
              id="tpl-tags"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="writing, demo"
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
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!name.trim() || save.isPending}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
