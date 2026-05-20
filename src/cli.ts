#!/usr/bin/env node
import process from "node:process";
import { runDevNexusTypeScriptMcpStdioServer } from "./typeScriptMcpServer.js";

async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const command = argv[0];
  if (command === "mcp-stdio") {
    await runDevNexusTypeScriptMcpStdioServer();
    return 0;
  }

  process.stderr.write(
    [
      "Usage:",
      "  dev-nexus-typescript mcp-stdio",
      "",
    ].join("\n"),
  );
  return command === "--help" || command === "-h" ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  },
);
