// ---------------------------------------------------------------------------
// slatwall-ts - price group repository port
//
// PURPOSE
//   The port that replaces `model/dao/PriceGroupDAO.cfc` (104 lines). That
//   component is `<cffunction>` TAG syntax wrapping embedded `<cfquery>`
//   blocks, so the SQL bodies are the source of truth for its join, filter and
//   status semantics. This file describes those semantics in prose and declares
//   the resulting contract; it writes no SQL.
//
//   It is port 12 of exactly 13 in `src/domain/ports/`. That folder is LOCKED
//   AT 13: no fourteenth port, and no barrel or `index.ts`, may be added. In
//   particular there is deliberately no `roundingRuleRepository` - the
//   rounding-rule row lookup is hosted on `promotionRepository`.
//
// THIS FILE DECLARES INTERFACES ONLY. IT EMITS NO RUNTIME JAVASCRIPT.
//   No class, no constant, no enum, no function body, no default parameter
//   value, no driver type, and no SQL of any kind. Compiling this module
//   produces at most an empty-module marker, and all four `import type`
//   statements below are fully erased at emit. Any `const`, `class`, `enum` or
//   function body appearing in the emitted output means this file is wrong.
//
// THE METHOD COUNT IS SIX, FROM A ONE-FUNCTION DAO
//   `PriceGroupDAO.cfc` declares EXACTLY ONE function - verified by reading the
//   whole component, not inferred. `getAccountSubscriptionPriceGroups` at
//   `model/dao/PriceGroupDAO.cfc:L52` spans L52-L100 and is the entire body of
//   the component; L49 opens `<cfcomponent extends="HibachiDAO">` and L101
//   closes it. One. Not two, and not "one or more". The arithmetic runs:
//
//     1 ported DAO function     getAccountSubscriptionPriceGroups (L52)
//     + 2 loads                 one PriceGroup by ID, one PriceGroupRate by ID
//     + 2 saves                 one PriceGroup, one PriceGroupRate
//     + 1 delete                one PriceGroup
//     = 6 METHODS. LOCKED.
//
//   The five added methods exist for one reason and one reason only: the ORM is
//   gone. `super.save()`, `super.delete()`, `entityLoad()` and `entityNew()`
//   have no equivalent in a driver-only stack (transformation rule T3), so the
//   persistence and load operations the legacy service tier obtained for free
//   from Hibernate must become explicit contract. They are the minimum that
//   makes the ported service surface satisfiable: `savePriceGroupRate`
//   (`model/service/PriceGroupService.cfc:L397`, which calls `super.save()` at
//   L404), `deletePriceGroup` (`model/service/PriceGroupService.cfc:L461`,
//   which calls `super.delete()` at L469), and the group and rate reads the
//   five-level cascade performs.
//
//   No seventh method may be added: no batch load, no `loadAll`, no count, no
//   existence probe, no bulk save, no rate delete, no overload, no options bag,
//   no cache-clear. That six of these methods is MORE than the one function the
//   DAO declares is correct rather than contradictory - the migration's minimal
//   change directive scopes the FUNCTIONAL surface, not the shape of the code,
//   and five of the six are the price of removing the ORM rather than new
//   capability.
//
// PARAMETERIZED SQL EXCLUSIVELY - THE OBLIGATION THIS FILE TRANSFERS
//   This is one of exactly SIX repository ports (`productRepository`,
//   `skuRepository`, `optionRepository`, `productTypeRepository`,
//   `promotionRepository` and this one), and it declares interfaces only and
//   contains no SQL. The obligation to use prepared statements EXCLUSIVELY -
//   preserving the injection-safety guarantee that `cfqueryparam` provided -
//   therefore transfers WHOLLY to `src/repositories/mysql/**`. Nothing in this
//   file can discharge it, and nothing in this file may be read as diluting it.
//
//   Two specifics of that obligation are worth stating here, because this port
//   is the one that carries a caller-supplied identifier straight into a
//   multi-table statement:
//
//     * `accountID` is caller-supplied and MUST be BOUND, never interpolated.
//       The legacy source already binds it - `<cfqueryparam
//       value="#arguments.accountID#" cfsqltype="cf_sql_varchar" />` at
//       `model/dao/PriceGroupDAO.cfc:L66` in the MySQL branch and L82 in the
//       other - so binding it is parity, not an improvement. The two `now()`
//       values are likewise bound as timestamps (L65 and L70; L81 and L86).
//     * the dialect-specific row-limiting clause must be COMPOSED by the
//       adapter and must never concatenate a caller value. The legacy clause is
//       not a top-level page limit at all: it sits inside a CORRELATED SUBQUERY
//       that picks the newest subscription-status row, written `ORDER BY
//       changeDateTime DESC LIMIT 1` in the MySQL branch
//       (`model/dao/PriceGroupDAO.cfc:L71`) and `SELECT TOP 1 ... ORDER BY
//       changeDateTime DESC` in the other (L83 with L87). That is precisely why
//       no row-limiting parameter appears on this port: the clause is a
//       dialect-shaped fragment of one fixed statement, not a caller-tunable
//       knob.
//
//   Neither the extracted statement module
//   (`src/repositories/mysql/sql/accountSubscriptionPriceGroups.sql.ts`) nor the
//   dialect resolver (`src/repositories/mysql/dialect.ts`) is imported here;
//   both are named in prose only, and importing either would be a build
//   failure. The dialect resolver is what replaces the legacy runtime probe -
//   `getApplicationValue("databaseType") eq "mySQL"` at
//   `model/dao/PriceGroupDAO.cfc:L57`, and the `cfdbinfo` product-name probe at
//   `config/configORM.cfm:L1-L15` that mapped the three database products onto
//   three Hibernate dialects - with explicit environment configuration, MySQL
//   branch only.
//
// THE ONE DELIBERATE DATA-LAYER REACH-THROUGH INTO THE SUBSCRIPTION MODULE
//   `getAccountSubscriptionPriceGroups` reads SUBSCRIPTION-OWNED tables: the
//   subscription-usage-benefit-to-account link table, the
//   subscription-usage-benefit table, the subscription-usage-benefit-to-price-
//   group link table, the subscription-usage table, the subscription-status
//   table, and the shared type table. Six of them, named here in PROSE
//   deliberately: no table-name string literal appears anywhere in this file.
//
//   The subscription module is EXPLICITLY OUT OF SCOPE for this migration, so
//   this single query is the one deliberate exception at the data layer, and
//   this port is where that exception is recorded. Three facts govern it:
//
//     1. WHY IT IS PORTED AT ALL. Account price-group resolution is otherwise
//        UNREPRODUCIBLE. `calculateSkuPriceBasedOnAccount`
//        (`model/service/PriceGroupService.cfc:L271-L298`) cannot resolve the
//        price groups an account is entitled to without it: L276 reads the
//        account's directly-assigned groups, L277 calls this function for the
//        groups the account holds only by subscription, and L280-L284 merges
//        the two into a single collection before pricing runs over it. Drop the
//        query and subscription-derived pricing silently disappears.
//     2. IT IS READ-ONLY. No write, no update, no delete, and no upsert ever
//        touches a subscription table through this port or through its adapter.
//        The legacy function is SELECT-only across both dialect branches, and
//        that is preserved as an invariant rather than as an accident.
//     3. NO SUBSCRIPTION BUSINESS LOGIC IS PORTED. The reach-through is a
//        query, not a seam into the subscription domain. It yields price
//        groups. It does not yield subscription usages, benefits, statuses or
//        terms, and nothing downstream reasons about subscription state.
//
//   IT IS NOT THE `subscriptionTermProvider` PORT, AND THAT PORT IS NOT THIS.
//   `subscriptionTermProvider` is a narrow STUB port with documented stub
//   behaviour, serving the out-of-scope subscription and content-access
//   SKU-creation branches at `model/service/SkuService.cfc:L139-L202`; this is a
//   live, real, read-only query that account pricing depends on. Conflating the
//   two would either smuggle subscription logic into the domain or lose the one
//   query account pricing cannot do without.
//
// ===========================================================================
// EXECUTION ORDERING: THE PRICE-GROUP PASS MUST RUN BEFORE THE PROMOTION PASS
// ===========================================================================
//
//   `PriceGroupService.updateOrderAmountsWithPriceGroups()` MUST run BEFORE
//   `PromotionService.updateOrderAmountsWithPromotions()`. This is not a
//   stylistic preference. It decides how much money a customer is charged.
//
//   The reason is concrete. At `model/service/PromotionService.cfc:L241-L254`
//   the promotion engine chooses the base price it discounts FROM differently
//   depending on whether the order item is price-group eligible:
//
//     * an INELIGIBLE item discounts from `getPrice()`;
//     * an ELIGIBLE item discounts from `getSkuPrice()`, plus a correction term
//       of `originalDiscountAmount - (getExtendedSkuPrice() -
//       getExtendedPrice())`.
//
//   In other words THE PROMOTION PASS READS STATE THAT THE PRICE-GROUP PASS
//   WRITES. `updateOrderAmountsWithPriceGroups` is declared at
//   `model/service/PriceGroupService.cfc:L364` with its body through L375, and
//   what it writes is exactly that state: it sets the item price at L370 and
//   the applied price group at L371. Run the promotion pass first and the
//   eligibility branch reads values that do not exist yet, so the discount base
//   is wrong and the computed discount is wrong with it.
//
//   IN THE LEGACY SYSTEM THIS HELD ONLY BY LUCK OF CALL ORDER. Nothing declared
//   it. The out-of-scope `OrderService` simply happened to call the two in the
//   right sequence - it injects 16 collaborators, of which `priceGroupService`
//   (`model/service/OrderService.cfc:L60`) and `promotionService`
//   (`model/service/OrderService.cfc:L61`) are the in-scope pair. That is the
//   strangler-fig seam, and the call direction is INVERTED at it rather than
//   followed: the orchestrator that used to own both services is not ported.
//
//   NO SIBLING PORT HAS RECORDED THIS REQUIREMENT. This file is where it
//   becomes explicit and non-optional. `src/handlers/bootstrap.ts` orders the
//   two passes explicitly in the composition root, and a test asserts that
//   ordering - reversing the two changes the computed discount, which is what
//   makes the assertion meaningful rather than decorative.
//
//   THE CONSTRAINT IS DOCUMENTED HERE, NOT IMPLEMENTED HERE. There is no
//   sequence number, no phase parameter, no `runAfter` field, no ordered-
//   pipeline type and no orchestration method on this port, and none may be
//   added. Nor is the constraint resolved by reaching for an external
//   orchestration service: infrastructure as code is out of scope, so no queue,
//   state machine or event bus appears in this design. `src/handlers/**` and
//   `src/services/**` enforce the ordering; this port states it.
//
// THE ANTI-CORRUPTION INVERSION, ALSO DECLARED HERE FOR THE FIRST TIME
//   Both `updateOrderAmountsWith*` entry points accept a READ-ONLY, ORDER-
//   SHAPED INPUT and RETURN INTENTS KEYED BY OPAQUE IDENTIFIERS, rather than
//   mutating order persistence. The legacy methods are declared `void` and
//   mutate a live ORM order graph in place - `model/service/PriceGroupService.
//   cfc:L370-L371` is exactly that, two setters on an order item reached
//   through the order aggregate. The target cannot do this, because the `Order`
//   aggregate and the whole order, checkout and payment pipeline are explicitly
//   out of scope. The returned intents are keyed by opaque `orderItemID`,
//   `orderFulfillmentID` and `orderID`, and NOTHING IN THE TARGET WRITES ORDER
//   PERSISTENCE.
//
//   This inversion is what makes the slice INDEPENDENTLY DEPLOYABLE: the
//   out-of-scope aggregate becomes an INPUT, never a dependency. A service that
//   needs the order only as data can ship without the order module; a service
//   that mutates the order aggregate cannot.
//
//   The read-only order-shaped inputs live in `src/domain/views/**` and are
//   consumed by `src/services/**`. NO PORT IN THIS FOLDER IMPORTS A VIEW TYPE -
//   not one, including this one. The inversion is described above in prose and
//   nothing here imports `../views/orderView.js` or declares an order shape.
//   There is likewise no `updateOrderAmountsWithPriceGroups` method on this
//   port: that is a SERVICE method on `src/services/priceGroupService.ts`, not a
//   repository method, and its reshaping to return intents is spent there.
//
// NO AMBIENT STATE - AND THE EXPLICIT CONTEXT PARAMETER IT FORCES
//   `model/service/PriceGroupService.cfc:L262-L268` is a seven-line method
//   containing BOTH of the codebase's request-scope accessors:
//   `getSlatwallScope()` at L263 and `getHibachiScope()` at L264. Both resolve
//   to the same ambient request scope; the codebase is simply inconsistent about
//   which name it uses, and `PriceGroupService` is the one place both appear
//   together. That method is exactly what `Sku.getCurrentAccountPrice()`
//   invokes, through a `getService("priceGroupService")` locator at
//   `model/entity/Sku.cfc:L437` inside the method spanning L435-L440.
//
//   Transformation rule T6 eliminates ambient state: `getHibachiScope()` and
//   `getSlatwallScope()` both vanish, and the legacy naming divergence
//   disappears with them. The replacement is an EXPLICIT CONTEXT PARAMETER
//   passed down the call chain, which is why `SkuPriceGroupResolver.
//   calculateSkuPriceBasedOnCurrentAccount` below takes a
//   `CurrentAccountContext` rather than reading one.
//
//   `src/lib/config.ts` IS STATIC PROCESS CONFIGURATION AND MUST NEVER BE USED
//   AS A REQUEST SCOPE. It is also not on the legal import surface for
//   `src/domain/**` and is not imported here. On this file specifically that is
//   a live temptation, because this is the port that replaces ambient scope -
//   so it is written down rather than assumed.
//
//   No module-level, ambient, singleton or implicit-context mechanism of any
//   kind is declared or implied by anything below. The reason is correctness,
//   not anything else: on a warm Lambda container module-level state survives
//   between unrelated invocations, so reproducing ambient scope would let one
//   customer's account leak into another customer's pricing. This is a
//   cross-request state hazard, and it is the only lens through which any of it
//   should be read.
//
// WHY TWO COLLABORATOR TYPES ARE CO-LOCATED IN THIS FILE
//   `CurrentAccountContext` and `SkuPriceGroupResolver` live here rather than in
//   modules of their own BECAUSE THE PORT COUNT IS LOCKED AT 13 AND NO NEW FILE
//   MAY BE CREATED. They are not a fourteenth and fifteenth port. They are
//   directly supporting types of this one - the context the resolver takes and
//   the resolver the price-group cascade exposes to the `Sku` entity - so the
//   project's one-exported-unit-per-file standard is satisfied on the reading it
//   actually states: one primary exported unit plus its directly supporting
//   co-located types. Nothing is placed in `../entities/` or `../valueObjects/`
//   to accommodate them, and no `accountContext.ts` or `subscriptionPriceGroup.
//   ts` is created.
//
// MUST-PRESERVE: THIS PORT SITS DIRECTLY ON THE PRICE-GROUP CASCADE
//   The price-group and currency resolution cascade is one of exactly three
//   behaviours named as must-preserve for this migration, and EVERYTHING THE
//   CASCADE READS ARRIVES THROUGH THIS PORT. The five levels - the SKU rate,
//   then the product rate, then the product-type parent chain, then the global
//   rate, then the parent price group - are at
//   `model/service/PriceGroupService.cfc:L140-L181`. Getting a rate load or a
//   parent traversal wrong here changes the price a customer is charged.
//
//   Characterization tests elsewhere pin that cascade INCLUDING its two
//   documented asymmetries, so a "corrected" implementation fails the gate
//   rather than passing it. Both asymmetries are service-tier behaviour owned by
//   `src/services/priceGroupService.ts` and neither is encoded on this port: the
//   parent recursion calls the PRODUCT variant rather than the SKU variant
//   (`model/service/PriceGroupService.cfc:L174`), and only the `percentageOff`
//   branch applies the rounding rule while `amountOff` and `amount` skip it
//   (`model/service/PriceGroupService.cfc:L316-L340`). No cascade level, no
//   strategy name, no amount type and no rounding flag appears on any signature
//   below.
//
// FETCH SHAPE IS AN EXPLICIT DECISION, AND LAZINESS IS NOT SIMULATED
//   `ORMExecuteQuery`, `<cfquery>`, `super.save()`, `super.delete()` and
//   Hibernate's lazy collections ALL collapse into the port methods below
//   (transformation rule T3). Associations are MATERIALIZED AT THE REPOSITORY
//   BOUNDARY, and laziness is NOT simulated: there is no proxy, no thunk, no
//   deferred getter and no lazy wrapper anywhere in the target. The consequence
//   is that fetch shape becomes an explicit, documented decision made at each
//   repository method in `src/repositories/mysql/mysqlPriceGroupRepository.ts`,
//   which also owns the row-to-entity factory, port injection and the
//   association materialization itself.
//
//   Concretely, and because the cascade walks every one of these:
//
//     * a returned `PriceGroup` must arrive with its `priceGroupRates`
//       populated, because all three cascade entry points loop over that
//       collection directly (`model/service/PriceGroupService.cfc:L63`, L108,
//       L146); with its GLOBAL RATE reachable, which is the rate carrying the
//       global flag (`PriceGroup.getGlobalPriceGroupRate()`,
//       `model/entity/PriceGroup.cfc:L83`, and the global-flag scans at
//       `model/service/PriceGroupService.cfc:L84`, L123 and L166); and with its
//       PARENT PRICE GROUP populated, because the final cascade level recurses
//       into it (`model/service/PriceGroupService.cfc:L91`, L130, L173-L174).
//     * a returned `PriceGroupRate` must arrive with its `roundingRule`
//       populated, because rate application reads it
//       (`model/service/PriceGroupService.cfc:L326-L327`); with its `appliesTo`
//       associations populated, because rate matching tests membership against
//       product types, products and SKUs (`model/service/PriceGroupService.
//       cfc:L70`, L109, L147); and with its excluded collections populated,
//       because the entity retains them.
//
//   Deciding this at the boundary is what removes the implicit N+1 the legacy
//   graph walking created, and the property being claimed is EXPLICITNESS, not
//   speed: the number of statements a call issues stops being an emergent
//   consequence of which getters a caller happens to touch and becomes a written
//   decision a reviewer can check. No non-functional requirement is asserted
//   anywhere in this file, because none exists in the source.
//
//   There is deliberately no `eagerLoad`, `fetch` or `include` options
//   parameter on any method below. Fetch shape is the adapter's documented
//   decision, not a caller's lever.
//
// THE ASYNC RULING
//   A method is asynchronous if and only if its legacy body reached the DAO or
//   the ORM. All six methods on `PriceGroupRepository` return promises, because
//   every one of them crosses the data store by definition. On
//   `SkuPriceGroupResolver` the ruling splits the two methods:
//   `calculateSkuPriceBasedOnPriceGroup` is SYNCHRONOUS because its legacy body
//   (`model/service/PriceGroupService.cfc:L301`) is pure over already-
//   materialized associations, while `calculateSkuPriceBasedOnCurrentAccount` is
//   ASYNCHRONOUS because its legacy body (L262) reaches the account path, which
//   reaches this port.
//
// UNDEFINED ON MISS, AND WHY THAT IS LOAD-BEARING HERE
//   Both load methods return `undefined` when the row is absent. That is the
//   folder-wide convention, and in this neighbourhood it is load-bearing rather
//   than tidy: `Sku.getPriceByCurrencyCode()`
//   (`model/entity/Sku.cfc:L269-L273`) has NO `else` branch and NO fallback, so
//   an unknown currency yields nothing at all, and SUBSTITUTING `0` FOR A
//   MISSING PRICE WOULD SILENTLY SELL PRODUCTS FOR FREE. A repository that
//   returned a default instead of `undefined` would re-introduce exactly that
//   hazard one layer lower down, where it is harder to see. Never substitute a
//   zero, an empty object, or a freshly constructed entity for a missing row.
//
// THE OPAQUE-IDENTIFIER REDUCTION
//   The out-of-scope `Account` entity is reduced to an opaque `accountID:
//   string` wherever it appears, on this port and in the co-located context
//   type. The same reduction applies to `Order`, `OrderItem` and
//   `OrderFulfillment` identifiers throughout the target. An opaque identifier
//   is the whole of what crosses the boundary: no account shape is declared
//   here, and no member of one is ever read.
//
// THE DOMAIN LAYER IMPORTS NOTHING OUTWARD
//   `src/domain/**` may import only from within `src/domain/**` and from
//   `src/lib/**`, and that boundary is enforced by an ESLint
//   `no-restricted-imports` rule rather than by review discipline - a violation
//   is a build failure. The MySQL driver is the live temptation on a repository
//   port and it is forbidden here: this file names no driver, no pool, no
//   connection and no row-packet type. Also absent by design, though they would
//   resolve: the decimal library (an implementation detail of `Money`), the
//   validation library, `src/lib/config.ts`, `src/lib/logger.ts`, any sibling
//   port, any view, any promotion-engine type, and any barrel specifier.
//
// THESE NAMES ARE CANONICAL. DO NOT RENAME THEM LATER.
//   The five subtrees that will import this file are empty or partial as this is
//   written: `src/domain/entities/`, `src/services/`,
//   `src/repositories/mysql/`, `src/handlers/` and
//   `src/integrations/google/`. Nothing downstream can therefore contradict a
//   name chosen here, which makes every name below CANONICAL by construction.
//   Legacy CFML names are carried over verbatim in camelCase because interface
//   parity is the acceptance contract for this migration -
//   `getAccountSubscriptionPriceGroups`,
//   `calculateSkuPriceBasedOnPriceGroup`,
//   `calculateSkuPriceBasedOnCurrentAccount` - as are legacy parameter names:
//   `accountID`, `sku`, `priceGroup`. Where a name has NO legacy antecedent,
//   the doc comment says so explicitly rather than letting a reader assume
//   parity that does not exist.
//
// TEST COVERAGE FOR THIS PORT IS NET-NEW, NOT LEGACY PARITY
//   Nothing in the legacy suite covers price groups at all. Only three legacy
//   test files touch this migration's slice - `meta/tests/unit/entity/
//   BrandTest.cfc`, `meta/tests/unit/entity/ProductTest.cfc`, and the EMPTY
//   `meta/tests/functional/admin/entity/ProductTest.cfc` - and none of the
//   three concerns price groups. `meta/tests/unit/dao/` contains only account
//   and payment DAO tests; `meta/tests/unit/service/` contains only account,
//   framework-base, payment and resource-bundle service tests. There is no
//   `PriceGroupDAO` test and no `PriceGroupService` test anywhere. Every test
//   written against this contract is therefore NET-NEW COVERAGE and must be
//   reported as such rather than presented as preserved parity. SQL-shape and
//   parameter-binding assertions belong in
//   `tests/integration/repositories/*.test.ts`; the execution-ordering
//   assertion belongs at the service and handler tier. No test is authored in
//   this file.
//
// WHO IMPLEMENTS THIS PORT
//   `src/repositories/mysql/**` implements exactly six of the thirteen ports,
//   and this is one of the six: ITS ADAPTER IS
//   `src/repositories/mysql/mysqlPriceGroupRepository.ts`. Six obligations
//   transfer to that file:
//
//     1. PREPARED STATEMENTS EXCLUSIVELY, with `accountID` bound rather than
//        interpolated, per the transfer statement above.
//     2. THE SUBSCRIPTION REACH-THROUGH IS REPRODUCED AS-IS AND READ-ONLY,
//        with its dialect-specific row limiting parameterized in
//        `src/repositories/mysql/sql/accountSubscriptionPriceGroups.sql.ts` and
//        `src/repositories/mysql/dialect.ts`, MySQL branch only. No
//        subscription write, ever.
//     3. THE `<cfquery>` BODY AT `model/dao/PriceGroupDAO.cfc:L52-L100` IS THE
//        SQL SOURCE OF TRUTH. Reproduce its joins, its open-ended-or-future end
//        date filter, and its active-status predicate exactly.
//     4. THE ROW-TO-ENTITY FACTORY, PORT INJECTION AND ASSOCIATION
//        MATERIALIZATION, with the fetch shape decided and commented at each
//        repository method, to the depth the cascade walks it. Laziness is not
//        simulated.
//     5. EXPLICIT MATERIALIZED-PATH MAINTENANCE REPLACES THE ORM LIFECYCLE
//        HOOKS. The adapter invokes path maintenance on save, using the prior
//        persisted state supplied through the save shape below, reproducing
//        `model/entity/PriceGroup.cfc:L206` (`preInsert`) and L211
//        (`preUpdate`). THIS IS THE PRECEDENT FOR PATH MAINTENANCE ACROSS THE
//        WHOLE TARGET - `productTypeIDPath` and `categoryIDPath` follow the
//        same pattern.
//     6. NO CACHING, NO MEMOISATION AND NO MODULE-LEVEL STATE. Anything the
//        legacy component memoised becomes request-scoped, for the
//        cross-request correctness reason given above.
//
//   `src/handlers/bootstrap.ts` WIRES this port to that adapter; it does not
//   implement it. The two co-located types have no adapter file in the locked
//   layout, and that is deliberate: `SkuPriceGroupResolver` is satisfied in
//   `src/handlers/bootstrap.ts` by adapting the ported
//   `src/services/priceGroupService.ts` surface, and injected into the `Sku`
//   entity from there; and `CurrentAccountContext` is CONSTRUCTED PER REQUEST AT
//   THE HANDLER BOUNDARY - never read from module scope, and never from
//   `src/lib/config.ts`. `src/handlers/bootstrap.ts` is also where the
//   execution-ordering constraint above is enforced.
//
// WHAT BELONGS TO A SIBLING AND IS THEREFORE ABSENT HERE
//   Recorded so that an absence reads as a decision rather than an oversight:
//
//     * SKU, product, option, product-type and promotion queries belong to
//       `skuRepository`, `productRepository`, `optionRepository`,
//       `productTypeRepository` and `promotionRepository` respectively. None
//       appears here.
//     * the ROUNDING-RULE ROW is supplied by `promotionRepository`, which hosts
//       that lookup; the rounding ARITHMETIC belongs to
//       `src/services/roundingRuleService.ts`. There is no
//       `roundingRuleRepository` port and no rounding arithmetic here.
//     * CURRENCY CONVERSION belongs to the `currencyConverter` port.
//     * SETTINGS belong to the `settingsProvider` port, through which the
//       default SKU currency and the eligible-currency list resolve
//       (`model/service/SettingService.cfc:L221` and L222). No settings
//       accessor and no currency-code default literal appears here.
//     * the two cascade asymmetries (`model/service/PriceGroupService.cfc:L174`
//       and L316-L340), the `local.i` reference where the loop variable is `i`
//       (`model/service/PriceGroupService.cfc:L236`), and the `deletePriceGroup`
//       loop over a child collection snapshot that is never re-read
//       (`model/service/PriceGroupService.cfc:L461-L470`, preserved at the
//       service tier with a bounded-iteration guard) are all owned by
//       `src/services/priceGroupService.ts`. This port adds no guard, no bound,
//       no cursor and no re-read parameter to compensate for any of them.
//     * the misspelled `subsciptionUsageBenefit` argument name
//       (`model/entity/PriceGroup.cfc:L168`) is preserved-with-a-comment in the
//       entities sibling and does not appear on this port at all.
//     * `PriceGroupRate` retains excluded-product-type, excluded-product and
//       excluded-SKU collections even though the cascade never consults them -
//       an association-materialization concern for the adapter and a documented
//       gap in the entities sibling, not a port method.
//
//   `model/dao/PriceGroupDAO.cfc` contains no defect, and every price-group
//   defect that does exist lives at the service or entity tier and is annotated
//   there. This file therefore carries no defect annotation and no
//   carried-forward source annotation of its own, and none may be invented for
//   it.
// ---------------------------------------------------------------------------

// Ports and entities reference each other at the TYPE level and must never do
// so at the value level. Entities take port interfaces as constructor
// parameters - `Sku` is constructed with the `SkuPriceGroupResolver` declared
// in THIS file, which is what replaces the `getService("priceGroupService")`
// locator at `model/entity/Sku.cfc:L437` - while this file imports the entity
// types it returns and accepts. That asymmetry is what justifies authoring
// ports before entities: an entity body needs the full method SIGNATURES from a
// port, whereas a port needs only the type NAME and module path from an entity.
// This file returns `PriceGroup` and `PriceGroupRate`, accepts `Sku`, and never
// invokes a member of any of them.
//
// Because `import type` is fully erased at emit, because these port files
// declare interfaces only, and because the project-wide no-barrel policy means
// no index module can force eager evaluation of the cycle, the resulting
// reference cycle exists purely in the type graph and never at runtime. Never
// turn any of these into a value import.
//
// `../entities/priceGroup.js`, `../entities/priceGroupRate.js` and
// `../entities/sku.js` DO NOT RESOLVE YET - the entities sibling is still being
// authored. The specifiers are correct and are written anyway, exactly as the
// two sibling repository ports already do for their own entity types; the
// internal authoring order of this migration is a compile-order convenience,
// not a schedule, and the unresolved specifiers clear the moment those modules
// land. Do NOT "fix" this by deleting an import, declaring a local class, or
// relaxing `tsconfig.json`.
import type { PriceGroup } from '../entities/priceGroup.js';
import type { PriceGroupRate } from '../entities/priceGroupRate.js';
import type { Sku } from '../entities/sku.js';
import type { Money } from '../valueObjects/money.js';

/**
 * The explicit request context that replaces CFML's ambient request scope for
 * price-group resolution.
 *
 * NO LEGACY ANTECEDENT. There is no CFML component, struct or argument of this
 * name; the name is new, because the thing it replaces was never a named value
 * in the first place. What it replaces is the AMBIENT SCOPE reached through the
 * two accessors in `model/service/PriceGroupService.cfc:L262-L268` -
 * `getSlatwallScope()` at L263 and `getHibachiScope()` at L264 - which both
 * resolve to the same per-request scope. Transformation rule T6 removes ambient
 * state entirely, so the scope becomes a parameter and the legacy inconsistency
 * between the two accessor names disappears with it.
 *
 * THIS TYPE IS DELIBERATELY MINIMAL AND IS NOT A CONTEXT BAG. It declares only
 * what the two cited call sites actually read. The legacy body reads exactly two
 * things: whether a user is logged in (L263) and, if so, that user's account
 * (L264). Those two reads collapse into the PRESENCE OR ABSENCE of a single
 * opaque account identifier, which is a strictly better model than carrying both
 * - it makes the two contradictory states unrepresentable, where a separate flag
 * plus a separate identifier would allow "logged in with no account" and "not
 * logged in but here is an account" to be constructed and then silently
 * mishandled.
 *
 * Nothing else belongs here. There is no session, locale, currency, timezone,
 * permission, request identifier, correlation identifier or logger member, and
 * none may be added: this is the context for resolving an account's price
 * groups, not an ambient scope rebuilt under a new name. Widening it would
 * re-create precisely the ambient-scope coupling T6 exists to remove.
 *
 * It is CONSTRUCTED PER REQUEST AT THE HANDLER BOUNDARY in
 * `src/handlers/bootstrap.ts` and passed down the call chain. It is never read
 * from module scope and never assembled from `src/lib/config.ts`, which is
 * static process configuration and is not a request scope.
 *
 * It is co-located in this file rather than given a module of its own because
 * the port folder is locked at thirteen files and no new file may be created; it
 * is a directly supporting type of the resolver below, not a fourteenth port.
 */
export interface CurrentAccountContext {
  /**
   * The current account, reduced to an opaque identifier.
   *
   * ABSENT MEANS NO AUTHENTICATED ACCOUNT, and that state is load-bearing
   * rather than incidental. It is the target's representation of the legacy
   * `else` branch at `model/service/PriceGroupService.cfc:L266`, where a
   * request with no logged-in user resolves to the SKU's own price and no
   * price-group resolution is attempted at all. The legacy scope can hand back
   * a new and empty account object in that situation, which is why the check at
   * L263 guards the account read at L264; modelling the absence directly
   * reproduces that behaviour without reproducing the empty object.
   *
   * The out-of-scope `Account` entity is reduced to this identifier and nothing
   * more. No account shape is declared anywhere in the domain, and no member of
   * one is ever read - the identifier is the whole of what crosses the
   * boundary. The same reduction applies to `Order`, `OrderItem` and
   * `OrderFulfillment` identifiers throughout the target.
   */
  readonly accountID?: string;
}

/**
 * The price group repository port.
 *
 * SIX METHODS, and the count is locked. One is the single function declared by
 * `model/dao/PriceGroupDAO.cfc`; the other five exist because the ORM is gone
 * and `super.save()`, `super.delete()`, `entityLoad()` and `entityNew()` have no
 * equivalent in a driver-only stack. The full arithmetic is in the file header.
 *
 * EVERY METHOD RETURNS A PROMISE, because every one of them crosses the data
 * store by definition. Parameter types replace the legacy `any` - the legacy
 * component declares `required any priceGroup` and `required any sku`
 * throughout - with concrete entity types, which is what makes the contract
 * checkable at all.
 *
 * MISSING ROWS YIELD `undefined`, never `0`, never an empty object, and never a
 * freshly constructed entity. In this neighbourhood that convention is
 * load-bearing: `Sku.getPriceByCurrencyCode()`
 * (`model/entity/Sku.cfc:L269-L273`) has no `else` and no fallback, so
 * substituting a default for a missing price would silently sell products for
 * free.
 *
 * ASSOCIATIONS ARRIVE MATERIALIZED. Laziness is not simulated anywhere in the
 * target, so the fetch shape of every method below is an explicit decision
 * documented at the corresponding method of
 * `src/repositories/mysql/mysqlPriceGroupRepository.ts`. The header records
 * exactly which associations the five-level cascade walks and therefore requires
 * to be present. There is deliberately no eager-load, fetch or include options
 * parameter for a caller to tune.
 *
 * THIS PORT SITS DIRECTLY ON A MUST-PRESERVE BEHAVIOUR. The price-group and
 * currency resolution cascade at `model/service/PriceGroupService.cfc:L140-L181`
 * reads everything it needs through these six methods, and characterization
 * tests pin that cascade including its two documented asymmetries. Both
 * asymmetries are service-tier behaviour; neither is encoded here.
 */
export interface PriceGroupRepository {
  /**
   * The active price groups an account is entitled to BY SUBSCRIPTION, as
   * distinct from those assigned to it directly.
   *
   * Legacy: `model/dao/PriceGroupDAO.cfc:L52`, `<cffunction>` TAG syntax,
   * spanning L52-L100, and THE ONLY FUNCTION THE COMPONENT DECLARES. The
   * component carries no `returntype` attribute on it. Its single argument is
   * declared `<cfargument name="accountID" type="string">` at L53 - typed but
   * NOT marked `required` - and the name is carried over verbatim. Its sole
   * caller is `PriceGroupService.calculateSkuPriceBasedOnAccount`
   * (`model/service/PriceGroupService.cfc:L271-L298`), which always supplies it
   * at L277, so it is required here.
   *
   * THIS IS THE ONE DELIBERATE, READ-ONLY, DOCUMENTED REACH-THROUGH INTO
   * SUBSCRIPTION-OWNED TABLES. Six of them are read: the
   * subscription-usage-benefit-to-account link table, the
   * subscription-usage-benefit table, the
   * subscription-usage-benefit-to-price-group link table, the subscription-usage
   * table, the subscription-status table, and the shared type table. They are
   * named in prose deliberately; no table-name literal appears in this file.
   * The three governing facts, stated in full in the file header, are that the
   * query is ported because account price-group resolution is otherwise
   * unreproducible, that it is READ-ONLY and no write of any kind ever reaches a
   * subscription table through this port or its adapter, and that NO
   * SUBSCRIPTION BUSINESS LOGIC IS PORTED - it yields price groups and nothing
   * else. It is not the `subscriptionTermProvider` port, which is a narrow stub
   * port for out-of-scope SKU-creation branches, and that port is not this.
   *
   * WHY THE RETURN TYPE IS THE ENTITY AND NOT A NARROWER PROJECTION. The
   * question is real, because the legacy `<cfquery>` projects exactly one
   * column - the distinct price group identifier at
   * `model/dao/PriceGroupDAO.cfc:L59` and L75. It was settled by reading, and
   * two independent readings agree:
   *
   *  * THE LEGACY FUNCTION IS TWO-STAGE AND ITSELF RETURNS ENTITIES. That
   *    single-column query is an intermediate step, not the result. When it
   *    matches any rows (L92) the function runs a SECOND, ORM query over the
   *    price group entity, filtered to those identifiers AND to active price
   *    groups only (L93), and returns those entities (L95). When it matches
   *    nothing it returns an EMPTY ARRAY (L98) - never null, which is why this
   *    method resolves to an array rather than to an optional one.
   *  * THE CALLER CONSUMES THEM AS ENTITIES. At
   *    `model/service/PriceGroupService.cfc:L276` the caller reads the account's
   *    directly-assigned price groups, at L277 it calls this function, and at
   *    L280-L284 it MERGES the two into one collection. It then passes each
   *    element of that merged collection to `calculateSkuPriceBasedOnPriceGroup`
   *    (L290), which reaches `getRateForSkuBasedOnPriceGroup` (L304) and from
   *    there loops over the group's rates and recurses into its parent group.
   *    A narrower projection could not survive that traversal and would not be
   *    interchangeable with the directly-assigned groups it is merged with.
   *
   * So the entity is what the source produces and what the consumer requires,
   * and no read projection is declared in this file. The active-only filter and
   * the empty-array-on-no-match behaviour are both part of the contract and the
   * adapter must reproduce both.
   *
   * The out-of-scope `Account` entity is reduced to an opaque identifier here,
   * as it is everywhere in the target.
   */
  getAccountSubscriptionPriceGroups(accountID: string): Promise<PriceGroup[]>;

  /**
   * Load one price group by its identifier.
   *
   * NO LEGACY ANTECEDENT. `model/dao/PriceGroupDAO.cfc` declares no load
   * function, because it never needed one: Hibernate supplied entity loading
   * ambiently through `entityLoad()`, and the framework base component resolved
   * a price group from an identifier without the DAO participating. This method
   * exists solely because that ambient capability is gone (transformation rule
   * T3). The name is therefore new, and is recorded as new rather than presented
   * as parity.
   *
   * Yields `undefined` when no price group carries the identifier. It must not
   * yield a default, an empty object, or a newly constructed entity.
   *
   * The returned entity must arrive with the associations the cascade walks
   * already populated - its rates, its global rate, and its parent price group.
   * The header records why each of the three is required and where the cascade
   * reads it.
   */
  getPriceGroup(priceGroupID: string): Promise<PriceGroup | undefined>;

  /**
   * Load one price group rate by its identifier.
   *
   * NO LEGACY ANTECEDENT, for the same reason as the price group load above:
   * rate loading was Hibernate's, not the DAO's.
   *
   * Yields `undefined` when no rate carries the identifier.
   *
   * The returned rate must arrive with its rounding rule populated, because rate
   * application reads it at `model/service/PriceGroupService.cfc:L326-L327`;
   * with the associations it applies to populated, because rate matching tests
   * membership against product types, products and SKUs; and with its excluded
   * collections populated, because the entity retains them even though the
   * cascade never consults them.
   */
  getPriceGroupRate(priceGroupRateID: string): Promise<PriceGroupRate | undefined>;

  /**
   * Persist one price group, inserting or updating it, and return the persisted
   * entity.
   *
   * NO LEGACY ANTECEDENT ON THE DAO. The legacy save path is the framework
   * base's `super.save()`, reached through the service tier, and the DAO takes
   * no part in it. The name is new.
   *
   * THE SECOND PARAMETER IS WHAT MAKES EXPLICIT MATERIALIZED-PATH MAINTENANCE
   * POSSIBLE, and it is the reason this method's shape differs from the rate
   * save below. The price group entity maintains a materialized identifier path
   * up its parent chain - `getPriceGroupIDPath()` at
   * `model/entity/PriceGroup.cfc:L195`, which lazily builds the path from the
   * parent association - and the legacy system kept that path current through
   * two Hibernate ORM LIFECYCLE HOOKS: `preInsert` at
   * `model/entity/PriceGroup.cfc:L206` and `preUpdate` at L211. Both recompute
   * the path before the row is written.
   *
   * There are no ORM lifecycle hooks in the target, so the hooks become explicit
   * path maintenance invoked by the repository on save. `preUpdate` is declared
   * in the legacy source as `preUpdate(struct oldData)` - IT ALREADY TAKES THE
   * PRIOR STATE AS A PARAMETER - so exposing that prior state here is a faithful
   * port of the hook's own declared shape rather than an invention. It is needed
   * because recomputing a DESCENDANT's path requires knowing what the path was
   * before the move: an update that re-parents a price group invalidates the
   * stored path of every group beneath it, and finding those descendants means
   * matching against the path as it stood before the change.
   *
   * `priorState` is therefore the previously persisted state that the
   * `preUpdate`-equivalent path maintenance needs, and it is ABSENT ON AN
   * INSERT, where by definition there is no prior state and the `preInsert`
   * equivalent simply builds the path from the parent chain.
   *
   * This is a SHAPE, not a mechanism. It is deliberately not a callback, a hook
   * registry, an event emitter, a `beforeSave`/`afterSave` option or a boolean
   * flag: a port declares what the adapter is given, and the adapter decides
   * what to do with it. The adapter's path maintenance is the precedent for the
   * whole target - the product-type and category identifier paths follow the
   * same pattern - and the comma-delimited identifier-path walking those three
   * share is centralised in `../valueObjects/materializedIdPath.js` at the
   * domain tier. That module is named here in prose only and is not imported,
   * because no parameter or return of this port is in a path position.
   *
   * The persisted path column itself is unchanged by this migration, as is every
   * other column: there is no migration, no rename, no new table and no column
   * change anywhere in this port.
   */
  savePriceGroup(priceGroup: PriceGroup, priorState?: PriceGroup): Promise<PriceGroup>;

  /**
   * Persist one price group rate, inserting or updating it, and return the
   * persisted entity.
   *
   * NO LEGACY ANTECEDENT ON THE DAO. `PriceGroupService.savePriceGroupRate`
   * (`model/service/PriceGroupService.cfc:L397`) is a SERVICE method that
   * delegates persistence to the framework base's `super.save()` at L404 and
   * then reconciles the sibling rates of the same price group; the DAO declares
   * nothing. So the service method of that name is ported at the service tier
   * and this is the narrower persistence primitive it will call. The name echoes
   * the service method deliberately, but it is new AS A REPOSITORY METHOD and is
   * recorded as such.
   *
   * NO PRIOR-STATE PARAMETER, and the asymmetry with the price group save above
   * is intentional rather than an oversight: a rate maintains no materialized
   * path, so there is no `preUpdate`-equivalent recomputation for a prior state
   * to feed. Adding one here would imply maintenance that does not exist.
   *
   * The sibling-rate reconciliation, the global-flag exclusivity rule and the
   * include and exclude clearing that the legacy service performs at
   * `model/service/PriceGroupService.cfc:L407-L444` are all SERVICE-tier
   * behaviour owned by `src/services/priceGroupService.ts`. None of it is
   * declared here, and this method must not be widened to absorb any of it.
   */
  savePriceGroupRate(priceGroupRate: PriceGroupRate): Promise<PriceGroupRate>;

  /**
   * Delete one price group, resolving to whether the delete succeeded.
   *
   * NO LEGACY ANTECEDENT ON THE DAO. `PriceGroupService.deletePriceGroup`
   * (`model/service/PriceGroupService.cfc:L461`) is a SERVICE method declared
   * `public boolean function`; it detaches inheriting child price groups and
   * then delegates to the framework base's `super.delete()` at L469. The boolean
   * resolution here matches that declared legacy return type. The DAO declares
   * no delete, so the name is new as a repository method.
   *
   * THE CHILD-DETACHMENT LOOP STAYS AT THE SERVICE TIER, and so does its known
   * hazard: the legacy body captures the child collection once at
   * `model/service/PriceGroupService.cfc:L463` and then loops
   * `while(arrayLen(...) != 0)` over that SNAPSHOT (L465-L467) without ever
   * re-reading it, which can fail to terminate. That behaviour is preserved at
   * the service tier with a bounded-iteration guard and an annotation, and it is
   * `src/services/priceGroupService.ts`'s to carry. NO guard, bound, cursor,
   * iteration limit or re-read parameter is added to this port to compensate -
   * doing so would move service behaviour into the data layer and quietly change
   * what the guard means.
   */
  deletePriceGroup(priceGroup: PriceGroup): Promise<boolean>;
}

/**
 * The narrow price-group collaborator the `Sku` entity is constructed with.
 *
 * WHY IT EXISTS. `model/entity/Sku.cfc` reaches outward to the price group
 * service through a runtime SERVICE LOCATOR at two sites: `getPriceByPriceGroup`
 * at `model/entity/Sku.cfc:L261`, whose `getService("priceGroupService")` call
 * is on L262, and `getCurrentAccountPrice()` at L435-L440, whose locator is on
 * L437. Transformation rule T2 converts both into ONE CONSTRUCTOR-INJECTED PORT
 * on the entity, which is this interface. The locator, and with it the runtime
 * lookup by string name, disappears.
 *
 * EXACTLY TWO METHODS, matching those two call sites and nothing else. No third
 * method may be added - notably not the rate lookup behind
 * `Sku.getAppliedPriceGroupRateByPriceGroup` (`model/entity/Sku.cfc:L265`),
 * which is not part of this contract.
 *
 * THE INTERFACE NAME HAS NO LEGACY ANTECEDENT. There is no CFML component,
 * interface or argument called anything like it: the legacy code had no name for
 * this collaborator at all, because the locator resolved the whole service by
 * string at each call site and no narrowed contract ever existed to be named.
 * The name is therefore new and is recorded as new. Its two METHOD names, by
 * contrast, are verbatim legacy names - see each method below.
 *
 * Both method names are VERBATIM from the legacy source, as are both parameter
 * names, because interface parity is the acceptance contract. Both return
 * `Money` and never a plain number: `Money` is the sole arithmetic surface in
 * the target, and it is what closes the legacy inconsistency in which
 * `precisionEvaluate` guarded some of the price-group arithmetic
 * (`model/service/PriceGroupService.cfc:L323` and L331) while the presentation
 * step and other branches did not.
 *
 * The interface is deliberately NARROW. It is not the ported price group
 * service, and it exposes none of that service's other eleven public methods -
 * an entity should be able to resolve a price and nothing more. It is satisfied
 * in `src/handlers/bootstrap.ts` by adapting the ported
 * `src/services/priceGroupService.ts` surface, and injected into the `Sku`
 * entity from there; it has no adapter file of its own in the locked layout.
 *
 * It is co-located in this file rather than given a module of its own because
 * the port folder is LOCKED AT 13 files and no new file may be created. It is
 * not a fifteenth port; it is a directly supporting type of the port above,
 * consuming the `CurrentAccountContext` declared alongside it and the same
 * entity types this file already imports.
 */
export interface SkuPriceGroupResolver {
  /**
   * The SKU's price under a specific price group.
   *
   * Legacy: `model/service/PriceGroupService.cfc:L301`, declared
   * `public numeric function calculateSkuPriceBasedOnPriceGroup(required any
   * sku, required any priceGroup)`. Name and both parameter names are verbatim.
   *
   * SYNCHRONOUS, per the async ruling: the legacy body reaches no data store. It
   * resolves the applicable rate through the cascade (L304) and either applies
   * that rate or passes the SKU's own price straight through when no rate
   * applies (L307-L312), and every step of that is pure over associations the
   * repository has already materialized.
   *
   * Returns `Money`, never a number. The legacy declaration says `numeric` while
   * the body's final statement is a two-decimal presentation format
   * (`model/service/PriceGroupService.cfc:L339`) that actually yields a string;
   * CFML coerces between the two silently and the target does not, so the
   * monetary value object is the honest type for both the input side and the
   * result.
   *
   * The cascade this delegates to carries two documented asymmetries, both owned
   * and preserved by `src/services/priceGroupService.ts` and neither expressible
   * on this signature: the parent recursion calls the product variant rather
   * than the SKU variant (`model/service/PriceGroupService.cfc:L174`), and only
   * the percentage-off branch applies the rounding rule (L316-L340). No cascade
   * level, strategy name, amount type or rounding flag is encoded here.
   */
  calculateSkuPriceBasedOnPriceGroup(sku: Sku, priceGroup: PriceGroup): Money;

  /**
   * The SKU's price for the account making the current request.
   *
   * Legacy: `model/service/PriceGroupService.cfc:L262`, declared
   * `public numeric function calculateSkuPriceBasedOnCurrentAccount(required any
   * sku)`. Name and the `sku` parameter name are verbatim.
   *
   * ASYNCHRONOUS, per the async ruling: the logged-in branch delegates to the
   * account path (`model/service/PriceGroupService.cfc:L264`), which reaches
   * `getAccountSubscriptionPriceGroups` on the port above and therefore crosses
   * the data store.
   *
   * THE SECOND PARAMETER IS THE ELIMINATION OF AMBIENT STATE, NOT A BUDGETED
   * SIGNATURE WIDENING. The legacy body is seven lines and contains BOTH of the
   * codebase's request-scope accessors - `getSlatwallScope()` at
   * `model/service/PriceGroupService.cfc:L263` and `getHibachiScope()` at L264 -
   * which both resolve to the same ambient per-request scope. Transformation
   * rule T6 removes ambient state and replaces it with an explicit context
   * parameter passed down the call chain; this signature is where that
   * replacement lands, and the legacy divergence between the two accessor names
   * disappears with it. A reviewer should read this parameter as the mandated T6
   * transformation, which the migration plan requires outright, and NOT as a
   * discretionary widening drawn against the plan's budget of entity-layer
   * signature widenings - that budget is spent elsewhere and none of it is spent
   * here.
   *
   * When the context carries no account identifier the resolution must behave as
   * the legacy `else` branch does at `model/service/PriceGroupService.cfc:L266`
   * and yield the SKU's own price, attempting no price-group resolution at all.
   *
   * The context is constructed per request at the handler boundary. It is never
   * read from module scope and never assembled from `src/lib/config.ts`, which
   * is static process configuration and is not a request scope. Reproducing the
   * legacy ambient scope as module-level state would be unsafe on a warm
   * container, where such state survives between unrelated invocations and one
   * customer's account could reach another customer's pricing.
   *
   * Returns `Money`, never a number, for the same reason as the method above.
   */
  calculateSkuPriceBasedOnCurrentAccount(sku: Sku, context: CurrentAccountContext): Promise<Money>;
}
