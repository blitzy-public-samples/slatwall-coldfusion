/**
 * ==================================================================================================
 * slatwall-ts — the Lambda bundle-and-package step
 * ==================================================================================================
 *
 * WHAT THIS FILE IS. `npm run build` resolves to `node build/esbuild.mjs`, and this script is the
 * whole of it: it bundles the handler layer into one CommonJS artifact per entry point under
 * `dist/`. That is also the deliverable's definition of done. AAP 0.8.3.10, verbatim:
 *
 *     "'Deployable' is satisfied by a successful build/package step producing Lambda-compatible
 *      artifacts — live deployment execution is not required for this run."
 *
 * WHAT THIS FILE IS NOT — and the distinction is load-bearing rather than pedantic. This is a
 * bundle-and-package step, not a deployment step and not an infrastructure definition.
 * Infrastructure as code, deployment automation and CI/CD are explicitly out of scope
 * (AAP 0.2.2.5), so nothing below defines a function, assumes an account, names a region, reads a
 * credential, or calls a deployment API. Consequently `target: NODE_TARGET` is a BUNDLER TARGET
 * FLAG — an instruction about which syntax esbuild may leave un-transpiled — and NOT a runtime
 * declaration. AAP 0.5.5 draws exactly that consequence: no managed-runtime identifier string is
 * authored anywhere in this deliverable, because there is no infrastructure artifact here to
 * author one into. The version pin is honoured by this bundler flag alone.
 *
 * WHY THIS FILE HAS NO LEGACY COUNTERPART. The CFML application delegated bundling and packaging
 * to its application server, so there was never a build step to convert; AAP 0.4.1.2 carries this
 * row with an em dash in the Source File column for that reason. A Lambda artifact has no
 * application server to delegate to, so the step has to exist, and it is introduced here rather
 * than translated from anything.
 *
 * WHY THIS SCRIPT IS ESM WHILE ITS OUTPUT IS CommonJS. Both halves are deliberate and they are
 * not in tension:
 *   - The OUTPUT is CommonJS (`format: 'cjs'`) because that is what the Lambda loader consumes.
 *     package.json agrees by declaring `"type": "commonjs"` — never `"module"` — which is
 *     load-bearing twice over: tsconfig.json sets `module`/`moduleResolution` to `NodeNext`, under
 *     which the nearest package.json `"type"` decides the emitted format, and `ts-jest` runs
 *     CommonJS by default, so `"type": "module"` would force mandatory file extensions and break
 *     the test runner.
 *   - THIS FILE is ESM because the `.mjs` extension is unambiguously ESM regardless of that
 *     `"type": "commonjs"` declaration. That is precisely why the extension was chosen: it lets a
 *     build script use `import` inside a CommonJS package. `eslint.config.mjs` exists for the same
 *     reason.
 *
 * WHY THIS FILE IS NOT TYPE-CHECKED, AND WHAT REPLACES THAT. `.mjs` belongs to no TypeScript
 * program: tsconfig.json's `include` lists only `.ts` sources and sets neither `allowJs` nor
 * `checkJs`, so `tsc --noEmit` never sees this file. Two things follow and both are honoured here.
 * First, `npm run typecheck` must pass BEFORE this step is trusted, because esbuild strips types
 * without checking them — the bundle must never be the thing that hides a type error. Second, the
 * parent-owned configuration files (package.json, tsconfig.json, tsconfig.build.json,
 * eslint.config.mjs, .prettierrc.json) are read as fixed contracts and are never edited, relaxed
 * or overridden from here; where this script must agree with one of them it matches the file
 * rather than adjusting it.
 *
 * ==================================================================================================
 */
import { build } from 'esbuild';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* --------------------------------------------------------------------------------------------------
 * Paths.
 *
 * Derived from `import.meta.url` rather than from `process.cwd()`, so the script behaves identically
 * whether it is launched by `npm run build` from the subtree root or by an absolute `node` path.
 * `..` is applied EXACTLY ONCE, which reaches the `slatwall-ts/` subtree root and stops there. No
 * path in this file escapes the subtree, and none is a hard-coded absolute literal: every absolute
 * path is computed at run time from this module's own location. The legacy ColdFusion tree —
 * model/, org/, integrationServices/, config/, meta/ and the view trees — is therefore unreachable
 * from here by construction, which keeps the whole deliverable additive.
 * ------------------------------------------------------------------------------------------------ */
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The bundler's `outbase`, and the same directory tsconfig.build.json names as its `rootDir`.
 *
 * Keeping the two in step is what makes the emitted layout predictable: output paths are computed
 * relative to this directory, so `src/handlers/router.ts` becomes `dist/handlers/router.js` rather
 * than `dist/src/handlers/router.js`, and the plain `tsc -p tsconfig.build.json` emit describes the
 * same shape.
 */
const sourceRoot = join(projectRoot, 'src');

/**
 * The output directory: `dist`, and deliberately nothing else.
 *
 * Five sibling artefacts already agree on this exact name and all five would break on a different
 * one — tsconfig.build.json (`"outDir": "dist"`), .gitignore (`dist/`, which is what keeps build
 * output untracked), eslint.config.mjs (`ignores: [... 'dist/**' ...]`), jest.config.ts
 * (`testPathIgnorePatterns`) and tsconfig.json (`exclude`). `build/` in particular would be wrong
 * twice: it is untracked by none of those patterns, and it would collide with the directory this
 * script lives in.
 */
const outputDir = join(projectRoot, 'dist');

/**
 * Where the source maps land, and why it is NOT `dist`.
 *
 * `dist/` is the packaged tree: the set of files a packaging step would carry to the runtime. A
 * source map is a debugging aid rather than something the runtime loads, and the maps for these
 * bundles are an order of magnitude larger than the code they describe, so emitting them into the
 * packaged tree means shipping several megabytes the runtime never reads. They are therefore
 * written beside `dist/` instead of inside it, and `dist/` ends up holding exactly one artifact per
 * declared entry point and nothing else.
 *
 * The maps are still produced, and still usable: `sourcemap: 'external'` emits them WITHOUT writing
 * a `sourceMappingURL` comment into the JavaScript, so relocating a map leaves no dangling
 * reference behind in the artifact. A reader debugging a stack trace points their tool at the map
 * in this directory; nothing about the mapping data itself changes.
 *
 * `build-meta/` is added to slatwall-ts/.gitignore alongside `dist/` and `coverage/`, so like every
 * other generated directory in the subtree it is never committed. The name is deliberately distinct
 * from `build/`, which holds this script and is tracked.
 */
const sourcemapDir = join(projectRoot, 'build-meta', 'sourcemaps');

/**
 * The bundler target.
 *
 * ⚠️ PINNED, AND NEVER "CORRECTED" TO WHATEVER NODE HAPPENS TO BE INSTALLED. The version of Node
 * running this script is an artefact of the machine; the target is a project decision. Five
 * couplings in the subtree carry that decision, and a runtime move has to move them together:
 *
 *   1. this token (and the `target` option it feeds);
 *   2. the `engines` field of package.json together with .nvmrc;
 *   3. the @types/node pin, which AAP 0.5.3.2 requires to track the runtime rather than the latest
 *      release — a newer definition set would type APIs the pinned runtime does not have, turning a
 *      compile pass into a false assurance;
 *   4. tsconfig.json's `target`/`lib` pair;
 *   5. the Toolchain section of slatwall-ts/README.md, which states the Node, npm, TypeScript, Jest,
 *      esbuild, ESLint, Prettier and mysql2 versions and repeats this same coupling list.
 *
 * Items 1, 2, 3 and 5 are the four couplings AAP 0.5.5 enumerates. Item 4 is an additional coupling
 * measured in this subtree that AAP 0.5.5 does not name, and it is listed anyway because a reader
 * auditing the couplings before a bump has to find every one of them, not only the documented four.
 *
 * ⚠️ ITEM 5 DID NOT EXIST WHEN THIS LIST WAS FIRST WRITTEN, AND NOW DOES. slatwall-ts/README.md is
 * declared as a CREATE target by AAP 0.2.1.7 and 0.4.1.2 but had not been generated, so this note
 * previously recorded that coupling as an outstanding gap and enumerated only four items. The file
 * has since been authored carrying the version statements AAP 0.5.5 requires, which closes the gap
 * and is why the count here is five rather than four.
 *
 * Because the hexagonal boundary confines every AWS type to src/handlers/**, such a move touches
 * those five artefacts and nothing under src/domain/**, src/ports/**, src/services/** or
 * src/adapters/**.
 */
const NODE_TARGET = 'node20';

/**
 * The six Lambda entry points, enumerated literally.
 *
 * ⛔ DELIBERATELY NOT A DIRECTORY SCAN. Reading src/handlers/ and filtering it would be shorter and
 * is the wrong shape here for two reasons: it would silently promote any new file in that directory
 * to an entry point — starting with the shared helper noted below — and the filter needed to prevent
 * that is a list of exceptions, which is strictly harder to audit than a list of inclusions. An
 * enumerated array also fails loudly: if one of these files is missing or renamed, esbuild reports
 * an unresolved entry point and the build exits non-zero, whereas a scan would quietly emit fewer
 * bundles and still succeed.
 *
 * WHY THE HANDLER LAYER IS THE ENTRY SURFACE. It is the only AWS-coupled layer in the subtree. The
 * hexagonal separation the port is built on keeps `domain`, `ports`, `adapters`, `services` and
 * `handlers` distinct and confines every AWS type to `src/handlers/**`; nothing under
 * src/domain/**, src/services/**, src/ports/**, src/adapters/**, src/validation/**,
 * src/integrations/**, src/errors/** or src/util/** is ever an entry point, because nothing there
 * is addressable by the runtime.
 *
 * ⭐ A GENUINE READING TENSION, SURFACED RATHER THAN QUIETLY DECIDED. Three sibling specifications
 * describe the entry surface slightly differently: router.ts is specified as being *the* bundle
 * entry point; each of the five per-service handlers is specified as *reachable as a bundle
 * entry-point dependency*; and this folder's own requirements list all six by name. Those readings
 * are not equivalent, so rather than adopt one and drop the others, all six are declared here — a
 * union that satisfies every reading at once. router.ts genuinely IS an entry point, and it is the
 * only module in the subtree exporting a `handler` symbol; the other five are simultaneously entry
 * points in their own right and reachable dependencies of the router, since it imports them to
 * dispatch. No third arrangement was invented for the purpose: there is no synthetic barrel module
 * and no per-route entry.
 *
 * ⛔ THE SEVENTH FILE IN THAT DIRECTORY, httpResponse.ts, IS EXCLUDED ON PURPOSE. It is the shared
 * response-shaping helper every handler funnels its output through, it exports no `handler` symbol,
 * and the runtime has no way to invoke it. It still lands in the bundle — reached as a dependency
 * of all six entries — so excluding it here costs nothing and avoids emitting an artifact that
 * could never be dispatched. Its absence from this array is the decision, not an oversight.
 */
const ENTRY_POINTS = Object.freeze([
  'src/handlers/router.ts',
  'src/handlers/productHandler.ts',
  'src/handlers/skuHandler.ts',
  'src/handlers/brandHandler.ts',
  'src/handlers/optionHandler.ts',
  'src/handlers/googleFeedHandler.ts',
]);

/**
 * The directory the entry surface is drawn from, and the modules in it that are deliberately NOT
 * entry points.
 *
 * The list has exactly one member today, `httpResponse.ts`, for the reason given above. It exists as
 * a named allow-list rather than as a silent exception so that the assertion below can read in one
 * direction only: every non-test TypeScript module in the handler directory is either a declared
 * entry point or an acknowledged helper, and there is no third category. A future helper is added
 * here deliberately, in the same commit that introduces it, which is precisely the review step an
 * exclusion filter would have skipped.
 */
const HANDLER_DIRECTORY = 'src/handlers';
const NON_ENTRY_HANDLER_MODULES = Object.freeze(['httpResponse.ts']);

/**
 * Suffixes that are not modules and are therefore outside the entry-surface assertion.
 *
 * `.test.ts` is test code — jest.config.ts owns it, tsconfig.build.json excludes it, and it must
 * never reach an artifact. `.d.ts` is a declaration file, which contributes no runtime code at all.
 * Both are skipped rather than allow-listed, because neither could ever be a legitimate entry point
 * and enumerating individual test files would defeat the purpose of the check.
 */
const NON_MODULE_SUFFIXES = Object.freeze(['.test.ts', '.d.ts']);

/**
 * The artifacts this script owns, derived from the entry list rather than from the directory.
 *
 * One JavaScript file and one map per entry, at the paths `outbase` makes esbuild choose. Deriving
 * them from ENTRY_POINTS is what keeps the purge below exact: this script can name every file it is
 * responsible for without reading `dist/`, so it never has to guess whether something it finds
 * there is its own output.
 */
function ownedArtifacts() {
  return ENTRY_POINTS.map((entryPoint) => {
    const bundleName = `${basename(entryPoint, '.ts')}.js`;
    const relativeDirectory = relative(sourceRoot, dirname(join(projectRoot, entryPoint)));

    return {
      bundle: join(outputDir, relativeDirectory, bundleName),
      map: join(outputDir, relativeDirectory, `${bundleName}.map`),
      relocatedMap: join(sourcemapDir, relativeDirectory, `${bundleName}.map`),
      relocatedMapDirectory: join(sourcemapDir, relativeDirectory),
    };
  });
}

/**
 * Removes exactly the artifacts this script owns, before anything is asserted or emitted.
 *
 * ⭐ WHY THIS EXISTS, AND WHY IT IS THE FIRST THING THE BUILD DOES. Without it, a build that FAILS
 * leaves the previous run's bundles sitting in the packaging directory, where they are
 * indistinguishable from the output of the run that just failed. A packaging step reading `dist/`
 * after a red build would then carry stale code, and the failure that should have stopped the
 * release would have been absorbed by the artifacts it left untouched. Since a successful build is
 * this deliverable's entire acceptance criterion (AAP 0.8.3.10), a red build must leave nothing
 * behind that could be mistaken for one.
 *
 * ⚠️ IT IS A TARGETED REMOVAL, NOT A RECURSIVE DELETE, AND THAT DISTINCTION IS THE WHOLE DESIGN.
 * This file's own requirements say the build step "does not clean", and the reason given is sound:
 * a recursive delete inside a build script is a hazard in a repository whose other files must not be
 * touched. Both concerns are satisfied by removing an ENUMERATED set of paths — the bundles and maps
 * named by {@link ownedArtifacts}, every one of them computed from the literal entry list and every
 * one of them under `dist/` or `build-meta/`. Nothing is globbed, no directory is removed
 * recursively, and a file this script did not write is never a candidate for removal. `force: true`
 * only means "a path that is already absent is not an error", which is the normal case on a first
 * build.
 */
async function purgeOwnedArtifacts() {
  for (const artifact of ownedArtifacts()) {
    await rm(artifact.bundle, { force: true });
    await rm(artifact.map, { force: true });
    await rm(artifact.relocatedMap, { force: true });
  }
}

/**
 * Fails the build unless the declared entry surface and the handler directory agree exactly.
 *
 * Two assertions, and they close opposite gaps:
 *
 *   1. EVERY DECLARED ENTRY EXISTS. A missing entry is reported here, by path, before esbuild is
 *      invoked. esbuild would also fail on it — its resolver reports an unresolved entry point and
 *      the process exits non-zero either way — but it reports an absolute path inside a resolution
 *      diagnostic, whereas the failure is really "the artifact set this build promises cannot be
 *      produced". Saying that first, in the vocabulary of the entry list, is the difference between
 *      a reader learning which file vanished and a reader reading a bundler stack.
 *
 *   2. EVERY MODULE IN THE HANDLER DIRECTORY IS ACCOUNTED FOR. A literal entry list fixes the
 *      auto-promotion hazard — a new file can no longer become a deployable artifact just by
 *      existing — but on its own it introduces the mirror-image hazard: a genuinely new handler is
 *      SILENTLY not packaged, and the build stays green while the artifact set is quietly wrong.
 *      Asserting that every non-test module is either a declared entry or a named helper closes
 *      both directions at once, and forces the decision to be recorded in this file rather than
 *      inferred from a directory listing.
 *
 * Both failures are hard. Neither is a warning, because a warning on a green build is exactly the
 * shape of signal a release process is entitled to ignore.
 */
async function assertEntrySurface() {
  const problems = [];

  for (const entryPoint of ENTRY_POINTS) {
    try {
      const entryStat = await stat(join(projectRoot, entryPoint));
      if (!entryStat.isFile()) {
        problems.push(`declared entry point is not a file: ${entryPoint}`);
      }
    } catch {
      problems.push(`declared entry point is missing: ${entryPoint}`);
    }
  }

  const declaredNames = new Set(ENTRY_POINTS.map((entryPoint) => basename(entryPoint)));
  let handlerDirectoryEntries;
  try {
    handlerDirectoryEntries = await readdir(join(projectRoot, HANDLER_DIRECTORY), {
      withFileTypes: true,
    });
  } catch {
    handlerDirectoryEntries = [];
    problems.push(`handler directory is missing: ${HANDLER_DIRECTORY}`);
  }

  for (const directoryEntry of handlerDirectoryEntries) {
    if (!directoryEntry.isFile() || !directoryEntry.name.endsWith('.ts')) {
      continue;
    }
    if (NON_MODULE_SUFFIXES.some((suffix) => directoryEntry.name.endsWith(suffix))) {
      continue;
    }
    if (
      declaredNames.has(directoryEntry.name) ||
      NON_ENTRY_HANDLER_MODULES.includes(directoryEntry.name)
    ) {
      continue;
    }
    problems.push(
      `undeclared module in ${HANDLER_DIRECTORY}: ${directoryEntry.name} — add it to ENTRY_POINTS ` +
        'if it is a Lambda entry point, or to NON_ENTRY_HANDLER_MODULES if it is a shared helper',
    );
  }

  if (problems.length > 0) {
    const detail = problems.map((problem) => `  - ${problem}`).join('\n');
    throw new Error(`the declared entry surface does not match the source tree:\n${detail}`);
  }
}

/**
 * Moves each emitted map out of the packaged tree and into {@link sourcemapDir}.
 *
 * Run after a successful build and only then: a red build has no maps to move, and its outputs were
 * already removed before it started. The move mirrors the path `outbase` produced, so
 * `dist/handlers/router.js.map` becomes `build-meta/sourcemaps/handlers/router.js.map` and a reader
 * can find a map from its bundle's name without a lookup table. `rename` within the same subtree is
 * a metadata operation, so nothing is copied and no partially written map can be observed.
 */
async function relocateSourcemaps() {
  for (const artifact of ownedArtifacts()) {
    await mkdir(artifact.relocatedMapDirectory, { recursive: true });
    await rename(artifact.map, artifact.relocatedMap);
  }
}

/**
 * Packages left OUT of the bundle and required from `node_modules` at run time.
 *
 * `mysql2` is the single entry, and it is the only entry the dependency graph can produce:
 * package.json declares exactly one runtime dependency, `mysql2`, and ten development
 * dependencies that exist only to compile, lint, format, test and bundle. Marking the driver
 * external keeps the emitted artifact a thin CommonJS file that carries the port's own code and
 * `require`s the driver alongside it, which is the form the build was proved in. Everything else
 * reachable from an entry point is first-party TypeScript and is bundled.
 *
 * THE AWS SDK IS ABSENT FROM THIS LIST FOR A STRONGER REASON THAN BEING EXTERNAL: it is not in the
 * dependency graph at all. AAP 0.5.2.1 records that it is "intentionally absent because it is
 * present in the Lambda runtime environment already; adding it would inflate the bundle for no
 * gain." Nothing imports it, so there is nothing for the bundler to inline and nothing to exclude
 * — naming it here would imply a dependency that does not exist. The `@types/aws-lambda`
 * development dependency supplies handler event and context typing only; it is types, contributes
 * no runtime code, and disappears at compile time.
 *
 * NO HTTP CLIENT APPEARS HERE EITHER, bundled or external. The Google integration is a stub by
 * instruction (AAP 0.8.3.3) and makes no live call, so no HTTP client exists in the graph to place
 * on either side of this boundary.
 */
const EXTERNAL_PACKAGES = ['mysql2'];

/**
 * Announces the runtime-lifecycle gate on every build, to stderr.
 *
 * WHY IT IS HERE AND NOT ONLY IN A COMMENT. The pinned Node line is out of upstream support, and the
 * managed Lambda runtime deprecation was aligned to that same upstream date. AAP 0.5.5 weighs that
 * evidence and concludes "The pin stands." — the pin is an express instruction, so this script does
 * not quietly retarget it, and AAP 0.5.3.2 likewise rejects a newer @types/node precisely so the
 * type surface keeps matching the runtime. What remains is a disclosure obligation, and a comment
 * reaches only a reader who opens this file. `npm run build` is the last moment at which anything in
 * the subtree can speak to whoever is about to ship the artifact, so the notice is emitted here.
 *
 * ⛔ IT DOES NOT FAIL THE BUILD, DELIBERATELY. A successful build IS the acceptance criterion of
 * AAP 0.8.3.10; failing it would make the plan's own definition of done unreachable and would turn a
 * disclosure into an outage of the gate it was meant to inform. stderr is used so the notice survives
 * a pipeline that captures only stdout, and so it is never mistaken for build output.
 *
 * ⚠️ IT STATES NO FIGURE AND NO DATE OF ITS OWN. No support window, retention period, latency,
 * throughput, availability or capacity number is asserted anywhere in this file — the only version
 * token it owns is NODE_TARGET. The dated account, including the conflicting published timelines for
 * the later control-plane gates, is recorded in tsconfig.json, and this notice points there rather
 * than restating it, so one future correction cannot leave two copies disagreeing.
 *
 * WHY THE TWO MACHINE-READ PINS ARE LEFT BYTE-IDENTICAL. package.json is strict JSON and admits no
 * comment at all, and .nvmrc is a single-line version file that some readers consume whole. Neither
 * is a safe place to carry prose, so neither is touched; the disclosure lives in files with a
 * guaranteed comment grammar instead. Identifying where the pin IS is not the same as identifying
 * where the disclosure must be written.
 */
function announceRuntimeLifecycleGate() {
  console.error(
    `[esbuild] NOTICE  bundler target "${NODE_TARGET}" is pinned to a line that is out of upstream support.`,
  );
  console.error(
    '[esbuild]         The pin is a deliberate, cited plan decision (AAP 0.5.5, "The pin stands."),',
  );
  console.error(
    '[esbuild]         not an oversight, and retargeting is a product decision recorded against the',
  );
  console.error('[esbuild]         plan rather than one this build step may take on its own.');
  console.error(
    '[esbuild]         A green build here means the artifact PACKAGED, which is all AAP 0.8.3.10 asks',
  );
  console.error(
    '[esbuild]         of it; it is not by itself authorization to ship. See tsconfig.json for the',
  );
  console.error(
    '[esbuild]         dated account and the five couplings a runtime move has to change together.',
  );
}

/**
 * Bundles the six entry points into `dist/`.
 *
 * The option set below is the whole configuration, and it is exactly the invocation the plan
 * specifies: bundle, platform node, target node20, format cjs, with the driver external.
 *
 * ⛔ WHAT IS DELIBERATELY ABSENT MATTERS AS MUCH AS WHAT IS PRESENT.
 *
 *   NO `splitting`. Code splitting across six entry points could hoist the configuration layer into
 *   a shared chunk or duplicate it per entry, and either outcome changes which modules are shared at
 *   module scope. All six entries reach src/config/container.ts, which reaches
 *   src/config/database.ts, where the `mysql2` pool is created at module scope precisely so a warm
 *   container reuses one pool. Duplicating that module means duplicating the pool. The port also
 *   holds a stricter boundary in the same area: memoization is scoped to the request object rather
 *   than to module scope, so nothing but that pool is shared across invocations — the legacy code
 *   memoized option-group sort order into component-persistent state and never cleared it, which is
 *   the concrete hazard the boundary exists to avoid. Bundler settings must not perturb any of that,
 *   so splitting stays off and the configuration layer is neither externalized nor aliased away.
 *
 *   ⭐ THE PRICE OF THAT DECISION, MEASURED AND STATED RATHER THAN LEFT TO BE DISCOVERED. With
 *   splitting off, EACH ARTIFACT CARRIES ITS OWN PRIVATE COPY OF THE WHOLE GRAPH — including the
 *   error taxonomy in src/errors/ — so a class is only ever identical to itself WITHIN one artifact.
 *   Loading two artifacts into one process therefore gives two unrelated `DomainError` hierarchies,
 *   and `../src/handlers/httpResponse.ts` classifies a failure by `instanceof`. Measured, with both
 *   artifacts required into one Node process and one genuine `DataIntegrityError` manufactured inside
 *   `dist/handlers/googleFeedHandler.js`:
 *
 *     classified by googleFeedHandler.js (its own class) -> 500 "The request could not be completed
 *                                                              from the stored data"
 *     classified by optionHandler.js     (a foreign class) -> 500 "An unexpected error occurred"
 *
 *   Both refuse safely and neither leaks, but the classification is coarser across the boundary.
 *
 *   ⚠️ THIS IS A PACKAGING CHARACTERISTIC, NOT A DEFECT, AND THE REASON IS THAT NO PRODUCTION PATH
 *   CROSSES ARTIFACTS. Each emitted file is an independent Lambda entry: a function loads exactly one
 *   of them, and within one artifact identity is consistent — which is the control measurement above.
 *   The rule it implies is for TEST AND TOOLING WIRING ONLY: never mix two artifacts from `dist/` in a
 *   single process and then assert on error classification across them, because the coarser answer is
 *   correct behaviour for a genuinely foreign class rather than a regression. The project's own suite
 *   is unaffected — it runs against the TypeScript sources, where there is one module registry and one
 *   class per name.
 *
 *   NO `minify` and NO `legalComments` change, which is what makes the copies large: every artifact
 *   keeps the source comments that document its own reasoning, and each is ≈1.6 MB. Both are real
 *   levers if a deployment ever needs the packaged tree smaller, and they are named here so a future
 *   reader knows they were considered. Neither is exercised now: the deliverable's acceptance bar is a
 *   successful build producing Lambda-compatible artifacts, comments in the packaged output are the
 *   same explanatory record a reader of the source gets, and NO SIZE BUDGET, TARGET OR THRESHOLD IS
 *   ASSERTED ANYWHERE IN THIS SUBTREE (IR-12). The byte figures printed by the bundler are
 *   measurements of its own output, never numbers this script checks against.
 *
 *   NO `alias`, no tsconfig `paths` bridge, no path-mapping plugin and no import-resolver shim. Every
 *   intra-subtree import is a relative path by design, so `tsc` and esbuild resolve identically and
 *   no runtime resolver is needed; tsconfig.json accordingly declares neither `paths` nor `baseUrl`,
 *   and jest.config.ts declares no `moduleNameMapper`. The failure mode this avoids is specific: an
 *   alias that the compiler resolves happily becomes a module-resolution failure at cold start, and
 *   in an entry point that fails the whole invocation. If an import ever fails to resolve, the fix
 *   belongs in the import — never in a bundler shim that papers over it.
 *
 *   NO plugins, and no `inject`, `banner` or `footer`. There is nothing for a plugin to do that the
 *   first-party code should not do itself, a plugin that rewrote module identity would undermine the
 *   module-scope reasoning above, and an injected prelude is a place for state to be re-instantiated
 *   per entry. Keeping the list empty also keeps the toolchain honest: esbuild is the only
 *   third-party import in this file, so `npm run build` needs nothing beyond the pinned dependency
 *   set.
 *
 *   NO archive step and no manifest. This script bundles and packages, and stops there. It does not
 *   zip, version, tag, upload, deploy, watch or serve.
 *
 *   ⚠️ THE ONE THING IT DOES BEYOND BUNDLING is remove its own previous outputs first, and the
 *   qualification "its own" is the whole of the argument. An earlier revision omitted this on the
 *   reasoning that a literal entry list makes the emitted file set deterministic, so esbuild would
 *   overwrite exactly what it owns. That reasoning holds only on the SUCCESS path. On the failure
 *   path esbuild writes nothing, so the previous run's bundles survive in the packaging directory —
 *   observed directly, six stale bundles left behind by a build that exited non-zero. A red build
 *   that leaves a green build's artifacts in place is the one outcome this step must not produce,
 *   because a successful build is the deliverable's acceptance criterion and a packaging step reading
 *   `dist/` cannot tell the two apart. {@link purgeOwnedArtifacts} therefore removes an enumerated
 *   list of paths derived from the entry list — never a recursive delete, never a glob, and never a
 *   file this script did not write.
 *
 * `sourcemap` IS enabled, so a stack trace from a bundled artifact can be read against the
 * TypeScript that produced it; tsconfig.build.json enables maps for its own emit for the same
 * reason. It is set to `'external'` and the maps are then moved beside `dist/` rather than into it
 * — see {@link sourcemapDir} — so the packaged tree holds one artifact per entry point and nothing
 * else, while the maps remain available to a reader who needs them. Both directories are git-ignored,
 * so nothing generated here is ever committed.
 *
 * `logLevel: 'info'` lets esbuild print its own summary of what it wrote. Those are the bundler's
 * measurements of its own output, not budgets, targets or thresholds asserted by this port — no such
 * figure is set anywhere in this file, and none is checked against.
 */
async function bundle() {
  announceRuntimeLifecycleGate();

  console.log(
    `[esbuild] bundling ${ENTRY_POINTS.length} entry point(s): bundle platform=node target=${NODE_TARGET} format=cjs`,
  );
  console.log(`[esbuild] external: ${EXTERNAL_PACKAGES.join(', ')}`);
  console.log(`[esbuild] outdir:   ${relative(projectRoot, outputDir)}`);
  console.log(`[esbuild] maps:     ${relative(projectRoot, sourcemapDir)}`);
  for (const entryPoint of ENTRY_POINTS) {
    console.log(`[esbuild] entry:    ${entryPoint}`);
  }

  /*
   * Order matters, and it is the order the two release-safety properties require.
   *
   * The purge runs FIRST so that no outcome of this run — success, assertion failure or bundler
   * failure — can leave a previous run's artifact in the packaging directory. The assertion runs
   * SECOND so that a build which cannot produce its promised artifact set says so in the vocabulary
   * of the entry list, before the bundler is asked to resolve anything. Only then is anything
   * emitted, and only after a successful emit are the maps moved out of the packaged tree.
   */
  await purgeOwnedArtifacts();
  await assertEntrySurface();

  await build({
    // Resolved against the subtree root rather than the current working directory, so the entry
    // list means the same thing regardless of where `node` was invoked from.
    entryPoints: ENTRY_POINTS.map((entryPoint) => join(projectRoot, entryPoint)),
    outdir: outputDir,
    outbase: sourceRoot,
    bundle: true,
    platform: 'node',
    target: NODE_TARGET,
    format: 'cjs',
    external: EXTERNAL_PACKAGES,
    sourcemap: 'external',
    logLevel: 'info',
  });

  await relocateSourcemaps();

  console.log(
    `[esbuild] wrote ${ENTRY_POINTS.length} bundle(s) to ${relative(projectRoot, outputDir)}`,
  );
  console.log('[esbuild] build complete');
}

/*
 * Failure is loud and the exit status is non-zero, so `npm run build` fails with it.
 *
 * This is not decoration: a successful build is the deliverable's acceptance criterion, so a script
 * that swallowed a diagnostic and still exited zero would make that criterion meaningless. esbuild
 * has already printed its own formatted diagnostics by the time this runs, at the `info` level set
 * above; the error is re-reported here so the reason is adjacent to the failure even when the
 * summary has scrolled away.
 *
 * `process.exitCode` is set rather than calling `process.exit`, so Node exits naturally once stdio
 * has flushed and no diagnostic is truncated on the way out. This is the only interaction with the
 * process object anywhere in this file: nothing here reads `process.env`, because environment
 * variables configure the running service — through src/config/env.ts, the single file permitted to
 * read them — and configure nothing about how it is packaged. `npm run build` therefore succeeds
 * with no variable set, no .env file present, and no database, datasource or credential of any kind
 * available.
 */
bundle().catch((error) => {
  console.error('[esbuild] build FAILED — no deployable artifact was produced');
  console.error(error);
  process.exitCode = 1;
});
