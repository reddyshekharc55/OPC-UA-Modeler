---
name: NodeGraph test import resolution
about: Tests for `NodeGraph` fail due to unresolved `vis-network/standalone/esm/vis-network` import
labels: tests, infra
---

**Summary**

Vitest tests for `src/components/NodeGraph/NodeGraph.tsx` mock `vis-network` at runtime with `vi.mock(...)`, but Vite's import-analysis fails during transform because the import path `vis-network/standalone/esm/vis-network` cannot be resolved in the environment used by Vitest. This caused a local temporary workaround by adding files under `node_modules`, which is fragile and should not be committed.

**Steps to reproduce**

1. Run `npm run test`.
2. Observe failure: `Failed to resolve import "vis-network/standalone/esm/vis-network" from "src/components/NodeGraph/NodeGraph.tsx"`.

**Cause**

Vitest (via Vite) performs static import analysis and needs the module path to exist at transform time even if the tests mock it at runtime. `vi.mock` alone does not prevent Vite from validating/resolving the original import path.

**Suggested fixes (pick one)**

- Add a test-time alias in `vite.config.ts` (or `vitest` config) to point that import to a project-local test mock, for example:

  ```ts
  // vite.config.ts
  import { defineConfig } from 'vite';
  import path from 'path';

  export default defineConfig({
    resolve: {
      alias: {
        'vis-network/standalone/esm/vis-network': path.resolve(__dirname, 'src/test-mocks/vis-network.js'),
        'vis-network/styles/vis-network.css': path.resolve(__dirname, 'src/test-mocks/vis-network.css'),
      },
    },
    test: {
      // vitest specific options if needed
    }
  });
  ```

  And create `src/test-mocks/vis-network.js` and CSS mock. This keeps `node_modules` untouched and provides Vite a resolvable module for transform time while allowing runtime `vi.mock` in tests if needed.

- Alternatively, configure Vitest to use a `mock`/`setupFiles` that registers a virtual module or uses `defineConfig({ test: { deps: { inline: ['vis-network'] } } })` depending on the exact problem.

**Notes**

- Do not commit changes to `node_modules` — they will be lost on install and can be accidentally committed.
- I can implement the recommended alias + test-mock files and update `NodeGraph.test.tsx` accordingly if you want.

**Recommended labels**: `tests`, `infra`, `help wanted`
