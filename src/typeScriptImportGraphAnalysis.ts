import { createRequire } from "node:module";
import path from "node:path";
import type { NexusPluginMcpServerCapability } from "dev-nexus";
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

export const typeScriptImportGraphToolDescriptors = [
  {
    name: "typescript.importGraph",
    description:
      "Read TypeScript module import edges, hubs, cycles, and ignored source facts.",
    readOnly: true,
  },
] as const;

export interface TypeScriptImportGraphInput
  extends InspectTypeScriptProjectSetupInput {
  tsconfigPath?: string;
  include?: string[];
  ignore?: string[];
}

export interface TypeScriptImportGraphAnalyzer {
  tools: typeof typeScriptImportGraphToolDescriptors;
  importGraph: typeof analyzeTypeScriptImportGraph;
}

export interface TypeScriptImportGraphSetup {
  blockerCount: number;
  blockers: TypeScriptSetupFinding[];
  recommendations: string[];
}

export interface TypeScriptImportGraphEdge {
  from: string;
  to: string;
  specifier: string;
  kind: "dynamic-import" | "export" | "import";
  typeOnly: boolean;
}

export interface TypeScriptImportGraphModule {
  filePath: string;
  imports: string[];
  importedBy: string[];
}

export interface TypeScriptImportGraphHub extends TypeScriptImportGraphModule {
  incomingCount: number;
  outgoingCount: number;
  degree: number;
}

export interface TypeScriptImportGraphCycle {
  modules: string[];
  edgeCount: number;
}

export interface TypeScriptImportGraphIgnoredImport {
  from: string;
  specifier: string;
  resolvedPath: string;
  matchedIgnorePattern: string;
}

export interface TypeScriptImportGraphUnresolvedImport {
  from: string;
  specifier: string;
  kind: TypeScriptImportGraphEdge["kind"];
  reason: "outside_scope" | "unresolved";
}

export interface TypeScriptImportGraphExternalImport {
  from: string;
  specifier: string;
  kind: TypeScriptImportGraphEdge["kind"];
}

export interface TypeScriptImportGraphAnalysis {
  operation: "typescript.importGraph";
  readOnly: true;
  status: "blocked" | "cycles" | "ok";
  projectRoot: string;
  setup: TypeScriptImportGraphSetup;
  compiler: {
    tsconfigPath: string;
    typescriptVersion: string | null;
    usedCompilerApi: true;
  } | null;
  didAnalyze: boolean;
  scope: {
    include: string[];
    ignore: string[];
    totalFileCount: number;
    analyzedFileCount: number;
    ignoredFileCount: number;
    ignoredFiles: string[];
  };
  summary: {
    moduleCount: number;
    edgeCount: number;
    cycleCount: number;
    unresolvedImportCount: number;
    ignoredImportCount: number;
    externalImportCount: number;
  };
  modules: TypeScriptImportGraphModule[];
  edges: TypeScriptImportGraphEdge[];
  hubs: TypeScriptImportGraphHub[];
  cycles: TypeScriptImportGraphCycle[];
  ignoredImports: TypeScriptImportGraphIgnoredImport[];
  unresolvedImports: TypeScriptImportGraphUnresolvedImport[];
  externalImports: TypeScriptImportGraphExternalImport[];
}

interface ParsedProjectContext {
  tsconfigPath: string;
  typescript: TypeScriptModule;
  parsed: TypeScriptParsedCommandLine;
  program: TypeScriptProgram;
}

interface ImportReference {
  from: string;
  fromAbsolutePath: string;
  specifier: string;
  kind: TypeScriptImportGraphEdge["kind"];
  typeOnly: boolean;
}

interface ScopeSelection {
  include: string[];
  ignore: string[];
  allFiles: string[];
  analyzedFiles: string[];
  ignoredFiles: string[];
  ignoredPatternByFile: Map<string, string>;
}

export function createTypeScriptImportGraphAnalyzer(): TypeScriptImportGraphAnalyzer {
  return {
    tools: typeScriptImportGraphToolDescriptors,
    importGraph: analyzeTypeScriptImportGraph,
  };
}

export function devNexusTypeScriptImportGraphAnalysisCapability(): NexusPluginMcpServerCapability {
  return {
    kind: "mcp_server",
    id: "mcp-typescript-import-graph-analysis",
    description:
      "Advertise read-only TypeScript import graph analysis operations.",
    serverName: "dev-nexus-typescript",
    tools: typeScriptImportGraphToolDescriptors.map((tool) => ({
      name: tool.name,
      description: tool.description,
    })),
  };
}

export function analyzeTypeScriptImportGraph(
  input: TypeScriptImportGraphInput,
): TypeScriptImportGraphAnalysis {
  const inventory = inspectTypeScriptProjectSetup(input);
  const blockers = setupBlockers(inventory);
  if (blockers.length > 0) {
    return blockedImportGraph(inventory, blockers, input);
  }

  const context = readParsedProjectContext(inventory, input.tsconfigPath);
  if ("blocker" in context) {
    return blockedImportGraph(inventory, [context.blocker], input);
  }

  const scope = selectScope({
    projectRoot: inventory.projectRoot,
    parsed: context.parsed,
    include: input.include,
    ignore: input.ignore,
  });
  const graph = buildImportGraph({
    inventory,
    context,
    scope,
  });

  return {
    operation: "typescript.importGraph",
    readOnly: true,
    status: graph.cycles.length > 0 ? "cycles" : "ok",
    projectRoot: inventory.projectRoot,
    setup: traceSetup(inventory, []),
    compiler: {
      tsconfigPath: context.tsconfigPath,
      typescriptVersion: inventory.typescript.installedVersion,
      usedCompilerApi: true,
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
    summary: {
      moduleCount: graph.modules.length,
      edgeCount: graph.edges.length,
      cycleCount: graph.cycles.length,
      unresolvedImportCount: graph.unresolvedImports.length,
      ignoredImportCount: graph.ignoredImports.length,
      externalImportCount: graph.externalImports.length,
    },
    modules: graph.modules,
    edges: graph.edges,
    hubs: graph.hubs,
    cycles: graph.cycles,
    ignoredImports: graph.ignoredImports,
    unresolvedImports: graph.unresolvedImports,
    externalImports: graph.externalImports,
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
): TypeScriptImportGraphSetup {
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

function selectScope(input: {
  projectRoot: string;
  parsed: TypeScriptParsedCommandLine;
  include: string[] | undefined;
  ignore: string[] | undefined;
}): ScopeSelection {
  const include =
    input.include && input.include.length > 0
      ? input.include.map(normalizePattern)
      : [...defaultIncludePatterns];
  const ignore = input.ignore?.map(normalizePattern) ?? [];
  const allFiles = input.parsed.fileNames
    .map((filePath) => relativeProjectPath(input.projectRoot, filePath))
    .filter((filePath) => isProjectRelative(filePath))
    .sort();
  const includedFiles = allFiles.filter((filePath) => matchesAny(filePath, include));
  const ignoredPatternByFile = new Map<string, string>();
  const analyzedFiles: string[] = [];
  const ignoredFiles: string[] = [];

  for (const filePath of includedFiles) {
    const ignorePattern = matchingPattern(filePath, ignore);
    if (ignorePattern) {
      ignoredFiles.push(filePath);
      ignoredPatternByFile.set(filePath, ignorePattern);
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
    ignoredPatternByFile,
  };
}

function buildImportGraph(input: {
  inventory: TypeScriptProjectSetupInventory;
  context: ParsedProjectContext;
  scope: ScopeSelection;
}): {
  modules: TypeScriptImportGraphModule[];
  edges: TypeScriptImportGraphEdge[];
  hubs: TypeScriptImportGraphHub[];
  cycles: TypeScriptImportGraphCycle[];
  ignoredImports: TypeScriptImportGraphIgnoredImport[];
  unresolvedImports: TypeScriptImportGraphUnresolvedImport[];
  externalImports: TypeScriptImportGraphExternalImport[];
} {
  const analyzedSet = new Set(input.scope.analyzedFiles);
  const ignoredSet = new Set(input.scope.ignoredFiles);
  const edges: TypeScriptImportGraphEdge[] = [];
  const ignoredImports: TypeScriptImportGraphIgnoredImport[] = [];
  const unresolvedImports: TypeScriptImportGraphUnresolvedImport[] = [];
  const externalImports: TypeScriptImportGraphExternalImport[] = [];
  const moduleResolutionCache =
    input.context.typescript.createModuleResolutionCache(
      input.inventory.projectRoot,
      createCanonicalFileName(input.context.typescript),
      input.context.parsed.options,
    );

  for (const filePath of input.scope.analyzedFiles) {
    const absolutePath = path.resolve(input.inventory.projectRoot, filePath);
    const sourceFile = input.context.program.getSourceFile(absolutePath);
    if (!sourceFile) {
      continue;
    }

    for (const reference of importReferences({
      typescript: input.context.typescript,
      sourceFile,
      projectRoot: input.inventory.projectRoot,
    })) {
      const resolved = resolveImportReference({
        context: input.context,
        reference,
        moduleResolutionCache,
      });
      if (!resolved) {
        unresolvedImports.push({
          from: reference.from,
          specifier: reference.specifier,
          kind: reference.kind,
          reason: "unresolved",
        });
        continue;
      }

      const resolvedPath = relativeProjectPath(
        input.inventory.projectRoot,
        resolved.resolvedFileName,
      );
      if (!isProjectRelative(resolvedPath)) {
        externalImports.push({
          from: reference.from,
          specifier: reference.specifier,
          kind: reference.kind,
        });
        continue;
      }
      if (ignoredSet.has(resolvedPath)) {
        ignoredImports.push({
          from: reference.from,
          specifier: reference.specifier,
          resolvedPath,
          matchedIgnorePattern:
            input.scope.ignoredPatternByFile.get(resolvedPath) ?? "",
        });
        continue;
      }
      if (!analyzedSet.has(resolvedPath)) {
        unresolvedImports.push({
          from: reference.from,
          specifier: reference.specifier,
          kind: reference.kind,
          reason: "outside_scope",
        });
        continue;
      }

      edges.push({
        from: reference.from,
        to: resolvedPath,
        specifier: reference.specifier,
        kind: reference.kind,
        typeOnly: reference.typeOnly,
      });
    }
  }

  const sortedEdges = sortEdges(edges);
  const modules = graphModules(input.scope.analyzedFiles, sortedEdges);
  return {
    modules,
    edges: sortedEdges,
    hubs: graphHubs(modules),
    cycles: graphCycles(input.scope.analyzedFiles, sortedEdges),
    ignoredImports: sortIgnoredImports(ignoredImports),
    unresolvedImports: sortUnresolvedImports(unresolvedImports),
    externalImports: sortExternalImports(externalImports),
  };
}

function importReferences(input: {
  typescript: TypeScriptModule;
  sourceFile: TypeScriptSourceFile;
  projectRoot: string;
}): ImportReference[] {
  const references: ImportReference[] = [];
  const from = relativeProjectPath(input.projectRoot, input.sourceFile.fileName);

  const visit = (node: import("typescript").Node): void => {
    if (
      input.typescript.isImportDeclaration(node) &&
      input.typescript.isStringLiteral(node.moduleSpecifier)
    ) {
      references.push({
        from,
        fromAbsolutePath: input.sourceFile.fileName,
        specifier: node.moduleSpecifier.text,
        kind: "import",
        typeOnly: node.importClause?.isTypeOnly ?? false,
      });
    } else if (
      input.typescript.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      input.typescript.isStringLiteral(node.moduleSpecifier)
    ) {
      references.push({
        from,
        fromAbsolutePath: input.sourceFile.fileName,
        specifier: node.moduleSpecifier.text,
        kind: "export",
        typeOnly: node.isTypeOnly,
      });
    } else if (
      input.typescript.isCallExpression(node) &&
      node.expression.kind === input.typescript.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      input.typescript.isStringLiteral(node.arguments[0])
    ) {
      references.push({
        from,
        fromAbsolutePath: input.sourceFile.fileName,
        specifier: node.arguments[0].text,
        kind: "dynamic-import",
        typeOnly: false,
      });
    }

    input.typescript.forEachChild(node, visit);
  };

  visit(input.sourceFile);
  return references.sort((left, right) => {
    const bySpecifier = left.specifier.localeCompare(right.specifier);
    if (bySpecifier !== 0) {
      return bySpecifier;
    }
    return left.kind.localeCompare(right.kind);
  });
}

function resolveImportReference(input: {
  context: ParsedProjectContext;
  reference: ImportReference;
  moduleResolutionCache: import("typescript").ModuleResolutionCache;
}): import("typescript").ResolvedModuleFull | null {
  return (
    input.context.typescript.resolveModuleName(
      input.reference.specifier,
      input.reference.fromAbsolutePath,
      input.context.parsed.options,
      input.context.typescript.sys,
      input.moduleResolutionCache,
    ).resolvedModule ?? null
  );
}

function graphModules(
  filePaths: string[],
  edges: TypeScriptImportGraphEdge[],
): TypeScriptImportGraphModule[] {
  const importsByFile = new Map<string, Set<string>>();
  const importedByFile = new Map<string, Set<string>>();
  for (const filePath of filePaths) {
    importsByFile.set(filePath, new Set());
    importedByFile.set(filePath, new Set());
  }
  for (const edge of edges) {
    importsByFile.get(edge.from)?.add(edge.to);
    importedByFile.get(edge.to)?.add(edge.from);
  }

  return filePaths.map((filePath) => ({
    filePath,
    imports: sortedStrings(importsByFile.get(filePath) ?? new Set()),
    importedBy: sortedStrings(importedByFile.get(filePath) ?? new Set()),
  }));
}

function graphHubs(
  modules: TypeScriptImportGraphModule[],
): TypeScriptImportGraphHub[] {
  return modules
    .map((module) => ({
      ...module,
      incomingCount: module.importedBy.length,
      outgoingCount: module.imports.length,
      degree: module.importedBy.length + module.imports.length,
    }))
    .sort((left, right) => {
      if (left.degree !== right.degree) {
        return right.degree - left.degree;
      }
      return left.filePath.localeCompare(right.filePath);
    });
}

function graphCycles(
  filePaths: string[],
  edges: TypeScriptImportGraphEdge[],
): TypeScriptImportGraphCycle[] {
  const adjacency = new Map<string, string[]>();
  for (const filePath of filePaths) {
    adjacency.set(filePath, []);
  }
  for (const edge of edges) {
    adjacency.get(edge.from)?.push(edge.to);
  }
  for (const [filePath, targets] of adjacency.entries()) {
    adjacency.set(filePath, sortedStrings(new Set(targets)));
  }

  const cycles = new Map<string, string[]>();
  for (const start of filePaths) {
    collectCycles({
      start,
      current: start,
      adjacency,
      path: [],
      visited: new Set(),
      cycles,
    });
  }

  return [...cycles.values()]
    .sort((left, right) => left.join("\0").localeCompare(right.join("\0")))
    .map((modules) => ({
      modules,
      edgeCount: modules.length - 1,
    }));
}

function collectCycles(input: {
  start: string;
  current: string;
  adjacency: Map<string, string[]>;
  path: string[];
  visited: Set<string>;
  cycles: Map<string, string[]>;
}): void {
  input.path.push(input.current);
  input.visited.add(input.current);

  for (const next of input.adjacency.get(input.current) ?? []) {
    if (next === input.start && input.path.length > 1) {
      const cycle = normalizeCycle([...input.path, input.start]);
      input.cycles.set(cycle.join("\0"), cycle);
    } else if (!input.visited.has(next)) {
      collectCycles({
        ...input,
        current: next,
      });
    }
  }

  input.visited.delete(input.current);
  input.path.pop();
}

function normalizeCycle(cycle: string[]): string[] {
  const core = cycle.slice(0, -1);
  let smallestIndex = 0;
  for (let index = 1; index < core.length; index += 1) {
    if (core[index]!.localeCompare(core[smallestIndex]!) < 0) {
      smallestIndex = index;
    }
  }
  const normalized = [
    ...core.slice(smallestIndex),
    ...core.slice(0, smallestIndex),
  ];
  return [...normalized, normalized[0]!];
}

function sortEdges(edges: TypeScriptImportGraphEdge[]): TypeScriptImportGraphEdge[] {
  return [...edges].sort((left, right) => {
    const byFrom = left.from.localeCompare(right.from);
    if (byFrom !== 0) {
      return byFrom;
    }
    const byTo = left.to.localeCompare(right.to);
    if (byTo !== 0) {
      return byTo;
    }
    const bySpecifier = left.specifier.localeCompare(right.specifier);
    if (bySpecifier !== 0) {
      return bySpecifier;
    }
    return left.kind.localeCompare(right.kind);
  });
}

function sortIgnoredImports(
  ignoredImports: TypeScriptImportGraphIgnoredImport[],
): TypeScriptImportGraphIgnoredImport[] {
  return [...ignoredImports].sort((left, right) => {
    const byFrom = left.from.localeCompare(right.from);
    if (byFrom !== 0) {
      return byFrom;
    }
    return left.specifier.localeCompare(right.specifier);
  });
}

function sortUnresolvedImports(
  unresolvedImports: TypeScriptImportGraphUnresolvedImport[],
): TypeScriptImportGraphUnresolvedImport[] {
  return [...unresolvedImports].sort((left, right) => {
    const byFrom = left.from.localeCompare(right.from);
    if (byFrom !== 0) {
      return byFrom;
    }
    return left.specifier.localeCompare(right.specifier);
  });
}

function sortExternalImports(
  externalImports: TypeScriptImportGraphExternalImport[],
): TypeScriptImportGraphExternalImport[] {
  return [...externalImports].sort((left, right) => {
    const byFrom = left.from.localeCompare(right.from);
    if (byFrom !== 0) {
      return byFrom;
    }
    return left.specifier.localeCompare(right.specifier);
  });
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

function matchingPattern(filePath: string, patterns: string[]): string | null {
  return (
    patterns.find((pattern) => globPatternToRegExp(pattern).test(filePath)) ?? null
  );
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

function sortedStrings(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function createCanonicalFileName(
  typescript: TypeScriptModule,
): (fileName: string) => string {
  return typescript.sys.useCaseSensitiveFileNames
    ? (fileName) => fileName
    : (fileName) => fileName.toLowerCase();
}

function blockedImportGraph(
  inventory: TypeScriptProjectSetupInventory,
  blockers: TypeScriptSetupFinding[],
  input: TypeScriptImportGraphInput,
): TypeScriptImportGraphAnalysis {
  const include =
    input.include && input.include.length > 0
      ? input.include.map(normalizePattern)
      : [...defaultIncludePatterns];
  const ignore = input.ignore?.map(normalizePattern) ?? [];

  return {
    operation: "typescript.importGraph",
    readOnly: true,
    status: "blocked",
    projectRoot: inventory.projectRoot,
    setup: traceSetup(inventory, blockers),
    compiler: null,
    didAnalyze: false,
    scope: {
      include,
      ignore,
      totalFileCount: 0,
      analyzedFileCount: 0,
      ignoredFileCount: 0,
      ignoredFiles: [],
    },
    summary: {
      moduleCount: 0,
      edgeCount: 0,
      cycleCount: 0,
      unresolvedImportCount: 0,
      ignoredImportCount: 0,
      externalImportCount: 0,
    },
    modules: [],
    edges: [],
    hubs: [],
    cycles: [],
    ignoredImports: [],
    unresolvedImports: [],
    externalImports: [],
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
