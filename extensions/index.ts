import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as logfire from "@pydantic/logfire-node";

export default function (pi: ExtensionAPI) {
  // No token? No telemetry. Silent no-op, zero overhead.
  if (!process.env.LOGFIRE_TOKEN) return;

  logfire.configure({ serviceName: "pi", sendToLogfire: "if-token-present" });

  // Active spans — stored by index/call-id so we can end() them in paired events
  const spans = {
    agent: null as { end(): void } | null,
    turns: new Map<number, { end(): void }>(),
    tools: new Map<string, { end(): void }>(),
    curTurn: -1,
  };

  pi.on("session_shutdown", async () => {
    await logfire.shutdown();
  });

  pi.on("agent_start", () => {
    if (spans.agent) spans.agent.end(); // safety: shouldn't overlap
    spans.agent = logfire.startSpan("pi agent");
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
      logfire.startSpan(`pi turn ${event.turnIndex}`, { turn_index: event.turnIndex, model }, { parentSpan: spans.agent ?? undefined }),
    );
  });

  pi.on("turn_end", (event) => {
    spans.turns.get(event.turnIndex)?.end();
    spans.turns.delete(event.turnIndex);
  });

  pi.on("tool_call", (event) => {
    spans.tools.set(
      event.toolCallId,
      logfire.startSpan(`tool: ${event.toolName}`, { tool_name: event.toolName }, { parentSpan: spans.turns.get(spans.curTurn) ?? undefined }),
    );
  });

  pi.on("tool_execution_end", (event) => {
    spans.tools.get(event.toolCallId)?.end();
    spans.tools.delete(event.toolCallId);
  });

}

