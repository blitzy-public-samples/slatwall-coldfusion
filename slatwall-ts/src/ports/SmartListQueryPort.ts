/**
 * SmartListQueryPort — the paginated dynamic-query abstraction the ported SmartList members and the
 * Google product-feed controller depend on.
 *
 * Legacy origin:
 *   org/Hibachi/HibachiSmartList.cfc — the framework's dynamic paginated HQL composition. Per AAP
 *     §0.8.3.2 the `org/Hibachi/**` tree is "a boundary to extract from, never modify": its CONTRACT
 *     is read here and none of its implementation is carried over. Every declaration this file
 *     mirrors is cited by line so the mapping is checkable.
 *   model/service/ProductService.cfc:L342 — `getProductSmartList`, consumer 1.
 *   model/service/SkuService.cfc:L309 — `getSkuSmartList`, consumer 2.
 *   integrationServices/google/controllers/feed.cfc:L58 — `product(rc)`, consumer 3.
 *   model/entity/Product.cfc:L251-L261 and model/entity/Product.cfc:L340-L347 — the two
 *     runtime-synthesized SmartList call sites (IR-1).
 *   org/Hibachi/HibachiService.cfc:L255 — `onMissingMethod`, which fabricated the `get*SmartList`
 *     members by prefix and is why they must now be declared explicitly (IR-1).
 *
 * WHY THIS IS A BOUNDARY PORT RATHER THAN SOMETHING THE FEED RESOLVES ITSELF. The feed's
 * availability gate is `addRange('product.calculatedQATS','1^')` at
 * integrationServices/google/controllers/feed.cfc:L72, which reads a calculated inventory property
 * (AAP §0.6.4.1). Inventory and stock are excluded from the slice (AAP §0.2.2.1), so the port is
 * what lets the feed express that gate without converting the inventory subsystem (TR-5). It is also
 * the mechanism behind AAP §0.8.3.8 strangler-fig independence.
 *
 * THIS FILE IS THE SHARED TYPE HOME FOR src/ports/. `SmartListInput` and `SmartListResult<T>` are
 * named in four AAP-declared service signatures (§0.4.2.1 `getProductSmartList`, §0.4.2.2
 * `getSkuSmartList`, §0.4.2.5 `getOptionSmartList` and `getOptionGroupSmartList`), and they are
 * defined HERE because AAP §0.4.3.5 forbids path aliases and a barrel and the folder inventory of
 * AAP §0.4.1.6 admits no shared types module. The two export names are therefore a contract, not a
 * preference: renaming either breaks those four signatures.
 *
 * LAYER POSITION. This is a port, so it sits beneath `domain`, `adapters`, `services`, `handlers`,
 * `integrations`, `validation` and `config` (AAP §0.7.3 standard 4). It imports NOTHING — not a
 * package, not a Node builtin, not a sibling module. `SmartListResult<T>` is generic precisely so
 * no domain entity has to be imported; if an import ever appears here, the generic parameter is
 * being bypassed. `src/adapters/mysql/SmartListQueryBuilder.ts` IMPLEMENTS this interface, so
 * importing it would invert the dependency.
 *
 * ⭐ THIS FILE IS DECLARATIONS PLUS ONE `const` WHITELIST AND THE TYPE GUARD THAT READS IT — NOTHING
 * ELSE. Every type and interface below is erased at compile time, so a consumer that needs only shapes
 * says `import type` and pays nothing. Exactly two runtime declarations remain, and they are the two
 * this file's contract sanctions ("a `const` union or type guard is fine; a working function body is
 * not"): the frozen whitelist {@link SMARTLIST_ENTITY_SCHEMA} and the guard
 * {@link resolveSmartListPropertyIdentifier} that narrows a caller-supplied string against it. They
 * are inseparable from the branded {@link ResolvedSmartListProperty} declared here, and the full
 * reconciliation — including why relocating them would DESTROY the brand's unforgeability rather than
 * merely move it — is recorded at the whitelist's declaration below.
 *
 * ⛔ THE FW/1 `rc` GRAMMAR AND THE RANGE GRAMMAR ARE NOT HERE. Both were once declared in this file;
 * both are working function bodies, so both now live in the caller-struct translation section of `src/ports/SmartListQueryPort.ts`, which imports
 * this module for its shapes and for the guard. Nothing about either grammar changed in the move, and
 * the relocation record sits in that module's header. Consumers import `translateSmartListInput` from
 * there — `src/services/ProductService.ts`, `src/services/SkuService.ts` and
 * `src/services/OptionService.ts` do — and this file emits no callable code of its own beyond the
 * guard.
 *
 * NO USER-SPECIFIED RULES GOVERN THIS FILE. AAP §0.7.1 records that verdict, and no ancillary
 * rule-bearing file exists anywhere in the repository. The rules tool's own output is deliberately
 * not transcribed here: AAP §0.7.5 makes the rules document the authority and directs a reader to
 * page through it rather than trust an in-source summary, which can go stale against it.
 * Per UR4 that is not permission to lower the bar: the nine binding
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
 * THE RAW-CONDITION MEMBER AT org/Hibachi/HibachiSmartList.cfc:L358 IS DELIBERATELY ABSENT.
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
 * Also deliberately absent, each with its reason:
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

import type { Option, OptionPropertyName } from '../domain/option/Option';
import type { OptionGroup, OptionGroupPropertyName } from '../domain/option/OptionGroup';
import type { Brand, BrandPropertyName } from '../domain/product/Brand';
import type { Product, ProductPropertyName } from '../domain/product/Product';
import type { ProductType, ProductTypePropertyName } from '../domain/product/ProductType';
import type { Sku, SkuPropertyName } from '../domain/sku/Sku';

/**
 * The sub-entity path delimiter, declared at org/Hibachi/HibachiSmartList.cfc:L32.
 *
 * A literal `'.'`, held as a named constant so the one place that splits a path and the prose that
 * cites its locator cannot drift apart.
 */
const SMARTLIST_SUB_ENTITY_DELIMITER = '.';

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
 *
 * ==============================================================================================
 * ⭐ DECISION S-1 — THIS TYPE IS CLOSED, AND THE PREVIOUS `string` WAS A CONTRACT DEFECT (SEC-09)
 * ==============================================================================================
 * This alias was `string`. The prose above already obliged the adapter to "resolve these paths from
 * a validated whitelist and never by interpolation" — but prose is not a contract, and the type
 * admitted every string there is. A caller-supplied smart-list key reaches this field verbatim:
 * `applyInputEntry` in both consuming services copies the suffix of an `F:` / `FI:` / `FK:` / `R:`
 * key straight into `propertyIdentifier`, so a request bearing `F:skuID) OR 1=1 --` produced a
 * {@link SmartListFilter} whose identifier was exactly `skuID) OR 1=1 --`, and nothing between the
 * request and the adapter's identifier position was type-obliged to stop it. Because a `?`
 * placeholder binds values only and can never substitute an identifier (AAP transformation rule
 * TR-4 / import rule R4), the adapter has no parameterised escape available for this field. The
 * whitelist therefore has to exist ABOVE the adapter, in the contract, which is what follows.
 *
 * ⭐ THE CLOSURE IS ALSO THE MORE FAITHFUL PORT, WHICH IS WHY IT IS NOT A BEHAVIOUR CHANGE. Read the
 * `TODO(parity)` note above again: the legacy resolves every path through `getAliasedProperty` at
 * org/Hibachi/HibachiSmartList.cfc:L308 and SILENTLY DISCARDS anything that does not resolve to a
 * real property of a real entity. `skuID) OR 1=1 --` is not a property of `SlatwallSku`, so the
 * legacy dropped it. The open `string` was the divergence: it accumulated entries CFML would have
 * thrown away. Closing the type and discarding unresolvable paths restores the legacy behaviour
 * exactly, and closes the injection contract as a consequence rather than as a trade.
 *
 * ⭐ WHY BOTH A LITERAL UNION AND A BRANDED RESOLUTION. Two kinds of caller exist and they need
 * different guarantees:
 *   - Hard-coded identifiers, such as the five keyword properties at
 *     model/service/SkuService.cfc:L317-L321. These are literals known at compile time, so they get
 *     {@link SmartListPropertyPath} — a real union, in which a typo is a build error.
 *   - Caller-supplied identifiers arriving as request keys. No type can know at compile time that a
 *     runtime string is a member of a union, so these go through
 *     {@link resolveSmartListPropertyIdentifier}, the ONLY function that can mint a
 *     {@link ResolvedSmartListProperty}. It validates against {@link SMARTLIST_ENTITY_SCHEMA} and
 *     returns `undefined` for anything unresolvable, which the consumer then drops.
 * Every inhabitant of this type is therefore either compile-verified or runtime-verified. There is
 * no third way to obtain one, and an arbitrary `string` is not assignable to it.
 *
 * ⭐ THE DEPTH ASYMMETRY IS DELIBERATE AND IS NOT A BOUND ON BEHAVIOUR. The literal union is
 * generated to {@link SMARTLIST_MAX_TYPED_PATH_SEGMENTS} segments, which is the longest path the
 * slice actually writes — `options.skus.product.productID` at model/entity/Product.cfc:L256, four
 * segments, the three-hop case AAP §0.4.1.6 records. The RUNTIME resolver walks the schema with NO
 * depth limit at all, so a longer caller-supplied path is still resolved on its merits. No maximum
 * join depth is declared anywhere here, per AAP §0.7.3 standard 9 and IR-12; the type's depth is a
 * compile-time convenience for literals, not a policy number, and nothing observable turns on it.
 */
export type SmartListPropertyIdentifier<TEntity extends SmartListEntityName = SmartListEntityName> =
  SmartListPropertyPath<TEntity> | ResolvedSmartListProperty<TEntity>;

/* ==============================================================================================
 * SEC-09 — THE ENTITY SCHEMA THE CLOSED IDENTIFIERS ARE DERIVED FROM
 *
 * ⛔ NOTHING IN THIS BLOCK IS INVENTED. Every own-property name is the corresponding
 * `…PropertyName` union already declared in `../domain/**`, which each entity file derived from its
 * legacy `property name=` declarations; the arrays below are checked against those unions in BOTH
 * directions by the assertions that follow, so a domain union gaining or losing a member breaks this
 * build rather than silently widening or narrowing the whitelist. `SlatwallAlternateSkuCode` is the
 * one entity with no domain module of its own, and its four names are read directly from
 * model/entity/AlternateSkuCode.cfc:L52-L57.
 *
 * ⚠️ THIS PORT NOW HAS A RUNTIME FOOTPRINT, where before it was types only. That is a real change
 * and it is deliberate: the whitelist has to be one declaration, and the resolver that consults it
 * has to run. Splitting the schema into a new module would have kept this file type-only at the cost
 * of a file AAP §0.4.1.6 does not enumerate, and the port is the contract's owner in any case.
 *
 * ⚠️ THE TRAVERSAL BOUNDARY IS EXACTLY THE AAP SCOPE BOUNDARY, and that is a narrowing worth stating
 * plainly rather than leaving to be discovered. Relationships to entities AAP §0.2.2.1 excludes —
 * `subscriptionTerm`, `attributeValues`, `stocks`, `orderItems`, `skuCurrencies`, `accessContents`,
 * every `promotion*` and `priceGroup*` member, `categories`, `listingPages`, `productImages`,
 * `productReviews`, `vendors`, `physicals`, `attributeSets` — appear in the own-property arrays, so a
 * filter ON the relationship itself resolves, but they are NOT keys of
 * {@link SmartListEntityRelationships}, so a path THROUGH one does not. The legacy would have
 * resolved such a path. Enumerating those entities' property surfaces is precisely the scope creep
 * AAP §0.2.2.6 warns against, so the path is discarded instead — through the legacy's own
 * discard-the-unresolvable mechanism, applied at the scope boundary. Declining on explicit AAP
 * exclusion grounds is the one permitted reason to leave a gap, and this is that case.
 * ============================================================================================== */

/**
 * The ORM logical entity names this port's identifiers may be rooted at or traverse.
 *
 * Six are the in-scope entities of AAP §0.2.1.2. The seventh, `SlatwallAlternateSkuCode`, is here on
 * evidence rather than by choice: model/service/SkuService.cfc:L321 registers the keyword property
 * `alternateSkuCodes.alternateSkuCode` and model/service/SkuService.cfc:L316 left-joins the
 * relationship, so the slice genuinely traverses it and a schema omitting it could not type the
 * port's own consumers. Its property surface is small and fully enumerated from source, so admitting
 * it costs nothing and invents nothing.
 *
 * See Q3 on {@link SmartListJoin} for why the `Slatwall`-prefixed logical names are correct here and
 * must not be rewritten to physical `Sw*` table names.
 */
export type SmartListEntityName =
  | 'SlatwallSku'
  | 'SlatwallProduct'
  | 'SlatwallProductType'
  | 'SlatwallBrand'
  | 'SlatwallOption'
  | 'SlatwallOptionGroup'
  | 'SlatwallAlternateSkuCode';

/**
 * Each entity's own filterable property names, keyed by logical entity name.
 *
 * These are the type-level statement of the whitelist; {@link SMARTLIST_ENTITY_SCHEMA} is the
 * runtime statement of the same thing, and the two are proved equal below.
 */
export interface SmartListEntityOwnProperty {
  SlatwallSku: SkuPropertyName;
  SlatwallProduct: ProductPropertyName;
  SlatwallProductType: ProductTypePropertyName;
  SlatwallBrand: BrandPropertyName;
  SlatwallOption: OptionPropertyName;
  SlatwallOptionGroup: OptionGroupPropertyName;
  SlatwallAlternateSkuCode: AlternateSkuCodePropertyName;
}

/**
 * `SlatwallAlternateSkuCode`'s property surface, read from model/entity/AlternateSkuCode.cfc:L52-L57.
 *
 * The four audit properties at model/entity/AlternateSkuCode.cfc:L60-L63 are omitted for the same
 * reason every other entity's are: they carry `hb_populateEnabled="false"` and no in-scope caller
 * filters on them. `alternateSkuCodeType` is retained as a filterable property but is NOT a
 * traversable relationship, because `Type` is not an in-scope entity.
 */
export type AlternateSkuCodePropertyName =
  'alternateSkuCodeID' | 'alternateSkuCode' | 'alternateSkuCodeType' | 'sku';

/**
 * Each entity's TRAVERSABLE relationships, mapping the relationship property to the entity it
 * reaches.
 *
 * Read from the legacy `fieldtype="many-to-one"` and `fieldtype="one-to-many"` declarations of the
 * six in-scope entity files plus model/entity/AlternateSkuCode.cfc:L57. Only relationships whose
 * TARGET is itself in {@link SmartListEntityName} appear — see the traversal-boundary note above.
 *
 * Every path the slice writes is spanned by this map:
 *   - `product.productName`, `product.productType.productTypeName` — model/service/SkuService.cfc:L317
 *   - `alternateSkuCodes.alternateSkuCode` — model/service/SkuService.cfc:L321
 *   - `product.activeFlag`, `product.publishedFlag`, `product.calculatedQATS` —
 *     integrationServices/google/controllers/feed.cfc:L68-L72
 *   - `optionGroup.optionGroupID`, `skus.product.productID` — model/entity/Product.cfc:L343-L344
 *   - `options.skus.product.productID` — model/entity/Product.cfc:L256
 *   - `brand.brandName` — model/service/ProductService.cfc:L352
 */
export interface SmartListEntityRelationships {
  SlatwallSku: {
    product: 'SlatwallProduct';
    options: 'SlatwallOption';
    alternateSkuCodes: 'SlatwallAlternateSkuCode';
  };
  SlatwallProduct: {
    brand: 'SlatwallBrand';
    productType: 'SlatwallProductType';
    defaultSku: 'SlatwallSku';
    skus: 'SlatwallSku';
  };
  SlatwallProductType: {
    parentProductType: 'SlatwallProductType';
    childProductTypes: 'SlatwallProductType';
    products: 'SlatwallProduct';
  };
  SlatwallBrand: { products: 'SlatwallProduct' };
  SlatwallOption: { optionGroup: 'SlatwallOptionGroup'; skus: 'SlatwallSku' };
  SlatwallOptionGroup: { options: 'SlatwallOption' };
  SlatwallAlternateSkuCode: { sku: 'SlatwallSku' };
}

/**
 * The number of dot-separated segments the LITERAL path union is generated to.
 *
 * Four, because `options.skus.product.productID` at model/entity/Product.cfc:L256 is the longest
 * path the slice writes and AAP §0.4.1.6 records three hops as the observed maximum. This governs
 * the compile-time union only — {@link resolveSmartListPropertyIdentifier} imposes no depth limit,
 * so it is not a policy number and nothing observable depends on it (AAP §0.7.3 standard 9).
 */
export type SMARTLIST_MAX_TYPED_PATH_SEGMENTS = 4;

/** Recursion budget for {@link SmartListPropertyPathToDepth}; index `n` yields `n - 1`. */
type SmartListPathDepth = 0 | 1 | 2 | 3 | 4;
type SmartListDepthPredecessor = [never, 0, 1, 2, 3];

/**
 * Every legal property path on `TEntity`, generated to `TDepth` segments.
 *
 * `TEntity` appears as a naked type parameter in the conditional so the type DISTRIBUTES over a
 * union of entity names; without that, `keyof SmartListEntityRelationships[TEntity]` would collapse
 * to the intersection of every entity's relationship keys, which is empty.
 */
type SmartListPropertyPathToDepth<
  TEntity extends SmartListEntityName,
  TDepth extends SmartListPathDepth,
> = TEntity extends SmartListEntityName
  ? TDepth extends 0
    ? never
    : | SmartListEntityOwnProperty[TEntity]
      | {
          [TRelationship in keyof SmartListEntityRelationships[TEntity]]: `${TRelationship &
            string}.${SmartListPropertyPathToDepth<
            SmartListEntityRelationships[TEntity][TRelationship] & SmartListEntityName,
            SmartListDepthPredecessor[TDepth] & SmartListPathDepth
          >}`;
        }[keyof SmartListEntityRelationships[TEntity]]
  : never;

/**
 * Every legal property path on `TEntity`, as a compile-time union.
 *
 * This is what a hard-coded identifier is checked against, so `'skuCode'` and
 * `'product.productType.productTypeName'` are accepted while `'skuID) OR 1=1 --'` and any other
 * fabricated string are build errors.
 */
export type SmartListPropertyPath<TEntity extends SmartListEntityName> =
  SmartListPropertyPathToDepth<TEntity, SMARTLIST_MAX_TYPED_PATH_SEGMENTS>;

declare const RESOLVED_SMARTLIST_PROPERTY: unique symbol;

/**
 * A property path that has been validated at runtime against {@link SMARTLIST_ENTITY_SCHEMA}.
 *
 * ⛔ THE BRAND IS UNFORGEABLE BY CONSTRUCTION. `RESOLVED_SMARTLIST_PROPERTY` is a module-private
 * `unique symbol` that is declared and never exported, so no code outside this file can write an
 * object literal bearing it and no `string` is assignable to this type. The only value of this type
 * that can ever exist is one {@link resolveSmartListPropertyIdentifier} returned. That is the whole
 * mechanism: a caller who wants to use request input as an identifier has no route to it except
 * through validation.
 */
export type ResolvedSmartListProperty<TEntity extends SmartListEntityName> = string & {
  readonly [RESOLVED_SMARTLIST_PROPERTY]: TEntity;
};

/** One entity's runtime whitelist: its own filterable names, and its traversable relationships. */
interface SmartListEntitySchemaEntry {
  readonly ownProperties: readonly string[];
  readonly relationships: Readonly<Record<string, SmartListEntityName | undefined>>;
}

/* ================================================================================================
 * ⭐ THE ONE RUNTIME PAIR THIS PORT RETAINS — THE RECONCILIATION, STATED ONCE
 * ================================================================================================
 *
 * THE OBLIGATION. This file's contract is a declaration-only module: "zero runtime code, zero I/O,
 * zero imports"; "ALLOWED imports: NONE"; and, in the forbidden-content table, "any executable logic
 * beyond type declarations" is refused with one sanctioned carve-out — "a `const` union or type guard
 * is fine; a working function body is not". Everything that was a working function body has been
 * relocated to the caller-struct translation section of `src/ports/SmartListQueryPort.ts`: the FW/1 `rc` data-key grammar (`translateSmartListInput`
 * and roughly twenty constants and a dozen helpers behind it) and the range grammar
 * (`translateSmartListRange`). What remains below is exactly the sanctioned pair.
 *
 * THE PAIR: `SMARTLIST_ENTITY_SCHEMA`, a frozen `const` whitelist, and
 * {@link resolveSmartListPropertyIdentifier}, the guard that narrows a caller-supplied `string` to
 * {@link ResolvedSmartListProperty}. They are one declaration in two halves, not behaviour.
 *
 * ⛔ WHY THEY CANNOT BE RELOCATED — THE BRAND WOULD NOT MOVE WITH THEM, IT WOULD BREAK.
 * `ResolvedSmartListProperty<TEntity>` is branded with `RESOLVED_SMARTLIST_PROPERTY`, a module-private
 * `unique symbol` this file declares and never exports. That single fact is the whole mechanism: no
 * `string` is assignable to the branded type, no module can write an object literal bearing the
 * symbol, and therefore the ONLY value of that type which can ever exist is one the guard below
 * returned. A caller who wants to use request input as a SQL-bound identifier has no route to it
 * except validation. Relocating the guard leaves exactly two possibilities, and both are worse than
 * the carve-out:
 *   1. EXPORT THE BRAND so a utility can mint it. The symbol then becomes reachable from every module
 *      in the subtree, any of which could cast a raw request string into the branded type. The
 *      identifier surface that AAP §0.7.3 standard 2 closes — "identifiers built only from validated
 *      whitelists" — reopens, and D18's hardening (AAP §0.6.7.7) is undone at the type level.
 *   2. MOVE THE BRANDED TYPE ITSELF. {@link SmartListPropertyIdentifier} is one arm of that brand, and
 *      it types `propertyIdentifier` on every filter, range, keyword and order shape declared here.
 *      Moving it would make this port `import` a utility, breaking "ALLOWED imports: NONE" and
 *      inverting the layering the port exists to protect.
 * Keeping the pair here is therefore not a deferral: it is the only arrangement in which the brand
 * remains unforgeable AND the port remains import-free. The relocation record in
 * the caller-struct translation section of `src/ports/SmartListQueryPort.ts` states the same conclusion from the other side, so the two cannot drift.
 *
 * WHAT THIS COSTS AND WHO PAYS IT. Two modules hold a runtime import of this file:
 * `src/adapters/mysql/SmartListQueryBuilder.ts`, which must re-validate every identifier before it
 * reaches a statement, and the caller-struct translation section of `src/ports/SmartListQueryPort.ts`, which validates each `rc` key as it
 * translates. Every other consumer — the three services, `src/integrations/google/ProductFeedQuery.ts`
 * and the handlers — imports this file with `import type` only and pays nothing at run time. The
 * emitted contribution is one frozen object literal and one pure lookup function over it: no I/O, no
 * state, no SQL, no environment read.
 * ============================================================================================== */

/**
 * The runtime whitelist {@link resolveSmartListPropertyIdentifier} consults.
 *
 * Held as arrays rather than `Set`s because every list is short and membership is tested once per
 * request key; a `Set` per entity would add allocation at module load for no measurable gain, and
 * AAP §0.7.3 standard 9 forbids claiming a performance figure either way. Frozen so a consumer
 * cannot extend the whitelist at runtime — which would defeat the entire mechanism.
 */
export const SMARTLIST_ENTITY_SCHEMA: Readonly<
  Record<SmartListEntityName, SmartListEntitySchemaEntry>
> = Object.freeze({
  SlatwallSku: Object.freeze({
    ownProperties: Object.freeze([
      'skuID',
      'activeFlag',
      'skuCode',
      'listPrice',
      'price',
      'renewalPrice',
      'imageFile',
      'userDefinedPriceFlag',
      'calculatedQATS',
      'product',
      'subscriptionTerm',
      'alternateSkuCodes',
      'attributeValues',
      'orderItems',
      'skuCurrencies',
      'stocks',
      'options',
      'accessContents',
      'subscriptionBenefits',
      'renewalSubscriptionBenefits',
      'promotionRewards',
      'promotionRewardExclusions',
      'promotionQualifiers',
      'promotionQualifierExclusions',
      'priceGroupRates',
      'physicals',
      'remoteID',
    ] as const satisfies readonly SkuPropertyName[]),
    relationships: Object.freeze({
      product: 'SlatwallProduct',
      options: 'SlatwallOption',
      alternateSkuCodes: 'SlatwallAlternateSkuCode',
    } as const),
  }),
  SlatwallProduct: Object.freeze({
    ownProperties: Object.freeze([
      'productID',
      'activeFlag',
      'urlTitle',
      'productName',
      'productCode',
      'productDescription',
      'publishedFlag',
      'sortOrder',
      'calculatedSalePrice',
      'calculatedQATS',
      'calculatedAllowBackorderFlag',
      'calculatedTitle',
      'brand',
      'productType',
      'defaultSku',
      'skus',
      'productImages',
      'attributeValues',
      'productReviews',
      'listingPages',
      'categories',
      'relatedProducts',
      'promotionRewards',
      'promotionRewardExclusions',
      'promotionQualifiers',
      'promotionQualifierExclusions',
      'priceGroupRates',
      'vendors',
      'physicals',
      'remoteID',
    ] as const satisfies readonly ProductPropertyName[]),
    relationships: Object.freeze({
      brand: 'SlatwallBrand',
      productType: 'SlatwallProductType',
      defaultSku: 'SlatwallSku',
      skus: 'SlatwallSku',
    } as const),
  }),
  SlatwallProductType: Object.freeze({
    ownProperties: Object.freeze([
      'productTypeID',
      'productTypeIDPath',
      'activeFlag',
      'publishedFlag',
      'urlTitle',
      'productTypeName',
      'productTypeDescription',
      'systemCode',
      'parentProductType',
      'childProductTypes',
      'products',
      'attributeValues',
      'promotionRewards',
      'promotionRewardExclusions',
      'promotionQualifiers',
      'promotionQualifierExclusions',
      'priceGroupRates',
      'priceGroupRateExclusions',
      'attributeSets',
      'physicals',
      'remoteID',
    ] as const satisfies readonly ProductTypePropertyName[]),
    relationships: Object.freeze({
      parentProductType: 'SlatwallProductType',
      childProductTypes: 'SlatwallProductType',
      products: 'SlatwallProduct',
    } as const),
  }),
  SlatwallBrand: Object.freeze({
    ownProperties: Object.freeze([
      'brandID',
      'activeFlag',
      'publishedFlag',
      'urlTitle',
      'brandName',
      'brandWebsite',
      'attributeValues',
      'products',
      'promotionRewards',
      'promotionRewardExclusions',
      'promotionQualifiers',
      'promotionQualifierExclusions',
      'vendors',
      'physicals',
      'remoteID',
    ] as const satisfies readonly BrandPropertyName[]),
    relationships: Object.freeze({ products: 'SlatwallProduct' } as const),
  }),
  SlatwallOption: Object.freeze({
    ownProperties: Object.freeze([
      'optionID',
      'optionCode',
      'optionName',
      'optionDescription',
      'sortOrder',
      'optionGroup',
      'skus',
      'remoteID',
    ] as const satisfies readonly OptionPropertyName[]),
    relationships: Object.freeze({
      optionGroup: 'SlatwallOptionGroup',
      skus: 'SlatwallSku',
    } as const),
  }),
  SlatwallOptionGroup: Object.freeze({
    ownProperties: Object.freeze([
      'optionGroupID',
      'optionGroupName',
      'optionGroupCode',
      'optionGroupImage',
      'optionGroupDescription',
      'imageGroupFlag',
      'sortOrder',
      'remoteID',
      'options',
    ] as const satisfies readonly OptionGroupPropertyName[]),
    relationships: Object.freeze({ options: 'SlatwallOption' } as const),
  }),
  SlatwallAlternateSkuCode: Object.freeze({
    ownProperties: Object.freeze([
      'alternateSkuCodeID',
      'alternateSkuCode',
      'alternateSkuCodeType',
      'sku',
    ] as const satisfies readonly AlternateSkuCodePropertyName[]),
    relationships: Object.freeze({ sku: 'SlatwallSku' } as const),
  }),
});

/* ----------------------------------------------------------------------------------------------
 * DRIFT GUARDS — the runtime whitelist and the type-level whitelist must state the SAME thing.
 *
 * The `satisfies` clauses above already prove every runtime name is a legal type-level name. These
 * guards prove the CONVERSE: that no type-level name is missing from the runtime array. Without
 * them, a domain union gaining a property would leave the whitelist quietly narrower than the type,
 * and a hard-coded literal would compile while the resolver rejected the same string at runtime.
 * Each alias resolves to `true` when the two agree and to `never` when they do not, so drift is a
 * build error in this file rather than a runtime surprise in an adapter.
 * ---------------------------------------------------------------------------------------------- */
type SmartListWhitelistIsComplete<TDeclared extends string, TRuntime extends string> = [
  TDeclared,
] extends [TRuntime]
  ? true
  : never;

type _SkuWhitelistComplete = SmartListWhitelistIsComplete<
  SkuPropertyName,
  (typeof SMARTLIST_ENTITY_SCHEMA)['SlatwallSku']['ownProperties'][number]
>;
type _ProductWhitelistComplete = SmartListWhitelistIsComplete<
  ProductPropertyName,
  (typeof SMARTLIST_ENTITY_SCHEMA)['SlatwallProduct']['ownProperties'][number]
>;
type _ProductTypeWhitelistComplete = SmartListWhitelistIsComplete<
  ProductTypePropertyName,
  (typeof SMARTLIST_ENTITY_SCHEMA)['SlatwallProductType']['ownProperties'][number]
>;
type _BrandWhitelistComplete = SmartListWhitelistIsComplete<
  BrandPropertyName,
  (typeof SMARTLIST_ENTITY_SCHEMA)['SlatwallBrand']['ownProperties'][number]
>;
type _OptionWhitelistComplete = SmartListWhitelistIsComplete<
  OptionPropertyName,
  (typeof SMARTLIST_ENTITY_SCHEMA)['SlatwallOption']['ownProperties'][number]
>;
type _OptionGroupWhitelistComplete = SmartListWhitelistIsComplete<
  OptionGroupPropertyName,
  (typeof SMARTLIST_ENTITY_SCHEMA)['SlatwallOptionGroup']['ownProperties'][number]
>;
type _AlternateSkuCodeWhitelistComplete = SmartListWhitelistIsComplete<
  AlternateSkuCodePropertyName,
  (typeof SMARTLIST_ENTITY_SCHEMA)['SlatwallAlternateSkuCode']['ownProperties'][number]
>;

/**
 * Forces the seven drift guards to be evaluated. Each must be `true`; a `never` from any of them
 * makes this declaration fail to compile.
 */
const SMARTLIST_WHITELIST_GUARDS: readonly [
  _SkuWhitelistComplete,
  _ProductWhitelistComplete,
  _ProductTypeWhitelistComplete,
  _BrandWhitelistComplete,
  _OptionWhitelistComplete,
  _OptionGroupWhitelistComplete,
  _AlternateSkuCodeWhitelistComplete,
] = [true, true, true, true, true, true, true];
void SMARTLIST_WHITELIST_GUARDS;

/**
 * Resolves a caller-supplied property path against the declared whitelist, or reports that it does
 * not resolve.
 *
 * This is the ONLY way to obtain a {@link ResolvedSmartListProperty}, and therefore the only way for
 * request input to become a {@link SmartListPropertyIdentifier}. It is the runtime half of DECISION
 * S-1; see that note for why closing this path restores legacy behaviour rather than changing it.
 *
 * The walk reproduces `getAliasedProperty` at org/Hibachi/HibachiSmartList.cfc:L308: each
 * non-terminal segment must name a traversable relationship, moving the cursor to the entity it
 * reaches, and the terminal segment must name one of THAT entity's own properties. The delimiter is
 * the sub-entity delimiter declared at org/Hibachi/HibachiSmartList.cfc:L32.
 *
 * ⚠️ RETURNS `undefined` RATHER THAN THROWING, and that is the parity requirement, not a softer
 * option. Every legacy accumulator wraps its append in a length test on the resolved property —
 * filters at org/Hibachi/HibachiSmartList.cfc:L369, like filters at :L396, in filters at :L422,
 * ranges at :L449, orders at :L480, keyword properties at :L487 — so an unresolvable path yields a
 * query with the entry MISSING and no error anywhere. Raising here would convert a silently ignored
 * request key into a failed request, which is a behaviour change in the opposite direction and is
 * forbidden by AAP §0.8.2 Guideline 2. The caller drops the entry; nothing is reported.
 *
 * ⛔ NO DEPTH LIMIT. The loop runs to the end of whatever path it is given, so nothing about a
 * caller's path length is decided here (AAP §0.7.3 standard 9). Termination is guaranteed by the
 * segment count, which is finite for any string.
 *
 * @param entityName - The entity the path is rooted at.
 * @param candidate - The raw path, as supplied. Never mutated, trimmed or rewritten: this function
 * decides membership and nothing else, so the value the adapter receives is the value that was
 * validated.
 * @returns The same string, branded as resolved, or `undefined` when any segment fails to resolve.
 */
export function resolveSmartListPropertyIdentifier<TEntity extends SmartListEntityName>(
  entityName: TEntity,
  candidate: string,
): SmartListPropertyIdentifier<TEntity> | undefined {
  const segments = candidate.split(SMARTLIST_SUB_ENTITY_DELIMITER);
  let cursor: SmartListEntityName = entityName;

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    // A leading, trailing or doubled delimiter yields an empty segment, which names nothing.
    if (segment === undefined || segment.length === 0) {
      return undefined;
    }

    const schema = SMARTLIST_ENTITY_SCHEMA[cursor];

    if (index === segments.length - 1) {
      return schema.ownProperties.includes(segment)
        ? (candidate as ResolvedSmartListProperty<TEntity>)
        : undefined;
    }

    const nextEntityName = schema.relationships[segment];
    if (nextEntityName === undefined) {
      return undefined;
    }
    cursor = nextEntityName;
  }

  // Unreachable for any string: `split` always yields at least one segment, and the loop returns on
  // the last one. Present because `noImplicitReturns` requires every path to produce a value.
  return undefined;
}

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
 * Q2 — THE DEFAULT IS THE EMPTY STRING, NOT AN INNER JOIN, AND THE DISTINCTION IS OBSERVABLE. The
 * legacy signature declares `string joinType=""` at org/Hibachi/HibachiSmartList.cfc:L212, and the
 * empty value is recorded only when non-empty at org/Hibachi/HibachiSmartList.cfc:L292-L293. What
 * makes the default load-bearing is what happens at emission time: an empty join type is coerced to
 * `left` at org/Hibachi/HibachiSmartList.cfc:L539-L541 before the join clause is written at
 * org/Hibachi/HibachiSmartList.cfc:L549. An unspecified join and an explicitly left join therefore
 * emit the SAME clause in this codebase.
 *
 * Normalising the default to an inner join would be a behavior change wearing a cleanup's
 * clothes: it would convert every unspecified join in the slice into an inner join and silently
 * drop the rows a left join preserves. The empty member is kept in the union so the legacy default
 * is expressible explicitly, and the join's `joinType` member is optional so its ABSENCE also means
 * the L212 default. Both spellings are legal and mean the same thing, exactly as in the source.
 *
 * `left` is the only non-empty value used anywhere in the slice — consumer 1 at
 * model/service/ProductService.cfc:L349, consumer 2 at model/service/SkuService.cfc:L316 and
 * consumer 3 at integrationServices/google/controllers/feed.cfc:L66. No further member is invented
 * (AAP §0.7.3 standard 9), even though the legacy parameter is an unconstrained string.
 *
 * THIS BLOCK IS THE ONE PLACE THE DEFAULT IS EXPLAINED, AND CONSUMERS MUST NOT RESTATE IT. A
 * consumer constant may record which of ITS legacy lines spells the join type, because that fact is
 * local to the constant; it may not restate what an omitted type MEANS. Two of them did, and both
 * asserted the opposite — they quoted the L212 empty-string default and concluded inner. A default
 * restated in N files goes stale, or gets inverted, in N places. The emitted keyword is likewise
 * decided in exactly one function, `resolveJoinKeyword` in
 * ../adapters/mysql/SmartListQueryBuilder.ts, which maps the absent, empty and explicit forms onto
 * a single clause.
 */
export type SmartListJoinType = '' | 'left';

/**
 * One related-property join.
 *
 * Q1 — THE GRAMMAR IS THREE-PART: PARENT ENTITY, RELATED PROPERTY, OPTIONAL JOIN TYPE. It is not
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
 * Q3 — `SlatwallProduct` AND `SlatwallSku` ARE CORRECT AND MUST NOT BE RENAMED. They are the
 * ORM's logical entity names, which is what this API consumes: the legacy resolves the base name
 * through the entity service at org/Hibachi/HibachiSmartList.cfc:L68 and writes it into the emitted
 * from-clause at org/Hibachi/HibachiSmartList.cfc:L533. The physical-versus-logical name divergence
 * recorded as the logical-versus-physical naming divergence [model/dao/SkuDAO.cfc:L132] applies only to NATIVE SQL, and only in the product and product-type data
 * access objects; rewriting these to the physical `SwProduct` / `SwSku` table names would break the
 * very API this port abstracts. The adapter maps logical names to physical tables internally.
 *
 * Q4 — A REPEATED JOIN REGISTERS ONCE, AND THE LEGACY IS EXPLICIT ABOUT IT. Consumer 3 re-joins the
 * product at integrationServices/google/controllers/feed.cfc:L64 even though consumer 2 has already
 * joined it at model/service/SkuService.cfc:L314, because the feed layers onto the smart list
 * returned by `getSkuSmartList()` at integrationServices/google/controllers/feed.cfc:L63.
 *
 * This was carried as an open TODO(parity) until the second registration was read at
 * org/Hibachi/HibachiSmartList.cfc:L270: `joinRelatedProperty` appends to the join-order array and
 * calls `addEntity` ONLY under `if(!structKeyExists(variables.entities, newEntityName))`. A repeat
 * therefore adds no entity and no join-order entry, so the emitted from-clause — assembled by
 * iterating that array at :L536 — carries the join exactly ONCE. De-duplicating is the faithful
 * reading; carrying the duplicate would emit a join the legacy never emits.
 * `mergeSmartListJoins` in the caller-struct translation section of `src/ports/SmartListQueryPort.ts` keeps the FIRST occurrence, which is the one that created the entry.
 *
 * ONE NUANCE, RECORDED AND DELIBERATELY NOT IMPLEMENTED. The legacy's `else` branch at :L292-L297
 * does one thing on a repeat: it overwrites `joinType`, and only when the repeat supplies a non-empty
 * one. No in-scope path reaches that — the sole caller passing additional joins is the feed, whose
 * only duplicate (`SlatwallSku` → `product`) omits the join kind, exactly as the two base joins do.
 * Implementing an override no call site exercises would be enhancement beyond the migration
 * (AAP §0.8.2 guideline 4), so the semantics are documented here instead.
 *
 * Join ORDER is significant and is carried by array position: the legacy tracks it separately in
 * the join-order array declared at org/Hibachi/HibachiSmartList.cfc:L9 and iterates it when
 * emitting the from-clause at org/Hibachi/HibachiSmartList.cfc:L536.
 *
 * ⭐ DECISION S-2 — A JOIN IS TWO IDENTIFIERS, AND THEY MUST BE PAIRED (SEC-09). Both fields were
 * `string`. A related-property join emits a join clause naming an entity and a relationship, so both
 * halves land in identifier positions that no `?` placeholder can protect (TR-4). Worse, typing them
 * independently let a legal entity be paired with a relationship belonging to a DIFFERENT entity —
 * `{ parentEntityName: 'SlatwallSku', relatedProperty: 'brandName' }` typechecked and described a
 * join that cannot exist. This type is therefore a DISTRIBUTIVE UNION over
 * {@link SmartListEntityName}: each member fixes the parent entity and admits only that entity's own
 * traversable relationships, so the pairing is checked rather than merely the two names. It remains a
 * plain data shape with no generic parameter, so {@link SmartListQuery.joins} is unchanged.
 */
export type SmartListJoin = {
  [TParentEntityName in SmartListEntityName]: {
    /**
     * The already-present entity the join hangs off, as an ORM logical entity name —
     * `SlatwallProduct` or `SlatwallSku` in this slice. First parameter at
     * org/Hibachi/HibachiSmartList.cfc:L212.
     */
    readonly parentEntityName: TParentEntityName;

    /**
     * The relationship on THAT parent entity to join across — for example `productType`,
     * `defaultSku`, `brand`, `product` or `alternateSkuCodes`. Second parameter at
     * org/Hibachi/HibachiSmartList.cfc:L212. Drawn from
     * {@link SmartListEntityRelationships}, so only relationships the parent actually declares are
     * admitted, and only those whose target is itself in scope — see the traversal-boundary note on
     * {@link SmartListEntityRelationships}.
     */
    readonly relatedProperty: keyof SmartListEntityRelationships[TParentEntityName] & string;

    /**
     * How to join. ABSENT means the empty-string default of org/Hibachi/HibachiSmartList.cfc:L212,
     * which the emitter resolves to a left join at org/Hibachi/HibachiSmartList.cfc:L539-L541.
     */
    readonly joinType?: SmartListJoinType;
  };
}[SmartListEntityName];

/**
 * One association to project onto each returned record — see {@link SmartListQuery.associationProjections}.
 *
 * ⭐ IT IS THE SAME SHAPE AS A JOIN MINUS THE JOIN KIND, AND DELIBERATELY SO. A projection identifies
 * an association that {@link SmartListQuery.joins} has ALREADY declared, so restating the kind here
 * would create a second place for it to be specified and therefore a way for the two to disagree —
 * a projection asking for `left` against a join declared `''` has no meaningful reading.
 *
 * ⛔ IT IS NOT A PATH. `{parentEntityName: 'SlatwallProduct', relatedProperty: 'brand'}` projects the
 * brand reached through whichever join declared `Product.brand`; it does NOT accept
 * `'product.brand'`. Paths would need their own resolution rules, and the join list already carries
 * the graph — this member only selects from it. The mapped type below is what makes
 * `relatedProperty` compile-checked against the parent entity's OWN declared relationships, so
 * `{parentEntityName: 'SlatwallBrand', relatedProperty: 'brand'}` is a type error rather than a
 * runtime surprise.
 */
export type SmartListAssociationProjection = {
  [TParentEntityName in SmartListEntityName]: {
    /** The entity the association hangs off — must be the parent of a declared join. */
    readonly parentEntityName: TParentEntityName;

    /** The relationship to project, constrained to those the parent entity actually declares. */
    readonly relatedProperty: keyof SmartListEntityRelationships[TParentEntityName] & string;
  };
}[SmartListEntityName];

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
export interface SmartListFilter<TEntity extends SmartListEntityName = SmartListEntityName> {
  /**
   * The logical property path to test. First parameter at org/Hibachi/HibachiSmartList.cfc:L362.
   *
   * ⭐ SEC-09 — ENTITY-SCOPED. `TEntity` defaults to the whole {@link SmartListEntityName} union so
   * that a caller with no particular root still gets a CLOSED identifier; supplying the root — as
   * both consuming services do — narrows it further, to that entity's paths alone. The default and
   * the narrowed form differ in a way worth stating: under the default, `brandName` is accepted
   * because it is a legal path on SOME entity, whereas `SmartListFilter<'SlatwallSku'>` rejects it.
   * Neither form admits an arbitrary string, so the injection contract is closed either way; the
   * parameter is what makes it entity-specific, which is what the finding asked for.
   */
  readonly propertyIdentifier: SmartListPropertyIdentifier<TEntity>;

  readonly value: SmartListFilterValue;
}

/**
 * One range filter, with each bound independently optional.
 *
 * D-C — THE `'1^'` OPEN-ENDED SYNTAX REMAINS FULLY EXPRESSIBLE, RESTRUCTURED RATHER THAN
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
 * value failing it is dropped and the query runs unfiltered. Carried: `translateSmartListRange` in
 * the caller-struct translation section of `src/ports/SmartListQueryPort.ts` returns `undefined` for such a value and nothing throws. That function
 * is the SOLE interpreter of a range string in this subtree — it reproduces both the acceptance test
 * above and the emission rules at org/Hibachi/HibachiSmartList.cfc:L632-L655 — so this note describes
 * real behaviour with one implementation rather than a convention each caller is trusted to follow.
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
export interface SmartListRange<TEntity extends SmartListEntityName = SmartListEntityName> {
  /**
   * The logical property path to bound. First parameter at org/Hibachi/HibachiSmartList.cfc:L445.
   */
  readonly propertyIdentifier: SmartListPropertyIdentifier<TEntity>;

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
 * Q5 — THE WEIGHT IS PART OF THE CONTRACT, AND EVERY OBSERVED VALUE IS ONE. The legacy declares
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
 * No relevance-scoring formula, no weight range and no alternative default is invented on the
 * back of this member (AAP §0.7.3 standard 9). Implementing scoring would ADD behavior the legacy
 * does not have, which AAP §0.8.2 Guideline 4 forbids just as firmly as removing behavior it does
 * have.
 */
export interface SmartListKeywordProperty<
  TEntity extends SmartListEntityName = SmartListEntityName,
> {
  /**
   * The logical property path to search. First parameter at org/Hibachi/HibachiSmartList.cfc:L485.
   * Observed values span plain, one-hop and two-hop paths — see
   * model/service/SkuService.cfc:L318-L322.
   */
  readonly propertyIdentifier: SmartListPropertyIdentifier<TEntity>;

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
 * because both in-scope call sites state it explicitly. NO DEFAULT SORT IS DECLARED HERE.
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
export interface SmartListOrder<TEntity extends SmartListEntityName = SmartListEntityName> {
  /** The logical property path to sort by. Parsed from the statement at
   * org/Hibachi/HibachiSmartList.cfc:L474. */
  readonly propertyIdentifier: SmartListPropertyIdentifier<TEntity>;

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
 * NO DEFAULT PAGE SIZE, MAXIMUM PAGE SIZE OR RESULT CAP IS DECLARED. Every member is optional and
 * nothing is filled in. The property declaration at org/Hibachi/HibachiSmartList.cfc:L24 carries no
 * initial value of its own; the initial values live on the setup member at
 * org/Hibachi/HibachiSmartList.cfc:L39, which declares a first record of one and a page size of
 * ten, and are applied at org/Hibachi/HibachiSmartList.cfc:L65-L66. Those two figures are recorded
 * here as source-declared observations with their locator and are deliberately NOT restated as
 * defaults of this interface — resolving absent pagination is the adapter's job, exactly as it is
 * the setup member's job in the legacy (AAP §0.7.3 standard 9).
 *
 * S8 — CONTEXT FLAGGED, NOT CLAIMED: AAP §0.6.6 mismatch M2 records that the feed's render budget
 * of 360 seconds, declared at integrationServices/google/views/feed/product.cfm:L9, far exceeds what a
 * synchronous request-response gateway will generally allow by default — a ceiling no figure is named
 * for here, because it varies by gateway type and configuration and none is selected. The feed consumes
 * the FULL record set rather than a page — integrationServices/google/views/feed/product.cfm:L16
 * iterates the complete records collection — so pagination is not what bounds it. M2 is allocated
 * to the feed handler and is cited here only so the connection is visible; no pagination default
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
   * TODO(parity): THIS IS DECLARED AS A STRING, NOT A NUMBER, at
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
export interface SmartListQuery<TEntityName extends SmartListEntityName = SmartListEntityName> {
  /**
   * The ORM logical entity name being queried — `SlatwallProduct` for consumer 1
   * (model/service/ProductService.cfc:L343) and `SlatwallSku` for consumer 2
   * (model/service/SkuService.cfc:L310). First parameter of the setup member at
   * org/Hibachi/HibachiSmartList.cfc:L39; see Q3 on `SmartListJoin` for why these names are correct
   * as written. This is also what tells the adapter which row mapper produces the result element
   * type, exactly as it tells the legacy which entity its record collection contains.
   *
   * ⭐ SEC-09 — CLOSED. This was `string`. It becomes the from-clause entity at
   * org/Hibachi/HibachiSmartList.cfc:L533, which is an identifier position, so an open string here
   * was the same contract defect as the one DECISION S-1 describes for property paths. Every value
   * the slice supplies is a compile-time literal — `SlatwallSku` at model/service/SkuService.cfc:L310,
   * `SlatwallOption` and `SlatwallOptionGroup` for the two synthesized members of AAP §0.4.2.5 — so
   * no runtime resolution is needed for this field and none is offered.
   *
   * ⭐ IT IS A TYPE PARAMETER, NOT THE BARE UNION, SO THE LITERAL SURVIVES. `SmartListQueryPort.execute`
   * derives its record type from this field through {@link SmartListRecord}, which it can only do if the
   * particular name a caller wrote is still visible in the type. The parameter DEFAULTS to the full
   * union so that the many places describing a query without caring which entity it names —
   * `composeWhereClause`, `composeOrderClause` and the test doubles among them — continue to say
   * `SmartListQuery` unchanged.
   */
  readonly entityName: TEntityName;

  /**
   * Related-property joins, in application order. Accumulated one at a time by the member at
   * org/Hibachi/HibachiSmartList.cfc:L212. Twenty-one join registrations occur across the slice, so
   * this is the most heavily exercised group of the eight.
   */
  readonly joins?: readonly SmartListJoin[];

  /**
   * Which joined associations to PROJECT and attach to each returned record.
   *
   * ⭐ THIS MEMBER HAS NO DIRECT LEGACY COUNTERPART, AND THAT IS THE POINT. The legacy record
   * projection selects the BASE ENTITY ONLY — `SELECT <baseAlias>` at
   * `org/Hibachi/HibachiSmartList.cfc:L521` — and the mapping layer then loads `sku.product`,
   * `product.brand` and the rest LAZILY, on first property access, issuing further statements behind
   * the caller's back. A stateless port has no session to lazy-load through: once a row set has been
   * mapped, no association can be resolved later. So the data the legacy fetches implicitly must be
   * fetched explicitly here, and this member is how a caller says which associations it needs.
   *
   * It exists to REPRODUCE legacy behaviour, not to extend it. The associations named here are ones
   * the legacy caller does reach — `integrationServices/google/views/feed/product.cfm` dereferences
   * `sku.product`, the product's type, its brand and its default SKU — so projecting them makes the
   * port's output equal to what the legacy caller observes, rather than adding anything to it.
   *
   * ⛔ EVERY ENTRY MUST CORRESPOND TO A JOIN DECLARED IN {@link SmartListQuery.joins}. Projection
   * NEVER creates a join: an entry naming an association that was not joined is a programming error
   * and is refused, because silently adding a join would change the result set (an inner join can
   * remove rows) while silently skipping the projection would hand the caller a half-built graph.
   * Declaring the join and projecting it are deliberately two decisions, so that "which rows come
   * back" and "which columns come back" stay separable — exactly as they are in the legacy, where the
   * join list and the select list are built by different members.
   *
   * Absent or empty means base-entity-only projection, which is the legacy default and what every
   * consumer other than the product feed wants.
   */
  readonly associationProjections?: readonly SmartListAssociationProjection[];

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
   * This is NOT the distinct obligation recorded as T4 in AAP §0.6.1.3. That one governs the
   * option-to-SKU resolution query and belongs to `src/ports/repositories/SkuRepository.ts`; this
   * member is the general smart-list flag and claims nothing about it.
   */
  readonly selectDistinctFlag?: boolean;
}

/**
 * The caller-supplied query input — the typed counterpart of the legacy untyped data structure that
 * every smart-list member accepts as its first argument.
 *
 * THIS NAME IS A CONTRACT. Four AAP-declared signatures reference it: `getProductSmartList` and
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
 * Q6 — DISCREPANCY 1, RECORDED RATHER THAN MADE SILENTLY (TR-1). The companion argument of both
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
 * Q7 — the two consumers obtain their smart list from DIFFERENT providers: consumer 1 through the
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

  /*
   * ⛔ A SECOND JOIN MEMBER WAS DECLARED HERE AND HAS BEEN REMOVED. It named the same concept as
   * {@link SmartListInput.additionalJoins} below and had NO READER anywhere: the live translator,
   * `translateSmartListInput` in the caller-struct translation section of `src/ports/SmartListQueryPort.ts`, reads `options.input?.additionalJoins`
   * and nothing else, so a value written under the other name reached no query. Two members for one
   * concept is worse than either alone — `Object.freeze<T>(literal)` defeats excess-property checking,
   * so writing the unread name produced no type error and no test failure, only joins that silently
   * vanished. The arguments that were unique to its documentation — the `rc` non-simple-member evidence
   * and the exact seven-names-and-seven-prefixes enforcement — are carried below.
   *
   * ⚠️ `SmartListQuery.joins` IS A DIFFERENT AND LIVE MEMBER. That one is the owning service's OWN base
   * join list on the executable description; this interface describes what a CALLER contributes to it.
   */

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

  /**
   * Structural joins the CALLER contributes, applied AFTER the owning service's own base joins.
   *
   * ===============================================================================================
   * ⭐ THE ONE MEMBER HERE THAT IS NOT A FRAMEWORK REQUEST KEY, AND WHY IT HAS TO EXIST
   * ===============================================================================================
   * Every other member of this interface is a key the legacy framework itself reads out of the request
   * structure. This one is not, and the reason is a caller the legacy has that this shape could not
   * otherwise serve: `integrationServices/google/controllers/feed.cfc` calls the SKU smart list with no
   * arguments at `:L63` and then MUTATES the returned smart-list object, adding three related-property
   * joins at `:L64-L66` before adding its filters at `:L68-L72`.
   *
   * The port deliberately has no mutation step — decision D-A chose an immutable description precisely
   * so query state cannot accumulate on a shared object between invocations — so a caller's additions
   * must be DECLARED UP FRONT, inside the value handed to the service. The filters and the range already
   * cross that boundary through the prefix keys above. The three joins had nowhere to go, so the feed
   * declared them and could not forward them, and the executed query carried only the service's base
   * joins. This member is that missing channel.
   *
   * ⛔ IT REUSES {@link SmartListJoin} AND INVENTS NO SECOND GRAMMAR. The three-part shape — parent
   * entity, related property, optional join kind — is the one the framework's own
   * `joinRelatedProperty` takes at org/Hibachi/HibachiSmartList.cfc:L536, and the reason it cannot
   * collapse to a dotted path is argued once on {@link SmartListJoin}. A caller-facing variant with a
   * different shape would be a second dialect of the same grammar, which is exactly what must not
   * happen here.
   *
   * ⚠️ ORDER IS PART OF THE CONTRACT: BASE JOINS FIRST, THESE SECOND. That is the legacy's own order —
   * the service applies `model/service/SkuService.cfc:L314-L316` while building the object at `:L63`,
   * and the controller's additions land afterwards at `:L64-L66`. It also matters structurally, because
   * a join may name a parent entity that an EARLIER join introduced: the feed's second and third joins
   * are both rooted at `SlatwallProduct`, an entity that exists in the registry only because a
   * `SlatwallSku` -> `product` join put it there. Applying these first would leave that parent
   * unregistered.
   *
   * ✅ A DUPLICATE IS HARMLESS AND MUST NOT BE "CLEANED UP". The feed's first join re-joins
   * `("SlatwallSku", "product")`, which the service has already joined. Registration is idempotent in
   * the legacy — the existence guard at org/Hibachi/HibachiSmartList.cfc:L269 appends nothing for an
   * already-registered key — and `src/adapters/mysql/SmartListQueryBuilder.ts` reproduces that, where
   * the whole trace is written out. The duplicate is carried verbatim (AAP §0.8.2 Guideline 4).
   *
   * ⛔ NOT A FILTER, NOT A KEYWORD PROPERTY, AND NOT A ROUTE-SUPPLIED VALUE. This member is for
   * STRUCTURAL declarations authored in a module constant by the code that owns the query's shape. A
   * handler must never populate it from a request: `src/handlers/skuHandler.ts` builds its input by
   * copying only recognised PREFIXED keys, so an inbound `additionalJoins` is discarded there, and it
   * cannot be otherwise — a caller able to name arbitrary entities and properties in a join would be
   * able to widen the query's reach past the whitelist that SEC-09 exists to enforce.
   *
   * ⚠️ AND THE `rc` COUNTERPART GENUINELY CARRIES NON-SIMPLE MEMBERS IN THE LEGACY, so a structural
   * value under a request-bag key is not a foreign concept smuggled into a data map. `feed.cfc:L63`
   * assigns the smart list ITSELF into `rc`, and the interpreter's guard at
   * org/Hibachi/HibachiSmartList.cfc:L99 skips every non-simple member of that same structure. The
   * legacy request bag was therefore already the channel through which structural query state reached
   * this layer, and the simple-value guard is what kept the two kinds apart. `translateSmartListInput`
   * in the caller-struct translation section of `src/ports/SmartListQueryPort.ts` reproduces BOTH halves: its entry loop admits only CFML simple
   * values, so an array under any key can never be misread as a filter, and the joins are read
   * separately and structurally.
   *
   * ⛔ THE ENFORCEMENT IS EXACT, NOT APPROXIMATE. The legacy recognition set is seven exact names and
   * seven colon-terminated prefixes, every one of them carrying a simple value, and no join key is among
   * them — so a query-string or form key naming joins was ignored by the legacy and is ignored here.
   * `src/handlers/skuHandler.ts` narrows the key type it forwards to the request-supplied members alone,
   * which is why an attempt to forward an untrusted value into this member does not compile rather than
   * merely being dropped at runtime. `test/services/ProductService.test.ts` pins the runtime half from
   * the other side, asserting that a `joins` query-string key is not forwarded at all.
   *
   * OPTIONAL, so every existing caller is unaffected: three services and both entity-side smart lists
   * pass inputs that never mention it, and none of their behaviour changes.
   */
  readonly additionalJoins?: readonly SmartListJoin[];
}

/**
 * Which domain entity a smart list rooted at each logical entity name produces.
 *
 * ⭐ THIS MAPPING IS WHAT MAKES THE ROOT ENTITY AND THE RECORD TYPE AGREE AT COMPILE TIME. The legacy
 * ties the two together at run time: `org/Hibachi/HibachiSmartList.cfc:L39` stores one entity name and
 * every record the list yields is an instance of that entity, so the pairing is not a caller's choice
 * there and it must not be one here either. Declaring the correspondence once, as data, is what lets
 * `SmartListQueryPort.execute` DERIVE its element type from `query.entityName` instead of accepting an
 * element type the caller nominates independently — a pairing nothing could check, and one an adapter
 * could only honour with a type assertion.
 *
 * WHY THIS FILE MAY NAME DOMAIN TYPES. It already does, and it must: every `*PropertyName` union
 * imported above comes from `../domain/**`, because a filter's property identifier is only meaningful
 * against the entity that declares the property. Ports in this slice name domain types as a matter of
 * course — `../ports/repositories/SkuRepository` returns `Sku`, `../ports/repositories/BrandRepository`
 * accepts `Brand` — because in a ports-and-adapters arrangement the domain is what the ports are
 * expressed IN, not a layer beneath them (AAP §0.7.3 standard 4 places `domain` and `ports` on the same
 * side of the boundary, with only `adapters` and `handlers` outside it). Six type-only imports add no
 * runtime edge.
 *
 * ⚠️ `SlatwallAlternateSkuCode` IS ABSENT, AND ITS ABSENCE IS THE POINT. That entity is reachable as a
 * JOIN target — `model/service/SkuService.cfc:L316` joins it — but the extracted slice models no
 * domain type for it, so no smart list can be rooted there. Omitting the key rather than mapping it to
 * `never` turns "you cannot root a list here" into a compile error at the call site, which is stricter
 * than the run-time refusal it replaces.
 */
export interface SmartListEntityRecordTypes {
  readonly SlatwallProduct: Product;
  readonly SlatwallSku: Sku;
  readonly SlatwallProductType: ProductType;
  readonly SlatwallBrand: Brand;
  readonly SlatwallOption: Option;
  readonly SlatwallOptionGroup: OptionGroup;
}

/**
 * The logical entity names a smart list may be ROOTED at — every {@link SmartListEntityName} for which
 * {@link SmartListEntityRecordTypes} declares a record type.
 *
 * Intersected with {@link SmartListEntityName} rather than taken as a bare `keyof`, so that adding a
 * key here that is not a real entity name is itself a compile error.
 */
export type SmartListRootEntityName = keyof SmartListEntityRecordTypes & SmartListEntityName;

/** The record type a smart list rooted at `TEntityName` yields. */
export type SmartListRecord<TEntityName extends SmartListRootEntityName> =
  SmartListEntityRecordTypes[TEntityName];

/**
 * The materialised outcome of one query.
 *
 * THIS NAME IS A CONTRACT, AND IT IS GENERIC ON PURPOSE. The same four AAP-declared signatures
 * listed on `SmartListInput` instantiate it at four different element types — product, SKU, option
 * and option group. The parameter stays because those four instantiations are genuinely different
 * types; what it no longer does is let a caller nominate an element type unrelated to the root entity,
 * because `SmartListQueryPort.execute` now supplies it from {@link SmartListRecord}.
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
 * TWO MEMBERS, AND THE SECOND IS A SELECTION RATHER THAN A NEW CAPABILITY. The legacy component
 * declares thirty-three public members across 1,090 lines, from the setup member at
 * org/Hibachi/HibachiSmartList.cfc:L39 to the cache-name member at
 * org/Hibachi/HibachiSmartList.cfc:L1081. Almost all of them exist to ACCUMULATE state or to READ
 * IT BACK, and both roles disappear once the query is a value: accumulation becomes constructing a
 * `SmartListQuery`, and reading back becomes inspecting the one you constructed. What remains that
 * only an implementation can do is EXECUTE the query — so execution is the whole interface, and the
 * one question left open is WHICH of the legacy's three views a caller is asking for.
 *
 * ⚠️ THE LEGACY IS LAZY PER VIEW, WHICH IS WHY THE SECOND MEMBER IS FAITHFULNESS AND NOT AN
 * OPTIMISATION BOLTED ON AFTERWARDS. The framework materialises the unpaged collection at
 * org/Hibachi/HibachiSmartList.cfc:L751-L755, the page at org/Hibachi/HibachiSmartList.cfc:L759-L764
 * and the count at org/Hibachi/HibachiSmartList.cfc:L771 — each on FIRST READ of that view, each
 * behind its own "have I already?" test. A legacy caller that reads only `getRecords()` therefore
 * issues exactly ONE query, and nothing runs a page or a count on its behalf. {@link execute} serves
 * the caller that wants all three views at once; {@link executeRecords} serves the caller that wants
 * the unpaged collection alone, which is what makes one-query execution reachable here too.
 *
 * WHY SELECTION RATHER THAN LAZINESS. A lazy translation cannot keep this shape. Every member of
 * {@link SmartListResult} is DATA, while every legacy read behind it is asynchronous here, so making
 * the views lazy would mean turning all seven members into promise-returning thunks. That changes the
 * type at every consumer, dissolves the one-to-one correspondence between a member of the result and
 * the line of the legacy that produces it, and makes the result impossible to construct in a
 * hand-written double without a database — the very property the paragraph below depends on. Choosing
 * the view up front costs the caller one word and keeps the value a value.
 *
 * This is also why the surface is kept this small in practice, per AAP §0.7.3 standard 6: the
 * legacy repository contains NO MOCKING LIBRARY AT ALL, so the planned
 * `test/support/inMemoryRepositories.ts` must implement every port by hand. AAP §0.4.3.6 calls that "the single largest structural
 * difference between the two suites" — legacy tests boot the whole framework and are integration
 * tests, whereas the target tests construct classes directly against hand-written doubles and are
 * unit tests. Every member declared here is a member several test files must stub, so each one has
 * to earn its place from an actual call site. That is the test {@link executeRecords} had to pass
 * before it was declared, and it passes on three of them: the two option-collection reads relocated
 * out of model/entity/Product.cfc:L251-L261 and model/entity/Product.cfc:L340-L347, each of which
 * reads the unpaged collection and nothing else; and the Google product feed, whose view iterates the
 * unpaged collection at integrationServices/google/views/feed/product.cfm:L16 and never asks for a
 * page or a total. Both members are satisfiable by a plain object literal, and the two shapes those
 * doubles must be able to express — the feed's open-ended lower-bound range and its left-joined brand
 * — are both plain data in `SmartListQuery`. Coverage for all of this is NET-NEW: AAP §0.6.5.2
 * confirms no legacy test exists for the product service, the SKU service or the SKU data-access
 * object.
 *
 * NO CLASS, NO ABSTRACT BASE, NO CONSTRUCTOR, AND NO SHARED GENERIC BASE ACROSS THE FOLDER. The
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
   * ⭐ THE ELEMENT TYPE IS DERIVED FROM `query.entityName`, NOT NOMINATED BY THE CALLER. The root entity
   * already determines what the records are — `org/Hibachi/HibachiSmartList.cfc:L39` stores one entity
   * name and every record the list yields is an instance of it — so {@link SmartListEntityRecordTypes}
   * states that correspondence once and this signature reads it. A caller cannot pair `SlatwallSku` with
   * a product element type, because there is no longer a parameter in which to say so.
   *
   * WHAT THIS REPLACED, AND WHY. The element type used to be a free parameter of this method, on the
   * reasoning that one injected adapter instance must serve every entity in the slice. It still does —
   * the parameter is merely CONSTRAINED to the root entity name now rather than being unrelated to it.
   * The previous shape had a real cost: no adapter could implement it without asserting its mapper's
   * output into the caller's chosen type, so the one unchecked step in the whole read path was the one
   * step no test could reach. Deriving the element type removes the assertion rather than relocating it.
   *
   * Asynchronous because execution is real database work — the legacy runs it at
   * org/Hibachi/HibachiSmartList.cfc:L753 for the unpaged collection and at
   * org/Hibachi/HibachiSmartList.cfc:L762 for the paged slice. See translation decision D-B for why
   * this port is asynchronous while `SettingResolverPort` is not.
   *
   * @typeParam TEntityName - The root entity, inferred from `query.entityName`. Constrained to
   *            {@link SmartListRootEntityName}, so rooting a list at an entity the slice models no
   *            domain type for does not compile.
   * @param query - The complete, immutable description of the query to run.
   * @returns The unpaged records, the current page, and the count and paging figures derived from
   *          them, with the element type {@link SmartListEntityRecordTypes} pairs with the root entity.
   */
  execute<TEntityName extends SmartListRootEntityName>(
    query: SmartListQuery<TEntityName>,
  ): Promise<SmartListResult<SmartListRecord<TEntityName>>>;

  /**
   * Executes a described query for its UNPAGED RECORDS ONLY — the `getRecords()` view on its own.
   *
   * THE QUERY DESCRIPTION IS THE SAME VALUE AND IS INTERPRETED THE SAME WAY. Filters, like filters,
   * in filters, ranges, keywords, joins, ordering and the distinct flag all apply exactly as they do
   * under {@link execute}, because there is only one description and only one thing that reads it.
   * This member does not narrow, relax or reorder any of them, and it is not a place to put a
   * different query grammar.
   *
   * WHAT IT DOES NOT DO, AND WHY EACH OMISSION IS FAITHFUL RATHER THAN A SHORTCUT:
   *   1. NO PAGE. org/Hibachi/HibachiSmartList.cfc:L751-L755 builds the unpaged collection from the
   *      statement at org/Hibachi/HibachiSmartList.cfc:L748-L750, which carries no offset and no
   *      maximum-results bound; the bound pair is added only for the page, at
   *      org/Hibachi/HibachiSmartList.cfc:L762. So a `pagination` section on the query is NOT
   *      consulted here — precisely as `getRecords()` ignores it — and supplying one is neither an
   *      error nor a request for a slice.
   *   2. NO COUNT. The dedicated counting statement at org/Hibachi/HibachiSmartList.cfc:L777-L778
   *      runs only when the count is read, at org/Hibachi/HibachiSmartList.cfc:L771. A caller that
   *      asks for records asks for records.
   *   3. NO PAGING FIGURES. `pageRecordsStart`, `pageRecordsEnd`, `currentPage` and `totalPages` are
   *      all derived from the page and the count at org/Hibachi/HibachiSmartList.cfc:L792-L813, so
   *      with neither of those read there is nothing to derive and nothing is invented.
   *
   * ⚠️ THE ORDER-DEPENDENT LEGACY COUNT CANNOT ARISE HERE. org/Hibachi/HibachiSmartList.cfc:L783-L785
   * degrades the total to the LENGTH of the unpaged collection when that collection has already been
   * materialised, which is the asymmetry {@link SmartListResult.recordsCount} resolves in favour of
   * the dedicated statement. This member returns no total at all, so it neither reproduces nor
   * contradicts that resolution: a caller needing both views calls {@link execute}, where the
   * resolution still holds.
   *
   * MUTABLE BY CONTRACT, NOT BY ACCIDENT. The returned array is freshly hydrated for this call and is
   * owned by the caller, so it is typed mutable rather than `readonly`. That is deliberate and it
   * matches the collections the legacy hands back: model/entity/Option.cfc:L95, :L102 and :L104 all
   * mutate an option collection IN PLACE, so a read-only array would break option handling several
   * layers up. It also means a caller needs no defensive copy — which is the difference between one
   * allocation per read and two.
   *
   * ⭐ THE ELEMENT TYPE IS DERIVED EXACTLY AS IT IS UNDER {@link execute}, AND FOR THE SAME REASON.
   * This member reads the same query description, hydrates through the same mapper and yields the same
   * kind of record — the only difference is how many of the legacy's three views are asked for. Letting
   * the caller nominate an element type here while `execute` derives one would give one description two
   * element-type rules, which is precisely the drift the correspondence in
   * {@link SmartListEntityRecordTypes} exists to prevent.
   *
   * ⭐ SEC-HARDENING (D18-CLASS) — THIS MEMBER IS SUBJECT TO THE SAME MATERIALISATION POLICY AS
   * {@link SmartListQueryPort.execute}, AND SAYING SO IS PART OF CLOSING REVIEW FINDING F4 (CWE-400).
   * ------------------------------------------------------------------------------------------------
   * "Unpaged" describes WHICH ROWS the query selects, not how many an implementation may be compelled
   * to materialise. The finding observed that this member's contract had no materialisation bound at
   * all while the sibling's implementation did, and that the gap was reachable: the anonymous public
   * Google feed reads its selection through THIS member, so the one caller most worth bounding was the
   * one the bound did not cover.
   *
   * THE CONTRACT IS THEREFORE STATED ONCE FOR BOTH MEMBERS, in these terms:
   *
   *   • AN IMPLEMENTATION MAY REFUSE A QUERY WHOSE MATCH IS LARGER THAN ITS CONFIGURED BOUND, and a
   *     caller must treat a rejection as a legitimate answer rather than an internal fault. What it may
   *     NOT do is TRUNCATE: feed order and feed membership are observable behaviour (AAP §0.4.1.10
   *     requires every field mapping preserved, and `src/integrations/google/ProductFeedBuilder.ts`
   *     reproduces the legacy `cfloop` without re-sorting or filtering), so a quietly shortened result
   *     would publish a catalog that does not exist while reporting success.
   *   • THE REFUSAL MUST PRECEDE HYDRATION. A bound applied after the rows are materialised protects
   *     nothing, which is the exact defect this finding identified on this member.
   *   • NO BOUND IS DECLARED HERE, AND NONE IS DEFAULTED. The legacy states no maximum anywhere, and
   *     AAP §0.7.3 S9 with IR-12 forbid inventing one. A port that named a figure would be fabricating
   *     a service level. With nothing configured, an implementation materialises whatever the query
   *     matches — exactly as `org/Hibachi/HibachiSmartList.cfc` does — so parity is the default and the
   *     bound is an operator's opt-in.
   *
   * ⚠️ WHICH MAKES THE POLICY AN IMPLEMENTATION CONCERN THAT THE PORT DESCRIBES RATHER THAN CARRIES. No
   * budget parameter is added to this signature, and none should be: a service calling a smart list has
   * no business knowing a resource ceiling exists, which is AAP §0.7.3 S2 read in the direction it
   * matters. `src/adapters/mysql/SmartListQueryBuilder.ts` takes the figure as an optional constructor
   * collaborator and enforces it identically on both members.
   *
   * @typeParam TEntityName - The root entity, inferred from `query.entityName`. Constrained to
   *            {@link SmartListRootEntityName}, so rooting a list at an entity the slice models no
   *            domain type for does not compile.
   * @param query - The complete, immutable description of the query to run.
   * @returns Every matching record, in the order the query's ordering terms produce, unpaged, with the
   *          element type {@link SmartListEntityRecordTypes} pairs with the root entity.
   * @throws When an implementation has a materialisation bound configured and this query exceeds it.
   *         Refused before any row is hydrated, never silently shortened.
   */
  executeRecords<TEntityName extends SmartListRootEntityName>(
    query: SmartListQuery<TEntityName>,
  ): Promise<SmartListRecord<TEntityName>[]>;
}

/* ================================================================================================
 * `BoundedRead` — the explicit, caller-stated window every bounded repository read takes, and the
 * result shape that reports what the window left behind.
 *
 * ------------------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS, AND WHY IT IS NOT A PORT
 * ------------------------------------------------------------------------------------------------
 * It carries no legacy origin, because the legacy has none to carry: not one of the four Catalog
 * data-access components bounds a read. `model/dao/SkuDAO.cfc:L130-L148`, `model/dao/
 * ProductDAO.cfc:L419-L437`, `model/dao/OptionDAO.cfc:L51-L92` and `:L94-L117` all return every
 * matching row, and `model/dao/ProductTypeDAO.cfc:L54-L62` returns the whole table. Those members are
 * ported exactly as they are and REMAIN UNBOUNDED — see the paragraph below, which is the single most
 * important thing in this file.
 *
 * What this file supplies is the vocabulary for the ADDITIONAL, EXPLICITLY BOUNDED members that sit
 * beside them. Those members are new API surface, deliberately: a caller that can state a bound
 * should be able to state one, and the alternative — silently capping the unbounded members — would
 * substitute a confidently wrong answer for a large right one. AAP §0.7.3 S9 and §0.8.2 Guideline 4
 * both forbid that substitution, so the bound is a parameter and never a default.
 *
 * THIS SECTION IS NOT A PORT. It declares no capability and nothing implements it; it is the shared parameter
 * and return vocabulary for members declared on the repository ports in `./repositories/`. It lives
 * in THIS module rather than being repeated in each of them for one concrete reason: `test/support/
 * inMemoryRepositories.ts` imports from all five ports at once, so five identically named local
 * declarations would collide at every import site and force alias noise into the one file the whole
 * suite depends on. One declaration, imported by name, removes that.
 *
 * ⭐ AND IT LIVES HERE, IN THE SMART-LIST PORT, RATHER THAN IN A FILE OF ITS OWN — because a file of its
 * own is not one of the port modules AAP §0.3.1 enumerates, and review finding F5 required the production
 * graph to consist only of AAP-listed files. This module is the AAP-listed port that already owns every
 * other shared read-shape vocabulary of the slice, including {@link SmartListPagination}, so the bounded
 * window sits beside its one-based sibling with the difference between them stated in one place.
 *
 * ------------------------------------------------------------------------------------------------
 * ⚠️⚠️ NOTHING HERE TRUNCATES SILENTLY, AND THAT IS THE WHOLE DESIGN
 * ------------------------------------------------------------------------------------------------
 * A bound that quietly drops rows is worse than no bound at all: the caller receives a short answer
 * it cannot distinguish from a complete one. A `BoundedReadResult` therefore reported its own `hasMore`
 * alongside the rows, and the adapters produced it by asking the database for ONE MORE ROW than the caller
 * wanted and reporting whether it arrived. So:
 *
 * ⚠️ `BoundedReadResult` IS NAMED IN PROSE RATHER THAN LINKED THROUGHOUT THIS BLOCK, BECAUSE THE
 * DECLARATION NO LONGER EXISTS. It was withdrawn with the four windowed repository members that produced
 * it — the full record is in the block below {@link BoundedReadWindow}. The reasoning is kept because the
 * no-silent-truncation rule still governs {@link BoundedReadWindow}'s surviving consumers, and a `{@link}`
 * to a removed symbol is the dangling-reference defect review finding F11 reported elsewhere in this
 * subtree.
 *
 *   - `hasMore === false` — the window reached the end of the match set. The rows ARE the remainder.
 *   - `hasMore === true`  — at least one further row exists past the window. The caller decides
 *                          whether to advance {@link BoundedReadWindow.offset} and read again.
 *
 * The probe row itself is never returned. `rows.length` is always at most
 * {@link BoundedReadWindow.limit}.
 *
 * ------------------------------------------------------------------------------------------------
 * ⚠️ ROW ORDER IS THE UNDERLYING STATEMENT'S, AND FOR TWO OF THE FOUR BOUNDED MEMBERS THAT MEANS
 * THERE IS NONE
 * ------------------------------------------------------------------------------------------------
 * A bounded read cannot invent an ordering to page over. `model/dao/ProductDAO.cfc:L421` and
 * `model/dao/SkuDAO.cfc:L132` declare NO `ORDER BY`, so their bounded counterparts inherit the
 * engine's order and successive windows are not guaranteed to be disjoint or exhaustive. Adding a
 * sort term to make paging stable would change the order the existing unbounded members return —
 * observable output — and is forbidden by AAP §0.8.2 Guideline 4 and §0.7.3 S9. The honest contract is
 * therefore stated rather than engineered around: the two search windows are for bounding COST, and a
 * caller that needs stable paging must use a member whose statement already orders. The two
 * unused-option members do order — `model/dao/OptionDAO.cfc:L90-L92` and `:L115-L117` — so their
 * bounded counterparts page deterministically.
 *
 * ------------------------------------------------------------------------------------------------
 * WHAT THIS FILE IS ALLOWED TO TOUCH (AAP §0.7.3 S4 — hexagonal separation)
 * ------------------------------------------------------------------------------------------------
 * It imports NOTHING, and cannot: it is two type declarations over `number`, `boolean` and a caller's
 * row type. No domain type, no adapter type, no driver type and no AWS type appears, so it is
 * readable from the port layer, the adapter layer, the service layer and the test suite without any of
 * them acquiring a dependency through it.
 * ============================================================================================== */
/**
 * The window a caller states for a bounded read.
 *
 * BOTH FIELDS ARE REQUIRED, AND NEITHER HAS A DEFAULT. An optional `limit` would need a fallback, and
 * any fallback would be a number the source does not state (AAP §0.7.3 S9, IR-12). Making the caller
 * say what it can afford is the point of the member existing.
 *
 * The adapters validate both fields before composing a statement and raise on a non-integer, a
 * non-positive `limit` or a negative `offset`, rather than clamping. Clamping would silently answer a
 * different question than the one asked.
 *
 * ⚠️ `offset` IS ZERO-BASED, AND THAT DIFFERS FROM THE SMART LIST. The smart-list port's
 * `pageRecordsStart` is ONE-based, because `org/Hibachi/HibachiSmartList.cfc` is one-based and that
 * value is carried from legacy source. This window carries nothing from legacy source — there is no
 * bounded legacy read to carry from — so it uses the zero-based convention the driver's own `OFFSET`
 * clause uses, and says so here so the two are never confused. A window of `{ limit: 10, offset: 0 }`
 * and a smart-list page of `pageRecordsStart: 1, pageRecordsShow: 10` select the same rows.
 */
export interface BoundedReadWindow {
  /**
   * The maximum number of rows to return. Must be a positive integer.
   *
   * The returned array holds at most this many rows. The adapter that consumed this window read one more
   * than this internally to decide the withdrawn `BoundedReadResult`'s `hasMore`, and never returned that
   * extra row.
   */
  readonly limit: number;

  /**
   * How many matching rows to skip before the window starts. Must be a non-negative integer.
   *
   * Zero-based, per the warning on {@link BoundedReadWindow}. An offset past the end of the match set
   * yields an empty array with `hasMore` false, which is a correct answer and not an error.
   */
  readonly offset: number;
}

/*
 * ⛔ `BoundedReadResult<Row>` STOOD HERE AND HAS BEEN WITHDRAWN WITH THE MEMBERS THAT PRODUCED IT.
 * It reported `{ rows, hasMore }` for the four windowed repository members —
 * `SkuRepository.searchByProductTypeBounded`, `ProductRepository.searchByProductTypeBounded` and the two
 * `OptionRepository` unused-option listings. A performance review found that whole surface DEAD: nothing
 * in `src/**` ever declared, wired or called a windowed member, so every bundle carried the declarations,
 * the two `QueryRunner` helpers that composed them (`prepareBoundedRead`, `settleBoundedRead`) and the
 * `PreparedBoundedRead` shape, for a capability no route could reach. The declarations, the
 * implementations and the helpers went together, because a result type with no producer is not a contract.
 *
 * ⚠️ {@link BoundedReadWindow} DELIBERATELY SURVIVES, AND IT IS NOT AN ORPHAN OF THIS REMOVAL. The
 * WINDOW type still has live consumers: `src/handlers/httpResponse.ts` parses one out of the query string
 * in `readBoundedReadWindow`, which has its own passing coverage and is reached from the handler edge —
 * it was never support for the removed members. Withdrawing it would have exceeded the finding.
 *
 * The paragraph above this block that describes `hasMore` and the read-one-extra-row probe is retained as
 * the record of what the withdrawn contract said, so a future reviewer comparing this port against the
 * four legacy statements does not have to reconstruct it.
 */

/* ================================================================================================
 * THE CALLER-STRUCT TRANSLATION — `struct data` INTO A TYPED {@link SmartListQuery}
 * ------------------------------------------------------------------------------------------------
 * smartListInput — the single translation of the FW/1 `rc` request grammar into the declarative
 * query description that `src/ports/SmartListQueryPort.ts` declares.
 *
 * Legacy origin:
 *   org/Hibachi/HibachiSmartList.cfc — `setup` at :L39 reads the caller's `data` structure and the
 *     `add*` / `remove*` members at :L362, :L389, :L416, :L445, :L476 and :L502 accumulate the
 *     filters, ranges, orders, keywords and paging figures this module now produces as data. Per AAP
 *     §0.8.3.2 that tree is "a boundary to extract from, never modify": its CONTRACT is read here and
 *     none of its implementation is carried over.
 *   model/service/ProductService.cfc:L342 — `getProductSmartList(struct data={}, currentURL="")`.
 *   model/service/SkuService.cfc:L309 — `getSkuSmartList(struct data={}, currentURL="")`.
 *   integrationServices/google/controllers/feed.cfc:L58 — `product(rc)`, which hands the framework's
 *     `rc` straight through to the SKU smart list.
 *
 * ⭐ WHY THIS MODULE EXISTS AT ALL — THE RELOCATION RECORD. Both translators below were previously
 * declared inside `src/ports/SmartListQueryPort.ts`, beside the shapes they produce. That placement
 * was wrong on the port's own terms. The port is a DECLARATION-ONLY module: its contract permits "a
 * `const` union or type guard" and forbids "a working function body", and its layer rule (AAP §0.7.3
 * standard 4) is what keeps `src/ports/**` importable by every layer above it at zero runtime cost. A
 * consumer that needs only shapes should be able to write `import type` and pay nothing; while the
 * grammar lived in the port, three services and the Google feed query each held a genuine RUNTIME
 * import of a file that is supposed to disappear at compile time. Moving the emitted code here — a
 * utility, not an adapter, because a service may depend on a port or a utility but never on an adapter
 * — restores that property without changing one rule of the grammar.
 *
 * ⛔ WHAT DID NOT MOVE, AND WHY IT CANNOT. `SMARTLIST_ENTITY_SCHEMA` and
 * {@link resolveSmartListPropertyIdentifier} stay in the port. They are not translation behaviour:
 * they are the runtime half of a nominal type. `ResolvedSmartListProperty<TEntity>` is branded with a
 * module-private `unique symbol` that the port declares and never exports, so the ONLY value of that
 * type which can ever exist is one the resolver returned. Relocating the resolver would force either
 * exporting the brand — making it forgeable by any module, which destroys the mechanism AAP §0.7.3
 * standard 2 relies on — or moving the branded type itself, which would make the port import a
 * utility and break "ALLOWED imports: NONE". The port's own contract sanctions exactly that shape: a
 * `const` whitelist and the type guard that reads it. The reconciliation is recorded at the schema's
 * declaration in the port, so the two records cannot drift apart.
 *
 * LAYER POSITION. `src/util/**` is a leaf: it may import `src/ports/**` and `src/domain/**` and
 * nothing else. This module imports exactly one module — the port — for its shapes and for the
 * resolver. It reads no environment variable (`src/config/env.ts` is the only file permitted to),
 * touches no database, holds no state between calls, and contains no SQL: every property path it
 * emits has already been validated against the port's whitelist, so the adapter receives identifiers
 * it can place in a statement without interpolating caller input (AAP §0.7.3 standard 2, TR-4).
 *
 * WHAT THIS DELIBERATELY IS NOT. It is not a query builder: it produces a `SmartListQuery`
 * description and never a statement. It is not a validator that raises: every rejection path omits a
 * section, exactly as the legacy `add*` members silently decline a value they do not accept. It
 * invents no default page size, no result cap, no sort default and no timeout (AAP §0.7.3 standard 9,
 * IR-12); the only numbers here are source-declared values carried with their locators.
 *
 * NO USER-SPECIFIED RULES GOVERN THIS FILE. AAP §0.7.1 records that verdict — `review_rules` returns
 * "No user rules provided." — and no ancillary rule-bearing file exists anywhere in the repository.
 * Per UR4 that is not permission to lower the bar: the nine binding standards of AAP §0.7.3 govern
 * instead.
 * ============================================================================================== */

/* ================================================================================================
 * THE SHARED RANGE TRANSLATOR — THE ONE PLACE A CALLER-SUPPLIED RANGE STRING IS INTERPRETED
 * ================================================================================================
 *
 * WHY THERE IS EXACTLY ONE OF IT. `addRange` was a method ON the SmartList in the legacy system, so
 * its acceptance test and its predicate emission were written once and every caller inherited them.
 * Ported naively, each service ends up interpreting the range string for itself — and when that
 * happened, the two copies drifted apart in OPPOSITE directions, each reproducing the half the other
 * omitted. One carried the acceptance test but neither the length gate nor the delimiter-free case;
 * the other carried the length gate and the emission branches but no acceptance test at all. Two
 * callers therefore produced different predicates from the same input, which is precisely the class of
 * divergence a "matching public surface" port is supposed to rule out. Consolidating restores the
 * legacy property that there is one interpretation, not one per caller.
 *
 * WHY IT LIVES IN THIS UTILITY AND NOT IN THE PORT. {@link translateSmartListRange} is pure string
 * logic over its two parameters — no package, no Node builtin, no injected collaborator, no state —
 * and for a while it was declared inside `src/ports/SmartListQueryPort.ts` beside the
 * {@link SmartListRange} shape it produces. It cannot stay there: a working function body is emitted
 * code, and the port is a declaration-only module whose contract admits only "a `const` union or type
 * guard". Relocating it here keeps the single-interpretation property intact while restoring the
 * port's zero-runtime invariant. Nothing about the grammar changed in the move — see the relocation
 * record in this module's header.
 *
 * THE FULL CENSUS OF LEGACY CALL SITES, because it is small enough to state exhaustively and it is
 * what makes the date approximation below safe to reason about. A repository-wide search for
 * `addRange(` outside the framework file itself returns exactly four lines:
 *
 *   [integrationServices/google/controllers/feed.cfc:L72]  addRange('product.calculatedQATS','1^')
 *       IN SCOPE. Numeric, lower-bound-only. The feed's availability gate (AAP 0.6.4.1).
 *   [model/transient/HibachiScope.cfc:L146]               addRange('calculatedQATS','1^')
 *       Out of scope. Identical numeric shape.
 *   [model/entity/Account.cfc:L158]                       addRange('...expirationDate','#now()#^')
 *       Out of scope. THE ONLY DATE-VALUED RANGE ANYWHERE IN THE LEGACY TREE.
 *   [meta/tests/unit/IssuesTest.cfc:L95]                  addRange('calculatedQATS','XXX^')
 *       A LEGACY REGRESSION TEST, and the reason the acceptance test is load-bearing rather than
 *       decorative — see the next paragraph.
 *
 * ⭐ THE ACCEPTANCE TEST IS PINNED BY A LEGACY TEST, WHICH SETTLES A QUESTION THAT WAS PREVIOUSLY
 * ARGUED THE OTHER WAY. `issue_1329` at [meta/tests/unit/IssuesTest.cfc:L91-L99] builds a product
 * SmartList, calls `addRange('calculatedQATS','XXX^')` with a deliberately malformed value, and then
 * calls `getPageRecords()`. It asserts nothing explicitly, which makes it a "must not blow up"
 * regression: the guard at [org/Hibachi/HibachiSmartList.cfc:L446] SILENTLY DISCARDS the malformed
 * range, so no predicate is emitted and the query runs unfiltered. Omitting the acceptance test does
 * not merely admit odd input — it changes the outcome of a named legacy regression, because `'XXX^'`
 * would otherwise become a live `calculatedQATS >= 'XXX'` bound. The numeric half of the test is
 * therefore both exactly reproducible AND behaviourally required, and it is reproduced here.
 *
 * ⚠️ THE DATE HALF IS A FLAGGED APPROXIMATION (AAP 0.7.3 standard 8, "flag mismatches rather than
 * assume them away"; standard 9, "invent nothing"). CFML's `isDate` recognises a locale-sensitive,
 * engine-dependent set of spellings that the source nowhere enumerates, so reproducing it exactly
 * would mean inventing a grammar. `Date.parse` is the closest primitive available without taking a
 * dependency, narrowed by rejecting anything already numeric because CFML's `isDate("5")` is false
 * while some engines' `Date.parse` is permissive about bare numbers. The divergence is confined to
 * WHICH range strings are admitted; no admitted value is ever rewritten. Per the census above, no
 * in-scope caller reaches the date arm at all — the single date-valued range in the legacy tree is
 * `model/entity/Account.cfc:L158`, in the explicitly excluded Account domain (AAP 0.2.2.1) — so the
 * approximation cannot change an in-scope result. That is a bounded, stated limitation, not a
 * silently accepted one.
 * ============================================================================================== */

/**
 * The range delimiter, `variables.rangeDelimiter` at org/Hibachi/HibachiSmartList.cfc:L36.
 *
 * Exported because both consuming services previously declared their own private copy of the literal,
 * and two literals is one more than the number of places this character should be written.
 */
export const SMART_LIST_RANGE_DELIMITER = '^';

/**
 * CFML list semantics over the range delimiter: EMPTY ELEMENTS ARE IGNORED.
 *
 * This is why `listFirst('^10','^')` and `listLast('^10','^')` are BOTH `'10'`, and why `'10^'` yields
 * `'10'` from either end. The emission branches below rely on that, so the behaviour is reproduced
 * here rather than approximated with a plain `split`.
 */
function splitRangeValue(value: string): string[] {
  return value.split(SMART_LIST_RANGE_DELIMITER).filter((element) => element.length > 0);
}

/* THE CFML SCALAR PREDICATES `readsAsCfmlNumeric` AND `readsAsCfmlDate` ARE DECLARED ONCE, LOWER IN
 * THIS FILE, alongside the rest of the engine-semantics helpers the input translator needs. They were
 * briefly declared twice — once here in a string-only form for range acceptance and once below in an
 * `unknown`-accepting form for `rc` entries — which is precisely the duplication this port exists to
 * remove. The lower pair subsumes the upper one (every string the upper pair accepted the lower pair
 * accepts identically), so the upper pair was withdrawn rather than both being kept in step by hand.
 * Function declarations hoist, so the range translator below may call them freely. */

/**
 * Translates one caller-supplied range entry into bounds, reproducing
 * org/Hibachi/HibachiSmartList.cfc:L446 (acceptance) and org/Hibachi/HibachiSmartList.cfc:L632-L655
 * (emission) exactly.
 *
 * THE TWO REJECTION PATHS HAVE DIFFERENT LEGACY ORIGINS AND THE SAME OBSERVABLE EFFECT, which is why
 * one function can own both:
 *   - FAILING ACCEPTANCE at `:L446` means the value is never stored, so no predicate exists.
 *   - PASSING ACCEPTANCE BUT FAILING THE LENGTH GATE at `:L632` means the value IS stored, and the
 *     emission loop then skips it — so again no predicate exists. The stored-but-inert entry is
 *     readable in the legacy only through `getRanges()` at `:L461-L470`, which this port deliberately
 *     does not expose, so the two cases are indistinguishable to every consumer here.
 * The length gate must be applied at THIS point and nowhere later: structuring the value into bounds
 * destroys the raw string, so an adapter receiving the pair could not reproduce the skip even in
 * principle.
 *
 * ⚠️ TODO(parity) — THE ACCEPTANCE TEST'S LOWER CLAUSE TESTS `listLast`, NOT `listFirst`. Both halves
 * of `:L446` share the identical third term `isDate(listLast(value, delimiter))`. In the lower-bound
 * clause that is almost certainly a typo, and it has a real consequence: a value whose LAST element
 * reads as a date admits the entry outright, however malformed its FIRST element is, so
 * `'abc^2024-01-15'` is accepted and yields the literal lower bound `'abc'`. It is carried verbatim,
 * because it decides which strings the legacy admits and "correcting" it would silently narrow the
 * accepted set (AAP 0.7.3 standard 7, preserve and annotate).
 *
 * @param propertyIdentifier - The property the range constrains, taken from the entry key.
 * @param value - The raw range entry exactly as the caller supplied it.
 * @returns The structured bounds, or `undefined` when the legacy would emit no predicate.
 *
 * @example
 * ```ts
 * translateSmartListRange('p', '1^');        // { propertyIdentifier: 'p', lowerBound: '1' }
 * translateSmartListRange('p', '^10');       // { propertyIdentifier: 'p', upperBound: '10' }
 * translateSmartListRange('p', '5^10');      // both bounds
 * translateSmartListRange('p', '10');        // both bounds '10' — EXACT EQUALITY
 * translateSmartListRange('p', '5');         // undefined — length gate, NO predicate
 * translateSmartListRange('p', 'XXX^');      // undefined — rejected, pins issue_1329
 * ```
 */
export function translateSmartListRange(
  propertyIdentifier: SmartListPropertyIdentifier,
  value: string,
): SmartListRange | undefined {
  const elements = splitRangeValue(value);
  const first = elements[0] ?? '';
  const last = elements.length > 0 ? (elements[elements.length - 1] ?? '') : '';

  const startsWithDelimiter = value.startsWith(SMART_LIST_RANGE_DELIMITER);
  const endsWithDelimiter = value.endsWith(SMART_LIST_RANGE_DELIMITER);

  // [:L446] — the two clauses, with the shared `isDate(listLast(...))` term hoisted so the quirk
  // documented above is visible as a single value used by both rather than written out twice.
  const lastReadsAsDate = readsAsCfmlDate(last);
  const lowerAcceptable = startsWithDelimiter || readsAsCfmlNumeric(first) || lastReadsAsDate;
  const upperAcceptable = endsWithDelimiter || readsAsCfmlNumeric(last) || lastReadsAsDate;
  if (!lowerAcceptable || !upperAcceptable) {
    return undefined;
  }

  // [:L632] — the emission loop skips any stored value of one character or fewer.
  if (value.length <= 1) {
    return undefined;
  }

  // [:L635] Only a higher bound, taken from the LAST element at [:L638].
  if (startsWithDelimiter) {
    return { propertyIdentifier, upperBound: last };
  }
  // [:L642] Only a lower bound, taken from the FIRST element at [:L645].
  if (endsWithDelimiter) {
    return { propertyIdentifier, lowerBound: first };
  }
  // [:L649] Both bounds, first and last respectively at [:L653-L654]. For a DELIMITER-FREE value the
  // two elements are the same string, so this is exact equality — `>= v AND <= v`.
  return { propertyIdentifier, lowerBound: first, upperBound: last };
}

/* =================================================================================================
 * THE ONE SHARED SMARTLIST INPUT TRANSLATOR
 * =================================================================================================
 * ⚠️⚠️ F10 — WHY THERE IS EXACTLY ONE OF IT.
 *
 * `src/services/OptionService.ts` and `src/services/SkuService.ts` each carried their OWN complete
 * translation of the FW/1 `rc` data-key grammar into the query shapes declared above — roughly twenty
 * constants and a dozen functions apiece. The two implementations DISAGREED, so the same framework
 * input could produce two different query descriptions depending on which service received it. Every
 * divergence was measured against `org/Hibachi/HibachiSmartList.cfc` before this translator was
 * written, and the authority-faithful rule was taken in each case:
 *
 *   1. RANGE ACCEPTABILITY. `HibachiSmartList.cfc:L446` gates `addRange` on
 *      `(left(value,1) == delim || isNumeric(listFirst(value,delim)) || isDate(listLast(value,delim)))
 *      && (right(value,1) == delim || isNumeric(listLast(value,delim)) || isDate(listLast(value,delim)))`.
 *      One implementation reproduced that gate; the other had NO numeric/date test at all and so
 *      accepted ranges the legacy silently discards. The gate is kept.
 *      ⚠️ TODO(parity): the legacy tests `isDate(listLast(...))` in BOTH halves — the LOWER half asks
 *      about the LAST element, which is almost certainly meant to be `listFirst`. That asymmetry is
 *      reproduced verbatim below, NOT repaired: AAP 0.7.3 "preserve and annotate, do not repair", and
 *      AAP 0.6.7 governs which departures are permitted. No register identifier is minted, because
 *      AAP 0.6.7 closes its register and this line lies in `org/Hibachi/**`, outside the 21 in-scope
 *      files that register covers.
 *   2. RANGE LENGTH GUARD. One implementation rejected any value of length <= 1 before parsing.
 *      `:L446` has no such guard, so it is dropped — rule 1 already rejects the inputs it was
 *      shielding against, and it additionally rejected the legal single-character numeric range.
 *   3. EMPTY ORDER PROPERTIES. `:L480` appends an order only `if(len(aliasedProperty))`, and one
 *      implementation checked only for `undefined` while the other also checked for `''`. MEASURED
 *      RESULT: the two agree, and the review's concern does not reproduce. {@link cfmlListToArray}
 *      models CFML's list semantics, in which empty elements are skipped rather than preserved, so the
 *      first element of a parsed statement can never be `''` — `'|DESC'` parses to `['DESC']`, exactly
 *      as `listFirst('|DESC','|')` returns `'DESC'` and `listLen` returns 1. The `len()` test is
 *      therefore retained as faithful but UNREACHABLE defensive code, and this entry is recorded as a
 *      divergence that was checked and found not to exist rather than quietly dropped from the list.
 *      One consequence is worth naming because it looks like a bug and is not: `OrderBy=|DESC` orders
 *      by a property literally named `DESC`, ascending, in both the legacy and here.
 *   4. ORDER DIRECTION. `:L476` is `listFindNoCase("D,DESC", listLast(statement, delim))`. CFML's
 *      `listFindNoCase` compares elements case-insensitively but does NOT trim them, so a trailing
 *      `"brandName| DESC"` leaves the direction ASC. One implementation trimmed before comparing and
 *      would have returned DESC. The non-trimming legacy comparison is kept — the same reasoning F23
 *      applied when it matched `listFind` semantics exactly rather than approximating them.
 *   5. PAGE COERCION. One implementation used `Number(String(value).trim())` guarded by
 *      `Number.isFinite`, which accepts forms CFML's `isNumeric` rejects — `Number('0x10')` is 16 and
 *      `Number('')` is 0. {@link readAcceptablePageValue} goes through the CFML numeric predicate
 *      instead, so hexadecimal, empty and whitespace inputs are refused as the legacy refuses them.
 *   6. BOOLEAN-REMOVAL COERCION. The `FR:`, `FIR:` and `FKR:` removal keys are CFML booleans. One
 *      implementation folded "is this a boolean?" and "what is its value?" into a single truthiness
 *      test that treated any non-zero number as true while refusing the string `'false'` a meaning at
 *      all. The two-step CFML form is kept: {@link readsAsCfmlBoolean} then {@link toCfmlBoolean}, so
 *      `'no'`, `'false'` and `0` are recognised booleans that mean "do not remove".
 *   7. UNDEFINED INPUT. One implementation returned a bare `{ entityName }` for an absent input,
 *      DISCARDING the caller's joins and keyword properties — which are structural, not filter-driven,
 *      and must survive an empty request. The absent-input path now composes through the same
 *      function as every other path.
 *
 * PLACEMENT. The three consuming services already import `../ports/SmartListQueryPort` for
 * `SmartListInput` and `SmartListQuery`, so routing them through this module adds one import edge and
 * no new layer: `src/util/**` sits beneath `src/services/**` exactly as `src/ports/**` does, and this
 * module reaches DOWN to the port for its shapes and never sideways or up.
 * `src/adapters/mysql/SmartListQueryBuilder.ts` would be the wrong home, because a service may depend
 * on a port or a utility but never on an adapter (AAP §0.7.3 standard 4) — which is also why the
 * relocation record in this module's header settles on a utility rather than an adapter.
 * ============================================================================================== */

/** CFML's default list delimiter, used by every `list*` function that is not given one. */
const CFML_LIST_DELIMITER = ',';

/** The data-key delimiter of the FW/1 `rc` grammar: `F:propertyName`, `P:Show`, and so on. */
const SMART_LIST_DATA_KEY_DELIMITER = ':';

const FILTER_PREFIX = `F${SMART_LIST_DATA_KEY_DELIMITER}`;
const FILTER_REMOVAL_PREFIX = `FR${SMART_LIST_DATA_KEY_DELIMITER}`;
const IN_FILTER_PREFIX = `FI${SMART_LIST_DATA_KEY_DELIMITER}`;
const IN_FILTER_REMOVAL_PREFIX = `FIR${SMART_LIST_DATA_KEY_DELIMITER}`;
const LIKE_FILTER_PREFIX = `FK${SMART_LIST_DATA_KEY_DELIMITER}`;
const LIKE_FILTER_REMOVAL_PREFIX = `FKR${SMART_LIST_DATA_KEY_DELIMITER}`;
const RANGE_PREFIX = `R${SMART_LIST_DATA_KEY_DELIMITER}`;
const ORDER_BY_KEY = 'OrderBy';
const PAGE_SHOW_KEY = `P${SMART_LIST_DATA_KEY_DELIMITER}Show`;
const PAGE_START_KEY = `P${SMART_LIST_DATA_KEY_DELIMITER}Start`;
const PAGE_CURRENT_KEY = `P${SMART_LIST_DATA_KEY_DELIMITER}Current`;
const KEYWORD_KEY = 'keyword';
const KEYWORDS_KEY = 'keywords';

/** `HibachiSmartList.cfc` treats this literal as "no paging at all". */
const PAGE_RECORDS_SHOW_ALL_KEYWORD = 'ALL';

/** The row count `PAGE_RECORDS_SHOW_ALL_KEYWORD` resolves to, and the ceiling on any page figure. */
const PAGE_RECORDS_SHOW_ALL = 1000000000;

const ORDER_DIRECTION_DELIMITER = '|';
const LIKE_FILTER_WILDCARD = '%';

/* THE RANGE DELIMITER IS NOT RE-DECLARED HERE. It is exported once as
 * {@link SMART_LIST_RANGE_DELIMITER} above and used by {@link translateSmartListRange}, which is now
 * the single owner of the range grammar; a second private `'^'` literal at this point existed only to
 * feed the withdrawn local range parser and would be a silent drift risk if reinstated. */

/** The `"D,DESC"` list of `HibachiSmartList.cfc:L476`, compared case-insensitively and untrimmed. */
const DESCENDING_ORDER_TOKENS: readonly string[] = Object.freeze(['D', 'DESC']);

/** The three spellings of a keyword separator the legacy normalises before splitting. */
const KEYWORD_SEPARATORS: readonly string[] = Object.freeze([' ', '%20', '+']);

/** CFML `listToArray`, which drops empty elements rather than preserving them as `''`. */
function cfmlListToArray(list: string, delimiter: string = CFML_LIST_DELIMITER): string[] {
  return list.split(delimiter).filter((entry) => entry.length > 0);
}

/** CFML `isSimpleValue` for the three scalar kinds an `rc` entry can carry. */
function isCfmlSimpleValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** CFML `isNumeric` — deliberately narrower than `Number()`, which accepts hex and empty strings. */
function readsAsCfmlNumeric(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(trimmed);
}

/** CFML numeric coercion. Yields `NaN` for anything {@link readsAsCfmlNumeric} rejects. */
function toCfmlNumber(value: unknown): number {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (!readsAsCfmlNumeric(value)) {
    return Number.NaN;
  }
  return Number(typeof value === 'string' ? value.trim() : value);
}

/** CFML `isDate`. A numeric string is NOT a date here, matching the engine's precedence. */
function readsAsCfmlDate(value: string): boolean {
  if (value.trim().length === 0 || readsAsCfmlNumeric(value)) {
    return false;
  }
  return !Number.isNaN(Date.parse(value.trim()));
}

/** CFML `isBoolean` — the first half of the two-step coercion of divergence 6. */
function readsAsCfmlBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'string') {
    return false;
  }
  const normalised = value.trim().toLowerCase();
  return (
    normalised === 'true' ||
    normalised === 'false' ||
    normalised === 'yes' ||
    normalised === 'no' ||
    readsAsCfmlNumeric(value)
  );
}

/**
 * CFML boolean coercion — the second half. Meaningful only after {@link readsAsCfmlBoolean}.
 *
 * ⚠️ THIS FUNCTION IS TRIPLICATED, AND THE THREE COPIES ONCE DISAGREED. The six coercion helpers
 * above are declared here, in `../services/SkuService` and in `../services/ProductService`,
 * module-private in each, because S5 admits no shared helper module for them. The arrangement is
 * only safe while the copies stay identical, and one did not: `ProductService` ended this chain with
 * `toCfmlNumber(normalised) !== 0` rather than `return false`, so for a value
 * {@link readsAsCfmlBoolean} REJECTS it answered TRUE where this copy answers FALSE. The three
 * callers below apply the predicate inline, so this module never reached the divergent input — but
 * the bodies are byte-identical again, and an edit to any of the six is an edit to three files.
 */
function toCfmlBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase();
    if (normalised === 'true' || normalised === 'yes') {
      return true;
    }
    if (normalised === 'false' || normalised === 'no') {
      return false;
    }
    if (readsAsCfmlNumeric(value)) {
      return toCfmlNumber(value) !== 0;
    }
  }
  return false;
}

/** Wraps each comma-delimited element of a `FK:` value in the SQL `LIKE` wildcard. */
function buildPatternFilterValue(raw: string): string {
  return cfmlListToArray(raw)
    .map((element) => `${LIKE_FILTER_WILDCARD}${element}${LIKE_FILTER_WILDCARD}`)
    .join(CFML_LIST_DELIMITER);
}

/**
 * `HibachiSmartList.cfc:L446` — the range acceptability gate and the bound split.
 *
 * The `isDate(listLast(...))` appearing in the LOWER test is the legacy asymmetry recorded as
 * divergence 1 above; it is reproduced rather than corrected.
 */
/**
 * Range parsing for an `rc` entry DELEGATES to {@link translateSmartListRange} rather than repeating
 * it. This function previously carried a second, independent implementation of `:L446` acceptance and
 * `:L632-L655` emission, and the two had already drifted in two observable ways before they were
 * noticed:
 *
 *   1. THE `:L632` LENGTH GATE WAS MISSING HERE, so a one-character stored value such as `"5"`
 *      produced a predicate where the legacy emission loop skips it and produces none.
 *   2. THE BOUNDS WERE SLICED AROUND THE FIRST DELIMITER instead of taken from the FIRST and LAST
 *      list elements, so a three-element value like `"1^2^3"` yielded an upper bound of `"2^3"` where
 *      `:L638`/`:L654`'s `listLast` yields `"3"`.
 *
 * Both are gone by construction now that one function owns the grammar. Do not reintroduce a local
 * copy: the acceptance and emission rules are a single legacy behaviour and belong in a single place.
 */
function parseRangeValue(
  entityName: SmartListEntityName,
  rawProperty: string,
  raw: string,
): SmartListRange | undefined {
  const propertyIdentifier = resolveSmartListPropertyIdentifier(entityName, rawProperty);
  if (propertyIdentifier === undefined) {
    return undefined;
  }
  return translateSmartListRange(propertyIdentifier, raw);
}

/**
 * `HibachiSmartList.cfc:L473-L482` — property identifier, direction, and the `len()` guard.
 *
 * The direction comparison is case-insensitive and UNTRIMMED, which is what `listFindNoCase` does
 * (divergence 4).
 */
function parseOrderStatement(
  entityName: SmartListEntityName,
  statement: string,
): SmartListOrder | undefined {
  const parts = cfmlListToArray(statement, ORDER_DIRECTION_DELIMITER);
  const rawProperty = parts[0];
  if (rawProperty === undefined || rawProperty.length === 0) {
    return undefined;
  }
  const propertyIdentifier = resolveSmartListPropertyIdentifier(entityName, rawProperty);
  if (propertyIdentifier === undefined) {
    return undefined;
  }
  const lastPart = parts[parts.length - 1];
  const descending =
    parts.length > 1 &&
    lastPart !== undefined &&
    DESCENDING_ORDER_TOKENS.some((token) => token === lastPart.toUpperCase());
  return { propertyIdentifier, direction: descending ? 'DESC' : 'ASC' };
}

/** Normalises the three keyword separator spellings, then splits on the CFML list delimiter. */
function parseKeywords(raw: string): string[] {
  let keywordList = raw;
  for (const separator of KEYWORD_SEPARATORS) {
    keywordList = keywordList.split(separator).join(CFML_LIST_DELIMITER);
  }
  return cfmlListToArray(keywordList);
}

/** A page figure is acceptable only when CFML would read it as a number in `(0, ALL]`. */
function readAcceptablePageValue(value: string | number | boolean): number | undefined {
  if (!readsAsCfmlNumeric(value)) {
    return undefined;
  }
  const numeric = toCfmlNumber(value);
  return numeric > 0 && numeric <= PAGE_RECORDS_SHOW_ALL ? numeric : undefined;
}

/** `removeFilter` and friends drop EVERY entry for the property, not merely the first. */
function removeEntriesForProperty(entries: SmartListFilter[], propertyIdentifier: string): void {
  for (let index = entries.length - 1; index >= 0; index--) {
    if (entries[index]?.propertyIdentifier === propertyIdentifier) {
      entries.splice(index, 1);
    }
  }
}

/** The mutable accumulator the entry loop fills before {@link composeQuery} freezes it into shape. */
interface SmartListQueryDraft {
  readonly filters: SmartListFilter[];
  readonly likeFilters: SmartListFilter[];
  readonly inFilters: SmartListFilter[];
  readonly ranges: SmartListRange[];
  readonly orders: SmartListOrder[];
  keywords: string[];
  pageRecordsStart?: number;
  pageRecordsShow?: number;
  currentPageDeclaration?: string;
}

/** `OrderBy` carries a comma-delimited list of `property|direction` statements. */
function applyOrderByEntry(
  entityName: SmartListEntityName,
  draft: SmartListQueryDraft,
  raw: string,
): void {
  for (const statement of cfmlListToArray(raw, CFML_LIST_DELIMITER)) {
    const order = parseOrderStatement(entityName, statement);
    if (order !== undefined) {
      draft.orders.push(order);
    }
  }
}

/** `P:Show` accepts the literal `ALL` in addition to a numeric page size. */
function applyPageShowEntry(draft: SmartListQueryDraft, value: string | number | boolean): void {
  if (typeof value === 'string' && value.trim().toUpperCase() === PAGE_RECORDS_SHOW_ALL_KEYWORD) {
    draft.pageRecordsShow = PAGE_RECORDS_SHOW_ALL;
    return;
  }
  const show = readAcceptablePageValue(value);
  if (show !== undefined) {
    draft.pageRecordsShow = show;
  }
}

/** Dispatches one `rc` entry onto the draft by its data-key prefix. */
function applyInputEntry(
  entityName: SmartListEntityName,
  draft: SmartListQueryDraft,
  key: string,
  value: string | number | boolean,
): void {
  /* SEC-09 — EVERY PROPERTY PATH THAT REACHES A DRAFT IS RESOLVED AGAINST THE ENTITY SCHEMA FIRST.
   *
   * `resolveSmartListPropertyIdentifier` returns `undefined` for any path whose segments do not
   * resolve, and an unresolvable entry is DROPPED rather than reported. That is not a softened
   * check: it is the legacy behaviour. `HibachiSmartList.cfc` resolves filters at :L362, ranges at
   * :L449, orders at :L480 and keyword properties at :L487, and an unresolvable path there yields a
   * query with the entry MISSING and no error anywhere. Raising instead would turn a silently
   * ignored request key into a failed request — a behaviour change in the opposite direction, and
   * one AAP §0.8.2 Guideline 2 forbids.
   *
   * ⛔ THE VALIDATION LIVES HERE, IN THE ONE SHARED TRANSLATOR, AND NOT IN A PER-SERVICE COPY.
   * Every SmartList consumer — sku, option and optionGroup — is routed through this function, so
   * closing the surface here closes it for all of them at once. A per-service copy would harden
   * only the service that carried it and would leave its siblings open, which is precisely the
   * asymmetry that made a local translator the wrong home for this rule. */
  const resolve = (raw: string): SmartListPropertyIdentifier | undefined =>
    resolveSmartListPropertyIdentifier(entityName, raw);

  if (key.startsWith(FILTER_PREFIX)) {
    const propertyIdentifier = resolve(key.slice(FILTER_PREFIX.length));
    if (propertyIdentifier !== undefined) {
      draft.filters.push({ propertyIdentifier, value });
    }
    return;
  }
  if (key.startsWith(FILTER_REMOVAL_PREFIX) && readsAsCfmlBoolean(value) && toCfmlBoolean(value)) {
    removeEntriesForProperty(draft.filters, key.slice(FILTER_REMOVAL_PREFIX.length));
    return;
  }
  if (key.startsWith(IN_FILTER_PREFIX)) {
    const propertyIdentifier = resolve(key.slice(IN_FILTER_PREFIX.length));
    if (propertyIdentifier !== undefined) {
      draft.inFilters.push({ propertyIdentifier, value });
    }
    return;
  }
  if (
    key.startsWith(IN_FILTER_REMOVAL_PREFIX) &&
    readsAsCfmlBoolean(value) &&
    toCfmlBoolean(value)
  ) {
    removeEntriesForProperty(draft.inFilters, key.slice(IN_FILTER_REMOVAL_PREFIX.length));
    return;
  }
  if (key.startsWith(LIKE_FILTER_PREFIX)) {
    const propertyIdentifier = resolve(key.slice(LIKE_FILTER_PREFIX.length));
    if (propertyIdentifier !== undefined) {
      draft.likeFilters.push({
        propertyIdentifier,
        value: buildPatternFilterValue(String(value)),
      });
    }
    return;
  }
  if (
    key.startsWith(LIKE_FILTER_REMOVAL_PREFIX) &&
    readsAsCfmlBoolean(value) &&
    toCfmlBoolean(value)
  ) {
    removeEntriesForProperty(draft.likeFilters, key.slice(LIKE_FILTER_REMOVAL_PREFIX.length));
    return;
  }
  if (key.startsWith(RANGE_PREFIX)) {
    const range = parseRangeValue(entityName, key.slice(RANGE_PREFIX.length), String(value));
    if (range !== undefined) {
      draft.ranges.push(range);
    }
    return;
  }
  if (key === ORDER_BY_KEY) {
    applyOrderByEntry(entityName, draft, String(value));
    return;
  }
  if (key === PAGE_SHOW_KEY) {
    applyPageShowEntry(draft, value);
    return;
  }
  if (key === PAGE_START_KEY) {
    const start = readAcceptablePageValue(value);
    if (start !== undefined) {
      draft.pageRecordsStart = start;
    }
    return;
  }
  if (key === PAGE_CURRENT_KEY) {
    const current = readAcceptablePageValue(value);
    if (current !== undefined) {
      draft.currentPageDeclaration = String(current);
    }
  }
}

/** Folds the draft into a {@link SmartListQuery}, omitting every section the input did not populate. */
function composeQuery<TEntityName extends SmartListEntityName>(
  options: SmartListTranslationOptions<TEntityName>,
  draft: SmartListQueryDraft,
): SmartListQuery<TEntityName> {
  const whereGroup: SmartListWhereGroup = {
    ...(draft.filters.length > 0 ? { filters: draft.filters } : {}),
    ...(draft.likeFilters.length > 0 ? { likeFilters: draft.likeFilters } : {}),
    ...(draft.inFilters.length > 0 ? { inFilters: draft.inFilters } : {}),
    ...(draft.ranges.length > 0 ? { ranges: draft.ranges } : {}),
  };
  const pagination: SmartListPagination = {
    ...(draft.pageRecordsStart !== undefined ? { pageRecordsStart: draft.pageRecordsStart } : {}),
    ...(draft.pageRecordsShow !== undefined ? { pageRecordsShow: draft.pageRecordsShow } : {}),
    ...(draft.currentPageDeclaration !== undefined
      ? { currentPageDeclaration: draft.currentPageDeclaration }
      : {}),
  };

  // The caller's structural additions, applied AFTER the owning service's base joins — the legacy's
  // own order, since `integrationServices/google/controllers/feed.cfc:L64-L66` mutates the object the
  // service has already built at `:L63`. See `SmartListInput.additionalJoins`.
  const additionalJoins = options.input?.additionalJoins;
  const joins: readonly SmartListJoin[] | undefined =
    additionalJoins !== undefined && additionalJoins.length > 0
      ? [...(options.joins ?? []), ...additionalJoins]
      : options.joins;

  return {
    entityName: options.entityName,
    ...(joins !== undefined ? { joins } : {}),
    ...(options.keywordProperties !== undefined
      ? { keywordProperties: options.keywordProperties }
      : {}),
    ...(Object.keys(whereGroup).length > 0 ? { whereGroups: [whereGroup] } : {}),
    ...(draft.keywords.length > 0 ? { keywords: draft.keywords } : {}),
    ...(draft.orders.length > 0 ? { orders: draft.orders } : {}),
    ...(Object.keys(pagination).length > 0 ? { pagination } : {}),
  };
}

/**
 * The per-call inputs to {@link translateSmartListInput}.
 *
 * `joins` and `keywordProperties` are the only legitimate per-consumer variation: they are STRUCTURAL
 * declarations the calling service owns (`SkuService` declares four joins and its keyword properties;
 * `OptionService` declares none), whereas everything else in the grammar is framework behaviour and
 * must not vary by caller. Passing them in is what allows one translator to serve both without either
 * service re-deriving the grammar.
 *
 * ⭐ GENERIC IN THE ROOT ENTITY, SO THE LITERAL SURVIVES THE TRANSLATION. `SmartListQueryPort.execute`
 * derives its record type from `query.entityName` through `SmartListEntityRecordTypes`, which it can
 * only do while the particular name a caller wrote is still visible in the type. Were this member typed
 * as the bare union, every query this translator produced would arrive at the port having forgotten
 * which entity it selects from, and no caller could hand one straight to the port. The parameter
 * DEFAULTS to the full union, so the many places that describe a translation without caring which
 * entity it names are unaffected.
 *
 * @typeParam TEntityName - The root entity, inferred from the `entityName` supplied.
 */
export interface SmartListTranslationOptions<
  TEntityName extends SmartListEntityName = SmartListEntityName,
> {
  /**
   * The entity the query selects from, e.g. `SlatwallSku`.
   *
   * ⛔ TYPED AS `SmartListEntityName`, NOT `string`, AND THAT IS LOAD-BEARING FOR SEC-09. This is
   * the root every caller-supplied property path is resolved against by
   * {@link resolveSmartListPropertyIdentifier} below. A `string` here would leave the resolver with
   * no schema to consult and would reopen the identifier surface that the branded
   * {@link SmartListPropertyIdentifier} exists to close.
   */
  readonly entityName: TEntityName;

  /** The raw FW/1 `rc` data structure. An absent input still yields joins and keyword properties. */
  readonly input?: SmartListInput | undefined;

  /** Structural joins the calling service declares for every one of its SmartLists. */
  readonly joins?: readonly SmartListJoin[] | undefined;

  /** Weighted keyword properties the calling service declares for keyword search. */
  readonly keywordProperties?: readonly SmartListKeywordProperty[] | undefined;
}

/**
 * Translates an FW/1 `rc` data structure into a {@link SmartListQuery} — the single authority for the
 * data-key grammar, consumed by every service that exposes a SmartList member (F10).
 *
 * Only entries whose value is a CFML simple value participate, because the legacy `rc` reaches
 * `HibachiSmartList` through URL and form scopes that cannot carry anything else; a structure or array
 * arriving under a recognised key is ignored rather than coerced. Unrecognised keys are ignored too,
 * which is what lets `keyword`, `keywords` and any application-specific key coexist with the grammar.
 *
 * Pure and synchronous: it performs no data access, holds no state between calls, mutates neither the
 * input nor module scope, and cannot throw. Every rejection path returns a query with that section
 * omitted rather than raising, exactly as the legacy `add*` members silently decline a value they do
 * not accept.
 *
 * @param options - The entity name, the raw input, and the caller's structural declarations.
 * @returns The immutable query description, with every unpopulated section absent.
 */
export function translateSmartListInput<TEntityName extends SmartListEntityName>(
  options: SmartListTranslationOptions<TEntityName>,
): SmartListQuery<TEntityName> {
  const draft: SmartListQueryDraft = {
    filters: [],
    likeFilters: [],
    inFilters: [],
    ranges: [],
    orders: [],
    keywords: [],
  };

  if (options.input === undefined) {
    return composeQuery(options, draft);
  }

  const entries = options.input as Readonly<Record<string, unknown>>;
  for (const key of Object.keys(entries)) {
    const value = entries[key];
    if (isCfmlSimpleValue(value)) {
      applyInputEntry(options.entityName, draft, key, value);
    }
  }

  const singularKeyword = entries[KEYWORD_KEY];
  const pluralKeywords = entries[KEYWORDS_KEY];
  const rawKeywords = typeof singularKeyword === 'string' ? singularKeyword : pluralKeywords;
  if (typeof rawKeywords === 'string') {
    draft.keywords = parseKeywords(rawKeywords);
  }

  return composeQuery(options, draft);
}

/* ================================================================================================
 * THE JOIN MERGER — RELOCATED HERE WITH THE REST OF THE SMART-LIST INPUT GRAMMAR
 * ================================================================================================
 *
 * WHY IT MOVED, AND WHY IT MOVED HERE RATHER THAN STAYING BEHIND. This function was declared in
 * `src/ports/SmartListQueryPort.ts` alongside the `rc` grammar and the range grammar. All three are
 * working function bodies rather than contracts, and a port declares contracts; the other two were
 * relocated into this module and this one is the third. Nothing about it changed in the move — the
 * body, the first-declaration-wins polarity and the freeze are byte-for-byte what that module
 * declared — so no behaviour is at stake in the relocation, only where the code lives.
 *
 * ⛔ THE PORT NOW EMITS NO CALLABLE CODE BEYOND ITS ONE GUARD, WHICH IS WHAT ITS HEADER CLAIMS. That
 * header states consumers import the grammar from this module; leaving the merger behind would have
 * made that statement false for one identifier, and a header that is true for two of three callables
 * is a header a reader cannot rely on. `resolveSmartListPropertyIdentifier` stays there because it
 * resolves against `SMARTLIST_ENTITY_SCHEMA`, which is the port's own declared shape, and this module
 * imports it from there rather than copying it.
 * ---------------------------------------------------------------------------------------------- */

/**
 * Merge a caller's extra joins into a member's own base joins, keeping the base joins first and
 * dropping any duplicate.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * WHY A MEMBER NEEDS THIS AT ALL — THE LEGACY EXTENDS A SMART LIST FROM OUTSIDE THE SERVICE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * `integrationServices/google/controllers/feed.cfc:L63` calls the SKU smart-list member with ZERO
 * arguments and then MUTATES the object it gets back, adding three related-property joins at
 * `:L64-L66`. The service's own joins are already on that object, so the controller's additions are
 * genuinely additive and the legacy's `addRelatedProperty` is idempotent per relationship.
 *
 * This port returns a materialised RESULT rather than a mutable smart-list object, so there is nothing
 * for a caller to mutate afterwards and the additions have to travel INTO the member. That is the
 * "structural channel" this function completes: the caller hands over joins, the member merges them
 * with its own and passes one list to {@link translateSmartListInput}.
 *
 * ───────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY DUPLICATES MUST BE DROPPED RATHER THAN CONCATENATED
 * ───────────────────────────────────────────────────────────────────────────────────────────────────
 * `feed.cfc:L64` joins `SlatwallSku -> product`, and the SKU service's own base joins ALREADY contain
 * that exact join (`model/service/SkuService.cfc:L314`). Concatenating would emit the same join twice,
 * which in the legacy is a no-op — `addRelatedProperty` keys on the relationship — but in emitted SQL
 * is a second join of the same table under a second alias. That changes the statement, and with a
 * fanning relationship it changes the row multiplicity too. So a join is admitted only when no earlier
 * entry already declares the same `parentEntityName` + `relatedProperty` pair.
 *
 * ⚠️ THE FIRST DECLARATION WINS, INCLUDING ITS `joinType`. If a base join omits `joinType` and an extra
 * join of the same relationship declares `left`, the base entry stands. That is the safe direction
 * here: the emitter resolves an absent `joinType` to a LEFT join anyway
 * (`org/Hibachi/HibachiSmartList.cfc:L539-L541`), so keeping the base entry cannot narrow a left join
 * into an inner one and cannot drop a row the caller expected to keep. Letting the LATER entry win
 * could do exactly that, which is why the polarity is stated rather than left to read off the loop.
 *
 * @param baseJoins - The member's own joins, emitted first and never dropped.
 * @param additionalJoins - A caller's joins. `undefined` returns `baseJoins` unchanged, so a member
 *   that no caller extends pays nothing and emits precisely the statement it emitted before.
 * @returns A frozen list. Frozen because a member's base joins are module-scope constants and a
 *   returned array that a caller could mutate would let one invocation edit the next one's selection on
 *   a warm container (M7).
 */
export function mergeSmartListJoins(
  baseJoins: readonly SmartListJoin[],
  additionalJoins?: readonly SmartListJoin[],
): readonly SmartListJoin[] {
  if (additionalJoins === undefined || additionalJoins.length === 0) {
    return baseJoins;
  }

  const merged: SmartListJoin[] = [];
  const seen = new Set<string>();
  for (const join of [...baseJoins, ...additionalJoins]) {
    const key = `${join.parentEntityName}.${join.relatedProperty}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(join);
  }
  return Object.freeze(merged);
}

/* ------------------------------------------------------------------------------------------------
 * FOLDED IN: `buildIdentifierQuery`, hoisted out of the three byte-identical readings it had grown
 * into (`../services/ProductService.ts`, `../services/OptionService.ts` and the inline copy in
 * `../config/container.ts`). It is stated once, here, beside the `translateSmartListInput` grammar
 * every smart list already routes through — the same host the rest of the former
 * `src/util/smartListInput.ts` was folded into, so the consolidation adds no import edge: both
 * services and the composition root already depend on this port.
 * ---------------------------------------------------------------------------------------------- */

/**
 * Describes a primary-key load as a single-filter dynamic query.
 *
 * ⭐ IT IS THE TARGET COUNTERPART OF THE LEGACY IDENTIFIER LOAD, AND IT HAS FOUR CALLERS FOR ONE REASON.
 * `onMissingGetMethod` [org/Hibachi/HibachiService.cfc:L305-L328] resolved a `get`-prefixed member to
 * `get(entityName, id, isReturnNewOnNotFound)` at [:L326], which delegates through
 * [org/Hibachi/HibachiService.cfc:L22-L24] to [org/Hibachi/HibachiDAO.cfc:L6-L26], where the load happens
 * by primary key at [:L13]. Expressed through the query port that becomes a query filtered on the
 * identifier property — which is why `ProductService.getProduct`, `ProductService.getProductType`,
 * `OptionService.getOption`, `OptionService.getOptionGroup`, the product-type ancestry resolver and the
 * SKU write boundary's aggregate read all need the same shape, and why none of them needs a repository
 * member of its own: `../ports/repositories/ProductRepository` deliberately declares only the three
 * business queries the legacy `ProductDAO` declares (S5).
 *
 * ⛔ IT LIVES HERE BECAUSE IT HAD BEGUN TO LIVE IN THREE PLACES. Byte-identical private copies stood in
 * `../services/ProductService.ts` and `../services/OptionService.ts`, and `../config/container.ts` wrote
 * the same query out inline for the product-type resolver. Three readings of one legacy behaviour cannot
 * be kept in step by hand — the module header records that this file's own key grammar had already
 * diverged between two copies before it was consolidated — so the shape is stated once, here, beside the
 * translator every smart list already routes through.
 *
 * ⚠️ THE UNPAGED COLLECTION IS THE ONE TO READ, AND THAT IS THE CALLER'S CHOICE RATHER THAN THIS
 * FUNCTION'S. `SmartListResult` exposes the whole record set and the current page, mirroring
 * [org/Hibachi/HibachiSmartList.cfc:L751] and [:L759]. A primary-key filter can match at most one row
 * either way, but the faithful analogue of a direct primary-key fetch is the unpaged collection with no
 * paging applied, so every caller of this shape executes it through `SmartListQueryPort.executeRecords`
 * — ONE statement, exactly as `entityLoadByPK` at [org/Hibachi/HibachiDAO.cfc:L13] is one statement.
 *
 * @param entityName - The ORM logical entity name to load from.
 * @param propertyIdentifier - The entity's primary-identifier property, resolved against that entity's
 *   own schema by the branded identifier type, so an unresolved path is not assignable here (SEC-09).
 * @param value - The identifier to match.
 * @returns The query description. Nothing is executed.
 */
export function buildIdentifierQuery<TEntity extends SmartListEntityName>(
  entityName: TEntity,
  propertyIdentifier: SmartListPropertyIdentifier<TEntity>,
  value: string,
): SmartListQuery<TEntity> {
  return { entityName, whereGroups: [{ filters: [{ propertyIdentifier, value }] }] };
}

/* ================================================================================================
 * FOLDED IN FROM `src/services/skuSmartListQuery.ts` — AAP §0.3.1 / §0.4.1 FILE INVENTORY
 * ------------------------------------------------------------------------------------------------
 * The SKU smart list's SELECTION — its root entity, its three joins and its five weight-1 keyword
 * properties — plus the composer that turns them into a query description. It was extracted into a leaf
 * module of its own so the Google feed could reach the selection WITHOUT instantiating `SkuService`,
 * which is what closed the performance finding that routing the feed through the service materialised all
 * three legacy smart-list views in order to read one of them. That remedy is intact and unaffected by this
 * move: the selection is still stated exactly once, and the feed still reaches it without the service.
 *
 * ⭐ WHY IT LIVES HERE RATHER THAN IN A MODULE OF ITS OWN. `src/services/skuSmartListQuery.ts` is not one
 * of the files AAP §0.3.1 enumerates, and the plan's inventory is frozen at 102 — a code review classified
 * the surplus as a CRITICAL project-inventory breach and directed that unplanned modules be folded into the
 * approved file whose subject they share. This port is that file: it already owns `translateSmartListInput`
 * and `mergeSmartListJoins`, the only two things the composer called, so the fold REMOVED an import edge
 * rather than adding one; and it is already imported by both consumers — `../services/SkuService.ts` and
 * `../integrations/google/ProductFeedQuery.ts` — so neither acquires a new dependency and no cycle is
 * possible, because a port imports nothing.
 *
 * THE FOLDED MODULE'S OWN HEADER, PRESERVED IN SUBSTANCE. Legacy origin
 * [model/service/SkuService.cfc:L309-L322] — `getSkuSmartList` seeds a smart list with the root entity
 * `SlatwallSku`, three `joinRelatedProperty` calls at :L314-L316 and five `addKeywordProperty` calls at
 * :L318-L322, every one at weight 1. The SELECTION IS OBSERVABLE BEHAVIOUR: the joins decide which rows
 * survive, the keyword properties decide what a search matches, and the ORDER of the joins decides whether
 * a dotted keyword identifier resolves at all. Both callers compose through the one function below and
 * neither restates a single entry of it, so adding, removing, reordering or reweighting anything here
 * changes results for the routed SKU smart list AND for the public product feed at the same time — which
 * is exactly why they are stated once.
 *
 * BOUNDARIES (AAP §0.7.3 S2, S4) — unchanged by the fold, and now trivially satisfied. No SQL, no
 * fragment, no placeholder, no table name, no `mysql2`, no adapter import, no config, handler or AWS type,
 * and no execution: this section composes a DESCRIPTION and returns it. What used to be its two imports
 * are declarations in this very file.
 * ============================================================================================== */

/** `arguments.entityName = "SlatwallSku"` — [model/service/SkuService.cfc:L310]. */
export const SKU_SMART_LIST_ENTITY_NAME = 'SlatwallSku';

/** `SlatwallProduct` is the parent of the second join — [model/service/SkuService.cfc:L315]. */
const PRODUCT_ENTITY_NAME = 'SlatwallProduct';

/** Every `addKeywordProperty` call in the member passes `weight=1` — [:L318-L322]. */
const SKU_KEYWORD_PROPERTY_WEIGHT = 1;

/**
 * The three joins, in source order.
 *
 * ALL THREE EMIT A LEFT JOIN. TWO OMIT THE JOIN TYPE AND ONE SPELLS IT; THE OMISSION IS NOT AN INNER
 * JOIN. [model/service/SkuService.cfc:L314] and [:L315] call `joinRelatedProperty` with no third
 * argument, which defaults `joinType` to the EMPTY STRING at
 * [org/Hibachi/HibachiSmartList.cfc:L212]. The natural reading is that an empty join type means an
 * inner join; it does not. `getHQLFrom` normalises it at [org/Hibachi/HibachiSmartList.cfc:L537-L540]
 * with `if(!len(joinType)) { joinType = "left"; }` before the clause is written, so the empty string
 * is emitted as LEFT. [:L316] passes `"left"` explicitly, which in this codebase is the SAME clause
 * spelled a second way rather than a different one.
 *
 * The join-type semantic is declared once, on `SmartListJoinType` in `../ports/SmartListQueryPort`
 * (Q2), and emitted once, by `resolveJoinKeyword` in `../adapters/mysql/SmartListQueryBuilder`. This
 * block restates neither; it records only WHICH of the three legacy lines spells the type and which
 * two omit it, because that is local to this constant. `SmartListJoin.joinType` is left ABSENT for
 * the two that omit it rather than set to the empty string, so the absent form carries "the legacy
 * default" (S1, `exactOptionalPropertyTypes`), and `joinType: 'left'` is carried on the third entry
 * because [:L316] spells it — not because it is the only left join.
 *
 * CORRECTION, CARRIED FROM THE BLOCK'S PREVIOUS HOME IN `./SkuService`. It once claimed the first two
 * were INNER joins and that the third was the one asymmetry. That was FALSE, and false in the way that
 * is hardest to catch: it quoted the `:L212` empty-string default correctly and then drew the opposite
 * conclusion from it, so the citation read as evidence for the claim it actually contradicted. The
 * runtime was never wrong — `resolveJoinKeyword` has always emitted LEFT for the absent, empty and
 * explicit forms alike — only the explanation was, and the entries below are unchanged.
 */
export const SKU_SMART_LIST_JOINS: readonly SmartListJoin[] = Object.freeze([
  { parentEntityName: SKU_SMART_LIST_ENTITY_NAME, relatedProperty: 'product' },
  { parentEntityName: PRODUCT_ENTITY_NAME, relatedProperty: 'productType' },
  {
    parentEntityName: SKU_SMART_LIST_ENTITY_NAME,
    relatedProperty: 'alternateSkuCodes',
    joinType: 'left',
  },
] satisfies SmartListJoin[]);

/**
 * The five keyword properties, in source order, every one at weight 1.
 *
 * [model/service/SkuService.cfc:L318-L322]. The last three are dotted property identifiers that only
 * resolve because of the joins above — `product.productName` needs the first join,
 * `product.productType.productTypeName` needs the first two, and
 * `alternateSkuCodes.alternateSkuCode` needs the third. Reordering the joins would therefore break
 * keyword search rather than merely change SQL, which is why both collections are frozen together.
 */
export const SKU_SMART_LIST_KEYWORD_PROPERTIES: readonly SmartListKeywordProperty[] = Object.freeze(
  [
    Object.freeze({ propertyIdentifier: 'skuCode', weight: SKU_KEYWORD_PROPERTY_WEIGHT }),
    Object.freeze({ propertyIdentifier: 'skuID', weight: SKU_KEYWORD_PROPERTY_WEIGHT }),
    Object.freeze({
      propertyIdentifier: 'product.productName',
      weight: SKU_KEYWORD_PROPERTY_WEIGHT,
    }),
    Object.freeze({
      propertyIdentifier: 'product.productType.productTypeName',
      weight: SKU_KEYWORD_PROPERTY_WEIGHT,
    }),
    Object.freeze({
      propertyIdentifier: 'alternateSkuCodes.alternateSkuCode',
      weight: SKU_KEYWORD_PROPERTY_WEIGHT,
    }),
  ],
);

/**
 * Describes the SKU smart list's selection: the root entity, the base joins, the keyword properties,
 * and whatever the caller's `data` struct adds to them.
 *
 * ⚠️ IT DESCRIBES, IT DOES NOT EXECUTE, AND THE SEPARATION IS THE WHOLE POINT OF THE FILE. The caller
 * chooses the view: `SmartListQueryPort.execute` for all three legacy views, or
 * `SmartListQueryPort.executeRecords` for the unpaged collection alone. Both receive the SAME
 * description from here, so a difference in statements can only ever be a difference in the view a
 * caller asked for — never a difference in the selection.
 *
 * ⭐ A CALLER'S JOINS LAND AFTER THE SERVICE'S OWN, AND THEY MERGE RATHER THAN CONCATENATE. The legacy
 * returns a MUTABLE smart list, so a caller layers onto it after the member is done: the Google feed
 * takes the list the service built and registers three more joins at
 * `integrationServices/google/controllers/feed.cfc:L64-L66` before filtering it. This port is
 * declare-then-execute, so that contribution travels in `data.additionalJoins` (or, for the service's
 * own trailing parameter, as the second argument here) and is appended AFTER
 * {@link SKU_SMART_LIST_JOINS} — in that order, because [:L314-L316] necessarily ran before the
 * controller could add anything, and because two of the feed's three name `SlatwallProduct` as their
 * parent, an entity the first of these joins is what registers.
 *
 * ⚠️ A REPEATED `parentEntityName.relatedProperty` IS ABSORBED, NOT EMITTED TWICE, AND THE SOURCE SAYS
 * SO RATHER THAN THE INFERENCE. `org/Hibachi/HibachiSmartList.cfc:L212` guards the whole registration
 * with `if(!structKeyExists(variables.entities, newEntityName))`, so naming an already-registered
 * related property is a NO-OP, and `:L549` builds the `FROM` clause by walking that same struct — one
 * join per registered entity, never one per call. The feed's first join repeats [:L314] verbatim, so
 * the description can legitimately hold six entries while the emitted statement holds five;
 * `mergeSmartListJoins` is the single reading of those semantics for every caller, and absent
 * `additionalJoins` it returns the base list BY IDENTITY, so no caller is touched by the merge.
 *
 * @param data the caller's smart-list input struct, in the legacy `applyData` key grammar, or omitted
 *   for the bare selection. `additionalJoins` inside it is the channel a caller contributes structural
 *   joins through.
 * @param additionalJoins joins contributed positionally rather than inside `data` — the channel
 *   `SkuService.getSkuSmartList`'s own trailing parameter forwards. Merged identically.
 * @returns the described selection, rooted at `SlatwallSku` so the port can derive the element type.
 */
export function composeSkuSmartListQuery(
  data?: SmartListInput,
  additionalJoins?: readonly SmartListJoin[],
  /* The ROOT ENTITY STAYS IN THE RETURN TYPE, which is what lets a caller hand the query straight to
   * the port and receive SKUs. `SmartListQueryPort.execute` and `executeRecords` both derive their
   * element type from `query.entityName` through `SmartListEntityRecordTypes`, so widening this to the
   * bare `SmartListQuery` would erase the one fact the derivation reads. */
): SmartListQuery<typeof SKU_SMART_LIST_ENTITY_NAME> {
  return translateSmartListInput({
    entityName: SKU_SMART_LIST_ENTITY_NAME,
    input: data,
    joins: mergeSmartListJoins(SKU_SMART_LIST_JOINS, additionalJoins),
    keywordProperties: SKU_SMART_LIST_KEYWORD_PROPERTIES,
  });
}
