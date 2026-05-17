import { describe, expect, it } from "vitest";
import {
  projectPluginCapabilityProjections,
  projectPluginDependencyProjections,
} from "dev-nexus";
import {
  devNexusTypeScriptDevNexusPluginConfig,
  devNexusTypeScriptPluginId,
  devNexusTypeScriptPluginName,
  devNexusTypeScriptPluginVersion,
} from "./devNexusTypeScriptPlugin.js";

type DevNexusTypeScriptCapability =
  ReturnType<typeof devNexusTypeScriptDevNexusPluginConfig>["capabilities"][number];

function capabilitiesOfKind<K extends DevNexusTypeScriptCapability["kind"]>(
  kind: K,
): Array<Extract<DevNexusTypeScriptCapability, { kind: K }>> {
  return devNexusTypeScriptDevNexusPluginConfig().capabilities.filter(
    (capability): capability is Extract<DevNexusTypeScriptCapability, { kind: K }> =>
      capability.kind === kind,
  );
}

describe("DevNexus TypeScript plugin", () => {
  it("declares a stable TypeScript and JavaScript capability surface", () => {
    const config = devNexusTypeScriptDevNexusPluginConfig();

    expect(config).toMatchObject({
      id: devNexusTypeScriptPluginId,
      name: devNexusTypeScriptPluginName,
      version: devNexusTypeScriptPluginVersion,
      enabled: true,
    });
    expect(config.capabilities.map((capability) => capability.id)).toEqual([
      "node-modules",
      "context-typescript-toolchain-boundary",
      "briefing-typescript-worktree-setup",
    ]);
    expect(new Set(config.capabilities.map((capability) => capability.kind))).toEqual(
      new Set([
        "dependency_projection",
        "worker_context_fragment",
        "worker_briefing_fragment",
      ]),
    );
  });

  it("projects node_modules as optional support-only worktree setup", () => {
    expect(capabilitiesOfKind("dependency_projection")).toEqual([
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
    ]);

    expect(
      projectPluginDependencyProjections({
        plugins: [devNexusTypeScriptDevNexusPluginConfig()],
      }),
    ).toEqual([
      {
        kind: "dependency_projection",
        id: "node-modules",
        description:
          "Project existing package dependencies into TypeScript and JavaScript worktrees.",
        source: "node_modules",
        target: "node_modules",
        required: false,
        sourceControl: "support",
        targetAgents: [],
        targetComponents: [],
        reason:
          "Resolve local package binaries such as tsc and test runners from prepared worktrees.",
        pluginSource: {
          pluginId: "dev-nexus-typescript",
          pluginName: "DevNexus TypeScript",
          version: "0.1.0-alpha.0",
          capabilityId: "node-modules",
        },
      },
    ]);
  });

  it("provides worker guidance without package-manager mutation", () => {
    const contextFragment = capabilitiesOfKind("worker_context_fragment")[0];
    const briefingFragment = capabilitiesOfKind("worker_briefing_fragment")[0];

    expect(contextFragment).toMatchObject({
      id: "context-typescript-toolchain-boundary",
      targetAgents: ["codex", "claude"],
    });
    expect(contextFragment.body).toContain("does not choose or supervise");
    expect(contextFragment.body).toContain("report missing dependency context");
    expect(contextFragment.body).toContain("instead of silently fetching packages");

    expect(briefingFragment).toMatchObject({
      id: "briefing-typescript-worktree-setup",
      targetAgents: ["codex", "claude"],
    });
    expect(briefingFragment.body).toContain("Prefer existing package scripts");
    expect(briefingFragment.body).toContain("Do not run npm, pnpm, yarn, or bun install");
    expect(briefingFragment.body).toContain("instead of using npx package fetches");
  });

  it("exposes plugin capabilities through DevNexus projection helpers", () => {
    const projected = projectPluginCapabilityProjections({
      plugins: [devNexusTypeScriptDevNexusPluginConfig()],
    });

    expect(projected).toMatchObject([
      {
        pluginId: "dev-nexus-typescript",
        pluginName: "DevNexus TypeScript",
        version: "0.1.0-alpha.0",
        capabilityCount: 3,
      },
    ]);
    expect(projected[0]!.capabilities.map((capability) => capability.kind)).toEqual([
      "dependency_projection",
      "worker_context_fragment",
      "worker_briefing_fragment",
    ]);
  });
});
