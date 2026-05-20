import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createTypeScriptBulkRewritePlanner,
  planTypeScriptBulkRewrite,
  typeScriptBulkRewritePlanningToolDescriptors,
} from "./index.js";

const tempDirs: string[] = [];

function makeTempProject(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `dev-nexus-ts-rewrite-${name}-`));
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
  options: { linkNodeModules?: boolean } = { linkNodeModules: true },
): void {
  writeJson(path.join(projectRoot, "package.json"), {
    scripts: {
      check: "tsc --noEmit",
      test: "vitest run",
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
  if (options.linkNodeModules !== false) {
    fs.symlinkSync(path.resolve("node_modules"), path.join(projectRoot, "node_modules"));
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("TypeScript bulk rewrite planning", () => {
  it("exposes a read-only bulk rewrite planning operation", () => {
    expect(typeScriptBulkRewritePlanningToolDescriptors).toEqual([
      {
        name: "typescript.bulkRewritePlan",
        description:
          "Preview TypeScript bulk rewrite plans without writing source files.",
        readOnly: true,
      },
    ]);

    const planner = createTypeScriptBulkRewritePlanner();

    expect(Object.keys(planner).sort()).toEqual(["plan", "tools"]);
    expect(planner.tools).toBe(typeScriptBulkRewritePlanningToolDescriptors);
  });

  it("previews an identifier rename plan without writing files", () => {
    const projectRoot = makeTempProject("identifier-rename");
    const sourcePath = path.join(projectRoot, "src", "index.ts");
    writeTypeScriptProject(projectRoot, {
      "src/index.ts": [
        "const oldName = 1;",
        "export function readValue() {",
        "  return oldName;",
        "}",
        "",
      ].join("\n"),
      "src/other.ts": "export const untouched = true;\n",
    });
    const before = fs.readFileSync(sourcePath, "utf8");

    const plan = planTypeScriptBulkRewrite({
      projectRoot,
      include: ["src/**/*.ts"],
      rewrite: {
        kind: "renameIdentifier",
        from: "oldName",
        to: "newName",
        description: "Rename repeated local identifier before a larger refactor.",
      },
      verificationCommands: ["npm run check"],
    });

    expect(plan).toMatchObject({
      operation: "typescript.bulkRewritePlan",
      readOnly: true,
      status: "planned",
      didAnalyze: true,
      policy: {
        applyAllowed: false,
        approvalRequiredForApply: true,
        policySource: "DevNexus-TypeScript#10",
      },
      backend: {
        id: "typescript-compiler-api",
        available: true,
        typescriptVersion: expect.any(String),
      },
      scope: {
        include: ["src/**/*.ts"],
        ignore: [],
        analyzedFileCount: 2,
        ignoredFileCount: 0,
      },
      summary: {
        matchedFileCount: 1,
        matchCount: 2,
        proposedEditCount: 2,
        rewriteCategoryCount: 1,
        riskCount: 2,
      },
      rewriteCategories: [
        {
          id: "identifier_rename",
          label: "Identifier rename",
          matchCount: 2,
        },
      ],
      verificationCommands: ["npm run check"],
    });
    expect(plan.files).toEqual([
      {
        filePath: "src/index.ts",
        matchCount: 2,
        proposedEditCount: 2,
        matches: [
          expect.objectContaining({
            nodeKind: "Identifier",
            line: 1,
            character: 7,
            currentText: "oldName",
            proposedText: "newName",
            preview: {
              before: "const oldName = 1;",
              after: "const newName = 1;",
            },
          }),
          expect.objectContaining({
            nodeKind: "Identifier",
            line: 3,
            character: 10,
            currentText: "oldName",
            proposedText: "newName",
            preview: {
              before: "  return oldName;",
              after: "  return newName;",
            },
          }),
        ],
      },
    ]);
    expect(plan.risks.map((risk) => risk.id)).toEqual([
      "semantic_review_required",
      "no_apply_path",
    ]);
    expect(fs.readFileSync(sourcePath, "utf8")).toBe(before);
  });

  it("reports a missing TypeScript backend as a setup blocker", () => {
    const projectRoot = makeTempProject("missing-backend");
    writeTypeScriptProject(
      projectRoot,
      {
        "src/index.ts": "const oldName = 1;\n",
      },
      { linkNodeModules: false },
    );

    const plan = planTypeScriptBulkRewrite({
      projectRoot,
      rewrite: {
        kind: "renameIdentifier",
        from: "oldName",
        to: "newName",
      },
    });

    expect(plan).toMatchObject({
      operation: "typescript.bulkRewritePlan",
      readOnly: true,
      status: "blocked",
      didAnalyze: false,
      backend: {
        id: "typescript-compiler-api",
        available: false,
        blockerIds: ["node_modules_missing", "typescript_binary_missing"],
      },
      summary: {
        matchedFileCount: 0,
        matchCount: 0,
        proposedEditCount: 0,
      },
      files: [],
      rewriteCategories: [],
    });
  });
});
