// Vitest configuration: the test gate for the slatwall-ts port.
//
// Consumed by `npm test` (`vitest run`), `npm run test:coverage` and
// `npm run verify`. `tsconfig.json` lists this file in its `include`, so it is
// held to the same strict profile as `src/**` and `tests/**`.
//
// One setting below is not merely stylistic and must not be relaxed: module-
// specifier remapping is absent, so a module cannot sidestep the ESLint
// `no-restricted-imports` layer boundary. No timeout is overridden anywhere in
// this file, so the runner's own defaults apply.
import { defineConfig } from 'vitest/config';

// Pinning the root to this file's directory keeps the runner subtree-local, so it
// resolves nothing from the surrounding CFML repository.
const subtreeRoot = import.meta.dirname;

export default defineConfig({
  root: subtreeRoot,

  test: {
    environment: 'node',

    globals: false,

    // Non-interactive by construction: no watch mode, no snapshot writing, and an
    // empty run is a failure rather than a silent pass.
    watch: false,

    passWithNoTests: false,

    update: false,

    reporters: ['default'],

    // THESE GLOBS DEFINE COLLECTION. A file outside them is simply not collected -
    // silently, with no error - so nothing in this configuration detects a suite
    // placed off-glob, and correct placement is the author's responsibility. The
    // integration tier asserts emitted SQL text and bound parameters and needs NO
    // database server.
    //
    // The traceability entry is the one pattern without the `*.test.ts` infix,
    // because `tests/traceability/legacyTestMap.ts` is the fixed name of the
    // machine-readable replacement for
    // `meta/tests/coverage/EntityCoverageTest.cfc` and a `*.test.ts` glob could
    // never match it. `passWithNoTests: false` fails a run that collects no tests
    // at all; it cannot see files outside these patterns.
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/traceability/**/*.ts',
    ],

    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**'],

    // The single setup module. It forces process.env.TZ to UTC before any suite
    // imports a subject, which the date-sensitive assertions depend on.
    setupFiles: ['./tests/setup.ts'],

    // One fresh module registry per file, with shuffling and concurrent tests
    // disabled: the ported promotion logic is order-dependent, so a deterministic
    // order WITHIN a file is what makes a failure reproducible. File-level
    // parallelism is left alone - isolated files may still run in parallel.
    isolate: true,

    sequence: {
      shuffle: false,
      concurrent: false,
    },

    // Per-test hygiene, so no mock, stubbed environment value or stubbed global
    // leaks from one test into the next.
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,

    // The thresholds are quality floors for this port, not a statement about the
    // legacy system, which had no coverage gate.
    coverage: {
      provider: 'v8',

      reportsDirectory: './coverage',

      reporter: ['text', 'json', 'json-summary', 'lcov'],

      include: ['src/**/*.ts'],

      // Type-only declarations, the test tier and this subtree's tooling
      // configuration are excluded. `src/domain/**` and `src/services/promotion/**`
      // are deliberately NOT excluded: they carry the must-preserve behavior - the
      // promotion discount math and use-limit enforcement, and the price-group and
      // currency resolution cascade.
      exclude: ['src/**/*.d.ts', 'tests/**', '**/*.config.ts', '**/*.config.mjs'],

      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 70,

        perFile: false,

        autoUpdate: false,
      },
    },
  },
});
