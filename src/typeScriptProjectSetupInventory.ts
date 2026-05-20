import fs from "node:fs";
import path from "node:path";

export type TypeScriptPackageManager = "bun" | "npm" | "pnpm" | "unknown" | "yarn";

export interface InspectTypeScriptProjectSetupInput {
  projectRoot: string;
}

export interface TypeScriptProjectSetupInventory {
  projectRoot: string;
  packageManager: {
    detected: TypeScriptPackageManager;
    lockfiles: string[];
    packageJsonExists: boolean;
  };
  scripts: {
    available: string[];
    expected: Record<ExpectedScriptName, boolean>;
  };
  dependencies: {
    nodeModules: {
      path: string;
      exists: boolean;
      projected: boolean;
    };
    binaries: TypeScriptBinaryAvailability[];
    packages: Record<string, TypeScriptPackageAvailability>;
  };
  typescript: {
    declaredRange: string | null;
    installedVersion: string | null;
    tsconfigPaths: string[];
    projectReferences: {
      used: boolean;
      count: number;
    };
  };
  tools: {
    testFramework: {
      detected: string | null;
    };
    typedLinting: {
      detected: boolean;
      configFiles: string[];
    };
    structuralSearch: {
      detected: boolean;
      tools: string[];
      configFiles: string[];
    };
    unusedCode: {
      detected: boolean;
      tools: string[];
      configFiles: string[];
    };
  };
  blockers: TypeScriptSetupFinding[];
  recommendations: string[];
}

export interface TypeScriptBinaryAvailability {
  name: string;
  available: boolean;
}

export interface TypeScriptPackageAvailability {
  declaredRange: string | null;
  installedVersion: string | null;
}

export interface TypeScriptSetupFinding {
  id: string;
  message: string;
  severity: "blocker" | "recommendation";
}

type ExpectedScriptName = "build" | "check" | "lint" | "test" | "typecheck";

interface PackageJsonData {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
}

const expectedScripts: ExpectedScriptName[] = [
  "build",
  "check",
  "lint",
  "test",
  "typecheck",
];

const expectedBinaries = ["eslint", "tsc", "vitest"];

const trackedPackages = [
  "typescript",
  "vitest",
  "eslint",
  "@typescript-eslint/eslint-plugin",
  "@typescript-eslint/parser",
  "@ast-grep/napi",
  "ast-grep",
  "@ast-grep/cli",
  "knip",
];

const lockfilePackageManagers = [
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
];

export function inspectTypeScriptProjectSetup(
  input: InspectTypeScriptProjectSetupInput,
): TypeScriptProjectSetupInventory {
  const projectRoot = path.resolve(input.projectRoot);
  const packageJson = readPackageJson(projectRoot);
  const packageJsonExists = fs.existsSync(path.join(projectRoot, "package.json"));
  const lockfiles = existingLockfiles(projectRoot);
  const scripts = packageJson?.scripts ?? {};
  const nodeModulesPath = path.join(projectRoot, "node_modules");
  const nodeModulesExists = fs.existsSync(nodeModulesPath);
  const nodeModulesProjected = isSymlink(nodeModulesPath);
  const packageAvailability = Object.fromEntries(
    trackedPackages.map((packageName) => [
      packageName,
      packageInfo(projectRoot, packageJson, packageName),
    ]),
  );
  const tsconfigPaths = findRootTsconfigPaths(projectRoot);
  const projectReferenceCount = countProjectReferences(projectRoot, tsconfigPaths);
  const scriptAvailability = expectedScriptAvailability(scripts);
  const recommendations = buildRecommendations({
    nodeModulesExists,
    scriptAvailability,
    tsconfigPaths,
  });
  const blockers = buildBlockers({
    packageJsonExists,
    packageJson,
    nodeModulesExists,
    tsconfigPaths,
    tscAvailable: binaryAvailable(projectRoot, "tsc"),
  });

  return {
    projectRoot,
    packageManager: {
      detected: detectPackageManager(lockfiles),
      lockfiles,
      packageJsonExists,
    },
    scripts: {
      available: Object.keys(scripts).sort(),
      expected: scriptAvailability,
    },
    dependencies: {
      nodeModules: {
        path: nodeModulesPath,
        exists: nodeModulesExists,
        projected: nodeModulesProjected,
      },
      binaries: expectedBinaries.map((name) => ({
        name,
        available: binaryAvailable(projectRoot, name),
      })),
      packages: packageAvailability,
    },
    typescript: {
      declaredRange: declaredRange(packageJson, "typescript"),
      installedVersion: packageAvailability.typescript?.installedVersion ?? null,
      tsconfigPaths,
      projectReferences: {
        used: projectReferenceCount > 0,
        count: projectReferenceCount,
      },
    },
    tools: {
      testFramework: {
        detected: detectTestFramework(packageJson),
      },
      typedLinting: detectTypedLinting(projectRoot, packageJson),
      structuralSearch: detectStructuralSearch(projectRoot, packageJson),
      unusedCode: detectUnusedCode(projectRoot, packageJson),
    },
    blockers,
    recommendations,
  };
}

function readPackageJson(projectRoot: string): PackageJsonData | null {
  const raw = readJsonFile(path.join(projectRoot, "package.json"));
  if (!isRecord(raw)) {
    return null;
  }

  return {
    scripts: stringRecord(raw.scripts),
    dependencies: stringRecord(raw.dependencies),
    devDependencies: stringRecord(raw.devDependencies),
    peerDependencies: stringRecord(raw.peerDependencies),
    optionalDependencies: stringRecord(raw.optionalDependencies),
  };
}

function readJsonFile(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function existingLockfiles(projectRoot: string): string[] {
  return lockfilePackageManagers
    .filter((file) => fs.existsSync(path.join(projectRoot, file)))
    .sort();
}

function detectPackageManager(lockfiles: string[]): TypeScriptPackageManager {
  if (lockfiles.includes("pnpm-lock.yaml")) {
    return "pnpm";
  }
  if (lockfiles.includes("yarn.lock")) {
    return "yarn";
  }
  if (lockfiles.includes("bun.lock") || lockfiles.includes("bun.lockb")) {
    return "bun";
  }
  if (lockfiles.includes("package-lock.json")) {
    return "npm";
  }
  return "unknown";
}

function isSymlink(filePath: string): boolean {
  try {
    return fs.lstatSync(filePath).isSymbolicLink();
  } catch {
    return false;
  }
}

function packageInfo(
  projectRoot: string,
  packageJson: PackageJsonData | null,
  packageName: string,
): TypeScriptPackageAvailability {
  return {
    declaredRange: declaredRange(packageJson, packageName),
    installedVersion: installedPackageVersion(projectRoot, packageName),
  };
}

function declaredRange(
  packageJson: PackageJsonData | null,
  packageName: string,
): string | null {
  if (!packageJson) {
    return null;
  }

  return (
    packageJson.dependencies[packageName] ??
    packageJson.devDependencies[packageName] ??
    packageJson.peerDependencies[packageName] ??
    packageJson.optionalDependencies[packageName] ??
    null
  );
}

function installedPackageVersion(projectRoot: string, packageName: string): string | null {
  const packageJson = readJsonFile(
    path.join(projectRoot, "node_modules", packageName, "package.json"),
  );
  if (!isRecord(packageJson) || typeof packageJson.version !== "string") {
    return null;
  }

  return packageJson.version;
}

function binaryAvailable(projectRoot: string, binaryName: string): boolean {
  return fs.existsSync(path.join(projectRoot, "node_modules", ".bin", binaryName));
}

function findRootTsconfigPaths(projectRoot: string): string[] {
  try {
    return fs
      .readdirSync(projectRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => /^tsconfig(?:\..+)?\.json$/u.test(name))
      .sort();
  } catch {
    return [];
  }
}

function countProjectReferences(projectRoot: string, tsconfigPaths: string[]): number {
  let count = 0;
  for (const tsconfigPath of tsconfigPaths) {
    const data = readJsonFile(path.join(projectRoot, tsconfigPath));
    if (!isRecord(data) || !Array.isArray(data.references)) {
      continue;
    }
    count += data.references.length;
  }
  return count;
}

function expectedScriptAvailability(
  scripts: Record<string, string>,
): Record<ExpectedScriptName, boolean> {
  return Object.fromEntries(
    expectedScripts.map((script) => [script, Object.hasOwn(scripts, script)]),
  ) as Record<ExpectedScriptName, boolean>;
}

function detectTestFramework(packageJson: PackageJsonData | null): string | null {
  if (hasPackage(packageJson, "vitest") || scriptIncludes(packageJson, "vitest")) {
    return "vitest";
  }
  if (hasPackage(packageJson, "jest") || scriptIncludes(packageJson, "jest")) {
    return "jest";
  }
  if (hasPackage(packageJson, "mocha") || scriptIncludes(packageJson, "mocha")) {
    return "mocha";
  }
  if (scriptIncludes(packageJson, "node --test")) {
    return "node:test";
  }
  return null;
}

function detectTypedLinting(
  projectRoot: string,
  packageJson: PackageJsonData | null,
): { detected: boolean; configFiles: string[] } {
  const configFiles = existingFiles(projectRoot, [
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
    ".eslintrc",
    ".eslintrc.json",
    ".eslintrc.js",
    ".eslintrc.cjs",
  ]);
  const configText = configFiles
    .map((file) => safeReadText(path.join(projectRoot, file)))
    .join("\n");
  const hasTypedPackage =
    hasPackage(packageJson, "@typescript-eslint/eslint-plugin") ||
    hasPackage(packageJson, "@typescript-eslint/parser");
  const configRequestsTypeInfo =
    configText.includes("projectService") ||
    configText.includes("recommendedTypeChecked") ||
    (configText.includes("parserOptions") && configText.includes("project"));

  return {
    detected: hasTypedPackage && configRequestsTypeInfo,
    configFiles,
  };
}

function detectStructuralSearch(
  projectRoot: string,
  packageJson: PackageJsonData | null,
): { detected: boolean; tools: string[]; configFiles: string[] } {
  const configFiles = existingFiles(projectRoot, [
    "sgconfig.yml",
    "sgconfig.yaml",
    "ast-grep.config.yml",
    "ast-grep.config.yaml",
  ]);
  const tools = [
    hasPackage(packageJson, "@ast-grep/napi") ? "@ast-grep/napi" : null,
    hasPackage(packageJson, "@ast-grep/cli") ? "@ast-grep/cli" : null,
    hasPackage(packageJson, "ast-grep") ? "ast-grep" : null,
  ].filter((tool): tool is string => tool !== null);

  return {
    detected: tools.length > 0 || configFiles.length > 0,
    tools,
    configFiles,
  };
}

function detectUnusedCode(
  projectRoot: string,
  packageJson: PackageJsonData | null,
): { detected: boolean; tools: string[]; configFiles: string[] } {
  const configFiles = existingFiles(projectRoot, [
    "knip.json",
    "knip.ts",
    "knip.js",
    "knip.mjs",
    "knip.cjs",
  ]);
  const tools = hasPackage(packageJson, "knip") || scriptIncludes(packageJson, "knip")
    ? ["knip"]
    : [];

  return {
    detected: tools.length > 0 || configFiles.length > 0,
    tools,
    configFiles,
  };
}

function buildBlockers(input: {
  packageJsonExists: boolean;
  packageJson: PackageJsonData | null;
  nodeModulesExists: boolean;
  tsconfigPaths: string[];
  tscAvailable: boolean;
}): TypeScriptSetupFinding[] {
  const blockers: TypeScriptSetupFinding[] = [];

  if (!input.packageJsonExists) {
    blockers.push({
      id: "package_json_missing",
      severity: "blocker",
      message: "package.json is missing, so TypeScript project setup cannot be inspected.",
    });
  }

  if (hasDeclaredDependencies(input.packageJson) && !input.nodeModulesExists) {
    blockers.push({
      id: "node_modules_missing",
      severity: "blocker",
      message:
        "node_modules is missing; use configured dependency projection or report a setup blocker.",
    });
  }

  if (input.tsconfigPaths.length === 0) {
    blockers.push({
      id: "tsconfig_missing",
      severity: "blocker",
      message: "No root tsconfig*.json file was found.",
    });
  }

  const expectsTypeScriptCompiler =
    declaredRange(input.packageJson, "typescript") !== null ||
    input.tsconfigPaths.length > 0;

  if (expectsTypeScriptCompiler && !input.tscAvailable) {
    blockers.push({
      id: "typescript_binary_missing",
      severity: "blocker",
      message: "The TypeScript compiler binary was not found in node_modules/.bin.",
    });
  }

  return blockers;
}

function buildRecommendations(input: {
  nodeModulesExists: boolean;
  scriptAvailability: Record<ExpectedScriptName, boolean>;
  tsconfigPaths: string[];
}): string[] {
  const recommendations: string[] = [];

  if (!input.nodeModulesExists) {
    recommendations.push(
      "Use the configured dependency projection or report missing dependencies as a setup blocker; do not run package-manager installs unless policy allows it.",
    );
  }

  if (!input.scriptAvailability.check && !input.scriptAvailability.typecheck) {
    recommendations.push(
      "Add a check or typecheck script so agents can verify TypeScript changes consistently.",
    );
  }

  if (input.tsconfigPaths.length === 0) {
    recommendations.push(
      "Add a root tsconfig.json or document why this JavaScript project has no TypeScript configuration.",
    );
  }

  return recommendations;
}

function existingFiles(projectRoot: string, fileNames: string[]): string[] {
  return fileNames.filter((file) => fs.existsSync(path.join(projectRoot, file))).sort();
}

function safeReadText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function hasDeclaredDependencies(packageJson: PackageJsonData | null): boolean {
  if (!packageJson) {
    return false;
  }

  return [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.peerDependencies,
    packageJson.optionalDependencies,
  ].some((section) => Object.keys(section).length > 0);
}

function hasPackage(packageJson: PackageJsonData | null, packageName: string): boolean {
  return declaredRange(packageJson, packageName) !== null;
}

function scriptIncludes(packageJson: PackageJsonData | null, text: string): boolean {
  if (!packageJson) {
    return false;
  }

  return Object.values(packageJson.scripts).some((script) => script.includes(text));
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => {
      return typeof entry[1] === "string";
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
