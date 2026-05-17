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

## Boundaries

- The plugin does not run `npm install`, `pnpm install`, `yarn install`, or
  `bun install`.
- Missing dependencies are reported through DevNexus setup results rather than
  repaired automatically.
- JavaScript projects are supported through the same TypeScript tooling surface.
