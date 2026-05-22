import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  analyzeTypeScriptImportGraph,
  createTypeScriptImportGraphAnalyzer,
  typeScriptImportGraphToolDescriptors,
} from "./index.js";

const tempDirs: string[] = [];

function makeTempProject(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `dev-nexus-ts-graph-${name}-`));
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

function writeTypeScriptProject(
  projectRoot: string,
  files: Record<string, string>,
): void {
  writeJson(path.join(projectRoot, "package.json"), {
    scripts: {
      check: "tsc --noEmit",
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

  for (const [filePath, sourceText] of Object.entries(files)) {
    writeText(path.join(projectRoot, filePath), sourceText);
  }
  fs.symlinkSync(path.resolve("node_modules"), path.join(projectRoot, "node_modules"));
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("TypeScript import graph analysis", () => {
  it("exposes a read-only import graph operation", () => {
    expect(typeScriptImportGraphToolDescriptors).toEqual([
      {
        name: "typescript.importGraph",
        description:
          "Read TypeScript module import edges, hubs, cycles, and ignored source facts.",
        readOnly: true,
      },
    ]);

    const analyzer = createTypeScriptImportGraphAnalyzer();

    expect(Object.keys(analyzer).sort()).toEqual(["importGraph", "tools"]);
    expect(analyzer.tools).toBe(typeScriptImportGraphToolDescriptors);
  });

  it("reports import and export edges for an acyclic bounded source scope", () => {
    const projectRoot = makeTempProject("acyclic");
    writeTypeScriptProject(projectRoot, {
      "src/index.ts": [
        "import { buildValue } from './feature';",
        "export { helper } from './helper';",
        "export const value = buildValue();",
        "",
      ].join("\n"),
      "src/feature.ts": [
        "import { helper } from './helper';",
        "export const buildValue = () => helper();",
        "",
      ].join("\n"),
      "src/helper.ts": "export const helper = () => 'ok';\n",
    });

    const graph = analyzeTypeScriptImportGraph({
      projectRoot,
      include: ["src/**/*.ts"],
    });

    expect(graph).toMatchObject({
      operation: "typescript.importGraph",
      readOnly: true,
      status: "ok",
      didAnalyze: true,
      scope: {
        include: ["src/**/*.ts"],
        ignore: [],
        analyzedFileCount: 3,
        ignoredFileCount: 0,
      },
      summary: {
        moduleCount: 3,
        edgeCount: 3,
        cycleCount: 0,
        unresolvedImportCount: 0,
        ignoredImportCount: 0,
      },
    });
    expect(graph.edges).toEqual([
      {
        from: "src/feature.ts",
        to: "src/helper.ts",
        specifier: "./helper",
        kind: "import",
        typeOnly: false,
      },
      {
        from: "src/index.ts",
        to: "src/feature.ts",
        specifier: "./feature",
        kind: "import",
        typeOnly: false,
      },
      {
        from: "src/index.ts",
        to: "src/helper.ts",
        specifier: "./helper",
        kind: "export",
        typeOnly: false,
      },
    ]);
    expect(graph.cycles).toEqual([]);
    expect(graph.hubs).toContainEqual({
      filePath: "src/helper.ts",
      incomingCount: 2,
      outgoingCount: 0,
      degree: 2,
      imports: [],
      importedBy: ["src/feature.ts", "src/index.ts"],
    });
  });

  it("reports deterministic cycles", () => {
    const projectRoot = makeTempProject("cyclic");
    writeTypeScriptProject(projectRoot, {
      "src/a.ts": "import { b } from './b';\nexport const a = b;\n",
      "src/b.ts": "import { c } from './c';\nexport const b = c;\n",
      "src/c.ts": "import { a } from './a';\nexport const c = a;\n",
    });

    const graph = analyzeTypeScriptImportGraph({ projectRoot });

    expect(graph.status).toBe("cycles");
    expect(graph.summary.cycleCount).toBe(1);
    expect(graph.cycles).toEqual([
      {
        modules: ["src/a.ts", "src/b.ts", "src/c.ts", "src/a.ts"],
        edgeCount: 3,
      },
    ]);
  });

  it("omits ignored generated folders from edges and hubs", () => {
    const projectRoot = makeTempProject("ignored");
    writeTypeScriptProject(projectRoot, {
      "src/index.ts": [
        "import { generated } from './generated/auto';",
        "import { real } from './real';",
        "export const value = `${generated}:${real}`;",
        "",
      ].join("\n"),
      "src/real.ts": "export const real = 'real';\n",
      "src/generated/auto.ts": "export const generated = 'generated';\n",
    });

    const graph = analyzeTypeScriptImportGraph({
      projectRoot,
      ignore: ["src/generated/**"],
    });

    expect(graph.status).toBe("ok");
    expect(graph.scope).toMatchObject({
      include: ["src/**/*.ts", "src/**/*.tsx", "src/**/*.mts", "src/**/*.cts"],
      ignore: ["src/generated/**"],
      analyzedFileCount: 2,
      ignoredFileCount: 1,
      ignoredFiles: ["src/generated/auto.ts"],
    });
    expect(graph.edges).toEqual([
      {
        from: "src/index.ts",
        to: "src/real.ts",
        specifier: "./real",
        kind: "import",
        typeOnly: false,
      },
    ]);
    expect(graph.summary.ignoredImportCount).toBe(1);
    expect(graph.ignoredImports).toEqual([
      {
        from: "src/index.ts",
        specifier: "./generated/auto",
        resolvedPath: "src/generated/auto.ts",
        matchedIgnorePattern: "src/generated/**",
      },
    ]);
    expect(graph.hubs.map((hub) => hub.filePath)).toEqual(["src/index.ts", "src/real.ts"]);
  });

  it("classifies Node built-ins as external imports", () => {
    const projectRoot = makeTempProject("node-builtins");
    writeTypeScriptProject(projectRoot, {
      "src/index.ts": [
        "import fs from 'node:fs';",
        "import path from 'path';",
        "export { readFile } from 'node:fs/promises';",
        "export const modules = [fs, path];",
        "",
      ].join("\n"),
    });

    const graph = analyzeTypeScriptImportGraph({
      projectRoot,
      include: ["src/**/*.ts"],
    });

    expect(graph.status).toBe("ok");
    expect(graph.summary).toMatchObject({
      moduleCount: 1,
      edgeCount: 0,
      unresolvedImportCount: 0,
      externalImportCount: 3,
    });
    expect(graph.unresolvedImports).toEqual([]);
    expect(graph.externalImports).toEqual([
      {
        from: "src/index.ts",
        specifier: "node:fs",
        kind: "import",
      },
      {
        from: "src/index.ts",
        specifier: "node:fs/promises",
        kind: "export",
      },
      {
        from: "src/index.ts",
        specifier: "path",
        kind: "import",
      },
    ]);
  });
});
