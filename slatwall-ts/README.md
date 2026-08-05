# slatwall-ts

A TypeScript re-expression of a bounded **catalog + promotions/pricing** slice of
[Slatwall](http://www.getslatwall.com) 3.1.39, targeting the AWS Lambda `nodejs20.x` runtime.

The legacy CFML application still lives in this repository, unchanged, in the directories beside
this one. This subtree is additive: it lifts the business logic of six `*Service.cfc` components and
the Google product-feed integration out of the Hibachi/FW-1/DI-1 host and re-expresses it in strict
TypeScript behind a thin routing layer. It continues to read and write the existing `Sw*` MySQL
tables **as they are** — there is no migration, no rename, no new table and no column change.

Two consequences of that follow immediately, and both are load-bearing:

- **Nothing outside `slatwall-ts/` is modified.** The CFML monolith keeps running; the two
  implementations coexist. That coexistence is the strangler-fig seam, not an accident of sequencing.
- **Behaviour is preserved at the interface boundary, defects included.** Where the legacy code
  contains a defect that changes money, the defect is reproduced and annotated rather than repaired.
  Every such site carries a `LEGACY-DEFECT [<path>:<locator>]` marker, and the three sanctioned
  exceptions carry a `DELIBERATE DIVERGENCE [<citation>]` marker instead. `tsconfig.build.json` sets
  `removeComments: false` precisely so those annotations survive into the emitted artifact.

---

## Toolchain

| Component | Pinned version | Where the pin lives                                  |
| --------- | -------------- | ---------------------------------------------------- |
| Node.js   | `20.20.2`      | `.nvmrc`, plus `engines.node` `">=20.19.0 <21"`      |
| npm       | `10.8.2`       | `engines.npm` `">=10.8.2"` (ships with Node 20.20.2) |

Node is bounded at the `20.x` line because that is the Lambda runtime this port targets. A newer
Node will fail the `engines` check rather than silently build against a runtime the artifact will
never see. The lower bound is `20.19.0` because that is what ESLint 10 itself requires.

```bash
nvm install        # honours .nvmrc
nvm use            # -> v20.20.2
node -v && npm -v  # v20.20.2 / 10.8.2

npm ci             # install from package-lock.json, exactly
```

Use `npm ci`, not `npm install`. Every dependency below is pinned to an **exact** version — no caret
ranges, no `latest` — and `npm ci` is the command that honours the lockfile without renegotiating it.

### Runtime dependencies

| Package      | Version  | Why it is here                                                                                                                                                       |
| ------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `decimal.js` | `10.6.0` | Arbitrary-precision decimal arithmetic, wrapped by the `Money` value object. `Money` is the **only** arithmetic surface for a monetary value in this subtree.        |
| `mysql2`     | `3.23.1` | MySQL driver over the existing `Sw*` schema. Every statement is a prepared statement, which is what preserves the injection-safety property `cfqueryparam` provided. |
| `zod`        | `4.4.3`  | Typed schema validation, porting the declarative rules under the legacy `model/validation/`.                                                                         |

### Development dependencies

| Package               | Version    | Role                                                                                                                          |
| --------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `typescript`          | `5.9.3`    | Compiler. Must stay on the `5.x` line.                                                                                        |
| `@types/node`         | `20.19.43` | Node typings matched to the target runtime line.                                                                              |
| `@types/aws-lambda`   | `8.10.162` | Handler and API Gateway event typings for the routing layer.                                                                  |
| `vitest`              | `4.1.10`   | Test runner. Consumes the project `tsconfig` with no transform.                                                               |
| `@vitest/coverage-v8` | `4.1.10`   | Coverage reporting, version-locked to the runner.                                                                             |
| `esbuild`             | `0.28.1`   | Bundler that produces the Lambda artifacts.                                                                                   |
| `eslint`              | `10.8.0`   | Linting, including the layer-boundary import rule.                                                                            |
| `typescript-eslint`   | `8.65.0`   | TypeScript parser and rule set for ESLint.                                                                                    |
| `prettier`            | `3.9.6`    | Formatting.                                                                                                                   |
| `dotenv`              | `17.4.2`   | Local and test environment loading only. Lambda injects environment variables natively, so this never executes in production. |

Counting the Node runtime itself, that is the fourteen pins this port is held to. Deliberately
**absent**: no XML library (the RSS renderer hand-rolls a five-entity escaper), no logging library
(the logger writes structured JSON to stdout, which Lambda captures natively), and no
dependency-injection container (hand-wiring in `src/handlers/bootstrap.ts` is the entire point of
removing DI/1).

---

## Commands

All commands run from this directory.

| Command                 | What it does                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `npm run typecheck`     | `tsc --noEmit` over `src/**` **and** `tests/**` under the full strict profile.               |
| `npm run lint`          | `eslint .` — includes the `no-restricted-imports` layer boundary.                            |
| `npm run lint:fix`      | The same, with auto-fixable violations applied.                                              |
| `npm run format:check`  | `prettier --check .` — covers TypeScript, JSON **and** Markdown, including this file.        |
| `npm run format`        | `prettier --write .`                                                                         |
| `npm test`              | `vitest run`. Single pass, never watch mode. Needs no database and no environment variables. |
| `npm run test:coverage` | `vitest run --coverage`, enforcing the thresholds in `vitest.config.ts`.                     |
| `npm run compile`       | `tsc -p tsconfig.build.json` — emits `.js`, `.d.ts` and maps for `src/**` into `build/`.     |
| `npm run bundle`        | `node esbuild.config.mjs` — emits the bundled Lambda artifacts into `dist/`.                 |
| `npm run build`         | `typecheck` then `bundle`.                                                                   |
| `npm run package`       | `typecheck` then `bundle --zip` — the deployable artifacts plus a `.zip` per entrypoint.     |
| `npm run verify`        | `typecheck` → `lint` → `format:check` → `test`. The gate to run before committing.           |
| `npm run clean`         | Removes `dist/`, `build/` and `coverage/`.                                                   |

`build/` and `dist/` are deliberately different directories: `esbuild.config.mjs` recursively removes
`dist/` at the start of every run, so declarations emitted there would be destroyed by the next
bundle.

### What "deployable" means here

It means **a successful build and package step producing Lambda-compatible artifacts** — nothing
more. There is no infrastructure-as-code in this subtree and none is planned: no Terraform, no CDK,
no SAM, no `serverless.yml`, no CloudFormation. `npm run package` succeeding **is** the deliverable;
a live deployment is out of scope.

`esbuild.config.mjs` bundles one artifact per capability entrypoint under `src/handlers/`. The
entrypoint set is exactly these five, and it is frozen:

`catalogQueryHandler.ts`, `skuResolutionHandler.ts`, `promotionApplicationHandler.ts`,
`priceResolutionHandler.ts`, `productFeedHandler.ts`

`bootstrap.ts`, `router.ts` and `errorMapper.ts` are **shared internals** of that folder — they
export no Lambda `handler`, so they are not entrypoints and the bundler simply pulls them into
whichever artifacts import them. Nothing under `tests/` is ever an entrypoint.

A declared entrypoint that is missing from disk is a **hard error**, not something the build skips:
`npm run bundle` and `npm run package` are gates, and a step that reports success while emitting
nothing is not one. The build also fails if the artifact count does not match the entrypoint count.

Each artifact is emitted with `platform: 'node'`, `target: 'node20'`, `format: 'cjs'`, external
source maps without embedded sources, tree shaking on, license comments inlined so GPL attribution
travels inside the artifact, and minification **off** — the preserved-defect annotations are part of
the deliverable's audit trail and minifying them away would destroy it.

The `.cjs` extension is not cosmetic. `package.json` declares `"type": "module"`, so a CommonJS
payload in a `.js` file would be loaded as ESM and throw; `outExtension: { '.js': '.cjs' }` makes the
format unambiguous to Node, and the runtime resolves a `.cjs` module for a `<file>.handler` entry.
`npm run package` archives each artifact — with its source map, when one is present — as
`dist/<entrypoint>.zip`, with stored paths junked so the module sits at the archive root. Nothing is
uploaded: archiving beside the artifact **is** the whole of the package step.

---

## Why the Lambda bundle is CommonJS

This is the one packaging decision in the port that was settled by reproducing the failure rather
than by reading advice, so the evidence is recorded here instead of being rediscovered later.

Bundling this dependency set to **ESM builds cleanly and then fails at runtime**:

```text
Error: Dynamic require of "node:buffer" is not supported
    at node_modules/sql-escaper/lib/index.js
    at node_modules/mysql2/promise.js
```

The cause is that the MySQL driver's CommonJS dependency chain uses dynamic `require()`, which an ESM
bundle cannot resolve. Three remedies were considered and two were verified against a probe importing
all three runtime dependencies:

| Option | Configuration                                                            | Result                                                  | Decision                                                                                        |
| ------ | ------------------------------------------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **A**  | `format: 'cjs'`                                                          | Executes correctly; the driver's pool factory resolves. | **Chosen.** Needs no shim and matches the Lambda runtime's default CommonJS handler resolution. |
| B      | `format: 'esm'` plus a `createRequire` banner injected into the preamble | Also executes correctly.                                | Documented here as the validated alternative, in case a future constraint forces ESM output.    |
| C      | Mark the driver `external` and ship `node_modules` or a Lambda layer     | Not tested.                                             | Rejected — it defeats single-artifact packaging.                                                |

**The source tree is unaffected by this.** `tsconfig.json` keeps `module` and `moduleResolution` at
`NodeNext` and `package.json` keeps `"type": "module"`; only the _emitted bundle format_ differs.
What that costs the source is small but real, and it is why you will not find these in `src/**`:
no `import.meta`, no top-level `await`, and no `require`/`createRequire`/`__dirname`/`__filename`.
Do not "fix" the ESM failure in source — it is a solved problem, and option A is the solution.

---

## Environment-variable contract

`.env.example` is the committed contract. It contains **no credentials** and never will; copy it and
fill in your own values.

```bash
cp .env.example .env
```

`.env` is git-ignored. In Lambda these values arrive as native environment variables and `dotenv`
never runs; locally and under test, `dotenv` loads `.env`. Configuration is read in exactly one
place, `src/lib/config.ts`, which is the only module in the subtree permitted to touch
`process.env`. It validates the whole set at once and reports **every** problem it finds rather than
failing on the first one.

### Required — five keys, no default

Startup fails if any of these is missing or empty.

| Key           | Accepted values                                | Notes                                                                                                                |
| ------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `DB_HOST`     | hostname or IP                                 | No default, deliberately: a defaulted `localhost` is how a service quietly talks to the wrong database.              |
| `DB_USER`     | string                                         | —                                                                                                                    |
| `DB_PASSWORD` | string                                         | Never commit a value for this.                                                                                       |
| `DB_TLS_MODE` | `disabled` \| `verify-ca` \| `verify-identity` | Explicit and unavoidable, so transport security is always a stated decision.                                         |
| `DB_DIALECT`  | `MySQL` \| `MicrosoftSQLServer` \| `Oracle10g` | Replaces the legacy `cfdbinfo` product-name probe with explicit configuration. This port targets the `MySQL` branch. |

### Defaulted — nine keys

Omit any of these to accept the value shown.

| Key                     | Default       | Notes                                                                                                                                                           |
| ----------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DB_PORT`               | `3306`        | 1–65535.                                                                                                                                                        |
| `DB_NAME`               | `Slatwall`    | The legacy datasource name, carried forward unchanged.                                                                                                          |
| `DB_CONNECTION_LIMIT`   | `10`          | Pool size.                                                                                                                                                      |
| `DB_CONNECT_TIMEOUT_MS` | `10000`       | Connection-establishment timeout.                                                                                                                               |
| `DB_MAX_IDLE`           | `10`          | Idle connections retained.                                                                                                                                      |
| `DB_IDLE_TIMEOUT_MS`    | `60000`       | Idle-connection lifetime.                                                                                                                                       |
| `NODE_ENV`              | `development` | `development` \| `test` \| `production`, matched without regard to case.                                                                                        |
| `LOG_LEVEL`             | `info`        | `debug` \| `warn` \| `error` are the alternatives. An unrecognised value falls back to `info` rather than failing startup, so a typo cannot silence the logger. |
| `TEST_LIVE_DATABASE`    | `false`       | Set `true` only to opt a live-database probe in. `npm test` ignores it — the suites assert SQL shape against a fake executor.                                   |

### Optional — two keys, meaningful only alongside TLS

| Key                  | Accepted values                | Notes                                                                                                      |
| -------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `DB_TLS_MIN_VERSION` | `TLSv1.2` (default), `TLSv1.3` | TLS 1.0 and 1.1 are deliberately not accepted.                                                             |
| `DB_TLS_CA`          | PEM certificate authority      | Supply when `DB_TLS_MODE` is `verify-ca` or `verify-identity` and the CA is not in the system trust store. |

---

## Layout, and the boundary the linter enforces

```text
src/
  domain/        entities, value objects, read-only order views, engine types, ports
  services/      the seven ported service surfaces, plus the promotion decomposition
  repositories/  MySQL adapters and the extracted SQL modules
  handlers/      Lambda entrypoints, the route table, the composition root
  integrations/  the integration contract and the Google product-feed adapter
  lib/           configuration, logging, and the CFML-semantics helpers
tests/
  unit/          isolated suites with hand-written in-memory doubles
  integration/   SQL shape and parameter-binding assertions
  fixtures/      shared builders
  traceability/  the machine-readable coverage floor
```

Dependencies flow inward. `src/domain/**` may import from `src/lib/**` and from within
`src/domain/**`, and from nothing else — not repositories, not handlers, not integrations. That is not
a review convention: ESLint's `no-restricted-imports` makes a violation a **build failure**. Do not
add an exception to `eslint.config.mjs`, and do not reach around the rule from a test.

Two more conventions worth knowing before you add a file. There are **no barrel or `index.ts` files
anywhere** — imports are explicit, relative, named, and carry the `.js` extension NodeNext requires.
And there is no module-scope mutable state anywhere except the MySQL connection pool in
`src/repositories/mysql/connection.ts`; on a warm container, module state persists between unrelated
requests, so every memo in this subtree is instance state on a request-scoped object.

---

## Testing

```bash
npm test               # one pass, no watch mode
npm run test:coverage  # the same, with the thresholds in vitest.config.ts enforced
```

`npm test` requires **no database, no `.env` and no environment variable**. The integration tier
asserts SQL text and parameter binding against a capturing fake executor rather than a live server,
and `tests/setup.ts` pins `process.env.TZ` to UTC before any suite imports a subject so the
date-sensitive assertions are deterministic.

Coverage thresholds are quality floors for this port: lines 80, statements 80, functions 80,
branches 70, applied to the whole of `src/**` rather than per file.

`tests/traceability/legacyTestMap.ts` is the mechanical discharge of the port's test-traceability
obligation. It fails the suite when an in-scope `src/**` module has no corresponding test, and it
records honestly which suites carry a legacy assertion forward and which are net-new. Only **two**
suites extend legacy coverage — the `brand` and `product` entity suites. Everything else is net-new,
and the map says so rather than presenting it as parity. The same file holds the parity ledger: the
five permitted visibility widenings, the three permitted signature reshapings, the one entity-layer
signature widening, and the three permitted deliberate divergences. Those budgets are closed. Adding
a fourth divergence anywhere fails the gate, and the gate derives what it checks from the source tree
rather than trusting its own declaration.

---

## License

Slatwall is released under the **GNU General Public License v3.0 or later**, copyright ten24, LLC.
This subtree reproduces the business logic of that application rather than merely calling it, so it
is a derived work and the same license applies. `package.json` records it as `GPL-3.0-or-later`.

The upstream license carries a **special exception** permitting custom code, and the exception names
exactly one directory: `/integrationServices/`. **`slatwall-ts/` is not that path, so the exception
does not reach this subtree and standard GPL v3.0 terms apply here.** That matters most for the
Google feed adapter, which is the one place this port lifts code _out of_ `/integrationServices/` and
into a location the exception does not cover.

Full attribution, the upstream grant, and the exception analysis are in
[`NOTICE-GPL.md`](./NOTICE-GPL.md). The upstream text itself is the License section of the
repository-root `readme.md` and, identically, the repository-root `license.txt`, with a copy of the
GPL in `GNU_V3_Copy.txt`. Those files are **not** modified by this port: their stated requirements —
Mura 6+, ColdFusion 9.0.1+, Railo 4.1+ — remain accurate for the CFML product and say nothing about
this subtree.
