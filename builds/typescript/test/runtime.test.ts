import path from "node:path";
import { access, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { fileOpsTools } from "../memory-tools/file-ops/server.js";
import { ensureGitReady } from "../git.js";
import { exportMemory } from "../memory/export.js";
import { resolveMemoryPath } from "../memory/paths.js";
import { discoverTools } from "../tools.js";
import { buildServer } from "../gateway/server.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("startup readiness", () => {
  it("loads startup phases in deterministic order and creates auth state", async () => {
    const root = await createFixtureRoot();
    const originalWrite = process.stdout.write.bind(process.stdout);
    const lines: string[] = [];

    process.stdout.write = ((chunk: string | Uint8Array) => {
      lines.push(String(chunk).trim());
      return true;
    }) as typeof process.stdout.write;

    try {
      const { app } = await buildServer(root);
      await app.close();
    } finally {
      process.stdout.write = originalWrite;
    }

    const startupEvents = lines
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { event: string; details: { phase?: string } })
      .filter((entry) => entry.event === "startup.phase")
      .map((entry) => entry.details.phase);

    expect(startupEvents).toEqual([
      "runtime-config",
      "adapter-config",
      "tools",
      "memory",
      "preferences",
      "ready",
    ]);

    const authState = JSON.parse(
      await readFile(path.join(root, "runtime-memory", "preferences", "auth-state.json"), "utf8")
    ) as { actor_id: string; mode: string };
    expect(authState.actor_id).toBe("owner");
    expect(authState.mode).toBe("local-owner");
  });

  it("seeds bootstrap prompt with mutation-scope and in-session recall policies", async () => {
    const root = await createFixtureRoot();
    const memoryRoot = path.join(root, "runtime-memory");

    await buildServer(root).then(async ({ app }) => app.close());

    const agentPrompt = await readFile(path.join(memoryRoot, "AGENT.md"), "utf8");
    expect(agentPrompt).toContain("perform only the explicitly requested changes");
    expect(agentPrompt).toContain("remember something for this chat");
    expect(agentPrompt).toContain("Only ask for a safe explicit destination");
  });

  it("fails clearly when an unsupported adapter is configured", async () => {
    const root = await createFixtureRoot({ provider_adapter: "unsupported-adapter" });

    await expect(buildServer(root)).rejects.toThrow("Unsupported provider adapter: unsupported-adapter");
  });

  it("rejects sibling-prefix escapes for file tools and memory history", async () => {
    const root = await createFixtureRoot();
    const memoryRoot = path.join(root, "runtime-memory");
    const escapedSibling = path.join(root, "runtime-memory-escape.txt");

    expect(() => resolveMemoryPath(memoryRoot, "../runtime-memory-escape.txt")).toThrow("Path escapes memory root");

    const memoryWrite = fileOpsTools().find((tool) => tool.name === "memory_write");
    if (!memoryWrite) {
      throw new Error("memory_write tool missing");
    }

    await expect(
      memoryWrite.execute(
        {
          memoryRoot,
          correlationId: "test-correlation",
          auth: {
            actorId: "owner",
            actorType: "owner",
            mode: "local-owner",
            permissions: {
              memory_access: true,
              tool_access: true,
              system_actions: true,
              delegation: true,
              approval_authority: true,
              administration: true,
            },
          },
        },
        {
          path: "../runtime-memory-escape.txt",
          content: "should fail",
        }
      )
    ).rejects.toThrow("Path escapes memory root");

    const tools = await discoverTools(memoryRoot, [
      "memory-tools/file-ops/server.ts",
      "builtin/auth-tools",
      "builtin/memory-tools",
    ]);
    const memoryHistory = tools.find((tool) => tool.name === "memory_history");
    if (!memoryHistory) {
      throw new Error("memory_history tool missing");
    }

    await expect(memoryHistory.execute({} as never, { path: "../runtime-memory-escape.txt" })).rejects.toThrow(
      "Path escapes memory root"
    );

    await expect(readFile(escapedSibling, "utf8")).rejects.toThrow();
  });

  it("rejects reads and writes into reserved git internals", async () => {
    const root = await createFixtureRoot();
    const memoryRoot = path.join(root, "runtime-memory");

    await ensureGitReady(memoryRoot);
    await access(path.join(memoryRoot, ".git"));

    expect(() => resolveMemoryPath(memoryRoot, ".git/config")).toThrow("Path targets reserved memory internals");

    const toolContext = {
      memoryRoot,
      correlationId: "git-guard-test",
      auth: {
        actorId: "owner",
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
      },
    };

    const memoryWrite = fileOpsTools().find((tool) => tool.name === "memory_write");
    const memoryRead = fileOpsTools().find((tool) => tool.name === "memory_read");

    if (!memoryWrite || !memoryRead) {
      throw new Error("required file tools missing");
    }

    await expect(
      memoryWrite.execute(toolContext, {
        path: ".git/probe.txt",
        content: "blocked",
      })
    ).rejects.toThrow("Path targets reserved memory internals");

    await expect(
      memoryRead.execute(toolContext, {
        path: ".git/config",
      })
    ).rejects.toThrow("Path targets reserved memory internals");

    const memoryList = fileOpsTools().find((tool) => tool.name === "memory_list");
    const memorySearch = fileOpsTools().find((tool) => tool.name === "memory_search");

    if (!memoryList || !memorySearch) {
      throw new Error("required traversal tools missing");
    }

    const listResult = (await memoryList.execute(toolContext, { path: "." })) as { entries: string[] };
    expect(listResult.entries).not.toContain(".git/");

    const searchResult = (await memorySearch.execute(toolContext, { path: ".", query: "[core]" })) as {
      matches: Array<{ path: string }>;
    };
    expect(searchResult.matches).toEqual([]);
  });

  it("accepts absolute paths inside memory root and rejects absolute external paths", async () => {
    const root = await createFixtureRoot();
    const memoryRoot = path.join(root, "runtime-memory");

    const inRootAbsolute = path.join(memoryRoot, "documents", "alpha.md");
    const escapedAbsolute = path.join(root, "outside.txt");

    expect(resolveMemoryPath(memoryRoot, inRootAbsolute)).toBe(inRootAbsolute);
    expect(() => resolveMemoryPath(memoryRoot, escapedAbsolute)).toThrow("Path escapes memory root");
  });

  it("excludes conversations from memory_search by default and supports explicit opt-in", async () => {
    const root = await createFixtureRoot();
    const memoryRoot = path.join(root, "runtime-memory");
    await mkdir(path.join(memoryRoot, "conversations"), { recursive: true });
    await writeFile(
      path.join(memoryRoot, "conversations", "probe.md"),
      "token sk-test-abc123-secret\n",
      "utf8"
    );

    const memorySearch = fileOpsTools().find((tool) => tool.name === "memory_search");
    if (!memorySearch) {
      throw new Error("memory_search tool missing");
    }

    const toolContext = {
      memoryRoot,
      correlationId: "search-scope-test",
      auth: {
        actorId: "owner",
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
      },
    };

    const defaultSearch = (await memorySearch.execute(toolContext, { query: "sk-test-abc123-secret" })) as {
      matches: Array<{ content: string }>;
    };
    expect(defaultSearch.matches).toEqual([]);

    const includeConversationsSearch = (await memorySearch.execute(toolContext, {
      query: "sk-test-abc123-secret",
      include_conversations: true,
    })) as { matches: Array<{ content: string }> };

    expect(includeConversationsSearch.matches.length).toBeGreaterThan(0);
    expect(includeConversationsSearch.matches[0]?.content).toContain("sk-***redacted***");
  });

  it("exports from a snapshot so archive creation does not race with live memory writes", async () => {
    const root = await createFixtureRoot();
    const memoryRoot = path.join(root, "runtime-memory");

    await mkdir(path.join(memoryRoot, "documents", "export-check"), { recursive: true });
    await mkdir(path.join(memoryRoot, "exports"), { recursive: true });
    await writeFile(path.join(memoryRoot, "documents", "export-check", "note.txt"), "alpha river\n", "utf8");
    await ensureGitReady(memoryRoot);

    const firstExport = await exportMemory(memoryRoot);
    const firstStat = await stat(firstExport.archive_path);
    expect(firstStat.size).toBeGreaterThan(0);

    const secondExport = await exportMemory(memoryRoot);
    const secondStat = await stat(secondExport.archive_path);
    expect(secondStat.size).toBeGreaterThan(0);
    expect(secondExport.archive_path).not.toBe(firstExport.archive_path);
  });
});

async function createFixtureRoot(overrides: Record<string, unknown> = {}): Promise<string> {
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
        port: 8899,
        ...overrides,
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
