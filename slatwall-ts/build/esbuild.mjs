/**
 * slatwall-ts — the Lambda bundle-and-package step
 *
 * What this file is. `npm run build` resolves to `node build/esbuild.mjs`, and this script is the
 * whole of it: it bundles the handler layer into one CommonJS artifact per entry point under `dist/`,
 * writes the derived production manifest beside them and stages the runtime dependency closure. That is
 * also the deliverable's definition of done — AAP §0.8.3.10, verbatim:
 *
 * "'Deployable' is satisfied by a successful build/package step producing Lambda-compatible
 * artifacts — live deployment execution is not required for this run."
 */
import { build } from 'esbuild';
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { builtinModules, createRequire } from 'node:module';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Paths. */
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The bundler's `outbase`, and the same directory tsconfig.build.json names as its `rootDir`. */
const sourceRoot = join(projectRoot, 'src');

/** The output directory: `dist`, and deliberately nothing else. */
const outputDir = join(projectRoot, 'dist');

/** Where the source maps land, and why it is not `dist`. */
const sourcemapDir = join(projectRoot, 'build-meta', 'sourcemaps');

/** Where the package is assembled, and the reason `dist/` is never written to incrementally. */
const stagingDir = join(projectRoot, 'build-meta', 'package-staging');

/** The production manifest's filename, inside the package. */
const PRODUCTION_MANIFEST_NAME = 'package.json';

/** The directory the runtime dependency closure is staged into, inside the package. */
const STAGED_MODULES_DIRECTORY = 'node_modules';

/** The bundler target. */
const NODE_TARGET = 'node20';

/** The six Lambda entry points, enumerated literally. */
const ENTRY_POINTS = Object.freeze([
  'src/handlers/router.ts',
  'src/handlers/productHandler.ts',
  'src/handlers/skuHandler.ts',
  'src/handlers/brandHandler.ts',
  'src/handlers/optionHandler.ts',
  'src/handlers/googleFeedHandler.ts',
]);

/**
 * The directory the entry surface is drawn from, and the modules in it that are deliberately not
 * entry points.
 */
const HANDLER_DIRECTORY = 'src/handlers';
const NON_ENTRY_HANDLER_MODULES = Object.freeze(['httpResponse.ts']);

/** Suffixes that are not modules and are therefore outside the entry-surface assertion. */
const NON_MODULE_SUFFIXES = Object.freeze(['.test.ts', '.d.ts']);

/** The artifacts this script owns, derived from the entry list rather than from the directory. */
function ownedArtifacts() {
  return ENTRY_POINTS.map((entryPoint) => {
    const bundleName = `${basename(entryPoint, '.ts')}.js`;
    const relativeDirectory = relative(sourceRoot, dirname(join(projectRoot, entryPoint)));

    return {
      /* Where the bundler writes it, and the only place it is ever written. */
      stagedBundle: join(stagingDir, relativeDirectory, bundleName),
      stagedMap: join(stagingDir, relativeDirectory, `${bundleName}.map`),
      /* Where it lands after the single promoting `rename`. Not written to at any point. */
      packagedBundle: join(outputDir, relativeDirectory, bundleName),
      relocatedMap: join(sourcemapDir, relativeDirectory, `${bundleName}.map`),
      relocatedMapDirectory: join(sourcemapDir, relativeDirectory),
    };
  });
}

/** Removes every path this script owns, so nothing survives from an earlier run. */
async function purgeOwnedArtifacts() {
  /*
   * Every path is attempted and the failures are collected, rather than aborting on the first. `rm`'s
   * `force` suppresses only `ENOENT`, so any other error — a permission fault, a path that is a directory
   * where a file was expected — would propagate out of the loop and leave every remaining path untouched.
   */
  const failures = [];
  const attempt = async (path, options) => {
    try {
      await rm(path, options);
    } catch (error) {
      failures.push({ path, error });
    }
  };

  for (const artifact of ownedArtifacts()) {
    await attempt(artifact.relocatedMap, { force: true });
  }
  await attempt(stagingDir, { force: true, recursive: true });
  await attempt(outputDir, { force: true, recursive: true });

  if (failures.length > 0) {
    const account = failures
      .map(({ path, error }) => `  ${relative(projectRoot, path)} — ${String(error)}`)
      .join('\n');
    throw new Error(
      `[esbuild] the purge step could not remove ${failures.length} path(s), so a previous package may ` +
        `still be present and the promoting rename cannot proceed:\n${account}`,
    );
  }
}

/** Removes whatever a failed run had produced, so a red build leaves nothing behind anywhere. */
async function discardIncompleteOutputs() {
  try {
    await purgeOwnedArtifacts();
  } catch (cleanupError) {
    console.error('[esbuild] WARNING  the post-failure cleanup did not complete:');
    console.error(cleanupError);
  }
}

/** Fails the build unless the declared entry surface and the handler directory agree exactly. */
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

/** Moves each emitted map out of the staged package and into {@link sourcemapDir}. */
async function relocateSourcemaps() {
  for (const artifact of ownedArtifacts()) {
    await mkdir(artifact.relocatedMapDirectory, { recursive: true });
    await rename(artifact.stagedMap, artifact.relocatedMap);
  }
}

/**
 * Reads the subtree's own `package.json`. every packaged version fact is derived from it here rather
 * than restated in this file, so the two can never disagree.
 */
async function readProjectManifest() {
  return JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'));
}

/**
 * Derives the production manifest from the development one, field by field.
 *
 * @param manifest the parsed source manifest
 * @returns the production manifest object
 * @throws {Error} when a required field is missing, so a manifest change cannot silently produce an
 * incomplete package.
 */
function buildProductionManifest(manifest) {
  const missing = ['name', 'version', 'type', 'engines', 'dependencies'].filter(
    (field) => manifest[field] === undefined,
  );
  if (missing.length > 0) {
    throw new Error(
      `the subtree manifest is missing ${missing.join(', ')}, so no production manifest can be derived`,
    );
  }

  return {
    name: manifest.name,
    version: manifest.version,
    private: true,
    type: manifest.type,
    engines: manifest.engines,
    dependencies: manifest.dependencies,
  };
}

/**
 * Writes the production manifest into the staged package.
 *
 * @param manifest the parsed source manifest.
 */
async function writeProductionManifest(manifest) {
  const production = buildProductionManifest(manifest);
  await mkdir(stagingDir, { recursive: true });
  await writeFile(
    join(stagingDir, PRODUCTION_MANIFEST_NAME),
    `${JSON.stringify(production, null, 2)}\n`,
    'utf8',
  );
  const dependencyNames = Object.keys(production.dependencies);
  console.log(
    `[esbuild] manifest: ${PRODUCTION_MANIFEST_NAME} declaring ${dependencyNames.length} runtime dependency(ies): ${dependencyNames.join(', ')}`,
  );
}

/**
 * Finds an installed package's directory by walking the `node_modules` chain upward from `fromDirectory`.
 *
 * @param name the package name, scoped or plain
 * @param fromDirectory the directory to begin the upward walk from
 * @returns the package's directory, or `undefined` when no ancestor holds it.
 */
async function resolvePackageDirectory(name, fromDirectory) {
  let directory = fromDirectory;

  for (;;) {
    const candidate = join(directory, STAGED_MODULES_DIRECTORY, name);
    try {
      const manifestStat = await stat(join(candidate, 'package.json'));
      if (manifestStat.isFile()) {
        return candidate;
      }
    } catch {
      /*
       * Not here; keep walking. An unreadable candidate is treated as absent, exactly as the
       * resolver treats it.
       */
    }

    const parent = dirname(directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;
  }
}

/**
 * Collects the transitive runtime dependency closure of the declared production dependencies.
 *
 * @param manifest the parsed source manifest
 * @returns a map from package name to the source directory holding it
 * @throws {error} when a declared dependency is not installed, or a name resolves two ways.
 */
async function collectRuntimeClosure(manifest) {
  const closure = new Map();
  const problems = [];
  const pending = Object.keys(manifest.dependencies).map((name) => ({
    name,
    fromDirectory: projectRoot,
    requiredBy: 'package.json',
  }));

  while (pending.length > 0) {
    const request = pending.shift();
    const directory = await resolvePackageDirectory(request.name, request.fromDirectory);

    if (directory === undefined) {
      problems.push(
        `runtime dependency "${request.name}" (required by ${request.requiredBy}) is not installed — ` +
          'run `npm ci` before building',
      );
      continue;
    }

    const already = closure.get(request.name);
    if (already !== undefined) {
      if (already !== directory) {
        problems.push(
          `runtime dependency "${request.name}" resolves two ways — ${relative(projectRoot, already)} ` +
            `and ${relative(projectRoot, directory)} — which a flat staged tree cannot represent`,
        );
      }
      continue;
    }

    closure.set(request.name, directory);

    const dependencyManifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    for (const dependencyName of Object.keys(dependencyManifest.dependencies ?? {})) {
      pending.push({
        name: dependencyName,
        fromDirectory: directory,
        requiredBy: `${request.name}/package.json`,
      });
    }
  }

  if (problems.length > 0) {
    const detail = problems.map((problem) => `  - ${problem}`).join('\n');
    throw new Error(`the runtime dependency closure could not be resolved:\n${detail}`);
  }

  return closure;
}

/**
 * Copies one directory tree, excluding any nested `node_modules`.
 *
 * @param from the source directory
 * @param to the destination directory.
 */
async function copyDirectory(from, to) {
  await mkdir(to, { recursive: true });

  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === STAGED_MODULES_DIRECTORY) {
        continue;
      }
      await copyDirectory(join(from, entry.name), join(to, entry.name));
      continue;
    }

    /*
     * `isFile()` is false for a symlink, so following it explicitly is what copies the target's bytes:
     * `copyFile` dereferences, and the entry test is the only place the distinction is visible.
     */
    if (entry.isFile() || entry.isSymbolicLink()) {
      await copyFile(join(from, entry.name), join(to, entry.name));
    }
  }
}

/**
 * Stages the runtime dependency closure into the package.
 *
 * @param closure the map {@link collectRuntimeClosure} produced.
 */
async function stageRuntimeClosure(closure) {
  const stagedModules = join(stagingDir, STAGED_MODULES_DIRECTORY);
  await mkdir(stagedModules, { recursive: true });

  for (const [name, sourceDirectory] of closure) {
    await copyDirectory(sourceDirectory, join(stagedModules, name));
  }

  console.log(
    `[esbuild] staged:   ${closure.size} runtime package(s) into ${STAGED_MODULES_DIRECTORY}/: ${[...closure.keys()].sort().join(', ')}`,
  );
}

/** Whether `candidate` is inside `directory`, by path containment rather than by string prefix. */
function isInside(directory, candidate) {
  const relativePath = relative(directory, candidate);

  return (
    relativePath !== '' && !relativePath.startsWith('..') && !relativePath.startsWith(`${sep}`)
  );
}

/**
 * Every bare `require` specifier appearing in `text`, de-duplicated.
 *
 * @param text the artifact's source
 * @returns the bare specifiers, in first-seen order.
 */
function bareRequireSpecifiers(text) {
  const specifiers = [];
  const builtins = new Set(builtinModules);

  for (const match of text.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) {
    const specifier = match[1];
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      continue;
    }
    if (specifier.startsWith('node:') || builtins.has(specifier)) {
      continue;
    }
    if (!specifiers.includes(specifier)) {
      specifiers.push(specifier);
    }
  }

  return specifiers;
}

/**
 * Fails the build unless every external the final package requires resolves from inside that package.
 *
 * @param closure the map {@link collectRuntimeClosure} produced
 * @throws {error} when any specifier resolves outside the package, or fails to resolve at all.
 */
async function assertPackageRequireClosure(closure) {
  const stagedModules = join(stagingDir, STAGED_MODULES_DIRECTORY);
  const problems = [];
  let checkedSpecifiers = 0;

  for (const artifact of ownedArtifacts()) {
    const text = await readFile(artifact.stagedBundle, 'utf8');
    const specifiers = bareRequireSpecifiers(text);
    const artifactName = relative(stagingDir, artifact.stagedBundle);
    const requireFromArtifact = createRequire(artifact.stagedBundle);

    for (const specifier of specifiers) {
      checkedSpecifiers += 1;
      let resolved;
      try {
        resolved = requireFromArtifact.resolve(specifier);
      } catch (resolutionError) {
        problems.push(
          `${artifactName} requires "${specifier}", which does not resolve at all: ${resolutionError.message}`,
        );
        continue;
      }

      if (!isInside(stagedModules, resolved)) {
        problems.push(
          `${artifactName} requires "${specifier}", which resolves OUTSIDE the package, to ` +
            `${relative(projectRoot, resolved)} — the package must carry it`,
        );
      }
    }
  }

  for (const [name, sourceDirectory] of closure) {
    const dependencyManifest = JSON.parse(
      await readFile(join(sourceDirectory, 'package.json'), 'utf8'),
    );
    for (const dependencyName of Object.keys(dependencyManifest.dependencies ?? {})) {
      try {
        const dependencyStat = await stat(join(stagedModules, dependencyName, 'package.json'));
        if (!dependencyStat.isFile()) {
          problems.push(
            `staged package "${name}" needs "${dependencyName}", which is not a package`,
          );
        }
      } catch {
        problems.push(
          `staged package "${name}" needs "${dependencyName}", which is absent from the package`,
        );
      }
    }
  }

  if (problems.length > 0) {
    const detail = problems.map((problem) => `  - ${problem}`).join('\n');
    throw new Error(`the packaged require closure is incomplete:\n${detail}`);
  }

  console.log(
    `[esbuild] closure:  ${checkedSpecifiers} external require(s) across ${ENTRY_POINTS.length} artifact(s) resolve inside the package`,
  );
}

/** Promotes the staged package to {@link outputDir}, in one operation. */
async function promotePackage() {
  await rename(stagingDir, outputDir);
}

/** Packages left out of the bundle and required from `node_modules` at run time. */
const EXTERNAL_PACKAGES = ['mysql2'];

/** Announces the runtime-lifecycle gate on every build, to stderr. */
function announceRuntimeLifecycleGate() {
  console.error(
    `[esbuild] NOTICE  bundler target "${NODE_TARGET}" is pinned to a line that is out of upstream support.`,
  );
  console.error(
    '[esbuild]         The pin is a deliberate, cited plan decision (AAP §0.5.5, "The pin stands."),',
  );
  console.error(
    '[esbuild]         not an oversight, and retargeting is a product decision recorded against the',
  );
  console.error('[esbuild]         plan rather than one this build step may take on its own.');
  console.error(
    '[esbuild]         A green build here means the artifact packaged, which is all AAP §0.8.3.10 asks',
  );
  console.error(
    '[esbuild]         of it; it is not by itself authorization to ship. README.md §2.2 carries the',
  );
  console.error(
    '[esbuild]         dated account and the six couplings a runtime move has to change together.',
  );
}

/** Bundles the six entry points into the staging tree. */
async function emitBundles() {
  await build({
    // Resolved against the subtree root rather than the current working directory, so the entry
    // list means the same thing regardless of where `node` was invoked from.
    entryPoints: ENTRY_POINTS.map((entryPoint) => join(projectRoot, entryPoint)),
    outdir: stagingDir,
    outbase: sourceRoot,
    bundle: true,
    platform: 'node',
    target: NODE_TARGET,
    format: 'cjs',
    external: EXTERNAL_PACKAGES,
    sourcemap: 'external',
    logLevel: 'info',
  });
}

/** The pipeline, as an ordered list of named steps. */
export const BUILD_STEPS = Object.freeze([
  { name: 'purge', run: purgeOwnedArtifacts },
  { name: 'assert-entry-surface', run: assertEntrySurface },
  { name: 'emit', run: emitBundles },
  { name: 'relocate-sourcemaps', run: relocateSourcemaps },
  {
    name: 'write-manifest',
    run: async () => {
      await writeProductionManifest(await readProjectManifest());
    },
  },
  {
    name: 'stage-dependencies',
    run: async () => {
      await stageRuntimeClosure(await collectRuntimeClosure(await readProjectManifest()));
    },
  },
  {
    name: 'assert-require-closure',
    run: async () => {
      await assertPackageRequireClosure(await collectRuntimeClosure(await readProjectManifest()));
    },
  },
  { name: 'promote', run: promotePackage },
]);

/**
 * Runs the pipeline, and leaves nothing behind if any step fails.
 *
 * @param steps the ordered steps to run; defaults to the whole pipeline
 * @throws whatever a step threw, after the cleanup has run.
 */
export async function runBuild(steps = BUILD_STEPS) {
  announceRuntimeLifecycleGate();

  console.log(
    `[esbuild] bundling ${ENTRY_POINTS.length} entry point(s): bundle platform=node target=${NODE_TARGET} format=cjs`,
  );
  console.log(`[esbuild] external: ${EXTERNAL_PACKAGES.join(', ')}`);
  console.log(`[esbuild] staging:  ${relative(projectRoot, stagingDir)}`);
  console.log(`[esbuild] package:  ${relative(projectRoot, outputDir)}`);
  console.log(`[esbuild] maps:     ${relative(projectRoot, sourcemapDir)}`);
  for (const entryPoint of ENTRY_POINTS) {
    console.log(`[esbuild] entry:    ${entryPoint}`);
  }

  try {
    for (const step of steps) {
      console.log(`[esbuild] step:     ${step.name}`);
      await step.run();
    }
  } catch (error) {
    /*
     * The invariant is structural — `dist/` is written only by `promote` — so this removes the staging
     * tree rather than rescuing the package. It never masks the failure it is cleaning up after.
     */
    await discardIncompleteOutputs();
    throw error;
  }

  console.log(
    `[esbuild] wrote ${ENTRY_POINTS.length} bundle(s), a production manifest and the runtime dependency closure to ${relative(projectRoot, outputDir)}`,
  );
  console.log('[esbuild] build complete');
}

/* Failure is loud and the exit status is non-zero, so `npm run build` fails with it. */
const launchedScript = process.argv[1];
const invokedAsScript =
  launchedScript !== undefined && resolve(launchedScript) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  runBuild().catch((error) => {
    console.error('[esbuild] build FAILED — no deployable artifact was produced');
    console.error(error);
    process.exitCode = 1;
  });
}
