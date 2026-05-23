import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  NexusPluginProjectedSkillCapability,
  NexusSkillDefinition,
  NexusSkillManifest,
} from "dev-nexus";

export const devNexusTypeScriptWorkflowSkillIds = [
  "typescript-diagnose",
  "typescript-refactor",
  "typescript-project-topology",
  "typescript-test-hygiene",
  "typescript-api-boundaries",
  "typescript-codemod-planning",
] as const;

export type DevNexusTypeScriptWorkflowSkillId =
  (typeof devNexusTypeScriptWorkflowSkillIds)[number];

const projectedSkillDescriptions: Record<
  DevNexusTypeScriptWorkflowSkillId,
  string
> = {
  "typescript-diagnose":
    "Project the TypeScript compiler/runtime diagnosis workflow skill.",
  "typescript-refactor":
    "Project the bounded TypeScript refactoring workflow skill.",
  "typescript-project-topology":
    "Project the TypeScript project directory topology workflow skill.",
  "typescript-test-hygiene": "Project the TypeScript test hygiene workflow skill.",
  "typescript-api-boundaries":
    "Project the TypeScript API boundary review workflow skill.",
  "typescript-codemod-planning":
    "Project the dry-run TypeScript bulk rewrite planning workflow skill.",
};

export function devNexusTypeScriptProjectedSkillCapabilities(): NexusPluginProjectedSkillCapability[] {
  return devNexusTypeScriptWorkflowSkillIds.map((skillId) => ({
    kind: "projected_skill",
    id: `skill-${skillId}`,
    description: projectedSkillDescriptions[skillId],
    skillId,
    targetAgents: ["codex", "claude"],
  }));
}

export function devNexusTypeScriptSkillDefinitions(): NexusSkillDefinition[] {
  return devNexusTypeScriptWorkflowSkillIds.map(readPackagedSkillDefinition);
}

function readPackagedSkillDefinition(
  skillId: DevNexusTypeScriptWorkflowSkillId,
): NexusSkillDefinition {
  const skillRoot = path.join(packagedSkillsRoot(), skillId);
  const manifestPath = path.join(skillRoot, "dev-nexus.skill.json");
  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf8"),
  ) as NexusSkillManifest;

  return {
    manifest,
    files: readSkillFiles(skillRoot),
    sourcePath: skillRoot,
  };
}

function packagedSkillsRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "skills");
}

function readSkillFiles(skillRoot: string): Record<string, string> {
  return Object.fromEntries(readSkillFileEntries(skillRoot, skillRoot));
}

function readSkillFileEntries(
  skillRoot: string,
  currentDirectory: string,
): Array<[string, string]> {
  return fs
    .readdirSync(currentDirectory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        return readSkillFileEntries(skillRoot, entryPath);
      }

      const relativePath = path.relative(skillRoot, entryPath).split(path.sep).join("/");
      return [[relativePath, fs.readFileSync(entryPath, "utf8")] as [string, string]];
    })
    .sort((left, right) => left[0].localeCompare(right[0]));
}
