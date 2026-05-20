import type { NexusProjectPluginConfig } from "dev-nexus";
import type { TypeScriptProjectSetupInventory } from "./typeScriptProjectSetupInventory.js";
import { typeScriptProjectSetupWorkerFragmentCapabilities } from "./typeScriptWorkerGuidance.js";

export const devNexusTypeScriptPluginId = "dev-nexus-typescript";
export const devNexusTypeScriptPluginName = "DevNexus TypeScript";
export const devNexusTypeScriptPluginVersion = "0.1.0-alpha.0";

export interface DevNexusTypeScriptDevNexusPluginConfigOptions {
  setupInventory?: TypeScriptProjectSetupInventory;
  targetAgents?: string[];
  targetComponents?: string[];
}

export function devNexusTypeScriptDevNexusPluginConfig(
  options: DevNexusTypeScriptDevNexusPluginConfigOptions = {},
): NexusProjectPluginConfig {
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
        reason:
          "Resolve local package binaries such as tsc and test runners from prepared worktrees.",
      },
      {
        kind: "worker_context_fragment",
        id: "context-typescript-toolchain-boundary",
        title: "TypeScript Toolchain Boundary",
        body: [
          "DevNexus TypeScript composes with DevNexus and does not choose or supervise implementation work.",
          "It contributes TypeScript and JavaScript setup policy through DevNexus plugin capabilities.",
          "Use projected dependencies when available, and report missing dependency context as a setup blocker instead of silently fetching packages.",
        ].join(" "),
        targetAgents: ["codex", "claude"],
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
        ].join(" "),
        targetAgents: ["codex", "claude"],
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
