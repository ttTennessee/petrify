import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCreateProject } from "../api/client";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Section } from "../components/section";

export default function ProjectNew() {
  const { t } = useTranslation("projects");
  const { t: tc } = useTranslation("common");
  const nav = useNavigate();
  const create = useCreateProject();
  const [goal, setGoal] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div className="mx-auto max-w-3xl overflow-y-auto h-full px-8 py-10 space-y-10">
      <Section
        number="02"
        eyebrow={t("new.eyebrow")}
        title={t("new.title")}
        subtitle={t("new.subtitle")}
      />

      <form
        className="space-y-8"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await create.mutateAsync({
            goal,
            description: description || undefined,
          });
          nav(`/projects/${r.id}`);
        }}
      >
        <div className="space-y-2">
          <div className="flex items-baseline gap-3">
            <Label htmlFor="goal" className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("new.goal_label")}
            </Label>
            <span className="font-mono text-[10px] text-muted-foreground/60">
              {t("new.goal_hint")}
            </span>
          </div>
          <Textarea
            id="goal"
            required
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={3}
            className="font-sans text-sm resize-none border-border bg-card focus-visible:ring-ring"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline gap-3">
            <Label htmlFor="description" className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("new.description_label")}
            </Label>
            <span className="font-mono text-[10px] text-muted-foreground/60">
              {t("new.description_hint")}
            </span>
          </div>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="font-sans text-sm resize-none border-border bg-card focus-visible:ring-ring"
          />
        </div>

        <div className="flex items-center justify-between border-t border-border pt-6">
          <span className="font-mono text-[10px] text-muted-foreground/60">
            {tc("esc_to_discard")}
          </span>
          <div className="flex items-center gap-3">
            {create.error && (
              <p className="font-mono text-xs text-destructive">
                {(create.error as Error).message}
              </p>
            )}
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? t("new.submitting") : t("new.submit")}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
