import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  inspectTypeScriptProjectSetup,
  typeScriptProjectSetupWorkerFragmentCapabilities,
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

describe("typeScriptProjectSetupWorkerFragmentCapabilities", () => {
  it("turns healthy setup inventory into component-scoped worker guidance", () => {
    const projectRoot = makeTempProject("guidance-healthy");
    writePackage(projectRoot, {
      scripts: {
        build: "tsc -b",
        check: "npm run typecheck && npm test",
        test: "vitest run",
        typecheck: "tsc --noEmit",
      },
      devDependencies: {
        typescript: "^5.9.0",
        vitest: "^4.0.0",
      },
    });
    writeText(path.join(projectRoot, "package-lock.json"), "{}\n");
    writeJson(path.join(projectRoot, "tsconfig.json"), {
      references: [{ path: "./packages/core" }],
    });
    writeInstalledPackage(projectRoot, "typescript", "5.9.1");
    writeInstalledPackage(projectRoot, "vitest", "4.1.0");
    writeBin(projectRoot, "tsc");
    writeBin(projectRoot, "vitest");

    const inventory = inspectTypeScriptProjectSetup({ projectRoot });
    const fragments = typeScriptProjectSetupWorkerFragmentCapabilities({
      inventory,
      targetComponents: ["typescript"],
    });

    expect(fragments.map((fragment) => fragment.id)).toEqual([
      "context-typescript-setup-inventory",
      "briefing-typescript-setup-inventory",
    ]);
    expect(fragments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "worker_context_fragment",
          targetAgents: ["codex", "claude"],
          targetComponents: ["typescript"],
        }),
        expect.objectContaining({
          kind: "worker_briefing_fragment",
          targetAgents: ["codex", "claude"],
          targetComponents: ["typescript"],
        }),
      ]),
    );

    const contextBody = fragments[0]!.body;
    const briefingBody = fragments[1]!.body;

    expect(contextBody).toContain("does not choose or supervise implementation work");
    expect(contextBody).toContain("Package manager: npm");
    expect(contextBody).toContain("Dependency projection: local node_modules present");
    expect(contextBody).toContain("Available scripts: build, check, test, typecheck");
    expect(contextBody).toContain(
      "Recommended verification: npm run check, npm run typecheck, npm run test",
    );
    expect(contextBody).toContain("TypeScript: declared ^5.9.0; installed 5.9.1");
    expect(contextBody).toContain("Project references: 1");
    expect(contextBody).toContain("Setup blockers: none");

    expect(briefingBody).toContain("Use focused verification: npm run check");
    expect(briefingBody).toContain("Available package scripts: build, check, test, typecheck");
    expect(briefingBody).toContain("Setup blockers: none");
  });

  it("surfaces blocked setup inventory without repairing dependencies", () => {
    const projectRoot = makeTempProject("guidance-blocked");
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
    const fragments = typeScriptProjectSetupWorkerFragmentCapabilities({
      inventory,
    });
    const bodies = fragments.map((fragment) => fragment.body).join("\n");

    expect(bodies).toContain("Package manager: unknown");
    expect(bodies).toContain("Dependency projection: node_modules missing");
    expect(bodies).toContain("Setup blockers:");
    expect(bodies).toContain(
      "node_modules_missing - node_modules is missing; use configured dependency projection or report a setup blocker.",
    );
    expect(bodies).toContain(
      "typescript_binary_missing - The TypeScript compiler binary was not found in node_modules/.bin.",
    );
    expect(bodies).toContain("Missing binaries: eslint, tsc, vitest");
    expect(bodies).toContain("Available package scripts: build");
    expect(bodies).toContain("Use focused verification: package-manager run build");
    expect(bodies).toContain(
      "Do not run package-manager installs or npx package fetches as an automatic repair.",
    );
  });
});
