import { NodeSDK } from "@opentelemetry/sdk-node";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";
import { trace } from "@opentelemetry/api";

if (process.env.PETRIFY_OTEL !== "off") {
  const sdk = new NodeSDK({
    traceExporter: new ConsoleSpanExporter(),
  });
  sdk.start();
  process.on("SIGTERM", () => {
    void sdk.shutdown();
  });
}

export const tracer = trace.getTracer("petrify-runtime", "0.1.0");
