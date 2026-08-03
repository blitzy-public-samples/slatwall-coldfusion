# slatwall-ts — the extracted Slatwall Catalog slice

The Catalog business logic of Slatwall release 3.1.39 (`version.txt:L1`), extracted out of its
Hibachi / FW-1 / DI-1 ColdFusion monolith and re-expressed as strict-mode TypeScript running on
`nodejs20.x` behind a thin routing layer, over the **existing, unchanged MySQL `Sw*` schema** — so the
legacy application and this service continue to agree on the same tables.

This subtree is **self-contained and entirely additive**. It carries its own manifest, lockfile, compiler,
test, lint, format and build configuration, and no file outside `slatwall-ts/` is modified by it — not one
`.cfc`, not one `.cfm`, not `config/**`, not `meta/**`, not the repository-root `readme.md` and not the
repository-root `.gitignore` (AAP §0.4.1.1, §0.5.6.2). The legacy ColdFusion application builds and runs
identically whether this directory exists or not, which is what makes the whole deliverable reviewable as a
single additive diff.

Authority for this file: AAP §0.3.1, §0.4.1.2 (the package-surface CREATE row) and §0.5.6.2.

---

## 1. Toolchain

Every version below was read from the installed toolchain rather than recalled, and every command in §3
was executed against it.

| Component  | Version                                            | Where it is pinned                                      |
| ---------- | -------------------------------------------------- | ------------------------------------------------------- |
| Node.js    | **20.20.2**                                        | `.nvmrc`; `engines.node` declares the floor `>=20.20.2` |
| npm        | **10.8.2**                                         | the version shipped with that Node line                 |
| TypeScript | **5.9.3**                                          | `devDependencies`                                       |
| Jest       | **30.4.2** (+ `ts-jest` 29.4.12, `ts-node` 10.9.2) | `devDependencies`                                       |
| esbuild    | **0.28.1**                                         | `devDependencies`                                       |
| ESLint     | **10.8.0** (+ `typescript-eslint` 8.65.0)          | `devDependencies`                                       |
| Prettier   | **3.9.6**                                          | `devDependencies`                                       |
| mysql2     | **3.23.2**                                         | `dependencies` — the **only** runtime dependency        |

Two further requirements, stated so nobody goes looking for them: a **MySQL** database holding the existing
`Sw*` schema is needed **only to RUN the service** — the build and the test suite need none — and an **AWS
account is not required for anything in this document**.

`npm ci` installs 398 packages with **zero** `EBADENGINE`, zero peer-dependency conflicts and zero audit
vulnerabilities. The lockfile is committed, and `npm install --package-lock-only` leaves it byte-identical,
so resolution is reproducible (AAP §0.7.3 standard 5).

### 1.1 Why `engines.node` names a patch version

Intersecting every declared `engines.node` range in the resolved graph, `eslint@10.8.0`'s `^20.19.0` is the
highest lower bound on the 20.x line — higher than `ts-jest`'s `>=20.0.0`, `esbuild`'s `>=18` and
`typescript`'s `>=14.17`. A bare `">=20"` would satisfy "Node 20.x" while still admitting 20.0–20.18, where
an `EBADENGINE` warning or an outright lint failure is waiting. The floor here is raised further, to the
exact version `.nvmrc` pins, so the toolchain a reader gets is the one every claim in this file was verified
against.

### 1.2 Runtime lifecycle — a disclosure, not a performance claim

The pinned Node line is out of upstream support, and the managed Lambda runtime deprecation was aligned to
the same upstream date. AAP §0.5.5 weighs that and concludes **"The pin stands."** — it is an express
instruction, so nothing here quietly retargets it, and AAP §0.5.3.2 likewise rejects a newer `@types/node`
precisely so the type surface keeps matching the runtime. `npm run build` therefore prints a notice on every
run: a green build means the artifact **packaged**, which is all AAP §0.8.3.10 asks of it, and is not by
itself authorisation to ship. The notice deliberately does **not** fail the build.

Five artifacts carry the version coupling, and a runtime move changes them together:

1. `NODE_TARGET` in `build/esbuild.mjs` (a bundler flag — **no managed-runtime identifier string is
   authored anywhere in this deliverable**, because infrastructure as code is out of scope per AAP §0.2.2.5);
2. `engines.node` in `package.json`, together with `.nvmrc`;
3. the `@types/node` pin;
4. `tsconfig.json`'s `target`/`lib` pair;
5. the version statements in §1 of this file.

Items 1, 2, 3 and 5 are the four AAP §0.5.5 enumerates. Item 4 is an additional coupling measured in this
subtree that the plan does not name, and it is listed anyway because a reader auditing the couplings before a
bump has to find every one of them, not only the documented four. `build/esbuild.mjs` and `tsconfig.json`
each carry the identical list, so the three agree by construction rather than by coincidence.

Because the hexagonal boundary confines every AWS type to `src/handlers/**`, such a move touches those five
and nothing under `src/domain/**`, `src/ports/**`, `src/services/**` or `src/adapters/**`.

---

## 2. Layout

```
src/
  config/      env.ts (the ONLY reader of process.env) · database.ts (the module-scope pool)
               container.ts (the memoized composition root, replacing the DI/1 bean scan)
  domain/      typed entities and process objects — no framework, no ORM, no AWS
  ports/       repository ports and the boundary ports of AAP §0.2.2.7
  adapters/    mysql/** (parameterized SQL, row mappers, unit of work) · settings/**
  services/    ProductService · SkuService · BrandService · OptionService — the preserved surface
  validation/  Validator plus the seven typed rule sets ported from model/validation/*.json
  integrations/google/  the stub contract, the feed query and the feed builder
  handlers/    the AWS boundary — the only layer that names an AWS type
  errors/ util/
test/          36 suites, mirroring the layers above
build/         esbuild.mjs — the whole build step, and the only file in the directory
```

76 TypeScript sources and 36 test suites. Every intra-subtree import is a **relative path**; there is no
`paths` mapping, no `baseUrl`, no `moduleNameMapper` and no runtime resolver shim, so `tsc` and `esbuild`
resolve identically (AAP §0.4.3.5).

Dependency injection is **explicit constructor injection**, wired once in `src/config/container.ts`. There
is no service locator, no name-keyed lookup and no dynamic method synthesis anywhere: no `Proxy`, no `eval`,
no `new Function`, no decorator and no DI container library. The one `import()` expression in the subtree is
each per-service handler's **fixed-specifier** lazy import of `../config/container.js` inside its Lambda
entry section — a constant path resolved by the bundler, never a computed name, and the reason those modules
still cold-load without configuration (see §6). That is the point of the exercise: DI/1's
`getService("name")` and `HibachiService.onMissingMethod`'s prefix dispatch are replaced by declarations the
compiler checks.

---

## 3. Commands

Run every command from **this directory** (`slatwall-ts/`). All six are green, and each figure below is this
repository's current measured output rather than an expectation.

| Command                 | What it does                         | Current result                                   |
| ----------------------- | ------------------------------------ | ------------------------------------------------ |
| `npm ci`                | installs from the committed lockfile | 398 packages, 0 vulnerabilities, 0 `EBADENGINE`  |
| `npm run typecheck`     | `tsc --noEmit`, full strict mode     | **0 errors**                                     |
| `npm run lint`          | `eslint .`                           | **0 problems**                                   |
| `npm run format:check`  | `prettier --check .`                 | all files conform                                |
| `npm test`              | `jest --ci`                          | **36 suites, 2171 tests, 0 failures**            |
| `npm run test:coverage` | `jest --ci --coverage`               | same suites; 83.15 % statements, 74.2 % branches |
| `npm run build`         | bundles and packages (see §4)        | 6 CommonJS artifacts, exit 0                     |

`npm ci` is deliberate rather than `npm install`: the lockfile is committed so resolution is reproducible,
and `ci` is the command that honours it exactly.

`npm run typecheck` must pass **before** a build is trusted: esbuild strips types without checking them, so
the bundle must never be the thing that hides a type error. Nothing in the compiler, lint, format or test
configuration is relaxed to obtain those results — `tsconfig.json` keeps `strict`,
`exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`; `ts-jest` runs the same `tsconfig.json` with no
`diagnostics: false`.

Two notes that save a wasted debugging session:

- **`ts-node` is a required dependency, not an optional convenience.** `jest.config.ts` is authored in
  TypeScript, so Jest cannot read its own configuration without it (see §9).
- **`npx eslint .` must be run from this directory.** Every glob in `eslint.config.mjs` is subtree-relative
  with no `../` segment, so the reference-only CFML tree is never linted.

Neither the build nor the test suite needs a database, a credential or an environment variable of any kind.
The suite constructs its subjects directly against test doubles rather than booting an application, which is
the largest structural difference from the legacy MXUnit suite (AAP §0.4.3.6).

---

## 4. Build output

Infrastructure as code is out of scope for this exercise, so the deployability bar is a successful build and
package step producing Lambda-compatible artifacts — not a deployed endpoint. `npm run build` runs
`node build/esbuild.mjs`, whose emitted invocation is exactly

```
esbuild --bundle --platform=node --target=node20 --format=cjs --external:mysql2
```

and which writes **one CommonJS artifact per declared Lambda entry point**:

```
dist/handlers/router.js              the aggregate surface — all 34 addresses
dist/handlers/productHandler.js      the 18 product addresses
dist/handlers/skuHandler.js          the 9 SKU addresses
dist/handlers/brandHandler.js        the 3 brand addresses
dist/handlers/optionHandler.js       the 3 option addresses
dist/handlers/googleFeedHandler.js   the single feed address
build-meta/sourcemaps/handlers/*.map the six source maps
```

Properties worth knowing, each verified rather than assumed:

- **Every artifact exports an invocable `handler`.** `router.js` is the natural single-function deployment;
  each per-service artifact serves only its own addresses and answers `404` for any other, so a deployment
  may instead give each surface its own function. Nothing else in `dist/` — no chunk, no map, no build
  report.
- **The six entry points are a frozen literal list**, not a directory scan. A declared entry that is missing
  fails the build with a non-zero exit naming the path, and a non-test module appearing in
  `src/handlers/` that is neither a declared entry nor the acknowledged `httpResponse.ts` helper fails it
  too — so the artifact set cannot drift in either direction without a reviewer seeing it.
- **A failed build leaves nothing behind.** The step removes exactly its own previous outputs before it
  asserts or emits anything, so a red build can never leave a green build's artifacts in the packaging
  directory. It is an enumerated removal derived from the entry list — never a recursive delete.
- **Source maps are emitted beside `dist/`, not into it** (`build-meta/`, git-ignored), so the packaged tree
  carries only what the runtime loads. `sourcemap: 'external'` writes no `sourceMappingURL` comment, so
  relocating a map leaves no dangling reference.
- **`mysql2` is the only external**, appearing as `require("mysql2/promise")`; the driver is installed
  alongside the artifact rather than inlined into it. No `node_modules` code is inlined, and the AWS SDK is
  absent from the dependency graph entirely because the runtime already provides it (AAP §0.5.2.1);
  `@types/aws-lambda` is a development-only type dependency that is erased at compile time.
- **Consecutive builds are byte-identical**, and the build reads no environment variable, opens no
  connection and needs no credential.
- **Size, stated plainly.** Each artifact is ≈1.6 MB and `dist/` totals ≈9.6 MB, because an artifact that
  can be deployed on its own must contain the graph it wires; a single function loads one artifact, not the
  directory. Code splitting is deliberately off — it could hoist or duplicate `src/config/database.ts`, and
  duplicating that module duplicates the connection pool (AAP §0.3.2). No size budget is asserted here or
  anywhere else in the subtree (IR-12).

"Deployable" is satisfied by this step: AAP §0.8.3.10 — _"'Deployable' is satisfied by a successful
build/package step producing Lambda-compatible artifacts — live deployment execution is not required for
this run."_ There is no infrastructure definition, no deployment automation and no CI pipeline in this
subtree, by instruction.

---

## 5. Invoking it

The service is **headless**: Lambda handlers returning data. There is no HTTP server in this subtree, no
user interface, and no `npm start`.

Routes are addressed by the legacy `slatAction` query-string key. `slatAction` is not FW/1's default
parameter name — FW/1 ships `'action'` (`org/Hibachi/FW1/framework.cfc:L1778`) and Slatwall overrides it at
`config/configFramework.cfm:L2` — and the one catalog-adjacent address attested anywhere in the legacy tree
keeps its exact spelling, subsystem colon and all:

```
?slatAction=google:feed.product        integrationServices/google/views/main/default.cfm:L50
```

The four catalog surfaces had no legacy action of their own — their callers were the excluded `admin:` and
`public:` controllers — so their addresses reuse the same `section.item` vocabulary with the item being the
**exact preserved member name**: `product.saveProduct` is `ProductService.saveProduct`, which is what makes
the interface parity of AAP §0.4.2 readable straight off the route table. **34 addresses in total**: 15
declared `product.*` members plus 3 synthesized ones, 9 SKU, 3 brand, 3 option and the one legacy-attested
feed action. The table is a closed literal union, so a route that is not declared cannot be reached, and a
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

### 5.1 Response conventions

| Status | Meaning                                                                                  |
| ------ | ---------------------------------------------------------------------------------------- |
| 200    | Success. Entities are **projected**, never serialised whole                              |
| 400    | The **request** is at fault — nothing was addressed, or a body was absent or unparseable |
| 401    | No principal could be established — see §5.2                                             |
| 403    | A known principal is not permitted                                                       |
| 404    | An unknown `slatAction`, **or** a well-formed request whose addressed resource is absent |
| 500    | An unclassified service fault, with all detail withheld                                  |
| 501    | A declared boundary port or a permanently unusable member was reached                    |

A configuration failure is classified as a configuration failure rather than as a generic fault. Failure
bodies carry a single `message` and nothing else: no stack frame, file path, SQL statement, table name, error
class name, member name or configuration value reaches a client; the detail is **redirected** to a structured
server-side log line carrying a correlation ID, never discarded.

### 5.2 There is no authentication, and that is deliberate

Every catalog member is gated on a **fail-closed** principal: `src/handlers/router.ts` supplies an
unauthenticated, deny-all resolver, so there is no account and every entity authorisation answers no. Nothing
parses a header, decodes a token, verifies a signature or consults a store — the legacy authentication
interfaces are excluded by AAP §0.2.2.3, the framework's authentication service is code this slice must never
carry forward (§0.8.3.2), and adding a gate the migration does not require is forbidden by §0.8.2
guideline 4. So a gated route answers `401` until a deployment supplies its own resolver from its own edge,
and the seam for doing so is already each handler factory's parameter.

The **feed is the one exception**, and it is a port of `integrationServices/google/controllers/feed.cfc:L54`,
which declared `this.publicMethods="product"` with both `anyAdminMethods` and `secureMethods` empty. It is
anonymous because the legacy's was — and therefore, with the default wiring, it is the only route that
reaches a service at all.

---

## 6. Environment

Every value arrives through the process environment. `src/config/env.ts` is the only file under `src/**`
permitted to touch `process.env`, values are validated eagerly when that module loads, and the result is
frozen. Configuration flows one way: `env.ts` → `database.ts` → `container.ts` → `src/handlers/**`.
`.env.example` is the authoritative list — it carries every variable name with **no value committed** and
documents each one. **Five variables are required; four are optional with the fallbacks below; the feed host
is required; three setting inputs are optional.**

_When_ that validation happens differs by artifact, deliberately, and it is worth knowing which one you
deployed. `router.js` reaches the composition root through a static import, so requiring it validates the
environment immediately and a misconfigured deployment fails at cold start — before any request is served.
Each per-service artifact reaches it through a lazy import instead, so it cold-loads with no environment at
all and validates on its first invocation, answering `500` with a configuration-specific body and a
`SERVICE_CONFIGURATION` classification rather than a generic fault. The lazy form is what lets the handler
modules be imported directly by their unit suites without a database; the eager form is what makes the
aggregate entry point fail fast. Both were verified by cold-loading every artifact.

| Variable                                   | Required?       | Notes                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DB_HOST`                                  | **yes**         | a bare host: a registered name or IPv4 literal per RFC 3986 §3.2.2, or an IPv6 address bracketed or bare. A scheme, a `user:password@` prefix, a `:port` suffix, a path, whitespace, a control character, a non-ASCII character and a filesystem socket path are each refused with a message saying why |
| `DB_PORT`                                  | **yes**         | a plain base-ten TCP port, 1–65535                                                                                                                                                                                                                                                                      |
| `DB_NAME`                                  | **yes**         | the schema holding the existing `Sw*` tables. This service reads and writes that schema and neither creates nor migrates it                                                                                                                                                                             |
| `DB_USER`, `DB_PASSWORD`                   | **yes**         | must be present; an empty string is permitted, reproducing the legacy framework defaults exactly. Nothing is committed anywhere                                                                                                                                                                         |
| `DB_TLS_MODE`                              | no → `verified` | `verified` requires TLS and verifies chain and identity. `disabled` is accepted **only** for a loopback host. Absence encrypts; cleartext must be asked for by name                                                                                                                                     |
| `DB_QUEUE_LIMIT`                           | no → `1`        | the one bound not delegated to the driver: it reads `0` as "no limit" **and** `0` is its default, so omitting the option would select an unbounded queue. The fallback is the floor the loader already enforces, not a capacity estimate                                                                |
| `DB_CONNECTION_LIMIT`                      | no → omitted    | absent means the option is left off and the driver's own bounded default applies, so this port states no figure — AAP §0.4.1.3: pool sizing "is not carried over"                                                                                                                                       |
| `DB_CONNECT_TIMEOUT_MS`                    | no → omitted    | as above. It bounds connection setup only — not a statement, request or invocation timeout, and not a latency target                                                                                                                                                                                    |
| `GOOGLE_FEED_HOST`                         | **yes**         | the authority every absolute URL in the feed is composed from, held to RFC 3986 §3.2.2 with §3.2.3's optional port. Its shape is checked; its **identity is not**, and that residual exposure stays documented rather than overclaimed                                                                  |
| `SETTING_APPLICATION_ROOT_MAPPING_PATH`    | no              | consumed by `StaticSettingResolver` through the container                                                                                                                                                                                                                                               |
| `SETTING_SKU_ELIGIBLE_CURRENCIES`          | no              | as above                                                                                                                                                                                                                                                                                                |
| `SETTING_SKU_ELIGIBLE_FULFILLMENT_METHODS` | no              | as above                                                                                                                                                                                                                                                                                                |

Thirteen names, read in exactly one file, documented in exactly one template, and the two lists agree in both
directions. A failure names the offending variable, carries it in `context`, and leaks **no supplied value**
into its message, context or stack. The five required variables have no default of any kind: a connection
target and an identity cannot be guessed.

A loopback development database, then, is reached with:

```sh
export DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=slatwall \
       DB_USER=slatwall DB_PASSWORD=… DB_TLS_MODE=disabled \
       GOOGLE_FEED_HOST=localhost:3000
```

`DB_TLS_MODE=disabled` is accepted **only** when `DB_HOST` is a loopback literal; any other host must use
`verified`. There is deliberately no third mode that keeps TLS while skipping verification, because an
unverified session is indistinguishable from an intercepted one.

**One consequence of the fail-safe default is worth stating, because it is easy to misread as a fault.**
Supplying only the five required variables and the feed host is enough for the service to load, and the three
resource bounds then fall back transparently — but `DB_TLS_MODE` falls back to `verified`, so the driver
demands TLS with a verifiable chain. Against a local database that serves no verifiable certificate, a route
that actually reaches the schema therefore fails, while routes that never reach it — a `404` for an unknown
address, a `401` for a gated member — answer identically either way. That is the default behaving as
designed, not a misconfiguration: cleartext has to be asked for by name, which is what the `disabled` line
above does.

The legacy pinned none of this. `config/configApplication.cfm:L2` names the `Slatwall` datasource and
delegates everything to the application server, and `config/configORM.cfm:L8-L14` probes the live database at
run time to choose a dialect. This port targets MySQL and documents that branch rather than reproducing the
probe.

---

## 7. Scope boundary

**In scope**, and the whole of it: the four Catalog services (`ProductService`, `SkuService`, `BrandService`,
`OptionService`) and their 28 public members, the six catalog entities (`Product`, `Sku`, `ProductType`,
`Brand`, `Option`, `OptionGroup`), the four catalog DAOs, the three catalog process objects, the seven
catalog validation documents, and the six-file Google feed adapter as a **stub** — 24 legacy source files,
4,102 lines. No live call to Google is made and no credential or endpoint is introduced.

**Out of scope**, and never modified or ported: `org/Hibachi/**` (the framework this slice retires — read for
contracts only, never carried forward, per AAP §0.8.3.2), `admin/**`, `frontend/**`, `public/**`, `tags/**`,
`templates/**`, `assets/**`, `custom/**`, every non-Google integration adapter, the excluded domain families
(`Account*`, `Order*`, `Vendor*`, `Subscription*`, `Stock*`, `Promotion*`, `Tax*`, `Inventory*`, `Currency*`,
`Physical*`, `Attribute*`, `Payment*`, `Content*`, `PriceGroup*`, `Shipping*`, `Location*`, `Setting*`,
`Fulfillment*`, `Category`), and schema migration — the `Sw*` tables are read and written as they are.

Where an in-scope member genuinely needs an excluded collaborator, a **typed port** is declared, the member
stays on the interface, and the gap is **flagged rather than filled** (AAP TR-5): `SettingResolverPort`,
`ImagePathPort`, `SubscriptionTermPort`, `AccessContentPort`, `PricingPort`, `AccountContextPort`,
`UniquePropertyPort` and `SmartListQueryPort`. Reaching an unwired one answers **501** rather than
fabricating a value — substituting a plausible answer for a flag that gates a delete is exactly the silent
divergence this design refuses.

`ImagePathPort` is the one a reader meets first, and it is worth following through because it explains the
feed's behaviour exactly. `model/entity/Image.cfc` is not an in-scope entity, so no image path can be read and
the port is wired to a not-implemented adapter. The legacy view emits `g:image_link` **unconditionally** for
every SKU (`integrationServices/google/views/feed/product.cfm:L23`), so the feed reaches that port as soon as
it has one SKU to render and answers `501` — verified against a schema holding a single product and SKU. A
product whose sale price must be consulted reaches `PricingPort` the same way. With no qualifying SKU the feed
never consults either port and renders an empty channel instead. Supply the two through
`createCatalogContainer({ imagePaths, pricing })` and the same request answers `200` with RSS. The ports are
declared and flagged rather than satisfied with an invented path or price, which is the behaviour AAP TR-5
asks for.

### 7.1 Legacy defects are carried, not repaired

AAP §0.6.7 registers 21 source-level defects and TODOs in the slice. Preserving them is a behaviour-parity
requirement (§0.8.2 guideline 4), so they are carried across as flagged `TODO(parity)` annotations naming
each defect and its legacy locator — an inverted cache guard, three misnamed option structs, a service member
delegating to a DAO member that exists nowhere, an unreachable private method — and `no-warning-comments` is
switched off permanently so a lint gate cannot make that requirement unbuildable. **One** declared exception:
the importer's 21 interpolated SQL statements are parameterized, which structurally eliminates an injection
surface fed directly from an uploaded file (AAP §0.6.7.7, defect D18). It is declared as deliberate hardening
precisely so a reviewer comparing generated SQL against legacy SQL knows the divergence is intended.

### 7.2 Execution-model mismatches are flagged, not silently resolved

Eight are recorded in AAP §0.6.6 and annotated where they land, with the two most consequential being: the
importer's request for a 3600-second budget (`model/service/ProductService.cfc:L66`), which is
**unrepresentable** against the platform's 15-minute function ceiling and is documented as needing an
out-of-band model rather than re-timed to fit; and the feed's 360-second render
(`integrationServices/google/views/feed/product.cfm:L9`), which fits the function ceiling but far exceeds a
synchronous proxy integration's budget. Both remain open decisions documented at their handlers, and neither
is worked around at the routing layer. Those two are the only timing **budgets** named anywhere in this
subtree, and each is source-declared with a locator; the only other time-valued constant is a `60` converting
minutes to hours when formatting a timezone offset, which is a unit conversion rather than a budget. **No
latency, throughput, availability, capacity or size target is invented** (IR-12).

### 7.3 Two further invariants a reader should know up front

- **Primary keys are 32-character UUID strings generated in application code** — no dashes, no
  auto-increment — reproducing `createSlatwallUUID()` (IR-6).
- **Memoisation is request-scoped, never module-scope**, apart from the connection pool and the service graph
  itself. `container.beginInvocation()` runs before every route, on every invocation, so a warm container
  cannot carry one request's state into the next.

---

## 8. Test provenance

Every suite labels its cases, because the honest ratio is itself a finding (AAP §0.6.5, §0.8.3.7). **Traceable
to legacy coverage:** `test/domain/Product.test.ts` and `test/domain/Brand.test.ts` (from the two MXUnit
entity tests), `test/regression/issues.test.ts` (five catalog issue regressions, retaining their issue
numbers), and the fixture contract in `test/fixtures/` (including the seeded merchandise product-type UUID
reused verbatim). **Everything else is NET-NEW**: no legacy `SkuTest`, `OptionTest`, `OptionGroupTest` or
`ProductTypeTest` exists; no service test of any kind exists, so all 28 public service members are net-new
coverage; no DAO test exists; and the one functional product test is an empty component with zero methods.

The legacy suite **cannot be executed here at all** — MXUnit and CFSelenium are not vendored and the CFML
runtime is not reproducible in this environment (the `meta/docker/slatwall-local-dev/` setup the prompt cites
does not exist in the repository). Traceability was therefore established by reading legacy test source, not
by re-running it, and this file says so rather than implying a comparison that never happened.

---

## 9. Dependency governance

Two deviations from the AAP's dependency inventory are recorded in `package.json` itself, each with its
reasoning and a removal trigger, so a reviewer auditing the manifest finds them there rather than having to
reconstruct them:

- **Eleven dev dependencies where the inventory lists ten.** The eleventh is `ts-node`, which `jest-config`
  dynamically imports to load a `.ts` configuration file and declares as an optional peer. AAP §0.4.1.2
  mandates `jest.config.ts`, and Node 20 cannot strip types on its own, so on this pinned runtime the
  mandated filename is unloadable without it. Renaming the config to `.js` would restore the count by
  violating two explicit AAP rows; keeping the filename and documenting the consequence is the lesser
  deviation. It is dev-only, reachable from no source file, and never bundled.
- **An `overrides` block** pinning `minimatch` and `test-exclude`, closing GHSA-mh99-v99m-4gvg /
  CVE-2026-14257 (unbounded brace expansion) in the Jest toolchain. The rejected alternatives, the
  verification evidence and the condition for removing it are all recorded beside the block.

---

## 10. Known limitations

Stated here rather than discovered later.

- **The repository ships no `Sw*` DDL**, so this subtree cannot create the schema it reads. Running the
  service requires a database that already holds those tables; the build and the test suite require no
  database at all.
- **The CFML runtime is not reproducible from this repository.** The `meta/docker/slatwall-local-dev/` setup
  referenced in project documentation does not exist — `meta/` contains only `tests/` and `eclipse/` — so no
  behavioural comparison was run against a live legacy application. Every behavioural claim in this port
  traces to legacy source with a file-and-line locator.
- **The legacy MXUnit suite cannot be executed here** either: MXUnit and CFSelenium are not vendored. Test
  traceability is therefore established by reading legacy test source, and each suite in `test/` is labelled
  **TRACEABLE** or **NET-NEW** individually. The honest summary is that the extendable legacy signal for this
  slice amounts to two entity test files, five issue regressions and one fixture helper — everything else is
  net-new, and it is labelled as such rather than implying a parity that does not exist.

---

## 11. Licence

GPL-3.0-or-later, matching the Slatwall application this slice is extracted from.
