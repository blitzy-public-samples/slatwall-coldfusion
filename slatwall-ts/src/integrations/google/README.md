# Google product feed integration

`slatwall-ts/src/integrations/google/` — the extracted Google merchant product feed.

This folder is the TypeScript port of the Google integration that lives in the legacy CFML tree at
`integrationServices/google/`. It exists as documentation as well as code because three things about
this slice cannot be reconstructed from the code alone: **where the feed logic actually lives**, **why
one of the files is nearly empty**, and **why a data-access component that exists in the legacy tree
has no counterpart here**. AAP §0.4.1.10 plans this README precisely so those findings are written
down instead of rediscovered.

Every statement below that describes the legacy system carries an inline `path:locator` citation. That
is the artifact-trail requirement of AAP §0.8.5, whose stated purpose is that "a skeptical technical
reviewer can follow end-to-end": a claim without a locator is a claim a reviewer cannot verify.

---

## 1. Orientation — the feed logic is not where you will look for it

AAP §0.6.4 examined four candidate homes for the Google feed's behaviour and found it in **neither of
the two files a reader would guess**:

- The interface implementation, `integrationServices/google/Integration.cfc` (79 lines),
  contains **no feed logic whatsoever**.
- The data-access component, `integrationServices/google/model/dao/FeedDAO.cfc` (76 lines), is
  **unreachable, syntactically broken code with zero callers** and is deliberately not ported
  (§9 below).

The behaviour is in the other two: a **controller** selects the records and a **view template** shapes
them. That is why this folder's shape looks lopsided at first glance — one small stub class beside one
large serializer — and why reading `GoogleIntegration.ts` first leaves the impression of an
incomplete port. It is not incomplete. §6 sets out the split.

---

## 2. Folder inventory — six files, and where each came from

The folder is flat. There is no barrel file, no registry, no discovery module and no subfolder,
because the mechanism such a file would have served — the runtime component discovery of the retired
framework — was retired rather than translated (AAP §0.8.3.2).

| File                     | What it owns                                               | Legacy origin                                               |
| ------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------- |
| `IntegrationContract.ts` | The five-member adapter contract, and nothing else         | `integrationServices/IntegrationInterface.cfc:L50-L89`      |
| `BaseIntegration.ts`     | The default member implementations every adapter inherits  | `integrationServices/BaseIntegration.cfc:L49-L73`           |
| `GoogleIntegration.ts`   | The interface-conformant **stub only** — no feed logic     | `integrationServices/google/Integration.cfc:L49-L79`        |
| `ProductFeedQuery.ts`    | **Record selection** — which SKUs the feed contains        | `integrationServices/google/controllers/feed.cfc:L49-L74`   |
| `ProductFeedBuilder.ts`  | **All RSS field shaping** — where the real work lands      | `integrationServices/google/views/feed/product.cfm:L1-L65`  |
| `README.md`              | This document — orientation, plus the two register entries | `integrationServices/google/views/main/default.cfm:L49-L51` |

Two legacy files in `integrationServices/google/` deliberately have **no** counterpart in this folder:

- `integrationServices/google/controllers/main.cfc:L49-L52` is an **empty inherited controller** — it
  declares `component extends="Slatwall.org.Hibachi.HibachiController"` and its body is empty. There
  is no behaviour to port, so no TypeScript file is created for it.
- `integrationServices/google/model/dao/FeedDAO.cfc` is dead code. See §9.

A third, `integrationServices/google/views/main/default.cfm`, is 51 lines of which L1-L48 are the
license header; its only content is the route at L49-L51. That is why AAP §0.3.1 maps it to this
README rather than to a TypeScript file — there is no behaviour in it either.

### 2.1 Why the contract and base class are colocated here

In the legacy tree, `IntegrationInterface.cfc` and `BaseIntegration.cfc` sit in the **parent**
`integrationServices/` directory because they are shared by all **seventeen** adapters found there.
This port deliberately **colocates** them inside `google/` instead: the sixteen sibling adapters and
the six sibling contract and base files are explicitly out of scope (AAP §0.2.2.3), so there is
nothing left for a shared location to serve. Hoisting them to a shared directory would advertise a
reuse that does not exist in this deliverable.

---

## 3. Governing rules: none were provided, and the bar is not lowered

**No user-specified rules were provided for this project**, so the **nine enterprise standards of AAP
§0.7.3** govern instead, and the bar is not lowered. `review_rules` returns exactly one line, read to
the end, and a filesystem sweep corroborates it from the other direction: no `.blitzyignore`,
`.cursorrules`, `AGENTS.md` or `CLAUDE.md` exists anywhere in the repository, and the legacy tree
carries no lint, format or style configuration that could serve as an implicit rule source — the ones
under `slatwall-ts/` are this port's own, created by this plan rather than inherited from it.

Three of those nine standards do the most work in this folder, and each is visible in what follows:

- **Preserve and annotate, do not repair.** The two legacy defects this folder owns are recorded with
  their evidence and carried unchanged (§9, §10).
- **Flag mismatches instead of assuming them away.** The one execution-model mismatch this folder
  touches is recorded as an open decision rather than quietly resolved (§11).
- **Invent nothing.** No service-level commitment, no capacity figure and no delivery guarantee
  appears anywhere in this document. Where a number is stated it is either a source-declared value
  with a locator or a published platform limit, and it is labelled as such.

Consequently **zero files enter this folder by rule**, no rule conflict exists to resolve, and no rule
is invented or cited anywhere below.

---

## 4. The legacy route

The legacy feed is reached through the framework's action parameter. The route is documented in the
legacy tree at `integrationServices/google/views/main/default.cfm:L49-L51`, in full form:

```text
http://<host>/plugins/Slatwall/?slatAction=google:feed.product
```

and in the short form that names the action alone:

```text
?slatAction=google:feed.product
```

In the source the host portion is interpolated from the request rather than written literally —
`default.cfm:L50` emits `#cgi.HTTP_HOST#` where the form above writes `<host>`.

**How the convention resolves.** The `slatAction` parameter is read by the FW/1 front controller and
split on the colon: `google` selects the integration, `feed` selects the controller within it, and
`product` selects the method on that controller. It therefore resolves to the `product` method of
`integrationServices/google/controllers/feed.cfc:L58`, which the same component makes reachable by
declaring `this.publicMethods="product"` at `feed.cfc:L54`.

**Who owns routing in the port.** That responsibility moves out of this folder entirely, to
`slatwall-ts/src/handlers/googleFeedHandler.ts` behind `slatwall-ts/src/handlers/router.ts`. Nothing in
`integrations/google/**` names a URL path, a query parameter, an HTTP method, a status code or a
content type, and **this document deliberately does not define a new route shape** — the legacy route
above is recorded as history, not restated as a target. Route decisions belong to the handler layer,
which is also the only layer permitted to name serverless or gateway types at all (AAP §0.7.3).

---

## 5. The Google Merchant specification this feed was built against

The legacy view template records the specification it was written from at
`integrationServices/google/views/feed/product.cfm:L4-L5`:

```text
http://support.google.com/merchants/bin/answer.py?hl=en&answer=188494&topic=2473824&ctx=topic#US
```

That URL sits inside a **CFML server-side comment** — the `<!--- --->` block spanning
`product.cfm:L2-L7` — which is why it is **never emitted** into the feed output. It is preserved in
this document and in a `ProductFeedBuilder.ts` source comment, and deliberately **not** re-emitted as
an XML comment in the generated feed: doing so would add bytes to the output that the legacy feed does
not contain.

**What the feed emits.** RSS 2.0 with the Google namespace, and a fixed channel title —
`product.cfm:L11-L13` opens `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">`, then
`<channel>`, then `<title>Slatwall Product Feed</title>`. The namespace prefix `g:` on the
product-specific elements comes from that declaration.

---

## 6. Where the feed logic actually lives — the three-way split

### 6.1 `GoogleIntegration.ts` — the stub, and it is nearly empty by faithfulness

`GoogleIntegration.ts` is the interface-conformant adapter and **nothing more**.
It is **nearly empty by faithfulness, not by neglect** (AAP §0.6.4.3), because the component it is
ported from carries **no feed logic whatsoever** to port. `integrationServices/google/Integration.cfc`
is 79 lines, and its entire behavioural content is:

- `getIntegrationTypes()` returns `fw1` — `Integration.cfc:L55-L57`
- `getDisplayName()` returns `Google` — `Integration.cfc:L59-L61`
- `getSettings()` returns an empty structure — `Integration.cfc:L63-L65`
- `getIntegratedSettings()`, which is **not** part of the adapter contract, returns one settings field
  — `Integration.cfc:L67-L71`
- `getSettingOptions()`, whose body is **empty**: the method opens a conditional on the setting name
  and does nothing inside it — `Integration.cfc:L73-L77`

Adding feed generation, a merchant client, an outbound call or a product-category lookup to this file
would be behaviour the legacy system does not have, which the invent-nothing standard forbids
outright.

### 6.2 `ProductFeedQuery.ts` — record selection

Selection is ported from `integrationServices/google/controllers/feed.cfc:L49-L74`, which builds the
record set before the view is rendered. It starts from the SKU service's smart list at `feed.cfc:L63`
and then applies, in order:

- **Three related-property joins** at `feed.cfc:L64-L66` — SKU to product, product to default SKU,
  and product to brand. The third is a **left** join, which is what allows a product with no brand to
  remain in the feed at all — and is therefore why the brand element described in §6.3 has to be
  conditional rather than always present.
- **Three activity and publication filters** at `feed.cfc:L68-L70` — the SKU's active flag, the
  product's active flag, and the product's published flag.
- **One availability range** at `feed.cfc:L72`, on `product.calculatedQATS`.

The controller also hides the page layout at `feed.cfc:L60`, which is a display concern of the retired
framework and has no counterpart here.

### 6.3 `ProductFeedBuilder.ts` — all RSS field shaping

Shaping is ported from `integrationServices/google/views/feed/product.cfm:L1-L65`, and **this is where
the real work of the feed lands** (AAP §0.4.1.10). Every field mapping in that template is carried
across, including the ones a summary would smooth over: the description's fallback from the product's
own description to the product type's, the conditional sale-price pair, the conditional brand element,
the repeated additional-image elements, and the shipping-weight element assembled from two settings at
`product.cfm:L58`. The field groups that are commented out in the template — at `product.cfm:L33-L38`,
`L40-L57` and `L59-L61` — remain commented in the port with their element names intact, because
deleting them would lose the record of an intended surface.

### 6.4 Why two files rather than one

The legacy holds the two halves in different **kinds** of artifact — selection in a controller,
shaping in a view template — and they have different collaborators. Selection needs the SKU service
and the smart-list abstraction; shaping needs the entity graph and an escaping strategy. Merging them
would produce a single class with two unrelated reasons to change.

---

## 7. There is no live call to Google anywhere in this folder

This is worth stating plainly, because a reader may reasonably wonder where the Merchant Center upload
is: **there isn't one, and there never was.** `GoogleIntegration.ts` is a stub satisfying the same
contract as its legacy counterpart, and per AAP §0.8.3.3 **no live call to Google's real API is made
anywhere in this folder** — there is no HTTP client, no vendor SDK, no outbound destination, no
credential of any kind and no authorization flow.

That is faithful rather than reductive. The legacy integration does not upload anything either: it
**publishes a URL** and lets the merchant system fetch it. `integrationServices/google/views/main/default.cfm:L50`
literally instructs the operator to point their Google feed at the route in §4. Delivery was always a
pull, so there is no push to port.

---

## 8. Drift trap — `productGoogleProductType` does not populate the product category

This is the folder's most tempting "obvious improvement", and acting on it would change the emitted
feed.

`integrationServices/google/Integration.cfc:L67-L71` declares a `productGoogleProductType` setting
field — the identifier itself sits on `Integration.cfc:L69`, inside the structure returned at L68, and
is named once more in the empty-bodied member at `Integration.cfc:L74`.
The feed **never reads it**: `integrationServices/google/views/feed/product.cfm:L20` emits
`<g:google_product_category></g:google_product_category>` — an intentionally **empty** element —
regardless of that setting. The two are **not connected** in the legacy system, so wiring them
together would invent behaviour, and it is not done. The stub deliberately holds no reference to the
feed builder through which it could be done.

---

## 9. `TODO(parity) D12` — the orphaned `FeedDAO`

```text
TODO(parity) D12 — integrationServices/google/model/dao/FeedDAO.cfc:L52-L74
```

`FeedDAO.cfc` is the file a reader would expect to hold the feed's data access. It holds a single
method, `getProductFeedQuery`, and that method **could never have executed successfully**. Six
independent pieces of evidence, each verified directly against the source:

1. **Zero callers, repository-wide.** A search across the whole repository for `FeedDAO` and for
   `getProductFeedQuery` finds **no call site anywhere** — `getProductFeedQuery` appears only at its
   own declaration, `FeedDAO.cfc:L52`. The component is orphaned: nothing constructs it, nothing
   injects it, nothing invokes it.
2. **The query assigns an unscoped `rs` variable.** `FeedDAO.cfc:L53` is `<cfset rs = "" />` — no local
   declaration, so the name leaks into the component's shared variables scope.
3. **The `SELECT` list ends in a trailing comma.** `FeedDAO.cfc:L58` is `SwProduct.calculatedTitle,`
   and the next non-blank line, `FeedDAO.cfc:L60`, is `FROM`. The comma sits immediately before the
   `FROM` keyword.
4. **It contains an `INNER JOIN SwProduct` with no `ON` clause.** `FeedDAO.cfc:L62-L63` opens the join
   and `FeedDAO.cfc:L64` goes straight to `WHERE`; no join predicate is ever supplied.
5. **The `<cfquery>` declares no datasource.** `FeedDAO.cfc:L55` is `<cfquery name="rs">` — a result
   name and nothing else, so the statement has no connection to run against.
6. **The component extends nothing.** `FeedDAO.cfc:L49` is `<cfcomponent accessors="true" output="false">`,
   so it inherits no base that could have supplied the missing datasource or any other default.

The two structural faults are visible together. Quoted **as evidence only** — this statement is not
ported, and no corrected form of it exists anywhere in this subtree:

```text
        SELECT
            SwSku.skuCode,
            SwProduct.calculatedTitle,

        FROM
            SwSku
          INNER JOIN
            SwProduct
        WHERE
```

**The decision.** It is **deliberately not ported**, **deliberately not repaired**, and the legacy file
is **not deleted**.

- Not ported and not repaired, because repairing unreachable code would add behaviour the legacy
  system does not have (AAP §0.6.4.3). A working version of this query would be a feature of the port
  and of nothing else, and it would be impossible to compare against the original.
- Not deleted, because the Minimal Change Clause (AAP §0.8.1) and Refactor Discipline Guideline 1
  (AAP §0.8.2) hold the CFML tree byte-for-byte unchanged. Every legacy file in this plan is
  REFERENCE; there are zero UPDATE rows and zero deletions.

None of the six faults is given an identifier of its own — they are all evidence for the one register
entry, D12. This document introduces no new defect or mismatch identifier of any kind.

**Where the entry lives.** This section is the authoritative home for D12 — the home AAP §0.4.1.10
assigns it — and `ProductFeedQuery.ts` carries a single one-line pointer to it rather than evidence of
its own. One sibling, `IntegrationContract.ts`, restates part of the evidence in a header note written
while this file was still undelivered; that note is left byte-for-byte untouched, because it is
checkpoint-scoped and belongs to a file this one does not own. The record above is the one to read.

**Nothing was lost by declining to port it**, incidentally, and that is worth knowing before anyone
mourns the omission. The predicates the broken statement gestures at — the SKU's active flag, the
product's active flag, the product's published flag and an availability condition, at
`FeedDAO.cfc:L65-L71` — are the same three flags and the same availability concept the live controller
applies at `integrationServices/google/controllers/feed.cfc:L68-L72`, and those **are** ported, into
`ProductFeedQuery.ts`. The two express availability differently: the dead statement writes a strict
comparison against zero at `FeedDAO.cfc:L71`, the controller an open-ended range from one at
`feed.cfc:L72`. So the dead file duplicated, imperfectly, a filter set that already had a working home.

---

## 10. `TODO(parity) D11` — the display-name copy-paste artifact

The folder's other carried defect is annotated in `GoogleIntegration.ts`, which owns it; it is
cross-referenced here so the folder's register is legible from one page.

`integrationServices/google/Integration.cfc:L49` declares component metadata `displayname="USA epay"`,
while `getDisplayName()` at `integrationServices/google/Integration.cfc:L59-L61` returns `Google`. The
two disagree, and the method is the one that takes effect, so the effective display name is correct
and the metadata is simply stale. It is **recorded, not corrected**.

The artifact is genuinely informative rather than noise. It is evidence that this component was cloned
from the USAePay payment adapter — `integrationServices/usaepay/` is a sibling in the same directory —
which is exactly why an interface-conformant shell exists here with no feed implementation behind it.
The shape of §6.1 has a cause, and this is it.

---

## 11. `M2` — the render-budget mismatch is unresolved at the delivery boundary

`integrationServices/google/views/feed/product.cfm:L9` asks the CFML engine for a render budget:

```text
<cfsetting requesttimeout="360" />
```

360 seconds, behind a route served synchronously. This is mismatch **M2** of AAP §0.6.6, and it does
not map cleanly onto one invocation of the target execution model: 360 seconds sits **inside** AWS
Lambda's 15-minute maximum function duration, so the work itself is expressible as a single
invocation, but it **far exceeds** the roughly 29-second synchronous API Gateway integration budget in
front of it. The legacy model — hold an HTTP connection open for as long as the render takes — has no
equivalent on the synchronous path.

**The mismatch is flagged, not resolved.** The choice between an **asynchronous** and a **streamed**
delivery model is an explicit, open decision, and it belongs to
`slatwall-ts/src/handlers/googleFeedHandler.ts`, which owns M2 — **not** to this folder.
`ProductFeedBuilder.ts` and `ProductFeedQuery.ts` therefore set no budget, no record bound, no
batching policy, no streaming policy and no cache lifetime of any kind. The 360 is not silently
re-timed to fit, and it is not capped at 29.

⚠️ **Both numbers above are facts, not targets.** The 360 is a source-declared value with a locator;
the other two are published platform limits. Neither is a service-level commitment, and no
performance characteristic of any kind is promised, derived or implied here — AAP §0.6.6 and IR-12
state only what the source declares. This document cites **M2** and mints no other mismatch
identifier.

One further execution-model constraint is **obeyed rather than cited**: nothing in this folder carries
state between invocations. The adapter constructs its return values per call and the serializer holds
no accumulated result, so there is no cross-invocation cache to bleed between callers on a reused
container.

---

## 12. Why this lives in `slatwall-ts/` and not under `integrationServices/`

`readme.md:L63-L65` instructs that custom code "must not alter or create any files inside Slatwall,
except in the following directories: `/integrationServices/`". A reader following that instruction
would expect this port to live under `integrationServices/` and would read its absence there as a
mistake, so the clarification belongs here.

That instruction is part of the license exception governing the **retired plugin model** — the model
in which a Slatwall integration was a component discovered at runtime on the framework's component
path. It constrains where a _plugin_ may be placed inside the legacy application. It does **not**
relocate this extraction, because this extraction is not a plugin: it is a standalone service that the
legacy application does not load, discover or depend on.

**The authoritative target is the new root sibling `slatwall-ts/`**, alongside `model/`, `org/` and
`integrationServices/`. This folder is `slatwall-ts/src/integrations/google/`.

**The invariant that makes it safe.** The CFML tree remains **byte-for-byte untouched**. Per
AAP §0.4.1.1 every target file is CREATE and every legacy file is REFERENCE, and there are **zero
UPDATE rows in the entire plan**. Specifically not modified:

- the repository-root `readme.md` — the extracted service is documented in its own files, of which
  this is one, rather than by editing legacy documentation;
- the repository-root `.gitignore` — its fifteen entries are left exactly as they are; the plan
  instead creates a `slatwall-ts/.gitignore` scoped to the new subtree;
- every `.cfc` and `.cfm` file in the repository, including `integrationServices/google/model/dao/FeedDAO.cfc`
  and `integrationServices/google/Integration.cfc`.

The practical consequence is that the legacy application builds and runs exactly as it did before,
whether this subtree is present or not, and the whole deliverable reads as a single additive diff.

---

## 13. Layer position, and the layers this folder does not reach

An integration sits above `services`, `ports` and `domain`, and below `handlers`. It may reach
**downward** only (AAP §0.7.3):

- **Permitted:** `domain/`, `ports/`, `services/`, `util/`, `errors/`, and siblings within this folder.
  What is imported today is a strict subset of that — `domain/product/Product`,
  `domain/product/ProductType`, `domain/sku/Sku`, `errors/DomainError`, `ports/ImagePathPort`,
  `ports/PricingPort`, `ports/SettingResolverPort`, `ports/SmartListQueryPort` and
  `services/SkuService`. `util/` is permitted but is not reached from this folder at all, which is
  recorded as a fact rather than dressed up as a dependency.
- **Not imported at all:** `adapters/**`, `config/**`, `handlers/**`. There is no data access of any
  kind here — no statement text, no driver, no connection, no placeholder array — because selection is
  composed as a typed port call and never as a query.
- **No environment reads.** No file in this folder reads the process environment; configuration
  reaches the service through the config layer only.
- **No serverless or gateway coupling.** Event shapes, result shapes, status codes, headers and
  content types are named exclusively in `src/handlers/**`, the one layer permitted to name them.
- **Nothing imports upward into this folder.** In particular `services/**` does not import from
  `integrations/**`; the dependency runs the other way, and only that way.

### 13.1 The boundary ports this folder depends on

The feed needs values that live behind explicitly out-of-scope collaborators, and it reaches every one
of them through a declared port rather than by widening its own scope (AAP §0.2.2.7):

| Port                  | Used by                 | What it supplies                                                        |
| --------------------- | ----------------------- | ----------------------------------------------------------------------- |
| `PricingPort`         | `ProductFeedBuilder.ts` | The sale price, its expiration, and the product price                   |
| `ImagePathPort`       | `ProductFeedBuilder.ts` | The primary and additional resized image paths                          |
| `SettingResolverPort` | `ProductFeedBuilder.ts` | `skuShippingWeight` and `skuShippingWeightUnitCode` (`product.cfm:L58`) |
| `SmartListQueryPort`  | `ProductFeedQuery.ts`   | The dynamic filter, join and range composition the smart list provided  |

`SmartListQueryPort` exists as a boundary port for a specific reason worth recording: the availability
filter at `integrationServices/google/controllers/feed.cfc:L72` reads `product.calculatedQATS`, which
is a **calculated inventory property**, and inventory is explicitly out of scope (AAP §0.6.4.1,
§0.2.2.7). The feed cannot resolve that value itself, and it does not try.

The ports inventory is **closed at thirteen files**, and **this folder creates no new port**. If a
future change to the feed appears to need one, that is a scope decision to be taken deliberately, not
a file to add here.

---

## 14. Test provenance — net-new, and stated as such

The legacy repository contains **no test for the feed at all**, and **no mocking library anywhere**.
MXUnit and CFSelenium are **not vendored** in the repository, so the legacy suite cannot be executed in
this environment even in principle (AAP §0.5.4, §0.6.5.3).

`slatwall-ts/test/integrations/ProductFeedBuilder.test.ts` is therefore **NET-NEW coverage**. It is not
parity coverage, it does not extend an existing test, and nothing in this port should be read as
implying that it does. AAP §0.8.3.7 makes stating this an explicit requirement, because the question
it answers — whether existing tests were replicated or new ones silently generated — is exactly the
question a skeptical reviewer asks first. For this folder the honest answer is: **new ones, because
none existed.**

---

## 15. How these findings were verified, and this folder has no user interface

**Verification method.** Every behavioural claim in this document is grounded in **reading legacy
source**, not in observing legacy execution. The CFML runtime is not reproducible in this environment:
there is no CFML engine available, the repository contains no container or build definition for one,
and the `meta/docker/slatwall-local-dev/` path cited in the original brief **does not exist** — `meta/`
contains only `meta/tests/` and `meta/eclipse/` (AAP §0.8.4.1). Consequently **no runtime behavioural
comparison against the original was performed**, and traceability throughout this port is
**documentary**. That is stated plainly rather than implied away, and it is why every claim above
carries a locator a reviewer can open.

For the same reason, where the legacy documentation is silent this document records the silence rather
than filling it. The root `readme.md` does pin three platform floors — Mura at `readme.md:L4`,
ColdFusion at `readme.md:L6` and Railo at `readme.md:L8`, each written as a version "or Newer" — but
the Lucee version, the MySQL version and any container-based development workflow are **not
documented** anywhere in the repository, and no plausible value is supplied for them here.

**No user interface, and no design system.** This folder is headless: there is no component, no
component library, no design token and no design asset, and none applies. The single legacy file with
a view extension, `integrationServices/google/views/feed/product.cfm`, emits **RSS 2.0 XML for machine
consumption** rather than rendering anything for a person — so its port, `ProductFeedBuilder.ts`, is a
**serializer, not a component** (AAP §0.3.4). The view extension invites the opposite assumption,
which is why it is said here explicitly.
