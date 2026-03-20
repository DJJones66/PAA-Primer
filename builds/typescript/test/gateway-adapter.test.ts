import path from "node:path";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { createGatewayAdapter } from "../adapters/gateway.js";
import type { StreamEvent } from "../contracts.js";

describe("gateway adapter", () => {
  it("creates the canonical openai-compatible gateway adapter", () => {
    const adapter = createGatewayAdapter("openai-compatible");
    expect(adapter).toBeTruthy();
  });

  it("fails clearly on unsupported gateway adapter keys", () => {
    expect(() => createGatewayAdapter("unsupported-gateway-adapter")).toThrow(
      "Unsupported gateway adapter: unsupported-gateway-adapter"
    );
  });

  it("normalizes valid message requests and conversation header", () => {
    const adapter = createGatewayAdapter("openai-compatible");
    const result = adapter.normalizeMessageRequest(
      {
        content: "hello",
        metadata: {
          client: "paa-cli",
        },
      },
      "conv_123"
    );

    expect(result).toEqual({
      ok: true,
      request: {
        content: "hello",
        metadata: { client: "paa-cli" },
        requestedConversationId: "conv_123",
      },
    });
  });

  it("normalizes conversation header arrays using the first value", () => {
    const adapter = createGatewayAdapter("openai-compatible");
    const result = adapter.normalizeMessageRequest(
      {
        content: "hello",
        metadata: {
          client: "paa-cli",
        },
      },
      ["conv_a", "conv_b"]
    );

    expect(result).toEqual({
      ok: true,
      request: {
        content: "hello",
        metadata: { client: "paa-cli" },
        requestedConversationId: "conv_a",
      },
    });
  });

  it("rejects metadata side channels with invalid_request classification", () => {
    const adapter = createGatewayAdapter("openai-compatible");
    const result = adapter.normalizeMessageRequest(
      {
        content: "hello",
        metadata: {
          client: "paa-cli",
          provider: "openrouter",
        },
      },
      undefined
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("invalid_request");
      expect(result.failure.issueCount).toBeGreaterThan(0);
    }
  });

  it("builds bounded internal engine request envelopes", () => {
    const adapter = createGatewayAdapter("openai-compatible");
    const engineRequest = adapter.buildEngineRequest({
      conversationId: "conv_123",
      correlationId: "corr_123",
      messages: [
        { role: "system", content: "System prompt" },
        { role: "user", content: "hello" },
      ],
      clientMetadata: { client: "paa-cli" },
    });

    expect(engineRequest).toEqual({
      messages: [
        { role: "system", content: "System prompt" },
        { role: "user", content: "hello" },
      ],
      metadata: {
        correlation_id: "corr_123",
        conversation_id: "conv_123",
        client_context: { client: "paa-cli" },
      },
    });
  });

  it("maps done events to canonical client reconciliation identifiers", () => {
    const adapter = createGatewayAdapter("openai-compatible");
    const mapped = adapter.toClientStreamEvent(
      {
        type: "done",
        conversation_id: "",
        message_id: "",
        finish_reason: "stop",
      },
      { conversationId: "conv_abc", messageId: "msg_xyz" }
    );

    expect(mapped).toEqual({
      type: "done",
      conversation_id: "conv_abc",
      message_id: "msg_xyz",
      finish_reason: "stop",
    });
  });

  it("keeps non-done stream events unchanged", () => {
    const adapter = createGatewayAdapter("openai-compatible");
    const inputEvent: StreamEvent = {
      type: "text-delta",
      delta: "hello",
    };

    const mapped = adapter.toClientStreamEvent(inputEvent, {
      conversationId: "conv_abc",
      messageId: "msg_xyz",
    });

    expect(mapped).toEqual(inputEvent);
  });

  it("does not couple gateway adapter modules to conversation/auth ownership code", async () => {
    const adapterFile = path.join(process.cwd(), "adapters", "gateway-openai-compatible.ts");
    const source = await readFile(adapterFile, "utf8");

    expect(source).not.toContain("../gateway/");
    expect(source).not.toContain("../auth/");
    expect(source).not.toContain("conversation-store");
    expect(source).not.toContain("GatewayConversationService");
    expect(source).not.toContain("ToolExecutor");
  });
});

