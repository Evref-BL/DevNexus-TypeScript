import { describe, expect, it } from "vitest";
import {
  devNexusTypeScriptSkillDefinitions,
  devNexusTypeScriptWorkflowSkillIds,
} from "./index.js";

describe("DevNexus TypeScript workflow skills", () => {
  it("exports stable package-owned workflow skill definitions", () => {
    expect(devNexusTypeScriptWorkflowSkillIds).toEqual([
      "typescript-diagnose",
      "typescript-refactor",
      "typescript-project-topology",
      "typescript-quality-feedback",
      "typescript-test-hygiene",
      "typescript-api-boundaries",
      "typescript-codemod-planning",
    ]);

    const definitions = devNexusTypeScriptSkillDefinitions();

    expect(definitions.map((definition) => definition.manifest.id)).toEqual([
      "typescript-diagnose",
      "typescript-refactor",
      "typescript-project-topology",
      "typescript-quality-feedback",
      "typescript-test-hygiene",
      "typescript-api-boundaries",
      "typescript-codemod-planning",
    ]);
    for (const definition of definitions) {
      expect(definition.manifest).toMatchObject({
        name: definition.manifest.id,
        version: "0.1.0",
        license: "Apache-2.0",
        source: {
          type: "local",
          uri: `@evref-bl/dev-nexus-typescript/skills/${definition.manifest.id}`,
        },
        supportedAgents: ["codex", "claude"],
        materialization: "copy",
        sourceControl: "support",
      });
      expect(definition.files["SKILL.md"]).toContain(
        `name: ${definition.manifest.id}`,
      );
      expect(definition.files["SKILL.md"]).toContain(
        definition.manifest.description,
      );
      expect(definition.files["SKILL.md"]).not.toContain("TODO");
      expect(definition.files["dev-nexus.skill.json"]).toContain(
        `"id": "${definition.manifest.id}"`,
      );
    }
    expect(
      definitions.find(
        (definition) => definition.manifest.id === "typescript-project-topology",
      )!.files["SKILL.md"],
    ).toContain("prefer a central `test` tree that mirrors");
    expect(
      definitions.find(
        (definition) => definition.manifest.id === "typescript-project-topology",
      )!.files["REFERENCES.md"],
    ).toContain("https://www.typescriptlang.org/tsconfig/rootDir.html");
    expect(
      definitions.find(
        (definition) => definition.manifest.id === "typescript-quality-feedback",
      )!.files["SKILL.md"],
    ).toContain("typescript:S3776");
  });
});
