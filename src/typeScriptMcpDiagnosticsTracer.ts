import { createRequire } from "node:module";
import path from "node:path";
import type { NexusPluginMcpServerCapability } from "dev-nexus";
import {
  devNexusTypeScriptMcpArgs,
  devNexusTypeScriptMcpCommand,
  devNexusTypeScriptMcpServerName,
} from "./typeScriptMcpServerConfig.js";
import {
  inspectTypeScriptProjectSetup,
  type InspectTypeScriptProjectSetupInput,
  type TypeScriptProjectSetupInventory,
  type TypeScriptSetupFinding,
} from "./typeScriptProjectSetupInventory.js";

type TypeScriptModule = typeof import("typescript");
type TypeScriptDiagnostic = import("typescript").Diagnostic;

export const typeScriptMcpDiagnosticsTracerToolDescriptors = [
  {
    name: "typescript.projectStatus",
    description:
      "Read TypeScript project setup status, scripts, compiler availability, and setup blockers.",
    readOnly: true,
  },
  {
    name: "typescript.diagnostics",
    description:
      "Read TypeScript compiler diagnostics grouped by file and diagnostic code.",
    readOnly: true,
  },
] as const;

export type TypeScriptMcpDiagnosticsTracerToolName =
  (typeof typeScriptMcpDiagnosticsTracerToolDescriptors)[number]["name"];

export interface TypeScriptMcpTraceInput
  extends InspectTypeScriptProjectSetupInput {
  tsconfigPath?: string;
}

export interface TypeScriptMcpTracer {
  tools: typeof typeScriptMcpDiagnosticsTracerToolDescriptors;
  projectStatus: typeof traceTypeScriptProjectStatus;
  diagnostics: typeof traceTypeScriptDiagnostics;
}

export interface TypeScriptMcpTraceSetup {
  blockerCount: number;
  blockers: TypeScriptSetupFinding[];
  recommendations: string[];
}

export interface TypeScriptMcpProjectStatusTrace {
  operation: "typescript.projectStatus";
  readOnly: true;
  status: "ok" | "blocked";
  projectRoot: string;
  inventory: TypeScriptProjectSetupInventory;
  setup: TypeScriptMcpTraceSetup;
  project: {
    tsconfigPath: string | null;
    typescriptVersion: string | null;
    packageManager: TypeScriptProjectSetupInventory["packageManager"]["detected"];
    availableScripts: string[];
  };
  operations: {
    diagnostics: {
      available: boolean;
      blockerIds: string[];
    };
  };
}

export interface TypeScriptMcpDiagnosticRecord {
  code: number;
  category: "error" | "message" | "suggestion" | "warning";
  message: string;
  filePath: string | null;
  line: number | null;
  character: number | null;
}

export interface TypeScriptMcpDiagnosticFileGroup {
  filePath: string;
  diagnostics: TypeScriptMcpDiagnosticRecord[];
}

export interface TypeScriptMcpDiagnosticCodeGroup {
  code: number;
  category: TypeScriptMcpDiagnosticRecord["category"];
  count: number;
}

export interface TypeScriptMcpDiagnosticsTrace {
  operation: "typescript.diagnostics";
  readOnly: true;
  status: "ok" | "diagnostics" | "blocked";
  projectRoot: string;
  setup: TypeScriptMcpTraceSetup;
  compiler: {
    tsconfigPath: string | null;
    typescriptVersion: string | null;
    usedCompilerApi: true;
  } | null;
  didRunCompiler: boolean;
  summary: {
    diagnosticCount: number;
    errorCount: number;
    warningCount: number;
  };
  diagnostics: TypeScriptMcpDiagnosticRecord[];
  diagnosticsByFile: TypeScriptMcpDiagnosticFileGroup[];
  diagnosticsByCode: TypeScriptMcpDiagnosticCodeGroup[];
}

export function createTypeScriptMcpDiagnosticsTracer(): TypeScriptMcpTracer {
  return {
    tools: typeScriptMcpDiagnosticsTracerToolDescriptors,
    projectStatus: traceTypeScriptProjectStatus,
    diagnostics: traceTypeScriptDiagnostics,
  };
}

export function devNexusTypeScriptMcpDiagnosticsTracerCapability(): NexusPluginMcpServerCapability {
  return {
    kind: "mcp_server",
    id: "mcp-typescript-diagnostics-tracer",
    description:
      "Advertise read-only TypeScript project status and diagnostics tracer operations.",
    serverName: devNexusTypeScriptMcpServerName,
    command: devNexusTypeScriptMcpCommand,
    args: [...devNexusTypeScriptMcpArgs],
    tools: typeScriptMcpDiagnosticsTracerToolDescriptors.map((tool) => ({
      name: tool.name,
      description: tool.description,
    })),
  } as NexusPluginMcpServerCapability;
}

export function traceTypeScriptProjectStatus(
  input: TypeScriptMcpTraceInput,
): TypeScriptMcpProjectStatusTrace {
  const inventory = inspectTypeScriptProjectSetup(input);
  const blockers = setupBlockers(inventory);
  const blockerIds = blockers.map((blocker) => blocker.id);

  return {
    operation: "typescript.projectStatus",
    readOnly: true,
    status: blockers.length === 0 ? "ok" : "blocked",
    projectRoot: inventory.projectRoot,
    inventory,
    setup: traceSetup(inventory, blockers),
    project: {
      tsconfigPath: selectedTsconfigPath(inventory, input.tsconfigPath),
      typescriptVersion: inventory.typescript.installedVersion,
      packageManager: inventory.packageManager.detected,
      availableScripts: inventory.scripts.available,
    },
    operations: {
      diagnostics: {
        available: blockers.length === 0,
        blockerIds,
      },
    },
  };
}

export function traceTypeScriptDiagnostics(
  input: TypeScriptMcpTraceInput,
): TypeScriptMcpDiagnosticsTrace {
  const inventory = inspectTypeScriptProjectSetup(input);
  const blockers = setupBlockers(inventory);
  if (blockers.length > 0) {
    return blockedDiagnosticsTrace(inventory, blockers);
  }

  const loaded = loadTypeScriptModule(inventory);
  if ("blocker" in loaded) {
    return blockedDiagnosticsTrace(inventory, [loaded.blocker]);
  }

  const tsconfigPath = selectedTsconfigPath(inventory, input.tsconfigPath);
  if (!tsconfigPath) {
    return blockedDiagnosticsTrace(inventory, [
      {
        id: "tsconfig_missing",
        severity: "blocker",
        message: "No root tsconfig*.json file was found.",
      },
    ]);
  }

  const diagnostics = readCompilerDiagnostics({
    projectRoot: inventory.projectRoot,
    tsconfigPath,
    typescript: loaded.typescript,
  });
  const records = diagnostics.map((diagnostic) =>
    diagnosticRecord(inventory.projectRoot, loaded.typescript, diagnostic),
  );

  return {
    operation: "typescript.diagnostics",
    readOnly: true,
    status: records.length === 0 ? "ok" : "diagnostics",
    projectRoot: inventory.projectRoot,
    setup: traceSetup(inventory, []),
    compiler: {
      tsconfigPath,
      typescriptVersion: inventory.typescript.installedVersion,
      usedCompilerApi: true,
    },
    didRunCompiler: true,
    summary: diagnosticSummary(records),
    diagnostics: records,
    diagnosticsByFile: diagnosticsByFile(records),
    diagnosticsByCode: diagnosticsByCode(records),
  };
}

function setupBlockers(
  inventory: TypeScriptProjectSetupInventory,
): TypeScriptSetupFinding[] {
  return inventory.blockers;
}

function traceSetup(
  inventory: TypeScriptProjectSetupInventory,
  blockers: TypeScriptSetupFinding[],
): TypeScriptMcpTraceSetup {
  return {
    blockerCount: blockers.length,
    blockers,
    recommendations: inventory.recommendations,
  };
}

function selectedTsconfigPath(
  inventory: TypeScriptProjectSetupInventory,
  requestedTsconfigPath: string | undefined,
): string | null {
  if (requestedTsconfigPath) {
    return path.relative(
      inventory.projectRoot,
      path.resolve(inventory.projectRoot, requestedTsconfigPath),
    );
  }

  return inventory.typescript.tsconfigPaths[0] ?? null;
}

function loadTypeScriptModule(
  inventory: TypeScriptProjectSetupInventory,
):
  | { typescript: TypeScriptModule }
  | { blocker: TypeScriptSetupFinding } {
  try {
    const requireFromProject = createRequire(path.join(inventory.projectRoot, "package.json"));
    return {
      typescript: requireFromProject("typescript") as TypeScriptModule,
    };
  } catch (error) {
    return {
      blocker: {
        id: "typescript_package_unavailable",
        severity: "blocker",
        message: `The TypeScript package could not be loaded from the project dependency tree: ${errorMessage(error)}`,
      },
    };
  }
}

function readCompilerDiagnostics(input: {
  projectRoot: string;
  tsconfigPath: string;
  typescript: TypeScriptModule;
}): TypeScriptDiagnostic[] {
  const configPath = path.resolve(input.projectRoot, input.tsconfigPath);
  const configRead = input.typescript.readConfigFile(
    configPath,
    input.typescript.sys.readFile,
  );
  if (configRead.error) {
    return [configRead.error];
  }

  const parsed = input.typescript.parseJsonConfigFileContent(
    configRead.config,
    input.typescript.sys,
    path.dirname(configPath),
    {
      noEmit: true,
    },
    configPath,
  );
  if (parsed.errors.length > 0) {
    return parsed.errors;
  }

  const program = input.typescript.createProgram({
    rootNames: parsed.fileNames,
    options: {
      ...parsed.options,
      noEmit: true,
    },
    projectReferences: parsed.projectReferences,
  });

  return [...input.typescript.getPreEmitDiagnostics(program)];
}

function diagnosticRecord(
  projectRoot: string,
  typescript: TypeScriptModule,
  diagnostic: TypeScriptDiagnostic,
): TypeScriptMcpDiagnosticRecord {
  const location =
    diagnostic.file && diagnostic.start !== undefined
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
      : null;

  return {
    code: diagnostic.code,
    category: diagnosticCategory(typescript, diagnostic),
    message: typescript.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    filePath: diagnostic.file
      ? path.relative(projectRoot, diagnostic.file.fileName).split(path.sep).join("/")
      : null,
    line: location ? location.line + 1 : null,
    character: location ? location.character + 1 : null,
  };
}

function diagnosticCategory(
  typescript: TypeScriptModule,
  diagnostic: TypeScriptDiagnostic,
): TypeScriptMcpDiagnosticRecord["category"] {
  return typescript.DiagnosticCategory[diagnostic.category].toLowerCase() as
    | "error"
    | "message"
    | "suggestion"
    | "warning";
}

function diagnosticSummary(records: TypeScriptMcpDiagnosticRecord[]): {
  diagnosticCount: number;
  errorCount: number;
  warningCount: number;
} {
  return {
    diagnosticCount: records.length,
    errorCount: records.filter((record) => record.category === "error").length,
    warningCount: records.filter((record) => record.category === "warning").length,
  };
}

function diagnosticsByFile(
  records: TypeScriptMcpDiagnosticRecord[],
): TypeScriptMcpDiagnosticFileGroup[] {
  const grouped = new Map<string, TypeScriptMcpDiagnosticRecord[]>();
  for (const record of records.filter((diagnostic) => diagnostic.filePath !== null)) {
    const group = grouped.get(record.filePath!) ?? [];
    group.push(record);
    grouped.set(record.filePath!, group);
  }

  return [...grouped.entries()]
    .map(([filePath, diagnostics]) => ({ filePath, diagnostics }))
    .sort((left, right) => left.filePath.localeCompare(right.filePath));
}

function diagnosticsByCode(
  records: TypeScriptMcpDiagnosticRecord[],
): TypeScriptMcpDiagnosticCodeGroup[] {
  const grouped = new Map<string, TypeScriptMcpDiagnosticCodeGroup>();
  for (const record of records) {
    const key = `${record.category}:${record.code}`;
    const group = grouped.get(key) ?? {
      code: record.code,
      category: record.category,
      count: 0,
    };
    group.count += 1;
    grouped.set(key, group);
  }

  return [...grouped.values()].sort((left, right) => {
    if (left.code !== right.code) {
      return left.code - right.code;
    }
    return left.category.localeCompare(right.category);
  });
}

function blockedDiagnosticsTrace(
  inventory: TypeScriptProjectSetupInventory,
  blockers: TypeScriptSetupFinding[],
): TypeScriptMcpDiagnosticsTrace {
  return {
    operation: "typescript.diagnostics",
    readOnly: true,
    status: "blocked",
    projectRoot: inventory.projectRoot,
    setup: traceSetup(inventory, blockers),
    compiler: null,
    didRunCompiler: false,
    summary: {
      diagnosticCount: 0,
      errorCount: 0,
      warningCount: 0,
    },
    diagnostics: [],
    diagnosticsByFile: [],
    diagnosticsByCode: [],
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
