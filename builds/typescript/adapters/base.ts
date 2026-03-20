import type { GatewayEngineRequest, ToolCallRequest, ToolDefinition } from "../contracts.js";

export type ModelResponse = {
  assistantText: string;
  toolCalls: ToolCallRequest[];
  finishReason: string;
};

export interface ModelAdapter {
  complete(request: GatewayEngineRequest, tools: ToolDefinition[]): Promise<ModelResponse>;
}
