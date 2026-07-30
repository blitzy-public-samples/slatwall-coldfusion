/**
 * Lambda packaging step for slatwall-ts.
 *
 * Produces one CommonJS artifact per Lambda entry point under src/handlers/, matching the
 * shape the nodejs20.x runtime loads. This script IS the "deployable" bar defined in
 * AAP 0.8.3.10: a successful `npm run typecheck && npm run build` is the acceptance
 * criterion. Infrastructure as code is explicitly out of scope, so no runtime string,
 * function definition or deployment call appears anywhere in this file.
 *
 * Fixed decisions (AAP 0.3.2 "Lambda packaging and cold-start structure", 0.4.1.2):
 *   platform node / target node20 / format cjs  — the nodejs20.x contract.
 *   bundle                                      — bundling is the dominant lever on
 *                                                 package size and cold start.
 *   external: aws-sdk + @aws-sdk/*              — the AWS SDK ships inside the runtime;
 *                                                 bundling it would inflate the artifact
 *                                                 for no gain.
 *   mysql2 is bundled                           — it is the only runtime dependency and
 *                                                 AAP 0.5.2.1 places it inside the
 *                                                 bundle. Set ESBUILD_EXTERNAL=mysql2 to
 *                                                 externalise it instead (e.g. when it is
 *                                                 supplied by a Lambda layer); that was
 *                                                 the form used for the environment probe
 *                                                 in AAP 0.1.2.3.
 */
import { build } from 'esbuild';
import { readdir, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const handlerDir = join(projectRoot, 'src', 'handlers');
const outDir = join(projectRoot, 'dist');

const NODE_TARGET = 'node20';

/** AWS SDK v3 and v2 are provided by the runtime and must never be bundled. */
const runtimeProvided = ['aws-sdk', '@aws-sdk/*'];

/** Optional comma-separated additions, e.g. ESBUILD_EXTERNAL=mysql2 */
const extraExternal = (process.env.ESBUILD_EXTERNAL ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const external = [...runtimeProvided, ...extraExternal];

async function collectEntryPoints() {
  if (!existsSync(handlerDir)) return [];
  const entries = await readdir(handlerDir, { withFileTypes: true });
  return entries
    .filter(
      (e) =>
        e.isFile() &&
        e.name.endsWith('.ts') &&
        !e.name.endsWith('.d.ts') &&
        !e.name.endsWith('.test.ts') &&
        // Not Lambda entry points: the route table and the response-shaping helper are
        // imported by handlers rather than invoked by the runtime.
        e.name !== 'router.ts' &&
        e.name !== 'httpResponse.ts',
    )
    .map((e) => join(handlerDir, e.name));
}

async function main() {
  const entryPoints = await collectEntryPoints();

  if (entryPoints.length === 0) {
    console.log(
      '[esbuild] No Lambda entry points found under src/handlers/*.ts — nothing to bundle.',
    );
    console.log(
      '[esbuild] This is expected while the TypeScript sources described in AAP 0.4.1 are',
    );
    console.log(
      '[esbuild] still being generated. Once src/handlers/*.ts exist this step emits one',
    );
    console.log(`[esbuild] CommonJS artifact per handler into ${outDir}.`);
    return;
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  console.log(`[esbuild] target=${NODE_TARGET} format=cjs platform=node`);
  console.log(`[esbuild] external=${external.join(', ')}`);
  for (const entry of entryPoints) {
    console.log(`[esbuild] entry ${entry.replace(`${projectRoot}/`, '')}`);
  }

  const result = await build({
    entryPoints,
    outdir: outDir,
    outbase: join(projectRoot, 'src'),
    bundle: true,
    platform: 'node',
    target: NODE_TARGET,
    format: 'cjs',
    sourcemap: true,
    minify: false,
    treeShaking: true,
    keepNames: true,
    legalComments: 'none',
    logLevel: 'info',
    metafile: true,
    external,
  });

  await writeFile(join(outDir, 'metafile.json'), JSON.stringify(result.metafile, null, 2), 'utf8');

  const bundles = Object.entries(result.metafile.outputs)
    .filter(([file]) => file.endsWith('.js'))
    .map(([file, meta]) => `${file} (${(meta.bytes / 1024).toFixed(1)} kB)`);
  console.log(`[esbuild] wrote ${bundles.length} bundle(s):`);
  for (const b of bundles) console.log(`[esbuild]   ${b}`);
}

main().catch((err) => {
  console.error('[esbuild] build failed');
  console.error(err);
  process.exitCode = 1;
});
