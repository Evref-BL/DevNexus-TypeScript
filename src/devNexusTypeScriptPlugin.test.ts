import { describe, expect, it } from "vitest";
import {
  projectPluginCapabilityProjections,
  projectPluginDependencyProjections,
  projectPluginWorkerFragments,
} from "dev-nexus";
import {
  devNexusTypeScriptDevNexusPluginConfig,
  devNexusTypeScriptPluginId,
  devNexusTypeScriptPluginName,
  devNexusTypeScriptPluginVersion,
} from "./devNexusTypeScriptPlugin.js";
import {
  devNexusTypeScriptMcpArgs,
  devNexusTypeScriptMcpCommand,
} from "./typeScriptMcpServerConfig.js";
import type { TypeScriptProjectSetupInventory } from "./typeScriptProjectSetupInventory.js";

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

function minimalSetupInventory(): TypeScriptProjectSetupInventory {
  return {
    projectRoot: "/project",
    packageManager: {
      detected: "npm",
      lockfiles: ["package-lock.json"],
      packageJsonExists: true,
    },
    scripts: {
      available: ["check"],
      expected: {
        build: false,
        check: true,
        lint: false,
        test: false,
        typecheck: false,
      },
    },
    dependencies: {
      nodeModules: {
        path: "/project/node_modules",
        exists: true,
        projected: true,
      },
      binaries: [
        { name: "eslint", available: false },
        { name: "tsc", available: true },
        { name: "vitest", available: false },
      ],
      packages: {
        typescript: {
          declaredRange: "^5.9.0",
          installedVersion: "5.9.1",
        },
      },
    },
    typescript: {
      declaredRange: "^5.9.0",
      installedVersion: "5.9.1",
      tsconfigPaths: ["tsconfig.json"],
      projectReferences: {
        used: false,
        count: 0,
      },
    },
    tools: {
      testFramework: {
        detected: null,
      },
      typedLinting: {
        detected: false,
        configFiles: [],
      },
      structuralSearch: {
        detected: false,
        tools: [],
        configFiles: [],
      },
      unusedCode: {
        detected: false,
        tools: [],
        configFiles: [],
      },
    },
    blockers: [],
    recommendations: [],
  };
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
      "skill-typescript-diagnose",
      "skill-typescript-refactor",
      "skill-typescript-project-topology",
      "skill-typescript-test-hygiene",
      "skill-typescript-api-boundaries",
      "skill-typescript-codemod-planning",
      "mcp-typescript-diagnostics-tracer",
      "mcp-typescript-import-graph-analysis",
      "mcp-typescript-bulk-rewrite-planning",
      "context-typescript-toolchain-boundary",
      "briefing-typescript-worktree-setup",
    ]);
    expect(new Set(config.capabilities.map((capability) => capability.kind))).toEqual(
      new Set([
        "dependency_projection",
        "projected_skill",
        "mcp_server",
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
          version: devNexusTypeScriptPluginVersion,
          capabilityId: "node-modules",
        },
      },
    ]);
  });

  it("projects baseline TypeScript workflow skills", () => {
    expect(capabilitiesOfKind("projected_skill")).toEqual([
      {
        kind: "projected_skill",
        id: "skill-typescript-diagnose",
        description:
          "Project the TypeScript compiler/runtime diagnosis workflow skill.",
        skillId: "typescript-diagnose",
        targetAgents: ["codex", "claude"],
      },
      {
        kind: "projected_skill",
        id: "skill-typescript-refactor",
        description: "Project the bounded TypeScript refactoring workflow skill.",
        skillId: "typescript-refactor",
        targetAgents: ["codex", "claude"],
      },
      {
        kind: "projected_skill",
        id: "skill-typescript-project-topology",
        description: "Project the TypeScript project directory topology workflow skill.",
        skillId: "typescript-project-topology",
        targetAgents: ["codex", "claude"],
      },
      {
        kind: "projected_skill",
        id: "skill-typescript-test-hygiene",
        description: "Project the TypeScript test hygiene workflow skill.",
        skillId: "typescript-test-hygiene",
        targetAgents: ["codex", "claude"],
      },
      {
        kind: "projected_skill",
        id: "skill-typescript-api-boundaries",
        description: "Project the TypeScript API boundary review workflow skill.",
        skillId: "typescript-api-boundaries",
        targetAgents: ["codex", "claude"],
      },
      {
        kind: "projected_skill",
        id: "skill-typescript-codemod-planning",
        description:
          "Project the dry-run TypeScript bulk rewrite planning workflow skill.",
        skillId: "typescript-codemod-planning",
        targetAgents: ["codex", "claude"],
      },
    ]);

    const projected = projectPluginCapabilityProjections({
      plugins: [devNexusTypeScriptDevNexusPluginConfig()],
    });

    expect(
      projected[0]!.capabilities
        .filter((capability) => capability.kind === "projected_skill")
        .map((capability) => capability.skillId),
    ).toEqual([
      "typescript-diagnose",
      "typescript-refactor",
      "typescript-project-topology",
      "typescript-test-hygiene",
      "typescript-api-boundaries",
      "typescript-codemod-planning",
    ]);
  });

  it("advertises read-only TypeScript MCP analysis operations", () => {
    expect(capabilitiesOfKind("mcp_server")).toEqual([
      {
        kind: "mcp_server",
        id: "mcp-typescript-diagnostics-tracer",
        description:
          "Advertise read-only TypeScript project status and diagnostics tracer operations.",
        serverName: "dev-nexus-typescript",
        command: devNexusTypeScriptMcpCommand,
        args: [...devNexusTypeScriptMcpArgs],
        tools: [
          {
            name: "typescript.projectStatus",
            description:
              "Read TypeScript project setup status, scripts, compiler availability, and setup blockers.",
          },
          {
            name: "typescript.diagnostics",
            description:
              "Read TypeScript compiler diagnostics grouped by file and diagnostic code.",
          },
        ],
      },
      {
        kind: "mcp_server",
        id: "mcp-typescript-import-graph-analysis",
        description:
          "Advertise read-only TypeScript import graph analysis operations.",
        serverName: "dev-nexus-typescript",
        command: devNexusTypeScriptMcpCommand,
        args: [...devNexusTypeScriptMcpArgs],
        tools: [
          {
            name: "typescript.importGraph",
            description:
              "Read TypeScript module import edges, hubs, cycles, and ignored source facts.",
          },
        ],
      },
      {
        kind: "mcp_server",
        id: "mcp-typescript-bulk-rewrite-planning",
        description:
          "Advertise read-only TypeScript bulk rewrite planning operations.",
        serverName: "dev-nexus-typescript",
        command: devNexusTypeScriptMcpCommand,
        args: [...devNexusTypeScriptMcpArgs],
        tools: [
          {
            name: "typescript.bulkRewritePlan",
            description:
              "Preview TypeScript bulk rewrite plans without writing source files.",
          },
        ],
      },
    ]);

    const projected = projectPluginCapabilityProjections({
      plugins: [devNexusTypeScriptDevNexusPluginConfig()],
    });

    expect(
      projected[0]!.capabilities.find(
        (capability) => capability.id === "mcp-typescript-diagnostics-tracer",
      ),
    ).toMatchObject({
      kind: "mcp_server",
      serverName: "dev-nexus-typescript",
      tools: [
        {
          name: "typescript.projectStatus",
          description:
            "Read TypeScript project setup status, scripts, compiler availability, and setup blockers.",
        },
        {
          name: "typescript.diagnostics",
          description:
            "Read TypeScript compiler diagnostics grouped by file and diagnostic code.",
        },
      ],
    });
    expect(
      projected[0]!.capabilities.find(
        (capability) => capability.id === "mcp-typescript-import-graph-analysis",
      ),
    ).toMatchObject({
      kind: "mcp_server",
      serverName: "dev-nexus-typescript",
      tools: [
        {
          name: "typescript.importGraph",
          description:
            "Read TypeScript module import edges, hubs, cycles, and ignored source facts.",
        },
      ],
    });
    expect(
      projected[0]!.capabilities.find(
        (capability) => capability.id === "mcp-typescript-bulk-rewrite-planning",
      ),
    ).toMatchObject({
      kind: "mcp_server",
      serverName: "dev-nexus-typescript",
      tools: [
        {
          name: "typescript.bulkRewritePlan",
          description:
            "Preview TypeScript bulk rewrite plans without writing source files.",
        },
      ],
    });
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
        version: devNexusTypeScriptPluginVersion,
        capabilityCount: 12,
      },
    ]);
    expect(projected[0]!.capabilities.map((capability) => capability.kind)).toEqual([
      "dependency_projection",
      "projected_skill",
      "projected_skill",
      "projected_skill",
      "projected_skill",
      "projected_skill",
      "projected_skill",
      "mcp_server",
      "mcp_server",
      "mcp_server",
      "worker_context_fragment",
      "worker_briefing_fragment",
    ]);
  });

  it("can project setup inventory facts into DevNexus worker fragments", () => {
    const config = devNexusTypeScriptDevNexusPluginConfig({
      setupInventory: minimalSetupInventory(),
      targetComponents: ["typescript"],
    });

    expect(config.capabilities.map((capability) => capability.id)).toEqual([
      "node-modules",
      "skill-typescript-diagnose",
      "skill-typescript-refactor",
      "skill-typescript-project-topology",
      "skill-typescript-test-hygiene",
      "skill-typescript-api-boundaries",
      "skill-typescript-codemod-planning",
      "mcp-typescript-diagnostics-tracer",
      "mcp-typescript-import-graph-analysis",
      "mcp-typescript-bulk-rewrite-planning",
      "context-typescript-toolchain-boundary",
      "briefing-typescript-worktree-setup",
      "context-typescript-setup-inventory",
      "briefing-typescript-setup-inventory",
    ]);

    const projected = projectPluginWorkerFragments(
      {
        plugins: [config],
      },
      {
        agent: "codex",
        componentId: "typescript",
      },
    );

    expect(projected.context.map((fragment) => fragment.id)).toEqual([
      "context-typescript-setup-inventory",
      "context-typescript-toolchain-boundary",
    ]);
    expect(projected.briefing.map((fragment) => fragment.id)).toEqual([
      "briefing-typescript-setup-inventory",
      "briefing-typescript-worktree-setup",
    ]);
    expect(projected.context[0]!.body).toContain("Package manager: npm");
    expect(projected.briefing[0]!.body).toContain(
      "Use focused verification: npm run check",
    );
    expect(
      projectPluginDependencyProjections(
        { plugins: [config] },
        { componentId: "other" },
      ),
    ).toEqual([]);
  });
});
