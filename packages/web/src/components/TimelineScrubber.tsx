import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useWorkflowStore } from "../store/workflow";
import { useCheckpoints, useResumeRun, type CheckpointSummary } from "../api/client";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";

interface CheckpointEntry {
  index: number; // event index right after this checkpoint
  ckpt: CheckpointSummary;
}

interface CheckpointCluster {
  pct: number; // anchor position (centroid of cluster)
  entries: CheckpointEntry[];
}

// Pins closer than this percentage of the track width are merged into one
// grouped pin instead of stacked above/below — keeps the track visually tidy.
const CLUSTER_THRESHOLD_PCT = 3.5;

export function TimelineScrubber({
  runId,
  onNavigateToRun,
}: {
  runId: string;
  onNavigateToRun: (newRunId: string) => void;
}) {
  const { t } = useTranslation("workflow");
  const allEvents = useWorkflowStore((s) => s.allEvents);
  const scrubMode = useWorkflowStore((s) => s.scrubMode);
  const scrubCursor = useWorkflowStore((s) => s.scrubCursor);
  const setScrubCursor = useWorkflowStore((s) => s.setScrubCursor);
  const exitScrubMode = useWorkflowStore((s) => s.exitScrubMode);

  const isLive = scrubMode === "live";
  const { data: checkpoints } = useCheckpoints(runId, isLive);
  const resumeRun = useResumeRun();

  const total = allEvents.length;

  // Map checkpoint_id -> event index (where the CheckpointSaved event sits),
  // then collapse overlapping pins into clusters. A cluster of size 1 renders
  // as a normal diamond; size > 1 renders as a single grouped pin with a count
  // badge that expands on hover.
  const checkpointClusters = useMemo<CheckpointCluster[]>(() => {
    if (!checkpoints || total === 0) return [];
    const byId = new Map(checkpoints.map((c) => [c.id, c]));
    const raw: Array<{ index: number; ckpt: CheckpointSummary; pct: number }> = [];
    allEvents.forEach((ev, i) => {
      if (ev.type !== "CheckpointSaved") return;
      const cid = (ev.payload as { checkpoint_id?: string }).checkpoint_id;
      if (!cid) return;
      const ckpt = byId.get(cid);
      if (!ckpt) return;
      const index = i + 1;
      raw.push({ index, ckpt, pct: (index / total) * 100 });
    });
    const clusters: CheckpointCluster[] = [];
    for (const r of raw) {
      const last = clusters[clusters.length - 1];
      if (last && r.pct - last.pct < CLUSTER_THRESHOLD_PCT) {
        last.entries.push({ index: r.index, ckpt: r.ckpt });
        // Re-anchor to the centroid so the grouped pin sits in the middle of
        // its cluster's actual span instead of drifting toward the leftmost.
        const sum = last.entries.reduce((acc, e) => acc + (e.index / total) * 100, 0);
        last.pct = sum / last.entries.length;
      } else {
        clusters.push({ pct: r.pct, entries: [{ index: r.index, ckpt: r.ckpt }] });
      }
    }
    return clusters;
  }, [allEvents, checkpoints, total]);

  if (total === 0) return null;

  const cursorPct = total === 0 ? 100 : (scrubCursor / total) * 100;

  const onFork = async (ckptId: string) => {
    const r = await resumeRun.mutateAsync({ runId, checkpointId: ckptId });
    onNavigateToRun(r.id);
  };

  return (
    <div className="flex items-center gap-4 border-b border-border bg-card/40 px-6 py-1.5">
      <div className="flex shrink-0 items-center gap-2 font-mono text-[10px] text-muted-foreground">
        <span className="uppercase tracking-wider">{t("timeline.title")}</span>
        <Badge variant={isLive ? "success" : "warning"} dot>
          {isLive ? t("timeline.live") : t("timeline.scrubbing")}
        </Badge>
        <span>·</span>
        <span>{t("timeline.events", { count: total })}</span>
        {!isLive && (
          <Button
            size="sm"
            variant="outline"
            className="ml-1 h-5 px-1.5 text-[10px]"
            onClick={exitScrubMode}
          >
            {t("timeline.back_to_live")}
          </Button>
        )}
      </div>

      <div className="relative h-8 flex-1">
        {/* slider — rendered FIRST so the pin layer stacks above it */}
        <input
          type="range"
          min={0}
          max={total}
          step={1}
          value={scrubCursor}
          onChange={(e) => setScrubCursor(Number(e.target.value))}
          className="absolute inset-0 z-0 h-8 w-full cursor-pointer appearance-none bg-transparent
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:border
            [&::-webkit-slider-thumb]:border-accent
            [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4
            [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-accent
            [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-accent"
        />

        {/* track (visual only, must NOT eat hover) */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-[1] h-[2px] -translate-y-1/2 bg-border" />

        {/* progress fill up to cursor */}
        <div
          className="pointer-events-none absolute left-0 top-1/2 z-[1] h-[2px] -translate-y-1/2 bg-accent"
          style={{ width: `${cursorPct}%` }}
        />

        {/* checkpoint pins — z-10 so they sit above the range input */}
        {checkpointClusters.map((cluster) => {
          const isGroup = cluster.entries.length > 1;
          // Anchor tooltip to whichever side keeps it on screen.
          const tipAlign =
            cluster.pct < 20
              ? "left-0 translate-x-0"
              : cluster.pct > 80
                ? "right-0 translate-x-0"
                : "left-1/2 -translate-x-1/2";
          const first = cluster.entries[0]!;
          const cursorOnCluster = cluster.entries.some((e) => e.index === scrubCursor);
          const key = isGroup ? `cluster:${first.ckpt.id}` : first.ckpt.id;
          return (
            <div
              key={key}
              className="group absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${cluster.pct}%` }}
            >
              <button
                type="button"
                onClick={() => setScrubCursor(first.index)}
                className={cn(
                  "relative block h-3 w-3 rotate-45 border border-accent bg-card transition-colors hover:bg-accent/30",
                  cursorOnCluster && "bg-accent",
                )}
                aria-label={
                  isGroup
                    ? `${t("timeline.checkpoint")} ×${cluster.entries.length}`
                    : `${t("timeline.checkpoint")} · ${first.ckpt.blob.completed_node_ids.length} done`
                }
              >
                {isGroup && (
                  // Counter badge: counter-rotate so the digits stay upright
                  // against the diamond. Sits flush at the top-right corner.
                  <span
                    className="pointer-events-none absolute -right-2 -top-2 -rotate-45 rounded-full
                      border border-accent bg-accent px-1 font-mono text-[9px] leading-[14px]
                      text-accent-foreground shadow-sm"
                  >
                    {cluster.entries.length}
                  </span>
                )}
              </button>
              {/* Outer wrapper sits flush with the pin and uses padding to
                  create a transparent bridge — cursor can travel from pin to
                  card without ever leaving the hover area. */}
              <div
                className={cn(
                  "absolute top-2 z-20 hidden pt-2 group-hover:block",
                  tipAlign,
                )}
              >
                <div className="min-w-[180px] border border-border bg-card font-mono text-[10px] shadow-md">
                  {cluster.entries.map((e, i) => (
                    <div
                      key={e.ckpt.id}
                      className={cn(
                        "px-2 py-1",
                        i > 0 && "border-t border-border/60",
                        scrubCursor === e.index && "bg-accent/10",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setScrubCursor(e.index)}
                        className="block w-full text-left text-muted-foreground hover:text-foreground"
                      >
                        {t("timeline.checkpoint")} · {e.ckpt.id.slice(0, 8)}
                      </button>
                      <div className="text-muted-foreground/70">
                        done: {e.ckpt.blob.completed_node_ids.length}
                        {e.ckpt.blob.skipped_node_ids.length > 0
                          ? ` · skipped: ${e.ckpt.blob.skipped_node_ids.length}`
                          : ""}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-1 h-6 w-full px-2 text-[10px]"
                        disabled={resumeRun.isPending}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          void onFork(e.ckpt.id);
                        }}
                      >
                        {resumeRun.isPending ? t("run.forking") : t("run.fork_here")}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
