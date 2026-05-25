import type { NexusProjectPluginConfig } from "dev-nexus";
import type { TypeScriptProjectSetupInventory } from "./typeScriptProjectSetupInventory.js";
import { devNexusTypeScriptBulkRewritePlanningCapability } from "./typeScriptBulkRewritePlanning.js";
import { devNexusTypeScriptImportGraphAnalysisCapability } from "./typeScriptImportGraphAnalysis.js";
import { devNexusTypeScriptMcpDiagnosticsTracerCapability } from "./typeScriptMcpDiagnosticsTracer.js";
import { devNexusTypeScriptQualityFeedbackCapability } from "./typeScriptQualityFeedback.js";
import { typeScriptProjectSetupWorkerFragmentCapabilities } from "./typeScriptWorkerGuidance.js";
import { devNexusTypeScriptProjectedSkillCapabilities } from "./typeScriptWorkflowSkills.js";

export const devNexusTypeScriptPluginId = "dev-nexus-typescript";
export const devNexusTypeScriptPluginName = "DevNexus TypeScript";
export const devNexusTypeScriptPluginVersion = "0.1.0-alpha.1";

export interface DevNexusTypeScriptDevNexusPluginConfigOptions {
  setupInventory?: TypeScriptProjectSetupInventory;
  targetAgents?: string[];
  targetComponents?: string[];
}

export function devNexusTypeScriptDevNexusPluginConfig(
  options: DevNexusTypeScriptDevNexusPluginConfigOptions = {},
): NexusProjectPluginConfig {
  const targetComponents = targetComponentsProperty(options.targetComponents);

  return {
    id: devNexusTypeScriptPluginId,
    name: devNexusTypeScriptPluginName,
    version: devNexusTypeScriptPluginVersion,
    enabled: true,
    capabilities: [
      {
        kind: "dependency_projection",
        id: "node-modules",
        description:
          "Project existing package dependencies into TypeScript and JavaScript worktrees.",
        source: "node_modules",
        target: "node_modules",
        required: false,
        sourceControl: "support",
        ...targetComponents,
        reason:
          "Resolve local package binaries such as tsc and test runners from prepared worktrees.",
      },
      ...devNexusTypeScriptProjectedSkillCapabilities(),
      devNexusTypeScriptMcpDiagnosticsTracerCapability(),
      devNexusTypeScriptImportGraphAnalysisCapability(),
      devNexusTypeScriptBulkRewritePlanningCapability(),
      devNexusTypeScriptQualityFeedbackCapability(),
      {
        kind: "worker_context_fragment",
        id: "context-typescript-toolchain-boundary",
        title: "TypeScript Toolchain Boundary",
        body: [
          "DevNexus TypeScript composes with DevNexus and does not choose or supervise implementation work.",
          "It contributes TypeScript and JavaScript setup policy through DevNexus plugin capabilities.",
          "Use projected dependencies when available, and report missing dependency context as a setup blocker instead of silently fetching packages.",
          "For quality work, use read-only TypeScript diagnostics, import graph, quality snapshot, and quality delta tools before changing source.",
          "When handing off quality results through DevNexus coordination, keep TypeScript details in the plugin-owned quality delta payload and use the generic core qualityDelta field.",
        ].join(" "),
        targetAgents: ["codex", "claude"],
        ...targetComponents,
        provenance: "DevNexus TypeScript plugin",
      },
      {
        kind: "worker_briefing_fragment",
        id: "briefing-typescript-worktree-setup",
        title: "TypeScript Worktree Setup",
        body: [
          "Run source and Git commands from the assigned worktree.",
          "Prefer existing package scripts such as test, check, typecheck, lint, or build.",
          "Do not run npm, pnpm, yarn, or bun install commands unless the project policy or user explicitly allows dependency installation.",
          "If package binaries are unavailable, report the setup blocker instead of using npx package fetches as a substitute.",
          "When touching quality findings, compare before/after quality snapshots for touched files and call out new bugs, vulnerabilities, security hotspots, and critical/blocker findings.",
          "Use the TypeScript quality delta coordination payload when a DevNexus handoff should carry compact quality counts and attention findings.",
        ].join(" "),
        targetAgents: ["codex", "claude"],
        ...targetComponents,
        provenance: "DevNexus TypeScript plugin",
      },
      ...(options.setupInventory
        ? typeScriptProjectSetupWorkerFragmentCapabilities({
            inventory: options.setupInventory,
            targetAgents: options.targetAgents,
            targetComponents: options.targetComponents,
          })
        : []),
    ],
  };
}

function targetComponentsProperty(
  targetComponents: string[] | undefined,
): { targetComponents?: string[] } {
  return targetComponents && targetComponents.length > 0
    ? { targetComponents }
    : {};
}
