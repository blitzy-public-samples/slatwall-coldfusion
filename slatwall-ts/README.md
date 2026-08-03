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
  build configuration, and the ColdFusion application builds and runs identically whether this directory
  exists or not — which is what makes the whole deliverable reviewable as a single additive diff.

**Authority for this file:** AAP §0.3.1, §0.4.1.2 (the package-surface CREATE row) and §0.5.6.2 — "build,
test and package commands; runtime and toolchain versions; the documented scope boundary."

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

| Item                  | Value                                        | Where it is pinned                                      |
| --------------------- | -------------------------------------------- | ------------------------------------------------------- |
| Node.js               | **20.20.2**                                  | `.nvmrc`                                                |
| `engines.node`        | **`>=20.20.2`**                              | `package.json` — derivation in §2.1                     |
| npm                   | **10.8.2**                                   | the version shipped with that Node line                 |
| TypeScript            | **5.9.3**                                    | `devDependencies`, `strict` mode                        |
| Target Lambda runtime | `nodejs20.x`                                 | named in prose only — no infrastructure file is written |
| MySQL                 | any server holding the existing `Sw*` schema | needed **only to run** the service                      |

The running toolchain in this checkout is Node **v20.20.2** with npm **10.8.2**, which matches `.nvmrc`
exactly, so the pins and the machine agree. A newer Node may also satisfy `engines` and install
successfully — **do not "correct" the pins on that basis.** `.nvmrc` stays `20.20.2`, `engines.node` stays
`>=20.20.2`, `@types/node` stays `20.19.43` and `typescript` stays `5.9.3`; these are express instructions,
not artifacts of one machine, and §2.2 explains why the Node pin in particular is deliberate.

Two things are **not** prerequisites, stated so nobody goes looking for them: a database is needed only to
_run_ the service — the build and the whole test suite need none — and **an AWS account is not required for
anything in this document**.

### 2.1 Why `engines.node` names a patch version rather than `>=20`

The floor is derived, not chosen. Intersecting every declared `engines.node` range in the resolved
dependency graph, `eslint@10.8.0`'s `^20.19.0` is strictly the **highest lower bound on the 20.x line** —
above `ts-jest`'s `>=20.0.0`, above `esbuild`'s `>=18`, above `typescript`'s `>=14.17`. So the graph itself
forbids anything below **20.19.0**.

A bare `">=20"` would satisfy an instruction that says "Node 20.x" while still admitting an install of Node
20.0 through 20.18, where an `EBADENGINE` warning or an outright lint failure is waiting. Naming the real
floor removes that failure mode.

The manifest then raises the floor one step further, to **`>=20.20.2`** — the exact version `.nvmrc` pins
and the exact version every claim in this file was verified against. Two numbers appear here on purpose and
neither is invented: **20.19.0** is what the graph requires, **20.20.2** is what this project declares, and
declaring the pinned version means the floor and the pin can never silently disagree.

### 2.2 Runtime lifecycle — a disclosure, not a performance claim

The pinned runtime line is out of upstream support, and this is surfaced rather than quietly retargeted.

- Node.js 20 reached upstream end-of-life on **30 April 2026**, and AWS aligned the Lambda `nodejs20.x`
  runtime deprecation to the same date. After it, AWS stops applying security patches and removes the
  runtime from the Console's creation list, though it remains selectable through the CLI, CloudFormation,
  SAM and CDK.
- **Published timelines conflict on the subsequent hard gates.** One gives a Phase 2 block on function
  creation at **31 August 2026** and a Phase 3 block on updates at **30 September 2026**; another gives
  **1 June 2026** and **1 July 2026** respectively. Both are recorded because neither can be treated as
  settled. In every published timeline, functions already deployed continue to be invocable.
- **The pin stands.** `nodejs20.x` and Node 20.x remain the stated target, because they are an express
  instruction (AAP §0.5.5, verbatim: "The pin stands."). Consistently, AAP §0.5.3.2 rejects a newer
  `@types/node` precisely so the type surface keeps matching the runtime rather than a later one.
- **The blast radius of a later move is four artifacts.** `--target=node20` in `build/esbuild.mjs`; the
  `engines` field together with `.nvmrc`; the `@types/node@20.19.43` pin; and the version statements in this
  file. Because the hexagonal boundary confines all AWS coupling to `src/handlers/**`, migrating is
  mechanical — **no change to `src/domain/**`, `src/services/**`, `src/ports/**` or `src/adapters/**`.**
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

| Command                 | What it runs                | Measured result                                |
| ----------------------- | --------------------------- | ---------------------------------------------- |
| `npm ci`                | install from the lockfile   | 398 packages, 0 `EBADENGINE`, 0 audit findings |
| `npm run typecheck`     | `tsc --noEmit`, full strict | **0 errors**                                   |
| `npm run lint`          | `eslint .`                  | **0 problems**                                 |
| `npm run format:check`  | `prettier --check .`        | all matched files conform                      |
| `npm test`              | `jest --ci`                 | **36 suites, 2187 tests, 0 failures**          |
| `npm run test:coverage` | `jest --ci --coverage`      | same suites, plus an lcov report               |
| `npm run build`         | `node build/esbuild.mjs`    | 6 CommonJS artifacts, exit 0 (§6)              |

`npm ci` rather than `npm install`: the lockfile is committed so resolution is reproducible, and `ci` is the
command that honours it exactly.

`npm run typecheck` must pass **before** a build is trusted — esbuild strips types without checking them, so
the bundle must never be the thing that hides a type error. Nothing in the compiler, lint, format or test
configuration is relaxed to reach those results: `tsconfig.json` keeps `strict`,
`exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`, and `ts-jest` runs that same `tsconfig.json`
with no `diagnostics: false`.

`jest.config.ts` sets `collectCoverage: true`, so `npm test` reports coverage as well. It declares **no
`coverageThreshold`** and no quality gate of any kind — measured coverage is published, no target is
asserted, and none is invented (§12.1 records why: the legacy structural gate is inert and the legacy suite
carries no line or branch instrumentation at all).

Two notes that save a wasted debugging session:

- **`ts-node` is a required dependency, not an optional convenience.** `jest.config.ts` is authored in
  TypeScript, so Jest cannot read its own configuration without it — see §4.4.
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

### 4.2 Development

`typescript` **5.9.3** · `@types/node` **20.19.43** · `@types/aws-lambda` **8.10.162** · `jest` **30.4.2** ·
`ts-jest` **29.4.12** · `@types/jest` **30.0.0** · `ts-node` **10.9.2** · `esbuild` **0.28.1** · `eslint`
**10.8.0** · `typescript-eslint` **8.65.0** · `prettier` **3.9.6**.

Every one is an exact pin — no range, no `latest`, no placeholder — and every version was read back from the
installed package's own `node_modules/<pkg>/package.json`. `npm ci` installs **398 packages with zero engine
failures, zero peer-dependency conflicts and zero audit findings**, and `npm install --package-lock-only`
leaves the lockfile byte-identical, so resolution is reproducible.

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

### 4.4 Two recorded deviations from the plan's dependency inventory

Both are documented inside `package.json` itself, each with its reasoning and a removal trigger, so a
reviewer auditing the manifest finds them beside the block rather than having to reconstruct them. They are
summarised here so the count in §4.2 reads honestly.

- **Eleven development dependencies where the plan's inventory lists ten.** The eleventh is **`ts-node`
  10.9.2**. AAP §0.4.1.2 and the target tree in AAP §0.3.1 both require the test configuration to be
  `jest.config.ts` — a TypeScript file — and `jest-config` loads a `.ts` config by dynamically importing
  `ts-node`, which it declares as an optional peer. Node 20 cannot strip types on its own, so on this pinned
  runtime the mandated filename is unloadable without it and `npm test` would fail before a single case ran.
  Renaming the config to `.js` would restore the count of ten by violating two explicit plan rows, so
  keeping the mandated filename and documenting the consequence is the lesser deviation. It is dev-only,
  reachable from no source file, and never bundled.
- **An `overrides` block** pinning `minimatch` **10.2.6** and `test-exclude` **7.0.2**, closing
  GHSA-mh99-v99m-4gvg / CVE-2026-14257 (unbounded brace expansion) where it is reachable transitively
  through the Jest toolchain. It is a security remediation rather than a preference, and it is authorised by
  no plan dependency row, so it is declared. The rejected alternatives — overriding `brace-expansion` itself,
  which fails at run time on an ESM/CommonJS export mismatch, and pinning `glob` — are recorded beside the
  block along with the verification evidence and the condition for removing it.

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
               container.ts (the memoized composition root, replacing the DI/1 bean scan)
  domain/      typed entities, base types and process objects — no framework, no ORM, no AWS
  validation/  Validator.ts plus the seven typed rule sets ported from model/validation/*.json
  ports/       5 repository ports (+ a shared BoundedRead type) and the 9 boundary ports of §5.3
  adapters/    mysql/** (parameterized SQL, row mappers, UnitOfWork) · settings/**
  services/    BaseService + ProductService · SkuService · BrandService · OptionService
  handlers/    router.ts, the 4 service handlers, googleFeedHandler.ts, httpResponse.ts
               — the AWS boundary, and the only layer that names an AWS type
  integrations/google/  the stub contract, the feed query and the feed builder
  errors/  util/
test/          36 suites, mirroring the layers above
build/         esbuild.mjs — the whole build step, and the only file in the directory
```

**76 TypeScript sources and 36 test suites.** Every intra-subtree import is a **relative path**: there is no
`paths` mapping, no `baseUrl`, no `moduleNameMapper` and no runtime resolver shim, so `tsc` and `esbuild`
resolve identically and no runtime shim is needed. `module` and `moduleResolution` are both `NodeNext`;
esbuild emits CommonJS. Configuration flows one way — `env.ts` → `database.ts` → `container.ts` →
`src/handlers/**` — and **nothing below the config layer reads the environment directly.**

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

| Port                     | Why it exists                                                                                                                                                                                                                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SettingResolverPort`    | resolves the eighteen configuration keys the slice reads through `HibachiEntity.setting()` (`model/entity/HibachiEntity.cfc:L129`), including the interpolated `productImage<size>Width` / `productImage<size>Height` form. Declared **synchronous**, so no caller depends on background completion (**M8**)                |
| `ImagePathPort`          | image path, resized path and existence flag (`model/entity/Sku.cfc:L145, L192, L221`) — the hidden `imageService` dependency of §5.2                                                                                                                                                                                        |
| `SubscriptionTermPort`   | subscription-term resolution for the `subscription` branch of `createSkus`                                                                                                                                                                                                                                                  |
| `AccessContentPort`      | content resolution for the `contentAccess` branch of `createSkus`                                                                                                                                                                                                                                                           |
| `PricingPort`            | the price reads retained members need — notably the feed's conditional sale-price fields                                                                                                                                                                                                                                    |
| `AccountContextPort`     | current-account context, replacing the request-scoped Hibachi scope lookup                                                                                                                                                                                                                                                  |
| `SmartListQueryPort`     | the filter, join, range, ordering and pagination surface the SmartList members and the feed controller depend on                                                                                                                                                                                                            |
| `UniquePropertyPort`     | application-side uniqueness checking, reproducing `org/Hibachi/HibachiDAO.cfc:L130-L146` (**IR-5**) — required _in addition_ to the database's own unique columns, because the legacy enforces it with an HQL existence query during validation                                                                             |
| `TransactionalWritePort` | the Unit-of-Work boundary as a **declaration**, so a handler can reach a transaction without importing from `adapters/**`. The pattern is named at AAP §0.3.3 and the file is authorised by AAP §0.4.4; it is the ninth port, beyond the eight the plan enumerates, and it is listed here so this file agrees with the tree |

**This is what makes the subtree independent.** Every dependency reaching outside the catalog slice
terminates at a declared port rather than at an unconverted module, so `slatwall-ts/` builds, tests and
packages with no reference to unconverted code — the strangler-fig property the exercise requires.

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
  graph itself. `container.beginInvocation()` runs before every route on every invocation, so a warm
  container cannot carry one request's state into the next (**M7**).

---

## 6. Build output

`npm run build` runs `node build/esbuild.mjs`, whose emitted invocation is exactly

```text
esbuild --bundle --platform=node --target=node20 --format=cjs --external:mysql2
```

and which writes **one CommonJS artifact per declared Lambda entry point**:

```text
dist/handlers/router.js               the aggregate surface — all 34 addresses
dist/handlers/productHandler.js       the 18 product addresses
dist/handlers/skuHandler.js           the 9 SKU addresses
dist/handlers/brandHandler.js         the 3 brand addresses
dist/handlers/optionHandler.js        the 3 option addresses
dist/handlers/googleFeedHandler.js    the single feed address
build-meta/sourcemaps/handlers/*.map  the six source maps
```

Properties worth knowing, each measured rather than assumed:

- **Every artifact exports an invocable `handler`.** `router.js` is the natural single-function deployment;
  each per-service artifact serves only its own addresses and answers `404` for any other, so a deployment
  may instead give each surface its own function. Nothing else lands in `dist/` — no chunk, no map, no build
  report.
- **The six entry points are a frozen literal list**, not a directory scan. A declared entry that is missing
  fails the build with a non-zero exit naming the path, and a non-test module appearing in `src/handlers/`
  that is neither a declared entry nor the acknowledged `httpResponse.ts` helper fails it too — so the
  artifact set cannot drift in either direction without a reviewer seeing it.
- **A failed build leaves nothing behind.** The step removes exactly its own previous outputs before it
  asserts or emits anything, so a red build can never leave a green build's artifacts in the packaging
  directory. The removal is enumerated from the entry list — never a recursive delete.
- **Source maps are emitted beside `dist/`, not into it** (`build-meta/`, git-ignored), so the packaged tree
  carries only what the runtime loads. `sourcemap: 'external'` writes no `sourceMappingURL` comment, so
  relocating a map leaves no dangling reference.
- **`mysql2` is the only external**, appearing as `require("mysql2/promise")`. No `node_modules` code is
  inlined, and the AWS SDK is absent from the dependency graph entirely because the runtime already provides
  it.
- **Consecutive builds are byte-identical**, and the build reads no environment variable, opens no
  connection and needs no credential.
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
  `import()`**, so the same code answers identically whether it runs from `dist/`, from a plain `tsc` emit,
  under `ts-node` or under `ts-jest`. An earlier revision used `await import('../config/container.js')` and
  did not: TypeScript's `NodeNext` emit preserves a native `import()` in CommonJS output, and Node's ESM
  resolver then demands an on-disk `.js` that only an emit produces — so running the TypeScript sources
  answered `500` for every action while the artifact answered correctly.
- **Size, stated plainly and as measurement only.** Each artifact measures between 1,581,626 and 1,636,935
  bytes, and the six together total 9,600,264 bytes (`du -sh dist` reports 9.2 MiB) — measured in this
  checkout with `ls -l`. They are that size
  because an artifact that can be deployed on its own must contain the graph it wires; a single function
  loads one artifact, not the directory. Code splitting is deliberately off — it could hoist or duplicate
  `src/config/database.ts`, and duplicating that module duplicates the connection pool. `minify` and
  `legalComments` are available levers, deliberately unexercised so each artifact keeps the reasoning its
  source records. **No size budget is asserted here or anywhere else in the subtree** (IR-12).
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

```js
const { handler } = require('./dist/handlers/router.js');

await handler({ queryStringParameters: { slatAction: 'google:feed.product' }, headers: {} });
await handler({
  queryStringParameters: { slatAction: 'product.getProduct' },
  pathParameters: { productID: '…32 hex chars…' },
  headers: {},
});
```

The feed answers RSS 2.0 with the `xmlns:g="http://base.google.com/ns/1.0"` namespace and
`Content-Type: application/xml`; every other route answers JSON.

⚠️ **As shipped, that RSS answer is the empty-selection answer, and the distinction is worth reading before
treating a `501` as a regression.** With no qualifying SKU the feed renders an empty channel as
`200 application/xml`. With even one qualifying SKU it reaches `ImagePathPort` and answers
`501 {"message":"This operation is not implemented"}`, because that port is a **declared out-of-scope
boundary** rather than an unfinished one. Both outcomes are correct and both are measured; §5.3 follows the
port through in full. "The feed works" therefore means "the feed works once `ImagePathPort` is supplied".

### 7.1 Response conventions

| Status | Meaning                                                                                  |
| ------ | ---------------------------------------------------------------------------------------- |
| 200    | Success. Entities are **projected**, never serialised whole                              |
| 400    | The **request** is at fault — nothing was addressed, or a body was absent or unparseable |
| 401    | No principal could be established — see §7.2                                             |
| 403    | A known principal is not permitted                                                       |
| 404    | An unknown `slatAction`, **or** a well-formed request whose addressed resource is absent |
| 500    | An unclassified service fault, with all detail withheld                                  |
| 501    | A declared boundary port or a permanently unusable member was reached                    |

A configuration failure is classified as a configuration failure rather than as a generic fault. Failure
bodies carry a single `message` and nothing else: no stack frame, file path, SQL statement, table name, error
class name, member name or configuration value reaches a client; the detail is **redirected** to a structured
server-side log line carrying a correlation ID, never discarded.

### 7.2 There is no authentication, and that is deliberate

Every catalog member is gated on a **fail-closed** principal: `src/handlers/router.ts` supplies an
unauthenticated, deny-all resolver, so there is no account and every entity authorisation answers no.
Nothing parses a header, decodes a token, verifies a signature or consults a store — the legacy
authentication interfaces are out of scope, the framework's authentication service is code this slice must
never carry forward, and adding a gate the migration does not require is forbidden by Refactor Discipline
Guideline 4. So a gated route answers `401` until a deployment supplies its own resolver from its own edge,
and the seam for doing so is already each handler factory's parameter.

The **feed is the one exception**, and it is a port of
`integrationServices/google/controllers/feed.cfc:L54`, which declared `this.publicMethods="product"` with
both `anyAdminMethods` and `secureMethods` empty. It is anonymous because the legacy's was — and therefore,
with the default wiring, it is the only route that reaches a service at all.

---

## 8. Environment

Every value arrives through the process environment. `src/config/env.ts` is the only file under `src/**`
permitted to touch `process.env`, values are validated eagerly when that module loads, and the result is
frozen. `.env.example` is the authoritative list: it carries every variable name with **no value committed**
and documents each one.

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

Thirteen names, read in exactly one file, documented in exactly one template, and the two lists agree in both
directions. A failure names the offending variable, carries it in `context`, and leaks **no supplied value**
into its message, context or stack. The six required variables have no default of any kind: a connection
target, a schema and an identity cannot be guessed.

A loopback development database is reached with:

```sh
export DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=… \
       DB_USER=… DB_PASSWORD=… DB_TLS_MODE=disabled \
       GOOGLE_FEED_HOST=localhost:3000
```

**One consequence of the fail-safe default is worth stating, because it is easy to misread as a fault.**
Supplying only the required variables is enough for the service to load, and the three resource bounds then
fall back transparently — but `DB_TLS_MODE` falls back to `verified`, so the driver demands TLS with a
verifiable chain. Against a local database that serves no verifiable certificate, a route that actually
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

---

## 9. Scope boundary

### 9.1 In scope

The four Catalog services and their **28 public members**, the six catalog entities, the four catalog DAOs,
the three catalog process objects, the seven catalog validation documents, and the six-file Google feed
adapter as a **stub**.

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
optional, that `searchSkusByProductType` takes **two optional** arguments, that the service-level
`getTransactionExistsFlag()` takes **no arguments at all** while the DAO member beneath it accepts two, and
that `getProductSmartList`'s `currentURL` is declared in the legacy with **no type**.

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
`g:image_link` from the SKU's resized image path; a repeated `g:additional_image_link` per product image;
`g:condition` fixed to "new"; `g:availability` fixed to "in stock"; `g:price`; a **conditional**
`g:sale_price` plus `g:sale_price_effective_date` emitted only when the SKU price exceeds the sale price; a
**conditional** `g:brand`; `g:item_group_id` from the product code; and `g:shipping_weight` assembled from
**two** settings, `skuShippingWeight` and `skuShippingWeightUnitCode`. A further set of fields — gtin, mpn,
gender, age group, colour, size, material, pattern, tax, shipping and online-only — is present but
**commented out** in the legacy view, and the port keeps them commented with their names intact, because they
document the intended future surface and deleting them would lose information.

It is a **stub**. There is **no live call to Google's API**, no credential, no endpoint and no outbound HTTP
client anywhere in the integration — consistent with the single runtime dependency of §4.1.
`src/integrations/google/README.md` carries the full account, including the Google Merchant specification URL
cited in the legacy view header.

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
slice amounts to **two entity test files, five issue regressions and one fixture helper. Everything else is
net-new.** Every suite in `test/` labels itself, so the ratio is visible per file rather than only in
aggregate: **3 suites are TRACEABLE and 33 are NET-NEW**, of 36.

**TRACEABLE — extends existing legacy coverage:**

| Target                           | Legacy source                                       | Coverage carried forward                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `test/domain/Product.test.ts`    | `meta/tests/unit/entity/ProductTest.cfc`            | the `productUrlIsCorrectlyFormatted()` assertion plus the four assertions inherited from `SlatwallEntityTestBase`                                                                                                                                                                                                              |
| `test/domain/Brand.test.ts`      | `meta/tests/unit/entity/BrandTest.cfc`              | the overridden defaults assertion requiring `getProducts()` to be an empty array, plus three inherited                                                                                                                                                                                                                         |
| `test/regression/issues.test.ts` | `meta/tests/unit/IssuesTest.cfc`                    | catalog issue regressions **retaining their issue numbers as test names** — `issue_1097`, `issue_1296`, `issue_1329`, `issue_1331`, `issue_1335`, and additionally `issue_1348` and `issue_1690`                                                                                                                               |
| `test/fixtures/testProduct.ts`   | `meta/tests/unit/Helper.cfc:L51-L77`                | the fixture contract carried exactly, from `getTestMerchandiseProduct()` at `:L51` and `destroyTestMerchandiseProduct()` at `:L69` — product name `Test Product` (`:L54`), price `100` (`:L55`, a number: the legacy line is unquoted), product code `TESTPRODUCTXXX` (`:L56`), and the merchandise product-type UUID (`:L58`) |
| `test/fixtures/productTypes.ts`  | `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` | the three literal discriminator UUIDs of §10.5 (**IR-7**)                                                                                                                                                                                                                                                                      |

The regression suite carries **seven** of the ten `issue_*` methods in `IssuesTest.cfc`. The plan identified
five as catalog-relevant; the two additional ones are carried because they touch this slice too. That is a
superset, and it is stated as one rather than presented as the plan's five.

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

**One structural difference, stated plainly so it is not mistaken for a gap.** Legacy tests extend a base
class that boots the entire FW/1 application and resolves services through DI/1 at run time
(`meta/tests/unit/SlatwallUnitTestBase.cfc:L49-L84`) — they are **integration tests**. Target tests import
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

### 12.4 Defect register D1–D21 — preserve and annotate, do not repair

**The governing rule: legacy defects are carried across as flagged `TODO(parity)` annotations rather than
silently fixed.** Fixing any of them would violate behaviour preservation and make the port's output
incomparable to the legacy system (**IR-9**), and Refactor Discipline Guideline 4 forbids it outright.
`no-warning-comments` is switched off permanently in the lint configuration so that a lint gate cannot make
that requirement unbuildable.

Scanning the in-scope files found **exactly three literal TODO comments**. The register is **21 entries**
because the analysis surfaced eighteen further defects a competent engineer would instinctively fix — and
naming each one converts an invisible temptation into a documented decision.

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

#### The one declared departure from behavioural preservation — D18

Stated prominently, because a reviewer comparing generated SQL against legacy SQL must know the divergence is
intended.

`model/dao/ProductDAO.cfc` builds **21** statements via `setSql()` with direct interpolation of
**file-supplied** values — including `L165` `WHERE optionGroupName = '#optionGroupKey#'`, and further
instances at `L180`, `L184`, `L213`, `L219` and `L244`. That is an unparameterized **SQL-injection surface
fed directly from an uploaded file.**

The port uses `pool.execute()` with `?` placeholders throughout, which **structurally eliminates the entire
class of flaw**. This is the **single** place where the port intentionally does **not** preserve legacy
behaviour exactly, and it is declared here as **deliberate, documented hardening — never a silent fix.**

### 12.5 Execution-model mismatches M1–M8 — flagged, not silently resolved

Eight exist. Each is presented as a **decision surfaced**, with its source-declared value and locator, and
with **no invented figure of any kind**.

| ID     | Mismatch                                                                                                                                                                                  | Why it does not map to one Lambda invocation                                                                                                                                                                                                                         |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1** | a **3600-second** request budget in the importer — `model/service/ProductService.cfc:L65-L68`, `cfSetting(requesttimeout="3600")`                                                         | AWS Lambda's maximum function timeout is **15 minutes**, so a 3600-second budget is **unrepresentable** in a single invocation. The importer's handler is documented as requiring an out-of-band model — chunked or queued — and is **not silently re-timed to fit** |
| **M2** | a **360-second** feed render — `integrationServices/google/views/feed/product.cfm:L9`, `requesttimeout="360"`                                                                             | it fits the function ceiling but far exceeds the roughly **29-second** synchronous API Gateway integration budget. The choice between asynchronous and streamed delivery is left as an explicit decision                                                             |
| **M3** | **per-row transactions** in the importer — `model/dao/ProductDAO.cfc:L176-L177`, where `transaction{` opens **inside** the record loop                                                    | each row commits independently, so a mid-file failure leaves a **partially imported catalog**. `UnitOfWork` reproduces per-row commit boundaries rather than wrapping the whole import                                                                               |
| **M4** | a remote file fetch **inside** the transaction-bearing request — `model/dao/ProductDAO.cfc:L87`, with a fallback at `L88-L90`                                                             | network I/O performed inside the request, compounding M1 and M3                                                                                                                                                                                                      |
| **M5** | request-scoped implicit commit — `flushAtRequestEnd=false` with a double `ormFlush()` at request end, **gated on the ORM having no errors**                                               | there is no request-end hook in a stateless handler; `UnitOfWork` makes the boundary explicit per invocation                                                                                                                                                         |
| **M6** | the **validation read-back loop** of §10.3                                                                                                                                                | the highest chance of silently changing results anywhere in the slice                                                                                                                                                                                                |
| **M7** | second-level caching — `cacheuse="transactional"` on **111 of 113** entities — plus lazy per-instance caches and the memoized option-group sort order at `model/dao/SkuDAO.cfc:L204-L226` | nothing survives between invocations except module-scope state, so **memoisation is scoped to the request object rather than the module**, to avoid cross-tenant bleed on a warm container                                                                           |
| **M8** | an out-of-band `cfthread` in the excluded setting service                                                                                                                                 | out of scope, but it constrains the contract: `SettingResolverPort` is declared **synchronous**, so no caller in the slice depends on background completion                                                                                                          |

**None of these is presented as a performance figure or a service-level target; this deliverable states only
what the source declares.** The only timing **budgets** named anywhere in this subtree are M1's 3600 seconds
and M2's 360 seconds, and each is source-declared with a locator; the two platform limits quoted above are
published ceilings, not commitments made here.

Noted once, and deliberately **absent** from the inventory above: the legacy **60-second and 45-second
session locks in `OrderService` and `PaymentService`** were to be noted but not implemented. Those services
are out of scope, no session-locking mechanism appears in the target design, and they are therefore not
counted among M1–M8.

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
7. **Preserve and annotate, do not repair** — 21 legacy defects carried as flagged `TODO(parity)`
   annotations, with the single declared exception D18 and its reasoning (§12.4).
8. **Flag mismatches rather than assume them away** — the eight execution-model mismatches surfaced as
   decisions, not resolved by guesswork (§12.5).
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
