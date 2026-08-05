// ---------------------------------------------------------------------------
// slatwall-ts - the esbuild bundler configuration for the `nodejs20.x` Lambda artifacts.
//
// WHAT THIS FILE IS FOR, AND WHAT IT DELIBERATELY IS NOT
// "Deployable" in this port means exactly one thing: a successful build and package step emitting
// Lambda-compatible artifacts. This file produces the PACKAGE half of that proof; `tsc --noEmit`
// produces the BUILD half. There is no infrastructure-as-code in this subtree and none is planned,
// and no live deployment is performed here - no upload, no platform API call, no network access and
// no credential of any kind. Nothing in this file emits, references or templates an infrastructure
// artifact, and it must never be renamed or repurposed into a deploy step.
//
// It is invoked by three published `package.json` scripts and by nothing else:
//
//   node esbuild.config.mjs          `npm run bundle` / `npm run build` - bundle only
//   node esbuild.config.mjs --zip    `npm run package`                 - bundle, then archive
//
// EVERY PATH IT WRITES IS INSIDE `slatwall-ts/`. The only output location is `<subtree>/dist`, and
// the only removal it performs targets that one directory. `tsc -p tsconfig.build.json` writes to
// `<subtree>/build` instead, and that split is load-bearing rather than cosmetic: this file clears
// `dist` at the start of every run, so declarations emitted there would be destroyed by the next
// bundle. The two output trees never collide.
//
// LICENSE CONTINUITY. The bundled business logic is derived from Slatwall, released under the
// GPL v3.0 [readme.md:L20-L23], Copyright (C) ten24, LLC [readme.md:L33]. The special exception
// permitting custom code applies only to files under `/integrationServices/` [readme.md:L63-L65],
// so it does NOT extend to this subtree and standard GPL terms apply here; `NOTICE-GPL.md` records
// that in full. `legalComments: 'inline'` below is what keeps third-party notices travelling inside
// the artifact instead of in a sidecar file that a copy can lose.
//
// ---------------------------------------------------------------------------
// THE OUTPUT FORMAT IS CommonJS. THIS IS SETTLED, AND IT IS NOT A STYLE PREFERENCE.
//
// It was decided by reproducing the failure directly rather than by reading advice, so the evidence
// is recorded here and a future maintainer does not have to re-derive it. Bundling this exact
// dependency set to ESM BUILDS CLEANLY AND THEN FAILS AT RUNTIME:
//
//   Error: Dynamic require of "node:buffer" is not supported
//       at node_modules/sql-escaper/lib/index.js
//       at node_modules/mysql2/promise.js
//
// ROOT CAUSE: the MySQL driver's CommonJS dependency chain uses dynamic `require()`, which an ESM
// bundle cannot resolve. Three remedies were evaluated against a probe importing all three runtime
// dependencies - `decimal.js` 10.6.0, `mysql2` 3.23.1 and `zod` 4.4.3 - and two were verified:
//
//   OPTION A  --format=cjs
//             Executes correctly; the driver's pool factory resolves.
//             CHOSEN. Needs no shim, and matches the Lambda runtime's default CommonJS handler
//             resolution. This is what the options below configure.
//
//   OPTION B  --format=esm plus a synthetic CommonJS-require shim injected into the bundle
//             preamble through `banner`.
//             Also executes correctly.
//             NOT USED HERE. It is recorded in `README.md` as the validated alternative, in case a
//             future constraint forces ESM output. There is deliberately no `banner` in this file:
//             Option A needs no shim, and carrying one anyway would suggest the format question is
//             still open when it is not.
//
//   OPTION C  Mark the driver as an unbundled dependency and ship `node_modules`, or a runtime
//             layer.
//             Not tested.
//             REJECTED - it defeats single-artifact packaging.
//
// TWO CONSEQUENCES OF OPTION A THAT ARE EASY TO UNDO BY ACCIDENT:
//
//   * `format: 'cjs'` must not be "modernised" to ESM. `tests/traceability/legacyTestMap.ts`
//     asserts on this file's text so the drift fails the suite instead of passing unnoticed.
//   * The SOURCE TREE IS UNAFFECTED. `tsconfig.json` keeps `module` and `moduleResolution` at
//     `NodeNext` and `package.json` keeps `"type": "module"`; only the EMITTED BUNDLE FORMAT
//     differs. Do not change the TypeScript configuration to compensate, and do not "fix" the ESM
//     failure in `src/**` - it is a solved problem and Option A is the solution.
//
// Because `package.json` declares `"type": "module"`, a CommonJS payload in a `.js` file would be
// loaded as ESM and fail. `outExtension` therefore emits `.cjs`, which Node loads as CommonJS
// regardless of the surrounding package type, and which the Lambda runtime resolves for a
// `<file>.handler` entry. `README.md` documents the same decision.
//
// ---------------------------------------------------------------------------
// EXECUTION-MODEL FACTS THIS BUNDLE MUST NOT PAPER OVER
//
// Five legacy CFML execution behaviours have no analogue in the target runtime. None of them is a
// service-level commitment - the legacy system states none and none is invented here - they are
// simply properties of where this code now runs.
//
//   1. LONG REQUEST BUDGETS DO NOT SURVIVE. `ProductService.loadDataFromFile()` sets
//      `requesttimeout=3600` [model/service/ProductService.cfc:L65-L68] and the Google feed
//      template sets `requesttimeout=360` [integrationServices/google/views/feed/product.cfm].
//      The Lambda runtime caps an invocation at 15 minutes and API Gateway caps a request at
//      29 seconds, so neither budget exists any more. That costs this port nothing: the bulk import
//      is out of scope, and the feed generator is an in-memory string renderer with no such need.
//   2. COMPONENT-LEVEL MUTABLE CACHES BECOME REQUEST-SCOPED, because a warm container keeps
//      module-level state alive between unrelated requests. That is why this file introduces no
//      module-scope mutable state of its own: every value below is either a frozen constant or a
//      local, and the routine is a pure function of its argument.
//   3. THERE IS EXACTLY ONE DELIBERATE MODULE-SCOPE EXCEPTION, and it is not in this file: the
//      single MySQL pool in `src/repositories/mysql/connection.ts`, memoised once per container and
//      reused across warm invocations. A plain CommonJS bundle preserves it, because each artifact
//      holds one instance of that module. Nothing here may defeat it - no per-invocation re-import
//      trickery, no code splitting that would duplicate the module, and no `external` entry that
//      would let two copies of the driver load side by side.
//   4. THE LEGACY LOCK TIMEOUTS ARE NOTED AND DELIBERATELY NOT IMPLEMENTED. They sit in
//      out-of-scope code paths, and the framework's own first-scan lock disappears with the bean
//      factory it belonged to.
//   5. `cfthread` DOES NOT OCCUR ANYWHERE IN THE IN-SCOPE SLICE - the count is zero. The
//      `cfthread` -> worker-thread translation rule is recorded for completeness and is
//      UNEXERCISED, so no worker-thread bundling is configured.
//
// ---------------------------------------------------------------------------
// WHAT IS DELIBERATELY ABSENT FROM THE OPTIONS BELOW
//
//   * NO `external` array. Every runtime dependency is inlined so each artifact is self-contained;
//     see Option C. `mysql2`, `decimal.js` and `zod` are bundled, never externalised.
//   * NO `define`. Configuration is environment-driven and the runtime injects environment
//     variables natively. `src/lib/config.ts` is the one module that reads them, and baking a host,
//     database name, user or credential into a build artifact is exactly what that design prevents.
//   * NO `banner`. See Option B.
//   * NO plugin. The dependency set is fixed at exact pinned versions, and a plugin package would
//     breach that standard for no behavioural gain.
//   * NO schema work. No migration, seed or schema-generation step runs here; the port reads and
//     writes the existing `Sw*` tables unchanged.
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

/**
 * The subtree root, derived from this module's own location rather than from `process.cwd()`.
 *
 * Anchoring here is what makes the script correct from any working directory and is what keeps the
 * isolation invariant checkable: every path below is built from this one value, so no output can
 * escape `slatwall-ts/` even if the script is invoked from the repository root.
 */
const SUBTREE_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Where the five capability entrypoints live. */
const HANDLERS_DIR = path.join(SUBTREE_DIR, 'src', 'handlers');

/**
 * The bundle output directory - `dist`, never `build`.
 *
 * `tsconfig.build.json` sets the compiler's `outDir` to `build` precisely so that the declarations
 * `npm run compile` emits are not inside the tree this script clears.
 */
const OUT_DIR = path.join(SUBTREE_DIR, 'dist');

/** The extension emitted for a bundled entrypoint, and the suffix of its external source map. */
const ARTIFACT_EXTENSION = '.cjs';
const SOURCE_MAP_EXTENSION = '.cjs.map';

/**
 * THE ENTRYPOINT SET IS EXACTLY FIVE MODULES, AND IT IS FROZEN.
 *
 * Handler granularity is a recorded design decision: one handler module per bounded capability -
 * catalog query, SKU resolution, promotion application, price resolution, product feed - all five
 * sharing a common composition root. Each of these modules, and only these, exports a Lambda
 * `handler`, so each becomes one independently deployable artifact.
 *
 * `bootstrap.ts`, `router.ts` and `errorMapper.ts` are SHARED INTERNALS of `src/handlers/`. They
 * export no `handler` and are deliberately NOT entrypoints: the bundler pulls them into whichever
 * artifacts import them, which is the correct outcome. Bundling `router.ts` as its own entrypoint
 * produced an artifact the runtime could not resolve, because there was no `handler` symbol in it
 * to call; that is a bundler misconfiguration and not a router defect, and it is not repeated here.
 *
 * NOTHING UNDER `tests/` MAY EVER APPEAR HERE. No entrypoint, no glob and no plugin pulls a test
 * module or a fixture into an artifact. `tsconfig.build.json` already keeps the test tier out of
 * the compiler's emit, and this list keeps it out of the bundle for the same reason: test code has
 * no business in a deployable.
 */
const LAMBDA_ENTRYPOINT_FILES = Object.freeze([
  'catalogQueryHandler.ts',
  'skuResolutionHandler.ts',
  'promotionApplicationHandler.ts',
  'priceResolutionHandler.ts',
  'productFeedHandler.ts',
]);

/** Prefix for every diagnostic this script writes, so its output is greppable in a build log. */
const LOG_PREFIX = '[esbuild]';

/**
 * Resolves the frozen entrypoint list to absolute paths, refusing to proceed if any is missing.
 *
 * A MISSING ENTRYPOINT IS A HARD ERROR, NOT SOMETHING TO SKIP. An earlier revision of this file
 * filtered the list by existence and exited zero when it came up empty, which made the bundle step
 * report success while emitting nothing - and `npm run package` is supposed to be a real gate, not a
 * step that passes because it did no work. Every module named above is a committed part of this
 * subtree, so its absence is a broken tree rather than a state to tolerate.
 *
 * @returns {readonly string[]} The five absolute entrypoint paths, in the declared order.
 * @throws {Error} If any declared entrypoint is not present on disk.
 */
function resolveEntryPoints() {
  const resolved = LAMBDA_ENTRYPOINT_FILES.map((file) => path.join(HANDLERS_DIR, file));
  const missing = resolved.filter((candidate) => !existsSync(candidate));

  if (missing.length > 0) {
    const relative = missing.map((candidate) => path.relative(SUBTREE_DIR, candidate));
    throw new Error(
      [
        `Missing ${String(missing.length)} of ${String(resolved.length)} declared Lambda entrypoints:`,
        ...relative.map((entry) => `  - ${entry}`),
        'Each is a committed module of this subtree and each exports a Lambda `handler`.',
        'Restore the file rather than removing it from the entrypoint list: a bundle that silently',
        'omits a capability would leave that capability undeployable while the build reported',
        'success.',
      ].join('\n'),
    );
  }

  return Object.freeze(resolved);
}

/**
 * Builds the esbuild option set. A pure function of its inputs, holding no state of its own.
 *
 * @param {readonly string[]} entryPoints Absolute paths to the five capability entrypoints.
 * @returns {Record<string, unknown>} Options for the esbuild build API.
 */
function buildOptions(entryPoints) {
  return {
    entryPoints: [...entryPoints],
    outdir: OUT_DIR,

    // `package.json` declares `"type": "module"`, so a CommonJS payload in a `.js` file would be
    // loaded as ESM and throw. `.cjs` is unambiguous to Node and is resolved by the runtime for a
    // `<file>.handler` entry.
    outExtension: { '.js': ARTIFACT_EXTENSION },

    // Anchors esbuild's own relative-path handling - including the keys of `metafile.outputs` - to
    // the subtree rather than to `process.cwd()`, so the script behaves identically whether it is
    // run by an npm script from `slatwall-ts/` or by hand from the repository root.
    absWorkingDir: SUBTREE_DIR,

    // One self-contained artifact per capability. See Option C in the header: nothing is left
    // external, so no artifact depends on a shipped `node_modules` tree or a runtime layer.
    bundle: true,
    platform: 'node',

    // SECURITY REVIEW DISPOSITION - RAISED AS S-17, DECLINED ON A CITED MANDATE.
    //
    // RENUMBERED FROM S-09, WHICH THIS BLOCK CARRIED UNTIL THE FINDING IDS WERE
    // RECONCILED. In the review this file answers, S-09 is the product-feed URL scheme
    // finding (CWE-319), resolved in `src/integrations/google/rssFeedRenderer.ts` and
    // `src/integrations/google/googleFeedService.ts` - both of which now carry their own
    // S-09 dispositions. The runtime-lifecycle finding is S-17. Three blocks shared one
    // label, so no reader could tell which finding a given disposition answered.
    //
    // Finding S-17 (HIGH/MAJOR, CWE-1104, Use of Unmaintained Third-Party Components)
    // records that Node 20 is out of maintenance and that the `nodejs20.x` Lambda runtime
    // is deprecated. Both are accurate: Node 20 reached end of life on 2026-04-30, and
    // Lambda stopped applying security patches to `nodejs20.x` on that same date. This is
    // a platform-lifecycle exposure rather than an allegation about any package in this
    // tree, and `npm audit` is clean.
    //
    // THE BLOCK DATES ARE DELIBERATELY NOT RESTATED AS FACT. This block previously
    // asserted "new functions blocked 2027-02-01, updates 2027-03-03" as a dated deadline.
    // AWS publishes block-function-create and block-function-update dates as forecasts
    // "subject to change" and has repeatedly moved them for Node runtimes; currently
    // published dates for `nodejs20.x` disagree with each other, and with the review, by
    // many months - some of them EARLIER than the dates this block used to assert. A date
    // frozen into a build script is exactly where such a figure rots unnoticed, and a
    // deadline later than the real one is worse than no deadline at all. The plan owner
    // must read the current figure from the runtimes table AWS publishes rather than from
    // here. What is NOT in doubt, and correctly bounds the exposure: Lambda never blocks
    // INVOCATION of a deprecated runtime, so an already-deployed function keeps serving
    // traffic; what lapses is the ability to create or update one.
    //
    // THE UPGRADE IS DECLINED HERE BECAUSE IT IS NOT THIS AGENT'S TO MAKE. The runtime is
    // fixed by the frozen plan in three independent places: AAP 0.1.1 states the objective
    // as re-expressing the slice so that it runs on the `nodejs20.x` Lambda runtime;
    // AAP 0.5.1 pins Node 20.20.2 and npm 10.8.2 and resolves every package to an exact
    // verified version, recording that the 20.20.2 floor is itself forced by eslint's
    // `^20.19.0` engine requirement; and AAP 0.9.1 makes "Node `20.x`, TypeScript `5.x`,
    // and all fourteen packages at the exact versions in 0.5.1 - no caret ranges, no
    // `latest`" a pass condition of its runtime-and-toolchain-pinning gate. ("Fourteen" is
    // the AAP's own count, quoted rather than recomputed; the manifest carries thirteen
    // direct dependencies alongside the pinned Node runtime.) The AAP is the agreed, frozen
    // source of truth and is to be aligned to, never edited - so changing the target would
    // put this file, `package.json`, `package-lock.json`, `.nvmrc`, `@types/node` and the
    // verified bundle recipe out of agreement with the plan, and would invalidate the
    // packaging constraint AAP 0.5.2 established by experiment rather than by assumption.
    //
    // It is therefore recorded for the plan owner as a platform decision requiring a
    // successor-runtime selection OUTSIDE this AAP, not resolved by unilateral drift in a
    // code-remediation pass. The six artifacts that must move together are named above so
    // the change is one deliberate edit when it is authorized, and the pin is enforced
    // executably by "A16" in `tests/traceability/legacyTestMap.ts`, so drift off the
    // frozen line fails the suite instead of passing unnoticed.
    target: 'node20',

    // Option A. The one non-negotiable line in this file; see the header for the evidence.
    format: 'cjs',

    // External maps, without the original sources embedded. The map is what keeps a stack trace
    // from a bundled artifact readable; `sourcesContent: false` keeps the source text itself out of
    // the emitted map, which is the same posture `README.md` documents.
    sourcemap: true,
    sourcesContent: false,

    // MINIFICATION IS OFF, DELIBERATELY. This port reproduces legacy defects rather than repairing
    // them, and the in-code annotations that record each preserved defect and each carried-forward
    // source TODO are part of the deliverable's audit trail. Minifying strips them, and no size
    // constraint exists anywhere in this project that would justify the loss. No identifier-renaming
    // transform is enabled either - not minification, not name mangling - so the exported `handler`
    // symbol the runtime resolves survives verbatim in every artifact.
    minify: false,

    treeShaking: true,

    // Third-party license notices stay inside the artifact. `'linked'` would move them to a sidecar
    // `.LEGAL.txt` that is trivially separated from the file it describes, and GPL v3.0 attribution
    // has to travel with the code; inlining it also keeps one bundle file per entrypoint.
    legalComments: 'inline',

    logLevel: 'info',

    // Read back below to report exactly which artifacts were emitted, and to drive `--zip` from the
    // real output list rather than from a guess about esbuild's naming.
    metafile: true,
  };
}

/**
 * Extracts the bundled entrypoint artifacts from a build result, in a stable order.
 *
 * The source-map siblings are excluded here on purpose: an artifact is what the runtime loads, and
 * the count reported below is meant to be comparable against the entrypoint count.
 *
 * @param {{ metafile?: { outputs?: Record<string, unknown> } }} result The esbuild build result.
 * @returns {readonly string[]} Absolute paths to the emitted `.cjs` artifacts.
 */
function collectArtifacts(result) {
  const outputs = result.metafile?.outputs ?? {};

  return Object.freeze(
    Object.keys(outputs)
      .filter((output) => output.endsWith(ARTIFACT_EXTENSION))
      // Keys are relative to `absWorkingDir`, which is pinned to the subtree above.
      .map((output) => path.resolve(SUBTREE_DIR, output))
      .sort((left, right) => left.localeCompare(right)),
  );
}

/**
 * Archives each artifact, and its source map when one is present, into `<subtree>/dist`.
 *
 * `-j` junks the stored paths so the module sits at the archive root, which is where the runtime
 * looks for a `<file>.handler` entry. The map is included because it is what keeps a stack trace
 * from a bundled artifact readable, and it is optional rather than assumed so the routine stays
 * correct if source maps are ever turned off.
 *
 * THIS IS A PACKAGE STEP AND ONLY A PACKAGE STEP. Every archive is written beside the artifact it
 * describes, inside `<subtree>/dist`. Nothing is uploaded, transmitted or published, no platform
 * tooling is invoked, and no credential is read.
 *
 * @param {readonly string[]} artifacts Absolute paths to the emitted artifacts.
 * @returns {readonly string[]} Absolute paths to the archives written.
 * @throws {Error} If the `zip` utility is unavailable or reports a failure.
 */
function archiveArtifacts(artifacts) {
  const archives = [];

  for (const artifact of artifacts) {
    const basename = path.basename(artifact, ARTIFACT_EXTENSION);
    const archivePath = path.join(OUT_DIR, `${basename}.zip`);
    const sourceMapPath = path.join(OUT_DIR, `${basename}${SOURCE_MAP_EXTENSION}`);

    // A stale archive from a previous run would otherwise be appended to rather than replaced.
    rmSync(archivePath, { force: true });

    const contents = existsSync(sourceMapPath) ? [artifact, sourceMapPath] : [artifact];

    try {
      execFileSync('zip', ['-q', '-j', archivePath, ...contents], { stdio: 'inherit' });
    } catch (cause) {
      throw new Error(
        `Failed to archive ${path.relative(SUBTREE_DIR, artifact)}. The \`zip\` utility must be ` +
          'available on PATH for `npm run package`; `npm run bundle` does not need it.',
        { cause },
      );
    }

    archives.push(archivePath);
  }

  return Object.freeze(archives);
}

/**
 * Bundles the five capability entrypoints, and optionally archives them.
 *
 * The whole routine is a function of its argument and touches no module-scope mutable state, which
 * is the same discipline the ported services are held to for the reason recorded in the header: a
 * warm container keeps module state alive between unrelated invocations.
 *
 * Ordering matters. Entrypoints are verified BEFORE `dist` is cleared, so a broken tree cannot leave
 * the previous artifacts deleted and nothing in their place.
 *
 * @param {{ zip?: boolean }} [options] Set `zip` to also emit one archive per artifact.
 * @returns {Promise<{ artifacts: readonly string[], archives: readonly string[] }>} What was written.
 */
async function bundleLambdaArtifacts(options = {}) {
  const shouldArchive = options.zip === true;
  const entryPoints = resolveEntryPoints();

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const result = await build(buildOptions(entryPoints));
  const artifacts = collectArtifacts(result);

  if (artifacts.length !== entryPoints.length) {
    throw new Error(
      `Expected ${String(entryPoints.length)} bundled artifacts but esbuild emitted ` +
        `${String(artifacts.length)}. Every declared entrypoint must produce exactly one ` +
        'CommonJS artifact.',
    );
  }

  console.log(
    `${LOG_PREFIX} Bundled ${String(artifacts.length)} Lambda artifact(s) as CommonJS into ` +
      `${path.relative(SUBTREE_DIR, OUT_DIR)}/`,
  );
  for (const artifact of artifacts) {
    console.log(`${LOG_PREFIX}   ${path.relative(SUBTREE_DIR, artifact)}`);
  }

  const archives = shouldArchive ? archiveArtifacts(artifacts) : Object.freeze([]);

  for (const archive of archives) {
    console.log(`${LOG_PREFIX} Packaged ${path.relative(SUBTREE_DIR, archive)}`);
  }

  return { artifacts, archives };
}

// The single exported unit of this file. There is no barrel anywhere in this subtree and this is not
// one: the five capability entrypoints are named above as data, not re-exported as symbols.
export default bundleLambdaArtifacts;

// ---------------------------------------------------------------------------
// Script entry.
//
// The routine is exported for programmatic reuse and ALSO invoked here, because `package.json`
// invokes this file directly (`node esbuild.config.mjs`) and a config that only exported would
// silently do nothing. Guarding the invocation on an entry-module check was considered and rejected:
// the check misfires when the path is reached through a symlink, and its failure mode is a build
// that reports success while emitting nothing - the exact defect this file already had to fix once.
//
// FAILURE IS LOUD. esbuild has already printed its own formatted diagnostics at `logLevel: 'info'`,
// so what is added here is the one line naming why the process is failing, plus a non-zero exit code
// so that `npm run bundle` and `npm run package` are real gates rather than steps that always pass.
// ---------------------------------------------------------------------------

try {
  await bundleLambdaArtifacts({ zip: process.argv.includes('--zip') });
} catch (error) {
  process.exitCode = 1;
  console.error(`${LOG_PREFIX} Build failed.`);
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
}
