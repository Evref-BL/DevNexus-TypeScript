import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectTypeScriptProjectSetup } from "./typeScriptProjectSetupInventory.js";

const tempDirs: string[] = [];

function makeTempProject(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `dev-nexus-ts-${name}-`));
  tempDirs.push(dir);
  return dir;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(`${filePath}`, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function writePackage(projectRoot: string, value: unknown): void {
  writeJson(path.join(projectRoot, "package.json"), value);
}

function writeInstalledPackage(
  projectRoot: string,
  packageName: string,
  version = "1.0.0",
): void {
  writeJson(path.join(projectRoot, "node_modules", packageName, "package.json"), {
    name: packageName,
    version,
  });
}

function writeBin(projectRoot: string, name: string): void {
  const binPath = path.join(projectRoot, "node_modules", ".bin", name);
  writeText(binPath, "#!/usr/bin/env node\n");
  fs.chmodSync(binPath, 0o755);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("inspectTypeScriptProjectSetup", () => {
  it("reports package manager, scripts, TypeScript config, dependencies, and optional tools", () => {
    const projectRoot = makeTempProject("healthy");
    writePackage(projectRoot, {
      scripts: {
        check: "npm run build && npm test",
        build: "tsc -b",
        test: "vitest run",
        lint: "eslint .",
        typecheck: "tsc --noEmit",
      },
      devDependencies: {
        "@ast-grep/napi": "^0.36.0",
        "@typescript-eslint/eslint-plugin": "^8.0.0",
        "@typescript-eslint/parser": "^8.0.0",
        eslint: "^9.0.0",
        knip: "^5.0.0",
        typescript: "^5.9.0",
        vitest: "^4.0.0",
      },
    });
    writeText(path.join(projectRoot, "package-lock.json"), "{}\n");
    writeJson(path.join(projectRoot, "tsconfig.json"), {
      compilerOptions: {
        composite: true,
      },
      references: [{ path: "./src" }],
    });
    writeText(
      path.join(projectRoot, "eslint.config.mjs"),
      "export default [{ languageOptions: { parserOptions: { projectService: true } } }];\n",
    );
    writeText(path.join(projectRoot, "sgconfig.yml"), "ruleDirs: [rules]\n");
    writeText(path.join(projectRoot, "knip.json"), "{}\n");

    writeInstalledPackage(projectRoot, "typescript", "5.9.1");
    writeInstalledPackage(projectRoot, "vitest", "4.1.0");
    writeInstalledPackage(projectRoot, "@typescript-eslint/eslint-plugin", "8.50.0");
    writeInstalledPackage(projectRoot, "@ast-grep/napi", "0.36.2");
    writeInstalledPackage(projectRoot, "knip", "5.70.0");
    writeBin(projectRoot, "tsc");
    writeBin(projectRoot, "vitest");
    writeBin(projectRoot, "eslint");

    const inventory = inspectTypeScriptProjectSetup({ projectRoot });

    expect(inventory.packageManager).toMatchObject({
      detected: "npm",
      lockfiles: ["package-lock.json"],
      packageJsonExists: true,
    });
    expect(inventory.scripts.available).toEqual([
      "build",
      "check",
      "lint",
      "test",
      "typecheck",
    ]);
    expect(inventory.scripts.expected).toMatchObject({
      build: true,
      check: true,
      lint: true,
      test: true,
      typecheck: true,
    });
    expect(inventory.dependencies.nodeModules).toMatchObject({
      exists: true,
      projected: false,
    });
    expect(inventory.dependencies.binaries).toEqual([
      { name: "eslint", available: true },
      { name: "tsc", available: true },
      { name: "vitest", available: true },
    ]);
    expect(inventory.typescript).toMatchObject({
      declaredRange: "^5.9.0",
      installedVersion: "5.9.1",
      tsconfigPaths: ["tsconfig.json"],
      projectReferences: {
        used: true,
        count: 1,
      },
    });
    expect(inventory.tools).toMatchObject({
      testFramework: {
        detected: "vitest",
      },
      typedLinting: {
        detected: true,
      },
      structuralSearch: {
        detected: true,
      },
      unusedCode: {
        detected: true,
      },
    });
    expect(inventory.blockers).toEqual([]);
  });

  it("reports missing dependency projection and unavailable TypeScript binary as blockers", () => {
    const projectRoot = makeTempProject("missing-deps");
    writePackage(projectRoot, {
      scripts: {
        build: "tsc -p tsconfig.json",
      },
      devDependencies: {
        typescript: "^5.9.0",
      },
    });
    writeJson(path.join(projectRoot, "tsconfig.json"), {
      compilerOptions: {
        strict: true,
      },
    });

    const inventory = inspectTypeScriptProjectSetup({ projectRoot });

    expect(inventory.dependencies.nodeModules.exists).toBe(false);
    expect(inventory.typescript).toMatchObject({
      declaredRange: "^5.9.0",
      installedVersion: null,
      tsconfigPaths: ["tsconfig.json"],
      projectReferences: {
        used: false,
        count: 0,
      },
    });
    expect(inventory.blockers.map((blocker) => blocker.id)).toEqual([
      "node_modules_missing",
      "typescript_binary_missing",
    ]);
    expect(inventory.recommendations).toContain(
      "Use the configured dependency projection or report missing dependencies as a setup blocker; do not run package-manager installs unless policy allows it.",
    );
  });

  it("detects pnpm projects with incomplete script and configuration setup", () => {
    const projectRoot = makeTempProject("pnpm");
    writePackage(projectRoot, {
      scripts: {
        test: "vitest run",
      },
      devDependencies: {
        vitest: "^4.0.0",
      },
    });
    writeText(path.join(projectRoot, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");

    const inventory = inspectTypeScriptProjectSetup({ projectRoot });

    expect(inventory.packageManager).toMatchObject({
      detected: "pnpm",
      lockfiles: ["pnpm-lock.yaml"],
    });
    expect(inventory.scripts.expected).toMatchObject({
      build: false,
      check: false,
      lint: false,
      test: true,
      typecheck: false,
    });
    expect(inventory.typescript.tsconfigPaths).toEqual([]);
    expect(inventory.tools.testFramework.detected).toBe("vitest");
    expect(inventory.blockers.map((blocker) => blocker.id)).toContain(
      "tsconfig_missing",
    );
    expect(inventory.recommendations).toContain(
      "Add a check or typecheck script so agents can verify TypeScript changes consistently.",
    );
  });
});
