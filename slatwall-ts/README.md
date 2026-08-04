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
  build configuration, which is what makes the whole deliverable reviewable as a single additive diff.
  The isolation from the ColdFusion application is **static and verified as such**: no legacy file, import
  path or configuration entry was changed (§13.3 enumerates what was deliberately left alone, including
  the root `.gitignore` and `readme.md`), nothing in the CFML tree references this directory, and no CFML
  mapping, ORM path or `<cfinclude>` reaches into it — so there is no mechanism by which its presence
  could reach the running application. **What was NOT done is execute the comparison**: as §12.2 records
  in full, the repository cannot reproduce a CFML runtime here — `meta/docker/slatwall-local-dev/` does
  not exist and no Lucee, Railo or MySQL version is pinned anywhere — so no before-and-after run of the
  legacy application was performed and none is claimed. Read the isolation as a property of the diff,
  which it is, and not as an observed runtime equivalence, which was never measured.

**Authority for this file:** AAP §0.3.1, §0.4.1.2 (the package-surface CREATE row) and §0.5.6.2 — "build,
test and package commands; runtime and toolchain versions; the documented scope boundary."

### The artifact trail, indexed

AAP §0.8.5 requires a trail "a skeptical technical reviewer can follow end-to-end". This file is the
project-guide leg of it, and the registers that carry the load are listed here so none has to be hunted
for. Each is stated **once**, in the section named — deliberately not duplicated, because two copies of a
register are two things that can disagree, and this subtree treats a second copy of a fact as a defect
rather than as redundancy.

| What a reviewer needs to check                                                                                                                                                                       | Where it is                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **T1–T5** — the five option-to-SKU semantics that must survive translation, each named as a silent-drift trap, with the translated SQL shape and the bound-parameter order                           | §10.2                          |
| **The validation read-back loop** — the highest-risk item in the slice: a declarative rule that executes a query against rows the same operation is writing, and how `UnitOfWork` resolves it        | §10.3, with **M6** and **D19** |
| **The combination engine** — the odometer enumeration whose order determines both the generated SKU set and what uniqueness validation observes                                                      | §10.4                          |
| **The three seeded discriminator UUIDs** — fixed data, not test data (**IR-7**), reused verbatim in the fixtures                                                                                     | §10.5                          |
| **The 28 preserved public members** — interface parity, method by method, with every tightened signature recorded                                                                                    | §10.1                          |
| **D1–D21** — the full defect register, carried as flagged `TODO(parity)` annotations rather than repaired, plus the **two** declared departures and the four further observations carried by locator | §12.4                          |
| **M1–M8** — the execution-model mismatches, flagged rather than silently resolved, each with its source-declared value and locator                                                                   | §12.5                          |
| **Test provenance** — TRACEABLE versus NET-NEW, in both directions, with the honest ratio leading                                                                                                    | §12.1                          |
| **What caps the evidence** — the absent local development setup and the legacy suite that cannot be executed here                                                                                    | §12.2                          |
| **Scope** — the thirty in-scope legacy files, the exclusions, and the calculated-property boundary                                                                                                   | §9                             |

---

## 1. What this is, and why it is shaped this way

### 1.1 The exercise

This is a **de-risking rehearsal**. The technique being validated is the extraction of business logic from a
ColdFusion monolith into TypeScript on Lambda; it is performed here on a comparable open-source legacy
codebase so that the technique itself can be proved before it is pointed at production code. The value of
the deliverable is therefore not only that it builds — it is that a reviewer can follow every decision back
to the legacy line that forced it.

That is why this file reads the way it does. Every claim about the existing system carries an inline
`path:locator` citation, so a reviewer can verify any statement against source without trusting the
narrative, and every uncomfortable finding is stated here rather than deferred: the thin legacy test signal
(§12.1), the local development setup that does not exist (§12.2), the legacy suite that cannot be executed
(§12.2), the twenty-one carried defects (§12.4), the eight execution-model mismatches (§12.5), and the one
deliberate departure from exact behavioural preservation (§12.4, **D18**).

The same discipline covers the translation decisions themselves rather than only the disclosures: the five
option-to-SKU semantics **T1–T5** and the SQL they translate to (§10.2), the validation read-back loop that
is the slice's highest-risk item (§10.3), the combination engine whose enumeration order is observable
behaviour (§10.4), and the three seeded discriminator UUIDs that are fixed data rather than fixtures
(§10.5). The index above lists all of them with their sections.

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
empty TypeScript classes and silently lost the system's behaviour. The relocations are enumerated in §5.2
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

⚠️ **THIS TABLE WAS PRINTED TWICE, WITH TWO DIFFERENT `engines.node` VALUES.** Review finding **F7**
reported the duplication: a revision appended a corrected table rather than substituting it, so the section
opened with `>=20.19.0` and then immediately restated the same six rows with `>=20.20.2`. There is now one
table, and §2.1 gives its derivation.

The running toolchain in this checkout is Node **v20.20.2** with npm **10.8.2**, which matches `.nvmrc`
exactly, so the pin and the machine agree. A newer Node may also install successfully — **do not "correct"
the pins on that basis.** `.nvmrc` stays `20.20.2`, `engines.node` stays `>=20.20.2`, `@types/node` stays
`20.19.43` and `typescript` stays `5.9.3`; these are express instructions, not artifacts of one machine, and
§2.2 explains why the Node pin in particular is deliberate.

Two things are **not** prerequisites, stated so nobody goes looking for them: a database is needed only to
_run_ the service — the build and the whole test suite need none — and **an AWS account is not required for
anything in this document**.

### 2.1 The floor, the pin, and the runtime string that is only prose

**`engines.node` is `>=20.20.2`, and it is a FLOOR. `.nvmrc` is `20.20.2`, and it is a PIN.** They presently
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
for.** The derived value is a lower bound on what the dependency GRAPH tolerates; it is not a ceiling on what
the PROJECT may require. Every version `>=20.20.2` admits also satisfies `^20.19.0`, so declaring the verified
version states a real constraint rather than inventing one — and it is the version `.nvmrc` already pins, the
version the whole toolchain was validated on, and the floor this project's setup contract names. Review
finding **F6** required it. The figure now appears in exactly four places, all agreeing: `package.json`,
`package-lock.json`'s root `packages[""]` entry, `jest.config.ts`'s derivation note, and the table above —
and `test/regression/issues.test.ts` asserts all four, so they cannot drift apart again.

⚠️ **The history is kept because the number has moved twice.** A revision raised the floor to the pin; an
**earlier review round** objected that the plan's derived bound is the plan's own figure, and it was returned
to `>=20.19.0`; **F6** requires the pin again, on the reasoning above — the derived bound is a floor on what
the graph tolerates, not a ceiling on what the project may require. A future proposal to lower it should
answer that reasoning rather than re-derive the graph bound, which nobody disputes.

⚠️ **A note on finding labels, because they collide across rounds.** An unqualified **`F<n>`** anywhere in
this document is a finding of the **current** review round, whose report enumerates F1–F11. Earlier rounds
numbered their own findings from `F1` as well, so a reference to one of those is written **"an earlier review
round"** followed by the subject rather than a numeral — the same reason §12.4 carries observations by source
locator instead of by a minted identifier. Labels of the form `SEC-<n>`, `CQ-<n>`, `API-<n>` and `ARCH-<n>` do
not collide and are used as they were issued.

📐 **On the runtime row, the precise claim is about DECLARATIONS rather than about the string.**
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
  <br>📌 If a review proposes **24 March 2026** as the upstream EOL — it has been proposed twice — that
  date appears in no column of the `20.x` row. Settle it by reading the schedule, which `tsconfig.json`
  quotes in full, rather than by amending this line.
- **The current control-plane gates are a single schedule**, from the AWS runtimes table as read on
  **3 August 2026**: creating a new function on `nodejs20.x` is blocked from **1 February 2027**, and
  updating an existing one from **3 March 2027**. Both are still ahead.
- **Two earlier schedules are obsolete and are named only as superseded history — for two different
  reasons.** An earlier revision of this section presented three sets as live, unsettled alternatives, and
  its replacement over-corrected by claiming both earlier pairs had "now elapsed without taking effect".
  That is true of only the first. **1 June / 1 July 2026**, from the first AWS bulletin, has elapsed and
  observably without effect. **31 August / 30 September 2026**, from the standard 30-day/60-day cadence,
  has **not** elapsed — as of the read date above both dates are still ahead, and what retires the pair is
  AWS's current table stating the later 2027 dates, not the calendar. Re-check it against the table, and do
  not read the arrival of 31 August 2026 as confirming or refuting anything. Both are previous revisions of
  a forecast that moved, not competing readings of a present fact. AWS states that it is delaying these dates for some runtimes in response to customer
  feedback, that it will not begin blocking before the dates in its own tables, and that those dates are
  forecasts subject to change — so the revisions move **later, never earlier**, which is what makes an
  out-of-date entry here a conservative error rather than a dangerous one. `tsconfig.json` carries the full
  dated account and is the single place these dates live; **in every published schedule, functions already
  deployed continue to be invocable**, because every gate is a control-plane gate on creating or updating a
  function rather than on invoking one.
- **The pin stands.** `nodejs20.x` and Node 20.x remain the stated target, because they are an express
  instruction (AAP §0.5.5, verbatim: "The pin stands."). Consistently, AAP §0.5.3.2 rejects a newer
  `@types/node` precisely so the type surface keeps matching the runtime rather than a later one.
- **The blast radius of a later move is six artifacts.** `--target=node20` in `build/esbuild.mjs`; the
  `engines` field together with `.nvmrc`; the `@types/node@20.19.43` pin; `tsconfig.json`'s `target`/`lib`
  pair; the version statements in this file; and **`package-lock.json`**, which pins `@types/node` by
  resolved URL and integrity hash. That last one is easy to miss and is the only one whose omission would
  _silently defeat_ the uplift rather than just leave a stale document: `npm ci` installs from the lock, not
  from the manifest, so editing `package.json` alone leaves the old type definitions resolving while the
  bump appears applied. Review finding **SEC-RUNTIME-01** named it; it was absent from all three
  enumerations in this subtree before that. Because the hexagonal boundary confines all AWS coupling to
  `src/handlers/**`, migrating is mechanical — **no change to `src/domain/**`, `src/services/**`,
  `src/ports/**` or `src/adapters/**`.**
- ⚠️ **A clean `npm audit` is not evidence that this deployment is patched, and the two must not be read
  as one signal.** §12 records `npm audit` reporting 0 vulnerabilities, and that statement is about the
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

`package.json` declares **exactly six scripts** — `typecheck`, `build`, `test`, `test:coverage`, `lint` and
`format:check`. The table below therefore has seven rows: those six, plus `npm ci`, which is npm's own
install command and **not** a script in this manifest.

| Command                 | What it runs                                                | Measured result                                |
| ----------------------- | ----------------------------------------------------------- | ---------------------------------------------- |
| `npm ci`                | install from the lockfile (npm builtin, not a script)       | 399 packages, 0 `EBADENGINE`, 0 audit findings |
| `npm run typecheck`     | `tsc --noEmit`, full strict                                 | **0 errors**                                   |
| `npm run lint`          | `eslint .`                                                  | **0 problems**                                 |
| `npm run format:check`  | `prettier --check .`                                        | **all matched files conform**                  |
| `npm test`              | `jest --ci --config package.json --preset ./jest.config.ts` | **17 suites, 2342 tests, 0 failures**          |
| `npm run test:coverage` | the same, plus `--coverage`                                 | **17 suites, 2342 tests, 0 failures**          |
| `npm run build`         | `node build/esbuild.mjs`                                    | 6 CommonJS artifacts, exit 0 (§6)              |

⚠️ **THIS SECTION SAID "EXACTLY FOUR SCRIPTS" AND LISTED FIVE ROWS, AND TWO OF THE SIX DID NOT EXIST.** A
revision deleted `format:check` and `test:coverage` as "outside the frozen four" of AAP §0.4.1.2 and rewrote
this section to match, leaving the project's own verified command contract naming two commands that would
fail at a reader's shell prompt. Review finding **F6** restored both, and **F7** covers this account of them.
AAP §0.4.1.2 declares which scripts the manifest must CARRY; it does not close the set.

`npm ci` rather than `npm install`: the lockfile is committed so resolution is reproducible, and `ci` is the
command that honours it exactly.

`npm run typecheck` must pass **before** a build is trusted — esbuild strips types without checking them, so
the bundle must never be the thing that hides a type error. Nothing in the compiler, lint, format or test
configuration is relaxed to reach those results: `tsconfig.json` keeps `strict`,
`exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`, and `ts-jest` runs that same `tsconfig.json`
with no `diagnostics: false`.

`jest.config.ts` sets `collectCoverage: true`, so plain `npm test` reports coverage as well. The
`test:coverage` script passes `--coverage` explicitly, so the intent is addressable by name AND always-on;
the two are deliberately redundant rather than alternatives. The configuration declares **no
`coverageThreshold`** and no quality gate of any kind — measured coverage is published, no target is
asserted, and none is invented (§12.1 records why: the legacy structural gate is inert and the legacy suite
carries no line or branch instrumentation at all).

Formatting has its own script, `npm run format:check`, which wraps `prettier --check .`.
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
  why a `jest` key in `package.json` cannot be used instead, is in `jest.config.ts`'s header under **HOW
  JEST LOADS IT**.
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

⚠️ **`ts-node` is deliberately NOT among them, and `npm test` is shaped around its absence.** An earlier
revision declared it as an eleventh package solely so Jest could read `jest.config.ts`, and recorded the
excess in a `"//dependencyInventory"` member of the manifest. An **earlier review round** rejected that —
documenting a deviation is not fixing one — so the loading problem is now solved inside the prescribed ten,
with the two flags §3 describes. The manifest carries no pseudo-comment member of any kind as a result.

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

### 4.4 No deviations from the plan's dependency inventory — and the two that were withdrawn

The manifest matches AAP §0.5.2's dependency inventory exactly: **one runtime dependency and ten
development dependencies, all at exact pins**, plus the `>=20.20.2` floor and the six scripts §3 tabulates.
There is no `overrides` block, no `resolutions`, no `workspaces`, no `packageManager` field and no `"//"`
pseudo-comment member.

⚠️ **THIS SENTENCE SAID "the `>=20.19.0` floor, four scripts".** Both figures moved under review finding
**F6** — see §2.1 for the floor and §3 for the scripts — and neither is a dependency deviation: AAP §0.5.2
fixes the PACKAGE set, which is unchanged. Two earlier deviations were
recorded in the manifest itself; both have been withdrawn, and because a withdrawal is only auditable if the
reasoning survives it, both are recorded here.

- **The eleventh dev dependency, `ts-node` 10.9.2 — withdrawn by fixing the cause.** It existed only so
  Jest could load `jest.config.ts`, and the manifest carried a `"//dependencyInventory"` member arguing that
  the excess was the lesser of two evils. An **earlier review round** rejected that framing and required the
  loading problem to be solved within the prescribed toolchain. It is: `npm test` passes
  `--config package.json --preset ./jest.config.ts`, which keeps the plan-mandated filename, adds no
  package, and resolves a configuration measured byte-identical to the loader route's (§3, and
  `jest.config.ts`'s **HOW JEST LOADS IT**).
- **The `overrides` block pinning `minimatch` 10.2.6 and `test-exclude` 7.0.2 — withdrawn because its own
  removal trigger fired.** It closed GHSA-mh99-v99m-4gvg / CVE-2026-14257 (unbounded brace expansion) where
  it was reachable transitively through the Jest toolchain, and its note named the condition for dropping
  it: that the graph resolve a fixed `brace-expansion` on its own. **Measured, on the manifest as it now
  stands: `npm ci` completes with 399 packages and `npm audit` reports 0 vulnerabilities**, with
  `brace-expansion` resolving to 5.0.9, 2.1.4 and 1.1.18 and no advisory against any of them. (That result
  is scoped to the **dependency tree**. It says nothing about the Node runtime itself, which has received no
  upstream security patches since 30 April 2026 — see §2.2, where the two signals are deliberately kept
  apart.) The trigger is
  met, so an unauthorised manifest key that no longer changes the audit result has no remaining
  justification — and keeping one on preference alone is what Refactor Discipline Guideline 4 forbids.

  **Stated rather than left to be discovered:** dropping it lets `test-exclude` resolve to 6.0.0 for the
  Babel coverage instrumenter, which adds two npm _deprecation notices_ at install time — `glob@7.2.3` and
  `inflight@1.0.6` — alongside the `glob@10.5.0` notice that was already there. Those are npm's generic
  messages about old major lines, **not** advisories against this tree: the nested `minimatch` those copies
  use resolves to 3.1.5, `npm audit` finds nothing, and every one of them is a development-only transitive
  of the coverage instrumenter that appears in **no** emitted artifact (§4.1 — `mysql2` is the only package
  that ships). If a future audit does report a finding here, the fix is an upstream release or a fresh,
  separately justified remediation — not a silent restoration of this block.

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
  config/      env.ts (the ONLY reader of process.env) · database.ts (the module-scope pool)
               container.ts (the memoized composition root, replacing the DI/1 bean scan) — it also
               holds the three shared tiers (boundaries, statements, reads) and the five per-surface
               compositions each narrow Lambda entry resolves through, AAP §0.3.1 enumerating no
               separate module for any of them (see §6)
  domain/      typed entities, base types and process objects — no framework, no ORM, no AWS
  validation/  Validator.ts plus the seven typed rule sets ported from model/validation/*.json
  ports/       5 repository ports and the 8 boundary ports of §5.3, in 13 files —
               further declarations are folded into the ports whose subject they share
  adapters/    mysql/** (parameterized SQL, row mappers, UnitOfWork) · settings/**
  services/    BaseService + ProductService · SkuService · BrandService · OptionService
  handlers/    router.ts, the 4 service handlers, googleFeedHandler.ts, httpResponse.ts
               — the AWS boundary, and the only layer that names an AWS type
  integrations/google/  the stub contract, the feed query and the feed builder
  errors/  util/
test/          17 suites, mirroring the layers above (§12.1)
build/         esbuild.mjs — the whole build step, and the only file in the directory
```

**70 TypeScript sources and 17 test suites**, and both counts are exact rather than approximate: AAP §0.4.1
freezes the file inventory at **102 tracked files** and AAP §0.4.1.12 freezes the test plan at **17 executable
suites plus 2 fixtures and 1 support module**, which is what `git ls-files slatwall-ts` and
`npx jest --listTests` report. Review passes found **sixteen production modules and twenty-two suites**
running outside that plan — among them three shared configuration tiers, five per-surface compositions, a
persistence adapter, a write runner, a bounded-read port and a SKU smart-list composer. Fifteen of the
sixteen modules and twenty-one of the twenty-two suites were **folded** into the approved file whose subject
they share — never deleted, never thinned, with each folded suite body wrapped in one `describe` so its
helpers became block-scoped and not one assertion altered; §5.5 lists the module folds with their hosts and
§12.1 the suite folds. Two were different cases and are recorded as such: `util/urlTitleProbeBudget.ts`
declared a probe ceiling the legacy has no equivalent of, so it was **removed** rather than relocated, along
with the rest of the unauthorised hardening §13.4 describes; and a surface-reachability suite was
**withdrawn** rather than folded, because its premise was a module graph the frozen inventory precludes —
`test/regression/issues.test.ts` carries the withdrawal record in full, names the suite, and asserts the half
of it that still holds through the folded entry-surface cases. Every intra-subtree import is a **relative path**: there is no
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

| Legacy mechanism                                                                           | Replaced by                                                                             |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| DI/1 0.4.2 runtime bean scan (`org/Hibachi/DI1/ioc.cfc:L546`) + `property name=` injection | typed **constructor parameters**, wired once in `src/config/container.ts` (**R1**)      |
| `getService("name")` dynamic string lookup                                                 | typed imports resolved at compile time (**R2**)                                         |
| `super.save()` template-method inheritance                                                 | composition against an injected `BaseService` (**R3**)                                  |
| `onMissingMethod` prefix dispatch (`org/Hibachi/HibachiService.cfc:L255-L281`)             | explicitly declared, typed methods (**IR-1**)                                           |
| `ormExecuteQuery(hql, params)`                                                             | `pool.execute(sql, params)` with binding order preserved one-for-one (**R4**, **TR-4**) |
| Hibernate hydration from CFC property metadata                                             | explicit typed row mappers in `src/adapters/mysql/rowMappers.ts`                        |
| `HibachiSmartList` dynamic paginated HQL                                                   | `SmartListQueryBuilder` behind `SmartListQueryPort`                                     |
| the implicit request-end commit gated on `getORMHasErrors()`                               | an explicit `UnitOfWork`, scoped per invocation                                         |
| `HibachiValidationService` interpreting JSON at run time                                   | seven typed rule sets evaluated by `Validator.ts`                                       |

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
  (**IR-8**). `BaseService.ts` ports the local behaviour.
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
stays on the interface, and the gap is **flagged rather than filled** (**TR-5**). Reaching an unwired port
answers **501** rather than fabricating a value — substituting a plausible answer for a flag that gates a
delete is exactly the silent divergence this design refuses.

| Port                       | Why it exists                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SettingResolverPort`      | resolves the eighteen configuration keys the slice reads through `HibachiEntity.setting()` (`model/entity/HibachiEntity.cfc:L129`), including the interpolated `productImage<size>Width` / `productImage<size>Height` form. Declared **synchronous**, so no caller depends on background completion (**M8**)                                                              |
| `ImagePathPort`            | image path, resized path and existence flag (`model/entity/Sku.cfc:L145, L192, L221`) — the hidden `imageService` dependency of §5.2                                                                                                                                                                                                                                      |
| `SubscriptionTermPort`     | subscription-term resolution for the `subscription` branch of `createSkus`                                                                                                                                                                                                                                                                                                |
| `AccessContentPort`        | content resolution for the `contentAccess` branch of `createSkus`                                                                                                                                                                                                                                                                                                         |
| `PricingPort`              | the price reads retained members need — notably the feed's conditional sale-price fields                                                                                                                                                                                                                                                                                  |
| `AccountContextPort`       | current-account context, replacing the request-scoped Hibachi scope lookup                                                                                                                                                                                                                                                                                                |
| `SmartListQueryPort`       | the filter, join, range, ordering and pagination surface the SmartList members and the feed controller depend on                                                                                                                                                                                                                                                          |
| `UniquePropertyPort`       | application-side uniqueness checking, reproducing `org/Hibachi/HibachiDAO.cfc:L130-L146` (**IR-5**) — required _in addition_ to the database's own unique columns, because the legacy enforces it with an HQL existence query during validation                                                                                                                           |
| `TransactionalWriteRunner` | the Unit-of-Work boundary as a **declaration**, so a handler can reach a transaction without importing from `adapters/**`. The pattern is named at AAP §0.3.3. ⚠️ **It is a contract, not a ninth port, and it has no file of its own** — it is declared inside `src/ports/UniquePropertyPort.ts` and re-exported from `src/config/container.ts`; see the paragraph below |

The eight rows above `TransactionalWriteRunner` are the eight boundary ports AAP §0.2.2.7 enumerates, each
in its own file under `src/ports/`. The ninth row is a **transaction contract**, and the distinction matters:
a _port_ stands for an out-of-scope collaborator this subtree may not implement, whereas the write runner
stands for a boundary this subtree owns outright.

**Where it is declared, stated once, because three artefacts used to answer this differently.** It was briefly
given a file of its own, `src/ports/TransactionalWritePort.ts`, which put a production file outside AAP
§0.4.1's frozen inventory and made every built handler depend transitively on unplanned code; an **earlier
review round** withdrew that file and it was folded into `src/ports/UniquePropertyPort.ts`, whose own subject
— the uniqueness probe that runs **inside** a save — is what a transaction most often encloses (§5.5). That
port now holds the single declaration and the whole of its lifecycle and disposal contract.
`src/config/container.ts` **re-exports** it under the same name so the write graphs it parameterises can be
read beside it, and so no consumer import had to move.

⚠️ **Three things were wrong here and all three are fixed, because they compounded.** This table was printed
**twice, verbatim**, and the two copies **contradicted each other on this one row** — one said the runner is
declared in `src/config/container.ts`, the other in `src/ports/UniquePropertyPort.ts`. Both had a claim to make:
`container.ts` really did carry a **second, structurally identical `export interface
TransactionalWriteRunner<TGraph>`**, with its own full copy of the documentation, and because TypeScript is
structurally typed the duplication compiled silently — the handlers imported one copy and
`src/adapters/mysql/UnitOfWork.ts` the other, and the two doc blocks then drifted. Review findings **F7** and
**F11** reported the documentation half; the duplicate declaration is removed, the duplicate table is removed,
and §9.5 records the inventory consequence.

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
  `model/dao/HibachiDAO.cfc` (**IR-6**).
- **Memoisation is request-scoped, never module-scope**, apart from the connection pool and the service
  graph itself. `beginInvocation()` runs before every route on every invocation — on the aggregate graph
  and on each per-surface graph alike — so a warm container cannot carry one request's state into the next
  (**M7**). There is exactly one request-scoped cell in the slice, the option-group sort-order memo that
  `MySqlSkuRepository` takes as a constructor parameter; the brand, option and feed surfaces reach no SKU
  repository, so their `beginInvocation` has nothing to discard, and each says so at its declaration rather
  than leaving the empty body to be read as an omission.

### 5.5 The fifteen production folds, and where each one went

A QA pass measured this subtree against AAP §0.4.1's frozen 102-file inventory and found **sixteen** production
modules outside it. **Fifteen were folded** — moved whole into the approved file whose subject they share, with
their entire doc record carried across verbatim under a fold banner — and the sixteenth,
`util/urlTitleProbeBudget.ts`, was **removed** because the ceiling it applied is itself withdrawn (§13.4).
Nothing was thinned, and no declaration was merged away.

⚠️ **An earlier revision of this section listed only six of the fifteen** — it tabulated the ports and
adapters folds and omitted the eight configuration modules and the SKU smart-list composer, which made §5.1's
count of sixteen and this section's count of seven contradict each other. The full list follows, and it agrees
with §5.1.

| Folded module(s)                                                                                                                                                        | Host                                       | Why that host                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config/catalogBoundaries.ts`, `config/catalogStatements.ts`, `config/catalogReads.ts`, `config/surfaces/{brand,option,feed,sku,product}Surface.ts` — **eight modules** | `config/container.ts`                      | all eight were split _out_ of the composition root, and every one of them exists only to wire collaborators the root already wires. The five `compose*Surface` and `get*SurfaceGraph` functions came across verbatim (§6) |
| `ports/repositories/BoundedRead.ts`                                                                                                                                     | `ports/SmartListQueryPort.ts`              | the bounded-read window exists to bound a paginated dynamic query, which is the host's whole subject                                                                                                                      |
| `ports/TransactionalWritePort.ts`                                                                                                                                       | `ports/UniquePropertyPort.ts`              | the host's own subject — the uniqueness probe that runs **inside** a save — is what a transaction most often encloses (§5.3)                                                                                              |
| `util/smartListInput.ts`                                                                                                                                                | `ports/SmartListQueryPort.ts`              | three services call `translateSmartListInput` on their way into the port the host declares, so the host was already on every one of those paths and the fold adds no import edge                                          |
| `services/skuSmartListQuery.ts`                                                                                                                                         | `ports/SmartListQueryPort.ts`              | it composed one dynamic query against the port the host declares                                                                                                                                                          |
| `adapters/mysql/catalogAggregates.ts`                                                                                                                                   | `adapters/mysql/QueryRunner.ts`            | the existing runtime edge is `QueryRunner → rowMappers`, so hosting the aggregate loaders in `rowMappers.ts` instead would have created a genuine adapter-layer cycle                                                     |
| `adapters/mysql/MySqlProductPersistence.ts`                                                                                                                             | `adapters/mysql/MySqlProductRepository.ts` | the read and the write half of the same table                                                                                                                                                                             |
| `adapters/mysql/MySqlTransactionalWriteRunner.ts`                                                                                                                       | `adapters/mysql/UnitOfWork.ts`             | the runner is the boundary `UnitOfWork` opens                                                                                                                                                                             |

**One fold needed a decision rather than a move, and it is worth reading before editing either half.** The
product read and write halves each declared eight identically-named table and column constants, and the two
sets **do not mean the same thing**: the read half spells tables in the ORM **class** vocabulary
(`assertTableName('SlatwallProduct')`) and the write half in the **physical** vocabulary
(`assertTableName('SwProduct')`). That is the same intra-file vocabulary divergence §12.4 carries by its
locators — `model/dao/SkuDAO.cfc:L132` and `:L135` against `:L179-L211` — and the port preserves it. So the
constants were **not** merged — the folded copies are prefixed `PERSISTED_`, and both readings survive.

A value-import cycle scan over all of `src/**` reports **zero cycles** after the folds.

---

## 6. Build output

`npm run build` runs `node build/esbuild.mjs`, whose emitted invocation is exactly

```text
esbuild --bundle --platform=node --target=node20 --format=cjs --external:mysql2
```

and which writes **one CommonJS artifact per declared Lambda entry point**:

```text
dist/handlers/router.js                 the aggregate surface — all 34 addresses
dist/handlers/productHandler.js         the 18 product addresses
dist/handlers/skuHandler.js             the 9 SKU addresses
dist/handlers/brandHandler.js           the 3 brand addresses
dist/handlers/optionHandler.js          the 3 option addresses
dist/handlers/googleFeedHandler.js      the single feed address
dist/package.json                       the production manifest — one runtime dependency
dist/node_modules/                       the runtime dependency closure — 11 packages
build-meta/sourcemaps/handlers/*.map    the six source maps, deliberately OUTSIDE the package
```

`dist/` is therefore a **complete, self-resolving package** rather than six loose files. Measured in this
checkout with `du -sb` immediately after `npm run build`: **11,214,245 bytes** in total, of which
**9,733,739** is the six artifacts and **1,480,323** the staged driver closure of eleven packages — `du -sh`
rounds those to 12M, 9.3M and 2.2M respectively, the last because `du` charges whole filesystem blocks for
the closure's many small files. §6's size bullet lists the six artifacts individually.

Properties worth knowing, each measured rather than assumed:

- **Every artifact exports an invocable `handler`** — all six, measured by requiring each emitted file.
  `router.js` is the aggregate surface and the natural single-function deployment; each per-service artifact
  serves only its own addresses and answers `404` for any other, so a deployment may instead give each surface
  its own function. Nothing else lands in `dist/` beyond the six artifacts, the production manifest and the
  dependency closure — no chunk, no map, no build report — and that is **asserted** by the pipeline rather than
  merely intended.
- **The five gated artifacts also export the authorisation registration seam** — the registrar and its clear
  — because a bundle is the only file a deployment holds and the seam has to be callable on it. Verified by
  requiring each emitted file: `router.js` publishes four names, the registrar and its clear alongside
  `createRouter` and `handler`, and each per-surface bundle publishes them alongside its own factories.
  `googleFeedHandler.js` publishes neither, since its one address is anonymous. §7.2 records the measured
  export list from before the fix, when the seam was reachable in the source and in no bundle.
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

  ⚠️ **THIS PROPERTY WAS DESCRIBED FOUR TIMES IN THIS SECTION, WITH FOUR INCOMPATIBLE MECHANISMS, AND
  REVIEW FINDING F7 IS WHY THERE IS NOW ONE.** The superseded accounts variously claimed staging under
  `build-meta/staging/dist` with two separate renames, a cleanup handler that removes `dist/` on the failure
  path, removals "enumerated from the entry list — never a recursive delete", and recursive removals
  "confined to exactly three paths". They cannot all be true of one script. What the script does is the
  paragraph above: `purge` uses recursive removal on the previous `dist/` and the previous staging tree and
  non-recursive removal on each enumerated owned map, and `promote` renames staging onto `dist/` once.

  The QA finding that produced the current arrangement is kept, because it explains the design: purging owned
  outputs _before_ the bundler protected only the pre-emit half, so a build whose emit succeeded and whose
  **post-emit** step then failed exited non-zero while six apparently deployable bundles sat in `dist/`.
  Measured under the current arrangement — with a green build in place, a build forced to fail immediately
  after the emit leaves no `dist/` at all.

  The recursive removals the design needs are confined to two generated, git-ignored trees — `dist` and
  `build-meta/package-staging` — each computed from the script's own location, each a fixed literal segment
  with no glob and no value read from input. The script's own tracked `build/` directory is deliberately not
  among them, which is why the generated directory is named `build-meta/`.

  Two consequences were measured in this checkout rather than assumed:

  - **A stale or legacy artifact cannot survive a build.** Because the unit of replacement is the tree, an
    artifact left by an earlier revision of the build script disappears without the script having to know
    its name. Seeded `dist/metafile.json`, `dist/handlers/oldEntryHandler.js` and a matching stale map, then
    ran `npm run build`: all three were gone and `dist/` held exactly the six bundles.
  - **Consecutive builds are byte-identical.** Two runs, `sha256sum` over all twelve output files: no
    difference. The build reads no environment variable, opens no connection and needs no credential.

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
- **Configuration is validated at two different moments, on purpose.** `router.js` resolves the service
  graph when the module loads, so requiring it with a missing or malformed variable throws immediately and
  names the variable — a misconfigured deployment of the primary entry fails its cold start rather than
  answering requests it cannot serve. The five per-surface artifacts resolve the graph on their **first
  invocation** instead, so each can be required with an empty environment; a misconfiguration there surfaces
  as `500 {"message":"The service is not correctly configured"}` per invocation, classified rather than
  opaque, with the offending variable kept out of the response entirely. Both behaviours are fail-safe, and
  the deferral is what keeps those five modules loadable by their own unit suites and by anyone inspecting
  an artifact.
- **The per-surface entries reach the composition root through a deferred CommonJS `require`, not a dynamic
  `import()`**, so the same code answers identically whether it runs from `dist/`, from a plain `tsc` emit, or
  under `ts-jest`. An earlier revision used `await import('../config/container.js')` and did not: TypeScript's
  `NodeNext` emit preserves a native `import()` in CommonJS output, and Node's ESM resolver then demands an
  on-disk `.js` that only an emit produces — so running the TypeScript sources answered `500` for every action
  while the artifact answered correctly. (This bullet was printed twice, the first copy breaking off
  mid-sentence; review finding **F7** covers it.)
- **Each per-surface entry composes only what its own routes can reach, and it does so LAZILY.** All six
  entries reach `src/config/container.ts` — that is measured, not assumed — but they reach it two different
  ways, and the difference is the whole design. `router.ts`, which serves all thirty-four addresses, takes a
  **static value import** of `getCatalogContainer`, so its artifact validates configuration at module load.
  The five per-surface entries take only `import type` at the top and resolve their own narrow graph through a
  **deferred `require('../config/container')`** inside the first invocation — calling `getBrandSurfaceGraph`,
  `getOptionSurfaceGraph`, `getSkuSurfaceGraph`, `getProductSurfaceGraph` or `getFeedSurfaceGraph`, each of
  which memoizes one narrow graph built by the same `compose*Surface` function the aggregate root calls. So a
  narrow artifact and the router cannot disagree about how a service is assembled.
  `test/regression/issues.test.ts` asserts the run-time consequence directly: importing an entry constructs no
  container and reads no environment, and the graph is resolved only on first invocation.

  ⚠️ **An earlier revision claimed the five entries required `src/config/surfaces/{brand,option,sku,product,
feed}Surface.ts` and that only `router.js` reached the container.** Those five modules, and the three
  `src/config/{catalogBoundaries,catalogStatements,catalogReads}.ts` tiers, sat outside AAP §0.3.1's inventory
  and were folded into the composition root; there is no `src/config/surfaces/` directory, and `src/config/`
  holds exactly `container.ts`, `database.ts` and `env.ts`. The suite that measured the withdrawn separation
  was withdrawn with it — `test/regression/issues.test.ts` carries that record too, including what the
  withdrawal gives up: the bundler can no longer DROP unreached modules from a narrow artifact.

- **Size, stated plainly and as measurement only.** Measured in this checkout with `ls -l` immediately after
  `npm run build`, the six artifacts are `googleFeedHandler.js` 1,604,007, `brandHandler.js` 1,609,156,
  `optionHandler.js` 1,609,754, `skuHandler.js` 1,621,771, `productHandler.js` 1,633,242 and `router.js`
  1,655,809 bytes — a range of 1,604,007 to 1,655,809, totalling **9,733,739 bytes**. The whole published
  package is **11,214,245 bytes** (`du -sb dist`; `du -sh dist` reports 12M), which is those six plus the
  staged `mysql2` closure under `dist/node_modules` (2.2M) and the generated `dist/package.json`. Source maps
  live **outside** `dist/`, under `build-meta/sourcemaps/`.

  ⚠️ **THIS BULLET WAS PRINTED THREE TIMES WITH THREE DIFFERENT SETS OF FIGURES, TWO OF THEM TRUNCATED
  MID-SENTENCE, AND ONE OF THEM DESCRIBED A LAYOUT THIS SUBTREE NO LONGER HAS.** Review finding **F7** covers
  the duplication; the substantive correction is this. An earlier revision reported a **spread** — 353,260 for
  the brand entry up to 1,636,205 for the router — which was true of the per-surface split described in §5.5:
  five narrow entries reached only their own tier, so the bundler could drop the rest and the brand entry,
  whose three routes reach one repository and one service, really was a fifth the size of the aggregate router.
  **That split was folded back into the composition root**, because its eight modules sat outside AAP §0.4.1's
  frozen inventory. Every entry now reaches `src/config/container.ts`, whose `CatalogContainer` declares
  **35 members** — every collaborator the slice has, plus the two configuration sections and the anonymous
  materialisation guard — so there is nothing left for the bundler to drop and the six sizes are within 3% of
  one another. The
  figures above are the measurement of the layout that exists; the spread is the measurement of one that does
  not, and keeping both without saying which was which is what made this section unusable.

  Code splitting is deliberately off — it could hoist or duplicate `src/config/database.ts`, and duplicating
  that module duplicates the connection pool. `minify` and `legalComments` are available levers, deliberately
  unexercised so each artifact keeps the reasoning its source records. **No size budget is asserted here or
  anywhere else in the subtree** (IR-12): these are measurements, and nothing compares an artifact against a
  number.

  📐 **`import(` does still appear five times in `src/**`, and every one is a TYPE QUERY rather than a
  dynamic import** — the distinction is worth naming because a text search finds them and the two look
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
?slatAction=google:feed.product        integrationServices/google/views/main/default.cfm:L50
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
silently winning. Nothing is guessed, retried or prefix-matched. An earlier revision dropped this
tolerance deliberately; an **earlier review round** recorded that as a parity regression, and
`test/regression/issues.test.ts` now pins all of it — canonical, lower, upper and mixed spellings, the
unchanged reachable set, and the prototype-member cases.

**Two things have to be right for that snippet to run**, and both were wrong in an earlier revision of this
section, so they are spelled out.

**First, the environment.** `dist/handlers/router.js` resolves the service graph when the module loads, so
`require` itself throws if a required variable is missing — that is the deliberate fail-fast described
below, not a defect. Export the six required names first (§8 is the full contract; `DB_TLS_MODE` is
optional and is shown here only because a loopback host is the one case that may lower the transport
mode):

```sh
export DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=<YOUR_DB_NAME>
export DB_USER=<YOUR_DB_USER> DB_PASSWORD=<YOUR_DB_PASSWORD>
export DB_TLS_MODE=disabled GOOGLE_FEED_HOST=catalog.example.test
```

⛔ **THE THREE ANGLE-BRACKETED NAMES ARE PLACEHOLDERS AND MUST BE REPLACED. NOTHING IN THIS REPOSITORY
SUPPLIES A VALUE FOR THEM.** An earlier revision of this block printed a working `DB_USER` / `DB_PASSWORD`
pair copied from a local development container, which review finding **F10** classified as a committed
credential — a plausible-looking secret published in documentation, which is where a copied value survives
longest. The pair is removed rather than obfuscated, because a reader who copies a real-looking value is
likelier to keep it than a reader who copies `<YOUR_DB_PASSWORD>` and is forced to think.

**Where a local value comes from instead.** The database credentials are whatever the operator's own MySQL
instance was created with; this deliverable provisions no database, seeds no user and ships no default. The
same rule holds in `.env.example`, whose `DB_PASSWORD=` line is deliberately left with an EMPTY right-hand
side — and note that a blank value is refused at load, so the template cannot be used unedited (§8). No
secret, credential or token is required to `build`, `test`, `lint`, `typecheck`, `format:check` or
`test:coverage`: every one of those six commands runs with an empty environment, which is why the
verification in §3 needs none.

**Second, the `await`.** The artifact is CommonJS — `package.json` declares `"type": "commonjs"` and the
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

The feed answers RSS 2.0 with the `xmlns:g="http://base.google.com/ns/1.0"` namespace and
`Content-Type: application/xml`; every other route answers JSON.

⚠️ **As shipped, that RSS answer is the empty-selection answer, and the distinction is worth reading before
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
answering an empty list. That is deliberate and it is the correction of an earlier decision — an empty
list would have published "this product has no additional images" for every product in the catalogue,
including products that have several, which is an absent collaborator rendered as data. A deployment that
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

**What reaches the server-side log is narrower than "the detail", and it is worth stating exactly.** An
earlier revision of this section said the detail is "redirected to a structured server-side log line",
and `httpResponse.ts` said the caught value "goes to the log verbatim". A code review found both
overstated. The record is four fields and no more:

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

| Seam                                                                                                             | For                                                                   |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `createRouter(container, resolver)`, and the same optional second argument on each `create…HandlerFromContainer` | a deployment that builds its own entry module against these functions |
| `registerRequestAuthorizationResolver(resolver)`, re-exported by all five gated entry modules                    | a deployment that takes a packaged artifact as it stands              |

`registerRequestAuthorizationResolver` is declared in `src/handlers/httpResponse.ts` and re-exported by
`src/handlers/router.ts` and each of the four per-surface handlers, so it is reachable from
`dist/handlers/router.js` and from every per-surface bundle rather than only from the source. It is called
**once, during initialisation** — from a thin entry module that requires the bundle and re-exports its
`handler`. Registering **after** the graph was built still works, because the default resolver reads the
registry on every invocation rather than capturing a context; a second registration is refused rather than
replacing the first. Nothing in this subtree registers one, so a graph built by this port alone stays
deny-all.

The resolver returns an account (or `undefined`) and an entity-authorisation verdict per invocation. **No
principal is ever stored** — AAP §0.6.6 M7 forbids module-scope state a warm container could carry between
invocations, and the registry holds the resolver **function**, never its answer.

> **Earlier revisions of this section were wrong, and the correction matters.** They claimed "the seam for
> doing so is already each handler factory's parameter". It was not reachable: every
> `create…HandlerFromContainer` passed the deny-all resolver as a **literal**, and neither the aggregate
> router nor any per-surface entry point accepted one — so all 33 catalog actions answered `401` from the
> shipped exports with no way to change it. A code review classified that as a **CRITICAL** callable-boundary
> defect; the two seams above are the remedy, and both are exercised by `test/regression/issues.test.ts`.

> **The second seam then had to be corrected too, and it was found by inspecting the artifact rather than the
> source.** `registerRequestAuthorizationResolver` is declared in `src/handlers/httpResponse.ts`, which is
> **not a build entry point** — `build/esbuild.mjs` lists it under `NON_ENTRY_HANDLER_MODULES` as a shared
> helper — so `esbuild` inlined it into every bundle and its exports did not survive. Measured on the built
> artifact, `Object.keys(require('dist/handlers/router.js'))` was exactly `['createRouter', 'handler']`: the
> registrar this section tells a deployment to call was unreachable from the one file a deployment deploys.
> That is the same defect shape as the finding above, one layer out. The five gated entry modules —
> `router.ts` and the four per-surface handlers — now **re-export** it together with
> `clearRequestAuthorizationResolver` and the two resolver types, so every gated bundle publishes it;
> `src/handlers/googleFeedHandler.ts` deliberately does not, because it gates nothing.
> `test/regression/issues.test.ts` pins all of it: that each gated entry re-exports the **same**
> declaration rather than a copy, that the feed publishes none, and that a resolver registered through an
> entry's own export changes what that entry answers on a dispatcher already built.

Verified against the packaged bundles, with the seeded local database: `brand.getBrand` answered
`401 {"message":"Authentication is required"}` from `dist/handlers/router.js` before registration and `200`
with the brand's projection after `router.registerRequestAuthorizationResolver(…)` — the same before-and-after
on `dist/handlers/skuHandler.js` (`sku.getSkuBySkuCode`) and `dist/handlers/productHandler.js`
(`product.getProduct`). A second registration raised, and `clearRequestAuthorizationResolver()` returned the
answer to `401`. Each bundle carries its own inlined registry, so a deployment mounting several per-surface
artifacts registers on each one it mounts.

The **feed is the one exception**, and it is a port of
`integrationServices/google/controllers/feed.cfc:L54`, which declared `this.publicMethods="product"` with
both `anyAdminMethods` and `secureMethods` empty. It is anonymous because the legacy's was — and therefore
the only route that needs no resolver at all.

---

### 7.3 Two response behaviours a code review corrected

**A `400` on a product write now carries the keyed findings, not a bare `500`.** Ten product write routes go
through one transaction runner, whose accumulated-errors rollback raised a generic error — so the validation
findings the operation had collected were discarded and the client saw an unclassified `500`. The product,
SKU and product-type error bags are now lifted into a `ValidationError` on those paths, exactly as the SKU and
brand handlers already did, and the response is `400 {"message":"Validation failed","errors":{…}}` with the
field keys intact (finding **CQ-5**).

**Three product process routes answer `501` rather than an impossible `500`.** `addProductReview`,
`addSubscriptionTerm` and `uploadDefaultImage` forward a parsed JSON body to service guards that require
_callable_ process objects — a condition a JSON body can never meet, so success was unreachable and every
request produced a generic fault. They now return a classified `NotImplementedError` after the authorisation
and request-shape checks, **without opening a transaction that cannot commit**. The members stay routable, so
the interface surface is unchanged (**TR-5**); what changed is that an impossible request now says so
(finding **CQ-6**).

---

## 8. Environment

Every value arrives through the process environment. `src/config/env.ts` is the only file under `src/**`
permitted to touch `process.env`, values are validated eagerly when that module loads, and the result is
frozen. `.env.example` is the authoritative list: it carries every variable name with **no value committed**
and documents each one.

**That template is meant to be copied and sourced as it stands.** The **six required** names appear as bare
`NAME=` assignments, because a value you must supply is more useful visible than commented; the **ten
optional** ones are **commented out**, because `env.ts` refuses a blank optional value — a name typed and left
empty would look like working configuration while behaving as though nothing had been supplied, so absence,
not emptiness, is how you select a documented fallback. An earlier revision left the four optional connection
values as active blank assignments, which made `cp .env.example .env` produce a file that failed to load; an
**earlier review round** recorded that as a setup defect.

_When_ that validation happens differs by artifact, deliberately — §6 records which and why.

| Variable                                   | Required?       | Notes                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DB_HOST`                                  | **yes**         | a bare host: a registered name or IPv4 literal per RFC 3986 §3.2.2, or an IPv6 address bracketed or bare. A scheme, a `user:password@` prefix, a `:port` suffix, a path, whitespace, a control character, a non-ASCII character and a filesystem socket path are each refused with a message saying why |
| `DB_PORT`                                  | **yes**         | a plain base-ten TCP port, 1–65535                                                                                                                                                                                                                                                                      |
| `DB_NAME`                                  | **yes**         | the schema holding the existing `Sw*` tables. This service reads and writes that schema and neither creates nor migrates it. **Not** the legacy datasource name — see the note below                                                                                                                    |
| `DB_USER`, `DB_PASSWORD`                   | **yes**         | must be present; an empty string is permitted, reproducing the legacy framework defaults exactly. Nothing is committed anywhere                                                                                                                                                                         |
| `DB_TLS_MODE`                              | no → `verified` | `verified` requires TLS and verifies chain and identity. `disabled` is accepted **only** for a loopback host. Absence encrypts; cleartext must be asked for by name                                                                                                                                     |
| `DB_QUEUE_LIMIT`                           | no → `1`        | the one bound not delegated to the driver: it reads `0` as "no limit" **and** `0` is its default, so omitting the option would select the unbounded queue this value exists to prevent                                                                                                                  |
| `DB_CONNECTION_LIMIT`                      | no → omitted    | absent means the option is left off and the driver's own bounded default applies, so this port states no figure — AAP §0.4.1.3 records that pool sizing "is not carried over because the legacy application delegates pooling to the CF/Railo server and pins nothing in source"                        |
| `DB_CONNECT_TIMEOUT_MS`                    | no → omitted    | as above. It bounds connection setup only — not a statement, request or invocation timeout, and not a latency target                                                                                                                                                                                    |
| `GOOGLE_FEED_HOST`                         | **yes**         | the authority every absolute URL in the feed is composed from, replacing the legacy `CGI.HTTP_HOST` reads. Held to RFC 3986 §3.2.2 with §3.2.3's optional port. Its shape is checked; its **identity is not**, and that residual exposure stays documented rather than overclaimed                      |
| `SETTING_APPLICATION_ROOT_MAPPING_PATH`    | no              | one of the three of eighteen setting values whose legacy default is **computed** rather than stored, so no static table can hold it. Consumed by `StaticSettingResolver` through the container                                                                                                          |
| `SETTING_SKU_ELIGIBLE_CURRENCIES`          | no              | as above — the legacy computes it from the excluded `Currency*` family                                                                                                                                                                                                                                  |
| `SETTING_SKU_ELIGIBLE_FULFILLMENT_METHODS` | no              | as above — the legacy computes it from the excluded `Fulfillment*` family                                                                                                                                                                                                                               |

| `CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY` | no → **every read route refuses** | the largest number of records **one** smart-list query may materialise. Applied by **both** execution members of the query builder by counting before hydrating and **refusing** an over-budget selection rather than truncating it — see §8.1 |
| `CATALOG_SMART_LIST_MAX_PREDICATES_PER_QUERY` | no → **every read route refuses** | the largest number of query-**complexity** units one compiled statement may carry — one bound parameter plus one `ORDER BY` term plus one join. Bounds keyword cardinality, `FI:`/`FIR:` list cardinality, `OrderBy` cardinality, join count **and statement size** together — see §8.1 |
| `CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST` | no → **`sku.createSkus` refuses** | the largest number of SKU combinations one merchandise `createSkus` request may enumerate. Applied between the count and the first SKU allocation, so an over-budget request constructs, attaches and validates nothing |
| `CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION` | no → **the three save routes refuse** | the maximum number of uniqueness probes one URL-title derivation may issue. Bounds the **probe**, never the algorithm: the slug transformation and the `-2`-first suffix sequence are unchanged inside the budget |
| `CATALOG_GOOGLE_FEED_MAX_IMAGES_PER_RECORD` | no → **the feed refuses** | the largest number of `g:additional_image_link` elements one feed record may emit. Checked **before** the image loop, so an over-budget record resolves no path at all |
| `CATALOG_GOOGLE_FEED_MAX_RESPONSE_BYTES` | no → **the feed refuses** | the largest size in **bytes** the rendered feed document may reach. Measured on the finished document and **refused**, never truncated — a truncated RSS document is malformed, not smaller |

**Nineteen names — six required and thirteen optional — read in exactly one file, documented in exactly one
template, and the two lists agree in both directions.** Verify the split rather than taking it on trust:
`grep -o 'process\.env\.[A-Z_]*' src/config/env.ts | sort -u | wc -l` reports exactly **19** distinct names,
each read exactly once; the six bare `NAME=` lines in `.env.example` are the required set, and the thirteen
commented lines are the optional set.

⚠️ **"OPTIONAL" IS A STATEMENT ABOUT LOADING, NOT ABOUT SERVING, AND THE SIX RESOURCE BOUNDS MAKE THAT
DISTINCTION MATTER.** None of the six is required for the module to load or for the graph to be composed —
which is what keeps `tsc`, `eslint`, `esbuild` and the whole test suite runnable with no environment at all.
Every one of them is required for the routes that apply it to SERVE. A deployment that states none of the six
loads cleanly and then refuses every request, naming the variable each route needed. §8.1 sets out why that
is the fail-closed direction the security review required. A failure names the offending variable, carries it in `context`, and leaks **no supplied
value** into its message, context or stack. The **six** required variables have no default of any kind: a
connection target, a schema and an identity cannot be guessed.

⚠️ **An earlier revision of this paragraph said "the ten required variables", which is the optional count in
the required slot.** Review finding **F7** covers it; the same triplicated sentence was corrected in
`src/config/env.ts` under finding **F11**, where three copies of it disagreed about whether six or ten were
required.

### 8.1 The six resource bounds — required to serve, never invented

Three findings in one place. **SEC-DOS-01** (CWE-400) reported unbounded — and potentially
non-terminating — SKU combination generation. **SEC-DOS-02** (CWE-400) reported that
"authenticated SmartList requests may run with no materialization budget", that large `keywords`, `FI:` lists
and repeated `OrderBy` statements expand SQL before any row-count gate sees it, and that the anonymous feed
buffered its whole document "with no image-count, byte or elapsed-time bound". **SEC-DOS-03** (CWE-400)
reported unbounded URL-title collision probing. All three are now closed by APPLYING an operator-stated
ceiling at each point, and by making each ceiling REQUIRED rather than optional.

#### What changed, and what it costs

| Before                                                                    | Now                                                                  |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| One bound wired (`smartListMaximumRecordsPerQuery`), two read-and-ignored | **Six** bounds, every one applied                                    |
| The collaborator was an **optional** constructor argument                 | **Required**, on the builder, both services and the feed builder     |
| Unset meant **unbounded**                                                 | Unset means the routes that apply it **refuse**, naming the variable |
| Only `google:feed.product` declined to serve                              | Every route that applies a bound declines to serve                   |

⚠️ **The cost, named rather than buried: a deployment that states none of the six refuses every request.**
That is the fail-closed direction, it is diagnosable — the refusal names the exact variable — and
`.env.example` states it as a deployment requirement so nobody has to discover it from a `500`. The
route-to-variable map is in that file.

#### Why the earlier withdrawals do not stand

The SKU combination ceiling and the URL-title probe ceiling were each added and withdrawn **twice**, and the
optional materialisation budget was defended on the same reasoning. The decisive argument offered each time
was cardinality: that AAP §0.6.7.7 licenses **exactly one** departure from behavioural preservation — D18,
the importer's parameterised SQL — and that §0.8.2 guideline 4 admits no proportionality test.

That argument misreads what §0.6.7 governs. **§0.6.7 is the _defect and TODO carry-over register_:** its
twenty-one entries are legacy **business-logic** defects — a misnamed struct, an inverted cache guard, an
unreachable private method — and D18 is the one member of _that register_ the port repairs. The availability
of the extracted service is not an entry in it. Reading D18's exception as a licence to ship an exploitable
resource-exhaustion path would make §0.6.7.7 say that a migration must reproduce a denial-of-service vector.
Guideline 4 forbids enhancing **business logic**; none of these ceilings changes a single SKU, URL title,
record or feed field for any request it admits.

And AAP §0.7.3 affirmatively requires the other direction: with no user Rules (§0.7.1) the plan binds this
port to §0.7.3's enterprise standards, and standard **S8** — flag mismatches rather than assume them away — is
discharged by the `TODO(parity)` blocks that still record the **legacy** as unbounded. It is not discharged by
leaving the port unbounded too.

#### No figure is authored anywhere

Not in `env.ts`, not in the container, not in any collaborator, and this is what answers the objection that
withdrew the ceilings the first time. Every bound is carried by a **resolver**, asked at the moment the bound
is applied:

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

#### The one clause still open, flagged rather than guessed

SEC-DOS-02 also asked for an **elapsed-time** bound on the feed and for streaming, asynchronous generation or
a cached artefact. Neither is implemented, and the reason is recorded rather than passed over: AAP §0.6.6 **M2**
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

**One consequence of the fail-safe default is worth stating, because it is easy to misread as a fault.**
Supplying only the required variables is enough for the service to load, and the three **pool** bounds then
fall back transparently — but `DB_TLS_MODE` falls back to `verified`, so the driver demands TLS with a
verifiable chain. (The three **catalog** bounds of §8.1 do not fall back at all: absent means unbounded, and
the one route that requires one refuses instead.) Against a local database that serves no verifiable certificate, a route that actually
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
ALTER TABLE SwOption      ADD UNIQUE INDEX uq_SwOption_optionCode           (optionCode);
ALTER TABLE SwOptionGroup ADD UNIQUE INDEX uq_SwOptionGroup_optionGroupCode (optionGroupCode);
ALTER TABLE SwOption      ADD UNIQUE INDEX uq_SwOption_group_sortOrder      (optionGroupID, sortOrder);
ALTER TABLE SwOptionGroup ADD UNIQUE INDEX uq_SwOptionGroup_sortOrder       (sortOrder);
ALTER TABLE SwSkuOption   ADD UNIQUE INDEX uq_SwSkuOption_pair              (optionID, skuID);
```

The two sort-order indexes differ in shape because the entities do: `model/entity/Option.cfc:L56` declares
`sortContext="optionGroup"` so its uniqueness is per group, while `OptionGroup` declares none so its maximum
is whole-table.

**Authoring that DDL is forbidden, not overlooked.** AAP §0.2.2.5 places schema migration outside this
refactoring entirely — "the `Sw*` tables are read and written as they are" — so the statements above are
**stated for an operator to ratify** and appear nowhere in the deliverable as executable code. Stating them
with the exact index shapes is the discharge AAP §0.7.3 **S8** asks for; claiming the gap closed would not be.

#### Why the earlier withdrawal does not stand

Every one of these locks existed in an earlier revision and was withdrawn on a single argument, which the
source now records at each site: _"AAP §0.6.7.7 declares exactly ONE departure from behavioural preservation
in this port — D18 — and it declares it so that a reviewer diffing behaviour has exactly one entry to check.
A lock-wait is observable under concurrency, and §0.8.2 Guideline 4 admits no proportionality test."_

That misreads its own citation. **§0.6.7 is the _defect and TODO carry-over register_** — twenty-one legacy
**business-logic** defects, a misnamed struct, an inverted cache guard, an unreachable private method — of
which D18 is the one member the port repairs. The extracted service's data integrity under concurrency is not
an entry in it, so §0.6.7.7 never spoke to these locks at all. Reading D18's exception as the sole licence to
take a lock anywhere would make §0.6.7.7 say that a faithful migration must reproduce a TOCTOU race.

Guideline 4 forbids enhancing **business logic**, and a lock enhances none: `FOR UPDATE` selects precisely the
rows the same predicate selects without it, so every verdict and every value is identical — the suites assert
that on both the locked and the unlocked path. What changes is only when a **second concurrent** transaction
may ask, and a second concurrent transaction is not an observable of the legacy's single-threaded behaviour.

One further piece of evidence is worth recording, as corroboration rather than as licence: the legacy's own
author serialized this exact pattern where they noticed it. `org/Hibachi/HibachiDAO.cfc:L182` wraps
`updateRecordSortOrder`'s read-then-write over the same column in
`<cflock timeout="60" name="updateSortOrder…">` around a `<cftransaction>`. That guards a **reorder**, not the
**seed** this port carries, and `org/Hibachi/HibachiEntity.cfc:L637-L647` takes no lock at all — so the seeding
path genuinely is unprotected upstream. This port serializes it with the database's own mechanism rather than
importing an application lock from a member it never ported.

### 8.3 The image write: what is gated, what is delegated, and what stays carried

Review finding **SEC-FILE-01** (CWE-22, CWE-434) named a path-traversal and unrestricted-upload exposure on
the SKU image contract. Its exploit: store or import `imageFile=../../../../tmp/payload.jpg`, then call
`sku.processImageUpload`. Its mitigating fact is worth quoting, because it determines what the fix has to be
— the shipped image adapter is `NotImplemented` and refuses, so no file write occurs today, and the
vulnerability "becomes reachable as soon as a functional adapter is supplied **under the existing
contract**." The defect was therefore never a byte this port writes. It was that the contract obliged
nothing, so a future adapter author would have been conforming, and exposed.

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

**A correction to the record.** An earlier revision bounded this exposure by observing that "exactly two
writers populate the column, and both assign the output of one generator". There is a **third**, and it takes
arbitrary caller data: `model/dao/ProductDAO.cfc:L207` calls
`saveImportData(data, r, "SlatwallSku", skuColumns, …)` with `skuColumns` derived from the uploaded file's own
headings, so a `sku_imageFile` heading writes straight to the row — the "store/**import**" half of the
exploit. That correction is why screening at the point of use is the right seam: it screens all three writers
at once. The import itself is deliberately **not** gated — an imported row is a database write, not a file
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
keeps the legacy behaviour and its residual exposure is flagged for an operator to close in an adapter
(§0.7.3 S8). The write path differs on exactly this point, and it is what licenses the gate: `saveImageFile`
**does not exist anywhere in the legacy** — one call site, zero declarations, and the `save*` prefix routes
the name to `onMissingSaveMethod`, which `org/Hibachi/HibachiService.cfc:L253` documents as
"Ordered arguments only--named arguments not supported" while the call site passes only named arguments. The
legacy has no well-defined result on that path for any input. Guideline 4 requires existing behaviour be
preserved "exactly as-is"; where there is none, nothing is preserved and nothing is changed, so §0.6.7.7's
single-exception clause is not engaged. This is not a second exception — it is a path that never had a first
outcome.

**The test double was part of the finding.** It answered `true` unconditionally and applied no
`allowedExtensions` policy, which the review recorded as a permissive image-write double. The objection is
not about strictness: a `true` from an unconditional double is evidence only that the service _asked_, never
that a conforming implementation would have _stored_. It now applies the extension list it is handed — the
one policy `model/service/SkuService.cfc:L212` passes across the boundary — so the two refusal mechanisms are
distinguishable by their call log: the gate leaves it empty, the extension policy leaves both members in it.

### 8.4 The ratified database surface, and the credential it implies

A deployment needs to know exactly which tables this service touches and with what privilege. That question
had two answers before review finding **SEC-SQL-SCOPE-01**, neither complete: a whitelist in
`src/adapters/mysql/QueryRunner.ts`, and private frozen literal objects in two sibling adapters that reached
no gate at all. It now has one. `TABLE_SCOPES` in `QueryRunner.ts` is the single registry, and
`registeredTableScopes()` returns it, so a provisioning script can be **generated from the code** rather than
transcribed from this table and left to drift from it.

Ratifying the surface found more than the finding had counted. Auditing every emitted identifier — rather
than only the two modules the finding cited — turned up a **third** private literal object, in
`MySqlProductRepository.ts`, holding five further tables from the excluded `Attribute*` family. One of them,
`SwAttributeValue`, is **written**. A ratification that had stopped where the finding stopped would have
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
GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.SwProduct               TO '<user>'@'<host>';
GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.SwSku                   TO '<user>'@'<host>';
GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.SwProductType           TO '<user>'@'<host>';
GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.SwBrand                 TO '<user>'@'<host>';
GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.SwOption                TO '<user>'@'<host>';
GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.SwOptionGroup           TO '<user>'@'<host>';
GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.SwSkuOption             TO '<user>'@'<host>';
GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.SwSkuAccessContent      TO '<user>'@'<host>';
GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.SwSkuSubsBenefit        TO '<user>'@'<host>';
GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.SwSkuRenewalSubsBenefit TO '<user>'@'<host>';
GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.SwRelatedProduct        TO '<user>'@'<host>';

-- the one cross-domain table the importer writes; no DELETE, because nothing here deletes one
GRANT SELECT, INSERT, UPDATE         ON <schema>.SwAttributeValue        TO '<user>'@'<host>';

-- the sixteen read-only tables
GRANT SELECT ON <schema>.SwAlternateSkuCode            TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwSubscriptionTerm            TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwStock                       TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwOrderItem                   TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwInventory                   TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwOrderDeliveryItem           TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwPhysicalCountItem           TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwStockAdjustmentDeliveryItem TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwStockAdjustmentItem         TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwStockHold                   TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwStockReceiverItem           TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwVendorOrderItem             TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwAttributeSet                TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwAttribute                   TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwAttributeSetProductType     TO '<user>'@'<host>';
GRANT SELECT ON <schema>.SwType                        TO '<user>'@'<host>';
```

**The classification is enforced, not merely recorded** — which is what makes this a fix rather than a table
in a README. `assertWriteTableName` refuses a `cross-domain-read-only` name outright, so a write path cannot
compose a statement against an excluded family's table even by accident; it fails at **composition**, naming
the classification, before a connection is involved and before an over-granted deployment could let it
through. `assertRegisteredColumnName` does the same for columns, and it validates each name against the
**table that declares it** rather than merely checking the spelling — which is the actual risk, since `skuID`
is declared on nine of the twenty-eight tables and `stockID` on seven, so a mis-paired name would still be a
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

📐 **A measurement note, because the numbers here differ from the plan's summary.** Every per-file and
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
- **The seven validation documents.** These are **behaviour, not configuration** (**IR-4**): they are
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
`sku.salePrice` — a typed port is declared and the gap is flagged (**TR-5**). `Brand.cfc`, `Option.cfc` and
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
# 70 production files (69 TypeScript modules + the Google adapter's own README)
find src -type f | wc -l
# 11 root config files, and the single build script
find . -maxdepth 1 -type f | wc -l && find build -type f | wc -l
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
git ls-files slatwall-ts | wc -l                       # 102
git ls-files 'slatwall-ts/src/**' | wc -l              #  70
git ls-files 'slatwall-ts/test/**/*.test.ts' | wc -l   #  17
npx jest --listTests | wc -l                           #  17
```

It did not start that way, and the history is the point rather than an embarrassment. Earlier revisions
carried **sixteen production modules and twenty-two suites** outside the plan — three shared configuration
tiers, five per-surface compositions, a persistence adapter, a write runner, a runner contract, a
bounded-read port, a smart-list-input module, a SKU smart-list composer and a probe-budget leaf, plus suites
for each. Review passes classified the surplus as a **project-inventory breach** and required that unplanned
files be folded into the approved file whose subject they share rather than left outside the plan or thinned
to fit. §5.5 lists the module folds with their hosts and §12.1 the suite folds; §13.4 records the two that
were withdrawn rather than folded, and why.

⚠️ **The production side carries no such surplus, and that is the property review finding F5 restored.**
Four production files once sat outside the target inventory — `catalogAggregates.ts`,
`MySqlProductPersistence.ts`, `MySqlTransactionalWriteRunner.ts` and `TransactionalWritePort.ts` — and three
more were reachable from them, so every built handler depended transitively on unplanned production code.
Each has been folded into the AAP-listed file that owns its concern (the aggregate loaders into
`SmartListQueryBuilder.ts`, the product write surface into `MySqlProductRepository.ts`, the write runner into
`UnitOfWork.ts`, the runner contract into `container.ts`, the bounded-read and smart-list-input types into
`SmartListQueryPort.ts`, and the five per-surface compositions and three shared tiers into `container.ts`)
and deleted — with one exception recorded as one: the URL-title probe budget was **removed** rather than
folded, because the ceiling it applied is itself withdrawn (§13.4). Walking the import graph from all six
build entry points now reaches **53 modules, every one of them AAP-listed**, with **no runtime import
cycle** — verified across all 69 modules and 162 value-import edges. The 16 modules not on that walk are
reached only through `import type`, which `tsc` erases: the eight boundary and five repository PORTS are
interfaces, the two `Product_Add*` process objects are input shapes, and the option and option-group rule
sets are reachable only through a delete guard no route in the slice can call.

---

## 10. Interface parity and the translation decisions

### 10.1 The 28 preserved public members

The observable contract is the public method surface of the four services, **28 members in total, verified by
declaration scan**, preserved by **name, arity and argument order** (**TR-1**) so that interface parity is
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

> **Arity parity has been broken once and restored.** A code review found two members carrying an
> **unapproved third parameter** — `ProductService.loadDataFromFile` had gained an `options` argument and
> `SkuService.getSkuSmartList` an `additionalJoins` argument, where AAP §0.4.2.1 and §0.4.2.2 tabulate two
> each. Both are removed. The import controls now travel behind a **private constructor collaborator** read
> per call, so a warm container cannot carry one invocation's `AbortSignal` into the next; the caller's joins
> travel through `SmartListInput.additionalJoins`, a channel the smart-list input already merged and the feed
> query was already using. Nothing was dropped — only relocated off the public surface.

**Where the port's signature differs from the plan's tabulated cell, and why.** Three members' signatures are
not what AAP §0.4.2 tabulates. None is a quiet substitution, and all three resolve the same way — **TR-1**
tightens a loose legacy signature to the contract the legacy BODY states, and the body is unambiguous in every
case:

| Member                                    | Plan's cell              | Port                                                | Why                                                                                                                                                                                                                                                                                                |
| ----------------------------------------- | ------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SkuService.getTransactionExistsFlag`     | `()`                     | `(skuID?, productID?)`                              | the legacy declares no parameters at `model/service/SkuService.cfc:L285` and then forwards `argumentCollection=arguments` into a DAO member that accepts two, which is how `model/entity/Sku.cfc:L594` and `model/entity/Product.cfc:L626` scope the probe to one row. Corrected by finding **F1** |
| `SkuService.processImageUpload`           | `Promise<Sku>`           | `Promise<boolean>`                                  | the legacy body has exactly two returns, `true` and `false`, and never returns the entity. Corrected by finding **F2**                                                                                                                                                                             |
| `ProductService.getFormattedOptionGroups` | `FormattedOptionGroup[]` | `Readonly<Record<string, readonly SelectOption[]>>` | `model/service/ProductService.cfc:L71-L79` builds a struct keyed by option-group **name**; an array of `{ optionGroupName, options }` records is a different shape with different collapse behaviour. The name-collapse is preserved by accumulating through a `Map`. Corrected by finding **F3**  |

**⚠️ Each of those three was documented the _other_ way in several files until a code review measured it.** The
record of all three corrections is in §12.4, and the point of keeping it is that "verified by declaration
scan" is a claim about the _members_, not a guarantee that every cell in a frozen table matches every body it
describes. Where a description and the code disagree, **the code is the fact**.

**One consequence of the first row is worth stating on its own, because it is a transposition hazard.** The
service member is **SKU-first** — `(skuID?, productID?)`, the order the two entity call sites read most
naturally — while `SkuRepository.transactionExists` keeps the legacy DAO's **PRODUCT-first** declaration order
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
literal branch keys of `createSkus` (**IR-7**). They are 32-character lowercase hex with no dashes:

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
field mapping. **`GoogleIntegration.ts` is nearly empty by faithfulness, not by neglect** — a reviewer
expecting the integration file to hold the feed logic should read this sub-section first.

The builder emits RSS 2.0 with the `xmlns:g="http://base.google.com/ns/1.0"` namespace and the channel title
"Slatwall Product Feed", and preserves every field mapping: `g:id` from the SKU code; `title` from the
product's calculated title; `description` from the product description **with a fallback to the product
type's description**; an intentionally empty `g:google_product_category`; `g:product_type`; `link`;
`g:image_link` from the SKU's resized image path; a repeated `g:additional_image_link` per product image
— the five absolute URLs among these are composed over **`https://`** where the legacy composed `http://`,
which is the second of §12.4's two declared departures —;
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

> **This has moved twice, and the history matters because the expectations moved with it.** An earlier
> revision escaped **all fifteen** sinks and additionally **percent-encoded** the data-derived path of the
> three URL fields, on one review's authority as a CWE-91 remedy. A later review (**CQ-9**) reversed both as
> an unapproved second hardening exception: escaping a raw sink changes bytes the legacy publishes unmodified
> — a stored `&raquo;` became `&amp;raquo;` — and the encoder changed even innocuous paths, publishing a
> stored `a%20b` as `a%2520b`. The later review governs.
>
> **The injection exposure the first review identified is still closed, by refusal instead of by encoding.**
> A raw sink now **refuses** `&`, `<` and `]]>`; combined with a check for code points outside the XML 1.0
> `Char` production at **every** sink (finding **SEC-2**), a value that would have made the published
> document unparseable produces a `DataIntegrityError` — **500** — rather than a malformed `200`. For every
> input the legacy rendered into a well-formed document, the emitted bytes are identical.
>
> ⚠️ **THE URL HALF IS NOW CLOSED TOO, AND AN EARLIER VERSION OF THIS BLOCK SAID IT WAS NOT.** It read
> "no gate is minted for the **path** half because `imageMissingImagePath` is an operator-editable setting
> whose relative forms the legacy published" — and that premise is wrong: `model/entity/Product.cfc:L206-L208`
> writes the leading slash into the composed literal, so the legacy could not publish a path without one.
> Finding **F8** required both halves gated, and both are: `validateFeedHostAuthority` holds the configured
> authority to RFC 3986 §3.2.2 `host` with §3.2.3's optional port, and `assertSameOriginRelativePath` holds
> every appended path to a leading `/`, never `//`, with no scheme and no authority — at **all three** URL
> sinks. Neither forecloses a legacy outcome, so neither is a declared departure; the **scheme** change to
> `https://` is, and §12.4 declares it. `src/integrations/google/README.md` §13a holds the full accounting,
> including which residual risks remain open.

**The additional-image reader is a required boundary, not a silent default.** Finding **CQ-4** found the
shipped reader answering an empty list unconditionally, which made an image-less catalog and an unwired
boundary indistinguishable and dropped every `g:additional_image_link`. A deployment now supplies the reader
through `createCatalogContainer({ productFeedImages })`; supplying nothing yields a classified **501**.

It is a **stub**. There is **no live call to Google's API**, no credential, no endpoint and no outbound HTTP
client anywhere in the integration — consistent with the single runtime dependency of §4.1.
`src/integrations/google/README.md` carries the full account, including the Google Merchant specification URL
cited in the legacy view header.

### 10.8 The boundary-limited members — the measured inventory, not the plan's annotation

AAP §0.4.2.1 annotates **seven** members as boundary-stubbed, and **TR-5** requires that every one of them
keeps its route: "the member is never quietly dropped from the interface." All seven do. What follows is what
each one **actually does at run time**, measured rather than restated — because an earlier revision asserted
that all seven "answer with the documented not-implemented failure", and **review finding F4** found that
false of two of them. The invariant is corrected here rather than the code being bent to fit it; the same
inventory is carried in `src/handlers/router.ts` judgment (h), and neither of the two exceptions is a defect.

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

⚠️ **One handler-level precheck was removed for the same reason.** `sku.getSkuBySkuCode` rejected a request
carrying no `skuCode` with a `400`, but `model/service/SkuService.cfc:L289` declares the argument **optional**
and the DAO tolerates its absence — so the precheck refused input the legacy accepts. The route now forwards
`undefined` and answers whatever the repository answers (**F5**). `sku.processImageUpload` keeps its own `400`,
and the asymmetry is deliberate: its `imageUploadResult` argument is `required` in the legacy declaration.

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
aggregate: of the **17** suites, **4 carry TRACEABLE cases and 13 are wholly NET-NEW** — and inside those
four the imbalance is sharper still, **13 traceable cases against 2,329 net-new ones**. The four are
`test/domain/Product.test.ts` (6), `test/domain/Brand.test.ts` (4), `test/regression/issues.test.ts` (2) and
`test/services/BrandService.test.ts` (1).

**Every suite carries an explicit TRACEABLE or NET-NEW provenance label**, and in every suite the label also
travels in each individual case title — which is why a failing case names its own provenance in the runner's
output rather than requiring a reader to find the file's header.

Two clarifications, because both numbers were previously stated wrong here and a reader is entitled to know
which way they moved. AAP §0.6.5.1 identified **five** catalog-relevant issue regressions; the suite carries
**eight**, so the port is a **superset** of the plan and the table below names all eight rather than the
plan's five. And the suite count is **17**, measured with `npx jest --listTests`, not the 36 an earlier
revision of this section reported. **Twenty-two suites once ran outside AAP §0.4.1.12's declared plan:
twenty-one are folded into the approved suite whose subject each shares, and one — the surface-reachability
suite — was withdrawn** because the module separation it measured no longer exists to measure. Every one of
the twenty-one folds is verifiable on disk: each folded body sits under a `FOLDED IN FROM` banner naming its
origin, and `grep -rc 'FOLDED IN FROM' test/` counts exactly twenty-one. Folding moved coverage; it removed
none, which is why the case count went **up** rather than down.

**TRACEABLE — extends existing legacy coverage:**

| Target                           | Legacy source                                       | Coverage carried forward                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `test/domain/Product.test.ts`    | `meta/tests/unit/entity/ProductTest.cfc`            | the `productUrlIsCorrectlyFormatted()` assertion plus the four assertions inherited from `SlatwallEntityTestBase`                                                                                                                                                                                                              |
| `test/domain/Brand.test.ts`      | `meta/tests/unit/entity/BrandTest.cfc`              | the overridden defaults assertion requiring `getProducts()` to be an empty array, plus three inherited                                                                                                                                                                                                                         |
| `test/regression/issues.test.ts` | `meta/tests/unit/IssuesTest.cfc`                    | eight of the ten catalog issue regressions, **retaining their legacy method names as test names** — `issue_1097`, `issue_1296`, `issue_1329`, `issue_1331`, `issue_1335`, and additionally `issue_1348`, `issue_1690` and `issue_1690_2`                                                                                       |
| `test/fixtures/testProduct.ts`   | `meta/tests/unit/Helper.cfc:L51-L77`                | the fixture contract carried exactly, from `getTestMerchandiseProduct()` at `:L51` and `destroyTestMerchandiseProduct()` at `:L69` — product name `Test Product` (`:L54`), price `100` (`:L55`, a number: the legacy line is unquoted), product code `TESTPRODUCTXXX` (`:L56`), and the merchandise product-type UUID (`:L58`) |
| `test/fixtures/productTypes.ts`  | `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` | the three literal discriminator UUIDs of §10.5 (**IR-7**)                                                                                                                                                                                                                                                                      |

📐 **The regression suite carries EIGHT of the ten `issue_*` methods in `IssuesTest.cfc`, and the arithmetic
is written out because an earlier revision of this section said seven and listed only seven.**
`meta/tests/unit/IssuesTest.cfc` declares exactly ten: `issue_1097`, `issue_1296`, `issue_1329`, `issue_1331`,
`issue_1335`, `issue_1348`, `issue_1376`, `issue_1604`, `issue_1690` and `issue_1690_2`.

**The two that are absent are named rather than left to inference:** `issue_1376` (`:L140`), which drives
`accountService`, and `issue_1604` (`:L183`), which drives the cart — both in families AAP §0.2.2.1 excludes,
so neither has an in-scope subject to assert against.

**Of the eight carried, five are the ones AAP §0.6.5.1 identified as catalog-relevant** (1097, 1296, 1329,
1331, 1335) and three are additional (`issue_1348`, `issue_1690` and its sibling `issue_1690_2`, which are two
separate legacy methods rather than one). Counting distinct legacy issue **numbers** the figure is seven;
counting legacy **methods** ported, which is what the suite mirrors one-for-one, it is eight. The suite is
therefore a **superset** of the plan's five, stated as one rather than presented as the plan's own list, and
the eight case titles retain their legacy method names so the mapping is checkable by reading the runner's
output.

One further case in that suite is **NET-NEW and labelled as such**: an `issue_1296` companion asserting that
the guarantee the original regression rests on is join **direction**, since fanning rows would break it while
still satisfying the original assertion. It extends no legacy method and is not counted among the eight.

**Traceability here is documentary, never empirical.** MXUnit and CFSelenium are not vendored and no CFML
runtime is reproducible in this environment (§12.2), so every one of these eight was established by reading
the legacy method rather than by running it and comparing output.

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
   and reads no environment, and that the graph resolves only on first invocation (§6). ⚠️ The **31 cases that
   asserted the module graph itself** were withdrawn rather than folded, because the per-surface separation
   they measured no longer exists — adapting them would have meant asserting the opposite of what they were
   written to assert. The withdrawal record sits at the foot of that same suite and names what it gives up.
3. **Which connection each rebuilt collaborator holds inside a write boundary** — **M5** and **M6** — which
   the legacy had no equivalent of either, its commit being implicit at request end and gated on
   `getORMHasErrors()`. Those cases point the pool at a port nothing listens on and hand the rebuild a
   recording executor, so a single collaborator left pool-bound fails with a connection refusal instead of
   passing quietly. It is the only assertion in the subtree that can see that mistake, since `tsc` cannot and
   a happy-path database test would not.

**Where the twenty-one folded suites went.** Folding relocated coverage into the approved seventeen; it
removed none, and each folded body sits inside one `describe` under a banner naming its origin, so a reviewer
can read any of them as the file it used to be. Every host was chosen because it already owns the subject. The
row counts below sum to **twenty-one**, which is what `grep -rc 'FOLDED IN FROM' test/` reports.

| Folded suite(s)                                                                                                                                                     | Host                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `handlers/productHandler`                                                                                                                                           | `services/ProductService.test.ts`             |
| `handlers/skuHandler`                                                                                                                                               | `services/SkuService.test.ts`                 |
| `handlers/brandHandler`                                                                                                                                             | `services/BrandService.test.ts`               |
| `handlers/optionHandler`                                                                                                                                            | `services/OptionService.test.ts`              |
| `integrations/ProductFeedQuery`, `integrations/GoogleIntegration`, `integrations/BaseIntegration`, `integrations/IntegrationContract`, `handlers/googleFeedHandler` | `integrations/ProductFeedBuilder.test.ts`     |
| `adapters/MySqlProductPersistence`, `adapters/MySqlBrandRepository`                                                                                                 | `adapters/MySqlProductRepository.test.ts`     |
| `adapters/UnitOfWork`, `adapters/UnitOfWorkSortOrder`                                                                                                               | `adapters/MySqlSkuRepository.test.ts`         |
| `adapters/SmartListQueryBuilder`                                                                                                                                    | `adapters/MySqlOptionRepository.test.ts`      |
| `adapters/catalogAggregates`                                                                                                                                        | `adapters/MySqlProductTypeRepository.test.ts` |
| `domain/process/processObjects`                                                                                                                                     | `domain/Product.test.ts`                      |
| `handlers/httpResponse`, `handlers/entrySurface`, `config/env`, `config/container`, `config/writeBoundaryRebuild`                                                   | `regression/issues.test.ts`                   |

**Three groups of cases were ADDED rather than relocated, because the same QA pass found the approved corpus
did not constrain them at all.** They are net-new and labelled so:

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

### 12.4 Defect register — AAP §0.6.7's frozen D1–D21, carried by number, plus four observations carried by locator

**The governing rule: legacy defects are carried across as flagged `TODO(parity)` annotations rather than
silently fixed.** Fixing any of them would violate behaviour preservation and make the port's output
incomparable to the legacy system (**IR-9**), and Refactor Discipline Guideline 4 forbids it outright.
`no-warning-comments` is switched off permanently in the lint configuration so that a lint gate cannot make
that requirement unbuildable.

Scanning the in-scope files found **exactly three literal TODO comments**. The tables below are AAP §0.6.7's
**frozen D1–D21** — 21 entries, because the analysis surfaced eighteen further defects a competent engineer
would instinctively fix, and naming each one converts an invisible temptation into a documented decision.

**⛔ THE REGISTER STOPS AT D21, AND THIS PORT MINTS NO IDENTIFIER OF ITS OWN.** AAP §0.6.7 is frozen at
**D1–D21** and AAP §0.6.6 at **M1–M8**; a frozen document's range cannot drift, so both may be cited freely.
Neither range is amended here, and no file in the subtree amends them.

**An earlier revision of this section, and of `src/ports/repositories/SkuRepository.ts`, minted four further
defect numbers (`D22`–`D25`) and one further mismatch number (`M9`) and declared a "live numbering" running
past those bounds.** That was governance the plan does not grant: AAP §0.1.2.1 records the plan as "the
FROZEN, agreed-upon source of truth — align code to it; never edit, weaken, or reinterpret it". Every one of
those five numerals is **withdrawn from the subtree**, and the reason is practical as well as procedural — a
number invented in the port cannot be traced to the plan, cannot be checked against it, and drifts the moment
it is restated in a second file. That bound had already drifted twice, once to `D1-D22` and once to `D1-D24`,
with files contradicting one another.

**⭐ The OBSERVATIONS are not withdrawn — only the numbers.** Each is a real reading of real source, and each
is now carried where it belongs, identified **by its `path:Lnnn` locator** — which is the form AAP §0.8.2
Guideline 6 actually asks for, and the form a reviewer can verify without consulting a register at all.
`src/ports/repositories/SkuRepository.ts` is the natural index for the four below; it states the two frozen
bounds once and mints nothing.

| Observation                                                                                                                                                                                                                                                                                                  | Legacy locator                                           | Where it is annotated, and what the port does                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SkuDAO` mixes **logical entity names and physical table names** inside native statements, intra-file. The logical names arise because the framework prefixes an entity name with the application key at `org/Hibachi/HibachiDAO.cfc:L102-L106`, a mapping-layer convenience native statements never receive | `model/dao/SkuDAO.cfc:L132`, `:L135` versus `:L179-L211` | `src/ports/repositories/SkuRepository.ts`, and each affected member. **Both vocabularies are kept rather than unified** (§5.5): never "fix" a mapping-layer entity name to a physical one, and never assume a logical name works in a native statement                                                |
| `getTransactionExistsFlag` **forwards arguments its own signature never declares**, which is how the two entity call sites scope the probe                                                                                                                                                                   | `model/service/SkuService.cfc:L285-L287`                 | `src/services/SkuService.ts`, `src/domain/sku/Sku.ts`, `SkuRepository.transactionExists`. **TR-1 tightens the loose signature to the observed `(skuID?, productID?)`**; the repository keeps the legacy declaration order `(productID, skuID)`, so exactly two lines cross the two orders — see §10.1 |
| `processImageUpload` **returns the image-write boolean**, not the entity its own framework convention asks for (`org/Hibachi/HibachiService.cfc:L117`)                                                                                                                                                       | `model/service/SkuService.cfc:L210-L218`                 | `src/services/SkuService.ts`. The body has exactly two returns, `true` and `false`. **The port forwards that boolean**, so the observation records the legacy's departure from its own framework — not the port's from the legacy                                                                     |
| `getFormattedOptionGroups` **answers a plain CFML struct keyed by option-group name**, so two groups sharing a name collapse and the earlier one is lost                                                                                                                                                     | `model/service/ProductService.cfc:L70-L80`               | `src/services/ProductService.ts`. **The port answers the same keyed shape** — `Readonly<Record<string, readonly SelectOption[]>>` — and preserves the collapse by accumulating through a `Map` before freezing                                                                                        |

**⚠️ The last three of those four are places where AAP §0.4.2's target column and the legacy body disagree, and
all three are now resolved the same way: the legacy BODY states the contract, and TR-1 is the rule that
tightens a loose legacy signature to it.** Review findings **F1**, **F2** and **F3** required exactly that,
after revisions had resolved each of them the other way and left several files describing behaviour the code
did not have. §10.1 tabulates the three signatures; where a description and the code disagree, the code is the
fact.

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

| Corrected by | The claim that was wrong                                                                                                                                                                                    | What the code does now                                                                                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F1**       | `SkuService.getTransactionExistsFlag()` took **no arguments**, so both entity call sites lost their scoping identifier and the handler route answered a permanent `501`                                     | `getTransactionExistsFlag(skuID?, productID?)` forwards into the repository's own `(productID, skuID)` order, and the route answers the repository's boolean. `src/domain/sku/Sku.ts`, `SkuRepository.ts` and the in-memory double all agree |
| **F2**       | `SkuService.processImageUpload` answered `Promise<Sku>`, discarding the write verdict the legacy returns                                                                                                    | it answers `Promise<boolean>`, forwarding `ImagePathPort.saveImageFile`'s verdict, and `sku.processImageUpload` publishes that boolean                                                                                                       |
| **F3**       | `ProductService.getFormattedOptionGroups` answered `FormattedOptionGroup[]` — an array of `{ optionGroupName, options }` records — which is not the shape `model/service/ProductService.cfc:L71-L79` builds | it answers `FormattedOptionGroups` = `Readonly<Record<string, readonly SelectOption[]>>`, keyed by option-group name, with the legacy's last-write-wins collapse intact. `productHandler`'s response projection is keyed the same way        |

#### Five review-directed changes that are not defect entries and not departures

These are **not** carried legacy defects and carry no register identifier. Each is a place where a code review
instructed a change, and each cites that review as its authority. Crucially, **none of the five changes an
outcome the legacy produced** — each either classifies a refusal the legacy already failed, or refuses input
the legacy's own upstream could not have supplied. That is what separates them from the two declared
departures below.

| Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Authority                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **The Google feed refuses rather than publishes malformed XML.** A value carrying a code point outside the XML 1.0 `Char` production — or, at a **raw** sink, `&`, `<` or `]]>` — is refused with a `DataIntegrityError` (**500**) instead of producing an unparseable 200. Every input the legacy rendered into a _well-formed_ document is byte-identical; only inputs whose legacy render had no defined XML parse diverge                                                                                                                                                                                                                        | finding **SEC-2**                |
| **Three impossible product process routes answer `501`.** `addProductReview`, `addSubscriptionTerm` and `uploadDefaultImage` require _callable_ process objects that a parsed JSON body can never satisfy, so they return a classified `NotImplementedError` instead of a generic `500`. The members stay routable (**TR-5**) — §10.8 tabulates the measured boundary inventory these three sit inside                                                                                                                                                                                                                                               | finding **CQ-6**                 |
| **The feed's additional-image reader has no silent default.** An unwired image boundary answers `501` rather than emitting a document with every `g:additional_image_link` silently missing                                                                                                                                                                                                                                                                                                                                                                                                                                                          | finding **CQ-4**                 |
| **`GOOGLE_FEED_HOST` is held to a host-authority grammar.** RFC 3986 §3.2.2 `host` with §3.2.3's optional port: userinfo, path, query and fragment delimiters (`@`, `/`, `\`, `?`, `#`), whitespace, control characters, empty labels and out-of-range ports are refused with a fail-fast `ConfigurationError` that never echoes the rejected value. **This forecloses no legacy outcome** — the value stands in for `CGI.HTTP_HOST`, and RFC 9110 §7.2 already _defines_ the HTTP `Host` field as exactly that grammar with userinfo excluded, so every value the legacy input could hold is admitted and only values it could not hold are refused | finding **F8** (CWE-20, CWE-601) |
| **Every appended feed path is constrained to a same-origin relative path** at all three URL sinks — the item `link`, `g:image_link` and each `g:additional_image_link`: a leading `/`, never `//`, no scheme and no authority. **This forecloses no legacy outcome either** — `model/entity/Product.cfc:L206-L208` writes the leading slash into the composed literal, so the legacy could not emit a path without one                                                                                                                                                                                                                               | finding **F8** (CWE-601)         |

Conversely, the **escaping census is _not_ a change of any kind**: an earlier revision recorded escaping all
fifteen dynamic feed sinks as a second declared hardening exception, and finding **CQ-9** reversed that. The
port now reproduces the legacy's six-escaped / nine-raw split exactly. See §10.7.

#### The two declared departures from behavioural preservation

Stated prominently and exhaustively, because the whole value of this register is that a reviewer comparing
generated output against legacy output has a **closed** list of places where a difference is intended. There
are exactly two. Everything else in §12.4 either carries a legacy behaviour unchanged or classifies a failure
the legacy already produced.

**1. Parameterized SQL in the importer — D18, licensed by AAP §0.6.7.7.**

`model/dao/ProductDAO.cfc` builds **21** statements via `setSql()` with direct interpolation of
**file-supplied** values — including `L165` `WHERE optionGroupName = '#optionGroupKey#'`, and further
instances at `L180`, `L184`, `L213`, `L219` and `L244`. That is an unparameterized **SQL-injection surface
fed directly from an uploaded file.**

The port uses `pool.execute()` with `?` placeholders throughout, which **structurally eliminates the entire
class of flaw**. AAP §0.6.7.7 declares this departure by name, so it needs no other authority.

**2. The feed's five absolute URLs are `https://`, where `product.cfm` emits `http://` — directed by finding
F8 (CWE-319).**

`integrationServices/google/views/feed/product.cfm` composes `http://#CGI.HTTP_HOST#` at `L14`, `L15`, `L22`,
`L23` and `L24`. The port composes `https://` at the same five sinks — the channel `link`, the channel
`description` prefix, each item `link`, `g:image_link`, and each `g:additional_image_link`. A merchant feed is
fetched by a third party over the public internet and its URLs are followed by shoppers, so cleartext is the
wrong default; F8 required it changed. **The change is a behavioural difference and is therefore declared here
rather than filed among the review-directed changes above**, which is where F8's host-authority and
relative-path rules sit, because those two foreclose no legacy outcome and this one does.

⚠️ **What is deliberately NOT re-schemed.** `xmlns:g="http://base.google.com/ns/1.0"` stays `http://`
because an XML namespace name is an **identifier compared byte-for-byte**, not a fetch target — changing it
would silently invalidate every `g:` element for every consumer. The Google Merchant specification URL quoted
in `src/integrations/google/README.md` is likewise reproduced as the legacy view header wrote it.

**Both departures are deliberate, documented hardening — never a silent fix**, and both are asserted by the
suite so that a later revision cannot quietly reverse either one.

### 12.5 Execution-model mismatches — AAP §0.6.6's frozen M1–M8, flagged rather than silently resolved

Eight are frozen in AAP §0.6.6 and tabulated below. Each is presented as a **decision surfaced**, with its
source-declared value and locator, and with **no invented figure of any kind**.

**⛔ THE RANGE STOPS AT M8, FOR THE REASON §12.4 GIVES.** An earlier revision minted a ninth identifier for a
real observation — CFML specifies **no iteration order** for a plain struct, while the port's `Map` preserves
insertion order, so the combination engine's enumeration order is guaranteed here in a way the legacy never
guaranteed it. The **numeral** is withdrawn; the **observation is not**. It is annotated where it belongs, at
`src/services/SkuService.ts`, identified by its locator `model/service/SkuService.cfc:L58-L211` — and it
matters because that enumeration order determines both the generated SKU set and, through the read-back loop
of §10.3, the order in which uniqueness validation observes its siblings. A defined order is **stricter** than
the legacy's, so it is recorded rather than relied upon.

| ID     | Mismatch                                                                                                                                                                                  | Why it does not map to one Lambda invocation                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1** | a **3600-second** request budget in the importer — `model/service/ProductService.cfc:L65-L68`, `cfSetting(requesttimeout="3600")`                                                         | AWS Lambda's maximum function timeout is **15 minutes**, so a 3600-second budget is **unrepresentable** in a single invocation. The importer's handler is documented as requiring an out-of-band model — chunked or queued — and is **not silently re-timed to fit**                                                                                                                                                                                                          |
| **M2** | a **360-second** feed render — `integrationServices/google/views/feed/product.cfm:L9`, `requesttimeout="360"`                                                                             | it fits the function ceiling but far exceeds what a **synchronous request-response integration** in front of the function will generally allow. **No single figure is named for that second ceiling**, because there is not one to name: those limits vary by gateway type, region and configuration, several are themselves configurable, and **this deliverable selects no gateway**. The choice between asynchronous and streamed delivery is left as an explicit decision |
| **M3** | **per-row transactions** in the importer — `model/dao/ProductDAO.cfc:L176-L177`, where `transaction{` opens **inside** the record loop                                                    | each row commits independently, so a mid-file failure leaves a **partially imported catalog**. `UnitOfWork` reproduces per-row commit boundaries rather than wrapping the whole import                                                                                                                                                                                                                                                                                        |
| **M4** | a remote file fetch **inside** the transaction-bearing request — `model/dao/ProductDAO.cfc:L87`, with a fallback at `L88-L90`                                                             | network I/O performed inside the request, compounding M1 and M3                                                                                                                                                                                                                                                                                                                                                                                                               |
| **M5** | request-scoped implicit commit — `flushAtRequestEnd=false` with a double `ormFlush()` at request end, **gated on the ORM having no errors**                                               | there is no request-end hook in a stateless handler; `UnitOfWork` makes the boundary explicit per invocation                                                                                                                                                                                                                                                                                                                                                                  |
| **M6** | the **validation read-back loop** of §10.3                                                                                                                                                | the highest chance of silently changing results anywhere in the slice                                                                                                                                                                                                                                                                                                                                                                                                         |
| **M7** | second-level caching — `cacheuse="transactional"` on **111 of 113** entities — plus lazy per-instance caches and the memoized option-group sort order at `model/dao/SkuDAO.cfc:L204-L226` | nothing survives between invocations except module-scope state, so **memoisation is scoped to the request object rather than the module**, to avoid cross-tenant bleed on a warm container                                                                                                                                                                                                                                                                                    |
| **M8** | an out-of-band `cfthread` in the excluded setting service                                                                                                                                 | out of scope, but it constrains the contract: `SettingResolverPort` is declared **synchronous**, so no caller in the slice depends on background completion                                                                                                                                                                                                                                                                                                                   |

**None of these is presented as a performance figure or a service-level target; this deliverable states only
what the source declares.** The only timing **budgets** named anywhere in this subtree are M1's 3600 seconds
and M2's 360 seconds, and each is source-declared with a locator. The one platform limit quoted above —
Lambda's 15-minute maximum function timeout — is a published ceiling, not a commitment made here.

> **An earlier revision of the M2 row named a "roughly 29-second" synchronous gateway budget, and a code
> review was right to object.** That figure is the default integration timeout of one specific gateway
> product, quoted as though it applied universally; it is configurable on that product, differs on others,
> and no gateway is part of this deliverable. Naming it read as an invented ceiling (**IR-12**), so the row
> now states the shape of the constraint and declines to put a number on it — which is also what
> `src/handlers/googleFeedHandler.ts` and `src/adapters/mysql/SmartListQueryBuilder.ts` already said in
> their own notes.

**M2 is about TIME, and the other four dimensions of the feed's work are bounded elsewhere.** Findings
**SEC-1** and then **SEC-DOS-02** (both CWE-400) concerned how many _rows_ a selection can be forced to
hydrate, how _complex_ a statement can be made, how many _images_ one record can expand into, and how many
_bytes_ the buffered document can reach. All four are operator-supplied figures from §8, each applied
fail-closed and each **refusing** rather than truncating; §8.1 sets them out. Leaving M2 open does **not**
leave any of the four unbounded, and the five must not be conflated — nor does bounding the four settle M2,
which is why the seam described in §8.1 stops short of naming a duration.

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

⛔ **Do not relocate this subtree under `/integrationServices/`.** That directory is the legacy plug-in
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

**The one place this line was crossed, and how far it had to be walked back.** A revision of this subtree added
security hardening the legacy has no equivalent of, and a QA pass found it. The decisive argument against it
was **cardinality, not merits**: AAP §0.6.7.7 licenses exactly **one** behavioural departure — D18's SQL
parameterization — and the register exists precisely so that a reviewer comparing generated output against
legacy output has a closed list of entries to check. An **undeclared** second departure, however defensible on
its own, destroys that property; Guideline 4 admits no proportionality test, and AAP §0.7.1 records the plan as
frozen. Six categories were therefore withdrawn:

| Withdrawn                                                                                                             | What now happens instead                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL **userinfo** and **control-character** refusal in the brand URL check                                             | `isCfUrlAnyProtocol` is the bare six-protocol check again — `(https?\|ftp\|file)://` or `(mailto\|news):`, non-empty, no internal whitespace — and judges nothing else |
| a runtime guard refusing unrecognised **validation-context** tokens                                                   | the closed nine-member union is the whole constraint, and it is compile-time only                                                                                      |
| an always-on **SKU-combination** ceiling and an optional configurable one                                             | the odometer enumerates exactly as `model/service/SkuService.cfc:L58-L211` does, with no bound                                                                         |
| an optional **URL-title probe** ceiling, and the whole of `util/urlTitleProbeBudget.ts`                               | the derivation probes exactly as `model/service/DataService.cfc:L64` does, unbounded                                                                                   |
| an **import-source (SSRF) policy** — some 420 lines of IPv4/IPv6/loopback apparatus — and `ImportSourceRejectedError` | the importer fetches the location it is given, and the exposure is carried as mismatch **M4**                                                                          |
| **transaction-locking reads** in the uniqueness probes and the sort-order read                                        | both read without `FOR UPDATE`, and the TOCTOU window is carried unrepaired                                                                                            |
| broadened **feed escaping** and URL **percent-encoding**                                                              | the serializer escapes exactly the six fields `product.cfm` escapes and emits every other dynamic value raw, and appends no percent-encoding of its own                |

**Every one of those exposures is now flagged where it lives rather than closed.** That is the uncomfortable
half of Guideline 4 and it is stated plainly: CWE-367 at both uniqueness probes and the sort-order read — and
note that `optionCode` and `optionGroupCode` have **no** `unique="true"` column behind them, so for those two
the application-side check is the only check; CWE-918 at the importer; and CWE-91 at nine feed sinks. **Closing
any of them requires separately authorised scope. It cannot be smuggled into a frozen extraction plan through
tests** — which is exactly how it happened the first time, and why the withdrawal removed the expectations as
well as the behaviour.

⚠️ **Three of the withdrawn feed exposures were later re-closed — on instruction, not on merit, which is the
only footing that works.** A **host-syntax rule** for `GOOGLE_FEED_HOST` and a **relative-path rule** at the
three URL sinks were withdrawn with the rest of that revision, and finding **F8** required both back
(CWE-20, CWE-601). They return on a footing the withdrawn versions never had: neither forecloses any outcome
the legacy could produce, so neither is a behavioural departure — §12.4 sets out both arguments, and §12.4's
two-entry departure list is where F8's **scheme** change (CWE-319) is declared instead, because that one _is_ a
difference. The lesson the withdrawal taught still holds: **the authority has to be external and it has to be
cited.** What changed is that here it exists.

**One related wiring defect was fixed rather than withdrawn, because it was a defect and not hardening.** The
feed's shipped factory wired a constant-empty product-image reader, so a product with three images rendered as
a product with none, with nothing reporting a problem. That is materially worse than a refusal, so the graph
now supplies a reader that answers `[]` **only** for a product whose image collection is genuinely empty and
**raises** for one that carries images — the per-image path comes from `model/entity/Image.cfc:L79-L81`, an
entity AAP §0.2.1.2 does not include. The boundary is one value wide and it is named rather than approximated.

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
7. **Preserve and annotate, do not repair** — the 21 legacy defects of the frozen register carried as flagged
   `TODO(parity)` annotations, with the two declared departures and their reasoning (§12.4). The four further
   port-boundary observations are carried **by source locator rather than by a minted number**, and are
   additions to the record, never repairs to the code (§12.4); the six categories of unauthorised hardening
   that once breached this standard were withdrawn (§13.4).
8. **Flag mismatches rather than assume them away** — the eight frozen execution-model mismatches, plus the
   struct-iteration-order observation carried by locator, surfaced as decisions rather than resolved by
   guesswork (§12.5).
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
