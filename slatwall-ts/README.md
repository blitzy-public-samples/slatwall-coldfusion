# slatwall-ts

A TypeScript re-expression of a bounded **catalog + promotions/pricing** slice of **Slatwall 3.1.39**,
targeting the AWS Lambda `nodejs20.x` runtime. The release is confirmed by `version.txt` in the
repository root, which is the citable authority for it. The upstream project's `getslatwall.com` domain
is named in the legacy `readme.md` and is **not linked here**: domain control is outside this
repository's evidence, so this file cites the legacy text rather than resolving the name.

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
  The register this port works from holds **thirty numbered entries plus eight secondary items** —
  the plan publishes twenty and the remainder were found by reading the in-scope source. Every
  reproduced site carries a `LEGACY-DEFECT [<path>:<locator>]` marker, and the three sanctioned
  exceptions carry a `DELIBERATE DIVERGENCE [<citation>]` marker instead.
  [Defects are reproduced, not repaired](#defects-are-reproduced-not-repaired) sets out all three
  and the arithmetic that keeps the budget at three. `tsconfig.build.json` sets
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
  `.json` under `model/validation/` — an immediate and severe scope violation, and one that lands as a
  hundred-file diff. `npm run format` and `npm run lint:fix` are safe **only** because your working
  directory is this subtree.
- **This subtree ships a committed `slatwall-ts/.gitignore`, and the fact that it is committed rather
  than left to `.git/info/exclude` is the point.** An exclude file is per-clone and never travels, so a
  fresh clone would carry no rules at all and a real `.env` holding `DB_PASSWORD` would be one
  `git add` away from the index. The committed file keeps `node_modules/`, `dist/`, `build/`,
  `coverage/`, the tooling caches and a local `.env` out of the index, while re-including
  `.env.example` so the committed environment contract stays tracked. It is the thirteenth root file,
  which the plan's enumeration does not name and **no plan pattern sanctions** — AAP 0.4.4's patterns
  are all trailing wildcards over directories, and the root is an instance list of twelve. It is
  therefore admitted as **one exact, closed scope exception**, keyed by this filename in
  `ROOT_SCOPE_EXCEPTIONS` and itemised in `recordedScopeAdditions`, both in
  `tests/traceability/legacyTestMap.ts` and both asserted — so a later "the root is exactly twelve
  artifacts" tidy-up fails a test instead of quietly deleting your protection, and a _fourteenth_ root
  file fails too until a plan owner rules on it. Ratifying the thirteenth into AAP 0.3.1 is an open
  plan-owner decision. Do not add a `.prettierignore` — the format scripts pass explicit globs and need
  none.
- **Verify before you stage**, every time: `git status --porcelain` must show paths under
  `slatwall-ts/` and nothing else. This is the control, not the ignore rules — every ignore mechanism
  is advisory, because `git add -f` and an explicit `git add <path>` both defeat it. The porcelain
  check does not.

### Why the isolation matters

Not as ceremony — the CFML monolith is still the running system, and the in-scope services are
consumed _by_ code this port does not touch. `model/service/OrderService.cfc`, explicitly out of
scope, injects `priceGroupService` [`model/service/OrderService.cfc:L60`] and `promotionService`
[`model/service/OrderService.cfc:L61`] among its sixteen collaborators. Those legacy services must
keep working exactly as they are, because the order pipeline calls into them. Inverting that
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

The two `nvm` lines below assume [nvm](https://github.com/nvm-sh/nvm) is installed; it is a
prerequisite of this recipe and not something this repository provides or checks for. Any equivalent
version manager works, as does a system Node — all that matters is that `node -v` reports a `20.x`
release of at least `20.19.0`, which `engines.node` enforces at install time either way. If you have
no version manager, skip the first two lines and verify the third.

```bash
nvm install        # honours .nvmrc                    (requires nvm)
nvm use            # -> v20.20.2                       (requires nvm)
node -v && npm -v  # v20.20.2 / 10.8.2                 (verify this line regardless)

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

`typescript` is pinned at `5.9.3` and **must stay exactly pinned**. AAP 0.9.1 binds this port to the
TypeScript 5.x line, and the registry's `latest` tag has already moved past it, so any specifier that
floats — a caret range, a tag, an unpinned reinstall — leaves that line silently. The traceability
suite asserts the `5.` prefix so the drift fails a test run instead of passing unnoticed.

### Runtime lifecycle — a frozen plan requirement

The Node 20 / Lambda `nodejs20.x` line is not an implementation detail this subtree chose. AAP
0.1.1, 0.5.1 and 0.9.1 freeze it: AAP 0.5.1 records that the runtime baseline is Node.js 20.20.2
"matching the Lambda `nodejs20.x` runtime the prompt specifies", and that the newer Node already
present on the planning host "was deliberately not used, because the prompt bounds the runtime at
`20.x`"; AAP 0.9.1 then makes "Node `20.x`, TypeScript `5.x`" a pass condition of the
toolchain-pinning gate. Raising the pin is therefore a plan-owner decision and not a change this
subtree may make on its own: a unilateral bump fails that gate by construction, and it also
invalidates the packaging evidence AAP 0.5.2 records, because the CommonJS-vs-ESM bundle decision was
validated against this runtime and driver pair and would have to be re-proven on another.

Six artifacts state the pin, so a migration moves all six together:

- `.nvmrc`
- `engines.node` in `package.json`
- `package-lock.json`
- `@types/node`
- `target: 'node20'` in `esbuild.config.mjs`
- the `FROZEN_NODE_VERSION` constant the `A16` traceability block asserts the other five against

The sixth is named explicitly because a change to only the first five still fails the suite, and that
failure reads as a broken test rather than as the last step of the change. `A16` rejects a partial
change by design: flipping `.nvmrc` alone reports "`.nvmrc` drifted off the AAP-frozen Node line".

**Support status.** AWS Lambda deprecated `nodejs20.x` on 2026-04-30, aligned with the upstream
Node.js 20 end-of-life. Under the Lambda runtime deprecation policy, AWS _may no longer_ apply
security patches or updates to a deprecated runtime, and functions using one are not eligible for
technical support — that conditional is the policy's own wording and is quoted rather than hardened
into an absolute here. Deprecation is monotonic, so treat the pinned line as unmaintained rather than
as pending. Lambda does **not** block invocations of a function on a deprecated runtime, so nothing
already deployed stops working on a milestone date; what lapses is patching, support eligibility, and
eventually the ability to deploy a change at all. That is what makes the pin a scheduling decision
for the plan owner rather than an outage.

The downstream restriction milestones — when function _creation_ stops, and when function _updates_
stop — are reported inconsistently across published sources, by a margin of months, and are
deliberately not tabulated here. A table would manufacture a precision the authorities do not agree
on, and a dated verification stamp would rot into a false claim the first time it went unrefreshed;
`A16` asserts the absence of both shapes for that reason. Read the milestone dates at the moment a
release or deployment decision is made, from the maintained
[AWS Lambda runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html) authority
and the [Node.js release schedule](https://github.com/nodejs/release#release-schedule), not from this
file.

### Runtime dependencies

| Package      | Version  | Why it is here                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `decimal.js` | `10.6.0` | Arbitrary-precision decimal arithmetic, wrapped by the `Money` value object. `Money` is the **only** arithmetic surface for a monetary value in this subtree; it replaces CFML `precisionEvaluate` and the `big_decimal` columns.                                                                                                                                                                                                                          |
| `mysql2`     | `3.23.1` | MySQL driver over the existing `Sw*` schema. Every statement is a prepared statement, which is what preserves the injection-safety property `cfqueryparam` provided.                                                                                                                                                                                                                                                                                       |
| `zod`        | `4.4.3`  | Typed schema validation, porting the **fifteen** declarative rule files that exist for in-scope artifacts under the legacy `model/validation/` — including the conditional requiredness `showPrice{updatePriceFlag eq 1}` / `showListPrice{updateListPriceFlag eq 1}`. Six in-scope artifacts have **no** rule file and none is invented; the split is enumerated under [Behaviour preservation](#behaviour-preservation--the-contract-a-reviewer-checks). |

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

The `dotenv` row's Role text is reproduced verbatim from AAP 0.5.1 and is deliberately not reworded
here, because this table's job is to mirror the plan's own inventory. Read on its own it overstates
what the code does: "local" loading is not automatic, and only `tests/setup.ts` imports the package.
The operative behaviour, with the exact local invocation, is stated under
[Environment-variable contract](#environment-variable-contract) below; that section, not this cell,
is the description of how loading actually works.

That is three runtime and ten development dependencies — **thirteen direct package pins**, which is
exactly what `package.json` and `package-lock.json` carry.

**AAP 0.5.1 says "fourteen" and then enumerates thirteen. Its prose total is arithmetically
inconsistent with its own table, and the table is the authority.** The Node runtime is not the
fourteenth package: the plan describes it separately, in the sentence immediately before the table
("the runtime baseline is Node.js 20.20.2 … with npm 10.8.2"), so counting it again would turn a
description into an inventory entry. There is no fourteenth package, none is inferred, and none may be
added to make a total agree.

Every one of the thirteen is an exact version triple with no caret, tilde or wildcard. The
traceability suite fails on any specifier that is not, and it deliberately writes down no total of
its own so that the number cannot go stale in two places at once.

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

| Command                 | What it does                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`     | `tsc --noEmit` over `src/**` **and** `tests/**` under the full strict profile.                                             |
| `npm run lint`          | `eslint .` — includes the `no-restricted-imports` layer boundary.                                                          |
| `npm run lint:fix`      | The same, with auto-fixable violations applied. Only ever from this directory.                                             |
| `npm run format:check`  | `prettier --check` over an explicit, **quoted** glob list — covers TypeScript, JSON **and** Markdown, including this file. |
| `npm run format`        | The same globs, with `--write`. Only ever from this directory.                                                             |
| `npm test`              | `vitest run`. Single pass, never watch mode. Needs no database and no environment variables.                               |
| `npm run test:coverage` | `vitest run --coverage`, enforcing the thresholds in `vitest.config.ts`.                                                   |
| `npm run compile`       | `tsc -p tsconfig.build.json` — emits `.js`, `.d.ts` and maps for `src/**` into `build/`.                                   |
| `npm run bundle`        | `node esbuild.config.mjs` — emits the bundled Lambda artifacts into `dist/`.                                               |
| `npm run build`         | `typecheck` then `bundle`.                                                                                                 |
| `npm run package`       | `typecheck`, then bundle **and archive** — one Lambda-ready `.zip` per capability.                                         |
| `npm run verify`        | `typecheck` → `lint` → `format:check` → `test`. The gate to run before committing.                                         |
| `npm run clean`         | Removes `dist/`, `build/` and `coverage/`.                                                                                 |

`build/` and `dist/` are deliberately different directories: `esbuild.config.mjs` recursively removes
`dist/` at the start of every run, so declarations emitted there would be destroyed by the next
bundle. `tsconfig.build.json` therefore sets `outDir: "build"`, and the two outputs serve different
consumers — `build/` holds `.js` + `.d.ts` + maps for a type consumer, `dist/` holds the bundled
`.cjs` Lambda artifacts, their `.cjs.map` maps and the `.zip` archives. Neither destroys the other.

**Why the two format scripts name globs instead of `.`, and why the globs are quoted.** Prettier 3
defaults `--ignore-path` to `[.gitignore, .prettierignore]`. This subtree now ships the first of those
(see the isolation invariant above) and deliberately no `.prettierignore`, and the scripts do
**not** lean on either: a bare `prettier --check .` would walk `dist/`, `build/` and `coverage/` and
fail on generated output the moment an ignore rule were narrowed or a directory appeared that no rule
named. The scripts name their inputs explicitly instead, which is an allow-list rather than a
deny-list, and it means the formatting gate does not change behaviour with the ignore file.

The quoting is load-bearing and must not be "tidied away": an unquoted `src/**/*.ts` is expanded by
the **shell**, and a shell without `globstar` matches one directory level — a small fraction of the
modules under `src/`, since all but a handful sit two or more levels deep. Quoted, the glob reaches Prettier intact and Prettier expands it recursively.
The failure mode of removing the quotes is a formatting gate that passes while checking a third of
the tree, so if you change these scripts, verify the change by planting a deliberate violation in a
deeply nested file and confirming the check reports it.

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
on, `legalComments: 'inline'`, and an **external source map that embeds the original TypeScript
sources** (`sourcesContent: true`).

**What `legalComments: 'inline'` does and does not carry.** It keeps the legal comments of
**third-party** dependencies — `decimal.js`, `mysql2`, `zod` and their transitive tree — inside the
artifact instead of moving them to a sidecar file that is trivially separated from the code it
describes. It is **not** the mechanism by which this port's own GPL attribution travels: none of this
subtree's source carries a `@license` or `/*!` annotation for esbuild to preserve. That attribution is
`NOTICE-GPL.md`, and it travels because [the package stage](#the-package-stage) places it at the root
of every archive. The distinction matters because the two mechanisms fail differently — dropping
`legalComments` would strip dependency notices, while dropping the archive entry would strip this
port's own.

That last setting is the audit trail, and it is worth being exact about which mechanism carries it.
The preserved-defect annotations this port is required to carry —
`// LEGACY-DEFECT [...]` and `// DELIBERATE DIVERGENCE [...]`, the format AAP 0.6.7 mandates — are
ordinary line comments, and a bundler discards ordinary comments regardless of what `minify` is set
to. The `.cjs.map` is what recovers them, and the recovery is what the build reports: run
`npm run bundle` and each artifact's line reads `Annotations recoverable from <artifact>.cjs.map:
LEGACY-DEFECT xN, DELIBERATE DIVERGENCE xM`, counted at build time from the sources the map embeds.
Embedding the sources in the map is what makes every one of them recoverable, with its legacy
`[<path>:<locator>]` citation intact, so the `.cjs.map` is a local build-and-audit companion rather
than a debugging nicety. It intentionally contains the GPL v3.0 TypeScript source and module paths, so
this is not a claim that the map is disclosure-free or suitable for indiscriminate publication. What
the build does guarantee is that no environment value is substituted into it: `src/lib/config.ts` is
the only runtime reader of `process.env` under `src/**`, and esbuild uses no build-time `define`.

A written TOTAL for those annotations is deliberately not restated in this file: the count moves every
time a marker is added or re-keyed, so a paragraph stating it is wrong shortly after it is written.
Read it off `npm run bundle`, or off `grep -rc 'LEGACY-DEFECT \[' src/`.

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

Three properties of that stage are decisions rather than defaults:

- **No host utility, and no subprocess.** The archive is written by this repository's own code using
  `node:zlib` (`deflateRawSync` for entry bodies, `crc32` for their checksums). Shelling out to a
  host-global `zip` would make `npm run package` fail on a stock container for reasons that have
  nothing to do with the code being packaged. `node:child_process` is imported nowhere in
  `esbuild.config.mjs`, and `tests/traceability/legacyTestMap.ts` asserts that.
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
read in exactly one place under `src/**`: `src/lib/config.ts` is the only module there permitted to
touch `process.env`, and it reads eighteen of the nineteen keys. It validates the whole set at once
and reports **every** problem it finds rather than failing on the first one.

Two consequences of that single-authority rule are worth stating precisely, because both are easy to
state loosely and wrong when stated loosely:

- **`LOG_LEVEL` is validated configuration like everything else.** `src/lib/logger.ts` reads no
  environment variable at all, and it declares **no imports whatsoever** — that is the property, not
  a coincidence. It cannot import `src/lib/config.ts` — configuration has to be able to fail before
  logging exists, and logging has to be able to report that failure — so the resolved threshold is
  handed over by the one module that holds both, `src/handlers/bootstrap.ts`, as it wires the
  composition root. The resolution is deliberately **lenient**: an unset, blank or
  mistyped `LOG_LEVEL` falls back to `info` and records _which_ of those happened, because a
  threshold able to abort a cold start would produce a service that can neither start nor say why.
  The coercion is announced once per container from that fixed classifier — the rejected value
  itself is discarded at resolution and is never logged, never echoed and never retained.
- **`TEST_LIVE_DATABASE` is the one key `src/lib/config.ts` does not read**, and that is deliberate
  rather than an omission. It selects whether an integration suite talks to a real server, so it
  describes the harness and not the service; `tests/setup.ts` reads it, alongside the `TZ` it
  assigns. Neither exists in a deployed bundle, which is why the sentence above is scoped to
  `src/**`.

In Lambda these values arrive as native environment variables and `dotenv` never runs.

**Under test**, `dotenv` loads a `.env` file from this directory if one is present. **A local
non-test run loads nothing by itself** — the distinction is narrower than "locally and under test"
suggests, and it matters. The only importer of `dotenv` in the whole subtree is `tests/setup.ts`,
wired in by `vitest.config.ts` as a setup file; nothing under `src/**` imports
it, and `src/lib/config.ts` reads whatever the process was actually given and refuses when a required
value is absent. To invoke a handler locally, put the variables into the environment yourself:

```bash
set -a; . ./.env; set +a          # export the file into your shell, then run anything
node --env-file=.env <script>     # or let Node 20 load it for one process
```

Either way that `.env` file is your own, it is never committed, and `.env.example` rather than `.env`
is the artifact under version control.

Where the contract comes from, so it can be checked against the legacy source rather than taken on
trust:

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

| Key           | Accepted values                                | Notes                                                                                                                                                                                                           |
| ------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DB_HOST`     | hostname                                       | No default, deliberately: a defaulted host is how a service quietly talks to the wrong database, so the deployment must name it.                                                                                |
| `DB_USER`     | string                                         | —                                                                                                                                                                                                               |
| `DB_PASSWORD` | string                                         | Supplied by the deployment. Never commit a value for this, and never write one into a tracked file.                                                                                                             |
| `DB_TLS_MODE` | `disabled` \| `verify-ca` \| `verify-identity` | Explicit and unavoidable, so transport security is always a stated decision. Certificate verification is never switchable off. `disabled` additionally requires `DB_HOST` to be a loopback address — see below. |
| `DB_DIALECT`  | `MySQL` \| `MicrosoftSQLServer` \| `Oracle10g` | Replaces the legacy `cfdbinfo` product-name probe with explicit configuration. This port implements the `MySQL` branch.                                                                                         |

**`disabled` transport is loopback-only, and that is enforced rather than advised.**
`src/lib/config.ts` refuses `DB_TLS_MODE=disabled` unless `DB_HOST` is `127.0.0.1` (or any
`127.0.0.0/8` address), `::1` — bracketed or written out — or `localhost`. The rule applies in
**every** environment, and it exists because the earlier production-only rule was insufficient on
its own: `NODE_ENV` defaults to `development`, so an environment that simply omitted it never
reached that check and could send the account, the credential and every statement to a _remote_
server in cleartext with nothing reported at startup. The production refusal remains on top, so a
production deployment cannot start on plaintext transport at all.

A name that merely _resolves_ to a loopback address is refused. `src/lib/config.ts` has no imports
by design — it must be able to raise its own startup failure before anything else has loaded — so it
performs no name resolution, and whether a service starts on plaintext transport must not depend on
a resolver's answer. Spell the literal.

Two hard semantics of `DB_DIALECT`, both verified in the legacy source:

1. **It is required, with no silent default — and the hard error is an improvement on the legacy,
   not a reproduction of it.** The two halves have to be kept apart, because conflating them
   misreports the source. What is _preserved_ is the absence of a guess: the legacy `<cfif>` chain
   that set the dialect has no `<cfelse>` and no fallback [`config/configORM.cfm:L9-L15`], so this
   port likewise invents no dialect it was not given. What is _not_ preserved is a refusal — that
   chain simply left the dialect **unset and execution continued**. The `<cfabort />` at
   [`config/configORM.cfm:L4-L7`] guards only the `cfdbinfo` probe's own `<cfcatch>`; it has nothing
   to do with the mapping below it, so the legacy did **not** fail closed on an unrecognised product
   name. `src/repositories/mysql/dialect.ts` refuses an unset or unrecognised value outright, and
   that is a **deliberate target improvement**, labelled as one: an ORM that silently defaulted its
   dialect produced wrong SQL somewhere later, whereas a driver that must interpolate a
   dialect-specific fragment would produce it immediately, at a site that decides money.
2. **The `MySQL` branch is the one implemented, and the variable still stays parameterised**, because
   **three** live SQL sites branch on the dialect — the same three `src/repositories/mysql/dialect.ts`
   encodes. The count was re-derived against the legacy source rather than carried over from the plan,
   which listed only the first two:

   | Legacy site                            | What branches                                                  |
   | -------------------------------------- | -------------------------------------------------------------- |
   | `model/dao/PromotionDAO.cfc:L482-L488` | the `productTypeIDPath` concatenation                          |
   | `model/dao/PriceGroupDAO.cfc:L57`      | the row-limiting clause                                        |
   | `model/dao/SkuDAO.cfc:L194-L198`       | the option-group positional weight in `getSortedProductSkusID` |

   Each is a named fragment in `dialect.ts` — `materializedIdPathLikePatternFragment`,
   `singleRowLimitFragments` and `optionGroupOdometerPowerFragment` — and `.env.example` lists the
   same three beside `DB_DIALECT`. Collapsing the parameter away would hide those branch points
   instead of removing them.

The MySQL branch targets **MySQL 8.0 or newer**. That is a project constraint carried from the plan,
and it is deliberately not attributed to the driver: `mysql2` 3.23.1 documents broad MySQL
compatibility and states no such server minimum of its own. It is an engine requirement, never a
performance claim of any sort.

### Defaulted — nine keys

Omit any of these to accept the value shown.

| Key                     | Default       | Notes                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DB_PORT`               | `3306`        | 1–65535.                                                                                                                                                                                                                                                                                                             |
| `DB_NAME`               | `Slatwall`    | The legacy datasource name, carried forward unchanged.                                                                                                                                                                                                                                                               |
| `DB_CONNECTION_LIMIT`   | `10`          | Pool size.                                                                                                                                                                                                                                                                                                           |
| `DB_CONNECT_TIMEOUT_MS` | `10000`       | Connection-establishment timeout.                                                                                                                                                                                                                                                                                    |
| `DB_MAX_IDLE`           | `10`          | Idle connections retained.                                                                                                                                                                                                                                                                                           |
| `DB_IDLE_TIMEOUT_MS`    | `60000`       | Idle-connection lifetime.                                                                                                                                                                                                                                                                                            |
| `NODE_ENV`              | `development` | `development` \| `test` \| `production`, matched without regard to case.                                                                                                                                                                                                                                             |
| `LOG_LEVEL`             | `info`        | `debug` \| `warn` \| `error` are the alternatives, matched without regard to case. Resolved by `src/lib/config.ts` like every other key, but **leniently**: an unrecognised value falls back to `info` and is announced once rather than failing startup, so a typo cannot silence the logger or break a cold start. |
| `TEST_LIVE_DATABASE`    | `false`       | Set `true` only to opt a live-database probe in. Read by `tests/setup.ts`, not by `src/**`. `npm test` ignores it — the suites assert SQL shape against a fake executor.                                                                                                                                             |

### The delivery-size contract — 4096 bytes for the whole environment

AWS Lambda caps the **entire** environment-variable map at 4 KB — 4096 bytes, keys and values
together — and the quota is **not adjustable**. A function whose configuration exceeds it is refused
at `UpdateFunctionConfiguration`: the deployment never goes out, and no code in this subtree runs to
explain why.

Two variables invite an unbounded value — `DB_TLS_CA` accepts inline PEM and `ECB_REFERENCE_RATES` an
arbitrarily long rate list — which is how an otherwise valid environment becomes undeployable. Every
variable therefore carries a documented maximum in UTF-8 bytes, listed under **DELIVERY-SIZE
CONTRACT** at the foot of [`.env.example`](./.env.example), and `src/lib/config.ts` refuses both an
over-size **value** and an over-budget **set** at start-up. The maxima total 3781 bytes; with the 250 bytes of key names and
one byte per entry reserved for overhead, the documented ceiling is **4050 of 4096** — 46 bytes of
headroom.

Two deliberate asymmetries are worth knowing. The short enumerations and integers are bounded
generously (16–24 bytes, well above their longest accepted spelling) because this is a _delivery_
bound, and a bound tight enough to catch a typo would become a second and worse shape check. And
`LOG_LEVEL` is budgeted but never _individually_ refused: an unset or unrecognised threshold must not
be able to abort a cold start, since configuration reports its own fatal failure through the logger.
Its bytes still count toward the aggregate.

The pre-deploy check runs in CI. `tests/traceability/legacyTestMap.ts` (block `A29`) recomputes that
sum from the source and fails the suite if it ever exceeds the quota, so a raised maximum or a
twentieth variable is caught by `npm test` rather than by a failed deployment.

Only those nineteen keys are measured. The `AWS_*` variables the runtime injects are not part of the
function's configured map and cannot be shrunk by a deployment, and a developer's shell carries
hundreds more that have nothing to do with this service; measuring either would make the budget
unreachable. If a value does not fit, the answer is not a larger number — `.env.example` records the
alternatives for an over-size certificate authority and rate table, and a configuration that
genuinely needs more than 4096 bytes cannot be delivered through Lambda environment variables at all.

The four pool values map one-to-one onto `mysql2` pool options. They are conservative starting points
to be tuned per environment and are **not targets of any kind**: the legacy system defines none, and
none is invented here.

### Optional — five keys

| Key                      | Accepted values                 | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DB_TLS_MIN_VERSION`     | `TLSv1.2` (default), `TLSv1.3`  | A floor, not a selection. TLS 1.0 and 1.1 are deliberately not accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `DB_TLS_CA`              | PEM certificate authority       | Supply when `DB_TLS_MODE` is `verify-ca` or `verify-identity` and the CA is not in the system trust store.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `FEED_ALLOWED_HOSTS`     | comma-separated host list       | **Required to serve the feed.** The deployment-owned allow-list the product feed's absolute URLs are built from, so a request can never choose the emitted origin. **Absent or empty means NO host is trusted and the feed route answers no document** — it fails closed, and there is no allow-all state. Entries are bare host authorities validated by the same parser `src/integrations/google/rssFeedRenderer.ts` applies to the host it publishes — one grammar, so an authorized host can never be refused at render time — with a port, when written, of 1–65535 and no leading zero. |
| `ECB_REFERENCE_RATES`    | `CODE=rate` pairs               | Deployment-supplied conversion rates for the currency cascade's conversion step. Absent, conversions pass through unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ECB_RATES_RETRIEVED_AT` | ISO-8601 instant, zone required | When the rates above were captured, so a stale set is visible rather than silently trusted. A zone designator (`Z` or `±HH:MM`) is mandatory, an impossible calendar date is refused rather than rolled forward, and a future instant is refused — it would make the age negative, which every staleness check reads as fresh.                                                                                                                                                                                                                                                                |

### Connections, and what not to commit

`src/repositories/mysql/connection.ts` creates exactly **one pool at module scope**, outside the
handler, so a warm Lambda container reuses its connections across invocations instead of opening a
connection per invocation. That is an engineering decision established by direct experiment during
planning — it is not a performance target, and no figure is claimed for it.

Every connection value resolves from the environment. **No credential is hardcoded anywhere in this
subtree**, and none may be introduced: `.env.example` documents the contract without carrying a
secret, and the only reader of `process.env` is `src/lib/config.ts` — there is no second reader
anywhere under `src/**`.

Four classes of local artifact must never reach a commit — the installed dependency tree
(`node_modules/`), the build and bundle output (`dist/`, `build/`, `*.tsbuildinfo`), the coverage
report (`coverage/`) and tooling caches (`.eslintcache`, `.vitest/`), and your real `.env`. This
subtree carries a **committed `slatwall-ts/.gitignore`** covering all four, with `!.env.example` so
the environment contract itself stays tracked. It is a thirteenth root artifact that AAP 0.3.1's
enumeration does not name, and — as the section above states — no AAP pattern admits a root file at
all, so it is itemised and asserted in `tests/traceability/legacyTestMap.ts` as **one exact, closed
scope exception** rather than as a pattern-sanctioned addition, and rather than left to be discovered
as drift.

**Why the rules are committed rather than kept in `.git/info/exclude`.** That exclude file is
per-clone and never committed, so a fresh clone inherits nothing: a developer following this file's own
instructions creates a real `.env` holding `DB_PASSWORD`, and `git add -A` stages it. Verification
alone does not cover that either — an ignore rule silences a warning while the porcelain check below
proves the outcome, and both are needed, because an ignore rule remains advisory in the face of
`git add -f`.

#### Three startup refusals that make the transport posture real

Each of these is a hard startup error rather than a warning, because a transport posture that reports
itself as stronger than it is has no value at all.

- **`disabled` requires a loopback host, in every environment.** Plaintext is accepted only when
  `DB_HOST` is `localhost`, any `127.*` address, or `::1` in bare or bracketed form. A remote host
  with `disabled` cannot start, whatever `NODE_ENV` says. The refusal is anchored to the host rather
  than to the environment for a specific reason: **`NODE_ENV` defaults to `development`** in this
  contract, so a check conditioned on it is exactly as reliable as a variable that is routinely unset
  in a container, misspelled in a template, or inherited from a shell — whereas `DB_HOST` is required
  and cannot be defaulted. The production refusal is _also_ in place, as defence in depth, and it is
  not the control.
- **`verify-identity` is refused when `DB_HOST` is an IP literal.** The driver suppresses the TLS
  `servername` for an IP host and then skips the identity check entirely, so the pairing neither
  fails nor warns — it silently delivers `verify-ca` while the contract claims `verify-identity`.
  Refusing it turns a hidden downgrade into a startup error that names `verify-ca` as the substitute.
  `verify-ca` is then the _correct_ value for an IP host or a re-terminating proxy, and stating that
  honestly puts the weakness in the contract instead of inside the driver.
- **`ECB_RATES_RETRIEVED_AT` must match an explicit ISO-8601 grammar**, not merely be something
  `new Date` accepts: a four-digit year, two-digit month and day, a literal `T`, hours and minutes,
  optionally seconds and a fraction, and a **mandatory** `Z` or `±HH:MM` offset. A zoneless string
  would be read in the _server's_ local zone, so one configuration would describe different instants
  on two hosts and shift the staleness warning by hours. The day's calendar validity is checked
  separately, leap years included, because `new Date` does not report an impossible date as invalid —
  it rolls `2026-02-31T00:00:00Z` forward to 3 March.

#### What must never reach a commit

Four classes of local artifact: the installed dependency tree, the build and bundle output, the
coverage report, and your real `.env`.

**This subtree ships a committed `slatwall-ts/.gitignore`** covering all four — see
[the isolation invariant](#the-isolation-invariant) for why it is a sanctioned thirteenth root
artifact — so a fresh clone is protected from the ordinary accident. Two habits still matter, in
order of preference:

1. **Prefer not to create a `.env` at all.** Inject the values from your shell or a managed secret
   store, which is how the deployed runtime supplies them anyway, so your local setup matches
   production instead of diverging from it. The entire suite passes with a **completely empty
   environment**, so nothing in this repository needs the file to exist.
2. If you do create one, the committed rules already keep `.env` and every `.env.*` except
   `.env.example` out of the index. Do not defeat them with `git add -f`, and do not rename the file
   to something no rule names.

Two things hold either way:

- **The gate is `git ls-files`.** `git ls-files slatwall-ts` must list only hand-authored sources —
  the root artifacts, `src/**`, `tests/**`. The root holds **thirteen** files: the twelve AAP 0.3.1
  enumerates plus `.gitignore`, admitted as the one recorded scope exception described above. Both
  figures are stated on purpose — the frozen figure is twelve and the committed figure is thirteen — so
  that the difference cannot go missing behind whichever one a sentence happens to use. If it ever names
  a path under `node_modules/`, `dist/`, `build/` or `coverage/`, or names a `.env` that is not
  `.env.example`, that artifact has been committed and must be removed from the index.
- **Check before staging, do not assume.** Run `git status --porcelain` and confirm only intended
  files under `slatwall-ts/` appear. Nothing generated is ever staged by name here; `git add`
  targets specific paths, never `.` or `-A` from the subtree root.
- **Generated paths are quiet because the committed rules name them**, and the same eight names are
  declared as `UNTRACKED_ROOT_NAMES` in `tests/traceability/legacyTestMap.ts` so the census does not
  report a build product as scope drift. A traceability case asserts the two agree; a personal global
  ignore file (`git config --global core.excludesFile`) remains available for anything outside them.
- The repository-root `.gitignore` is a CFML-era file this port does not modify, and it covers none of
  the four — which is exactly why the rules had to live in the subtree. Never edit the root file to
  compensate.
- **Check, do not assume.** Run `git status --porcelain` before staging and confirm that only intended
  files under `slatwall-ts/` appear. Every ignore mechanism is advisory — `git add -f` and an explicit
  `git add <path>` both defeat one — so the status check is the gate and the ignore rules are a
  convenience.
- `.env.example` is the committed contract and holds no secret, and the one negation in
  `slatwall-ts/.gitignore` (`!.env.example`) is what keeps it tracked while `.env` and `.env.*` are
  not. A real `.env` holds `DB_PASSWORD`: never stage it by name and never force it in.

---

## Product-feed transport — a frozen contract, and what it does not cover

The Google product feed emits `http://` origins at all five URL sites, and that is a plan-level
constraint rather than a defect this subtree claims to have fixed.

The legacy template writes `http://#CGI.HTTP_HOST#` at the channel link, the channel description, the
item link, the item image link and each additional image link
[`integrationServices/google/views/feed/product.cfm:L14, L15, L22, L23, L24`], and never `https`. AAP
0.1.1 requires preserving the Google product-feed integration contract **exactly**, AAP 0.8.1 freezes
it, and AAP 0.6.7 permits exactly three divergences in this port — none of them this. Changing the
scheme is therefore a fourth divergence and needs an **AAP amendment**, not a remediation pass.
`src/integrations/google/rssFeedRenderer.ts` owns the literal as `FEED_ORIGIN_SCHEME_PREFIX` and
carries the reasoning beside it, including the one-line edit that closes this once authorized.

**Terminating TLS in front of the service does not make these links HTTPS.** A load balancer or CDN
governs how a _client_ reaches this service and rewrites nothing inside a generated document. The
scheme in every feed URL is a literal emitted by `rssFeedRenderer.ts`, so a fronted deployment still
publishes `http://` origins in its feed body unless something downstream rewrites them. Nothing in the
`DB_TLS_*` group bears on it either: that group protects this service's own connection to MySQL and
never reaches the renderer.

**What is contained, and how.** No forwarding header — `X-Forwarded-Proto`, `Forwarded`,
`CloudFront-Forwarded-Proto` or any other — is read by the renderer, the feed handler or the
composition root, so the scheme cannot be steered by a request. Every emitted value is XML-escaped.
And the authority the scheme is glued to is bounded: **the request selects which authorized host is
served, and `FEED_ALLOWED_HOSTS` defines the authorized set.** `assertAllowedFeedHost` reads the
request `Host`, normalizes it, and then requires membership in that list; the emitted origin is the
normalized request host, admitted by configuration rather than supplied by it. That check is
**unconditional** — an absent or empty `FEED_ALLOWED_HOSTS` authorizes no host, so the route answers
no document rather than answering on whatever authority the request carried. Configuration therefore
decides whether the feed serves at all, and constrains which authorities it will serve; it never
leaves an allow-all state behind.

Reproducing the legacy's request-derived host verbatim is what the allow-list rules out, and the
reason is provenance rather than parity. CFML read `CGI.HTTP_HOST` from a request that had already
reached a web server bound to hostnames the deployment owned, so the deployment constrained that value
before the application saw it. An API Gateway proxy event carries whatever `Host` a client writes, so
reading it without a list would let a caller choose the authority written into every link of a merchant
feed that Google then fetches and follows.

The residual is the five `http://` prefixes themselves. The feed is machine-read by Google Merchant
Center and carries the product names, images and prices the store publishes anyway, which bounds what
the cleartext scheme exposes — but it does not close it, and closing it is the plan owner's decision.

## Product-feed availability — a bounded residual, and one deployment obligation

`GET /feeds/google/products` recomputes the feed in full on every allowed-`Host` request:
whole-catalog selection, the batched follow-up hydration, and a complete in-memory render, with no
application cache, conditional validator, rate limit or concurrency guard. Any network caller may
repeat allowed-`Host` requests in parallel. That mechanism is stated plainly because it is real, and
it is a residual this subtree may not close in code.

`src/handlers/productFeedHandler.ts` carries the clause-by-clause record beside its capacity block.
In short, of the five controls that would close it, four are blocked by the plan and one is already
satisfied:

| Control                                    | Why it is not implemented here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application cache / pre-generated artifact | A cached document is module-scope state on a warm container. AAP 0.6.5 requires every legacy component-level cache to become **request-scoped**, because module state persists between unrelated requests and reproducing it "would be actively unsafe". The bar is not a headcount: [Module-scope state, enumerated](#module-scope-state-enumerated) lists **five** bindings, and what they share is being expensive to build, request-**independent**, and free of request data. A rendered catalog document would be the first holding business data derived from one caller's request — it is built from that request's own origin authority and pinned to its single instant, so retaining one would answer a later caller on an earlier caller's authority and timestamp. Pre-generation is a deployment activity, and AAP 0.2.2 excludes infrastructure as code. |
| ETag / Last-Modified / Cache-Control / 304 | This route's header ruling names those three headers and conditional requests as HTTP semantics the legacy source lacked, whose addition would invent a requirement (AAP 0.8.1). A validator family also buys nothing on its own: a strong validator is computed from the document, so without the cache above a conditional request still pays for the whole selection and the whole render before it can answer 304.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Rate and concurrency limits                | These belong to the edge/WAF tier, which AAP 0.2.2 places out of scope. A per-container counter is again module-scope state, and a concurrency ceiling is a throughput figure — which AAP 0.8.1 forbids inventing, the same clause under which the legacy runtime's own 60-, 45- and 30-second lock timeouts are noted and deliberately not implemented.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Monitor duration and memory                | Already measured by the platform, per invocation. The served-feed log line deliberately records no size, count or elapsed figure, and a suite asserts that it records none.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Never silently truncate                    | **Satisfied.** `src/integrations/google/googleFeedRepository.ts` applies no row ceiling to the feed selection: a security goal does not license replacing a working feed with an error, or with a short one, on correct data.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

**What bounds the residual.** The route answers only for a `Host` in the deployment-owned allow-list
and fails closed — absent or empty `FEED_ALLOWED_HOSTS` authorizes no host and the route answers no
document, so an unconfigured deployment has no exposure here. Per invocation the work is one selection
statement plus four **batched** follow-up statements — one round trip per feed, never one per row — one
pure render, one request scope, no duplicate buffer, and nothing retained between invocations. Capacity
is characterized against the platform's own payload ceilings, and a catalog past them fails visibly
rather than shrinking.

**The deployment obligation, stated so it is not assumed.** Request rate limiting, request concurrency
limiting, a cache or CDN in front of `GET /feeds/google/products`, and duration and memory alarms are
**owned by the deployment**; this subtree ships no infrastructure by AAP mandate. Closing the two
blocked controls inside this subtree needs an **AAP amendment** authorizing both a second module-scope
state exception and the HTTP validator family. Until one exists, the residual is documented rather
than patched.

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

**No module exists beyond the plan's own file enumeration**, and `A20` asserts that against disk on
every run: `src/**` holds exactly the eighty-nine modules AAP 0.3.1 enumerates.

Two capabilities a reader may expect to find as their own modules do not have one, so their
destinations are stated here rather than left to inference:

- The **reference-rate currency converter** satisfying the `CurrencyConverter` port is a class inside
  `src/handlers/bootstrap.ts`, which is where AAP 0.3.1 puts an implementation with no adapter file of
  its own. Placing it under `src/integrations/` beside the Google adapter would make it read as a
  second, non-Google integration — a scope shape AAP 0.2.2 excludes. Its rates arrive as configuration
  (`ECB_REFERENCE_RATES`), and it opens no socket, because no HTTP client or XML parser is in the
  pinned dependency set.
- The **own-key guard** that stops a `__proto__` member in parsed JSON from reaching a lookup is the
  boolean `containsPrototypeMemberKey` in `src/handlers/errorMapper.ts`, beside the refusal vocabulary
  its two callers already import. It is deliberately a predicate rather than a locator: returning the
  offending key's dotted path would assemble caller-supplied ancestor key names into a value that
  reaches both a 400 body and the log stream, and a predicate cannot leak what it does not construct.

The boundary rule matches on the **layer a path sits in**, never on a list of known filenames, so
neither placement depends on a rule naming it.

The rule is mechanical rather than conventional. `eslint.config.mjs` expresses it as
`no-restricted-imports` pattern groups at severity `error`, so a violation is a **build failure**, and
`tsconfig.json` declares no
`paths` or `baseUrl` that a specifier could use to slip past it. Do not add an exception to the
config, and do not reach around the rule from a test.

### The six transformation rules

Every file in this subtree is the product of these six substitutions. The CFML runtime supplied four
implicit services — bean-factory injection, convention routing, ORM persistence with lazy traversal,
and ambient request state — and each becomes something a compiler can verify.

| #   | Legacy construct                                                                                                                         | Target construct                                                                              | Rule                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| T1  | DI/1's convention scan of `property name="xService";`                                                                                    | Constructor parameters typed to ports, wired once in `src/handlers/bootstrap.ts`              | Every collaborator is an explicit, compile-checked argument. No runtime scan, no service locator, and no first-scan lock.    |
| T2  | `getService("xService")` locator calls inside entities                                                                                   | A constructor-injected port on the entity                                                     | Declared dependencies replace ambient lookups. The scope of the count matters — see the note below the table.                |
| T3  | Hibernate ORM: `ORMExecuteQuery`, `<cfquery>`, `super.save()`, lazy collections                                                          | Repository ports over `mysql2` prepared statements, associations materialized at the boundary | Prepared statements preserve `cfqueryparam` safety; fetch shape becomes an explicit per-method decision, so no implicit N+1. |
| T4  | CFML numeric duality and `precisionEvaluate`                                                                                             | The `Money` value object as the sole arithmetic surface                                       | No floating-point operation touches a monetary value anywhere in the target.                                                 |
| T5  | FW/1 subsystem routing and `.cfm` views                                                                                                  | An explicit route table plus a string-emitting renderer                                       | The RSS feed becomes a pure function returning a string, not a rendered template.                                            |
| T6  | Ambient request scope — `getHibachiScope()`, and the inconsistent `getSlatwallScope()` [`model/service/PriceGroupService.cfc:L262-L268`] | An explicit context parameter threaded down the call chain                                    | No ambient state, and the legacy divergence between the two scope accessors disappears with it.                              |

#### The T2 count, scoped — because "seven sites" is true of a table, not of the tree

The plan's T2 row set has **seven entries**, and those entries cite **ten call sites** across the two
entities (one entry covers four adjacent `currencyService` calls). Verified against this checkout, each
citation resolves to a real `getService("…")` call:

| Locator                         | Service retrieved   | Becomes                                              |
| ------------------------------- | ------------------- | ---------------------------------------------------- |
| `model/entity/Sku.cfc:L258`     | `promotionService`  | Nothing — the call target does not exist (DEFECT-16) |
| `model/entity/Sku.cfc:L371`     | `currencyService`   | `currencyConverter` port                             |
| `model/entity/Sku.cfc:L418`     | `currencyService`   | `currencyConverter` port                             |
| `model/entity/Sku.cfc:L422`     | `currencyService`   | `currencyConverter` port                             |
| `model/entity/Sku.cfc:L425`     | `currencyService`   | `currencyConverter` port                             |
| `model/entity/Sku.cfc:L437`     | `priceGroupService` | Injected price-group resolver                        |
| `model/entity/Sku.cfc:L569`     | `skuService`        | Injected repository                                  |
| `model/entity/Product.cfc:L341` | `optionService`     | `optionRepository` port                              |
| `model/entity/Product.cfc:L367` | `productService`    | Injected repository                                  |
| `model/entity/Product.cfc:L519` | `promotionService`  | Injected sale-price resolver                         |

Those ten are not the extent of the pattern in the legacy tree, and the difference is worth having on
record so nobody reads the table as a census. `Sku.cfc` alone contains **19** `getService(` calls and
`Product.cfc` contains **18**; across all of `model/entity/*.cfc` there are **205 occurrences on 204
source lines** (two calls share a line). The ones outside the table reach services that are out of
scope — image, stock, inventory, location, attribute, fulfillment, content and utility — so they are
not ported, and the entity methods that contained them are not ported either. The seven rows are the
T2 work; the 205 is the size of the pattern the boundary rule in `eslint.config.mjs` now prevents.

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

**The whole URL surface is five rows, and this is it.** Every one is matched case-insensitively on both
method and path, and `methods` is a CFML comma list read with `listFindNoCase`, exactly as
[`Application.cfc:L133`] read one.

| Method     | Path                      | Capability             | Action                |
| ---------- | ------------------------- | ---------------------- | --------------------- |
| `GET,POST` | `/catalog/products`       | `catalogQuery`         | `queryCatalog`        |
| `GET`      | `/catalog/skus`           | `skuResolution`        | `resolveSkus`         |
| `POST`     | `/promotions/application` | `promotionApplication` | `applyPromotions`     |
| `POST`     | `/prices/resolution`      | `priceResolution`      | `resolvePrices`       |
| `GET`      | `/feeds/google/products`  | `productFeed`          | `generateProductFeed` |

**A capability has exactly one path, and the operation travels as a query parameter.** Enumerating a
sub-surface per ported method would invent a URL vocabulary this migration was never asked to design —
the legacy slice has no HTTP vocabulary at all to copy, because its services are invoked by CFML method
call from `admin/` controllers. So `?operation=<portedMethodName>` names the method, spelled exactly as
the service spells it, and it is **required** with no default: a default would silently answer a
different question than the one asked.

**`catalogQuery` is the one row declaring two methods, and it serves fourteen operations.** Each is
served on exactly one of them, checked inside the handler — a read named on `POST` and a mutation named
on `GET` are both refused with a **400**, not a 405, because the operation is not part of the path and
only the handler knows which verb a given operation answers on.

| Method | Operations                                                                                                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `findProducts`, `getFormattedOptionGroups`, `getUnusedProductOptions`, `getUnusedProductOptionGroups`, `getOptionsForSelect`                                                                                                                |
| `POST` | `processProduct_addOptionGroup`, `processProduct_addOption`, `processProduct_updateSkus`, `processProduct_deleteDefaultImage`, `processProduct_updateDefaultImageFileNames`, `saveProduct`, `saveProductType`, `deleteProduct`, `saveBrand` |

Four things about that surface are policy rather than accident, and each is stated at the handler:

- **Every mutation names an EXISTING row by identifier**, hydrated through `RequestScope.entityLoaders`
  before the service is called. Row **creation** is not published: a routed creation protocol is an
  entity-construction concern the plan describes nowhere.
- **An identifier that names no row is a 200 carrying a closed `unresolved` reason**, not a 404. The
  shared error mapper reaches 404 on one category only — `routeNotFound` — and the router already
  answers 404 for a path no row declares; reusing it here would collapse two different facts onto one
  status.
- **A ported save rule that failed is a 400** built from the entity's own error register. The three
  ported saves do not throw for a failed save-context rule — the legacy `HibachiService.save`
  [`org/Hibachi/HibachiService.cfc:L151-L167`] returns the same entity whether it validated or not — so
  deciding a status from a returned value is transport work.
- **`deleteProduct` answering `false` is a 200**, because that is the ported delete-context refusal
  [`model/service/ProductService.cfc:L317-L339`] working correctly rather than a failure.

All fourteen operations are published deliberately: every Product, Brand and Option action AAP 0.4.2
maps has a transport, so catalog persistence and the whole of `BrandService` are reachable rather than
mapped-but-unroutable. The nine mutations are hydrated through `RequestScope.entityLoaders`, and their
retry semantics are published per operation as data rather than as a mechanism — see the AAP 0.6.5 note
in `src/handlers/catalogQueryHandler.ts` for why no response ledger backs them.

---

## Import discipline

It constrains every file, so it is short and absolute:

- **Explicit relative specifiers**, carrying the `.js` extension that NodeNext resolution requires.
- **Named imports only.** No default export, except where a third-party module mandates one — the
  tooling configs at the root of this subtree are the practical exceptions.
- **No barrel or `index.*` re-export files anywhere.** `eslint.config.mjs` restricts the pattern
  outright, so this half of the standard is a **build failure** rather than a convention. It keeps each
  regenerated file's diff minimal and makes every dependency legible at its use site.
- **`import type` for type-only imports**, so nothing type-only survives into the bundle.
- **One exported _runtime_ unit per file**, with that unit's own types co-located beside it — not one
  exported _symbol_. The distinction is AAP 0.3.1's, not a relaxation of it: 0.3.1 enumerates the
  layout itself and its own entries are plural, listing `src/lib/cfml/list.ts` as
  "(listLen/listGetAt/listAppend/listToArray/listFindNoCase)" — five functions, one file, named
  individually in the plan. Types are erased at emit, so they cannot be the subject of a runtime-unit
  rule, and all thirteen `ports/` files plus `views/` and `promotionEngine/` are type-only by design.
  Twenty modules carry more than one runtime export; each is named in
  `tests/traceability/legacyTestMap.ts` with the ground that authorizes it, and gate **A20** fails any
  module that grows a second one without a recorded ground. The **no-barrel** half above admits no
  exemption at all.
- **There is no legacy-side import migration.** CFML resolves components by dotted path
  (`extends="Slatwall.org.Hibachi.HibachiEntity"`) and by DI/1 convention; there are no import
  statements to rewrite and no existing CFML file is modified. Do not go looking for import rewrites
  in the legacy tree — there are none to find.

### Module-scope state, enumerated

On a warm container, module state persists between **unrelated** requests, so reproducing the legacy
component-level caches as module state would be actively unsafe — it could leak one customer's
discount into another's order. Every memo the legacy entities and services kept at component scope is
therefore instance state on a request-scoped object here, created fresh per request by
`createRequestGraph`.

There are **five** module-scope mutable bindings, not one, and these are all of them — the list is
exhaustive, and a sixth is a design change rather than an implementation detail:

| Binding                                             | Why it is at module scope                                                                                                                                                                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `memoizedPool` (`repositories/mysql/connection.ts`) | The one `mysql2` pool. Reusing connections across warm invocations is the engineering decision this subtree was built around; a pool per invocation would defeat it.                                                                            |
| `memoizedExecutor` (same file)                      | The narrow prepared-statement executor wrapping that pool. It holds no request state — it is a stateless façade over the pool, memoized so it is not rebuilt per call.                                                                          |
| `memoizedCompositionRoot` (`handlers/bootstrap.ts`) | The wiring itself: configuration, the dialect decision, the eagerly-resolved settings provider and the stateless adapters. Nothing request-scoped is reachable from it; per-request graphs are built on top of it.                              |
| `memoizedConfiguration` (`lib/config.ts`)           | The validated configuration. Resolved on first `load()` rather than at module load so a failure is attributable, and `reset()` discards it. Passing an explicit record — as tests do — never memoizes.                                          |
| `adoptedThreshold` (`lib/logger.ts`)                | The log threshold handed over by the composition root, held here because `logger.ts` may not import `config.ts` — configuration must be able to fail before logging exists. Written by one function, read by one, and it holds no request data. |

The first four are documented exceptions of the same shape: expensive-to-build, request-independent,
and reset explicitly in tests. The fifth is the seam that keeps `LOG_LEVEL` out of the logger: the
threshold is adopted from validated configuration rather than read from the environment on every
emission, which is what makes `src/lib/config.ts` the single environment reader described above. If
you find yourself adding a sixth, that is a design decision to raise — not a local optimisation.

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
  adapter's `product(rc)` becomes
  **`generateProductFeed(criteria: FeedCriteria): Promise<string>`**, returning the document as a
  string instead of mutating a request context and deferring to a view. That is the declaration AAP
  0.4.2 freezes, and the port, the service and the handler all carry it verbatim.

  The `criteria` parameter is **not** a selection surface, and it is worth saying why it exists at all.
  No caller may narrow the feed: the legacy controller's four filters — active SKU, active product,
  published product, positive quantity available to sell — are compiled into the statement, and
  `fetchProductFeedRows()` is nullary. `FeedCriteria` declares exactly two members and neither is a
  filter: `feedHost`, the origin the five absolute-URL sites are built from, and `now`, the single
  instant every sale-price effective-date range is evaluated against. Both are **ambient request state
  the legacy read from the CFML engine** (`CGI.HTTP_HOST` and `now()`), made explicit as an argument
  because transformation rule T6 removes ambient scope and leaves nothing here to read them from. The
  composition root normalizes the request `Host`, requires it to be a member of `FEED_ALLOWED_HOSTS`,
  pins the instant, and publishes the pair as `RequestScope.feedCriteria` for the handler to forward
  whole — so the request selects which authorized origin is served while configuration defines the
  authorized set, and the parameter is what makes both values visible in the contract instead of hidden
  in a closure.

- **Five visibility widenings**, and no sixth. `getDiscountAmount` and the four qualification helpers
  are `private` in the legacy source and are exported here so they can be tested directly. Widening
  visibility changes no behaviour; it is recorded rather than buried.
- **One entity-layer signature widening.** `PromotionPeriod.isCurrent(now?: Date)` accepts the current
  instant as an **optional** parameter. Passing one makes the UTC policy explicit and the method
  deterministically testable, which is the purpose the plan records; omitting it reads the entity's
  **injected** clock — never an ambient one, so T6 still holds — which keeps the legacy zero-argument
  call form callable and so keeps interface parity intact. The ledger asserts the declaration text, so
  the parameter cannot quietly become required again.

Anything beyond those budgets fails the gate. Adding a fourth reshaping or a sixth widening requires
justification against the plan before it is accepted, not a passing test run.

### The three must-preserve areas

1. **Promotion discount math and use-limit enforcement** [`model/service/PromotionService.cfc`]. The
   489-line `updateOrderAmountsWithPromotions` is decomposed into nine modules under
   `src/services/promotion/`, and the decomposition is structural only — the mutable usage ledger, the
   two opposing insertion sorts, and the two-pass reward iteration all behave as the legacy does.
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
and is resolved through the settings port.

A deployment that configures a different base currency keeps working, and that holds in the composition
root as well as in the entity: `BootstrapSettingsProvider` is not built from declared defaults alone.
The root issues one eager, relationship-free read of `SwSetting` for the setting names it resolves — the
legacy's own final probe [`model/service/SettingService.cfc:L490, L595-L608`] — and a configured row
wins over its declared default. Without that read, `setting('skuCurrency')` would answer the literal
`USD` however the shop was configured, which is a money defect rather than a cosmetic one.

**There is exactly one settings contract, and it publishes four names.** AAP 0.4.1 and 0.4.2 describe
`settingsProvider.ts` as a "read-only accessor for exactly four keys" — `skuCurrency`,
`skuEligibleCurrencies`, `globalURLKeyProduct` and `globalURLKeyProductType`. A second port interface
for the product-title template would be scope the plan does not authorize, so there is none: the
presentation settings the product entity needs are resolved **once** in the composition root and handed
to the entity as a plain frozen value, which is the pattern `Sku.imageSettingValues` uses. The eager
`SwSetting` read covers those four keys plus the presentation names the root resolves for itself. A row
whose value is **empty** wins too, because the legacy sets
`foundValue = true` in the same breath as the assignment [`model/service/SettingService.cfc:L525-L527`];
for `skuEligibleCurrencies` that is the difference between a deliberately closed cascade gate
[`model/entity/Sku.cfc:L373`] and a fully priced catalog.

Cross-currency conversion is configured, never assumed. `ECB_REFERENCE_RATES` supplies the reference
table and `ECB_RATES_RETRIEVED_AT` its age. **`convertCurrency` is a total function**: whenever a quote
cannot be produced — no table configured at all, or a table that does not quote one of the two codes —
the amount passes through **unconverted**, because that is exactly what
[`model/service/CurrencyService.cfc:L100-L101`] does and the SKU cascade consumes the result as a price.
The absence is recorded on the log stream for an operator, once per resolution, and it is never raised
to a caller.

**An empty rate table passes through; it does not refuse.** Refusing is tempting, because an absent
table is the legacy's cold-start failure state — a swallowed fetch error followed by a read of an
unassigned variable [`model/service/CurrencyService.cfc:L104-L131`] — and answering 1:1 there publishes
base-currency numerals as foreign-currency prices invisibly. The reason a throw is still wrong is where
it would land: the SKU currency cascade's conversion step [`model/entity/Sku.cfc:L416-L428`] calls the
converter for every eligible currency with no explicit override, so an unconfigured rate table would
fail not one conversion but the whole `getCurrencyDetails()` build, and with it every price the SKU can
answer for **any** currency including the base one. A missing configuration would become a total pricing
outage. Pass-through with an operator-visible log line is both the legacy behaviour and the AAP 0.4.2
contract, and the staleness signal `ECB_RATES_RETRIEVED_AT` exists to make the gap visible without
weaponizing it.

### The cross-service ordering constraint

`PriceGroupService.updateOrderAmountsWithPriceGroups()` **must run before**
`PromotionService.updateOrderAmountsWithPromotions()`.

The promotion pass reads price-group state that the price-group pass writes. Read the guard at
[`model/service/PromotionService.cfc:L241-L252`] literally rather than from a paraphrase — transposing
its two branches inverts the discount on every price-group order:

```
if( isNull(orderItem.getAppliedPriceGroup()) || reward.hasEligiblePriceGroup( orderItem.getAppliedPriceGroup() ) ) {
    // discount from getPrice(), with NO correction term
} else {
    // discount from getSkuPrice(), then subtract the price-group saving already given:
    // originalDiscountAmount - ( getExtendedSkuPrice() - getExtendedPrice() )
}
```

So the `if` — taken when the item has **no applied price group at all, _or_ the reward does list the
applied group as eligible** — discounts from `getPrice()`, which may itself already be a price-group
price. Only the `else` — an applied price group the reward does **not** treat as eligible — discounts
from `getSkuPrice()` and then subtracts the difference between the extended SKU price and the extended
price, so the customer is not given the same saving twice. `src/services/promotionService.ts` reads
`appliedPriceGroup` and asks `reward.hasEligiblePriceGroup(...)` in that order, for that reason, and
three docblocks in this subtree state the same polarity.

In the legacy system the ordering of the two passes held only because `OrderService` happened to call
them in that sequence — it is nowhere stated and nothing enforced it. Here the composition root makes
it explicit and non-optional, and a test asserts that reversing the two changes the computed discount.

### Defects are reproduced, not repaired

Legacy defects are carried forward deliberately, and **the ledger is the markers in the source, not a
number in this file.** AAP 0.6.7 publishes twenty numbered defects plus eight secondary items as the set
found while the plan was written; the register carried forward here holds **thirty** numbered entries,
because reading the in-scope source line by line during the port found ten more.

`A25` in `tests/traceability/legacyTestMap.ts` proves the authority as **three separate inventories**,
and the split is what makes the claim checkable:

| Inventory                         | Size               | Proven by                                                                    |
| --------------------------------- | ------------------ | ---------------------------------------------------------------------------- |
| `AAP_NUMBERED_DEFECTS`            | **30**, frozen     | a marker citation naming the legacy file with a line inside the entry's span |
| `AAP_SECONDARY_DEFECTS`           | **8**, frozen      | the same, plus `verbatimIdentifiers` for the four preserved misspellings     |
| `SUPPLEMENTAL_TARGET_DISCOVERIES` | **open-ended** (4) | the same proof, across `src/**` and `tests/**`, with no length to break      |

**Three inventories rather than one, and the split is load-bearing.** A single thirty-row array
cannot prove thirty numbered entries: filling it with entries 1–20 followed by ten rows labelled as
secondary items leaves **21–24 and 26–30 proven nowhere**, and strands entry 25 — the
`getSalePricExpirationDateTime` typo, which the authority promotes out of the secondary list into the
numbered set — as a secondary row. Thirty numbered plus eight secondary is **thirty-eight** base
entries, and all thirty-eight are proven one at a time.

The third inventory exists for the same reason. `expect(length).toBe(30)` meant a discovery made
tomorrow could be recorded only by editing the frozen base authority, so the gate discouraged recording
one; the four findings the port made about fixture-facing behaviour — the `isCurrent` /
`getCurrentFlag` disagreement, the `getPromotionCodesDeletableFlag` memo, `hasUniqueOptions` on an
option-less sku, and the sorted-versus-unsorted defensive check — now sit in an inventory that takes a
fifth without either frozen set moving. The numbered set stays closed at thirty so that a number means
one thing forever; discovery stays open. Those are different properties.

The annotated SITES are a larger and open-ended set again — one register entry is often reproduced at
several sites, and each site is annotated where it sits rather than counted here. To take the current
census, derive it:

```bash
grep -roh 'LEGACY-DEFECT \[[^]]*\]' src | sort -u        # the distinct legacy sites annotated
grep -roh 'DELIBERATE DIVERGENCE \[[^]]*\]' src | sort -u # the divergence sites, five of them
```

The second command returns **five** citations, not three, and the difference is not drift. AAP 0.6.7
authorizes three divergence _subjects_, and the third of them — the entity memo defects — spans three
legacy sites across two modules, so the tree annotates every SITE while the plan groups them. `A13b` in
`tests/traceability/legacyTestMap.ts` derives that census from disk and checks it against the authorized
citations and the authorized owner modules, so a fourth divergence cannot enter the tree by annotating
itself: it fails the suite wherever it is written.

`npm run bundle` additionally asserts that both marker kinds survive into every artifact's source map,
so the ledger cannot silently empty out. Every site carries the same two-line marker, and contributors
must use exactly this format:

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

1. **The un-`var`'d `discountAmount` scope leak** becomes function-local. There are **three**
   assignment sites, not two — [`model/service/PromotionService.cfc:L1007`],
   [`:L1009`] and [`:L1014`] — and the third is the one that matters most, because it writes back the
   post-rounding value that the caller then reads. Reproducing shared mutable state that survives
   across warm Lambda invocations could leak one customer's discount into another's order, so this one
   cannot be preserved safely.
2. **The `amountOff` precision gap** [`model/service/PromotionService.cfc:L998`] closes, because all
   arithmetic routes through `Money`. Preserving one branch's float drift would mean deliberately
   bypassing the value object.
3. **The entity memo bugs** (register entries 17, 18 and 19) are fixed, because they are unobservable
   through the public contract — they cause recomputation or a poisoned cache, not a different returned
   value — and the memos become request-scoped regardless.

#### One refusal that is deliberately _not_ counted as a fourth divergence

`src/services/productService.ts` refuses an image path that escapes `product/default/`. That refusal has
no counterpart in the legacy source, which raises the fair question of whether it is a fourth divergence
— so the classification is recorded rather than assumed, because getting it wrong in either direction is
a real error.

It is classified as a **security refusal on an out-of-scope stub path**
[`model/service/ProductService.cfc:L241-L250`], and the reasoning is this: the AAP 0.6.7 budget is a
**defect-register** budget, and each of its three entries repairs a specific numbered register entry
(13, 12, and the 17/18/19 memo group). This refusal repairs no register entry at all, and it sits on a
method the plan places out of scope behind a stub port. Enterprise-standard security applies in the
absence of user rules (AAP 0.8.3), and deleting a path-containment check to satisfy a count would be a
regression dressed as compliance.

So the divergence budget **stays at three**, and this is registered separately in
`tests/traceability/legacyTestMap.ts` under `outOfScopeSecurityRefusals` — with its own gate asserting
that exactly one such refusal exists, that its legacy citation and classification phrase are present at
the site, and that the cited legacy file is real. If the plan owner rules that it _is_ a fourth
divergence, that is an **AAP 0.6.7 amendment**, never a quiet edit to the budget.

### Preserved TODOs stay TODOs — and nothing else becomes one

The return/exchange branch at [`model/service/PromotionService.cfc:L542-L544`] carries a legacy
`TODO [issue #1766]` and does nothing. It is ported verbatim, still does nothing, and keeps its ticket
reference; a regression test named for the ticket documents the gap.

**The rule has a second half that is easy to miss: a TODO in this subtree means a TODO in the source.**
The in-scope slice carries exactly five, measured by sweeping every in-scope `.cfc` and `.cfm` —
[`model/service/PromotionService.cfc:L543`], [`model/dao/ProductDAO.cfc:L64`],
[`model/dao/SkuDAO.cfc:L177`], [`model/service/CurrencyService.cfc:L81`] and
[`model/entity/ProductType.cfc:L93`] — and each is carried forward in the module that owns it. Anything
without such an antecedent is labelled for what it actually is: a `LEGACY-GAP`, an
`EXCLUSION [AAP 0.9.5]`, or a "why it is not repaired" note on a reproduced defect. Inventing a TODO
makes the five that mean something unreadable while announcing work this port never agreed to do.

The Google feed's `g:google_product_category` element is the sharpest example. It is emitted **empty**,
exactly as the legacy template emits it, and it stays flagged — but the legacy line
[`integrationServices/google/views/feed/product.cfm:L20`] is a bare empty element with **no comment on
it or near it**, so it is a preserved GAP rather than a preserved TODO. AAP 0.6.7 describes it as
"carrying a legacy TODO"; the template does not, and the renderer records the discrepancy where the
element is emitted. Completing either the ticket or the category silently is the failure mode this rule
exists to prevent; mislabelling a decision as a deferral is the failure mode its second half prevents.

### Re-verify locators rather than trusting citations

The plan's cited line numbers carry a small drift in places, and the source is the authority. Measured
against this checkout, the `precisionEvaluate` sites are `PromotionService.cfc` L150, L252, L299, L486,
L990, L995, L1001, L1006, L1007 and `PriceGroupService.cfc` L323, L331 — not every one of them matches
the number cited in the plan. When you port a method, open the file and confirm the locator.

### Declarative validation — fifteen present, six absent, none invented

Validation in the legacy application is declarative, sitting in `model/validation/*.json`, and it is
**partial**. That partiality is part of the contract: porting it means reproducing the rules that exist
and **not** authoring rules for the artifacts that have none, because inventing a constraint would
reject input the legacy application accepts.

Counted against this checkout, fifteen of the twenty-one in-scope artifacts have a rule file:

`Product.json`, `Sku.json`, `SkuCurrency.json`, `ProductType.json`, `Brand.json`, `Option.json`,
`OptionGroup.json`, `Promotion.json`, `PromotionCode.json`, `PromotionPeriod.json`,
`PromotionReward.json`, `PriceGroup.json`, `PriceGroupRate.json`, `RoundingRule.json`,
`Product_UpdateSkus.json`

Six have **none**, and no schema is written for them:

`Category`, `PromotionQualifier`, `PromotionApplied`, `PromotionAccount`, `Product_AddOption`,
`Product_AddOptionGroup`

The plan's own scope section enumerates twelve present and six absent; three more present files
(`SkuCurrency`, `OptionGroup`, `RoundingRule`) correspond to the three entities the port adds by
implicit necessity, which is why the measured figure is fifteen. `Product_UpdateSkus.json` is the one
carrying **conditional requiredness** — `showPrice{updatePriceFlag eq 1}` and
`showListPrice{updateListPriceFlag eq 1}` — and the ported `zod` schema reproduces that conditionality
rather than making both fields unconditionally required.

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

`npm test` requires **no database, no `.env` and no environment variable** — the whole suite passes on
a completely empty environment. `vitest.config.ts` sets `watch: false` and the script is `vitest run`,
so there is no interactive mode to fall into. The integration tier asserts SQL text and parameter
binding against a capturing fake executor rather than a live server, and `tests/setup.ts` pins
`process.env.TZ` to UTC before any suite imports a subject so the date-sensitive assertions are
deterministic.

**`TEST_LIVE_DATABASE` gates nothing that exists.** No suite in this repository consults it, and
setting it changes nothing about what any of them proves — the seven repository suites each say so in
their own header. It is a documented escape hatch, so that a suite which one day genuinely needs a
server gates on a declared variable rather than on a connection written into source. `tests/setup.ts`
still normalises it and **refuses an unrecognised value**, because a typo must not silently skip the
suites it was set to enable while the run reports success.

**Two things this tier does not prove, recorded here and in the ledger's `acknowledgedGaps`.** No
assertion has ever been compared against output from a running Lucee or ColdFusion engine — no legacy
runtime was stood up, so parity here means agreement with the source _as read_, plus reimplementation
and execution of specific algorithms where behaviour could not be safely inferred. And no statement is
ever executed against a live MySQL server, so nothing proves a ported statement parses or that a named
`Sw*` column exists; this repository carries no DDL for that schema to check against, because the
legacy application relied on Hibernate to create it. The tier is called "integration" for the seam it
spans between adapter and statement, not for a database it reaches.

The tiers, as they exist on disk. **These counts are derived, not maintained by hand**: `A14` in
`tests/traceability/legacyTestMap.ts` reads each tier off the working tree the way `vitest.config.ts`
collects it, then requires the row below to state the same number. A suite added or deleted without
editing this table fails the run, so the table cannot go stale in silence.

| Tier                             | Files | What it asserts                                                         |
| -------------------------------- | ----- | ----------------------------------------------------------------------- |
| `tests/unit/**`                  | 58    | Behaviour of a single module against hand-written in-memory doubles.    |
| `tests/integration/repositories` | 7     | SQL shape and parameter binding. **No MySQL server is required.**       |
| `tests/traceability`             | 1     | The coverage floor and the parity ledger, derived from the source tree. |

**How the module census partitions, so the numbers can be checked rather than trusted.** `src/**`
holds **89** modules. The ledger declares **64 covered** (each paired with the suite that owns it) and
**25 exempt** (each a type-only module, or a runtime module that names the suite which exercises it),
and the pending register is **empty** — 64 + 25 + 0 = 89. One of the 64 is a declared naming
exception, where the suite name drops the module's `.sql` infix. Every one of those figures is derived
from disk by the traceability suite, which is the authority; the figures here are a convenience.

A written census goes stale most easily in the **shrink** direction — a capability folded into a module
the plan already enumerates leaves the total one too high, and nothing about reading the paragraph
reveals it. `A20` asserts the module count against disk on every run, so trust the gate and read the
paragraph above as commentary.

An empty pending register is a **measurement, not an achievement**: it records that every debt entered
there — the composition root, the five capability entrypoints and the router — has been discharged, and
nothing more. A new runtime module that declares itself in none of the three categories still fails the
gate.

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

The four cases inherited from `meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67` are
`validate_as_save_for_a_new_instance_doesnt_pass`, `simple_representation_exists_and_is_simple`,
`has_primary_id_property_name` and `defaults_are_correct`.

`meta/tests/functional/admin/entity/ProductTest.cfc` is **an empty stub contributing zero coverage.**
It is acknowledged as a gap and never counted as coverage.

**Everything else is net-new**, and the map says so rather than implying parity: 16 of the 18 entity
modules, all 7 services, all 6 repositories, the entire Google adapter, all 8 handler modules — the
composition root, the router, the error mapper and the five capability entrypoints — and every
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

### The verified `roundValue` outputs — ten rows, not nine

`RoundingRuleService.roundValue()` [`model/service/RoundingRuleService.cfc:L88-L175`] is not numeric
rounding: it is decimal-string manipulation that slices a prefix off the string form of an intermediate
value and concatenates the rounding expression's fractional part. It was reproduced and executed rather
than inferred, and these are the pinned outputs.

**Count them: there are ten.** The plan introduces this table as "nine verified results" and then
tabulates ten input/expression/direction/output rows — the tenth being the `0.00` default-expression row
below, which is the single most consequential of the set because it is what an omitted argument does.
The **table is the contract**, and the gate pins every row in it. The discrepancy is recorded here
rather than resolved by dropping a row to match a count, because the row is real and dropping it would
lose the one case a caller is most likely to hit by accident.

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

  > **`EuropeanCentralBankCurrencyConverter` reads like an instance of that exclusion and is not.**
  > `src/handlers/bootstrap.ts` declares a class by that name, so the distinction is worth stating.
  >
  > `convertCurrency()` is **in scope by name** — AAP 0.2.1 admits `model/service/CurrencyService.cfc`
  > for exactly `getCurrencySmartList()` and `convertCurrency()`, because the SKU currency cascade calls
  > them — so the `currencyConverter` port must have an implementation. And the euro pivot is the
  > **legacy service's own mechanism**, not a vendor this port chose:
  > [`model/service/CurrencyService.cfc:L53`] declares `property name="europeanCentralBankRates"`,
  > [`model/service/CurrencyService.cfc:L85`] reads it,
  > [`model/service/CurrencyService.cfc:L100`] pivots with `amountInEUR * cbRates[...]`, and
  > [`model/service/CurrencyService.cfc:L104-L130`] fetches
  > `eurofxref-daily.xml` and caches it daily. Naming the implementation after the rate source the
  > legacy names is faithfulness; renaming it would erase the lineage a diff of the two surfaces needs.
  >
  > The target is **strictly less** of an integration than the source: there is no `fetch`, no HTTP
  > client and no URL anywhere in it. The rate table arrives as configuration and is read once at
  > composition, so the legacy's daily fetch is deliberately not ported. The class also sits in the
  > composition root rather than in a file of its own beside the Google adapter — where it genuinely
  > would read as a peer integration — because AAP 0.3.1 puts implementations with no adapter file of
  > their own there.
  >
  > It does **not** fail closed on an unavailable rate table. `convertCurrency` is a total function: the
  > amount passes through unconverted and the gap is logged for an operator, which is both the legacy
  > behaviour [`model/service/CurrencyService.cfc:L100-L101`] and the AAP 0.4.2 contract. Throwing here
  > would take out the whole SKU cascade rather than one conversion — see the currency-cascade section
  > for that reasoning.

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
[`model/service/ProductService.cfc:L157`], `processProduct_addSubscriptionTerm`
[`model/service/ProductService.cfc:L173`], `processProduct_uploadDefaultImage`
[`model/service/ProductService.cfc:L235`], `loadDataFromFile`
[`model/service/ProductService.cfc:L65`], and the subscription and content-access SKU-creation
branches [`model/service/SkuService.cfc:L139-L202`].

**There is no `CategoryService`, and none is invented.** `Category.cfc` declares
`hb_serviceName="contentService"` **by design**, so category operations are served by the content
service in the legacy application too. The `Category` entity is ported as a read-mostly leaf together
with the narrow ContentService category-access path the in-scope services actually use.

**The Google integration adapter is a stub with respect to calling Google, and complete with respect
to generating the feed.** Both halves are true and the distinction matters: it performs **no live
Google API call and requires no credential**, while the repository, the service and the RSS renderer are
all present and a feed document is genuinely produced.

**The surface is eight methods plus one, not five.** `integrationServices/IntegrationInterface.cfc:L50-L89`
declares five (`init`, `getIntegrationTypes`, `getDisplayName`, `getSettings`, `getEventHandlers`), of
which the legacy Google component implements four and inherits `getEventHandlers` from
`integrationServices/BaseIntegration.cfc:L67-L69`. On top of those, `getAdminNavbarHTML` is a
**non-interface base default** [`BaseIntegration.cfc:L71`], and the component adds two Google-specific
extras of its own — `getIntegratedSettings` and `getSettingOptions`. `src/integrations/google/integration.ts`
therefore publishes **eight** members, and the ninth thing a reviewer should count is the separate
`ProductFeedPort` — the feed contract lives there, not on the integration interface, because the
interface does not carry it.

**The contract mismatch is recorded rather than papered over.** The documented type vocabulary is
`shipping | payment | fw1 | custom` with **no product-feed type**. The legacy component registers as
`"fw1"` [`integrationServices/google/Integration.cfc:L55-L57`] — a _framework_ type describing how FW/1
routed its subsystem, saying nothing about it being a feed — and the port reproduces that identity
verbatim rather than reclassifying it, because the value is part of the frozen contract. The feed logic
sits in a controller, a DAO and a `.cfm` view rather than in the interface implementation, which is
precisely why the target needs a second port beside the interface.

### Request admission — who each entrypoint lets in

The routing layer performs **no** authentication or authorization; it resolves a URL onto a capability
and nothing more. Admission is decided by each capability handler, from claims an **API Gateway
authorizer** has already established. The table below is the whole policy, because a security posture
spread across five files and never summarised is one nobody can review.

`resolveRequestPrincipal` in `src/handlers/errorMapper.ts` reads **only**
`event.requestContext.authorizer` — never a header, never the body, never a query parameter — and
recognises exactly three claims:

- `accountID` (`AUTHORIZER_ACCOUNT_CLAIM`) — the opaque account, trimmed; absent or blank means **not
  identified**.
- `adminAccountFlag` (`AUTHORIZER_ADMIN_CLAIM`) — truthy only for the frozen set `['true', '1']`,
  compared with CFML case-folding. A **general administrative permission**, and deliberately not a
  service identity.
- `serviceScope` (`AUTHORIZER_SERVICE_SCOPE_CLAIM`) — a comma-delimited list of **capability names a
  service principal may drive**, tested only through `principalHasServiceScope`. Absent, blank or
  non-string means **no capability is granted**.

The third claim is separate from the second on purpose. `catalogQuery` uses `adminAccountFlag` to admit
ordinary **human** catalog administrators, so gating `promotionApplication` on that same bit would make
one claim answer two different trust questions and accept every catalog administrator as the
promotion-pricing service. Neither claim implies the other. This subtree still **issues no token, validates no signature and implements
no login**: it trusts the authorizer's output and nothing else.

Each capability decides admission in **two** steps, and only the first is common to all of them:
whether the caller is **identified** (a missing or unusable `accountID` earns **401**), and then
whether the caller is **permitted the operation** (**403**). Both refusals publish the same fixed
sentence and name no claim, no operation and no principal, so an attacker learns which of the two
occurred and nothing else.

| Capability             | Identity required?                                                                                                                                                    | Authorization beyond identity                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalogQuery`         | **Yes** — 401 otherwise.                                                                                                                                              | **Yes — 403 without `adminAccountFlag`, on every one of its fourteen operations.** None of them has a non-administrative legacy antecedent: the five reads are the `admin/` option-editing and catalog-search paths, and the nine mutations are product, product-type and brand writes and a product delete.                                                                                                |
| `skuResolution`        | **Yes** — 401 otherwise.                                                                                                                                              | **No.** Its two operations are the option-to-SKU resolution a storefront legitimately performs, so identity is the whole gate.                                                                                                                                                                                                                                                                              |
| `promotionApplication` | **Yes** — 401 otherwise.                                                                                                                                              | **Yes — 403 unless `serviceScope` names `promotionApplication`.** Every economically decisive member of the request is caller-authored, including the `promotionAppliedID` values that become removal intents, so the route is restricted to a trusted **service** principal — the stand-in for the in-process `OrderService` caller. The general `adminAccountFlag` is deliberately **not** accepted here. |
| `priceResolution`      | **Partly** — refused unless the requested operation is in `ANONYMOUS_PERMITTED_OPERATIONS`, which holds exactly one member: `calculateSkuPriceBasedOnCurrentAccount`. | **No.** All twelve of its operations are reads; the four price-group writes are withheld from the routed surface entirely rather than gated.                                                                                                                                                                                                                                                                |
| `productFeed`          | **No — and it reads no principal at all.** The feed is machine-read by Google Merchant Center.                                                                        | **Origin, not identity.** What governs it is the configured `FEED_ALLOWED_HOSTS` allow-list, which fails closed — see the feed section.                                                                                                                                                                                                                                                                     |

Two readings of that table are worth ruling out explicitly, because both are easy to reach and both are
wrong. An unauthenticated deployment does **not** admit everyone: with no authorizer attached the claim
set is empty, so every row requiring identity refuses every request, which fails closed. And
`adminAccountFlag` is not merely carried for a later consumer to consult: `catalogQueryHandler` refuses
an identified caller without it with a **403**, before the operation selector is read and before any
statement is prepared.

Two consequences worth stating plainly, because both are the deployment's responsibility and neither is
this subtree's to discharge:

- **Attaching an authorizer is a deployment decision that this repository cannot make.** There is no
  infrastructure-as-code here (by design), so nothing in this change set configures one. A deployment
  that routes API Gateway to these handlers **without** an authorizer gets an empty claim set, and every
  "identity required" row above then refuses every request — which fails closed, but is a
  misconfiguration rather than a working state.
- **`adminAccountFlag` is a single boolean, not a role system.** It is enforced where the source puts
  the operation behind `admin/`, which is `catalogQuery` in full, and it is threaded into the
  request scope for consumers that need it. What this subtree does **not** have is per-operation
  permissions, roles or a policy engine: there is one administrative bit, and a capability either
  requires it or does not. Nothing here invents the permission subsystem the legacy `hb_permission`
  attributes hint at, because AAP 0.2.2 excludes the account module that would own it.
- **`serviceScope` is a capability grant, not a role system either, and it is deliberately the narrowest
  mechanism that separates a service principal from an administrator.** It names capabilities, not roles
  or actions; there is no
  hierarchy, no wildcard, no expiry and no policy document, and the only tokens that mean anything are
  the frozen capability names in `src/handlers/router.ts`. It grants exactly one route,
  `promotionApplication`. Populating it is the deployment's authorizer's job, exactly as the other two
  claims are: a deployment that omits it refuses that route and serves the other four unchanged, which
  fails closed.

### Execution-model facts of the target platform

These are properties of Lambda and of the legacy engine. None is a commitment this service makes, and
no figure below is a target of any kind.

- The legacy runtime's **60-second order-placement, 45-second payment-transaction and 30-second DI/1
  first-scan lock timeouts are noted and deliberately not implemented.** The first two sit in
  out-of-scope code paths; the third disappears with DI/1 itself.
- The legacy CFML request timeouts have **no Lambda analogue**: `requesttimeout=3600`
  [`model/service/ProductService.cfc:L65-L68`] and `requesttimeout=360` in the Google feed template ask
  for budgets the platform does not offer. Lambda caps an invocation at 15 minutes, and the
  API Gateway side is **not a single universal figure** — it depends on the API type you put in front
  of the handler, so treat the number below as the shape of the constraint and read the configured
  quota of the integration you actually deploy:

  | API type                       | Integration timeout                                                                                           |
  | ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
  | HTTP API                       | 30 s, configurable from 50 ms, and a hard ceiling                                                             |
  | REST API — Regional or private | 29 s by default, raisable via a Service Quotas increase at the cost of a reduced account-level throttle quota |
  | REST API — edge-optimized      | 29 s, not raisable                                                                                            |

  This subtree pins **none** of those: it authors no infrastructure, declares no API, and therefore
  configures no timeout. A flat "API Gateway at 29 seconds" is the edge-optimized REST figure and is not
  universal, which is why the table above states three. The conclusion does not rest on the exact number
  in any case: the bulk import is out of scope, and the feed generator is in-memory and needs no
  extended budget.

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
7. **One exported runtime unit per file, and no barrel files** — gated mechanically by `A20`; see the
   import-conventions section for why "unit" is a runtime unit rather than a symbol.
8. **In-code annotation of every judgment call and every preserved defect**, using the uniform
   `LEGACY-DEFECT` marker — covering the register of twenty numbered entries plus eight secondary items
   that AAP 0.6.7 enumerates — and, for the three sanctioned exceptions, `DELIBERATE DIVERGENCE`. The
   marker total is reported by `npm run bundle` per artifact rather than written here; a hardcoded
   figure in this position went stale once already.
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

Step 5 is not optional, and it is the one that catches the mistake that matters most. The committed
`slatwall-ts/.gitignore` now stands between a local `.env` and the index as well, but it does not
replace this step: every ignore mechanism is advisory — `git add -f` and an explicit `git add <path>`
both defeat one — so the porcelain check remains the gate and the ignore rules are the safety net.

---

## License

Slatwall is released under the **GNU General Public License v3.0 or later**, copyright ten24, LLC.
This subtree reproduces the business logic of that application rather than merely calling it, so it
is a derived work and the same license applies. `package.json` records it as `GPL-3.0-or-later`.

**How the attribution actually travels, since two different mechanisms are easy to conflate.**
`npm run package` places `NOTICE-GPL.md` at the **root of every archive**, and that — not a bundler
option — is what carries this port's own attribution alongside the code. esbuild's
`legalComments: 'inline'` preserves the legal comments of **third-party** dependencies inside the
artifact; none of this subtree's own source carries a `@license` or `/*!` annotation for it to preserve,
so it contributes nothing to GPL attribution. The two fail differently and independently: dropping the
archive entry would strip this port's attribution, while dropping `legalComments` would strip the
dependencies' notices.

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
