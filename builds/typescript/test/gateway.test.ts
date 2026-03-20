import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

import { authHeadersFromState } from "../auth/headers.js";
import type { ModelAdapter, ModelResponse } from "../adapters/base.js";
import type { GatewayEngineRequest, StreamEvent, ToolDefinition } from "../contracts.js";
import { runAgentLoop } from "../engine/loop.js";
import { ApprovalStore } from "../engine/approval-store.js";
import { ToolExecutor } from "../engine/tool-executor.js";
import { buildServer } from "../gateway/server.js";
import { ToolExecutionFailure } from "../tool-error.js";

const tempRoots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("gateway contract", () => {
  it("requires auth on protected requests", async () => {
    const root = await createFixtureRoot();
    const { app } = await buildServer(root);

    const response = await app.inject({
      method: "GET",
      url: "/conversations",
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("streams canonical message flow and persists the conversation", async () => {
    const root = await createFixtureRoot();
    const originalWrite = process.stdout.write.bind(process.stdout);
    const lines: string[] = [];
    process.stdout.write = ((chunk: string | Uint8Array) => {
      lines.push(String(chunk).trim());
      return true;
    }) as typeof process.stdout.write;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: "I can help with that.",
                  tool_calls: [],
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        )
      )
    );

    try {
      const { app } = await buildServer(root);
      const messageResponse = await app.inject({
        method: "POST",
        url: "/message",
        headers: {
          "content-type": "application/json",
          ...ownerHeaders(),
        },
        payload: {
          content: "Create a spec for a fitness tracker app.",
          metadata: {
            client: "paa-cli",
          },
        },
      });

      expect(messageResponse.statusCode).toBe(200);
      expect(messageResponse.headers["x-conversation-id"]).toBeTruthy();
      expect(messageResponse.payload).toContain("event: text-delta");
      expect(messageResponse.payload).toContain("event: done");
      expect(messageResponse.payload).toContain("conversation_id");
      expect(messageResponse.payload).toContain("message_id");

      const conversationId = String(messageResponse.headers["x-conversation-id"]);
      const conversationResponse = await app.inject({
        method: "GET",
        url: `/conversations/${conversationId}`,
        headers: {
          ...ownerHeaders(),
        },
      });

      expect(conversationResponse.statusCode).toBe(200);
      const detail = conversationResponse.json() as {
        id: string;
        messages: Array<{ role: string; content: string }>;
      };
      expect(detail.id).toBe(conversationId);
      expect(detail.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
      expect(detail.messages[1]?.content).toContain("I can help with that.");

      const loggedEvents = lines
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { event: string })
        .map((entry) => entry.event);

      expect(loggedEvents).toContain("auth.authorized");
      expect(loggedEvents).toContain("memory.write");
      await app.close();
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  it("rejects invalid pre-stream request bodies safely", async () => {
    const root = await createFixtureRoot();
    const { app } = await buildServer(root);

    const messageResponse = await app.inject({
      method: "POST",
      url: "/message",
      headers: {
        "content-type": "application/json",
        ...ownerHeaders(),
      },
      payload: {
        metadata: { client: "paa-cli" },
      },
    });

    expect(messageResponse.statusCode).toBe(400);
    expect(messageResponse.json()).toEqual({ error: "Invalid request" });
    expect(messageResponse.payload).not.toContain("Zod");

    const approvalResponse = await app.inject({
      method: "POST",
      url: "/approvals/apr_1",
      headers: {
        "content-type": "application/json",
        ...ownerHeaders(),
      },
      payload: {
        approved: true,
      },
    });

    expect(approvalResponse.statusCode).toBe(400);
    expect(approvalResponse.json()).toEqual({ error: "Invalid request" });
    await app.close();
  });

  it("rejects config-like metadata side channels", async () => {
    const root = await createFixtureRoot();
    const { app } = await buildServer(root);

    const response = await app.inject({
      method: "POST",
      url: "/message",
      headers: {
        "content-type": "application/json",
        ...ownerHeaders(),
      },
      payload: {
        content: "hello",
        metadata: {
          client: "paa-cli",
          provider: "openrouter",
          tool_sources: ["/tmp/tools"],
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Invalid request" });
    expect(response.payload).not.toContain("provider");
    await app.close();
  });

  it("rejects unknown conversation ids safely", async () => {
    const root = await createFixtureRoot();
    const { app } = await buildServer(root);

    const response = await app.inject({
      method: "POST",
      url: "/message",
      headers: {
        "content-type": "application/json",
        "x-conversation-id": "conv_missing",
        ...ownerHeaders(),
      },
      payload: {
        content: "hello",
        metadata: { client: "paa-cli" },
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Conversation not found" });
    expect(response.payload).not.toContain("SQLITE_CONSTRAINT");
    await app.close();
  });

  it("persists assistant and tool history across a tool turn", async () => {
    const root = await createFixtureRoot();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ role: string }> };
        const lastRole = body.messages?.[body.messages.length - 1]?.role;

        if (lastRole === "tool") {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  finish_reason: "stop",
                  message: {
                    content: "Completed request after reading auth state.",
                    tool_calls: [],
                  },
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "tool_calls",
                message: {
                  content: "I will export auth state.",
                  tool_calls: [
                    {
                      id: "tool_auth_export",
                      function: {
                        name: "auth_export",
                        arguments: "{}",
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    );

    const { app } = await buildServer(root);
    const response = await app.inject({
      method: "POST",
      url: "/message",
      headers: {
        "content-type": "application/json",
        ...ownerHeaders(),
      },
      payload: {
        content: "Run auth export now",
        metadata: { client: "paa-cli" },
      },
    });

    expect(response.statusCode).toBe(200);
    const conversationId = String(response.headers["x-conversation-id"]);
    const detailResponse = await app.inject({
      method: "GET",
      url: `/conversations/${conversationId}`,
      headers: ownerHeaders(),
    });

    expect(detailResponse.statusCode).toBe(200);
    const detail = detailResponse.json() as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(detail.messages.map((message) => message.role)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(detail.messages[2]?.content).toContain('"actor_id":"owner"');
    expect(detail.messages[2]?.content).toContain('"call":{"name":"auth_export"');
    expect(detail.messages[3]?.content).toContain("Completed request after reading auth state.");
    await app.close();
  });

  it("replays the same stored tool content on a later turn", async () => {
    const root = await createFixtureRoot();
    const seenBodies: Array<{ messages?: Array<{ role: string; content: string; tool_call_id?: string }> }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          messages?: Array<{ role: string; content: string; tool_call_id?: string }>;
        };
        seenBodies.push(body);
        const lastRole = body.messages?.[body.messages.length - 1]?.role;

        if (lastRole === "tool") {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  finish_reason: "stop",
                  message: {
                    content: "Completed request after reading auth state.",
                    tool_calls: [],
                  },
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }

        if ((body.messages ?? []).some((message) => message.role === "tool")) {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  finish_reason: "stop",
                  message: {
                    content: "Second turn complete.",
                    tool_calls: [],
                  },
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "tool_calls",
                message: {
                  content: "I will export auth state.",
                  tool_calls: [
                    {
                      id: "tool_auth_export",
                      function: {
                        name: "auth_export",
                        arguments: "{}",
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    );

    const { app } = await buildServer(root);
    const firstResponse = await app.inject({
      method: "POST",
      url: "/message",
      headers: {
        "content-type": "application/json",
        ...ownerHeaders(),
      },
      payload: {
        content: "Run auth export now",
        metadata: { client: "paa-cli" },
      },
    });

    const conversationId = String(firstResponse.headers["x-conversation-id"]);
    const secondResponse = await app.inject({
      method: "POST",
      url: "/message",
      headers: {
        "content-type": "application/json",
        "x-conversation-id": conversationId,
        ...ownerHeaders(),
      },
      payload: {
        content: "Continue",
        metadata: { client: "paa-cli" },
      },
    });

    expect(secondResponse.statusCode).toBe(200);

    const continuationRequest = seenBodies[1];
    const replayRequest = seenBodies[2];
    const continuationToolMessage = continuationRequest?.messages?.find((message) => message.role === "tool");
    const replayToolMessage = replayRequest?.messages?.find((message) => message.role === "tool");
    const continuationTool = continuationToolMessage?.content;
    const replayTool = replayToolMessage?.content;

    expect(continuationTool).toBeTruthy();
    expect(replayTool).toBe(continuationTool);
    expect(continuationToolMessage?.tool_call_id).toBe("tool_auth_export");
    expect(replayToolMessage?.tool_call_id).toBe("tool_auth_export");
    await app.close();
  });

  it("replays the same denied tool content on a later turn", async () => {
    const approvalStore = new ApprovalStore();
    const seenRequests: GatewayEngineRequest[] = [];
    const adapter = new DeniedReplayAdapter(seenRequests);
    const toolExecutor = new ToolExecutor([deniedWriteTool()]);
    const auth = ownerAuthContext();
    const request: GatewayEngineRequest = {
      messages: [{ role: "user", content: "Create folder fitness and write spec.md" }],
      metadata: { correlation_id: "req_1", conversation_id: "conv_1" },
    };

    const events: StreamEvent[] = [];
    for await (const event of runAgentLoop(adapter, toolExecutor, approvalStore, request, auth, { memoryRoot: rootMemory(), safetyIterationLimit: 5 })) {
      events.push(event);
      if (event.type === "approval-request") {
        setTimeout(() => {
          approvalStore.resolve(event.request_id, "denied");
        }, 0);
      }
    }

    const continuationTool = seenRequests[1]?.messages.find((message) => message.role === "tool")?.content;
    expect(continuationTool).toBeTruthy();
    expect(continuationTool).toContain('"status":"denied"');
    expect(events.some((event) => event.type === "approval-result")).toBe(true);
  });

  it("only advertises Auth-allowed tools to the model", async () => {
    const approvalStore = new ApprovalStore();
    const adapter = new ToolCaptureAdapter();
    const toolExecutor = new ToolExecutor([
      deniedWriteTool(),
      {
        name: "auth_export",
        description: "Return exportable non-secret auth state",
        requiresApproval: false,
        readOnly: true,
        inputSchema: { type: "object", properties: {} },
        execute: async () => ({ actor_id: "owner" }),
      },
    ]);

    const restrictedAuth = {
      actorId: "owner" as const,
      actorType: "owner" as const,
      mode: "local-owner" as const,
      permissions: {
        memory_access: false,
        tool_access: true,
        system_actions: true,
        delegation: true,
        approval_authority: false,
        administration: false,
      },
    };

    const request: GatewayEngineRequest = {
      messages: [{ role: "user", content: "hello" }],
      metadata: { correlation_id: "req_1", conversation_id: "conv_1" },
    };

    for await (const _event of runAgentLoop(adapter, toolExecutor, approvalStore, request, restrictedAuth, {
      memoryRoot: rootMemory(),
      safetyIterationLimit: 2,
    })) {
    }

    expect(adapter.seenToolNames).toEqual([]);
  });

  it("continues after recoverable tool failures and reaches done", async () => {
    const approvalStore = new ApprovalStore();
    const adapter = new RecoverableFailureAdapter();
    const toolExecutor = new ToolExecutor([
      {
        name: "memory_read",
        description: "Read a file inside memory root",
        requiresApproval: false,
        readOnly: true,
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
          },
          required: ["path"],
        },
        execute: async () => {
          throw new ToolExecutionFailure("not_found", "Requested path not found", true);
        },
      },
    ]);

    const request: GatewayEngineRequest = {
      messages: [{ role: "user", content: "Read documents/missing.md" }],
      metadata: { correlation_id: "req_recoverable_1", conversation_id: "conv_recoverable_1" },
    };

    const events: StreamEvent[] = [];
    for await (const event of runAgentLoop(adapter, toolExecutor, approvalStore, request, ownerAuthContext(), {
      memoryRoot: rootMemory(),
      safetyIterationLimit: 4,
    })) {
      events.push(event);
    }

    const toolErrorEvent = events.find((event) => event.type === "tool-result" && event.status === "error");
    expect(toolErrorEvent).toBeTruthy();
    if (toolErrorEvent?.type === "tool-result") {
      expect(toolErrorEvent.output).toMatchObject({
        code: "not_found",
        recoverable: true,
      });
    }

    expect(events.some((event) => event.type === "error")).toBe(false);
    expect(events.some((event) => event.type === "done")).toBe(true);
  });

  it("blocks repeated duplicate tool calls with loop_guard and still completes", async () => {
    const approvalStore = new ApprovalStore();
    const adapter = new RepeatCallAdapter();
    const toolExecutor = new ToolExecutor([
      {
        name: "memory_list",
        description: "List files inside memory root",
        requiresApproval: false,
        readOnly: true,
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
          },
          required: ["path"],
        },
        execute: async () => ({
          path: "documents",
          entries: [],
        }),
      },
    ]);

    const request: GatewayEngineRequest = {
      messages: [{ role: "user", content: "List my projects" }],
      metadata: { correlation_id: "req_repeat_1", conversation_id: "conv_repeat_1" },
    };

    const events: StreamEvent[] = [];
    for await (const event of runAgentLoop(adapter, toolExecutor, approvalStore, request, ownerAuthContext(), {
      memoryRoot: rootMemory(),
      safetyIterationLimit: 8,
      repeatToolCallThreshold: 2,
    })) {
      events.push(event);
    }

    const loopGuardEvent = events.find(
      (event) =>
        event.type === "tool-result" &&
        event.status === "error" &&
        typeof event.output === "object" &&
        event.output !== null &&
        "code" in event.output &&
        (event.output as { code?: string }).code === "loop_guard"
    );

    expect(loopGuardEvent).toBeTruthy();
    expect(events.some((event) => event.type === "done")).toBe(true);
    expect(events.some((event) => event.type === "error")).toBe(false);
  });

  it("blocks destructive mutation calls that overlap recently mutated paths in the same turn", async () => {
    const approvalStore = new ApprovalStore();
    const adapter = new MutationScopeConflictAdapter();
    let writeExecutions = 0;
    let deleteExecutions = 0;

    const toolExecutor = new ToolExecutor([
      {
        name: "memory_write",
        description: "Write a file inside memory root",
        requiresApproval: true,
        readOnly: false,
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
          },
          required: ["path", "content"],
        },
        execute: async () => {
          writeExecutions += 1;
          return { ok: true };
        },
      },
      {
        name: "memory_delete",
        description: "Delete a file or folder inside memory root",
        requiresApproval: true,
        readOnly: false,
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
          },
          required: ["path"],
        },
        execute: async () => {
          deleteExecutions += 1;
          return { deleted: true };
        },
      },
    ]);

    const request: GatewayEngineRequest = {
      messages: [{ role: "user", content: "Create note.txt in memory-eval" }],
      metadata: { correlation_id: "req_mutation_scope_1", conversation_id: "conv_mutation_scope_1" },
    };

    const events: StreamEvent[] = [];
    for await (const event of runAgentLoop(adapter, toolExecutor, approvalStore, request, ownerAuthContext(), {
      memoryRoot: rootMemory(),
      safetyIterationLimit: 5,
    })) {
      events.push(event);
      if (event.type === "approval-request") {
        setTimeout(() => {
          approvalStore.resolve(event.request_id, "approved");
        }, 0);
      }
    }

    const mutationScopeGuardEvent = events.find(
      (event) =>
        event.type === "tool-result" &&
        event.status === "error" &&
        typeof event.output === "object" &&
        event.output !== null &&
        "code" in event.output &&
        (event.output as { code?: string }).code === "mutation_scope_guard"
    );

    expect(mutationScopeGuardEvent).toBeTruthy();
    expect(events.filter((event) => event.type === "approval-request")).toHaveLength(1);
    expect(writeExecutions).toBe(1);
    expect(deleteExecutions).toBe(0);
    expect(events.some((event) => event.type === "done")).toBe(true);
    expect(events.some((event) => event.type === "error")).toBe(false);
  });
});

function ownerHeaders(): Record<string, string> {
  return authHeadersFromState({
    actor_id: "owner",
    actor_type: "owner",
    mode: "local-owner",
    permissions: {
      memory_access: true,
      tool_access: true,
      system_actions: true,
      delegation: true,
      approval_authority: true,
      administration: true,
    },
    created_at: "",
    updated_at: "",
  });
}

function ownerAuthContext() {
  return {
    actorId: "owner" as const,
    actorType: "owner" as const,
    mode: "local-owner" as const,
    permissions: {
      memory_access: true,
      tool_access: true,
      system_actions: true,
      delegation: true,
      approval_authority: true,
      administration: true,
    },
  };
}

function deniedWriteTool(): ToolDefinition {
  return {
    name: "memory_write",
    description: "Write a file inside memory root",
    requiresApproval: true,
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
    execute: async () => ({ ok: true }),
  };
}

function rootMemory(): string {
  return "/tmp/paa-loop-memory";
}

class DeniedReplayAdapter implements ModelAdapter {
  constructor(private readonly seenRequests: GatewayEngineRequest[]) {}

  async complete(request: GatewayEngineRequest): Promise<ModelResponse> {
    this.seenRequests.push({
      messages: request.messages.map((message) => ({ ...message })),
      metadata: { ...request.metadata },
    });

    if (this.seenRequests.length === 1) {
      return {
        assistantText: "I will write the requested spec.",
        toolCalls: [
          {
            id: "tool_write_spec",
            name: "memory_write",
            input: {
              path: "documents/fitness/spec.md",
              content: "# Fitness Tracker\n\nA simple MVP spec.\n",
            },
          },
        ],
        finishReason: "tool_calls",
      };
    }

    return {
      assistantText: "Denied request acknowledged.",
      toolCalls: [],
      finishReason: "stop",
    };
  }
}

class ToolCaptureAdapter implements ModelAdapter {
  public seenToolNames: string[] = [];

  async complete(_request: GatewayEngineRequest, tools: ToolDefinition[]): Promise<ModelResponse> {
    this.seenToolNames = tools.map((tool) => tool.name);
    return {
      assistantText: "No tools available.",
      toolCalls: [],
      finishReason: "stop",
    };
  }
}

class RecoverableFailureAdapter implements ModelAdapter {
  private callCount = 0;

  async complete(request: GatewayEngineRequest): Promise<ModelResponse> {
    this.callCount += 1;
    if (this.callCount === 1) {
      return {
        assistantText: "Checking the requested file now.",
        toolCalls: [
          {
            id: "tool_read_missing",
            name: "memory_read",
            input: {
              path: "documents/missing.md",
            },
          },
        ],
        finishReason: "tool_calls",
      };
    }

    const hasToolError = request.messages.some(
      (message) => message.role === "tool" && message.content.includes('"status":"error"')
    );

    return {
      assistantText: hasToolError ? "I could not find that file. I can create it if you want." : "Completed.",
      toolCalls: [],
      finishReason: "stop",
    };
  }
}

class RepeatCallAdapter implements ModelAdapter {
  private callCount = 0;

  async complete(request: GatewayEngineRequest): Promise<ModelResponse> {
    this.callCount += 1;

    const hasLoopGuard = request.messages.some(
      (message) => message.role === "tool" && message.content.includes('"code":"loop_guard"')
    );

    if (hasLoopGuard) {
      return {
        assistantText: "Loop guard received. Stopping repeated calls.",
        toolCalls: [],
        finishReason: "stop",
      };
    }

    return {
      assistantText: "Checking projects.",
      toolCalls: [
        {
          id: `tool_repeat_${this.callCount}`,
          name: "memory_list",
          input: {
            path: "documents",
          },
        },
      ],
      finishReason: "tool_calls",
    };
  }
}

class MutationScopeConflictAdapter implements ModelAdapter {
  private callCount = 0;

  async complete(_request: GatewayEngineRequest): Promise<ModelResponse> {
    this.callCount += 1;

    if (this.callCount === 1) {
      return {
        assistantText: "I will create the file now.",
        toolCalls: [
          {
            id: "tool_write_note",
            name: "memory_write",
            input: {
              path: "documents/memory-eval/note.txt",
              content: "alpha river",
            },
          },
          {
            id: "tool_delete_folder",
            name: "memory_delete",
            input: {
              path: "documents/memory-eval",
            },
          },
        ],
        finishReason: "tool_calls",
      };
    }

    return {
      assistantText: "Completed.",
      toolCalls: [],
      finishReason: "stop",
    };
  }
}

async function createFixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "paa-build-"));
  tempRoots.push(root);

  await mkdir(path.join(root, "adapters"), { recursive: true });
  await mkdir(path.join(root, "runtime-memory"), { recursive: true });

  await writeFile(
    path.join(root, "config.json"),
    JSON.stringify(
      {
        memory_root: "./runtime-memory",
        provider_adapter: "openai-compatible",
        conversation_store: "markdown",
        auth_mode: "local-owner",
        tool_sources: [
          "memory-tools/file-ops/server.ts",
          "builtin/auth-tools",
          "builtin/memory-tools",
          "builtin/project-tools",
        ],
        bind_address: "127.0.0.1",
        port: 8898,
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(root, "adapters", "openai-compatible.json"),
    JSON.stringify(
      {
        base_url: "http://127.0.0.1:11434/v1",
        model: "llama3.1",
        api_key_env: "OPENAI_API_KEY",
      },
      null,
      2
    )
  );

  return root;
}
