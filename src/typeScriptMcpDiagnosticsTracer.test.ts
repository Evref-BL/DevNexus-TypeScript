import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createTypeScriptMcpDiagnosticsTracer,
  traceTypeScriptDiagnostics,
  traceTypeScriptProjectStatus,
  typeScriptMcpDiagnosticsTracerToolDescriptors,
} from "./index.js";

const tempDirs: string[] = [];

function makeTempProject(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `dev-nexus-ts-${name}-`));
  tempDirs.push(dir);
  return dir;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function writePackage(projectRoot: string, value: unknown): void {
  writeJson(path.join(projectRoot, "package.json"), value);
}

function linkWorkspaceNodeModules(projectRoot: string): void {
  fs.symlinkSync(path.resolve("node_modules"), path.join(projectRoot, "node_modules"));
}

function writeTypeScriptProject(projectRoot: string, sourceText: string): void {
  writePackage(projectRoot, {
    scripts: {
      check: "tsc --noEmit",
      typecheck: "tsc --noEmit",
    },
    devDependencies: {
      typescript: "^5.9.0",
    },
  });
  writeText(path.join(projectRoot, "package-lock.json"), "{}\n");
  writeJson(path.join(projectRoot, "tsconfig.json"), {
    compilerOptions: {
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: "ES2022",
      types: [],
    },
    include: ["src/**/*.ts"],
  });
  writeText(path.join(projectRoot, "src", "index.ts"), sourceText);
}

function readProjectFiles(projectRoot: string): string[] {
  return fs
    .readdirSync(projectRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() || entry.isSymbolicLink())
    .map((entry) => path.relative(projectRoot, path.join(entry.parentPath, entry.name)))
    .sort();
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("TypeScript MCP diagnostics tracer", () => {
  it("exposes read-only project status and diagnostics operations", () => {
    expect(typeScriptMcpDiagnosticsTracerToolDescriptors).toEqual([
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
    ]);

    const tracer = createTypeScriptMcpDiagnosticsTracer();

    expect(Object.keys(tracer).sort()).toEqual([
      "diagnostics",
      "projectStatus",
      "tools",
    ]);
    expect(tracer.tools).toBe(typeScriptMcpDiagnosticsTracerToolDescriptors);
  });

  it("reports healthy project status and empty compiler diagnostics", () => {
    const projectRoot = makeTempProject("healthy-tracer");
    writeTypeScriptProject(projectRoot, "export const value: string = 'ok';\n");
    linkWorkspaceNodeModules(projectRoot);

    const beforeFiles = readProjectFiles(projectRoot);
    const status = traceTypeScriptProjectStatus({ projectRoot });
    const diagnostics = traceTypeScriptDiagnostics({ projectRoot });

    expect(status).toMatchObject({
      operation: "typescript.projectStatus",
      readOnly: true,
      status: "ok",
      project: {
        tsconfigPath: "tsconfig.json",
        typescriptVersion: expect.any(String),
      },
      setup: {
        blockerCount: 0,
        blockers: [],
      },
      operations: {
        diagnostics: {
          available: true,
          blockerIds: [],
        },
      },
    });
    expect(status.inventory.scripts.available).toEqual(["check", "typecheck"]);

    expect(diagnostics).toMatchObject({
      operation: "typescript.diagnostics",
      readOnly: true,
      status: "ok",
      didRunCompiler: true,
      summary: {
        diagnosticCount: 0,
        errorCount: 0,
        warningCount: 0,
      },
      diagnostics: [],
      diagnosticsByFile: [],
      diagnosticsByCode: [],
    });
    expect(readProjectFiles(projectRoot)).toEqual(beforeFiles);
  });

  it("groups TypeScript compiler diagnostics by file and code", () => {
    const projectRoot = makeTempProject("compiler-error-tracer");
    writeTypeScriptProject(projectRoot, "const value: string = 1;\nexport { value };\n");
    linkWorkspaceNodeModules(projectRoot);

    const diagnostics = traceTypeScriptDiagnostics({ projectRoot });

    expect(diagnostics.status).toBe("diagnostics");
    expect(diagnostics.didRunCompiler).toBe(true);
    expect(diagnostics.summary.diagnosticCount).toBeGreaterThanOrEqual(1);
    expect(diagnostics.summary.errorCount).toBeGreaterThanOrEqual(1);
    expect(diagnostics.diagnosticsByFile).toEqual([
      expect.objectContaining({
        filePath: "src/index.ts",
        diagnostics: [
          expect.objectContaining({
            code: 2322,
            category: "error",
            message: expect.stringContaining(
              "Type 'number' is not assignable to type 'string'",
            ),
            line: 1,
          }),
        ],
      }),
    ]);
    expect(diagnostics.diagnosticsByCode).toEqual(
      expect.arrayContaining([
        {
          code: 2322,
          category: "error",
          count: 1,
        },
      ]),
    );
  });

  it("reports missing dependency projection and unavailable binaries as blockers", () => {
    const projectRoot = makeTempProject("blocked-tracer");
    writeTypeScriptProject(projectRoot, "export const value: string = 'ok';\n");

    const status = traceTypeScriptProjectStatus({ projectRoot });
    const diagnostics = traceTypeScriptDiagnostics({ projectRoot });

    expect(status.status).toBe("blocked");
    expect(status.setup.blockers.map((blocker) => blocker.id)).toEqual([
      "node_modules_missing",
      "typescript_binary_missing",
    ]);
    expect(status.operations.diagnostics).toEqual({
      available: false,
      blockerIds: ["node_modules_missing", "typescript_binary_missing"],
    });
    expect(diagnostics).toMatchObject({
      operation: "typescript.diagnostics",
      readOnly: true,
      status: "blocked",
      didRunCompiler: false,
      summary: {
        diagnosticCount: 0,
        errorCount: 0,
        warningCount: 0,
      },
      diagnostics: [],
      diagnosticsByFile: [],
      diagnosticsByCode: [],
    });
    expect(diagnostics.setup.blockers.map((blocker) => blocker.id)).toEqual([
      "node_modules_missing",
      "typescript_binary_missing",
    ]);
  });
});
