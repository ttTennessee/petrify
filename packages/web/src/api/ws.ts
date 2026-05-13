import { useEffect } from "react";
import type { RuntimeEvent } from "@petrify/shared";

export function useRunEventStream(
  runId: string | undefined,
  onEvent: (ev: RuntimeEvent) => void,
) {
  useEffect(() => {
    if (!runId) return;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/runs/${runId}`);
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
