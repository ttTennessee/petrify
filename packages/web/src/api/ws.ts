import { useEffect } from "react";
import type { RuntimeEvent } from "@petrify/shared";
import { getWsBase } from "./transport";

export function useRunEventStream(
  runId: string | undefined,
  onEvent: (ev: RuntimeEvent) => void,
) {
  useEffect(() => {
    if (!runId) return;
    const ws = new WebSocket(`${getWsBase()}/ws/runs/${runId}`);
    ws.onmessage = (msg) => {
      try {
        const ev = JSON.parse(msg.data) as RuntimeEvent;
        onEvent(ev);
      } catch {
        /* ignore */
      }
    };
    return () => ws.close();
  }, [runId, onEvent]);
}
