import path from "node:path";
import Fastify from "fastify";
import { z } from "zod";

import { createGatewayAdapter } from "../adapters/gateway.js";
import { createModelAdapter } from "../adapters/index.js";
import { authorizeApprovalDecision } from "../auth/authorize.js";
import { authMiddleware } from "../auth/middleware.js";
import { loadAdapterConfig, loadPreferences, loadRuntimeConfig, ensureMemoryLayout, readBootstrapPrompt } from "../config.js";
import type { ClientMessageRequest } from "../contracts.js";
import { runAgentLoop } from "../engine/loop.js";
import { classifyProviderError } from "../engine/errors.js";
import { formatSseEvent } from "../engine/stream.js";
import { ToolExecutor } from "../engine/tool-executor.js";
import { ensureGitReady } from "../git.js";
import { auditLog } from "../logger.js";
import { ensureAuthState } from "../memory/auth-state.js";
import type { RuntimeConfig } from "../contracts.js";
import type { ConversationRepository } from "../memory/conversation-repository.js";
import { MarkdownConversationStore } from "../memory/conversation-store-markdown.js";
import { discoverTools } from "../tools.js";
import { ApprovalStore } from "../engine/approval-store.js";
import { GatewayConversationService } from "./conversations.js";

const approvalDecisionSchema = z.object({
  decision: z.enum(["approved", "denied"]),
});

export async function buildServer(rootDir = process.cwd()) {
  auditLog("startup.phase", { phase: "runtime-config" });
  const runtimeConfig = await loadRuntimeConfig(rootDir);

  auditLog("startup.phase", { phase: "adapter-config" });
  const adapterConfig = await loadAdapterConfig(rootDir, runtimeConfig.provider_adapter);

  auditLog("startup.phase", { phase: "tools" });
  const tools = await discoverTools(runtimeConfig.memory_root, runtimeConfig.tool_sources);

  auditLog("startup.phase", { phase: "memory" });
  await ensureMemoryLayout(runtimeConfig.memory_root);
  await ensureGitReady(runtimeConfig.memory_root);

  auditLog("startup.phase", { phase: "preferences" });
  const preferences = await loadPreferences(runtimeConfig.memory_root);
  const authState = await ensureAuthState(runtimeConfig.memory_root);
  const systemPrompt = await readBootstrapPrompt(runtimeConfig.memory_root);
  const gatewayAdapter = createGatewayAdapter("openai-compatible");
  const modelAdapter = createModelAdapter(runtimeConfig.provider_adapter, adapterConfig, preferences);

  auditLog("startup.phase", { phase: "ready" });

  const app = Fastify({ logger: false });
  const approvalStore = new ApprovalStore();
  const toolExecutor = new ToolExecutor(tools);
  const conversations = new GatewayConversationService(createConversationRepository(runtimeConfig));

  app.get("/health", async () => ({ status: "ok" }));

  app.addHook("preHandler", async (request, reply) => {
    if (request.url === "/health") {
      return;
    }

    await authMiddleware(request, reply, authState);
  });

  app.post("/message", async (request, reply) => {
    const normalizedRequest = gatewayAdapter.normalizeMessageRequest(request.body, request.headers["x-conversation-id"]);
    if (!normalizedRequest.ok) {
      sendInvalidRequest(reply, "/message", normalizedRequest.failure.issueCount);
      return;
    }

    const body: ClientMessageRequest = {
      content: normalizedRequest.request.content,
      ...(normalizedRequest.request.metadata ? { metadata: normalizedRequest.request.metadata } : {}),
    };
    const requestedConversationId = normalizedRequest.request.requestedConversationId;

    if (requestedConversationId && !conversations.hasConversation(requestedConversationId)) {
      auditLog("contract.error", {
        route: "/message",
        status: 404,
        reason: "conversation_not_found",
        conversation_id: requestedConversationId,
      });
      reply.code(404).send({ error: "Conversation not found" });
      return;
    }

    const { conversationId } = conversations.persistUserMessage(requestedConversationId, body);
    const engineRequest = gatewayAdapter.buildEngineRequest({
      conversationId,
      correlationId: crypto.randomUUID(),
      messages: conversations.buildConversationMessages(conversationId, systemPrompt),
      ...(body.metadata ? { clientMetadata: body.metadata } : {}),
    });

    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-conversation-id": conversationId,
    });

    let assistantBuffer = "";
    let currentAssistantMessageId = crypto.randomUUID();
    let lastPersistedAssistantMessageId: string | null = null;
    const pendingToolCalls = new Map<string, { name: string; input: Record<string, unknown> }>();

    try {
      for await (const event of runAgentLoop(
        modelAdapter,
        toolExecutor,
        approvalStore,
        engineRequest,
        request.authContext,
        {
          memoryRoot: runtimeConfig.memory_root,
          safetyIterationLimit: runtimeConfig.safety_iteration_limit,
        }
      )) {
        if (event.type === "tool-call") {
          pendingToolCalls.set(event.id, {
            name: event.name,
            input: event.input,
          });
        }

        if (event.type === "text-delta") {
          assistantBuffer += event.delta;
        }

        if (event.type === "tool-result") {
          const toolCall = pendingToolCalls.get(event.id);
          pendingToolCalls.delete(event.id);

          if (assistantBuffer.trim().length > 0) {
            conversations.appendAssistantMessage(conversationId, currentAssistantMessageId, assistantBuffer);
            lastPersistedAssistantMessageId = currentAssistantMessageId;
            assistantBuffer = "";
            currentAssistantMessageId = crypto.randomUUID();
          }

          conversations.appendToolMessage(
            conversationId,
            event.id,
            JSON.stringify({
              status: event.status,
              output: event.output,
            }),
            toolCall
          );
        }

        const outgoingEvent = gatewayAdapter.toClientStreamEvent(event, {
          conversationId,
          messageId: lastPersistedAssistantMessageId ?? currentAssistantMessageId,
        });
        reply.raw.write(formatSseEvent(outgoingEvent));
      }

      if (assistantBuffer.trim().length > 0) {
        conversations.appendAssistantMessage(conversationId, currentAssistantMessageId, assistantBuffer);
        lastPersistedAssistantMessageId = currentAssistantMessageId;
      }
    } catch (error) {
      auditLog("gateway.error", {
        conversation_id: conversationId,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      reply.raw.write(formatSseEvent(classifyProviderError(error)));
    } finally {
      reply.raw.end();
    }

    return reply;
  });

  app.post("/approvals/:requestId", async (request, reply) => {
    const params = request.params as { requestId: string };
    const parsedBody = approvalDecisionSchema.safeParse(request.body);
    if (!parsedBody.success) {
      sendInvalidRequest(reply, "/approvals/:requestId", parsedBody.error.issues.length);
      return;
    }

    const body = parsedBody.data;
    try {
      authorizeApprovalDecision(request.authContext);
    } catch {
      auditLog("contract.error", {
        route: "/approvals/:requestId",
        status: 403,
        reason: "missing_approval_authority",
      });
      reply.code(403).send({ error: "Forbidden" });
      return;
    }
    const approval = approvalStore.resolve(params.requestId, body.decision);
    if (!approval) {
      auditLog("contract.error", {
        route: "/approvals/:requestId",
        status: 404,
        reason: "approval_not_found",
      });
      reply.code(404).send({ error: "Approval request not found" });
      return;
    }

    reply.send({ request_id: params.requestId, decision: body.decision });
  });

  app.get("/conversations", async (request) => {
    const query = request.query as { limit?: string; offset?: string };
    const limit = query.limit ? Number(query.limit) : 50;
    const offset = query.offset ? Number(query.offset) : 0;
    return conversations.list(limit, offset);
  });

  app.get("/conversations/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const detail = conversations.detail(params.id);
    if (!detail) {
      auditLog("contract.error", {
        route: "/conversations/:id",
        status: 404,
        reason: "conversation_not_found",
        conversation_id: params.id,
      });
      reply.code(404).send({ error: "Conversation not found" });
      return;
    }

    return detail;
  });

  return {
    app,
    runtimeConfig,
    adapterConfig,
    rootDir,
  };
}

function createConversationRepository(runtimeConfig: RuntimeConfig): ConversationRepository {
  switch (runtimeConfig.conversation_store) {
    case "markdown":
      return new MarkdownConversationStore(runtimeConfig.memory_root);
    default:
      throw new Error(`Unsupported conversation store: ${(runtimeConfig as { conversation_store?: string }).conversation_store ?? "unknown"}`);
  }
}

function sendInvalidRequest(
  reply: { code: (statusCode: number) => { send: (payload: unknown) => void } },
  route: string,
  issueCount: number
): void {
  auditLog("contract.error", {
    route,
    status: 400,
    reason: "invalid_request",
    issue_count: issueCount,
  });
  reply.code(400).send({ error: "Invalid request" });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const rootDir = process.cwd();
  buildServer(rootDir)
    .then(async ({ app, runtimeConfig }) => {
      await app.listen({ host: runtimeConfig.bind_address, port: runtimeConfig.port ?? 8787 });
      auditLog("startup.listen", { host: runtimeConfig.bind_address, port: runtimeConfig.port ?? 8787 });
    })
    .catch((error) => {
      auditLog("startup.failure", {
        message: error instanceof Error ? error.message : "Unknown startup error",
      });
      process.exitCode = 1;
    });
}
