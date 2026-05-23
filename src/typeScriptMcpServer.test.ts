import { describe, expect, it } from "vitest";
import {
  devNexusTypeScriptMcpServerName,
  devNexusTypeScriptMcpTools,
  handleDevNexusTypeScriptMcpJsonRpcMessage,
} from "./index.js";

describe("DevNexus TypeScript MCP server", () => {
  it("lists the package TypeScript tools through MCP", async () => {
    const response = await handleDevNexusTypeScriptMcpJsonRpcMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });

    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: [
          { name: "typescript.projectStatus" },
          { name: "typescript.diagnostics" },
          { name: "typescript.importGraph" },
          { name: "typescript.bulkRewritePlan" },
          { name: "typescript.qualitySnapshot" },
          { name: "typescript.qualityDelta" },
        ],
      },
    });
    expect(devNexusTypeScriptMcpTools).toHaveLength(6);
  });

  it("returns project status through tools/call", async () => {
    const response = await handleDevNexusTypeScriptMcpJsonRpcMessage({
      jsonrpc: "2.0",
      id: "status",
      method: "tools/call",
      params: {
        name: "typescript.projectStatus",
        arguments: {
          projectRoot: process.cwd(),
        },
      },
    });

    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: "status",
      result: {
        content: [
          {
            type: "text",
          },
        ],
      },
    });
    const result = response as {
      result: {
        content: Array<{ text: string }>;
      };
    };
    expect(JSON.parse(result.result.content[0]!.text)).toMatchObject({
      operation: "typescript.projectStatus",
      projectRoot: process.cwd(),
    });
  });

  it("returns a quality delta through tools/call", async () => {
    const snapshot = {
      operation: "typescript.qualitySnapshot",
      readOnly: true,
      status: "ok",
      projectRoot: process.cwd(),
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
    const response = await handleDevNexusTypeScriptMcpJsonRpcMessage({
      jsonrpc: "2.0",
      id: "quality-delta",
      method: "tools/call",
      params: {
        name: "typescript.qualityDelta",
        arguments: {
          before: snapshot,
          after: snapshot,
          touchedFiles: [],
        },
      },
    });

    const result = response as {
      result: {
        content: Array<{ text: string }>;
      };
    };
    expect(JSON.parse(result.result.content[0]!.text)).toMatchObject({
      operation: "typescript.qualityDelta",
      status: "unchanged",
    });
  });

  it("initializes with a stable server identity", async () => {
    const response = await handleDevNexusTypeScriptMcpJsonRpcMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
    });

    expect(response).toMatchObject({
      result: {
        serverInfo: {
          name: devNexusTypeScriptMcpServerName,
        },
      },
    });
  });
});
