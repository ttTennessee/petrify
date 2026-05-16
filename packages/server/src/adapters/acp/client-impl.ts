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

export interface ClientImplDeps {
  /** Pluggable permission handler. Defaults to denying everything (the
   *  pre-broker behavior). The adapter wires this to a PermissionBroker. */
  onPermission?: (
    req: RequestPermissionRequest,
  ) => Promise<RequestPermissionResponse>;
}

export interface BuiltClient {
  client: Client;
  setQueue: (q: AsyncEventQueue<SessionNotification> | null) => void;
}

export function createClient(deps: ClientImplDeps): BuiltClient {
  let queueRef: AsyncEventQueue<SessionNotification> | null = null;
  const client: Client = {
    async sessionUpdate(params: SessionNotification): Promise<void> {
      queueRef?.push(params);
    },
    async requestPermission(
      params: RequestPermissionRequest,
    ): Promise<RequestPermissionResponse> {
      if (deps.onPermission) return deps.onPermission(params);
      return { outcome: { outcome: "cancelled" } };
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
    setQueue: (q) => {
      queueRef = q;
    },
  };
}
