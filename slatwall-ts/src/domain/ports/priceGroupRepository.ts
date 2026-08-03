// Price-group repository port: price-group and rate loading, plus the account
// subscription price-group query.
//
// Replaces `model/dao/PriceGroupDAO.cfc`, whose single function
// `getAccountSubscriptionPriceGroups` [model/dao/PriceGroupDAO.cfc:L52-L100] is
// the whole component. The remaining methods exist because `entityNew()`,
// `entityLoad()`, `super.save()` and `super.delete()` have no equivalent in a
// driver-only stack.
//
// SUBSCRIPTION REACH-THROUGH, DOCUMENTED AT THE PORT. The account query reads
// subscription-owned tables - `SwSubsUsageBenefitAccount`, `SwSubsUsageBenefit`,
// `SwSubsUsageBenefitPriceGroup`, `SwSubsUsage`, `SwSubscriptionStatus`, `SwType`
// [model/dao/PriceGroupDAO.cfc:L57-L89] - even though the subscription module is
// out of scope. The SQL is reproduced because account price-group resolution is
// otherwise unreproducible; NO subscription business logic is ported.
//
// EXECUTION ORDER IS A REAL CONSTRAINT, AND IT IS STATED HERE RATHER THAN
// IMPLEMENTED HERE. `PriceGroupService.updateOrderAmountsWithPriceGroups` must
// run BEFORE `PromotionService.updateOrderAmountsWithPromotions`, because the
// promotion pass reads price-group state the price-group pass writes: the
// discount base price at [model/service/PromotionService.cfc:L241-L254] is
// `getPrice()` for a price-group-ineligible item but `getSkuPrice()` plus a
// correction term for an eligible one. In the legacy system the ordering held only
// because `OrderService` happened to call them in that sequence
// [model/service/OrderService.cfc:L60-L61].
//
// UNFULFILLED TEST OBLIGATION: no test yet asserts that reversing the two passes
// changes the computed discount. That assertion is required and is not written.
//
// This port carries no sequence number, phase parameter, `runAfter` field,
// ordered-pipeline type or orchestration method, and none may be added -
// `src/handlers/**` and `src/services/**` enforce the ordering; this port states
// it.
//
// ANTI-CORRUPTION INVERSION. Both `updateOrderAmountsWith*` entry points accept a
// read-only, order-shaped input and return applied intents keyed by opaque
// identifiers rather than mutating a live ORM graph, which is what lets an
// in-scope engine be driven by an out-of-scope aggregate.

import type { PriceGroup } from '../entities/priceGroup.js';
import type { PriceGroupRate } from '../entities/priceGroupRate.js';

/**
 * The explicit request context that replaces CFML's ambient request scope for
 * price-group resolution.
 *
 * Replaces the ambient scope reached through the two accessors at
 * [model/service/PriceGroupService.cfc:L262-L268] - `getSlatwallScope()` at L263
 * and `getHibachiScope()` at L264, which both resolve to the same per-request
 * scope. Making it a parameter also retires the legacy inconsistency between the
 * two accessor names.
 *
 * DELIBERATELY MINIMAL, AND NOT A CONTEXT BAG. The legacy body reads exactly two
 * things: whether a user is signed in (L263) and, if so, that user's account
 * (L264). Both collapse into the presence or absence of one opaque account
 * identifier, which makes "signed in with no account" and "not signed in but here
 * is an account" unrepresentable. No session, locale, currency, timezone,
 * permission, request identifier or logger member belongs here, and widening it
 * would re-create the ambient-scope coupling this replaces.
 *
 * Constructed per request at the handler boundary and passed down the call chain;
 * never read from module scope and never assembled from `src/lib/config.ts`, which
 * is static process configuration rather than a request scope.
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
 * `src/repositories/mysql/mysqlPriceGroupRepository.ts`. There is deliberately no
 * eager-load, fetch or include options parameter for a caller to tune.
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
   * behaviour owned by `src/services/priceGroupService.ts`. NONE OF THAT
   * DECISION-MAKING IS DECLARED HERE and this method must not be widened to
   * absorb any of it: nothing in the contract says which sibling is affected,
   * which member is stripped, or when a flag is demoted.
   *
   * ★★ THE SECOND PARAMETER IS THE RECORD OF A PLAN CHANGE, AND THE EARLIER
   * REASONING IS QUOTED RATHER THAN OVERWRITTEN. This method was originally
   * declared with one parameter, and the sentence above once ended "None of it is
   * declared here, and this method must not be widened to absorb any of it." That
   * prohibition was right about the DECIDING and wrong about the PERSISTING, and
   * the two are not the same obligation.
   *
   * Under the ORM they did not need separating. `super.save()` at
   * `model/service/PriceGroupService.cfc:L404` only made the rate managed; the
   * service then mutated that rate and its siblings in memory, and Hibernate
   * flushed EVERY dirty managed entity together at request end. One transaction,
   * covering the rate and every sibling the exclusivity rule had touched. With
   * the ORM gone there is no request-end flush and no dirty tracking, so a
   * contract that can persist exactly one rate cannot express that unit of work
   * at all - and the consequence was not a missing feature but a corrupt state:
   * a rate saved as global with its siblings still global, or a rate whose
   * membership moved while the sibling it moved away from kept its link rows.
   * Both change which rate a SKU resolves to, and therefore what a customer pays.
   *
   * SO THE UNIT OF WORK IS DECLARED, NOT THE RULE. The service decides which
   * rates changed and how; it then hands the whole set to one call, which
   * persists all of them together or none of them. Adding an optional trailing
   * parameter rather than a new method keeps the port at SIX MEMBERS and honours
   * the header's "no seventh method" prohibition literally - and it follows
   * `savePriceGroup` immediately above, which already takes an optional trailing
   * parameter for the same kind of reason. This is NOT the "bulk save" the header
   * forbids: the set is not an arbitrary batch a caller assembled for throughput,
   * it is the closure of one save under one legacy invariant.
   *
   * @param priceGroupRate - the rate the caller saved; the returned entity is
   *   this one, persisted.
   * @param reconciledSiblings - the sibling rates of the SAME price group that
   *   the caller's exclusivity reconciliation mutated, to be persisted in the
   *   same unit of work. Absent or empty when the reconciliation changed nothing,
   *   which is the ordinary case.
   */
  savePriceGroupRate(
    priceGroupRate: PriceGroupRate,
    reconciledSiblings?: readonly PriceGroupRate[],
  ): Promise<PriceGroupRate>;

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
   * for `src/services/priceGroupService.ts` to carry. NO guard, bound, cursor,
   * iteration limit or re-read parameter is added to this port to compensate -
   * doing so would move service behaviour into the data layer and quietly change
   * what the guard means.
   *
   * ★★ THE LOOP STAYS THERE; THE WRITE IT IMPLIES BELONGS HERE, AND THE TWO WERE
   * ONCE CONFLATED. `removeChildPriceGroup` nulls the child's `parentPriceGroup`
   * association [model/entity/PriceGroup.cfc:L139], which is mapped to the physical
   * `SwPriceGroup.parentPriceGroupID` [model/entity/PriceGroup.cfc:L59]. Under the
   * ORM those children were MANAGED, so the loop's mutations were flushed as UPDATEs
   * in the same transaction as the parent's delete; without a session the loop
   * decides which children detach and NOTHING performs the detachment. So this
   * method PERSISTS it, and does so as part of the same unit of work as the delete.
   * That is not the loop moving into the data layer - the service still decides, and
   * still carries its guard and its annotated hazard - it is the flush the ORM used
   * to provide, which was never service behaviour to begin with.
   *
   * ★★ SO IS THE DELETE REFUSAL, AND THAT IS WHY THE BOOLEAN IS NOT DECORATIVE.
   * `model/validation/PriceGroup.json` sets `maxCollection: 0` on SIX properties in
   * the `delete` context - `appliedOrderItems`, `childPriceGroups`, `accounts`,
   * `subscriptionBenefits`, `subscriptionUsageBenefits` and `promotionRewards` -
   * `org/Hibachi/HibachiService.cfc:L55` evaluates them BEFORE removing anything,
   * and `org/Hibachi/HibachiService.cfc:L79` reports a failure as a bare `false`.
   * Five of those six collections belong to out-of-scope aggregates and are absent
   * from the ported `PriceGroup`, so they cannot be enforced from an entity at all;
   * the implementation enforces them by probing what is STORED, inside the delete's
   * own transaction, and resolves `false` when any is populated.
   *
   * NO SEVENTH METHOD, AND NO COUNT ON THE CONTRACT. The header's prohibition - "no
   * count, no existence probe" - is about what this PORT may declare, and it is
   * honoured literally: the probes are internal statements of this one method, its
   * signature is unchanged, and no caller can ask this port how many order items,
   * accounts, subscription benefits or promotion rewards reference a price group.
   * A caller that wants to know whether a delete will succeed calls it and reads
   * the boolean, exactly as the legacy service did.
   */
  deletePriceGroup(priceGroup: PriceGroup): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// RELOCATED, NOT DROPPED: the narrow price-group collaborator the `Sku` entity is
// constructed with used to be PUBLISHED from this file as
// `export interface SkuPriceGroupResolver`, covering the two service-locator sites
// [model/entity/Sku.cfc:L262] (`getPriceByPriceGroup`) and [model/entity/Sku.cfc:L437]
// (`getCurrentAccountPrice`) that transformation rule T2 converts into constructor
// injection.
//
// It is no longer declared here. The port inventory is locked at the THIRTEEN files
// the transformation plan enumerates (AAP 0.4.1), and a collaborator contract exported
// from a port module reads as an addition to that inventory whether or not it occupies
// a file of its own - co-location does not make an exported interface invisible to the
// budget. The contract now lives module-locally, un-exported, inside
// `src/domain/entities/sku.ts`, which is the single module that constructs with it; the
// composition root satisfies it STRUCTURALLY by adapting the ported
// `src/services/priceGroupService.ts` surface, exactly as before, and needs no name to
// import in order to do so.
//
// `CurrentAccountContext` above STAYS EXPORTED and is not affected: the transformation
// plan names it directly in the ported signature
// `calculateSkuPriceBasedOnCurrentAccount(sku: Sku, context: CurrentAccountContext)`
// (AAP 0.4.2), so it is a sanctioned part of this slice's published vocabulary rather
// than an extra collaborator port, and both `src/services/priceGroupService.ts` and
// `src/domain/entities/sku.ts` import it from here.
// ---------------------------------------------------------------------------
