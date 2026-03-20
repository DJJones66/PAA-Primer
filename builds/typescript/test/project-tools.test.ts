import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { projectTools } from "../tools/project-tools.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("project tools", () => {
  it("lists document projects with deterministic status and sorting", async () => {
    const memoryRoot = await createMemoryRoot();
    const documentsRoot = path.join(memoryRoot, "documents");

    await mkdir(path.join(documentsRoot, "zeta"), { recursive: true });
    await mkdir(path.join(documentsRoot, "alpha"), { recursive: true });
    await mkdir(path.join(documentsRoot, "beta"), { recursive: true });

    await writeFile(path.join(documentsRoot, "alpha", "AGENT.md"), "# alpha\n", "utf8");
    await writeFile(path.join(documentsRoot, "alpha", "spec.md"), "# spec\n", "utf8");
    await writeFile(path.join(documentsRoot, "alpha", "plan.md"), "# plan\n", "utf8");

    await writeFile(path.join(documentsRoot, "beta", "AGENT.md"), "# beta\n", "utf8");

    const projectList = projectTools().find((tool) => tool.name === "project_list");
    if (!projectList) {
      throw new Error("project_list tool missing");
    }

    const output = (await projectList.execute(
      {
        memoryRoot,
        correlationId: "project-tools-test",
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
      {}
    )) as {
      root: string;
      projects: Array<{
        name: string;
        path: string;
        status: "complete" | "partial" | "empty";
        files_present: string[];
      }>;
    };

    expect(output.root).toBe(documentsRoot);
    expect(output.projects.map((project) => project.name)).toEqual(["alpha", "beta", "zeta"]);
    expect(output.projects).toEqual([
      {
        name: "alpha",
        path: path.join(documentsRoot, "alpha"),
        status: "complete",
        files_present: ["AGENT.md", "plan.md", "spec.md"],
      },
      {
        name: "beta",
        path: path.join(documentsRoot, "beta"),
        status: "partial",
        files_present: ["AGENT.md"],
      },
      {
        name: "zeta",
        path: path.join(documentsRoot, "zeta"),
        status: "empty",
        files_present: [],
      },
    ]);
  });

  it("returns an empty list when documents directory is missing", async () => {
    const memoryRoot = await createMemoryRoot({ withDocuments: false });
    const projectList = projectTools().find((tool) => tool.name === "project_list");
    if (!projectList) {
      throw new Error("project_list tool missing");
    }

    const output = (await projectList.execute(
      {
        memoryRoot,
        correlationId: "project-tools-missing-documents",
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
      {}
    )) as { root: string; projects: unknown[] };

    expect(output.root).toBe(path.join(memoryRoot, "documents"));
    expect(output.projects).toEqual([]);
  });
});

async function createMemoryRoot(options: { withDocuments?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "paa-project-tools-"));
  tempRoots.push(root);

  const withDocuments = options.withDocuments ?? true;
  if (withDocuments) {
    await mkdir(path.join(root, "documents"), { recursive: true });
  }

  return root;
}
