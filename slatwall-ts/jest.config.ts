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
//   2. `jest-config@30.4.2` reads a TypeScript CONFIG FILE exactly two ways: natively,
//      when the running Node reports type-stripping support, or otherwise through one of
//      precisely two loaders — named by a `@jest-config-loader` docblock, defaulting to
//      `ts-node`, and any other loader name rejected outright. Read it in the installed
//      copy: `node_modules/jest-config/build/index.js` computes
//      `docblockPragmas['jest-config-loader'] || 'ts-node'`, and `registerTsLoader` accepts
//      only `ts-node` or `esbuild-register` before throwing
//      "'<loader>' is not a valid TypeScript configuration loader."
//   3. Node 20.20.2, the runtime .nvmrc pins (engines ">=20.20.2"), reports no
//      type-stripping support at all: `process.features.typescript` is `undefined`,
//      measured on this host, because that flag first appears in the 22.x line.
//      ⚠️ READ THE TWO FIGURES AS THE TWO DIFFERENT THINGS THEY ARE, EVEN THOUGH THEY NOW AGREE.
//      `.nvmrc` pins the EXACT version this toolchain was verified against, 20.20.2. `package.json`
//      declares the FLOOR. A pin is not a floor, and quoting one where the other belongs is the
//      near-miss this line exists to prevent — they coincide at present, which makes the confusion
//      easier rather than harder.
//      ⭐ THE FLOOR IS ">=20.20.2", AND IT HAS MOVED TWICE. AAP 0.5.3.1 DERIVES ">=20.19.0" from
//      eslint@10.8.0's `^20.19.0`, the highest lower bound anywhere in the dependency graph, and
//      explains why a bare ">=20" is wrong: an install could land on 20.0-20.18 and fail lint. One
//      revision raised the floor to the pin, a review recorded that as its finding F1 and it was
//      returned to the derived value — and the CURRENT review's finding F6 requires ">=20.20.2",
//      because that is the floor the project's verified setup contract states and the version the
//      whole toolchain was validated against. The derived value is a LOWER bound on what the graph
//      tolerates, not a ceiling on what the project may require, so declaring the verified version
//      states a real constraint rather than inventing one; every version it admits also satisfies
//      AAP 0.5.3.1's derivation. Review finding F12 (CWE-1104) turns on the `engines` field, so it is
//      quoted here exactly as the manifest declares it — a disclosure argued from a misquoted floor
//      is worth nothing. build/esbuild.mjs carries the F12 lifecycle gate itself.
//
// ⭐ NEITHER LOADER OF FACT 2 IS IN THE DEPENDENCY INVENTORY, AND NEITHER MAY BE ADDED. AAP 0.5.2.2
// freezes the development set at exactly TEN packages — typescript, @types/node, @types/aws-lambda,
// jest, ts-jest, @types/jest, esbuild, eslint, typescript-eslint, prettier — and `ts-node` and
// `esbuild-register` are neither of them. An earlier revision declared `ts-node` as an eleventh
// package and recorded the excess in a `"//dependencyInventory"` member of the manifest; review
// finding F2 rejected that as documenting a deviation instead of fixing it, and required the loading
// problem to be solved WITHIN the prescribed toolchain. So it is, and the mechanism is this:
//
//     "test": "jest --ci --config package.json --preset ./jest.config.ts"
//
// Two flags, each doing one necessary job, and no loader anywhere:
//
//   * `--config package.json` STOPS IMPLICIT RESOLUTION FROM REACHING THIS FILE AS A CONFIG FILE.
//     `resolveConfigPath` returns an explicitly named path unexamined, so the `.ts` branch of
//     `readConfigFileAndSetRootDir` — the branch that demands a loader — is never entered. package.json
//     takes the JSON branch instead, and because the path ends in `package.json`, jest reads its `jest`
//     member; there is no such member, so the initial options are `{}` and `rootDir` becomes the
//     directory holding package.json. That is this directory, which is why section 2's `<rootDir>`
//     patterns mean exactly what they meant before.
//   * `--preset ./jest.config.ts` THEN LOADS THIS FILE THROUGH NODE'S OWN CommonJS LOADER. Jest's
//     preset resolution `require`s the path it is given, and Node's CommonJS loader treats an
//     unrecognised extension as JavaScript — so a `.ts` file that contains no TypeScript-only syntax
//     loads with no transpiler at all. That is the retained property described in the consequences
//     below, and it is what makes the whole arrangement possible rather than merely clever.
//
// ⛔ WHY NOT A `jest` KEY IN package.json, WHICH WOULD LET THE SCRIPT STAY `jest --ci`. Because
// `resolveConfigPathByTraversing` collects BOTH the `jest.config.ts` it finds by extension scan AND the
// candidate a `jest` key names, and throws "Multiple configurations found" whenever it ends up with more
// than one. A key would therefore break a bare `npx jest` outright. `--config` with a JSON-encoded value
// was rejected too: quoting a JSON literal inside an npm script is shell-dependent, and the same string
// cannot survive both `sh` and `cmd.exe`. Two flags naming two real files survive both.
//
// ⚠️ ONE CONSEQUENCE, STATED PLAINLY: `npm test` IS THE ENTRY POINT AND A BARE `npx jest` IS NOT.
// Run bare, jest resolves this file implicitly, needs a loader for it, and fails with
// "'ts-node' is required for the TypeScript configuration files." That is not a defect to be patched by
// installing a loader — it is the visible cost of holding the dependency inventory to ten while keeping
// the plan-mandated filename, and the two flags are the whole of the workaround. Every command that
// inspects the resolved configuration needs them too:
//
//     npx jest --config package.json --preset ./jest.config.ts --showConfig
//     npx jest --config package.json --preset ./jest.config.ts --listTests
//
// MEASURED, NOT ASSUMED. With `node_modules/ts-node` renamed away, the two-flag invocation resolved a
// configuration byte-identical to the loader route's — every key equal, differing only in the random
// `seed` and in the derived config `id` hash — and ran the whole suite green. `preset` is still reported
// as null in that resolved project configuration, because jest consumes the option during normalisation
// rather than carrying it through.
//
// THREE CONSEQUENCES, STATED RATHER THAN HIDDEN
//   * `npm test` is the entry point, and the two flags above are part of it rather than something a
//     reader is expected to remember. There is still exactly one source of truth for every setting: the
//     object below. package.json carries no `jest` key, so nothing can override it from there.
//   * This file contains no TypeScript-only syntax, and ends with `module.exports = config` rather than
//     `export default`, matching "type": "commonjs" in package.json and the CommonJS bundle esbuild
//     emits. ⚠️ THAT IS NOW A LOAD-BEARING REQUIREMENT RATHER THAN A RETAINED PREFERENCE: the preset
//     route above is Node's plain CommonJS `require`, which cannot parse a type annotation or an ES
//     export. Adding either would break `npm test` immediately. Measured:
//     `node -e "require('./jest.config.ts')"` succeeds. A JSDoc `@type` tag is still not used in place
//     of an annotation — the compiler ignores JSDoc types in a .ts file, measured, so writing one
//     would imply a check that never runs.
//   * `tsconfig.json`'s `include` names this file, so it is a program file: `tsc --listFiles`
//     lists it, and `tsc --noEmit` plus typescript-eslint's type-aware rules both cover it. Those two
//     are what type-check this file despite it being loaded untranspiled. The resolved runtime
//     configuration is nevertheless verified by reading `--showConfig` rather than inferred from this
//     source, because a setting Jest does not recognise is a run-time fact about Jest and not a type
//     error.
//
// One thing this is NOT: `preset: 'ts-jest'` is not in play, and neither is any preset key inside the
// object below. The `--preset` flag names THIS FILE, so the "preset" is the configuration itself rather
// than a package's opinionated defaults; the ts-jest TRANSFORM is declared explicitly in section 4d for
// the reasons given there.
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
  // directory unaided: Jest anchors `rootDir` at the directory of the configuration file it
  // loaded, which IS this directory. The two agree by construction — `npx jest --showConfig`
  // reports this directory either way — and stating the value keeps every `<rootDir>` token
  // below readable on its own terms instead of depending on where the runner was invoked from.
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
  // Collection is switched on in the CONFIGURATION rather than left to a `--coverage`
  // flag, so the signal is produced by every run and cannot be lost by a script that forgot
  // to ask for it. `package.json` also declares a `test:coverage` script that passes the flag
  // explicitly, so the intent is addressable by name as well as always-on — the two are
  // deliberately redundant rather than alternatives.
  //
  // ⚠️ THAT SCRIPT WAS REMOVED FOR ONE REVISION AND REVIEW FINDING F6 RESTORED IT, ALONG WITH
  // `format:check`. The removal read AAP 0.4.1.2's `build`/`test`/`lint`/`typecheck` list as a
  // CLOSED set and called a fifth script "outside the frozen four". That section declares which
  // scripts the manifest must carry; it does not forbid others, and the project's verified
  // command contract names all six — so removing two left two documented commands that did not
  // exist. Collection stays declared here regardless, which is what makes the pair costless.
  // Output goes to coverage/,
  // which .gitignore already excludes — and Prettier 3 honours .gitignore, so the same
  // single entry covers the formatter too, with no separate .prettierignore to keep in
  // sync. slatwall-ts/.gitignore is the one place that records that file's removal and the
  // measurement behind it. An always-on report therefore creates no diff churn.
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
//
// ⚠️ ONE CANDIDATE MAPPER WAS PROPOSED, MEASURED AND REJECTED, AND THE MEASUREMENT IS
// WORTH KEEPING. A QA pass found that the five per-surface Lambda entries under
// src/handlers/ could not be invoked from their TypeScript sources at all: each reached
// the composition root through `await import('../config/container.js')`, and the
// suggested remedy was the canonical NodeNext recipe
// `moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' }` so ts-jest would resolve the `.js`
// specifier to the `.ts` source.
//
// It cannot work, and the reason is not a matter of taste. ts-jest compiles against the
// tsconfig named in section 4d and does NOT force `module` to CommonJS, so NodeNext's
// emit rule applies: a native `import()` is PRESERVED in CommonJS output. A native
// `import()` is executed by the host, not by Jest — the specifier never reaches
// jest-resolve, so no mapper entry is ever consulted — and inside Jest's VM the call
// fails outright with "A dynamic import callback was invoked without
// --experimental-vm-modules". Measured directly by invoking a per-surface entry from a
// scratch suite before and after adding the mapper: the mapper changed nothing.
//
// The fix therefore belonged in the source, not here. Those five entries now defer the
// composition root through a CommonJS `require` with an extensionless specifier, which
// Jest's own resolver handles, which a plain `tsc` emit resolves identically,
// and which esbuild bundles exactly as before. `test/handlers/entrySurface.test.ts` §5
// invokes all five as a result. No relative `.js`-suffixed specifier remains anywhere in
// src/ or test/, so the mapper would now match nothing even if it were declared — while
// still being able to mis-resolve a dependency's own internal `./x.js` require, since
// moduleNameMapper applies to every module request in the process and not only to
// first-party ones. Absent is the correct state, and it stays absent by evidence rather
// than by preference.
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
//     competing sources of truth for the same setting. No `preset` KEY exists anywhere else
//     either: package.json carries no `jest` key at all. ⚠️ NOT TO BE CONFUSED WITH THE
//     `--preset` FLAG in the `test` script, which names THIS FILE and is how the file is
//     loaded without a TypeScript loader — see HOW JEST LOADS IT in the header. The resolved
//     project configuration still reports `preset` as null, measured, because jest consumes
//     the option during normalisation instead of carrying it through.
//   * `useESM` / `extensionsToTreatAsEsm` — see section 4d: the shipped artifact is
//     CommonJS, so the suite exercises CommonJS.
//   * `setupFiles` / `setupFilesAfterEnv` — nothing needs global bootstrapping. A global
//     bootstrap file would reintroduce the shared implicit state the ports exist to
//     remove; each suite constructs what it needs from test/support.
//   * `globalSetup` / `globalTeardown` — no suite is permitted to require a live
//     database, which is what keeps the deliverable buildable and testable without any
//     part of the rest of Slatwall being converted.
// -------------------------------------------------------------------------------------

// CommonJS export, not `export default`, matching "type": "commonjs" in package.json.
//
// ⛔ DO NOT CHANGE THIS LINE TO `export default config`, AND DO NOT ANNOTATE `config` ABOVE. Jest reaches
// this file through `--preset ./jest.config.ts`, which is Node's plain CommonJS `require` — no
// transpiler is involved, and an ES export or a type annotation is syntax Node cannot parse, so either
// one breaks `npm test` on the first invocation. Consequence 2 of HOW JEST LOADS IT in the header carries
// the full derivation; this is the line it is about.
module.exports = config;
