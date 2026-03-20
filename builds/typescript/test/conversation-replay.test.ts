import path from "node:path";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { GatewayConversationService } from "../gateway/conversations.js";
import { ConversationStore } from "../memory/conversation-store.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("conversation replay format", () => {
  it("synthesizes assistant tool_calls when a tool message has no stored assistant tool-call message", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "paa-replay-"));
    tempRoots.push(root);
    await mkdir(path.join(root, "conversations"), { recursive: true });

    const store = new ConversationStore(root);
    const service = new GatewayConversationService(store);

    const conversationId = "conv_replay_1";
    store.createConversation(conversationId, {
      id: "msg_user_1",
      role: "user",
      content: "What projects do I have?",
      timestamp: new Date().toISOString(),
    });

    service.appendToolMessage(
      conversationId,
      "call_abc123",
      JSON.stringify({
        status: "ok",
        output: {
          entries: [],
        },
      }),
      {
        name: "memory_list",
        input: { path: "documents" },
      }
    );

    service.appendAssistantMessage(conversationId, "msg_assistant_1", "You do not have any projects yet.");

    const replayMessages = service.buildConversationMessages(conversationId, "system prompt");

    expect(replayMessages.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);

    expect(replayMessages[2]?.tool_calls?.[0]).toEqual({
      id: "call_abc123",
      name: "memory_list",
      input: { path: "documents" },
    });

    expect(replayMessages[3]).toEqual({
      role: "tool",
      content: JSON.stringify({
        status: "ok",
        output: {
          entries: [],
        },
      }),
      tool_call_id: "call_abc123",
    });
  });
});
