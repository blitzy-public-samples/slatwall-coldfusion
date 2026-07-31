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
//     `tests/traceability/legacyTestMap.ts` mirrors that floor machine
//     readably and fails when an in-scope module has no test. It is a data
//     module, so the suite alongside it in `tests/traceability/` is what
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

/**
 * Absolute path of the `slatwall-ts/` subtree, resolved from this file's own
 * location rather than from `process.cwd()`.
 *
 * This pin is load-bearing rather than cosmetic. Vite - and therefore Vitest
 * - defaults its root to the current working directory, so invoking the
 * runner from the repository root with `--config slatwall-ts/vitest.config.ts`
 * resolves `include` and `coverage.include` against the REPOSITORY root: the
 * globs below would then point outside this subtree and match nothing. That
 * behavior was reproduced directly, and pinning the root is what fixes it.
 *
 * The invariant this protects is absolute. The port adds one new top-level
 * subtree and modifies zero existing repository files, so nothing this config
 * resolves - root, `include`, or `coverage.include` - may ever address a path
 * outside `slatwall-ts/`.
 *
 * Vite bundles a config file to a temporary module before importing it, and
 * rewrites `import.meta.dirname` to the ORIGINAL file's directory while doing
 * so, so this value is correct in every load path.
 */
const subtreeRoot = import.meta.dirname;

export default defineConfig({
  // Pins the Vite root that every relative path below resolves against; see
  // the `subtreeRoot` note.
  root: subtreeRoot,

  test: {
    // -----------------------------------------------------------------------
    // Execution environment
    // -----------------------------------------------------------------------
    // Node, and only Node. No DOM emulation of any kind.
    environment: 'node',

    // Explicit imports, not ambient globals: every suite imports `describe`,
    // `it` and `expect` from 'vitest' by name. That is consistent with this
    // subtree's import discipline - named imports only, no barrel files, no
    // ambient magic - and with `tsconfig.json` declaring `"types": ["node"]`
    // and deliberately not `"vitest/globals"`. Flipping this to `true` would
    // decouple the runtime surface from the type program.
    globals: false,

    // -----------------------------------------------------------------------
    // Non-interactive execution
    // -----------------------------------------------------------------------
    // Tests run non-interactively, with no watch mode, so the gate is usable
    // in an automated loop. `npm test` already invokes `vitest run`; this
    // setting is the belt-and-braces half of that pair, so that a bare
    // `vitest` invocation by a person or a script still cannot park in watch
    // mode and hang the loop.
    watch: false,

    // An empty run is a failing run. This is the Vitest default, stated
    // explicitly: if discovery stops matching - a renamed tier, a typo in a
    // glob - the suite must fail loudly rather than report success over zero
    // tests. That is the same failure mode the legacy structural floor at
    // meta/tests/coverage/EntityCoverageTest.cfc:L69 was written to catch.
    passWithNoTests: false,

    // Never auto-accept a recorded expectation. The characterization suites
    // pin MEASURED legacy output, including results that look wrong on
    // purpose: `RoundingRuleService.roundValue()`
    // [model/service/RoundingRuleService.cfc:L88-L175] turns 12.30 with a
    // `.99` expression into 12.99, 7.42 with `9.99` into 9.99, 2.30 with
    // `0.99` into 0.99, and its own default `0.00` expression turns 12.3456
    // into 10.00. A mathematically tidier implementation fails that gate by
    // design, so silently rewriting a recorded value would erase the
    // evidence instead of surfacing the regression.
    update: false,

    // One non-interactive reporter. No interactive UI reporter is configured,
    // and none may be: no such package belongs to the fixed dependency set.
    reporters: ['default'],

    // -----------------------------------------------------------------------
    // Discovery: all three tiers, enumerated
    // -----------------------------------------------------------------------
    // Enumerated rather than collapsed into a single `tests/**` glob, so the
    // tier structure is a checkable contract a reviewer can read straight off
    // this list.
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
    //   tests/traceability/** The machine-readable replacement for
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
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/traceability/**/*.test.ts',
    ],

    // Dependencies and every generated output tree. Belt-and-braces given how
    // narrow `include` already is: `build/` is the `tsc` declaration output,
    // `dist/` is the esbuild Lambda bundle, and `coverage/` is this runner's
    // own report directory.
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**'],

    // Exactly one setup file, referenced unconditionally. It is the shared
    // harness standing in for meta/tests/unit/Helper.cfc - in-memory fixture
    // construction and disposal in place of build-save-flush and
    // null-delete-flush - and it is also where `dotenv` runs and where the
    // `TEST_LIVE_DATABASE` gate is read.
    //
    // Guarding this reference with a filesystem existence check was
    // considered and rejected. A harness that silently becomes optional when
    // its file is renamed or removed is strictly worse than a loud failure,
    // because every suite would then run without the fixtures and the
    // environment it assumes while still reporting success.
    setupFiles: ['./tests/setup.ts'],

    // -----------------------------------------------------------------------
    // Isolation and determinism
    // -----------------------------------------------------------------------
    // Every test file gets a fresh module registry. Stated explicitly because
    // switching it off would defeat a design decision rather than merely cost
    // time: four legacy component-level mutable caches become request-scoped
    // in this port precisely because module-level state survives between
    // unrelated invocations on a warm Lambda container -
    //
    //   model/dao/SkuDAO.cfc:L204-L220              nextOptionGroupSortOrder,
    //                                               whose clear condition at
    //                                               L222-L226 is inverted and
    //                                               so can never fire
    //   model/service/RoundingRuleService.cfc:L67-L77   roundingRuleDetails
    //   model/service/PromotionService.cfc:L1007,L1009  the un-`var`'d
    //                                               discountAmount
    //   plus every entity memo - currencyDetails, livePrice, brandName.
    //
    // Cross-file state bleed would mask exactly the class of bug that design
    // eliminates, so the isolated default is kept and made visible.
    isolate: true,

    // Deterministic scheduling, and one test at a time inside a file. Both
    // are Vitest defaults, and both are stated because an execution-ordering
    // requirement is asserted by the suites:
    // `PriceGroupService.updateOrderAmountsWithPriceGroups()` must run before
    // `PromotionService.updateOrderAmountsWithPromotions()`, since the
    // promotion pass reads price-group state that the price-group pass writes
    // [model/service/PromotionService.cfc:L241-L254].
    //
    // Be precise about what each setting does and does not buy:
    //   `shuffle: false`     keeps the order in which files and suites are
    //                        QUEUED stable, so a characterization failure is
    //                        reproducible instead of depending on a seed.
    //   `concurrent: false`  keeps tests inside one file strictly sequential
    //                        unless a suite explicitly opts out, so a test
    //                        that asserts a two-pass sequence observes it.
    //
    // Neither setting fixes the order in which files COMPLETE: file-level
    // parallelism is left at its default, so completion order varies run to
    // run. That is safe here rather than merely tolerated - the ordering
    // requirement above is asserted WITHIN a single test, never across files,
    // and `isolate: true` means no file can observe another's module state.
    // Suites are self-contained by construction: the promotion
    // characterization suites mutate a per-test usage ledger, not shared
    // module state.
    sequence: {
      shuffle: false,
      concurrent: false,
    },

    // Mock and stub hygiene between tests: spies are cleared, original
    // implementations are restored, and `vi.stubEnv` / `vi.stubGlobal` are
    // unwound. This matters here specifically because configuration is
    // environment-driven, so a suite that stubs an environment variable must
    // not leak it into the next test's view of `process.env`.
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,

    // -----------------------------------------------------------------------
    // Coverage
    // -----------------------------------------------------------------------
    // Coverage is collected only when it is asked for, so `npm test` reports
    // test outcomes and `npm run test:coverage` additionally enforces the
    // floor below.
    coverage: {
      // Matches the pinned `@vitest/coverage-v8` 4.1.10. That package and
      // `vitest` itself are locked to the same 4.1.10 release: the provider
      // must never drift from the runner.
      provider: 'v8',

      // Written inside the subtree, where it is already ignored by version
      // control, so a coverage run never dirties the working tree.
      reportsDirectory: './coverage',

      // `text` for the terminal summary, `lcov` for external tooling, `json`
      // for programmatic consumption, and `json-summary` for a compact
      // totals file.
      reporter: ['text', 'json', 'json-summary', 'lcov'],

      // Application sources only - and ALL of them. A module with no test at
      // all is reported at zero rather than omitted from the denominator,
      // which is what gives "every converted method has at least one test"
      // real teeth and what makes this the mechanical successor to the
      // legacy structural floor.
      include: ['src/**/*.ts'],

      // Type-only declarations, the test tier together with its fixtures
      // under `tests/fixtures/`, and this subtree's own tooling
      // configuration. None of that is application logic under test.
      //
      // Note what is deliberately NOT excluded: `src/domain/**` and
      // `src/services/promotion/**`. Those carry the must-preserve behavior -
      // the promotion discount math and use-limit enforcement, and the
      // price-group and currency resolution cascade - and are exactly where
      // coverage matters most.
      exclude: ['src/**/*.d.ts', 'tests/**', '**/*.config.ts', '**/*.config.mjs'],

      // Numeric floors for the coverage gate. These are a testing-quality
      // gate and nothing else: they are not latency, throughput, availability
      // or any other service-level figure, and they must not be read as one.
      //
      // `branches` sits below the other three deliberately. This port
      // reproduces legacy defects rather than repairing them, which leaves
      // real branches that cannot be driven to completion: the preserved
      // no-op at model/service/PromotionService.cfc:L542-L544, the throwing
      // stub for model/entity/Sku.cfc:L258 whose call target does not exist,
      // the fall-through to zero at model/entity/Product.cfc:L598, and the
      // stub ports standing in for the out-of-scope subscription and image
      // branches. A branch floor set as high as the line floor would reward
      // deleting those, which is precisely the wrong incentive.
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 70,

        // Global, not per file. A single deliberately thin module - a stub
        // port, a DTO input shape - must not fail the whole gate on its own.
        perFile: false,

        // Thresholds never edit themselves. With `autoUpdate` on, Vitest
        // rewrites the numbers in THIS FILE whenever measured coverage
        // exceeds them; a gate that silently modifies its own source is not
        // reviewable, and raising the floor is a decision a person makes.
        autoUpdate: false,
      },
    },
  },
});
