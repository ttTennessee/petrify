// Runtime resolution of the API + WS base. Single point of change when
// Tauri sidecar mode injects window.__PETRIFY_API_BASE__ at startup.
//
// Browser / dev / same-origin prod → empty string, callers keep using
// relative paths like "/api/foo".
// Tauri sidecar → "http://127.0.0.1:<dynamic-port>" injected on window.

declare global {
  interface Window {
    __PETRIFY_API_BASE__?: string;
  }
}

export function getApiBase(): string {
  if (typeof window !== "undefined" && window.__PETRIFY_API_BASE__) {
    return window.__PETRIFY_API_BASE__.replace(/\/$/, "");
  }
  return "";
}

export function getWsBase(): string {
  const apiBase = getApiBase();
  if (apiBase) {
    return apiBase.replace(/^http/, "ws");
  }
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.host}`;
  }
  return "";
}
