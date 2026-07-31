// ---------------------------------------------------------------------------
// slatwall-ts - SKU repository port
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
//     + 1  one persistence method (see `saveSku` below)
//     = 7  METHODS. LOCKED.
//
//   No eighth method may be added: no load-by-ID, no delete, no count, no
//   existence probe, no bulk save, no overload, no options bag, no cache-clear.
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
//   `getSortedProductSkusID` (SkuDAO.cfc:L172-L220) groups by SKU and orders
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
//   ORM. Every legacy function ported here did exactly that, so all seven
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
//   interface, wired once in `src/handlers/bootstrap.ts`. No runtime scan, no
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
//   `src/repositories/mysql/mysqlSkuRepository.ts`. `src/handlers/bootstrap.ts`
//   WIRES the port to that adapter; it does not implement it. Five obligations
//   transfer to the adapter:
//
//     1. Prepared statements exclusively, with each parsed element of
//        `selectedOptions` bound as its own parameter and never interpolated.
//     2. The AND-of-EXISTS semantics of SkuDAO.cfc:L107-L128 preserved exactly.
//        The extracted SQL lives in
//        `src/repositories/mysql/sql/skusBySelectedOptions.sql.ts`.
//     3. The option-group ordering of SkuDAO.cfc:L172-L220 preserved verbatim.
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

// Exactly two imports, both type-only, both siblings inside `src/domain/**`.
//
// `src/domain/entities/` is not authored yet, so these two specifiers do not
// resolve today and `tsc` reports them as unresolved modules. That is EXPECTED
// AND SANCTIONED: the internal authoring order of this migration is a
// compile-order convenience, not a schedule, and it carries no milestone. Do
// NOT "fix" the diagnostic by deleting an import, by declaring a local `Sku` or
// `Product`, or by relaxing `tsconfig.json`. The specifiers and the exported
// class names are already fixed - `../entities/sku.js` exports `Sku` and
// `../entities/product.js` exports `Product` - so authoring them now is what
// makes the entity sibling land into a contract that already exists.
//
// EXACTLY THREE DIAGNOSTICS FOLLOW FROM THAT, AND ALL THREE ARE THE SAME ROOT
// CAUSE. Two are the expected TS2307 "cannot find module" errors on the lines
// below. The third is less obvious and is recorded here so nobody mistakes it
// for a defect in this file or tries to silence it: because `Sku` currently
// resolves to an ERROR type, TypeScript treats it as `any`, which makes the
// `| undefined` on `getSkuBySkuCode` look redundant and trips
// `@typescript-eslint/no-redundant-type-constituents` at that signature. It is
// an artifact of the missing module, not of the union - and the union is
// load-bearing, because a missing SKU must surface as `undefined` rather than as
// a substituted default.
//
// This was verified by construction rather than argued: a BYTE-IDENTICAL copy of
// this file, placed where the full `src/domain/**` ruleset applies and where the
// two entity modules do resolve, typechecks with zero diagnostics and lints with
// zero errors. All three diagnostics therefore disappear the moment the entity
// sibling lands, and nothing in this file needs to change when it does.
//
// DO NOT paper over the third one with an `eslint-disable` comment. Beyond the
// project's standing ban on suppression comments, `eslint.config.mjs` sets
// `reportUnusedDisableDirectives: 'error'`, so such a directive would become
// unused - and therefore a NEW lint error - the instant the entity modules
// appear. Silencing it today would plant a guaranteed future build break in a
// file whose published names are meant to be stable.
//
// Ports may be authored before entities because the dependency is asymmetric.
// An entity BODY calls port methods, so entities need the full signatures from
// this folder; a port needs only the type NAME and module path from an entity.
// This file returns `Sku` and accepts `Product` and never invokes a member of
// either. The resulting ports-to-entities reference cycle therefore exists
// purely in the type graph and never at runtime: `import type` is fully erased
// at emit, these port files declare interfaces only, and the project-wide
// no-barrel policy means no index module can force eager evaluation of the
// cycle. Never turn either of these into a value import.
import type { Sku } from '../entities/sku.js';
import type { Product } from '../entities/product.js';

// LEGACY-DEFECT [model/service/SkuService.cfc:L281-L282]: getSkuStocksDeletableFlag calls a
// SkuDAO method that does not exist - it is absent from model/dao/, absent from org/Hibachi/,
// and org/Hibachi/HibachiDAO.cfc has no onMissingMethod, so the call cannot be dynamically
// dispatched and the service method throws at runtime today. Verified four ways: the identifier
// occurs at exactly three non-framework sites, namely model/entity/Sku.cfc:L569 (reached from
// getStocksDeletableFlag through a getService("skuService") locator), the service declaration at
// model/service/SkuService.cfc:L281 and the call at model/service/SkuService.cfc:L282; there is no
// declaration anywhere in model/dao/; there is no occurrence anywhere inside org/Hibachi/, so it
// is not inherited from the framework base; and neither org/Hibachi/HibachiDAO.cfc (266 lines) nor
// model/dao/HibachiDAO.cfc (55 lines) declares onMissingMethod, so there is no dynamic-dispatch
// fallback that could rescue it. Deliberately NOT declared on this port; the consuming service
// method is ported as a throwing path in src/services/skuService.ts, not invented. Declaring it
// here - or supplying a stock-deletability method under another name, or a stub returning false -
// would silently repair behaviour and invent a capability the legacy system does not have, and
// this port is budgeted ZERO deliberate divergences.
// Preserved deliberately; do not fix without a product decision.

/**
 * The SKU repository port.
 *
 * Seven methods: the six public data-reading `SkuDAO` functions, plus one
 * persistence method that has no legacy antecedent on that component. The
 * count is locked and the arithmetic behind it is in the file header.
 *
 * Every method returns a promise because every legacy body reached the DAO or
 * the ORM. Parameter types replace the legacy `any` with concrete ones, and
 * legacy parameter OPTIONALITY is preserved exactly: a parameter is optional
 * here if and only if its `<cfargument>` or cfscript declaration omitted
 * `required`.
 *
 * ONE METHOD IS DELIBERATELY ABSENT AND ITS ABSENCE IS PART OF THE CONTRACT.
 * `getSkuStocksDeletableFlag` is NOT declared here, because it does not exist
 * in the legacy DAO. `model/service/SkuService.cfc:L281` declares it and
 * `model/service/SkuService.cfc:L282` calls it on the DAO, and
 * `model/entity/Sku.cfc:L569` reaches that service method through a locator -
 * but there is no declaration anywhere in `model/dao/`, none anywhere inside
 * `org/Hibachi/`, and no `onMissingMethod` in either
 * `org/Hibachi/HibachiDAO.cfc` or `model/dao/HibachiDAO.cfc` that could
 * dispatch it dynamically, so the call cannot resolve and the service method
 * throws at runtime today. Declaring it here - or supplying a stock-deletability
 * method under another name, or a stub returning `false` - would silently repair
 * behaviour and invent a capability the legacy system does not have. The
 * consuming service method is ported as a throwing path in
 * `src/services/skuService.ts` instead. The LEGACY-DEFECT marker in the source
 * immediately above this declaration carries the same finding in the project's
 * uniform marker shape; this paragraph exists so the omission is also visible in
 * the emitted declaration, which is what a consumer of this port reads.
 */
export interface SkuRepository {
  /**
   * Whether any transactional record anywhere in the system references the
   * SKU, or any SKU of the product.
   *
   * Legacy: `SkuDAO.cfc:L53`, `<cffunction>` TAG syntax with
   * `returntype="boolean"`. Its two arguments are declared at
   * `SkuDAO.cfc:L54-L55` with NEITHER `required` NOR a type, so both are
   * optional here, in the legacy order.
   *
   * Verified semantics, all of which the adapter must reproduce:
   *
   *  * `skuID` takes precedence. The legacy body tests for the presence of a
   *    non-null `skuID` first and scopes the count to that single SKU; only
   *    when that test fails does it fall back to scoping by `productID`
   *    (`SkuDAO.cfc:L59-L63`, and again at `SkuDAO.cfc:L87-L91` when binding).
   *  * The reference test is a disjunction over ten separate transactional
   *    relationships - order items, inventory records, order delivery items,
   *    physical count items, stock adjustment delivery items, stock adjustment
   *    items reached through both their source and their destination stock,
   *    stock holds, stock receiver items, and vendor order items
   *    (`SkuDAO.cfc:L65-L85`). ANY one of them existing is enough.
   *  * The legacy body counts matching SKUs and returns `false` only when that
   *    count is zero (`SkuDAO.cfc:L93-L97`), so the flag answers "is this SKU
   *    or product entangled in a transaction", not "how many".
   *
   * Passing neither argument reaches the `productID` branch with nothing to
   * bind, which the legacy engine rejects at execution time. Both parameters
   * stay optional for signature parity, so the adapter must decide that case
   * explicitly rather than inheriting an accident.
   */
  getTransactionExistsFlag(productID?: string, skuID?: string): Promise<boolean>;

  /**
   * Resolve a single SKU by its SKU code or by any of its alternate SKU codes.
   *
   * Legacy: `SkuDAO.cfc:L102`, cfscript, a single `ORMExecuteQuery` at
   * `SkuDAO.cfc:L103`. `skuCode` is `required string` on the DAO and is
   * therefore required here, even though the service passthrough at
   * `model/service/SkuService.cfc:L289` declares it optional one layer up.
   *
   * Two semantics are load-bearing:
   *
   *  * The match is a DISJUNCTION across two columns reached through a left
   *    join to the alternate-SKU-code association: the primary SKU code OR any
   *    alternate SKU code. A single bound value is compared against both.
   *  * The query requests a UNIQUE result (the third argument to
   *    `ORMExecuteQuery` is `true`), so it yields one entity or null. The port
   *    models that as an explicit `undefined`, never `0`, never an empty
   *    object, and never a thrown error baked into the type.
   */
  getSkuBySkuCode(skuCode: string): Promise<Sku | undefined>;

  /**
   * SKUs matching ALL of the supplied options.
   *
   * MUST-PRESERVE BEHAVIOUR. This is the query behind
   * `ProductService.getProductSkusBySelectedOptions()`
   * (`model/service/ProductService.cfc:L104`), one of exactly three behaviours
   * named as must-preserve for this migration.
   *
   * Legacy: `SkuDAO.cfc:L107`, cfscript, with the intent stated in the source's
   * own comment at `SkuDAO.cfc:L106` - it "returns product skus which matches
   * ALL options (list of optionIDs) that are passed in".
   *
   * THE MATCHING SEMANTICS ARE AND-of-EXISTS. A SKU matches only when it
   * satisfies an EXISTS predicate for EVERY option in `selectedOptions`. The
   * predicates are CONJUNCTIVE - not disjunctive, and emphatically not "any
   * of". Treating them as a disjunction returns the wrong SKUs for a configured
   * product, which is the exact failure this note exists to prevent.
   *
   * How the list becomes those predicates, read from the source:
   *
   *  * The statement opens over distinct SKUs joined to their options, seeded
   *    with an always-true predicate (`SkuDAO.cfc:L109-L112`) so that each
   *    appended conjunct concatenates safely.
   *  * The loop at `SkuDAO.cfc:L113-L121` walks the comma-delimited list one
   *    element at a time and appends ONE correlated EXISTS predicate per option
   *    ID, each carrying its own positional placeholder, with the option ID
   *    appended to the bind array in list order. That per-element binding is
   *    the E5 obligation restated at the point it matters: every parsed option
   *    ID is bound as its own prepared-statement parameter and is NEVER
   *    interpolated into SQL text.
   *  * THE COUNT OF SELECTED OPTIONS DOES NOT PARTICIPATE IN THE MATCH. There
   *    is no cardinality test and no grouped having-clause, so a SKU that
   *    carries every selected option PLUS additional options still matches.
   *    The result is "at least these options", not "exactly these options".
   *  * The inner join to the option association means a SKU with no options at
   *    all can never match, and the distinct projection collapses the duplicate
   *    rows that join produces.
   *
   * `selectedOptions` is `required string` in legacy and stays a `string` here
   * for signature parity - it is a comma-delimited list of option IDs, not an
   * array, and it must not be widened to `string[]`. The implementation splits
   * it with the CFML list helpers in `../../lib/cfml/list.js`, which this file
   * deliberately does not import because it declares no behaviour.
   *
   * `productID` is declared without `required` in legacy and is therefore
   * optional here, in the legacy parameter order. Note the asymmetry with the
   * must-preserve caller: `ProductService.cfc:L104` declares it `required` one
   * layer up, so the port is the wider contract. When supplied, its predicate
   * is appended LAST and bound LAST (`SkuDAO.cfc:L123-L126`), and it is gated
   * on presence ALONE - unlike `searchSkusByProductType`, the legacy body
   * applies no emptiness test, so an empty string still narrows the query.
   */
  getSkusBySelectedOptions(selectedOptions: string, productID?: string): Promise<Sku[]>;

  /**
   * SKU search by SKU-code fragment, optionally narrowed to product types.
   *
   * Legacy: `SkuDAO.cfc:L130`, cfscript. BOTH parameters are declared without
   * `required`, so both are optional here, in the legacy order. Consumed as a
   * pure passthrough at `model/service/SkuService.cfc:L271-L273`.
   *
   * Verified semantics:
   *
   *  * `term` drives a contains-match against the SKU code only. The legacy
   *    body wraps it in wildcards and binds it as a parameter
   *    (`SkuDAO.cfc:L132-L133`), so the wildcards are part of the bound VALUE
   *    and the term never reaches the statement text. Omitting `term` leaves
   *    the legacy body with nothing to interpolate into that value, which the
   *    engine rejects; the parameter stays optional for parity, so the adapter
   *    must decide that case explicitly.
   *  * `productTypeID` is applied only when it is present AND non-blank after
   *    trimming (`SkuDAO.cfc:L134`) - a real emptiness test, in contrast to
   *    `getSkusBySelectedOptions`, which tests presence alone.
   *  * `productTypeID` is a comma-delimited LIST, not a single identifier. The
   *    legacy body binds it as a multi-value list (`SkuDAO.cfc:L136`) feeding a
   *    product-type IN-list nested inside a product subquery. It therefore
   *    stays a `string` here for the same reason `selectedOptions` does, and
   *    every element of it is bound as its own parameter by the adapter.
   *
   * ONE RECORDED DIVERGENCE OF SHAPE, deliberate and visible. The legacy body
   * does not hydrate entities: it walks the result set and projects an array of
   * two-key structures holding the SKU's identifier and its code
   * (`SkuDAO.cfc:L139-L147`), a typeahead shape shaped by an admin autocomplete
   * rather than by the domain. The port returns `Sku[]` because that is the
   * signature the interface mapping fixes for this method at both the port and
   * the service tier, and because no projection type may be invented for a
   * repository whose every other read returns entities or identifiers.
   * Hydrating the entity is therefore the adapter's job at the repository
   * boundary, which is exactly where the fetch-shape decision belongs.
   *
   * `searchProductsByProductType` (`model/dao/ProductDAO.cfc:L419`) is the
   * PRODUCT-shaped sibling of this method and belongs to
   * `productRepository.ts`. It is not declared here.
   */
  searchSkusByProductType(term?: string, productTypeID?: string): Promise<Sku[]>;

  /**
   * Every SKU of a product, with the eager-load shape chosen by the caller.
   *
   * Legacy: `SkuDAO.cfc:L150`, cfscript, declared
   * `(required any product, required any fetchOptions)`. BOTH stay required
   * here and in the legacy order, and `fetchOptions` gets NO default value -
   * legacy declared it required, and a default parameter value would be a
   * runtime value in a file that emits none. The one-layer-up service wrapper
   * at `model/service/SkuService.cfc:L220` is where a default lives in legacy,
   * and that is where it stays.
   *
   * `product` replaces the legacy `any` with the concrete entity because the
   * legacy body reads two things off it: the base product type that selects the
   * eager-load branch, and the product identifier that scopes the query
   * (`SkuDAO.cfc:L154-L165`).
   *
   * `fetchOptions === true` means the returned SKUs arrive with their
   * associations ALREADY MATERIALIZED rather than lazily traversable. Which
   * association depends on the product's base product type, and the legacy body
   * is explicit about it: merchandise products eagerly fetch the SKU's options
   * (`SkuDAO.cfc:L156-L157`), which is the in-scope path here; content-access
   * products fetch access contents (`SkuDAO.cfc:L154-L155`) and subscription
   * products fetch subscription benefits (`SkuDAO.cfc:L158-L160`), both of
   * which serve out-of-scope features whose collaborators are the
   * `subscriptionTermProvider` port and - for content access - no port at all.
   * `fetchOptions === false` returns the SKUs without that eager fetch.
   *
   * This flag IS the fetch-shape decision, surfaced into the signature instead
   * of buried in a query. It is the whole eager-load vocabulary this port
   * offers: no `include` parameter and no options bag may be added beside it.
   *
   * The legacy body also requests a case-insensitive comparison
   * (`SkuDAO.cfc:L165`), matching CFML's case-insensitive default. CFML
   * comparisons are case-insensitive and TypeScript's are not, so the adapter
   * must carry that intent deliberately rather than inherit it.
   */
  getProductSkus(product: Product, fetchOptions: boolean): Promise<Sku[]>;

  /**
   * The identifiers of a product's SKUs, ordered by option-group sort order.
   *
   * Legacy: `SkuDAO.cfc:L172`, `<cffunction>` TAG syntax wrapping a raw
   * `<cfquery>` - and that query body, not any paraphrase of it, is the source
   * of truth. Its single argument is declared
   * `type="string" required="true"` at `SkuDAO.cfc:L173`.
   *
   * TODO [carried forward verbatim from model/dao/SkuDAO.cfc:L172, where the
   * legacy source comment at SkuDAO.cfc:L177 reads "TODO: test to see if this
   * query works with DB's other than MSSQL and MySQL"]. The ordering
   * expression is written twice - once with explicit integer casts for
   * Microsoft SQL Server and once without (`SkuDAO.cfc:L194-L198`) - and the
   * legacy author recorded that no other database engine was ever exercised
   * against it. This TODO is carried forward as an explicitly flagged TODO and
   * is deliberately NOT resolved and NOT deleted here. It is narrowed rather
   * than closed: the target supports the MySQL branch ONLY, and the legacy
   * runtime probe that chose between the branches by inspecting the database
   * product name (`config/configORM.cfm:L1-L15`) is replaced by explicit
   * environment configuration in `src/repositories/mysql/dialect.ts`. Closing
   * this TODO would require exercising a third engine, which is a product
   * decision and not a port-level one.
   *
   * THE ORDERING IS PART OF THE CONTRACT. The legacy query joins SKUs through
   * their options to those options' option groups, groups by SKU, and orders by
   * a SUM in which each option's sort order is multiplied by a power of ten
   * whose exponent is the distance between that option group's sort order and
   * the next available option-group sort order (`SkuDAO.cfc:L191-L198`). The
   * effect is a positional, digit-per-option-group ordering: the option GROUP's
   * sort order sets the place value and the OPTION's sort order is the digit
   * sitting at it. The implementation must preserve this exactly and must not
   * substitute a different sort. Contrast
   * `promotionRepository.getActivePromotionRewards`, whose legacy query has no
   * ordering clause at all and must not gain one.
   *
   * Two consequences of the join shape are worth stating because the ordering
   * hides them: the joins are inner, so a SKU carrying no options is absent
   * from the result entirely, and the grouping is what allows one row per SKU
   * despite one joined row per option.
   *
   * THE NAME ENDS IN `ID` BECAUSE THE METHOD RETURNS IDENTIFIERS, NOT
   * ENTITIES, and the return type says so. Legacy hands back a single-column
   * result set of SKU identifiers (`SkuDAO.cfc:L178-L201`), and both consumers
   * immediately flatten it into a plain array of those identifiers
   * (`model/service/SkuService.cfc:L228-L230` and
   * `model/service/SkuService.cfc:L256-L258`) before using it as a sort key.
   * `string[]` is therefore the faithful array-of-identifiers projection of
   * that result set, and it retires the duplicated flattening loop as a matter
   * of course. Do NOT "improve" this to return `Sku[]`: interface parity is the
   * acceptance contract, and the legacy name would then lie about what the
   * method hands back.
   *
   * The place-value exponent comes from a private cache accessor
   * (`SkuDAO.cfc:L204`) that memoises the highest option-group sort order, and
   * the legacy query interpolates that number directly into its ordering
   * expression. The adapter binds it instead, and request-scopes the cache
   * behind it.
   */
  getSortedProductSkusID(productID: string): Promise<string[]>;

  /**
   * Persist a SKU and return the persisted entity.
   *
   * THIS NAME HAS NO LEGACY ANTECEDENT. `SkuDAO.cfc` declares no persistence
   * function at all, because legacy SKU writes went through framework CRUD
   * rather than through the DAO: `SkuService.createSkus` builds entities with
   * the framework's SKU factory (`model/service/SkuService.cfc:L92`,
   * `L127`, `L154`, `L182` and `L192`) and leaves saving to the inherited
   * service and DAO base classes. Hibernate is gone, and with it
   * `super.save()`, the framework DAO's save and the entity-factory call have
   * no equivalent in a driver-only stack, so SKU persistence has to become an
   * explicit, named method on this port. It is declared here as the seventh and
   * final method, and it is deliberately minimal: one entity in, the persisted
   * entity out.
   *
   * Callers. `SkuService.createSkus` (`model/service/SkuService.cfc:L58`) is
   * the primary one, and the image-upload path
   * (`model/service/SkuService.cfc:L210`) is the second the plan names as
   * persisting a mutated SKU.
   *
   * A structural execution-model fact about the first of those, stated because
   * it shapes the SERVICE tier and not this port. `createSkus` drives an
   * odometer across the FULL CARTESIAN PRODUCT of the product's option groups
   * (`model/service/SkuService.cfc:L109-L121`, with the combination count
   * accumulated at `model/service/SkuService.cfc:L85`), so the number of SKUs
   * it creates is UNBOUNDED BY CONSTRUCTION - it is the product of every option
   * group's size, with nothing in the legacy code bounding it. Under the CFML
   * host that ran inside an ambient transaction; Lambda offers no ambient
   * transaction, so the explicit batch limits, the idempotency on retry and the
   * documented compensation story that replace it all live at the SERVICE tier,
   * where the loop lives.
   *
   * Consequently NO batch size, limit, timeout, retry count or transaction
   * parameter appears on this method, and none may be added. This port
   * describes one durable write of one entity. The paragraph above records
   * where an execution-model concern is handled; it asserts no target, no
   * measurement and no numeric bound of any kind, because the legacy system
   * states none and none may be invented.
   *
   * There is deliberately no bulk, `saveAll` or `saveMany` variant, and no
   * delete: one persistence method, and the count stays at seven.
   */
  saveSku(sku: Sku): Promise<Sku>;
}
