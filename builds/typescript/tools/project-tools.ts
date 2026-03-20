import path from "node:path";
import { readdir } from "node:fs/promises";

import type { ToolContext, ToolDefinition } from "../contracts.js";
import { resolveMemoryPath } from "../memory/paths.js";

type ProjectStatus = "complete" | "partial" | "empty";

type ProjectEntry = {
  name: string;
  path: string;
  status: ProjectStatus;
  files_present: string[];
};

const expectedProjectFiles = ["AGENT.md", "spec.md", "plan.md"];

export function projectTools(): ToolDefinition[] {
  return [
    {
      name: "project_list",
      description: "List projects under documents with project completeness status",
      requiresApproval: false,
      readOnly: true,
      inputSchema: {
        type: "object",
        properties: {},
      },
      execute: async (context: ToolContext) => listProjects(context),
    },
  ];
}

async function listProjects(context: ToolContext): Promise<{ root: string; projects: ProjectEntry[] }> {
  const documentsRoot = resolveMemoryPath(context.memoryRoot, "documents");
  const entries = await readdir(documentsRoot, { withFileTypes: true }).catch(() => []);
  const projects: ProjectEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const projectPath = path.join(documentsRoot, entry.name);
    const files = await readdir(projectPath, { withFileTypes: true }).catch(() => []);
    const filesPresent = files
      .filter((file) => file.isFile() && expectedProjectFiles.includes(file.name))
      .map((file) => file.name)
      .sort();

    const status = computeProjectStatus(filesPresent.length);
    projects.push({
      name: entry.name,
      path: projectPath,
      status,
      files_present: filesPresent,
    });
  }

  projects.sort((left, right) => left.name.localeCompare(right.name));
  return {
    root: documentsRoot,
    projects,
  };
}

function computeProjectStatus(fileCount: number): ProjectStatus {
  if (fileCount >= expectedProjectFiles.length) {
    return "complete";
  }

  if (fileCount > 0) {
    return "partial";
  }

  return "empty";
}
