// SKU repository port: the reads and writes behind `SkuService` and the SKU side
// of the catalog.
//
// Replaces `model/dao/SkuDAO.cfc` (228 lines), which mixes cfscript with
// `<cffunction>` tag syntax; the tag-syntax bodies carry the raw SQL and are the
// source of truth for the statements the adapter reproduces.
//
// PARAMETERIZED SQL. This file declares interfaces only and contains no SQL, so
// the prepared-statement obligation that preserves `cfqueryparam`'s
// injection-safety guarantee transfers wholly to `src/repositories/mysql/**`. The
// comma-delimited option list in particular must be split and each element bound
// as its own parameter, never interpolated into statement text.
//
// PURPOSE
//   The port that replaces `model/dao/SkuDAO.cfc` (228 lines). That component
//   is MIXED syntax: `getSkuBySkuCode`, `getSkusBySelectedOptions`,
//   `searchSkusByProductType` and `getProductSkus` are cfscript, while
//   `getTransactionExistsFlag`, `getSortedProductSkusID` and the two
//   option-group sort-order helpers are `<cffunction>` tag syntax - and it is
//   the TAG-syntax methods that carry the raw `<cfquery>` bodies. Those bodies
//   are the source of truth for join, filter and ordering semantics; this file
//   describes those semantics in prose and declares the resulting contract.
//
// THIS FILE DECLARES INTERFACES ONLY. IT EMITS NO RUNTIME JAVASCRIPT.
//   No class, no constant, no enum, no function body, no default parameter
//   value, no driver type and no SQL of any kind. Compiling this module
//   produces at most an empty-module marker, and both `import type` statements
//   below are fully erased at emit. Any `const`, `class`, `enum` or function
//   body appearing in the emitted output means this file is wrong.
//
// THE METHOD COUNT IS SEVEN, NOT EIGHT
//   `SkuDAO.cfc` declares eight functions. Two of them are not port surface,
//   so the arithmetic runs:
//
//     8 declared functions
//     - 1  getNextOptionGroupSortOrder (SkuDAO.cfc:L204) - access="private".
//            An internal cache accessor that memoises the highest option-group
//            sort order into a component-level property. Not DAO surface, and
//            never something a consumer calls.
//     - 1  clearNextOptionGroupSortOrder (SkuDAO.cfc:L222) - public, but a
//            DEAD internal cache-clear. It has zero callers anywhere in the
//            repository, and its guard condition is INVERTED
//            (SkuDAO.cfc:L222-L226 deletes the cache key only when that key is
//            absent), so it can never fire. It is an implementation detail of
//            src/repositories/mysql/mysqlSkuRepository.ts, not a contract.
//     = 6  ported DAO read methods
//     + 1  one single-SKU persistence method (see `saveSku` below)
//     = 7  METHODS. LOCKED.
//
//   No eighth method may be added: no load-by-ID, no delete, no count, no
//   existence probe, NO BULK SAVE, no overload, no options bag, no cache-clear.
//
// ★★ THIS PORT BRIEFLY DECLARED AN EIGHTH MEMBER, AND THE RECORD OF ITS REMOVAL
// BELONGS WITH THE ARITHMETIC THAT ONCE ACCOMMODATED IT
//   A `saveSkus(skus: readonly Sku[]): Promise<Sku[]>` was added here, and the
//   arithmetic above was rewritten to close at eight to make room for it. Its
//   reasoning was that `SkuDAO.cfc` was never the whole legacy write path -
//   persistence also reached a SKU through Hibernate's flush, and that flush was
//   INHERENTLY A BATCH, writing every dirtied SKU of a request as ONE unit of work.
//   `ProductService.processProduct_updateSkus`
//   [model/service/ProductService.cfc:L216-L233] is the path that depends on it: it
//   walks every SKU on a product applying a price and/or a list price, saves nothing
//   itself, and answers the product.
//
//   THAT OBSERVATION ABOUT THE FLUSH IS CORRECT, AND IT STILL DOES NOT AUTHORIZE A
//   PORT MEMBER. The port surface is fixed at the six public DAO reads plus one
//   single-entity persistence method, and an eighth member is an invented
//   requirement however well motivated. The batch semantics the flush provided are
//   not discarded with it - they are relocated to the layer the AAP assigns them to.
//   AAP 0.6.5 is explicit that the bulk mutation paths carry EXPLICIT BATCH LIMITS,
//   IDEMPOTENCY ON RETRY, and A DOCUMENTED COMPENSATION STORY precisely "because
//   there is no ambient transaction to fall back on". It does not say to recreate the
//   ambient transaction as a port member; it says to replace it with compensation at
//   the service tier, which is where `processProduct_updateSkus` now discharges all
//   three obligations.
//
//   WHAT THIS COSTS, STATED PLAINLY RATHER THAN GLOSSED. A loop over `saveSku` opens
//   one unit of work per SKU, so a failure part-way through leaves the earlier SKUs
//   repriced and the rest not - a durable half-application the legacy flush could not
//   produce. That is a real behavioural difference and it is not hidden: the write is
//   idempotent by key, so a retry converges on the intended state rather than
//   compounding, and the batch bound is checked BEFORE the first mutation so the
//   exposure is bounded by construction. The compensation story is written out in full
//   at `ProductService.processProduct_updateSkus`.
//
//   The cascade seam is likewise NOT a member. A product-aggregate write needs to hand
//   its open transaction down to the SKU writer, and that is satisfied by OPTIONAL
//   adapter-only parameters on `saveSku` rather than by a second declaration here: a
//   port member naming a `PreparedStatementExecutor` would put a
//   `src/repositories/**` type on a `src/domain/**` interface, which the layer
//   boundary refuses outright.
//
//   `getSkuStocksDeletableFlag` is the eighth method a reader will look for and
//   NOT find, so its absence is recorded rather than left to inference. It is
//   deliberately not declared here because IT DOES NOT EXIST IN THE LEGACY DAO:
//   `model/service/SkuService.cfc:L281` declares it and `L282` calls it on the
//   DAO, `model/entity/Sku.cfc:L569` reaches the service through a locator, and
//   there is no declaration anywhere in `model/dao/`, none anywhere inside
//   `org/Hibachi/`, and no `onMissingMethod` in either
//   `org/Hibachi/HibachiDAO.cfc` or `model/dao/HibachiDAO.cfc` to dispatch it
//   dynamically - so that service method throws at runtime today. Declaring it
//   here would invent a capability the legacy system does not have. The
//   LEGACY-DEFECT marker immediately above the interface carries the full
//   finding, and the consuming service method is ported as a throwing path in
//   `src/services/skuService.ts`.
//
// WHAT SURVIVES THE EMIT, MEASURED RATHER THAN ASSUMED
//   `tsconfig.build.json` sets `removeComments: false`, so the annotations in
//   this file are part of the deliverable rather than scratch notes. What each
//   emitted artifact actually keeps was measured against tsc 5.9.3 rather than
//   assumed, because the two artifacts keep DIFFERENT halves:
//
//     * the `.js` keeps this file-level banner and nothing else, because the
//       imports and the interface are both erased and a comment attached to an
//       erased declaration is erased with it. The runtime payload is one line:
//       an empty-module marker.
//     * the `.d.ts` keeps every `/** */` block - the interface doc and all
//       seven method docs, including the carried-forward TODO - and drops every
//       `//` line comment in EVERY position. That was verified directly: a line
//       comment survives declaration emit neither at file top, nor above a
//       declaration, nor beside a TSDoc block, nor inside an interface body.
//
//   The consequence is deliberate and should not be "fixed": the two-line
//   LEGACY-DEFECT marker below keeps the mandated `//` shape and its mandated
//   position adjacent to the interface, and appears exactly once, so it lives
//   in the source and in the `.js`-side reasoning above rather than in the
//   `.d.ts`. Its SUBSTANCE is therefore restated in prose in the section above
//   (which the `.js` keeps) and in the interface's own doc comment (which the
//   `.d.ts` keeps), so no reader of either artifact can miss the omission.
//   Duplicating the marker itself would break "exactly once" and is not done.
//
// E5 - PARAMETERIZED SQL: THE OBLIGATION TRANSFERS WHOLLY TO THE ADAPTER
//   This file declares interfaces only and contains no SQL, so the obligation
//   to use prepared statements EXCLUSIVELY - preserving the injection-safety
//   guarantee that `cfqueryparam` provided in the legacy `<cfquery>` bodies -
//   transfers wholly to `src/repositories/mysql/**`.
//
//   On this port that obligation is unusually pointed, because two of the
//   seven methods take a caller-supplied comma-delimited list that the legacy
//   code expands into a variable number of predicates:
//
//     * `getSkusBySelectedOptions(selectedOptions, ...)` expands its list into
//       one repeated EXISTS predicate per option ID (SkuDAO.cfc:L113-L121).
//       EACH parsed option ID must be bound as ITS OWN prepared-statement
//       parameter and must NEVER be interpolated into SQL text. The legacy
//       code already did this correctly, appending one positional placeholder
//       and one array element per iteration; the port must not regress it.
//     * `searchSkusByProductType(..., productTypeID)` reaches a multi-value
//       IN-list that the legacy code bound with `list="true"`
//       (SkuDAO.cfc:L136). The same per-element rule applies: every element of
//       that list is its own bound parameter, never spliced into the statement.
//
//   One legacy site does NOT meet that bar and the adapter must fix it while
//   preserving the result: the option-group place-value exponent used by
//   `getSortedProductSkusID` is INTERPOLATED into the statement text at
//   SkuDAO.cfc:L195 and SkuDAO.cfc:L197. It is a server-derived number rather
//   than caller input, so it is not an injection vector today, but "prepared
//   statements exclusively" admits no exception - the adapter binds it.
//
// B2 - THIS PORT SITS DIRECTLY ON A NAMED MUST-PRESERVE BEHAVIOUR
//   `getSkusBySelectedOptions` (SkuDAO.cfc:L107-L128) is the query that backs
//   `ProductService.getProductSkusBySelectedOptions()`
//   (model/service/ProductService.cfc:L104), which is one of exactly THREE
//   behaviours named as must-preserve for this migration. The other two -
//   promotion discount math together with use-limit enforcement, and the
//   price-group / currency resolution cascade - are supported by sibling ports.
//
//   The matching semantics are AND-of-EXISTS: conjunctive, never disjunctive.
//   The per-method comment on `getSkusBySelectedOptions` states the full
//   contract, including the verified fact that the COUNT of selected options
//   does not participate in the match. Getting this wrong returns the wrong
//   SKUs for a configured product, which is why it is called out twice.
//
// THE OPTION-GROUP `ORDER BY` IS PART OF THE CONTRACT
//   `getSortedProductSkusID` (SkuDAO.cfc:L172-L202 - the `<cffunction>` opens at
//   L172 and closes at L202; L204-L220 is the separate private
//   `getNextOptionGroupSortOrder` and L222-L226 is `clearNextOptionGroupSortOrder`,
//   neither of which is part of this method) groups by SKU and orders
//   by a sum in which each option's sort order is scaled by a power of ten
//   whose exponent is derived from its option group's sort order. The option
//   GROUP's sort order therefore sets the place value (the significance) and
//   the OPTION's sort order is the digit at that place. That ordering is
//   load-bearing: it is precisely why `OptionGroup` is an implicit-scope entity
//   in this migration, pulled in by necessity rather than by name. The
//   implementation MUST preserve it and MUST NOT substitute a different sort.
//
//   Contrast this with `promotionRepository.getActivePromotionRewards`, whose
//   legacy query has NO `ORDER BY` at all and where the implementation must
//   NOT add one - the absence there is what makes legacy reward iteration
//   order non-deterministic, and reproducing that is itself a requirement. The
//   two rules point in opposite directions and both are deliberate: preserve
//   the ordering here, preserve its absence there.
//
// T3 - THE FETCH SHAPE IS DECIDED AT THE REPOSITORY BOUNDARY
//   `ORMExecuteQuery`, `<cfquery>`, `super.save()`, `super.delete()` and
//   Hibernate's lazy collections all collapse into the port methods below.
//   There is no ORM in the target, so associations are MATERIALIZED at the
//   repository boundary and laziness is NOT simulated. The fetch shape becomes
//   an explicit, documented decision made at each repository method inside
//   `src/repositories/mysql/mysqlSkuRepository.ts`, which also owns the
//   row-to-entity factory, port injection into the constructed entities, and
//   the association materialization itself.
//
//   `getProductSkus`' `fetchOptions` flag is that decision surfaced into the
//   signature rather than hidden in a query: the legacy body switches on the
//   product's base product type and eagerly fetches a different association
//   for each (SkuDAO.cfc:L153-L161). More broadly, a returned `Sku` must
//   arrive with whatever associations its consumers read already populated -
//   in particular the per-currency price map that the four-step currency
//   cascade reads (model/entity/Sku.cfc:L367-L433). Materializing that map at
//   the repository boundary is precisely what lets `getPriceByCurrencyCode()`
//   stay SYNCHRONOUS on the entity instead of forcing an async signature onto
//   a simple accessor.
//
//   Removing implicit lazy traversal removes the implicit N+1 traversal that
//   came with it. That is a CORRECTNESS and EXPLICITNESS property - every
//   query the target issues is one a reader can point at in a repository
//   method - and it is stated here as such. It is not a claim about speed, and
//   nothing in this file asserts one.
//
//   No `eagerLoad` or `include` options parameter may be added beyond the
//   legacy `fetchOptions` flag. Inventing one would invent a requirement.
//
// THE ASYNC RULING
//   A method is async if and only if its legacy body reached the DAO or the
//   ORM. Every legacy function ported here did exactly that, and the write
//   method reaches the ORM's own flush, so all seven
//   methods return a promise. Methods that merely traverse already-materialized
//   associations or perform pure arithmetic stay synchronous, and those live on
//   the entities and services rather than on this port.
//
// ABSENT MEANS ABSENT
//   `getSkuBySkuCode` returns `Sku | undefined`. The legacy body passes
//   `true` as the third argument to `ORMExecuteQuery` (SkuDAO.cfc:L103), which
//   requests a unique result and yields null on a miss. The port models that as
//   an explicit `undefined` - never a zero value, never an empty object, never
//   a thrown error baked into the type. This is the same house convention that
//   governs the three currency accessors on `Sku`, where substituting a default
//   for a missing price would silently sell products for free. The
//   array-returning methods return an empty array on no match, never
//   `undefined`.
//
// THE DOMAIN LAYER IMPORTS NOTHING OUTWARD
//   `src/domain/**` may import only from `src/lib/**` and from within
//   `src/domain/**`. The ESLint `no-restricted-imports` block in
//   `eslint.config.mjs` makes a violation a BUILD FAILURE, not a review
//   comment. On a REPOSITORY port the live temptation is the MySQL driver, and
//   it is forbidden here: a port names no driver, no pool, no connection and no
//   row-packet type. It also names no environment value, no datasource, no
//   database-product name and no table name - the physical table names this
//   port ultimately reads and writes are referred to in prose only, never as
//   literals.
//
// THESE NAMES ARE CANONICAL
//   Interface parity is the acceptance contract for this migration, so every
//   method name and every parameter name below is the legacy CFML name carried
//   over VERBATIM in camelCase - including the trailing `ID` on
//   `getSortedProductSkusID`, which must never be "corrected" to `Ids` or
//   `IDs`. ESLint deliberately enables no naming-convention rule for exactly
//   this reason. The five subtrees that will consume this port
//   (`src/domain/entities/`, `src/services/`, `src/repositories/mysql/`,
//   `src/handlers/`, `src/integrations/google/`) are not yet authored, so the
//   names published here are the ones every consumer will be written against.
//   Do not rename them later.
//
// WHAT DOES NOT BELONG ON THIS PORT
//   * `searchProductsByProductType` (model/dao/ProductDAO.cfc:L419) is the
//     sibling method on `productRepository.ts`. Only the SKU-shaped
//     `searchSkusByProductType` (SkuDAO.cfc:L130) is declared here.
//   * Image handling. `SkuService.processImageUpload` reaches an image service
//     through a `getService()` service-locator call
//     (model/service/SkuService.cfc:L210-L218) rather than through the DAO, and
//     it becomes the separate `imageStore` port. No image method here.
//   * Subscription handling. The subscription branch of `createSkus`
//     (model/service/SkuService.cfc:L139-L170) belongs to the
//     `subscriptionTermProvider` port.
//   * Content access. The `contentAccess` sibling branch
//     (model/service/SkuService.cfc:L173-L202) has NO port, and none may be
//     invented: the port folder is locked at thirteen.
//
//   For orientation, `model/service/SkuService.cfc` declares exactly five
//   collaborators - `skuDAO` (L51), `optionService` (L53), `productService`
//   (L54), `subscriptionService` (L55) and `contentService` (L56). The DI/1
//   convention scan that resolved them is replaced by constructor injection:
//   `property name="skuDAO";` becomes a constructor parameter typed to THIS
//   interface, wired once in `src/handlers/bootstrap.ts` (planned). No runtime scan, no
//   service locator.
//
// SCHEMA CONTINUITY
//   Nothing here migrates, renames or adds anything. The adapter behind this
//   port reads and writes the existing Sw-prefixed MySQL tables unchanged.
//   Named here in prose so the constraint is checkable, and named ONLY in
//   prose: SwSku, SwSkuCurrency, SwProduct, SwOption and SwOptionGroup - the
//   SKU table, its per-currency price table, the product table, and the option
//   and option-group tables that back option matching and the sort order
//   above. Every one of those names appears in this file exclusively inside a
//   comment; not one appears as a value, a string literal or an identifier,
//   which is precisely what E6 forbids.
//
// TEST COVERAGE FOR THIS PORT IS NET-NEW, NOT LEGACY PARITY
//   `meta/tests/unit/dao/` contains only `AccountDAOTest` and `PaymentDAOTest`
//   - nothing covering `SkuDAO` - and `meta/tests/unit/service/` contains only
//   AccountService, HibachiService, PaymentService and UtilityRBService tests,
//   none of them in scope. The only legacy suites extended anywhere in this
//   port are `meta/tests/unit/entity/BrandTest.cfc` and
//   `meta/tests/unit/entity/ProductTest.cfc`, and
//   `meta/tests/functional/admin/entity/ProductTest.cfc` is an empty stub that
//   contributes nothing. Coverage for this port is therefore net-new and must
//   never be presented as parity. Every declared method needs a test;
//   SQL-shape and parameter-binding assertions for the implementation belong in
//   `tests/integration/repositories/`, and the AND-of-EXISTS semantics are
//   named in the plan as among the highest-value net-new suites. The test tier
//   is authored separately and none of it lives in this file.
//
// WHO IMPLEMENTS THIS PORT
//   `src/repositories/mysql/mysqlSkuRepository.ts`. `src/handlers/bootstrap.ts` (planned)
//   WIRES the port to that adapter; it does not implement it. Five obligations
//   transfer to the adapter:
//
//     1. Prepared statements exclusively, with each parsed element of
//        `selectedOptions` bound as its own parameter and never interpolated.
//     2. The AND-of-EXISTS semantics of SkuDAO.cfc:L107-L128 preserved exactly.
//        The extracted SQL lives in
//        `src/repositories/mysql/sql/skusBySelectedOptions.sql.ts`.
//     3. The option-group ordering of SkuDAO.cfc:L172-L202 preserved verbatim.
//        The extracted SQL lives in
//        `src/repositories/mysql/sql/sortedProductSkus.sql.ts`.
//     4. The row-to-entity factory, port injection and association
//        materialization, with the fetch shape decided and commented at each
//        repository method. Laziness is not simulated, and the per-currency
//        price map must be materialized so the entity's currency accessors stay
//        synchronous.
//     5. Two legacy artifacts that are POINTERS ONLY here and that adapter's to
//        reproduce and annotate there: the inverted cache-clear condition at
//        SkuDAO.cfc:L222-L226, whose component-level option-group sort-order
//        cache must become request-scoped because module state survives between
//        warm Lambda invocations; and the invalid duplicate `var` declaration
//        at SkuDAO.cfc:L163.
//
// NO USER RULES WERE PROVIDED
//   The project rules document says exactly that, and re-reading it three
//   independent ways returns the same single sentence. No rule is invented to
//   fill the gap, and the absence is not treated as licence to lower the bar:
//   the enterprise substitute standard applies at full strength - maximal
//   strictness with no `any` and no suppression comment, the layer boundary
//   above, one exported unit per file with no barrel, no hardcoded literal of
//   any kind, and every judgment call annotated at the point where it was made.
//   No non-functional requirement is asserted anywhere in this file, because
//   none exists in the source to preserve.
// ---------------------------------------------------------------------------

import type { Sku } from '../entities/sku.js';
import type { Product } from '../entities/product.js';
// LEGACY-DEFECT [model/service/SkuService.cfc:L281-L282]: `getSkuStocksDeletableFlag` calls a
// `SkuDAO` method that does not exist, so the service method throws at runtime today. Verified four
// ways: the identifier occurs at exactly three non-framework sites - [model/entity/Sku.cfc:L569]
// (reached from `getStocksDeletableFlag` through a `getService("skuService")` locator), the service
// declaration at [model/service/SkuService.cfc:L281] and the call at
// [model/service/SkuService.cfc:L282]; there is no declaration anywhere in `model/dao/`; there is
// no
// occurrence anywhere inside `org/Hibachi/`, so it is not inherited; and neither
// `org/Hibachi/HibachiDAO.cfc` nor `model/dao/HibachiDAO.cfc` declares `onMissingMethod`, so no
// dynamic dispatch can rescue it. It is therefore deliberately NOT declared on this port and the
// consuming service method is ported as a throwing path. Declaring it here - or supplying a
// stock-deletability method under another name, or a stub returning `false` - would silently repair
// behaviour and invent a capability the legacy system does not have.
// Preserved deliberately; do not fix without a product decision.

/**
 * The SKU repository port.
 *
 * Seven methods: the six public data-reading `SkuDAO` functions, plus one
 * persistence method that has no legacy antecedent on that component. The
 * arithmetic behind the count, and the record of an eighth member that was
 * briefly declared and has been removed, are in the file header.
 *
 * Every method returns a promise because every legacy body reached the DAO or
 * the ORM. Parameter types replace the legacy `any` with concrete ones, and
 * legacy parameter OPTIONALITY is preserved exactly: a parameter is optional
 * here if and only if its `<cfargument>` or cfscript declaration omitted
 * `required`.
 *
 * `getSkuStocksDeletableFlag` is deliberately absent, and its absence is part of the contract - see
 * the preserved-defect marker above.
 */
export interface SkuRepository {
  // CFML parity [model/dao/SkuDAO.cfc:L53-L98]: the SKU identifier is preferred when both are
  // supplied, and existence is tested by ten `EXISTS` clauses joined with OR — order items,
  // inventory, delivery and receiving items, physical counts, both sides of a stock adjustment,
  // stock holds and vendor order items.
  /**
   * Whether any transaction record references the SKU, or any SKU of the product.
   *
   * @param skuID SKU to test; takes precedence when both arguments are supplied.
   * @param productID product whose SKUs are tested when no SKU is supplied.
   * @returns true when at least one referencing record exists.
   */
  getTransactionExistsFlag(productID?: string, skuID?: string): Promise<boolean>;

  // CFML parity [model/dao/SkuDAO.cfc:L102-L103]: the same value is matched against both the SKU
  // code
  // and the alternate SKU codes, and the legacy call asks for a unique result rather than a list,
  // so
  // it is not written to tolerate two matches.
  /**
   * Load a SKU by its code or one of its alternate codes.
   *
   * @param skuCode code to match.
   * @returns the SKU, or undefined when nothing matches.
   */
  getSkuBySkuCode(skuCode: string): Promise<Sku | undefined>;

  // CFML parity [model/dao/SkuDAO.cfc:L106-L128]: one `exists` clause is appended per selected
  // option
  // and they are joined with AND, so a SKU must carry every option to match — not any of them. This
  // is
  // the behavior the option-driven SKU resolution depends on and it is preserved exactly.
  /**
   * SKUs carrying all of the selected options.
   *
   * @param selectedOptions comma-delimited option identifiers that must all be present.
   * @param productID optional product to restrict the search to.
   * @returns matching SKUs.
   */
  getSkusBySelectedOptions(selectedOptions: string, productID?: string): Promise<Sku[]>;

  // CFML parity [model/dao/SkuDAO.cfc:L130-L148]: the term is matched against the SKU code with a
  // leading and trailing wildcard, and the product-type filter is appended only for a non-blank
  // value.
  // The legacy statement is raw SQL naming `SlatwallSku`, which is the ORM entity name, while the
  // entity maps to table `SwSku` [model/entity/Sku.cfc:L49].
  /**
   * Search SKUs by code.
   *
   * @param term substring matched anywhere in the SKU code.
   * @param productTypeID comma-delimited product types to restrict the search to.
   * @returns matching SKUs.
   */
  searchSkusByProductType(term?: string, productTypeID?: string): Promise<Sku[]>;

  // CFML parity [model/dao/SkuDAO.cfc:L150-L168]: the eager-fetch join is chosen from the product's
  // base type — access contents, options or subscription benefits — and all three branches use an
  // inner join, so a product whose SKUs have none of the fetched children returns nothing when the
  // flag is set.
  /**
   * Every SKU of a product.
   *
   * @param product product whose SKUs are loaded.
   * @param fetchOptions when true, eagerly load the children matching the product's base type.
   * @returns the product's SKUs, unordered.
   */
  getProductSkus(product: Product, fetchOptions: boolean): Promise<Sku[]>;

  // CFML parity [model/dao/SkuDAO.cfc:L172-L202]: ordering is a positional weighting — each
  // option's
  // sort order scaled by a power of ten derived from its option group's sort order — so option
  // groups
  // act as digits and the lowest-ordered group is the most significant.
  /**
   * SKU identifiers for a product, ordered by option group then option sort order.
   *
   * @param productID product whose SKUs are ordered.
   * @returns SKU identifiers in display order.
   */
  getSortedProductSkusID(productID: string): Promise<string[]>;

  // NO LEGACY ANTECEDENT ON `SkuDAO.cfc`, which declares no save of any kind. Persistence reached a
  // SKU through `super.save()` on the service base and through Hibernate's flush, and this member
  // replaces the single-entity half of that. THE BULK HALF IS NOT REPLACED BY A SECOND MEMBER -
  // see the file header for why the flush's batch semantics are discharged at the service tier
  // instead. A TSDoc block is carried here because this was otherwise the only declaration on the
  // interface with no doc comment, and the emitted `.d.ts` keeps only `/** */` blocks, so a
  // consumer reading the declaration file saw this contract stated nowhere at all.
  /**
   * Persist one SKU as its own unit of work.
   *
   * Insert versus update is decided by the entity's own `isNew()` rather than by
   * probing the database, which is the legacy's own discriminator: Hibachi read
   * `getNewFlag()` [org/Hibachi/HibachiEntity.cfc:L571-L576] and never issued a
   * lookup to classify the write.
   *
   * ⚠ BUT `Sku.isNew()` IS NOT THAT LINE, AND THE DIFFERENCE MATTERS TO CALLERS.
   * The framework DERIVES the flag - `if(getPrimaryIDValue() == "") return true;`
   * - whereas the ported `Sku` returns a boolean supplied at construction. The two
   * part company because a SKU draft is built carrying a PROVISIONAL 32-character
   * key, so an identifier test would classify every draft as already persisted and
   * this method would issue an UPDATE that matched no row. `Product.isNew()` does
   * reproduce the identifier test, because a product draft carries `''`. A caller
   * handing over a SKU it constructed itself must therefore set the flag; handing
   * over one this port returned needs nothing, since the flag is false on a
   * persisted instance.
   *
   * The returned entity is a NEW instance reflecting the row that was written,
   * carrying the identifier the adapter minted on an insert and the audit stamps
   * it bound. It is never the argument mutated: the identifier fields on the
   * domain entities are `private readonly`, and the caller's instance was never
   * the row.
   *
   * @param sku the SKU to persist.
   * @returns a new instance reflecting the persisted row.
   */
  saveSku(sku: Sku): Promise<Sku>;
}
