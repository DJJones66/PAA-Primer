import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { MarkdownConversationStore } from "../memory/conversation-store-markdown.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("markdown conversation store", () => {
  it("creates markdown conversation files and index entries", async () => {
    const root = await createFixtureRoot();
    const store = new MarkdownConversationStore(root);

    store.createConversation("conv-1", {
      id: "msg-1",
      role: "user",
      content: "What projects do I have?",
      timestamp: "2026-03-19T10:00:00.000Z",
    });

    const detail = store.getConversation("conv-1");
    expect(detail).not.toBeNull();
    expect(detail?.messages).toHaveLength(1);
    expect(detail?.messages[0]?.content).toBe("What projects do I have?");

    const markdown = await readFile(path.join(root, "conversations", "conv-1.md"), "utf8");
    expect(markdown).toContain("## message msg-1");
    expect(markdown).toContain("\"role\":\"user\"");

    const index = JSON.parse(await readFile(path.join(root, "conversations", "index.json"), "utf8")) as {
      conversations: Array<{ id: string; message_count: number }>;
    };
    expect(index.conversations).toHaveLength(1);
    expect(index.conversations[0]).toEqual(expect.objectContaining({
      id: "conv-1",
      message_count: 1,
    }));
  });

  it("appends messages and keeps list ordering by updated time", async () => {
    const root = await createFixtureRoot();
    const store = new MarkdownConversationStore(root);

    store.createConversation("conv-old", {
      id: "msg-old-user",
      role: "user",
      content: "Old conversation",
      timestamp: "2026-03-19T10:00:00.000Z",
    });

    store.createConversation("conv-new", {
      id: "msg-new-user",
      role: "user",
      content: "New conversation",
      timestamp: "2026-03-19T10:01:00.000Z",
    });

    store.appendMessage("conv-old", {
      id: "msg-old-assistant",
      role: "assistant",
      content: "Bumped",
      timestamp: "2026-03-19T10:02:00.000Z",
    });

    const list = store.listConversations(50, 0);
    expect(list.total).toBe(2);
    expect(list.conversations.map((conversation) => conversation.id)).toEqual(["conv-old", "conv-new"]);
    expect(list.conversations[0]?.message_count).toBe(2);
  });

  it("preserves tool message content exactly for replay", async () => {
    const root = await createFixtureRoot();
    const store = new MarkdownConversationStore(root);

    store.createConversation("conv-tool", {
      id: "msg-user",
      role: "user",
      content: "Run auth export",
      timestamp: "2026-03-19T10:00:00.000Z",
    });

    const toolPayload = JSON.stringify({
      status: "ok",
      output: { actor_id: "owner" },
      call: {
        name: "auth_export",
        input: {},
      },
    });

    store.appendMessage("conv-tool", {
      id: "tool-call-1",
      role: "tool",
      content: toolPayload,
      timestamp: "2026-03-19T10:00:05.000Z",
    });

    const detail = store.getConversation("conv-tool");
    const toolMessage = detail?.messages.find((message) => message.role === "tool");
    expect(toolMessage?.content).toBe(toolPayload);
  });

  it("rebuilds the index from markdown files when index.json is missing or invalid", async () => {
    const root = await createFixtureRoot();
    const store = new MarkdownConversationStore(root);

    store.createConversation("conv-index", {
      id: "msg-index",
      role: "user",
      content: "Index resilience",
      timestamp: "2026-03-19T10:03:00.000Z",
    });

    await writeFile(path.join(root, "conversations", "index.json"), "not valid json", "utf8");

    const rebuiltList = store.listConversations(50, 0);
    expect(rebuiltList.total).toBe(1);
    expect(rebuiltList.conversations[0]?.id).toBe("conv-index");
  });
});

async function createFixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "paa-markdown-store-"));
  tempRoots.push(root);
  await mkdir(path.join(root, "conversations"), { recursive: true });
  return root;
}
