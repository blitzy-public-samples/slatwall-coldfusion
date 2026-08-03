// Vitest configuration: the test gate for the slatwall-ts port.
//
// Consumed by `npm test` (`vitest run`), `npm run test:coverage` and
// `npm run verify`. `tsconfig.json` lists this file in its `include`, so it is
// held to the same strict profile as `src/**` and `tests/**`.
//
// Two settings below are not merely stylistic and must not be relaxed:
// module-specifier remapping is absent so a module cannot sidestep the ESLint
// `no-restricted-imports` layer boundary, and no timeout figure is introduced
// because the legacy source states no service-level objective.
import { defineConfig } from 'vitest/config';

// Pinning the root to this file's directory keeps the runner subtree-local, so it
// resolves nothing from the surrounding CFML repository.
const subtreeRoot = import.meta.dirname;

export default defineConfig({
  root: subtreeRoot,

  test: {
    environment: 'node',

    // Vitest members are imported explicitly in every suite rather than injected as
    // globals, which is what lets the same tsconfig cover src/** and tests/**.
    globals: false,

    // Non-interactive by construction: no watch mode, no snapshot writing, and an
    // empty run is a failure rather than a silent pass.
    watch: false,

    passWithNoTests: false,

    update: false,

    reporters: ['default'],

    // The tiers this project collects. A suite outside these patterns is not run,
    // so a misplaced file fails visibly instead of being skipped. The
    // integration tier asserts emitted SQL text and bound parameters and needs
    // NO database server.
    //
    // The traceability entry is the one pattern without the `*.test.ts` infix,
    // because `tests/traceability/legacyTestMap.ts` is the fixed name of the
    // machine-readable replacement for
    // `meta/tests/coverage/EntityCoverageTest.cfc` and a `*.test.ts` glob could
    // never match it. `passWithNoTests: false` makes anything collected there
    // that is not a suite a hard failure rather than a silent pass.
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/traceability/**/*.ts',
    ],

    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**'],

    // The single setup module. It forces process.env.TZ to UTC before any suite
    // imports a subject, which the date-sensitive assertions depend on.
    setupFiles: ['./tests/setup.ts'],

    // One fresh module registry per file, with shuffling and concurrency off: the
    // ported promotion logic is order-dependent, so a deterministic order is what
    // makes a failure reproducible.
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
