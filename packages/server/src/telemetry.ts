import { NodeSDK } from "@opentelemetry/sdk-node";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";
import { trace } from "@opentelemetry/api";

let sdkInstance: NodeSDK | null = null;

if (process.env.PETRIFY_OTEL !== "off") {
  sdkInstance = new NodeSDK({
    traceExporter: new ConsoleSpanExporter(),
  });
  sdkInstance.start();
}

// Exposed so the central shutdown handler in index.ts can flush spans.
export async function shutdownTelemetry(): Promise<void> {
  if (sdkInstance) {
    try {
      await sdkInstance.shutdown();
    } catch {
      /* ignore */
    }
  }
}

export const tracer = trace.getTracer("petrify-runtime", "0.1.0");
