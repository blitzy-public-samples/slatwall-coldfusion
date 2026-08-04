// Jest configuration for the extracted Slatwall Catalog slice. Every Jest setting the suite
// runs under is declared here; nothing else in the subtree configures the runner.
//
// How Jest loads this file, and why the wiring looks the way it does. Three facts collide.
// AAP §0.3.1 and §0.4.1.2 require the file at this path as TypeScript, so it is neither
// renamed to .js nor replaced by JSON. Jest reads a TypeScript *config file* only two ways:
// Natively, when the running Node reports type-stripping support, or through one of exactly
// two loaders — `ts-node` (the default) or `esbuild-register`. Node 20 reports no
// type-stripping at all (`process.features.typescript` is `undefined`), and neither loader is
// in AAP §0.5.2.2's frozen ten-package development set, so neither may be added.
//
// The mechanism that resolves it, from package.json:
//
//     "test": "jest --ci --config package.json --preset ./jest.config.ts"
//
// `--config package.json` keeps implicit resolution from ever reaching this file as a config
// file, so the branch that demands a loader is not entered; package.json takes the JSON branch,
// has no `jest` member, and therefore only fixes `rootDir` to this directory. `--preset
// ./jest.config.ts` then loads this file through Node's own CommonJS loader, which treats an
// unrecognised extension as JavaScript.
//
// The constraint that follows is the one to respect when editing: this file must contain no
// TypeScript-only syntax. A type annotation, `satisfies`, an `import type` or an `enum` here
// stops the runner loading at all. That is also why a bare `npx jest` fails with
// `'ts-node' is required` — always go through `npm test`, adding `--` before any Jest flag.
//
// Two version figures appear nearby and are different things: `.nvmrc` pins the exact version
// this toolchain was verified against (20.20.2), while package.json's `engines` declares the
// floor (">=20.20.2"). A pin is not a floor.
//
// Suite organisation. One recursive `testMatch` reaches every test-bearing folder under test/,
// so none can be dropped by a narrow glob as the suite grows. `test/fixtures/` and
// `test/support/` are not excluded by a pattern; they simply do not end in `.test.ts`, which is
// why they hold no cases and need no ignore entry.
//
// Provenance labelling. Every declaration in every suite opens with its provenance — TRACEABLE or
// NET-NEW — and `verbose: true` below puts those labels in the run log so the ratio is auditable from
// a transcript. README §12.1 holds the census.
//
// Two spellings of the label are in use, and this note used to claim only the bracketed one, which
// sent a reader grepping for a form that in one case does not occur at all. Measured across the
// suites: `[NET-NEW]` occurs several hundred times, in about half the files; the bare `NET-NEW` is
// the majority form; the bare `TRACEABLE` is the ONLY form the traceable label takes, so
// `grep '\[TRACEABLE\]'` returns nothing anywhere. Both spellings appear inside single files.
//
// Neither the runner nor the census cares, which is why the divergence is recorded rather than
// normalised across hundreds of titles: `test/regression/issues.test.ts`'s census strips a leading
// run of `[`, `(`, `*`, `_` or whitespace from each title before testing the prefix, so a bracketed
// and a bare label are the same label to it, and it fails the run if any declaration carries neither.
// To find them yourself, match the label without assuming a bracket:
//
//     grep -rEc "\b(it|test)\(\s*.?\[?(TRACEABLE|NET-NEW)" test/

const config = {
  // --- 4a. Program scope -------------------------------------------------------------
  // `rootDir` is the subtree root, so every path below stays inside slatwall-ts/ and
  // this configuration cannot reach the CFML tree even by accident. Isolation of the new
  // implementation is a plan requirement, and anchoring it here makes it mechanical
  // rather than a matter of discipline.
  rootDir: '.',

  // `roots` bounds the file crawl, and both entries must exist on disk: Jest raises a
  // validation error and exits non-zero when a `roots` entry is missing, so enumerating
  // individual leaf folders here would break the runner. Reaching them is `testMatch`'s
  // job instead.
  roots: ['<rootDir>/src', '<rootDir>/test'],

  // --- 4b. Environment ---------------------------------------------------------------
  // 'node', and never the DOM-emulating browser environment Jest also supports — whose
  // name is deliberately kept out of this subtree entirely, so a search for it comes back
  // empty. The target is a headless service: Lambda handlers returning data, with no
  // rendering layer. tsconfig.json withholds the DOM lib for the same reason, so a
  // browser global is a compile error rather than a runtime surprise, and this setting is
  // the runtime half of that same decision.
  testEnvironment: 'node',

  // --- 4c. Discovery -----------------------------------------------------------------
  // One recursive pattern reaches every test-bearing folder under test/ without naming any
  // of them, so none can be dropped by a narrow glob as the suite grows.
  testMatch: ['<rootDir>/test/**/*.test.ts'],

  // Mirrors .gitignore and the ESLint ignore list. `node_modules` is matched unanchored
  // so a nested install is covered too; `dist` and `coverage` are anchored to rootDir so
  // that a future test path merely containing those words is unaffected. fixtures/ and
  // support/ are deliberately not listed — see the closing paragraph of section 1.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/dist/', '<rootDir>/coverage/'],

  // TypeScript first, since every file in the program is .ts. `.tsx` and `.jsx` are
  // absent because there is no JSX anywhere in a headless service. `.mjs` and `.cjs` are
  // retained so a dependency publishing those extensions still resolves.
  moduleFileExtensions: ['ts', 'js', 'mjs', 'cjs', 'json', 'node'],

  // --- 4d. Transform: ts-jest against the same strict tsconfig ------------------------
  // The suite is held to exactly the production bar, so the transform reads
  // ./tsconfig.json rather than a relaxed test-only variant. A test that cannot be written
  // under those settings is reporting something true about the code under test; the
  // settings are never weakened to let it through.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: './tsconfig.json' }],
  },

  // --- 4e. Isolation between tests ---------------------------------------------------
  // clearMocks and restoreMocks reset call history and restore spied-on originals between
  // tests, so an in-memory double configured in one test cannot leak into the next.
  clearMocks: true,
  restoreMocks: true,
  resetModules: true,

  // Fail on Jest APIs that have already been deprecated, so a brand-new suite never
  // adopts one and never inherits a migration it had no reason to owe.
  errorOnDeprecated: true,

  // Print per-test names, so the TRACEABLE / NET-NEW label each suite declares in its own
  // header reaches the run log and the ratio is auditable from a transcript.
  verbose: true,

  // --- 4f. Coverage: collected, deliberately not gated -------------------------------
  // Collection is switched on in the configuration rather than left to a `--coverage`
  // flag, so the signal is produced by every run and cannot be lost by a script, a flag or a
  // CI invocation that forgot to ask for it. Plain `npm test` therefore reports coverage.
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage',
  coverageProvider: 'babel',
  coverageReporters: ['text', 'text-summary', 'lcov'],
};

// Deliberate absences, each stated so it reads as a decision rather than an oversight.
//
// No coverage threshold is declared, and none may be added: a percentage nobody derived would be
// an invented figure (IR-12), and a gate that fails a build on it would make the coverage signal a
// budget instead of a measurement.
//
// No `moduleNameMapper`, `modulePaths` or `moduleDirectories`. Every intra-subtree import is a
// relative path, so `tsc`, `ts-jest` and `esbuild` resolve identically and no runtime resolver
// shim exists to drift.
//
// No `testTimeout`, `maxWorkers`, `bail`, `globalSetup`, `globalTeardown` or `setupFiles`. Each
// would be a figure or a hook this port has no source for; `--ci` in the test script covers the
// only environment-dependent behaviour the runner needs.

// CommonJS export, not `export default`, matching "type": "commonjs" in package.json.
module.exports = config;
