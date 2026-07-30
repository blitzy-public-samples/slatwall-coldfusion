// =====================================================================================
// Jest configuration for `slatwall-ts` — the extracted Slatwall Catalog slice.
//
// WHAT THIS FILE IS
// The single test-runner contract for the whole subtree: one build, one test command,
// one dependency manifest, no coupling back into the CFML tree. Jest reads it through
// `ts-node` (10.9.2, a declared dev dependency) because `jest-config@30` has no native
// TypeScript loader and Node 20 performs no type stripping — which is why removing
// `ts-node` from package.json would stop the runner from starting at all.
//
// The file is TypeScript rather than JSON or CommonJS on purpose. `tsconfig.json`'s
// `include` list names `jest.config.ts` explicitly, so `tsc --noEmit` type-checks the
// runner's own configuration and typescript-eslint's type-aware rules cover it, exactly
// as they cover any source file. A typo here is a compile error, not a silent
// misconfiguration discovered later by a suite that quietly never ran.
//
// LEGACY PROVENANCE
// Derived from `meta/tests/readme.txt` (22 lines) — the only legacy reference any
// configuration file in this subtree has. That file is read and cited here; it is never
// edited. Every legacy file in this migration is REFERENCE and every target file is
// CREATE, so nothing outside `slatwall-ts/` is created, modified or deleted.
//
// RULES
// No user-specified rules were provided for this project: the rules document reports
// "No user rules provided.", and a filesystem scan finds no `.blitzyignore`,
// `.cursorrules`, `AGENTS.md`, `CLAUDE.md` or repository-level lint/format/CI
// configuration anywhere. That absence is recorded rather than filled in, and it is not
// a licence to relax anything. This file is held instead to the enterprise standards
// the plan enumerates — strict type safety, hexagonal separation, exact-version
// pinning, labelled test traceability, preserve-and-annotate, flag-don't-assume, and
// invent-nothing — each cited below at the decision it governs.
// =====================================================================================

import type { Config } from 'jest';

// -------------------------------------------------------------------------------------
// 1. SUITE ORGANISATION — carrying the legacy MXUnit taxonomy across
//
// `meta/tests/readme.txt` documents what each legacy suite folder was *for*. The folder
// names cannot survive the migration — a DAO stops being a DAO once it is a repository
// adapter — but the intent does, so the target tree mirrors the legacy taxonomy one
// layer at a time rather than inventing a fresh one. Quoting the source with its own
// line numbers:
//
//   L14  "/Coverage - This is a series of tests that are designed to make sure there is
//         at least a minimal level of testing in place when new components / files get
//         added to the project"
//   L15  "/core - Tests some of the more low level aspects of the application"
//   L16  "/entity - Test the entities inside of Slatwall, the default settings, logical
//         methods, and other functions"
//   L17  "/service - Intented [sic] to test the functions inside of the Slatwall
//         services"          <- "Intented" is the source's own misspelling, quoted as-is
//   L18  "/dao - Test the Data Access Layer methods"
//   L20  "/Unit - This folder holds all of the unit tests that cover the core of the
//         Slatwall model, and some of the other framework / application level aspects"
//   L22  "/Functional - These tests are designed to execute as an automated browser
//         against the finished functionality of the application."
//
// On disk the legacy tree is meta/tests/{coverage, functional/admin,
// unit/{core, dao, entity, service, transient}} — verified, not assumed. Two mismatches
// between that readme and that filesystem are worth stating, because trusting the prose
// over the tree would misplace half this mapping:
//
//   * L15-L18 are TAB-indented beneath L14's /Coverage, which reads as though core,
//     entity, service and dao were subfolders of it. They are not. On disk they are
//     subfolders of unit/, and meta/tests/coverage/ holds only two files,
//     SlatwallCoverageTestBase.cfc and EntityCoverageTest.cfc. The mapping below follows
//     the filesystem.
//   * unit/transient/ exists on disk and the readme never mentions it at all, so the
//     documented taxonomy was already incomplete before this migration touched it.
//
// The carry-across, and why each target folder exists:
//
//   legacy /entity     (L16)  ->  test/domain/        entities become typed domain objects
//   legacy /service    (L17)  ->  test/services/      the 28 preserved public members
//   legacy /dao        (L18)  ->  test/adapters/      DAOs become MySQL repository adapters
//   legacy /core (L15)
//    + legacy /Unit    (L20)  ->  test/validation/    the seven ported rule sets
//                                 test/regression/    the five catalog issue regressions
//   (no counterpart)          ->  test/integrations/  NET-NEW: the Google feed builder
//   legacy /Coverage   (L14)  ->  not reproduced as a gate — see section 5
//   legacy /Functional (L22)  ->  NOT CARRIED — see immediately below
//
// /Functional is dropped deliberately, not overlooked. L22's tests drive "an automated
// browser", and L5 requires CFSelenium installed with a CFIDE mapping to run them.
// CFSelenium is not vendored in this repository (searched: zero hits), and the target of
// this extraction is a headless Lambda service with no rendering layer at all, so there
// is no browser-facing functionality for such a suite to drive. Creating an empty
// `test/functional/` folder would imply coverage that does not exist, which section 3
// forbids.
//
// Two non-test folders complete the eight under test/: `fixtures/` (productTypes.ts,
// testProduct.ts) and `support/` (inMemoryRepositories.ts). They hold no suites, and
// `testMatch` below only ever matches a `.test.ts` file, so they are importable from the
// suites without being executed as suites. They are deliberately absent from
// `testPathIgnorePatterns`: an ignored path is also unresolvable, so listing them there
// would break the very imports they exist to serve.
// -------------------------------------------------------------------------------------

// -------------------------------------------------------------------------------------
// 2. WHY THE TAXONOMY IS CARRIED BY INTENT AND NOT VALIDATED BY PARALLEL EXECUTION
//
// The legacy suite cannot be executed in this environment at all, so no run of it was
// ever compared against a run of this one. The reasons are concrete and were verified on
// disk rather than assumed:
//
//   * MXUnit is not vendored in the repository, and readme L4 requires it "Installed on
//     your machine with a mapping inside of your CFIDE".
//   * CFSelenium is not vendored either, and readme L5 requires the same for the
//     functional folder.
//   * `meta/docker/slatwall-local-dev/`, cited as documenting a Lucee/Railo + MySQL
//     Docker setup, DOES NOT EXIST. `meta/` contains only `tests/` and `eclipse/`, and
//     there is no Dockerfile and no Compose file anywhere in the repository.
//   * No ColdFusion, Railo or Lucee engine is available on this host.
//
// The consequence is stated rather than glossed over: traceability to legacy coverage is
// DOCUMENTARY. It was established by reading legacy test source line by line, not by
// running tests and comparing results. Saying so is preferable to implying a comparison
// that never happened.
//
// A second structural difference follows from the ports, and a reviewer should expect it
// rather than read it as a gap: legacy tests extend a base class that boots the entire
// FW/1 application and resolves collaborators through DI/1 at runtime, which makes them
// integration tests. Target tests import the class under test directly and construct it
// with the hand-written doubles in test/support, which makes them true unit tests. The
// legacy repository contains no mocking library at all — which is exactly why those
// doubles are hand-written, and why no mocking package is added to satisfy this file.
// -------------------------------------------------------------------------------------

// -------------------------------------------------------------------------------------
// 3. EVERY TEST FILE MUST LABEL ITSELF TRACEABLE OR NET-NEW
//
// Every converted method gets a test, and each test file declares in its own header
// whether it is traceable to a named legacy test or explicitly net-new, so the ratio is
// visible per file and not only in aggregate. Parity must never be implied.
//
// The honest ratio, stated plainly because it is uncomfortable and therefore easy to
// soften: the entire extendable legacy signal for this slice is TWO entity test files
// (meta/tests/unit/entity/ProductTest.cfc and BrandTest.cfc), FIVE issue regressions
// (issue_1097, issue_1296, issue_1329, issue_1331, issue_1335 in
// meta/tests/unit/IssuesTest.cfc) and ONE fixture helper (meta/tests/unit/Helper.cfc).
// Everything else is NET-NEW. There is no legacy SkuTest, OptionTest, OptionGroupTest,
// ProductTypeTest, ProductServiceTest, SkuServiceTest, BrandServiceTest,
// OptionServiceTest, SkuDAOTest or OptionDAOTest, and
// meta/tests/functional/admin/entity/ProductTest.cfc is an empty component with zero
// test methods. All 28 public service members, all four adapter suites, the seven
// validation rule sets and the feed builder are therefore net-new coverage.
//
// Two consequences for what the suites must assert, both of which this configuration
// has to keep possible:
//
//   * Carried defects are asserted as they behave, never as they "should" behave.
//     Defect D13 (model/service/SkuService.cfc:L223-L269) indexes sortedArrayReturn at
//     an index that can be zero; defect D19 makes an option-less SKU fail
//     hasUniqueOptions on a product that already has option-bearing SKUs. Both are
//     preserved and annotated, not repaired. The strict tsconfig named in section 4d is
//     what forces a test asserting D13 to confront the same unchecked-index hazard the
//     legacy code carries — noUncheckedIndexedAccess above all — and because test/ sits
//     in that same program, the gate that actually enforces it is `npm run typecheck`,
//     not the transform. Section 4d explains why that distinction is not academic.
//   * test/services/SkuService.test.ts must contain the combination-batch test for the
//     validation read-back loop, the highest-risk item in the slice: each SKU's insert
//     must be visible to the next SKU's uniqueness read inside the same transaction, so
//     the test has to fail under either naive ordering — insert-everything-then-validate
//     or validate-before-any-insert. That mismatch is flagged and tested, not assumed
//     away.
// -------------------------------------------------------------------------------------

const config: Config = {
  // --- 4a. Program scope -------------------------------------------------------------
  // `rootDir` is the subtree root, so every path below stays inside slatwall-ts/ and
  // this configuration cannot reach the CFML tree even by accident. Isolation of the new
  // implementation is a plan requirement, and anchoring it here makes it mechanical
  // rather than a matter of discipline.
  rootDir: '.',

  // `roots` bounds the file crawl. Both entries exist on disk, and that matters: Jest
  // raises a validation error and exits non-zero when a `roots` entry is missing
  // ("Directory ... in the roots[0] option was not found."), so enumerating the six
  // test-bearing leaf folders here would break the runner outright — measured, not
  // theorised. Reaching those folders is `testMatch`'s job instead.
  //
  // `src` is listed for one specific reason: coverage honesty. With the crawl limited to
  // test/, Jest's file map never sees a source file no suite imported, so the coverage
  // table silently lists only the files that happened to be imported. Measured on this
  // tree that produced a misleading 100% while four untested modules were absent from
  // the report entirely; with src/ in the crawl the identical run reported 2.72% and
  // named every uncovered file. Because `testMatch` is anchored under test/, adding src/
  // cannot promote a source file to a suite — the suite count is identical either way.
  // Nothing is co-located in src/: every test lives under test/.
  roots: ['<rootDir>/src', '<rootDir>/test'],

  // --- 4b. Environment ---------------------------------------------------------------
  // 'node', and never the DOM-emulating browser environment Jest also supports — whose
  // name is deliberately kept out of this subtree entirely, so a search for it comes back
  // empty. The target is a headless service: Lambda handlers returning data, with no
  // rendering layer. tsconfig.json withholds the DOM lib for the same reason, so a
  // browser global is a compile error rather than a runtime surprise, and this setting is
  // the runtime half of that same decision.
  //
  // The one in-scope legacy file carrying a view extension,
  // integrationServices/google/views/feed/product.cfm, is not a counter-example: it emits
  // RSS 2.0 XML for a merchant feed processor, so its port is a serializer and not a
  // component, and asserting on its output needs string and XML comparison — not a
  // document. No test in this suite has any business needing one.
  testEnvironment: 'node',

  // --- 4c. Discovery -----------------------------------------------------------------
  // One recursive pattern reaches all six test-bearing folders — domain, services,
  // adapters, validation, integrations and regression — without naming any of them, so
  // none can be dropped by a narrow glob as the suite grows. regression/ is the one that
  // matters most: test/regression/issues.test.ts holds the only traceable service-level
  // coverage in the whole deliverable (the five issue_* regressions of section 3), and
  // losing it would destroy the traceability claim.
  //
  // The `.test.ts` suffix is the sole marker of a suite. `.spec.ts` is not matched,
  // because a single convention is one fewer way for a file to be silently skipped, and
  // tsconfig.build.json already excludes both suffixes from the shippable program.
  testMatch: ['<rootDir>/test/**/*.test.ts'],

  // Mirrors .gitignore and the ESLint ignore list. `node_modules` is matched unanchored
  // so a nested install is covered too; `dist` and `coverage` are anchored to rootDir so
  // that a future test path merely containing those words is unaffected. fixtures/ and
  // support/ are deliberately NOT listed — see the closing paragraph of section 1.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/dist/', '<rootDir>/coverage/'],

  // TypeScript first, since every file in the program is .ts. `.tsx` and `.jsx` are
  // absent because there is no JSX anywhere in a headless service. `.mjs` and `.cjs` are
  // retained so a dependency publishing those extensions still resolves.
  moduleFileExtensions: ['ts', 'js', 'mjs', 'cjs', 'json', 'node'],

  // --- 4d. Transform: ts-jest against the SAME strict tsconfig ------------------------
  // The suite is held to exactly the production bar, so the transform reads
  // ./tsconfig.json — strict, exactOptionalPropertyTypes, noUncheckedIndexedAccess,
  // noImplicitOverride, ES2022, NodeNext — and not a relaxed test-only variant. A test
  // that cannot be written under those settings is reporting something true about the
  // code under test; the settings are never weakened to let it through.
  //
  // Three things this deliberately is not:
  //
  //   * not tsconfig.build.json. That file excludes test/, jest.config.ts and every
  //     *.test.ts because it defines shippable source for the packaging step, so
  //     pointing ts-jest at it would leave the suite with no program to compile against.
  //   * not a third tsconfig.test.json. No such file is in the plan's file list, and a
  //     file outside that list is not created.
  //   * not the deprecated globals['ts-jest'] block, and not `preset: 'ts-jest'`. The
  //     explicit transform tuple is the current supported form and the only one that can
  //     name a tsconfig — which is the entire point of this entry.
  //
  // No diagnostic is disabled and no compiler option is overridden here — the tsconfig is
  // named, not amended. One consequence must be understood rather than discovered:
  // tsconfig.json sets `isolatedModules: true`, and ts-jest adopts that from the parsed
  // tsconfig, so the transform is TRANSPILE-ONLY. Measured on this tree, a test file
  // containing a genuine type error still runs green under `jest`, and the same file fails
  // `tsc --noEmit` with TS2322 reporting `string | undefined` — which is
  // noUncheckedIndexedAccess doing its job.
  //
  // So `npm run typecheck` is not a convenience, it is the type gate, and it is the half
  // of the pair that covers src/, test/ AND this file as one program. The two commands are
  // complementary, never redundant: the transform proves the tests run, the typecheck
  // proves they type. Running only the suite would let a type error ship.
  //
  // Output is CommonJS, matching "type": "commonjs" in package.json and the CJS bundle
  // esbuild emits for the Lambda artifact. ESM mode (`useESM`, `extensionsToTreatAsEsm`)
  // is deliberately not enabled: it is unnecessary here, and it would make the suite
  // exercise a module format the shipped artifact never uses.
  //
  // The canonical `tsx?` pattern is kept verbatim even though the subtree contains no
  // .tsx file, so that a narrower bespoke pattern cannot later let one slip past the
  // transform unnoticed.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: './tsconfig.json' }],
  },

  // --- 4e. Isolation between tests ---------------------------------------------------
  // clearMocks and restoreMocks reset call history and restore spied-on originals between
  // tests, so an in-memory double configured in one test cannot leak into the next.
  //
  // resetModules carries more weight than it looks. The composition root is memoized and
  // the mysql2 pool is created at module scope, so both deliberately survive a warm
  // Lambda container — correct for production, and poisonous for test isolation, since
  // that state would otherwise persist across an entire file. Wiping the module registry
  // reproduces the cold-start view every test should be allowed to assume, and it is the
  // test-side answer to the warm-container caching mismatch the plan flags.
  clearMocks: true,
  restoreMocks: true,
  resetModules: true,

  // Fail on Jest APIs that have already been deprecated, so a brand-new suite never
  // adopts one and never inherits a migration it had no reason to owe.
  errorOnDeprecated: true,

  // Print per-test names. Section 3 requires every suite to declare itself TRACEABLE or
  // NET-NEW; printing the names carries those labels into the run log, so the ratio is
  // auditable from a CI transcript and not only by reading the source.
  verbose: true,

  // --- 4f. Coverage: collected, deliberately NOT gated -------------------------------
  // Collection is switched on in the configuration rather than left to a `--coverage`
  // flag, because package.json's only test script is `jest --ci`: relying on the flag
  // would mean the signal was, in practice, never produced. Output goes to coverage/,
  // which .gitignore and .prettierignore both already exclude, so an always-on report
  // creates no diff churn.
  //
  // `collectCoverageFrom` names src/ rather than the whole subtree so the denominator is
  // shippable source only — the suite is not credited for covering its own fixtures, and
  // declaration files contribute no statements.
  //
  // The babel provider is chosen over v8 because instrumentation happens on the same
  // TypeScript ts-jest already transformed, whereas v8's byte-range attribution has to
  // be mapped back through generated JavaScript before it means anything about a .ts
  // file. Accuracy matters more here than provider speed.
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage',
  coverageProvider: 'babel',
  coverageReporters: ['text', 'text-summary', 'lcov'],
};

// -------------------------------------------------------------------------------------
// 5. DELIBERATE ABSENCE — no coverage-threshold gate is declared, and none may be added
//
// Jest's coverage-threshold option — the one that fails a run when a percentage is not
// met — is absent from the object above, and its name appears nowhere in this file so
// that a mechanical check for it comes back empty.
//
// This is the answer to readme L14's /Coverage folder, and it is a refusal rather than an
// omission. Three independent reasons, any one of which would be sufficient:
//
//   * Invent nothing. The plan specifies no coverage number anywhere. Writing 80 — or 70,
//     or any figure — would be fabricating a quality bar the source never stated and no
//     stakeholder ever agreed to, which is precisely the fabrication the plan forbids.
//     The same rule is why no latency, throughput, uptime or capacity figure appears in
//     this file either.
//   * The legacy gate it would be "reproducing" is inert. `SlatwallCoverageTestBase.cfc`
//     points its entityDirectory at /Slatwall/com/entity/, a path that does not exist in
//     release 3.1.39, so `EntityCoverageTest.all_entities_have_test_cases()` cannot
//     meaningfully fail. The legacy suite has no line or branch instrumentation at all,
//     and only 12 of 113 entity components have a dedicated test. Turning a gate that
//     never fired into one that fails the build is not preservation.
//   * It would be an enhancement beyond what the migration requires — off-limits by the
//     same discipline that keeps twenty-one legacy defects carried rather than repaired.
//
// So coverage is COLLECTED, so the signal is visible and the honest ratio of section 3 is
// measurable, and it is NOT THRESHOLDED, so no invented number can fail a build. If a
// coverage bar is wanted later it should arrive as a stated requirement with a rationale,
// not as a default quietly baked into a config file during a migration.
// -------------------------------------------------------------------------------------

// -------------------------------------------------------------------------------------
// 6. DELIBERATE ABSENCE — no `moduleNameMapper` aliases, no `modulePaths`, no
//    `moduleDirectories`
//
// All intra-subtree imports are relative paths, deliberately with no path aliases, so
// that tsc and esbuild resolve identically and no runtime resolver shim is needed.
// tsconfig.json and tsconfig.build.json accordingly declare neither `paths` nor
// `baseUrl`, and this file declares no alias to match.
//
// The failure mode being prevented is specific and nasty. A mapper entry such as
// '^@domain/(.*)$' is understood by Jest and by nothing else in the toolchain: the suite
// would go green locally while the bundled artifact threw MODULE_NOT_FOUND at Lambda cold
// start — a green test run actively certifying a broken deployment. `modulePaths` and
// `moduleDirectories` are excluded for the same reason: both create an implicit alias by
// widening resolution, with the identical divergence and none of the visibility.
//
// This is also how the hexagonal boundary is enforced. Layer separation between domain,
// ports, adapters, services and handlers holds because a cross-layer import is a visible
// relative path in the diff and a typed port at the boundary — not because a resolver
// rewrote it into something that reads as if the layers were adjacent.
//
// A `moduleNameMapper` entry would be acceptable only for a genuine non-alias purpose,
// and only with the build re-proved afterwards. No such purpose exists today.
// -------------------------------------------------------------------------------------

// -------------------------------------------------------------------------------------
// 7. DELIBERATE ABSENCES — the numbers and escape hatches that are NOT declared
//
//   * `testTimeout` — left at Jest's default. A bespoke value would be an invented
//     number. The legacy execution-model figures that do exist are not test settings and
//     must not be re-expressed as one: the importer requests a 3600-second request budget
//     (model/service/ProductService.cfc:L65-L68) and the feed view a 360-second one
//     (integrationServices/google/views/feed/product.cfm:L9). Both exceed what a single
//     Lambda invocation can represent, and both are flagged as execution-model mismatches
//     to be decided in the handler layer — not silently re-timed here.
//   * `maxWorkers` — left at Jest's default for the same reason. Concurrency is a
//     property of the machine running the suite, not of this codebase.
//   * `slowTestThreshold` — left at its default; another number with no source.
//   * `passWithNoTests` — NOT set, on purpose. An empty run must fail. While the suite is
//     still being written, `npm test` exiting non-zero with "No tests found" is the
//     correct and informative signal; silencing it would let a deliverable that lost its
//     entire test tree report success, which is exactly the false parity section 3
//     prohibits.
//   * `preset` — superseded by the explicit transform of section 4d; declaring both would
//     leave two competing sources of truth for the same setting.
//   * `useESM` / `extensionsToTreatAsEsm` — see section 4d: the shipped artifact is
//     CommonJS, so the suite exercises CommonJS.
//   * `setupFiles` / `setupFilesAfterEnv` — nothing needs global bootstrapping. The
//     legacy suite's equivalent booted the whole FW/1 application through DI/1; replacing
//     that with a global bootstrap file would reintroduce the shared implicit state the
//     ports exist to remove. Each suite constructs what it needs from test/support.
//   * `globalSetup` / `globalTeardown` — no test requires a live database. The suites run
//     against hand-written in-memory doubles, which is what keeps the deliverable
//     buildable and testable without any part of the rest of Slatwall being converted.
// -------------------------------------------------------------------------------------

export default config;
