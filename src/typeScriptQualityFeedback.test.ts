import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  compareTypeScriptQualitySnapshots,
  createTypeScriptQualityAnalyzer,
  readTypeScriptQualitySnapshot,
  typeScriptQualityFeedbackToolDescriptors,
  typeScriptQualityDeltaCoordinationPayload,
  typeScriptQualityRulePlaybooks,
  type TypeScriptQualitySnapshot,
} from "./index.js";

const tempDirs: string[] = [];

function makeTempProject(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `dev-nexus-ts-quality-${name}-`));
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

function emptySnapshot(projectRoot: string): TypeScriptQualitySnapshot {
  return {
    operation: "typescript.qualitySnapshot",
    readOnly: true,
    status: "ok",
    projectRoot,
    setup: {
      blockerCount: 0,
      blockers: [],
    },
    inputs: {
      diagnostics: true,
      importGraph: true,
      sonarIssues: false,
      sonarQualityGate: false,
      sonarSecurityHotspots: false,
    },
    summary: {
      findingCount: 0,
      fileCount: 0,
      ruleCount: 0,
      criticalOrBlockerCount: 0,
      bugCount: 0,
      vulnerabilityCount: 0,
      securityHotspotCount: 0,
      importCycleCount: 0,
      qualityGateFailed: false,
    },
    findings: [],
    findingsByFile: [],
    findingsByRule: [],
    findingsBySeverity: [],
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("TypeScript quality feedback", () => {
  it("exposes read-only quality tools and rule playbooks", () => {
    expect(typeScriptQualityFeedbackToolDescriptors).toEqual([
      {
        name: "typescript.qualitySnapshot",
        description:
          "Read TypeScript diagnostics, import cycles, and Sonar JSON into one quality snapshot.",
        readOnly: true,
      },
      {
        name: "typescript.qualityDelta",
        description:
          "Compare two TypeScript quality snapshots and highlight touched-file regressions.",
        readOnly: true,
      },
    ]);

    const analyzer = createTypeScriptQualityAnalyzer();

    expect(Object.keys(analyzer).sort()).toEqual([
      "qualityDelta",
      "qualitySnapshot",
      "tools",
    ]);
    expect(typeScriptQualityRulePlaybooks.map((playbook) => playbook.rule)).toEqual([
      "typescript:S3776",
      "typescript:S5852",
      "typescript:S4036",
    ]);
  });

  it("combines diagnostics, import cycles, and Sonar JSON into grouped findings", () => {
    const projectRoot = makeTempProject("snapshot");
    writeTypeScriptProject(projectRoot, {
      "src/a.ts": [
        "import { b } from './b';",
        "export function a(): string { return b(); }",
        "",
      ].join("\n"),
      "src/b.ts": [
        "import { a } from './a';",
        "export function b(): string { return a(); }",
        "",
      ].join("\n"),
      "src/c.ts": "export const broken: string = 42;\n",
    });

    const snapshot = readTypeScriptQualitySnapshot({
      projectRoot,
      sonar: {
        issues: {
          issues: [
            {
              key: "issue-1",
              rule: "typescript:S3776",
              severity: "CRITICAL",
              type: "CODE_SMELL",
              component: "project:src/a.ts",
              project: "project",
              line: 2,
              message: "Reduce cognitive complexity.",
              status: "OPEN",
            },
          ],
        },
        securityHotspots: {
          hotspots: [
            {
              key: "hotspot-1",
              ruleKey: "typescript:S4036",
              component: "project:src/b.ts",
              project: "project",
              line: 1,
              message: "Review PATH usage.",
              vulnerabilityProbability: "HIGH",
              status: "TO_REVIEW",
            },
          ],
        },
        qualityGate: {
          projectStatus: {
            status: "ERROR",
            conditions: [
              {
                status: "ERROR",
                metricKey: "new_critical_violations",
                actualValue: "1",
                comparator: "GT",
                errorThreshold: "0",
              },
            ],
          },
        },
      },
    });

    expect(snapshot).toMatchObject({
      operation: "typescript.qualitySnapshot",
      readOnly: true,
      status: "findings",
      inputs: {
        diagnostics: true,
        importGraph: true,
        sonarIssues: true,
        sonarQualityGate: true,
        sonarSecurityHotspots: true,
      },
      summary: {
        findingCount: 5,
        criticalOrBlockerCount: 3,
        securityHotspotCount: 1,
        importCycleCount: 1,
        qualityGateFailed: true,
      },
    });
    expect(snapshot.findingsByFile.map((group) => group.filePath)).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
    ]);
    expect(snapshot.findingsByRule.map((group) => group.rule)).toEqual([
      "import-cycle",
      "new_critical_violations",
      "TS2322",
      "typescript:S3776",
      "typescript:S4036",
    ]);
  });

  it("reports touched-file quality deltas and attention findings", () => {
    const projectRoot = makeTempProject("delta");
    writeTypeScriptProject(projectRoot, {
      "src/index.ts": "export const value: string = 42;\n",
    });
    const after = readTypeScriptQualitySnapshot({
      projectRoot,
      sonar: {
        issues: {
          issues: [
            {
              key: "issue-1",
              rule: "typescript:S3776",
              severity: "CRITICAL",
              type: "CODE_SMELL",
              component: "project:src/index.ts",
              project: "project",
              line: 1,
              message: "Reduce cognitive complexity.",
            },
          ],
        },
      },
    });

    const delta = compareTypeScriptQualitySnapshots({
      before: emptySnapshot(projectRoot),
      after,
      touchedFiles: ["src/index.ts"],
    });

    expect(delta).toMatchObject({
      operation: "typescript.qualityDelta",
      producer: "typescript.qualityDelta",
      readOnly: true,
      status: "regressed",
      summary: {
        newFindingCount: 2,
        touchedNewFindingCount: 2,
        newCriticalOrBlockerCount: 1,
      },
    });
    expect(delta.attention.map((finding) => finding.rule)).toEqual([
      "typescript:S3776",
    ]);
  });

  it("compacts TypeScript quality deltas for generic coordination handoffs", () => {
    const projectRoot = makeTempProject("coordination-delta");
    const after = {
      ...emptySnapshot(projectRoot),
      status: "findings",
      summary: {
        ...emptySnapshot(projectRoot).summary,
        findingCount: 2,
        criticalOrBlockerCount: 2,
      },
      findings: [
        {
          id: "sonar-issue:complexity",
          source: "sonar_issue",
          category: "code_smell",
          severity: "critical",
          filePath: "src/index.ts",
          line: 12,
          rule: "typescript:S3776",
          message: "Reduce cognitive complexity.",
        },
        {
          id: "sonar-issue:path",
          source: "sonar_issue",
          category: "vulnerability",
          severity: "blocker",
          filePath: "src/runner.ts",
          line: 3,
          rule: "typescript:S4036",
          message: "Review PATH trust.",
        },
      ],
    } satisfies TypeScriptQualitySnapshot;

    const delta = compareTypeScriptQualitySnapshots({
      before: emptySnapshot(projectRoot),
      after,
      touchedFiles: ["./src/index.ts", "src/runner.ts"],
    });
    const payload = typeScriptQualityDeltaCoordinationPayload(delta, {
      sourcePath: "./quality/delta.json",
      attentionLimit: 1,
    });

    expect(payload).toEqual({
      producer: "typescript.qualityDelta",
      sourcePath: "quality/delta.json",
      status: "regressed",
      touchedFiles: ["src/index.ts", "src/runner.ts"],
      summary: delta.summary,
      attention: [
        {
          source: "sonar_issue",
          category: "code_smell",
          severity: "critical",
          rule: "typescript:S3776",
          filePath: "src/index.ts",
          line: 12,
          message: "Reduce cognitive complexity.",
        },
      ],
    });
  });
});
