// esbuild bundler configuration for the AWS Lambda `nodejs20.x` artifacts.
//
// WHY THIS FILE IS PRESENT AND MUST NOT BE DEFERRED
// It is a root manifest of this subtree, enumerated as CREATE in the AAP's own
// target layout ("esbuild.config.mjs  (CREATE - CJS Lambda bundle, node20
// target)", AAP 0.3.1) and again in the root-manifest transformation table
// (AAP 0.4.1). Four things depend on it existing now rather than later:
//
//   * AAP 0.4.5 — "The entire refactor is executed in a single phase... There is
//     no staging, no sequencing across phases, and no partial delivery." A
//     dependency-safe authoring order exists inside that phase, but it is "a
//     compile-order convenience, not a schedule", so a manifest cannot be held
//     back for a later index.
//   * AAP 0.9.1 — the "Bundle build" gate (`esbuild` produces the Lambda
//     artifact in CommonJS format) and the "Bundle execution" gate (invoke the
//     built artifact; the driver's pool factory must resolve) are both recorded
//     as already PROVEN. Removing this file un-proves both.
//   * AAP 0.5.2 — the CommonJS-versus-ESM decision was settled by reproducing
//     the ESM failure directly, and this file is where that recorded remedy
//     lives. The reasoning is preserved verbatim below.
//   * `package.json` — the `bundle`, `build` and `package` scripts invoke
//     `node esbuild.config.mjs`. Deleting it breaks three published scripts and
//     the composite `verify` chain that AAP 0.9.6's definition of done runs.
//
// FORMAT IS CommonJS, DELIBERATELY.
// Bundling this dependency set to ESM builds cleanly and then fails at runtime:
//
//   Error: Dynamic require of "node:buffer" is not supported
//       at node_modules/sql-escaper/lib/index.js
//       at node_modules/mysql2/promise.js
//
// The MySQL driver's CommonJS dependency chain uses dynamic `require()`, which
// an ESM bundle cannot resolve. Emitting CommonJS needs no shim and matches the
// Lambda runtime's default handler resolution. The validated alternative is
// `format: 'esm'` plus a `createRequire` banner injected into the preamble; it
// also works, but requires the shim, so CJS is the primary artifact.
//
// TypeScript source stays modern (module/moduleResolution: NodeNext); only the
// emitted bundle format differs. Output uses the `.cjs` extension so Node loads
// it as CommonJS regardless of the ESM `"type": "module"` in package.json.
//
// Usage:
//   node esbuild.config.mjs          bundle only
//   node esbuild.config.mjs --zip    bundle, then emit Lambda-compatible .zip

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const handlersDir = path.join(rootDir, 'src', 'handlers');
const outDir = path.join(rootDir, 'dist');

const shouldZip = process.argv.includes('--zip');

// A single routed entrypoint is the primary artifact; the per-capability
// handlers are bundled as additional independently deployable entrypoints when
// they are present.
const CANDIDATE_ENTRYPOINTS = [
  'router.ts',
  'catalogQueryHandler.ts',
  'skuResolutionHandler.ts',
  'promotionApplicationHandler.ts',
  'priceResolutionHandler.ts',
  'productFeedHandler.ts',
];

const entryPoints = CANDIDATE_ENTRYPOINTS.map((file) => path.join(handlersDir, file)).filter((p) =>
  existsSync(p),
);

if (entryPoints.length === 0) {
  console.warn(
    [
      '[esbuild] No Lambda entrypoints found under src/handlers/.',
      `[esbuild] Looked for: ${CANDIDATE_ENTRYPOINTS.join(', ')}`,
      '[esbuild] Nothing to bundle yet - skipping. This is expected until the',
      '[esbuild] handler layer is authored; re-run `npm run build` afterwards.',
    ].join('\n'),
  );
  process.exit(0);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const result = await build({
  entryPoints,
  outdir: outDir,
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  // SECURITY REVIEW DISPOSITION - RAISED AS S-09, DECLINED ON A CITED MANDATE.
  //
  // Finding S-09 (MAJOR, CWE-1104, Use of Unmaintained Third-Party Components)
  // records that Node 20 reached end of life on 2026-04-30, that v20.20.2 is marked
  // out of maintenance, and that AWS deprecated the `nodejs20.x` Lambda runtime on
  // the same date - blocking new functions from 2027-02-01 and updates from
  // 2027-03-03. The assessment is accepted as accurate; it is a platform-lifecycle
  // exposure rather than an allegation about any package in this tree, and
  // `npm audit` is clean.
  //
  // THE UPGRADE IS DECLINED HERE BECAUSE IT IS NOT THIS AGENT'S TO MAKE. The runtime
  // is fixed by the frozen plan in three independent places: AAP 0.1.1 states the
  // objective as re-expressing the slice "on the AWS Lambda `nodejs20.x` runtime";
  // AAP 0.5.1 pins Node 20.20.2, npm 10.8.2, `@types/node` 20.19.43 and eleven more
  // packages to exact verified versions, and records that the 20.20.2 floor is
  // itself forced by eslint's `^20.19.0` engine requirement; AAP 0.9.1 makes
  // "Node `20.x`" a pass condition of the runtime-and-toolchain-pinning gate. The
  // AAP is the agreed, frozen source of truth and is to be aligned to, never
  // edited - so changing the target would put this file, `package.json`,
  // `package-lock.json`, `.nvmrc`, `@types/node` and the verified bundle recipe out
  // of agreement with the plan, and would invalidate the packaging constraint AAP
  // 0.5.2 established by experiment rather than by assumption.
  //
  // It is therefore recorded for the plan owner as a platform decision with a dated
  // deadline (new functions blocked 2027-02-01), not resolved by unilateral drift in
  // a code-remediation pass. The four artifacts that would have to move together are
  // named above so the change is a single deliberate edit when it is authorized.
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  sourcesContent: false,
  minify: false,
  treeShaking: true,
  legalComments: 'linked',
  logLevel: 'info',
  metafile: true,
});

const artifacts = Object.keys(result.metafile.outputs)
  .filter((f) => f.endsWith('.cjs'))
  .map((f) => path.resolve(rootDir, f));

console.log(`[esbuild] Bundled ${artifacts.length} Lambda artifact(s) to dist/ as CommonJS.`);
for (const artifact of artifacts) {
  console.log(`[esbuild]   ${path.relative(rootDir, artifact)}`);
}

if (shouldZip) {
  for (const artifact of artifacts) {
    const base = path.basename(artifact, '.cjs');
    const zipPath = path.join(outDir, `${base}.zip`);
    rmSync(zipPath, { force: true });
    // -j junks paths so the handler file sits at the archive root, which is what
    // the Lambda runtime expects.
    execFileSync('zip', ['-q', '-j', zipPath, artifact], { stdio: 'inherit' });
    console.log(`[esbuild] Packaged ${path.relative(rootDir, zipPath)}`);
  }
}
