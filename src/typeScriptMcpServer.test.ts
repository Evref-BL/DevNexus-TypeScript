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
        ],
      },
    });
    expect(devNexusTypeScriptMcpTools).toHaveLength(4);
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
