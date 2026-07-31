// ---------------------------------------------------------------------------
// CHECKPOINT STATUS - FORWARD REFERENCES CARRY THE MARKER `(planned)`
//
// The subtree is authored in boundaries, and AAP 0.4.5 makes the authoring
// order "a compile-order convenience, not a schedule". Commentary in this file
// therefore names modules of the target layout that DO NOT EXIST YET. Every such
// name carries `(planned)` at its point of use, meaning exactly: a planned Agent
// Action Plan target that is ABSENT from the subtree at this checkpoint. Nothing
// here asserts that any of them exists now, and no behaviour in this file depends
// on one. The complete set named below, with the role each will play:
//
//   src/services/promotion               promotion decomposition folder
//   tests/fixtures                       fixture tier
//   tests/integration                    integration test tier
//   tests/traceability                   traceability tier
//   tests/traceability/legacyTestMap.ts  structural coverage map
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// slatwall-ts - Vitest configuration
//
// The test gate for the strict-mode TypeScript port of the Slatwall 3.1.39
// catalog + promotions/pricing slice, which targets the AWS Lambda
// `nodejs20.x` runtime and continues to read and write the existing `Sw*`
// MySQL schema unchanged.
//
// Consumers:
//   * `npm test`              -> `vitest run`             (test outcomes)
//   * `npm run test:coverage` -> `vitest run --coverage`   (adds the coverage
//                                                          floor)
//   * `npm run verify`        -> typecheck + lint + format:check + test
//
// Vitest was selected for one concrete reason: it consumes the project
// `tsconfig.json` directly with no transform layer, which matters for a
// NodeNext/ESM TypeScript source tree. There is consequently no Babel
// configuration, no ts-jest transform, and no second module-resolution story
// to keep in sync with the compiler.
//
// This file is itself part of the typecheck program - `tsconfig.json` lists
// `vitest.config.ts` in its `include` - so it is held to the same maximal
// strict profile as `src/**` and `tests/**`.
//
// ---------------------------------------------------------------------------
// WHAT THIS CONFIG REPLACES, AND WHAT IT CARRIES FORWARD
// ---------------------------------------------------------------------------
// The legacy CFML suite had no runner configuration of any kind: MXUnit was
// vendored into the source tree, and every legacy "unit" test booted the real
// application, the ORM and the DI container, so that suite is integration
// style at every level. Two legacy artifacts nevertheless impose hard
// requirements on this file.
//
//   meta/tests/coverage/EntityCoverageTest.cfc:L51-L70
//     One method, `all_entities_have_test_cases()`. It lists the entity
//     directory and the entity-test directory with `filter="*.cfc"`, removes
//     every entity that has a matching test FILENAME, and closes at L69 with
//     `assertEquals("", arrayToList(missingEntityTests))`. The structural
//     floor is therefore filename correspondence, asserted empty.
//
//     `tests/traceability/legacyTestMap.ts` (planned) mirrors that floor machine
//     readably and fails when an in-scope module has no test. It is a data
//     module, so the suite alongside it in `tests/traceability/` (planned) is what
//     turns it into an executed assertion - which is why that tier is an
//     enumerated member of `include` below. A floor that never runs is not a
//     floor.
//
//   meta/tests/unit/Helper.cfc:L51-L75
//     The fixture pattern: build-save-flush at L51-L67 and null-delete-flush
//     at L69-L75. This port has no ORM and no `ormFlush()`, so the
//     equivalent is in-memory fixture construction and disposal, provided by
//     the single shared harness wired through `setupFiles`.
//
// A deliberate non-goal: nothing here boots anything resembling an
// application container. The unit tier in this port is genuinely isolated,
// which is a difference in kind from the legacy suite rather than in degree.
//
// ---------------------------------------------------------------------------
// DELIBERATELY NOT SET, each for a specific reason
// ---------------------------------------------------------------------------
//   * `test.testTimeout` - left at the Vitest default. No timeout figure is
//     introduced here, because no service-level objective exists anywhere in
//     the legacy source and none may be invented. For the avoidance of
//     doubt: the legacy runtime's 60-second order-placement lock, 45-second
//     payment-transaction lock and 30-second bean-factory first-scan lock are
//     noted and deliberately NOT implemented by this port, and no number in
//     this file stands in for any of them.
//   * Module-specifier remapping of any kind, whether under `resolve` or
//     anywhere else - `tsconfig.json` declares no `paths` on purpose, and a
//     rewritten specifier would let a module sidestep the ESLint
//     `no-restricted-imports` layer boundary that stops `src/domain/**` from
//     importing `src/repositories/**`, `src/handlers/**` or
//     `src/integrations/**`. Imports stay explicit relative specifiers, and
//     the runner therefore resolves modules exactly as the compiler does.
//   * `test.globalSetup` - absent entirely, and in particular carrying no
//     schema-mutating, seeding or DDL step of any kind. Schema continuity is
//     binding: this service reads and writes the EXISTING `Sw*` tables,
//     unchanged, with no rename, no new table and no column change. No
//     schema-management tooling exists in the dependency set, and none may be
//     added.
//   * Any browser-DOM emulation layer, and `test.environmentOptions` with it
//     - this is a headless backend service. The presentation subsystems
//     (admin/, frontend/, public/, assets/) are out of scope and the target
//     renders no user interface, so there is no DOM to emulate.
//     `test.environment` below is `'node'` and nothing else.
//   * Any interactive UI reporter package - neither configured nor installed.
//     Every dependency in `package.json` is pinned to an exact version with
//     no range, the set is closed, and adding a package is out of scope. The
//     runner and its coverage provider in particular are locked to the SAME
//     release, 4.1.10, which is why `coverage.provider` below is `'v8'`.
//   * `dotenv` - available at the pinned 17.4.2, and deliberately NOT
//     referenced here. Environment loading belongs to `tests/setup.ts`,
//     against the committed `.env.example` contract, so that no production
//     code path depends on it and no connection detail reaches this file.
//     No credential of any kind appears below - no host name, no schema name,
//     no account name, no authentication value - and none may be added: a
//     suite that genuinely needs a live server gates itself on the
//     `TEST_LIVE_DATABASE` flag that `tests/setup.ts` reads, never on a
//     connection written into source.
// ---------------------------------------------------------------------------

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

    // The three test tiers this project collects. A suite outside these patterns is
    // not run, so a misplaced file fails visibly instead of being skipped.
    //
    //   tests/unit/**         The genuinely isolated unit tier: entities,
    //                         value objects, the seven services, the nine
    //                         promotion decomposition modules, the CFML
    //                         semantic-parity helpers, the handlers and the
    //                         Google adapter.
    //   tests/integration/**  SQL shape and parameter binding for the six
    //                         MySQL repositories. These assert the emitted
    //                         SQL text and the bound parameter array. They
    //                         need NO database server, and this config
    //                         assumes none is running.
    //   tests/traceability/** (planned) The machine-readable replacement for
    //                         meta/tests/coverage/EntityCoverageTest.cfc.
    //                         Not optional: without this tier in the run set
    //                         the coverage floor is dead code.
    //
    // Every tier uses the same `*.test.ts` suffix, which also admits the
    // `issue_<ticket#>` regression convention carried over from
    // meta/tests/unit/IssuesTest.cfc - including the suite for the preserved
    // return/exchange no-op at model/service/PromotionService.cfc:L542-L544,
    // ticket #1766. Those files live under `tests/unit/**` and are matched,
    // never excluded.
    //
    // CHECKPOINT STATUS OF THESE THREE PATTERNS. The first two match files
    // today: the unit tier, and the repository tier under
    // `tests/integration/repositories/`. `tests/traceability/` (planned) DOES NOT
    // EXIST at this checkpoint, so the third pattern is RESERVED FOR A LATER
    // BOUNDARY and currently matches ZERO files. It is declared now rather than
    // later so the tier contract above is complete and so no tier can be silently
    // forgotten once it is authored; a pattern matching nothing is not an error in
    // vitest and does not fail the run. The same applies to `tests/fixtures/`
    // (planned) in the coverage exclude list below and to
    // `src/services/promotion/**` (planned) in the note beside it - both are
    // planned paths, named for the contract they will carry.
    //
    // THE TRACEABILITY ENTRY IS THE ONE PATTERN WITHOUT THE `*.test.ts` INFIX.
    // AAP 0.3.1 fixes that artifact's name as
    // `tests/traceability/legacyTestMap.ts`, so a `*.test.ts` glob could never
    // match it and the coverage floor it enforces would never run. The filename is
    // the contract and the glob is the accommodation; the widening is bounded to
    // that one directory, and `passWithNoTests: false` above makes anything
    // collected there that is not a suite a hard failure rather than a silent pass.
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

    // Coverage measures src/** only; the test tier and tooling configs are excluded
    // so they cannot inflate the result. The thresholds are quality floors for this
    // port, not a statement about the legacy system, which had no coverage gate.
    coverage: {
      provider: 'v8',

      reportsDirectory: './coverage',

      reporter: ['text', 'json', 'json-summary', 'lcov'],

      include: ['src/**/*.ts'],

      // Type-only declarations, the test tier together with its fixtures
      // under `tests/fixtures/` (planned), and this subtree's own tooling
      // configuration. None of that is application logic under test.
      //
      // Note what is deliberately NOT excluded: `src/domain/**` and
      // `src/services/promotion/**` (planned). Those carry the must-preserve behavior -
      // the promotion discount math and use-limit enforcement, and the
      // price-group and currency resolution cascade - and are exactly where
      // coverage matters most.
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
