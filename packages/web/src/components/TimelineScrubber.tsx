import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useWorkflowStore } from "../store/workflow";
import { useCheckpoints, useResumeRun, type CheckpointSummary } from "../api/client";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";

interface CheckpointMark {
  index: number; // event index right after this checkpoint
  ckpt: CheckpointSummary;
  lane: 0 | 1 | -1; // 0 = on-track, 1 = above, -1 = below — anti-overlap stagger
}

// Pins closer than this percentage of the track width get spread into adjacent lanes.
const STAGGER_THRESHOLD_PCT = 3.5;

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

  // Map checkpoint_id -> event index (where the CheckpointSaved event sits).
  const checkpointMarks = useMemo<CheckpointMark[]>(() => {
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
    // Lane assignment: walk left→right; if a pin is within STAGGER_THRESHOLD_PCT
    // of any pin already placed in the active cluster, push it to the next lane.
    // Lanes cycle 0 → 1 (above) → -1 (below) → 0 → … so up to 3 visually
    // distinguishable pins in any tight cluster.
    const result: CheckpointMark[] = [];
    let clusterStartPct = -Infinity;
    let clusterLaneCounter = 0;
    for (const r of raw) {
      if (r.pct - clusterStartPct >= STAGGER_THRESHOLD_PCT) {
        clusterStartPct = r.pct;
        clusterLaneCounter = 0;
      } else {
        clusterLaneCounter++;
      }
      const lane: 0 | 1 | -1 =
        clusterLaneCounter % 3 === 0 ? 0 : clusterLaneCounter % 3 === 1 ? 1 : -1;
      result.push({ index: r.index, ckpt: r.ckpt, lane });
    }
    return result;
  }, [allEvents, checkpoints, total]);

  if (total === 0) return null;

  const cursorPct = total === 0 ? 100 : (scrubCursor / total) * 100;

  const onFork = async (ckptId: string) => {
    const r = await resumeRun.mutateAsync({ runId, checkpointId: ckptId });
    onNavigateToRun(r.id);
  };

  return (
    <div className="border-b border-border bg-card/40 px-6 py-2">
      <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-wider">{t("timeline.title")}</span>
          <Badge variant={isLive ? "success" : "warning"} dot>
            {isLive ? t("timeline.live") : t("timeline.scrubbing")}
          </Badge>
          <span>·</span>
          <span>{t("timeline.events", { count: total })}</span>
        </div>
        {!isLive && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px]"
            onClick={exitScrubMode}
          >
            {t("timeline.back_to_live")}
          </Button>
        )}
      </div>

      <div className="relative h-12">
        {/* slider — rendered FIRST so the pin layer stacks above it */}
        <input
          type="range"
          min={0}
          max={total}
          step={1}
          value={scrubCursor}
          onChange={(e) => setScrubCursor(Number(e.target.value))}
          className="absolute inset-0 z-0 h-12 w-full cursor-pointer appearance-none bg-transparent
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
        {checkpointMarks.map((m) => {
          const pct = total === 0 ? 0 : (m.index / total) * 100;
          // Anchor tooltip to whichever side keeps it on screen.
          const tipAlign =
            pct < 20
              ? "left-0 translate-x-0"
              : pct > 80
                ? "right-0 translate-x-0"
                : "left-1/2 -translate-x-1/2";
          // Vertical lane: 0 = on-track center, 1 = above, -1 = below.
          // 12px offset from center keeps the pin readable but still visually
          // tethered to the track.
          const laneOffsetPx = m.lane === 1 ? -12 : m.lane === -1 ? 12 : 0;
          return (
            <div
              key={m.ckpt.id}
              className="group absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pct}%`, marginTop: `${laneOffsetPx}px` }}
            >
              {/* connector stub linking off-track pin back to the track axis */}
              {m.lane !== 0 && (
                <div
                  className="pointer-events-none absolute left-1/2 w-px -translate-x-1/2 bg-accent/40"
                  style={
                    m.lane === 1
                      ? { top: "100%", height: "12px" }
                      : { bottom: "100%", height: "12px" }
                  }
                />
              )}
              <button
                type="button"
                onClick={() => setScrubCursor(m.index)}
                className={cn(
                  "block h-3 w-3 rotate-45 border border-accent bg-card transition-colors hover:bg-accent/30",
                  scrubCursor === m.index && "bg-accent",
                )}
                aria-label={`${t("timeline.checkpoint")} · ${m.ckpt.blob.completed_node_ids.length} done`}
              />
              {/* Outer wrapper sits flush with the pin and uses padding to
                  create a transparent bridge — cursor can travel from pin to
                  card without ever leaving the hover area. */}
              <div
                className={cn(
                  "absolute top-2 z-20 hidden pt-2 group-hover:block",
                  tipAlign,
                )}
              >
                <div className="whitespace-nowrap border border-border bg-card px-2 py-1 font-mono text-[10px] shadow-md">
                  <div className="text-muted-foreground">
                    {t("timeline.checkpoint")} · {m.ckpt.id.slice(0, 8)}
                  </div>
                  <div className="text-muted-foreground/70">
                    done: {m.ckpt.blob.completed_node_ids.length}
                    {m.ckpt.blob.skipped_node_ids.length > 0
                      ? ` · skipped: ${m.ckpt.blob.skipped_node_ids.length}`
                      : ""}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1 h-6 w-full px-2 text-[10px]"
                    disabled={resumeRun.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      void onFork(m.ckpt.id);
                    }}
                  >
                    {resumeRun.isPending ? t("run.forking") : t("run.fork_here")}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
