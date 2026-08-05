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
// It takes no arguments and has exactly one mode, and it is invoked by three published
// `package.json` scripts and by nothing else:
//
//   node esbuild.config.mjs          `npm run bundle` / `npm run build` / `npm run package`
//
// THE BUNDLED ARTIFACT IS THE DELIVERABLE, SO THERE IS NO SEPARATE ARCHIVE STAGE. `dist/` holds
// exactly the five `.cjs` artifacts and their five source maps, and `npm run package` is
// `npm run build` - the same typecheck-then-bundle gate under the name AAP 0.9.1 uses for the
// deliverable. No host-global packaging utility is required.
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
//      The Lambda runtime's execution ceiling is shorter than the first budget, while the applicable
//      API Gateway integration timeout is deployment- and API-type configuration owned outside this
//      build. Neither legacy request-timeout directive is reproduced here. That costs this port
//      nothing: the bulk import is out of scope, and the feed generator is an in-memory string
//      renderer with no such need.
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

import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
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

/**
 * The port's own TypeScript source root.
 *
 * It is also how the annotation check below tells this port's modules apart from the third-party
 * packages that share a bundle with them: a source-map entry that does not resolve under this
 * directory belongs to a dependency, and a dependency carries none of this port's annotations.
 */
const SOURCE_DIR = path.join(SUBTREE_DIR, 'src');

/** Where the five capability entrypoints live. */
const HANDLERS_DIR = path.join(SOURCE_DIR, 'handlers');

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

/**
 * THE ANNOTATION MARKERS THAT MUST BE RECOVERABLE FROM EVERY ARTIFACT, AND THIS LIST IS A CONTRACT.
 *
 * This port reproduces legacy defects rather than repairing them, so the in-code annotations
 * recording each preserved defect and each sanctioned divergence are part of the deliverable rather
 * than commentary on it. `README.md` states the two marker formats and `assertAnnotationsRecoverable`
 * enforces them, so a bundle that has quietly stopped carrying the audit trail fails the build
 * instead of shipping.
 *
 * The bracketed forms are matched on purpose. Every real annotation cites its legacy locator - for
 * example `LEGACY-DEFECT [model/entity/Sku.cfc:L258]` - so requiring the opening bracket means prose
 * that merely mentions a marker by name cannot satisfy the check on a marker's behalf.
 */
const REQUIRED_ANNOTATION_MARKERS = Object.freeze(['LEGACY-DEFECT [', 'DELIBERATE DIVERGENCE [']);

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

    // The build target matches the runtime line frozen by AAP 0.1.1, 0.5.1 and 0.9.1, and it moves
    // only together with `.nvmrc`, `package.json` engines, `package-lock.json` and `@types/node`.
    // `tests/traceability/legacyTestMap.ts` asserts that agreement. Runtime-lifecycle escalation is
    // recorded in `README.md`, not here: dates, support status and advisory results are mutable facts
    // and do not belong in executable configuration.
    target: 'node20',

    // Option A. The one non-negotiable line in this file; see the header for the evidence.
    format: 'cjs',

    // EXTERNAL MAPS, WITH THE ORIGINAL SOURCES EMBEDDED - AND THE SECOND HALF IS THE AUDIT-TRAIL
    // MECHANISM, NOT A CONVENIENCE. A map is what keeps a stack trace from a bundled artifact
    // readable. `sourcesContent: true` additionally puts the annotated source text itself inside the
    // emitted map, and that is what makes every preserved-defect annotation recoverable from the
    // artifact set rather than only from a checkout. `assertAnnotationsRecoverable` below proves the
    // property on every build; see the note on `minify` for the measurement that forced this option
    // to change from `false`.
    //
    // IT EXPOSES NOTHING. There is no credential or environment value in `src/**` to embed:
    // configuration is read at runtime from the environment by `src/lib/config.ts` alone and there is
    // no `define` to bake a value in. The subtree is GPL v3.0 (see the header), so its source is
    // required to be available in the first place - embedding it serves the license rather than
    // straining it.
    sourcemap: true,
    sourcesContent: true,

    // MINIFICATION IS OFF, DELIBERATELY - BUT IT IS NOT WHAT CARRIES THE ANNOTATIONS, AND THIS BLOCK
    // USED TO CLAIM THAT IT WAS. Measured on this exact entrypoint set: 130 `LEGACY-DEFECT` markers
    // exist in the modules bundled into one artifact and 56 survive in the artifact text. esbuild
    // preserves a comment only where its printer happens to emit one and drops the rest - the option
    // that governs comment retention is `legalComments`, and an ordinary `//` annotation is not a
    // legal comment. So `minify: false` and `legalComments: 'inline'` together do NOT carry the audit
    // trail into the artifact; `sourcesContent: true` above is what actually does.
    //
    // What minification off does buy is worth keeping on its own terms: the artifact stays readable
    // beside its map, and NO identifier-renaming transform is enabled - not minification, not name
    // mangling - so the exported `handler` symbol the runtime resolves survives verbatim in every
    // artifact. No size constraint exists anywhere in this project that would justify trading either
    // of those away.
    minify: false,

    treeShaking: true,

    // Third-party license notices stay inside the artifact. `'linked'` would move them to a sidecar
    // `.LEGAL.txt` that is trivially separated from the file it describes, and GPL v3.0 attribution
    // has to travel with the code; inlining it also keeps one bundle file per entrypoint. Its reach
    // is legal comments and only legal comments, which is precisely why this port's own annotations
    // ride in the map rather than on this option.
    legalComments: 'inline',

    logLevel: 'info',

    // Read back below to report exactly which artifacts were emitted, taking the output list from
    // esbuild itself rather than from a guess about its naming.
    metafile: true,
  };
}

/**
 * Extracts the bundled entrypoint artifacts from a build result, in a stable order.
 *
 * The source-map siblings are excluded here on purpose: an artifact is what the runtime loads, and
 * the count reported below is meant to be comparable against the entrypoint count. They are not
 * ignored - the annotation check derives each map from the artifact it belongs to, which is a
 * stronger pairing than matching two entries out of the same list.
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
 * Reads a bundle's own source map back off disk and returns it parsed.
 *
 * @param {string} artifact Absolute path to an emitted `.cjs` artifact.
 * @returns {{ path: string, sources: unknown, sourcesContent: unknown }} The map, and where it was
 *   read from so a diagnostic can name it.
 * @throws {Error} If the map is absent or is not parseable JSON.
 */
function readSourceMapFor(artifact) {
  const basename = path.basename(artifact, ARTIFACT_EXTENSION);
  const mapPath = path.join(OUT_DIR, `${basename}${SOURCE_MAP_EXTENSION}`);

  if (!existsSync(mapPath)) {
    throw new Error(
      `No source map was emitted beside ${path.relative(SUBTREE_DIR, artifact)}. ` +
        '`sourcemap: true` is what makes the preserved-defect annotations recoverable from the ' +
        'artifact set, so a missing map is a packaging failure rather than a cosmetic one.',
    );
  }

  try {
    // Only the two fields the check needs are lifted out, rather than spreading the whole map: the
    // shape stays exactly what the JSDoc above promises, whatever else a future esbuild emits.
    const parsed = JSON.parse(readFileSync(mapPath, 'utf8'));

    return { path: mapPath, sources: parsed.sources, sourcesContent: parsed.sourcesContent };
  } catch (cause) {
    throw new Error(
      `The source map ${path.relative(SUBTREE_DIR, mapPath)} is not parseable JSON, so the ` +
        'annotations it is supposed to carry cannot be recovered from it.',
      { cause },
    );
  }
}

/**
 * PROVES, BY READING BACK WHAT WAS JUST EMITTED, THAT THIS PORT'S ANNOTATIONS SURVIVE INTO THE
 * ARTIFACT SET. Writes nothing; every path it touches was produced by the build immediately above.
 *
 * WHY A BUILD-TIME PROOF AND NOT A COMMENT. This file previously asserted in prose that
 * `minify: false` plus `legalComments: 'inline'` kept the annotations in the artifact, and the claim
 * was wrong: esbuild retains a comment only where its printer emits one, so of the 130
 * `LEGACY-DEFECT` markers in the modules bundled into one artifact, 56 survived. A claim about an
 * emitted artifact that nothing checks is a claim that decays silently, which is exactly what
 * happened, so the property is now measured on every build instead of being described.
 *
 * The check is deliberately per artifact rather than across the set. Each artifact is independently
 * deployable, so "the audit trail is somewhere in `dist/`" is not the property that matters - the
 * property that matters is that the artifact a reviewer holds carries it.
 *
 * Third-party sources are excluded because they carry none of this port's markers, so counting them
 * could only dilute the signal; `SOURCE_DIR` is what draws that line.
 *
 * @param {readonly string[]} artifacts Absolute paths to the emitted artifacts.
 * @returns {readonly { artifact: string, recovered: Readonly<Record<string, number>> }[]} Per
 *   artifact, how many occurrences of each required marker were recovered from its map.
 * @throws {Error} If any map omits its embedded sources, or if any required marker is unrecoverable
 *   from any artifact.
 */
function assertAnnotationsRecoverable(artifacts) {
  const summary = [];

  for (const artifact of artifacts) {
    const map = readSourceMapFor(artifact);
    const relativeMap = path.relative(SUBTREE_DIR, map.path);

    // This is the exact failure mode `sourcesContent: false` produces: a structurally valid map
    // whose `sourcesContent` key is simply absent, so nothing in it can be read back.
    if (!Array.isArray(map.sources) || !Array.isArray(map.sourcesContent)) {
      throw new Error(
        `${relativeMap} carries no embedded sources, so no annotation is recoverable from it. ` +
          'Set `sourcesContent: true` in the options above: it is the only thing that puts the ' +
          'annotated source text into the emitted map.',
      );
    }

    if (map.sources.length !== map.sourcesContent.length) {
      throw new Error(
        `${relativeMap} lists ${String(map.sources.length)} sources but embeds ` +
          `${String(map.sourcesContent.length)} source bodies, so the two cannot be read together.`,
      );
    }

    /** @type {Record<string, number>} */
    const recovered = Object.fromEntries(REQUIRED_ANNOTATION_MARKERS.map((marker) => [marker, 0]));

    map.sources.forEach((source, index) => {
      // `sources` are relative to the map's own directory, which is `dist`.
      const resolved = path.resolve(OUT_DIR, String(source));
      const body = map.sourcesContent[index];

      if (typeof body !== 'string' || !resolved.startsWith(SOURCE_DIR + path.sep)) {
        return;
      }

      for (const marker of REQUIRED_ANNOTATION_MARKERS) {
        recovered[marker] += body.split(marker).length - 1;
      }
    });

    const unrecoverable = REQUIRED_ANNOTATION_MARKERS.filter((marker) => recovered[marker] === 0);

    if (unrecoverable.length > 0) {
      throw new Error(
        [
          `${relativeMap} carries none of the following annotation markers, so the audit trail this`,
          `package is supposed to ship is not recoverable from ${path.basename(artifact)}:`,
          ...unrecoverable.map((marker) => `  - ${marker}`),
          "Either the emitted map stopped embedding this port's own sources, or the annotations",
          'themselves were removed from `src/**`. Neither is a change to make quietly: AAP 0.6.7',
          'requires every preserved legacy defect to be annotated in place, and the annotation is',
          'how a reviewer confirms a defect was reproduced knowingly rather than by accident.',
        ].join('\n'),
      );
    }

    summary.push(Object.freeze({ artifact, recovered: Object.freeze(recovered) }));
  }

  return Object.freeze(summary);
}

/**
 * Bundles the five capability entrypoints into `<subtree>/dist`.
 *
 * THIS IS A BUILD AND PACKAGE STEP AND ONLY THAT. Every path written is inside `<subtree>/dist`.
 * Nothing is archived, uploaded, transmitted or published, no platform tooling and no host utility
 * is invoked, and no credential is read. The `.cjs` artifact the runtime loads IS the package.
 *
 * The whole routine takes no arguments and touches no module-scope mutable state, which is the same
 * discipline the ported services are held to for the reason recorded in the header: a warm container
 * keeps module state alive between unrelated invocations.
 *
 * Ordering matters twice. Entrypoints are verified BEFORE `dist` is cleared, so a broken tree cannot
 * leave the previous artifacts deleted and nothing in their place; and the annotations are verified
 * AFTER the build, from the emitted files themselves, because a claim about an artifact can only be
 * checked against the artifact.
 *
 * @returns {Promise<{ artifacts: readonly string[], annotations: readonly object[] }>} What was
 *   written, and the annotation evidence read back out of it.
 */
async function bundleLambdaArtifacts() {
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

  const annotations = assertAnnotationsRecoverable(artifacts);

  for (const { artifact, recovered } of annotations) {
    const counted = REQUIRED_ANNOTATION_MARKERS.map(
      (marker) => `${marker.replace(' [', '')} x${String(recovered[marker])}`,
    ).join(', ');
    console.log(
      `${LOG_PREFIX} Annotations recoverable from ` +
        `${path.basename(artifact, ARTIFACT_EXTENSION)}${SOURCE_MAP_EXTENSION}: ${counted}`,
    );
  }

  return { artifacts, annotations };
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
// that reports success while emitting nothing.
//
// FAILURE IS LOUD. esbuild has already printed its own formatted diagnostics at `logLevel: 'info'`,
// so what is added here is the one line naming why the process is failing, plus a non-zero exit code
// so that `npm run bundle` and `npm run package` are real gates rather than steps that always pass.
// ---------------------------------------------------------------------------

try {
  await bundleLambdaArtifacts();
} catch (error) {
  process.exitCode = 1;
  console.error(`${LOG_PREFIX} Build failed.`);
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
}
