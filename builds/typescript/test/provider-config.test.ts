import { afterEach, describe, expect, it, vi } from "vitest";

import { createModelAdapter } from "../adapters/index.js";
import type { AdapterConfig, GatewayEngineRequest, Preferences, ToolDefinition } from "../contracts.js";
import { classifyProviderError } from "../engine/errors.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("provider configuration behavior", () => {
  it("uses adapter model when preference is the legacy bootstrap default", async () => {
    const captured = await runAdapterAndCaptureModel(
      {
        base_url: "https://example.test/v1",
        model: "openai/gpt-4o-mini",
        api_key_env: "OPENAI_API_KEY",
      },
      {
        default_model: "llama3.1",
        approval_mode: "ask-on-write",
      }
    );

    expect(captured).toBe("openai/gpt-4o-mini");
  });

  it("uses explicit owner preference when it differs from the legacy default", async () => {
    const captured = await runAdapterAndCaptureModel(
      {
        base_url: "https://example.test/v1",
        model: "openai/gpt-4o-mini",
        api_key_env: "OPENAI_API_KEY",
      },
      {
        default_model: "meta-llama/llama-3.1-8b-instruct",
        approval_mode: "ask-on-write",
      }
    );

    expect(captured).toBe("meta-llama/llama-3.1-8b-instruct");
  });

  it("maps missing auth credential errors to a clear message", () => {
    const event = classifyProviderError(new Error("No auth credentials found"));
    expect(event).toEqual({
      type: "error",
      code: "provider_error",
      message: "The model provider credentials were rejected",
    });
  });

  it("maps unavailable model errors to a clear message", () => {
    const event = classifyProviderError(
      new Error("No endpoints found that support tool use for model openai/gpt-4o-mini")
    );
    expect(event).toEqual({
      type: "error",
      code: "provider_error",
      message: "The configured model is unavailable from the provider",
    });
  });

  it("maps tool-call formatting failures to a clear message", () => {
    const event = classifyProviderError(
      new Error("Invalid parameter: messages with role 'tool' must include a matching tool_call_id")
    );
    expect(event).toEqual({
      type: "error",
      code: "provider_error",
      message: "The provider rejected tool-call message formatting",
    });
  });

  it("sends tool_call_id for tool role messages", async () => {
    let capturedToolCallId: string | undefined;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          messages?: Array<{ role: string; tool_call_id?: string }>;
        };
        capturedToolCallId = body.messages?.find((message) => message.role === "tool")?.tool_call_id;

        return new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: "ok",
                  tool_calls: [],
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      })
    );

    const adapter = createModelAdapter(
      "openai-compatible",
      {
        base_url: "https://example.test/v1",
        model: "openai/gpt-4o-mini",
        api_key_env: "OPENAI_API_KEY",
      },
      {
        default_model: "openai/gpt-4o-mini",
        approval_mode: "ask-on-write",
      }
    );

    await adapter.complete(
      {
        messages: [
          { role: "user", content: "Run tool" },
          { role: "assistant", content: "Calling tool now" },
          { role: "tool", content: "{\"status\":\"ok\"}", tool_call_id: "call_123" },
        ],
        metadata: { correlation_id: "test-tool-id" },
      },
      [] as ToolDefinition[]
    );

    expect(capturedToolCallId).toBe("call_123");
  });

  it("sends assistant tool_calls metadata when present", async () => {
    let capturedAssistantToolCallName: string | undefined;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          messages?: Array<{
            role: string;
            tool_calls?: Array<{ function?: { name?: string } }>;
          }>;
        };

        capturedAssistantToolCallName = body.messages
          ?.find((message) => message.role === "assistant")
          ?.tool_calls?.[0]?.function?.name;

        return new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: "ok",
                  tool_calls: [],
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        );
      })
    );

    const adapter = createModelAdapter(
      "openai-compatible",
      {
        base_url: "https://example.test/v1",
        model: "openai/gpt-4o-mini",
        api_key_env: "OPENAI_API_KEY",
      },
      {
        default_model: "openai/gpt-4o-mini",
        approval_mode: "ask-on-write",
      }
    );

    await adapter.complete(
      {
        messages: [
          { role: "user", content: "List projects" },
          {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "call_abc",
                name: "memory_list",
                input: { path: "documents" },
              },
            ],
          },
          {
            role: "tool",
            content: "{\"status\":\"ok\",\"output\":{\"entries\":[]}}",
            tool_call_id: "call_abc",
          },
        ],
        metadata: { correlation_id: "test-assistant-tool-calls" },
      },
      [] as ToolDefinition[]
    );

    expect(capturedAssistantToolCallName).toBe("memory_list");
  });
});

async function runAdapterAndCaptureModel(adapterConfig: AdapterConfig, preferences: Preferences): Promise<string> {
  let capturedModel = "";

  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
      capturedModel = String(body.model ?? "");

      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: "ok",
                tool_calls: [],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    })
  );

  const adapter = createModelAdapter("openai-compatible", adapterConfig, preferences);

  const request: GatewayEngineRequest = {
    messages: [{ role: "user", content: "hello" }],
    metadata: { correlation_id: "test" },
  };

  await adapter.complete(request, [] as ToolDefinition[]);
  return capturedModel;
}
