import type { AdapterConfig, GatewayEngineRequest, ToolDefinition } from "../contracts.js";
import type { ModelAdapter, ModelResponse } from "./base.js";

type OpenAIMessage = {
  role: string;
  content?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  name?: string;
};

type OpenAICompletionResponse = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | Array<{ type: string; text?: string }> | null;
      tool_calls?: Array<{
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
  }>;
  error?: {
    message?: string;
    code?: string | number;
    metadata?: {
      provider_name?: string;
      raw?: string;
    };
  };
};

type OpenAIMessageContent =
  | string
  | Array<{ type: string; text?: string }>
  | null
  | undefined;

export class OpenAICompatibleAdapter implements ModelAdapter {
  constructor(private readonly config: AdapterConfig) {}

  async complete(request: GatewayEngineRequest, tools: ToolDefinition[]): Promise<ModelResponse> {
    const apiKey = process.env[this.config.api_key_env] ?? "";
    const response = await fetch(`${this.config.base_url}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey.length > 0 ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.config.model,
        stream: false,
        messages: request.messages.map<OpenAIMessage>((message) => ({
          role: message.role,
          content: message.content,
          ...(message.role === "tool" && message.tool_call_id ? { tool_call_id: message.tool_call_id } : {}),
          ...(message.role === "assistant" && message.tool_calls
            ? {
                tool_calls: message.tool_calls.map((toolCall) => ({
                  id: toolCall.id,
                  type: "function",
                  function: {
                    name: toolCall.name,
                    arguments: JSON.stringify(toolCall.input),
                  },
                })),
              }
            : {}),
        })),
        tools: tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        })),
        tool_choice: tools.length > 0 ? "auto" : undefined,
      }),
    });

    const payload = await parseProviderPayload(response);
    if (!response.ok) {
      throw new Error(formatProviderFailure(response.status, payload));
    }

    const choice = payload.choices?.[0];
    if (!choice?.message) {
      return {
        assistantText: "",
        toolCalls: [],
        finishReason: choice?.finish_reason ?? "completed",
      };
    }

    const assistantText = normalizeAssistantText(choice.message.content);
    const toolCalls = (choice.message.tool_calls ?? []).map((call) => ({
      id: call.id ?? crypto.randomUUID(),
      name: call.function?.name ?? "unknown_tool",
      input: parseToolArguments(call.function?.arguments),
    }));

    return {
      assistantText,
      toolCalls,
      finishReason: choice.finish_reason ?? (toolCalls.length > 0 ? "tool_calls" : "completed"),
    };
  }
}

async function parseProviderPayload(response: Response): Promise<OpenAICompletionResponse> {
  const rawBody = await response.text();
  if (rawBody.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(rawBody) as OpenAICompletionResponse;
  } catch {
    return {
      error: {
        message: rawBody,
      },
    };
  }
}

function formatProviderFailure(status: number, payload: OpenAICompletionResponse): string {
  const message = payload.error?.message ?? `Provider request failed (status ${status})`;
  const segments = [message];

  if (payload.error?.code !== undefined) {
    segments.push(`code=${String(payload.error.code)}`);
  }

  if (payload.error?.metadata?.provider_name) {
    segments.push(`provider=${payload.error.metadata.provider_name}`);
  }

  if (payload.error?.metadata?.raw) {
    segments.push(`raw=${truncate(payload.error.metadata.raw, 320)}`);
  }

  return segments.join(" | ");
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function normalizeAssistantText(content: OpenAIMessageContent): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("");
  }

  return "";
}

function parseToolArguments(argumentsPayload?: string): Record<string, unknown> {
  if (!argumentsPayload) {
    return {};
  }

  try {
    const parsed = JSON.parse(argumentsPayload);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }

  return {};
}
