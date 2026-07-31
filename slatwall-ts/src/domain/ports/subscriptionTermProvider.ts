// ---------------------------------------------------------------------------
// CHECKPOINT STATUS - FORWARD REFERENCES CARRY THE MARKER `(planned)`
//
// The subtree is authored in boundaries, and AAP 0.4.5 makes the authoring
// order "a compile-order convenience, not a schedule". Commentary in this file
// therefore names modules of the target layout that DO NOT EXIST YET. Every such
// name carries `(planned)` at its point of use, meaning exactly: a planned Agent
// Action Plan target that is ABSENT from the subtree at this checkpoint. Nothing
// here asserts that any of them exists now, and no behaviour in this file depends
// on one. The complete set named below, with the role each will play:
//
//   src/handlers/bootstrap.ts  composition root (wiring)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// slatwall-ts - subscription term / subscription benefit lookup port
//
// WHAT THIS MODULE IS
//   The narrow port through which the out-of-scope subscription branch of
//   `SkuService.createSkus()` resolves a subscription term and a subscription
//   benefit by identifier.
//
//   It declares INTERFACES ONLY and emits NO runtime JavaScript whatsoever -
//   no class, no `const`, no `enum`, no function body, no default parameter
//   value, no runtime value of any kind. Its entire job is to let the
//   subscription branch COMPILE, and to let the in-scope merchandise branch
//   run unchanged, without dragging the subscription subsystem into scope.
//
//   It is port 6 of exactly 13 in `src/domain/ports/`. That folder is LOCKED
//   AT 13: no fourteenth port, and no barrel or `index.ts`, may be added.
//
// THIS IS ONE OF EXACTLY TWO STUB PORTS
//   `subscriptionTermProvider` and `imageStore` are the only two stub ports in
//   the folder. Both are narrow interfaces with DOCUMENTED STUB BEHAVIOUR
//   rather than PARTIAL IMPLEMENTATIONS - and the distinction is the whole
//   point. The contract below is complete and honestly typed; only its
//   eventual implementation is a stub. Neither port is a half-built provider,
//   and nothing here is left "to be finished later".
//
//   `addressZoneEvaluator` is listed near these two in the plan's collaborator
//   inventory and is NOT a stub: it is a LIVE port backing real promotion
//   address-zone qualification. Do not conflate the three.
//
// HOW THIS PORT DIFFERS FROM `imageStore` - THE T1 CONVERSION
//   `imageStore` replaces a SERVICE-LOCATOR call. There was never a dependency
//   -injected property behind it: [model/service/SkuService.cfc:L212] reaches
//   `getService("imageService").saveImageFile(...)` inline, from within
//   `processImageUpload` [model/service/SkuService.cfc:L210-L218].
//
//   This port replaces a genuine DI/1 PROPERTY, declared by two components:
//     [model/service/SkuService.cfc:L55]      property name="subscriptionService";
//     [model/service/ProductService.cfc:L59]  property name="subscriptionService";
//   DI/1 0.4.2 discovered both by scanning `property name="xService";`
//   declarations at runtime. This file is therefore a textbook T1 conversion:
//   a convention-scanned collaborator becomes an explicit constructor
//   parameter typed to an interface, verified by the compiler rather than
//   resolved by a runtime scan. There is no service locator and no scan in the
//   target, so this port must never be reached through one.
//
// THE LEGACY SURFACE THIS PORT REPRODUCES - THREE CALL SITES, TWO METHODS
//   Inside the subscription branch [model/service/SkuService.cfc:L139-L172] the
//   `subscriptionService` collaborator is reached at exactly three call sites,
//   which resolve to exactly two distinct methods:
//
//     [model/service/SkuService.cfc:L158]  getSubscriptionTerm( <id> )
//     [model/service/SkuService.cfc:L161]  getSubscriptionBenefit( <id> )
//     [model/service/SkuService.cfc:L164]  getSubscriptionBenefit( <id> )  <- same method
//
//   A third site for the term lookup lives outside `createSkus`, in the
//   out-of-scope `processProduct_addSubscriptionTerm`
//   [model/service/ProductService.cfc:L173], which calls
//   `getSubscriptionTerm( processObject.getSubscriptionTermID() )` at
//   [model/service/ProductService.cfc:L175]. It needs no additional method
//   either: it is the same lookup.
//
//   TWO METHODS IS THE WHOLE SURFACE. Both legacy names are carried over
//   VERBATIM in CFML camelCase, singular nouns intact, even though both sit
//   inside loops over comma-lists - interface parity at the service boundary
//   is the acceptance contract for this migration, so a reviewer must be able
//   to diff the two surfaces directly. This is also why the lint configuration
//   deliberately enables no naming-convention rules.
//
// WHY THE PARAMETERS ARE SINGLE IDENTIFIERS, NOT LISTS
//   The subscription branch reads three CFML comma-delimited list values off
//   its incoming `data` struct - `subscriptionBenefits`, `subscriptionTerms`
//   and `renewalSubscriptionBenefits` - and loops each one, calling a lookup
//   ONCE PER ELEMENT. The port therefore receives an ALREADY-SPLIT single
//   identifier. Its parameters are single `string` IDs: not comma-list
//   strings, and not arrays.
//
//   Splitting the list stays with the caller, which parses it using the CFML
//   list helpers in `src/lib/cfml/list.ts` (`listLen`, `listGetAt`,
//   `listAppend`, `listToArray`, `listFindNoCase`). That module is named here
//   for the service-tier reader's benefit only; this file imports nothing.
//
// CALLER-SIDE CONTEXT: THE MISSING-GUARD ASYMMETRY (NOT THIS PORT'S TO FIX)
//   The three list reads are NOT guarded symmetrically, and the asymmetry
//   changes observable behaviour:
//
//     `subscriptionBenefits`         guarded by `structKeyExists`
//                                   [model/service/SkuService.cfc:L142]
//     `subscriptionTerms`            guarded by `structKeyExists`
//                                   [model/service/SkuService.cfc:L147]
//     `renewalSubscriptionBenefits`  NOT GUARDED - read straight through
//                                   `listLen(arguments.data.renewalSubscriptionBenefits)`
//                                   with no key-existence test, so a missing
//                                   key THROWS
//                                   [model/service/SkuService.cfc:L163-L165]
//
//   That asymmetry lives entirely in the SERVICE method's control flow. It is
//   recorded here purely as CONTEXT, so that whoever ports
//   `SkuService.createSkus` cannot miss it: reproducing it is the service
//   tier's obligation, not this port's.
//
//   Consequently this port deliberately offers NO compensation for it - no
//   guard, no optional parameter, no nullable input, no `?? []` fallback and
//   no "safe" variant. Repairing a caller-side behaviour from inside a port
//   would be a behavioural divergence, and `src/domain/ports/**` owns none:
//   every budgeted deliberate divergence in this migration belongs to
//   `src/services/**` or `src/domain/entities/**`. None is spendable here.
//
// THE `contentAccess` BRANCH IS OUT OF SCOPE AND HAS NO PORT
//   `createSkus` has three terminal branches plus a fallthrough, and their
//   disposition is deliberately NOT symmetrical:
//
//     merchandise    IN SCOPE. Must compile and run unchanged. Reaches none of
//                    these collaborators.
//     subscription   OUT OF SCOPE [model/service/SkuService.cfc:L139-L172].
//                    THIS port is its seam.
//     contentAccess  OUT OF SCOPE [model/service/SkuService.cfc:L173-L202].
//                    Reaches `getContentService().getContent( <id> )` at
//                    [model/service/SkuService.cfc:L187] and
//                    [model/service/SkuService.cfc:L196].
//                    IT HAS NO PORT, AND NONE MAY BE INVENTED.
//
//   THIS PORT DOES NOT COVER `contentAccess`. There is no
//   `contentAccessProvider` and no `contentRepository` in the target layout,
//   the ports folder is LOCKED AT 13, and no `getContent` method may be
//   declared here - content access is not a subscription concern, and adding
//   it would silently expand a locked surface.
//
//   The only `ContentService` slice admitted into implicit scope is the
//   CATEGORY ACCESS PATH - the path that `Category.cfc`'s
//   `hb_serviceName="contentService"` resolves to. That is a different concern
//   from content-access SKU creation, and the two must not be conflated.
//
// THE FALLTHROUGH IS BEHAVIOUR TO PRESERVE, NOT A DEFECT
//   When the base product type matches none of the three branches, legacy
//   throws at [model/service/SkuService.cfc:L203-L205] with the message
//   "There was an unexpected error when creating this product". That is
//   intended behaviour and the service tier must preserve it verbatim. It is
//   recorded here so the message is not paraphrased in translation.
//
// WHY THE TWO HANDLE TYPES ARE DECLARED IN THIS FILE, AND WHY THEY ARE OPAQUE
//   A subscription term and a subscription benefit are NOT among the eighteen
//   in-scope entities. There is no `../entities/subscriptionTerm.ts` and there
//   never will be: the entire subscription module is out of scope. At the same
//   time the strictness profile forbids `any`, so the two return types cannot
//   simply be left untyped the way legacy leaves them.
//
//   Both shapes are therefore declared LOCALLY, right here, as exported
//   read-only OPAQUE HANDLES - the anti-corruption pattern this migration uses
//   for every out-of-scope type: a locally declared read-only projection,
//   living in the one port that needs it, rather than a new file or a new
//   entity. No new file is created for either handle; the folder stays at 13.
//
//   "Opaque" is precise here, and it is what the source proves rather than an
//   assumption. In-scope code reads NOTHING off either object. Legacy resolves
//   each one and hands it straight to an out-of-scope association setter:
//     [model/service/SkuService.cfc:L158]  thisSku.setSubscriptionTerm( ... )
//     [model/service/SkuService.cfc:L161]  thisSku.addSubscriptionBenefit( ... )
//     [model/service/SkuService.cfc:L164]  thisSku.addRenewalSubscriptionBenefit( ... )
//   Not one property is dereferenced. Each handle consequently carries its
//   identifier and a compile-time brand, and nothing else. Term lengths,
//   renewal periods, benefit types, prices, dates, flags and statuses are
//   absent BY DESIGN: nothing in the requirements says what a subscription
//   term contains, so inventing members would be inventing requirements.
//
// WHY BOTH METHODS ARE ASYNCHRONOUS
//   A ported method is asynchronous if and only if its legacy body reaches the
//   data store. Both of these do: they are framework entity lookups that
//   resolve persisted rows, so both return a promise.
//
//   This is a STRUCTURAL consequence of where the data lives, and nothing
//   else. A stub implementation still honours the asynchronous signature, so
//   the contract does not change if a real implementation ever replaces the
//   stub - which is the only reason the shape is fixed here rather than left
//   to the implementer.
//
// WHY A MISS RESOLVES `undefined`
//   The legacy calls are bare framework entity lookups whose behaviour on a
//   miss is a framework detail, and the branch they serve is out of scope, so
//   there is no observable in-scope behaviour to preserve. The contract is
//   decided here, once, and documented: a miss resolves `undefined`.
//
//   That mirrors the house convention rather than inventing one. `SkuService`'s
//   `getSkuBySkuCode` resolves `Sku | undefined`, and the three SKU currency
//   accessors return `Money | undefined` - where substituting a default for a
//   missing value would be behaviourally wrong, because a zero price would
//   silently sell a product for free. Explicit absence is the house style, and
//   `strict` plus `noUncheckedIndexedAccess` make it enforceable at the call
//   site instead of discoverable in production.
//
//   Accordingly: never a zero value, never an empty object, and no thrown
//   error baked into the type. There is deliberately no throwing variant, no
//   `getOrThrow`, and no overload - one method per lookup.
//
// WHAT "DOCUMENTED STUB BEHAVIOUR" MEANS HERE
//   The consuming service methods are ported as THIN PASS-THROUGHS: the
//   subscription branch of `SkuService.createSkus`
//   [model/service/SkuService.cfc:L139-L172], and
//   `ProductService.processProduct_addSubscriptionTerm`
//   [model/service/ProductService.cfc:L173].
//
//   NO SUBSCRIPTION BUSINESS LOGIC IS PORTED - no term arithmetic, no renewal
//   scheduling, no benefit entitlement evaluation, no usage accounting and no
//   status transitions. None of that exists anywhere in the target.
//
//   The stub's chosen RUNTIME behaviour is deliberately NOT decided in this
//   file. Choosing it is an implementation decision, and writing any of it
//   here would emit runtime JavaScript from a module that must emit none.
//
// THIS PORT IS NOT THE SUBSCRIPTION-TABLE REACH-THROUGH
//   Schema continuity is preserved throughout this migration: no migration, no
//   rename, no new table, no column change. Subscription-owned tables are read
//   by exactly ONE deliberate, READ-ONLY reach-through in the whole target -
//   `getAccountSubscriptionPriceGroups`, documented on `priceGroupRepository`,
//   which exists because account price-group resolution is otherwise
//   unreproducible.
//
//   THIS PORT IS NOT THAT REACH-THROUGH, and the two must never be confused.
//   This port owns no SQL, no table, and no query.
//
// ONE ADJACENT VALIDATION FACT, RECORDED AND NOT ACTED ON
//   [model/validation/Product.json:L15] declares
//   `"unusedProductSubscriptionTerms": [{"contexts":"addSubscriptionTerm","minCollection":1}]`,
//   which shows a subscription-term SELECTION surface existed in legacy. The
//   `addSubscriptionTerm` context is out of scope: no listing method is
//   declared here and no validation schema is authored here.
//
// WHAT IS DELIBERATELY NOT DECLARED IN THIS FILE
//   Each omission below is a decision, not an oversight.
//   * No third method. Exactly two. No plural, batch or `byIDList` variant, no
//     `getUnusedProductSubscriptionTerms`, no entitlement or renewal method,
//     no overload and no options bag.
//   * No `getContent` and no content-access surface of any kind.
//   * No monetary member and no `Money`. Subscription pricing is out of scope
//     in its entirety, so nothing here is money.
//   * No stub-signalling member - no not-implemented error type, no sentinel
//     value, no `__stub` marker. The TYPE is the real contract; only the
//     IMPLEMENTATION is a stub, and leaking stubness into the type would let a
//     caller branch on it.
//   * No hardcoded literal standing in for configuration - no term length, no
//     renewal interval, no benefit code, no credential, no connection value.
//   * No `enum`. A TypeScript `enum` emits runtime JavaScript, which this
//     module must not do; the handles are branded with read-only
//     literal-typed properties instead.
//
// IMPORTS: NONE
//   This file imports nothing, and needs nothing. Its parameters are `string`
//   identifiers and its return types are declared locally below.
//
//   `src/domain/**` may import only from `src/lib/**` and from within
//   `src/domain/**`; reaching into `src/repositories/**`, `src/handlers/**` or
//   `src/integrations/**`, or importing `mysql2`, `aws-lambda` or `dotenv`, is
//   a BUILD FAILURE, not a review comment. `src/domain/ports/**` is the seam
//   that makes that boundary satisfiable at all: the outward layers implement
//   these interfaces, so the domain never has to reach out to reach them. An
//   empty import list is the strongest possible form of that compliance.
//
//   Two further restrictions hold by design even though they would resolve:
//   no port imports another port, and no port imports a view type. Barrels are
//   forbidden everywhere, so no `index.ts` exists to import either.
//
// WHO IMPLEMENTS THIS PORT
//   `src/repositories/mysql/**` implements exactly six of the thirteen ports -
//   product, sku, option, productType, promotion and priceGroup. This is not
//   one of them, and it has NO adapter file anywhere in the target layout, so
//   its ONLY legal implementation home is the composition root at
//   `src/handlers/bootstrap.ts` (planned). Three obligations attach there:
//     1. The stub's chosen behaviour MUST be documented explicitly at
//        `bootstrap.ts`. A caller must never be able to mistake stub output
//        for a real resolution.
//     2. No subscription business logic may be added at `bootstrap.ts` either.
//        The stub stays a stub; growing it into a real provider is a separate,
//        out-of-scope product decision.
//     3. It must NOT be reached by a service locator. It is a constructor
//        parameter on the services that need it, replacing
//        `property name="subscriptionService";` at
//        [model/service/SkuService.cfc:L55] and
//        [model/service/ProductService.cfc:L59].
//
// THESE NAMES ARE CANONICAL
//   Every subtree that will import this module is currently empty. The type
//   names, method names, parameter names and signatures published below are
//   therefore the canonical definition that those consumers will be written
//   against. They are chosen deliberately and must not be renamed later.
//
// TEST COVERAGE FOR THIS PORT IS NET-NEW, NOT LEGACY PARITY
//   Every declared port method requires a test, and all thirteen ports are
//   net-new coverage. Only three legacy test files touch the in-scope slice at
//   all - `meta/tests/unit/entity/BrandTest.cfc`,
//   `meta/tests/unit/entity/ProductTest.cfc`, and
//   `meta/tests/functional/admin/entity/ProductTest.cfc`, which is an empty
//   stub contributing zero coverage - and NONE of them covers subscriptions.
//   Presenting coverage of this port as legacy parity would be false. The
//   tests themselves belong to `slatwall-ts/tests/**` and are not authored
//   here.
// ---------------------------------------------------------------------------

/**
 * Stub port for the subscription lookups the SKU-creation path performs.
 *
 * Subscription behaviour is outside the migrated slice, so this port exists only so the branch at
 * [model/service/SkuService.cfc:L139-L170] compiles and runs unchanged. Nothing in the domain reads
 * a field of either result.
 */

// JUDGMENT CALL: Subscription results are modelled as opaque handles so no out-of-scope entity shape leaks into the domain.
/**
 * A reference to one subscription term.
 */
export interface SubscriptionTermHandle {
  readonly handleType: 'subscriptionTerm';

  readonly subscriptionTermID: string;
}

/**
 * A reference to one subscription benefit.
 */
export interface SubscriptionBenefitHandle {
  readonly handleType: 'subscriptionBenefit';

  readonly subscriptionBenefitID: string;
}

/**
 * The subscription-term and subscription-benefit lookup port.
 *
 * ONE OF EXACTLY TWO STUB PORTS in `src/domain/ports/` (the other is
 * `imageStore`): a narrow interface with DOCUMENTED STUB BEHAVIOUR, NOT a
 * partial implementation. The contract is whole and honestly typed; only its
 * implementation is a stub, and that implementation belongs to the composition
 * root at `src/handlers/bootstrap.ts` (planned) - this port has no adapter anywhere in
 * the target layout.
 *
 * It replaces the DI/1 property `property name="subscriptionService";`,
 * declared at [model/service/SkuService.cfc:L55] and
 * [model/service/ProductService.cfc:L59], with an explicit constructor
 * parameter on the services that need it. It must never be reached through a
 * service locator.
 *
 * SCOPE - WHAT THIS PORT DOES AND DOES NOT COVER
 * It covers the subscription branch of `createSkus`
 * [model/service/SkuService.cfc:L139-L172] and the term lookup in the
 * out-of-scope `processProduct_addSubscriptionTerm`
 * [model/service/ProductService.cfc:L173].
 *
 * It DOES NOT COVER the `contentAccess` branch
 * [model/service/SkuService.cfc:L173-L202], which reaches
 * `getContentService().getContent( <id> )` at
 * [model/service/SkuService.cfc:L187] and
 * [model/service/SkuService.cfc:L196]. That branch has NO PORT AND NONE MAY BE
 * INVENTED: there is no `contentAccessProvider` and no `contentRepository`,
 * the folder is LOCKED AT 13, and no `getContent` method may be added here.
 * The only `ContentService` slice in implicit scope is the Category access
 * path that `Category.cfc`'s `hb_serviceName="contentService"` resolves to,
 * which is a different concern entirely.
 *
 * It is also NOT the single deliberate read-only subscription-table
 * reach-through in this target; that is `getAccountSubscriptionPriceGroups` on
 * `priceGroupRepository`. This port owns no SQL, no table and no query.
 *
 * Whenever the base product type matches no branch at all, legacy throws
 * "There was an unexpected error when creating this product"
 * [model/service/SkuService.cfc:L203-L205]. That is intended behaviour for the
 * service tier to preserve, recorded here so the message is not paraphrased.
 *
 * THE SURFACE IS CLOSED AT TWO METHODS. Both legacy names are carried over
 * verbatim, singular nouns intact, because interface parity at the service
 * boundary is this migration's acceptance contract.
 */
export interface SubscriptionTermProvider {
  /**
   * Resolve one subscription term by identifier.
   *
   * CFML parity [model/service/SkuService.cfc:L158]: the legacy call is not declared on the
   * subscription service; it resolves by convention at [org/Hibachi/HibachiService.cfc:L305-L328],
   * which loads by identifier and yields nothing when the row is absent rather than raising.
   *
   * @param subscriptionTermID the identifier to load.
   * @returns the term, or undefined when no row matches.
   */
  getSubscriptionTerm(subscriptionTermID: string): Promise<SubscriptionTermHandle | undefined>;

  // LEGACY-DEFECT [model/service/SkuService.cfc:L163]: `renewalSubscriptionBenefits` is read without the presence check its two sibling lists receive, so the renewal loop depends on the caller always supplying that key.
  // Preserved deliberately; do not fix without a product decision.
  /**
   * Resolve one subscription benefit by identifier.
   *
   * Called for the benefits of the new SKU [model/service/SkuService.cfc:L161] and again for its
   * renewal benefits [model/service/SkuService.cfc:L164], with the same absent-row semantics as
   * {@link SubscriptionTermProvider.getSubscriptionTerm}.
   *
   * @param subscriptionBenefitID the identifier to load.
   * @returns the benefit, or undefined when no row matches.
   */
  getSubscriptionBenefit(
    subscriptionBenefitID: string,
  ): Promise<SubscriptionBenefitHandle | undefined>;
}
