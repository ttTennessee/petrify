export interface AcpCheckpointBlob {
  sessionId: string;
  protocolVersion: number;
  promptHistory: Array<{ role: string; text: string }>;
  inputsSnapshot: Record<string, unknown>;
  command: string;
  args?: string[];
}
