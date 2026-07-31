// =====================================================================================
// Jest configuration for the extracted Slatwall Catalog slice.
//
// WHAT THIS FILE IS
// The single test-runner contract for the whole subtree: one build, one test command,
// one dependency manifest, no coupling back into the CFML tree. Every Jest setting the
// suite runs under is declared here and nowhere else.
//
// HOW JEST LOADS IT, AND WHY THE WIRING LOOKS THE WAY IT DOES
// This is the one genuinely awkward mechanism in the toolchain, so it is documented in
// full rather than left to be rediscovered. Three facts collide:
//
//   1. The plan requires this file, at this path, as a TypeScript file (AAP 0.3.1 and
//      0.4.1.2), so it is neither renamed to .js nor replaced by JSON.
//   2. The dependency inventory is frozen at one runtime and TEN dev packages (AAP 0.5.2,
//      0.7.3 standard 5). Neither `ts-node` nor `esbuild-register` is among them, and
//      neither may be added.
//   3. `jest-config@30.4.2` reads a TypeScript CONFIG FILE exactly two ways: natively,
//      when the running Node reports type-stripping support, or otherwise through one of
//      precisely those two loaders — named by a `@jest-config-loader` docblock, defaulting
//      to `ts-node`, and any other loader name rejected outright. Node 20.20.2, the pinned
//      runtime (.nvmrc; engines ">=20.19.0"), reports no type-stripping support at all:
//      `process.features.typescript` is `undefined`, measured on this host, because that
//      flag first appears in the 22.x line.
//
// Jest therefore cannot read this file AS ITS CONFIG FILE under the pinned runtime and the
// frozen inventory. It can read it as a PRESET, and that is the wiring in place:
// package.json declares `"jest": { "preset": "./jest.config.ts" }`, and the `test` script
// runs `jest --ci --config package.json`. Jest's preset resolver accepts a `.ts` path and
// loads it with an ordinary `require`, which Node serves through its CommonJS loader — no
// TypeScript loader, no eleventh package, and every setting below merged into the run
// exactly as if this had been the config file itself. `npx jest --showConfig` is the
// proof: the resolved configuration is identical either way.
//
// THREE CONSEQUENCES, STATED RATHER THAN HIDDEN
//   * This file must contain no TypeScript-only syntax, because Node's CommonJS loader
//     compiles it as JavaScript. Hence `module.exports = config` at the foot rather than
//     `export default`, matching "type": "commonjs" in package.json and the CommonJS
//     bundle esbuild emits; and hence the object below carries no `Config` type
//     annotation, since an annotation is TypeScript-only syntax and would make the file
//     unloadable. A JSDoc `@type` tag is not a substitute — the compiler ignores JSDoc
//     types in a .ts file, measured, so writing one would imply a check that never runs.
//     `tsconfig.json`'s `include` still names this file, so `tsc --noEmit` and
//     typescript-eslint's type-aware rules still cover it as a program file.
//   * A preset's keys bypass Jest's unknown-option validator, which inspects only the
//     config file's own keys. A misspelled option here is silently ignored rather than
//     reported, so the resolved configuration is verified by reading
//     `npx jest --showConfig` instead of by trusting a warning that will not come.
//   * `npm test` — or any invocation passing `--config package.json` — is the entry point,
//     and the `test` script names the manifest explicitly for exactly that reason. A bare
//     `npx jest` in this directory exits 1 with "Multiple configurations found", listing
//     this file and the `jest` key side by side and directing the caller to `--config`,
//     because implicit resolution refuses to choose between two candidates. That is a
//     clear, actionable message rather than a silent mis-run. Removing the `jest` key to
//     quiet it would not help: implicit resolution would then select this file as a config
//     file and fail on the absent loader instead, per fact 3 above.
//
// One thing this is NOT: the `preset` key in package.json is a LOADING mechanism, not
// `preset: 'ts-jest'`. The ts-jest transform is declared explicitly in section 4d for the
// reasons given there, and the object below declares no `preset` key of its own.
//
// Suite organisation is derived from `meta/tests/readme.txt`, the only legacy reference
// any configuration file in this subtree has. That file is read and cited, never edited.
// =====================================================================================

// -------------------------------------------------------------------------------------
// 1. SUITE ORGANISATION — carrying the legacy MXUnit taxonomy across
//
// `meta/tests/readme.txt` documents what each legacy suite folder was for. The folder
// names cannot survive the migration — a DAO stops being a DAO once it is a repository
// adapter — but the intent does, so the target tree mirrors the legacy taxonomy one layer
// at a time rather than inventing a fresh one:
//
//   legacy /entity     (readme.txt:L16)  ->  test/domain/       entities become typed
//                                                               domain objects
//   legacy /service    (readme.txt:L17)  ->  test/services/     the preserved public
//                                                               member surface
//   legacy /dao        (readme.txt:L18)  ->  test/adapters/     DAOs become MySQL
//                                                               repository adapters
//   legacy /core       (readme.txt:L15)  ->  test/validation/   the ported rule sets
//    + legacy /Unit    (readme.txt:L20)      test/regression/   the catalog issue
//                                                               regressions
//   (no counterpart)                     ->  test/integrations/ the Google feed builder
//   legacy /Coverage   (readme.txt:L14)  ->  not reproduced as a gate — see section 5
//   legacy /Functional (readme.txt:L22)  ->  not carried — see below
//
// The readme's own indentation reads as though core, entity, service and dao were
// subfolders of /Coverage. On disk they are subfolders of unit/, and meta/tests/coverage/
// holds only its two coverage components, so the mapping above follows the filesystem
// rather than the prose. unit/transient/ exists on disk and the readme does not mention
// it, so the documented taxonomy was already incomplete.
//
// /Functional is dropped deliberately. Its tests drive an automated browser and require
// CFSelenium, which is not vendored in this repository, and the target of this extraction
// is a headless service with no rendering layer for such a suite to drive. An empty
// test/functional/ folder would imply coverage that does not exist.
//
// test/ also carries non-suite folders — fixtures and support — which hold no suites and
// are matched by no pattern below, so they are importable from the suites without being
// executed as suites. They are deliberately absent from `testPathIgnorePatterns`: an
// ignored path is also unresolvable, so listing them there would break the very imports
// they exist to serve.
// -------------------------------------------------------------------------------------

// -------------------------------------------------------------------------------------
// 3. EVERY TEST FILE MUST LABEL ITSELF TRACEABLE OR NET-NEW
//
// Each suite declares in its own header whether it is traceable to a named legacy test or
// explicitly net-new, so the ratio is visible per file and not only in aggregate. Parity
// of coverage is never implied. The extendable legacy signal for this slice is narrow —
// meta/tests/unit/entity/ProductTest.cfc, meta/tests/unit/entity/BrandTest.cfc, five
// issue regressions in meta/tests/unit/IssuesTest.cfc and the fixture helper
// meta/tests/unit/Helper.cfc — and the per-file labels are what keep that visible. The
// aggregate inventory belongs in the subtree README, not here.
//
// Two consequences for what the suites must assert, both of which this configuration has
// to keep possible:
//
//   * Carried defects are asserted as they behave, never as they "should" behave. Defect
//     D13 (model/service/SkuService.cfc:L223-L269) indexes an array at an index that can
//     be zero, and defect D19 makes an option-less SKU fail its uniqueness rule on a
//     product that already has option-bearing SKUs. Both are preserved and annotated, not
//     repaired. The strict tsconfig named in section 4d — noUncheckedIndexedAccess above
//     all — is what forces a test asserting D13 to confront the same unchecked-index
//     hazard the legacy code carries, and because test/ sits in that program the gate that
//     enforces it is the typecheck command rather than the transform.
//   * The SKU service suite must cover the validation read-back loop, the highest-risk
//     item in the slice: each SKU's insert has to be visible to the next SKU's uniqueness
//     read inside the same transaction, so the test must fail under either naive ordering
//     — insert-everything-then-validate, or validate-before-any-insert.
// -------------------------------------------------------------------------------------

const config = {
  // --- 4a. Program scope -------------------------------------------------------------
  // `rootDir` is the subtree root, so every path below stays inside slatwall-ts/ and
  // this configuration cannot reach the CFML tree even by accident. Isolation of the new
  // implementation is a plan requirement, and anchoring it here makes it mechanical
  // rather than a matter of discipline.
  //
  // It is declared rather than left implicit even though Jest would arrive at the same
  // directory unaided: given `--config package.json`, Jest anchors `rootDir` at the
  // manifest's own directory, which IS this directory. The two agree by construction, and
  // stating the value keeps every `<rootDir>` token below readable on its own terms
  // instead of depending on where the runner was invoked from.
  rootDir: '.',

  // `roots` bounds the file crawl, and both entries must exist on disk: Jest raises a
  // validation error and exits non-zero when a `roots` entry is missing, so enumerating
  // individual leaf folders here would break the runner. Reaching them is `testMatch`'s
  // job instead.
  //
  // `src` is listed for coverage honesty. With the crawl limited to test/, Jest's file map
  // never sees a source file no suite imported, so the coverage table reports only the
  // files that happened to be imported and silently omits untested modules. Because
  // `testMatch` is anchored under test/, adding src/ cannot promote a source file to a
  // suite. No test is co-located in src/: every suite lives under test/.
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
  // One recursive pattern reaches every test-bearing folder under test/ without naming any
  // of them, so none can be dropped by a narrow glob as the suite grows.
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
  // ./tsconfig.json rather than a relaxed test-only variant. A test that cannot be written
  // under those settings is reporting something true about the code under test; the
  // settings are never weakened to let it through.
  //
  // Three things this deliberately is not:
  //
  //   * not tsconfig.build.json — that file excludes test/, jest.config.ts and every
  //     *.test.ts because it defines shippable source, so pointing ts-jest at it would
  //     leave the suite with no program to compile against;
  //   * not a third tsconfig.test.json — a second set of compiler options for the same
  //     code is a second source of truth that can drift;
  //   * not the deprecated globals['ts-jest'] block and not `preset: 'ts-jest'` — the
  //     explicit transform tuple is the current supported form and the only one that can
  //     name a tsconfig, which is the entire point of this entry.
  //
  // No diagnostic is disabled and no compiler option is overridden here: the tsconfig is
  // named, not amended. One consequence must be understood rather than discovered.
  // tsconfig.json sets `isolatedModules: true` and ts-jest adopts that from the parsed
  // tsconfig, so the transform is TRANSPILE-ONLY — it does not report type errors. The
  // typecheck command is therefore the type gate, and it is the half of the pair that
  // covers src/, test/ and this file as one program. The transform proves the tests run;
  // the typecheck proves they type.
  //
  // Output is CommonJS, matching "type": "commonjs" in package.json and the CJS bundle
  // esbuild emits. ESM mode is deliberately not enabled: it would make the suite exercise
  // a module format the shipped artifact never uses.
  //
  // The canonical `tsx?` pattern is kept verbatim even though the subtree contains no
  // .tsx file, so a narrower bespoke pattern cannot later let one past the transform.
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

  // Print per-test names, so the TRACEABLE / NET-NEW label each suite declares in its own
  // header reaches the run log and the ratio is auditable from a transcript.
  verbose: true,

  // --- 4f. Coverage: collected, deliberately NOT gated -------------------------------
  // Collection is switched on in the configuration rather than left to a `--coverage`
  // flag, because package.json's only test script is `jest --ci`: relying on the flag
  // would mean the signal was, in practice, never produced. Output goes to coverage/,
  // which .gitignore already excludes — and Prettier 3 honours .gitignore, so the same
  // single entry covers the formatter too and no separate .prettierignore exists. An
  // always-on report therefore creates no diff churn.
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
// All intra-subtree imports are relative paths with no aliases, so tsc, ts-jest and
// esbuild resolve identically and no runtime resolver shim is needed. tsconfig.json and
// tsconfig.build.json declare neither `paths` nor `baseUrl`, and this file declares no
// alias to match.
//
// The failure mode being prevented is specific: a mapper entry such as '^@domain/(.*)$'
// is understood by Jest and by nothing else in the toolchain, so the suite would go green
// locally while the bundled artifact threw MODULE_NOT_FOUND at Lambda cold start — a
// green run certifying a broken deployment. `modulePaths` and `moduleDirectories` are
// excluded for the same reason: both create an implicit alias by widening resolution.
//
// Relative specifiers also keep the hexagonal boundary legible, because a cross-layer
// import stays visible as a path in the diff rather than being rewritten by a resolver.
// -------------------------------------------------------------------------------------

// -------------------------------------------------------------------------------------
// 7. DELIBERATE ABSENCES — the numbers and escape hatches that are NOT declared
//
//   * `testTimeout`, `maxWorkers` and `slowTestThreshold` — left at Jest's defaults. A
//     bespoke value would be an invented number, and concurrency is a property of the
//     machine running the suite rather than of this codebase. The legacy execution-model
//     figures that do exist are not test settings and must not be re-expressed as one:
//     the importer requests a 3600-second request budget
//     (model/service/ProductService.cfc:L65-L68) and the feed view a 360-second one
//     (integrationServices/google/views/feed/product.cfm:L9). Both exceed what a single
//     Lambda invocation can represent, and both are flagged as execution-model mismatches
//     to be decided in the handler layer — not silently re-timed here.
//   * `passWithNoTests` — NOT set, on purpose. An empty run must fail. While the suite is
//     still being written, `npm test` exiting non-zero with "No tests found" is the
//     correct and informative signal; silencing it would let a deliverable that lost its
//     entire test tree report success, which is exactly the false parity section 3
//     prohibits.
//   * `preset` — absent from the object above, and deliberately so. The explicit transform
//     of section 4d supersedes `preset: 'ts-jest'`, and declaring both would leave two
//     competing sources of truth for the same setting. The `preset` key that does exist,
//     in package.json, points AT this file: it is how Jest loads this configuration at all
//     (see HOW JEST LOADS IT in the header) and has nothing to do with the transform. Jest
//     does not nest presets, so a `preset` declared here would in any case be discarded in
//     favour of the outer one — one more reason the transform is named explicitly.
//   * `useESM` / `extensionsToTreatAsEsm` — see section 4d: the shipped artifact is
//     CommonJS, so the suite exercises CommonJS.
//   * `setupFiles` / `setupFilesAfterEnv` — nothing needs global bootstrapping. A global
//     bootstrap file would reintroduce the shared implicit state the ports exist to
//     remove; each suite constructs what it needs from test/support.
//   * `globalSetup` / `globalTeardown` — no suite is permitted to require a live
//     database, which is what keeps the deliverable buildable and testable without any
//     part of the rest of Slatwall being converted.
// -------------------------------------------------------------------------------------

// CommonJS export, not `export default`: Node's CommonJS loader compiles this file as
// JavaScript when Jest resolves it as a preset, so ES module syntax here would make the
// runner unable to start. See HOW JEST LOADS IT in the header for the full derivation.
module.exports = config;
