import type {
  Client,
  ReadTextFileRequest,
  ReadTextFileResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
  WriteTextFileRequest,
  WriteTextFileResponse,
} from "@agentclientprotocol/sdk";
import type { AsyncEventQueue } from "./transport.js";

/** Per-session routing state. Each in-flight invoke registers one of these
 *  against its sessionId so the shared ACP connection can demux notifications
 *  and permission requests back to the correct caller. */
export interface SessionRoute<PermCtx> {
  queue: AsyncEventQueue<SessionNotification>;
  permCtx: PermCtx;
}

export interface ClientImplDeps<PermCtx> {
  /** Pluggable permission handler. Defaults to denying everything (the
   *  pre-broker behavior). The adapter wires this to a PermissionBroker. */
  onPermission?: (
    permCtx: PermCtx,
    req: RequestPermissionRequest,
  ) => Promise<RequestPermissionResponse>;
}

export interface ClientRouter<PermCtx> {
  client: Client;
  register: (sessionId: string, route: SessionRoute<PermCtx>) => void;
  unregister: (sessionId: string) => void;
  /** Fail every still-registered session — used when the underlying child
   *  process dies. The queue is closed; callers detect the close and emit
   *  their own NodeFailed. */
  failAll: (reason: string) => void;
  /** Number of currently registered sessions. */
  size: () => number;
}

export function createClient<PermCtx>(
  deps: ClientImplDeps<PermCtx>,
): ClientRouter<PermCtx> {
  const routes = new Map<string, SessionRoute<PermCtx>>();

  const client: Client = {
    async sessionUpdate(params: SessionNotification): Promise<void> {
      routes.get(params.sessionId)?.queue.push(params);
    },
    async requestPermission(
      params: RequestPermissionRequest,
    ): Promise<RequestPermissionResponse> {
      const route = routes.get(params.sessionId);
      if (!route || !deps.onPermission) {
        return { outcome: { outcome: "cancelled" } };
      }
      return deps.onPermission(route.permCtx, params);
    },
    async readTextFile(
      _params: ReadTextFileRequest,
    ): Promise<ReadTextFileResponse> {
      throw new Error("fs.readTextFile not supported by Petrify ACP client");
    },
    async writeTextFile(
      _params: WriteTextFileRequest,
    ): Promise<WriteTextFileResponse> {
      throw new Error("fs.writeTextFile not supported by Petrify ACP client");
    },
  };

  return {
    client,
    register: (sessionId, route) => {
      routes.set(sessionId, route);
    },
    unregister: (sessionId) => {
      routes.delete(sessionId);
    },
    failAll: (_reason) => {
      for (const route of routes.values()) {
        route.queue.close();
      }
      routes.clear();
    },
    size: () => routes.size,
  };
}
