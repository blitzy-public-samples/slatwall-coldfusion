/**
 * Promotion repository port - the domain-side read contract for the promotion subsystem, plus the
 * one rounding-rule lookup that has nowhere else to live.
 *
 * Ported from `model/dao/PromotionDAO.cfc` (593 lines, the largest DAO in the slice, written in
 * `<cffunction>` TAG syntax with embedded `<cfquery>` bodies throughout - which is why those query
 * bodies, and not any prose summary of them, are the source of truth for the adapter). It is the
 * port that `model/service/PromotionService.cfc` reaches through: that component declares exactly
 * three DI/1 collaborators - `promotionDAO` [model/service/PromotionService.cfc:L51],
 * `addressService` [model/service/PromotionService.cfc:L53] and `roundingRuleService`
 * [model/service/PromotionService.cfc:L54] - and the first of them becomes a constructor parameter
 * typed to this interface (T1). No runtime bean-factory scan, no service locator, and therefore no
 * first-scan lock.
 *
 * THE BINDING STANDARD, STATED PLAINLY
 * No user-specified rules were provided for this project: the rules source returns only "No user
 * rules provided.", verified by reading it to the end. None is invented to fill the gap, and the
 * absence is not treated as licence to lower the bar. Enterprise-standard practice governs
 * instead, and the specific commitments it imposes on this file - maximal strictness, the
 * mechanically enforced layer boundary, the closed dependency set, money as `Money`, parameterized
 * SQL, no hardcoded literals, one exported unit per file with no barrels, and the uniform defect
 * marker - are each discharged below and each visible in the code.
 *
 * INTERFACES AND TYPE ALIASES ONLY
 * This module declares four interfaces and nothing else. It emits no runtime JavaScript at all: no
 * class, no constant, no enumeration, no function body, and no default parameter value - a default
 * value is a runtime expression, so the two optional parameters below record their legacy defaults
 * in prose instead. All five imports are `import type` and are fully erased at emit, so the
 * ports/entities relationship - entities take port interfaces as constructor parameters while
 * ports return entity types - exists solely in the type graph and never at runtime. There is no
 * barrel file to force eager evaluation of that cycle, and none may be created. This port is the
 * sharpest live instance of that cycle in the folder: `Product` takes `SalePriceResolver`, declared
 * in THIS file, as an injected constructor parameter, while this file imports four entity types.
 * `import type` on both sides is exactly what makes it safe.
 *
 * THE METHOD COUNT IS SEVEN, AND HERE IS THE ARITHMETIC
 *
 *     6  declared functions in model/dao/PromotionDAO.cfc - every one of them public, every one of
 *          them ported, with no private helper and no seventh declaration in the file:
 *            getActivePromotionRewards          [model/dao/PromotionDAO.cfc:L51]
 *            getPromotionPeriodUseCount         [model/dao/PromotionDAO.cfc:L134]
 *            getPromotionPeriodAccountUseCount  [model/dao/PromotionDAO.cfc:L187]
 *            getPromotionCodeUseCount           [model/dao/PromotionDAO.cfc:L254]
 *            getPromotionCodeAccountUseCount    [model/dao/PromotionDAO.cfc:L274]
 *            getSalePricePromotionRewardsQuery  [model/dao/PromotionDAO.cfc:L298]
 *   + 1  the rounding-rule lookup `getRoundingRuleQuery` [model/dao/RoundingRuleDAO.cfc:L51], the
 *          only declaration in that 69-line DAO, hosted HERE.
 *   = 7  methods. Locked.
 *
 * THERE IS NO FOURTEENTH PORT, AND THERE IS NO `roundingRuleRepository`
 * `src/domain/ports/` holds exactly thirteen port modules and the count is locked. Hosting the
 * rounding-rule lookup on this port is the reason that count holds: `roundingRuleRepository.ts`
 * does not exist, must not be created, and is not to be referenced as a future file. The pairing is
 * not arbitrary - `PromotionReward.roundingRule` is the association that makes discount rounding
 * reachable at all, so the lookup and the rewards that need it belong to the same contract.
 *
 * Equally, no rounding-rule WRITE appears here. `RoundingRuleService.saveRoundingRule`
 * [model/service/RoundingRuleService.cfc:L56] is a service-tier concern, and neither the plan nor
 * the folder layout places a rounding-rule write on this port; adding one would invent a
 * requirement. If a write is later proved unavoidable, that is a plan change to be recorded, not
 * something to pre-empt here.
 *
 * THIS PORT SITS DIRECTLY ON A NAMED MUST-PRESERVE AREA (B2)
 * The behaviour that must survive this migration exactly includes "promotion discount math together
 * with use-limit enforcement semantics". The four use-count methods below ARE the data source for
 * use-limit enforcement, and `getActivePromotionRewards` IS the input to the discount pipeline.
 * Getting either wrong changes the money a customer is charged. Two of the three defect markers in
 * this file - the absent result ordering and the duplicated start-date tests - are behaviours in
 * that category, which is precisely why they are reproduced rather than repaired. Characterization
 * tests elsewhere pin the behaviour including those defects, so a "corrected" adapter fails the
 * gate rather than passing it.
 *
 * THE ABSENT RESULT ORDERING, AND A DELIBERATE ASYMMETRY WITH THE SIBLING PORTS
 * A case-insensitive search for "order by" across the whole of `model/dao/PromotionDAO.cfc` returns
 * nothing: not one of its six functions imposes an ordering. `getActivePromotionRewards` therefore
 * hands back rewards in whatever order the engine produces, and because the promotion engine
 * threads a mutable usage ledger through its iteration over them
 * [model/service/PromotionService.cfc:L297], which reward is allowed depends on which earlier
 * rewards ran. The legacy outcome is genuinely non-deterministic at the boundary of a tie. That is
 * a statement about determinism and correctness, and about nothing else.
 *
 * The asymmetry with the sibling ports is intentional and points in opposite directions:
 * `productTypeRepository`'s product-type-name ascending ordering and `skuRepository`'s option-group
 * sort ordering are load-bearing and must be preserved verbatim, whereas THIS port's ABSENCE of
 * ordering is equally load-bearing and must not be filled in. Both rules are deliberate. Neither
 * generalises to the other.
 *
 * METHOD 6 DECLARES A RESULT CONTRACT, NOT SQL - AND ADMITS TIES
 * `getSalePricePromotionRewardsQuery` [model/dao/PromotionDAO.cfc:L298-L591] is nearly three
 * hundred lines: one preliminary query, a six-branch union, and then three chained in-engine
 * post-processing steps - CFML query-of-queries, each a `dbtype="query"` pass
 * [model/dao/PromotionDAO.cfc:L544-L559, L561-L569, L571-L588]. Node has no equivalent of that
 * in-engine post-processing, so the rewrite - the three steps becoming common
 * table expressions that reduce to the minimum sale price per SKU and join back to recover the
 * winning row's attributes - belongs to
 * `src/repositories/mysql/sql/salePricePromotionRewards.sql.ts` and NOT to this file. That module
 * is named here in prose only; importing it would breach the layer boundary. This port declares
 * only the shape of the rows that come back.
 *
 * The reduction to a MINIMUM admits ties, and the tie must be left alone. Two different rewards can
 * produce the same sale price for the same SKU, and a join back on that minimum then matches more
 * than one row. The legacy chain does not disambiguate them - its final step joins on SKU and sale
 * price alone [model/dao/PromotionDAO.cfc:L584-L587] - so the target must not invent a tiebreaker
 * either: no single-row limit, no secondary sort, no "most recent wins", no reward-identifier
 * ordering. This is the same family of non-determinism as the absent ordering above, and it is
 * recorded here in prose rather than given a marker of its own.
 *
 * One pointer, owned by the adapter and not by this port: the union contains a database-dialect
 * branch [model/dao/PromotionDAO.cfc:L482-L488] where the product-type path concatenation differs
 * by engine, and that becomes a dialect-parameterized fragment in `src/repositories/mysql/**` with
 * only the MySQL branch targeted, `src/repositories/mysql/dialect.ts` having replaced the legacy
 * database-product-name probe [config/configORM.cfm:L1-L15]. No dialect parameter appears on this
 * port.
 *
 * THE WRITE SIDE IS INTENT-BASED, WHICH IS WHY THIS PORT HAS NO WRITES AT ALL There is no
 * entity-lifecycle method here: no load-by-identifier, no save and no delete, for `Promotion`,
 * `PromotionPeriod`, `PromotionCode`, `PromotionQualifier`, `PromotionReward`, `PromotionApplied`
 * or `PromotionAccount`. That is a positive architectural decision rather than an omission, and it
 * distinguishes this port from `productRepository`, which does carry the three lifecycle methods
 * its service tier needs. The promotion engine's write side is expressed as INTENTS RETURNED TO THE
 * CALLER, not as persistence issued from this port:
 * `PromotionService.updateOrderAmountsWithPromotions` [model/service/PromotionService.cfc:L58] is
 * declared `void` and mutates the order aggregate in place, and it becomes a method returning
 * applied-promotion intents keyed by opaque `orderItemID` / `orderFulfillmentID` / `orderID`,
 * because the `Order` aggregate is explicitly out of scope. That inversion is the anti-corruption
 * seam that makes this slice independently deployable, it is one of exactly three budgeted
 * signature reshapings, it is spent by `src/services/promotionService.ts` rather than here, and it
 * is the whole reason no `PromotionApplied` persistence appears on this contract.
 *
 * `model/entity/PromotionAccount.cfc` is inert in this slice - no service references it and
 * `PromotionService` never touches it - so it gets no method here either.
 *
 * THE SECOND EXPORTED INTERFACE, AND WHY IT LIVES IN THIS FILE `SalePriceResolver` is the narrow
 * collaborator that the `Product` entity takes as a constructor parameter, replacing the
 * service-locator call at [model/entity/Product.cfc:L519] (T2). It is co-located here rather than
 * given its own module because the port count is locked at thirteen and no new file may be created.
 * It is not a fourteenth port; it is a supporting interface of this one, and the "one primary
 * exported unit plus its directly supporting co-located types" standard is satisfied on that
 * reading. Its single method is the only member of `PromotionService`'s public surface that an
 * ENTITY reaches for, which is what makes the narrow interface honest rather than convenient.
 *
 * FETCH SHAPE, AND WHY LAZINESS IS NOT SIMULATED (T3)
 * `ORMExecuteQuery`, the tag-syntax queries, `super.save()`, `super.delete()` and Hibernate's lazy
 * collections all collapse into the methods below. Hibernate lazy loading has no equivalent in a
 * driver-only stack and is deliberately not simulated: associations are materialized at the
 * repository boundary instead, and the fetch shape is an explicit decision made and commented at
 * each repository method in `src/repositories/mysql/mysqlPromotionRepository.ts`, which also owns
 * the row-to-entity factory, port injection and association materialization.
 *
 * Concretely, and this is the part that decides whether the engine works: a `PromotionReward`
 * handed back by this port must already carry its `promotionPeriod` - whose `isCurrent` and
 * `isExpired` tests the engine calls [model/entity/PromotionPeriod.cfc:L78, L83] - its `promotion`,
 * its `roundingRule`, and its FOURTEEN include/exclude link collections, because the engine walks
 * all of them while evaluating membership. A `PromotionQualifier` reached through the same period
 * carries THIRTEEN such collections for the same reason. The legacy query already fetched the
 * period and the promotion eagerly, so that much is parity rather than a new decision; the link
 * collections were lazy, and making them explicit is the decision. The physical link tables use
 * abbreviated names for both wide sets, and they are referred to in prose only - no table name
 * appears as a value anywhere in this file.
 *
 * The membership tests themselves are not this port's business. The comma-delimited identifier-path
 * walking the engine performs over product-type paths, duplicated in the legacy source at
 * [model/service/PromotionService.cfc:L858-L870] and again at
 * [model/service/PromotionService.cfc:L921-L985], is centralised in
 * `../valueObjects/materializedIdPath.js` at the domain tier. That module is referenced in prose
 * only and deliberately NOT imported here, because no parameter and no return on this port sits in
 * a path position.
 *
 * Making the fetch shape explicit removes the implicit N+1 traversal the ORM permitted. That is a
 * correctness and explicitness property of the design, stated here as such and not as a claim about
 * speed. No eager-load, fetch or include options parameter appears on any method below.
 *
 * PARAMETERIZED SQL - WHERE THAT OBLIGATION LIVES (E5)
 * This file declares interfaces only and contains no SQL, so the obligation to use prepared
 * statements EXCLUSIVELY - preserving the injection-safety guarantee that `cfqueryparam` gave the
 * legacy `<cfquery>` bodies - transfers WHOLLY to `src/repositories/mysql/**`. On this port that
 * obligation escalates, because two of its parameters are caller-supplied comma-delimited lists
 * that the legacy code expanded into bound value lists:
 *
 *   * `rewardTypeList`, which the legacy code split and bound as an array-valued named parameter
 *     [model/dao/PromotionDAO.cfc:L129]; and
 *   * `promotionCodeList`, bound the same way and only when non-empty
 *     [model/dao/PromotionDAO.cfc:L125-L127].
 *
 * EVERY parsed element of EVERY one of those lists must be bound as its own prepared-statement
 * parameter and must never be interpolated into statement text - inside the six-branch union and
 * inside the common-table-expression rewrite alike. A list is not an excuse to build a statement by
 * concatenation. The splitting itself is performed by the adapter with the CFML list helpers in
 * `src/lib/cfml/list.js`, which exports exactly `listLen`, `listGetAt`, `listAppend`, `listToArray`
 * and `listFindNoCase`; naming that module here is a note to the implementer, not an import.
 *
 * THE ASYNC BOUNDARY
 * Every method here returns a promise, because every one of them reaches persistence. That is the
 * project-wide rule - a method becomes async if and only if its legacy body reached the DAO or the
 * ORM - and this is the DAO port, so the rule admits no exception on this file. Methods that only
 * traverse already-materialized associations or perform pure arithmetic stay synchronous, and those
 * live on the entities, the value objects and the services. `roundValueByRoundingRuleID`
 * [model/service/RoundingRuleService.cfc:L79] is async in the target precisely because it consumes
 * method 7 below, and it then delegates to the synchronous `roundValueByRoundingRule`
 * [model/service/RoundingRuleService.cfc:L84], which needs no lookup at all.
 *
 * EXPLICIT ABSENCE
 * The rounding-rule lookup returns `RoundingRule | undefined`. Absence is modelled explicitly,
 * never as a zero-valued or empty-object stand-in, matching the folder-wide convention that
 * `getSkuBySkuCode` returns `Sku | undefined` and that the SKU currency accessors return
 * `Money | undefined` [model/entity/Sku.cfc:L269-L285], where substituting a default would silently
 * sell products for free.
 *
 * THE OPAQUE IDENTIFIER REDUCTION
 * Wherever a legacy signature took `required any account`, this port takes an opaque
 * `accountID: string`. `Account` is explicitly out of scope: no account entity is ported, so the
 * only honest thing to carry across the boundary is the identifier the legacy query itself bound
 * [model/dao/PromotionDAO.cfc:L193, L292]. The same reduction applies to `Order`, `OrderItem` and
 * `OrderFulfillment` identifiers throughout the target, and it is what lets an out-of-scope
 * aggregate be an INPUT to this slice rather than a dependency of it.
 *
 * WHAT THIS PORT DELIBERATELY DOES NOT ABSORB
 *
 *   * Address-zone evaluation. `PromotionService` reaches `addressService`
 *     [model/service/PromotionService.cfc:L53] for `isAddressInZone`
 *     [model/service/AddressService.cfc:L57]; that is the separate `addressZoneEvaluator` port, so
 *     no address, zone or geography method appears here.
 *   * Rounding ARITHMETIC. `roundValue` [model/service/RoundingRuleService.cfc:L88],
 *     `roundValueByRoundingRule` [model/service/RoundingRuleService.cfc:L84] and
 *     `roundValueByRoundingRuleID` [model/service/RoundingRuleService.cfc:L79] are service methods
 *     in `src/services/roundingRuleService.ts`. This port supplies only the rule ROW. There is no
 *     rounding expression, no rounding direction and no direction switch on this contract.
 *   * Any cache, memo, expiry or invalidation surface. `RoundingRuleService` memoises rule details
 *     in a component-level struct [model/service/RoundingRuleService.cfc:L53, L67-L77], and on a
 *     warm Lambda container module-level state persists between unrelated invocations, so that memo
 *     becomes request-scoped in the target. That is a statement about cross-request state and
 *     correctness. It is emphatically not a proposal to cache anything, and no method below exposes
 *     a way to.
 *   * The execution-ordering constraint between the two order-level passes. It is documented on
 *     `priceGroupRepository.ts`, not here: the price-group pass must run before the promotion pass,
 *     because the discount base price is chosen differently for a price-group-eligible item
 *     [model/service/PromotionService.cfc:L241-L254]. Read it there. No ordering or sequencing
 *     parameter appears on this port.
 *
 * THREE DEFECT MARKERS, AND WHAT EACH ONE PRESERVES
 * This file carries three defect markers, in the uniform two-line shape, and exactly three. Their
 * substance is restated here because the emitted JavaScript keeps this banner while the erased
 * interface takes its inline annotations with it, so a reader of either artifact sees all three:
 *
 *   1. On method 1: `model/dao/PromotionDAO.cfc` imposes no result ordering anywhere, so reward
 *      iteration order is non-deterministic and the mutable usage ledger makes that observable.
 *      The adapter must not add an ordering.
 *   2. Adjacent to the use-count group: two of the use-count queries test a START date in a clause
 *      where an END date is plainly intended [model/dao/PromotionDAO.cfc:L177, L244], each
 *      immediately after a correct start/end pair. The counted window is therefore wrong, and
 *      use-limit enforcement depends on it.
 *   3. Adjacent to the use-count group: two service-tier declarations claim a boolean return over
 *      what is a numeric count [model/service/PromotionService.cfc:L1094-L1100]. This port types
 *      the honest number.
 *
 * Nothing else in this file is marked, and the omissions are deliberate. The broken sale-price
 * locator at [model/entity/Sku.cfc:L258] - `getPriceByPromotion` calling a
 * `calculateSkuPriceBasedOnPromotion` that does not exist - is ported as a throwing stub in
 * `src/domain/entities/sku.ts`; it gets no method on this port, no substitute under any other name,
 * and no marker here. The poisoned brand-name memo [model/entity/Product.cfc:L524-L532] belongs to
 * the same entities sibling. The over-use stripping loop that indexes by a leaked variable
 * [model/service/PromotionService.cfc:L468-L521], the never-read qualified-fulfillments key
 * [model/service/PromotionService.cfc:L621-L623], the re-tested shipping-method clause
 * [model/service/PromotionService.cfc:L703], the raw-float amount-off branch
 * [model/service/PromotionService.cfc:L998], the un-scoped discount accumulator
 * [model/service/PromotionService.cfc:L1007, L1009] and the discount clamp that compares one value
 * and overwrites another [model/service/PromotionService.cfc:L1013-L1015] all belong to
 * `src/services/**`. They are named here only so that their absence from this file reads as a
 * decision.
 *
 * No carried-forward TODO is assigned to this file. For context only: the plan's headline TODO
 * carry-forward is the return/exchange no-op at [model/service/PromotionService.cfc:L542-L544],
 * whose comment body at L543 reads `TODO [issue #1766]`. It is ported still doing nothing, with
 * that `issue #1766` reference intact rather than silently completed, and it is owned by
 * `src/services/promotion/**`.
 *
 * NAMING - INTERFACE PARITY IS THE ACCEPTANCE CONTRACT Legacy CFML method and parameter names are
 * carried over verbatim in camelCase so that a reviewer can diff the two surfaces method by method.
 * That includes the two `...Query` suffixes, which read oddly in TypeScript and are preserved
 * anyway for exactly that reason: `getSalePricePromotionRewardsQuery` and `getRoundingRuleQuery`
 * are the legacy declarations, and renaming them to something more idiomatic would break the one
 * property the acceptance gate checks. Parameter names are likewise verbatim: `rewardTypeList`,
 * `promotionCodeList`, `qualificationRequired`, `productID`, `roundingRuleID`, `promotionPeriod`,
 * `promotionCode`. No naming-convention lint rule is enabled, deliberately, for precisely this
 * reason. Where a name has NO legacy antecedent - the two projection types below, and the
 * `accountID` parameter that replaces a whole entity - the declaration says so in its own comment.
 *
 * Two misspellings in the legacy source are relevant to this subsystem and NEITHER appears on this
 * port; both are preserved-or-renamed-with-a-comment in `src/services/**` and
 * `src/domain/entities/**` respectively, and for each one the published locator was checked against
 * the source and corrected here, because a citation a reviewer cannot follow is worse than none:
 *
 *   * The qualified-discount accumulator key, spelled `orderItemQulifiedDiscounts` in the source.
 *     Published as
 *     [model/service/PromotionService.cfc:L82-L133]; that range is the illustrative BLOCK COMMENT
 *     documenting the engine's data structures - it opens at L82 and closes at L133 - and the
 *     misspelled key appears inside it at L121. The LIVE declaration is
 *     [model/service/PromotionService.cfc:L142], with the accumulator populated at L152, L155 and
 *     L262. Both facts are recorded; neither is this port's to carry.
 *   * The permission attribute, spelled `hb_permission="promotionPeriod.promtionRewards"` in the
 *     source. Published as [model/entity/PromotionReward.cfc:L49]; L49 is inside
 *     that file's licence-and-notes comment. The attribute is on the `component` declaration at
 *     [model/entity/PromotionReward.cfc:L57], alongside the entity name and the abbreviated table
 *     name.
 *
 * Likewise the single budgeted entity-layer signature widening is spent on
 * `PromotionPeriod.isCurrent` [model/entity/PromotionPeriod.cfc:L78] - whose sibling `isExpired`
 * [model/entity/PromotionPeriod.cfc:L83] the engine also calls - so that the date policy is
 * explicit and the method is deterministically testable. It is spent in the entities sibling, not
 * here. THIS port widens no signature, spends no reshaping, spends no visibility promotion and
 * takes no deliberate divergence; its budget for all four is zero.
 *
 * THE DOMAIN LAYER IMPORTS NOTHING OUTWARD
 * `src/domain/**` may import only from within `src/domain/**` and from `src/lib/**`. Importing
 * `src/repositories/**`, `src/handlers/**`, `src/integrations/**` or the driver package is a build
 * failure, not a convention. That matters most on a repository port, and it is at its most tempting
 * on THIS one - a 593-line DAO of raw SQL is exactly where reaching for the driver feels natural.
 * It is forbidden. This file names no driver, no pool, no connection and no row-packet type, and it
 * declares no SQL of any kind: not a string, not a template literal, not a fragment, not a union
 * branch, not a common table expression, not a value-list snippet. Prose description of query
 * semantics is correct and required; writing the query is not. This port is the seam that lets the
 * boundary hold: the outward layer implements the interface, and the composition root wires the
 * concrete instance.
 *
 * THESE NAMES ARE CANONICAL
 * Every subtree that will consume this file was empty or incomplete at the time of writing, so the
 * names, method names and signatures published here are the canonical ones. They are published
 * deliberately and precisely, and they are not to be renamed later.
 *
 * TEST COVERAGE IS NET-NEW, NOT LEGACY PARITY Nothing in the legacy suite covers any of this.
 * `meta/tests/unit/dao/` contains only `AccountDAOTest` and `PaymentDAOTest`;
 * `meta/tests/unit/service/` contains only AccountService, HibachiService, PaymentService and
 * UtilityRBService tests. Nothing covers `PromotionDAO`, `PromotionService`, `RoundingRuleDAO` or
 * `RoundingRuleService`. Only three legacy test files touch the in-scope slice at all -
 * `meta/tests/unit/entity/BrandTest.cfc`, `meta/tests/unit/entity/ProductTest.cfc` and the EMPTY
 * `meta/tests/functional/admin/entity/ProductTest.cfc` - and none of the three touches promotions.
 * Every method declared here needs a test and all of that coverage is net-new, presented as such
 * and never as parity. Query-shape and parameter-binding assertions belong in
 * `tests/integration/repositories/*.test.ts`, which another agent owns; no test is authored here.
 *
 * WHO IMPLEMENTS THIS PORT
 * `src/repositories/mysql/mysqlPromotionRepository.ts`, one of exactly six MySQL adapters - the
 * others being the product, SKU, option, product-type and price-group repositories. Seven
 * obligations transfer to it with this contract:
 *
 *   1. Prepared statements exclusively, with every element of `rewardTypeList` and of
 *      `promotionCodeList` bound as its own parameter - never interpolated, in the union branches
 *      and in the common-table-expression rewrite alike.
 *   2. The absence of any result ordering in `getActivePromotionRewards` is preserved verbatim. The
 *      adapter MUST NOT add an ordering.
 *   3. The three in-engine post-processing steps become common table expressions that reduce to the
 *      minimum sale price per SKU and join back to recover the winning row, in
 *      `src/repositories/mysql/sql/salePricePromotionRewards.sql.ts`, with the two formulations
 *      documented inline side by side so a reviewer can compare them - and with no tiebreaker
 *      introduced.
 *   4. The four use-count queries live in `src/repositories/mysql/sql/promotionUseCounts.sql.ts`
 *      and reproduce the duplicated start-date tests exactly.
 *   5. The dialect branch [model/dao/PromotionDAO.cfc:L482-L488] becomes a dialect-parameterized
 *      fragment, MySQL branch only, through `src/repositories/mysql/dialect.ts`.
 *   6. The row-to-entity factory, port injection and association materialization, with the fetch
 *      shape decided and commented at each method: the promotion period, the promotion, the
 *      rounding rule and the include/exclude link collections materialized to the depth the engine
 *      walks them. Laziness is not simulated.
 *   7. The rounding-rule lookup is satisfiable by a join: prefer attaching the rounding-rule row to
 *      the reward and rate reads over issuing a separate round trip, and request-scope any
 *      rule-detail memo, because module-level state outlives an invocation on a warm container.
 *
 * `src/handlers/bootstrap.ts` WIRES this port to that adapter; it does not implement it.
 * `SalePriceResolver`, by contrast, has no adapter file in the locked layout: it is satisfied in
 * `src/handlers/bootstrap.ts` by adapting the ported `src/services/promotionService.ts` surface,
 * and it is injected into the `Product` entity from there. That is stated explicitly so the
 * composition-root agent has unambiguous direction and does not go looking for a missing file.
 *
 * Schema continuity is absolute: the adapter reads the existing `Sw*` MySQL schema unchanged - no
 * migration, no rename, no new table, no column change - including the abbreviated link-table names
 * for the wide include/exclude sets and the arbitrary-precision money columns. No table name,
 * datasource name, database-product name, credential or connection string appears anywhere in this
 * file.
 *
 * @see model/dao/PromotionDAO.cfc - the ported DAO; its `<cfquery>` bodies are the source of truth
 * @see model/dao/RoundingRuleDAO.cfc - the single-declaration DAO whose lookup is hosted here
 * @see model/service/PromotionService.cfc - the service tier that consumes this port
 * @see model/service/RoundingRuleService.cfc - the consumer of method 7
 */

/*
 * The five imports this file may have, and every one of them is type-only.
 *
 * `../entities/promotionReward.js` and `../entities/roundingRule.js` do not resolve at the time of
 * writing, and `tsc` reports each as a missing module. That is expected and sanctioned: the
 * authoring order across the subtree is a compile-order convenience, not a schedule, and it carries
 * no milestone. Those specifiers are NOT to be "fixed" by deleting the import, declaring a local
 * stand-in class, widening a return to a looser type, or relaxing `tsconfig.json`. The canonical
 * paths and class names are fixed: `promotionReward.js` exports `PromotionReward` and
 * `roundingRule.js` exports `RoundingRule`. `../entities/promotionPeriod.js`,
 * `../entities/promotionCode.js` and `../valueObjects/money.js` resolve today.
 *
 * The asymmetry that justifies publishing ports before entities: an entity body actually CALLS port
 * methods - the locator site at [model/entity/Product.cfc:L519] is exactly such a call, and
 * `Product` will invoke `SalePriceResolver.getSalePriceDetailsForProductSkus` through the port
 * declared below - whereas a port needs only a type name and a module path from an entity. This
 * file returns `PromotionReward`, `RoundingRule`, `PromotionPeriod` and `PromotionCode` values and
 * never invokes a member of any of them.
 *
 * `Money` is the sole arithmetic surface in the target: it wraps an arbitrary-precision decimal and
 * replaces `precisionEvaluate`, `numberFormat` and the arbitrary-precision money columns at once.
 * Only the TYPE is imported. The decimal library is an implementation detail of `Money` and is
 * never imported here, and no money arithmetic is reimplemented in this file.
 *
 * Nothing else is imported, and the exclusions are deliberate: no `Promotion`,
 * `PromotionQualifier`, `PromotionApplied`, `PromotionAccount`, `Sku` or `Product` entity, because
 * no signature below names one; no `CurrencyCode`, because nothing here is currency-scoped; no
 * branded decimal string, because `Money` carries every monetary value on this contract; no
 * identifier-path value object and no CFML list helper, both of which are named in prose above as
 * notes to the implementer; no sibling port, because zero ports import one another; no order view,
 * because no port in this folder imports one; no promotion-engine type contract, because those
 * belong to the services tier; no validation library and no schema, because the declarative
 * promotion validation files are read as reference by other modules and there is deliberately no
 * qualifier, applied-promotion or promotion-account validation file to invent one from; and neither
 * `src/lib/config.js` nor `src/lib/logger.js`, which are off the legal import surface for the
 * domain - static process configuration is not a request scope.
 */
import type { PromotionReward } from '../entities/promotionReward.js';
import type { PromotionPeriod } from '../entities/promotionPeriod.js';
import type { PromotionCode } from '../entities/promotionCode.js';
import type { RoundingRule } from '../entities/roundingRule.js';
import type { Money } from '../valueObjects/money.js';

/**
 * One row of the sale-price promotion-reward result set, as method 6 returns it.
 *
 * This is a READ PROJECTION of query output - it is NOT an entity. `PromotionReward` is the entity
 * behind these rows, and it is imported and returned by method 1; this type is the flattened,
 * already-reduced row that the sale-price query produces instead, and the two must not be
 * conflated. It is co-located with the single port that needs it rather than promoted into
 * `../entities/` or `../valueObjects/`, and no new file is created for it. It must not be grown
 * into an entity substitute and must never gain behaviour: no methods, no mutation, no persistence
 * identity semantics. Every property is `readonly` for that reason, and there is no index
 * signature, so a member that is not declared here cannot be smuggled in.
 *
 * The TYPE NAME has no legacy antecedent. The CFML declaration is
 * `<cffunction name="getSalePricePromotionRewardsQuery">` [model/dao/PromotionDAO.cfc:L298] with no
 * `returntype` attribute at all, so it returns an untyped query object. Every MEMBER name below,
 * however, is verbatim - and verbatim from a specific place: the FINAL post-processing step
 * [model/dao/PromotionDAO.cfc:L571-L588], which is the projection the DAO actually returns
 * [model/dao/PromotionDAO.cfc:L590]. The members are declared in that projection's own column order
 * so the two can be diffed line for line.
 *
 * EIGHT MEMBERS, NOT NINE. The preceding step projects a promotion-period identifier
 * [model/dao/PromotionDAO.cfc:L553], and the final step DROPS it
 * [model/dao/PromotionDAO.cfc:L572-L580]. It is therefore absent here. Reinstating it would widen
 * the contract past what the legacy caller could ever see, so its absence is a decision recorded
 * rather than an oversight - the promotion identifier survives, the period identifier does not.
 *
 * REQUIREDNESS IS DERIVED FROM THE QUERY, NOT ASSUMED. The final step joins the reduced rows back
 * to the per-SKU minimum on SKU and sale price [model/dao/PromotionDAO.cfc:L584-L587]. An equality
 * predicate cannot match a null, and the minimum aggregate skips nulls, so no row whose sale price
 * is null can reach this projection at all. Two consequences follow, and both are load-bearing:
 * `salePrice` is required, and `salePriceDiscountType` can only be one of the three amount types
 * the union's own conditional recognises, because that conditional has no fallback branch and
 * yields null for anything else. Members backed by a genuinely nullable column are optional;
 * nothing else is. Under `exactOptionalPropertyTypes` an optional member is omitted by the adapter
 * rather than set to an undefined value.
 *
 * MONETARY MEMBERS ARE `Money`, NEVER A NUMBER. Both prices below are money and both are `Money`.
 * The legacy columns are arbitrary-precision decimals, and the legacy union computes the sale price
 * arithmetically from a price and a reward amount [model/dao/PromotionDAO.cfc:L338-L342], so a
 * floating-point carrier would introduce drift into a value the customer is charged. Non-monetary
 * members stay primitive: identifiers are strings, the discount level and amount type are closed
 * string unions, and the expiration is a date.
 */
export interface SalePricePromotionRewardRow {
  /**
   * SKU identifier, and the key the reduction groups by
   * [model/dao/PromotionDAO.cfc:L563, L568, L573]. Required: it is the join key on both sides of
   * the final step, so a row cannot exist without it.
   */
  readonly skuID: string;

  /**
   * The SKU's own price before any sale-price reward is applied
   * [model/dao/PromotionDAO.cfc:L574], projected by every union branch from the SKU price column
   * [model/dao/PromotionDAO.cfc:L335].
   *
   * Optional, and the reason is specific rather than defensive: the SKU price column is nullable,
   * and the `amount` amount type computes a sale price that does not depend on it
   * [model/dao/PromotionDAO.cfc:L339]. A row can therefore carry a sale price while carrying no
   * original price, and the port invents no substitute - not a zero, not the sale price over again.
   */
  readonly originalPrice?: Money;

  /**
   * Which level of the catalog hierarchy the winning reward attached to
   * [model/dao/PromotionDAO.cfc:L575].
   *
   * The six values are the string literals the six union branches emit, verbatim and in branch
   * order: SKU [model/dao/PromotionDAO.cfc:L336], product
   * [model/dao/PromotionDAO.cfc:L367], brand [model/dao/PromotionDAO.cfc:L398], option
   * [model/dao/PromotionDAO.cfc:L431], product type [model/dao/PromotionDAO.cfc:L464] and global
   * [model/dao/PromotionDAO.cfc:L505]. Required: each branch emits its literal unconditionally, so
   * the value is never absent. The union is closed because those six branches are the only sources
   * of a row, and a seventh level would require a seventh branch.
   */
  readonly discountLevel: 'sku' | 'product' | 'brand' | 'option' | 'productType' | 'global';

  /**
   * How the winning reward's amount was interpreted [model/dao/PromotionDAO.cfc:L576], projected
   * from the reward's own amount-type column [model/dao/PromotionDAO.cfc:L337].
   *
   * The three values are the three the legacy conditional recognises
   * [model/dao/PromotionDAO.cfc:L338-L342]: a flat replacement amount, an amount off, and a
   * percentage off. Required, and the closed union is a CONSEQUENCE of the query rather than an
   * assumption about the data: the conditional has no fallback branch, so an unrecognised amount
   * type yields a null sale price, and a null sale price cannot survive the final equality join
   * [model/dao/PromotionDAO.cfc:L587]. Any row that reaches here therefore carries one of these
   * three.
   */
  readonly salePriceDiscountType: 'amount' | 'amountOff' | 'percentageOff';

  /**
   * The winning sale price for this SKU [model/dao/PromotionDAO.cfc:L577] - the per-SKU MINIMUM
   * across every qualifying reward [model/dao/PromotionDAO.cfc:L562-L568], joined back to recover
   * the rest of the winning row.
   *
   * Required: see this type's own note on how the final join excludes nulls. Monetary, so `Money`.
   *
   * TIES ARE REAL AND ARE LEFT ALONE. Two rewards can produce the same minimum for one SKU, and the
   * join back on that minimum then yields more than one row for that SKU. The legacy chain does not
   * disambiguate them and neither may the adapter - no single-row limit, no secondary sort, no
   * recency preference and no reward-identifier ordering. This value is NOT yet rounding-rule
   * adjusted; that happens one tier out, and `SalePriceDetail` below is where it lands.
   */
  readonly salePrice: Money;

  /**
   * Identifier of the rounding rule the winning reward carries, if any
   * [model/dao/PromotionDAO.cfc:L578], projected from the reward's rounding-rule foreign key
   * [model/dao/PromotionDAO.cfc:L343].
   *
   * Optional, because the association is nullable: a reward need not carry a rounding rule. It is
   * an IDENTIFIER and therefore a string - resolving it to a rule is method 7's job, and applying
   * the rule is the rounding-rule service's job. The consuming service tests this member before
   * resolving [model/service/PromotionService.cfc:L1025], and in CFML that test is against an empty
   * string because a query renders a null column that way; here the honest model is an absent
   * member.
   */
  readonly roundingRuleID?: string;

  /**
   * When this sale price stops applying [model/dao/PromotionDAO.cfc:L579], projected from the
   * promotion period's end date [model/dao/PromotionDAO.cfc:L344].
   *
   * Optional, because that column is explicitly nullable - every branch's date predicate admits a
   * null end date [model/dao/PromotionDAO.cfc:L319], which is how a period with no expiry
   * qualifies. An absent member means "this sale price does not expire", and it must not be
   * substituted with the current moment; the legacy entity accessor that does exactly that
   * [model/entity/Product.cfc:L614-L622] is the entities sibling's concern, not this port's.
   */
  readonly salePriceExpirationDateTime?: Date;

  /**
   * Identifier of the promotion the winning reward belongs to
   * [model/dao/PromotionDAO.cfc:L580], projected from the promotion period
   * [model/dao/PromotionDAO.cfc:L346].
   *
   * Required: the preliminary query that gates every row of this result set joins the period to its
   * promotion and filters on the promotion's active flag [model/dao/PromotionDAO.cfc:L314-L321], so
   * a row without a promotion cannot reach the reduction. An identifier, therefore a string - the
   * `Promotion` entity is deliberately not imported, because no signature on this port names it.
   */
  readonly promotionID: string;
}

/**
 * One SKU's sale-price detail, as `SalePriceResolver` returns it keyed by SKU identifier.
 *
 * This is a READ PROJECTION of service output - it is NOT an entity, and it must not grow behaviour
 * or gain persistence identity. Every property is `readonly` and there is no index signature. Like
 * the row projection above, it is co-located with the port that needs it rather than promoted into
 * `../entities/` or `../valueObjects/`, and no new file is created for it.
 *
 * The TYPE NAME has no legacy antecedent: the CFML declaration is
 * `public struct function getSalePriceDetailsForProductSkus(required string productID)`
 * [model/service/PromotionService.cfc:L1022], an untyped structure. Every MEMBER name is verbatim,
 * and the member set is exactly the row projection's, because that is literally what the legacy
 * method returns: it converts the query into a structure of structures keyed by SKU identifier
 * [model/service/PromotionService.cfc:L1023], so each value carries the row's own columns under the
 * row's own names.
 *
 * WHAT MAKES THIS TYPE DISTINCT FROM THE ROW, AND WHY IT IS NOT AN ALIAS OF IT. Exactly one member
 * differs in MEANING: `salePrice` here is the ROUNDING-RULE-ADJUSTED price. The legacy loop walks
 * every entry and, when the entry carries a rounding-rule identifier, overwrites `salePrice` in
 * place with the rounded value [model/service/PromotionService.cfc:L1024-L1028]. Two named types
 * make that transformation visible at the type level - raw row in, adjusted detail out - which an
 * alias or a re-export would hide. Note also what the legacy loop does NOT do: it does not clear
 * `roundingRuleID` after applying it, so the member survives on the adjusted detail and is retained
 * here for parity.
 *
 * WHY THE MEMBERS ARE NOT ALL OPTIONAL, EVEN THOUGH CONSUMERS TEST FOR THEM. Three legacy consumers
 * guard with a key-existence test before reading - the sale price, the discount type and the
 * expiration [model/entity/Sku.cfc:L547, L554, L561]. Those guards are NOT evidence that a present
 * detail can lack them. They defend against a different thing entirely: the intermediate accessor
 * returns an EMPTY structure when the SKU has no entry in the map at all
 * [model/entity/Product.cfc:L182-L187]. In the target that empty stand-in disappears, because a
 * lookup into the returned record yields nothing for a missing key under the strict index profile,
 * and absence is then explicit at the lookup rather than smeared across every member. So each
 * member's requiredness here is inherited from the row projection above, for the reasons given
 * there, and the empty-structure substitute is deliberately not reproduced.
 */
export interface SalePriceDetail {
  /** SKU identifier - also the key this detail is stored under. Required. */
  readonly skuID: string;

  /** The SKU's own price before the sale-price reward. Optional; see the row projection. */
  readonly originalPrice?: Money;

  /** Catalog level the winning reward attached to. Required; the six literals the branches emit. */
  readonly discountLevel: 'sku' | 'product' | 'brand' | 'option' | 'productType' | 'global';

  /**
   * How the winning reward's amount was interpreted. Required; the three the legacy conditional
   * recognises.
   *
   * The two legacy entity accessors that read this member substitute DIFFERENT stand-ins when the
   * detail is absent altogether - the product-level one substitutes the string "none"
   * [model/entity/Product.cfc:L604-L612] while the SKU-level one substitutes an empty string
   * [model/entity/Sku.cfc:L553-L558] - and that divergence belongs to the entities sibling. Neither
   * stand-in is encoded as a fourth union member here, because neither is a value this projection
   * can ever carry: they exist only for the absent case, which the record lookup now models
   * explicitly.
   */
  readonly salePriceDiscountType: 'amount' | 'amountOff' | 'percentageOff';

  /**
   * The sale price AFTER the rounding rule has been applied, when the detail carried one
   * [model/service/PromotionService.cfc:L1026]; otherwise the unadjusted winning price. Required,
   * and monetary, so `Money`.
   *
   * The rounding itself happens in `src/services/roundingRuleService.ts`, whose ported algorithm is
   * decimal-STRING manipulation rather than numeric rounding and whose measured legacy outputs are
   * pinned by characterization tests. This member is the RESULT of that step, so it must never be
   * recomputed by a consumer, and no rounding expression or direction is exposed alongside it.
   */
  readonly salePrice: Money;

  /**
   * Identifier of the rounding rule that was applied, retained after application exactly as the
   * legacy loop retains it. Optional, because the reward's association is nullable.
   */
  readonly roundingRuleID?: string;

  /** When this sale price stops applying. Optional; absent means it does not expire. */
  readonly salePriceExpirationDateTime?: Date;

  /** Identifier of the promotion behind the winning reward. Required. */
  readonly promotionID: string;
}

/**
 * The promotion repository port.
 *
 * SEVEN methods, locked: the six public functions of `model/dao/PromotionDAO.cfc` and the single
 * lookup of `model/dao/RoundingRuleDAO.cfc`, hosted here because the port count is locked at
 * thirteen and no `roundingRuleRepository` exists. The arithmetic is in this file's header. Each
 * method returns a promise because each one reaches persistence.
 *
 * There is no eighth. No entity-lifecycle method, no applied-promotion write, no promotion-account
 * method, no rounding-rule write, no rounding arithmetic, no address-zone evaluation, no dialect
 * parameter, no ordering or sequencing parameter, no eager-load options bag, no date-window
 * override, and no cache or invalidation surface. Each of those exclusions is justified in the
 * header, and each is a decision rather than an omission.
 *
 * The implementing adapter is `src/repositories/mysql/mysqlPromotionRepository.ts`; the composition
 * root wires it. Nothing here names a driver, a connection, a statement or a table.
 */
export interface PromotionRepository {
  // LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L51-L132]: getActivePromotionRewards applies no
  // ORDER BY - a case-insensitive search for "order by" across the entire 593-line DAO returns
  // nothing - so reward iteration order is whatever the engine returns. Because the promotion
  // engine threads a mutable usage ledger through that iteration (PromotionService.cfc:L297), the
  // outcome is non-deterministic at the boundary of a tie. The implementation MUST NOT add an
  // ordering: introducing one changes which rewards win and therefore changes money.
  // Preserved deliberately; do not fix without a product decision.
  /**
   * Active promotion rewards of the given reward types, for the given promotion codes.
   *
   * Legacy: `<cffunction name="getActivePromotionRewards" returntype="Array" access="public">`
   * [model/dao/PromotionDAO.cfc:L51]. The declared parameter order is reproduced verbatim:
   * `rewardTypeList` [model/dao/PromotionDAO.cfc:L52] and `promotionCodeList`
   * [model/dao/PromotionDAO.cfc:L53] are both `required="true" type="string"`, and
   * `qualificationRequired` [model/dao/PromotionDAO.cfc:L54] is declared
   * `type="boolean" default="false"` with no `required` attribute, so it is optional here.
   *
   * THIS METHOD IS THE INPUT TO THE DISCOUNT PIPELINE, and its result set carries NO ORDERING: the
   * legacy DAO applies no `ORDER BY` anywhere in its 593 lines, as the marker above records. The
   * absence is load-bearing and must be preserved: the adapter must not impose an ordering, and no
   * sort parameter is offered here to invite one. That is the
   * exact opposite of the ruling on `productTypeRepository` and `skuRepository`, whose orderings
   * ARE load-bearing and must be preserved verbatim. Both rulings are deliberate.
   *
   * BOTH BRANCHES OF `qualificationRequired` ARE LIVE, so neither may be dropped. The order-level
   * pass passes `true` [model/service/PromotionService.cfc:L165], and the shipping-method-option
   * path omits the argument entirely and therefore takes the `false` branch
   * [model/service/PromotionService.cfc:L1040]. The legacy default of `false` is recorded here in
   * prose and deliberately NOT written as a default parameter value, because a default value is a
   * runtime expression and this module emits no runtime JavaScript.
   *
   * Filter semantics for the adapter, in prose because this file contains no SQL
   * [model/dao/PromotionDAO.cfc:L64-L114]: a reward qualifies when its reward type is one of the
   * supplied types, its promotion period has either no start date or a start date already past,
   * either no end date or an end date still ahead, and its promotion is flagged active. When
   * qualification is required, the reward must additionally either belong to a period that has at
   * least one qualifier, or belong to a promotion with a supplied and currently-valid promotion
   * code, or be a reward type that never needs qualification - and that last set is computed from
   * the requested types themselves, admitting only the fulfillment and order types
   * [model/dao/PromotionDAO.cfc:L56-L62]. Independently of qualification, the reward's promotion
   * must either carry no promotion codes at all or carry one that was supplied and is currently
   * valid [model/dao/PromotionDAO.cfc:L102-L114]. Both the currently-valid tests use the same
   * moment as the period tests [model/dao/PromotionDAO.cfc:L116-L119].
   *
   * FETCH SHAPE. The legacy query fetches the promotion period and the promotion eagerly
   * [model/dao/PromotionDAO.cfc:L66-L69], so those two are parity rather than a new decision. The
   * rounding rule and the fourteen include/exclude link collections were lazy and must now arrive
   * materialized, because the engine walks them while evaluating membership; see the header.
   *
   * @param rewardTypeList Comma-delimited reward types, required in the legacy signature. Stays a
   *   `string` for signature parity and is deliberately not widened to an array; the adapter splits
   *   it with the CFML list helpers and binds each parsed element as its own prepared-statement
   *   parameter [model/dao/PromotionDAO.cfc:L129], never interpolating it.
   * @param promotionCodeList Comma-delimited promotion codes, required in the legacy signature and
   *   permitted to be empty - the legacy body tests its length before binding it at all
   *   [model/dao/PromotionDAO.cfc:L125-L127], and an empty list means "no code was supplied" rather
   *   than "match every code". Same string-for-parity and per-element binding rules.
   * @param qualificationRequired Optional; legacy default is `false`.
   * @returns The matching rewards, materialized as this file's header requires, in the engine's own
   *   unspecified order.
   */
  getActivePromotionRewards(
    rewardTypeList: string,
    promotionCodeList: string,
    qualificationRequired?: boolean,
  ): Promise<PromotionReward[]>;

  // LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L177,L244]: both use-count queries test
  // getStartDateTime() in a clause where getEndDateTime() is plainly intended. Read against the
  // declaration boundaries, the L177 site falls inside getPromotionPeriodUseCount (L134-L185) and
  // the L244 site inside getPromotionPeriodAccountUseCount (L187-L252) - each sitting immediately
  // after a correct start/end pair (L173-L174 and L240-L241), so the upper bound of the counted
  // window is gated on the presence of its own LOWER bound. A period with a start date but no end
  // date therefore binds a null upper bound, and a period with an end date but no start date never
  // applies its upper bound at all. This widens or narrows the counted window and so changes
  // use-limit enforcement, which is a named must-preserve behaviour. The defect lives in the SQL
  // and is reproduced in src/repositories/mysql/sql/promotionUseCounts.sql.ts; it is NOT worked
  // around here by passing an end date, adding a date-range parameter, or exposing a window
  // override.
  // Preserved deliberately; do not fix without a product decision.

  // LEGACY-DEFECT [model/service/PromotionService.cfc:L1094-L1100]: getPromotionCodeUseCount and
  // getPromotionCodeAccountUseCount declare returntype="boolean" but return the DAO's numeric
  // count. This port types the honest numeric return; the legacy boolean declaration is recorded
  // here rather than reproduced, because a boolean return type is not expressible over a count
  // without discarding the value the callers actually use. Relatedly, the out-of-scope Account
  // entity is reduced to an opaque accountID string wherever a legacy signature took
  // `required any account`, since no account entity is ported and the identifier is what the legacy
  // query itself bound (L193, L292).
  // Preserved deliberately; do not fix without a product decision.
  /**
   * How many times any account has used the promotion behind a promotion period.
   *
   * Legacy: `<cffunction name="getPromotionPeriodUseCount" returntype="numeric" access="public">`
   * [model/dao/PromotionDAO.cfc:L134], taking `promotionPeriod` as `required="true" type="any"`
   * [model/dao/PromotionDAO.cfc:L135]. The untyped parameter becomes the concrete entity.
   *
   * THIS IS USE-LIMIT ENFORCEMENT DATA. The engine compares this count against the period's
   * maximum use count before allowing a reward [model/service/PromotionService.cfc:L567], so the
   * value returned here decides whether a discount applies. Both defect markers above bear on it.
   *
   * Counting semantics for the adapter [model/dao/PromotionDAO.cfc:L137-L182]: applied promotions
   * are counted for the period's PROMOTION - not for the period itself - across all three of the
   * places an applied promotion can attach (an order item, an order, an order fulfillment), and an
   * applied promotion is excluded when the owning order is still unplaced. The window is then
   * narrowed by the period's dates, subject to the defect above.
   *
   * @param promotionPeriod The period whose promotion is counted. Its promotion must already be
   *   materialized, because the legacy body reaches through it to the promotion identifier
   *   [model/dao/PromotionDAO.cfc:L138].
   * @returns The count. A number, not a boolean.
   */
  getPromotionPeriodUseCount(promotionPeriod: PromotionPeriod): Promise<number>;

  /**
   * How many times ONE account has used the promotion behind a promotion period.
   *
   * Legacy:
   * `<cffunction name="getPromotionPeriodAccountUseCount" returntype="numeric" access="public">`
   * [model/dao/PromotionDAO.cfc:L187], taking `promotionPeriod` and `account`, both
   * `required="true" type="any"` [model/dao/PromotionDAO.cfc:L188-L189], in that order.
   *
   * The second parameter is the opaque identifier rather than an entity: `Account` is out of scope,
   * and the legacy body immediately reduces the entity to its identifier anyway
   * [model/dao/PromotionDAO.cfc:L193]. The parameter name `accountID` therefore has no legacy
   * antecedent as a parameter name, although the identifier it carries is exactly the value the
   * legacy query bound.
   *
   * Counting semantics for the adapter [model/dao/PromotionDAO.cfc:L191-L249]: as the period count
   * above, additionally requiring that the owning order belong to this account through any of the
   * three attachment paths. The engine consults it against the period's maximum per-account use
   * count [model/service/PromotionService.cfc:L576]. Note that this variant filters the applied
   * promotion's own promotion association [model/dao/PromotionDAO.cfc:L238] where the period count
   * filters a joined alias [model/dao/PromotionDAO.cfc:L171]; both are reproduced as written.
   *
   * @param promotionPeriod The period whose promotion is counted, with its promotion materialized.
   * @param accountID Opaque identifier of the account, replacing the out-of-scope entity.
   * @returns The count. A number, not a boolean.
   */
  getPromotionPeriodAccountUseCount(
    promotionPeriod: PromotionPeriod,
    accountID: string,
  ): Promise<number>;

  /**
   * How many placed orders have used a promotion code.
   *
   * Legacy: `<cffunction name="getPromotionCodeUseCount" returntype="numeric" access="public">`
   * [model/dao/PromotionDAO.cfc:L254], taking `promotionCode` as `required="true" type="any"`
   * [model/dao/PromotionDAO.cfc:L255].
   *
   * The DAO declares `numeric` honestly; the SERVICE method that forwards to it declares `boolean`
   * over the same value [model/service/PromotionService.cfc:L1094] - see the second marker above.
   * This port types the number.
   *
   * Counting semantics for the adapter [model/dao/PromotionDAO.cfc:L257-L268]: orders linked to
   * this promotion code, excluding orders that are still unplaced. Note the deliberate asymmetry
   * with the two period counts: this query applies NO date window at all, so the start/end-date
   * defect above does not arise here and no window may be introduced to make the four methods look
   * uniform.
   *
   * @param promotionCode The code whose use is counted; the legacy body reduces it to its
   *   identifier [model/dao/PromotionDAO.cfc:L267].
   * @returns The count. A number, not a boolean.
   */
  getPromotionCodeUseCount(promotionCode: PromotionCode): Promise<number>;

  /**
   * How many placed orders belonging to ONE account have used a promotion code.
   *
   * Legacy:
   * `<cffunction name="getPromotionCodeAccountUseCount" returntype="numeric" access="public">`
   * [model/dao/PromotionDAO.cfc:L274], taking `promotionCode` and `account`, both
   * `required="true" type="any"` [model/dao/PromotionDAO.cfc:L275-L276], in that order. The account
   * becomes the opaque identifier the legacy query itself bound
   * [model/dao/PromotionDAO.cfc:L292].
   *
   * The forwarding service method declares `boolean` over this numeric count too
   * [model/service/PromotionService.cfc:L1098]; this port types the number. Counting semantics
   * [model/dao/PromotionDAO.cfc:L278-L293]: as the code count above, additionally requiring the
   * order to belong to this account. It applies no date window either.
   *
   * @param promotionCode The code whose use is counted.
   * @param accountID Opaque identifier of the account, replacing the out-of-scope entity.
   * @returns The count. A number, not a boolean.
   */
  getPromotionCodeAccountUseCount(promotionCode: PromotionCode, accountID: string): Promise<number>;

  /**
   * Winning sale-price rewards, one row per SKU per winning reward.
   *
   * Legacy: `<cffunction name="getSalePricePromotionRewardsQuery">`
   * [model/dao/PromotionDAO.cfc:L298] - the only one of the six declaring NEITHER a `returntype`
   * NOR an `access` attribute, so it defaults to an untyped public function returning a query
   * object. Its single parameter `productID` is declared `type="string"` with no `required`
   * attribute [model/dao/PromotionDAO.cfc:L299] and its PRESENCE is what each branch tests
   * [model/dao/PromotionDAO.cfc:L359, L390, L423, L456, L497, L538], so it is optional here and
   * omitting it genuinely means "every product" rather than "no product".
   *
   * THIS PORT DECLARES THE RESULT CONTRACT, NOT THE QUERY. The legacy body is nearly three hundred
   * lines - a preliminary query, a six-branch union, then three chained in-engine post-processing
   * steps [model/dao/PromotionDAO.cfc:L544-L559, L561-L569, L571-L588] - and Node has no equivalent
   * of that in-engine post-processing. The rewrite into common table expressions belongs to
   * `src/repositories/mysql/sql/salePricePromotionRewards.sql.ts`, named in prose only. What this
   * signature fixes is the SHAPE of what comes back: an array of the row projection above, never a
   * query object, never a loose record, never a tuple and never a driver row type.
   *
   * TIES ARE NOT DISAMBIGUATED. The reduction takes the MINIMUM sale price per SKU and joins back
   * on it, so two rewards yielding the same minimum both survive and one SKU can appear more than
   * once. The legacy chain leaves that alone and so must the adapter: no single-row limit, no
   * secondary sort, no recency preference, no reward-identifier ordering. Same non-determinism
   * family as the first marker above.
   *
   * ONE FURTHER SCOPE NOTE. The preliminary query restricts the whole result set to promotion
   * periods that have NO qualifiers and whose promotions have NO promotion codes
   * [model/dao/PromotionDAO.cfc:L309-L326] - that is what makes these "sale prices" rather than
   * conditional discounts - and the union's own date predicates are applied a second time per
   * branch. Both layers are reproduced; neither is optimised away, because dropping either changes
   * which rewards win.
   *
   * @param productID Optional product identifier narrowing the result set. Omit it for every
   *   product. The legacy body binds it per branch as a bound parameter, and the adapter must do
   *   the same rather than interpolate it.
   * @returns The winning rows, unrounded. Applying the rounding rule is the service tier's step -
   *   see `SalePriceResolver` below.
   */
  getSalePricePromotionRewardsQuery(productID?: string): Promise<SalePricePromotionRewardRow[]>;

  /**
   * Load one rounding rule by its identifier.
   *
   * Legacy: `<cffunction name="getRoundingRuleQuery">` [model/dao/RoundingRuleDAO.cfc:L51], the
   * ONLY declaration in that 69-line DAO, taking `roundingRuleID` as `type="string"
   * required="true"` [model/dao/RoundingRuleDAO.cfc:L52]. The name keeps its `...Query` suffix
   * verbatim.
   *
   * HOSTED HERE BY DESIGN. The port count is locked at thirteen, there is no
   * `roundingRuleRepository` and none may be created, and this is the pairing that lets the count
   * hold - see the header. No rounding-rule save or delete accompanies it, and no rounding
   * arithmetic: `roundValue` [model/service/RoundingRuleService.cfc:L88] and its two wrappers
   * [model/service/RoundingRuleService.cfc:L79, L84] are service methods in
   * `src/services/roundingRuleService.ts`, and this method supplies only the rule.
   *
   * Returns `undefined` when no rule carries that identifier. The legacy query simply yields zero
   * rows and the caller then reads columns off an empty result
   * [model/service/RoundingRuleService.cfc:L73-L74]; explicit absence is the honest model, and it
   * is never substituted with a zero value, an empty object or a default rule.
   *
   * The legacy query selects only the rule's expression and direction
   * [model/dao/RoundingRuleDAO.cfc:L57-L59], but the entity is returned rather than a narrower
   * projection duplicating it, because `RoundingRule` is one of the in-scope entities with a
   * canonical module of its own - inventing a two-field projection alongside it would be a
   * duplicate contract, and the entity carries exactly those two members plus its identifier.
   *
   * MOST CALLERS SHOULD NEVER REACH THIS METHOD. `PromotionReward.roundingRule` and
   * `PriceGroupRate.roundingRule` are associations materialized at the repository boundary, so a
   * reward or a rate that already arrived with its rule attached needs no call here at all - which
   * is why the adapter should satisfy the association with a join rather than a separate round
   * trip. The method exists for the BY-IDENTIFIER path: `roundValueByRoundingRuleID`
   * [model/service/RoundingRuleService.cfc:L79] is async in the target precisely because of this
   * lookup, and it then delegates to the synchronous `roundValueByRoundingRule`
   * [model/service/RoundingRuleService.cfc:L84].
   *
   * NO CACHE, MEMO OR INVALIDATION SURFACE ACCOMPANIES IT. The legacy service memoises rule details
   * in a component-level struct [model/service/RoundingRuleService.cfc:L53, L67-L77] and clears an
   * entry on save [model/service/RoundingRuleService.cfc:L57-L61]. On a warm Lambda container
   * module-level state persists between unrelated invocations, so that memo becomes request-scoped
   * in the target: a correctness property of cross-request state, and not a proposal to cache
   * anything here.
   *
   * @param roundingRuleID Identifier of the rule to load; required in the legacy signature.
   * @returns The rule, or `undefined` when there is none.
   */
  getRoundingRuleQuery(roundingRuleID: string): Promise<RoundingRule | undefined>;
}

/**
 * The narrow sale-price collaborator that the `Product` entity depends on.
 *
 * WHY THIS INTERFACE EXISTS AT ALL. `model/entity/Product.cfc` resolves sale prices by reaching
 * outward through the framework service locator:
 *
 *     // Legacy [model/entity/Product.cfc:L519]:
 *     //   getService("promotionService")
 *     //     .getSalePriceDetailsForProductSkus(productID=getProductID())
 *     // Target:
 *     //   this.salePriceResolver.getSalePriceDetailsForProductSkus(this.productID)
 *
 * That is transformation rule T2 - a locator call inside an entity becomes a constructor-injected
 * port - and this is the port it becomes. The legacy call is memoised on the entity
 * [model/entity/Product.cfc:L517-L521], and that memo becomes instance-scoped with request-scoped
 * instances; nothing about it belongs on this interface.
 *
 * WHY IT IS CO-LOCATED IN THIS FILE RATHER THAN GIVEN ITS OWN MODULE. The port count is locked at
 * thirteen and no new file may be created, so a fourteenth module is not available. It is not a
 * fourteenth port: it is a supporting interface of `PromotionRepository`, sharing that port's
 * subject matter and one of its co-located projections, and the "one primary exported unit plus its
 * directly supporting co-located types" standard is satisfied on that reading. Placing it here also
 * keeps the pair honest - the resolver's output is the rounding-rule-adjusted form of the rows
 * method 6 returns, so the two contracts are only meaningful together.
 *
 * EXACTLY ONE METHOD, AND DELIBERATELY NOT MORE. The `Product` entity reaches `promotionService`
 * for this and nothing else. In particular there is no sale-price-by-SKU accessor here even though
 * the entity has one [model/entity/Product.cfc:L182-L187], because that accessor is a pure lookup
 * into the returned record and belongs on the entity; and there is no price-by-promotion method
 * under any name, because the sibling locator at [model/entity/Sku.cfc:L258] calls a
 * `calculateSkuPriceBasedOnPromotion` that DOES NOT EXIST anywhere in the source. That one throws
 * at runtime today, it is ported as a throwing stub in `src/domain/entities/sku.ts`, and giving it
 * a working method here under any name would silently repair behaviour the plan requires be
 * preserved.
 *
 * WHO SATISFIES IT. Uniquely among the interfaces in this folder, `SalePriceResolver` has NO
 * adapter file in the locked layout. It is satisfied in `src/handlers/bootstrap.ts` by adapting the
 * ported `src/services/promotionService.ts` surface - which is where
 * `getSalePriceDetailsForProductSkus` itself lives [model/service/PromotionService.cfc:L1022] - and
 * injected into the `Product` entity from there. The composition root is therefore both the wiring
 * point and the implementation point for this one interface, and no file is missing.
 */
export interface SalePriceResolver {
  /**
   * Sale-price details for every SKU of one product, keyed by SKU identifier.
   *
   * Legacy: `public struct function getSalePriceDetailsForProductSkus(required string productID)`
   * [model/service/PromotionService.cfc:L1022]. The method name and the parameter name are
   * verbatim. The `struct` return becomes a record of a NAMED interface rather than a loose untyped
   * map, because the legacy structure's key set is known exactly: the legacy body converts the
   * sale-price query into a structure of structures keyed by SKU identifier
   * [model/service/PromotionService.cfc:L1023].
   *
   * The value type is `SalePriceDetail`, which differs from the raw row in exactly one respect: its
   * sale price has had the rounding rule applied where the row carried a rounding-rule identifier
   * [model/service/PromotionService.cfc:L1024-L1028]. A consumer must therefore never re-round it.
   *
   * ABSENCE IS AT THE LOOKUP, NOT IN THE MEMBERS. A SKU with no qualifying sale-price reward simply
   * has no key in this record, and under the strict index profile a lookup yields nothing for it.
   * The legacy intermediate accessor substituted an EMPTY STRUCTURE for that case
   * [model/entity/Product.cfc:L182-L187], which is why three legacy consumers guard with
   * key-existence tests [model/entity/Sku.cfc:L547, L554, L561]; the substitute is deliberately not
   * reproduced, because explicit absence at the lookup is both honest and checkable.
   *
   * TIES SURFACE HERE AS A COLLISION, AND THAT TOO IS LEGACY BEHAVIOUR. Because the underlying
   * reduction does not disambiguate two rewards that produce the same minimum, the same SKU
   * identifier can appear on more than one row, and keying by it means the last row processed wins.
   * The legacy conversion behaves identically. No tiebreaker is introduced to make the outcome
   * deterministic.
   *
   * @param productID Identifier of the product whose SKUs are resolved; required in the legacy
   *   signature.
   * @returns Sale-price details keyed by SKU identifier. Empty when the product has no qualifying
   *   sale-price reward.
   */
  getSalePriceDetailsForProductSkus(productID: string): Promise<Record<string, SalePriceDetail>>;
}
