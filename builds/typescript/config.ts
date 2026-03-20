import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";

import type { AdapterConfig, Preferences, RuntimeConfig } from "./contracts.js";

const runtimeConfigSchema = z.object({
  memory_root: z.string().min(1),
  provider_adapter: z.string().min(1),
  conversation_store: z.literal("markdown").optional(),
  auth_mode: z.literal("local-owner"),
  tool_sources: z.array(z.string()),
  bind_address: z.string().min(1).optional(),
  safety_iteration_limit: z.number().int().positive().optional(),
  port: z.number().int().positive().optional(),
});

const adapterConfigSchema = z.object({
  base_url: z.string().url(),
  model: z.string().min(1),
  api_key_env: z.string().min(1),
});

const preferencesSchema = z.object({
  default_model: z.string().min(1),
  approval_mode: z.literal("ask-on-write"),
});

const defaultPreferences: Preferences = {
  default_model: "llama3.1",
  approval_mode: "ask-on-write",
};

export async function loadRuntimeConfig(rootDir: string): Promise<RuntimeConfig> {
  const runtimePath = path.join(rootDir, "config.json");
  const raw = await readFile(runtimePath, "utf8");
  const parsed = runtimeConfigSchema.parse(JSON.parse(raw));

  return {
    ...parsed,
    conversation_store: parsed.conversation_store ?? "markdown",
    memory_root: path.resolve(rootDir, parsed.memory_root),
    bind_address: parsed.bind_address ?? "127.0.0.1",
    port: parsed.port ?? 8787,
  };
}

export async function loadAdapterConfig(rootDir: string, adapterName: string): Promise<AdapterConfig> {
  const adapterPath = path.join(rootDir, "adapters", `${adapterName}.json`);
  let raw: string;

  try {
    raw = await readFile(adapterPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Unsupported provider adapter: ${adapterName}`);
    }

    throw error;
  }

  return adapterConfigSchema.parse(JSON.parse(raw));
}

export async function ensureMemoryLayout(memoryRoot: string): Promise<void> {
  await mkdir(memoryRoot, { recursive: true });
  await mkdir(path.join(memoryRoot, "conversations"), { recursive: true });
  await mkdir(path.join(memoryRoot, "documents"), { recursive: true });
  await mkdir(path.join(memoryRoot, "preferences"), { recursive: true });
  await mkdir(path.join(memoryRoot, "exports"), { recursive: true });

  const agentPath = path.join(memoryRoot, "AGENT.md");
  try {
    await readFile(agentPath, "utf8");
  } catch {
    await writeFile(agentPath, defaultAgentPrompt(), "utf8");
  }

  const preferencesPath = path.join(memoryRoot, "preferences", "default.json");
  try {
    await readFile(preferencesPath, "utf8");
  } catch {
    await writeFile(preferencesPath, `${JSON.stringify(defaultPreferences, null, 2)}\n`, "utf8");
  }
}

export async function loadPreferences(memoryRoot: string): Promise<Preferences> {
  const preferencesPath = path.join(memoryRoot, "preferences", "default.json");
  const raw = await readFile(preferencesPath, "utf8");
  return preferencesSchema.parse(JSON.parse(raw));
}

export async function readBootstrapPrompt(memoryRoot: string): Promise<string> {
  const agentPath = path.join(memoryRoot, "AGENT.md");
  return readFile(agentPath, "utf8");
}

function defaultAgentPrompt(): string {
  return [
    "You are PAA MVP, a terminal-first planning agent.",
    "The owner interacts through chat only.",
    "Use the available tools to create folders and owned documents inside the memory root.",
    "For explicit user commands to read/list/write/edit/delete files, execute the matching tool directly rather than asking for an extra confirmation message.",
    "For mutating actions, perform only the explicitly requested changes and avoid extra cleanup or deletion steps unless the user requested them.",
    "When writes are needed, request approval through the contract-visible approval flow before any mutating tool executes.",
    "When asked to create a project folder, produce AGENT.md, spec.md, and plan.md inside that folder unless the user asks for a smaller subset.",
    "For project discovery requests, prefer project_list and report projects from documents scope only.",
    "If the user asks to remember something for this chat, keep it in conversational context for this session without requiring file storage.",
    "Only ask for a safe explicit destination when the user asks to persist information into memory files.",
    "Do not claim prior-session facts unless you retrieved supporting evidence in the current interaction.",
    "Do not store secrets in normal memory files unless the user gives a safe, explicit destination and asks for it.",
    "Prefer concise, auditable outputs that match the owner's request.",
  ].join("\n");
}
