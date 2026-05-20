import path from "node:path";
import type { NexusPluginWorkerFragmentCapability } from "dev-nexus";
import {
  inspectTypeScriptProjectSetup,
  type InspectTypeScriptProjectSetupInput,
  type TypeScriptPackageManager,
  type TypeScriptProjectSetupInventory,
  type TypeScriptSetupFinding,
} from "./typeScriptProjectSetupInventory.js";

export interface TypeScriptProjectSetupWorkerFragmentCapabilitiesInput {
  inventory: TypeScriptProjectSetupInventory;
  targetAgents?: string[];
  targetComponents?: string[];
}

export interface TypeScriptProjectSetupWorkerFragmentCapabilitiesForProjectInput
  extends InspectTypeScriptProjectSetupInput {
  targetAgents?: string[];
  targetComponents?: string[];
}

const defaultWorkerTargetAgents = ["codex", "claude"];
const preferredVerificationScripts = [
  "check",
  "typecheck",
  "test",
  "lint",
  "build",
];

export function typeScriptProjectSetupWorkerFragmentCapabilities(
  input: TypeScriptProjectSetupWorkerFragmentCapabilitiesInput,
): NexusPluginWorkerFragmentCapability[] {
  const targetAgents = input.targetAgents ?? defaultWorkerTargetAgents;

  return [
    {
      kind: "worker_context_fragment",
      id: "context-typescript-setup-inventory",
      title: "TypeScript Setup Inventory",
      body: typeScriptProjectSetupWorkerContextBody(input.inventory),
      targetAgents,
      targetComponents: input.targetComponents,
      provenance: "DevNexus TypeScript setup inventory",
    },
    {
      kind: "worker_briefing_fragment",
      id: "briefing-typescript-setup-inventory",
      title: "TypeScript Setup Inventory",
      body: typeScriptProjectSetupWorkerBriefingBody(input.inventory),
      targetAgents,
      targetComponents: input.targetComponents,
      provenance: "DevNexus TypeScript setup inventory",
    },
  ];
}

export function typeScriptProjectSetupWorkerFragmentCapabilitiesForProject(
  input: TypeScriptProjectSetupWorkerFragmentCapabilitiesForProjectInput,
): NexusPluginWorkerFragmentCapability[] {
  return typeScriptProjectSetupWorkerFragmentCapabilities({
    inventory: inspectTypeScriptProjectSetup({ projectRoot: input.projectRoot }),
    targetAgents: input.targetAgents,
    targetComponents: input.targetComponents,
  });
}

export function typeScriptProjectSetupWorkerContextBody(
  inventory: TypeScriptProjectSetupInventory,
): string {
  return [
    "DevNexus TypeScript setup inventory for this component.",
    "Boundary: DevNexus TypeScript contributes setup guidance only; it does not choose or supervise implementation work.",
    `Package manager: ${inventory.packageManager.detected}${lockfileSuffix(inventory)}.`,
    `Dependency projection: ${dependencyProjectionSummary(inventory)}.`,
    `Available scripts: ${joinOrNone(inventory.scripts.available)}.`,
    `Recommended verification: ${recommendedVerificationSummary(inventory)}.`,
    `TypeScript: ${typeScriptSummary(inventory)}.`,
    `Project references: ${inventory.typescript.projectReferences.count}.`,
    `Tools: ${toolSummary(inventory)}.`,
    binarySummary(inventory),
    setupBlockerSummary(inventory.blockers),
    recommendationSummary(inventory.recommendations),
  ].join("\n");
}

export function typeScriptProjectSetupWorkerBriefingBody(
  inventory: TypeScriptProjectSetupInventory,
): string {
  return [
    "TypeScript setup inventory:",
    `Package manager: ${inventory.packageManager.detected}${lockfileSuffix(inventory)}.`,
    `Dependency projection: ${dependencyProjectionSummary(inventory)}.`,
    `Available package scripts: ${joinOrNone(inventory.scripts.available)}.`,
    `Use focused verification: ${recommendedVerificationSummary(inventory)}.`,
    binarySummary(inventory),
    setupBlockerSummary(inventory.blockers),
    "Do not run package-manager installs or npx package fetches as an automatic repair.",
  ].join("\n");
}

function lockfileSuffix(inventory: TypeScriptProjectSetupInventory): string {
  if (inventory.packageManager.lockfiles.length === 0) {
    return "";
  }

  return ` (${inventory.packageManager.lockfiles.join(", ")})`;
}

function dependencyProjectionSummary(
  inventory: TypeScriptProjectSetupInventory,
): string {
  if (!inventory.dependencies.nodeModules.exists) {
    return "node_modules missing";
  }

  if (inventory.dependencies.nodeModules.projected) {
    return "projected node_modules present";
  }

  return "local node_modules present";
}

function recommendedVerificationSummary(
  inventory: TypeScriptProjectSetupInventory,
): string {
  const preferredAvailableScripts = preferredVerificationScripts.filter(
    (script) => inventory.scripts.available.includes(script),
  );

  if (preferredAvailableScripts.length === 0) {
    return "none";
  }

  return preferredAvailableScripts
    .map((script) => packageScriptCommand(inventory.packageManager.detected, script))
    .join(", ");
}

function packageScriptCommand(
  packageManager: TypeScriptPackageManager,
  script: string,
): string {
  if (packageManager === "unknown") {
    return `package-manager run ${script}`;
  }

  return `${packageManager} run ${script}`;
}

function typeScriptSummary(inventory: TypeScriptProjectSetupInventory): string {
  const declared = inventory.typescript.declaredRange ?? "not declared";
  const installed = inventory.typescript.installedVersion ?? "not installed";
  const tsconfigs = joinOrNone(relativeProjectPaths(
    inventory.projectRoot,
    inventory.typescript.tsconfigPaths,
  ));

  return `declared ${declared}; installed ${installed}; tsconfig ${tsconfigs}`;
}

function toolSummary(inventory: TypeScriptProjectSetupInventory): string {
  const tools = [
    inventory.tools.testFramework.detected
      ? `test framework ${inventory.tools.testFramework.detected}`
      : null,
    inventory.tools.typedLinting.detected ? "typed linting" : null,
    inventory.tools.structuralSearch.detected
      ? `structural search ${joinOrNone(inventory.tools.structuralSearch.tools)}`
      : null,
    inventory.tools.unusedCode.detected
      ? `unused-code ${joinOrNone(inventory.tools.unusedCode.tools)}`
      : null,
  ].filter((tool): tool is string => tool !== null);

  return joinOrNone(tools);
}

function binarySummary(inventory: TypeScriptProjectSetupInventory): string {
  const available = inventory.dependencies.binaries
    .filter((binary) => binary.available)
    .map((binary) => binary.name);
  const missing = inventory.dependencies.binaries
    .filter((binary) => !binary.available)
    .map((binary) => binary.name);

  return [
    `Available binaries: ${joinOrNone(available)}.`,
    `Missing binaries: ${joinOrNone(missing)}.`,
  ].join("\n");
}

function setupBlockerSummary(blockers: TypeScriptSetupFinding[]): string {
  if (blockers.length === 0) {
    return "Setup blockers: none.";
  }

  return [
    "Setup blockers:",
    ...blockers.map((blocker) => `${blocker.id} - ${blocker.message}`),
  ].join("\n");
}

function recommendationSummary(recommendations: string[]): string {
  if (recommendations.length === 0) {
    return "Recommendations: none.";
  }

  return ["Recommendations:", ...recommendations].join("\n");
}

function relativeProjectPaths(projectRoot: string, paths: string[]): string[] {
  return paths.map((filePath) => {
    const resolvedPath = path.resolve(projectRoot, filePath);
    return path.relative(projectRoot, resolvedPath) || ".";
  });
}

function joinOrNone(values: string[]): string {
  if (values.length === 0) {
    return "none";
  }

  return values.join(", ");
}
