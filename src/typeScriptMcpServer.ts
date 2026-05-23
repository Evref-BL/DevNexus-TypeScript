import {
  devNexusMcpProtocolVersion,
  StdioJsonRpcTransport,
  type DevNexusMcpToolResult,
  type JsonRpcRequest,
  type McpTool,
} from "dev-nexus";
import { analyzeTypeScriptImportGraph } from "./typeScriptImportGraphAnalysis.js";
import {
  planTypeScriptBulkRewrite,
  type TypeScriptBulkRewritePlanInput,
} from "./typeScriptBulkRewritePlanning.js";
import type { TypeScriptImportGraphInput } from "./typeScriptImportGraphAnalysis.js";
import {
  traceTypeScriptDiagnostics,
  traceTypeScriptProjectStatus,
  type TypeScriptMcpTraceInput,
} from "./typeScriptMcpDiagnosticsTracer.js";
import { devNexusTypeScriptMcpServerName } from "./typeScriptMcpServerConfig.js";
import {
  compareTypeScriptQualitySnapshots,
  readTypeScriptQualitySnapshot,
  type TypeScriptQualityDeltaInput,
  type TypeScriptQualitySnapshotInput,
} from "./typeScriptQualityFeedback.js";

type JsonRpcId = string | number | null;

interface ToolCallParams {
  name: string;
  arguments: Record<string, unknown>;
}

const projectRootProperty = {
  type: "string",
  description: "TypeScript or JavaScript project root to inspect.",
};

const tsconfigPathProperty = {
  type: "string",
  description: "Optional project-relative tsconfig path.",
};

export const devNexusTypeScriptMcpTools: readonly McpTool[] = [
  {
    name: "typescript.projectStatus",
    description:
      "Read TypeScript project setup status, scripts, compiler availability, and setup blockers.",
    inputSchema: {
      type: "object",
      properties: {
        projectRoot: projectRootProperty,
      },
      required: ["projectRoot"],
      additionalProperties: true,
    },
  },
  {
    name: "typescript.diagnostics",
    description:
      "Read TypeScript compiler diagnostics grouped by file and diagnostic code.",
    inputSchema: {
      type: "object",
      properties: {
        projectRoot: projectRootProperty,
        tsconfigPath: tsconfigPathProperty,
      },
      required: ["projectRoot"],
      additionalProperties: true,
    },
  },
  {
    name: "typescript.importGraph",
    description:
      "Read TypeScript module import edges, hubs, cycles, and ignored source facts.",
    inputSchema: {
      type: "object",
      properties: {
        projectRoot: projectRootProperty,
        tsconfigPath: tsconfigPathProperty,
        include: {
          type: "array",
          items: { type: "string" },
        },
        ignore: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["projectRoot"],
      additionalProperties: true,
    },
  },
  {
    name: "typescript.bulkRewritePlan",
    description: "Preview TypeScript bulk rewrite plans without writing source files.",
    inputSchema: {
      type: "object",
      properties: {
        projectRoot: projectRootProperty,
        tsconfigPath: tsconfigPathProperty,
        include: {
          type: "array",
          items: { type: "string" },
        },
        ignore: {
          type: "array",
          items: { type: "string" },
        },
        rewrite: {
          type: "object",
          description: "Read-only rewrite intent to preview.",
        },
        verificationCommands: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["projectRoot", "rewrite"],
      additionalProperties: true,
    },
  },
  {
    name: "typescript.qualitySnapshot",
    description:
      "Read TypeScript diagnostics, import cycles, and Sonar JSON into one quality snapshot.",
    inputSchema: {
      type: "object",
      properties: {
        projectRoot: projectRootProperty,
        tsconfigPath: tsconfigPathProperty,
        include: {
          type: "array",
          items: { type: "string" },
        },
        ignore: {
          type: "array",
          items: { type: "string" },
        },
        sonarIssuesPath: {
          type: "string",
          description: "Optional project-relative Sonar api/issues/search JSON path.",
        },
        sonarQualityGatePath: {
          type: "string",
          description:
            "Optional project-relative Sonar api/qualitygates/project_status JSON path.",
        },
        sonarSecurityHotspotsPath: {
          type: "string",
          description:
            "Optional project-relative Sonar api/hotspots/search JSON path.",
        },
        sonar: {
          type: "object",
          description: "Optional inline Sonar JSON objects for tests or callers.",
        },
      },
      required: ["projectRoot"],
      additionalProperties: true,
    },
  },
  {
    name: "typescript.qualityDelta",
    description:
      "Compare two TypeScript quality snapshots and highlight touched-file regressions.",
    inputSchema: {
      type: "object",
      properties: {
        before: {
          type: "object",
          description: "Baseline quality snapshot.",
        },
        after: {
          type: "object",
          description: "Current quality snapshot.",
        },
        touchedFiles: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["before", "after"],
      additionalProperties: true,
    },
  },
];

export async function handleDevNexusTypeScriptMcpJsonRpcMessage(
  message: JsonRpcRequest,
): Promise<unknown | undefined> {
  switch (message.method) {
    case "initialize":
      return jsonRpcResult(message.id, {
        protocolVersion: devNexusMcpProtocolVersion,
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: devNexusTypeScriptMcpServerName,
          version: "0.1.0-alpha.1",
        },
      });
    case "notifications/initialized":
      return undefined;
    case "tools/list":
      return jsonRpcResult(message.id, {
        tools: devNexusTypeScriptMcpTools,
      });
    case "tools/call": {
      const params = parseToolCallParams(message.params);
      return jsonRpcResult(message.id, await callDevNexusTypeScriptMcpTool(params));
    }
    default:
      if (message.id === undefined) {
        return undefined;
      }
      return jsonRpcError(message.id, -32601, `Method not found: ${message.method}`);
  }
}

export async function runDevNexusTypeScriptMcpStdioServer(): Promise<void> {
  const transport = new StdioJsonRpcTransport(
    handleDevNexusTypeScriptMcpJsonRpcMessage,
  );
  await transport.start();
}

async function callDevNexusTypeScriptMcpTool(
  params: ToolCallParams,
): Promise<DevNexusMcpToolResult> {
  try {
    switch (params.name) {
      case "typescript.projectStatus":
        return toolResult(
          traceTypeScriptProjectStatus(
            params.arguments as unknown as TypeScriptMcpTraceInput,
          ),
        );
      case "typescript.diagnostics":
        return toolResult(
          traceTypeScriptDiagnostics(
            params.arguments as unknown as TypeScriptMcpTraceInput,
          ),
        );
      case "typescript.importGraph":
        return toolResult(
          analyzeTypeScriptImportGraph(
            params.arguments as unknown as TypeScriptImportGraphInput,
          ),
        );
      case "typescript.bulkRewritePlan":
        return toolResult(
          planTypeScriptBulkRewrite(
            params.arguments as unknown as TypeScriptBulkRewritePlanInput,
          ),
        );
      case "typescript.qualitySnapshot":
        return toolResult(
          readTypeScriptQualitySnapshot(
            params.arguments as unknown as TypeScriptQualitySnapshotInput,
          ),
        );
      case "typescript.qualityDelta":
        return toolResult(
          compareTypeScriptQualitySnapshots(
            params.arguments as unknown as TypeScriptQualityDeltaInput,
          ),
        );
      default:
        return toolResult({ error: `Unknown tool: ${params.name}` }, true);
    }
  } catch (error) {
    return toolResult(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      true,
    );
  }
}

function parseToolCallParams(params: unknown): ToolCallParams {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new Error("tools/call params must be an object");
  }
  const record = params as Record<string, unknown>;
  if (typeof record.name !== "string") {
    throw new Error("tools/call params.name must be a string");
  }
  const args = record.arguments;
  if (args !== undefined && (!args || typeof args !== "object" || Array.isArray(args))) {
    throw new Error("tools/call params.arguments must be an object when provided");
  }

  return {
    name: record.name,
    arguments: args ? args as Record<string, unknown> : {},
  };
}

function toolResult(value: unknown, isError = false): DevNexusMcpToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
    ...(isError ? { isError: true } : {}),
  };
}

function jsonRpcResult(id: JsonRpcId | undefined, result: unknown): unknown {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

function jsonRpcError(
  id: JsonRpcId | undefined,
  code: number,
  message: string,
): unknown {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
    },
  };
}
