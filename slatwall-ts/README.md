# slatwall-ts

A TypeScript re-expression of a bounded **catalog + promotions/pricing** slice of
[Slatwall](http://www.getslatwall.com) 3.1.39, targeting the AWS Lambda `nodejs20.x` runtime.

The legacy CFML application still lives in this repository, unchanged, in the directories beside
this one. This subtree is additive: it lifts the business logic of six `*Service.cfc` components and
the Google product-feed integration out of the Hibachi/FW-1/DI-1 host and re-expresses it in strict
TypeScript behind a thin routing layer. It continues to read and write the existing `Sw*` MySQL
tables **as they are** — there is no migration, no rename, no new table and no column change.

This is a **headless backend service**. It exposes Lambda handlers behind API Gateway plus one
machine-readable RSS feed renderer, and it renders no user interface at all: the presentation
subsystems `admin/`, `frontend/`, `public/` and `assets/` are out of scope and nothing here replaces
them. `tsconfig.json` sets `lib: ["ES2022"]` with no `"DOM"` entry, and `eslint.config.mjs` declares
only Node globals, so that boundary is a compile-time property rather than a stated intention.

**The legacy platform requirements are not inherited.** The repository-root `readme.md` opens with
"Mura Version 6 or Newer", "Coldfusion 9.0.1 or Newer" and "Railo 4.1 or Newer"
[`readme.md:L1-L8`]. Those remain accurate **for the CFML product** and say nothing about this
subtree, which needs a CFML engine no more than it needs a CMS. What this subtree requires is in
[Toolchain](#toolchain), and nothing else.

Licensing, attribution and the analysis of the upstream special exception are in
[`NOTICE-GPL.md`](./NOTICE-GPL.md). In one sentence: the exception permitting custom code names
exactly one directory, `/integrationServices/` [`readme.md:L63-L65`], and `slatwall-ts/` is not that
path, so standard GPL v3.0 terms apply here. See [License](#license).

Two consequences of the port's shape follow immediately, and both are load-bearing:

- **Nothing outside `slatwall-ts/` is modified.** The CFML monolith keeps running; the two
  implementations coexist. That coexistence is the strangler-fig seam, not an accident of sequencing.
- **Behaviour is preserved at the interface boundary, defects included.** Where the legacy code
  contains a defect that changes money, the defect is reproduced and annotated rather than repaired.
  Every such site carries a `LEGACY-DEFECT [<path>:<locator>]` marker, and the three sanctioned
  exceptions carry a `DELIBERATE DIVERGENCE [<citation>]` marker instead. `tsconfig.build.json` sets
  `removeComments: false` precisely so those annotations survive into the `build/` output verbatim.
  They reach the bundled Lambda artifacts in `dist/` by a different route — the source map, not the
  artifact text — which is set out under [What "deployable" means here](#what-deployable-means-here).

---

## The isolation invariant

Read this before running anything. It outranks every other instruction in this file.

> **Zero existing repository files are modified.** `git status` shows only additions under
> `slatwall-ts/`. Any modification to a `.cfc`, `.cfm`, `.json`, `readme.md`, or configuration file
> outside the new subtree is a scope violation.

What that means in practice:

- **Always run npm scripts from inside `slatwall-ts/`.** Every script resolves its paths relative to
  this directory, and every tool is configured so that it cannot walk out of it. `eslint.config.mjs`
  is the only ESLint configuration in the repository and lives here; `.prettierrc.json` likewise;
  `vitest.config.ts` pins `root` to this directory; `esbuild.config.mjs` pins `absWorkingDir` to it.
- **Never run `prettier --write` or `eslint --fix` from the repository root.** There is no
  configuration up there to scope them, so they would rewrite the root `readme.md` and every legacy
  `.json` under `model/validation/` — an immediate and severe scope violation, and one that a
  reviewer sees as a hundred-file diff. `npm run format` and `npm run lint:fix` are safe **only**
  because your working directory is this subtree.
- **Verify before you stage**, every time: `git status --porcelain` must show paths under
  `slatwall-ts/` and nothing else.

### Why the isolation matters

Not as ceremony — the CFML monolith is still the running system, and the in-scope services are
consumed _by_ code this port does not touch. `model/service/OrderService.cfc`, explicitly out of
scope, injects `priceGroupService` [`model/service/OrderService.cfc:L60`] and `promotionService`
[`model/service/OrderService.cfc:L61`] among its sixteen collaborators. Those legacy services must
keep working exactly as they do today, because the order pipeline calls into them. Inverting that
call direction at the boundary — rather than following it into the order aggregate — is what makes
this slice independently deployable, and it is why the legacy files stay untouched instead of being
migrated in place.

### One list that is routinely misread

The plan's "dependencies deliberately not carried forward" inventory — FW/1 2.1, DI/1 0.4.2, the
CFML engine's Hibernate ORM, JavaRB, Taffy, the Mura CMS bridge, MXUnit, CFSelenium, and every
vendored front-end library — is a statement about **what this TypeScript subtree depends on**. It is
**not a deletion manifest.** All of it remains physically in the repository, untouched and in use by
the CFML application. Reading that list as work to be done is the most likely way to violate the
invariant above.

---

## Toolchain

| Component | Pinned version | Where the pin lives                                  |
| --------- | -------------- | ---------------------------------------------------- |
| Node.js   | `20.20.2`      | `.nvmrc`, plus `engines.node` `">=20.19.0 <21"`      |
| npm       | `10.8.2`       | `engines.npm` `">=10.8.2"` (ships with Node 20.20.2) |

Node is bounded at the `20.x` line because that is the Lambda runtime this port targets, and
`engines.node` makes a newer major fail the install rather than silently build against a runtime the
artifact will never see. The lower bound is `20.19.0` for a specific and checkable reason:
`eslint@10.8.0` declares an engine requirement of `^20.19.0`, so that — not preference — is why the
baseline is `20.20.2` rather than an earlier `20.x`. `.nvmrc` and `engines.node` must always agree.

```bash
nvm install        # honours .nvmrc
nvm use            # -> v20.20.2
node -v && npm -v  # v20.20.2 / 10.8.2

npm ci             # install from package-lock.json, exactly
```

Use `npm ci`, not `npm install`. Every dependency below is pinned to an **exact** version — no caret
ranges, no `latest` — and `npm ci` is the command that honours the lockfile without renegotiating
it. `npm ci` also fails loudly if `package.json` and `package-lock.json` have drifted apart, and
**that failure is a feature**: it is the reproducibility gate, so fix the drift rather than reaching
for `npm install` to paper over it.

The committed `package-lock.json` is a real lockfile, not a placeholder: `lockfileVersion 3`, and
every one of its resolved packages carries both a `resolved` URL and an `integrity` hash. No
regeneration step is needed before `npm ci` will work.

`typescript` is pinned at `5.9.3` and **must stay exactly pinned**. The registry's `latest` tag now
resolves to a 7.x release, so any specifier that floats — a caret range, a tag, an unpinned
reinstall — silently leaves the TypeScript 5.x line this port is bound to. The traceability suite
asserts the `5.` prefix so the drift fails a test run instead of passing unnoticed.

### Runtime lifecycle — an escalated plan decision

> **This is a plan-level decision that has been escalated, not a defect this subtree claims to have
> fixed.** The pinned Node 20 / Lambda `nodejs20.x` line was raised as **S-17** and re-raised as
> **V-10** (CWE-1104, _Use of Unmaintained Third-Party Components_).
>
> AAP 0.1.1, 0.5.1 and 0.9.1 freeze this runtime line and its exact toolchain. `.nvmrc`,
> `engines.node`, `package-lock.json`, `@types/node` and `target: 'node20'` therefore move together,
> and the `A16` traceability suite fails a partial change. Selecting a successor runtime requires a
> plan-owner update rather than unilateral drift in executable build configuration.
>
> Before any release or deployment decision, revalidate the runtime against the maintained
> [AWS Lambda runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html) authority.
> No lifecycle date, support-status snapshot or dependency-scan result is restated here or in
> `esbuild.config.mjs`; each is mutable and must be checked at the time the decision is made.

### Runtime dependencies

| Package      | Version  | Why it is here                                                                                                                                                                                                                    |
| ------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `decimal.js` | `10.6.0` | Arbitrary-precision decimal arithmetic, wrapped by the `Money` value object. `Money` is the **only** arithmetic surface for a monetary value in this subtree; it replaces CFML `precisionEvaluate` and the `big_decimal` columns. |
| `mysql2`     | `3.23.1` | MySQL driver over the existing `Sw*` schema. Every statement is a prepared statement, which is what preserves the injection-safety property `cfqueryparam` provided.                                                              |
| `zod`        | `4.4.3`  | Typed schema validation, porting the twelve declarative rules under the legacy `model/validation/` — including the conditional requiredness `showPrice{updatePriceFlag eq 1}` / `showListPrice{updateListPriceFlag eq 1}`.        |

### Development dependencies

| Package               | Version    | Role                                                                                                                          |
| --------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `typescript`          | `5.9.3`    | Compiler. Must stay on the `5.x` line; see the pinning hazard above.                                                          |
| `@types/node`         | `20.19.43` | Node typings matched to the target runtime line.                                                                              |
| `@types/aws-lambda`   | `8.10.162` | Handler and API Gateway event typings for the routing layer.                                                                  |
| `vitest`              | `4.1.10`   | Test runner. Consumes the project `tsconfig` with no transform.                                                               |
| `@vitest/coverage-v8` | `4.1.10`   | Coverage reporting, version-locked to the runner.                                                                             |
| `esbuild`             | `0.28.1`   | Bundler that produces the Lambda artifacts.                                                                                   |
| `eslint`              | `10.8.0`   | Linting, including the layer-boundary import rule. Its `^20.19.0` engine floor sets the Node baseline.                        |
| `typescript-eslint`   | `8.65.0`   | TypeScript parser and rule set for ESLint.                                                                                    |
| `prettier`            | `3.9.6`    | Formatting. It owns layout outright; `eslint.config.mjs` enables zero layout rules.                                           |
| `dotenv`              | `17.4.2`   | Local and test environment loading only. Lambda injects environment variables natively, so this never executes in production. |

That is three runtime and ten development dependencies — thirteen direct pins, and counting the
Node runtime itself, the fourteen pins this port is held to. Every one is an exact version triple;
the traceability suite fails on any specifier that is not.

Deliberately **absent**, each for a stated reason:

- **No XML library.** The RSS renderer hand-rolls a five-entity escaper; a dependency for one file is
  unjustified, and the legacy equivalent is a raw `.cfm` template.
- **No logging library.** `src/lib/logger.ts` writes structured JSON to stdout, which Lambda captures
  natively.
- **No dependency-injection container.** Hand-wiring constructors in `src/handlers/bootstrap.ts` is
  the entire point of removing DI/1.
- **No migration tooling of any kind.** Schema continuity forbids schema change, so there is nothing
  for a migration runner to do and its presence would invite someone to use it.
- **No private packages, no private registry, no auth token and no `.npmrc`.** Everything resolves
  from the public registry, and nothing here needs a credential to install.

---

## Commands

All commands run from this directory.

| Command                 | What it does                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `npm run typecheck`     | `tsc --noEmit` over `src/**` **and** `tests/**` under the full strict profile.               |
| `npm run lint`          | `eslint .` — includes the `no-restricted-imports` layer boundary.                            |
| `npm run lint:fix`      | The same, with auto-fixable violations applied. Only ever from this directory.               |
| `npm run format:check`  | `prettier --check .` — covers TypeScript, JSON **and** Markdown, including this file.        |
| `npm run format`        | `prettier --write .` Only ever from this directory.                                          |
| `npm test`              | `vitest run`. Single pass, never watch mode. Needs no database and no environment variables. |
| `npm run test:coverage` | `vitest run --coverage`, enforcing the thresholds in `vitest.config.ts`.                     |
| `npm run compile`       | `tsc -p tsconfig.build.json` — emits `.js`, `.d.ts` and maps for `src/**` into `build/`.     |
| `npm run bundle`        | `node esbuild.config.mjs` — emits the bundled Lambda artifacts into `dist/`.                 |
| `npm run build`         | `typecheck` then `bundle`.                                                                   |
| `npm run package`       | `typecheck`, then bundle **and archive** — one Lambda-ready `.zip` per capability.           |
| `npm run verify`        | `typecheck` → `lint` → `format:check` → `test`. The gate to run before committing.           |
| `npm run clean`         | Removes `dist/`, `build/` and `coverage/`.                                                   |

`build/` and `dist/` are deliberately different directories: `esbuild.config.mjs` recursively removes
`dist/` at the start of every run, so declarations emitted there would be destroyed by the next
bundle. `tsconfig.build.json` therefore sets `outDir: "build"`, and the two outputs serve different
consumers — `build/` holds `.js` + `.d.ts` + maps for a type consumer, `dist/` holds the bundled
`.cjs` Lambda artifacts, their `.cjs.map` maps and the `.zip` archives. Neither destroys the other.

### The local verification recipe

Run this end to end before opening a pull request, from inside `slatwall-ts/`:

```bash
npm ci
npm run verify                                # typecheck -> lint -> format:check -> test
npm run compile                               # -> build/  (.js + .d.ts + maps)
npm run package                               # -> dist/   (.cjs + .cjs.map + .zip)
node -e "console.log(typeof require('./dist/productFeedHandler.cjs').handler)"   # -> function
git status --porcelain                        # -> only paths under slatwall-ts/
```

The last two lines are not decoration. Loading an artifact is the cheapest possible proof that the
bundle format is right — a mis-formatted bundle builds cleanly and only fails when something
requires it, which is the whole subject of
[Why the Lambda bundle is CommonJS](#why-the-lambda-bundle-is-commonjs). And `git status --porcelain`
is how the isolation invariant is checked rather than assumed.

### What "deployable" means here

It means **a successful build and package step producing Lambda-compatible artifacts** — nothing
more. There is no infrastructure-as-code in this subtree and none is planned: no Terraform, no CDK,
no SAM, no `serverless.yml`, no CloudFormation. Their appearance in a change set is a gate failure,
not a contribution. `npm run package` succeeding **is** the deliverable; a live deployment is out of
scope.

There is deliberately **no `deploy` script** in `package.json`, and no step anywhere in this subtree
uploads, transmits, publishes or registers anything. No AWS credential is read, no platform API is
called, and no network socket is opened by the build. There is also no CI/CD pipeline in this
repository — the legacy tree has no workflow definition of any kind, none exists to extend, and none
is authored here.

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

Each artifact is emitted with `platform: 'node'`, `target: 'node20'`, `format: 'cjs'`, tree shaking
on, license comments inlined so GPL attribution travels inside the artifact, and an **external source
map that embeds the original TypeScript sources** (`sourcesContent: true`).

That last setting is the audit trail, and an earlier revision of this section credited the wrong
mechanism for it. The preserved-defect annotations this port is required to carry —
`// LEGACY-DEFECT [...]` and `// DELIBERATE DIVERGENCE [...]`, the format AAP 0.6.7 mandates — are
ordinary line comments, and a bundler discards ordinary comments regardless of what `minify` is set
to. Measured on this checkout: 141 `LEGACY-DEFECT` markers exist across `src/**`; the build reports
100 of them recoverable from `productFeedHandler.cjs.map`, while only 48 survive in that artifact's
own text. Embedding the sources in the map is what makes every one of them recoverable, with its
legacy `[<path>:<locator>]` citation intact, so the `.cjs.map` is a local build-and-audit companion
rather than a debugging nicety. It intentionally contains the GPL v3.0 TypeScript source and module
paths, so this is not a claim that the map is disclosure-free or suitable for indiscriminate
publication. What the build does guarantee is that no environment value is substituted into it:
`src/lib/config.ts` remains the only runtime reader of `process.env`, and esbuild uses no build-time
`define`.

`minify: false` is still set and still worth setting: an unminified artifact is diffable and its
stack traces stay legible. It is simply not what carries the annotations.

The build proves that rather than asserting it. After bundling, `esbuild.config.mjs` reads each
emitted `dist/<entrypoint>.cjs.map`, requires `sources` and `sourcesContent` to be present and of
equal length, and requires at least one `LEGACY-DEFECT [` and one `DELIBERATE DIVERGENCE [` to be
recoverable from a source resolving under `src/`. It writes nothing and exits non-zero if any of that
fails — a missing map, a map without embedded sources, or a marker set that has gone absent. On
success it reports the per-artifact counts:

```text
[esbuild] Annotations recoverable from productFeedHandler.cjs.map: LEGACY-DEFECT x100, DELIBERATE DIVERGENCE x7
```

The `.cjs` extension is not cosmetic. `package.json` declares `"type": "module"`, so a CommonJS
payload in a `.js` file would be loaded as ESM and throw; `outExtension: { '.js': '.cjs' }` makes the
format unambiguous to Node, and the runtime resolves a `.cjs` module for a `<file>.handler` entry.
The two files therefore agree by construction, and the five handler strings an operator configures
are `catalogQueryHandler.handler`, `skuResolutionHandler.handler`,
`promotionApplicationHandler.handler`, `priceResolutionHandler.handler` and
`productFeedHandler.handler` — each resolving to `dist/<name>.cjs` inside `dist/<name>.zip`.

### The package stage

`npm run package` typechecks, bundles, and then writes **one archive per capability** — five
`dist/<entrypoint>.zip` files alongside the five `.cjs` artifacts and their five `.cjs.map` maps. It is
deliberately **not** an alias of `npm run build`: AAP 0.5.2 and 0.9.1 define "deployable" as a
successful build **and package** step emitting Lambda-compatible artifacts, and the platform's unit of
deployment is an archive, so a package step that emits none does not discharge the gate.

Three properties of that stage are decisions rather than defaults, and each closes a finding:

- **No host utility, and no subprocess.** The archive is written by this repository's own code using
  `node:zlib` (`deflateRawSync` for entry bodies, `crc32` for their checksums). An earlier revision
  shelled out to a host-global `zip` executable, which made `npm run package` fail on a stock
  container for reasons that had nothing to do with the code being packaged. `node:child_process` is
  imported nowhere in `esbuild.config.mjs`, and `tests/traceability/legacyTestMap.ts` asserts that.
- **The `.cjs` sits at the archive root, and the source map is not in the archive at all.** The
  runtime resolves a `<file>.handler` entry relative to the archive root, so a stored path would make
  the handler unresolvable. The maps embed the original TypeScript in full (`sourcesContent: true`),
  which is exactly what the annotation audit needs in `dist/` and exactly what should not travel
  inside something uploadable — so they stay local. `NOTICE-GPL.md` **is** included, because the
  bundled logic is derived GPL v3.0 code and a deployable that carried the code without its
  attribution would lose it at the first copy.
- **The archives are reproducible.** Every entry carries a fixed MS-DOS epoch timestamp rather than
  the wall clock, so two builds of identical inputs produce byte-identical archives.

Nothing is uploaded, transmitted, published or registered; no platform API is called, no network
socket is opened, and no credential is read.

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

| Option | Configuration                                                            | Result                                                  | Decision                                                                                                       |
| ------ | ------------------------------------------------------------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **A**  | `format: 'cjs'`                                                          | Executes correctly; the driver's pool factory resolves. | **Chosen.** Needs no shim and matches the Lambda runtime's default CommonJS handler resolution.                |
| B      | `format: 'esm'` plus a `createRequire` banner injected into the preamble | Also executes correctly.                                | Documented here as the validated alternative, and **not used**, in case a future constraint forces ESM output. |
| C      | Mark the driver `external` and ship `node_modules` or a Lambda layer     | Not tested.                                             | Rejected — it defeats single-artifact packaging.                                                               |

Option B is recorded for completeness only. `esbuild.config.mjs` carries **no `banner`** at all, and
deliberately so: Option A needs no shim, and shipping one anyway would suggest the format question is
still open when it is settled.

**The source tree is unaffected by this.** `tsconfig.json` keeps `module` and `moduleResolution` at
`NodeNext` and `package.json` keeps `"type": "module"`; only the _emitted bundle format_ differs.
What that costs the source is small but real, and it is why you will not find these in `src/**`:
no `import.meta`, no top-level `await`, and no `require`/`createRequire`/`__dirname`/`__filename`.
Do not "fix" the ESM failure in source — it is a solved problem, and option A is the solution.

### Decimal fidelity, and how to check it

The reason `Money` exists is that CFML currency arithmetic cannot be reproduced with IEEE-754
doubles. The reference calculation below is the one an operator can reproduce through the compiled
output, and it is what `numberFormat(discountAmount,"0.00")`
[`model/service/PromotionService.cfc:L1017`] produces in the legacy engine:

| Step                          | Value      |
| ----------------------------- | ---------- |
| unit price 19.99 × quantity 3 | `59.97`    |
| 12.5% of that                 | `7.49625`  |
| extended less discount        | `52.47375` |
| formatted to two decimals     | `"52.47"`  |

```bash
npm run compile
node --input-type=module -e "
  import { Money } from './build/domain/valueObjects/money.js';
  const extended = Money.fromDecimalString('19.99').times(3);
  const discount = extended.times('0.125');
  console.log(extended.toDecimalString(), discount.toDecimalString(),
              extended.minus(discount).toDecimalString(), extended.minus(discount).toFixed2());
"
```

The intermediate `7.49625` is exact, not rounded, and the two-decimal presentation happens once at
the end. That ordering is the whole point: rounding early is how a ported discount engine drifts
away from the legacy one by a cent at a time.

---

## Environment-variable contract

[`.env.example`](./.env.example) is the committed contract, it declares all nineteen variables this
subtree reads, and it contains **no credential** — deliberately, and permanently. Configuration is
read in exactly one place, `src/lib/config.ts`, which is the only module in the subtree permitted to
touch `process.env`. It validates the whole set at once and reports **every** problem it finds rather
than failing on the first one.

In Lambda these values arrive as native environment variables and `dotenv` never runs. Locally and
under test, `dotenv` loads a `.env` file from this directory if one is present; that file is your
own, it is never committed, and `.env.example` rather than `.env` is the artifact under version
control.

Where the contract comes from, so a reviewer can check it against the legacy source rather than take
it on trust:

- The datasource name, user, password and database type are the four values the legacy application
  published into its own scope at [`Application.cfc:L78-L87`] — `datasource`, `datasourceUsername`,
  `datasourcePassword` and `databaseType`, the last taken from `this.ormSettings.dialect`.
- `DB_NAME` defaults to the literal `Slatwall`, capital S, because that is the datasource name the
  legacy configuration sets: `<cfset this.datasource.name = "Slatwall" />`
  [`config/configApplication.cfm:L1-L2`].
- `DB_DIALECT` replaces a runtime probe. [`config/configORM.cfm:L1-L15`] ran `cfdbinfo` against the
  live datasource and mapped the reported product name onto a Hibernate dialect — `MySQL` →
  `"MySQL"`, `Microsoft` → `"MicrosoftSQLServer"`, `Oracle` → `"Oracle10g"`. In this port that
  becomes explicit configuration, resolved in `src/repositories/mysql/dialect.ts`.

### Required — five keys, no default

Startup fails if any of these is missing or empty.

| Key           | Accepted values                                | Notes                                                                                                                            |
| ------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `DB_HOST`     | hostname                                       | No default, deliberately: a defaulted host is how a service quietly talks to the wrong database, so the deployment must name it. |
| `DB_USER`     | string                                         | —                                                                                                                                |
| `DB_PASSWORD` | string                                         | Supplied by the deployment. Never commit a value for this, and never write one into a tracked file.                              |
| `DB_TLS_MODE` | `disabled` \| `verify-ca` \| `verify-identity` | Explicit and unavoidable, so transport security is always a stated decision. Certificate verification is never switchable off.   |
| `DB_DIALECT`  | `MySQL` \| `MicrosoftSQLServer` \| `Oracle10g` | Replaces the legacy `cfdbinfo` product-name probe with explicit configuration. This port implements the `MySQL` branch.          |

Two hard semantics of `DB_DIALECT`, both verified in the legacy source:

1. **It is required, with no silent default.** The legacy `<cfif>` chain that set the dialect has no
   `<cfelse>` and no fallback [`config/configORM.cfm:L9-L15`], and the probe's own failure path
   rendered a diagnostic and then `<cfabort />`ed [`config/configORM.cfm:L4-L7`] rather than
   continuing in a degraded mode. An unset or unrecognised value is therefore a **hard startup
   error**, not a reduced-capability mode — matching what the legacy engine did.
2. **The `MySQL` branch is the one implemented, and the variable still stays parameterised**, because
   two SQL sites branch on the dialect: the `productTypeIDPath` concatenation
   [`model/dao/PromotionDAO.cfc:L482-L488`] and the row-limiting clause in `PriceGroupDAO`. Collapsing
   the parameter away would hide those branch points instead of removing them.

The MySQL branch targets **MySQL 8.0 or newer**. That is a project constraint carried from the plan,
and it is deliberately not attributed to the driver: `mysql2` 3.23.1 documents broad MySQL
compatibility and states no such server minimum of its own. It is an engine requirement, never a
performance claim of any sort.

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

The four pool values map one-to-one onto `mysql2` pool options. They are conservative starting points
to be tuned per environment and are **not targets of any kind**: the legacy system defines none, and
none is invented here.

### Optional — five keys

| Key                      | Accepted values                | Notes                                                                                                                              |
| ------------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `DB_TLS_MIN_VERSION`     | `TLSv1.2` (default), `TLSv1.3` | A floor, not a selection. TLS 1.0 and 1.1 are deliberately not accepted.                                                           |
| `DB_TLS_CA`              | PEM certificate authority      | Supply when `DB_TLS_MODE` is `verify-ca` or `verify-identity` and the CA is not in the system trust store.                         |
| `FEED_ALLOWED_HOSTS`     | comma-separated host list      | The deployment-owned allow-list the product feed's absolute URLs are built from, so a request can never choose the emitted origin. |
| `ECB_REFERENCE_RATES`    | `CODE=rate` pairs              | Deployment-supplied conversion rates for the currency cascade's conversion step. Absent, conversions pass through unchanged.       |
| `ECB_RATES_RETRIEVED_AT` | ISO-8601 instant               | When the rates above were captured, so a stale set is visible rather than silently trusted.                                        |

### Connections, and what not to commit

`src/repositories/mysql/connection.ts` creates exactly **one pool at module scope**, outside the
handler, so a warm Lambda container reuses its connections across invocations instead of opening a
connection per invocation. That is an engineering decision established by direct experiment during
planning — it is not a performance target, and no figure is claimed for it.

Every connection value resolves from the environment. **No credential is hardcoded anywhere in this
subtree**, and none may be introduced: `.env.example` documents the contract without carrying a
secret, and the only reader of `process.env` is `src/lib/config.ts`.

Four classes of local artifact must never reach a commit — the installed dependency tree, the build
and bundle output, the coverage report, and your real `.env`. This subtree's own `.gitignore` already
covers `node_modules/`, `dist/`, `build/`, `*.tsbuildinfo`, `coverage/`, `.eslintcache`, `.vitest/`
and `.env` / `.env.*` while re-including `.env.example`, and it is scoped to this directory so it
cannot affect the CFML tree. Two things still matter for you:

- The repository-root `.gitignore` is a CFML-era file this port does not modify, and it covers none of
  the four. Never edit it to compensate.
- **Check, do not assume.** Run `git status --porcelain` before staging and confirm that only intended
  files under `slatwall-ts/` appear. An ignore rule is a convenience; the status check is the gate.

---

## Product-feed transport — a second escalated plan decision

> **This is a plan-level decision that has been escalated, not a defect this subtree claims to have
> fixed.** The Google product feed emits `http://` origins at all five URL sites. It was raised as
> **S-09**, re-raised as **V-12** (CWE-319, _Cleartext Transmission of Sensitive Information_), and
> re-confirmed by a later review whose own resolution was "escalate, do not patch unilaterally".
>
> The legacy template writes `http://#CGI.HTTP_HOST#` at the channel link, the channel description,
> the item link, the item image link and each additional image link
> [`integrationServices/google/views/feed/product.cfm:L14, L15, L22, L23, L24`], and never `https`.
> AAP 0.1.1 requires preserving the Google product-feed integration contract **exactly**, AAP 0.8.1
> freezes it, and AAP 0.6.7 permits exactly three divergences in this port — none of them this. So
> changing the scheme would be a fourth divergence and needs an **AAP amendment**, not a remediation
> pass. `src/integrations/google/rssFeedRenderer.ts` carries the full record beside the constant,
> including the one-line edit that closes it once authorized.
>
> **What already contains it.** The authority the scheme is glued to comes from a deployment-owned
> allow-list rather than from the request (`assertAllowedFeedHost`, finding S-15), so a cleartext
> scheme cannot be pointed at an attacker's origin; every emitted value is XML-escaped; and a
> deployment that must publish `https` URLs terminates TLS in front of this service. The feed is
> machine-read by Google Merchant Center and carries the product names, images and prices the store
> publishes anyway, which is why both reviews graded it MINOR.

---

## Architecture

The layering is ports-and-adapters (hexagonal), and the dependency flow is strictly **domain-inward**.

```text
src/
  handlers/      primary adapters: five Lambda entrypoints, the route table, the composition root
  services/      application: the seven ported service surfaces + the promotion decomposition
  domain/        entities, value objects, read-only order views, engine types, and the ports
  repositories/  secondary adapters: MySQL implementations of the ports, and the extracted SQL
  integrations/  secondary adapters: the integration contract and the Google product-feed adapter
  lib/           configuration, logging, and the CFML-semantics parity helpers
tests/
  unit/          isolated suites with hand-written in-memory doubles
  integration/   SQL shape and parameter-binding assertions, with no live server
  fixtures/      shared builders
  traceability/  the machine-readable coverage floor and parity ledger
```

Handlers depend on services; services depend on the domain and on ports; repositories and
integrations **implement** those ports; the handlers are where the two halves are wired together.
`src/domain/**` may import from `src/lib/**` and from within `src/domain/**`, and from nothing else —
not repositories, not handlers, not integrations, and not an outward package such as `mysql2`,
`dotenv` or the Lambda typings.

That is not a review convention. `eslint.config.mjs` expresses it as `no-restricted-imports` pattern
groups at severity `error`, so a violation is a **build failure**, and `tsconfig.json` declares no
`paths` or `baseUrl` that a specifier could use to slip past it. Do not add an exception to the
config, and do not reach around the rule from a test.

### The six transformation rules

Every file in this subtree is the product of these six substitutions. The CFML runtime supplied four
implicit services — bean-factory injection, convention routing, ORM persistence with lazy traversal,
and ambient request state — and each becomes something a compiler can verify.

| #   | Legacy construct                                                                                                                         | Target construct                                                                              | Rule                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| T1  | DI/1's convention scan of `property name="xService";`                                                                                    | Constructor parameters typed to ports, wired once in `src/handlers/bootstrap.ts`              | Every collaborator is an explicit, compile-checked argument. No runtime scan, no service locator, and no first-scan lock.    |
| T2  | `getService("xService")` locator calls inside entities                                                                                   | A constructor-injected port on the entity                                                     | The seven legacy sites in `Sku.cfc` and `Product.cfc` become declared dependencies instead of ambient lookups.               |
| T3  | Hibernate ORM: `ORMExecuteQuery`, `<cfquery>`, `super.save()`, lazy collections                                                          | Repository ports over `mysql2` prepared statements, associations materialized at the boundary | Prepared statements preserve `cfqueryparam` safety; fetch shape becomes an explicit per-method decision, so no implicit N+1. |
| T4  | CFML numeric duality and `precisionEvaluate`                                                                                             | The `Money` value object as the sole arithmetic surface                                       | No floating-point operation touches a monetary value anywhere in the target.                                                 |
| T5  | FW/1 subsystem routing and `.cfm` views                                                                                                  | An explicit route table plus a string-emitting renderer                                       | The RSS feed becomes a pure function returning a string, not a rendered template.                                            |
| T6  | Ambient request scope — `getHibachiScope()`, and the inconsistent `getSlatwallScope()` [`model/service/PriceGroupService.cfc:L262-L268`] | An explicit context parameter threaded down the call chain                                    | No ambient state, and the legacy divergence between the two scope accessors disappears with it.                              |

### Two structural decisions a reviewer will question

- **Entities are classes, not interfaces.** The legacy entities carry behaviour, not just data: the
  four-step currency cascade, option-to-SKU resolution and materialized-path maintenance are all
  methods on the entity. Collapsing them into free functions would break interface parity, which is
  the acceptance contract, so each entity is a class retaining the exact CFML method names, built from
  repository rows with its collaborator ports injected.
- **Associations are materialized at the repository boundary.** Hibernate lazy collections have no
  equivalent in a driver-only stack, and simulating them would hide the cost rather than remove it.
  Each entity exposes already-populated arrays whose fetch shape was chosen — and documented — at the
  repository method that produced it.

### The router

`src/handlers/router.ts` is a reference port of `getSubsystemDirPrefix()`
[`Application.cfc:L129-L137`], which is the convention that routed the `google` subsystem at all: an
empty subsystem resolves to `''`; a subsystem not in `admin,frontend,public` resolves to
`integrationServices/<subsystem>/`; anything else resolves to `<subsystem>/`. The route table is
explicit rather than convention-derived, and the router contains **no business logic** — it dispatches
and nothing more.

---

## Import discipline

It constrains every file, so it is short and absolute:

- **Explicit relative specifiers**, carrying the `.js` extension that NodeNext resolution requires.
- **Named imports only.** No default export, except where a third-party module mandates one — the
  tooling configs at the root of this subtree are the practical exceptions.
- **No barrel or `index.*` re-export files anywhere.** `eslint.config.mjs` restricts the pattern
  outright. This keeps each regenerated file's diff minimal and makes every dependency legible at its
  use site.
- **`import type` for type-only imports**, so nothing type-only survives into the bundle.
- **One exported unit per file.**
- **There is no legacy-side import migration.** CFML resolves components by dotted path
  (`extends="Slatwall.org.Hibachi.HibachiEntity"`) and by DI/1 convention; there are no import
  statements to rewrite and no existing CFML file is modified. Do not go looking for import rewrites
  in the legacy tree — there are none to find.

There is also no module-scope mutable state anywhere except the MySQL connection pool in
`src/repositories/mysql/connection.ts`. On a warm container, module state persists between unrelated
requests, so every memo the legacy entities kept at component scope is instance state on a
request-scoped object here.

---

## Behaviour preservation — the contract a reviewer checks

### Interface parity is the acceptance contract

Public method names are the legacy CFML camelCase names **verbatim**. It is
`getProductSkusBySelectedOptions`, not a renamed idiomatic equivalent, so a reviewer can diff the two
surfaces method by method rather than reconstructing a mapping. Where a legacy name embeds a typo that
reaches a public surface, the typo is recorded and the decision — preserve it as a data contract, or
rename it with a comment naming the original spelling — is documented at the site.

Three budgets are closed, and `tests/traceability/legacyTestMap.ts` holds the ledger that enforces
them:

- **Three signature reshapings**, and no fourth. `updateOrderAmountsWithPromotions` returns
  applied-promotion intents instead of mutating the order aggregate in place; the two smart-list
  methods become typed repository queries rather than a reimplemented query language; and the feed
  adapter's `product(rc)` becomes `generateProductFeed(criteria)` returning the document as a string.
- **Five visibility widenings**, and no sixth. `getDiscountAmount` and the four qualification helpers
  are `private` in the legacy source and are exported here so they can be tested directly. Widening
  visibility changes no behaviour; it is recorded rather than buried.
- **One entity-layer signature widening.** `PromotionPeriod.isCurrent` takes the current instant as a
  parameter, which makes the UTC policy explicit and the method deterministically testable.

Anything beyond those budgets fails the gate. Adding a fourth reshaping or a sixth widening requires
justification against the plan before it is accepted, not a passing test run.

### The three must-preserve areas

1. **Promotion discount math and use-limit enforcement** [`model/service/PromotionService.cfc`]. The
   489-line `updateOrderAmountsWithPromotions` is decomposed into nine modules under
   `src/services/promotion/`, and the decomposition is structural only — the mutable usage ledger, the
   two opposing insertion sorts, and the two-pass reward iteration all behave as they do today.
2. **The price-group and currency resolution cascade**
   [`model/service/PriceGroupService.cfc`, `model/entity/Sku.cfc:L269-L273`], including the
   five-level rate chain and the four-step currency cascade behind its eligibility gate.
3. **Product / SKU / option-to-SKU resolution** [`model/service/ProductService.cfc:L104`], backed by
   the **AND-of-EXISTS** option matching at [`model/dao/SkuDAO.cfc:L107-L128`]. One `EXISTS` clause per
   selected option, conjoined — not an `IN` list, which would match differently.

### Null semantics are load-bearing

`getPriceByCurrencyCode`, `getListPriceByCurrencyCode` and `getRenewalPriceByCurrencyCode` return
`Money | undefined`. The legacy accessors have no `else` and no fallback
[`model/entity/Sku.cfc:L269-L273`], and the list and renewal variants add a second key-existence check,
so they can return nothing even for a currency the map contains.

**Substituting `0` for that absence would silently sell products for free.** It is the single
highest-consequence parity check in the port, and the tests assert the `undefined` returns explicitly.

Relatedly: the USD default is **not** hardcoded in the entity. It lives in a setting declaration —
`skuCurrency = {fieldType="select", defaultValue="USD"}` [`model/service/SettingService.cfc:L221`] —
and is resolved through the settings port, so a deployment that configures a different base currency
keeps working.

### The cross-service ordering constraint

`PriceGroupService.updateOrderAmountsWithPriceGroups()` **must run before**
`PromotionService.updateOrderAmountsWithPromotions()`.

The promotion pass reads price-group state that the price-group pass writes: an order item that is not
price-group eligible discounts from `getPrice()`, while an eligible one discounts from `getSkuPrice()`
with a correction term [`model/service/PromotionService.cfc:L241-L254`]. In the legacy system that
ordering held only because `OrderService` happened to call the two in that sequence — it is nowhere
stated and nothing enforced it. Here the composition root makes it explicit and non-optional, and a
test asserts that reversing the two changes the computed discount.

### Defects are reproduced, not repaired

Twenty numbered defects plus eight secondary items are carried forward deliberately. Every site
carries the same two-line marker, and contributors must use exactly this format:

```ts
// LEGACY-DEFECT [<path>:<locator>]: <description>.
// Preserved deliberately; do not fix without a product decision.
```

The sharpest example, and the reason this policy is not negotiable: the over-use stripping loop
[`model/service/PromotionService.cfc:L468-L521`] iterates the usage ledger by `prID` but indexes its
maximum-use-per-order lookup by the **leaked `reward` variable** left over from the previous loop. The
limit is therefore enforced against whichever reward happened to be last, for every key in the ledger.
It is ported as written, because repairing it changes the amount a customer is charged, and that is a
product decision rather than a code cleanup.

**Exactly three deliberate divergences are permitted**, each annotated at its site with a
`DELIBERATE DIVERGENCE [<citation>]` marker:

1. **The un-`var`'d `discountAmount` scope leak** [`model/service/PromotionService.cfc:L1007, L1009`]
   becomes function-local. Reproducing shared mutable state that survives across warm Lambda
   invocations could leak one customer's discount into another's order, so this one cannot be
   preserved safely.
2. **The `amountOff` precision gap** [`model/service/PromotionService.cfc:L998`] closes, because all
   arithmetic routes through `Money`. Preserving one branch's float drift would mean deliberately
   bypassing the value object.
3. **The entity memo bugs** (register entries 17, 18 and 19) are fixed, because they are unobservable
   through the public contract — they cause recomputation or a poisoned cache, not a different returned
   value — and the memos become request-scoped regardless.

### Preserved TODOs stay TODOs

The return/exchange branch at [`model/service/PromotionService.cfc:L542-L544`] carries a legacy
`TODO [issue #1766]` and does nothing. It is ported verbatim, still does nothing, and keeps its ticket
reference; a regression test named for the ticket documents the gap. The Google feed's
`g:google_product_category` element is emitted **empty**, exactly as the legacy template emits it, and
stays flagged. Completing either one silently is the failure mode this rule exists to prevent.

### Re-verify locators rather than trusting citations

The plan's cited line numbers carry a small drift in places, and the source is the authority. Measured
against this checkout, the `precisionEvaluate` sites are `PromotionService.cfc` L150, L252, L299, L486,
L990, L995, L1001, L1006, L1007 and `PriceGroupService.cfc` L323, L331 — not every one of them matches
the number cited in the plan. When you port a method, open the file and confirm the locator.

### Schema continuity

The target reads and writes the existing `Sw*` MySQL tables. **No migration, no rename, no new table,
no column change**, and no DDL is authored anywhere in this subtree. Even columns belonging to
out-of-scope subsystems are preserved rather than dropped: `Category.cmsCategoryID` and its `site`
association, from the Mura bridge, survive as **inert persisted columns** — index `RI_CMSCATEGORYID`
included — so the schema contract is unbroken while no CMS behaviour is ported.

---

## Testing

```bash
npm test               # one pass, no watch mode
npm run test:coverage  # the same, with the thresholds in vitest.config.ts enforced
```

`npm test` requires **no database, no `.env` and no environment variable**. `vitest.config.ts` sets
`watch: false` and the script is `vitest run`, so there is no interactive mode to fall into. The
integration tier asserts SQL text and parameter binding against a capturing fake executor rather than
a live server, and `tests/setup.ts` pins `process.env.TZ` to UTC before any suite imports a subject so
the date-sensitive assertions are deterministic.

The tiers, as they exist on disk:

| Tier                             | Files | What it asserts                                                         |
| -------------------------------- | ----- | ----------------------------------------------------------------------- |
| `tests/unit/**`                  | 58    | Behaviour of a single module against hand-written in-memory doubles.    |
| `tests/integration/repositories` | 7     | SQL shape and parameter binding. **No MySQL server is required.**       |
| `tests/traceability`             | 1     | The coverage floor and the parity ledger, derived from the source tree. |

`globals` is set to **`false`** in `vitest.config.ts`, so `describe`, `it` and `expect` are **not**
ambient — every suite imports them explicitly from `vitest`. That is the convention to follow: it
keeps a test file's dependencies as legible as a source file's, and it is consistent with the
no-ambient-state stance the rest of the subtree takes.

Coverage thresholds are quality floors for this port: lines 80, statements 80, functions 80,
branches 70, applied to the whole of `src/**` rather than per file.

### The traceability floor

`tests/traceability/legacyTestMap.ts` is the mechanical discharge of the port's test-traceability
obligation. It **fails the suite when an in-scope `src/**` module has no corresponding test**, which
mirrors the structural floor the legacy suite enforced: `meta/tests/coverage/EntityCoverageTest.cfc`
has a single method, `all_entities_have_test_cases()`, which lists the entity and entity-test
directories, removes every entity that has a matching test filename, and asserts the remainder is
empty. Same idea, machine-readable, and it derives what it checks from the source tree rather than
trusting its own declaration.

### Legacy-extended versus net-new

Presenting net-new coverage as parity fails the gate, so the split is stated exactly. **Two** suites
extend legacy coverage — and only two:

| Legacy test                              | Target suite                                 | Carried forward                                                                       |
| ---------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `meta/tests/unit/entity/BrandTest.cfc`   | `tests/unit/domain/entities/brand.test.ts`   | `defaults_are_correct()`, asserting `getProducts()` returns `[]`.                     |
| `meta/tests/unit/entity/ProductTest.cfc` | `tests/unit/domain/entities/product.test.ts` | `productUrlIsCorrectlyFormatted()`, with the `nike-air-jorden` fixture kept verbatim. |

Two details in that table are easy to get wrong, so both are pinned:

- `BrandTest.cfc` **overrides** the base `defaults_are_correct()` rather than adding a fifth case, so
  the brand lineage is **three inherited cases plus one overriding case — not five**.
- The product URL assertion expects `/<globalURLKeyProduct>/nike-air-jorden/` with **both** a leading
  and a trailing slash, and the fixture string is retained exactly as the legacy test wrote it.

The four cases inherited from `meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L49-L68` are
`validate_as_save_for_a_new_instance_doesnt_pass`, `simple_representation_exists_and_is_simple`,
`has_primary_id_property_name` and `defaults_are_correct`.

`meta/tests/functional/admin/entity/ProductTest.cfc` is **an empty stub contributing zero coverage.**
It is acknowledged as a gap and never counted as coverage.

**Everything else is net-new**, and the map says so rather than implying parity: 16 of the 18 entity
modules, all 7 services, all 6 repositories, the entire Google adapter, every handler, and every
`src/lib/cfml` semantic-parity module. There was nothing to extend —
`meta/tests/unit/service/` holds only Account, Hibachi, Payment and UtilityRB tests, and
`meta/tests/unit/dao/` only Account and Payment. None of those is in scope.

Two conventions are carried over so the lineage stays visible even where the coverage is new:
`tests/setup.ts` and `tests/fixtures/*` follow `meta/tests/unit/Helper.cfc` as a **reference pattern**
(its build-save-flush and null-delete-flush shape), and regression tests follow the
**`issue_<ticket#>`** naming convention from `meta/tests/unit/IssuesTest.cfc`, including `issue_1766`
for the preserved no-op above.

One honest characterisation of the source suite: every legacy "unit" test boots the real application,
ORM and DI container, so the legacy suite is integration-style at every level. This port's unit tier is
genuinely isolated. Traceability here means **the same assertions about the same behaviour**, not the
same test architecture.

### The nine verified `roundValue` outputs

`RoundingRuleService.roundValue()` [`model/service/RoundingRuleService.cfc:L88-L175`] is not numeric
rounding: it is decimal-string manipulation that slices a prefix off the string form of an intermediate
value and concatenates the rounding expression's fractional part. It was reproduced and executed rather
than inferred, and these are the pinned outputs:

| Input     | Rounding expression  | Direction | Output  |
| --------- | -------------------- | --------- | ------- |
| `12.3456` | `0.99`               | Closest   | `10.99` |
| `12.3456` | `.99`                | Closest   | `11.99` |
| `12.3456` | `.99`                | Up        | `12.99` |
| `12.3456` | `.99`                | Down      | `11.99` |
| `12.3456` | `.95,.99`            | Closest   | `11.99` |
| `12.30`   | `.99`                | Closest   | `12.99` |
| `7.42`    | `9.99`               | Closest   | `9.99`  |
| `2.30`    | `0.99`               | Closest   | `0.99`  |
| `0.42`    | `.99`                | Closest   | `0.99`  |
| `12.3456` | `0.00` (the default) | Closest   | `10.00` |

**A "corrected", mathematically tidier rounding implementation fails this gate.** Several of those rows
are counter-intuitive on purpose: `12.30` with `.99` yields `12.99` where `12.3456` with the same
expression yields `11.99`, because a trailing zero shortens the string form of the intermediate and the
algorithm takes a different branch. A short input collapses outright — `7.42` by `9.99` becomes `9.99`,
an increase.

And the **default expression is not a no-op**: `roundValue` defaults `roundingExpression` to `"0.00"`,
which cuts `12.3456` to `10.00`. Any caller that omits the argument silently mangles the price, so
callers pass it explicitly.

Two helpers in `src/lib/cfml/` are what make this reproducible: `cfNumberToString()` replicates CFML's
trailing-zero dropping, which is the mechanism behind the `12.30` row, and the candidate comparison is
performed by **decimal value** rather than by string, because a string compare would wrongly treat
`"12.350"` as different from `"12.35"`.

---

## Scope boundaries — what is deliberately absent

Out of scope, and not partially implemented here:

- The **order, checkout, cart, payment, shipping and fulfilment pipeline**, including
  `model/service/OrderService.cfc` and every associated entity.
- The **account, subscription, vendor and tax** modules.
- **Every integration adapter other than Google**, the **Taffy REST layer** under `frontend/api/`, and
  the **Mura CMS bridge**.
- The **presentation subsystems** `admin/`, `frontend/`, `public/`, `assets/`, `templates/`, `tags/`
  and `custom/`, together with every vendored front-end library.
- **`org/Hibachi/**` in its entirety** — 938 files and 24 top-level `Hibachi*.cfc` classes. It is a
  boundary to extract from and never modify. Nothing there is ported; what it provided is redistributed
  explicitly, per the six transformation rules.

**One deliberate data-layer exception.** `PriceGroupDAO.getAccountSubscriptionPriceGroups(accountID)`
[`model/dao/PriceGroupDAO.cfc:L52-L100`] queries subscription-owned tables, and account price-group
resolution is otherwise unreproducible, so the statement is ported behind a repository port. The
reach-through is documented at the port, it is **read-only**, and **no subscription business logic is
ported.**

**Out-of-scope methods that live inside in-scope files stay out**, or become thin pass-throughs to
stub ports rather than being made to work: `processProduct_addProductReview`
[`model/service/ProductService.cfc:L157`], `processProduct_addSubscriptionTerm` [L173],
`processProduct_uploadDefaultImage` [L235], `loadDataFromFile` [L65], and the subscription and
content-access SKU-creation branches [`model/service/SkuService.cfc:L139-L202`].

**There is no `CategoryService`, and none is invented.** `Category.cfc` declares
`hb_serviceName="contentService"` **by design**, so category operations are served by the content
service in the legacy application too. The `Category` entity is ported as a read-mostly leaf together
with the narrow ContentService category-access path the in-scope services actually use.

**The Google integration adapter is a stub.** It satisfies the full contract surface and returns
well-formed output, but performs **no live Google API call and requires no credential**. The contract
mismatch is recorded rather than papered over: `integrationServices/IntegrationInterface.cfc:L50-L89`
documents an integration-type vocabulary of `shipping | payment | fw1 | custom` with **no product-feed
type**, while the legacy Google adapter registers as `"fw1"` and its feed logic lives in a controller,
a DAO and a `.cfm` view rather than in the interface implementation.

### Execution-model facts of the target platform

These are properties of Lambda and of the legacy engine. None is a commitment this service makes, and
no figure below is a target of any kind.

- The legacy runtime's **60-second order-placement, 45-second payment-transaction and 30-second DI/1
  first-scan lock timeouts are noted and deliberately not implemented.** The first two sit in
  out-of-scope code paths; the third disappears with DI/1 itself.
- The legacy CFML request timeouts have **no Lambda analogue**: `requesttimeout=3600`
  [`model/service/ProductService.cfc:L65-L68`] and `requesttimeout=360` in the Google feed template ask
  for budgets the platform does not offer, since Lambda caps an invocation at 15 minutes and API
  Gateway at 29 seconds. The bulk import is out of scope and the feed generator needs no such budget.
- **No `cfthread` usage exists anywhere in the in-scope slice** — the verified count across the
  in-scope entities, services, DAOs, process objects and the Google adapter is zero. The
  `cfthread` → `worker_threads` translation rule is recorded for completeness and is **unexercised**.

---

## Contributing

No user-specified rules were provided for this project — the rules source returns "No user rules
provided." Their absence is not licence to lower the bar, so the nine practices below stand in their
place at enterprise standard, and they are the house rules here.

1. **Maximal TypeScript strictness.** `strict`, `noUncheckedIndexedAccess`,
   `exactOptionalPropertyTypes`, `noImplicitOverride`, `noUnusedLocals`, and `skipLibCheck: false`. No
   `any`, no `@ts-ignore`, and no `@ts-expect-error` outside a test asserting a type failure. This
   profile is known to compile cleanly against the real dependency set, so **if a file fails to
   compile, fix the file — never the config.**
2. **Mechanically enforced layer boundaries.** The `no-restricted-imports` groups in
   `eslint.config.mjs`, at severity `error`. Domain-inward flow is a build failure, not a convention.
3. **Exact dependency pinning.** Every direct dependency is an exact version triple — no caret ranges,
   no `latest`, no tags.
4. **A single arithmetic surface.** All money goes through `Money`. No raw floating-point operation on
   a monetary value, anywhere.
5. **Parameterised SQL exclusively.** Prepared statements everywhere, preserving the injection-safety
   guarantee `cfqueryparam` provided.
6. **Environment-driven configuration with no hardcoded credential**, plus a committed `.env.example`
   that documents the contract and carries no secret.
7. **One exported unit per file, and no barrel files.**
8. **In-code annotation of every judgment call and every preserved defect**, using the uniform
   `LEGACY-DEFECT` marker and, for the three sanctioned exceptions, `DELIBERATE DIVERGENCE`.
9. **Licence continuity** via [`NOTICE-GPL.md`](./NOTICE-GPL.md), which records that the
   `/integrationServices/` special exception does not extend to this subtree.

Eight constraints from the plan carry the same force a rule would, and one of them is misread more
often than the rest:

- **The Minimal Change Clause scopes the functional surface, not the code style.** Idiomatic TypeScript
  is expected and required. **A line-for-line CFML transliteration violates this directive rather than
  satisfying it** — the point is that no _behaviour_ is added or removed, not that the new code should
  read like the old.
- **Preserve exactly** the three areas above. **Carry TODOs forward** flagged, never silently
  completed. **Interface parity** is the acceptance contract. **Schema continuity** means the existing
  `Sw*` tables, untouched. **Infrastructure as code is excluded**, so "deployable" is a build and
  package step. **No non-functional requirement is invented.** **Test traceability** means every
  converted method has a test and net-new coverage is labelled net-new.

### Before opening a pull request

Run from inside `slatwall-ts/`:

1. `npm run verify` — typecheck, lint, format check, and the full test run.
2. `npm run compile` — the declaration output still builds.
3. `npm run package` — the five artifacts and their five archives are produced.
4. Load one artifact and confirm its `handler` export is a function.
5. `git status --porcelain` — and confirm **only** additions under `slatwall-ts/`.

Step 5 is not optional, and it is the one that catches the mistake that matters most.

---

## License

Slatwall is released under the **GNU General Public License v3.0 or later**, copyright ten24, LLC.
This subtree reproduces the business logic of that application rather than merely calling it, so it
is a derived work and the same license applies. `package.json` records it as `GPL-3.0-or-later`, and
`npm run package` places `NOTICE-GPL.md` inside every archive so the attribution travels with the code.

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
