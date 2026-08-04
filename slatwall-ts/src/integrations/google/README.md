# Google product feed integration

`slatwall-ts/src/integrations/google/` — the extracted Google merchant product feed.

This folder is the TypeScript port of the Google integration that lives in the legacy CFML tree at
`integrationServices/google/`. It exists as documentation as well as code because three things about
this slice cannot be reconstructed from the code alone: **where the feed logic actually lives**, **why
one of the files is nearly empty**, and **why a data-access component that exists in the legacy tree
has no counterpart here**. AAP §0.4.1.10 plans this README precisely so those findings are written
down instead of rediscovered.

Every source-level behavioural claim below carries an inline `path:locator` citation, per AAP §0.8.5.
Two kinds of statement deliberately carry none, because a line number would be the wrong evidence:
inventory counts, which are measurements over a named directory and are re-derivable by listing it; and
absence claims, which name what was searched rather than a line. §15 states the verification method and
its limits.

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
| `ProductFeedBuilder.ts`  | **All RSS field shaping** — where the real work lands      | `integrationServices/google/views/feed/product.cfm:L1-L66`  |
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

## 3. Governing standards

AAP §0.7.3 governs this folder; `slatwall-ts/README.md` carries the statement of it and is not repeated
here. Three of its standards do most of the work below: defects are preserved and annotated rather than
repaired (§9, §10), the one execution-model mismatch this folder touches is flagged as an open decision
rather than resolved (§11), and nothing is invented — every runtime figure stated here is either a
source-declared value with a locator or a published platform limit, and is labelled as such (AAP IR-12).

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
`slatwall-ts/src/handlers/`. The entry point exists: `slatwall-ts/src/handlers/googleFeedHandler.ts` is
delivered and owns the feed operation, the M2 mismatch of §11, and every request-shaped concern the feed
has.

**The target route is delivered, and it keeps the legacy address verbatim.** The front controller AAP
§0.4.1.9 plans as `slatwall-ts/src/handlers/router.ts` exists: it builds the feed handler through
`createGoogleFeedHandlerFromContainer` and mounts `createGoogleFeedRoutes` into its frozen route table,
so `?slatAction=google:feed.product` — colon, subsystem and all — resolves to
`googleFeedHandler.product()` the way the `slatAction` convention above resolved it to `feed.cfc:L58`.
The route table is a closed literal union of 34 addresses, of which this is the one attested anywhere in
the legacy tree; a route that is not declared cannot be reached, and a declared route that mounts
nothing fails to compile.

Nothing follows from that for this folder, which is why the delivery changed nothing here: nothing in
`integrations/google/**` names a URL path, a query parameter, an HTTP method, a status code or a content
type, and **this document still defines no route shape of its own** — the legacy route above is recorded
as history, and the target address is recorded as the handler layer's decision rather than restated as
this folder's. Route decisions belong to the handler layer, which is also the only layer permitted to
name serverless or gateway types at all (AAP §0.7.3). What remains genuinely open is narrower than the
route: the **gateway type** in front of the function, and with it M2's asynchronous-or-streamed delivery
model, which §11 leaves to that layer rather than settling here.

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

**What the port does with those seven lines.** All three parts above are wired, and they travel together
through one composed description rather than one call plus seven mutations. `ProductFeedQuery.ts` composes
the SKU selection with `composeSkuSmartListQuery` from `src/ports/SmartListQueryPort.ts` — the same
module `SkuService.getSkuSmartList` composes through, so the base entity name, the base joins and the five
keyword properties come from one place and cannot drift — handing it one frozen input in which the feed's
three joins travel under `additionalJoins`, the only join channel the input translator reads. The composer
appends those three after the service's own, in the legacy's registration order, and the three filters and
the availability range travel in the same description. Nothing in this folder emits SQL, names a table or
assembles an identifier: the property each filter names is resolved against the entity schema by the port's
translator, and every value binds.

**One statement per request, and that is parity rather than optimisation.** The feed executes the
description through `SmartListQueryPort.executeRecords` — the unpaged records alone, which is the one view
`product.cfm:L16` loops. The legacy framework materialises a view only on first read of it
(`org/Hibachi/HibachiSmartList.cfc:L751-L755`, `:L771`), so the legacy feed issues exactly one statement;
reading all three views here would add a `COUNT(*)` and a paged statement nothing consumes. Sharing the
composition rather than adding a records-only service member also keeps `SkuService` at the nine declared
members AAP §0.4.2.2 fixes, which §0.8.3.1 makes the artefact checked method by method.

**Declaring the joins is only half of what the legacy does, and the other half is easy to miss.** In
the legacy the joins exist so that Hibernate _can_ reach the associated rows; the reaching happens later
and implicitly, when the view dereferences `sku.getProduct()` at `product.cfm:L18` and walks onward to
the product's type, its brand and its default SKU. The record projection itself never selects any of
that — `org/Hibachi/HibachiSmartList.cfc:L521` selects the base entity alone — because a live ORM session
can lazily fetch whatever the template touches. **A stateless port has no session and therefore no lazy
fetch.** Joins alone would return SKUs whose product graph was empty, and the serializer would then be
shaping absent data.

So each association the serializer actually dereferences is **declared and materialised explicitly**.
`ProductFeedQuery.ts` names four, each with the template line that forces it — SKU to product
(`product.cfm:L18`), product to product type (`product.cfm:L19` and `:L21`), product to default SKU
(`product.cfm:L27`, via `model/entity/Product.cfc:L565-L568`) and product to brand (`product.cfm:L32`,
conditional) — and the adapter projects those columns alongside the base entity and attaches the mapped
associations to each returned SKU before anything is serialized. The brand projection rides on the
**left** join, so a brandless product still returns a record and simply has no brand attached, which is
what keeps the conditional brand element of §6.3 conditional rather than fatal.

Two consequences worth stating plainly, because they are the difference between a feed that renders and
one that renders blanks: the product-to-default-SKU association is what lets a product's price resolve at
all, and the product-to-product-type association is what lets the description fall back to the product
type's description. Both are selection concerns even though both are consumed in §6.3.

### 6.3 `ProductFeedBuilder.ts` — all RSS field shaping

Shaping is ported from `integrationServices/google/views/feed/product.cfm:L1-L66`, and **this is where
the real work of the feed lands** (AAP §0.4.1.10). Every field mapping in that template is carried
across, including the ones a summary would smooth over: the description's fallback from the product's
own description to the product type's, the conditional sale-price pair, the conditional brand element,
the repeated additional-image elements, and the shipping-weight element assembled from two settings at
`product.cfm:L58`. The field groups that are commented out in the template — at `product.cfm:L33-L38`,
`L40-L57` and `L59-L61` — remain commented in the port with their element names intact, because
deleting them would lose the record of an intended surface.

#### 6.3.1 The URL scheme: parity, and the cleartext exposure carried with it

All five absolute URLs of the legacy template hard-code `http://` — `product.cfm:L14`, `:L15`, `:L22`,
`:L23` and `:L24` — with no `https` branch, no setting behind it and no request-scheme read. **This port
emits the same `http://`,** from the single constant `FEED_SCHEME_PREFIX`, and
`CHANNEL_DESCRIPTION_PREFIX` spells the same scheme out because the legacy literal does, so the channel
link and the channel description can never disagree.

**There is therefore no divergence entry for this folder.** D18 (AAP §0.6.7.7, the importer's parameterised
SQL) remains the port's one departure from byte-for-byte preservation, and emitting `https://` here would be
a second: AAP §0.6.7.7 is titled "The One Declared Departure", AAP §0.8.2 guideline 4 admits no
proportionality test, and AAP §0.4.1.10 requires of the builder that "every field mapping [be] preserved".

**The exposure is carried, not repaired, and it is annotated where it lives.** A merchant feed processor
that honours the document as written fetches every URL in cleartext. `ProductFeedBuilder.ts` carries that as
a `TODO(parity)` on `FEED_SCHEME_PREFIX`, with the legacy locators and the reasoning. It closes in the
**deployment**, not in this folder: terminate TLS at the host `GOOGLE_FEED_HOST` names and redirect cleartext
to it, and every URL upgrades on first contact without the port emitting a different byte. That is the half
of the remedy this deliverable may point at rather than author, since AAP §0.2.2.5 puts infrastructure out of
scope.

The scheme is **not configurable** either: a setting or environment variable for it would invent an input the
source does not have (AAP §0.7.3, IR-12).

**The `g:` namespace URI stays `http://base.google.com/ns/1.0` and must.** A namespace URI is an
identifier compared by exact string equality, not a fetch target; rewriting it would declare a different
namespace and every `g:` element would cease to be a Google feed element. The scheme census in the test suite
therefore accounts for that constant separately from the URLs the feed publishes.

#### 6.3.2 Escaping is the template's own, at the template's own six fields

The template wraps **six** dynamic values in `htmlEditFormat` — `g:id` (`:L17`), `title` (`:L18`),
`description` (`:L19`), `g:product_type` (`:L21`), `g:brand` (`:L32`) and `g:item_group_id` (`:L39`) — and
interpolates **nine** raw: the channel `link` (`:L14`) and `description` (`:L15`), the item `link`
(`:L22`), `g:image_link` (`:L23`), each `g:additional_image_link` (`:L24`), `g:price` (`:L27`),
`g:sale_price` (`:L29`), `g:sale_price_effective_date` (`:L30`) and `g:shipping_weight` (`:L58`). The port
reproduces that split **field for field**, and percent-encodes nothing.

Neither a universal escape nor a percent-encode is applied, and the reason is cardinality rather than
taste: AAP §0.6.7.7 makes D18 — the importer's SQL parameter binding — the port's single authorised
divergence from byte-for-byte preservation, and AAP §0.1.2.1 freezes the plan, so a second exception cannot
be reached by resembling the first. Escaping a raw sink would emit bytes the legacy never emits.

The consequence is stated rather than left implicit: an XML-significant character in any of the nine raw
values would leave the document with no defined XML parse — exactly as in `product.cfm`. What stands in
place of an escape is a refusal, so no malformed document is ever published with a `200`.
`test/integrations/ProductFeedBuilder.test.ts` asserts both halves: that the six escape, and that a hostile
value in a raw sink produces a refusal rather than a document the suite's own XML reader rejects.

**Two URL refusals are in force, and neither is an escape.**
`validateFeedHostAuthority` judges the **configured host** — at load in `src/config/env.ts`, at container
construction in `src/handlers/googleFeedHandler.ts`, and once per render in the serializer — and
`assertSameOriginRelativePath` judges each **appended path** at the three sinks that append it. Neither
forecloses a legacy outcome: RFC 9110 §7.2 defines the `Host` field the first stands in for as an RFC 3986
authority containing none of the refused characters, and `model/entity/Product.cfc:L206-L208` writes the
leading slash the second requires into the composed literal itself.
**Builder capability and route behaviour are different facts, and the additional-image element is where
they diverge.** Everything above describes what this file does when it is given a record. The
repeated `g:additional_image_link` mapping is carried in full here and is covered by
`slatwall-ts/test/integrations/ProductFeedBuilder.test.ts` — but the data behind it comes from
`sku.getProduct().getProductImages()` (`product.cfm:L24`), and no in-scope layer can read it:
`model/entity/Image.cfc` is not one of the six in-scope entities of AAP §0.2.1.2 and AAP §0.2.2.4
excludes `model/validation/ProductImage.json`. So the handler supplies the images alongside each record,
and as shipped it **refuses** rather than supplying an empty list —
`createGoogleFeedHandlerFromContainer` takes an optional `readProductImages` override, and with it
omitted the delivered route answers `501` for any selection that reaches the reader. Returning `[]` instead
would publish "this product has no additional images", which is a different fact from "this service cannot
read images", and the feed would have published the second as the first for every product in the
catalogue. Reading this section as
"the port emits additional images end to end" is therefore the one misreading to avoid: it emits them
when the image subsystem is supplied, and reports the boundary when it is not.

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
observations, each verified directly against the source — two of them faults that break the statement,
one a fault in what it would have meant, and three observations about the component's shape:

1. **Zero callers, repository-wide.** A search across the whole repository for `FeedDAO` and for
   `getProductFeedQuery` finds **no executable call site outside the declaration itself** at
   `FeedDAO.cfc:L52`. The component is orphaned: nothing constructs it, nothing injects it, nothing
   invokes it. (Both names do of course occur in prose — in this section, and in the one-line pointer
   `ProductFeedQuery.ts` carries — but a mention in a comment or a document is not a call site.)
2. **The query assigns an unscoped `rs` variable.** `FeedDAO.cfc:L53` is `<cfset rs = "" />` — no local
   declaration, so the name leaks into the component's shared variables scope.
3. **The `SELECT` list ends in a trailing comma.** `FeedDAO.cfc:L58` is `SwProduct.calculatedTitle,`
   and the next non-blank line, `FeedDAO.cfc:L60`, is `FROM`. The comma sits immediately before the
   `FROM` keyword.
4. **It contains an `INNER JOIN SwProduct` with no `ON` clause.** `FeedDAO.cfc:L62-L63` opens the join
   and `FeedDAO.cfc:L64` goes straight to `WHERE`; no join predicate is ever supplied. **This one is a
   semantic fault, not a syntax error** — MySQL accepts a join with no predicate and treats it as a
   Cartesian product, so had the statement parsed at all it would have paired every SKU row with every
   product row and then filtered the result. That is an unbounded cross product over two of the largest
   tables in the schema, and it is a different and worse kind of wrong than a parse failure: it returns
   an answer.
5. **The `<cfquery>` names no datasource of its own.** `FeedDAO.cfc:L55` is `<cfquery name="rs">` — a
   result name and nothing else. **This is an observation, not a fault, and it is stated here only
   because it is easy to over-read.** A `<cfquery>` with no `datasource` attribute falls back to the
   application-level default, and this application sets one:
   `org/Hibachi/Hibachi.cfc:L10-L11` initialises `this.datasource.name` and `Hibachi.cfc:L16` then
   includes `../../config/configApplication.cfm`, whose `:L2` sets `this.datasource.name = "Slatwall"`.
   So the statement **would** have had a connection to run against. It is not the missing attribute that
   made this method dead.
6. **The component extends nothing.** `FeedDAO.cfc:L49` is `<cfcomponent accessors="true" output="false">`,
   so it inherits nothing — no base initialiser, no injected collaborator and no datasource override.
   Combined with evidence 1, that is what makes the component inert rather than merely unused: there is
   no supertype through which anything could have reached it either.

**Which of the six actually proves the method could never have run.** Evidence 3 does, on its own: a
`SELECT` list terminated by a comma immediately before `FROM` is a parse failure in every SQL dialect, so
the statement could not have been prepared, let alone executed. Evidence 1 makes the point moot in
practice, since nothing ever asked it to. Evidence 4 describes what the statement would have _meant_ had
it parsed, and evidences 2, 5 and 6 are supporting observations about the component's shape. The
conclusion is unchanged; what has changed is that it now rests on the fault that carries it.

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

None of the six observations is given an identifier of its own — they are all evidence for the one
register entry, D12. This document introduces no new defect or mismatch identifier of any kind.

**Where the entry lives.** This section is the authoritative home for D12 — the home AAP §0.4.1.10
assigns it — and every other file in the folder points here rather than restating the evidence:
`ProductFeedQuery.ts` and `ProductFeedBuilder.ts` each carry a one-line pointer here rather than
restating the evidence. The record above is the only one to read.

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

360 seconds, behind a route the legacy serves synchronously. This is mismatch **M2** of AAP §0.6.6, and
it does not map cleanly onto one invocation of the target execution model. 360 seconds sits **inside**
AWS Lambda's 15-minute maximum function duration, so the work itself is expressible as a single
invocation. It nevertheless **far exceeds the default synchronous request-response budget of the gateway
types ordinarily placed in front of a function**, so a synchronously delivered feed of any real catalogue
size can be cut off in front of the function while the function is still running. The legacy model — hold
one HTTP connection open for as long as the render takes — has no equivalent on the synchronous path.

**No single figure is named for that second ceiling, because there is not one to name.** Synchronous
integration limits differ by gateway type, differ by region, and for some gateway types are themselves
configurable; a buffered request-response integration and a streamed one do not have the same ceiling at
all. **This deliverable selects no gateway.** Infrastructure as code is out of scope (AAP §0.2.2.5), so
although §4 records that the route itself is now delivered, there is still no API type and no gateway
configuration from which an effective ceiling could be read — the route determines which function
answers, not what budget the thing in front of it allows. Stating one number as "the" limit would present
as settled a fact that the deployment decides.

**The mismatch is therefore flagged, not resolved, and it stays flagged until a gateway is chosen** —
which the delivered route does not do and was never going to do. The choice between an **asynchronous**
and a **streamed** delivery model — the two AAP §0.6.6 names, and no third of this document's invention —
is an explicit, open decision, and it belongs to
`slatwall-ts/src/handlers/googleFeedHandler.ts`, which owns M2 — **not** to this folder. `ProductFeedBuilder.ts` and `ProductFeedQuery.ts` therefore set no budget, no record bound,
no batching policy, no streaming policy and no cache lifetime of any kind. The 360 is not silently
re-timed to fit, and it is not capped to fit any gateway figure.

**The two numbers above are facts, not targets.** The 360 is a source-declared value with a locator;
the 15-minute function maximum is a published platform limit. Neither is a service-level commitment, and
no performance characteristic of any kind is promised, derived or implied here — AAP §0.6.6 and IR-12
state only what the source declares. This document cites **M2** and mints no other mismatch identifier.

One further execution-model constraint is **obeyed rather than cited**: nothing in this folder carries
state between invocations. The adapter constructs its return values per call and the serializer holds
no accumulated result, so there is no cross-invocation cache to bleed between callers on a reused
container.

---

## 12. Why this lives in `slatwall-ts/` and not under `integrationServices/`

`README.md:L63-L65` instructs that custom code "must not alter or create any files inside Slatwall,
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

- the repository-root `README.md` — the extracted service is documented in its own files, of which
  this is one, rather than by editing legacy documentation;
- the repository-root `.gitignore` — its fifteen entries are left exactly as they are; the plan
  instead creates a `slatwall-ts/.gitignore` scoped to the new subtree;
- every `.cfc` and `.cfm` file in the repository, including `integrationServices/google/model/dao/FeedDAO.cfc`
  and `integrationServices/google/Integration.cfc`.

The practical consequence, stated as precisely as the available evidence supports: **the legacy source
tree is unchanged, and this TypeScript subtree holds no compile-time or run-time reference back into
it.** Nothing here imports, includes, extends, instruments or is discovered by a `.cfc` or `.cfm` file;
the dependency arrow points one way, from this subtree's own modules to each other. The whole deliverable
therefore reads as a single additive diff, and removing `slatwall-ts/` in its entirety would leave the
repository byte-for-byte as it was.

**That is a static claim, and it is deliberately not stated as a runtime one.** Runtime equivalence of
the legacy application was **not executed and could not be**: no ColdFusion, Railo or Lucee engine is
available in this environment, `meta/docker/slatwall-local-dev/` — cited as the local development setup —
does not exist, and MXUnit and CFSelenium are not vendored, so the legacy test suite cannot be run either.
§15 records that limitation and its consequences in full. The evidence for this section is a diff and an
import graph, which is what supports a claim about _unchanged source and absent coupling_; it is not
evidence of observed behaviour, and it is not offered as such.

---

## 13. Layer position, and the layers this folder does not reach

An integration sits above `services`, `ports` and `domain`, and below `handlers`. It may reach
**downward** only (AAP §0.7.3):

- **Permitted:** `domain/`, `ports/`, `services/`, `util/`, `errors/`, and siblings within this folder.
  What is imported today is a strict subset of that — `domain/product/Product`,
  `domain/product/ProductType`, `domain/sku/Sku`, `errors/DomainError`, `ports/ImagePathPort`,
  `ports/PricingPort`, `ports/SettingResolverPort`, `ports/SmartListQueryPort` and `util/formatting`.
  `services/**` is deliberately not among them: the selection composes through the leaf module
  `ports/SmartListQueryPort`, which `SkuService` composes through as well, so the composition is shared
  without the feed taking a dependency on a nine-member service surface.
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

| Port                  | Used by                 | What it supplies                                                                                                                   |
| --------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `PricingPort`         | `ProductFeedBuilder.ts` | The **promotional** sale price and its expiration, and nothing else (`product.cfm:L28-L30`)                                        |
| `ImagePathPort`       | `ProductFeedBuilder.ts` | The primary and additional resized image paths. **Unwired in this slice** — see §6.3 and the note below                            |
| `SettingResolverPort` | `ProductFeedBuilder.ts` | Four keys: `skuShippingWeight` and `skuShippingWeightUnitCode` (`product.cfm:L58`), `imageMissingImagePath`, `globalURLKeyProduct` |
| `SmartListQueryPort`  | `ProductFeedQuery.ts`   | Filter, join and range composition, **and** the association projection that materialises the joined graph (§6.2)                   |

**`PricingPort` does not supply the product price, and it is worth being exact about why.** The feed's
`g:price` element reads the product's own price — `product.cfm:L27` is
`local.sku.getProduct().getPrice()` — and `model/entity/Product.cfc:L561-L568` resolves that from the
product's persisted `price` when one is set and otherwise from its default SKU's. Both are **in-scope
state** on entities this slice models, so the port carries neither. What crosses the boundary is only the
`g:sale_price` pair at `product.cfm:L28-L30`: a sale price and its expiration are computed by the
promotion subsystem, which AAP §0.2.2.6 excludes. The comparison at `product.cfm:L28` therefore has one
foot on each side — the SKU's own price is in-scope state, the sale price it is compared against is not.

**The four setting keys, and where each is read.** Two are read directly by the serializer for the
shipping-weight element at `product.cfm:L58`. `imageMissingImagePath` is the fallback the image members
resolve when no image path is available. `globalURLKeyProduct` is reached one level down rather than
inline: the item `link` at `product.cfm:L22` is composed by the product entity, which resolves that key
through the same injected port, so the feed path depends on it without naming it at the call site. All
four resolve **synchronously** — mismatch M8 of AAP §0.6.6 makes the port synchronous, and awaiting one
would be a behaviour change, not a style choice.

`SmartListQueryPort` exists as a boundary port for a specific reason worth recording: the availability
filter at `integrationServices/google/controllers/feed.cfc:L72` reads `product.calculatedQATS`, which
is a **calculated inventory property**, and inventory is explicitly out of scope (AAP §0.6.4.1,
§0.2.2.7). The feed cannot resolve that value itself, and it does not try. The same port is also what
carries the association projection described in §6.2 — the mechanism that replaces the legacy's lazy
session fetch — which is why its row above names composition **and** materialisation rather than
composition alone.

The ports inventory stands at **thirteen files**, and **this folder creates no new port**. If a future
change to the feed appears to need one, that is a scope decision to be taken deliberately, not a file to
add here.

**Thirteen port files, and the count is auditable by listing the folder.** `src/ports/` holds **eight**,
from two AAP provisions rather than one: the **seven boundary-gap ports** §0.2.2.7 enumerates —
`SettingResolverPort`, `ImagePathPort`, `SubscriptionTermPort`, `AccessContentPort`, `PricingPort`,
`AccountContextPort` and `SmartListQueryPort` — plus **`UniquePropertyPort`**, which comes from **IR-5** and
is listed separately at §0.4.1.6, because it stands for a facility the retired framework provided rather than
for an excluded domain. `src/ports/repositories/` holds **five**: one per catalog DAO, plus
`BrandRepository.ts`, because `BrandService` has no legacy DAO at all and relies entirely on the CRUD
surface `onMissingMethod` synthesized (**IR-1**), so its repository has to be declared explicitly. 8 + 5 =
**13**.

Two contracts a reader might expect as files of their own are folded into existing ports rather than
minted separately, which is what keeps the folder at the inventory AAP §0.3.1 enumerates. The
transactional-write contract lives in `src/ports/UniquePropertyPort.ts`, whose own subject — the
application-side uniqueness probe — runs inside a save, so the transaction that save runs in is its natural
host. The bounded-read window and result types live in `src/ports/SmartListQueryPort.ts`, beside the query
abstraction that produces them.

---

## 13a. Escaping parity, and the one residual risk this port declares

`integrationServices/google/views/feed/product.cfm` escapes **six** of its fifteen dynamic values and
emits **nine raw**, field by field with no rule behind the choice. `ProductFeedBuilder.ts` reproduces that
split exactly.

| Legacy locator | Field                         | Legacy           | Port                |
| -------------- | ----------------------------- | ---------------- | ------------------- |
| `:L17`         | `g:id`                        | `htmlEditFormat` | `escapeFeedText`    |
| `:L18`         | `title`                       | `htmlEditFormat` | `escapeFeedText`    |
| `:L19`         | `description`                 | `htmlEditFormat` | `escapeFeedText`    |
| `:L21`         | `g:product_type`              | `htmlEditFormat` | `escapeFeedText`    |
| `:L32`         | `g:brand`                     | `htmlEditFormat` | `escapeFeedText`    |
| `:L39`         | `g:item_group_id`             | `htmlEditFormat` | `escapeFeedText`    |
| `:L14`         | channel `link`                | raw              | `renderRawFeedNode` |
| `:L15`         | channel `description`         | raw              | `renderRawFeedNode` |
| `:L22`         | item `link`                   | raw              | `renderRawFeedNode` |
| `:L23`         | `g:image_link`                | raw              | `renderRawFeedNode` |
| `:L24`         | `g:additional_image_link`     | raw              | `renderRawFeedNode` |
| `:L27`         | `g:price`                     | raw              | `renderRawFeedNode` |
| `:L29`         | `g:sale_price`                | raw              | `renderRawFeedNode` |
| `:L30`         | `g:sale_price_effective_date` | raw              | `renderRawFeedNode` |
| `:L58`         | `g:shipping_weight`           | raw              | `renderRawFeedNode` |

The channel `title`, `g:google_product_category`, `g:condition` and `g:availability` interpolate nothing
dynamic and pass through neither helper. `test/integrations/ProductFeedBuilder.test.ts` pins this table as
a **source-level census**, so a field added without either helper fails a test rather than shipping.

### Why the nine raw sinks are not escaped, and what stands in place of an escape

Escaping all fifteen sinks, or percent-encoding the data-derived path of the three URL fields, would each
change bytes the legacy publishes unmodified: a stored `&raquo;` would become `&amp;raquo;`, and a stored
`a%20b` would become `a%2520b` with no metacharacter involved at all. Byte parity is the constraint, so
neither is applied.

### What stands in place of an escape, so no CWE-91 exposure is left open

`renderRawFeedNode` **refuses** three things rather than escaping them: `&`, `<`, and the `]]>` sequence.
Those are exactly the inputs whose legacy render had **no defined XML parse**, so no intended outcome is
removed, and a markup payload cannot reach the document through a raw sink. The governing rule is that a
malformed XML document is never published successfully: the failure is a `DataIntegrityError`, which
`googleFeedHandler.ts` answers **500**.

`assertRepresentableInXml` additionally refuses, at **all fifteen** sinks, any code point outside the XML
1.0 `Char` production — the C0 controls other than tab, line feed and carriage return; unpaired
surrogates; `U+FFFE` and `U+FFFF`. No entity reference can carry any of them, so escaping was never an
alternative remedy there. Tab, line feed, carriage return and well-formed astral pairs all still travel
untouched, and **nothing is stripped, substituted or normalised**: remediating already-invalid stored data
is work at the point the data is **written**, which is outside this module and outside the AAP's scope.

### The residual risk, declared rather than left implicit

A data-derived URL **path** is emitted with its stored bytes. Three consequences follow; **one is now
closed** and two are declared open:

1. **Origin — closed.** A path that does not begin with `/` lands inside the authority of
   `<scheme>://<host><path>`, so `attacker.example/x` becomes part of the authority. Both halves of this are
   now refused: `validateFeedHostAuthority` refuses `@`, `/`, `\`, `?`, `#`, whitespace and control
   characters in the configured authority, and `assertSameOriginRelativePath` requires each appended path to
   be a leading-slash relative path carrying no backslash, whitespace or control character.
2. **Query and fragment smuggling — open.** A stored `?` or `#` _inside_ a conforming same-origin path is
   emitted verbatim, so a consumer reads what follows as a query or a fragment. This changes what the URL
   resolves to on the feed's **own** origin; it cannot change the origin.
3. **Traversal — open, and same-origin.** A stored `../..` traverses, as it always did — a traversal segment
   contains nothing reserved to encode — and dot-segment resolution stays within the authority.

**No gate is minted for 2 or 3, and no percent-encoder is applied to any of them.** Encoding would turn a
legitimate path's own `/` separators into `%2F` and a stored `a%20b` into `a%2520b`, which is the byte change
parity forbids.

The leading-slash requirement in 1 forecloses nothing the legacy published:
`model/entity/Product.cfc:L206-L208` writes the leading slash into the composed product URL literal, and the
image paths are composed beneath a rooted image-folder setting — `product.cfm:L22`–`:L24` append all three
to `http://#CGI.HTTP_HOST#` precisely because they are root-relative, so a value without the slash produced
a malformed URL in the legacy document too. The write path for `urlTitle` is `src/util/urlTitle.ts`, whose
output is already slug-safe; the risk that remains under 2 and 3 is owned by whoever writes the image
settings.

---

## 14. Test provenance — net-new, and stated as such

The legacy repository contains **no test for the feed at all**, and **no mocking library anywhere**.
MXUnit and CFSelenium are **not vendored** in the repository, so the legacy suite cannot be executed in
this environment even in principle (AAP §0.5.4, §0.6.5.3).

All coverage of this folder is therefore **NET-NEW**, and every case names itself `NET-NEW` in the suite, so
the label travels with the test rather than living only here. It arrives as **five bodies inside one
executable suite**: `test/integrations/ProductFeedBuilder.test.ts` is the only suite file, and the other four
bodies are folded into it so the suite inventory matches the seventeen AAP §0.4.1.12 declares (see
`slatwall-ts/README.md` §12.1). `npm test -- --listTests` therefore reports one file; a bare `npx jest`
cannot load this package's preset, so use the `npm test` script (see `slatwall-ts/README.md` §9.5):

- `slatwall-ts/test/integrations/ProductFeedBuilder.test.ts` — the field mapping, every conditional
  branch, and the escaping.
- `test/integrations/ProductFeedBuilder.test.ts`'s folded `ProductFeedQuery` block — record selection: that the three feed joins
  are applied on top of the SKU smart list rather than instead of it, that returned SKUs arrive with
  their associations already attached, that an absent association (the brandless product reaching the
  feed through the left join) is reported as absent rather than fabricated, and that a projection the
  schema cannot satisfy fails loudly rather than half-building.
- `test/integrations/ProductFeedBuilder.test.ts`'s folded `IntegrationContract` block — the five-method contract ported from
  `integrationServices/IntegrationInterface.cfc:L51-L89`, asserted as a contract rather than through an
  implementation.
- `test/integrations/ProductFeedBuilder.test.ts`'s folded `BaseIntegration` block — the default implementations carried from
  `integrationServices/BaseIntegration.cfc:L49-L73`.
- `test/integrations/ProductFeedBuilder.test.ts`'s folded `GoogleIntegration` block — the stub itself: that
  `getIntegrationTypes()` answers `fw1`, that `getDisplayName()` answers `Google` while the component
  attribute it was cloned from said otherwise (defect **D11**), that `getSettings()` is empty, and that
  no live call to Google exists anywhere in it.

The feed's delivered route is additionally covered outside this folder, by
`test/integrations/ProductFeedBuilder.test.ts`'s folded `googleFeedHandler` block and
`test/regression/issues.test.ts`'s folded `entrySurface` block, which own the request-shaped behaviour this folder
deliberately does not describe — including the additional-image boundary of §6.3.

Neither is parity coverage, neither extends an existing test, and nothing in this port should be read as
implying that either does. AAP §0.8.3.7 makes stating this an explicit requirement, because the question
it answers — whether existing tests were replicated or new ones silently generated — is exactly the
question a skeptical reviewer asks first. For this folder the honest answer is: **new ones, because none
existed.**

---

## 15. How these findings were verified, and this folder has no user interface

**Verification method.** Every behavioural claim in this document is grounded in **reading legacy
source**, not in observing legacy execution. The CFML runtime is not reproducible in this environment:
there is no CFML engine available, the repository contains no container or build definition for one,
and the `meta/docker/slatwall-local-dev/` path cited in the original brief **does not exist** — `meta/`
contains only `meta/tests/` and `meta/eclipse/` (AAP §0.8.4.1). Consequently **no runtime behavioural
comparison against the original was performed**, and traceability throughout this port is
**documentary**. That is stated plainly rather than implied away, and it is why every behavioural claim
above carries a locator a reviewer can open — with the two deliberate exceptions the introduction sets
out: repository-wide inventory counts, which name the directory they measure, and absence claims, which
name the search that found nothing.

For the same reason, where the legacy documentation is silent this document records the silence rather
than filling it. The root `README.md` does pin three platform floors — Mura at `README.md:L4`,
ColdFusion at `README.md:L6` and Railo at `README.md:L8`, each written as a version "or Newer" — but
**the legacy tree and the root documentation pin no Lucee version, no MySQL version and no
container-based development workflow**, and no plausible value is invented for any of them here.

That silence is the _legacy_ tree's, not the repository's. `slatwall-ts/` records a pinned toolchain and
several adapter comments name the MySQL server version a behaviour was measured against, but those are
facts about this port's verification environment rather than discovered pins on the legacy application,
and nothing here attributes them to it.

**No user interface, and no design system.** This folder is headless: there is no component, no
component library, no design token and no design asset, and none applies. The single legacy file with
a view extension, `integrationServices/google/views/feed/product.cfm`, emits **RSS 2.0 XML for machine
consumption** rather than rendering anything for a person — so its port, `ProductFeedBuilder.ts`, is a
**serializer, not a component** (AAP §0.3.4). The view extension invites the opposite assumption,
which is why it is said here explicitly.
