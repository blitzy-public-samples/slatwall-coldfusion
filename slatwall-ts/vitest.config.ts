// Vitest configuration: the test gate for the slatwall-ts port.
//
// Consumed by `npm test` (`vitest run`), `npm run test:coverage` and
// `npm run verify`. `tsconfig.json` lists this file in its `include`, so it is
// held to the same strict profile as `src/**` and `tests/**`.
//
// One setting below is not merely stylistic and must not be relaxed: module-
// specifier remapping is absent, so a module cannot sidestep the ESLint
// `no-restricted-imports` layer boundary.
//
// THE TWO TIMEOUTS ARE SET EXPLICITLY, AND A NON-DETERMINISTIC COVERAGE FAILURE IS
// WHY. With no override the runner's implicit 5,000 ms default is the only thing
// standing behind the heaviest read in the tier - the traceability ledger's
// whole-tree scan - on a four-core host, with v8 coverage instrumentation
// multiplying the cost of every character scanned. `npm run test:coverage` then
// fails intermittently on `Test timed out in 5000ms` while `npm test` and
// `npm run verify` stay green, and a failing run writes NO coverage report at all,
// so the very gate the command exists to discharge goes missing exactly when it is
// needed.
//
// AN ALLOWANCE IS NOT A REQUIREMENT, and the distinction is the whole reason these
// two lines are allowed to exist. AAP 0.8.1 records that the legacy system states
// no latency, throughput or uptime requirement and that none may be invented here -
// and block `A19` of `tests/traceability/legacyTestMap.ts` enforces that by failing
// any suite that reads a clock inside an `expect(`. These values are read by the
// runner to decide when to abandon a hung test; nothing asserts against them, and
// raising one changes no result. What they buy is that a correct suite on a busy
// host reports the truth.

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

    // AN EXPLICIT HARNESS BUDGET, BECAUSE THE RUNNER'S UNCONFIGURED 5000 ms DEFAULT WAS
    // TOO THIN FOR THIS SUITE AND MADE IT FAIL ON A BUSY MACHINE WITH NOTHING WRONG.
    //
    // Three cases legitimately spend over a second of pure CPU, because what they assert is a
    // property of the WHOLE tree rather than of one subject: `legacyTestMap.ts`'s `A19` reads
    // every suite on disk and strips its comments so neither of its bans can pass vacuously,
    // `roundingRuleService.test.ts` walks the rounding-expression resource limits, and
    // `mysqlSkuRepository.test.ts` proves the read path is total on magnitude. Measured on an
    // idle four-core container they take roughly 1.8 s, 1.6 s and 1.3 s - between 2.8x and 3.8x
    // inside the old default - and the next slowest case in the suite is under a second. Under
    // ordinary contention that headroom disappears: with the box loaded, `A19` overran 5000 ms
    // and the run exited non-zero reporting `1 failed | 6593 passed` - one budget overrun against
    // an entire suite that had nothing wrong with it. AAP 0.9.4 requires this suite to be usable
    // in an automated loop, and a gate that reddens on load does not satisfy it.
    //
    // 30000 ms is chosen to be generous against contention rather than tuned to the cases: it
    // leaves the slowest of them over sixteen times its measured cost, while staying far below
    // anything that would let a genuinely hung test stall a pipeline - the whole suite finishes
    // in about 17 s, so a case sitting for 30 s is a real fault and still fails the run.
    //
    // `retry` IS DELIBERATELY NOT SET, and that is the more important half of this decision. A
    // retry would have turned the same overrun green while leaving the cause in place, and it
    // would have masked a genuinely flaky assertion later. The budget is corrected; the
    // zero-tolerance for nondeterminism is not.
    //
    // THIS IS NOT AN INVENTED NON-FUNCTIONAL REQUIREMENT. AAP 0.8.1 records that the legacy
    // system states no latency, throughput or uptime requirement and forbids fabricating one -
    // which is why `legacyTestMap.ts`'s `A19` bans a committed test from asserting a duration at
    // all, and why the legacy runtime's own 60-, 45- and 30-second lock timeouts are noted and
    // deliberately not implemented. A ceiling on how long the HARNESS waits before declaring a
    // test stuck is a property of the test runner, not a claim about the port's behaviour: no
    // assertion reads it, no shipped module can observe it, and it appears in no artifact that
    // esbuild emits. `hookTimeout` is raised with it because a hook budget three times tighter
    // than the test budget would simply relocate the same defect into the setup tier.
    //
    // ONE BUDGET FOR THE WHOLE RUN rather than one per tier: the runner applies a single value to
    // every collected file, and the tier that needs the headroom - the traceability ledger, which
    // reads and scans all of `src/**` and `tests/**` - runs under the same command as everything
    // else. The unit tier is nowhere near either figure and is unaffected; the ledger's own
    // heaviest read carries a further explicit hook budget at its call site, so the two are
    // visible independently.
    testTimeout: 30_000,

    hookTimeout: 30_000,

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
