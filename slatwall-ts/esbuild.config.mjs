// slatwall-ts - the esbuild bundler configuration for the `nodejs20.x` Lambda artifacts.
//
// "Deployable" in this port means exactly one thing: a successful build and package step emitting
// Lambda-compatible artifacts.
//
// Error: Dynamic require of "node:buffer" is not supported at
// node_modules/sql-escaper/lib/index.js at node_modules/mysql2/promise.js.
//
// OPTION A --format=cjs Executes correctly; the driver's pool factory resolves.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// The archive writer's only dependency, and the reason `npm run package` needs no host utility:
// `deflateRawSync` produces each entry's body and `crc32` its checksum, both from the pinned
// runtime.
import { crc32, deflateRawSync } from 'node:zlib';

import { build } from 'esbuild';

/**
 * The subtree root, derived from this module's own location rather than from `process.cwd()`.
 *
 * Anchoring here is what makes the script correct from any working directory and is what keeps the
 * isolation invariant checkable: every path below is built from this one value.
 */
const SUBTREE_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * The port's own TypeScript source root.
 */
const SOURCE_DIR = path.join(SUBTREE_DIR, 'src');

/**
 * Where the five capability entrypoints live.
 */
const HANDLERS_DIR = path.join(SOURCE_DIR, 'handlers');

/**
 * The bundle output directory - `dist`, never `build`.
 *
 * `tsconfig.build.json` sets the compiler's `outDir` to `build` precisely so that the declarations
 * `npm run compile` emits are not inside the tree this script clears.
 */
const OUT_DIR = path.join(SUBTREE_DIR, 'dist');

/**
 * The extension emitted for a bundled entrypoint, and the suffix of its external source map.
 */
const ARTIFACT_EXTENSION = '.cjs';
const SOURCE_MAP_EXTENSION = '.cjs.map';

/**
 * The entrypoint set is exactly five modules, and it is frozen.
 *
 * Handler granularity is a recorded design decision: one handler module per bounded capability -
 * catalog query, SKU resolution, promotion application, price resolution, product feed.
 */
const LAMBDA_ENTRYPOINT_FILES = Object.freeze([
  'catalogQueryHandler.ts',
  'skuResolutionHandler.ts',
  'promotionApplicationHandler.ts',
  'priceResolutionHandler.ts',
  'productFeedHandler.ts',
]);

/**
 * The two annotation marker families every emitted source map must still carry.
 *
 * This port reproduces legacy defects rather than repairing them, so the in-code annotations are
 * part of the deliverable.
 *
 * The bracketed forms are matched on purpose: every real annotation cites its legacy locator, so
 * prose that merely names a marker cannot satisfy the check on a marker's behalf.
 */
const REQUIRED_ANNOTATION_MARKERS = Object.freeze(['LEGACY-DEFECT [', 'DELIBERATE DIVERGENCE [']);

/**
 * Prefix for every diagnostic this script writes, so its output is greppable in a build log.
 */
const LOG_PREFIX = '[esbuild]';

/**
 * Resolves the frozen entrypoint list to absolute paths, refusing to proceed if any is missing.
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
    // the subtree rather than to `process.cwd()`.
    absWorkingDir: SUBTREE_DIR,

    // One self-contained artifact per capability. See Option C in the header: nothing is left
    // external, so no artifact depends on a shipped `node_modules` tree or a runtime layer.
    bundle: true,
    platform: 'node',
    target: 'node20',

    // Option A. The one non-negotiable line in this file; see the header for the evidence.
    format: 'cjs',

    // External maps, with the original sources embedded.
    sourcemap: true,
    sourcesContent: true,

    // Minification is off deliberately, but it is not what carries the annotations. Esbuild keeps
    // a comment only where its printer happens to emit one, and the option governing comment
    // retention is `legalComments`.
    minify: false,

    treeShaking: true,

    // Third-party license notices stay inside the artifact.
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

// The package stage: one lambda-compatible archive per capability.

/**
 * The archive extension, and the flag that selects the package stage.
 */
const ARCHIVE_EXTENSION = '.zip';
const ARCHIVE_FLAG = '--zip';

/**
 * The MS-DOS timestamp every archive entry carries: 1980-01-01T00:00:00.
 *
 * The DOS epoch is the earliest value the format can express, and using one fixed value rather
 * than the clock is what makes the archives reproducible.
 */
const DOS_EPOCH_TIME = 0x0000;
const DOS_EPOCH_DATE = 0x0021;

/**
 * ZIP's four record signatures, and the two constants the local/central headers repeat.
 */
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
/**
 * Version 2.0, which is what the deflate method requires.
 */
const ZIP_VERSION = 20;
/**
 * Method 8 is deflate; method 0 (store) is used when deflating would not shrink the entry.
 */
const METHOD_DEFLATE = 8;
const METHOD_STORE = 0;
/**
 * `0o100644` in the high sixteen bits: a regular file, readable by all, writable by its owner.
 *
 * `>>> 0` is load-bearing rather than decorative: JavaScript's `<<` yields a SIGNED 32-bit result,
 * so the shift alone produces a negative number and `Buffer.writeUInt32LE` refuses it.
 */
const UNIX_FILE_ATTRIBUTES = (0o100644 << 16) >>> 0;

/**
 * Which files an archive carries, and - just as deliberately - which it does not.
 *
 * The entry list is a security decision, not a convenience one, so it is stated here as data
 * rather than derived from a directory listing.
 *
 * @param {string} artifact Absolute path to one emitted `.cjs` artifact.
 * @returns {readonly { name: string, path: string } []} The entries, in archive order.
 */
function archiveEntrySources(artifact) {
  const notice = path.join(SUBTREE_DIR, 'NOTICE-GPL.md');
  const entries = [{ name: path.basename(artifact), path: artifact }];
  if (existsSync(notice)) {
    entries.push({ name: path.basename(notice), path: notice });
  }

  return Object.freeze(entries);
}

/**
 * Builds one ZIP archive in memory from a list of named entries.
 *
 * Each entry is deflated, and STORED UNCOMPRESSED when deflating would not make it smaller - which
 * is what a conforming writer does and what keeps a tiny entry from growing.
 *
 * @param {readonly { name: string, path: string } []} entries The files to store, in archive
 * order.
 * @returns {Buffer} The complete archive.
 */
function buildZipArchive(entries) {
  /**
   * @type {Buffer[]}
   */
  const parts = [];
  /**
   * @type {Buffer[]}
   */
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const body = readFileSync(entry.path);
    const deflated = deflateRawSync(body);
    const stored = deflated.length < body.length;
    const payload = stored ? deflated : body;
    const method = stored ? METHOD_DEFLATE : METHOD_STORE;
    const checksum = crc32(body);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIGNATURE, 0);
    localHeader.writeUInt16LE(ZIP_VERSION, 4);
    // No flags: no data descriptor, no encryption, and the name is plain ASCII.
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(DOS_EPOCH_TIME, 10);
    localHeader.writeUInt16LE(DOS_EPOCH_DATE, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(body.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);

    parts.push(localHeader, name, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(CENTRAL_DIRECTORY_SIGNATURE, 0);
    // Version made by: 3 (UNIX) in the high byte, so the external attributes below are read as
    // UNIX permissions; version 2.0 in the low byte.
    centralHeader.writeUInt16LE((3 << 8) | ZIP_VERSION, 4);
    centralHeader.writeUInt16LE(ZIP_VERSION, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(DOS_EPOCH_TIME, 12);
    centralHeader.writeUInt16LE(DOS_EPOCH_DATE, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(body.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(UNIX_FILE_ATTRIBUTES, 38);
    centralHeader.writeUInt32LE(offset, 42);

    central.push(centralHeader, name);

    offset += localHeader.length + name.length + payload.length;
  }

  const directory = Buffer.concat(central);
  const trailer = Buffer.alloc(22);
  trailer.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  // Single-disk archive: both disk numbers are zero and both counts are the whole set.
  trailer.writeUInt16LE(0, 4);
  trailer.writeUInt16LE(0, 6);
  trailer.writeUInt16LE(entries.length, 8);
  trailer.writeUInt16LE(entries.length, 10);
  trailer.writeUInt32LE(directory.length, 12);
  trailer.writeUInt32LE(offset, 16);
  // No archive comment.
  trailer.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, directory, trailer]);
}

/**
 * Writes one archive per artifact into `<subtree>/dist`, and reports what went into each.
 *
 * @param {readonly string[]} artifacts Absolute paths to the emitted artifacts.
 * @returns {readonly { archive: string, entries: readonly string[] } []} Each archive written,
 * with the entry names it carries.
 * @throws {Error} If an artifact's GPL notice is missing, so a deployable cannot ship without the
 * attribution AAP 0.8.3 requires this port to carry forward.
 */
function archiveArtifacts(artifacts) {
  const written = [];

  for (const artifact of artifacts) {
    const entries = archiveEntrySources(artifact);
    const names = entries.map((entry) => entry.name);

    if (!names.includes('NOTICE-GPL.md')) {
      throw new Error(
        [
          'NOTICE-GPL.md is missing from the subtree, so the archive for',
          `${path.basename(artifact)} would ship the derived GPL v3.0 business logic without its`,
          'attribution. Restore the file rather than removing this check: the special exception',
          'permitting custom code covers only /integrationServices/ [readme.md:L63-L65] and does',
          'not extend to this subtree.',
        ].join(' '),
      );
    }

    const archivePath = path.join(
      OUT_DIR,
      `${path.basename(artifact, ARTIFACT_EXTENSION)}${ARCHIVE_EXTENSION}`,
    );

    writeFileSync(archivePath, buildZipArchive(entries));

    written.push(Object.freeze({ archive: archivePath, entries: Object.freeze(names) }));
  }

  return Object.freeze(written);
}

/**
 * Reads a bundle's own source map back off disk and returns it parsed.
 *
 * @param {string} artifact Absolute path to an emitted `.cjs` artifact.
 * @returns {{ path: string, sources: unknown, sourcesContent: unknown } } The map, and where it
 * was read from so a diagnostic can name it.
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
 * @param {readonly string[]} artifacts Absolute paths to the emitted artifacts.
 * @returns {readonly { artifact: string, recovered: Readonly<Record<string, number>> } []} Per
 * artifact, how many occurrences of each required marker were recovered from its map.
 * @throws {Error} If any map omits its embedded sources, or if any required marker is
 * unrecoverable from any artifact.
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

    /**
     * @type {Record<string, number>}
     */
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
 * Bundles the five capability entrypoints into `<subtree>/dist`, and archives them when asked.
 *
 * @param {{ archive?: boolean } } [options] Set `archive` to run the package stage.
 * @returns {Promise<{ artifacts: readonly string[], annotations: readonly object[], archives:
 * readonly object[] } >} What was written, and the annotation evidence read back out of it.
 */
async function bundleLambdaArtifacts(options = {}) {
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

  const archives = options.archive === true ? archiveArtifacts(artifacts) : Object.freeze([]);

  for (const { archive, entries } of archives) {
    console.log(
      `${LOG_PREFIX} Packaged ${path.relative(SUBTREE_DIR, archive)} ` + `[${entries.join(', ')}]`,
    );
  }

  return { artifacts, annotations, archives };
}
export default bundleLambdaArtifacts;

// The routine is exported for programmatic reuse and also invoked here.
//
// FAILURE is LOUD. Esbuild has already printed its own formatted diagnostics at
// `logLevel: 'info'`, so what is added here is the one line naming why the process is failing.

try {
  await bundleLambdaArtifacts({ archive: process.argv.includes(ARCHIVE_FLAG) });
} catch (error) {
  process.exitCode = 1;
  console.error(`${LOG_PREFIX} Build failed.`);
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
}
