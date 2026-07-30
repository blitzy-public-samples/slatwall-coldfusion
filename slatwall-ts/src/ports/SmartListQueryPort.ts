/**
 * SmartListQueryPort — the paginated dynamic-query abstraction the ported SmartList members and the
 * Google product-feed controller depend on.
 *
 * Legacy origin:
 *   org/Hibachi/HibachiSmartList.cfc — 1,090 lines of framework code implementing dynamic paginated
 *     HQL composition. Per AAP §0.8.3.2 the `org/Hibachi/**` tree is "a boundary to extract from,
 *     never modify": its CONTRACT is read here and NOT ONE LINE of its implementation is carried
 *     over. Every declaration this file mirrors is cited by line so the mapping is checkable.
 *   model/service/ProductService.cfc:L342 — `getProductSmartList`, consumer 1.
 *   model/service/SkuService.cfc:L309 — `getSkuSmartList`, consumer 2.
 *   integrationServices/google/controllers/feed.cfc:L58 — `product(rc)`, consumer 3.
 *   model/entity/Product.cfc:L251-L261 and model/entity/Product.cfc:L340-L347 — the two
 *     runtime-synthesized SmartList call sites (IR-1).
 *   org/Hibachi/HibachiService.cfc:L255 — `onMissingMethod`, which fabricated the `get*SmartList`
 *     members by prefix and is the reason they must now be declared explicitly (IR-1).
 *
 * WHY THIS IS A BOUNDARY PORT RATHER THAN SOMETHING THE FEED RESOLVES ITSELF. The feed's
 * availability gate is `addRange('product.calculatedQATS','1^')` at
 * integrationServices/google/controllers/feed.cfc:L72. AAP §0.6.4.1 states that this filter "reads
 * a calculated inventory property, which is why `SmartListQueryPort` is one of the seven boundary
 * ports rather than something the feed can resolve itself." Inventory is excluded from the slice —
 * `Inventory*` (3 files) and `Stock*` (11 files) per AAP §0.2.2.1 — so the port is what lets the
 * feed express that gate without converting the inventory subsystem (TR-5). It is also the
 * mechanism behind AAP §0.8.3.8 strangler-fig independence: "new TypeScript services must be
 * callable and deployable without requiring the rest of Slatwall to be converted."
 *
 * THIS FILE IS THE SHARED TYPE HOME FOR src/ports/. `SmartListInput` and `SmartListResult<T>` are
 * named in four AAP-declared service signatures (§0.4.2.1 `getProductSmartList`, §0.4.2.2
 * `getSkuSmartList`, §0.4.2.5 `getOptionSmartList` and `getOptionGroupSmartList`), and they are
 * defined HERE because AAP §0.4.3.5 forbids module path aliases and a barrel, and the folder
 * inventory of AAP §0.4.1.6 admits no `types.ts`, `common.ts` or `index.ts`. The two export names
 * are therefore a contract, not a preference: renaming either one breaks those four signatures.
 *
 * LAYER POSITION. This is a port, so it sits beneath `domain`, `adapters`, `services`, `handlers`,
 * `integrations`, `validation` and `config` (AAP §0.7.3 standard 4). It imports NOTHING — not a
 * package, not a Node builtin, not a sibling module. `SmartListResult<T>` is generic precisely so
 * no domain entity has to be imported; if an import ever appears here, the generic parameter is
 * being bypassed. `src/adapters/mysql/SmartListQueryBuilder.ts` IMPLEMENTS this interface, so
 * importing it would invert the dependency. Consumers should import these declarations with `import
 * type` so the reference is erased at compile time and this module contributes zero runtime bytes.
 *
 * NO USER-SPECIFIED RULES GOVERN THIS FILE. `review_rules` returns one line of text, and that line
 * reads, verbatim: "No user rules provided." The same line comes back for the default window and
 * for an explicit full-document read alike, and no ancillary rule-bearing file exists anywhere in
 * the repository (AAP §0.7.1). Per UR4 that is not permission to lower the bar: the nine binding
 * standards of AAP §0.7.3 govern instead, and the ones this file turns on are standard 1 (strict
 * type safety), standard 2 (parameterized SQL — see the omission record below), standard 3
 * (explicit dependency injection, named exports), standard 4 (hexagonal separation), standard 6 (a
 * surface small enough to hand-stub), standard 7 (preserve and annotate), standard 8 (flag
 * mismatches) and standard 9 (invent nothing).
 *
 * NO DESIGN SYSTEM APPLIES. There are zero attachments and zero Figma files (AAP §0.9.1) and no
 * user-interface surface in this subtree (AAP §0.3.4). Consumer 3's origin carries a `.cfm` view
 * extension, but AAP §0.3.4 establishes that it "emits RSS 2.0 XML with the `g:` namespace for
 * machine consumption" — a serializer, not a component. Nothing here renders.
 */

/* ================================================================================================
 * TRANSLATION DECISIONS — AAP §0.8.2 Guideline 6 requires that "all technology-specific translation
 * decisions" be documented "with clear comments, especially anywhere legacy behavior ... required
 * an explicit judgment call". Each judgment made in this file is recorded below with its locator.
 *
 * D-A. A DECLARATIVE QUERY DESCRIPTION REPLACES THE MUTABLE FLUENT BUILDER.
 *   The legacy object accumulates state across successive calls — `joinRelatedProperty`
 *   (org/Hibachi/HibachiSmartList.cfc:L212), `addFilter` (org/Hibachi/HibachiSmartList.cfc:L362),
 *   `addRange` (org/Hibachi/HibachiSmartList.cfc:L445) and friends each mutate one instance, and
 *   the caller then reads results off that same instance. The Minimal Change Clause (AAP §0.8.1)
 *   licenses replacing that idiom: "It does not mean preserving CFML idioms in TypeScript;
 *   idiomatic, conventional TypeScript is expected." Two things make a plain data description the
 *   better target. First, the legacy already has one:
 *   `getStateStruct()` at org/Hibachi/HibachiSmartList.cfc:L1064-L1078 serialises exactly this
 *   accumulated state — base entity name, entities, where groups, orders, keywords, keyword
 *   properties, page size, join order and the distinct flag — so the description below is a
 *   restatement of a shape the framework itself defines, not an invention. Second, AAP §0.6.6
 *   mismatch M7 warns that "nothing survives between Lambda invocations except module-scope state",
 *   which makes every object that accumulates query state a per-invocation object; an immutable
 *   data description cannot leak across invocations at all, because there is nothing to reuse.
 *   (That mismatch is cited for its reasoning only — it is allocated to `src/ports/repositories/`,
 *   and this file does not claim it.) Consequence a reader should expect: composing on top of an
 *   existing query — which consumer 3 does at
 *   integrationServices/google/controllers/feed.cfc:L63-L72 by layering onto the result of
 *   `getSkuSmartList()` — becomes building a new description from the previous one rather than
 *   mutating a shared object.
 *
 * D-B. EXECUTION IS ASYNCHRONOUS HERE, AND THAT IS NOT AN INCONSISTENCY WITH SettingResolverPort.
 *   Running the query is genuine database I/O — the legacy performs it through `ormExecuteQuery` at
 *   org/Hibachi/HibachiSmartList.cfc:L753 and org/Hibachi/HibachiSmartList.cfc:L762 — so the single
 *   execution member returns a promise. The sibling `SettingResolverPort` is deliberately
 *   SYNCHRONOUS because AAP §0.6.6 mismatch M8 forces it to be: a background thread updates stock
 *   calculations out of band, and a synchronous contract guarantees no caller in the slice waits on
 *   that completion. This port is not subject to M8 (cited, not claimed). The two shapes differ
 *   because their constraints differ, and they must NOT be harmonised.
 *
 * D-C. RANGE BOUNDS BECOME A STRUCTURED PAIR INSTEAD OF A DELIMITED STRING. See `SmartListRange`.
 * D-D. THE JOIN GRAMMAR STAYS THREE-PART. See `SmartListJoin`.
 * D-E. THE UNTYPED `currentURL` ARGUMENT IS TIGHTENED TO AN OPTIONAL STRING. See `SmartListInput`.
 * D-F. CFML LISTS AND STRUCTS BECOME ARRAYS AND TYPED OBJECTS THROUGHOUT — for example the
 *   `whereGroups[n].filters` struct at org/Hibachi/HibachiSmartList.cfc:L370, which is keyed by
 *   resolved property and therefore admits one value per property per group, becomes an array of
 *   `SmartListFilter` entries. The one-value-per-property consequence is preserved by the adapter,
 *   which resolves entries in order exactly as the legacy struct assignment does; the array form is
 *   used because it keeps ordering visible and needs no string keys.
 * ============================================================================================== */

/* ================================================================================================
 * OMISSION RECORD — AAP §0.7.3 standard 8 ("flag mismatches rather than assume them away").
 *
 * ⛔ THE RAW-CONDITION MEMBER AT org/Hibachi/HibachiSmartList.cfc:L358 IS DELIBERATELY ABSENT.
 *   That member takes a query-language fragment as a string, appends it verbatim to a list at
 *   org/Hibachi/HibachiSmartList.cfc:L359, and the fragment is later spliced straight into the
 *   emitted statement at org/Hibachi/HibachiSmartList.cfc:L706. It is flatly incompatible with AAP
 *   §0.7.3 standard 2, which requires "all statements bound through `pool.execute()` with `?`
 *   placeholders; identifiers built only from validated whitelists." An interface member accepting
 *   an arbitrary query fragment is an injection surface by construction, and admitting one here
 *   would defeat the very standard that the importer hardening of AAP §0.6.7.7 exists to establish.
 *   The legacy call sites show why the concern is concrete rather than theoretical:
 *   model/entity/ProductType.cfc:L264 interpolates `#getProductTypeIDPath()#` directly into a LIKE
 *   predicate and hard-codes a framework-generated query alias.
 *   NOTHING IN THE SLICE IS LEFT UNSATISFIABLE BY THE OMISSION, and that is verifiable rather than
 *   asserted. Every in-slice call site sits on a member this port is not asked to serve:
 *     - model/entity/ProductType.cfc:L263 — `getProductsSmartList()`, spanning
 *       model/entity/ProductType.cfc:L261-L266, is the caller AAP §0.4.1.6 names as likewise
 *       omitted.
 *     - model/entity/Product.cfc:L133 — inside `getProductTypeOptions()` at
 *       model/entity/Product.cfc:L125, which is not on the retained member list of AAP §0.4.1.4.
 *     - model/entity/Product.cfc:L818, model/entity/ProductType.cfc:L295 and
 *       model/entity/Sku.cfc:L836 — attribute-set members reaching the excluded attribute service.
 *     - model/entity/Sku.cfc:L350 — `assignedOrderItemAttributeSetSmartList`, itself on the
 *       sixteen-member exclusion list of AAP §0.2.2.6.
 *   NO EQUIVALENT IS ADMITTED UNDER A DIFFERENT NAME EITHER. There is no escape hatch on this
 *   interface through which a caller can supply a fragment of a query, however it might be
 *   labelled.
 *
 * ⛔ Also deliberately absent, each with its reason:
 *   - The query-cache surface, `getCacheName()` at org/Hibachi/HibachiSmartList.cfc:L1081 and the
 *     cacheable flag it reads. Caching under a warm container is an adapter decision, and no cache
 *     lifetime is invented here (AAP §0.7.3 standard 9).
 *   - The projection surface, `addSelect` at org/Hibachi/HibachiSmartList.cfc:L351. Projection is
 *     not one of the eight capability groups AAP §0.4.1.7 names, and its single in-slice call site,
 *     model/entity/Product.cfc:L503 inside `getDefaultProductImageFiles()` at
 *     model/entity/Product.cfc:L497, belongs to the image members served by `ImagePathPort`.
 *   - The `fetch` and `isAttribute` join modifiers declared at
 *     org/Hibachi/HibachiSmartList.cfc:L212. Both are used only by the framework's own internal
 *     auto-join walk at org/Hibachi/HibachiSmartList.cfc:L324-L339; no in-scope caller passes
 *     either. `isAttribute` additionally reaches the out-of-scope attribute-value entity at
 *     org/Hibachi/HibachiSmartList.cfc:L215.
 *   - `keywordPhrases`, declared at org/Hibachi/HibachiSmartList.cfc:L19 and populated at
 *     org/Hibachi/HibachiSmartList.cfc:L161. It is never consumed anywhere in the file, so carrying
 *     it would add surface with no behavior behind it.
 *   - `count`, `list` and `export` capabilities. AAP §0.4.2.5 reproduces the runtime method
 *     synthesis of org/Hibachi/HibachiService.cfc:L255 only where the slice actually calls it, and
 *     withholds the count, list and export prefixes because it never does. The same restraint
 *     applies here.
 *   - Aggregate grouping, cursors, streams and async iteration. None appears in the legacy surface;
 *     paging is offset-based (org/Hibachi/HibachiSmartList.cfc:L762). AAP §0.6.1.3 T1 records that
 *     a grouped-count rewrite silently changes results elsewhere in this port set — a different
 *     query, but the same class of temptation.
 *   - Every service-level number. No default page size, maximum page size, result cap, timeout,
 *     retry budget, cache lifetime or maximum join depth is declared, per AAP §0.7.3 standard 9 and
 *     IR-12. The only figures stated below are source-declared values carrying their locators.
 * ============================================================================================== */

/**
 * A logical property path, exactly as the legacy members accept it.
 *
 * These are ENTITY-GRAPH PATHS, NOT DATABASE IDENTIFIERS. The observed values include plain
 * properties (`productName`), one-hop paths (`brand.brandName` at
 * model/service/ProductService.cfc:L352), two-hop paths (`product.productType.productTypeName` at
 * model/service/SkuService.cfc:L321) and three-hop paths (`options.skus.product.productID` at
 * model/entity/Product.cfc:L256). The legacy resolves each path to an aliased column and joins the
 * intermediate entities on demand — `getAliasedProperty` at org/Hibachi/HibachiSmartList.cfc:L308,
 * which walks the path and auto-joins at org/Hibachi/HibachiSmartList.cfc:L324-L339, using the
 * sub-entity delimiters declared at org/Hibachi/HibachiSmartList.cfc:L32.
 *
 * The implementing adapter MUST resolve these paths from a validated whitelist and never by
 * interpolation, per AAP §0.7.3 standard 2 and transformation rule TR-4 / import rule R4: a `?`
 * placeholder binds values only and cannot substitute an identifier. Because a path is a logical
 * name rather than a column, no schema identifier is ever passed across this interface.
 *
 * TODO(parity): an unresolvable path is SILENTLY DISCARDED rather than reported. Every legacy
 * accumulator is wrapped in a length test on the resolved property — filters at
 * org/Hibachi/HibachiSmartList.cfc:L369, like filters at org/Hibachi/HibachiSmartList.cfc:L396, in
 * filters at org/Hibachi/HibachiSmartList.cfc:L422, ranges at
 * org/Hibachi/HibachiSmartList.cfc:L449, orders at org/Hibachi/HibachiSmartList.cfc:L480 and
 * keyword properties at org/Hibachi/HibachiSmartList.cfc:L487 — so a mistyped path yields a query
 * with the entry missing instead of an error. Carried, not repaired: the adapter must drop the
 * entry, and this interface deliberately provides no channel through which it could report having
 * done so.
 */
export type SmartListPropertyIdentifier = string;

/**
 * A value supplied to a filter.
 *
 * The legacy parameter is declared `required string value` at
 * org/Hibachi/HibachiSmartList.cfc:L362, but the in-scope callers do not honour that narrowly:
 * consumer 3 passes the number `1` positionally three times at
 * integrationServices/google/controllers/feed.cfc:L68-L70, and CFML coerces it. The union therefore
 * admits what the call sites actually supply. Booleans are included because the removal keys of the
 * caller-supplied input are boolean-gated at org/Hibachi/HibachiSmartList.cfc:L102, and because
 * only simple values are processed at all (org/Hibachi/HibachiSmartList.cfc:L99).
 *
 * TWO SOURCE BEHAVIOURS RIDE ON THIS TYPE, both carried by the adapter rather than encoded here:
 *   1. TODO(parity): the literal uppercase string `NULL` is a SENTINEL, not a value. A
 *      single-valued filter whose value is that literal emits an is-null test at
 *      org/Hibachi/HibachiSmartList.cfc:L592-L593, and the same literal inside a multi-value list
 *      does so at org/Hibachi/HibachiSmartList.cfc:L582-L583. A port that bound it as an ordinary
 *      string would compare against the four characters instead, and would silently return nothing
 *      where the legacy returned the rows with a null column.
 *   2. TODO(parity): a comma-delimited value is a DISJUNCTION, not one literal. The value delimiter
 *      is declared at org/Hibachi/HibachiSmartList.cfc:L33, and a value containing more than one
 *      element expands to an OR-ed set of equality tests at
 *      org/Hibachi/HibachiSmartList.cfc:L579-L590 while a single element emits one equality test at
 *      org/Hibachi/HibachiSmartList.cfc:L595-L597.
 */
export type SmartListFilterValue = string | number | boolean;

/**
 * How a related-property join is performed.
 *
 * ⭐ Q2 — THE DEFAULT IS THE EMPTY STRING, NOT AN INNER JOIN, AND THE DISTINCTION IS OBSERVABLE. The
 * legacy signature declares `string joinType=""` at org/Hibachi/HibachiSmartList.cfc:L212, and the
 * empty value is recorded only when non-empty at org/Hibachi/HibachiSmartList.cfc:L292-L293. What
 * makes the default load-bearing is what happens at emission time: an empty join type is coerced to
 * `left` at org/Hibachi/HibachiSmartList.cfc:L539-L541 before the join clause is written at
 * org/Hibachi/HibachiSmartList.cfc:L549. An unspecified join and an explicitly left join therefore
 * emit the SAME clause in this codebase.
 *
 * ⛔ Normalising the default to an inner join would be a behavior change wearing a cleanup's
 * clothes: it would convert every unspecified join in the slice into an inner join and silently
 * drop the rows a left join preserves. The empty member is kept in the union so the legacy default
 * is expressible explicitly, and the join's `joinType` member is optional so its ABSENCE also means
 * the L212 default. Both spellings are legal and mean the same thing, exactly as in the source.
 *
 * `left` is the only non-empty value used anywhere in the slice — consumer 1 at
 * model/service/ProductService.cfc:L349, consumer 2 at model/service/SkuService.cfc:L316 and
 * consumer 3 at integrationServices/google/controllers/feed.cfc:L66. No further member is invented
 * (AAP §0.7.3 standard 9), even though the legacy parameter is an unconstrained string.
 */
export type SmartListJoinType = '' | 'left';

/**
 * One related-property join.
 *
 * ⭐⭐ Q1 — THE GRAMMAR IS THREE-PART: PARENT ENTITY, RELATED PROPERTY, OPTIONAL JOIN TYPE. It is not
 * a flat dotted path, and consumer 2 is the proof. At model/service/SkuService.cfc:L314 the parent
 * is `SlatwallSku`; at the very next line, model/service/SkuService.cfc:L315, THE PARENT CHANGES to
 * `SlatwallProduct` so that the product's own product type is joined onto the entity introduced by
 * the previous line. A single dotted string such as a combined product-then-product-type path
 * cannot express that, because it cannot say which already-joined entity the next hop hangs off.
 * Consumer 3 does the same thing twice more, at
 * integrationServices/google/controllers/feed.cfc:L65-L66. A dotted-path design would compile, read
 * naturally, and quietly fail to represent two of the three consumers — which is why the three
 * parts are modelled separately here.
 *
 * ⭐ Q3 — `SlatwallProduct` AND `SlatwallSku` ARE CORRECT AND MUST NOT BE RENAMED. They are the
 * ORM's logical entity names, which is what this API consumes: the legacy resolves the base name
 * through the entity service at org/Hibachi/HibachiSmartList.cfc:L68 and writes it into the emitted
 * from-clause at org/Hibachi/HibachiSmartList.cfc:L533. The physical-versus-logical name divergence
 * recorded as defect D22 applies only to NATIVE SQL, and only in the product and product-type data
 * access objects; rewriting these to the physical `SwProduct` / `SwSku` table names would break the
 * very API this port abstracts. The adapter maps logical names to physical tables internally.
 *
 * ⭐ Q4 — A REPEATED JOIN IS OBSERVABLE BEHAVIOR AND IS NOT DE-DUPLICATED HERE. Consumer 3 re-joins
 * the product at integrationServices/google/controllers/feed.cfc:L64 even though consumer 2 has
 * already joined it at model/service/SkuService.cfc:L314, because the feed layers onto the smart
 * list returned by `getSkuSmartList()` at integrationServices/google/controllers/feed.cfc:L63.
 * TODO(parity): the duplicate is carried. This interface neither rejects a repeated join nor
 * collapses one, and the adapter must reproduce whatever the legacy does with the second
 * registration rather than assume the two are interchangeable.
 *
 * Join ORDER is significant and is carried by array position: the legacy tracks it separately in
 * the join-order array declared at org/Hibachi/HibachiSmartList.cfc:L9 and iterates it when
 * emitting the from-clause at org/Hibachi/HibachiSmartList.cfc:L536.
 */
export interface SmartListJoin {
  /**
   * The already-present entity the join hangs off, as an ORM logical entity name —
   * `SlatwallProduct` or `SlatwallSku` in this slice. First parameter at
   * org/Hibachi/HibachiSmartList.cfc:L212.
   */
  readonly parentEntityName: string;

  /**
   * The relationship on the parent entity to join across — for example `productType`, `defaultSku`,
   * `brand`, `product` or `alternateSkuCodes`. Second parameter at
   * org/Hibachi/HibachiSmartList.cfc:L212.
   */
  readonly relatedProperty: string;

  /**
   * How to join. ABSENT means the empty-string default of org/Hibachi/HibachiSmartList.cfc:L212,
   * which the emitter resolves to a left join at org/Hibachi/HibachiSmartList.cfc:L539-L541.
   */
  readonly joinType?: SmartListJoinType;
}

/**
 * One equality, like or in filter, depending on which collection of a where group it appears in.
 *
 * The three families share this shape because they share it in the source: all three store a value
 * against a resolved property inside the same where group — equality at
 * org/Hibachi/HibachiSmartList.cfc:L370, like at org/Hibachi/HibachiSmartList.cfc:L397 and in at
 * org/Hibachi/HibachiSmartList.cfc:L423. Their IDENTITY comes from which collection they sit in,
 * not from a distinguishing field, so `SmartListWhereGroup` gives each its own member rather than
 * this type carrying a discriminator the legacy does not have.
 */
export interface SmartListFilter {
  /**
   * The logical property path to test. First parameter at org/Hibachi/HibachiSmartList.cfc:L362.
   */
  readonly propertyIdentifier: SmartListPropertyIdentifier;

  /** The value to test against. Second parameter at org/Hibachi/HibachiSmartList.cfc:L362. */
  readonly value: SmartListFilterValue;
}

/**
 * One range filter, with each bound independently optional.
 *
 * ⭐⭐ D-C — THE `'1^'` OPEN-ENDED SYNTAX REMAINS FULLY EXPRESSIBLE, RESTRUCTURED RATHER THAN
 * SIMPLIFIED. The legacy encodes a range as a single string carrying the delimiter declared at
 * org/Hibachi/HibachiSmartList.cfc:L36, and parses it three ways at emission time:
 *   - value STARTS with the delimiter — org/Hibachi/HibachiSmartList.cfc:L635 — upper bound only,
 *     emitting a less-than-or-equal test at org/Hibachi/HibachiSmartList.cfc:L639.
 *   - value ENDS with the delimiter — org/Hibachi/HibachiSmartList.cfc:L642 — lower bound only,
 *     emitting a greater-than-or-equal test at org/Hibachi/HibachiSmartList.cfc:L646.
 *   - neither — org/Hibachi/HibachiSmartList.cfc:L649 — both bounds, emitting both tests at
 *     org/Hibachi/HibachiSmartList.cfc:L655.
 * The structured pair below represents all three cases: a lower bound alone, an upper bound alone,
 * or both. The feed's availability gate `addRange('product.calculatedQATS','1^')` at
 * integrationServices/google/controllers/feed.cfc:L72 is the LOWER-BOUND-ONLY case and becomes a
 * lower bound of `1` with no upper bound — which the adapter emits through the same
 * greater-than-or-equal test the legacy writes at org/Hibachi/HibachiSmartList.cfc:L646.
 *
 * THIS IS A DOCUMENTED IDIOM CHANGE, NOT A SIMPLIFICATION OF THE SEMANTICS. Absence of a bound is
 * how open-endedness is expressed, which is why `exactOptionalPropertyTypes` matters here: an
 * absent upper bound and an upper bound present-but-undefined would otherwise be conflated, and the
 * open end of the range is the entire meaning of the feed's gate. All bounds are bound as
 * parameters by the legacy too — org/Hibachi/HibachiSmartList.cfc:L638,
 * org/Hibachi/HibachiSmartList.cfc:L645 and org/Hibachi/HibachiSmartList.cfc:L653-L654 — so the
 * translation preserves parameterization as well as meaning (TR-4).
 *
 * TODO(parity): a MALFORMED range value is SILENTLY DISCARDED. The entire body of the legacy
 * accumulator sits inside the well-formedness test at org/Hibachi/HibachiSmartList.cfc:L446, so a
 * value failing it is dropped and the query runs unfiltered. Carried: no validation that throws is
 * added here.
 *
 * TODO(parity): reading a range back yields an EMPTY STRING, not an empty collection, when the
 * property has no range in the group — org/Hibachi/HibachiSmartList.cfc:L468, inside the accessor
 * at org/Hibachi/HibachiSmartList.cfc:L461-L471. The equality, like and in accessors do the same at
 * org/Hibachi/HibachiSmartList.cfc:L388, org/Hibachi/HibachiSmartList.cfc:L414 and
 * org/Hibachi/HibachiSmartList.cfc:L440. This port carries no read-back accessors at all — a
 * description IS its own state, so there is nothing to read back — but the behaviour is recorded
 * because a port that did add accessors would have to reproduce it rather than return an empty
 * list.
 *
 * TODO(parity): a range value of length one or less is skipped at emission by the guard at
 * org/Hibachi/HibachiSmartList.cfc:L632, and a value carrying NO delimiter takes the both-bounds
 * branch with the first and last elements equal, so it constrains the property to a single value
 * rather than to an interval. Both behaviours belong to the adapter's translation of these bounds.
 */
export interface SmartListRange {
  /**
   * The logical property path to bound. First parameter at org/Hibachi/HibachiSmartList.cfc:L445.
   */
  readonly propertyIdentifier: SmartListPropertyIdentifier;

  /**
   * Inclusive lower bound. Present alone for the open-ended lower case of
   * org/Hibachi/HibachiSmartList.cfc:L642 — the shape of the feed's gate at
   * integrationServices/google/controllers/feed.cfc:L72. Absent means unbounded below.
   */
  readonly lowerBound?: string | number;

  /**
   * Inclusive upper bound. Present alone for the open-ended upper case of
   * org/Hibachi/HibachiSmartList.cfc:L635. Absent means unbounded above.
   */
  readonly upperBound?: string | number;
}

/**
 * One where group: the unit of grouping declared at org/Hibachi/HibachiSmartList.cfc:L14, whose
 * hint reads "this holds all filters and ranges".
 *
 * THE GROUPING IS PRESERVED BECAUSE IT CARRIES MEANING THAT A FLAT FILTER LIST WOULD LOSE:
 *   - Entries WITHIN one group are conjoined — org/Hibachi/HibachiSmartList.cfc:L590 and
 *     org/Hibachi/HibachiSmartList.cfc:L597 append a conjunction after each entry.
 *   - Separate groups are DISJOINED — org/Hibachi/HibachiSmartList.cfc:L571 places a disjunction
 *     between them. Flattening every filter into one list would therefore silently conjoin
 *     predicates the legacy disjoins.
 *   - A group with all four collections empty is skipped entirely at
 *     org/Hibachi/HibachiSmartList.cfc:L563, so an absent collection and an empty one are
 *     indistinguishable — which is why each member below is optional rather than a required
 *     possibly-empty array.
 *
 * The four members mirror, one for one, the container literal the legacy creates for every group at
 * org/Hibachi/HibachiSmartList.cfc:L180.
 *
 * GROUP NUMBERING. The legacy addresses groups by a one-based number, defaulting to the first group
 * — see the group parameter at org/Hibachi/HibachiSmartList.cfc:L362 and the growth loop at
 * org/Hibachi/HibachiSmartList.cfc:L177-L183 — and every in-scope call site relies on that default,
 * for example the two filters placed in the same group at model/entity/Product.cfc:L343-L344 and
 * the three at integrationServices/google/controllers/feed.cfc:L68-L70. In this description the
 * group's ARRAY POSITION carries the number: position zero is the legacy's group one. That
 * off-by-one is the single consequence of moving from one-based CFML arrays to zero-based
 * TypeScript arrays, and it is recorded here rather than left for the adapter to discover.
 */
export interface SmartListWhereGroup {
  /**
   * Equality tests. Accumulated by the member at org/Hibachi/HibachiSmartList.cfc:L362 and emitted
   * at org/Hibachi/HibachiSmartList.cfc:L578-L600.
   */
  readonly filters?: readonly SmartListFilter[];

  /**
   * Pattern tests. Accumulated by the member at org/Hibachi/HibachiSmartList.cfc:L393. The
   * caller-supplied input wraps each element of a multi-value entry in the pattern wildcard at
   * org/Hibachi/HibachiSmartList.cfc:L108-L113, so a value arriving here already carries whatever
   * wildcards were intended — as at model/entity/Product.cfc:L132, which supplies its own trailing
   * wildcard.
   */
  readonly likeFilters?: readonly SmartListFilter[];

  /**
   * Set-membership tests. Accumulated by the member at org/Hibachi/HibachiSmartList.cfc:L419, whose
   * value is a delimited list of candidates using the delimiter at
   * org/Hibachi/HibachiSmartList.cfc:L33.
   */
  readonly inFilters?: readonly SmartListFilter[];

  /**
   * Bounded-range tests. Accumulated by the member at org/Hibachi/HibachiSmartList.cfc:L445 and
   * emitted at org/Hibachi/HibachiSmartList.cfc:L630-L657.
   */
  readonly ranges?: readonly SmartListRange[];
}

/**
 * One property registered as searchable, with its weight.
 *
 * ⭐ Q5 — THE WEIGHT IS PART OF THE CONTRACT, AND EVERY OBSERVED VALUE IS ONE. The legacy declares
 * it `required numeric weight` at org/Hibachi/HibachiSmartList.cfc:L485, so it is required here too
 * rather than optional-with-a-default. All ten registrations in the slice pass one: five in
 * consumer 1 at model/service/ProductService.cfc:L351-L355 and five in consumer 2 at
 * model/service/SkuService.cfc:L318-L322.
 *
 * TODO(parity): THE WEIGHT NEVER REACHES THE EMITTED PREDICATE. Its complete set of references in
 * the legacy file is the declaration at org/Hibachi/HibachiSmartList.cfc:L20, the assignment at
 * org/Hibachi/HibachiSmartList.cfc:L488, a presence count at org/Hibachi/HibachiSmartList.cfc:L672,
 * a key-only iteration at org/Hibachi/HibachiSmartList.cfc:L685 and a copy into the serialised
 * state at org/Hibachi/HibachiSmartList.cfc:L1073. The predicate written at
 * org/Hibachi/HibachiSmartList.cfc:L687 is a plain pattern test with no weighting whatsoever, so
 * the stored number has no effect on which rows match or on the order they arrive in. It is carried
 * because it is part of the observable argument list, and because all ten in-scope values are equal
 * the omission is invisible in this slice.
 *
 * ⛔ No relevance-scoring formula, no weight range and no alternative default is invented on the
 * back of this member (AAP §0.7.3 standard 9). Implementing scoring would ADD behavior the legacy
 * does not have, which AAP §0.8.2 Guideline 4 forbids just as firmly as removing behavior it does
 * have.
 */
export interface SmartListKeywordProperty {
  /**
   * The logical property path to search. First parameter at org/Hibachi/HibachiSmartList.cfc:L485.
   * Observed values span plain, one-hop and two-hop paths — see
   * model/service/SkuService.cfc:L318-L322.
   */
  readonly propertyIdentifier: SmartListPropertyIdentifier;

  /**
   * Relative weight. Second parameter at org/Hibachi/HibachiSmartList.cfc:L485; required, and one
   * at every in-scope call site.
   */
  readonly weight: number;
}

/**
 * Sort direction.
 *
 * Both members are source-declared rather than chosen: the legacy parses a direction off the end of
 * a single order statement using the delimiter at org/Hibachi/HibachiSmartList.cfc:L34, starts from
 * the ascending value at org/Hibachi/HibachiSmartList.cfc:L475 and switches to the descending value
 * only when the trailing element matches its short-or-long spelling at
 * org/Hibachi/HibachiSmartList.cfc:L476.
 */
export type SmartListOrderDirection = 'ASC' | 'DESC';

/**
 * One ordering term.
 *
 * D-F applied: the legacy accepts a single packed statement such as the ascending sort-order string
 * used at model/entity/Product.cfc:L257 and model/entity/Product.cfc:L345, splits the direction off
 * it at org/Hibachi/HibachiSmartList.cfc:L474-L478, and stores the two halves as a pair at
 * org/Hibachi/HibachiSmartList.cfc:L481. This type is that pair, stated up front instead of packed
 * into a string and re-split. Ordering position is carried by array position, matching the order in
 * which the legacy appends terms at org/Hibachi/HibachiSmartList.cfc:L481 and emits them at
 * org/Hibachi/HibachiSmartList.cfc:L725-L727.
 *
 * `direction` is REQUIRED because the legacy pair always carries one — the parse resolves to
 * ascending or descending and never to nothing (org/Hibachi/HibachiSmartList.cfc:L475-L478) — and
 * because both in-scope call sites state it explicitly. ⛔ NO DEFAULT SORT IS DECLARED HERE.
 *
 * S8 — MISMATCH FLAGGED RATHER THAN RESOLVED: when a query carries no ordering terms at all, the
 * legacy applies a FALLBACK order at org/Hibachi/HibachiSmartList.cfc:L729-L741, choosing a
 * metadata-declared order property, else the created-date property when the entity has one, else
 * the primary identifier, always ascending (org/Hibachi/HibachiSmartList.cfc:L741). That resolution
 * needs entity metadata, which the adapter owns and this port does not see, so the fallback is the
 * adapter's responsibility and is recorded here so it cannot be lost. Declaring a default in this
 * interface instead would be inventing one (AAP §0.7.3 standard 9), and would be wrong as well as
 * invented, since the legacy choice varies by entity. Note also that the fallback is suppressed
 * whenever a projection is present (org/Hibachi/HibachiSmartList.cfc:L729) — a condition that
 * cannot arise through this port, because projection is omitted.
 *
 * TODO(parity): the legacy accumulator declares a position argument at
 * org/Hibachi/HibachiSmartList.cfc:L473 and never reads it — terms are always appended at the end
 * (org/Hibachi/HibachiSmartList.cfc:L481). No insert-at-position capability is therefore offered
 * here; adding one would be new behavior.
 */
export interface SmartListOrder {
  /** The logical property path to sort by. Parsed from the statement at
   * org/Hibachi/HibachiSmartList.cfc:L474. */
  readonly propertyIdentifier: SmartListPropertyIdentifier;

  /** Sort direction, resolved at org/Hibachi/HibachiSmartList.cfc:L475-L478. */
  readonly direction: SmartListOrderDirection;
}

/**
 * Offset pagination.
 *
 * The legacy holds these as three separate top-level properties — the first record to display at
 * org/Hibachi/HibachiSmartList.cfc:L23, the number of records to display at
 * org/Hibachi/HibachiSmartList.cfc:L24 and the requested page at
 * org/Hibachi/HibachiSmartList.cfc:L26. Grouping them here is a presentational idiom change only;
 * the three values and their meanings are unchanged. Paging is applied as an offset and a
 * maximum-results pair at org/Hibachi/HibachiSmartList.cfc:L762.
 *
 * ⛔ NO DEFAULT PAGE SIZE, MAXIMUM PAGE SIZE OR RESULT CAP IS DECLARED. Every member is optional and
 * nothing is filled in. The property declaration at org/Hibachi/HibachiSmartList.cfc:L24 carries no
 * initial value of its own; the initial values live on the setup member at
 * org/Hibachi/HibachiSmartList.cfc:L39, which declares a first record of one and a page size of
 * ten, and are applied at org/Hibachi/HibachiSmartList.cfc:L65-L66. Those two figures are recorded
 * here as source-declared observations with their locator and are deliberately NOT restated as
 * defaults of this interface — resolving absent pagination is the adapter's job, exactly as it is
 * the setup member's job in the legacy (AAP §0.7.3 standard 9).
 *
 * S8 — CONTEXT FLAGGED, NOT CLAIMED: AAP §0.6.6 mismatch M2 records that the feed's render budget
 * of 360 seconds, declared at integrationServices/google/views/feed/product.cfm:L9, far exceeds the
 * roughly 29-second synchronous integration budget of a request-response gateway. The feed consumes
 * the FULL record set rather than a page — integrationServices/google/views/feed/product.cfm:L16
 * iterates the complete records collection — so pagination is not what bounds it. M2 is allocated
 * to the feed handler and is cited here only so the connection is visible; ⛔ no pagination default
 * is introduced in response to it, because that would be inventing a capacity figure the source
 * does not state (IR-12).
 */
export interface SmartListPagination {
  /**
   * One-based index of the first record on the page. Declared at
   * org/Hibachi/HibachiSmartList.cfc:L23; converted to a zero-based offset at
   * org/Hibachi/HibachiSmartList.cfc:L762.
   */
  readonly pageRecordsStart?: number;

  /**
   * Number of records per page. Declared at org/Hibachi/HibachiSmartList.cfc:L24 and used as the
   * maximum-results bound at org/Hibachi/HibachiSmartList.cfc:L762.
   */
  readonly pageRecordsShow?: number;

  /**
   * The requested page.
   *
   * ⭐ TODO(parity): THIS IS DECLARED AS A STRING, NOT A NUMBER, at
   * org/Hibachi/HibachiSmartList.cfc:L26, and the string typing is carried deliberately. The legacy
   * treats the value loosely: it seeds it with the number one at
   * org/Hibachi/HibachiSmartList.cfc:L56, assigns it from a numerically validated caller value at
   * org/Hibachi/HibachiSmartList.cfc:L131-L132, then compares and multiplies with it at
   * org/Hibachi/HibachiSmartList.cfc:L793-L794. Typing this member numerically would narrow the
   * page-declaration syntax the legacy accepts, so the declared width is preserved and the adapter
   * coerces at precisely the point org/Hibachi/HibachiSmartList.cfc:L793-L794 does.
   */
  readonly currentPageDeclaration?: string;
}

/**
 * A complete, immutable description of one query — the eight capability groups AAP §0.4.1.6 and
 * §0.4.1.7 name (filter, like filter, in filter, range, keyword, related-property join, ordering
 * and pagination), plus the base entity and the distinct flag that the source ties to them.
 *
 * See translation decision D-A for why this is a data description rather than a mutable builder,
 * and for the correspondence with the legacy's own serialised state at
 * org/Hibachi/HibachiSmartList.cfc:L1064-L1078.
 */
export interface SmartListQuery {
  /**
   * The ORM logical entity name being queried — `SlatwallProduct` for consumer 1
   * (model/service/ProductService.cfc:L343) and `SlatwallSku` for consumer 2
   * (model/service/SkuService.cfc:L310). First parameter of the setup member at
   * org/Hibachi/HibachiSmartList.cfc:L39; see Q3 on `SmartListJoin` for why these names are correct
   * as written. This is also what tells the adapter which row mapper produces the result element
   * type, exactly as it tells the legacy which entity its record collection contains.
   */
  readonly entityName: string;

  /**
   * Related-property joins, in application order. Accumulated one at a time by the member at
   * org/Hibachi/HibachiSmartList.cfc:L212. Twenty-one join registrations occur across the slice, so
   * this is the most heavily exercised group of the eight.
   */
  readonly joins?: readonly SmartListJoin[];

  /**
   * Where groups, disjoined with one another and conjoined within — see `SmartListWhereGroup`.
   * Array position carries the legacy's one-based group number. Declared at
   * org/Hibachi/HibachiSmartList.cfc:L14.
   */
  readonly whereGroups?: readonly SmartListWhereGroup[];

  /**
   * Search terms. Declared at org/Hibachi/HibachiSmartList.cfc:L18 and derived by the caller-input
   * interpreter, which splits a search string on spaces and two encoded space forms at
   * org/Hibachi/HibachiSmartList.cfc:L145-L151. Each term is matched as a pattern against every
   * registered keyword property (org/Hibachi/HibachiSmartList.cfc:L681-L691) and is bound as a
   * parameter wrapped in wildcards at org/Hibachi/HibachiSmartList.cfc:L683.
   */
  readonly keywords?: readonly string[];

  /**
   * The properties search terms are matched against. Declared at
   * org/Hibachi/HibachiSmartList.cfc:L20. Searching requires BOTH this collection and `keywords` to
   * be non-empty — the guard at org/Hibachi/HibachiSmartList.cfc:L672 — so registering properties
   * without supplying terms filters nothing, which is exactly the state consumers 1 and 2 leave
   * behind when their smart list is returned unsearched.
   */
  readonly keywordProperties?: readonly SmartListKeywordProperty[];

  /** Ordering terms, in application order. Declared at org/Hibachi/HibachiSmartList.cfc:L16. */
  readonly orders?: readonly SmartListOrder[];

  /** Offset pagination. See `SmartListPagination`. */
  readonly pagination?: SmartListPagination;

  /**
   * Whether duplicate rows are collapsed.
   *
   * Declared at org/Hibachi/HibachiSmartList.cfc:L12, seeded false at
   * org/Hibachi/HibachiSmartList.cfc:L59, emitted as a distinct qualifier at
   * org/Hibachi/HibachiSmartList.cfc:L518 (and at org/Hibachi/HibachiSmartList.cfc:L508 on the
   * projection path this port omits), and carried in the serialised state at
   * org/Hibachi/HibachiSmartList.cfc:L1076. Two in-scope call sites set it —
   * model/entity/Product.cfc:L255 and model/entity/Product.cfc:L342 — both to collapse duplicates
   * arising from filtering across a to-many relationship.
   *
   * The flag is neither forced on nor forced off by this interface: absent means the seeded false
   * of org/Hibachi/HibachiSmartList.cfc:L59. Typed as a boolean because the legacy call sites are
   * inconsistent about it, passing the number one at model/entity/Product.cfc:L255 and
   * model/entity/Product.cfc:L342 but a true boolean at model/entity/Product.cfc:L504 — a widening
   * TypeScript resolves once, in the only place it can.
   *
   * ⛔ This is NOT the distinct obligation recorded as T4 in AAP §0.6.1.3. That one governs the
   * option-to-SKU resolution query and belongs to `src/ports/repositories/SkuRepository.ts`; this
   * member is the general smart-list flag and claims nothing about it.
   */
  readonly selectDistinctFlag?: boolean;
}

/**
 * The caller-supplied query input — the typed counterpart of the legacy untyped data structure that
 * every smart-list member accepts as its first argument.
 *
 * ⭐ THIS NAME IS A CONTRACT. Four AAP-declared signatures reference it: `getProductSmartList` and
 * `getSkuSmartList` in AAP §0.4.2.1 and §0.4.2.2, and `getOptionSmartList` and
 * `getOptionGroupSmartList` in AAP §0.4.2.5.
 *
 * WHAT THIS SHAPE IS. The legacy argument is an untyped structure, and its interpreter at
 * org/Hibachi/HibachiSmartList.cfc:L85-L166 gives it a real grammar: a flat map whose KEY PREFIX
 * selects an operation, using the key delimiter declared at org/Hibachi/HibachiSmartList.cfc:L37.
 * Modelling that grammar with prefix-patterned keys keeps the shape typed — AAP §0.7.3 standard 1
 * rules out an unconstrained value type — while still accepting exactly the keys the legacy
 * accepts. Only simple values are ever processed: the interpreter's own guard at
 * org/Hibachi/HibachiSmartList.cfc:L99 skips every non-simple entry.
 *
 * The prefixes, each with the operation it selects:
 *   - a filter prefix — org/Hibachi/HibachiSmartList.cfc:L100-L101 — adds an equality filter.
 *   - a filter-removal prefix — org/Hibachi/HibachiSmartList.cfc:L102-L103 — removes one, and is
 *     acted on only when the value reads as true.
 *   - an in-filter prefix and its removal counterpart —
 *     org/Hibachi/HibachiSmartList.cfc:L104-L107.
 *   - a like-filter prefix and its removal counterpart —
 *     org/Hibachi/HibachiSmartList.cfc:L108-L115; the adding form wraps each element of a
 *     multi-value entry in wildcards at org/Hibachi/HibachiSmartList.cfc:L111.
 *   - a range prefix — org/Hibachi/HibachiSmartList.cfc:L116-L117 — subject to the well-formedness
 *     test recorded on `SmartListRange`.
 *
 * TODO(parity): an UNRECOGNISED key is silently ignored — the interpreter's chain at
 * org/Hibachi/HibachiSmartList.cfc:L100-L133 simply falls through with no error. This shape names
 * the keys the legacy acts on, so a caller assembling input in TypeScript learns at compile time
 * what would otherwise have been discarded at run time; the adapter still ignores rather than
 * rejects anything that does reach it.
 *
 * ⭐ Q6 — DISCREPANCY 1, RECORDED RATHER THAN MADE SILENTLY (TR-1). The companion argument of both
 * consumer signatures, `currentURL`, is declared with NO TYPE AT ALL — at
 * model/service/ProductService.cfc:L342 and again at model/service/SkuService.cfc:L309, in each
 * case beside a data argument that IS typed. AAP §0.4.2.1 tightens it to an optional string, and
 * that tightening is recorded here as TR-1 requires. It stays a SEPARATE optional parameter of the
 * service members rather than becoming a member of this shape, matching the AAP-declared
 * signatures; the legacy likewise keeps it a separate setup argument
 * (org/Hibachi/HibachiSmartList.cfc:L39) used only for link building. Both consumers are also
 * called with NO arguments at all — see integrationServices/google/controllers/feed.cfc:L63 — which
 * is why every member here is optional and why both service parameters are optional.
 *
 * ⭐ Q7 — the two consumers obtain their smart list from DIFFERENT providers: consumer 1 through the
 * shared data-access object at model/service/ProductService.cfc:L345, consumer 2 through the SKU
 * data-access object at model/service/SkuService.cfc:L312. The abstraction returned is the same in
 * both cases, so this remains ONE port with one input type; the difference is in who constructs the
 * query, not in what a query is.
 */
export interface SmartListInput {
  /**
   * Restores a previously saved query state. Handled first, ahead of the prefix scan, at
   * org/Hibachi/HibachiSmartList.cfc:L93-L95.
   */
  readonly savedStateID?: string;

  /**
   * A search string. Aliased onto the plural form at org/Hibachi/HibachiSmartList.cfc:L137-L138, so
   * the two members are interchangeable and the singular is a convenience spelling.
   */
  readonly keyword?: string;

  /**
   * A search string, split into terms at org/Hibachi/HibachiSmartList.cfc:L145-L151. Searching also
   * requires registered keyword properties — the guard at org/Hibachi/HibachiSmartList.cfc:L672.
   */
  readonly keywords?: string;

  /**
   * Ordering terms as one delimited statement, read at org/Hibachi/HibachiSmartList.cfc:L118-L122
   * using the property delimiter at org/Hibachi/HibachiSmartList.cfc:L35 and the direction
   * delimiter at org/Hibachi/HibachiSmartList.cfc:L34. The member name matches the legacy key
   * exactly.
   *
   * TODO(parity): the interpreter clears the accumulated ordering terms INSIDE its own loop, at
   * org/Hibachi/HibachiSmartList.cfc:L120, so a multi-term statement retains only its final term
   * and ordering registered earlier is discarded as well. Carried, not repaired.
   */
  readonly OrderBy?: string;

  /**
   * Page size. Read at org/Hibachi/HibachiSmartList.cfc:L123-L128. The literal string `ALL` is
   * accepted and maps to the very large page size written at org/Hibachi/HibachiSmartList.cfc:L125;
   * otherwise the value is taken only when numeric, greater than zero and within the bound tested
   * at org/Hibachi/HibachiSmartList.cfc:L126. Values failing those tests are silently ignored.
   */
  readonly 'P:Show'?: string | number;

  /**
   * First record to display. Read, and bounds-tested, at
   * org/Hibachi/HibachiSmartList.cfc:L129-L130.
   */
  readonly 'P:Start'?: string | number;

  /**
   * Requested page. Read, and bounds-tested, at org/Hibachi/HibachiSmartList.cfc:L131-L132. See the
   * string-typing note on `SmartListPagination` for why this is not narrowed to a number.
   */
  readonly 'P:Current'?: string | number;

  /** Adds an equality filter on the named property — org/Hibachi/HibachiSmartList.cfc:L100-L101. */
  readonly [filterKey: `F:${string}`]: SmartListFilterValue;

  /** Removes an equality filter when true — org/Hibachi/HibachiSmartList.cfc:L102-L103. */
  readonly [filterRemovalKey: `FR:${string}`]: SmartListFilterValue;

  /** Adds a set-membership filter — org/Hibachi/HibachiSmartList.cfc:L104-L105. */
  readonly [inFilterKey: `FI:${string}`]: SmartListFilterValue;

  /** Removes a set-membership filter when true — org/Hibachi/HibachiSmartList.cfc:L106-L107. */
  readonly [inFilterRemovalKey: `FIR:${string}`]: SmartListFilterValue;

  /** Adds a pattern filter, wildcard-wrapped — org/Hibachi/HibachiSmartList.cfc:L108-L113. */
  readonly [likeFilterKey: `FK:${string}`]: SmartListFilterValue;

  /** Removes a pattern filter when true — org/Hibachi/HibachiSmartList.cfc:L114-L115. */
  readonly [likeFilterRemovalKey: `FKR:${string}`]: SmartListFilterValue;

  /** Adds a range filter — org/Hibachi/HibachiSmartList.cfc:L116-L117. */
  readonly [rangeKey: `R:${string}`]: SmartListFilterValue;
}

/**
 * The materialised outcome of one query.
 *
 * ⭐ THIS NAME IS A CONTRACT, AND IT IS GENERIC ON PURPOSE. The same four AAP-declared signatures
 * listed on `SmartListInput` instantiate it at four different element types — product, SKU, option
 * and option group. Keeping the element type a parameter is what allows this file to import
 * nothing:
 * were a domain entity referenced here, the port would depend on the domain layer it sits beneath
 * (AAP §0.7.3 standard 4), and the generic parameter would be doing no work.
 *
 * WHY BOTH COLLECTIONS ARE PRESENT. The legacy exposes two distinct reads, and the slice uses both.
 * The unpaged collection is produced at org/Hibachi/HibachiSmartList.cfc:L751 and is what the
 * Google feed iterates at integrationServices/google/views/feed/product.cfm:L16, as well as what
 * the two synthesized call sites read at model/entity/Product.cfc:L258 and
 * model/entity/Product.cfc:L346. The paged slice is produced at
 * org/Hibachi/HibachiSmartList.cfc:L759 and is the subject of the traceable legacy regression AAP
 * §0.6.5.1 records as covering page-record distinctness in the product smart list. Collapsing the
 * two would make that regression unwritable.
 *
 * Every member below corresponds to one legacy read, so the shape adds nothing of its own.
 */
export interface SmartListResult<T> {
  /**
   * All matching records, unpaged. Produced at org/Hibachi/HibachiSmartList.cfc:L751-L755.
   *
   * Indexing this collection yields a possibly-undefined element under
   * `noUncheckedIndexedAccess`, which is deliberate: it forces a caller reasoning about
   * "exactly one row" to prove it rather than assume it.
   */
  readonly records: readonly T[];

  /**
   * The current page of records. Produced at org/Hibachi/HibachiSmartList.cfc:L759-L764, using the
   * offset and maximum-results pair assembled at org/Hibachi/HibachiSmartList.cfc:L762.
   */
  readonly pageRecords: readonly T[];

  /**
   * Total number of matching records, independent of paging. Produced at
   * org/Hibachi/HibachiSmartList.cfc:L771, which counts distinct primary identifiers through the
   * dedicated counting statement assembled at org/Hibachi/HibachiSmartList.cfc:L777-L778 rather
   * than by materialising the rows.
   */
  readonly recordsCount: number;

  /**
   * One-based index of the first record on the current page. Produced at
   * org/Hibachi/HibachiSmartList.cfc:L792, which derives it from the requested page and the page
   * size at org/Hibachi/HibachiSmartList.cfc:L793-L794.
   */
  readonly pageRecordsStart: number;

  /**
   * One-based index of the last record on the current page. Produced at
   * org/Hibachi/HibachiSmartList.cfc:L800 and clamped to the total count at
   * org/Hibachi/HibachiSmartList.cfc:L802-L803, so a short final page reports its real end.
   */
  readonly pageRecordsEnd: number;

  /** The current page number. Produced at org/Hibachi/HibachiSmartList.cfc:L808-L809. */
  readonly currentPage: number;

  /** The total number of pages. Produced at org/Hibachi/HibachiSmartList.cfc:L812-L813. */
  readonly totalPages: number;
}

/**
 * The port: run a described query and return its materialised outcome.
 *
 * ONE MEMBER, DELIBERATELY. The legacy component declares thirty-three public members across 1,090
 * lines, from the setup member at org/Hibachi/HibachiSmartList.cfc:L39 to the cache-name member at
 * org/Hibachi/HibachiSmartList.cfc:L1081. Almost all of them exist to ACCUMULATE state or to READ
 * IT BACK, and both roles disappear once the query is a value: accumulation becomes constructing a
 * `SmartListQuery`, and reading back becomes inspecting the one you constructed. What remains that
 * only an implementation can do is execute the query, so that is the whole interface.
 *
 * This is also why the surface is kept this small in practice, per AAP §0.7.3 standard 6: the
 * legacy repository contains NO MOCKING LIBRARY AT ALL, so `test/support/inMemoryRepositories.ts`
 * must implement every port by hand. AAP §0.4.3.6 calls that "the single largest structural
 * difference between the two suites" — legacy tests boot the whole framework and are integration
 * tests, whereas the target tests construct classes directly against hand-written doubles and are
 * unit tests. Every member declared here is a member several test files must stub, so each one has
 * to earn its place from an actual call site. A single-member interface is satisfiable by a plain
 * object literal, and the two shapes those doubles must be able to express — the feed's open-ended
 * lower-bound range and its left-joined brand — are both plain data in `SmartListQuery`. Coverage
 * for all of this is NET-NEW: AAP §0.6.5.2 confirms no legacy test exists for the product service,
 * the SKU service or the SKU data-access object.
 *
 * ⛔ NO CLASS, NO ABSTRACT BASE, NO CONSTRUCTOR, AND NO SHARED GENERIC BASE ACROSS THE FOLDER. The
 * implementation is `src/adapters/mysql/SmartListQueryBuilder.ts`, which AAP §0.3.3 describes as
 * the query builder that replaces "HibachiSmartList dynamic paginated HQL composition", operating
 * "behind SmartListQueryPort". It is injected into its consumers as a constructor parameter, per
 * AAP §0.7.3 standard 3 — never resolved by name at run time, which is the string-keyed lookup this
 * port exists to retire (import rules R1 and R2).
 *
 * IR-1 — THE SYNTHESIZED MEMBERS THAT DEPEND ON THIS FILE. `onMissingMethod` at
 * org/Hibachi/HibachiService.cfc:L255 fabricated smart-list members by prefix, dispatching on the
 * suffix at org/Hibachi/HibachiService.cfc:L259-L260, which is why calls resolve at run time
 * without appearing in the source at all. Two such call sites are real:
 * model/entity/Product.cfc:L254 and model/entity/Product.cfc:L341. AAP §0.4.2.5 declares them
 * explicitly on `services/OptionService.ts` — not here — but they are typed in terms of
 * `SmartListInput` and `SmartListResult<T>`, which is exactly why those two names had to be defined
 * in this file under exactly those spellings. Their arguments are POSITIONAL: the docblock at
 * org/Hibachi/HibachiService.cfc:L253 states "Ordered arguments only--named arguments not
 * supported", so no synthesized smart-list member may be modelled as taking a named-argument
 * structure.
 */
export interface SmartListQueryPort {
  /**
   * Executes a described query.
   *
   * The element type is supplied by the CALLER and satisfied by the adapter, which selects its row
   * mapper from `query.entityName` — the same thing the legacy entity name does at
   * org/Hibachi/HibachiSmartList.cfc:L39, where it determines what the resulting record collection
   * contains. Making the parameter belong to the method rather than to the interface means one
   * injected adapter instance serves every entity in the slice, which is what the composition root
   * wires.
   *
   * Asynchronous because execution is real database work — the legacy runs it at
   * org/Hibachi/HibachiSmartList.cfc:L753 for the unpaged collection and at
   * org/Hibachi/HibachiSmartList.cfc:L762 for the paged slice. See translation decision D-B for why
   * this port is asynchronous while `SettingResolverPort` is not.
   *
   * @typeParam T - The element type of the returned collections, chosen by the caller.
   * @param query - The complete, immutable description of the query to run.
   * @returns The unpaged records, the current page, and the count and paging figures derived from
   *          them.
   */
  execute<T>(query: SmartListQuery): Promise<SmartListResult<T>>;
}
