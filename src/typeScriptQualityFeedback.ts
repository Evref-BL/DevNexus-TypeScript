import fs from "node:fs";
import path from "node:path";
import { analyzeTypeScriptImportGraph } from "./typeScriptImportGraphAnalysis.js";
import {
  traceTypeScriptDiagnostics,
  type TypeScriptMcpTraceInput,
} from "./typeScriptMcpDiagnosticsTracer.js";
import type { TypeScriptImportGraphInput } from "./typeScriptImportGraphAnalysis.js";
import type { TypeScriptSetupFinding } from "./typeScriptProjectSetupInventory.js";

export const typeScriptQualityFeedbackToolDescriptors = [
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
] as const;

export interface TypeScriptQualitySnapshotInput extends TypeScriptMcpTraceInput {
  include?: string[];
  ignore?: string[];
  sonarIssuesPath?: string;
  sonarQualityGatePath?: string;
  sonarSecurityHotspotsPath?: string;
  sonar?: {
    issues?: unknown;
    qualityGate?: unknown;
    securityHotspots?: unknown;
  };
}

export interface TypeScriptQualityAnalyzer {
  tools: typeof typeScriptQualityFeedbackToolDescriptors;
  qualitySnapshot: typeof readTypeScriptQualitySnapshot;
  qualityDelta: typeof compareTypeScriptQualitySnapshots;
}

export type TypeScriptQualityFindingSource =
  | "import_graph"
  | "sonar_issue"
  | "sonar_quality_gate"
  | "sonar_security_hotspot"
  | "typescript";

export type TypeScriptQualityFindingCategory =
  | "bug"
  | "code_smell"
  | "diagnostic"
  | "import_cycle"
  | "quality_gate"
  | "security_hotspot"
  | "unknown"
  | "vulnerability";

export type TypeScriptQualityFindingSeverity =
  | "blocker"
  | "critical"
  | "error"
  | "info"
  | "major"
  | "message"
  | "minor"
  | "suggestion"
  | "unknown"
  | "warning";

export interface TypeScriptQualityFinding {
  id: string;
  source: TypeScriptQualityFindingSource;
  category: TypeScriptQualityFindingCategory;
  severity: TypeScriptQualityFindingSeverity;
  filePath: string | null;
  line: number | null;
  rule: string | null;
  message: string;
  status?: string;
  effort?: string;
  relatedFiles?: string[];
}

export interface TypeScriptQualityFindingFileGroup {
  filePath: string;
  findings: TypeScriptQualityFinding[];
}

export interface TypeScriptQualityFindingRuleGroup {
  rule: string;
  count: number;
  findings: TypeScriptQualityFinding[];
}

export interface TypeScriptQualityFindingSeverityGroup {
  severity: TypeScriptQualityFindingSeverity;
  count: number;
}

export interface TypeScriptQualitySnapshot {
  operation: "typescript.qualitySnapshot";
  readOnly: true;
  status: "blocked" | "findings" | "ok";
  projectRoot: string;
  setup: {
    blockerCount: number;
    blockers: TypeScriptSetupFinding[];
  };
  inputs: {
    diagnostics: boolean;
    importGraph: boolean;
    sonarIssues: boolean;
    sonarQualityGate: boolean;
    sonarSecurityHotspots: boolean;
  };
  summary: {
    findingCount: number;
    fileCount: number;
    ruleCount: number;
    criticalOrBlockerCount: number;
    bugCount: number;
    vulnerabilityCount: number;
    securityHotspotCount: number;
    importCycleCount: number;
    qualityGateFailed: boolean;
  };
  findings: TypeScriptQualityFinding[];
  findingsByFile: TypeScriptQualityFindingFileGroup[];
  findingsByRule: TypeScriptQualityFindingRuleGroup[];
  findingsBySeverity: TypeScriptQualityFindingSeverityGroup[];
}

export interface TypeScriptQualityDeltaInput {
  before: TypeScriptQualitySnapshot;
  after: TypeScriptQualitySnapshot;
  touchedFiles?: string[];
}

export interface TypeScriptQualityDelta {
  operation: "typescript.qualityDelta";
  readOnly: true;
  status: "regressed" | "improved" | "unchanged";
  touchedFiles: string[];
  summary: {
    newFindingCount: number;
    resolvedFindingCount: number;
    touchedNewFindingCount: number;
    touchedResolvedFindingCount: number;
    newCriticalOrBlockerCount: number;
    newBugCount: number;
    newVulnerabilityCount: number;
    newSecurityHotspotCount: number;
    qualityGateRegressed: boolean;
  };
  newFindings: TypeScriptQualityFinding[];
  resolvedFindings: TypeScriptQualityFinding[];
  touchedNewFindings: TypeScriptQualityFinding[];
  touchedResolvedFindings: TypeScriptQualityFinding[];
  attention: TypeScriptQualityFinding[];
}

export interface TypeScriptQualityRulePlaybook {
  rule: string;
  title: string;
  preferredFixes: string[];
  deferWhen: string[];
  references: string[];
}

interface SonarIssueLike {
  key?: unknown;
  rule?: unknown;
  severity?: unknown;
  type?: unknown;
  component?: unknown;
  project?: unknown;
  line?: unknown;
  message?: unknown;
  status?: unknown;
  issueStatus?: unknown;
  effort?: unknown;
  impacts?: unknown;
}

interface SonarHotspotLike {
  key?: unknown;
  ruleKey?: unknown;
  component?: unknown;
  project?: unknown;
  line?: unknown;
  message?: unknown;
  status?: unknown;
  vulnerabilityProbability?: unknown;
  securityCategory?: unknown;
}

interface SonarQualityGateConditionLike {
  status?: unknown;
  metricKey?: unknown;
  actualValue?: unknown;
  comparator?: unknown;
  errorThreshold?: unknown;
}

const highSeverities = new Set<TypeScriptQualityFindingSeverity>([
  "blocker",
  "critical",
]);

export const typeScriptQualityRulePlaybooks: TypeScriptQualityRulePlaybook[] = [
  {
    rule: "typescript:S3776",
    title: "Cognitive complexity",
    preferredFixes: [
      "Extract cohesive helpers around named decisions or output construction.",
      "Flatten deeply nested branches with early returns or guard clauses.",
      "Move repeated condition matrices into data-driven policy tables when that matches the domain.",
      "Keep tests around the original behavior before splitting complex functions.",
    ],
    deferWhen: [
      "The function is generated, adapter glue, or safer to split only after a broader boundary change.",
      "The change would only hide branches behind single-use helpers with less readable names.",
    ],
    references: [
      "https://www.sonarsource.com/resources/cognitive-complexity/",
      "https://www.sonarsource.com/blog/5-clean-code-tips-for-reducing-cognitive-complexity/",
    ],
  },
  {
    rule: "typescript:S5852",
    title: "Regex backtracking risk",
    preferredFixes: [
      "Remove nested or overlapping quantifiers where input can be attacker-controlled.",
      "Constrain repetition with explicit character classes, anchors, and length bounds.",
      "Replace the regex with a parser or linear scan when the accepted language is not simple.",
      "Add focused worst-case tests for long non-matching inputs.",
    ],
    deferWhen: [
      "The regex is only used on trusted, tightly bounded input and the bound is enforced nearby.",
      "The replacement needs a domain parser that should be designed separately.",
    ],
    references: [
      "https://www.sonarsource.com/blog/crafting-regexes-to-avoid-stack-overflows/",
      "https://community.sonarsource.com/t/write-efficient-error-free-and-safe-regular-expressions-in-javascript-and-typescript/47720",
    ],
  },
  {
    rule: "typescript:S4036",
    title: "PATH trust boundary",
    preferredFixes: [
      "Resolve executable paths from trusted configuration or an allowlist instead of ambient PATH.",
      "When PATH must be used, sanitize it before process launch and document the trust boundary.",
      "Keep shell execution behind one helper so callers cannot bypass the policy.",
      "Test that untrusted PATH entries are rejected or ignored.",
    ],
    deferWhen: [
      "The command is deliberately interactive developer tooling and the trust model is documented.",
      "A proper fix depends on a broader credential, runner, or host-policy boundary.",
    ],
    references: [
      "https://community.sonarsource.com/t/false-positive-for-rule-typescript-s4036/142908",
    ],
  },
];

export function createTypeScriptQualityAnalyzer(): TypeScriptQualityAnalyzer {
  return {
    tools: typeScriptQualityFeedbackToolDescriptors,
    qualitySnapshot: readTypeScriptQualitySnapshot,
    qualityDelta: compareTypeScriptQualitySnapshots,
  };
}

export function readTypeScriptQualitySnapshot(
  input: TypeScriptQualitySnapshotInput,
): TypeScriptQualitySnapshot {
  const diagnostics = traceTypeScriptDiagnostics(input);
  const importGraph = analyzeTypeScriptImportGraph(importGraphInput(input));
  const blockers = [
    ...diagnostics.setup.blockers,
    ...importGraph.setup.blockers,
  ];
  const findings = [
    ...diagnosticFindings(diagnostics.diagnostics),
    ...importCycleFindings(importGraph.cycles),
    ...sonarIssueFindings(input),
    ...sonarHotspotFindings(input),
    ...sonarQualityGateFindings(input),
  ].sort(compareFindings);

  return qualitySnapshot({
    input,
    blockers: uniqueBlockers(blockers),
    findings,
    diagnosticsAvailable: diagnostics.didRunCompiler,
    importGraphAvailable: importGraph.didAnalyze,
  });
}

export function compareTypeScriptQualitySnapshots(
  input: TypeScriptQualityDeltaInput,
): TypeScriptQualityDelta {
  const touchedFiles = normalizeTouchedFiles(input.touchedFiles);
  const before = findingMap(input.before.findings);
  const after = findingMap(input.after.findings);
  const newFindings = [...after.entries()]
    .filter(([key]) => !before.has(key))
    .map(([, finding]) => finding)
    .sort(compareFindings);
  const resolvedFindings = [...before.entries()]
    .filter(([key]) => !after.has(key))
    .map(([, finding]) => finding)
    .sort(compareFindings);
  const touchedNewFindings = filterTouchedFindings(newFindings, touchedFiles);
  const touchedResolvedFindings = filterTouchedFindings(resolvedFindings, touchedFiles);
  const attention = newFindings.filter((finding) => isAttentionFinding(finding));
  const qualityGateRegressed =
    !input.before.summary.qualityGateFailed && input.after.summary.qualityGateFailed;

  return {
    operation: "typescript.qualityDelta",
    readOnly: true,
    status: deltaStatus(newFindings, resolvedFindings, qualityGateRegressed),
    touchedFiles,
    summary: {
      newFindingCount: newFindings.length,
      resolvedFindingCount: resolvedFindings.length,
      touchedNewFindingCount: touchedNewFindings.length,
      touchedResolvedFindingCount: touchedResolvedFindings.length,
      newCriticalOrBlockerCount: newFindings.filter(isCriticalOrBlocker).length,
      newBugCount: newFindings.filter((finding) => finding.category === "bug").length,
      newVulnerabilityCount: newFindings.filter(
        (finding) => finding.category === "vulnerability",
      ).length,
      newSecurityHotspotCount: newFindings.filter(
        (finding) => finding.category === "security_hotspot",
      ).length,
      qualityGateRegressed,
    },
    newFindings,
    resolvedFindings,
    touchedNewFindings,
    touchedResolvedFindings,
    attention,
  };
}

function importGraphInput(
  input: TypeScriptQualitySnapshotInput,
): TypeScriptImportGraphInput {
  return {
    projectRoot: input.projectRoot,
    tsconfigPath: input.tsconfigPath,
    include: input.include,
    ignore: input.ignore,
  };
}

function qualitySnapshot(input: {
  input: TypeScriptQualitySnapshotInput;
  blockers: TypeScriptSetupFinding[];
  findings: TypeScriptQualityFinding[];
  diagnosticsAvailable: boolean;
  importGraphAvailable: boolean;
}): TypeScriptQualitySnapshot {
  const summary = qualitySummary(input.findings);

  return {
    operation: "typescript.qualitySnapshot",
    readOnly: true,
    status: snapshotStatus(input.blockers, input.findings),
    projectRoot: input.input.projectRoot,
    setup: {
      blockerCount: input.blockers.length,
      blockers: input.blockers,
    },
    inputs: {
      diagnostics: input.diagnosticsAvailable,
      importGraph: input.importGraphAvailable,
      sonarIssues: sonarDataAvailable(input.input, "issues", "sonarIssuesPath"),
      sonarQualityGate: sonarDataAvailable(
        input.input,
        "qualityGate",
        "sonarQualityGatePath",
      ),
      sonarSecurityHotspots: sonarDataAvailable(
        input.input,
        "securityHotspots",
        "sonarSecurityHotspotsPath",
      ),
    },
    summary,
    findings: input.findings,
    findingsByFile: findingsByFile(input.findings),
    findingsByRule: findingsByRule(input.findings),
    findingsBySeverity: findingsBySeverity(input.findings),
  };
}

function diagnosticFindings(
  diagnostics: ReturnType<typeof traceTypeScriptDiagnostics>["diagnostics"],
): TypeScriptQualityFinding[] {
  return diagnostics.map((diagnostic) => ({
    id: `typescript:${diagnostic.code}:${diagnostic.filePath ?? "project"}:${diagnostic.line ?? 0}:${diagnostic.character ?? 0}`,
    source: "typescript",
    category: "diagnostic",
    severity: diagnostic.category,
    filePath: diagnostic.filePath,
    line: diagnostic.line,
    rule: `TS${diagnostic.code}`,
    message: diagnostic.message,
  }));
}

function importCycleFindings(
  cycles: ReturnType<typeof analyzeTypeScriptImportGraph>["cycles"],
): TypeScriptQualityFinding[] {
  return cycles.map((cycle, index) => ({
    id: `import-cycle:${index + 1}:${cycle.modules.join(">")}`,
    source: "import_graph",
    category: "import_cycle",
    severity: "major",
    filePath: cycle.modules[0] ?? null,
    line: null,
    rule: "import-cycle",
    message: `Import cycle: ${cycle.modules.join(" -> ")}`,
    relatedFiles: cycle.modules,
  }));
}

function sonarIssueFindings(
  input: TypeScriptQualitySnapshotInput,
): TypeScriptQualityFinding[] {
  const data = readSonarInput(input, "issues", "sonarIssuesPath");
  const issues = arrayProperty<SonarIssueLike>(data, "issues");

  return issues.map((issue, index) => {
    const rule = stringValue(issue.rule);
    const filePath = sonarComponentPath(input.projectRoot, issue.component, issue.project);
    const line = numberValue(issue.line);

    return {
      id: `sonar-issue:${stringValue(issue.key) ?? `${rule ?? "unknown"}:${filePath ?? "project"}:${line ?? index}`}`,
      source: "sonar_issue",
      category: sonarIssueCategory(issue),
      severity: sonarIssueSeverity(issue),
      filePath,
      line,
      rule,
      message: stringValue(issue.message) ?? "Sonar issue",
      status: stringValue(issue.issueStatus) ?? stringValue(issue.status) ?? undefined,
      effort: stringValue(issue.effort) ?? undefined,
    };
  });
}

function sonarHotspotFindings(
  input: TypeScriptQualitySnapshotInput,
): TypeScriptQualityFinding[] {
  const data = readSonarInput(input, "securityHotspots", "sonarSecurityHotspotsPath");
  const hotspots = arrayProperty<SonarHotspotLike>(data, "hotspots");

  return hotspots.map((hotspot, index) => {
    const filePath = sonarComponentPath(
      input.projectRoot,
      hotspot.component,
      hotspot.project,
    );
    const line = numberValue(hotspot.line);
    const rule = stringValue(hotspot.ruleKey);

    return {
      id: `sonar-hotspot:${stringValue(hotspot.key) ?? `${rule ?? "unknown"}:${filePath ?? "project"}:${line ?? index}`}`,
      source: "sonar_security_hotspot",
      category: "security_hotspot",
      severity: hotspotSeverity(hotspot.vulnerabilityProbability),
      filePath,
      line,
      rule,
      message: stringValue(hotspot.message) ?? "Sonar security hotspot",
      status: stringValue(hotspot.status) ?? undefined,
    };
  });
}

function sonarQualityGateFindings(
  input: TypeScriptQualitySnapshotInput,
): TypeScriptQualityFinding[] {
  const data = readSonarInput(input, "qualityGate", "sonarQualityGatePath");
  const projectStatus = objectProperty(data, "projectStatus");
  const gateStatus = stringValue(projectStatus?.status);
  const conditions = arrayProperty<SonarQualityGateConditionLike>(
    projectStatus,
    "conditions",
  );

  return conditions
    .filter((condition) => stringValue(condition.status) === "ERROR")
    .map((condition, index) => ({
      id: `sonar-quality-gate:${stringValue(condition.metricKey) ?? index}`,
      source: "sonar_quality_gate",
      category: "quality_gate",
      severity: gateStatus === "ERROR" ? "critical" : "major",
      filePath: null,
      line: null,
      rule: stringValue(condition.metricKey),
      message: qualityGateMessage(condition),
      status: stringValue(condition.status) ?? undefined,
    }));
}

function readSonarInput(
  input: TypeScriptQualitySnapshotInput,
  dataKey: keyof NonNullable<TypeScriptQualitySnapshotInput["sonar"]>,
  pathKey:
    | "sonarIssuesPath"
    | "sonarQualityGatePath"
    | "sonarSecurityHotspotsPath",
): unknown {
  const inline = input.sonar?.[dataKey];
  if (inline !== undefined) {
    return inline;
  }

  const filePath = input[pathKey];
  if (!filePath) {
    return null;
  }

  return JSON.parse(fs.readFileSync(path.resolve(input.projectRoot, filePath), "utf8"));
}

function sonarDataAvailable(
  input: TypeScriptQualitySnapshotInput,
  dataKey: keyof NonNullable<TypeScriptQualitySnapshotInput["sonar"]>,
  pathKey:
    | "sonarIssuesPath"
    | "sonarQualityGatePath"
    | "sonarSecurityHotspotsPath",
): boolean {
  return input.sonar?.[dataKey] !== undefined || Boolean(input[pathKey]);
}

function sonarIssueSeverity(
  issue: SonarIssueLike,
): TypeScriptQualityFindingSeverity {
  const impactSeverity = sonarImpactSeverity(issue.impacts);
  if (impactSeverity) {
    return impactSeverity;
  }

  return normalizeSeverity(stringValue(issue.severity));
}

function sonarIssueCategory(issue: SonarIssueLike): TypeScriptQualityFindingCategory {
  const type = stringValue(issue.type)?.toUpperCase();
  if (type === "BUG") {
    return "bug";
  }
  if (type === "VULNERABILITY") {
    return "vulnerability";
  }
  if (type === "SECURITY_HOTSPOT") {
    return "security_hotspot";
  }
  if (type === "CODE_SMELL") {
    return "code_smell";
  }

  return "unknown";
}

function sonarImpactSeverity(
  impacts: unknown,
): TypeScriptQualityFindingSeverity | null {
  if (!Array.isArray(impacts)) {
    return null;
  }

  const severities = impacts
    .map((impact) =>
      impact && typeof impact === "object"
        ? normalizeSeverity(stringValue((impact as Record<string, unknown>).severity))
        : "unknown",
    )
    .filter((severity) => severity !== "unknown");

  return severities.sort(compareSeverity).at(0) ?? null;
}

function hotspotSeverity(value: unknown): TypeScriptQualityFindingSeverity {
  switch (stringValue(value)?.toUpperCase()) {
    case "HIGH":
      return "critical";
    case "MEDIUM":
      return "major";
    case "LOW":
      return "minor";
    default:
      return "unknown";
  }
}

function normalizeSeverity(
  value: string | null | undefined,
): TypeScriptQualityFindingSeverity {
  switch (value?.toUpperCase()) {
    case "BLOCKER":
      return "blocker";
    case "CRITICAL":
    case "HIGH":
      return "critical";
    case "ERROR":
      return "error";
    case "MAJOR":
    case "MEDIUM":
      return "major";
    case "MINOR":
    case "LOW":
      return "minor";
    case "INFO":
      return "info";
    case "WARNING":
      return "warning";
    case "MESSAGE":
      return "message";
    case "SUGGESTION":
      return "suggestion";
    default:
      return "unknown";
  }
}

function sonarComponentPath(
  projectRoot: string,
  component: unknown,
  project: unknown,
): string | null {
  const componentValue = stringValue(component);
  if (!componentValue) {
    return null;
  }

  const projectPrefix = stringValue(project);
  const withoutProject =
    projectPrefix && componentValue.startsWith(`${projectPrefix}:`)
      ? componentValue.slice(projectPrefix.length + 1)
      : componentValue.includes(":")
        ? componentValue.slice(componentValue.indexOf(":") + 1)
        : componentValue;
  const relative = path.isAbsolute(withoutProject)
    ? path.relative(projectRoot, withoutProject)
    : withoutProject;

  return normalizePath(relative);
}

function qualityGateMessage(condition: SonarQualityGateConditionLike): string {
  const metric = stringValue(condition.metricKey) ?? "quality gate metric";
  const actual = stringValue(condition.actualValue) ?? "unknown";
  const comparator = stringValue(condition.comparator) ?? "failed";
  const threshold = stringValue(condition.errorThreshold) ?? "threshold";

  return `Quality gate failed for ${metric}: ${actual} ${comparator} ${threshold}`;
}

function qualitySummary(findings: TypeScriptQualityFinding[]): TypeScriptQualitySnapshot["summary"] {
  const filePaths = new Set(
    findings
      .map((finding) => finding.filePath)
      .filter((filePath): filePath is string => filePath !== null),
  );
  const rules = new Set(
    findings
      .map((finding) => finding.rule)
      .filter((rule): rule is string => rule !== null),
  );

  return {
    findingCount: findings.length,
    fileCount: filePaths.size,
    ruleCount: rules.size,
    criticalOrBlockerCount: findings.filter(isCriticalOrBlocker).length,
    bugCount: findings.filter((finding) => finding.category === "bug").length,
    vulnerabilityCount: findings.filter(
      (finding) => finding.category === "vulnerability",
    ).length,
    securityHotspotCount: findings.filter(
      (finding) => finding.category === "security_hotspot",
    ).length,
    importCycleCount: findings.filter(
      (finding) => finding.category === "import_cycle",
    ).length,
    qualityGateFailed: findings.some(
      (finding) => finding.source === "sonar_quality_gate",
    ),
  };
}

function findingsByFile(
  findings: TypeScriptQualityFinding[],
): TypeScriptQualityFindingFileGroup[] {
  const grouped = new Map<string, TypeScriptQualityFinding[]>();
  for (const finding of findings) {
    if (!finding.filePath) {
      continue;
    }
    const group = grouped.get(finding.filePath) ?? [];
    group.push(finding);
    grouped.set(finding.filePath, group);
  }

  return [...grouped.entries()]
    .map(([filePath, groupFindings]) => ({
      filePath,
      findings: groupFindings.sort(compareFindings),
    }))
    .sort((left, right) => left.filePath.localeCompare(right.filePath));
}

function findingsByRule(
  findings: TypeScriptQualityFinding[],
): TypeScriptQualityFindingRuleGroup[] {
  const grouped = new Map<string, TypeScriptQualityFinding[]>();
  for (const finding of findings) {
    const rule = finding.rule ?? "unruled";
    const group = grouped.get(rule) ?? [];
    group.push(finding);
    grouped.set(rule, group);
  }

  return [...grouped.entries()]
    .map(([rule, groupFindings]) => ({
      rule,
      count: groupFindings.length,
      findings: groupFindings.sort(compareFindings),
    }))
    .sort((left, right) => left.rule.localeCompare(right.rule));
}

function findingsBySeverity(
  findings: TypeScriptQualityFinding[],
): TypeScriptQualityFindingSeverityGroup[] {
  const grouped = new Map<TypeScriptQualityFindingSeverity, number>();
  for (const finding of findings) {
    grouped.set(finding.severity, (grouped.get(finding.severity) ?? 0) + 1);
  }

  return [...grouped.entries()]
    .map(([severity, count]) => ({ severity, count }))
    .sort((left, right) => compareSeverity(left.severity, right.severity));
}

function findingMap(
  findings: TypeScriptQualityFinding[],
): Map<string, TypeScriptQualityFinding> {
  return new Map(findings.map((finding) => [findingSignature(finding), finding]));
}

function findingSignature(finding: TypeScriptQualityFinding): string {
  return [
    finding.source,
    finding.category,
    finding.severity,
    finding.rule ?? "",
    finding.filePath ?? "",
    finding.line ?? "",
    finding.message,
  ].join("|");
}

function filterTouchedFindings(
  findings: TypeScriptQualityFinding[],
  touchedFiles: string[],
): TypeScriptQualityFinding[] {
  if (touchedFiles.length === 0) {
    return [];
  }

  const touched = new Set(touchedFiles);
  return findings.filter((finding) =>
    finding.filePath ? touched.has(finding.filePath) : false,
  );
}

function normalizeTouchedFiles(files: string[] | undefined): string[] {
  if (!files) {
    return [];
  }

  return [...new Set(files.map(normalizePath))].sort();
}

function snapshotStatus(
  blockers: TypeScriptSetupFinding[],
  findings: TypeScriptQualityFinding[],
): TypeScriptQualitySnapshot["status"] {
  if (blockers.length > 0 && findings.length === 0) {
    return "blocked";
  }

  return findings.length > 0 ? "findings" : "ok";
}

function deltaStatus(
  newFindings: TypeScriptQualityFinding[],
  resolvedFindings: TypeScriptQualityFinding[],
  qualityGateRegressed: boolean,
): TypeScriptQualityDelta["status"] {
  if (newFindings.length > 0 || qualityGateRegressed) {
    return "regressed";
  }
  if (resolvedFindings.length > 0) {
    return "improved";
  }
  return "unchanged";
}

function isAttentionFinding(finding: TypeScriptQualityFinding): boolean {
  return (
    isCriticalOrBlocker(finding) ||
    finding.category === "bug" ||
    finding.category === "vulnerability" ||
    finding.category === "security_hotspot"
  );
}

function isCriticalOrBlocker(finding: TypeScriptQualityFinding): boolean {
  return highSeverities.has(finding.severity);
}

function uniqueBlockers(
  blockers: TypeScriptSetupFinding[],
): TypeScriptSetupFinding[] {
  return [...new Map(blockers.map((blocker) => [blocker.id, blocker])).values()];
}

function arrayProperty<T>(value: unknown, property: string): T[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const propertyValue = (value as Record<string, unknown>)[property];
  if (Array.isArray(propertyValue)) {
    return propertyValue as T[];
  }

  return [];
}

function objectProperty(
  value: unknown,
  property: string,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const propertyValue = (value as Record<string, unknown>)[property];
  if (!propertyValue || typeof propertyValue !== "object" || Array.isArray(propertyValue)) {
    return null;
  }

  return propertyValue as Record<string, unknown>;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizePath(filePath: string): string {
  return path.normalize(filePath).split(path.sep).join("/");
}

function compareFindings(
  left: TypeScriptQualityFinding,
  right: TypeScriptQualityFinding,
): number {
  return (
    compareNullableString(left.filePath, right.filePath) ||
    compareNullableNumber(left.line, right.line) ||
    compareSeverity(left.severity, right.severity) ||
    compareNullableString(left.rule, right.rule) ||
    left.source.localeCompare(right.source) ||
    left.message.localeCompare(right.message)
  );
}

function compareSeverity(
  left: TypeScriptQualityFindingSeverity,
  right: TypeScriptQualityFindingSeverity,
): number {
  return severityRank(left) - severityRank(right);
}

function severityRank(severity: TypeScriptQualityFindingSeverity): number {
  switch (severity) {
    case "blocker":
      return 0;
    case "critical":
      return 1;
    case "error":
      return 2;
    case "major":
      return 3;
    case "warning":
      return 4;
    case "minor":
      return 5;
    case "info":
      return 6;
    case "suggestion":
      return 7;
    case "message":
      return 8;
    case "unknown":
      return 9;
  }
}

function compareNullableString(
  left: string | null,
  right: string | null,
): number {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return left.localeCompare(right);
}

function compareNullableNumber(
  left: number | null,
  right: number | null,
): number {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return left - right;
}
