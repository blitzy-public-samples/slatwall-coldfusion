# slatwall-ts — the extracted Slatwall Catalog slice

The **Catalog** business logic of **Slatwall release 3.1.39** (`version.txt:L1` contains exactly that and
nothing else), extracted out of its Hibachi / FW-1 / DI-1 ColdFusion monolith and re-expressed as
idiomatic, strict-mode TypeScript running on AWS Lambda behind a thin routing layer, **continuing to read
and write the existing MySQL `Sw*` schema**.

Two framing facts, because everything below follows from them:

- **This is logic extraction, not a data-model rewrite.** The `Sw*` tables are retained unchanged and
  remain the shared contract between the legacy application and this service. Nothing here creates,
  migrates or reshapes a table.
- **This subtree is self-contained and entirely additive.** Every file in it is new; every legacy file was
  read and cited, never edited. It carries its own manifest, lockfile, compiler, test, lint, format and
  build configuration, which is what makes the deliverable reviewable as a single additive diff. The
  isolation is **static and verified as such**: no legacy file, import path or configuration entry was
  changed (§13.3 enumerates what was left alone, including the root `.gitignore` and `readme.md`), nothing
  in the CFML tree references this directory, and no CFML mapping, ORM path or `<cfinclude>` reaches into
  it. Read that as a property of the diff, which it is, and not as observed runtime equivalence, which was
  never measured — §12.2 records why no CFML runtime can be reproduced here.

**Authority for this file:** AAP §0.3.1, §0.4.1.2 (the package-surface CREATE row) and §0.5.6.2 — "build,
test and package commands; runtime and toolchain versions; the documented scope boundary."

### The artifact trail, indexed

AAP §0.8.5 requires a trail "a skeptical technical reviewer can follow end-to-end". This file is the
project-guide leg of it. Each register below is stated **once**, in the section named: two copies of a
register are two things that can disagree, so a second copy of a fact is treated here as a defect rather
than as redundancy.

| What a reviewer needs to check                                                                                                                                                                | Where it is                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **T1–T5** — the five option-to-SKU semantics that must survive translation, each named as a silent-drift trap, with the translated SQL shape and the bound-parameter order                    | §10.2                          |
| **The validation read-back loop** — the highest-risk item in the slice: a declarative rule that executes a query against rows the same operation is writing, and how `UnitOfWork` resolves it | §10.3, with **M6** and **D19** |
| **The combination engine** — the odometer enumeration whose order determines both the generated SKU set and what uniqueness validation observes                                               | §10.4                          |
| **The three seeded discriminator UUIDs** — fixed data, not test data, reused verbatim in the fixtures                                                                                         | §10.5                          |
| **The 28 preserved public members** — interface parity, method by method, with every tightened signature recorded                                                                             | §10.1                          |
| **D1–D21 plus the D22–D25 aliases** — the full defect register, carried as flagged `TODO(parity)` annotations rather than repaired, plus the **one** declared departure (**D18**)             | §12.4                          |
| **M1–M8 plus the M9 alias** — the execution-model mismatches, flagged rather than silently resolved, each with its source-declared value and locator                                          | §12.5                          |
| **Test provenance** — TRACEABLE versus NET-NEW, in both directions, with the honest ratio leading                                                                                             | §12.1                          |
| **What caps the evidence** — the absent local development setup and the legacy suite that cannot be executed here                                                                             | §12.2                          |
| **Scope** — the thirty in-scope legacy files, the exclusions, and the calculated-property boundary                                                                                            | §9                             |

---

## 1. What this is, and why it is shaped this way

### 1.1 The exercise

This is a **de-risking rehearsal**. The technique being validated is the extraction of business logic from a
ColdFusion monolith into TypeScript on Lambda; it is performed here on a comparable open-source legacy
codebase so that the technique itself can be proved before it is pointed at production code. The value of
the deliverable is therefore not only that it builds — it is that a reviewer can follow every decision back
to the legacy line that forced it.

That is why this file reads the way it does. Every claim about the existing system carries an inline
`path:locator` citation, so any statement can be verified against source without trusting the narrative, and
every uncomfortable finding is stated here rather than deferred: the thin legacy test signal (§12.1), the
absent local development setup and unrunnable legacy suite (§12.2), the twenty-one carried defects (§12.4),
the eight execution-model mismatches (§12.5), and the one deliberate departure from exact behavioural
preservation (§12.4, **D18**).

The index above lists each register and translation decision with the section that owns it.

### 1.2 The business rules were not where a service-oriented reading predicts

This is the finding the whole port is organised around, and it is worth stating before the architecture,
because it explains why the shape of `src/` does not mirror the shape of `model/service/`. The Catalog's
actual rules do not live where a reading of the four named service files would suggest:

- The **option-to-SKU resolution algorithm** lives in a **DAO**, as a hand-assembled HQL string
  (`model/dao/SkuDAO.cfc:L106-L128`).
- The **Google product-feed data shaping** — the entire field-mapping surface — lives in a **ColdFusion view
  template** (`integrationServices/google/views/feed/product.cfm`).
- The **entire implicit CRUD surface of every service** is fabricated at run time by a single
  `onMissingMethod` handler (`org/Hibachi/HibachiService.cfc:L255-L281`), so calls such as
  `optionService.getOption()` and `brandService.newBrand()` resolve without appearing in any source file.

A syntax-level transliteration of the four named services would therefore have produced four thin, nearly
empty TypeScript classes and silently lost the system's behaviour. The relocations are enumerated in §5.2 (TR-2)
and the judgment calls in §10.

---

## 2. Prerequisites and toolchain

Every version below was read back from the installed toolchain and the committed manifest rather than
recalled, and every command in §3 was executed against it in this checkout.

| Item                  | Value                                        | Where it is pinned                                                                    |
| --------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------- |
| Node.js               | **20.20.2** — an exact pin                   | `.nvmrc`                                                                              |
| `engines.node`        | **`>=20.20.2`** — a floor, not a pin         | `package.json` and `package-lock.json` — derivation in §2.1                           |
| npm                   | **10.8.2**                                   | the version shipped with that Node line                                               |
| TypeScript            | **5.9.3**                                    | `devDependencies`, `strict` mode                                                      |
| Target Lambda runtime | `nodejs20.x`                                 | named in prose only — no infrastructure or runtime declaration is authored (see §2.1) |
| MySQL                 | any server holding the existing `Sw*` schema | needed **only to run** the service                                                    |

The running toolchain in this checkout is Node **v20.20.2** with npm **10.8.2**, which matches `.nvmrc`
exactly, so the pin and the machine agree. A newer Node may also install successfully — **do not "correct"
the pins on that basis.** `.nvmrc` stays `20.20.2`, `engines.node` stays `>=20.20.2`, `@types/node` stays
`20.19.43` and `typescript` stays `5.9.3`; these are express instructions, not artifacts of one machine, and
§2.2 explains why the Node pin in particular is deliberate.

Two things are **not** prerequisites, stated so nobody goes looking for them: a database is needed only to
_run_ the service — the build and the whole test suite need none — and **an AWS account is not required for
anything in this document**.

### 2.1 The floor, the pin, and the runtime string that is only prose

**`engines.node` is `>=20.20.2`, and it is a floor. `.nvmrc` is `20.20.2`, and it is a pin.** They presently
name the same version, which makes them easier rather than harder to confuse, so both are stated:

| Artifact       | Value       | What it means                                                       |
| -------------- | ----------- | ------------------------------------------------------------------- |
| `.nvmrc`       | `20.20.2`   | the **exact** version this toolchain was verified against           |
| `engines.node` | `>=20.20.2` | the **lowest** version this project accepts — no upper bound at all |

**Why a patch version rather than a bare `>=20`.** A bare `">=20"` would satisfy an instruction that says
"Node 20.x" while still admitting an install of Node 20.0 through 20.18. AAP §0.5.3.1 derives the graph's own
lower bound by intersecting every declared `engines.node` range: `eslint@10.8.0`'s `^20.19.0` is strictly the
highest lower bound on the 20.x line — above `ts-jest`'s `>=20.0.0`, above `esbuild`'s `>=18`, above
`typescript`'s `>=14.17` — so anything below that hits an `EBADENGINE` warning or an outright lint failure.

**Why the verified patch version rather than the graph's own derived bound, which this section once argued
for.** The derived value is a lower bound on what the dependency graph tolerates; it is not a ceiling on what
the project may require. Every version `>=20.20.2` admits also satisfies `^20.19.0`, so declaring the verified
version states a real constraint rather than inventing one — and it is the version `.nvmrc` already pins, the
version the whole toolchain was validated on, and the floor this project's setup contract names. The figure
appears in exactly four places, all agreeing: `package.json`, `package-lock.json`'s root `packages[""]` entry,
`jest.config.ts`'s derivation note, and the table above — and `test/regression/issues.test.ts` asserts all
four, so they cannot drift apart.

A proposal to lower the floor to the graph-derived `^20.19.0` should answer that reasoning rather than
re-derive the graph bound, which nobody disputes: the derived value is a floor on what the dependency graph
tolerates, not a ceiling on what the project may require.

**On the runtime row, the precise claim is about declarations rather than about the string.**
The identifier `nodejs20.x` appears in this subtree as prose — in the table above, twice in §2.2, in §4.3's
rejected-pin table and in `.env.example`'s lifecycle gate — because AAP §0.5.5 names it and this file
documents it. What does not exist anywhere is a machine-read declaration that **selects** it: no
CloudFormation, SAM, CDK, Terraform or Serverless artifact, and no `Runtime:` key. Infrastructure as code is
out of scope (AAP §0.2.2.5), so the pin is carried by `--target=node20` in `build/esbuild.mjs` — a bundler
flag about which syntax may be left un-transpiled — and by the version statements listed in §2.2.

### 2.2 Runtime lifecycle — a disclosure, not a performance claim

The pinned runtime line is out of upstream support, and this is surfaced rather than quietly retargeted.

- **Two independently sourced facts that coincide on one date** — stated as two, because each is verifiable
  only against the body that owns it, and merging them is what makes the pair unauditable. (1) Node.js 20
  reached upstream end-of-life on **30 April 2026**, per the Node.js Release working group's schedule
  ([github.com/nodejs/Release](https://github.com/nodejs/Release)), whose `20.x` row ends in that date.
  (2) AWS deprecated the Lambda `nodejs20.x` runtime on **30 April 2026**, per the AWS Lambda
  supported-runtimes table. The dates match because AWS aligns managed-runtime deprecation to upstream
  EOL — a consequence of that policy, not one fact counted twice, and not a guarantee that a future
  runtime line repeats the pattern. After the date, AWS stops applying security patches and removes the
  runtime from the Console's creation list, though it remains selectable through the CLI, CloudFormation,
  SAM and CDK.
  <br>Note that **24 March 2026** appears in no column of the `20.x` row; settle any proposed correction by
  reading the schedule rather than by amending this line.
- **The current control-plane gates are a single schedule**, from the AWS runtimes table as read on
  **3 August 2026**: creating a new function on `nodejs20.x` is blocked from **1 February 2027**, and
  updating an existing one from **3 March 2027**. Both are still ahead.
- **Two earlier schedules are superseded, for two different reasons.** **1 June / 1 July 2026**, from the
  first AWS bulletin, has elapsed and observably without effect. **31 August / 30 September 2026**, from the
  standard 30-day/60-day cadence, has **not** elapsed — as of the read date above both dates are still
  ahead, and what retires the pair is AWS's current table stating the later 2027 dates, not the calendar.
  Re-check against the table, and do not read the arrival of 31 August 2026 as confirming or refuting
  anything. AWS states it is delaying these dates for some runtimes in response to customer feedback, that
  it will not begin blocking before the dates in its own tables, and that those dates are forecasts subject
  to change — so **the schedule may be revised in either direction and only the table at the moment of
  reading is authoritative**. This section is the single place these dates live in the subtree, and
  everything else points here. **In every published schedule, functions already deployed continue to be
  invocable**, because every gate is a control-plane gate on creating or updating a function rather than on
  invoking one.
- **The pin stands.** `nodejs20.x` and Node 20.x remain the stated target, because they are an express
  instruction (AAP §0.5.5, verbatim: "The pin stands."). Consistently, AAP §0.5.3.2 rejects a newer
  `@types/node` precisely so the type surface keeps matching the runtime rather than a later one.
- **The blast radius of a later move is six artifacts.** `--target=node20` in `build/esbuild.mjs`; the
  `engines` field together with `.nvmrc`; the `@types/node@20.19.43` pin; `tsconfig.json`'s `target`/`lib`
  pair; the version statements in this file; and **`package-lock.json`**, which pins `@types/node` by
  resolved URL and integrity hash. That last one is easy to miss and is the only one whose omission would
  _silently defeat_ the uplift rather than just leave a stale document: `npm ci` installs from the lock, not
  from the manifest, so editing `package.json` alone leaves the old type definitions resolving while the
  bump appears applied. Because the hexagonal boundary confines all AWS coupling to
  `src/handlers/**`, migrating is mechanical — **no change to `src/domain/**`, `src/services/**`,
  `src/ports/**` or `src/adapters/**`.**
- **A clean `npm audit` is not evidence that this deployment is patched, and the two must not be read as
  one signal.** §12 records `npm audit` reporting 0 vulnerabilities, and that statement is about the
  **dependency tree** only. Runtime CVEs live in the Node binary and the managed runtime, which no package
  advisory covers and no lockfile can fix. Since 30 April 2026 that binary receives no upstream security
  patches, so the accurate reading is _dependencies clean, runtime unmaintained_ — a green audit alongside
  an unpatched interpreter. Authorization to ship must weigh the second fact, not just the first.
- `npm run build` prints a notice on every run recording exactly this, and **deliberately does not fail**: a
  green build means the artifact _packaged_, which is all the acceptance bar asks of it (§3), and is not by
  itself authorisation to ship.

**This is a lifecycle statement only. It is not a performance claim and it is not a service-level
commitment.** No SLA, latency target, throughput figure, availability number or capacity estimate appears
anywhere in this subtree, because the legacy source states none and inventing one is forbidden (IR-12).

---

## 3. Commands, and what "deployable" means

Run every command from **this directory** (`slatwall-ts/`). Each result below is this repository's measured
output in this checkout, not an expectation.

`package.json` declares **exactly the four scripts AAP §0.4.1.2 prescribes** — `build`, `test`, `lint` and
`typecheck` — and no others. The table below therefore has six rows: those four, plus `npm ci`, which is npm's
own install command and **not** a script in this manifest, plus the one verification that is run as a direct
command rather than through a script.

| Command                  | What it runs                                                | Measured result                                |
| ------------------------ | ----------------------------------------------------------- | ---------------------------------------------- |
| `npm ci`                 | install from the lockfile (npm builtin, not a script)       | 399 packages, 0 `EBADENGINE`, 0 audit findings |
| `npm run typecheck`      | `tsc --noEmit`, full strict                                 | **0 errors**                                   |
| `npm run lint`           | `eslint .`                                                  | **0 problems**                                 |
| `npm test`               | `jest --ci --config package.json --preset ./jest.config.ts` | **17 suites, 0 failures** (†)                  |
| `npm run build`          | `node build/esbuild.mjs`                                    | 6 CommonJS artifacts, exit 0 (§6)              |
| `npx prettier --check .` | the formatting gate, as a direct command                    | **all matched files conform**                  |

**The four scripts are exact.** AAP §0.4.1.2 prescribes `build`, `test`, `lint` and `typecheck`, and the
inventory is closed, so `package.json` carries those four and nothing else. No capability is lost by keeping it
that way, because the two obvious extras would each be a one-line wrapper around a binary this subtree already
installs:

- **Formatting** — run `npx prettier --check .` (or `--write` to fix). `.prettierrc.json` is the baseline and
  `.gitignore` doubles as the ignore list, so the direct command checks exactly the files a script would.
- **Coverage** — `jest.config.ts` sets `collectCoverage: true`, so **plain `npm test` already reports
  coverage** and a `--coverage` flag would be redundant with the configuration.

(†) **The suite and failure counts are frozen claims; the case count deliberately is not.** AAP §0.4.1.12 fixes
the number of suites at 17, and "0 failures" is the acceptance bar, so both belong in a document. The number of
executed cases is fixed by nothing and grows whenever a case is added, so it is not stated here: run
`npm test` and read its `Tests:` line. §12.1 states the figure measured at this checkpoint alongside the census
that produced it, and asserts that census against the tree on every run.

`npm ci` rather than `npm install`: the lockfile is committed so resolution is reproducible, and `ci` is the
command that honours it exactly.

`npm run typecheck` must pass **before** a build is trusted — esbuild strips types without checking them, so
the bundle must never be the thing that hides a type error. Nothing in the compiler, lint, format or test
configuration is relaxed to reach those results: `tsconfig.json` keeps `strict`,
`exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`, and `ts-jest` runs that same `tsconfig.json`
with no `diagnostics: false`.

`jest.config.ts` sets `collectCoverage: true`, so plain `npm test` reports coverage as well — which is why no
coverage script is needed in the manifest and why the `--coverage` flag is only ever a way of asking for the
same report explicitly. The configuration declares **no `coverageThreshold`** and no quality gate of any kind
— measured coverage is published, no target is asserted, and none is invented (§12.1 records why: the legacy
structural gate is inert and the legacy suite carries no line or branch instrumentation at all).

Formatting is verified with the direct command `npx prettier --check .` rather than through a manifest script.
`.prettierrc.json` is the baseline and `.gitignore` doubles as its ignore list — Prettier 3 honours
`.gitignore`, so there is no separate `.prettierignore` to keep in sync (see `.gitignore`'s own closing note
for the measurement behind that).

Two notes that save a wasted debugging session:

- **`npm test` carries two flags, and a bare `npx jest` will NOT work.** `jest.config.ts` is a TypeScript
  file, and `jest-config@30.4.2` can only read one natively (Node 22.18+/23.6+, so not on the pinned 20.x
  line) or through `ts-node`/`esbuild-register` — neither of which is among the ten dev dependencies
  §4.2 freezes. `--config package.json` therefore keeps implicit resolution away from the `.ts` file, and
  `--preset ./jest.config.ts` loads it through Node's ordinary CommonJS `require`, which works because the
  file contains no TypeScript-only syntax. To inspect the resolved configuration, pass the same two flags:
  `npx jest --config package.json --preset ./jest.config.ts --showConfig`. The full derivation, including
  why a `jest` key in `package.json` cannot be used instead, is in `jest.config.ts`'s header under **how Jest
  loads this file**.
- **`npx eslint .` must be run from this directory.** Every glob in `eslint.config.mjs` is subtree-relative
  with no `../` segment, so the reference-only CFML tree is never linted.

### The acceptance bar

Infrastructure as code is explicitly out of scope, so the bar is the build step. Verbatim, AAP §0.8.3.10:

> "'Deployable' is satisfied by a successful build/package step producing Lambda-compatible artifacts — live
> deployment execution is not required for this run."

Concretely, two steps satisfy it:

1. A `strict: true` TypeScript configuration with `exactOptionalPropertyTypes` and
   `noUncheckedIndexedAccess`, targeting **ES2022** with **`NodeNext`** module resolution, compiles cleanly
   under `tsc --noEmit`.
2. `esbuild --bundle --platform=node --target=node20 --format=cjs --external:mysql2` produces a CommonJS
   artifact of the shape Lambda loads.

AAP §0.1.2.3 draws the consequence that matters here: "Deployability is therefore an observable property of
the build, not an aspiration — and because it is defined by the build rather than by a deployed endpoint, no
infrastructure definition, account, or runtime credential is required to satisfy it." That is why **no
secrets or environment variables are required for this run** (AAP §0.8.3.9). Configuration is read only
through `src/config/env.ts`, and `.env.example` documents variable **names** with **no value committed**
anywhere.

---

## 4. Dependencies, and the pin rationale that cannot live in `package.json`

**This section exists because JSON permits no comments.** `package-lock.json` and `.prettierrc.json` can
carry no rationale at all, and while `package.json` admits a `"//"` member, the reasoning for the pins
belongs somewhere a reader will actually find it. Refactor Discipline Guideline 6 — document every
technology-specific translation decision — is discharged for those files **here**.

Open with the framing fact: **every dependency in this subtree is net-new, and no legacy dependency maps to
a target dependency.** The legacy application vendors FW/1, DI/1 and Taffy as `.cfc` source rather than
consuming versioned packages, and obtains its database driver from the ColdFusion or Railo server's
datasource configuration. There is no `package.json`, `bower.json`, `requirements.txt`, `pom.xml` or lockfile
of any kind anywhere in the repository outside this subtree. The tables below therefore contain **no
"replaces version X" column, and none is invented.**

### 4.1 Runtime — exactly one

| Package  | Version    | Purpose                                                                                                                                                                                                                                                             |
| -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mysql2` | **3.23.2** | MySQL client with prepared-statement support. **The only package that ships inside the Lambda bundle.** Its `execute()` API is what enforces parameterized binding (TR-4) and what structurally eliminates the importer's injection surface (defect **D18**, §12.4) |

One runtime dependency is a design outcome, not an accident of a small slice. **The AWS SDK is
intentionally absent because the Lambda runtime already provides it**; adding it would inflate the bundle
for no gain. `mysql2` is marked `external` at bundle time, so the emitted artifact stays a thin CommonJS
module with the driver installed alongside it rather than inlined into it.

### 4.2 Development — exactly ten

`typescript` **5.9.3** · `@types/node` **20.19.43** · `@types/aws-lambda` **8.10.162** · `jest` **30.4.2** ·
`ts-jest` **29.4.12** · `@types/jest` **30.0.0** · `esbuild` **0.28.1** · `eslint` **10.8.0** ·
`typescript-eslint` **8.65.0** · `prettier` **3.9.6**.

**Ten packages, and the count is the contract** — it is AAP §0.5.2.2's inventory exactly, with nothing added.
Every one is an exact pin — no range, no `latest`, no placeholder — and every version was read back from the
installed package's own `node_modules/<pkg>/package.json`. `npm ci` installs **399 packages with zero engine
failures, zero peer-dependency conflicts and zero audit findings**, and `npm install --package-lock-only`
leaves the lockfile byte-identical, so resolution is reproducible.

**`ts-node` is deliberately not among them, and `npm test` is shaped around its absence.** Declaring it as an
eleventh package purely so Jest could read `jest.config.ts` would exceed AAP §0.5.2.2's inventory, and
documenting a deviation is not the same as not having one. The loading problem is solved inside the prescribed
ten instead, with the two flags §3 describes, so the manifest carries no pseudo-comment member of any kind.
A bare `npx jest` therefore cannot load this package's configuration — use the `npm test` script.

`@types/aws-lambda` is a **development-only type dependency**: it is erased at compile time and appears in
no artifact, and it is imported only under `src/handlers/**`, which is the one layer permitted to name an
AWS type.

### 4.3 The two deliberately rejected "latest" versions

Both are recorded because in both cases "install the latest" would have been wrong, and a future reader
inspecting the manifest deserves to know the pin was reasoned rather than stale.

| Package       | Latest available | Pinned instead | Why the latest is wrong                                                                                                                                                                       |
| ------------- | ---------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typescript`  | 7.0.2            | **5.9.3**      | TypeScript **5.x strict** is an express constraint; a major-version jump to 7.x would violate it                                                                                              |
| `@types/node` | 26.1.2           | **20.19.43**   | Type definitions must track the **runtime**, which is Node 20.x. A 26.x definition set would type APIs the `nodejs20.x` runtime does not have — turning a compile pass into a false assurance |

### 4.4 No deviations from the plan's dependency inventory

The manifest matches AAP §0.5.2's dependency inventory exactly: **one runtime dependency and ten development
dependencies, all at exact pins**, plus the `>=20.20.2` floor and the four scripts §3 tabulates. There is no
`overrides` block, no `resolutions`, no `workspaces`, no `packageManager` field and no `"//"` pseudo-comment
member, and `test/regression/issues.test.ts` asserts each of those absences.

Two keys a reader might expect are deliberately absent, and the reasoning is recorded so neither is restored
on preference alone:

- **An eleventh dev dependency for Jest configuration loading.** `ts-node` would exist only so Jest could load
  `jest.config.ts`. `npm test` passes `--config package.json --preset ./jest.config.ts` instead, which keeps
  the plan-mandated filename, adds no package, and resolves a configuration measured byte-identical to the
  loader route's (§3, and `jest.config.ts`'s own note on how Jest loads it).
- **An `overrides` block pinning `minimatch` and `test-exclude`.** Such a block would close
  GHSA-mh99-v99m-4gvg / CVE-2026-14257 (unbounded brace expansion) where it is reachable transitively through
  the Jest toolchain — but that condition no longer holds. **Measured on the manifest as it stands: `npm ci`
  completes with 399 packages and `npm audit` reports 0 vulnerabilities**, with `brace-expansion` resolving to
  5.0.9, 2.1.4 and 1.1.18 and no advisory against any of them. That result is scoped to the **dependency
  tree** and says nothing about the Node runtime, which has received no upstream security patches since
  30 April 2026 — see §2.2, where the two signals are deliberately kept apart. An unauthorised manifest key
  that changes no audit result has no justification, and keeping one on preference alone is what Refactor
  Discipline Guideline 4 forbids.

**Stated rather than left to be discovered:** without that block, `test-exclude` resolves to 6.0.0 for the
Babel coverage instrumenter, which adds two npm _deprecation notices_ at install time — `glob@7.2.3` and
`inflight@1.0.6` — alongside the `glob@10.5.0` notice that was already there. Those are npm's generic
messages about old major lines, **not** advisories against this tree: the nested `minimatch` those copies
use resolves to 3.1.5, `npm audit` finds nothing, and every one of them is a development-only transitive
of the coverage instrumenter that appears in **no** emitted artifact (§4.1 — `mysql2` is the only package
that ships). If a future audit does report a finding here, the fix is an upstream release or a fresh,
separately justified remediation.

### 4.5 No mocking library, deliberately

None is installed. The legacy repository contains **no mocking library at all** (AAP §0.6.5.2), and instead
of adopting one, `test/support/` supplies hand-written test doubles against the repository ports. That is
only possible _because_ of the ports, and it is the mechanism behind the structural difference between the
two suites described in §12.1.

---

## 5. Architecture

### 5.1 Layout

```text
src/
 config/ env.ts (the ONLY reader of process.env) · database.ts (the module-scope pool)
 container.ts (the memoized composition root, replacing the DI/1 bean scan) — it also
 holds the three shared tiers (boundaries, statements, reads) and the five per-surface
 compositions each narrow Lambda entry resolves through, AAP §0.3.1 enumerating no
 separate module for any of them (see §6)
 domain/ typed entities, base types and process objects — no framework, no ORM, no AWS
 validation/ Validator.ts plus the seven typed rule sets ported from model/validation/*.json
 ports/ 5 repository ports, the 7 boundary-gap ports AAP §0.2.2.7 enumerates and
 UniquePropertyPort (IR-5) — 13 files; further declarations are folded into
 the ports whose subject they share
 adapters/ mysql/** (parameterized SQL, row mappers, UnitOfWork) · settings/**
 services/ BaseService + ProductService · SkuService · BrandService · OptionService
 handlers/ router.ts, the 4 service handlers, googleFeedHandler.ts, httpResponse.ts
 — the AWS boundary, and the only layer that names an AWS type
 integrations/google/ the stub contract, the feed query and the feed builder
 errors/ util/
test/ 17 suites, mirroring the layers above (§12.1)
build/ esbuild.mjs — the whole build step, and the only file in the directory
```

**69 TypeScript modules under `src/` — 70 files, because the Google adapter's own `README.md` sits among them
— and 17 test suites.** Files and modules are not the same count: `git ls-files slatwall-ts/src` reports **70**,
`git ls-files 'slatwall-ts/src/**/*.ts'` reports **69**, and the difference is exactly that one markdown file.
Both counts are exact rather than approximate. AAP §0.4.1 freezes the file inventory at **102 tracked files**
and AAP §0.4.1.12 freezes the test plan at **17 executable suites plus 2 fixtures and 1 support module** — 20
`.ts` files under `test/` — which is what `git ls-files slatwall-ts` and `npm test -- --listTests` report; §9.5
carries the reproduction commands with their expected output. That frozen inventory is why several concerns
share a module with the approved file whose subject they match, rather than standing as files of their own:
§5.5 maps the production side and §12.1 the suite side, each folded suite body wrapped in one `describe` so its
helpers stay block-scoped and no assertion is altered.

Every intra-subtree import is a **relative path**: there is no
`paths` mapping, no `baseUrl`, no `moduleNameMapper` and no runtime resolver shim, so `tsc` and `esbuild`
resolve identically and no runtime shim is needed. `module` and `moduleResolution` are both `NodeNext`;
esbuild emits CommonJS.

**Configuration flows one way, in three branches rather than one chain**, and **nothing below the config
layer reads the environment directly.** `env.ts` is the sole reader of `process.env`; where each group of
values goes after that differs, and reading it as a single chain would suggest the pool sees values it
never does:

| Values                       | Path out of `env.ts`                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| the nine connection facts    | → `database.ts` → the module-scope `mysql2` pool → adapters                          |
| `GOOGLE_FEED_HOST`           | → `container.ts`, read as `container.config.googleFeed` by the feed handler's wiring |
| the three `SETTING_*` values | → `container.ts` → `StaticSettingResolver`                                           |

Only the first passes through `database.ts`. The feed handler never imports `env.ts` — the container hands
it the validated host — which is precisely what lets it be constructed in a test with no environment set.

### 5.2 What replaced what

| Legacy mechanism                                                                           | Replaced by                                                                        |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| DI/1 0.4.2 runtime bean scan (`org/Hibachi/DI1/ioc.cfc:L546`) + `property name=` injection | typed **constructor parameters**, wired once in `src/config/container.ts` (**R1**) |
| `getService("name")` dynamic string lookup                                                 | typed imports resolved at compile time (**R2**)                                    |
| `super.save()` template-method inheritance                                                 | composition against an injected `BaseService` (**R3**)                             |
| `onMissingMethod` prefix dispatch (`org/Hibachi/HibachiService.cfc:L255-L281`)             | explicitly declared, typed methods                                                 |
| `ormExecuteQuery(hql, params)`                                                             | `pool.execute(sql, params)` with binding order preserved one-for-one (**R4**)      |
| Hibernate hydration from CFC property metadata                                             | explicit typed row mappers in `src/adapters/mysql/rowMappers.ts`                   |
| `HibachiSmartList` dynamic paginated HQL                                                   | `SmartListQueryBuilder` behind `SmartListQueryPort`                                |
| the implicit request-end commit gated on `getORMHasErrors()`                               | an explicit `UnitOfWork`, scoped per invocation                                    |
| `HibachiValidationService` interpreting JSON at run time                                   | seven typed rule sets evaluated by `Validator.ts`                                  |

Four details in that table are easy to get wrong, so each is called out:

- **Four declared injections are deliberately not wired**, because call-site scans prove zero uses:
  `productTypeDAO` (`model/service/ProductService.cfc:L54`), `contentService`
  (`model/service/ProductService.cfc:L57`), `productService` (`model/service/SkuService.cfc:L54`) and
  `productService` (`model/service/OptionService.cfc:L53`). Dropping the third also removes the
  `ProductService` ↔ `SkuService` injection cycle at no cost — and it is why the graph in
  `src/config/container.ts` is acyclic with no lazy getter or deferred field anywhere, since those are
  exactly the devices that would hide a cycle from review.
- **One genuine dependency is invisible to metadata analysis.** `getService("imageService")` inside
  `model/service/SkuService.cfc` is **never declared as a property**, so any dependency analysis built from
  component metadata misses it entirely — and a port built from that analysis would compile and then fail at
  the first image operation. It becomes `ImagePathPort`.
- **`super.save()` does not resolve where it appears to.** `BrandService`'s call at
  `model/service/BrandService.cfc:L76` resolves to the **local** override at
  `model/service/HibachiService.cfc:L86` — Slatwall code — not to the `org/Hibachi/` framework base
  . `BaseService.ts` ports the local behaviour.
- **`?` placeholders bind values only** and cannot substitute identifiers, so where the legacy composed an
  identifier or a placeholder list — `SkuDAO`'s dialect-branching sorted-SKU query, `OptionDAO`'s dynamic
  `NOT IN` list — the port builds it from a **validated whitelist** and generates the right number of
  placeholders, never by interpolation.

**Eleven synthesized members are declared explicitly**, because they exist in the legacy only through
`onMissingMethod` and appear in no source file: `OptionService.getOption`, `.getOptionGroup`,
`.getOptionSmartList`, `.getOptionGroupSmartList`; `SkuService.newSku`; `ProductService.newProduct`,
`.getProduct`, `.getProductType`; and `BrandService.newBrand`, `.getBrand`, `.deleteBrand`. Synthesis is
**not** reproduced wholesale — the unused `count*`, `list*` and `export*` prefixes are simply absent, because
nothing in the slice calls them. Two further synthesized calls, `contentService.getContent` and
`subscriptionService.getSubscriptionTerm`, cross the scope boundary and resolve to ports instead (§5.3).

Dependency injection is **explicit constructor injection only**. There is no service locator, no name-keyed
lookup and no dynamic method synthesis anywhere in the subtree: no `Proxy`, no `eval`, no `new Function`, no
decorator and no DI container library.

### 5.3 The boundary ports

Where an in-scope member genuinely needs an excluded collaborator, a **typed port** is declared, the member
stays on the interface, and the gap is **flagged rather than filled** . Reaching an unwired port
answers **501** rather than fabricating a value — substituting a plausible answer for a flag that gates a
delete is exactly the silent divergence this design refuses.

| Port                       | Why it exists                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SettingResolverPort`      | resolves the eighteen configuration keys the slice reads through `HibachiEntity.setting()` (`model/entity/HibachiEntity.cfc:L129`), including the interpolated `productImage<size>Width` / `productImage<size>Height` form. Declared **synchronous**, so no caller depends on background completion (**M8**)                                                           |
| `ImagePathPort`            | image path, resized path and existence flag (`model/entity/Sku.cfc:L145, L192, L221`) — the hidden `imageService` dependency of §5.2                                                                                                                                                                                                                                   |
| `SubscriptionTermPort`     | subscription-term resolution for the `subscription` branch of `createSkus`                                                                                                                                                                                                                                                                                             |
| `AccessContentPort`        | content resolution for the `contentAccess` branch of `createSkus`                                                                                                                                                                                                                                                                                                      |
| `PricingPort`              | the price reads retained members need — notably the feed's conditional sale-price fields                                                                                                                                                                                                                                                                               |
| `AccountContextPort`       | current-account context, replacing the request-scoped Hibachi scope lookup                                                                                                                                                                                                                                                                                             |
| `SmartListQueryPort`       | the filter, join, range, ordering and pagination surface the SmartList members and the feed controller depend on                                                                                                                                                                                                                                                       |
| `UniquePropertyPort`       | application-side uniqueness checking, reproducing `org/Hibachi/HibachiDAO.cfc:L130-L146` — required _in addition_ to the database's own unique columns, because the legacy enforces it with an HQL existence query during validation                                                                                                                                   |
| `TransactionalWriteRunner` | the Unit-of-Work boundary as a **declaration**, so a handler can reach a transaction without importing from `adapters/**`. The pattern is named at AAP §0.3.3. **It is a contract, not a ninth port, and it has no file of its own** — it is declared inside `src/ports/UniquePropertyPort.ts` and re-exported from `src/config/container.ts`; see the paragraph below |

The eight rows above `TransactionalWriteRunner` each occupy a file of their own under `src/ports/`, and they
come from **two** AAP provisions rather than one — a distinction worth stating, because getting it wrong makes
§0.2.2.7 look like it enumerates eight:

- **Seven boundary-gap ports** are the ones AAP §0.2.2.7 tabulates by name: `SettingResolverPort`,
  `ImagePathPort`, `SubscriptionTermPort`, `AccessContentPort`, `PricingPort`, `AccountContextPort` and
  `SmartListQueryPort`. Each exists because an in-scope member depends on a collaborator the AAP excludes.
- **`UniquePropertyPort` is the eighth file and is not one of them.** It comes from **IR-5**, and AAP §0.4.1.6
  lists it separately: application-side uniqueness checking reproducing `org/Hibachi/HibachiDAO.cfc:L130-L146`.
  It stands for a facility the retired framework provided rather than for an excluded domain.

The ninth row is a **transaction contract**, and that distinction matters too: a _port_ stands for a
collaborator this subtree may not implement, whereas the write runner stands for a boundary this subtree owns
outright.

**A tenth declaration exists and is deliberately not in that table.** `PopulationAuthorizationPort` is
declared inside `src/ports/AccountContextPort.ts` — not in a file of its own — and is consumed by
`src/domain/base/populate.ts`. It guards mass assignment during population rather than standing for an
excluded collaborator, so it is not one of §0.2.2.7's boundary gaps, and it shares a module with the port whose
subject it matches: the request's own principal.

**Where it is declared, stated once.** A file of its own would put a production file outside AAP §0.4.1's
frozen inventory and make every built handler depend transitively on unplanned code, so the contract lives in
`src/ports/UniquePropertyPort.ts` instead, whose own subject — the
uniqueness probe that runs **inside** a save — is what a transaction most often encloses (§5.5). That port
holds the single declaration and the whole of its lifecycle and disposal contract.
`src/config/container.ts` **re-exports** it under the same name so the write graphs it parameterises can be
read beside it, and so no consumer import had to move.

**Keep it to one declaration.** TypeScript is structurally typed, so a second `export interface
TransactionalWriteRunner<TGraph>` of the same shape compiles silently: handlers would import one copy and
`src/adapters/mysql/UnitOfWork.ts` the other, and the two doc blocks would drift with nothing failing. The
declaration in `src/ports/UniquePropertyPort.ts` is the only one; `container.ts` re-exports it rather than
restating it.

**This is what makes the subtree independent.** Every dependency reaching outside the catalog slice
terminates at a declared port rather than at an unconverted module, so `slatwall-ts/` builds, tests and
packages with no reference to unconverted code — the strangler-fig property the exercise requires. And
**every production file the six build entry points reach is an AAP-listed file** — verified by walking the
import graph from each entry, not asserted (§9.5).

`ImagePathPort` is the one a reader meets first, and following it through explains the feed exactly.
`model/entity/Image.cfc` is not an in-scope entity, so no image path can be read and the port is wired to a
not-implemented adapter. The legacy view emits `g:image_link` **unconditionally** for every SKU
(`integrationServices/google/views/feed/product.cfm:L23`), so the feed reaches that port as soon as it has
one SKU to render, and answers `501`. A product whose sale price must be consulted reaches `PricingPort` the
same way. With no qualifying SKU the feed consults neither and renders an empty channel instead. Supply the
two through `createCatalogContainer({ imagePaths, pricing })` and the same request answers `200` with RSS.

### 5.4 Two invariants worth knowing up front

- **Primary keys are 32-character lowercase hex UUID strings generated in application code** — no dashes,
  no auto-increment, and not dashed RFC 4122 — reproducing `createSlatwallUUID()` from
  `model/dao/HibachiDAO.cfc` .
- **Memoisation is request-scoped, never module-scope**, apart from the connection pool and the service
  graph itself. `beginInvocation()` runs before every route on every invocation — on the aggregate graph
  and on each per-surface graph alike — so a warm container cannot carry one request's state into the next
  (**M7**). There is exactly one request-scoped cell in the slice, the option-group sort-order memo that
  `MySqlSkuRepository` takes as a constructor parameter; the brand, option and feed surfaces reach no SKU
  repository, so their `beginInvocation` has nothing to discard, and each says so at its declaration rather
  than leaving the empty body to be read as an omission.

### 5.5 Concerns that share a module, and why

AAP §0.4.1 freezes the file inventory, so a concern that would be a natural module of its own lives inside the
approved file whose subject it shares. The table is the map: nothing here is a path in this subtree, and each
row explains why the two subjects belong together. Nothing is thinned and no declaration is merged away.

| Approved module                            | Also holds                                                                                           | Why together                                                                                                                                                                                        |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config/container.ts`                      | three configuration tiers (boundaries, statements, reads) and the five `compose*Surface` graphs (§6) | all eight exist only to wire collaborators the composition root already wires                                                                                                                       |
| `ports/SmartListQueryPort.ts`              | the bounded-read window types, `translateSmartListInput`, and the SKU smart-list query composer      | each bounds, feeds or composes one paginated dynamic query, which is the module's whole subject; three services already call the translator on their way into this port, so no import edge is added |
| `ports/UniquePropertyPort.ts`              | the transactional-write port                                                                         | the uniqueness probe that runs **inside** a save is what a transaction most often encloses (§5.3)                                                                                                   |
| `adapters/mysql/QueryRunner.ts`            | the catalog aggregate loaders                                                                        | the runtime edge is `QueryRunner → rowMappers`, so hosting the loaders in `rowMappers.ts` would create a genuine adapter-layer cycle                                                                |
| `adapters/mysql/MySqlProductRepository.ts` | the product write half                                                                               | the read and the write half of the same table                                                                                                                                                       |
| `adapters/mysql/UnitOfWork.ts`             | the transactional write runner                                                                       | the runner is the boundary `UnitOfWork` opens                                                                                                                                                       |
| `src/util/urlTitle.ts`                     | the URL-title probe ceiling, as the **required fourth argument** of `createUniqueURLTitle` (§8.1)    | the ceiling bounds the probe loop declared in the same function, so it needs no separate declaration at all                                                                                         |

**The product read and write halves keep two constant sets, and that is deliberate.** Each declares eight
identically-named table and column constants, and the two sets **do not mean the same thing**: the read half
spells tables in the ORM **class** vocabulary (`assertTableName('SlatwallProduct')`) and the write half in the
**physical** vocabulary (`assertTableName('SwProduct')`). That is the same intra-file vocabulary divergence
§12.4 carries by its locators — `model/dao/SkuDAO.cfc:L132` and `:L135` against `:L179-L211` — and the port
preserves it, so the write-side copies are prefixed `PERSISTED_` and both readings survive.

A value-import cycle scan over all of `src/**` reports **zero cycles**.

---

## 6. Build output

`npm run build` runs `node build/esbuild.mjs`, whose emitted invocation is exactly

```text
esbuild --bundle --platform=node --target=node20 --format=cjs --external:mysql2
```

and which writes **one CommonJS artifact per declared Lambda entry point**:

```text
dist/handlers/router.js the aggregate surface — all 34 addresses
dist/handlers/productHandler.js the 18 product addresses
dist/handlers/skuHandler.js the 9 SKU addresses
dist/handlers/brandHandler.js the 3 brand addresses
dist/handlers/optionHandler.js the 3 option addresses
dist/handlers/googleFeedHandler.js the single feed address
dist/package.json the production manifest — one runtime dependency
dist/node_modules/ the runtime dependency closure — 11 packages
build-meta/sourcemaps/handlers/*.map the six source maps, deliberately outside the package
```

`dist/` is therefore a **complete, self-resolving package** rather than six loose files. The size bullet below
is the one place figures for it are stated; measure with `du -sb dist` immediately after `npm run build`.

Properties worth knowing, each measured rather than assumed:

- **Every artifact exports an invocable `handler`** — all six, measured by requiring each emitted file.
  `router.js` is the aggregate surface and the natural single-function deployment; each per-service artifact
  serves only its own addresses and answers `404` for any other, so a deployment may instead give each surface
  its own function. Nothing else lands in `dist/` beyond the six artifacts, the production manifest and the
  dependency closure — no chunk, no map, no build report — and that is **asserted** by the pipeline rather than
  merely intended.
- **The five gated artifacts also export the authorisation registration seam — the registrar, and _only_ the
  registrar** — because a bundle is the only file a deployment holds and the seam has to be callable on it.
  Verified by requiring each emitted file: `router.js` publishes three names, `registerRequestAuthorizationResolver`
  alongside `createRouter` and `handler`, and each per-surface bundle publishes it alongside its own factories.
  `clearRequestAuthorizationResolver` is deliberately **absent from all six bundles** —
  a `clear` followed by a `register` would re-point a live gate, which is precisely what the one-registration
  contract exists to prevent; it stays a test-only export of `src/handlers/httpResponse.ts`, which is not a build
  entry point. `googleFeedHandler.js` publishes neither name, since its one address is anonymous. §7.2 states
  the registration contract the seam has to satisfy.
- **The six entry points are a frozen literal list**, not a directory scan. A declared entry that is missing
  fails the build with a non-zero exit naming the path, and a non-test module appearing in `src/handlers/`
  that is neither a declared entry nor the acknowledged `httpResponse.ts` helper fails it too — so the
  artifact set cannot drift in either direction without a reviewer seeing it.
- **The pipeline is eight named steps, in one order, printed as it runs**: `purge`, `assert-entry-surface`,
  `emit`, `relocate-sourcemaps`, `write-manifest`, `stage-dependencies`, `assert-require-closure`, `promote`.
  No step is conditional, skippable, retried or selected by a flag, a switch or an environment variable — a
  build performs all eight or fails. The names are the literal `name` fields of the step list in
  `build/esbuild.mjs`, so this sentence can be checked against the source it describes.
- **A failed build leaves `dist/` absent, and the guarantee is structural rather than procedural.** Every
  artifact is assembled in `build-meta/package-staging/`, and `dist/` is created by exactly **one** operation
  — a single `rename` of that staging directory, performed only after all eight steps have succeeded. A
  failure at any step, before or after the emit, therefore leaves `dist/` **absent** rather than stale or
  partial, and it does so because no code path can populate `dist/` any other way. The `purge` step
  additionally removes the previous `dist/`, the previous staging tree and each owned source map on the way
  in, and it attempts every path even when one of them fails so that a single unremovable path cannot strand
  the rest; but the invariant does not depend on that step running. Absence is the intended signal — a
  packaging step that finds no `dist/` stops, where one that finds a stale `dist/` would ship the wrong code.

State that mechanism in one place only. The paragraph above is the whole of it: `purge` uses recursive
removal on the previous `dist/` and the previous staging tree and non-recursive removal on each enumerated
owned map, and `promote` renames staging onto `dist/` once. Descriptions of a second rename, of a cleanup
handler that removes `dist/` on the failure path, or of removals enumerated from the entry list rather than
recursive, do not describe this script.

Staging rather than emitting straight into `dist/` is what makes the guarantee hold on both sides of the
emit. Purging owned outputs before the bundler would protect only the pre-emit half: a build whose emit
succeeded and whose **post-emit** step then failed would exit non-zero while six apparently deployable bundles
sat in `dist/`. Measured under the current arrangement — with a green build in place, a build forced to fail
immediately after the emit leaves no `dist/` at all.

The recursive removals the design needs are confined to two generated, git-ignored trees — `dist` and
`build-meta/package-staging` — each computed from the script's own location, each a fixed literal segment
with no glob and no value read from input. The script's own tracked `build/` directory is deliberately not
among them, which is why the generated directory is named `build-meta/`.

Two consequences were measured in this checkout rather than assumed:

- **A stale or legacy artifact cannot survive a build.** Because the unit of replacement is the tree, an
  artifact the build script has never heard of disappears without the script having to know its name.
  Seeded `dist/metafile.json`, `dist/handlers/oldEntryHandler.js` and a matching stale map **beside it in
  `dist/`**, then ran `npm run build`: all three were gone and `dist/` held exactly the six bundles, the
  production manifest and the staged dependency closure. The location matters to the reproduction, which is
  why it is stated: `dist/` is replaced as a tree, so anything inside it goes whatever its name, whereas
  under `build-meta/sourcemaps/` only the six **owned** maps are enumerated for removal — an unowned file
  left there survives, harmlessly, because no source map is ever part of the published package.
- **Consecutive builds are byte-identical.** Two runs, `sha256sum` over all **thirteen** emitted output
  files — the six bundles, the production manifest and the six source maps — report no difference. Thirteen
  is the whole emitted set and the arithmetic is `6 + 1 + 6`; the staged `dist/node_modules` closure is
  excluded from the figure because it is a **copied** third-party tree rather than something this build
  emits. The build reads no environment variable, opens no connection and needs no credential.

- **The package resolves its own external, and the build proves it before promoting.** `mysql2` stays
  external — the artifacts `require("mysql2/promise")` rather than inlining the driver — so the build now
  writes a production manifest beside them and stages the driver's **transitive** closure into
  `dist/node_modules/`: `mysql2`, `aws-ssl-profiles`, `denque`, `generate-function`, `iconv-lite`,
  `is-property`, `long`, `lru.min`, `named-placeholders`, `safer-buffer` and `sql-escaper`. The manifest is
  derived field by field from this subtree's `package.json`, carrying `name`, `version`, `type`, `engines`
  and `dependencies` and omitting `scripts`, `devDependencies` and `overrides`, so the packaged pin can
  never drift from the resolved one.

The final step before promotion is a **require-closure check against the package itself**: each emitted
artifact's text is scanned for bare `require()` specifiers, each is resolved with Node's own resolver
rooted at the staged artifact, and the resolved file is required to lie **inside** `dist/node_modules`.
Resolution alone would prove nothing — `require` walks upward, so `mysql2/promise` resolves to the
development tree whether or not anything was staged — which is why containment is the assertion. Measured:
running the pipeline with the staging step omitted fails with `requires "mysql2/promise", which resolves
OUTSIDE the package`. Each staged package's own declared dependencies are checked for presence too, so a
closure one level short fails here rather than at a deployment's cold start.

A deployment that prefers a **Lambda layer** may use one instead: a layer contributing the same closure
and `node_modules/` inside the package are alternative placements of an identical tree, and the manifest
states what that tree is either way. No layer is authored here, because a layer is an infrastructure
artifact and infrastructure as code is out of scope.

- **Source maps are emitted beside `dist/`, not into it** (`build-meta/`, git-ignored), so the packaged tree
  carries only what the runtime loads and its deployable closure. `sourcemap: 'external'` writes no
  `sourceMappingURL` comment, so relocating a map leaves no dangling reference.
- **`mysql2` is the only external**, appearing as `require("mysql2/promise")` in all six artifacts. No
  `node_modules` code is inlined into a bundle; it is staged beside the bundles instead. The AWS SDK is
  absent from the dependency graph entirely because the runtime already provides it, so it appears neither
  in a bundle nor in the package.
- **Configuration is validated at two different moments, on purpose, and the mechanism is the same graph
  either way.** All six entries reach `src/config/container.ts` — measured, not assumed — but they reach it
  differently. `router.ts`, which serves all thirty-four addresses, takes a **static value import** of
  `getCatalogContainer`, so `router.js` resolves the graph at module load: requiring it with a missing or
  malformed variable throws immediately and names the variable, and a misconfigured deployment of the primary
  entry fails its cold start rather than answering requests it cannot serve. The five per-surface entries take
  only `import type` and resolve their own narrow graph through a **deferred CommonJS
  `require('../config/container')`** inside the first invocation, calling `getBrandSurfaceGraph`,
  `getOptionSurfaceGraph`, `getSkuSurfaceGraph`, `getProductSurfaceGraph` or `getFeedSurfaceGraph` — each
  memoizing one narrow graph built by the same `compose*Surface` function the aggregate root calls, so a narrow
  artifact and the router cannot disagree about how a service is assembled. Each can therefore be required with
  an empty environment, and a misconfiguration surfaces per invocation as
  `500 {"message":"The service is not correctly configured"}`, classified rather than opaque, with the
  offending variable kept out of the response entirely. `test/regression/issues.test.ts` asserts the
  consequence: importing an entry constructs no container and reads no environment.
  <br>It has to be a deferred `require` and not `await import('../config/container.js')`: TypeScript's
  `NodeNext` emit preserves a native `import()` in CommonJS output, and Node's ESM resolver then demands an
  on-disk `.js` that only an emit produces — so the sources would answer `500` for every action while the
  artifact answered correctly.

`src/config/` holds exactly `container.ts`, `database.ts` and `env.ts`; the per-surface compositions live
inside the composition root (§5.5). One consequence is worth naming: with every entry reaching one root, the
bundler has nothing to drop from a narrow artifact, which is why the six sizes below are within a few percent
of one another. `CatalogContainer` declares **35 members** — every collaborator the slice has, plus the two
configuration sections and the anonymous materialisation guard.

- **Size, stated as measurement only, and to one decimal place because it moves.** Measured in this checkout
  immediately after `npm run build`: the six artifacts run from `googleFeedHandler.js` at the low end to
  `router.js` at the high end, all within a few percent of one another, and total about **5.0 MB**. The whole
  published package is about **6.5 MB** (`du -sb dist`), which is those six plus the staged `mysql2` closure
  under `dist/node_modules` (1,480,323 bytes — a fixed figure, since it is the driver's own tree) and the
  generated `dist/package.json`. The six source maps live **outside** `dist/`, under
  `build-meta/sourcemaps/`, and total about **12.6 MB** — a ratio of about **2.5×** the code they describe,
  which is why they are not shipped. **Re-measure after any change**: `minify` and `legalComments` are
  deliberately unexercised, so an artifact carries the comments its sources carry and the bundle figures move
  when those do.

Code splitting is deliberately off — it could hoist or duplicate `src/config/database.ts`, and duplicating
that module duplicates the connection pool. `minify` and `legalComments` are available levers, deliberately
unexercised so each artifact keeps the reasoning its source records. **No size budget is asserted here or
anywhere else in the subtree** (IR-12): these are measurements, and nothing compares an artifact against a
number.

**`import(` appears five times in `src/**`, and every one is a type query rather than a dynamic
import** — the distinction is worth naming because a text search finds them and the two look
alike. Each of the five per-surface handlers writes `typeof import('../config/container')` to name the
module's type without importing its value; the specifier is a fixed literal, the expression is erased at
compile time, and none of the five survives into any emitted artifact. The **value** side of that same
module is reached at run time through a deferred `require`, which is what §6's first bullet describes. There
is **no runtime dynamic `import()` anywhere in the subtree** — `grep` for `await import(` in `src/**`
returns nothing outside commentary.

- **Class identity is per artifact, which matters only to tooling.** Because each artifact embeds its own
  copy of the graph, the error taxonomy in `src/errors/` is a different set of classes in each one, and
  `errorResponse` classifies by `instanceof`. Measured with two artifacts in one process and one genuine
  `DataIntegrityError` raised inside `googleFeedHandler.js`: its own artifact answers
  `500 "The request could not be completed from the stored data"`, while `optionHandler.js` answers
  `500 "An unexpected error occurred"` for the same object. Both are safe and neither leaks detail, and no
  production path crosses artifacts — a function loads exactly one. The rule it implies is for test and
  tooling wiring only: never load two `dist/` artifacts into one process and then assert on error
  classification across them.

There is no infrastructure definition, no deployment automation and no CI pipeline in this subtree, by
instruction — and none anywhere in the repository to update either (§13.3).

---

## 7. Invoking it

The service is **headless**: Lambda handlers returning data. There is no HTTP server in this subtree, no
user interface, and no `npm start`.

Routes are addressed by the legacy `slatAction` query-string key. `slatAction` is not FW/1's default
parameter name — FW/1 ships `'action'` (`org/Hibachi/FW1/framework.cfc:L1778`) and Slatwall overrides it at
`config/configFramework.cfm:L2` — and the one catalog-adjacent address attested anywhere in the legacy tree
keeps its exact spelling, subsystem colon and all:

```text
?slatAction=google:feed.product integrationServices/google/views/main/default.cfm:L50
```

The four catalog surfaces had no legacy action of their own — their callers were the excluded `admin:` and
`public:` controllers — so their addresses reuse the same `section.item` vocabulary with the item being the
**exact preserved member name**: `product.saveProduct` is `ProductService.saveProduct`, which is what makes
the interface parity of §10.1 readable straight off the route table. **34 addresses in total**: 15 declared
`product.*` members plus 3 synthesized ones, 9 SKU, 3 brand, 3 option, and the one legacy-attested feed
action. The table is a closed literal union, so a route that is not declared cannot be reached, and a
declared route that mounts nothing fails to compile.

**Action matching is case-insensitive, exactly as FW/1's was.** `?slatAction=Google:Feed.Product` reaches
the feed, and so does `google:feed.product`; the legacy lower-cased the action before validating it
(`org/Hibachi/FW1/framework.cfc:L1957-L1961`, with `noLowerCase` initialised to `false` at `:L1876-L1877`
and never set by `config/configFramework.cfm`), so preserving the tolerance is behaviour preservation rather
than leniency. The mechanism is one frozen, null-prototype map from each **declared** key's lower-cased form
to the key itself, built once per dispatcher and consulted before the membership test — so the **reachable
set is unchanged at exactly those 34 addresses**, the declared keys still spell the member names in their
canonical casing, and two keys differing only in case would fail at construction rather than one of them
silently winning. Nothing is guessed, retried or prefix-matched. Dropping the case tolerance would be a parity
regression, since the legacy resolution is case-insensitive, so `test/regression/issues.test.ts` pins all of it
— canonical, lower, upper and mixed spellings, the unchanged reachable set, and the prototype-member cases.

**Three things have to be right for that snippet to run**, and every one of them is easy to get wrong, so
they are spelled out.

**First, the environment that lets the module load.** `dist/handlers/router.js` resolves the service graph
when the module loads, so `require` itself throws if a required variable is missing — that is the deliberate
fail-fast described below, not a defect. Export the six required names first (§8 is the full contract;
`DB_TLS_MODE` is optional and is shown here only because a loopback host is the one case that may lower the
transport mode):

```sh
export DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=<YOUR_DB_NAME>
export DB_USER=<YOUR_DB_USER> DB_PASSWORD=<YOUR_DB_PASSWORD>
export DB_TLS_MODE=disabled GOOGLE_FEED_HOST=catalog.example.test
```

**The three angle-bracketed names are placeholders and must be replaced; nothing in this repository supplies a
value for them.** A working `DB_USER` / `DB_PASSWORD` pair here would be a committed credential (CWE-798) — a
plausible-looking secret published in documentation, which is where a copied value survives longest — so the
pair is absent rather than obfuscated: a reader who copies a real-looking value is likelier to keep it than a
reader who copies `<YOUR_DB_PASSWORD>` and is forced to think.

**Where a local value comes from instead.** The database credentials are whatever the operator's own MySQL
instance was created with; this deliverable provisions no database, seeds no user and ships no default. The
same rule holds in `.env.example`, whose `DB_PASSWORD=` line is deliberately left with an empty right-hand
side.

**A blank value is not uniformly refused, and the distinction matters here because this is the one place it
cuts the other way.** `DB_USER` and `DB_PASSWORD` are the two variables that may legitimately stay empty:
they must be _present_, but the empty string is accepted, which reproduces the legacy `""` at
`org/Hibachi/Hibachi.cfc:L12-L13` exactly. Blank `DB_HOST`, `DB_PORT`, `DB_NAME` and `GOOGLE_FEED_HOST` are
each refused at load with a `ConfigurationError` naming the variable. So the template still cannot be used
unedited — but the reason is those four, not the credential pair. The §8 table and `.env.example` both state
the same split, and all three now agree. No secret, credential or token is required to `build`, `test`,
`lint` or `typecheck`, nor to the direct `npx prettier --check .` and `npx jest … --coverage` commands of §3:
every one of them runs with an empty environment, which is why the verification in §3 needs none.

**Second, the resource bounds that let a route actually serve.** The six names above get the module
_loaded_; they do not get a request _answered_. Every route applies at least one of §8.1's resource bounds,
none of which has a default of any kind, and a route whose bound is unstated **refuses fail-closed** — so a
walkthrough that exports only the six required names reaches the feed and receives
`500 {"message":"The service is not correctly configured"}` rather than either outcome described below. The
feed address in the snippet applies **four** figures, and it checks them before it composes a query or
resolves an image path:

```sh
export CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY=500     # every route — all reads go through the smart list
export CATALOG_SMART_LIST_MAX_PREDICATES_PER_QUERY=100  # every route — statement complexity
export CATALOG_GOOGLE_FEED_MAX_IMAGES_PER_RECORD=10     # google:feed.product
export CATALOG_GOOGLE_FEED_MAX_RESPONSE_BYTES=10485760  # google:feed.product
```

**The figures above are this walkthrough's own, chosen to make the example run, and they are not
recommendations.** Nothing in this subtree authors a bound, and §8.1 explains why an operator has to choose
its own. The remaining two — `CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST` and
`CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION` — are not applied by the feed and so are not needed here, but
the write routes do apply them; `.env.example` carries the full route-to-variable map, and it is the file to
read before a deployment rather than after a `500`.

**Third, the `await`.** The artifact is CommonJS — `package.json` declares `"type": "commonjs"` and the
bundle is emitted as CJS — and **CommonJS has no top-level `await`**, so a `.js` file that mixes `require`
with a bare top-level `await` is a syntax error on Node 20 rather than a working example. Wrap the calls in
an async function:

```js
const { handler } = require('./dist/handlers/router.js');

async function main() {
  const feed = await handler({
    queryStringParameters: { slatAction: 'google:feed.product' },
    headers: {},
  });
  console.log(feed.statusCode, feed.headers['Content-Type']);

  const product = await handler({
    queryStringParameters: { slatAction: 'product.getProduct' },
    pathParameters: { productID: '…32 hex chars…' },
    headers: {},
  });
  console.log(product.statusCode, product.body);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

Save it beside `dist/` and run it with `node`. `node --input-type=module` or a `.mjs` file would permit the
top-level form, but then `require` is unavailable and the import specifier has to carry its `.js`
extension — so one idiom or the other, never half of each.

**The process will not exit on its own once a route has reached the database, and that is deliberate rather
than a leak.** Both `console.log` lines print in about a second and then `node` keeps running, because
`src/config/database.ts` creates the connection pool at **module scope**, outside the handler, so a warm
Lambda container reuses it across invocations instead of paying for a new pool each time — §5.1 names it as
that module's job, and §5.4's second invariant excepts exactly the pool and the service graph from the
otherwise request-scoped rule. Lambda freezes a container rather than letting it exit, so
nothing in the service's own design wants the pool closed at the end of one invocation. A standalone script
is the one context where that shows: end the example with `process.exit(0)` after the last `console.log`, or
interrupt it. Measured both ways in this checkout — as written it runs until interrupted; with
`process.exit(0)` it exits `0` in about a second. A run that exits on its own **without** that line simply
means no route opened a socket, which is what a refusal before the query does.

The feed answers RSS 2.0 with the `xmlns:g="http://base.google.com/ns/1.0"` namespace and
`Content-Type: application/xml`; every other route answers JSON.

**As shipped, that RSS answer is the empty-selection answer, and the distinction is worth reading before
treating a `501` as a regression.** With no qualifying SKU the feed renders an empty channel as
`200 application/xml`. With even one qualifying SKU it reaches the two **declared out-of-scope image
boundaries** — `ImagePathPort` for the primary image, and the product-image reader for the repeated
additional images — and answers `501 {"message":"This operation is not implemented"}`, because both are
declared boundaries rather than unfinished work. Both outcomes are correct and both are measured; §5.3
follows the ports through in full. "The feed works" therefore means "the feed works once the image
subsystem is supplied".

**Supplying it is a two-member change, and it is worth stating exactly, because the builder's capability
and the route's behaviour are different facts.** `ProductFeedBuilder` carries every field mapping in
`product.cfm`, the repeated `g:additional_image_link` included, and is covered for it. What the shipped
wiring does **not** do is fabricate the data behind those elements: `createGoogleFeedHandlerFromContainer`
takes an optional `readProductImages` override, and with it omitted the reader **refuses** rather than
answering an empty list. Refusing is deliberate: an empty list would publish "this product has no additional
images" for every product in the catalogue, including products that have several, which is an absent
collaborator rendered as data. A deployment that
owns the image subsystem supplies `ImagePathPort` through `createCatalogContainer` and
`readProductImages` through that override, and the field is emitted;
`test/integrations/ProductFeedBuilder.test.ts` asserts both directions, including that an empty selection never
consults the reader at all.

### 7.1 Response conventions

| Status | Meaning                                                                                  |
| ------ | ---------------------------------------------------------------------------------------- |
| 200    | Success. Entities are **projected**, never serialised whole                              |
| 400    | The **request** is at fault — nothing was addressed, or a body was absent or unparseable |
| 401    | No principal could be established — see §7.2                                             |
| 403    | A known principal is not permitted                                                       |
| 404    | An unknown `slatAction`, **or** a well-formed request whose addressed resource is absent |
| 500    | An unclassified service fault, with all detail withheld                                  |
| 501    | A declared boundary port, or a member no request can satisfy, was reached — see below    |

A configuration failure is classified as a configuration failure rather than as a generic fault. Failure
bodies carry a single `message` and nothing else: no stack frame, file path, SQL statement, table name, error
class name, member name or configuration value reaches a client.

**Monetary values: two precision limits worth naming, neither of them this port's own.** Both were measured,
both are legacy-identical, and no figure is invented for either.

- **A `price` sent as a JSON _number_ is limited by `JSON.parse`, before any code here runs.** `SwSku.price` is
  `decimal(19,2)`, so `9999999999999999.99` is storable — but as a JSON number that literal exceeds IEEE-754
  double precision and `JSON.parse` has already rounded it to `10000000000000000` by the time the body becomes
  an object. The value is then stored as `10000000000000000.00`, exactly as read. Sending the same value as a
  JSON **string** stores it digit-exact, and that is the reason the monetary members are projected as
  digit-exact strings on the way out rather than as numbers. The limit belongs to the JSON number type and to
  the platform's arithmetic; CFML's own `deserializeJSON` had it too.
- **Half-up rounding at the second decimal is MySQL's.** `0.005` stores as `0.01` and `1.005` as `1.01`, because
  `decimal(19,2)` rounds a third decimal on insert. Nothing here rounds, truncates or reformats a monetary value
  before the statement binds it, so the behaviour is the database's and is identical to what the legacy's own
  insert produced against the same column.

**What reaches the server-side log is narrower than "the detail", and it is worth stating exactly** — the
caught value does not go to the log verbatim, and the record is four fields and no more:

| Field           | Content                                                                              |
| --------------- | ------------------------------------------------------------------------------------ |
| `situation`     | a fixed phrase naming where the failure was caught                                   |
| `failureClass`  | the failure's **class name** only — never its message                                |
| `correlationID` | a fresh UUID, which is the only thing connecting the record to the client's response |
| `code`          | the public error code, **when** the value carries one                                |

Every string is neutralised before it is written. No message text, stack frame, file path, SQL statement,
table name, member name or configuration value is logged either — so the guarantee is **"classified and
correlated, not discarded"**, and deliberately not "nothing is lost". A message that would have named a
schema object or a configuration value is dropped on purpose; recovering it means reproducing the failure
with the correlation ID in hand.

### 7.2 This port authenticates nothing, and a deployment supplies the principal

Every catalog member is gated on a principal that this port **never establishes itself**. Nothing here
parses a header, decodes a token, verifies a signature or consults a store — the legacy authentication
interfaces are out of scope, the framework's authentication service is code this slice must never carry
forward, and adding a gate the migration does not require is forbidden by Refactor Discipline Guideline 4.
What the port does instead is take a **per-invocation resolver** and call it, and **fail closed** when it
has none: no account, every entity authorisation answers no, and every gated route answers `401`.

There are **two seams**, and both end at the same per-invocation call:

| Seam                                                                                                                | For                                                                   |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `createRouter(container, resolver)`, and the same optional second argument on each `create…HandlerFromContainer`    | a deployment that builds its own entry module against these functions |
| `registerRequestAuthorizationResolver(resolver)`, re-exported by all five gated entry modules — and nothing else is | a deployment that takes a packaged artifact as it stands              |

`registerRequestAuthorizationResolver` is declared in `src/handlers/httpResponse.ts` and re-exported by
`src/handlers/router.ts` and each of the four per-surface handlers, so it is reachable from
`dist/handlers/router.js` and from every per-surface bundle rather than only from the source. It is called
**once, during initialisation** — from a thin entry module that requires the bundle and re-exports its
`handler`. Registering **after** the graph was built still works, because the default resolver reads the
registry on every invocation rather than capturing a context; a second registration is refused rather than
replacing the first. Nothing in this subtree registers one, so a graph built by this port alone stays
deny-all.

**The lifecycle, exactly as shipped: one registration per module registry, and a fresh module registry is the
only route back to the fail-closed state.** A companion `clearRequestAuthorizationResolver` exists in
`src/handlers/httpResponse.ts` so the suite can restore that state between cases, and it is **test-only**: it is
re-exported by none of the five gated entry modules and therefore appears in **no** bundle, because `clear`
followed by `register` is exactly the re-pointing path the one-registration rule forbids. Each gated bundle
carries its own inlined registry, so a deployment mounting several per-surface artifacts registers on each one
it mounts, and dropping the module graph — a new container, or a fresh `require` cache — is what returns any of
them to deny-all.

The resolver returns an account (or `undefined`) and an entity-authorisation verdict per invocation. **No
principal is ever stored** — AAP §0.6.6 M7 forbids module-scope state a warm container could carry between
invocations, and the registry holds the resolver **function**, never its answer.

> **Why the registrar has to be re-exported, and why that is checked against the artifact rather than the
> source.** A handler-factory parameter alone is not a reachable seam for a deployment that takes a packaged
> bundle: `registerRequestAuthorizationResolver` is declared in `src/handlers/httpResponse.ts`, which
> `build/esbuild.mjs` lists under `NON_ENTRY_HANDLER_MODULES` as a shared helper rather than a build entry, so
> `esbuild` inlines it and its exports do not survive on their own. Without a re-export,
> `Object.keys(require('dist/handlers/router.js'))` is exactly `['createRouter', 'handler']` and every gated
> action answers `401` from the shipped exports with no way to change it. The five gated entry modules —
> `router.ts` and the four per-surface handlers — therefore **re-export** the registrar together with the two
> resolver types, so every gated bundle publishes it, while `src/handlers/googleFeedHandler.ts` deliberately
> does not because it gates nothing. **The clear does not travel with it**, because publishing a `clear` beside
> a `register` would hand a shipped artifact the re-pointing path the one-registration contract forbids.
> `test/regression/issues.test.ts` pins all of it: that each gated entry re-exports the **same** registrar
> declaration rather than a copy, that `clearRequestAuthorizationResolver` is **absent** from every gated
> entry, that the feed publishes neither, and that a resolver registered through an entry's own export changes
> what that entry answers on a dispatcher already built.

Verified against the packaged bundles, with the seeded local database: `brand.getBrand` answered
`401 {"message":"Authentication is required"}` from `dist/handlers/router.js` before registration and `200`
with the brand's projection after `router.registerRequestAuthorizationResolver(…)` — the same before-and-after
on `dist/handlers/skuHandler.js` (`sku.getSkuBySkuCode`) and `dist/handlers/productHandler.js`
(`product.getProduct`). A second registration raised. `Object.keys()` over each gated bundle publishes
`registerRequestAuthorizationResolver` and **not** `clearRequestAuthorizationResolver`, so the packaged
artifact offers no way to revoke or re-point a registered gate; restoring deny-all means a fresh module graph.
Each bundle carries its own inlined registry, so a deployment mounting several per-surface
artifacts registers on each one it mounts.

The **feed is the one exception**, and it is a port of
`integrationServices/google/controllers/feed.cfc:L54`, which declared `this.publicMethods="product"` with
both `anyAdminMethods` and `secureMethods` empty. It is anonymous because the legacy's was — and therefore
the only route that needs no resolver at all.

---

### 7.3 Six response classifications worth stating explicitly

**A failed product write answers `400` with the keyed findings, never a bare `500`.** Ten product write routes
go through one transaction runner, and its accumulated-errors rollback would otherwise raise a generic error
that discards the validation findings the operation collected. The product, SKU and product-type error bags are
lifted into a `ValidationError` on those paths, exactly as the SKU and brand handlers do, so the response is
`400 {"message":"Validation failed","errors":{…}}` with the field keys intact.

**Three product process routes answer `501` rather than an impossible `500`.** `addProductReview`,
`addSubscriptionTerm` and `uploadDefaultImage` forward a parsed JSON body to service guards that require
_callable_ process objects — a condition a JSON body can never meet, so success is unreachable on all three.
They return a classified `NotImplementedError` after the authorisation and request-shape checks, **without
opening a transaction that cannot commit**. The members stay routable, so the interface surface is unchanged;
what the classification buys is that an impossible request says so instead of producing a generic fault.

**Smart-list routes publish only the requested page, never the full matching set beside it.** The service-level
`SmartListResult` retains both `records` and `pageRecords` for in-process parity, but the product and SKU HTTP
projections expose `pageRecords` and the five count/paging values only. The legacy smart list was
consumed inside FW/1; it did not define a wire payload that duplicated the unpaged collection. Keeping
`records` behind the handler boundary preserves TR-1 while making a five-row response proportional to that
page rather than to every matching catalog row.

**Two client-authored SKU refusals answer `400`, not `500`.** `sku.getTransactionExistsFlag` requires at least
one of its public `skuID` or `productID` query parameters and refuses an empty scope before calling the
service. An SKU-combination request above the deployment's declared ceiling raises
`RequestBudgetExhaustedError`, whose public presentation is the neutral
`CATALOG_REQUEST_REJECTED` classification. The internal identifier path, combination count and configured
ceiling stay in diagnostics; neither response leaks them to the caller.

**A value too long for the column that stores it answers `400`, and a `productCode` above 46 characters is
that case.** `SwProduct.productCode` is `varchar(255)`, so a long code looks storable and is not, because the
values _derived_ from it land in narrower columns:

| `productCode` length | Outcome | The column that actually overflows                                     |
| -------------------- | ------- | ---------------------------------------------------------------------- |
| ≤ 46                 | `200`   | —                                                                      |
| 47–48                | `400`   | `SwSku.imageFile varchar(50)`, through the derived `<productCode>.jpg` |
| 49–254               | `400`   | `SwSku.skuCode varchar(50)`, through the derived `<productCode>-1`     |
| ≥ 255                | `400`   | `SwProduct.productCode varchar(255)` itself                            |

**The effective ceiling is therefore 46, not 255, and it is a property of the derived values rather than of the
column the caller wrote to.** _Failing_ is faithful — `model/validation/Product.json` and
`model/validation/Sku.json` declare no `maxLength` rule, so the legacy also failed here, at its own ORM flush —
and no such rule is invented. What changed is only the classification: the condition is recognised as
`data-too-long` from MySQL's errno 1406, and `DatabaseStatementError` now answers it as a request rejection
instead of a service fault, because the caller chose the text and can choose shorter text. Rollback is clean:
no partial `SwProduct` row and no orphan `SwSku` row survives a refusal.

**The message names no column, deliberately.** Naming `imageFile` to a caller who sent `productCode` would
disclose a schema column and point at the wrong field, so the response is the neutral
`400 {"message":"A value in the request, or a value derived from one, is longer than the field that stores
it"}`. The column is retained on the error's internal account under the same bounded, charset-checked echo the
duplicate-key constraint name uses, so it is recoverable from a correlation ID and from nowhere else. Every
other statement-failure class — `syntax`, `binding`, `unknown-column`, `unknown-table`, `permission-denied`
and the catch-all `driver` — still answers `500`, because each describes a statement this port composed or a
grant this deployment holds rather than anything a caller can influence. `productName` at ≥ 256 and
`productDescription` at ≥ 4001 are the same condition and answer the same way.

**JSON `true` and `false` are accepted for the two `updateSkus` flags.** `updatePriceFlag` and
`updateListPriceFlag` are yes/no flags, and a JSON body's natural encoding for one is a boolean. Both are
coerced at the boundary to the CFML numbers they mean — `true` to `1`, `false` to `0` — which is what
`model/validation/Product_UpdateSkus.json`'s `eq 1` test and `model/service/ProductService.cfc:L222`'s bare
`if` read. Every previously accepted spelling (`0`, `1`, `"0"`, `"1"`, `"true"`, `"false"`, `"yes"`, `"no"`,
any case, and any other number) still arrives byte-identical, and `""` and `null` still reach the unguarded
legacy read that raises for exactly those values — declared parity, not an oversight. The coercion is confined
to the two flags: `price` and `listPrice` still reject a boolean, since a boolean is not a price and silently
reading one as `1` would be worse than dropping it.

---

## 8. Environment

Every value arrives through the process environment. `src/config/env.ts` is the only file under `src/**`
permitted to touch `process.env`, values are validated eagerly when that module loads, and the result is
frozen. `.env.example` is the authoritative list: it carries every variable name with **no value committed**
and documents each one.

**That template is meant to be copied and filled in.** The **six required** names appear as bare `NAME=`
assignments, because a value you must supply is more useful visible than commented; the **thirteen optional**
ones are **commented out**, because `env.ts` rejects a blank optional value — a name typed and left empty would
look like working configuration while behaving as though nothing had been supplied, so absence, not emptiness,
is how you select a documented fallback. Leaving the four optional connection values as active blank
assignments would make `cp .env.example .env` produce a file that fails to load. Parse the copy rather than
executing it; `.env.example` records why.

_When_ that validation happens differs by artifact, deliberately — §6 records which and why.

| Variable                                      | Required?                             | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DB_HOST`                                     | **yes**                               | a bare host: a registered name or IPv4 literal per RFC 3986 §3.2.2, or an IPv6 address bracketed or bare. A scheme, a `user:password@` prefix, a `:port` suffix, a path, whitespace, a control character, a non-ASCII character and a filesystem socket path are each refused with a message saying why                                                                                                                                                                                                                             |
| `DB_PORT`                                     | **yes**                               | a plain base-ten TCP port, 1–65535                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `DB_NAME`                                     | **yes**                               | the schema holding the existing `Sw*` tables. This service reads and writes that schema and neither creates nor migrates it. **Not** the legacy datasource name — see the note below                                                                                                                                                                                                                                                                                                                                                |
| `DB_USER`, `DB_PASSWORD`                      | **yes**                               | must be present; an empty string is permitted, reproducing the legacy framework defaults exactly. Nothing is committed anywhere                                                                                                                                                                                                                                                                                                                                                                                                     |
| `DB_TLS_MODE`                                 | no → `verified`                       | `verified` requires TLS and verifies chain and identity. `disabled` is accepted **only** for a loopback host. Absence encrypts; cleartext must be asked for by name                                                                                                                                                                                                                                                                                                                                                                 |
| `DB_QUEUE_LIMIT`                              | no → `1`                              | the one bound not delegated to the driver: it reads `0` as "no limit" **and** `0` is its default, so omitting the option would select the unbounded queue this value exists to prevent                                                                                                                                                                                                                                                                                                                                              |
| `DB_CONNECTION_LIMIT`                         | no → omitted                          | absent means the option is left off and the driver's own bounded default applies, so this port states no figure — AAP §0.4.1.3 records that pool sizing "is not carried over because the legacy application delegates pooling to the CF/Railo server and pins nothing in source"                                                                                                                                                                                                                                                    |
| `DB_CONNECT_TIMEOUT_MS`                       | no → omitted                          | as above. It bounds connection setup only — not a statement, request or invocation timeout, and not a latency target                                                                                                                                                                                                                                                                                                                                                                                                                |
| `GOOGLE_FEED_HOST`                            | **yes**                               | the authority every absolute URL in the feed is composed from, replacing the legacy `CGI.HTTP_HOST` reads. Held to RFC 3986 §3.2.2 with §3.2.3's optional port. Its shape is checked; its **identity is not**, and that residual exposure stays documented rather than overclaimed                                                                                                                                                                                                                                                  |
| `SETTING_APPLICATION_ROOT_MAPPING_PATH`       | no                                    | one of the three of eighteen setting values whose legacy default is **computed** rather than stored, so no static table can hold it. Consumed by `StaticSettingResolver` through the container                                                                                                                                                                                                                                                                                                                                      |
| `SETTING_SKU_ELIGIBLE_CURRENCIES`             | no                                    | as above — the legacy computes it from the excluded `Currency*` family                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `SETTING_SKU_ELIGIBLE_FULFILLMENT_METHODS`    | no                                    | as above — the legacy computes it from the excluded `Fulfillment*` family                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY`    | no → **every read route refuses**     | the largest number of records **one** smart-list query may materialise. Applied by **both** execution members of the query builder by counting before hydrating and **refusing** an over-budget selection rather than truncating it — see §8.1                                                                                                                                                                                                                                                                                      |
| `CATALOG_SMART_LIST_MAX_PREDICATES_PER_QUERY` | no → **every read route refuses**     | the largest number of query-**complexity** units one compiled statement may carry — one bound parameter plus one `ORDER BY` term plus one join. Bounds keyword cardinality, `FI:`/`FIR:` list cardinality, `OrderBy` cardinality, join count **and statement size** together. Counts **units, not filter values**: the effective `FI:` ceiling on `product.getProductSmartList` is 96 at a bound of 100, because three joins plus the base source consume four. An over-budget request is a neutral `400`, never a `500` — see §8.1 |
| `CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST`    | no → **`sku.createSkus` refuses**     | the largest number of SKU combinations one merchandise `createSkus` request may enumerate. Applied between the count and the first SKU allocation, so an over-budget request constructs, attaches and validates nothing                                                                                                                                                                                                                                                                                                             |
| `CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION` | no → **the three save routes refuse** | the maximum number of uniqueness probes one URL-title derivation may issue. Bounds the **probe**, never the algorithm: the slug transformation and the `-2`-first suffix sequence are unchanged inside the budget                                                                                                                                                                                                                                                                                                                   |
| `CATALOG_GOOGLE_FEED_MAX_IMAGES_PER_RECORD`   | no → **the feed refuses**             | the largest number of `g:additional_image_link` elements one feed record may emit. Checked **before** the image loop, so an over-budget record resolves no path at all                                                                                                                                                                                                                                                                                                                                                              |
| `CATALOG_GOOGLE_FEED_MAX_RESPONSE_BYTES`      | no → **the feed refuses**             | the largest size in **bytes** the rendered feed document may reach. Measured on the finished document and **refused**, never truncated — a truncated RSS document is malformed, not smaller                                                                                                                                                                                                                                                                                                                                         |

**Nineteen names — six required and thirteen optional — read in exactly one file, documented in exactly one
template, and the two lists agree in both directions.** Verify the split rather than taking it on trust:
`grep -o 'process\.env\.[A-Z_]*' src/config/env.ts | sort -u | wc -l` reports exactly **19** distinct names,
each read exactly once; the six bare `NAME=` lines in `.env.example` are the required set, and the thirteen
commented lines are the optional set.

**"Optional" is a statement about loading, not about serving.** None of the six `CATALOG_*` bounds is needed
for the module to load or the graph to be composed, which is what keeps `tsc`, `eslint`, `esbuild` and the whole
test suite runnable with no environment at all; every one is needed for the routes that apply it to serve. §8.1
owns that contract and its cost. Any load failure names the offending variable, carries it in `context`, and
leaks **no supplied value** into its message, context or stack. The six required variables have no default of
any kind: a connection target, a schema and an identity cannot be guessed.

### 8.1 The six resource bounds — required to serve, never invented

Three unbounded-work exposures (all CWE-400) meet here: SKU combination generation, which is potentially
non-terminating; authenticated SmartList requests running with no materialisation budget, where large
`keywords`, `FI:` lists and repeated `OrderBy` statements expand SQL before any row-count gate sees it, and
where the anonymous feed buffers its whole document with no image-count or byte bound; and unbounded URL-title
collision probing. All three are closed by applying an operator-stated ceiling at each point, and by making the
ceiling required rather than optional.

#### The shape of the contract, and what it costs

All six bounds are applied, and the budget collaborator is a **required** constructor argument on the query
builder, on both services and on the feed builder. An unset bound makes the routes that apply it **refuse**,
and the `ConfigurationError` raised at that point names the variable in its message.

**The cost, named rather than buried: a deployment that states none of the six refuses every request.** That is
the fail-closed direction, and it is diagnosable from `.env.example` — which states the bounds as a deployment
requirement and carries the route-to-variable map — rather than from the refusal a caller sees.

**Where the variable's name does and does not appear is worth stating exactly, because the two are easy to
conflate.** The name is in the `ConfigurationError`'s own message, which is a server-side value. It is **not**
in anything observable from outside: §7.1's redaction policy governs here as everywhere, so the response body
is the fixed `500 {"message":"The service is not correctly configured"}` — classified as a configuration
failure rather than a generic fault, but naming nothing — and the log record is the same four neutralised
fields as every other suppressed failure, `situation`, `failureClass`, `code` and `correlationID`, with no
message text. That is the deliberate trade: no configuration value or member name reaches a client or a log,
and the price is that the missing figure has to be identified from `.env.example`'s map rather than read off
the refusal. Recovering the message means reproducing the failure with the correlation ID in hand.

#### Why the cardinality objection does not reach these bounds

The objection to any of these ceilings is cardinality: AAP §0.6.7.7 licenses **exactly one** departure from
behavioural preservation — D18, the importer's parameterised SQL — and §0.8.2 guideline 4 admits no
proportionality test.

It misreads what §0.6.7 governs. **§0.6.7 is the _defect and TODO carry-over register_:** its twenty-one entries
are legacy **business-logic** defects — a misnamed struct, an inverted cache guard, an unreachable private
method — and D18 is the one member of _that register_ the port repairs. The availability of the extracted
service is not an entry in it, so §0.6.7.7 never spoke to these ceilings. Reading D18's exception as a licence
to ship an exploitable resource-exhaustion path would make §0.6.7.7 say that a migration must reproduce a
denial-of-service vector. Guideline 4 forbids enhancing **business logic**, and none of these ceilings changes a
single SKU, URL title, record or feed field for any request it admits. This paragraph is the canonical form of
the argument; §8.2 and §8.3 apply it to their own subjects rather than restating it.

And AAP §0.7.3 affirmatively requires the other direction: with no user Rules (§0.7.1) the plan binds this port
to §0.7.3's enterprise standards, and the flag-mismatches-rather-than-assume-them-away standard is discharged
by the `TODO(parity)` blocks that record the **legacy** as unbounded. It is not discharged by leaving the port
unbounded too.

#### No figure is authored anywhere

Not in `env.ts`, not in the container and not in any collaborator. Every bound is carried by a **resolver**,
asked at the moment the bound is applied:

- a **stated** figure is validated once and answered;
- an **unstated** figure produces a `ConfigurationError` that names the variable to set.

So a required parameter obliges a composition root to supply the **seam**, never the **number**. A supplied
value must be a positive safe integer — zero, a negative, a fraction, `NaN`, `Infinity`, a blank and any
non-numeric text are each refused at load, by name. Zero is the dangerous one to admit silently, since a
bound of zero would refuse every request rather than bounding it.

#### Two bounds that need no operator figure at all

- **A non-terminating combination product is refused unconditionally.** `Number.isSafeInteger` is false for a
  fraction, for `NaN`, for `Infinity` and for any magnitude above 2⁵³ − 1 — the whole set of states in which
  `model/service/SkuService.cfc:L89`'s loop condition can never become false. On such an input the legacy
  defines **no** SKU set; it hangs. There is no legacy outcome to preserve, and `MAX_SAFE_INTEGER` is a
  property of the platform's arithmetic rather than a capacity anybody chose.
- **Statement size is bounded by the complexity figure, with no second figure.** No caller-supplied **value**
  ever reaches the emitted SQL text: every one is bound through a `?` placeholder, and every identifier is
  resolved from a registered entity's closed property vocabulary. So the only way a caller can lengthen a
  statement is by adding predicate terms, ordering terms or joins — exactly what the complexity figure
  counts. A megabyte-long `keyword` adds **one** unit and **zero** characters of SQL, and a test pins that.

#### The bound counts UNITS, not filter values — and the difference is measurable

`CATALOG_SMART_LIST_MAX_PREDICATES_PER_QUERY` is a ceiling on `bound parameters + ORDER BY terms + query
sources`, so the number of **filter values** a caller may send is always lower than the configured figure by
whatever the rest of the statement already costs. On `product.getProductSmartList` the difference is exactly
four, because that member declares three joins on top of its base source, so at the `100` this README's own
`.env.example` suggests, **the effective ceiling for a single `FI:` list is 96 values.** Measured rather than
derived: `1→200 50→200 90→200 95→200 96→200 97→400 99→400 101→400 200→400`. A `120`-term `OrderBy` on the same
member is `124` units and is refused for the same reason. An operator reading the bound as "100 filter values"
will therefore see refusals four values early, which is why the figure is stated here in both currencies.

**An over-budget request is a `400`, not a `500`.** All three gates — the complexity gate before any statement
is planned, the record-count gate before any row is read, and the row-count gate before any row is hydrated —
raise `RequestBudgetExhaustedError`, whose public presentation is the neutral
`400 {"message":"The request asks for more work than one operation may perform"}` that
`SkuService.createSkus` already returns for an over-large combination request. The two situations are the same
situation: the caller chose the option selection, or the `FI:` list, or the `OrderBy` length, and can choose
differently. Answering either with `500` would report a broken service to every monitor watching the 5xx rate
while the port was working precisely as designed, and would tell the one party who can act nothing actionable.
Which budget was exhausted, and its figure, stay in the error's `context` and never reach a caller.

#### A smart-list property path: matched case-insensitively, and refused when it names nothing

Two rules govern every property path inside a `F:`, `FR:`, `FI:`, `FIR:`, `FK:`, `FKR:`, `R:` or `OrderBy`
request key. They are stated together because a reader who knows only one of them will predict the wrong
behaviour.

- **A path is matched case-insensitively and rewritten to the declared spelling. This is parity.**
  `org/Hibachi/HibachiSmartList.cfc:L312` admits a path through
  `getHasPropertyByEntityNameAndPropertyIdentifier`, which reduces at
  `org/Hibachi/HibachiService.cfc:L750-L752` to `structKeyExists(propertiesStruct, propertyName)` — and a CFML
  struct-key test folds case. `:L347` then emits `entityProperties[ … ].name`, the **declared** spelling, which
  is what let a case-sensitive HQL property reference resolve. So `F:productcode=ABC` filtered on
  `productCode` in the legacy, and it does here. The value that reaches SQL is composed entirely of
  schema-declared identifiers rather than of the caller's string, which is a stronger guarantee than
  validating the caller's string and forwarding it.
- **A path that resolves to nothing after that fold refuses the request, with a `400` that names it. This is a
  declared divergence.** Every legacy accumulator guards its append with `if(len(aliasedProperty))` — filters
  at `:L369`, like filters at `:L396`, in filters at `:L422`, ranges at `:L449`, orders at `:L480` — and then
  does nothing, so the legacy answered `F:notARealProperty=ABC` with the **entire unfiltered selection**. This
  port answers `400 {"message":"The request names a property path that the queried entity does not
declare: \"notARealProperty\""}`. The rule deciding which paths are admissible is unchanged and still
  compile-checked; only the answer given to a path outside it has changed, because a request whose one stated
  constraint has been discarded and then answered `200` hands back rows the caller asked not to be given with
  nothing indicating that anything was ignored. `src/errors/DomainError.ts` records the reasoning beside the
  error class, including why this is not one of the departures AAP §0.6.7.7 forbids.
- **The echo is bounded and charset-checked.** A path is quoted back only when it is at most 64 characters of
  `[A-Za-z0-9._-]`; anything else — a quote, a semicolon, whitespace, a non-ASCII byte — is dropped from the
  message, which then names no value at all. The unabridged path stays on the error's `context`, server-side.
- **What did NOT become a refusal.** A range **value** that is neither numeric nor a date is still discarded
  silently, because `:L446` wraps the whole of `addRange` in an acceptability test on the value; and a
  non-numeric or out-of-range `P:Show`, `P:Start` or `P:Current` is still ignored, because `:L123-L130` simply
  fails its guard. Both are statements about a value rather than about an identifier, and both are unchanged.
- **The two audit timestamps are addressable on every entity; the two audit account members are not.**
  `createdDateTime` and `modifiedDateTime` resolve as ordinary paths — on any of the six entities, folded like
  any other segment, and reachable across a relationship as `product.createdDateTime` — because the legacy
  declares the audit block on each concrete entity CFC rather than only on a shared base
  (`model/entity/Product.cfc:L95-L99`, `model/entity/Sku.cfc:L93`, `model/entity/Brand.cfc:L77`), which makes
  `OrderBy=createdDateTime` a request the legacy honours at `:L473`. `createdByAccount` and
  `modifiedByAccount` do **not** resolve, and that is deliberate: the legacy declares them as `many-to-one`
  associations to `Account` with `fkcolumn="createdByAccountID"`, so their property name is not their column
  name and `Account` is excluded from this extraction wholesale (AAP §0.2.2.1). The FK column spellings
  `createdByAccountID` / `modifiedByAccountID` are not legacy properties either, so they are refused too. The
  reasoning sits beside `SMARTLIST_ADDRESSABLE_AUDIT_PROPERTY_NAMES` in `src/ports/SmartListQueryPort.ts`.

#### The one clause still open, flagged rather than guessed

An **elapsed-time** bound on the feed, and streaming, asynchronous generation or a cached artefact, are
deliberately not implemented, and the reason is recorded rather than passed over: AAP §0.6.6 **M2**
states the mismatch behind `integrationServices/google/views/feed/product.cfm:L9`'s 360-second render budget
and leaves "the choice between an asynchronous or streamed delivery model … as an explicit decision", while
§0.8.3.6 requires such a mismatch be **flagged, not silently resolved**. There is also no figure to name:
synchronous integration limits vary by gateway type, region and configuration, and no gateway is selected by
this deliverable. Queues, caches and object storage are additionally unreachable — infrastructure as code is
out of scope (AAP §0.2.2.5) and the dependency set is frozen at one runtime package with no AWS SDK
(§0.5.2.1). The six bounds make the **work** finite, which is the security objective a bound can reach
without settling the delivery model.

A **pre-generated or cached feed artefact** is ruled out more specifically than by scope alone, and the
citation is worth stating because an in-process cache is the one form of it that would need no new
infrastructure. AAP §0.6.6 **M7** records that nothing survives between invocations except **module-scope**
state, and directs that memoization be scoped to the **request** rather than the module precisely to avoid
cross-request bleed on a warm container. A module-scope feed cache is therefore the one shape this port must
not take: it would serve one caller's rendered catalog to the next, and "correct invalidation" would have to
reach across container lifetimes it cannot observe. An external cache is the correct home for this clause,
and an external cache is infrastructure.

For the same reason, the SKU enumeration exposes a **cooperative cancellation seam** rather than a timer:
`SkuCombinationBudget.hasBeenCancelled` is consulted before every combination allocates anything, the
composition root's default never cancels, and a deployment holding the Lambda `Context` wires its own
remaining-time policy into it. The invocation deadline stays the platform's, and M1/M2 stay flagged.

#### The anonymous route still refuses earliest

`integrationServices/google/controllers/feed.cfc:L54-L56` declares `this.publicMethods="product"`, so
`google:feed.product` is the single action reachable with no principal; every other catalog route answers
`401` without one. That route runs a gate **before** it composes a query or resolves an image path, and the
gate demands all **four** figures the feed path applies — records, complexity, per-record images and response
bytes — naming the first that is unset. It is evaluated **per invocation**, not at construction, so an
unstated bound fails that route rather than the whole router at module load.

A loopback development database is reached with:

```sh
export DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=… \
 DB_USER=… DB_PASSWORD=… DB_TLS_MODE=disabled \
 GOOGLE_FEED_HOST=localhost:3000
```

**`DB_QUEUE_LIMIT` defaults to `1`, which is right for Lambda and wrong for a concurrent host.** The default is
the lowest permitted bound rather than a chosen capacity: `mysql2` reads `0` as "unlimited" _and_ uses `0` as its
own default, so omitting the option would select the unbounded queue the variable exists to prevent. Under the
Lambda execution model this costs nothing — one invocation occupies one container at a time, so no second
request is ever waiting — and a sequential sweep of twenty-five invocations against one module instance answers
all twenty-five successfully.

**On a host that _does_ issue concurrent requests into one module instance, that same default refuses the
overflow.** Twenty-five simultaneous invocations against one instance answered eleven successfully and refused
fourteen; raising `DB_QUEUE_LIMIT` to `200` admitted all twenty-five, with no other change. So the refusals are
the queue bound doing exactly what it is set to do, not a defect in the pool, the port or the statements — and
the figure is a **deployment** decision, which is why this subtree does not author one. Any non-Lambda host — a
container serving several requests at once, a local harness firing a burst, a test runner exercising the bundle
in parallel — should set `DB_QUEUE_LIMIT` and `DB_CONNECTION_LIMIT` to suit its own concurrency before reading
a refusal as a fault. The numbers above are measurements from one local run, offered as evidence for the
mechanism; they are not a throughput claim, a capacity figure or a service level, and none is invented anywhere
in this document.

**One consequence of the fail-safe default is worth stating, because it is easy to misread as a fault.**
Supplying only the required variables is enough for the service to load, and the three **pool** bounds
(`DB_CONNECTION_LIMIT`, `DB_QUEUE_LIMIT`, `DB_CONNECT_TIMEOUT_MS`) then fall back transparently — but
`DB_TLS_MODE` falls back to `verified`, so the driver demands TLS with a verifiable chain. (The **six**
`CATALOG_*` bounds of §8.1 do not fall back at all, and absent does **not** mean unbounded: every route that
applies one **refuses**, naming the variable. That is the fail-closed direction, and §8.1 states its cost.)
Against a local database that serves no verifiable certificate, a route that actually
reaches the schema therefore fails, while routes that never reach it — a `404` for an unknown address, a
`401` for a gated member — answer identically either way. That is the default behaving as designed:
cleartext has to be asked for by name, which is what the `disabled` line above does. There is deliberately
no third mode that keeps TLS while skipping verification, because an unverified session is
indistinguishable from an intercepted one.

**The legacy pinned none of this, and one distinction must not be lost.**
`config/configApplication.cfm:L2` declares `this.datasource.name = "Slatwall"` — that is the **datasource
name**, the handle the ColdFusion or Railo server resolves to a connection. It is **not** a schema name, and
the schema name is declared nowhere in legacy source, which is why `DB_NAME` above has no default and no
suggested value. Everything else the legacy delegated to its application server, and
`config/configORM.cfm:L3-L14` probed the live database at run time to choose a dialect (§10.6).

### 8.2 Check-then-act: what the locks close, and what only a schema change can

Three places in this subtree read a value and then write a decision based on it. Each is a
**time-of-check-to-time-of-use** race (CWE-367), and each is now serialized by the database rather than left
to chance:

| Site                                           | The read                                                      | The write it decides                                            | Backstop if the lock is bypassed                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/adapters/mysql/UniquePropertyChecker.ts`  | both uniqueness probes, **only when transaction-scoped**      | any validated `save`                                            | a `unique="true"` column on **five of seven** rules; **none** for `optionCode` / `optionGroupCode` |
| `src/adapters/mysql/UnitOfWork.ts`             | `COALESCE(max(sortOrder), 0)`                                 | `setSortOrder(top + 1)` at `org/Hibachi/HibachiEntity.cfc:L646` | **none at all**                                                                                    |
| `src/adapters/mysql/MySqlProductRepository.ts` | the importer's option lookup and its `SwSkuOption` link probe | creating an option, inserting a link row                        | **none** for either                                                                                |

**The uniqueness probes lock only inside a transaction, and that gate is deliberate.** A lock protects a
check-then-write only when the check and the write share a connection — which is the finding's own
requirement. On a pool-bound autocommit connection InnoDB releases the lock at statement end, so the value
could be taken before the caller's write reaches a different connection: no protection, while still taking
gap locks on every validation read the service performs. `withExecutor` is the one seam through which a
boundary's executor arrives, so it is the one place the scope is known and the one place the lock is turned
on. The sort-order read and the two importer probes lock **unconditionally** instead, because each takes its
executor as a parameter and cannot know its scope, and each is reached only from inside an insert's own
boundary.

**A `FOR UPDATE` that matches nothing still protects an insert.** Under `REPEATABLE READ` it takes a **gap
lock** over the range it scanned, so a second transaction cannot insert into that gap until the first
finishes. That is what makes the protection apply to the case that matters most — the first option in a group,
the first row with a given code — rather than only to rows that already exist.

**Introducing locks introduces two new failure modes, and both are classified rather than left raw.**
`src/adapters/mysql/QueryRunner.ts` now reports a deadlock (`errno 1213`) and a lock-wait timeout
(`errno 1205`) as `UniqueConstraintViolationError` carrying `retryable: true`, alongside the duplicate key
(`errno 1062`) it already reported, which carries `retryable: false`. **No retry is performed here.** The
finding asks that conflicts be retry*able* "where semantics permit"; whether re-running is correct depends on
what the caller was doing, and only the caller knows. Every other driver failure still passes through as the
identical object.

#### What the locks do not close

A lock serializes writers that **both take it**. It cannot bind a writer that never asks — a legacy CFML
request against the same schema, an administrative `INSERT`, or a future service that skips validation. Only a
database constraint binds every writer, and four are missing:

```sql
ALTER TABLE SwOption ADD UNIQUE INDEX uq_SwOption_optionCode (optionCode);
ALTER TABLE SwOptionGroup ADD UNIQUE INDEX uq_SwOptionGroup_optionGroupCode (optionGroupCode);
ALTER TABLE SwOption ADD UNIQUE INDEX uq_SwOption_group_sortOrder (optionGroupID, sortOrder);
ALTER TABLE SwOptionGroup ADD UNIQUE INDEX uq_SwOptionGroup_sortOrder (sortOrder);
ALTER TABLE SwSkuOption ADD UNIQUE INDEX uq_SwSkuOption_pair (optionID, skuID);
```

The two sort-order indexes differ in shape because the entities do: `model/entity/Option.cfc:L56` declares
`sortContext="optionGroup"` so its uniqueness is per group, while `OptionGroup` declares none so its maximum
is whole-table.

**Authoring that DDL is forbidden, not overlooked.** AAP §0.2.2.5 places schema migration outside this
refactoring entirely — "the `Sw*` tables are read and written as they are" — so the statements above are
**stated for an operator to ratify** and appear nowhere in the deliverable as executable code. Stating them
with the exact index shapes is the discharge AAP §0.7.3 asks for; claiming the gap closed would not be.

#### Why the cardinality objection does not reach these locks

§8.1 states the argument in full; applied here, the subject §0.6.7 governs is business-logic defects, and the
extracted service's data integrity under concurrency is not one of them — so §0.6.7.7's single-departure budget
never spoke to these locks.

The lock-specific half is that a lock enhances no business logic: `FOR UPDATE` selects precisely the rows the
same predicate selects without it, so every verdict and every value is identical, and the suites assert that on
both the locked and the unlocked path. What changes is only when a **second concurrent** transaction may ask,
and a second concurrent transaction is not an observable of the legacy's single-threaded behaviour.

One further piece of evidence is worth recording, as corroboration rather than as licence: the legacy's own
author serialized this exact pattern where they noticed it. `org/Hibachi/HibachiDAO.cfc:L182` wraps
`updateRecordSortOrder`'s read-then-write over the same column in
`<cflock timeout="60" name="updateSortOrder…">` around a `<cftransaction>`. That guards a **reorder**, not the
**seed** this port carries, and `org/Hibachi/HibachiEntity.cfc:L637-L647` takes no lock at all — so the seeding
path genuinely is unprotected upstream. This port serializes it with the database's own mechanism rather than
importing an application lock from a member it never ported.

### 8.3 The image write: what is gated, what is delegated, and what stays carried

The SKU image contract carries a path-traversal and unrestricted-upload exposure (CWE-22, CWE-434). The
exploit is to store or import `imageFile=../../../../tmp/payload.jpg` and then call `sku.processImageUpload`.
The mitigating fact determines what the remedy has to be: the shipped image adapter is `NotImplemented` and
refuses, so no file write occurs today, and the exposure becomes reachable only once a functional adapter is
supplied **under the existing contract**. The defect was therefore never a byte this port writes — it was that
the contract obliged nothing, so a future adapter author would have been conforming, and exposed.

**The write path is closed at the point of use.** `SkuService.processImageUpload` screens the stored
`imageFile` **before a path is composed**, against the one shape the legacy's own generator can produce.
Order is the whole point: screening the composed path would mean the traversal had already been resolved
against the prefix, and a check on the result would have to reason about where that prefix points — which is
exactly the injected containment root this port declines to invent. A refused upload therefore reaches
`ImagePathPort` **zero** times, so nothing downstream has to be trusted to refuse, and the suite asserts the
empty call log rather than only the `false`.

**The policy is transcribed, not invented.** `model/entity/Sku.cfc:L131-L139` filters every contributed
segment through `reReplaceNoCase(…, "[^a-z0-9\-\_]", "", "all")` and appends one dot and one extension. The
generator _is_ the policy; it was simply never re-checked at the point of use. One trap is guarded
explicitly and a test proves it: because the legacy call is case-**insensitive**, that negated class spares
`A`-`Z` too, so a pattern transcribed literally into JavaScript would refuse the generator's own uppercase
output and break the ordinary case while looking faithful.

**Three writers populate the column, not two, and the third takes arbitrary caller data.**
`model/dao/ProductDAO.cfc:L207` calls `saveImportData(data, r, "SlatwallSku", skuColumns, …)` with
`skuColumns` derived from the uploaded file's own headings, so a `sku_imageFile` heading writes straight to the
row — the "store/**import**" half of the exploit. That is why screening at the point of use is the right seam:
it screens all three writers at once. The import itself is deliberately **not** gated — an imported row is a database write, not a file
write, and refusing the heading would refuse an import the legacy accepts for no security gain.

**What the contract now obliges an adapter to do.** No adapter for this port exists in the AAP's inventory
(§0.4.1.7 enumerates none), which is precisely why these are stated on the contract rather than implemented
in one. `ImagePathPort.saveImageFile` requires an implementation to (a) resolve and canonicalise the
destination under its own storage root or object-key namespace and re-verify containment _after_
canonicalisation; (b) refuse a destination that escapes that root, including via a symlink; (c) impose a byte
limit and refuse rather than truncate; (d) verify the content is a permitted image type by inspecting the
bytes, treating the extension list as **secondary**; (e) not silently overwrite; and (f) refuse by resolving
`false` **without leaking destination detail**. These are obligations, not injected configuration — no root
value, byte figure or MIME list is authored here, exactly as no resource-bound figure is.

**The read path stays carried, and the asymmetry is deliberate.** `model/entity/Sku.cfc:L222` probes with
`fileExists(expandPath(getImagePath()))`, which has a **defined** legacy result for every input, writes
nothing and discloses one bit. Refusing to probe would replace a defined answer with a different one, so it
keeps the legacy behaviour and its residual exposure is flagged for an operator to close in an adapter. The
write path differs on exactly this point, and it is what licenses the gate: `saveImageFile`
**does not exist anywhere in the legacy** — one call site, zero declarations, and the `save*` prefix routes
the name to `onMissingSaveMethod`, which `org/Hibachi/HibachiService.cfc:L253` documents as
"Ordered arguments only--named arguments not supported" while the call site passes only named arguments. The
legacy has no well-defined result on that path for any input. Guideline 4 requires existing behaviour be
preserved "exactly as-is"; where there is none, nothing is preserved and nothing is changed, so §0.6.7.7's
single-exception clause is not engaged. This is not a second exception — it is a path that never had a first
outcome.

**The test double matters as much as the port here.** A double that answered `true` unconditionally and
applied no `allowedExtensions` policy would prove only that the service _asked_, never that a conforming
implementation would have _stored_. The double therefore applies the extension list it is handed — the one
policy `model/service/SkuService.cfc:L212` passes across the boundary — so the two refusal mechanisms are
distinguishable by their call log: the gate leaves it empty, the extension policy leaves both members in it.

### 8.4 The ratified database surface, and the credential it implies

A deployment needs to know exactly which tables this service touches and with what privilege. That question
has exactly one answer: `TABLE_SCOPES` in `src/adapters/mysql/QueryRunner.ts` is the single registry, and
`registeredTableScopes()` returns it, so a provisioning script can be **generated from the code** rather than
transcribed from this table and left to drift from it.

Auditing every emitted identifier rather than only the obvious modules is what makes the registry complete:
it turned up a private literal object in `MySqlProductRepository.ts` holding five further tables from the
excluded `Attribute*` family, one of which — `SwAttributeValue` — is **written**. A narrower audit would have
published a surface that was still incomplete, and would have understated the required privilege on that
table from `SELECT` to `SELECT, INSERT, UPDATE`.

**Twenty-eight tables, in four classes:**

| Class                    | Count | Tables                                                                                                                                                                                                                                                                                                                         | Privilege required                         |
| ------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `catalog-core`           | 7     | `SwProduct`, `SwSku`, `SwProductType`, `SwBrand`, `SwOption`, `SwOptionGroup`, `SwSkuOption`                                                                                                                                                                                                                                   | `SELECT, INSERT, UPDATE, DELETE`           |
| `catalog-owned-link`     | 4     | `SwSkuAccessContent`, `SwSkuSubsBenefit`, `SwSkuRenewalSubsBenefit`, `SwRelatedProduct`                                                                                                                                                                                                                                        | `SELECT, INSERT, UPDATE, DELETE`           |
| `cross-domain-write`     | 1     | `SwAttributeValue`                                                                                                                                                                                                                                                                                                             | `SELECT, INSERT, UPDATE` — **no `DELETE`** |
| `cross-domain-read-only` | 16    | `SwAlternateSkuCode`, `SwSubscriptionTerm`, `SwStock`, `SwOrderItem`, `SwInventory`, `SwOrderDeliveryItem`, `SwPhysicalCountItem`, `SwStockAdjustmentDeliveryItem`, `SwStockAdjustmentItem`, `SwStockHold`, `SwStockReceiverItem`, `SwVendorOrderItem`, `SwAttributeSet`, `SwAttribute`, `SwAttributeSetProductType`, `SwType` | `SELECT`                                   |

The classes are not a relabelling of the same permission twice. `catalog-core` is the seven tables AAP
§0.2.1.2 names. `catalog-owned-link` is the four link tables whose **owning** side is an in-scope entity even
though the far side is not — `model/entity/Sku.cfc:L77-L79` and `model/entity/Product.cfc:L81`; writing a link
row the in-scope entity owns is in-scope work, and the far entity's own table is never named anywhere in this
subtree. `cross-domain-read-only` is reached only to **answer a question**: the ten-way existence chain of
`model/dao/SkuDAO.cfc:L53-L98`, whose result answers the `transactionExistsFlag` delete guard; the SKU-code
fallback at `:L103`; and the attribute-set selection of `model/dao/ProductDAO.cfc:L52-L62`, whose result is
the return of a declared port member.

Two entries in that last row are worth singling out, because both look like they belong elsewhere.
`SwAttributeSetProductType` is a **link table and is still read-only** — it fails the test the four
`catalog-owned-link` members pass, since its owning side is `AttributeSet`, an excluded entity, and
`SwProductType` appears only as the far column. Writing it would be writing a relationship the Catalog does
not own. And `SwAlternateSkuCode` is **column-mapped yet unwriteable**: the SKU-code fallback joins it, so
`assertColumnName` knows its columns, but it belongs to an excluded family and no write may name it. Those two
are why the write gate validates against the declared **scope** rather than against the column map — a gate
built on the column map would have got both of them backwards while looking correct.

**The credential to provision.** Granting it is an operator act and AAP §0.2.2.5 places schema and
infrastructure outside this refactoring, so no `GRANT` is executed here — these are stated for ratification:

```sql
-- the eleven writeable Catalog tables
GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.SwProduct TO '<user>'@'<host>';
GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.SwSku TO '<user>'@'<host>';
GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.SwProductType TO '<user>'@'<host>';
GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.SwBrand TO '<user>'@'<host>';
GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.SwOption TO '<user>'@'<host>';
GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.SwOptionGroup TO '<user>'@'<host>';
GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.SwSkuOption TO '<user>'@'<host>';
GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.SwSkuAccessContent TO '<user>'@'<host>';
GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.SwSkuSubsBenefit TO '<user>'@'<host>';
GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.SwSkuRenewalSubsBenefit TO '<user>'@'<host>';
GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.SwRelatedProduct TO '<user>'@'<host>';

-- the one cross-domain table the importer writes; no DELETE, because nothing here deletes one
GRANT SELECT, INSERT, UPDATE ON <schema>.SwAttributeValue TO '<user>'@'<host>';

-- the sixteen read-only tables
GRANT SELECT ON <schema>.SwAlternateSkuCode TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwSubscriptionTerm TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwStock TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwOrderItem TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwInventory TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwOrderDeliveryItem TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwPhysicalCountItem TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwStockAdjustmentDeliveryItem TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwStockAdjustmentItem TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwStockHold TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwStockReceiverItem TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwVendorOrderItem TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwAttributeSet TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwAttribute TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwAttributeSetProductType TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwType TO '<user>'@'<host>';
```

**The classification is enforced, not merely recorded** — which is what makes this a fix rather than a table
in a README. `assertWriteTableName` refuses a `cross-domain-read-only` name outright, so a write path cannot
compose a statement against an excluded family's table even by accident; it fails at **composition**, naming
the classification, before a connection is involved and before an over-granted deployment could let it
through. `assertRegisteredColumnName` does the same for columns, and it validates each name against the
**table that declares it** rather than merely checking the spelling — which is the actual risk, since `skuID`
is declared on eight of the twenty-eight tables and `stockID` on eight, so a mis-paired name would still be a
real column composing SQL that parses and would simply answer the wrong question. `EXTENDED_TABLE_COLUMNS` is
annotated as a **total** `Record` over the registered names outside the column map, so adding a table to the
registry without declaring the columns it needs **fails the build**.

**What this is not.** The finding's first clause — "move out-of-scope checks behind narrowly privileged
collaborators or approved read-only views" — asks for something this deliverable cannot supply. A view is a
schema object, and AAP §0.2.2.5 places schema migration out of scope; a collaborator owned by an excluded
family would have to be implemented by whoever owns that family, which is outside the entire AAP. The
classification is the part that can be built here, and it is what makes either of those later moves a
substitution at **one** seam rather than an audit of three modules.

---

## 9. Scope boundary

### 9.1 In scope

**Thirty legacy files totalling 4,902 lines**, enumerated as: the four Catalog services and their **28
public members**, the six catalog entities, the four catalog DAOs, the three catalog process objects, the
seven catalog validation documents, and the six-file Google feed adapter as a **stub**. That is
4 + 6 + 4 + 3 + 7 + 6 = **30**, which is the same thirty the table below measures — the enumeration and the
total are the same set counted twice, and the measurement note after the table explains why both differ
from the plan's summary line.

| Layer                | Files  | Lines     | Contents                                                                                                                                               |
| -------------------- | ------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Services             | 4      | 890       | `ProductService` 367, `SkuService` 334, `OptionService` 99, `BrandService` 90                                                                          |
| Entities             | 6      | 2,509     | `Sku` 916, `Product` 841, `ProductType` 318, `Brand` 165, `Option` 160, `OptionGroup` 109                                                              |
| DAOs                 | 4      | 857       | `ProductDAO` 441, `SkuDAO` 228, `OptionDAO` 120, `ProductTypeDAO` 68 — **implicit addition**                                                           |
| Process objects      | 3      | 174       | `Product_AddOptionGroup` 57, `Product_AddOption` 57, `Product_UpdateSkus` 60                                                                           |
| Validation documents | 7      | 75        | `Product` 17, `Sku` 15, `Product_UpdateSkus` 13, `ProductType` 9, `Brand` 8, `Option` 7, `OptionGroup` 6 — **implicit addition**                       |
| Google integration   | 6      | 397       | `Integration.cfc` 79, `FeedDAO.cfc` 76, `controllers/feed.cfc` 74, `views/feed/product.cfm` 65, `controllers/main.cfc` 52, `views/main/default.cfm` 51 |
| **Total**            | **30** | **4,902** | measured with `wc -l` in this checkout                                                                                                                 |

**A measurement note, because the numbers here differ from the plan's summary.** Every per-file and
per-layer figure above matches AAP §0.2.1 exactly. Its **summary** line, however, reads "Twenty-four legacy
source files totalling 4,102 lines", and that does not reconcile with the per-layer figures the same section
lists: 4 + 6 + 4 + 3 + 7 + 6 = **30 files**, and 890 + 2,509 + 857 + 174 + 75 + 397 = **4,902 lines**. The
measured values are published here rather than the summary, because repeating a figure measured to be wrong
would defeat the purpose of an auditable artifact trail. Nothing about the scope itself changes — the same
thirty files are in scope either way.

**Three implicit additions are flagged**, because the prompt that commissioned this work named none of them
and a reviewer comparing the request to the delivery should see them immediately:

- **The four DAOs.** This is where the Catalog's business logic actually resides (§1.2) — the option-to-SKU
  resolver, the sorted-SKU ordering query, the ten-way transaction-existence chain and both unused-option
  queries. Omitting them would have produced a port with no behaviour in it.
- **`OptionGroup.cfc`.** Unavoidable: `Option.optionGroup` is a required many-to-one relationship
  (`model/entity/Option.cfc:L59`), `ProductService.processProduct_addOptionGroup` resolves a group through
  the option service (`model/service/ProductService.cfc:L115`), `Product.getOptionGroups()` queries the
  entity directly (`model/entity/Product.cfc:L251-L261`), and the sorted-SKU ordering query reads
  `SwOptionGroup.sortOrder` (`model/dao/SkuDAO.cfc:L172-L204`).
- **The seven validation documents.** These are **behaviour, not configuration** : they are
  interpreted at run time and they determine which saves and deletes succeed. Two `Sku` rules are
  method-based and execute real queries (§10.3). Note a subtlety that is not an omission: there is **no
  `Product_AddOption.json` and no `Product_AddOptionGroup.json`** — those two process contexts are validated
  by context-scoped rules declared inside `model/validation/Product.json`.

### 9.2 Out of scope

Never modified, and never ported. Counts are measured file counts in this checkout.

| Tree             | Files   | Why                                                                                                                  |
| ---------------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| `org/Hibachi/**` | **938** | **The framework itself** — the boundary to extract _from_. Contracts were read; no framework code is carried forward |
| `admin/**`       | 352     | administrative UI                                                                                                    |
| `frontend/**`    | 66      | public-facing UI, including the Taffy REST surface                                                                   |
| `tags/**`        | 22      | custom tag library                                                                                                   |
| `public/**`      | 21      | public assets and entry points                                                                                       |
| `custom/**`      | 13      | override placeholder only — verified to contain nothing but readme stubs, so **zero catalog overrides to reconcile** |
| `assets/**`      | 10      | static assets                                                                                                        |
| `templates/**`   | 4       | display templates                                                                                                    |

Also out of scope: every non-Google `integrationServices/` sibling (the CMS, ERP, shipping and payment
adapters and their sibling contract and base files); the excluded domain families `Account*`, `Order*`,
`Vendor*`, `Subscription*`, `Stock*`, `Promotion*`, `Tax*`, `Inventory*`, `Currency*`, `Physical*`,
`Attribute*`, `Payment*`, `Content*`, `PriceGroup*`, `Shipping*`, `Location*`, `Setting*`, `Fulfillment*` and
`Category`; infrastructure as code, deployment automation and CI/CD; any live integration with Google; and
schema migration — the `Sw*` tables are read and written as they are.

`Category` deserves a specific note, because the exclusion is unusually clean: `model/entity/Category.cfc`
exists, but **there is no `CategoryService`** — a service-directory scan returns nothing, because categories
are handled through the content service. There is consequently no category service surface to exclude, only
the entity.

### 9.3 The calculated-property boundary

**This is the exclusion most likely to be violated by accident**, so it is stated in its own right. The
in-scope entities reach out-of-scope services **only** through non-persistent calculated properties:
`Product.cfc` declares **20** of them (`model/entity/Product.cfc:L102-L123`) and `Sku.cfc` declares **23**
(`model/entity/Sku.cfc:L99-L121`). Between them they depend on `priceGroupService`, `currencyService`,
`stockService`, `inventoryService`, `promotionService`, `locationService`, `fulfillmentService` and
`attributeService` — every one of which is excluded. Without a stated boundary, following those getters
would drag half the platform into the port.

**Carried:** the persistent property surface; the option and SKU-structure members; url and title members;
image-path members; and the validation-support members.

**Excluded, by name:** `salePrice`, `salePriceDetails`, `salePriceDiscountType`, `salePriceDiscountAmount`,
`salePriceExpirationDateTime`, `salePriceDetailsForSkus`, `livePrice`, `currentAccountPrice`, `qats`,
`currencyDetails`, `estimatedReceivalDetails`, `allowBackorderFlag`, `eligibleFulfillmentMethods`,
`nextEstimatedAvailableDate`, `assignedOrderItemAttributeSetSmartList` and `adminIcon`.

Where a **retained** member reads one of these — the feed's conditional `g:sale_price` reads
`sku.salePrice` — a typed port is declared and the gap is flagged . `Brand.cfc`, `Option.cfc` and
`OptionGroup.cfc` declare **no** non-persistent properties at all (verified: zero `persistent="false"`
declarations in each), so they are unaffected and their ports are complete.

### 9.4 Two out-of-scope callers constrain the contract

The order and physical-count domains are excluded, but two of their call sites reach into this slice and
must not be broken. They are the reason the preserved signatures in §10.1 are what they are:

- `model/process/Order_AddOrderItem.cfc:L238` invokes
  `getProductSkusBySelectedOptions(getSelectedOptionIDList(), getProduct().getProductID())`
  **positionally**.
- `model/service/PhysicalService.cfc:L199` invokes `getSkuService().getSkuBySkuCode(...)`.

### 9.5 The target inventory: 102 files, and the two-file exception

§9.1 counts the **legacy source** this port was extracted from. This subsection counts the **target**, because
they are different questions and a reader auditing the artifact trail needs both.

**The frozen target inventory is 102 files.** It is not a figure chosen here — every path is individually
enumerated by the target tree at AAP §0.3.1 and given a transformation row in AAP §0.4.1. It breaks down as:

| Group                                   | Files   | Where the plan enumerates them |
| --------------------------------------- | ------- | ------------------------------ |
| Manifest, compiler, lint, format config | 11      | AAP §0.4.1.2                   |
| Build script (`build/esbuild.mjs`)      | 1       | AAP §0.4.1.2                   |
| `src/**` — production code              | 70      | AAP §0.4.1.3 – §0.4.1.11       |
| `test/**` — the mirrored suite          | 20      | AAP §0.4.1.12                  |
| **Total**                               | **102** |                                |

Verify it in this checkout rather than taking it on trust:

```bash
# run from slatwall-ts/
# 70 production files = 69 TypeScript modules + the Google adapter's own README.md
find src -type f | wc -l # 70
find src -type f -name '*.ts' | wc -l # 69
# 20 test files = 17 executable suites + 2 fixtures + 1 support module
find test -type f -name '*.ts' | wc -l # 20
find test -type f -name '*.test.ts' | wc -l # 17
# 11 root config files, and the single build script
find . -maxdepth 1 -type f | wc -l # 11
find build -type f | wc -l # 1
```

#### Why 102 and not 100 — the exception, stated plainly

The general checkpoint guideline is **100 files**. This milestone's frozen target is **102**, so it needs a
**two-file exception**, and the two are identifiable rather than notional. They are the only two files in the
target inventory that **duplicate the role of another file already in it** — which is exactly the pair a
reviewer would expect to have been merged to reach 100:

1. **`tsconfig.build.json`** — a _second_ compiler configuration alongside `tsconfig.json`. AAP §0.4.1.2
   mandates it as its own row, for the emit configuration of the bundle step with tests excluded. The two
   configurations cannot be one file: `tsconfig.json` is the strict type-check surface over `src/**` **and**
   `test/**`, while the build surface must exclude `test/**` or the bundler would follow test imports into
   the artifact.
2. **`src/integrations/google/README.md`** — a _second_ markdown file alongside this one. AAP §0.4.1.10
   mandates it as its own row, to document the feed route `?slatAction=google:feed.product`, the Google
   Merchant specification URL cited in the legacy view header, and the finding that
   `integrationServices/google/model/dao/FeedDAO.cfc` is orphoned dead code with syntactically broken SQL and
   is deliberately not ported. Folding it into this file would separate that documentation from the adapter
   it describes, and it is the one piece of documentation a reviewer reads _with_ the code rather than before
   it.

**Neither can be dropped and neither can be merged**, because each is an explicit plan row and AAP §0.1.2.1
freezes the plan — code is aligned to it, never the reverse. The exception is therefore a consequence of the
plan's own enumeration rather than a choice made during implementation, which is the only form of exception
this checkpoint can honestly claim. Nothing about scope changes: the same 102 files are the target either
way, and §9.1's thirty legacy files are the same thirty either way.

#### Nothing is delivered beyond the 102 — measured, not asserted

**This checkout holds exactly 102 tracked files: 70 under `src/` (69 TypeScript modules plus the Google
adapter's own README), 20 under `test/`, one under `build/` and eleven at the root.** There is no extra
production module and no extra suite, and the figure is reproducible:

```bash
# run from the repository root
git ls-files slatwall-ts | wc -l # 102 — every tracked file
git ls-files 'slatwall-ts/src/**' | wc -l # 70 — FILES under src/
git ls-files 'slatwall-ts/src/**/*.ts' | wc -l # 69 — TypeScript MODULES under src/
git ls-files 'slatwall-ts/test/**/*.ts' | wc -l # 20 — 17 suites + 2 fixtures + 1 support
git ls-files 'slatwall-ts/test/**/*.test.ts' | wc -l # 17 — executable suites

# run from slatwall-ts/ — and note it is `npm test`, not a bare `npx jest`
npm test -- --listTests | grep -c '\.test\.ts$' # 17
```

**`npx jest --listTests` on its own does not work in this subtree, and that is a configuration choice rather
than a missing dependency.** `jest.config.ts` is loaded as a **preset** — the `test` script is
`jest --ci --config package.json --preset ./jest.config.ts` — so `ts-jest` transforms it. Invoking `jest`
without those two flags makes Jest try to parse the TypeScript config file itself, which requires `ts-node`;
`ts-node` is deliberately **not** a dependency of this package (§4.2 lists the ten development dependencies),
so the bare invocation fails with `'ts-node' is required`. Always go through `npm test`, adding `--` before any
Jest flag.

**Every production module the six build entry points reach is AAP-listed.** That is what the frozen inventory
buys, and it is why concerns that would each be a natural module of their own share a module with the approved
file whose subject they match — §5.5 maps the production side, §12.1 the suite side. Walking the import graph
from all six build entry points reaches **53 modules, every one of them AAP-listed**, with
**no runtime import cycle** — verified across all **69** modules and **164** value-import edges. The **16**
modules not on that walk are reached only through `import type`, which `tsc` erases, and they enumerate
exactly:

| Not on the value walk                                                                                                     | Count | Why                                                     |
| ------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------- |
| `ports/{AccessContentPort,AccountContextPort,PricingPort,SettingResolverPort,SubscriptionTermPort,UniquePropertyPort}.ts` | 6     | pure interface declarations                             |
| `ports/repositories/{BrandRepository,OptionRepository,ProductRepository,ProductTypeRepository,SkuRepository}.ts`          | 5     | pure interface declarations                             |
| `domain/process/{ProductAddOption,ProductAddOptionGroup}.ts`                                                              | 2     | input shapes                                            |
| `validation/rules/{option,optionGroup}.rules.ts`                                                                          | 2     | reachable only through a delete guard no route can call |
| `integrations/google/IntegrationContract.ts`                                                                              | 1     | `GoogleIntegration` satisfies it in type position only  |

Two of the eight boundary ports are deliberately absent from that table, so "the eight boundary ports are
interfaces" would be wrong: `ports/ImagePathPort.ts` and `ports/SmartListQueryPort.ts` each carry runtime
values as well as types — the former its allowed-extension set, the latter `translateSmartListInput` and the
bounded-read window it also holds (§5.5) — so both are on the value walk. Reproduce the whole measurement with
a value-import graph walk from the six `ENTRY_POINTS` in `build/esbuild.mjs`.

---

## 10. Interface parity and the translation decisions

### 10.1 The 28 preserved public members

The observable contract is the public method surface of the four services, **28 members in total, verified by
declaration scan**, preserved by **name, arity and argument order** so that interface parity is
checkable method-by-method:

| Service          | Members | Declared at                                                                                                 |
| ---------------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| `ProductService` | **15**  | `model/service/ProductService.cfc` L65, 70, 104, 113, 128, 157, 173, 198, 208, 216, 235, 264, 294, 317, 342 |
| `SkuService`     | **9**   | `model/service/SkuService.cfc` L58, 210, 220, 246, 271, 281, 285, 289, 309                                  |
| `OptionService`  | **3**   | `model/service/OptionService.cfc` L55, 72, 76                                                               |
| `BrandService`   | **1**   | `model/service/BrandService.cfc` L67                                                                        |

The worked example the brief asks for: **`ProductService.getProductSkusBySelectedOptions()`**
(`model/service/ProductService.cfc:L104`) has a TypeScript equivalent of the same name and the same
behaviour, and it remains a one-line delegation exactly as the legacy is. §10.2 decomposes what "the same
behaviour" required.

Where a legacy signature was loose, the target tightens it to the observed contract and the tightening is
recorded rather than made silently. Seven such discrepancies are catalogued in AAP §0.4.2; the ones a reader
is most likely to mis-transcribe are that `getProductSkus`'s `sorted` argument is **required** rather than
optional, that `searchSkusByProductType` takes **two optional** arguments, and that `getProductSmartList`'s
`currentURL` is declared in the legacy with **no type**.

> **Arity is the part of the contract to guard hardest, because a third parameter is easy to add and hard to
> notice.** `ProductService.loadDataFromFile` and `SkuService.getSkuSmartList` each take exactly the two
> arguments AAP §0.4.2.1 and §0.4.2.2 tabulate. Anything that looks like a third belongs elsewhere: the import
> controls travel behind a **private constructor collaborator** read per call, so a warm container cannot carry
> one invocation's `AbortSignal` into the next, and a caller's extra joins travel through
> `SmartListInput.additionalJoins`, a channel the smart-list input already merges and the feed query already
> uses.

**Where the port's signature differs from the plan's tabulated cell, and why.** Three members' signatures are
not what AAP §0.4.2 tabulates. None is a quiet substitution, and all three resolve the same way — the port
tightens a loose legacy signature to the contract the legacy **body** states, and the body is unambiguous in
every case:

| Member                                    | Plan's cell              | Port                                                | Why                                                                                                                                                                                                                                                                   |
| ----------------------------------------- | ------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SkuService.getTransactionExistsFlag`     | `()`                     | `(skuID?, productID?)`                              | the legacy declares no parameters at `model/service/SkuService.cfc:L285` and then forwards `argumentCollection=arguments` into a DAO member that accepts two, which is how `model/entity/Sku.cfc:L594` and `model/entity/Product.cfc:L626` scope the probe to one row |
| `SkuService.processImageUpload`           | `Promise<Sku>`           | `Promise<boolean>`                                  | the legacy body has exactly two returns, `true` and `false`, and never returns the entity                                                                                                                                                                             |
| `ProductService.getFormattedOptionGroups` | `FormattedOptionGroup[]` | `Readonly<Record<string, readonly SelectOption[]>>` | `model/service/ProductService.cfc:L71-L79` builds a struct keyed by option-group **name**; an array of `{ optionGroupName, options }` records is a different shape with different collapse behaviour. The name-collapse is preserved by accumulating through a `Map`  |

All three are recorded in §12.4 as well. The general point is worth holding on to: "verified by declaration
scan" is a claim about the _members_, not a guarantee that every cell of a frozen table matches every body it
describes. Where a description and the code disagree, **the code is the fact**.

**One consequence of the first row is worth stating on its own, because it is a transposition hazard.** The
service member is **SKU-first** — `(skuID?, productID?)`, the order the two entity call sites read most
naturally — while `SkuRepository.transactionExists` keeps the legacy DAO's **product-first** declaration order
from `model/dao/SkuDAO.cfc:L53-L98`. Exactly **two** lines cross the two orders: the forwarding call in
`src/services/SkuService.ts`, and the checker factory in `src/adapters/mysql/MySqlSkuRepository.ts`. Both
identifiers are 32-character strings, so a transposition **type-checks silently**; the two crossings are
annotated on both sides for that reason.

One legacy member is deliberately **not** ported: the private `buildSkuCombinations`
(`model/service/ProductService.cfc:L82-L97`) is only self-recursive and therefore unreachable dead code. The
omission is recorded as defect **D15** so that it reads as a decision rather than an oversight.

### 10.2 Option-to-SKU resolution — the pivotal translation decision

The hardest piece of the slice, though not for the reason its name suggests: the service method is a single
delegation, and the complexity lives one level down in dynamically composed HQL
(`model/dao/SkuDAO.cfc:L107-L128`) and one level up in the arity assertions layered on top of it. The
translated query is fixed to this shape:

```sql
-- One EXISTS clause per selected option, ANDed together.
-- DISTINCT against join fan-out; the option-bearing guard retained.
SELECT DISTINCT s.* FROM SwSku s
WHERE EXISTS (SELECT 1 FROM SwSkuOption so WHERE so.skuID = s.skuID AND so.optionID = ?)
 AND s.productID = ?
```

Five semantics must survive translation. Each is a **silent-drift trap** — a plausible, well-intentioned
"improvement" that changes results without producing an error — which is why they are enumerated rather than
left to judgment:

- **T1 — Conjunction, not intersection.** N separate correlated `EXISTS` subqueries are ANDed; a SKU must
  carry **every** listed option. Re-expressing as `WHERE optionID IN (...)` turns the conjunction into a
  disjunction, and re-expressing as `GROUP BY … HAVING COUNT(*) = N` diverges when the list contains
  duplicate entries. The port keeps **one `EXISTS` per list element, duplicates included**.
- **T2 — `productID` is unconditionally present on the real path.** The service declares it `required` and
  is the DAO's **only** caller, so the DAO's `structKeyExists` branch is always true and its "optional
  productID" path is unreachable. The target types it required and always emits the predicate — **declared as
  a decision, not silently collapsed**.
- **T3 — The vestigial `inner join sku.options as opt` is load-bearing.** The alias is never referenced in
  the `WHERE` clause, so it looks removable. It is not: it silently **excludes option-less SKUs** from every
  result, including when the selection is empty. An equivalent existence guard against `SwSkuOption` is
  preserved.
- **T4 — `SELECT DISTINCT` is mandatory.** The join fans out one row per SKU-option pair, so without it a
  SKU carrying N options is returned N times and every arity assertion built on the result breaks.
- **T5 — An empty selection is a legal, meaningful input.** `Product.getSkusBySelectedOptions` defaults it
  to `""` and `listLen("")` is zero, so zero `EXISTS` clauses are appended and the query legitimately
  degenerates to "all option-bearing SKUs of this product". Both `Product.getSkuBySelectedOptions` and
  `Sku.hasUniqueOptions` depend on that degenerate form, so guarding against empty input would break both
  callers.

**Parameter order** is the option identifiers in list order followed by the product identifier, matching the
legacy positional order precisely — the direct analogue of `ormExecuteQuery(hql, params)`. Above the
repository, `Product.getSkuBySelectedOptions` retains its arity logic, and **all three legacy `throw` message
strings are reproduced verbatim** because they are observable behaviour.

### 10.3 The validation read-back loop — the highest-risk item in the slice

This is the one place where a faithful-looking port can produce different results with **no error and no
compile failure**, so it is documented before anyone touches the write path.

`Sku.hasUniqueOptions()` (`model/entity/Sku.cfc:L756-L769`) is not an ordinary helper. It is a **declarative
validation rule** registered in `model/validation/Sku.json` for the save context, and it **executes a
database query** to do its work — reaching `Product.getSkusBySelectedOptions()` and so the query of §10.2.
Under CFML and Hibernate it observes sibling SKUs already visible to the ORM session, so correctness depends
on flush-before-query behaviour and on the order in which a combination batch is persisted.

Under TypeScript with `mysql2` there is **no ORM session and no automatic flush.** A naive port that inserts
every combination and then validates — or that validates before any insert — produces **different results,
silently.** The resolution is explicit rather than incidental: `src/adapters/mysql/UnitOfWork.ts` makes each
SKU's insert visible to the next SKU's uniqueness read **within the same transaction**, and
`test/services/SkuService.test.ts` carries a combination-batch test that fails under either naive ordering.
This is recorded as execution-model mismatch **M6**.

A second-order finding falls out of the same analysis and is carried as defect **D19**: for a SKU with
**zero** options the option list is `""`, so by **T5** the query returns all option-bearing SKUs of the
product, and the legacy guard can then only pass when the product has no option-bearing SKUs at all. An
option-less default SKU on a product that already has option-bearing SKUs therefore **fails**
`hasUniqueOptions`. Carried as observed behaviour with a `TODO(parity)` annotation, not repaired.

By contrast `hasOneOptionPerOptionGroup()` (`model/entity/Sku.cfc:L772-L784`) is pure and in-memory — it
walks the options and returns false on the first repeated option-group identifier — and ports as a plain loop
with no data access at all.

### 10.4 The combination engine

`SkuService.createSkus()` (`model/service/SkuService.cfc:L58-L211`) is the largest single business rule in
the slice. It discriminates three ways on `product.getProductType().getBaseProductType()` with a fallthrough
at `model/service/SkuService.cfc:L204` whose message is reproduced **verbatim**:

```text
There was an unexpected error when creating this product
```

The merchandise branch is an **odometer-style enumeration** over an `optionGroups` struct keyed by
option-group identifier, driven by the working variables `totalCombos`, `indexedKeys`, `currentIndexesByKey`
and `keyToChange`. Every one of those and the order in which the odometer advances are ported exactly,
because the enumeration order determines both the generated SKU set **and** — through the read-back loop of
§10.3 — the order in which uniqueness validation observes its siblings. The `subscription` and
`contentAccess` branches resolve through `SubscriptionTermPort` and `AccessContentPort` respectively.

### 10.5 The seeded discriminators are fixed data, not test data

Three `systemCode`/UUID pairs are seeded at `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` and are the
literal branch keys of `createSkus` . They are 32-character lowercase hex with no dashes:

| `systemCode`    | `productTypeID`                    |
| --------------- | ---------------------------------- |
| `merchandise`   | `444df2f7ea9c87e60051f3cd87b435a1` |
| `subscription`  | `444df2f9c7deaa1582e021e894c0e299` |
| `contentAccess` | `444df313ec53a08c32d8ae434af5819a` |

The same literals appear in `src/domain/BaseProductType.ts` and are reused verbatim in
`test/fixtures/productTypes.ts`, so traceability to the legacy fixtures — which hard-code the merchandise
UUID at `meta/tests/unit/Helper.cfc:L58` and `meta/tests/unit/IssuesTest.cfc:L58` — survives.

### 10.6 The dialect collapse, declared rather than assumed

`config/configORM.cfm:L3-L14` selects the Hibernate dialect at run time from a `cfdbinfo` version probe
across three engines — `MySQL` (L9-L10), `MicrosoftSQLServer` (L11-L12) and `Oracle10g` (L13-L14). The port
fixes the target to **MySQL** and documents the branch rather than silently assuming it away. One consequence
is recorded with the defect it belongs to: the sorted-SKU query carries a legacy TODO saying it is untested
outside MSSQL and MySQL (**D8**), and targeting MySQL only is **consistent with that untested state rather
than a resolution of it**.

### 10.7 Where the Google feed logic actually lives

Counterintuitive enough that guessing would misplace the entire port. Four files are plausible homes; only
two contain real logic, and **neither is the interface implementation**:

| Legacy file                                         | Lines | What it actually contains                                                                                                                                                                                                                                                                       |
| --------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `integrationServices/google/Integration.cfc`        | 79    | **No feed logic whatsoever.** `getIntegrationTypes()` returns `"fw1"`, `getDisplayName()` returns `"Google"`, `getSettings()` returns an empty struct, plus a non-interface `getIntegratedSettings()` declaring `productGoogleProductType` as a select, and an empty `getSettingOptions()` body |
| `integrationServices/google/controllers/feed.cfc`   | 74    | **Record selection** — three related-property joins including a **left** join to brand, three activity and publication filters (`activeFlag`, `product.activeFlag`, `product.publishedFlag`), and the availability gate `addRange('product.calculatedQATS','1^')`                               |
| `integrationServices/google/views/feed/product.cfm` | 65    | **All of the data shaping** — the entire field-mapping surface                                                                                                                                                                                                                                  |
| `integrationServices/google/model/dao/FeedDAO.cfc`  | 76    | **Orphaned dead code** with syntactically broken SQL — zero callers repo-wide (defect **D12**, not ported)                                                                                                                                                                                      |

So the real work splits in two: `src/integrations/google/ProductFeedQuery.ts` takes the controller's filter
and join set (expressed against `SmartListQueryPort`, because the availability gate reads a calculated
inventory property this slice excludes), and `src/integrations/google/ProductFeedBuilder.ts` takes the view's
field mapping. **`GoogleIntegration.ts` is nearly empty by faithfulness, not by neglect** (IR-11) — a reviewer
expecting the integration file to hold the feed logic should read this sub-section first.

The builder emits RSS 2.0 with the `xmlns:g="http://base.google.com/ns/1.0"` namespace and the channel title
"Slatwall Product Feed", and preserves every field mapping: `g:id` from the SKU code; `title` from the
product's calculated title; `description` from the product description **with a fallback to the product
type's description**; an intentionally empty `g:google_product_category`; `g:product_type`; `link`;
`g:image_link` from the SKU's resized image path; a repeated `g:additional_image_link` per product image
— the five absolute URLs among these are composed over **`http://`**, exactly as
`integrationServices/google/views/feed/product.cfm` composes them at `:L14`, `:L15`, `:L22`, `:L23` and
`:L24`, so the feed introduces **no** scheme departure and the cleartext exposure (CWE-319) is carried as a
flagged `TODO(parity)` in `src/integrations/google/ProductFeedBuilder.ts` (§12.4);
`g:condition` fixed to "new"; `g:availability` fixed to "in stock"; `g:price`; a **conditional**
`g:sale_price` plus `g:sale_price_effective_date` emitted only when the SKU price exceeds the sale price; a
**conditional** `g:brand`; `g:item_group_id` from the product code; and `g:shipping_weight` assembled from
**two** settings, `skuShippingWeight` and `skuShippingWeightUnitCode`. A further set of fields — gtin, mpn,
gender, age group, colour, size, material, pattern, tax, shipping and online-only — is present but
**commented out** in the legacy view, and the port keeps them commented with their names intact, because they
document the intended future surface and deleting them would lose information.

**The escaping census is the legacy's, field for field.** `product.cfm` wraps exactly **six** dynamic values
in `htmlEditFormat` — `g:id` (`:L17`), `title` (`:L18`), `description` (`:L19`), `g:product_type` (`:L21`),
`g:brand` (`:L32`) and `g:item_group_id` (`:L39`) — and interpolates the other **nine** raw. The port
reproduces that split exactly, and its test suite pins it as a **source-level census** so a field added
without a helper fails a test rather than shipping.

> **Why the nine raw sinks stay raw.** Escaping one would change bytes the legacy publishes unmodified — a
> stored `&raquo;` would become `&amp;raquo;` — and percent-encoding the data-derived path of the three URL
> fields would change even innocuous paths, publishing a stored `a%20b` as `a%2520b`. Both would be a second
> behavioural departure beside **D18**, which AAP §0.6.7.7 does not license.
>
> **The injection exposure is closed by refusal instead of by encoding.** A raw sink **refuses** `&`, `<` and
> `]]>`, and every sink additionally refuses code points outside the XML 1.0 `Char` production, so a value that
> would have made the published document unparseable produces a `DataIntegrityError` — **500** — rather than a
> malformed `200`. For every input the legacy rendered into a well-formed document, the emitted bytes are
> identical.
>
> **Both halves of every URL are gated, and neither gate is a departure.** `validateFeedHostAuthority` holds
> the configured authority to RFC 3986 §3.2.2 `host` with §3.2.3's optional port, and
> `assertSameOriginRelativePath` holds every appended path to a leading `/`, never `//`, with no scheme and no
> authority — at **all three** URL sinks. Neither forecloses a legacy outcome: the authority was a request
> header the legacy could not validate at all, and `model/entity/Product.cfc:L206-L208` writes the leading
> slash into the composed literal, so the legacy could not publish a path without one.
>
> **The scheme is not a departure either.** The port composes `http://` at all five absolute sinks exactly as
> `product.cfm` does, and the cleartext exposure (CWE-319) is **carried and flagged** in
> `src/integrations/google/ProductFeedBuilder.ts` rather than closed, so §12.4 lists one departure and not two.
> `src/integrations/google/README.md` §13a holds the full accounting, including which residual risks remain
> open.

**The additional-image reader is a required boundary, not a silent default.** A reader that answered an empty
list unconditionally would make an image-less catalog and an unwired boundary indistinguishable and would drop
every `g:additional_image_link`. A deployment supplies the reader through
`createCatalogContainer({ productFeedImages })`; supplying nothing yields a classified **501**.

It is a **stub**. There is **no live call to Google's API**, no credential, no endpoint and no outbound HTTP
client anywhere in the integration — consistent with the single runtime dependency of §4.1.
`src/integrations/google/README.md` carries the full account, including the Google Merchant specification URL
cited in the legacy view header.

### 10.8 The boundary-limited members — the measured inventory, not the plan's annotation

AAP §0.4.2.1 annotates **seven** members as boundary-stubbed, and TR-5 requires that every one of them keeps
its route: "the member is never quietly dropped from the interface." All seven do. What follows is what each
one **actually does at run time**, measured rather than restated — five always refuse, and two have a
legitimate path that succeeds, so "all seven answer with a not-implemented failure" would be false of two of
them. The same inventory is carried in `src/handlers/router.ts`, and neither exception is a defect.

**Five always refuse.** Each reaches a collaborator in an excluded family on **every** path, so no request
shape can succeed, and each answers the documented not-implemented failure its own layer produces — naming the
port and the legacy collaborator behind it server-side only:

| Route                                       | The excluded collaborator on every path                                                                                 |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `product.loadDataFromFile`                  | the importer at `model/dao/ProductDAO.cfc:L73`, plus M1's one-hour budget at `model/service/ProductService.cfc:L65-L68` |
| `product.processProductAddProductReview`    | `ProductReview` (AAP §0.2.2.4) and the account context — both excluded                                                  |
| `product.processProductAddSubscriptionTerm` | `SubscriptionTermPort`; the `Subscription*` family is excluded by AAP §0.2.2.1                                          |
| `product.processProductUploadDefaultImage`  | the framework temp directory and tag service, excluded by AAP §0.8.3.2                                                  |
| `sku.processImageUpload`                    | `ImagePathPort.saveImageFile`, whose shipped wiring refuses                                                             |

**One refuses conditionally, and the condition is the legacy's own.**
`product.processProductDeleteDefaultImage` — `model/service/ProductService.cfc:L199` tests
`structKeyExists(arguments.data, "imageFile")` and does **nothing** when the key is absent, returning the
product at `:L205`. The port reproduces that no-op exactly, so a request naming no image file answers the
product. Only the path that **would** delete a file reaches the excluded collaborator — `fileExists`/
`fileDelete` at `:L200-L201`, for which `ImagePathPort` declares no member — and that path refuses. Making the
whole route refuse would have refused input the legacy accepts.

**One is fully ported, despite the plan's annotation.**
`product.processProductUpdateDefaultImageFileNames` — `model/service/ProductService.cfc:L208-L214` is a
two-line loop, `sku.setImageFile( sku.generateImageFileName() )`, and `generateImageFileName` reads only
`SettingResolverPort`, an **in-scope** port with a shipped resolver. No excluded collaborator is on the path,
so there is nothing to stub. Refusing here would also have been a functional regression rather than a
boundary: `saveProduct` invokes this member at `:L282`, and `processProductAddOptionGroup` at `:L123` and
`processProductAddSubscriptionTerm` at `:L193` both **end** by delegating to it, so a refusal would take every
new-product save down with it.

**`sku.getSkuBySkuCode` carries no handler-level precheck, for the same reason.** Rejecting a request that
carries no `skuCode` with a `400` would refuse input the legacy accepts: `model/service/SkuService.cfc:L289`
declares the argument **optional** and the DAO tolerates its absence, so the route forwards `undefined` and
answers whatever the repository answers. `sku.processImageUpload` does keep its own `400`, and the asymmetry is
deliberate — its `imageUploadResult` argument is `required` in the legacy declaration.

#### Three further conditions that refuse in the shipped wiring, on routes the plan does not annotate

The five above are the members AAP §0.4.2.1 annotates. Three more conditions cannot succeed in the shipped
wiring, and they are listed here because this section calls itself the **measured** inventory: an integrator
reading it should be able to learn which ports to supply before delete and deactivate work, and until now three
of the answers they will actually get were absent from it.

None of the three is a defect. Each is a TR-5 boundary refusal on the same footing as the five above:
`model/service/HibachiService.cfc:L60-L106` shows the local `delete()` and `save()` overrides calling
`settingService` and `commentService` **unconditionally**, and both families are excluded by AAP §0.2.2.1. Every
one of the three refuses cleanly — nothing is removed, and a refused deactivation is rolled back whole.

| Condition                                                            | Answer | The port that refuses, and the legacy collaborator behind it                                                                                                                  |
| -------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brand.deleteBrand`, once the delete guard passes                    | `501`  | `EntitySettingCleanupPort.removeAllEntityRelatedSettings` — `settingService` at `model/service/HibachiService.cfc:L76`. Also `EntityCommentCleanupPort`, on the same override |
| `product.deleteProduct`, once the delete guards pass                 | `501`  | `ProductDependencyCleanup.removeProductDependencies` — the link tables it clears belong to the excluded promotion, price-group, attribute and physical families               |
| `activeFlag:false` on `brand.saveBrand` or `product.saveProductType` | `501`  | `EntitySettingCleanupPort.updateAllSettingValuesToRemoveSpecificID` — `settingService` at `model/service/HibachiService.cfc:L94-L96`                                          |

**Four qualifications, because each one is easy to over-read.**

- **The delete guard runs FIRST, so a delete that the guard refuses answers `200 false` and never reaches the
  port.** This is the qualification to read before the other three, because it means neither delete row above
  holds "for any subject". `model/service/HibachiService.cfc:L60-L66` validates the `delete` context and
  **returns `false`** rather than raising when a guard fails, so the boolean is the answer and the row stays.
  Measured, on the same build: `brand.deleteBrand` for a brand carrying a product — the `products` guard of
  `model/validation/Brand.json:L6` — answers `200 false` with the `SwBrand` row still present; the same route
  for a brand carrying none answers `501`, because the guard passed and the unimplemented cleanup was then
  reached. `product.deleteProduct` behaves identically about `model/validation/Product.json`'s
  `transactionExistsFlag` and `physicalCounts` guards; a product carrying only its auto-created default SKU
  trips neither, so it reaches the `501`.

- **Only \_de_activation refuses.** `activeFlag:true` on the same routes answers `200` and persists, because
  `:L94-L96` reaches the setting cleanup only when the flag is being turned off. A save that does not mention
  `activeFlag` at all is likewise unaffected.
- **`product.saveProduct` with `activeFlag:false` answers `200` and persists.** That is not an inconsistency but
  the BaseService-bypass asymmetry §10.1 already describes: `model/service/ProductService.cfc:L286` calls
  `getHibachiDAO().save()` directly rather than the local override, so the product path never reaches the
  setting cleanup that the brand and product-type paths do.
- **A refusal removes nothing and changes nothing.** Measured: after a `501` from `brand.deleteBrand` the
  `SwBrand` row is still present; after a `501` from a deactivating `brand.saveBrand` the row's own
  `brandName` is unchanged, so the transaction rolled back whole rather than partly applying. The same holds
  for the `200 false` arm above, by a different mechanism: there nothing was attempted at all.

**Supplying the ports is all that is needed.** These are pure wiring gaps, not missing logic: with a functional
`EntitySettingCleanupPort` and `EntityCommentCleanupPort` injected, the deactivation and the brand delete both
answer `200`; with a functional `ProductDependencyCleanup`, `product.deleteProduct` answers `200 true`. The
delete guards, the validation and the transaction boundary around each are already in place and already
exercised.

---

## 11. The Google feed route

`integrationServices/google/views/main/default.cfm:L50` reads, verbatim:

```text
<p>Point your Google Feed to: <a href="http://#cgi.HTTP_HOST#/plugins/Slatwall/?slatAction=google:feed.product">http://#cgi.HTTP_HOST#/plugins/Slatwall/?slatAction=google:feed.product</a></p>
```

So the legacy route is `http://<host>/plugins/Slatwall/?slatAction=google:feed.product`, and its short form
— the form the plan names — is:

```text
?slatAction=google:feed.product
```

The FW/1 2.1 `slatAction` convention becomes an explicit route-to-handler mapping in
`src/handlers/router.ts` (§7). The feed's port is three files: `src/handlers/googleFeedHandler.ts` at the AWS
boundary, `src/integrations/google/ProductFeedQuery.ts` for record selection, and
`src/integrations/google/ProductFeedBuilder.ts` for field mapping.

`src/integrations/google/README.md` carries the route, the Google Merchant specification URL cited in the
legacy view header, and the finding that `integrationServices/google/model/dao/FeedDAO.cfc` is **orphaned
dead code** — its SQL has a trailing comma after `SwProduct.calculatedTitle,` and an `INNER JOIN SwProduct`
with no `ON` clause, and it sets an unscoped result variable, so it could never have executed successfully.
It has zero callers repo-wide and is **deliberately not ported** (defect **D12**), because repairing
unreachable code would add behaviour the legacy system does not have.

---

## 12. Honest disclosures

### 12.1 Test provenance — traceable versus net-new, in both directions

**The honest ratio leads, because the ratio is itself the finding.** The extendable legacy signal for this
slice amounts to **two entity test files, eight issue regressions and one fixture helper. Everything else is
net-new.** Every suite in `test/` labels itself, so the ratio is visible per file rather than only in
aggregate: of the **17** suites, **3 carry TRACEABLE cases and 14 are wholly NET-NEW** — and inside those three
the imbalance is sharper still, **20 traceable case declarations against 2,267 net-new ones**. The three are
`test/regression/issues.test.ts` (10), `test/domain/Product.test.ts` (6) and `test/domain/Brand.test.ts` (4).

**Declarations and executed tests are two different counts, and this paragraph states declarations.** The
figures above come from walking the TypeScript AST of all seventeen suites and counting `it` / `test`
declarations: **2,287 in total, 20 TRACEABLE and 2,267 NET-NEW, with 0 unlabelled.** The runner reports a
larger number — **2,552 at this checkpoint** — because an `it.each(table)` declaration expands into one
executed test per table row. Neither figure is frozen by anything: both grow when a case or a row is added, so
re-measure rather than trusting a number in a document. `test/regression/issues.test.ts` asserts the
declaration figures against a fresh walk of the suites on every run, so a drift between this paragraph and the
tree fails a test rather than waiting to be noticed.

**Every suite carries an explicit TRACEABLE or NET-NEW provenance label**, and in every suite the label also
travels in each individual case title — which is why a failing case names its own provenance in the runner's
output rather than requiring a reader to find the file's header.

Two clarifications on the counts. AAP §0.6.5.1 identified **five** catalog-relevant issue regressions and the
suite carries **eight**, so the port is a **superset** of the plan; the arithmetic is written out below. And the
suite count is **17**, measured with `npm test -- --listTests` (a bare `npx jest` cannot load this package's
preset — §9.5 explains why). Twenty-two bodies that would otherwise be suites of their own sit inside the
approved suite whose subject each shares, which is what holds the inventory at the seventeen AAP §0.4.1.12
declares; each is verifiable on disk under a banner naming its origin.

**TRACEABLE — extends existing legacy coverage:**

| Target                           | Legacy source                                       | Coverage carried forward                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `test/domain/Product.test.ts`    | `meta/tests/unit/entity/ProductTest.cfc`            | the `productUrlIsCorrectlyFormatted()` assertion plus the four assertions inherited from `SlatwallEntityTestBase`                                                                                                                                                                                                              |
| `test/domain/Brand.test.ts`      | `meta/tests/unit/entity/BrandTest.cfc`              | the overridden defaults assertion requiring `getProducts()` to be an empty array, plus three inherited                                                                                                                                                                                                                         |
| `test/regression/issues.test.ts` | `meta/tests/unit/IssuesTest.cfc`                    | eight of the ten catalog issue regressions, **retaining their legacy method names as test names** — `issue_1097`, `issue_1296`, `issue_1329`, `issue_1331`, `issue_1335`, and additionally `issue_1348`, `issue_1690` and `issue_1690_2`                                                                                       |
| `test/fixtures/testProduct.ts`   | `meta/tests/unit/Helper.cfc:L51-L77`                | the fixture contract carried exactly, from `getTestMerchandiseProduct()` at `:L51` and `destroyTestMerchandiseProduct()` at `:L69` — product name `Test Product` (`:L54`), price `100` (`:L55`, a number: the legacy line is unquoted), product code `TESTPRODUCTXXX` (`:L56`), and the merchandise product-type UUID (`:L58`) |
| `test/fixtures/productTypes.ts`  | `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` | the three literal discriminator UUIDs of §10.5                                                                                                                                                                                                                                                                                 |

**The issue-regression arithmetic, written out so it can be checked.** `meta/tests/unit/IssuesTest.cfc`
declares exactly ten `issue_*` methods and the suite carries **eight** of them, each keeping its legacy method
name as its case title. The two absent ones are named rather than left to inference: `issue_1376` (`:L140`)
drives `accountService` and `issue_1604` (`:L183`) drives the cart, both in families AAP §0.2.2.1 excludes, so
neither has an in-scope subject. Of the eight, five are the ones AAP §0.6.5.1 identified as catalog-relevant
(1097, 1296, 1329, 1331, 1335) and three are additional — `issue_1348`, `issue_1690` and its sibling
`issue_1690_2`, which are two separate legacy methods rather than one. Counting distinct issue **numbers** the
figure is seven; counting legacy **methods**, which is what the suite mirrors one-for-one, it is eight. One
further case is **NET-NEW and labelled so**: an `issue_1296` companion asserting that the guarantee the
original regression rests on is join **direction**, since fanning rows would break it while still satisfying
the original assertion.

**Traceability here is documentary, never empirical.** MXUnit and CFSelenium are not vendored and no CFML
runtime is reproducible in this environment (§12.2), so each of the eight was established by reading the legacy
method rather than by running it and comparing output.

**NET-NEW — verified absent from the legacy suite:** no `SkuTest`, `OptionTest`, `OptionGroupTest` or
`ProductTypeTest` exists. No `ProductServiceTest`, `SkuServiceTest`, `BrandServiceTest` or `OptionServiceTest`
exists — **therefore all 28 public service members of §10.1 are net-new coverage**, including `createSkus`
and `getProductSkusBySelectedOptions`. No `SkuDAOTest` or `OptionDAOTest` exists, so the option-resolution
query, the sorted-SKU `POWER(10, …)` ordering, the ten-way transaction-existence chain and both unused-option
queries are all net-new. `meta/tests/functional/admin/entity/ProductTest.cfc` is an **empty component with
zero test methods**. The structural coverage gate is **inert**:
`meta/tests/coverage/SlatwallCoverageTestBase.cfc` points `entityDirectory` at `/Slatwall/com/entity/`, a
path that does not exist in release 3.1.39, so `EntityCoverageTest.all_entities_have_test_cases()` cannot
meaningfully fail. Legacy suite scale: only **12 of 113** entity components have a dedicated test; the suite
totals 32 components and 98 methods; and there is **no line or branch instrumentation and no mocking library
anywhere** — which is also why this subtree declares no coverage threshold (§3).

**Three groups of cases cover concerns the legacy could not have covered, and they are net-new for a
structural reason rather than an incidental one. All three now live in `test/regression/issues.test.ts`,
because all three arrived there by the folds above.**

1. **Configuration loading.** The legacy has no configuration loader to cover — the datasource name is a
   literal at `config/configApplication.cfm:L2` and the ORM dialect is probed at run time in
   `config/configORM.cfm`.
2. **What each Lambda entry does at import time.** The legacy has no module graph in that sense at all: DI/1
   resolved collaborators by name at run time from a directory scan (`org/Hibachi/DI1/ioc.cfc:L546`), which is
   precisely the mechanism **R1** replaces. These cases assert that importing an entry constructs no container
   and reads no environment, and that the graph resolves only on first invocation (§6). They deliberately do
   **not** assert a per-surface module separation, because the frozen inventory has none to assert;
   `test/regression/issues.test.ts` records at its foot what that costs in coverage terms.
3. **Which connection each rebuilt collaborator holds inside a write boundary** — **M5** and **M6** — which
   the legacy had no equivalent of either, its commit being implicit at request end and gated on
   `getORMHasErrors()`. Those cases point the pool at a port nothing listens on and hand the rebuild a
   recording executor, so a single collaborator left pool-bound fails with a connection refusal instead of
   passing quietly. It is the only assertion in the subtree that can see that mistake, since `tsc` cannot and
   a happy-path database test would not.

**Which suite bodies live in which of the approved seventeen.** No coverage is dropped: each relocated body
sits inside one `describe` under a banner naming its origin, so it can be read as the file it would otherwise
be, and every host already owns the subject. The rows below sum to **twenty-two**.

The audit is executable: `grep -rh 'FOLDED IN FROM' test/ | wc -l` reports **22**, one uniform banner
for every row below. Each banner includes the folded subject exactly as the table names it, so the count and
the host/subject mapping are both asserted by `test/regression/issues.test.ts` rather than left as prose.

| Folded suite(s)                                                                                                                                                     | Host                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `handlers/productHandler`                                                                                                                                           | `services/ProductService.test.ts`             |
| `handlers/skuHandler`                                                                                                                                               | `services/SkuService.test.ts`                 |
| `handlers/brandHandler`                                                                                                                                             | `services/BrandService.test.ts`               |
| `handlers/optionHandler`                                                                                                                                            | `services/OptionService.test.ts`              |
| `integrations/ProductFeedQuery`, `integrations/googleIntegration`, `integrations/BaseIntegration`, `integrations/IntegrationContract`, `handlers/googleFeedHandler` | `integrations/ProductFeedBuilder.test.ts`     |
| `adapters/MySqlProductPersistence`, `adapters/MySqlBrandRepository`, `adapters/catalogAggregates`                                                                   | `adapters/MySqlProductRepository.test.ts`     |
| `adapters/UnitOfWork`, `adapters/UnitOfWorkSortOrder`                                                                                                               | `adapters/MySqlSkuRepository.test.ts`         |
| `adapters/SmartListQueryBuilder`                                                                                                                                    | `adapters/MySqlOptionRepository.test.ts`      |
| `adapters/schemaScopeRegistry`                                                                                                                                      | `adapters/MySqlProductTypeRepository.test.ts` |
| `domain/process/processObjects`                                                                                                                                     | `domain/Product.test.ts`                      |
| `handlers/httpResponse`, `handlers/entrySurface`, `config/env`, `config/container`, `config/writeBoundaryRebuild`                                                   | `regression/issues.test.ts`                   |

**Four groups of cases are additions rather than relocations, because nothing in the approved corpus
constrained their subject.** They are net-new and labelled so:

- **The composition root and the aggregate router** (`regression/issues.test.ts`). No approved suite reached
  `createCatalogContainer`, `getCatalogContainer` or `createRouter`, so nothing pinned the memoisation of the
  production graph, override propagation, the **`true === available`** polarity of the uniqueness probe, which
  boundary stub a graph selects, the per-transaction rebuild, invocation-hook ordering, or the aggregate
  address space. Twelve cases now do. The polarity one is asserted as a **sequence** — bare title, `-2`, `-3` —
  because an inverted probe either never terminates or hands out duplicates, and neither failure is a type
  error.
- **The build package** (`regression/issues.test.ts`). Eight cases run the real build through a child process
  and assert the six entries, the production manifest, transitive closure staging, containment of every
  external inside the package, and that a post-emit failure leaves **no** package behind (§6).
- **The feed end to end** (`integrations/ProductFeedBuilder.test.ts`). Six cases dispatch the public route over
  a real graph with only the `SqlExecutor` substituted, so the captured query description, the emitted joins
  and filters, real aggregate hydration and the final document are asserted in **one** chain rather than four
  separate ones (§11).
- **The settings boundary adapter** (`adapters/MySqlProductRepository.test.ts`). A review measured
  `src/adapters/settings/StaticSettingResolver.ts` as the one converted implementation no suite named: it was
  reached only transitively, and `setting()` with its four refusal branches carried no direct assertion.
  Eighteen declarations now cover the sixteen literal names, both interpolated dimension forms, the
  `productDisplayTemplate` empty-string answer that the legacy engine's own initialised value produces, all
  three computed names that **refuse** rather than inventing a substitute, the unmapped-size refusal, the
  separate deprecated-name table, and the three seeded fulfillment rows. The host is the approved suite that
  already owns the setting-name question — `globalImageExtension` and the closed-union pin are asserted there,
  and `src/adapters/mysql/MySqlProductRepository.ts` is the module that imports the deprecated table — so this
  closes the gap without an eighteenth suite, which AAP §0.3.1 does not declare. The module moves from 41.9 %
  to **100 % statement, branch and function coverage**.

**One structural difference, stated plainly so it is not mistaken for a gap.** Legacy tests extend a base
class that boots the entire FW/1 application and resolves services through DI/1 at run time
(`meta/tests/unit/SlatwallUnitTestBase.cfc:L49-L79`) — they are **integration tests**. Target tests import
the class under test directly and construct it with hand-written doubles from `test/support/` — they are
**unit tests**. That is only possible because of the ports, and a reviewer comparing the two suites should
expect the difference **by design**.

### 12.2 Two limitations that cap the strength of the evidence

Both are disclosed rather than papered over. Neither blocks the work; both change how the evidence should be
read.

- **`meta/docker/slatwall-local-dev/` does not exist.** It is cited as optional context for a Docker/Compose
  local setup, but `meta/` contains only `tests/` and `eclipse/`. Verified repo-wide: there is **no
  Dockerfile, no Compose file** and no Lucee or MySQL version pin anywhere. **The CFML runtime is therefore
  not reproducible in this environment, so no runtime comparison against original behaviour was performed.**
  This is a **static logic-extraction exercise**, and every behavioural claim in this port is grounded in
  source reading with a file-and-line locator rather than in observed execution.
- **The legacy test suite cannot be executed here at all.** MXUnit and CFSelenium are **not vendored**, and
  `meta/tests/readme.txt:L4-L5` requires an external CFIDE mapping for each. Combined with the absent CFML
  runtime, the suite cannot be run. Traceability in §12.1 is therefore **documentary** — established by
  reading legacy test source line by line, not by executing tests and comparing results. Stating that is
  more useful than implying a comparison that never happened.

### 12.3 Legacy-side versions, including what is not documented

Recorded so a reader can see exactly what the extracted logic runs on today — and, just as importantly, where
the legacy stack pins **nothing**, since those gaps are why the target stack could not be derived by
version-matching.

| Item                  | Value                                                                                        | Evidence                              |
| --------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------- |
| Slatwall release      | **3.1.39**                                                                                   | `version.txt:L1`                      |
| Mura CMS              | "Mura Version 6 or Newer"                                                                    | root `readme.md:L4`                   |
| ColdFusion            | "Coldfusion 9.0.1 or Newer" _[sic — the legacy spelling is preserved]_                       | root `readme.md:L6`                   |
| Railo                 | "Railo 4.1 or Newer"                                                                         | root `readme.md:L8`                   |
| FW/1 (Framework One)  | **2.1**                                                                                      | `org/Hibachi/FW1/framework.cfc:L1885` |
| DI/1 (Inject One)     | **0.4.2**                                                                                    | `org/Hibachi/DI1/ioc.cfc:L546`        |
| Datasource name       | **`Slatwall`** — a datasource handle, **not** a schema name                                  | `config/configApplication.cfm:L2`     |
| ORM dialect           | chosen at run time from a `cfdbinfo` probe across `MySQL`, `MicrosoftSQLServer`, `Oracle10g` | `config/configORM.cfm:L3-L14`         |
| Documentation         | `http://docs.getslatwall.com`                                                                | root `readme.md:L14`                  |
| Lucee                 | **NOT DOCUMENTED** — no pin anywhere                                                         | absent from root `readme.md`          |
| MySQL                 | **NOT DOCUMENTED** — no version pin; the dialect is selected at run time only                | —                                     |
| Hibernate             | **NOT DOCUMENTED** — supplied by the CFML engine's built-in ORM, no standalone in-repo pin   | —                                     |
| Taffy (REST)          | **vendored with no version declared** — out of scope regardless                              | `frontend/api/taffy/core/`            |
| MXUnit                | **NOT VENDORED** — an external CFIDE mapping is required                                     | `meta/tests/readme.txt:L4`            |
| CFSelenium            | **NOT VENDORED**                                                                             | `meta/tests/readme.txt:L5`            |
| MySQL JDBC driver     | **NONE vendored** — the connection is delegated entirely to the CF/Railo datasource          | —                                     |
| npm / Bower artifacts | **NONE** — no front-end package artifact exists outside this subtree                         | —                                     |

The standard applied throughout: where a fact could not be established from source it is recorded as **not
documented** rather than given a plausible value. Two of these rows shape §12.2 directly — MXUnit and
CFSelenium being absent is why the legacy suite cannot be executed, and Hibernate having no in-repo pin is
why the ORM behaviours the port must preserve (flush timing, session visibility, second-level caching) are
documented from the application's own code rather than from a dependency version.

### 12.4 Defect register — AAP §0.6.7's frozen D1–D21, plus the four correction aliases D22–D25

**The governing rule: legacy defects are carried across as flagged `TODO(parity)` annotations rather than
silently fixed.** Fixing any of them would violate behaviour preservation and make the port's output
incomparable to the legacy system , and Refactor Discipline Guideline 4 forbids it outright.
`no-warning-comments` is switched off permanently in the lint configuration so that a lint gate cannot make
that requirement unbuildable.

Scanning the in-scope files found **exactly three literal TODO comments**. The tables below are AAP §0.6.7's
**frozen D1–D21** — 21 entries, because the analysis surfaced eighteen further defects a competent engineer
would instinctively fix, and naming each one converts an invisible temptation into a documented decision.

**The plan's registers are frozen, and the port extends neither range.** AAP §0.6.7 is frozen at **D1–D21**
and AAP §0.6.6 at **M1–M8**, and no file in this subtree amends either. Over those ranges the port carries five
**correction aliases** — `D22`, `D23`, `D24`, `D25` and `M9` — so the whole trail is D1–D21 plus four defect
aliases and M1–M8 plus one mismatch alias. **The alias set closes at `D25` and `M9`**; nothing beyond them
exists in this subtree and nothing beyond them may be added. Two properties make the aliases safe to read:

- **An alias is a cross-reference, not a register entry.** It never appears as a twenty-second defect or a
  ninth mismatch, and no file states a register bound other than D21 and M8. A newly discovered observation is
  annotated by its locator alone — several already are, including the two `D10`-class scoping findings in
  `src/services/ProductService.ts`, which decline a number of their own.
- **The locator is the authority.** Every entry below leads with its `path:Lnnn`, which is the form AAP §0.8.2
  Guideline 6 asks for and the form anyone can verify without consulting a register. Where an alias and a
  locator disagree the locator wins; where a description and the code disagree, the code is the fact.

`src/ports/repositories/SkuRepository.ts` is the single index: it defines the five aliases once, states both
frozen bounds once, and records that nothing beyond them exists.

| Alias | Observation                                                                                                                                                                                                                                                                                                  | Legacy locator                                           | Where it is annotated, and what the port does                                                                                                                                                                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `D22` | `SkuDAO` mixes **logical entity names and physical table names** inside native statements, intra-file. The logical names arise because the framework prefixes an entity name with the application key at `org/Hibachi/HibachiDAO.cfc:L102-L106`, a mapping-layer convenience native statements never receive | `model/dao/SkuDAO.cfc:L132`, `:L135` versus `:L179-L211` | `src/ports/repositories/SkuRepository.ts`, and each affected member. **Both vocabularies are kept rather than unified** (§5.5): never "fix" a mapping-layer entity name to a physical one, and never assume a logical name works in a native statement                                                |
| `D23` | `getTransactionExistsFlag` **forwards arguments its own signature never declares**, which is how the two entity call sites scope the probe                                                                                                                                                                   | `model/service/SkuService.cfc:L285-L287`                 | `src/services/SkuService.ts`, `src/domain/sku/Sku.ts`, `SkuRepository.transactionExists`. **TR-1 tightens the loose signature to the observed `(skuID?, productID?)`**; the repository keeps the legacy declaration order `(productID, skuID)`, so exactly two lines cross the two orders — see §10.1 |
| `D24` | `processImageUpload` **returns the image-write boolean**, not the entity its own framework convention asks for (`org/Hibachi/HibachiService.cfc:L117`)                                                                                                                                                       | `model/service/SkuService.cfc:L210-L218`                 | `src/services/SkuService.ts`. The body has exactly two returns, `true` and `false`. **The port forwards that boolean**, so the observation records the legacy's departure from its own framework — not the port's from the legacy                                                                     |
| `D25` | `getFormattedOptionGroups` **answers a plain CFML struct keyed by option-group name**, so two groups sharing a name collapse and the earlier one is lost                                                                                                                                                     | `model/service/ProductService.cfc:L70-L80`               | `src/services/ProductService.ts`. **The port answers the same keyed shape** — `Readonly<Record<string, readonly SelectOption[]>>` — and preserves the collapse by accumulating through a `Map` before freezing                                                                                        |

**`D23`, `D24` and `D25` are places where AAP §0.4.2's target column and the legacy body disagree, and all
three resolve the same way: the legacy body states the contract, and TR-1 is the rule that tightens a loose
legacy signature to it.** §10.1 tabulates the three signatures.

**The three literal source TODOs:**

| ID      | Locator                                | Content and carry-over decision                                                                                                                                                                                                                                                                                                                                        |
| ------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D8**  | `model/dao/SkuDAO.cfc:L177`            | the sorted-SKU `POWER(10, …)` query is untested outside MSSQL and MySQL. Carried as `TODO(parity)`; targeting MySQL only is **consistent with the untested state**, not a resolution of it                                                                                                                                                                             |
| **D20** | `model/dao/ProductDAO.cfc:L64`         | a Railo-versus-ACF divergence in how arrays are handled for an `IN` clause. In TypeScript the divergence **does not exist**, so the two-branch conditional legitimately collapses to a single path — declared as an **intentional simplification with its reason recorded**, which is the honest treatment of a TODO whose precondition the migration itself satisfies |
| **D21** | `model/entity/ProductType.cfc:L92-L98` | `getInheritedAttributeSetAssignments()` returns **every** attribute-set assignment unfiltered. Boundary-stubbed, TODO carried                                                                                                                                                                                                                                          |

**The entity option-handling cluster** — three near-identically named structs, which is exactly why the port
introduces distinct typed accessors rather than parallel string-keyed maps:

| ID      | Locator                          | Defect                                                                                                                                                     |
| ------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1**  | `model/entity/Sku.cfc:L500-L510` | `getOptionsByOptionGroupCodeStruct()` initialises the **wrong** variable, then reads one that is never created — an undefined-variable error on first call |
| **D2**  | `model/entity/Sku.cfc:L512-L522` | `getOptionsByOptionGroupIDStruct()` writes into a **third**, differently-named struct, so it always returns empty                                          |
| **D3**  | `model/entity/Sku.cfc:L247-L251` | `getOptionByOptionGroupCode()` tests the **code** struct but indexes the **ID** struct with a code key, so it always misses                                |
| **D16** | `model/entity/Sku.cfc:L893-L910` | three in-source deprecation hints (`getOptionsByGroupIDStruct`, `getOptionsValueStruct`, `isNotDefaultSku`) preserved as deprecation annotations           |

**Missing and unreachable members:**

| ID      | Locator                                      | Defect                                                                                                                                                                      |
| ------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D4**  | `model/service/SkuService.cfc:L281-L283`     | `getSkuStocksDeletableFlag()` delegates to a DAO member that **exists nowhere in the repository**; ported as an explicit not-implemented boundary that documents the defect |
| **D5**  | `model/entity/Product.cfc:L631-L633`         | `getProductOptionsByGroup()` calls a `ProductService` method that does not exist                                                                                            |
| **D6**  | `model/service/ProductService.cfc:L180-L182` | reads `arguments.data` although the signature declares only `(product, processObject)`, so it is undefined at run time                                                      |
| **D15** | `model/service/ProductService.cfc:L82-L97`   | `buildSkuCombinations()` is private and only self-recursive — unreachable dead code, **not ported** (§10.1)                                                                 |

**Logic and caching defects:**

| ID      | Locator                                      | Defect                                                                                                                                                                                                                           |
| ------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D7**  | `model/dao/SkuDAO.cfc:L222-L226`             | `clearNextOptionGroupSortOrder()` has an **inverted guard** — the `cfif` at `:L223` tests `not structKeyExists(...)`, so the key is deleted only when it is already absent and the memoized sort order is never actually cleared |
| **D9**  | `model/dao/SkuDAO.cfc:L150-L168`             | `getProductSkus()` re-declares `var hql` mid-function and reads `fetchOptions` **unscoped**                                                                                                                                      |
| **D13** | `model/service/SkuService.cfc:L223-L269`     | both SKU-listing members index by an `arrayFind` result that can be **zero**, because the sorted query returns only option-bearing SKUs, and the assignment then throws                                                          |
| **D14** | `model/service/ProductService.cfc:L113-L126` | `processProduct_addOptionGroup()` adds only the **first** option of the new group to every existing SKU                                                                                                                          |
| **D19** | §10.3                                        | an option-less SKU fails `hasUniqueOptions()` on any product that already has option-bearing SKUs                                                                                                                                |

**Scoping defects that resolve naturally in TypeScript** — block scoping removes the hazard by construction,
and each is recorded as a **deliberate translation decision** so the behavioural difference stays visible:

| ID      | Locator                                    | Defect                                                                                                                               |
| ------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **D10** | `model/service/ProductService.cfc:L70-L80` | `getFormattedOptionGroups()` uses unscoped loop variables that leak into the component's shared scope — a genuine concurrency hazard |
| **D17** | `meta/tests/unit/Helper.cfc:L53`           | `productData` is assigned with no `var` and then read at `:L62` — the same class of defect, in the fixture the target suite reuses   |

**Integration defects:**

| ID      | Locator                                                    | Defect                                                                                                                                                                                                                                                       |
| ------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D11** | `integrationServices/google/Integration.cfc:L49`           | the component attributes carry `displayname="USA epay"` while `getDisplayName()` returns `"Google"` — a copy-paste artifact from the payment adapter it was cloned from. **Recorded, not corrected**, since the effective display name comes from the method |
| **D12** | `integrationServices/google/model/dao/FeedDAO.cfc:L52-L74` | broken, unreferenced SQL — a trailing comma after `SwProduct.calculatedTitle,`, an `INNER JOIN SwProduct` with no `ON` clause, and an unscoped result variable. Zero callers repo-wide; documented as dead and **not ported** (§11)                          |

#### The three signature corrections, recorded where the code is the fact

The three port-boundary observations of the table above — the transaction probe's arity, the image upload's
boolean, and the formatted option groups' keyed shape — each had a revision that resolved it the **other** way,
against the legacy body and in favour of AAP §0.4.2's tabulated cell. All three are corrected, and the
corrections are recorded rather than deleted, because "verified by declaration scan" is a claim about the
_members_, not a guarantee that every cell in a frozen table matches every body it describes.

| The claim that does not match the code                                                                                                                                                                     | What the code does                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SkuService.getTransactionExistsFlag()` takes **no arguments**, which would leave both entity call sites without their scoping identifier and the handler route answering a permanent `501`                | `getTransactionExistsFlag(skuID?, productID?)` forwards into the repository's own `(productID, skuID)` order, and the route answers the repository's boolean. `src/domain/sku/Sku.ts`, `SkuRepository.ts` and the in-memory double all agree |
| `SkuService.processImageUpload` answers `Promise<Sku>`, which would discard the write verdict the legacy returns                                                                                           | it answers `Promise<boolean>`, forwarding `ImagePathPort.saveImageFile`'s verdict, and `sku.processImageUpload` publishes that boolean                                                                                                       |
| `ProductService.getFormattedOptionGroups` answers `FormattedOptionGroup[]` — an array of `{ optionGroupName, options }` records — which is not the shape `model/service/ProductService.cfc:L71-L79` builds | it answers `FormattedOptionGroups` = `Readonly<Record<string, readonly SelectOption[]>>`, keyed by option-group name, with the legacy's last-write-wins collapse intact. `productHandler`'s response projection is keyed the same way        |

#### Five directed changes that are not defect entries and not departures

These are **not** carried legacy defects and carry no register identifier. Each cites an external authority, and
crucially **none of the five changes an outcome the legacy produced** — each either classifies a refusal the
legacy already failed, or refuses input the legacy's own upstream could not have supplied. That is what
separates them from the one declared departure below.

| Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Authority                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **The Google feed refuses rather than publishes malformed XML.** A value carrying a code point outside the XML 1.0 `Char` production — or, at a **raw** sink, `&`, `<` or `]]>` — is refused with a `DataIntegrityError` (**500**) instead of producing an unparseable 200. Every input the legacy rendered into a _well-formed_ document is byte-identical; only inputs whose legacy render had no defined XML parse diverge                                                                                                                                                                                                                        | XML 1.0 §2.2 `Char`               |
| **Three impossible product process routes answer `501`.** `addProductReview`, `addSubscriptionTerm` and `uploadDefaultImage` require _callable_ process objects that a parsed JSON body can never satisfy, so they return a classified `NotImplementedError` instead of a generic `500`. The members stay routable — §10.8 tabulates the measured boundary inventory these three sit inside                                                                                                                                                                                                                                                          | AAP §0.2.2.6                      |
| **The feed's additional-image reader has no silent default.** An unwired image boundary answers `501` rather than emitting a document with every `g:additional_image_link` silently missing                                                                                                                                                                                                                                                                                                                                                                                                                                                          | AAP §0.2.1.2                      |
| **`GOOGLE_FEED_HOST` is held to a host-authority grammar.** RFC 3986 §3.2.2 `host` with §3.2.3's optional port: userinfo, path, query and fragment delimiters (`@`, `/`, `\`, `?`, `#`), whitespace, control characters, empty labels and out-of-range ports are refused with a fail-fast `ConfigurationError` that never echoes the rejected value. **This forecloses no legacy outcome** — the value stands in for `CGI.HTTP_HOST`, and RFC 9110 §7.2 already _defines_ the HTTP `Host` field as exactly that grammar with userinfo excluded, so every value the legacy input could hold is admitted and only values it could not hold are refused | RFC 9110 §7.2 (CWE-20, CWE-601)   |
| **Every appended feed path is constrained to a same-origin relative path** at all three URL sinks — the item `link`, `g:image_link` and each `g:additional_image_link`: a leading `/`, never `//`, no scheme and no authority. **This forecloses no legacy outcome either** — `model/entity/Product.cfc:L206-L208` writes the leading slash into the composed literal, so the legacy could not emit a path without one                                                                                                                                                                                                                               | `Product.cfc:L206-L208` (CWE-601) |

Conversely, the **escaping census is _not_ a change of any kind**: the port reproduces the legacy's
six-escaped / nine-raw split exactly, and escaping the other nine sinks would itself be a second declared
departure. See §10.7.

#### The one declared departure from behavioural preservation

Stated exhaustively, because the value of this register is that anyone comparing generated output against
legacy output has a **closed** list of places where a difference is intended. There is exactly **one**.
Everything else in §12.4 either carries a legacy behaviour unchanged or classifies a failure the legacy
already produced.

**Parameterized SQL in the importer — D18, licensed by AAP §0.6.7.7.**

`model/dao/ProductDAO.cfc` builds **21** statements via `setSql()` with direct interpolation of
**file-supplied** values — including `L165` `WHERE optionGroupName = '#optionGroupKey#'`, and further
instances at `L180`, `L184`, `L213`, `L219` and `L244`. That is an unparameterized **SQL-injection surface
fed directly from an uploaded file.**

The port uses `pool.execute()` with `?` placeholders throughout, which **structurally eliminates the entire
class of flaw**. AAP §0.6.7.7 declares this departure by name, so it needs no other authority.

**It is deliberate, documented hardening — never a silent fix**, and the suite asserts it so it cannot be
quietly reversed.

**Do not add a second entry for the feed's URL scheme.** Re-scheming the five absolute URLs from `http://` to
`https://` would close CWE-319 and would be a second departure, and AAP §0.6.7.7 licenses **exactly one** and
admits no proportionality test — which is the whole reason this register is a closed list.
`src/integrations/google/ProductFeedBuilder.ts` therefore composes **`http://`** at all five sinks,
byte-for-byte as `integrationServices/google/views/feed/product.cfm` composes them at `:L14`, `:L15`, `:L22`,
`:L23` and `:L24`, and the cleartext exposure is **carried and flagged** as a `TODO(parity)` at that file's
`FEED_SCHEME_PREFIX` declaration rather than closed. Two suite cases assert the scheme census explicitly, so
the scheme cannot change silently. Closing CWE-319 requires separately authorised scope, exactly as §13.4 says
of every other carried exposure.

**What is not a scheme question at all.** `xmlns:g="http://base.google.com/ns/1.0"` stays `http://`
because an XML namespace name is an **identifier compared byte-for-byte**, not a fetch target — changing it
would silently invalidate every `g:` element for every consumer. The Google Merchant specification URL quoted
in `src/integrations/google/README.md` is likewise reproduced as the legacy view header wrote it.

### 12.5 Execution-model mismatches — AAP §0.6.6's frozen M1–M8, plus the one correction alias M9

Eight are frozen in AAP §0.6.6 and tabulated below. Each is presented as a **decision surfaced**, with its
source-declared value and locator, and with **no invented figure of any kind**.

**AAP §0.6.6's range stops at M8, and `M9` is a correction alias over it** — the same arrangement §12.4
describes, governed by the same three rules. The observation it names is real: CFML specifies **no iteration
order** for a plain struct, while the port's `Map` preserves first-seen insertion order, so the combination
engine's enumeration order is guaranteed here in a way the legacy never guaranteed it. Its home is
`src/services/SkuService.ts` and its locators are `model/service/SkuService.cfc:L82` and `:L106` inside the
engine at `:L58-L211`. It matters because that enumeration order determines both the generated SKU set and,
through the read-back loop of §10.3, the order in which uniqueness validation observes its siblings — so a
defined order is **stricter** than the legacy's and is recorded rather than relied upon. `M9` is the only
mismatch alias, it closes the set, and it is never presented as a ninth entry of AAP §0.6.6.

| ID     | Mismatch                                                                                                                                                                                                                                                                                                    | Why it does not map to one Lambda invocation                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1** | a **3600-second** request budget in the importer — `model/service/ProductService.cfc:L65-L68`, `cfSetting(requesttimeout="3600")`                                                                                                                                                                           | AWS Lambda's maximum function timeout is **15 minutes**, so a 3600-second budget is **unrepresentable** in a single invocation. The importer's handler is documented as requiring an out-of-band model — chunked or queued — and is **not silently re-timed to fit**                                                                                                                                                                                                          |
| **M2** | a **360-second** feed render — `integrationServices/google/views/feed/product.cfm:L9`, `requesttimeout="360"`                                                                                                                                                                                               | it fits the function ceiling but far exceeds what a **synchronous request-response integration** in front of the function will generally allow. **No single figure is named for that second ceiling**, because there is not one to name: those limits vary by gateway type, region and configuration, several are themselves configurable, and **this deliverable selects no gateway**. The choice between asynchronous and streamed delivery is left as an explicit decision |
| **M3** | **per-row transactions** in the importer — `model/dao/ProductDAO.cfc:L176-L177`, where `transaction{` opens **inside** the record loop                                                                                                                                                                      | each row commits independently, so a mid-file failure leaves a **partially imported catalog**. `UnitOfWork` reproduces per-row commit boundaries rather than wrapping the whole import                                                                                                                                                                                                                                                                                        |
| **M4** | a remote file fetch **inside** the transaction-bearing request — one live `cfhttp` at `model/dao/ProductDAO.cfc:L87`; the only other retrieval text, a `new http()` sequence at `:L89-L98`, is commented out under the note at `:L88` and is therefore an abandoned alternative rather than a live fallback | network I/O performed inside the request, compounding M1 and M3                                                                                                                                                                                                                                                                                                                                                                                                               |
| **M5** | request-scoped implicit commit — `flushAtRequestEnd=false` with a double `ormFlush()` at request end, **gated on the ORM having no errors**                                                                                                                                                                 | there is no request-end hook in a stateless handler; `UnitOfWork` makes the boundary explicit per invocation                                                                                                                                                                                                                                                                                                                                                                  |
| **M6** | the **validation read-back loop** of §10.3                                                                                                                                                                                                                                                                  | the highest chance of silently changing results anywhere in the slice                                                                                                                                                                                                                                                                                                                                                                                                         |
| **M7** | second-level caching — `cacheuse="transactional"` on **111 of 113** entities — plus lazy per-instance caches and the memoized option-group sort order at `model/dao/SkuDAO.cfc:L204-L226`                                                                                                                   | nothing survives between invocations except module-scope state, so **memoisation is scoped to the request object rather than the module**, to avoid cross-tenant bleed on a warm container                                                                                                                                                                                                                                                                                    |
| **M8** | an out-of-band `cfthread` in the excluded setting service                                                                                                                                                                                                                                                   | out of scope, but it constrains the contract: `SettingResolverPort` is declared **synchronous**, so no caller in the slice depends on background completion                                                                                                                                                                                                                                                                                                                   |

**None of these is presented as a performance figure or a service-level target; this deliverable states only
what the source declares.** The only timing **budgets** named anywhere in this subtree are M1's 3600 seconds
and M2's 360 seconds, and each is source-declared with a locator. The one platform limit quoted above —
Lambda's 15-minute maximum function timeout — is a published ceiling, not a commitment made here.

No figure is put on M2's second ceiling. The default integration timeout of one gateway product is not a
universal limit — it is configurable on that product, differs on others, and no gateway is part of this
deliverable — so naming one would be the invented ceiling IR-12 forbids. `src/handlers/googleFeedHandler.ts`
and `src/adapters/mysql/SmartListQueryBuilder.ts` state the same thing in their own notes.

**M2 is about time, and the other four dimensions of the feed's work are bounded elsewhere** (all four
CWE-400): how many _rows_ a selection can be forced to hydrate, how _complex_ a statement can be made, how
many _images_ one record can expand into, and how many _bytes_ the buffered document can reach. All four are
operator-supplied figures from §8, each applied fail-closed and each **refusing** rather than truncating;
§8.1 sets them out. Leaving M2 open does not leave any of the four unbounded, and the five must not be
conflated — nor does bounding the four settle M2, which is why the seam in §8.1 stops short of naming a
duration.

Noted once, and deliberately **absent** from the inventory above: the legacy **60-second and 45-second
session locks in `OrderService` and `PaymentService`** were to be noted but not implemented. Those services
are out of scope, no session-locking mechanism appears in the target design, and they are therefore **not**
among the frozen M1–M8 above and are annotated nowhere else in this subtree.

---

## 13. Provenance, licence and the additive-only invariant

### 13.1 Provenance and licence

**Slatwall — An Open Source eCommerce Platform, Copyright (C) ten24, LLC** (root `readme.md:L32-L33`),
release **3.1.39** (`version.txt:L1`). Project site `http://www.getslatwall.com` (root `readme.md:L29`);
documentation `http://docs.getslatwall.com` (root `readme.md:L14`).

Root `readme.md:L20` states that "Slatwall is released under the GPL v3.0 license (with a special exception
described below)." A copy of the GPL is distributed with the application as `GNU_V3_Copy.txt`.
`package.json` declares `"license": "GPL-3.0-or-later"` accordingly, so this subtree carries the same terms
as the application it is extracted from.

### 13.2 Why this subtree sits at the repository root

The GPL exception in root `readme.md` attaches conditions to combining custom code with the application, and
one of them (root `readme.md:L63-L65`) provides that custom code "must not alter or create any files inside
Slatwall, except in the following directories: `/integrationServices/`".

**The additive-only invariant is what keeps this deliverable consistent with that clause: nothing existing is
altered.** The CFML tree is byte-for-byte untouched — not one `.cfc`, not one `.cfm`, not `config/**`, not
`meta/**`, not the repository-root `readme.md` and not the repository-root `.gitignore`. The location is fixed
by the plan as a new top-level `slatwall-ts/` directory, **sibling to `model/`, `org/` and
`integrationServices/`** (AAP §0.1.1.1, §0.3.1).

**Do not relocate this subtree under `/integrationServices/`.** That directory is the legacy plug-in
extension point, discovered on the ORM CFC path by the CFML engine; this is a standalone Node package with its
own manifest, lockfile and build, and moving it there would place a Node project inside the CFML component
scan path while changing nothing about the invariant that already holds.

### 13.3 What was deliberately not touched

The invariant, quoted from AAP §0.4.1.1: **"Every target file is CREATE. Every legacy file is REFERENCE.
There are zero UPDATE rows in this plan."**

- **The repository-root `.gitignore`** — verified to still hold exactly its original **15** entries, in order:
  `*.project`, `*.settings`, `*.DS_Store`, `*.zip`, `*.lic`, `*.pfx`, `_notes/`, `aspnet_client/`,
  `settings.xml`, `ehthumbs.db`, `thumbs.db`, `settings.xml/`, `logs/`, `WEB-INF`, `.rdsTempFiles/`. None of
  them covers `node_modules`, `dist` or `coverage`, and rather than adding Node patterns there, this subtree
  carries its own `slatwall-ts/.gitignore` scoped to itself. That is the reason the file exists.
- **The repository-root `readme.md`** — the extracted service is documented here rather than by editing
  legacy documentation.
- **Every remaining legacy tree** — `config/`, `meta/`, `model/`, `org/` and `integrationServices/` — and
  every `.cfc` and `.cfm` source file. All six of this file's source references — root `readme.md`, `version.txt`,
  `integrationServices/google/views/main/default.cfm`, `config/configApplication.cfm`, `config/configORM.cfm`
  and `meta/tests/readme.txt` — were **read and cited, never edited**.

**There is no CI/CD configuration to update.** Verified repo-wide: the repository has no build system, no
web-server configuration, no containerization and no continuous-integration pipeline — `.github/workflows/**`
and `.gitlab-ci.yml` do not exist, and neither does any root dependency manifest. A conventional
dependency-update sweep would touch build, workflow and lockfiles across a repository; here there are none to
touch, and stating that is more useful than listing patterns that match nothing.

### 13.4 The Minimal Change Clause, both halves

The governing constraint has two directives inside it, and conflating them would produce the wrong
deliverable:

- **Minimal in functional scope.** No module outside the catalog-plus-Google slice is converted — Refactor
  Discipline Guideline 3, and it is a fact about this deliverable rather than an intention: §9.2 draws that
  boundary exhaustively and §13.3 satisfies it absolutely, with zero modifications anywhere in the CFML tree.
  Guideline 5, isolation in dedicated modules, is satisfied by the same construction — the whole port lives
  under this one subtree with its own manifest, lockfile, compiler, test, lint, format and build
  configuration (§5.1), and §13.2 explains why it sits where it does.
- **Explicitly _not_ minimal in idiom.** Verbatim: _"It does not mean preserving CFML idioms in TypeScript;
  idiomatic, conventional TypeScript is expected."_ That is the licence behind every translation in §5.2 —
  DI/1 property injection becoming constructor parameters, dynamic `getService()` lookups becoming typed
  imports, `super.save()` becoming composition, and `onMissingMethod` synthesis becoming explicit
  declarations. A reader who mistook "minimal change" for "faithful syntax" would object to all four.

**The line between the two is behaviour.** Idiom may change freely; observable behaviour may not — which is
why the legacy `throw` message strings, the odometer enumeration order and the five option-resolution
semantics of §10.2 are reproduced exactly while the mechanisms around them are rewritten.

**Seven categories of control have no legacy equivalent at all. Two different tests decide them, and an
earlier revision of this section stated only the first — which left four of the seven mis-described.** A
review measured that gap; the corrected statement is below, and it is the one to read.

**Test 1, for a control that judges a value.** A control that **forecloses no outcome the legacy could
produce** is not a behavioural departure, so AAP §0.6.7.7's single-departure budget never speaks to it; a
control that changes bytes the legacy publishes unmodified would be a second departure, and §0.6.7.7 licenses
exactly **one** — D18's SQL parameterization — with Guideline 4 admitting no proportionality test. That is a
cardinality argument rather than a merits argument, and it is deliberately so: the register's value is that
anyone comparing generated output against legacy output has a closed list of entries to check, and an
undeclared second entry destroys the property however defensible it is on its own. **Four of the seven rows
below are the ones this test governs**: the three marked "not implemented", each of which passes by being
absent, and the **transaction-locking reads**, which pass while present — a lock is acquired only by a reader
already bound to a transaction-scoped executor, a boundary the legacy had no equivalent of, and a pool-bound
instance emits exactly the statement `org/Hibachi/HibachiDAO.cfc:L140` composes.

**Test 2, for a control that decides whether a request is served at all.** The remaining three rows — the
**SKU-combination** ceiling, the **URL-title probe** ceiling and the **import-source policy** seam — are not
judgments about a value, and Test 1 does not fit them. Each is **fail-closed**: with its variable or its seam
unsupplied the route that applies it **refuses**, where the legacy always proceeded. So they plainly **do**
foreclose an outcome the legacy could produce, and stretching Test 1 over them would be the dishonest reading.
The reason they are nonetheless not §0.6.7.7 entries is different and narrower: **§0.6.7 is a register of
twenty-one _business-logic_ defects**, and neither a resource ceiling nor an address policy is a business rule.
Each changes **whether** a request is served, never **what** a served request answers — inside the budget, and
for a source the operator's policy admits, every byte, every enumeration order and every error key is the
legacy's. Availability is therefore outside what the register governs, in both directions: these controls are
not entries in it, and neither would their absence be.

**Two things keep that from being a licence, and they apply to all six `CATALOG_*` bounds of §8.1, not only to
the two named as rows here.** The cost is **stated rather than buried** — §8.1 owns it per variable,
`.env.example` repeats it per name, each implementing module says so at its own site, and
`test/services/SkuService.test.ts` pins the refusal. And **no figure is authored anywhere**: every one of the
six must be supplied by the operator, which is IR-12 in force rather than merely respected.

**One correction to the record, because the artifact trail is meant to be followable.** Commit `4ecb997de`'s
message lists "SKU combination and URL-title probe ceilings" among hardening it **withdrew**. The tree
contradicts that, and the tree is authoritative: both ceilings are live and required — `SkuCombinationBudget`
is a required constructor collaborator of `src/services/SkuService.ts`, and `UrlTitleProbeBudget` is the
required fourth argument of `createUniqueURLTitle` in `src/util/urlTitle.ts`. What was actually withdrawn is
narrower and is two separate things: the **port-authored default figures**, so the operator now supplies every
one, and the **standalone `util/urlTitleProbeBudget.ts` module**, whose control moved into the utility it
applies to (§5.5). They were **converted to fail-closed operator-supplied gates, not removed.** Read that
commit message with this paragraph beside it.

**This table is the authoritative statement of where each category stands; read it rather than the narrative
in any individual source file.** Four are implemented and three are not.

| Category                                                                       | Status                                                         | Where it lives, and what happens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL **userinfo** and **control-character** refusal in the brand URL check      | **not implemented**                                            | `isCfUrlAnyProtocol` in `src/validation/Validator.ts` is the bare six-protocol check — `(https?\|ftp\|file)://` or `(mailto\|news):`, non-empty, no internal whitespace — and judges nothing else. A stored `brandWebsite` may carry a control character (CWE-113/CWE-117) or a deceptive `user@host` authority (CWE-601) exactly as the legacy permits                                                                                                                                                                                                                                         |
| a runtime guard refusing unrecognised **validation-context** tokens            | **not implemented**                                            | the closed nine-member `ValidationContext` union is the whole constraint, and it is compile-time only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| broadened **feed escaping** and URL **percent-encoding**                       | **not implemented**                                            | the serializer reproduces the legacy's six-escaped / nine-raw split exactly and appends no percent-encoding. The injection half is nonetheless closed **by refusal**: a raw sink rejects `&`, `<` and `]]>`, and every sink rejects code points outside the XML 1.0 `Char` production, so an unparseable document becomes a `DataIntegrityError` (**500**) — see §10.7                                                                                                                                                                                                                          |
| an **SKU-combination** ceiling                                                 | **live and required**                                          | `SkuCombinationBudget`, a required constructor collaborator of `src/services/SkuService.ts`, resolving `CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST`. Unset means the routes that apply it **refuse**, naming the variable — never unbounded. §8.1 states the cost                                                                                                                                                                                                                                                                                                                                 |
| a **URL-title probe** ceiling                                                  | **live and required**                                          | `UrlTitleProbeBudget`, the required **fourth argument** of `createUniqueURLTitle` in `src/util/urlTitle.ts`, resolving `CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION`. Only the standalone `util/urlTitleProbeBudget.ts` module was removed — the control moved into the utility it applies to (§5.5)                                                                                                                                                                                                                                                                                            |
| an **import-source (SSRF) policy**                                             | **live as a required seam**, with no in-port address apparatus | `ProductImportSourcePolicy` on `src/ports/repositories/ProductRepository.ts` is a **non-optional** member, and `MySqlProductRepository.importFromFile` calls `sourcePolicy.validateSource(fileURL)` unconditionally before any read. The port **decides no address policy of its own** — the ~420 lines of IPv4/IPv6/loopback apparatus and `ImportSourceRejectedError` are gone, and the adapter's own default implementation raises not-implemented, so an unwired deployment refuses rather than fetching. CWE-918 is therefore **delegated to the operator**, not carried silently (**M4**) |
| **transaction-locking reads** in the uniqueness probes and the sort-order read | **live inside a write boundary**                               | `src/adapters/mysql/UniquePropertyChecker.ts` and `src/adapters/mysql/UnitOfWork.ts` append `FOR UPDATE` when — and only when — the reader is bound to a **transaction-scoped** executor. A pool-bound instance emits exactly the statement `org/Hibachi/HibachiDAO.cfc:L140` composes, because on an autocommit connection the lock would buy nothing                                                                                                                                                                                                                                          |

**What is still carried rather than closed, stated plainly.** That is the uncomfortable half of Guideline 4:
the brand-URL exposures above; the escaping divergence at nine feed sinks; the feed's cleartext `http://`
scheme (CWE-319, §12.4); and the residual CWE-367 race that no lock can reach — a locking read binds only
writers that take it, so a legacy CFML request, an administrative `INSERT` or a future service that skips
validation is unbound, and for `optionCode` and `optionGroupCode`, which have **no** `unique="true"` column
behind them, the application-side check is the only check. **Closing any of these requires separately
authorised scope, and it cannot be established through tests alone.**

**Two feed exposures are closed, and they are not departures either.** A **host-syntax rule** for
`GOOGLE_FEED_HOST` (CWE-20) and a **relative-path rule** at the three URL sinks (CWE-601) are both in force,
and neither forecloses any outcome the legacy could produce — §12.4 sets out both arguments. The URL **scheme**
is the case that would be a difference, which is why the feed emits `http://` and §12.4's departure list has
one entry. The general rule holds: **the authority has to be external and it has to be cited.**

**The feed's product-image reader is a named boundary rather than a constant.** A constant-empty reader would
render a product with three images as a product with none and report nothing, which is materially worse than a
refusal, so the graph supplies a reader that answers `[]` **only** for a product whose image collection is
genuinely empty and **raises** for one that carries images. The per-image path comes from
`model/entity/Image.cfc:L79-L81`, an entity AAP §0.2.1.2 does not include, so the boundary is one value wide
and is named rather than approximated.

### 13.5 Rules, and the standards that stand in for them

**`review_rules` returns "No user rules provided."** It was read in full rather than sampled — the default
window and then explicit paginated ranges including `view_range=[1,-1]`, re-checked on separate occasions —
and every read returned that single line with no remainder, so the document is complete at one line rather
than merely truncated. A filesystem scan corroborates it from a second direction: no `.blitzyignore`, `.cursorrules`,
`AGENTS.md`, `CLAUDE.md`, `.editorconfig` or repository-level lint, format or CI configuration exists anywhere
outside this subtree. **Zero files enter scope by rule, and no rule-derived constraint appears anywhere in
this deliverable.**

That absence is **not permission to lower the bar.** It shifts the burden onto documenting the standards
explicitly, which is what the nine below do. They are binding on this subtree, and each is verifiable rather
than aspirational:

1. **Strict type safety** — `strict`, `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`,
   compile-proved by `tsc --noEmit` (§3).
2. **Parameterized SQL everywhere** — every statement bound through `pool.execute()` with `?` placeholders,
   and identifiers built only from validated whitelists (§5.2). This is the mechanism that eliminates D18's
   injection surface (§12.4).
3. **Explicit dependency injection** — constructor injection only, one composition root, no service locator
   and no dynamic method synthesis; the four dead injections dropped and the eleven synthesized members
   declared (§5.2).
4. **Hexagonal separation** — `domain`, `ports`, `adapters`, `services` and `handlers` kept distinct, with
   **all AWS coupling confined to the handler layer** (§5.1, §5.3), which is the property that makes a future
   runtime move a four-artifact change (§2.2).
5. **Exact-version dependency pinning** — real verified versions, a justified `engines` floor and a committed
   lockfile; never `latest`, never a placeholder (§2.1, §4).
6. **One test per converted method, explicitly labelled** — every suite marked TRACEABLE or NET-NEW, with the
   honest ratio published rather than smoothed over (§12.1).
7. **Preserve and annotate, do not repair** (AAP IR-9) — the 21 legacy defects of the frozen register carried as flagged
   `TODO(parity)` annotations, with the **one** declared departure (**D18**) and its reasoning (§12.4). The four
   further port-boundary observations are carried **by source locator, under the correction aliases D22–D25**,
   and are additions to the record, never repairs to the code (§12.4). Of the seven categories of control that
   have no legacy equivalent, **four are implemented on an external authority and three are not** — §13.4
   tabulates where each one stands and is the authoritative account.
8. **Flag mismatches rather than assume them away** — the eight frozen execution-model mismatches, plus the
   struct-iteration-order observation carried by locator under the correction alias **M9**, surfaced as
   decisions rather than resolved by guesswork (§12.5).
9. **Invent nothing** — no SLA, latency target, throughput figure, availability number, capacity estimate or
   coverage threshold appears anywhere; where a fact could not be established from source it is recorded as
   **not documented** rather than given a plausible value (§12.3).

Should rules be supplied in a later iteration, **`review_rules` is the authoritative source for their complete
text.** Page through it in full rather than relying on any summary — including this one.

### 13.6 A note on what is not here

There is no user-interface work in this refactoring and consequently no design-system alignment to perform.
The target is a headless service (§7); the repository's three view layers are out of scope (§9.2); and the one
in-scope file carrying a `.cfm` view extension emits RSS 2.0 XML for machine consumption by a merchant feed
processor rather than rendering an interface, so its port `ProductFeedBuilder.ts` is a **serializer, not a
component**. No component library or design system is named anywhere in the brief and none is present in the
repository to align to, so none is catalogued here.
