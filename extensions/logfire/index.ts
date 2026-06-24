import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Span } from "@opentelemetry/api";
import * as logfire from "@pydantic/logfire-node";

function truncate(s: string, max = 2000): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

export default function (pi: ExtensionAPI) {
  // No token? No telemetry. Silent no-op, zero overhead.
  if (!process.env.LOGFIRE_TOKEN) return;

  logfire.configure({
    serviceName: "pi",
    sendToLogfire: "if-token-present",
    // Only the extension's explicit spans — no auto-instrumented HTTP noise
    nodeAutoInstrumentations: {
      "@opentelemetry/instrumentation-http": { enabled: false },
      "@opentelemetry/instrumentation-undici": { enabled: false },
      "@opentelemetry/instrumentation-openai": { enabled: false },
    },
  });

  // Active spans — stored by index/call-id so we can end() them in paired events
  const spans = {
    agent: null as Span | null,
    turns: new Map<number, Span>(),
    tools: new Map<string, Span>(),
    curTurn: -1,
    userPrompt: "",
    systemPrompt: "",
  };

  pi.on("session_shutdown", async () => {
    await logfire.shutdown();
  });

  pi.on("before_agent_start", (event) => {
    spans.userPrompt = event.prompt;
    spans.systemPrompt = event.systemPrompt;
  });

  pi.on("agent_start", () => {
    if (spans.agent) spans.agent.end(); // safety: shouldn't overlap
    spans.agent = logfire.startSpan("pi agent", {
      user_prompt: truncate(spans.userPrompt),
      system_prompt: truncate(spans.systemPrompt),
    });
  });

  pi.on("agent_end", () => {
    spans.agent?.end();
    spans.agent = null;
  });

  pi.on("turn_start", (event, ctx) => {
    spans.curTurn = event.turnIndex;
    const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "unknown";
    spans.turns.set(
      event.turnIndex,
      logfire.startSpan(`pi turn ${event.turnIndex}`, {
        turn_index: event.turnIndex,
        model,
        user_prompt: truncate(spans.userPrompt),
      }, { parentSpan: spans.agent ?? undefined }),
    );
  });

  pi.on("turn_end", (event) => {
    const span = spans.turns.get(event.turnIndex);
    if (span) {
      const msg = event.message;
      if (msg.role === "assistant") {
        const content: any[] = msg.content;
        const text = content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n");
        if (text) span.setAttribute("assistant_message", truncate(text));
        const toolNames = content
          .filter((c) => c.type === "toolCall")
          .map((c) => c.name);
        if (toolNames.length > 0) span.setAttribute("tool_calls", toolNames.join(", "));
      }
      span.end();
    }
    spans.turns.delete(event.turnIndex);
  });

  pi.on("tool_call", (event) => {
    spans.tools.set(
      event.toolCallId,
      logfire.startSpan(`tool: ${event.toolName}`, {
        tool_name: event.toolName,
        tool_input: truncate(JSON.stringify(event.input)),
      }, { parentSpan: spans.turns.get(spans.curTurn) ?? undefined }),
    );
  });

  pi.on("tool_execution_end", (event) => {
    const span = spans.tools.get(event.toolCallId);
    if (span) {
      span.setAttribute("is_error", event.isError);
      if (event.result) span.setAttribute("tool_result", truncate(JSON.stringify(event.result)));
      span.end();
    }
    spans.tools.delete(event.toolCallId);
  });

}

