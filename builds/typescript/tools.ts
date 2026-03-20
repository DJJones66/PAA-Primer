import type { AuthContext, ToolContext, ToolDefinition } from "./contracts.js";
import { readAuthState } from "./memory/auth-state.js";
import { exportMemory } from "./memory/export.js";
import { getMemoryHistory } from "./memory/history.js";
import { resolveMemoryPath } from "./memory/paths.js";
import { fileOpsTools } from "./memory-tools/file-ops/server.js";
import { projectTools } from "./tools/project-tools.js";

export async function discoverTools(memoryRoot: string, toolSources: string[]): Promise<ToolDefinition[]> {
  const tools: ToolDefinition[] = [];
  const registeredSources: Record<string, () => ToolDefinition[]> = {
    "memory-tools/file-ops/server.ts": () => fileOpsTools(),
    "builtin/auth-tools": () => [authWhoamiTool(), authCheckTool(), authExportTool(memoryRoot)],
    "builtin/memory-tools": () => [memoryHistoryTool(memoryRoot), memoryExportTool(memoryRoot)],
    "builtin/project-tools": () => projectTools(),
  };

  for (const source of toolSources) {
    const factory = registeredSources[source];
    if (!factory) {
      throw new Error(`Unsupported tool source: ${source}`);
    }

    tools.push(...factory());
  }

  return tools;
}

function authWhoamiTool(): ToolDefinition {
  return {
    name: "auth_whoami",
    description: "Return the current authenticated actor",
    requiresApproval: false,
    readOnly: true,
    inputSchema: { type: "object", properties: {} },
    execute: async (context: ToolContext) => ({
      actor_id: context.auth.actorId,
      actor_type: context.auth.actorType,
      mode: context.auth.mode,
    }),
  };
}

function authCheckTool(): ToolDefinition {
  return {
    name: "auth_check",
    description: "Return permission data for the current actor",
    requiresApproval: false,
    readOnly: true,
    inputSchema: { type: "object", properties: {} },
    execute: async (context: ToolContext) => ({
      allowed: true,
      permissions: context.auth.permissions,
    }),
  };
}

function authExportTool(memoryRoot: string): ToolDefinition {
  return {
    name: "auth_export",
    description: "Return exportable non-secret auth state",
    requiresApproval: false,
    readOnly: true,
    inputSchema: { type: "object", properties: {} },
    execute: async () => readAuthState(memoryRoot),
  };
}

function memoryHistoryTool(memoryRoot: string): ToolDefinition {
  return {
    name: "memory_history",
    description: "Return git-backed history and prior states for a file",
    requiresApproval: false,
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        commit: { type: "string" },
      },
      required: ["path"],
    },
    execute: async (_, input) => {
      const targetPath = resolveMemoryPath(memoryRoot, String(input.path ?? ""));
      const commit = typeof input.commit === "string" ? input.commit : undefined;
      return getMemoryHistory(memoryRoot, targetPath, commit);
    },
  };
}

function memoryExportTool(memoryRoot: string): ToolDefinition {
  return {
    name: "memory_export",
    description: "Export owner data as an archive",
    requiresApproval: false,
    readOnly: true,
    inputSchema: { type: "object", properties: {} },
    execute: async () => exportMemory(memoryRoot),
  };
}

export function buildToolContext(memoryRoot: string, auth: AuthContext, correlationId: string): ToolContext {
  return {
    memoryRoot,
    auth,
    correlationId,
  };
}
