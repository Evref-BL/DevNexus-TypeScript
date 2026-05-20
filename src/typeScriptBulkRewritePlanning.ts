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
type TypeScriptParsedCommandLine = import("typescript").ParsedCommandLine;
type TypeScriptProgram = import("typescript").Program;
type TypeScriptSourceFile = import("typescript").SourceFile;

const defaultIncludePatterns = [
  "src/**/*.ts",
  "src/**/*.tsx",
  "src/**/*.mts",
  "src/**/*.cts",
];

export const typeScriptBulkRewritePlanningToolDescriptors = [
  {
    name: "typescript.bulkRewritePlan",
    description: "Preview TypeScript bulk rewrite plans without writing source files.",
    readOnly: true,
  },
] as const;

export interface TypeScriptBulkRewritePlanInput
  extends InspectTypeScriptProjectSetupInput {
  tsconfigPath?: string;
  include?: string[];
  ignore?: string[];
  rewrite: TypeScriptBulkRewriteIntent;
  verificationCommands?: string[];
}

export interface TypeScriptBulkRewritePlanner {
  tools: typeof typeScriptBulkRewritePlanningToolDescriptors;
  plan: typeof planTypeScriptBulkRewrite;
}

export type TypeScriptBulkRewriteIntent = TypeScriptIdentifierRenameIntent;

export interface TypeScriptIdentifierRenameIntent {
  kind: "renameIdentifier";
  from: string;
  to: string;
  description?: string;
}

export interface TypeScriptBulkRewriteSetup {
  blockerCount: number;
  blockers: TypeScriptSetupFinding[];
  recommendations: string[];
}

export interface TypeScriptBulkRewritePlan {
  operation: "typescript.bulkRewritePlan";
  readOnly: true;
  status: "blocked" | "no_matches" | "planned";
  projectRoot: string;
  setup: TypeScriptBulkRewriteSetup;
  policy: {
    applyAllowed: false;
    approvalRequiredForApply: true;
    policySource: "DevNexus-TypeScript#10";
  };
  backend: {
    id: "typescript-compiler-api";
    label: "TypeScript compiler API";
    available: boolean;
    blockerIds: string[];
    tsconfigPath: string | null;
    typescriptVersion: string | null;
  };
  didAnalyze: boolean;
  scope: {
    include: string[];
    ignore: string[];
    totalFileCount: number;
    analyzedFileCount: number;
    ignoredFileCount: number;
    ignoredFiles: string[];
  };
  rewrite: {
    kind: TypeScriptBulkRewriteIntent["kind"];
    description: string;
  };
  summary: {
    matchedFileCount: number;
    matchCount: number;
    proposedEditCount: number;
    rewriteCategoryCount: number;
    riskCount: number;
    verificationCommandCount: number;
  };
  rewriteCategories: TypeScriptBulkRewriteCategory[];
  files: TypeScriptBulkRewriteFilePlan[];
  risks: TypeScriptBulkRewriteRisk[];
  verificationCommands: string[];
}

export interface TypeScriptBulkRewriteCategory {
  id: "identifier_rename";
  label: string;
  matchCount: number;
}

export interface TypeScriptBulkRewriteFilePlan {
  filePath: string;
  matchCount: number;
  proposedEditCount: number;
  matches: TypeScriptBulkRewriteMatch[];
}

export interface TypeScriptBulkRewriteMatch {
  nodeKind: string;
  line: number;
  character: number;
  currentText: string;
  proposedText: string;
  parentKind: string;
  edit: {
    start: number;
    end: number;
    replacementText: string;
  };
  preview: {
    before: string;
    after: string;
  };
}

export interface TypeScriptBulkRewriteRisk {
  id: "no_apply_path" | "semantic_review_required";
  severity: "info" | "review_required";
  message: string;
}

interface ParsedProjectContext {
  tsconfigPath: string;
  typescript: TypeScriptModule;
  parsed: TypeScriptParsedCommandLine;
  program: TypeScriptProgram;
}

interface ScopeSelection {
  include: string[];
  ignore: string[];
  allFiles: string[];
  analyzedFiles: string[];
  ignoredFiles: string[];
}

export function createTypeScriptBulkRewritePlanner(): TypeScriptBulkRewritePlanner {
  return {
    tools: typeScriptBulkRewritePlanningToolDescriptors,
    plan: planTypeScriptBulkRewrite,
  };
}

export function devNexusTypeScriptBulkRewritePlanningCapability(): NexusPluginMcpServerCapability {
  return {
    kind: "mcp_server",
    id: "mcp-typescript-bulk-rewrite-planning",
    description:
      "Advertise read-only TypeScript bulk rewrite planning operations.",
    serverName: devNexusTypeScriptMcpServerName,
    command: devNexusTypeScriptMcpCommand,
    args: [...devNexusTypeScriptMcpArgs],
    tools: typeScriptBulkRewritePlanningToolDescriptors.map((tool) => ({
      name: tool.name,
      description: tool.description,
    })),
  } as NexusPluginMcpServerCapability;
}

export function planTypeScriptBulkRewrite(
  input: TypeScriptBulkRewritePlanInput,
): TypeScriptBulkRewritePlan {
  const inventory = inspectTypeScriptProjectSetup(input);
  const blockers = setupBlockers(inventory);
  const requestedScope = requestedScopeSelection(input);
  if (blockers.length > 0) {
    return blockedPlan({
      inventory,
      blockers,
      input,
      scope: requestedScope,
      blockerIds: blockers.map((blocker) => blocker.id),
    });
  }

  const context = readParsedProjectContext(inventory, input.tsconfigPath);
  if ("blocker" in context) {
    return blockedPlan({
      inventory,
      blockers: [context.blocker],
      input,
      scope: requestedScope,
      blockerIds: [context.blocker.id],
    });
  }

  const scope = selectScope({
    projectRoot: inventory.projectRoot,
    parsed: context.parsed,
    include: input.include,
    ignore: input.ignore,
  });
  const files = buildFilePlans({
    projectRoot: inventory.projectRoot,
    context,
    scope,
    rewrite: input.rewrite,
  });
  const matchCount = files.reduce((sum, file) => sum + file.matchCount, 0);
  const risks = planRisks();
  const verificationCommands = selectedVerificationCommands(inventory, input);

  return {
    operation: "typescript.bulkRewritePlan",
    readOnly: true,
    status: matchCount > 0 ? "planned" : "no_matches",
    projectRoot: inventory.projectRoot,
    setup: traceSetup(inventory, []),
    policy: policy(),
    backend: {
      id: "typescript-compiler-api",
      label: "TypeScript compiler API",
      available: true,
      blockerIds: [],
      tsconfigPath: context.tsconfigPath,
      typescriptVersion: inventory.typescript.installedVersion,
    },
    didAnalyze: true,
    scope: {
      include: scope.include,
      ignore: scope.ignore,
      totalFileCount: scope.allFiles.length,
      analyzedFileCount: scope.analyzedFiles.length,
      ignoredFileCount: scope.ignoredFiles.length,
      ignoredFiles: scope.ignoredFiles,
    },
    rewrite: {
      kind: input.rewrite.kind,
      description: rewriteDescription(input.rewrite),
    },
    summary: {
      matchedFileCount: files.length,
      matchCount,
      proposedEditCount: matchCount,
      rewriteCategoryCount: matchCount > 0 ? 1 : 0,
      riskCount: risks.length,
      verificationCommandCount: verificationCommands.length,
    },
    rewriteCategories:
      matchCount > 0
        ? [
            {
              id: "identifier_rename",
              label: "Identifier rename",
              matchCount,
            },
          ]
        : [],
    files,
    risks,
    verificationCommands,
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
): TypeScriptBulkRewriteSetup {
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
    return relativeProjectPath(
      inventory.projectRoot,
      path.resolve(inventory.projectRoot, requestedTsconfigPath),
    );
  }

  return inventory.typescript.tsconfigPaths[0] ?? null;
}

function readParsedProjectContext(
  inventory: TypeScriptProjectSetupInventory,
  requestedTsconfigPath: string | undefined,
):
  | ParsedProjectContext
  | { blocker: TypeScriptSetupFinding } {
  const loaded = loadTypeScriptModule(inventory);
  if ("blocker" in loaded) {
    return loaded;
  }

  const tsconfigPath = selectedTsconfigPath(inventory, requestedTsconfigPath);
  if (!tsconfigPath) {
    return {
      blocker: {
        id: "tsconfig_missing",
        severity: "blocker",
        message: "No root tsconfig*.json file was found.",
      },
    };
  }

  const configPath = path.resolve(inventory.projectRoot, tsconfigPath);
  const configRead = loaded.typescript.readConfigFile(
    configPath,
    loaded.typescript.sys.readFile,
  );
  if (configRead.error) {
    return {
      blocker: {
        id: "tsconfig_read_error",
        severity: "blocker",
        message: loaded.typescript.flattenDiagnosticMessageText(
          configRead.error.messageText,
          "\n",
        ),
      },
    };
  }

  const parsed = loaded.typescript.parseJsonConfigFileContent(
    configRead.config,
    loaded.typescript.sys,
    path.dirname(configPath),
    {
      noEmit: true,
    },
    configPath,
  );
  if (parsed.errors.length > 0) {
    return {
      blocker: {
        id: "tsconfig_parse_error",
        severity: "blocker",
        message: parsed.errors
          .map((diagnostic) =>
            loaded.typescript.flattenDiagnosticMessageText(
              diagnostic.messageText,
              "\n",
            ),
          )
          .join("\n"),
      },
    };
  }

  const program = loaded.typescript.createProgram({
    rootNames: parsed.fileNames,
    options: {
      ...parsed.options,
      noEmit: true,
    },
    projectReferences: parsed.projectReferences,
  });

  return {
    tsconfigPath,
    typescript: loaded.typescript,
    parsed,
    program,
  };
}

function loadTypeScriptModule(
  inventory: TypeScriptProjectSetupInventory,
):
  | { typescript: TypeScriptModule }
  | { blocker: TypeScriptSetupFinding } {
  try {
    const requireFromProject = createRequire(
      path.join(inventory.projectRoot, "package.json"),
    );
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

function requestedScopeSelection(input: TypeScriptBulkRewritePlanInput): ScopeSelection {
  return {
    include: normalizePatterns(input.include, defaultIncludePatterns),
    ignore: normalizePatterns(input.ignore, []),
    allFiles: [],
    analyzedFiles: [],
    ignoredFiles: [],
  };
}

function selectScope(input: {
  projectRoot: string;
  parsed: TypeScriptParsedCommandLine;
  include: string[] | undefined;
  ignore: string[] | undefined;
}): ScopeSelection {
  const include = normalizePatterns(input.include, defaultIncludePatterns);
  const ignore = normalizePatterns(input.ignore, []);
  const allFiles = input.parsed.fileNames
    .map((filePath) => relativeProjectPath(input.projectRoot, filePath))
    .filter((filePath) => isProjectRelative(filePath))
    .sort();
  const includedFiles = allFiles.filter((filePath) => matchesAny(filePath, include));
  const analyzedFiles: string[] = [];
  const ignoredFiles: string[] = [];

  for (const filePath of includedFiles) {
    if (matchesAny(filePath, ignore)) {
      ignoredFiles.push(filePath);
    } else {
      analyzedFiles.push(filePath);
    }
  }

  return {
    include,
    ignore,
    allFiles,
    analyzedFiles,
    ignoredFiles,
  };
}

function buildFilePlans(input: {
  projectRoot: string;
  context: ParsedProjectContext;
  scope: ScopeSelection;
  rewrite: TypeScriptBulkRewriteIntent;
}): TypeScriptBulkRewriteFilePlan[] {
  return input.scope.analyzedFiles
    .map((filePath) => {
      const absolutePath = path.resolve(input.projectRoot, filePath);
      const sourceFile = input.context.program.getSourceFile(absolutePath);
      if (!sourceFile) {
        return null;
      }

      const matches = identifierRenameMatches({
        typescript: input.context.typescript,
        sourceFile,
        rewrite: input.rewrite,
      });

      return matches.length > 0
        ? {
            filePath,
            matchCount: matches.length,
            proposedEditCount: matches.length,
            matches,
          }
        : null;
    })
    .filter((filePlan): filePlan is TypeScriptBulkRewriteFilePlan => filePlan !== null)
    .sort((left, right) => left.filePath.localeCompare(right.filePath));
}

function identifierRenameMatches(input: {
  typescript: TypeScriptModule;
  sourceFile: TypeScriptSourceFile;
  rewrite: TypeScriptBulkRewriteIntent;
}): TypeScriptBulkRewriteMatch[] {
  const matches: TypeScriptBulkRewriteMatch[] = [];
  const text = input.sourceFile.getFullText();
  const lines = text.split(/\r?\n/u);
  const lineStarts = sourceLineStarts(text);

  const visit = (node: import("typescript").Node): void => {
    if (
      input.rewrite.kind === "renameIdentifier" &&
      input.typescript.isIdentifier(node) &&
      node.text === input.rewrite.from
    ) {
      const start = node.getStart(input.sourceFile);
      const end = node.getEnd();
      const location = input.sourceFile.getLineAndCharacterOfPosition(start);
      const line = lines[location.line] ?? "";
      const lineStart = lineStarts[location.line] ?? 0;
      const relativeStart = start - lineStart;
      const relativeEnd = end - lineStart;

      matches.push({
        nodeKind: "Identifier",
        line: location.line + 1,
        character: location.character + 1,
        currentText: input.rewrite.from,
        proposedText: input.rewrite.to,
        parentKind: node.parent
          ? String(input.typescript.SyntaxKind[node.parent.kind])
          : "unknown",
        edit: {
          start,
          end,
          replacementText: input.rewrite.to,
        },
        preview: {
          before: line,
          after: `${line.slice(0, relativeStart)}${input.rewrite.to}${line.slice(relativeEnd)}`,
        },
      });
    }

    input.typescript.forEachChild(node, visit);
  };

  visit(input.sourceFile);
  return matches.sort((left, right) => {
    if (left.edit.start !== right.edit.start) {
      return left.edit.start - right.edit.start;
    }
    return left.edit.end - right.edit.end;
  });
}

function sourceLineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}

function selectedVerificationCommands(
  inventory: TypeScriptProjectSetupInventory,
  input: TypeScriptBulkRewritePlanInput,
): string[] {
  if (input.verificationCommands && input.verificationCommands.length > 0) {
    return input.verificationCommands;
  }
  if (inventory.scripts.expected.check) {
    return ["npm run check"];
  }
  if (inventory.scripts.expected.test) {
    return ["npm test"];
  }
  if (inventory.scripts.expected.build) {
    return ["npm run build"];
  }
  return [];
}

function planRisks(): TypeScriptBulkRewriteRisk[] {
  return [
    {
      id: "semantic_review_required",
      severity: "review_required",
      message:
        "Identifier matching is syntax-aware but still needs semantic review before any equivalent manual edit or future apply path.",
    },
    {
      id: "no_apply_path",
      severity: "info",
      message:
        "Current DevNexus-TypeScript policy allows dry-run planning only; this operation does not write files or apply edits.",
    },
  ];
}

function policy(): TypeScriptBulkRewritePlan["policy"] {
  return {
    applyAllowed: false,
    approvalRequiredForApply: true,
    policySource: "DevNexus-TypeScript#10",
  };
}

function rewriteDescription(rewrite: TypeScriptBulkRewriteIntent): string {
  if (rewrite.description) {
    return rewrite.description;
  }
  return `Rename identifier ${rewrite.from} to ${rewrite.to}.`;
}

function blockedPlan(input: {
  inventory: TypeScriptProjectSetupInventory;
  blockers: TypeScriptSetupFinding[];
  input: TypeScriptBulkRewritePlanInput;
  scope: ScopeSelection;
  blockerIds: string[];
}): TypeScriptBulkRewritePlan {
  return {
    operation: "typescript.bulkRewritePlan",
    readOnly: true,
    status: "blocked",
    projectRoot: input.inventory.projectRoot,
    setup: traceSetup(input.inventory, input.blockers),
    policy: policy(),
    backend: {
      id: "typescript-compiler-api",
      label: "TypeScript compiler API",
      available: false,
      blockerIds: input.blockerIds,
      tsconfigPath: selectedTsconfigPath(
        input.inventory,
        input.input.tsconfigPath,
      ),
      typescriptVersion: input.inventory.typescript.installedVersion,
    },
    didAnalyze: false,
    scope: {
      include: input.scope.include,
      ignore: input.scope.ignore,
      totalFileCount: 0,
      analyzedFileCount: 0,
      ignoredFileCount: 0,
      ignoredFiles: [],
    },
    rewrite: {
      kind: input.input.rewrite.kind,
      description: rewriteDescription(input.input.rewrite),
    },
    summary: {
      matchedFileCount: 0,
      matchCount: 0,
      proposedEditCount: 0,
      rewriteCategoryCount: 0,
      riskCount: 0,
      verificationCommandCount: 0,
    },
    rewriteCategories: [],
    files: [],
    risks: [],
    verificationCommands: [],
  };
}

function normalizePatterns(
  requestedPatterns: string[] | undefined,
  fallbackPatterns: string[],
): string[] {
  const patterns =
    requestedPatterns && requestedPatterns.length > 0
      ? requestedPatterns
      : fallbackPatterns;
  return patterns.map(normalizePattern);
}

function relativeProjectPath(projectRoot: string, filePath: string): string {
  return path.relative(projectRoot, filePath).split(path.sep).join("/");
}

function isProjectRelative(filePath: string): boolean {
  return filePath !== "" && !filePath.startsWith("../") && filePath !== "..";
}

function normalizePattern(pattern: string): string {
  return pattern.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function matchesAny(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globPatternToRegExp(pattern).test(filePath));
}

function globPatternToRegExp(pattern: string): RegExp {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]!;
    if (pattern.slice(index, index + 3) === "**/") {
      source += "(?:.*/)?";
      index += 2;
    } else if (pattern.slice(index, index + 2) === "**") {
      source += ".*";
      index += 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else {
      source += escapeRegExp(char);
    }
  }

  return new RegExp(`^${source}$`, "u");
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$+?.()|[\]{}]/gu, "\\$&");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
