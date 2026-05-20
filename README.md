# DevNexus TypeScript

DevNexus TypeScript is the TypeScript and JavaScript tooling plugin for
DevNexus-managed projects. It contributes setup and worker guidance through the
generic DevNexus plugin capability contract.

The initial plugin capability projects an existing `node_modules` directory into
prepared worker worktrees as support-only state. DevNexus remains responsible
for generic worktree preparation and setup materialization; this plugin owns the
TypeScript and JavaScript toolchain policy.

```ts
import { devNexusTypeScriptDevNexusPluginConfig } from "@evref-bl/dev-nexus-typescript";

const plugin = devNexusTypeScriptDevNexusPluginConfig();
```

Add the returned plugin config to a DevNexus project's `plugins` list. Prepared
worktrees can then use the declared `dependency_projection` to resolve local
package binaries such as `tsc` or test runners without copying dependencies or
running package installs.

## Workflow Skills

DevNexus TypeScript ships baseline workflow skills for TypeScript diagnosis,
bounded refactoring, test hygiene, API boundary review, and dry-run codemod
planning. The plugin config declares them as `projected_skill` capabilities, and
the package also exports DevNexus skill definitions for projects that
materialize package-owned skills:

```ts
import {
  devNexusTypeScriptDevNexusPluginConfig,
  devNexusTypeScriptSkillDefinitions,
} from "@evref-bl/dev-nexus-typescript";

const plugin = devNexusTypeScriptDevNexusPluginConfig();
const skills = devNexusTypeScriptSkillDefinitions();
```

The skills are concise playbooks. They do not replace TypeScript, test runners,
linters, codemod tools, or project policy; they help agents choose the right
existing setup and verification path.

## Setup Inventory

DevNexus TypeScript also exposes a read-only setup inventory helper for
TypeScript and JavaScript projects:

```ts
import { inspectTypeScriptProjectSetup } from "@evref-bl/dev-nexus-typescript";

const inventory = inspectTypeScriptProjectSetup({ projectRoot });
```

The inventory reports package-manager lockfiles, package scripts, dependency
projection state, TypeScript configuration, project references, test framework
detection, typed linting detection, structural-search tooling, unused-code
tooling, blockers, and recommendations. It does not run package-manager
commands, install dependencies, or mutate the project.

The same inventory can be exposed to workers through DevNexus worker context and
briefing fragments:

```ts
import {
  devNexusTypeScriptDevNexusPluginConfig,
  inspectTypeScriptProjectSetup,
} from "@evref-bl/dev-nexus-typescript";

const inventory = inspectTypeScriptProjectSetup({ projectRoot });
const plugin = devNexusTypeScriptDevNexusPluginConfig({
  setupInventory: inventory,
  targetComponents: ["typescript"],
});
```

These generated fragments summarize available package scripts, recommended
focused verification commands, dependency projection state, missing binaries,
and setup blockers. Blockers remain advisory setup facts; the plugin does not
choose implementation work or repair missing dependencies.

## MCP Diagnostics Tracer

DevNexus TypeScript exposes a narrow read-only tracer for TypeScript-aware MCP
experiments:

```ts
import {
  analyzeTypeScriptImportGraph,
  planTypeScriptBulkRewrite,
  traceTypeScriptDiagnostics,
  traceTypeScriptProjectStatus,
} from "@evref-bl/dev-nexus-typescript";

const status = traceTypeScriptProjectStatus({ projectRoot });
const diagnostics = traceTypeScriptDiagnostics({ projectRoot });
const graph = analyzeTypeScriptImportGraph({
  projectRoot,
  include: ["src/**/*.ts"],
  ignore: ["src/generated/**"],
});
const rewritePlan = planTypeScriptBulkRewrite({
  projectRoot,
  rewrite: {
    kind: "renameIdentifier",
    from: "oldName",
    to: "newName",
  },
});
```

The project-status operation reports setup inventory, available scripts,
selected `tsconfig`, compiler availability, and setup blockers. The diagnostics
operation loads the inspected project's own `typescript` package, reads compiler
diagnostics through the TypeScript compiler API, and groups results by file and
diagnostic code. If dependency projection or the TypeScript binary is missing,
the tracer returns setup blockers instead of installing packages, running `npx`,
or writing source files.

The import-graph operation uses the same read-only compiler setup to report
source module edges, import hubs, deterministic cycles, unresolved imports, and
ignored generated files. Scope can be bounded with `include` patterns and noisy
folders can be omitted with `ignore` patterns so agents can cite compact graph
facts in handoffs, architecture reviews, and pull requests.

The bulk-rewrite planning operation is the safe, preview-only version of a
codemod. It uses the inspected project's TypeScript compiler API to find syntax
matches and returns matched files, matched nodes, proposed edit previews, rewrite
categories, risks, and verification commands. Current policy records
`applyAllowed: false`; agents can cite the plan before manual edits or future
human-approved apply workflows, but this package does not write files.

## Boundaries

- The plugin does not run `npm install`, `pnpm install`, `yarn install`, or
  `bun install`.
- Missing dependencies are reported through DevNexus setup results rather than
  repaired automatically.
- JavaScript projects are supported through the same TypeScript tooling surface.
