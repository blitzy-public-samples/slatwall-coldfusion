/**
 * Sku — the `SwSku` catalog entity of Slatwall 3.1.39, re-expressed as strict-mode TypeScript.
 *
 * ---------------------------------------------------------------------------------------------
 * AAP AUTHORITY
 * ---------------------------------------------------------------------------------------------
 * §0.4.1.4 "Domain Layer", verbatim row. It is the authoritative scope boundary for this module:
 *
 *   | slatwall-ts/src/domain/sku/Sku.ts | CREATE | model/entity/Sku.cfc |
 *   | Persistent properties; the option-structure members `getOptionsDisplay`,
 *   | `getOptionByOptionGroupID`, `getOptionByOptionGroupCode`,
 *   | `getOptionsByOptionGroupCodeStruct`, `getOptionsByOptionGroupIDStruct`, `getOptionsIDList`,
 *   | `getSkuDefinition`; the two method-based validation rules `hasUniqueOptions` [L756-L769] and
 *   | `hasOneOptionPerOptionGroup` [L772-L784]; image members behind `ImagePathPort`; defects
 *   | D1, D2, D3, D16 carried as flagged annotations. |
 *
 * This is a 1:1 transformation of ONE legacy file — [model/entity/Sku.cfc], 916 lines, whose
 * component declaration at [:L49] reads `entityname="SlatwallSku" table="SwSku" persistent=true
 * accessors=true output=false extends="HibachiEntity" cacheuse="transactional"
 * hb_serviceName="skuService" hb_permission="this"`. The other eleven files listed as sources are
 * read for contract fidelity only, and NONE of the twelve is modified: AAP §0.4.1.1 establishes
 * that every target file is CREATE and every legacy file is REFERENCE, with zero UPDATE rows
 * anywhere in the plan (TR-6).
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS FILE CARRIES MORE RISK PER LINE THAN ANY OTHER IN THE SUBTREE
 * ---------------------------------------------------------------------------------------------
 * [model/entity/Sku.cfc] is the largest in-scope entity. It owns FIVE registered defects — D1, D2,
 * D3, D16 and D19 — BOTH method-based validation rules of the whole slice, and the AAP §0.6.2
 * validation read-back loop, which §0.6.2 calls "the single most dangerous thing in the slice"
 * because a faithful-LOOKING port can produce different results with no error and no compile
 * failure.
 *
 * Three mistakes are near-inevitable unless consciously avoided, and each is refused explicitly at
 * the member that would suffer it:
 *
 *   1. MAKING `hasUniqueOptions()` A SYNCHRONOUS PURE PREDICATE. It executes a DATABASE QUERY. The
 *      chain is [:L762] -> `Product.getSkusBySelectedOptions` [model/entity/Product.cfc:L366-L368]
 *      -> `ProductService.getProductSkusBySelectedOptions`
 *      [model/service/ProductService.cfc:L104-L106], which is a pure delegation to
 *      `SkuDAO.getSkusBySelectedOptions` and its hand-assembled query. See
 *      {@link Sku.hasUniqueOptions}, which is `async` and takes an injected lookup.
 *   2. "FIXING" D1, D2 OR D3. A competent engineer repairs all three on sight. Refactor Discipline
 *      Guideline 4 forbids it, and AAP §0.7.3 S7 is preserve-and-annotate. See the defect register
 *      below and the three members themselves.
 *   3. NARROWING `getBaseProductType()` TO THE THREE-MEMBER UNION. That would let TypeScript
 *      statically prove the fallthrough arm of `SkuService.createSkus` unreachable and ELIMINATE a
 *      legacy throw. See {@link Sku.getBaseProductType}.
 *
 * ---------------------------------------------------------------------------------------------
 * RULES VERDICT, RECORDED RATHER THAN ASSUMED (UR4)
 * ---------------------------------------------------------------------------------------------
 * No user-specified rules were provided for this project; the nine enterprise
 * standards of AAP §0.7.3 govern instead, and the bar is not lowered.
 *
 * Established rather than inferred: `review_rules` was called twice — once unpaged and once with an
 * explicit full range — and both calls returned the byte-identical single line "No user rules
 * provided." That one line IS the complete rules document; there is no paginated remainder. A
 * filesystem sweep independently finds no `.blitzyignore`, `.cursorrules`, `AGENTS.md` or
 * `CLAUDE.md` anywhere in the repository. AAP §0.7.1 and §0.2.3 agree by construction: ZERO files
 * enter scope by rule.
 *
 * The standards with teeth in this module:
 *   S1 — strict type safety. No escape-hatch type, no non-null assertion, no suppression comment,
 *        no unsafe cast used to silence an error. `noUncheckedIndexedAccess` is the one that bites
 *        hardest here: every array index and every record read yields `T | undefined` and is
 *        narrowed explicitly.
 *   S2 — parameterized SQL everywhere. For this file that is a purely NEGATIVE obligation: no query,
 *        no driver, no pool, no connection. The physical names `SwSku`, `SwSkuOption`, `skuID` and
 *        `optionID` appear ONLY as prose provenance, never in an executable position.
 *   S3 — explicit injection. This entity never resolves a dependency for itself. Every out-of-scope
 *        collaborator arrives as an explicit method parameter. There is no service locator, no
 *        `getService()` analogue and no module-level singleton.
 *   S4 — hexagonal separation. Nothing here imports from `adapters/`, `services/`, `config/`,
 *        `validation/`, `handlers/` or `integrations/`, and no AWS type is referenced; all AWS
 *        coupling is confined to `src/handlers/**`.
 *   S5 — nothing whatsoever is imported from `node_modules`.
 *   S6 — `new Sku()` is constructible with no argument, no container and no input/output, which is
 *        what lets `test/domain/Sku.test.ts` exist at all: the legacy suite has neither a mocking
 *        library nor an alternative to booting the whole framework application (AAP §0.4.3.6).
 *   S7 — preserve and annotate, do not repair. Five registered defects plus four further observed
 *        items are carried; not one is fixed.
 *   S8 — flag mismatches rather than assume them away. Four are recorded in the register below.
 *   S9 — invent nothing. No SLA, no latency figure, no invented default, no phantom property.
 *
 * ---------------------------------------------------------------------------------------------
 * THE CALCULATED-PROPERTY BOUNDARY — 13 EXCLUDED, 10 CARRIED (AAP §0.2.2.6 / IR-3)
 * ---------------------------------------------------------------------------------------------
 * [model/entity/Sku.cfc:L99-L121] declares EXACTLY 23 non-persistent properties. AAP §0.2.2.6 calls
 * this "the exclusion most likely to be violated by accident": without a stated boundary, following
 * these getters drags half the platform into the port. The split below is the boundary, and
 * 13 + 10 = 23 exactly.
 *
 * EXCLUDED — 13, whose getters are NOT followed. Each reaches `priceGroupService`,
 * `currencyService`, `stockService`, `inventoryService`, `promotionService`, `locationService`,
 * `fulfillmentService` or `attributeService`, every one of which AAP §0.2.2.1 excludes outright:
 *
 *   [:L99]  adminIcon                             getter [:L323]  omitted
 *   [:L100] assignedOrderItemAttributeSetSmartList getter [:L327]  omitted, also a forbidden
 *                                                                  `*SmartList` member
 *   [:L102] currentAccountPrice                   getter [:L435]  omitted
 *   [:L104] currencyDetails                       getter [:L367]  omitted
 *   [:L106] eligibleFulfillmentMethods            getter [:L449]  omitted
 *   [:L108] livePrice                             getter [:L482]  omitted
 *   [:L109] nextEstimatedAvailableDate            getter [:L459]  omitted; its two further defects
 *                                                                  are still documented below,
 *                                                                  because this is where they live
 *   [:L113] qats                                  getter [:L535]  omitted
 *   [:L114] salePriceDetails                      getter [:L539]  RETAINED behind a pricing port
 *   [:L115] salePrice                             getter [:L546]  RETAINED behind a pricing port
 *   [:L116] salePriceDiscountType                 getter [:L553]  RETAINED behind a pricing port
 *   [:L117] salePriceDiscountAmount               NO GETTER EXISTS  omitted
 *   [:L118] salePriceExpirationDateTime           getter [:L560]  RETAINED behind a pricing port
 *
 * The four marked RETAINED are the canonical TR-5 case and the reason a pricing port is declared at
 * all: TR-5 requires that "the member is never quietly dropped from the interface", and the Google
 * product feed's conditional `g:sale_price` / `g:sale_price_effective_date` fields read two of them
 * (AAP §0.6.4.2). They are therefore declared as port-parameterised methods and the gap is flagged,
 * rather than deleted. The other nine are genuinely unreachable from any retained member and from
 * any declared consumer, so they are omitted with their locators — which is the other arm AAP
 * §0.2.2.6 permits.
 *
 * ⚠️ S9 TRAP, CHECKED AND REFUSED. AAP §0.2.2.6 names sixteen exclusions across `Product` and
 * `Sku`, and only THIRTEEN of them appear in this entity's own non-persistent block. A full read of
 * [:L99-L121] confirms `salePriceDetailsForSkus`, `estimatedReceivalDetails` and
 * `allowBackorderFlag` are declared on [model/entity/Product.cfc], NOT here. None of the three is
 * invented in this file.
 *
 * CARRIED — 10, every one of which is implemented below:
 *
 *   [:L101] baseProductType                getter [:L356]        {@link Sku.getBaseProductType}
 *   [:L103] currencyCode                   getter [:L360]        {@link Sku.getCurrencyCode}
 *   [:L105] defaultFlag                    getter [:L442]        {@link Sku.getDefaultFlag}
 *   [:L107] imageExistsFlag                getter [:L221]        {@link Sku.getImageExistsFlag}
 *   [:L110] optionsByOptionGroupCodeStruct getter [:L500]  D1     {@link Sku.getOptionsByOptionGroupCodeStruct}
 *   [:L111] optionsByOptionGroupIDStruct   getter [:L512]  D2     {@link Sku.getOptionsByOptionGroupIDStruct}
 *   [:L112] optionsIDList                  getter [:L524]        {@link Sku.getOptionsIDList}
 *   [:L119] skuDefinition                  getter [:L574]        {@link Sku.getSkuDefinition}
 *   [:L120] stocksDeletableFlag            getter [:L567]  D4     {@link Sku.getStocksDeletableFlag}
 *   [:L121] transactionExistsFlag          getter [:L592]        {@link Sku.getTransactionExistsFlag}
 *
 * `defaultFlag` and `transactionExistsFlag` are non-negotiable: both are DELETE-context validation
 * guards in [model/validation/Sku.json:3] and [:12] respectively, so removing either would silently
 * permit deletes the legacy system blocks.
 *
 * COSMETIC LEGACY DETAIL, recorded once as Guideline 6 requires and then never mentioned again:
 * [:L120] and [:L121] alone write `persistent="false"` BEFORE `type=`, where every other typed entry
 * in the block writes `type=` first. It has no effect; it is transcription noise in the original.
 *
 * ---------------------------------------------------------------------------------------------
 * DEFECT AND CARRY-OVER REGISTER (AAP §0.6.7 — "preserve and annotate, do not repair")
 * ---------------------------------------------------------------------------------------------
 * AAP §0.6.7 is blunt about the temptation: "a competent engineer would instinctively fix them …
 * Guideline 4 forbids fixing them. The plan therefore names each one, which converts an invisible
 * temptation into a documented decision." Every entry below is reproduced as observable behaviour
 * and annotated at its member with a `TODO(parity)` marker and its locator. The single declared
 * exception to preserve-and-annotate in the whole plan is D18, which lives in
 * `src/adapters/mysql/MySqlProductRepository.ts` and has nothing to do with this file.
 *
 *   D1  [:L500-L510]  `getOptionsByOptionGroupCodeStruct` initialises the WRONG variable and then
 *                     reads one that is never created ⇒ FAILS on first call.
 *   D2  [:L512-L522]  `getOptionsByOptionGroupIDStruct` writes into a THIRD, differently-named
 *                     struct ⇒ ALWAYS RETURNS EMPTY.
 *   D3  [:L247-L251]  `getOptionByOptionGroupCode` tests the Code struct and indexes the ID struct
 *                     with a Code key ⇒ ALWAYS MISSES.
 *   D4  [:L567-L572]  `getStocksDeletableFlag` delegates through
 *                     `SkuService.getSkuStocksDeletableFlag` [model/service/SkuService.cfc:L281-L283]
 *                     to a DAO member that exists NOWHERE in the repository ⇒ cannot resolve.
 *   D16 [:L894], [:L899], [:L908]  three in-source deprecation hints, carried with their text.
 *   D19 AAP §0.6.2    an option-less SKU FAILS `hasUniqueOptions` on any product that already has
 *                     option-bearing SKUs.
 *
 * FOUR FURTHER OBSERVED ITEMS, documented but deliberately NOT given new defect identifiers (S9 —
 * the register is AAP §0.6.7's, and inventing an identifier would imply an authority this file does
 * not have):
 *
 *   a. [:L885]  `displayOptions` carries a fourth deprecation hint that AAP §0.6.7.2's D16 entry
 *               does not name. Carried with its hint, recorded as an observed extra.
 *   b. [:L460]  DEAD MEMOIZATION — `getNextEstimatedAvailableDate`'s guard tests for a variable the
 *               method never assigns, so its cache can never populate and the guard is always true.
 *   c. [:L474]  DISCARDED COMPUTATION — a bare subtraction expression with no assignment, so the
 *               intended decrement never happens and the loop accumulator never moves.
 *   d. [:L588]  DISCARDED COMPUTATION — a bare `trim()` call with no assignment in
 *               `getSkuDefinition`. CFML `trim` is not in-place, so the trim NEVER TAKES EFFECT and
 *               the leading space survives into the returned value. NOT applied here.
 *
 * Items b and c belong to an EXCLUDED member. They are still recorded, because this file is where
 * they live and a reader diffing the entity would otherwise find them unaccounted for.
 *
 * ---------------------------------------------------------------------------------------------
 * S8 MISMATCH REGISTER — four gaps flagged rather than assumed away
 * ---------------------------------------------------------------------------------------------
 *   M-i   NO `Product.hasSku` EXISTS. [:L606] calls `arguments.product.hasSku( this )`, which is
 *         synthesized by the ORM from `singularname="sku"` — a repository-wide search finds no such
 *         body in [model/entity/Product.cfc], and `src/domain/product/Product.ts` declares none
 *         either. {@link Sku.setProduct} therefore evaluates the identical containment predicate
 *         INLINE against the live collection. That is not a reimplementation of a `Product` member;
 *         it is the same predicate computed locally, and it keeps the fix inside this file rather
 *         than widening another agent's module.
 *   M-ii  `Sku` IS DELIBERATELY NOT ASSIGNABLE TO `ProductDefaultSkuDelegate`. That interface —
 *         declared in `src/domain/product/Product.ts` for the nine default-SKU delegating guards at
 *         [model/entity/Product.cfc:L556] and following — requires nine ZERO-ARGUMENT SYNCHRONOUS
 *         members including `getImageDirectory(): string`. Three facts make direct assignability
 *         impossible: `Sku.cfc` declares no `getImageDirectory` counterpart at all and S9 forbids
 *         inventing one; the real `ImagePathPort` is entirely asynchronous, so the image members
 *         here must return promises; and S3 requires their collaborators to arrive as parameters
 *         rather than be resolved internally. A thin binding adapter in the composition root
 *         (`src/config/container.ts`) closes over the ports and satisfies the delegate. The gap
 *         PRE-EXISTS this file — `Product.ts` declared the shape before `Sku.ts` existed — and is
 *         recorded here rather than papered over.
 *   M-iii NO PORT OWNS THE IMAGE-MARKUP RENDERER. [:L189] delegates to an out-of-scope image
 *         service's `getResizedImage`, which returns rendered markup rather than a path. The real
 *         `ImagePathPort` declares `getImagePath`, `getResizedImagePath`, `getImageExistsFlag` and
 *         `saveImageFile` and nothing else, so that one capability has no home. It is declared here
 *         as a separate narrow renderer interface and flagged; `ImagePathPort` is its rightful
 *         owner.
 *   M-iv  THE FAR SIDE OF `subscriptionTerm` HAS NO IN-SCOPE SURFACE. [:L625] appends to
 *         `subscriptionTerm.getSkus()` and [:L632-L635] splices it, but `SubscriptionTerm` is out of
 *         scope (AAP §0.2.2.1) and the real `SubscriptionTermPort` exposes a reference carrying
 *         nothing but an identifier. {@link Sku.setSubscriptionTerm} therefore maintains the local
 *         side only, and the omission is flagged rather than invented.
 *
 * ---------------------------------------------------------------------------------------------
 * MEMOIZATION IS PER-INSTANCE, NEVER MODULE-SCOPE (M7 / S8)
 * ---------------------------------------------------------------------------------------------
 * The legacy entity caches every derived value in its own `variables` scope and declares
 * `cacheuse="transactional"` at [:L49] — one of 111 of 113 entities that do. Under Lambda nothing
 * survives between invocations EXCEPT module-scope state, so a module-scope cache would leak one
 * tenant's catalog into another's response on a warm container. Every cache in this file is
 * consequently a `#`-private instance field, and the frozen module constants below hold no
 * per-entity data.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS FILE DELIBERATELY DOES NOT DECLARE
 * ---------------------------------------------------------------------------------------------
 * `validate`, `hasErrors`, `getErrors`, `addError`, `setting`, `getAttributeValue`,
 * `getAttributeValuesForEntity`, `getSimpleRepresentation`, `getPrimaryIDPropertyName`,
 * `getPrimaryIDValue`, `getPropertyMetaData`, `onMissingMethod`, `populate`, `getService`, and every
 * `*SmartList` getter. They belong to other layers: validation to `src/validation/**`, population to
 * `../base/populate`, dynamic dispatch to nothing at all, since IR-1 replaces it with declarations.
 *
 * ONE SANCTIONED EXCEPTION: {@link Sku.getSimpleRepresentationPropertyName}, [:L809], which returns
 * the string `'skuCode'`.
 *
 * `populate()` itself is replaced by {@link SKU_PROPERTY_DESCRIPTORS}, consumed by `../base/populate`.
 *
 * Two legacy overrides are called out because their ABSENCE is the point. [:L843] overrode
 * `getPropertyMetaData` and [:L858] overrode `onMissingMethod`, both to resolve options dynamically
 * by sniffing for a 32-character `optionGroupID`. IR-1 replaces that metaprogramming with the
 * explicit typed accessors below. A detail worth one line: [:L846] writes the sniff length as the
 * STRING literal `"32"` where [model/entity/HibachiEntity.cfc:L153] writes the NUMBER `32`. CFML
 * coerces between them silently; TypeScript would not, which is precisely why neither override is
 * ported.
 *
 * Three comment-delimited sections in the legacy file are GENUINELY EMPTY and no content is invented
 * for any of them: `Deprecated Properties` at [:L123], `Custom Formatting Methods` and
 * `ORM Event Hooks`.
 *
 * @see model/entity/Sku.cfc — the sole origin, 916 lines
 * @see model/validation/Sku.json — the 8-key, 9-rule contract this entity's two method rules serve
 * @see model/service/SkuService.cfc:L58-L211 — the construction contract this entity must satisfy
 */

import type { AuditPropertyName, AuditableEntity } from '../base/AuditableEntity';
import { AUDIT_PROPERTY_NAMES } from '../base/AuditableEntity';
import type {
  ColumnPropertyDescriptor,
  ManyToManyPropertyDescriptor,
  ManyToOnePropertyDescriptor,
  PopulatePropertyDescriptor,
  PropertyDescriptorSet,
  RelatedEntityLoader,
  SubPropertyPopulator,
} from '../base/populate';
import type { BaseProductType } from '../BaseProductType';
import { isBaseProductType } from '../BaseProductType';
import type { Option } from '../option/Option';
import type { OptionGroup } from '../option/OptionGroup';
import type { Product } from '../product/Product';
import { DomainError, NotImplementedError } from '../../errors/DomainError';

/* ================================================================================================
 * THE BOUNDARY CONTRACTS (R-C)
 *
 * Every interface in this block names ONLY the members this entity actually calls, and each is
 * declared LOCALLY rather than imported. The reason is a scope rule, not a convenience: the
 * dependency whitelist for this file is the seven modules imported above, and `src/ports/**` is not
 * among them. Declaring the shapes here keeps every import legal while leaving `src/ports/**` to the
 * agent that owns it (AAP §0.3.1), and AAP §0.4.5 explains why a transient absence would not be an
 * error anyway: ports and their consumers land in the same phase.
 *
 * ⭐ EACH SHAPE IS DELIBERATELY A NARROWED SUBSET OF ITS REAL PORT, so that a real port instance
 * satisfies it by structural typing with no adapter, no cast and no widening at the composition
 * root. The correspondences, verified against the port files as they exist:
 *
 *   {@link SkuSettingResolver}            <- SettingResolverPort.setting
 *   {@link SkuImagePathResolver}          <- ImagePathPort.getImagePath / getResizedImagePath /
 *                                            getImageExistsFlag  (saveImageFile omitted: unused here)
 *   {@link SkuResizedImageRenderer}       <- NO PORT OWNS THIS. S8 mismatch M-iii.
 *   {@link SkuSalePricingLookup}          <- PricingPort.getSalePriceDetailsForProductSkus
 *   {@link SubscriptionTermRef}           <- SubscriptionTermPort's term reference, widened by one
 *                                            optional member. See the note on that interface.
 *   {@link SkuTransactionExistenceChecker} <- the zero-argument service contract, AAP §0.4.2.2
 *                                            Discrepancy 4
 *   {@link SkuProductTypeRootResolver}    <- the root-product-type resolver
 *                                            `src/domain/product/ProductType.ts` declares
 *
 * Nothing in this block performs work. Each is a shape the composition root fills.
 * ============================================================================================== */

/**
 * A base product type as this entity is permitted to observe it: the closed union WIDENED so that no
 * arm can ever be statically eliminated.
 *
 * ⚠️⚠️ THE WIDENING IS THE WHOLE POINT AND MUST NOT BE REMOVED. `getBaseProductType()` at
 * [model/entity/ProductType.cfc:L110-L115] is declared `public any function`, not a three-member
 * enumeration, and its body was read verbatim:
 *
 *     public any function getBaseProductType() {
 *         if(isNull(getSystemCode()) || getSystemCode() == ""){
 *             return getService("ProductService").getProductType(listFirst(getProductTypeIDPath())).getSystemCode();
 *         }
 *         return getSystemCode();
 *     }
 *
 * Both arms return whatever `systemCode` a row happens to hold. Narrowing that to
 * `'merchandise' | 'subscription' | 'contentAccess'` would let the compiler PROVE the fallthrough
 * arm of `SkuService.createSkus` unreachable and delete the throw at
 * [model/service/SkuService.cfc:L204] — destroying observable behaviour with a change that looks
 * like a type improvement. AAP §0.6.7 and Guideline 4 both forbid that.
 *
 * The `string & {}` arm keeps the three literals available to editor completion while admitting any
 * other string, which is the same idiom `src/domain/product/ProductType.ts` uses for its own
 * equivalent alias — declared there, verbatim, as `BaseProductType | (string & {})`, and left
 * un-suppressed because the empty-object-type rule does not fire inside an intersection. Comparison
 * sites use {@link isBaseProductType} as a RUNTIME guard, so no cast is ever needed to narrow one of
 * these values, and this file contains no lint suppression of any kind.
 */
export type SkuBaseProductTypeCode = BaseProductType | (string & {});

/**
 * The one member of a product type this entity reads while resolving a base product type.
 *
 * The fallback arm at [model/entity/ProductType.cfc:L112] reads `getSystemCode()` off a product type
 * fetched by identifier. `systemCode` is optional because [model/entity/ProductType.cfc:L59] declares
 * it without a default and the very branch that performs the fetch exists precisely BECAUSE the value
 * can be null or empty.
 */
export interface SkuProductTypeSystemCodeSource {
  readonly systemCode?: string;
}

/**
 * Resolves the ROOT product type of a hierarchy by identifier.
 *
 * The typed replacement for the string-keyed locator call at
 * [model/entity/ProductType.cfc:L112] — `getService("ProductService").getProductType(...)` — per TR-3
 * and S3. It is asynchronous because that call reaches the database, which is the reason
 * {@link Sku.getBaseProductType} and {@link Sku.getSkuDefinition} are asynchronous too.
 *
 * Structurally identical to the resolver `src/domain/product/ProductType.ts` declares, so the same
 * instance serves both.
 */
export interface SkuProductTypeRootResolver {
  getProductType(productTypeID: string): Promise<SkuProductTypeSystemCodeSource | undefined>;
}

/**
 * The subscription term as this entity is permitted to see it — [model/entity/Sku.cfc:L66],
 * `cfc="SubscriptionTerm" fieldtype="many-to-one" fkcolumn="subscriptionTermID"`.
 *
 * `SubscriptionTerm` is explicitly out of scope (AAP §0.2.2.1, `model/**\/Subscription*.cfc`, 11
 * files), so the relationship is retained through this narrow reference rather than by porting the
 * entity. TODO(boundary) [model/entity/Sku.cfc:L66] — the full entity belongs behind
 * `SubscriptionTermPort`, and the far side of the association is S8 mismatch M-iv.
 *
 * TWO DELIBERATE DECISIONS ABOUT THE SHAPE:
 *
 *   `subscriptionTermID` IS REQUIRED, not optional, for two independent reasons. It matches the real
 *   port's term reference, which declares that one member and nothing else, so a real reference is
 *   assignable here. And an all-optional target would trip TypeScript's weak-type detection, which
 *   rejects an object literal sharing no property with the target — turning every composition-root
 *   assignment into a compile error for no benefit.
 *
 *   `subscriptionTermName` IS PRESENT BUT OPTIONAL, because [model/entity/Sku.cfc:L585] reads it
 *   while composing a SKU definition, and the real port does not carry it. That is the one member by
 *   which this shape exceeds the port, and it is the reason the subscription arm of
 *   {@link Sku.getSkuDefinition} is flagged rather than silently degraded.
 */
export interface SubscriptionTermRef {
  readonly subscriptionTermID: string;
  readonly subscriptionTermName?: string;
}

/**
 * Every setting key the PORTED code of this entity reads, and no other.
 *
 * Derived by reading the calls, not by copying a port union. The seven keys and where each is read:
 *
 *   `productImageOptionCodeDelimiter`  [model/entity/Sku.cfc:L135]  via the PRODUCT delegate
 *   `productImageDefaultExtension`     [model/entity/Sku.cfc:L138]  via the PRODUCT delegate
 *   `productImage<size>Width`          [model/entity/Sku.cfc:L179], [:L212]  via the PRODUCT delegate
 *   `productImage<size>Height`         [model/entity/Sku.cfc:L180], [:L213]  via the PRODUCT delegate
 *   `imageAltString`                   [model/entity/Sku.cfc:L157]  via THIS entity
 *   `imageMissingImagePath`            [model/entity/Sku.cfc:L163]  via THIS entity
 *   `skuCurrency`                      [model/entity/Sku.cfc:L362]  via THIS entity
 *
 * WHY `globalDateFormat` IS ABSENT even though AAP §0.4.1.6 lists it among the keys the slice reads:
 * its only three call sites in this entity — [:L462], [:L470] and [:L472] — are inside
 * `getNextEstimatedAvailableDate`, one of the THIRTEEN EXCLUDED members. Declaring a key no ported
 * line reads would widen this contract for nothing, and S9 forbids inventing surface. The key is
 * genuinely in the slice; it is read by other modules, and `src/util/formatting.ts` owns the
 * formatting that consumes it.
 *
 * The two interpolated forms are template-literal types rather than plain strings, which makes the
 * legacy `"productImage#thisSize#Width"` composition at [:L179] a COMPILE-CHECKED construction
 * instead of a string concatenation that could drift. They match the real port's equivalents exactly.
 */
export type SkuSettingName =
  | 'productImageOptionCodeDelimiter'
  | 'productImageDefaultExtension'
  | 'imageAltString'
  | 'imageMissingImagePath'
  | 'skuCurrency'
  | `productImage${string}Width`
  | `productImage${string}Height`;

/**
 * Which entity a setting is resolved AGAINST, and its identifier.
 *
 * `setting()` at [model/entity/HibachiEntity.cfc:L129] is declared
 * `public any function setting(required string settingName, array filterEntities=[], formatValue=false)`
 * and passes `object=this` to the setting service, so resolution is entity-context aware: the
 * effective value of a key can differ per entity instance.
 *
 * ⭐ THAT DISTINCTION IS LOAD-BEARING IN THIS FILE, not incidental. Some keys are read through the
 * PRODUCT — `getProduct().setting(...)` at [:L135], [:L138], [:L179], [:L180], [:L212], [:L213] —
 * and others through THIS SKU — `setting(...)` at [:L157], [:L163], [:L362]. Carrying the receiver
 * rather than dropping it is what keeps the two resolutions distinguishable, and the shape matches
 * the real port's context so the same resolver serves every entity of the slice.
 *
 * TODO(boundary) [model/entity/HibachiEntity.cfc:L129] — the `filterEntities` and `formatValue`
 * arms of the legacy signature are deliberately NOT carried. No call site in this entity supplies
 * either; every one passes a settingName alone. Reproducing unused parameters would be inventing
 * surface (S9).
 */
export interface SkuSettingResolutionContext {
  readonly entityName: 'Product' | 'Sku' | 'Option';
  readonly entityId: string;
}

/**
 * Resolves an effective setting value.
 *
 * SYNCHRONOUS, matching the real port. The legacy accessor is synchronous too, and making it
 * asynchronous here would force {@link Sku.generateImageFileName} — a pure string composition — to
 * return a promise for no reason.
 *
 * S3: this arrives as an explicit parameter on each member that needs it. This entity never holds a
 * resolver, never resolves one and declares no `setting()` member of its own.
 */
export interface SkuSettingResolver {
  setting(settingName: SkuSettingName, context?: SkuSettingResolutionContext): string;
}

/**
 * The request shape a resized-image path is computed from — the typed replacement for the argument
 * struct the legacy passed by `argumentcollection` at [model/entity/Sku.cfc:L218].
 *
 * Field-for-field identical to the real port's request, so one can be handed straight through.
 * `imagePath` and `missingImagePath` are required because [:L217] and [:L216] always set both before
 * delegating; the rest are optional because the legacy only sets each on the branch that computed it.
 */
export interface SkuResizedImagePathRequest {
  readonly imagePath: string;
  readonly missingImagePath: string;
  readonly size?: string;
  readonly width?: number;
  readonly height?: number;
  readonly resizeMethod?: string;
}

/**
 * Path-level image operations.
 *
 * ⚠️ ASYNCHRONOUS THROUGHOUT, mirroring the real port, and that is why every image member of this
 * entity returns a promise where the legacy returned a value directly. Two of the three genuinely
 * perform I/O: the existence flag at [model/entity/Sku.cfc:L221] is a filesystem probe
 * (`fileExists(expandPath(...))`), and path resolution reads a base URL out of framework request
 * scope at [:L147].
 *
 * The real port's fourth member, the image-file save, is deliberately omitted: no ported line of this
 * entity calls it. `processImageUpload` at [model/service/SkuService.cfc:L210] does, and it belongs to
 * `src/services/SkuService.ts`, not here.
 */
export interface SkuImagePathResolver {
  getImagePath(imageFile: string): Promise<string>;
  getResizedImagePath(request: SkuResizedImagePathRequest): Promise<string>;
  getImageExistsFlag(imagePath: string): Promise<boolean>;
}

/**
 * The request shape rendered image markup is produced from — [model/entity/Sku.cfc:L189].
 *
 * Identical to {@link SkuResizedImagePathRequest} plus the alternate text the legacy derives at
 * [:L157-L159].
 */
export interface SkuResizedImageRequest extends SkuResizedImagePathRequest {
  readonly alt?: string;
}

/**
 * Renders image MARKUP rather than resolving a path — [model/entity/Sku.cfc:L189].
 *
 * ⚠️ S8 MISMATCH M-iii, FLAGGED RATHER THAN ASSUMED AWAY. This is the one image capability of the
 * entity that no declared port owns: the real `ImagePathPort` exposes path resolution, resized-path
 * resolution, an existence probe and a file save, and nothing that returns markup. The legacy
 * delegates to an out-of-scope image service resolved through a dynamic string lookup —
 * `getService("imageService")` — which AAP §0.6.3.2 singles out as the "hidden genuine" dependency
 * that "any dependency analysis based on component metadata misses entirely", because it is never
 * declared as a component property.
 *
 * TODO(boundary) [model/entity/Sku.cfc:L189] — `ImagePathPort` is the rightful owner of this member.
 * It is declared separately here so the capability is visible and typed instead of dropped (TR-5),
 * and so the composition root can supply it from whichever adapter ultimately renders markup.
 */
export interface SkuResizedImageRenderer {
  getResizedImage(request: SkuResizedImageRequest): Promise<string>;
}

/**
 * Expands a template containing bracketed property identifiers against a subject.
 *
 * The narrow replacement for the legacy `stringReplace(setting('imageAltString'))` call at
 * [model/entity/Sku.cfc:L158], whose inherited implementation substitutes property identifiers
 * appearing in a template. `src/util/formatting.ts` owns the real algorithm; it is not imported
 * because it is not on this file's dependency whitelist, so the capability arrives as a function
 * parameter instead (S3). A caller wires it to that utility bound to this SKU.
 */
export type SkuStringTemplateExpander = (template: string) => string;

/**
 * The collaborators the two markup-producing image members need, gathered into one object.
 *
 * WHY AN OBJECT RATHER THAN FOUR POSITIONAL PARAMETERS. [model/entity/Sku.cfc:L153-L190] reads two
 * settings, resolves a path, expands a template and then renders — four distinct collaborators for
 * one member. Four positional parameters ahead of the caller's own options would be easy to
 * transpose silently, and every one of them is supplied by the same composition root at the same
 * moment. Grouping them keeps each call site readable and each collaborator individually typed.
 */
export interface SkuResizedImageCollaborators {
  readonly renderer: SkuResizedImageRenderer;
  readonly imagePaths: SkuImagePathResolver;
  readonly settings: SkuSettingResolver;
  readonly expandStringTemplate: SkuStringTemplateExpander;
}

/**
 * The caller-supplied half of a resized-image request — the arguments the legacy accepted through
 * `argumentcollection` at [model/entity/Sku.cfc:L153] and [:L192].
 *
 * Every member is optional because the legacy branches on the PRESENCE of each: `structKeyExists`
 * decides whether the deprecated size mapping runs at all, and the missing-image path and alternate
 * text are defaulted from settings only when absent.
 */
export interface SkuResizedImageOptions {
  readonly size?: string;
  readonly width?: number;
  readonly height?: number;
  readonly missingImagePath?: string;
  readonly alt?: string;
}

/**
 * One SKU's sale-price detail, exactly as the real pricing port shapes it.
 *
 * Every member is optional because the legacy reads each defensively:
 * [model/entity/Sku.cfc:L547-L551] falls back to the ordinary price when no sale price is present,
 * and [:L554-L558] and [:L561-L565] each return the empty string when their key is absent.
 */
export interface SkuSalePriceDetails {
  readonly salePrice?: number;
  readonly salePriceDiscountType?: string;
  readonly salePriceExpirationDateTime?: Date;
}

/**
 * Resolves sale-price detail for every SKU of one product, keyed by SKU identifier.
 *
 * PRODUCT-KEYED, NOT SKU-KEYED, and deliberately so. The legacy path is
 * `getProduct().getSkuSalePriceDetails(getSkuID())` at [model/entity/Sku.cfc:L541], which resolves
 * the whole product's promotion picture once and then indexes it — that is why the corresponding
 * real port exposes a per-product lookup returning a map. Mirroring the port keeps one round trip per
 * product rather than one per SKU, matches the legacy shape, and lets a real port instance satisfy
 * this interface unchanged.
 *
 * TODO(boundary) [model/entity/Sku.cfc:L539-L565] — promotion evaluation is out of scope
 * (AAP §0.2.2.1, `model/**\/Promotion*.cfc`, 9 files). Retained behind this port rather than dropped,
 * per TR-5, because the Google product feed reads two of the members it feeds (AAP §0.6.4.2).
 */
export interface SkuSalePricingLookup {
  getSalePriceDetailsForProductSkus(
    productId: string,
  ): Promise<Readonly<Record<string, SkuSalePriceDetails>>>;
}

/**
 * Answers whether any transaction references this SKU.
 *
 * ⚠️ ZERO ARGUMENTS, AND THAT IS AAP §0.4.2.2 DISCREPANCY 4 PRESERVED RATHER THAN CORRECTED.
 * [model/entity/Sku.cfc:L594] calls `getTransactionExistsFlag( skuID=this.getSkuID() )` with a NAMED
 * argument, while the service member it reaches —
 * `public boolean function getTransactionExistsFlag()` at [model/service/SkuService.cfc:L285] —
 * DECLARES NO ARGUMENTS AT ALL. The underlying DAO member does accept optional identifiers, but the
 * service narrows them away, and AAP §0.4.2.2 states explicitly that "the narrower service contract
 * is preserved". In CFML the surplus named argument is simply ignored; in TypeScript it would be a
 * compile error, so it is not passed. The identifier reaches the checker through whatever binding the
 * composition root performs, exactly as the legacy service resolved it without a parameter.
 *
 * Structurally identical to the checker `src/domain/product/Product.ts` declares for the same guard
 * on [model/validation/Product.json], so one instance serves both entities.
 */
export interface SkuTransactionExistenceChecker {
  getTransactionExistsFlag(): Promise<boolean>;
}

/**
 * Finds the SKUs of this SKU's product that carry a given option combination.
 *
 * ⚠️ THE DATABASE READ THAT MAKES A VALIDATION RULE ASYNCHRONOUS. Its sole consumer is
 * {@link Sku.hasUniqueOptions}, and the chain behind it was traced through source rather than assumed:
 *
 *   [model/entity/Sku.cfc:L762]
 *     -> `Product.getSkusBySelectedOptions(selectedOptions)` [model/entity/Product.cfc:L366-L368]
 *     -> `ProductService.getProductSkusBySelectedOptions(selectedOptions, productID)`
 *        [model/service/ProductService.cfc:L104-L106] — a pure one-line delegation
 *     -> `SkuDAO.getSkusBySelectedOptions` — the hand-assembled conjunctive query over the SKU table
 *        and its option link table (AAP §0.6.1)
 *
 * WHY IT IS A PARAMETER RATHER THAN A REACH THROUGH `this.product`. Two reasons, both structural.
 * The product identifier plumbing belongs to `src/domain/product/Product.ts`, which already exposes
 * an equivalent asynchronous finder; duplicating it here would fork that contract. And an entity that
 * reached a repository through a relationship would be resolving its own dependency, which S3 forbids
 * — this file imports nothing from `adapters/` or `services/` and never will.
 *
 * `selectedOptions` is a COMMA-DELIMITED STRING, not an array, because that is what the legacy passes
 * and what the query builder consumes. See {@link Sku.hasUniqueOptions} for why the shape is
 * preserved rather than improved.
 */
export interface SkusBySelectedOptionsLookup {
  getSkusBySelectedOptions(selectedOptions: string): Promise<readonly Sku[]>;
}

/**
 * Reads the identifier of a product's default SKU.
 *
 * The legacy chain at [model/entity/Sku.cfc:L443] is
 * `getProduct().getDefaultSku().getSkuID()` — three hops, two of them unguarded. The middle hop is
 * typed in `src/domain/product/Product.ts` as a nine-member delegate that deliberately does NOT
 * expose an identifier accessor (S8 mismatch M-ii explains why this entity cannot be that delegate),
 * so the identifier read arrives as an explicit function instead. This follows the injected-reader
 * precedent that module already sets for the mirror-image direction.
 */
export type DefaultSkuIdReader = (defaultSku: object) => string;

/* ================================================================================================
 * MODULE CONSTANTS AND CFML-SEMANTICS HELPERS
 *
 * Every value here is a literal transcribed from the legacy source with its locator. None is
 * invented (S9), and none holds per-entity data, so nothing in this block can bleed across warm
 * Lambda invocations (M7).
 * ============================================================================================== */

/**
 * `skuID` — the declared primary identifier, [model/entity/Sku.cfc:L52],
 * `fieldtype="id" generator="uuid" ormtype="string" length="32" unsavedvalue="" default=""`.
 *
 * ⭐ WHY THIS IS A CONSTANT RATHER THAN AN ENTRY IN {@link SKU_PROPERTY_DESCRIPTORS}. The AAP row
 * for this file asks that the descriptor set "mark `skuID` as the primary ID (so the inherited
 * `has_primary_id_property_name` assertion is satisfiable)". `../base/populate` cannot express that:
 * its property-kind union admits `column`, `many-to-one`, `one-to-many` and `many-to-many` and has
 * NO `id` arm, which is exactly why `src/domain/product/Brand.ts` and `src/domain/option/Option.ts`
 * both omit their own primary identifier from their descriptor sets. Exporting the name alongside
 * the set satisfies the assertion — a non-empty identifier name is available from this module — while
 * honouring the population contract instead of bending it. `test/domain/Brand.test.ts` already
 * asserts the same reconciliation for Brand.
 */
export const SKU_PRIMARY_ID_PROPERTY_NAME = 'skuID';

/**
 * The value a `skuID` holds before the row is persisted — [model/entity/Sku.cfc:L52],
 * `unsavedvalue="" default=""`.
 *
 * {@link Sku.isNew} is defined against it. `isNew()` is declared at
 * [org/Hibachi/HibachiEntity.cfc:L707] and its inherited test compares the primary identifier value
 * against the empty string, so a freshly constructed SKU is new by construction rather than by a
 * flag anyone has to remember to set.
 */
export const SKU_UNSAVED_ID_VALUE = '';

/**
 * The property whose value stands in for a SKU in a human-facing list — [model/entity/Sku.cfc:L809],
 * whose body is `return "skuCode";`.
 */
export const SKU_SIMPLE_REPRESENTATION_PROPERTY_NAME = 'skuCode';

/**
 * The resize method both deprecated-size branches request — [model/entity/Sku.cfc:L186] and [:L214],
 * `arguments.resizeMethod = "scaleBest"`.
 *
 * The same literal is exported by the real image port; the two must agree, and this declaration
 * records the legacy origin so a reader can verify the agreement rather than take it on trust.
 */
export const SKU_RESIZE_METHOD_SCALE_BEST = 'scaleBest';

/**
 * The resource-bundle key the subscription arm of a SKU definition prefixes its label with —
 * [model/entity/Sku.cfc:L585], `#rbKey('entity.subscriptionTerm')#`.
 *
 * TODO(boundary) [model/entity/Sku.cfc:L585] — `rbKey` is framework localisation and is out of
 * scope. The RAW KEY is carried as the default label so the value is honest about what it is: a key
 * awaiting resolution, not a translation this file invented (S9). A caller that has a resource
 * bundle passes the resolved label to {@link Sku.getSkuDefinition} instead.
 */
export const SUBSCRIPTION_TERM_RESOURCE_BUNDLE_KEY = 'entity.subscriptionTerm';

/**
 * The default delimiter for a joined option display — [model/entity/Sku.cfc:L233] and [:L885], both
 * `delimiter=" "`. A SINGLE SPACE, not a comma.
 */
export const SKU_OPTIONS_DISPLAY_DEFAULT_DELIMITER = ' ';

/**
 * The delimiter a SKU definition joins its option segments with — [model/entity/Sku.cfc:L581], the
 * third argument `","`.
 *
 * Deliberately distinct from {@link SKU_OPTIONS_DISPLAY_DEFAULT_DELIMITER}: a bare comma with NO
 * trailing space, because each segment already carries a LEADING space of its own. See
 * {@link Sku.getSkuDefinition}, where that interaction is the whole subtlety.
 */
export const SKU_DEFINITION_SEGMENT_DELIMITER = ',';

/**
 * The deprecated one-letter image-size aliases — [model/entity/Sku.cfc:L177-L183] and [:L205-L211].
 *
 * Both legacy branches lower-case the requested size and then map `l`, `m` and `s` onto the
 * capitalised names that get interpolated into a setting key. The mapping is preserved because those
 * capitalised names are what compose `productImageLargeWidth` and its siblings; changing the case
 * would silently resolve a different setting.
 *
 * Frozen, and read-only at the type level, so no caller can mutate shared module state (M7).
 */
export const DEPRECATED_IMAGE_SIZE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  l: 'Large',
  m: 'Medium',
  s: 'Small',
});

/**
 * The fallback the resized-PATH branch applies to an unrecognised size —
 * [model/entity/Sku.cfc:L209-L211], the UNCONDITIONAL `else { arguments.size = "Small" }`.
 *
 * ⚠️ IT HAS NO COUNTERPART IN THE MARKUP BRANCH, and the asymmetry is real behaviour rather than an
 * oversight to harmonise. [:L177-L183] is a plain `if / else if / else if` chain with NO final
 * `else`, so an unrecognised size passes through UNCHANGED there and gets interpolated verbatim into
 * the setting key. The two members are documented separately and neither is aligned to the other.
 */
export const DEPRECATED_IMAGE_SIZE_FALLBACK = 'Small';

/**
 * Appends one value to a comma-or-other-delimited string with CFML `listAppend` semantics.
 *
 * ⭐ THE ONE RULE THAT MATTERS, STATED ONCE HERE AND THEN RELIED ON EVERYWHERE. CFML `listAppend`
 * does NOT prepend a delimiter when the accumulator is empty. So zero values yield `''`, one value
 * yields the bare value with no leading delimiter, and two yield `'a,b'` — never `',a'` and never
 * `',a,b'`. A naive `values.join(delimiter)` produces the same answer, but only because the legacy
 * accumulator always starts empty; writing the primitive explicitly keeps each call site a faithful
 * transliteration of its loop and makes the empty case obviously correct.
 *
 * Five members depend on it: {@link Sku.getOptionsDisplay} [:L236],
 * {@link Sku.getOptionsIDList} [:L528], {@link Sku.getSkuDefinition} [:L581],
 * {@link Sku.displayOptions} [:L888] and {@link Sku.hasUniqueOptions} [:L760].
 *
 * @param list the accumulator so far, empty on the first call
 * @param value the value to append, appended verbatim with no trimming and no escaping
 * @param delimiter the separator, defaulting to CFML's own default of a comma
 * @returns the extended list
 */
function appendToDelimitedList(list: string, value: string, delimiter = ','): string {
  return list === '' ? value : `${list}${delimiter}${value}`;
}

/**
 * Strips every character a Slatwall image file name may not contain.
 *
 * The transliteration of `reReplaceNoCase(value, "[^a-z0-9\-\_]", "", "all")`, which appears TWICE in
 * [model/entity/Sku.cfc:L135] and [:L138].
 *
 * TWO DETAILS THAT DECIDE WHETHER THIS IS CORRECT:
 *   - `all` makes the replacement GLOBAL, hence the `g` flag.
 *   - `reReplaceNoCase` makes it CASE-INSENSITIVE, hence the `i` flag — WITHOUT WHICH every
 *     upper-case letter of a product code would be stripped, because the legacy character class
 *     lists only the lower-case range. A product code of `TESTPRODUCTXXX` — the literal the legacy
 *     fixture at [meta/tests/unit/Helper.cfc:L58] uses — would collapse to the empty string. The `i`
 *     flag is load-bearing, not decorative.
 *
 * The legacy escapes the hyphen and the underscore inside the class; the hyphen must stay escaped or
 * trailing-positioned in a JavaScript class, and the underscore never needed escaping in either
 * dialect.
 *
 * The pattern is a function-local literal rather than a module constant on purpose: a global regular
 * expression carries a mutable `lastIndex`, and module-scope mutable state is exactly what M7 rules
 * out. Allocating one per call is trivially cheap and unconditionally safe.
 *
 * @param value the raw segment
 * @returns the segment with every disallowed character removed
 */
function stripDisallowedImageFileNameCharacters(value: string): string {
  return value.replace(/[^a-z0-9\-_]/gi, '');
}

/**
 * `SlatwallSku`, table `SwSku` — a Catalog stock-keeping unit.
 *
 * Extends nothing, by design (AAP §0.3.3, composition over inheritance): the audit lifecycle arrives
 * from `../base/AuditableEntity` as free functions, population arrives from `../base/populate`
 * driven by {@link SKU_PROPERTY_DESCRIPTORS}, and every out-of-scope collaborator arrives as an
 * explicit parameter. The legacy `extends="HibachiEntity"` at [model/entity/Sku.cfc:L49] is
 * deliberately not reproduced as inheritance — AAP §0.4.3.3 replaces template-method reuse with
 * composition so that framework members the slice never uses are never inherited into the port.
 *
 * ---------------------------------------------------------------------------------------------
 * ⭐ THE CONSTRUCTION CONTRACT — `new Sku()` MUST WORK WITH NO ARGUMENTS
 * ---------------------------------------------------------------------------------------------
 * `SkuService.createSkus` [model/service/SkuService.cfc:L58-L211] builds SKUs through the IR-1
 * synthesized factory `this.newSku()`, which takes nothing and returns a bare transient. In
 * TypeScript that is `new Sku()`, so NO CONSTRUCTOR PARAMETER MAY BE REQUIRED. Every field either
 * carries its declared legacy default or is optional, which is also what makes the entity cheaply
 * constructible in a test with no framework bootstrap and no mocking library — the legacy suite has
 * neither (S6, AAP §0.4.3.6) — and what satisfies the inherited `defaults_are_correct` assertion at
 * [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L49-L69].
 *
 * The merchandise-with-options branch calls, in exactly this order:
 *
 *   1. `newSku()`                                            -> `new Sku()`
 *   2. `setPrice(data.price)`                                 -> `sku.price = …`
 *   3. `setListPrice(data.listPrice)` conditionally           -> `sku.listPrice = …`
 *   4. `setSkuCode(productCode & "-" & arrayLen(product.getSkus()) + 1)`
 *   5. `product.addSku(newSku)`                               -> {@link Sku.setProduct}
 *   6. `product.setDefaultSku(newSku)` when none is set
 *   7. `newSku.addOption(…)` per option group [:L107]         -> {@link Sku.addOption}
 *
 * ⚠️ STEP 4 READS THE COLLECTION LENGTH **BEFORE** STEP 5 APPENDS TO IT. That ordering is the entire
 * reason the generated codes come out `-1`, `-2`, `-3` rather than all colliding on `-1`, and it holds
 * only because of two facts verified in `src/domain/product/Product.ts`: `getSkus()` returns the LIVE
 * array with no copy, and `addSku(sku)` is a pure delegation to `sku.setProduct(this)`. The append
 * therefore happens HERE. {@link Sku.setProduct} documents the coupling at the line that maintains it.
 *
 * All four legacy creation paths must work against this entity, and they differ: the no-options
 * merchandise path calls `setProduct` directly and hard-codes `-1`; the bundled content-access path
 * calls `setSkuCode` BEFORE `setProduct`; the unbundled path numbers from a loop counter. Nothing
 * here assumes a particular order beyond what the fields themselves require, which is why all four
 * are satisfied.
 *
 * ---------------------------------------------------------------------------------------------
 * THE TWO STRUCTURAL CONTRACTS THIS CLASS SATISFIES WITHOUT DECLARING THEM
 * ---------------------------------------------------------------------------------------------
 * `src/domain/option/Option.ts` declares an owner shape requiring `addOption(option: Option): void`
 * and `removeOption(option: Option): void`, and `src/domain/product/Product.ts` declares a member
 * shape requiring `setProduct(product: Product): void` and `removeProduct(product?: Product): void`.
 * Both are satisfied structurally by the members below. Neither is named in an `implements` clause,
 * because importing them would add two modules to this file's dependency set for no type-checking
 * benefit — structural satisfaction is already verified at every call site in those modules.
 *
 * @see model/entity/Sku.cfc — the sole origin
 */
export class Sku implements AuditableEntity {
  /* ---------------------------------------------------------------------------------------------
   * PERSISTENT PROPERTIES — [model/entity/Sku.cfc:L52-L96], in legacy declaration order
   *
   * Declared as plain public fields rather than accessor pairs, which is the convention every
   * sibling entity of this subtree follows: the legacy `accessors=true` at [:L49] synthesized a
   * `get`/`set` pair per property, and reproducing 62 trivial methods would add noise without adding
   * a single guarantee. Only the members that carry BEHAVIOUR are methods, and the two bidirectional
   * setters that maintain both sides of a relationship are the only setters that survive.
   *
   * Every OPTIONAL field uses `declare`. That is required rather than stylistic: `tsconfig.json`
   * resolves `useDefineForClassFields` to true under an ES2022 target, so a plain optional field
   * declaration would emit a definition initialising the key to `undefined` — which under
   * `exactOptionalPropertyTypes` is a DIFFERENT state from the key being absent, and would break
   * both the population contract and the `delete` in each `remove*` member.
   * ------------------------------------------------------------------------------------------- */

  /**
   * `skuID` — [model/entity/Sku.cfc:L52].
   *
   * A 32-character hexadecimal string WITH NO DASHES (IR-6): 107 of 113 legacy entities declare
   * `fieldtype="id" generator="uuid" ormtype="string" length="32"`, and the generator is
   * `createSlatwallUUID()`. Generation belongs to `src/util/uuid.ts`; this entity never generates one
   * and never validates the shape, because the legacy entity does neither.
   *
   * Defaults to {@link SKU_UNSAVED_ID_VALUE} so {@link Sku.isNew} is true on a fresh instance.
   */
  skuID: string = SKU_UNSAVED_ID_VALUE;

  /** `activeFlag` — [model/entity/Sku.cfc:L53], `ormtype="boolean" default="1"`. */
  activeFlag: boolean = true;

  /**
   * `skuCode` — [model/entity/Sku.cfc:L54], `ormtype="string" unique="true" length="50"`.
   *
   * ⚠️ `unique="true"` is ONE OF ONLY FIVE UNIQUE COLUMNS IN THE ENTIRE SLICE, and the constraint is
   * enforced TWICE in the legacy system: once by the column and once in application code, because
   * `isUniqueProperty()` at [org/Hibachi/HibachiDAO.cfc:L130-L146] runs an existence query during
   * validation independently of the column metadata (IR-5). [model/validation/Sku.json:11] declares
   * the save-context rule that triggers it.
   *
   * NOTHING IS CHECKED HERE. The pre-save existence check belongs to
   * `src/adapters/mysql/UniquePropertyChecker.ts` behind its port, and rule evaluation belongs to
   * `src/validation/rules/sku.rules.ts`. Recording the constraint at the field keeps the obligation
   * visible without importing either (S2, S4).
   *
   * Optional because [:L54] declares no default, so a new SKU has no code until one is assigned —
   * exactly the state the required-field rule exists to catch.
   */
  declare skuCode?: string;

  /**
   * `listPrice` — [model/entity/Sku.cfc:L55], `ormtype="big_decimal" hb_formatType="currency"
   * default="0"`.
   *
   * ⚠️ THE `big_decimal` -> `number` MAPPING IS A DELIBERATE PRECISION TRADE, made once and applied
   * to all three money fields. A JavaScript `number` is an IEEE-754 double, so it cannot represent
   * every decimal a `big_decimal` column can, and repeated arithmetic on money in this
   * representation can accumulate error. It is chosen anyway for three reasons: nothing in the AAP
   * calls for a decimal library and adding one would be inventing a dependency (S9, and S5 pins the
   * manifest to a single runtime package); this entity performs NO arithmetic on these values, it
   * only stores, returns and compares them; and [model/validation/Sku.json:4], [:9] and [:10]
   * constrain them with `dataType: numeric` and `minValue: 0`, which a `number` satisfies directly.
   * Should a later iteration compute money here, this is the decision to revisit.
   *
   * `hb_formatType="currency"` is a DISPLAY concern and is not carried: formatting belongs to
   * `src/util/formatting.ts`.
   */
  listPrice: number = 0;

  /**
   * `price` — [model/entity/Sku.cfc:L56], `ormtype="big_decimal" hb_formatType="currency"
   * default="0"`. See {@link Sku.listPrice} for the precision note.
   *
   * The only one of the three money fields that [model/validation/Sku.json:9] declares
   * `required: true`, which is what makes the inherited "a new instance fails save validation"
   * assertion hold: a fresh SKU has the default `0`, but no `skuCode`, and [:11] requires one.
   */
  price: number = 0;

  /**
   * `renewalPrice` — [model/entity/Sku.cfc:L57], `ormtype="big_decimal" hb_formatType="currency"
   * default="0"`. See {@link Sku.listPrice} for the precision note. Set by the subscription creation
   * branch at [model/service/SkuService.cfc:L157].
   */
  renewalPrice: number = 0;

  /**
   * `imageFile` — [model/entity/Sku.cfc:L58], `ormtype="string" length="50"`.
   *
   * Optional, because [:L58] declares NO default and {@link Sku.generateImageFileName} exists
   * precisely to compute one. Read by {@link Sku.getImageExtension} and by the image-path members.
   */
  declare imageFile?: string;

  /** `userDefinedPriceFlag` — [model/entity/Sku.cfc:L59], `ormtype="boolean" default="0"`. */
  userDefinedPriceFlag: boolean = false;

  /**
   * `calculatedQATS` — [model/entity/Sku.cfc:L62], `ormtype="integer"`.
   *
   * ⚠️ A PERSISTED COLUMN, GENUINELY DISTINCT FROM THE NON-PERSISTENT `qats` AT [:L113]. The legacy
   * file declares both, under its own `// Calculated Properties` heading, and they are easy to
   * conflate: `qats` is one of the THIRTEEN EXCLUDED members and its getter at [:L536] delegates to
   * an out-of-scope inventory service, whereas THIS field is a stored integer that the platform
   * maintains and that the Google product feed's availability gate reads —
   * `addRange('product.calculatedQATS','1^')` at
   * [integrationServices/google/controllers/feed.cfc] (AAP §0.6.4.1). Carrying the column while
   * excluding the calculated member is therefore correct, not inconsistent.
   *
   * Optional because [:L62] declares no default.
   */
  declare calculatedQATS?: number;

  /**
   * `product` — [model/entity/Sku.cfc:L65], `fieldtype="many-to-one" fkcolumn="productID"
   * cfc="Product" hb_cascadeCalculate="true"`.
   *
   * Optional because the SKU is assembled in memory BEFORE the association is made — see
   * {@link Sku.setProduct}, which is the only member that assigns it.
   *
   * `hb_cascadeCalculate="true"` instructed the framework to recalculate this SKU's derived columns
   * when the product's changed. It is not carried: recalculation is a persistence-layer concern owned
   * by `src/adapters/mysql/**`, and reproducing it here would put a write path in a domain entity.
   */
  declare product?: Product;

  /**
   * `subscriptionTerm` — [model/entity/Sku.cfc:L66], `cfc="SubscriptionTerm"
   * fieldtype="many-to-one" fkcolumn="subscriptionTermID"`.
   *
   * Typed as {@link SubscriptionTermRef} rather than a ported entity, because `SubscriptionTerm` is
   * out of scope. See that interface for why its identifier member is required and its name member is
   * not, and S8 mismatch M-iv for the far side of the association.
   */
  declare subscriptionTerm?: SubscriptionTermRef;

  /**
   * `options` — [model/entity/Sku.cfc:L76], `singularname="option" cfc="Option"
   * fieldtype="many-to-many" linktable="SwSkuOption" fkcolumn="skuID" inversejoincolumn="optionID"`.
   *
   * ⭐ THE SINGLE MOST IMPORTANT RELATIONSHIP IN THE FILE, and the one this entity OWNS.
   *
   * OWNERSHIP IS PROVEN FROM BOTH SIDES, not assumed: [model/entity/Option.cfc:L66] declares the
   * mirror of this association WITH `inverse="true"`, and [:L76] declares this side WITHOUT it. In
   * Hibernate the non-inverse side is the owner, so this entity is definitively the owner of the
   * `SwSkuOption` link table, whose columns are `skuID` and `optionID`. That matters beyond
   * bookkeeping: `src/adapters/mysql/MySqlSkuRepository.ts` queries that exact table for the
   * conjunctive option-resolution statement of AAP §0.6.1, so the mapping has to be recorded
   * precisely — and, per S2, recorded ONLY as prose. No table name and no column name appears
   * anywhere in this file in an executable position.
   *
   * PRACTICAL CONSEQUENCE FOR THIS CLASS: {@link Sku.addOption} and {@link Sku.removeOption} mutate
   * THIS array and nothing else. `Option.addSku` and `Option.removeSku`
   * [model/entity/Option.cfc:L109-L114] are pure delegations INTO those two members, so touching the
   * inverse side from here would recurse without termination.
   *
   * COSMETIC LEGACY DETAIL: alone among the four owning many-to-many declarations, [:L76] omits
   * `type="array"`, which [:L77], [:L78] and [:L79] all carry. It has no effect in CFML.
   *
   * Defaults to an empty array so a fresh SKU can accept options immediately, which the odometer at
   * [model/service/SkuService.cfc:L107] requires.
   */
  options: Option[] = [];

  /** `remoteID` — [model/entity/Sku.cfc:L90], `ormtype="string"`, no default, so optional. */
  declare remoteID?: string;

  /* ---------------------------------------------------------------------------------------------
   * AUDIT PROPERTIES — [model/entity/Sku.cfc:L93-L96], all four `hb_populateEnabled="false"`
   *
   * Declared here to satisfy the {@link AuditableEntity} contract structurally; the LIFECYCLE that
   * fills them lives in `../base/AuditableEntity` as free functions, so no ORM event hook is
   * reproduced. `createdByAccount` and `modifiedByAccount` are many-to-one relationships to
   * `Account`, which is out of scope (AAP §0.2.2.1, 21 files) — the base module represents each as an
   * account identifier rather than an entity reference, and that decision is honoured here rather
   * than an `Account` type being invented (S9).
   * ------------------------------------------------------------------------------------------- */

  /** `createdDateTime` — [model/entity/Sku.cfc:L93], `ormtype="timestamp"`. */
  declare createdDateTime?: Date;

  /** `createdByAccount` — [model/entity/Sku.cfc:L94], `cfc="Account" fkcolumn="createdByAccountID"`. */
  declare createdByAccount?: string;

  /** `modifiedDateTime` — [model/entity/Sku.cfc:L95], `ormtype="timestamp"`. */
  declare modifiedDateTime?: Date;

  /** `modifiedByAccount` — [model/entity/Sku.cfc:L96], `cfc="Account" fkcolumn="modifiedByAccountID"`. */
  declare modifiedByAccount?: string;

  /* ---------------------------------------------------------------------------------------------
   * PER-INSTANCE MEMOIZATION (M7 / S8)
   *
   * The legacy caches each derived value in its own `variables` scope behind a
   * `!structKeyExists(variables, …)` guard, and [:L49] declares `cacheuse="transactional"`. Under
   * Lambda nothing survives an invocation except MODULE-scope state, so every cache here is a
   * `#`-private INSTANCE field. A module-scope cache would serve one tenant's catalog data from
   * another tenant's request on a warm container — a correctness and isolation failure, not a
   * performance detail.
   * ------------------------------------------------------------------------------------------- */

  /** Caches {@link Sku.getCurrencyCode} — the legacy guard is at [model/entity/Sku.cfc:L361]. */
  #currencyCode?: string;

  /** Caches {@link Sku.getOptionsIDList} — the legacy guard is at [model/entity/Sku.cfc:L525]. */
  #optionsIdList?: string;

  /**
   * Caches {@link Sku.getSkuDefinition} — the legacy guard is at [model/entity/Sku.cfc:L575].
   *
   * The empty string IS a cached value, not a cache miss. Two of the three legacy arms can leave the
   * result empty — the content-access arm by design and the merchandise arm when there are no options
   * — and the legacy guard tests key EXISTENCE rather than truthiness, so it never recomputes. The
   * `=== undefined` test below reproduces that exactly, where a falsy test would not.
   */
  #skuDefinition?: string;

  /** Caches {@link Sku.getImageName} — the legacy guard is at [model/entity/Sku.cfc:L795]. */
  #imageName?: string;

  /**
   * Caches the always-empty D2 map — the legacy guard is at [model/entity/Sku.cfc:L513].
   *
   * ⚠️ ALSO WRITTEN BY D1, AND THAT CROSS-TALK IS THE DEFECT. [:L502] initialises THIS cache while
   * claiming to initialise the code-keyed one, so the two accessors interfere and CALL ORDER BECOMES
   * OBSERVABLE. See {@link Sku.getOptionsByOptionGroupCodeStruct} for the full consequence.
   */
  #optionsByOptionGroupIdStruct?: Record<string, Option>;

  /**
   * The THIRD, differently-named struct of defect D2 — [model/entity/Sku.cfc:L517].
   *
   * ⚠️ WRITTEN BUT NEVER READ, DELIBERATELY. The legacy loop populates
   * `variables.OptionsByGroupIDStruct` while the accessor returns
   * `variables.optionsByOptionGroupIDStruct`, so every option lands somewhere nothing consults. It is
   * kept as a real field rather than dropped so the defect is INSPECTABLE: a test can observe that
   * the options were computed and then discarded, which is a far stronger demonstration of D2 than an
   * accessor that merely returns an empty object for no visible reason.
   *
   * TODO(parity) [model/entity/Sku.cfc:L512-L522] — D2. Not repaired.
   */
  #discardedOptionsByGroupIdStruct: Record<string, Option> = {};

  /** Caches {@link Sku.getSalePriceDetails} — the legacy guard is at [model/entity/Sku.cfc:L540]. */
  #salePriceDetails?: SkuSalePriceDetails;

  /** Caches {@link Sku.getTransactionExistsFlag} — the legacy guard is at [model/entity/Sku.cfc:L593]. */
  #transactionExistsFlag?: boolean;

  /* ---------------------------------------------------------------------------------------------
   * THE UNGUARDED-DEREFERENCE POLICY, STATED ONCE
   *
   * The legacy file dereferences a possibly-absent relationship without a guard in eleven places,
   * most of them the chain `option.getOptionGroup().getOptionGroupX()`. `optionGroup` is genuinely
   * optional: [model/entity/Option.cfc:L59] declares a plain many-to-one with no `required`
   * attribute, and `src/domain/option/Option.ts` types it optional accordingly. In CFML each of
   * those chains raises on a null reference; in TypeScript under `strict` each is a compile error
   * until narrowed, and S1 forbids resolving that with a non-null assertion.
   *
   * THE POLICY: where the legacy would have raised, this port raises too — a {@link DomainError}
   * naming the member and its locator. That is the FAITHFUL outcome, made diagnosable instead of
   * arriving as an opaque runtime failure, and it keeps a validation rule's verdict honest: silently
   * skipping an option with no group would let a SKU pass a uniqueness check the legacy system fails
   * it on.
   *
   * THE ONE DECLARED EXCEPTION is {@link Sku.getDefaultFlag}, which returns `false` instead of
   * raising. It is flagged at that member with its reasoning.
   * ------------------------------------------------------------------------------------------- */

  /**
   * Reads an option's option group, raising where the legacy would have raised.
   *
   * @param option the option whose group is required
   * @param locator the `model/entity/Sku.cfc:L###` site whose behaviour is being reproduced
   * @returns the option group
   * @throws {DomainError} when the option carries no option group, reproducing the legacy null
   *   dereference at the cited locator
   */
  #requireOptionGroup(option: Option, locator: string): OptionGroup {
    const optionGroup = option.optionGroup;
    if (optionGroup === undefined) {
      throw new DomainError(
        `Sku ${this.skuID === SKU_UNSAVED_ID_VALUE ? '(unsaved)' : this.skuID} holds option ` +
          `${option.optionID === '' ? '(unsaved)' : option.optionID} with no option group, so ` +
          `${locator} cannot resolve. The legacy code dereferences the option group without a ` +
          `guard at that line and raises here too.`,
        { context: { skuID: this.skuID, optionID: option.optionID, locator } },
      );
    }
    return optionGroup;
  }

  /**
   * Reads this SKU's product, raising where the legacy would have raised.
   *
   * `product` is genuinely optional — three of the four creation paths at
   * [model/service/SkuService.cfc:L58-L211] assemble the SKU before associating it — yet several
   * legacy members call `getProduct()` and immediately dereference the result. Those members raise on
   * an unassociated SKU in CFML, and they raise here too.
   *
   * @param locator the `model/entity/Sku.cfc:L###` site whose behaviour is being reproduced
   * @returns the product
   * @throws {DomainError} when this SKU has no product
   */
  #requireProduct(locator: string): Product {
    const product = this.product;
    if (product === undefined) {
      throw new DomainError(
        `Sku ${this.skuID === SKU_UNSAVED_ID_VALUE ? '(unsaved)' : this.skuID} has no product, ` +
          `so ${locator} cannot resolve. The legacy code dereferences the product without a guard ` +
          `at that line and raises here too.`,
        { context: { skuID: this.skuID, locator } },
      );
    }
    return product;
  }

  /* ---------------------------------------------------------------------------------------------
   * IDENTITY
   * ------------------------------------------------------------------------------------------- */

  /**
   * Whether this SKU has never been persisted.
   *
   * `isNew()` is declared at [org/Hibachi/HibachiEntity.cfc:L707] and its inherited test compares the
   * primary identifier value against the empty string, which for this entity is `skuID` per
   * [model/entity/Sku.cfc:L52] `unsavedvalue="" default=""`. A freshly constructed SKU is therefore
   * new by construction.
   *
   * ⚠️ IT IS NOT MERELY INFORMATIONAL. {@link Sku.setProduct} branches on it, and because CFML `or`
   * short-circuits, a new SKU takes the append path UNCONDITIONALLY there. And it is one of the four
   * inherited entity assertions: `defaults_are_correct` asserts `isNew()` and an empty primary
   * identifier value.
   *
   * @returns `true` while `skuID` is still {@link SKU_UNSAVED_ID_VALUE}
   */
  isNew(): boolean {
    return this.skuID === SKU_UNSAVED_ID_VALUE;
  }

  /**
   * The property whose value represents this SKU in a human-facing list.
   *
   * [model/entity/Sku.cfc:L809], whose body is `return "skuCode";`.
   *
   * ⭐ THE ONE SANCTIONED EXCEPTION to this file's forbidden-member list. `getSimpleRepresentation`
   * itself is NOT declared — composing a representation is the framework's job and the port leaves it
   * to the layer that renders — but the property NAME is this entity's own declaration, and it is what
   * makes the inherited `simple_representation_exists_and_is_simple` assertion at
   * [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L49-L69] satisfiable: `skuCode` is a string,
   * which is a simple value.
   *
   * @returns the literal `'skuCode'`
   */
  getSimpleRepresentationPropertyName(): string {
    return SKU_SIMPLE_REPRESENTATION_PROPERTY_NAME;
  }

  /* ---------------------------------------------------------------------------------------------
   * OPTION MEMBERSHIP — IR-1: three members with NO legacy body anywhere
   *
   * ⭐ A repository-wide search for `addOption`, `removeOption` and `hasOption` finds NO DEFINITION
   * in [model/entity/Sku.cfc]. All three exist purely through ORM synthesis from
   * `singularname="option"` at [:L76] — precisely the `onMissingMethod`-class metaprogramming that
   * IR-1 requires be replaced by explicit declarations, since TypeScript under `strict` has no
   * equivalent facility.
   *
   * FOUR IN-SCOPE CALL SITES DEPEND ON THEM, every one verified:
   *   [model/entity/Option.cfc:L111]        `arguments.sku.addOption( this );`
   *   [model/entity/Option.cfc:L114]        `arguments.sku.removeOption( this );`
   *   [model/service/SkuService.cfc:L107]   inside the odometer combination engine
   *   [model/service/ProductService.cfc:L119] `skus[i].addOption(options[1]);` — the D14 site
   *
   * Without these declarations, `src/domain/option/Option.ts`, `src/services/SkuService.ts` and
   * `src/services/ProductService.ts` cannot compile.
   * ------------------------------------------------------------------------------------------- */

  /**
   * This SKU's options — the live array, not a copy.
   *
   * The explicit replacement for the accessor `accessors=true` synthesized from [:L76]. Returning the
   * live array is faithful and load-bearing: every legacy caller iterates it in place, and
   * `src/domain/product/Product.ts` makes the identical choice for its own collection for the reason
   * documented on {@link Sku.setProduct}.
   *
   * @returns the option collection, mutable and shared
   */
  getOptions(): Option[] {
    return this.options;
  }

  /**
   * Whether this SKU already holds the given option.
   *
   * IR-1: synthesized in legacy, declared explicitly here. It is declared even though no legacy line
   * calls it on a SKU, because {@link Sku.addOption} needs exactly this predicate and because the
   * sibling entities declare their own equivalents — `OptionGroup.hasOption` and `Brand.hasProduct` —
   * so a reader finds the member where the convention says it should be.
   *
   * Identity comparison, not identifier comparison, matching the ORM-synthesized `array contains`
   * semantics and the legacy hand-written membership tests at [:L705] and [:L725], which compare
   * object references.
   *
   * @param option the option to look for
   * @returns `true` when this exact option instance is already held
   */
  hasOption(option: Option): boolean {
    return this.options.includes(option);
  }

  /**
   * Adds an option to this SKU.
   *
   * ADD-IF-ABSENT, and the choice is evidence-based rather than arbitrary. No legacy body exists to
   * transliterate, so the semantics are taken from the two places the legacy DOES hand-write a
   * two-sided add on this entity — [:L704-L712] and [:L724-L732] — both of which guard with a
   * membership test before appending. The AAP row for this file prescribes the same shape.
   *
   * ⚠️ MUTATES THE OWNING SIDE ONLY. This entity owns the link table (see {@link Sku.options}), and
   * `Option.addSku` at [model/entity/Option.cfc:L111] is a pure delegation INTO this member. Updating
   * the inverse side from here would therefore recurse without termination. The correct way to
   * associate from the option's side is `option.addSku(sku)`, which lands back here exactly once.
   *
   * @param option the option to associate
   */
  addOption(option: Option): void {
    if (!this.hasOption(option)) {
      this.options.push(option);
    }
  }

  /**
   * Removes an option from this SKU.
   *
   * ⚠️ THE SENTINEL TRANSLATION MATTERS. CFML `arrayFind` returns 0 when not found, so every legacy
   * guard reads `if(index > 0)`; TypeScript `indexOf` returns −1, so the guard MUST read
   * `!== -1`. Transliterating `> 0` would silently delete element 0 of the array whenever the search
   * missed. The legacy file has six such guards — [:L615], [:L633], [:L714], [:L718], [:L734] and
   * [:L738] — and every translation in this file uses `!== -1`.
   *
   * Owning side only, for the same non-recursion reason as {@link Sku.addOption}.
   *
   * @param option the option to disassociate; a no-op when it is not held
   */
  removeOption(option: Option): void {
    const index = this.options.indexOf(option);
    if (index !== -1) {
      this.options.splice(index, 1);
    }
  }

  /* ---------------------------------------------------------------------------------------------
   * OPTION STRUCTURE — the seven members of the AAP row, three of them defective
   * ------------------------------------------------------------------------------------------- */

  /**
   * The option names of this SKU joined by a delimiter — [model/entity/Sku.cfc:L233-L239].
   *
   * The legacy default delimiter is a SINGLE SPACE, not a comma: `getOptionsDisplay(delimiter=" ")`.
   * The join uses CFML `listAppend` semantics, so an option-less SKU yields the empty string and a
   * single option yields its bare name with no delimiter on either side — see
   * {@link appendToDelimitedList}.
   *
   * @param delimiter the separator, defaulting to {@link SKU_OPTIONS_DISPLAY_DEFAULT_DELIMITER}
   * @returns the joined option names, empty when this SKU has no options
   * @throws {DomainError} never — this member reads `optionName` only and touches no option group
   */
  getOptionsDisplay(delimiter: string = SKU_OPTIONS_DISPLAY_DEFAULT_DELIMITER): string {
    let displayedOptions = '';
    for (const option of this.options) {
      /*
       * [:L236] appends `getOptions()[i].getOptionName()` with no null guard. `optionName` is
       * optional on the ported Option because [model/entity/Option.cfc:L54] declares no default, so
       * an absent name is represented as the empty string here rather than raising: unlike the
       * option-group chains this is a SCALAR read, and CFML `listAppend` accepts an empty value and
       * appends an empty element for it. Raising would invent a failure the legacy does not have.
       */
      displayedOptions = appendToDelimitedList(
        displayedOptions,
        option.optionName ?? '',
        delimiter,
      );
    }
    return displayedOptions;
  }

  /**
   * The option belonging to a given option group, by group identifier —
   * [model/entity/Sku.cfc:L241-L245].
   *
   * ⚠️ CORRECT IN ITSELF, YET IT CAN NEVER FIND ANYTHING. Unlike its sibling at [:L247] it tests and
   * indexes THE SAME map — so there is no defect to carry in this member — but the map it consults is
   * {@link Sku.getOptionsByOptionGroupIDStruct}, which defect D2 makes permanently empty. The lookup
   * therefore always misses, through no fault of its own. Recorded so that a reader who verifies this
   * member against [:L241] and finds it faithful does not then conclude the port is broken elsewhere.
   *
   * The legacy has NO `else` arm, so control falls off the end and CFML returns null. That maps to
   * `undefined`, which is why the return type admits it rather than raising on a miss.
   *
   * @param optionGroupID the option group's identifier
   * @returns the matching option, or `undefined`
   */
  getOptionByOptionGroupID(optionGroupID: string): Option | undefined {
    const optionsByOptionGroupId = this.getOptionsByOptionGroupIDStruct();
    /*
     * The two-step read is the transliteration of `structKeyExists(...)` followed by an index, and
     * under `noUncheckedIndexedAccess` the index yields `Option | undefined` regardless — so the
     * narrowing is what the compiler requires AND what the legacy shape describes.
     */
    if (Object.hasOwn(optionsByOptionGroupId, optionGroupID)) {
      return optionsByOptionGroupId[optionGroupID];
    }
    return undefined;
  }

  /**
   * The option belonging to a given option group, by group CODE — [model/entity/Sku.cfc:L247-L251].
   *
   * ⚠️⚠️ TODO(parity) [model/entity/Sku.cfc:L247-L251] — DEFECT D3, CARRIED NOT REPAIRED.
   *
   * The legacy body, verbatim:
   *
   *     if(structKeyExists(getOptionsByOptionGroupCodeStruct(), arguments.optionGroupCode)) {
   *         return getOptionsByOptionGroupIDStruct()[ arguments.optionGroupCode ];
   *     }
   *
   * It TESTS the code-keyed map and then INDEXES THE IDENTIFIER-KEYED MAP with a CODE key, so it can
   * never hit. The one-character difference between the two accessor names is the entire defect, and
   * it is the reason this port gives each accessor a distinct, typed return value rather than
   * maintaining parallel string-keyed maps — AAP §0.6.7.2 draws exactly that lesson from the D1/D2/D3
   * cluster.
   *
   * IN PRACTICE THIS MEMBER CANNOT SUCCEED AT ALL, and for a compounding reason: the guard calls
   * {@link Sku.getOptionsByOptionGroupCodeStruct}, which defect D1 makes RAISE on first call, so the
   * mismatched index at the second line is never even reached. The wrong-map read is preserved anyway
   * — it is what the source says, and a future repair of D1 would expose it.
   *
   * Guideline 4 forbids the obvious fix. Repairing it would activate a lookup the legacy system never
   * performs, changing which options a SKU reports for a group code, and the change would read as a
   * bug fix while silently altering behaviour.
   *
   * @param optionGroupCode the option group's code
   * @returns the matching option, or `undefined`; unreachable in practice, see above
   * @throws {DomainError} propagated from D1's guard call, which raises before this member can return
   */
  getOptionByOptionGroupCode(optionGroupCode: string): Option | undefined {
    /*
     * [:L248] — the guard consults the CODE-keyed map. This call is what raises D1, and it is placed
     * first because that is where the legacy places it.
     */
    const optionsByOptionGroupCode = this.getOptionsByOptionGroupCodeStruct();
    if (Object.hasOwn(optionsByOptionGroupCode, optionGroupCode)) {
      /* [:L249] — and the return indexes the IDENTIFIER-keyed map. The mismatch IS defect D3. */
      return this.getOptionsByOptionGroupIDStruct()[optionGroupCode];
    }
    return undefined;
  }

  /**
   * This SKU's options keyed by option group CODE — [model/entity/Sku.cfc:L500-L510].
   *
   * ⚠️⚠️ TODO(parity) [model/entity/Sku.cfc:L500-L510] — DEFECT D1, CARRIED NOT REPAIRED.
   * THIS MEMBER FAILS ON EVERY CALL, BY DESIGN OF THE PORT AND BY BEHAVIOUR OF THE LEGACY.
   *
   * The legacy body, verbatim:
   *
   *     if(!structKeyExists(variables, "optionsByOptionGroupCodeStruct")) {
   *         variables.optionsByOptionGroupIDStruct = {};          // <-- the WRONG variable
   *         for(var option in getOptions()) {
   *             if( !structKeyExists(variables.optionsByOptionGroupCodeStruct, option.getOptionGroup().getOptionGroupCode())){
   *                 variables.optionsByOptionGroupCodeStruct[ option.getOptionGroup().getOptionGroupCode() ] = option;
   *             }
   *         }
   *     }
   *     return variables.optionsByOptionGroupCodeStruct;
   *
   * WHY IT FAILS ON **BOTH** PATHS, which is stronger than the register's summary and was established
   * by reading the control flow rather than assumed:
   *   - WITH OPTIONS: the first loop iteration reads `variables.optionsByOptionGroupCodeStruct`
   *     inside `structKeyExists`, and that variable was never created, so CFML raises an
   *     undefined-variable error at [:L504].
   *   - WITH NO OPTIONS: the loop body never runs, control reaches [:L509], and the `return` reads
   *     the same never-created variable. It raises there instead.
   * There is consequently NO input for which this member returns a value.
   *
   * THE MEMOIZATION GUARD AT [:L501] IS DEAD for the same reason: its subject is never created, so
   * the guard is always true and the wrong-variable initialisation below runs on EVERY call. That is
   * the same class of dead memoization as the observed item at [:L460].
   *
   * ⭐ THE SIDE EFFECT IS THE INTERESTING PART, AND IT IS REPRODUCED FAITHFULLY. [:L502] initialises
   * {@link Sku.getOptionsByOptionGroupIDStruct}'s cache — D2's cache — before raising. So CALL ORDER
   * BETWEEN THE TWO ACCESSORS IS OBSERVABLE: call this member first and D2 afterwards finds its cache
   * already present, skips its loop entirely, and returns empty WITHOUT ever dereferencing an option
   * group; call D2 first and its loop does run and can raise on an option with no group. Two orders,
   * two behaviours, one shared mutable cache. Preserved exactly.
   *
   * THE RETURN TYPE IS THE MAP SHAPE, NOT `never`. The legacy declares `returntype="any"` and the
   * shape it intends is a code-keyed map of options; typing it as the intended shape is what keeps
   * {@link Sku.getOptionByOptionGroupCode}'s existence test type-legal, and it is what a future
   * repair would satisfy without changing this signature.
   *
   * FIRST-WINS SEMANTICS, RECORDED THOUGH UNREACHABLE: the `if(!structKeyExists(...))` guard at
   * [:L504] means the FIRST option seen for a group code would be kept and later ones ignored.
   * Contrast {@link Sku.getOptionsValueStruct} at [:L899], which has no such guard and lets the last
   * option win. Both are preserved as written.
   *
   * @returns nominally a map of option group code to option; never actually returns
   * @throws {DomainError} always, reproducing the legacy undefined-variable failure
   */
  getOptionsByOptionGroupCodeStruct(): Record<string, Option> {
    /*
     * [:L502] — the wrong-variable initialisation, reproduced INCLUDING its clobber of D2's cache,
     * and reproduced BEFORE the failure because that is the legacy order of execution. It is
     * unconditional because the legacy guard at [:L501] is dead.
     */
    this.#optionsByOptionGroupIdStruct = {};
    throw new DomainError(
      'Sku.getOptionsByOptionGroupCodeStruct is unusable: model/entity/Sku.cfc:L502 initialises ' +
        'the identifier-keyed struct while model/entity/Sku.cfc:L504 and :L509 read a ' +
        'code-keyed struct that is never created, so the legacy member raises an ' +
        'undefined-variable error on every call. Carried unrepaired as defect D1 per AAP 0.6.7.2 ' +
        'and Refactor Discipline Guideline 4. It has already reset the identifier-keyed cache, ' +
        'exactly as the legacy does.',
      {
        context: {
          skuID: this.skuID,
          defect: 'D1',
          locator: 'model/entity/Sku.cfc:L500-L510',
          optionCount: this.options.length,
        },
      },
    );
  }

  /**
   * This SKU's options keyed by option group IDENTIFIER — [model/entity/Sku.cfc:L512-L522].
   *
   * ⚠️⚠️ TODO(parity) [model/entity/Sku.cfc:L512-L522] — DEFECT D2, CARRIED NOT REPAIRED.
   * THIS MEMBER ALWAYS RETURNS AN EMPTY MAP, however many options are attached.
   *
   * The legacy body, verbatim:
   *
   *     if(!structKeyExists(variables, "optionsByOptionGroupIDStruct")) {
   *         variables.optionsByOptionGroupIDStruct = {};
   *         for(var option in getOptions()) {
   *             if( !structKeyExists(variables.optionsByOptionGroupIDStruct, option.getOptionGroup().getOptionGroupID())){
   *                 variables.OptionsByGroupIDStruct[ option.getOptionGroup().getOptionGroupID() ] = option;
   *             }
   *         }
   *     }
   *     return variables.optionsByOptionGroupIDStruct;
   *
   * The guard tests the right map, the map is created, the loop runs, the existence check consults the
   * right map — and then the ASSIGNMENT AT [:L517] writes into `variables.OptionsByGroupIDStruct`, a
   * THIRD struct with a third distinct name. The map that is returned is therefore the one that was
   * created and never written to. Every option is computed and then discarded.
   *
   * ⭐ THE WORK IS STILL PERFORMED, AND THAT IS WHY IT IS PORTED AS A REAL LOOP RATHER THAN AS
   * `return {}`. Two consequences are observable and would be lost by the shortcut: the discarded map
   * accumulates the correct entries, which {@link Sku.getOptionsByOptionGroupCodeStruct} explains is
   * inspectable evidence of the defect; and the loop DEREFERENCES EACH OPTION'S GROUP, so a SKU
   * holding an option with no group raises here. Returning an empty object immediately would silently
   * make that failure disappear.
   *
   * ⚠️ AND THE FAILURE IS ORDER-DEPENDENT, which is the D1 cross-talk seen from this side: if D1 ran
   * first it already set this cache, so the guard below is false, the loop is SKIPPED, and no group is
   * dereferenced — the same SKU that raises here on a fresh instance returns quietly after a D1 call.
   * Both behaviours are the legacy's; neither is smoothed over.
   *
   * @returns an empty map, always
   * @throws {DomainError} when the loop runs and an option carries no option group, per the
   *   unguarded-dereference policy
   */
  getOptionsByOptionGroupIDStruct(): Record<string, Option> {
    if (this.#optionsByOptionGroupIdStruct === undefined) {
      /* [:L514] — the map that will be returned, and that nothing ever writes into. */
      this.#optionsByOptionGroupIdStruct = {};
      const returnedStruct = this.#optionsByOptionGroupIdStruct;
      for (const option of this.options) {
        /* [:L516] and [:L517] both dereference the option group; the legacy guards neither. */
        const optionGroup = this.#requireOptionGroup(option, 'model/entity/Sku.cfc:L516');
        const optionGroupId = optionGroup.optionGroupID;
        /* [:L516] — the existence check consults the map that IS returned. */
        if (!Object.hasOwn(returnedStruct, optionGroupId)) {
          /* [:L517] — and the write goes to the THIRD struct. This one line is defect D2. */
          this.#discardedOptionsByGroupIdStruct[optionGroupId] = option;
        }
      }
    }
    /* [:L521] — always the empty map. */
    return this.#optionsByOptionGroupIdStruct;
  }

  /**
   * This SKU's option identifiers as a comma-delimited string — [model/entity/Sku.cfc:L524-L533].
   *
   * ⚠️ THE STRING RETURN TYPE IS PRESERVED DELIBERATELY AND MUST NOT BE "IMPROVED" TO AN ARRAY. The
   * legacy declares `public string function` and builds the value with `listAppend` using the DEFAULT
   * delimiter, which is a comma. That shape is the one the option-resolution repository consumes and
   * the one {@link Sku.hasUniqueOptions} builds independently at [:L758-L761]; changing it here would
   * fork the two.
   *
   * Memoized per instance, reproducing the guard at [:L525]. Unlike the two struct accessors this one
   * is entirely correct: it reads `optionID` off each option and touches no option group, so it can
   * neither raise nor return the wrong thing.
   *
   * @returns the option identifiers joined by commas; the empty string when there are no options
   */
  getOptionsIDList(): string {
    if (this.#optionsIdList === undefined) {
      let optionsIdList = '';
      for (const option of this.options) {
        optionsIdList = appendToDelimitedList(optionsIdList, option.optionID);
      }
      this.#optionsIdList = optionsIdList;
    }
    return this.#optionsIdList;
  }

  /* ---------------------------------------------------------------------------------------------
   * ⚠️⚠️ THE TWO METHOD-BASED VALIDATION RULES (IR-4 — BEHAVIOUR, NOT HELPERS)
   *
   * [model/validation/Sku.json:5-8] registers BOTH on the `options` property in the SAVE context,
   * verbatim:
   *
   *     "options": [
   *         {"contexts":"save","method":"hasUniqueOptions"},
   *         {"contexts":"save","method":"hasOneOptionPerOptionGroup"}
   *     ]
   *
   * AAP §0.4.1.5 requires them "wired to the domain methods rather than to strings", and
   * `src/validation/Validator.ts` implements exactly that: its method-constraint shape carries an
   * `invoke` member typed as a function of the subject returning the unknown top type, and it AWAITS
   * that result unconditionally. So ONE signature accommodates both a synchronous and an asynchronous
   * rule, and the SPLIT BELOW IS A CROSS-FILE CONTRACT that `src/validation/rules/sku.rules.ts`
   * binds against. That module's own documentation states the same conclusion independently:
   * `hasUniqueOptions` performs a database read and is asynchronous; `hasOneOptionPerOptionGroup` is
   * pure, in-memory and synchronous.
   *
   * Both are declared `returntype="any"` in legacy rather than `boolean`, yet both only ever return
   * `true` or `false`. Tightening to `boolean` and `Promise<boolean>` is therefore the correct target
   * type under TR-1, and the tightening is recorded here rather than made silently.
   *
   * THE FULL `Sku.json` CONTRACT, for context — 8 property keys and 9 rules. Rule EVALUATION belongs
   * to `src/validation/rules/sku.rules.ts` and never to this class; only the two METHOD rules are
   * this entity's, per IR-4:
   *   [:3]  defaultFlag            delete  eq false
   *   [:4]  listPrice              save    dataType numeric, minValue 0   (NOT required)
   *   [:6]  options                save    method hasUniqueOptions
   *   [:7]  options                save    method hasOneOptionPerOptionGroup
   *   [:9]  price                  save    required, dataType numeric, minValue 0
   *   [:10] renewalPrice           save    dataType numeric, minValue 0   (NOT required)
   *   [:11] skuCode                save    required, UNIQUE
   *   [:12] transactionExistsFlag  delete  eq false
   *   [:13] physicalCounts         delete  maxCollection 0
   *
   * ⚠️ S9 — `physicalCounts` AT [:13] IS NOT A PROPERTY OF THIS ENTITY. [model/entity/Sku.cfc:L87]
   * declares `physicals`. The presence gate at [org/Hibachi/HibachiValidationService.cfc:L171]
   * SILENTLY SKIPS a rule whose property the subject does not carry, so THE GUARD NEVER FIRES IN THE
   * LEGACY SYSTEM EITHER. NO MEMBER IS ADDED HERE TO MAKE IT FIRE: renaming it to `physicals` would
   * activate a delete guard the legacy never runs and block deletes the legacy permits, which
   * Guideline 4 forbids and which would read as a bug fix. The same phantom appears in four of the
   * seven documents — against [model/entity/Product.cfc:L90], [model/entity/Sku.cfc:L87],
   * [model/entity/Brand.cfc:L71] and [model/entity/ProductType.cfc:L77] — and
   * `src/validation/rules/brand.rules.ts` already documents the pattern and makes the inertness a
   * compile-checked invariant by excluding the identifier from the entity's property-name union.
   * {@link SkuPropertyName} and {@link SkuNonPersistentPropertyName} both omit it, so that invariant
   * holds for this entity too.
   * ------------------------------------------------------------------------------------------- */

  /**
   * Whether no OTHER SKU of this product carries this SKU's exact option combination —
   * [model/entity/Sku.cfc:L756-L769].
   *
   * Legacy `@hint` at [:L755], preserved: "this method validates that this skus has a unique option
   * combination that no other sku has".
   *
   * ⚠️⚠️ THIS IS A VALIDATION RULE THAT PERFORMS A DATABASE ROUND TRIP, WHICH IS WHY IT IS `async`.
   * The chain was traced through source, not assumed:
   *   [:L763]  `getProduct().getSkusBySelectedOptions(selectedOptions=optionsList)`
   *     -> [model/entity/Product.cfc:L366-L368]
   *        `getService("productService").getProductSkusBySelectedOptions(arguments.selectedOptions, this.getProductID())`
   *     -> [model/service/ProductService.cfc:L104-L106] — a pure one-line delegation
   *     -> `SkuDAO.getSkusBySelectedOptions` — the hand-assembled conjunctive query of AAP §0.6.1
   * A reader who assumed this were a pure predicate would make it synchronous and then discover, at
   * the composition root rather than here, that it cannot be.
   *
   * ---------------------------------------------------------------------------------------------
   * ⚠️⚠️⚠️ AAP §0.6.2 — THE VALIDATION READ-BACK LOOP
   * ---------------------------------------------------------------------------------------------
   * AAP §0.6.2 calls this "the single most dangerous thing in the slice", because "a faithful-looking
   * port can produce different results with no error and no compile failure". The cycle:
   *
   *     SkuService.createSkus  [model/service/SkuService.cfc:L58-L211]
   *       -> save Sku
   *         -> validation, save context  [model/validation/Sku.json:6]
   *           -> Sku.hasUniqueOptions()  [model/entity/Sku.cfc:L763]
   *             -> Product.getSkusBySelectedOptions()
   *               -> the option-resolution query over the SKU table and its option link table
   *                 -> BACK INTO THE SAVE
   *
   * A rule READS BACK the rows the very same operation is WRITING. Under CFML and Hibernate it
   * observes only the sibling SKUs already visible to the ORM session, so correctness depends on
   * flush-before-query behaviour and on the ORDER in which the combination batch is persisted. Under
   * `mysql2` there is NO ORM session and NO automatic flush, so — in the AAP's words — "a naive port
   * that inserts every combination and then validates, or that validates before any insert, produces
   * different results — silently".
   *
   * WHERE THE RESOLUTION LIVES, AND WHY IT IS NOT HERE. `src/adapters/mysql/UnitOfWork.ts` must make
   * each SKU's insert visible to the NEXT SKU's uniqueness read WITHIN THE SAME TRANSACTION, and the
   * proof is a combination-batch test in `test/services/SkuService.test.ts` that FAILS under either
   * naive ordering. This entity has no persistence access and must not acquire any (S2), so it cannot
   * and does not attempt to solve transaction visibility. What it CAN do is name the hazard at the
   * exact line that creates it, which is what Guideline 6 requires and what this block is.
   *
   * The enumeration order of the odometer at [model/service/SkuService.cfc:L58-L211] is part of the
   * same story: it determines the order in which uniqueness validation observes its siblings, which
   * is why AAP §0.6.7.8 requires that engine be ported verbatim.
   *
   * ---------------------------------------------------------------------------------------------
   * ⚠️ TODO(parity) AAP §0.6.2 / §0.6.1.3 T5 — DEFECT D19, CARRIED NOT REPAIRED
   * ---------------------------------------------------------------------------------------------
   * FOR A SKU WITH ZERO OPTIONS, `optionsList` is the empty string. AAP §0.6.1.3 T5 establishes that
   * an empty selection is a LEGAL, MEANINGFUL input which makes the query degenerate to "all
   * option-bearing SKUs of this product". The guard at [:L764] can then only pass when the product has
   * NO option-bearing SKUs at all.
   *
   * ⇒ AN OPTION-LESS DEFAULT SKU ON A PRODUCT THAT ALREADY HAS OPTION-BEARING SKUS FAILS THIS RULE.
   *
   * NO ZERO-OPTION EARLY RETURN IS ADDED. That would be a silent repair, and it would also break the
   * degenerate form two other callers depend on — `Product.getSkuBySelectedOptions` and this very
   * method — since T5 states both rely on it.
   *
   * ---------------------------------------------------------------------------------------------
   * THE THREE SHAPE DECISIONS, EACH OF WHICH WOULD SILENTLY CHANGE RESULTS IF MADE DIFFERENTLY
   * ---------------------------------------------------------------------------------------------
   *   1. `optionsList` IS A COMMA-DELIMITED STRING, built in `getOptions()` iteration order, NOT
   *      SORTED and NOT DE-DUPLICATED. Sorting would change nothing for a set-membership query but
   *      would diverge from the legacy string; de-duplicating WOULD change results, because AAP
   *      §0.6.1.3 T1 requires "one existence clause per list element, duplicates included" — a
   *      `GROUP BY … HAVING COUNT` rewrite diverges exactly when the list contains duplicates.
   *   2. THE GUARD IS REPRODUCED LITERALLY as "no results, OR exactly one result which is this SKU".
   *      Under `noUncheckedIndexedAccess` the first element is `Sku | undefined`, so it is narrowed
   *      explicitly rather than asserted — S1 forbids the assertion, and the narrowing is free here
   *      because the length has already been tested.
   *   3. THE LOOKUP IS A PARAMETER, NOT A REACH THROUGH `this.product`. See
   *      {@link SkusBySelectedOptionsLookup} for the two structural reasons. In particular this entity
   *      never imports from `adapters/` or `services/` (S3, S4).
   *
   * @param lookup resolves the SKUs of this SKU's product carrying a given option combination
   * @returns `true` when the combination is unique to this SKU, subject to D19
   */
  async hasUniqueOptions(lookup: SkusBySelectedOptionsLookup): Promise<boolean> {
    /*
     * [:L757-L761] — built independently of {@link Sku.getOptionsIDList} because the legacy builds it
     * independently too, with its own local accumulator and no memoization. Sharing the memoized
     * accessor would be a behavioural change on any SKU whose options were mutated between calls.
     */
    let optionsList = '';
    for (const option of this.options) {
      optionsList = appendToDelimitedList(optionsList, option.optionID);
    }

    /* [:L763] — the database round trip. */
    const skus = await lookup.getSkusBySelectedOptions(optionsList);

    /* [:L764] — `!arrayLen(skus)`. */
    if (skus.length === 0) {
      return true;
    }

    /*
     * [:L764] — `arrayLen(skus) == 1 && skus[1].getSkuID() == getSkuID()`. CFML arrays are 1-based, so
     * the legacy `skus[1]` is this `skus[0]`.
     */
    if (skus.length === 1) {
      const onlyMatch = skus[0];
      if (onlyMatch !== undefined && onlyMatch.skuID === this.skuID) {
        return true;
      }
    }

    /* [:L768]. */
    return false;
  }

  /**
   * Whether this SKU holds at most one option per option group — [model/entity/Sku.cfc:L772-L784].
   *
   * PURE, IN-MEMORY AND SYNCHRONOUS. It walks the options and returns on the first repeated option
   * group identifier; it touches no repository, no port and no collaborator, which is why it takes no
   * parameter. Contrast {@link Sku.hasUniqueOptions}, its registered sibling, which is asynchronous —
   * the two rules sit on the same property in the same context and differ in exactly this respect.
   *
   * ⚠️ ITS `@hint` AT [:L771] IS A COPY-PASTE DUPLICATE of the one above `hasUniqueOptions` and
   * WRONGLY DESCRIBES UNIQUE OPTIONS rather than one-per-group. Preserved verbatim as legacy wrote it,
   * because the comment is part of what the source says, and flagged here so a reader does not trust
   * it: legacy hint, [:L771], "this method validates that this skus has a unique option combination
   * that no other sku has". It is wrong. The method name and the body are authoritative.
   *
   * IDIOM CHANGE, PERMITTED AND TAKEN. The legacy accumulates a delimited string and tests membership
   * with `listFind`; this uses a set with an early return. The Minimal Change Clause (AAP §0.8.1)
   * expressly licenses idiomatic TypeScript — "it does not mean preserving CFML idioms in TypeScript"
   * — and the observable outcome is identical, including the EARLY EXIT ON THE FIRST REPEAT, which is
   * preserved because it determines which option group a caller would find in a partially built SKU.
   *
   * ⚠️ ONE GENUINE BEHAVIOURAL DIFFERENCE, RECORDED RATHER THAN HIDDEN. CFML `listFind` is
   * CASE-INSENSITIVE; a set of strings compares case-sensitively. It cannot matter for the values
   * involved — these are 32-character lower-case hexadecimal identifiers generated by
   * `createSlatwallUUID()` (IR-6) — but the difference is real, and `src/validation/Validator.ts`
   * records the same observation from its side, placing responsibility for it in the ported method
   * rather than the engine. Normalising case here would be inventing a transformation the legacy
   * identifiers never need (S9).
   *
   * @returns `true` when every option belongs to a distinct option group, or when there are none
   * @throws {DomainError} when an option carries no option group, per the unguarded-dereference
   *   policy — [:L776] and [:L779] both dereference it without a guard
   */
  hasOneOptionPerOptionGroup(): boolean {
    const seenOptionGroupIds = new Set<string>();
    for (const option of this.options) {
      const optionGroupId = this.#requireOptionGroup(
        option,
        'model/entity/Sku.cfc:L776',
      ).optionGroupID;
      /* [:L776-L777] — `false` on the FIRST repeat, before any further option is examined. */
      if (seenOptionGroupIds.has(optionGroupId)) {
        return false;
      }
      /* [:L779] — otherwise record it and continue. */
      seenOptionGroupIds.add(optionGroupId);
    }
    /* [:L783]. */
    return true;
  }

  /* ---------------------------------------------------------------------------------------------
   * BASE PRODUCT TYPE AND SKU DEFINITION
   * ------------------------------------------------------------------------------------------- */

  /**
   * This SKU's base product type, delegated to its product — [model/entity/Sku.cfc:L356-L358], whose
   * body is `return getProduct().getBaseProductType();`.
   *
   * ⚠️⚠️ THE RETURN TYPE MUST NOT BE NARROWED TO THE THREE-MEMBER UNION. See
   * {@link SkuBaseProductTypeCode} for the full argument; in one sentence, narrowing would let the
   * compiler prove the fallthrough arm of `SkuService.createSkus` unreachable and delete the legacy
   * throw at [model/service/SkuService.cfc:L204].
   *
   * ⚠️ IT IS ASYNCHRONOUS BECAUSE THE DELEGATION CAN REACH THE DATABASE.
   * [model/entity/ProductType.cfc:L110-L115] returns the stored system code when one is present and
   * otherwise fetches the ROOT product type of the hierarchy through a service call. `Product.ts`
   * exposes the same member asynchronously for exactly this reason, and this member mirrors it —
   * which in turn makes {@link Sku.getSkuDefinition} asynchronous, since it branches on this value.
   *
   * `undefined` is admitted rather than substituted, because the product may be absent — the SKU is
   * assembled before the association in three of the four creation paths — and because the resolved
   * product type may itself carry no system code, which is the very condition the fallback exists to
   * handle. The legacy would raise on the first of those; this returns `undefined` instead, so that a
   * caller branching on the value gets a value to branch on rather than an exception, and
   * {@link Sku.getSkuDefinition}'s three-way comparison then behaves exactly as the legacy's does when
   * the code matches none of the three: it leaves the definition empty.
   *
   * @param rootProductTypeResolver resolves a product type by identifier, for the fallback arm
   * @returns the base product type code, unnarrowed, or `undefined` when none can be resolved
   */
  async getBaseProductType(
    rootProductTypeResolver: SkuProductTypeRootResolver,
  ): Promise<SkuBaseProductTypeCode | undefined> {
    const product = this.product;
    if (product === undefined) {
      return undefined;
    }
    return product.getBaseProductType(rootProductTypeResolver);
  }

  /**
   * A human-readable definition of what distinguishes this SKU — [model/entity/Sku.cfc:L574-L590].
   *
   * The legacy body, verbatim, because four of its details are easy to lose:
   *
   *     if(!structKeyExists(variables, "skuDefinition")) {
   *         variables.skuDefinition = "";
   *         if(getBaseProductType() eq "contentAccess") {
   *
   *         } else if (getBaseProductType() eq "merchandise") {
   *             for(var option in getOptions()) {
   *                 variables.skuDefinition = listAppend(variables.skuDefinition, " #option.getOptionGroup().getOptionGroupName()#: #option.getOptionName()#", ",");
   *             }
   *             trim(variables.skuDefinition);
   *         } else if (getBaseProductType() eq "subscription") {
   *             variables.skuDefinition = "#rbKey('entity.subscriptionTerm')#: #getSubscriptionTerm().getSubscriptionTermName()#";
   *         }
   *     }
   *     return variables.skuDefinition;
   *
   * ⚠️ DETAIL 1 — THE `contentAccess` ARM HAS A DELIBERATELY EMPTY BODY, and it is preserved as an
   * explicit empty branch rather than collapsed away. Collapsing it would hide a real legacy decision:
   * a content-access SKU is defined by its content, not by options or a term, so its definition is
   * intentionally the empty string. `src/domain/product/ProductType.ts` records the same finding from
   * its side, noting that this member "has no fallthrough arm at all and leaves its result as the
   * empty string" — in contrast to `createSkus`, which throws. The two legacy consumers of a base
   * product type treat the unrecognised case DIFFERENTLY and must not be aligned.
   *
   * ⚠️ DETAIL 2 — EACH MERCHANDISE SEGMENT CARRIES A LEADING SPACE, and the join delimiter is a BARE
   * COMMA. [:L581] appends the literal `" #group#: #name#"` with `","`. Two options therefore yield
   * `" A: red, B: large"` — a leading space at the very start of the string, and exactly one space
   * after each comma, arising from the segment rather than the delimiter. Reproduced character for
   * character.
   *
   * ⚠️ DETAIL 3 — TODO(parity) [model/entity/Sku.cfc:L583] — THE `trim()` IS A DISCARDED COMPUTATION
   * AND IS **NOT** APPLIED HERE. `trim(variables.skuDefinition);` is a bare expression with NO
   * ASSIGNMENT, and CFML `trim` is not in-place, so THE TRIM NEVER TAKES EFFECT and the leading space
   * survives into the returned value. Applying it would change the observable string — which is
   * precisely the kind of silent, well-intentioned repair Guideline 4 forbids.
   *
   * ⚠️ DETAIL 4 — THE LEGACY CALLS `getBaseProductType()` UP TO THREE TIMES, at [:L577], [:L579] and
   * [:L584], each of which can reach the database through the fallback arm. This resolves it ONCE.
   * That is an idiom change the Minimal Change Clause permits, and it cannot change the outcome: the
   * value is a stored system code that nothing in this method mutates, so all three legacy calls
   * necessarily agree.
   *
   * COMPARISON USES THE RUNTIME GUARD from `../BaseProductType` rather than bare string equality, so
   * the three discriminator names are checked against the single authoritative declaration instead of
   * being retyped here (S9, IR-7). The literal system codes are seeded at
   * [config/dbdata/SlatwallProductType.xml.cfm:L13-L15] and belong to that module. An unrecognised
   * code falls through all three arms and leaves the result empty, exactly as the legacy does.
   *
   * Memoized per instance, reproducing [:L575] — and the EMPTY STRING IS A CACHED VALUE, since the
   * legacy guard tests key existence rather than truthiness.
   *
   * @param rootProductTypeResolver forwarded to {@link Sku.getBaseProductType}
   * @param subscriptionTermLabel the resolved label for the subscription arm, defaulting to the raw
   *   resource-bundle key {@link SUBSCRIPTION_TERM_RESOURCE_BUNDLE_KEY} — see that constant for why a
   *   key rather than an invented translation
   * @returns the definition, possibly the empty string
   * @throws {DomainError} when a merchandise SKU holds an option with no option group, per the
   *   unguarded-dereference policy — [:L581] dereferences it without a guard
   */
  async getSkuDefinition(
    rootProductTypeResolver: SkuProductTypeRootResolver,
    subscriptionTermLabel: string = SUBSCRIPTION_TERM_RESOURCE_BUNDLE_KEY,
  ): Promise<string> {
    if (this.#skuDefinition !== undefined) {
      return this.#skuDefinition;
    }

    /* [:L576] — the result starts empty, and for a content-access SKU it stays that way. */
    let skuDefinition = '';
    const baseProductType = await this.getBaseProductType(rootProductTypeResolver);

    /*
     * The runtime recognition gate. An UNRECOGNISED code matches none of the three legacy arms and
     * leaves the definition empty — the `if` reproduces that outcome directly, and the exhaustive
     * switch inside it is what lets the compiler check the three arms without narrowing the value's
     * own type (see {@link SkuBaseProductTypeCode}). The guard is the reason no cast is needed.
     */
    if (isBaseProductType(baseProductType)) {
      switch (baseProductType) {
        case 'contentAccess':
          /*
           * [:L577-L578] — DELIBERATELY EMPTY, preserved as an explicit no-op arm. The definition of
           * a content-access SKU is the empty string. Do not collapse this branch: it is behaviour,
           * and removing it would erase the distinction between "no arm matched" and "the
           * content-access arm matched and chose to say nothing".
           */
          skuDefinition = '';
          break;

        case 'merchandise':
          /* [:L580-L582]. */
          for (const option of this.options) {
            const optionGroupName =
              this.#requireOptionGroup(option, 'model/entity/Sku.cfc:L581').optionGroupName ?? '';
            skuDefinition = appendToDelimitedList(
              skuDefinition,
              ` ${optionGroupName}: ${option.optionName ?? ''}`,
              SKU_DEFINITION_SEGMENT_DELIMITER,
            );
          }
          /*
           * [:L583] is `trim(variables.skuDefinition);` — a bare expression whose result is thrown
           * away. NOT REPRODUCED AS A TRIM, deliberately. TODO(parity) [model/entity/Sku.cfc:L583] —
           * detail 3 above. The leading space of the first segment is part of the returned value.
           */
          break;

        case 'subscription':
          /*
           * [:L585]. TODO(boundary) [model/entity/Sku.cfc:L585] — the term name is read through
           * {@link SubscriptionTermRef}, the one member by which that shape exceeds the real
           * subscription-term port, and the label is a resource-bundle key awaiting resolution. The
           * legacy dereferences the term without a guard; an absent term yields an empty name here
           * rather than raising, because the arm is already boundary-flagged and raising would
           * attribute a failure to this entity that in fact belongs to the unported subscription
           * domain.
           */
          skuDefinition = `${subscriptionTermLabel}: ${
            this.subscriptionTerm?.subscriptionTermName ?? ''
          }`;
          break;
      }
    }

    this.#skuDefinition = skuDefinition;
    return skuDefinition;
  }

  /* ---------------------------------------------------------------------------------------------
   * IMAGE MEMBERS — every one of them behind the image port
   *
   * Legacy origins [model/entity/Sku.cfc:L131-L227]. Four of the eight are REQUIRED by declared
   * consumers rather than optional: `src/domain/product/Product.ts` exposes nine default-SKU
   * delegating guards — the ported form of [model/entity/Product.cfc:L556] and following — and four of
   * them call through to `getImagePath`, `getImage`, `getResizedImagePath` and `getImageExistsFlag`.
   * `processImageUpload` at [model/service/SkuService.cfc:L211] calls `getImagePath` as well.
   *
   * ⚠️ RECORDED ASYMMETRY (S9): `Product.ts` ports a `getImageDirectory` member and THIS ENTITY HAS
   * NO SUCH COUNTERPART. [model/entity/Sku.cfc] declares `getImagePath` at [:L145] and
   * `generateImageFileName` at [:L131] and nothing that resolves a directory. None is invented here;
   * S8 mismatch M-ii records what that costs.
   * ------------------------------------------------------------------------------------------- */

  /**
   * The file name this SKU's default image should carry — [model/entity/Sku.cfc:L131-L139].
   *
   * The legacy body, verbatim:
   *
   *     var optionString = "";
   *     for(var option in getOptions()){
   *         if(option.getOptionGroup().getImageGroupFlag()){
   *             optionString &= getProduct().setting('productImageOptionCodeDelimiter') & reReplaceNoCase(option.getOptionCode(), "[^a-z0-9\-\_]","","all");
   *         }
   *     }
   *     return reReplaceNoCase(getProduct().getProductCode(), "[^a-z0-9\-\_]","","all") & optionString & ".#getProduct().setting('productImageDefaultExtension')#";
   *
   * FOUR DETAILS THAT DECIDE CORRECTNESS:
   *   1. ONLY OPTIONS WHOSE GROUP IS FLAGGED AS AN IMAGE GROUP CONTRIBUTE — the `getImageGroupFlag()`
   *      test at [:L134]. `src/domain/option/OptionGroup.ts` carries that flag as a boolean defaulting
   *      to false, matching [model/entity/OptionGroup.cfc:L57], so an unflagged group contributes
   *      nothing.
   *   2. THE DELIMITER PRECEDES EACH CONTRIBUTING OPTION CODE — `delimiter & code`, not
   *      `code & delimiter` — so a product code of `SHIRT` with two contributing options yields
   *      `SHIRT-RED-LARGE` for a hyphen delimiter, with no trailing delimiter before the extension.
   *      This is string concatenation, NOT CFML `listAppend`, so {@link appendToDelimitedList} is
   *      deliberately not used here.
   *   3. BOTH SETTINGS ARE READ THROUGH THE PRODUCT, `getProduct().setting(...)` at [:L135] and
   *      [:L138], NOT through this SKU. The resolution context passed below records that, because a
   *      setting's effective value can differ per entity.
   *   4. THE EXTENSION IS PREFIXED BY A LITERAL DOT at [:L138], separate from the setting value.
   *
   * See {@link stripDisallowedImageFileNameCharacters} for why the case-insensitive flag on the
   * sanitising expression is load-bearing.
   *
   * @param settings resolves the two product-scoped image settings
   * @returns the composed file name
   * @throws {DomainError} when this SKU has no product, since [:L135] and [:L138] dereference it
   *   without a guard, or when a contributing option carries no option group — per the
   *   unguarded-dereference policy
   */
  generateImageFileName(settings: SkuSettingResolver): string {
    const product = this.#requireProduct('model/entity/Sku.cfc:L135');
    const productContext: SkuSettingResolutionContext = {
      entityName: 'Product',
      entityId: product.productID,
    };

    /* [:L132-L137]. */
    let optionString = '';
    for (const option of this.options) {
      const optionGroup = this.#requireOptionGroup(option, 'model/entity/Sku.cfc:L134');
      if (optionGroup.imageGroupFlag) {
        optionString +=
          settings.setting('productImageOptionCodeDelimiter', productContext) +
          stripDisallowedImageFileNameCharacters(option.optionCode ?? '');
      }
    }

    /* [:L138]. */
    const sanitisedProductCode = stripDisallowedImageFileNameCharacters(product.productCode ?? '');
    const extension = settings.setting('productImageDefaultExtension', productContext);
    return `${sanitisedProductCode}${optionString}.${extension}`;
  }

  /**
   * The extension of this SKU's image file — [model/entity/Sku.cfc:L141-L143], whose body is
   * `return listLast(getImageFile(), ".");`.
   *
   * ⚠️ CFML LIST SEMANTICS, REPRODUCED RATHER THAN APPROXIMATED. A CFML list IGNORES EMPTY ELEMENTS,
   * so `listLast("photo.", ".")` is `"photo"` and NOT the empty string, and `listLast("photo", ".")`
   * is `"photo"` — a name with no dot yields the whole name as its "extension". A naive
   * `split('.').pop()` gets the first of those two cases wrong. The filter below is what makes it
   * faithful.
   *
   * An absent `imageFile` yields the empty string rather than raising: this is a SCALAR read of an
   * optional column, which the unguarded-dereference policy treats differently from a relationship
   * dereference.
   *
   * COSMETIC LEGACY DETAIL, mentioned once: [:L141] is indented with spaces where the surrounding
   * members use tabs. It has no meaning.
   *
   * @returns the extension, or the whole file name when it contains no dot, or the empty string
   */
  getImageExtension(): string {
    const elements = (this.imageFile ?? '').split('.').filter((element) => element !== '');
    return elements.length === 0 ? '' : (elements[elements.length - 1] ?? '');
  }

  /**
   * The URL path of this SKU's default image — [model/entity/Sku.cfc:L145-L147], whose body is
   * `return "#getHibachiScope().getBaseImageURL()#/product/default/#getImageFile()#";`.
   *
   * ⚠️ THE BASE URL IS A FRAMEWORK REQUEST-SCOPE READ, which is why the whole member sits behind the
   * image port rather than being computed here: `getHibachiScope()` is precisely the kind of
   * framework facility AAP §0.6.3.1 classifies as an artefact to exclude, and the port's own path
   * segment constant carries the `/product/default/` literal. This entity contributes the file name
   * and nothing else.
   *
   * ASYNCHRONOUS because the port is. An absent `imageFile` is passed as the empty string, a scalar
   * read per the policy note on {@link Sku.getImageExtension} — which also keeps
   * {@link Sku.getImageExistsFlag} answerable, since a path with no file name does not exist and
   * `false` is the answer every caller is written to handle. The CFML runtime is not reproducible in
   * this environment (AAP §0.8.4.1), and engines differ on whether interpolating a null return value
   * raises or yields the empty string; the permissive reading is chosen and disclosed here rather
   * than a failure being invented.
   *
   * @param imagePaths resolves a stored file name to a path
   * @returns the image path
   */
  async getImagePath(imagePaths: SkuImagePathResolver): Promise<string> {
    return imagePaths.getImagePath(this.imageFile ?? '');
  }

  /**
   * Rendered markup for this SKU's image — [model/entity/Sku.cfc:L149-L151], whose body is
   * `return getResizedImage(argumentcollection=arguments);`.
   *
   * A PURE DELEGATION, preserved as one. It is declared rather than collapsed into its target because
   * two real consumers call it by this name: `getAdminIcon` at [:L324] — itself an excluded member —
   * and one of `Product.ts`'s nine default-SKU delegating guards.
   *
   * @param collaborators the four collaborators {@link Sku.getResizedImage} needs
   * @param options the caller's size, dimension, missing-image and alternate-text choices
   * @returns the rendered markup
   */
  async getImage(
    collaborators: SkuResizedImageCollaborators,
    options: SkuResizedImageOptions = {},
  ): Promise<string> {
    return this.getResizedImage(collaborators, options);
  }

  /**
   * Rendered markup for this SKU's image at a requested size — [model/entity/Sku.cfc:L153-L190].
   *
   * FOUR STEPS, IN THE LEGACY ORDER, because each depends on the last:
   *   [:L156] resolve the image path;
   *   [:L159-L161] default the alternate text from a setting, ONLY when the caller supplied none AND
   *                the setting is non-empty, expanding it as a template;
   *   [:L164-L166] default the missing-image path from a setting, only when the caller supplied none;
   *   [:L169-L187] apply the deprecated size mapping, then delegate at [:L189].
   *
   * ⚠️ THE DEPRECATED SIZE GATE HAS FOUR CONJUNCTS AND ALL FOUR MATTER: a size must have been
   * requested, THE PRODUCT MUST BE PRESENT — `!isNull(getProduct())` — and NEITHER an explicit width
   * NOR an explicit height may have been supplied. Explicit dimensions therefore win outright, and a
   * SKU with no product silently skips the mapping. In that case `size` REMAINS IN THE DELEGATED
   * REQUEST, because the `structDelete` at [:L172] only runs inside the branch — a detail that is easy
   * to lose and that the request assembly below preserves.
   *
   * ⚠️ AN UNRECOGNISED SIZE PASSES THROUGH UNCHANGED HERE. [:L177-L183] is an `if / else if / else if`
   * chain with NO FINAL `else`, so a size of `xl` is lower-cased and then interpolated verbatim into
   * the setting key. Its sibling {@link Sku.getResizedImagePath} behaves DIFFERENTLY at [:L209-L211],
   * forcing an unrecognised size to `Small`. The two are not aligned; see
   * {@link DEPRECATED_IMAGE_SIZE_FALLBACK}.
   *
   * ⚠️ THE POSITIONAL ARM OF THE GATE IS UNREPRESENTABLE AND COLLAPSES INTO THE NAMED ONE. [:L169]
   * also accepts a size passed as the FIRST POSITIONAL ARGUMENT, `structKeyExists(arguments, 1)`,
   * reading it at [:L174]. CFML exposes the argument collection as a struct keyed by both name and
   * position; TypeScript has no equivalent, and the two arms compute an identical `thisSize`. Both
   * therefore map onto the single named `size` option, which loses nothing observable.
   *
   * ⚠️ THE DIMENSION SETTINGS ARRIVE AS STRINGS AND ARE CONVERTED. [:L184-L185] assign the raw setting
   * values, which CFML coerces numerically downstream; the port's request declares numbers, so they
   * are converted here. A non-numeric setting therefore reaches the port as `NaN` where CFML would
   * have failed inside the out-of-scope image service. The divergence is in that consumer's failure
   * mode, not in this entity's behaviour, and these keys are pixel dimensions by definition.
   *
   * @param collaborators the renderer, the path resolver, the setting resolver and the template
   *   expander
   * @param options the caller's choices; every member is optional because the legacy branches on the
   *   presence of each
   * @returns the rendered markup
   */
  async getResizedImage(
    collaborators: SkuResizedImageCollaborators,
    options: SkuResizedImageOptions = {},
  ): Promise<string> {
    /* [:L156]. */
    const imagePath = await this.getImagePath(collaborators.imagePaths);
    const skuContext: SkuSettingResolutionContext = { entityName: 'Sku', entityId: this.skuID };

    /* [:L159-L161] — only when absent AND the setting has content. */
    let alt = options.alt;
    if (alt === undefined) {
      const imageAltString = collaborators.settings.setting('imageAltString', skuContext);
      if (imageAltString.length > 0) {
        alt = collaborators.expandStringTemplate(imageAltString);
      }
    }

    /* [:L164-L166]. */
    const missingImagePath =
      options.missingImagePath ??
      collaborators.settings.setting('imageMissingImagePath', skuContext);

    const dimensions = this.#applyDeprecatedImageSizeLogic(collaborators.settings, options, false);

    const request: {
      imagePath: string;
      missingImagePath: string;
      size?: string;
      width?: number;
      height?: number;
      resizeMethod?: string;
      alt?: string;
    } = { imagePath, missingImagePath };
    if (dimensions.size !== undefined) {
      request.size = dimensions.size;
    }
    if (dimensions.width !== undefined) {
      request.width = dimensions.width;
    }
    if (dimensions.height !== undefined) {
      request.height = dimensions.height;
    }
    if (dimensions.resizeMethod !== undefined) {
      request.resizeMethod = dimensions.resizeMethod;
    }
    if (alt !== undefined) {
      request.alt = alt;
    }

    /* [:L189] — S8 mismatch M-iii: no declared port owns this capability. */
    return collaborators.renderer.getResizedImage(request);
  }

  /**
   * The path of this SKU's image at a requested size — [model/entity/Sku.cfc:L192-L219].
   *
   * The path-returning sibling of {@link Sku.getResizedImage}, and DELIBERATELY NOT UNIFIED WITH IT.
   * The two differ in three observable ways, every one of them verified against the source:
   *
   *   |                        | getResizedImage [:L153]        | getResizedImagePath [:L192]     |
   *   | size gate              | named OR positional [:L169]    | named only [:L203]              |
   *   | unrecognised size      | passes through UNCHANGED       | forced to `Small` [:L209-L211]  |
   *   | alternate text         | defaulted from a setting       | not handled at all              |
   *
   * Aligning them would be exactly the kind of tidy-looking change that alters behaviour, so each is
   * ported on its own terms. Everything else is shared: both default the missing-image path from the
   * same setting, both read the two product-scoped dimension settings, and both request the same
   * resize method.
   *
   * Consumed by the Google product feed's `g:image_link` field through
   * `src/integrations/google/ProductFeedBuilder.ts`, and by one of `Product.ts`'s nine default-SKU
   * delegating guards.
   *
   * @param imagePaths resolves the base path and the resized path
   * @param settings resolves the missing-image and dimension settings
   * @param options the caller's size and dimension choices
   * @returns the resized image path
   */
  async getResizedImagePath(
    imagePaths: SkuImagePathResolver,
    settings: SkuSettingResolver,
    options: SkuResizedImageOptions = {},
  ): Promise<string> {
    /* [:L195]. */
    const imagePath = await this.getImagePath(imagePaths);

    /* [:L198-L200]. */
    const missingImagePath =
      options.missingImagePath ??
      settings.setting('imageMissingImagePath', { entityName: 'Sku', entityId: this.skuID });

    const dimensions = this.#applyDeprecatedImageSizeLogic(settings, options, true);

    const request: {
      imagePath: string;
      missingImagePath: string;
      size?: string;
      width?: number;
      height?: number;
      resizeMethod?: string;
    } = { imagePath, missingImagePath };
    if (dimensions.size !== undefined) {
      request.size = dimensions.size;
    }
    if (dimensions.width !== undefined) {
      request.width = dimensions.width;
    }
    if (dimensions.height !== undefined) {
      request.height = dimensions.height;
    }
    if (dimensions.resizeMethod !== undefined) {
      request.resizeMethod = dimensions.resizeMethod;
    }

    /* [:L218]. */
    return imagePaths.getResizedImagePath(request);
  }

  /**
   * The DEPRECATED SIZE LOGIC shared by the two resized-image members — [model/entity/Sku.cfc:L168-L187]
   * and [:L202-L216].
   *
   * @deprecated The legacy marks both blocks `// DEPRECATED SIZE LOGIC` in the source. The one-letter
   *   size aliases and the setting-derived dimensions they imply are the deprecated part; the members
   *   that use them are not. Carried because they are behaviour.
   *
   * Extracted because the two blocks are identical apart from the single documented divergence, and
   * the divergence is expressed as one parameter rather than by duplicating twenty lines — which keeps
   * the difference VISIBLE at the one place it exists instead of buried in two near-copies.
   *
   * @param settings resolves the two product-scoped dimension settings
   * @param options the caller's size and explicit dimensions
   * @param forceRecognisedSize `true` for the path member, whose [:L209-L211] `else` forces an
   *   unrecognised size to {@link DEPRECATED_IMAGE_SIZE_FALLBACK}; `false` for the markup member,
   *   whose [:L177-L183] chain has no `else` and lets it through unchanged
   * @returns the size, width, height and resize method to place in the delegated request; `size` is
   *   returned only when the mapping did NOT run, reproducing the `structDelete` at [:L172] and [:L215]
   */
  #applyDeprecatedImageSizeLogic(
    settings: SkuSettingResolver,
    options: SkuResizedImageOptions,
    forceRecognisedSize: boolean,
  ): { size?: string; width?: number; height?: number; resizeMethod?: string } {
    const product = this.product;
    const requestedSize = options.size;

    /*
     * The four-conjunct gate of [:L169] and [:L203]. Explicit dimensions win outright, and a SKU with
     * no product skips the mapping entirely — in which case the requested size stays in the request.
     */
    const mappingApplies =
      requestedSize !== undefined &&
      product !== undefined &&
      options.width === undefined &&
      options.height === undefined;

    if (!mappingApplies) {
      const untouched: { size?: string; width?: number; height?: number } = {};
      if (requestedSize !== undefined) {
        untouched.size = requestedSize;
      }
      if (options.width !== undefined) {
        untouched.width = options.width;
      }
      if (options.height !== undefined) {
        untouched.height = options.height;
      }
      return untouched;
    }

    /* [:L171] and [:L204] both lower-case before comparing. */
    const loweredSize = requestedSize.toLowerCase();
    const aliasedSize = DEPRECATED_IMAGE_SIZE_ALIASES[loweredSize];
    const mappedSize =
      aliasedSize ?? (forceRecognisedSize ? DEPRECATED_IMAGE_SIZE_FALLBACK : loweredSize);

    const productContext: SkuSettingResolutionContext = {
      entityName: 'Product',
      entityId: product.productID,
    };

    /* [:L184-L186] and [:L212-L214]. `size` is intentionally absent from the result. */
    return {
      width: Number(settings.setting(`productImage${mappedSize}Width`, productContext)),
      height: Number(settings.setting(`productImage${mappedSize}Height`, productContext)),
      resizeMethod: SKU_RESIZE_METHOD_SCALE_BEST,
    };
  }

  /**
   * Whether this SKU's image file actually exists — [model/entity/Sku.cfc:L221-L227], whose body is
   * `if( fileExists(expandPath(getImagePath())) ) { return true; } else { return false; }`.
   *
   * A FILESYSTEM PROBE, hence the port and hence the promise. `expandPath` resolves a web path against
   * the application root, which is a deployment concern the port owns; this entity supplies the path
   * and reads the answer.
   *
   * Consumed by one of `Product.ts`'s nine default-SKU delegating guards.
   *
   * @param imagePaths resolves the path and probes for it
   * @returns `true` when the file exists
   */
  async getImageExistsFlag(imagePaths: SkuImagePathResolver): Promise<boolean> {
    const imagePath = await this.getImagePath(imagePaths);
    return imagePaths.getImageExistsFlag(imagePath);
  }

  /**
   * This SKU's memoized image file name — [model/entity/Sku.cfc:L794-L799].
   *
   * The legacy declares it under `// START: Overridden Implicit Getters`, because it shadows the
   * accessor the ORM would have synthesized for a property that does not exist, and its body simply
   * memoizes {@link Sku.generateImageFileName}. Per-instance cache only (M7).
   *
   * @param settings forwarded to {@link Sku.generateImageFileName}
   * @returns the composed file name
   * @throws {DomainError} propagated from {@link Sku.generateImageFileName}
   */
  getImageName(settings: SkuSettingResolver): string {
    if (this.#imageName === undefined) {
      this.#imageName = this.generateImageFileName(settings);
    }
    return this.#imageName;
  }

  /* ---------------------------------------------------------------------------------------------
   * THE TWO DELETE-GUARD FLAGS — both MUST be exposed
   *
   * [model/validation/Sku.json:3] and [:12] declare delete-context rules requiring each to equal
   * `false`. Dropping either member would not fail a compile; it would silently permit deletes the
   * legacy system blocks, which is precisely the class of change AAP §0.6.7's preserve-and-annotate
   * rule exists to prevent.
   * ------------------------------------------------------------------------------------------- */

  /**
   * Whether this SKU is its product's default — [model/entity/Sku.cfc:L442-L447], whose body is
   * `if(getProduct().getDefaultSku().getSkuID() == getSkuID()) { return true; } return false;`.
   *
   * ⚠️ THE DECLARED EXCEPTION TO THE UNGUARDED-DEREFERENCE POLICY, and the only one in this file.
   * [:L443] performs TWO unguarded dereferences in a single chain — `getProduct()` and then
   * `getDefaultSku()` — and CFML raises on either. THIS MEMBER RETURNS `false` INSTEAD, deliberately,
   * for a reason specific to it: it is a DELETE-CONTEXT VALIDATION GUARD, and a guard that raises
   * rather than answering cannot be evaluated. `src/validation/Validator.ts` reads a property value
   * through a synchronous reader and compares it; a reader that threw would abort the whole delete
   * validation rather than producing the verdict the rule asks for.
   *
   * The substantive answer is also correct, not merely convenient: a SKU whose product is unset, or
   * whose product has no default SKU, is not that product's default. `false` is the truth of the
   * matter. The DIVERGENCE — legacy raises, this returns — is what is flagged, and it is flagged
   * because Guideline 6 requires every judgment call be recorded, not because the value is in doubt.
   *
   * IDENTIFIER COMPARISON, NOT IDENTITY. [:L443] compares `getSkuID()` values, so a re-hydrated
   * instance representing the same row still reports `true`. Preserved: switching to reference
   * equality would change the answer for exactly the case the legacy handles correctly.
   *
   * SYNCHRONOUS, because [:L443] performs no query — it walks two in-memory relationships. The
   * identifier read arrives as a function because `Product.ts`'s default-SKU delegate deliberately
   * exposes no identifier accessor; see {@link DefaultSkuIdReader} and S8 mismatch M-ii.
   *
   * @param readDefaultSkuId reads the identifier of the product's default SKU
   * @returns `true` when this SKU is its product's default
   */
  getDefaultFlag(readDefaultSkuId: DefaultSkuIdReader): boolean {
    const product = this.product;
    if (product === undefined) {
      return false;
    }
    const defaultSku = product.defaultSku;
    if (defaultSku === undefined) {
      return false;
    }
    return readDefaultSkuId(defaultSku) === this.skuID;
  }

  /**
   * Whether any transaction references this SKU — [model/entity/Sku.cfc:L592-L597].
   *
   * The legacy body memoizes
   * `getService("skuService").getTransactionExistsFlag( skuID=this.getSkuID() )`.
   *
   * ⚠️ TODO(parity) [model/entity/Sku.cfc:L594] — AAP §0.4.2.2 DISCREPANCY 4, PRESERVED. The call site
   * passes `skuID` as a NAMED ARGUMENT to a service member that
   * [model/service/SkuService.cfc:L285] declares WITH NO ARGUMENTS AT ALL. CFML ignores the surplus
   * argument; TypeScript would reject it, so it is not passed. AAP §0.4.2.2 is explicit that "the
   * narrower service contract is preserved" — the underlying DAO member does accept optional
   * identifiers, and the service throws that capability away. See
   * {@link SkuTransactionExistenceChecker}.
   *
   * ASYNCHRONOUS because the underlying DAO member is the ten-way existence chain at
   * [model/dao/SkuDAO.cfc:L53-L98], which is a real query. Per-instance memoization reproduces the
   * guard at [:L593].
   *
   * @param checker answers the existence question
   * @returns `true` when a transaction references this SKU
   */
  async getTransactionExistsFlag(checker: SkuTransactionExistenceChecker): Promise<boolean> {
    if (this.#transactionExistsFlag === undefined) {
      this.#transactionExistsFlag = await checker.getTransactionExistsFlag();
    }
    return this.#transactionExistsFlag;
  }

  /* ---------------------------------------------------------------------------------------------
   * BIDIRECTIONAL HELPERS — [model/entity/Sku.cfc:L604-L637]
   * ------------------------------------------------------------------------------------------- */

  /**
   * Associates this SKU with a product, maintaining BOTH sides —
   * [model/entity/Sku.cfc:L604-L609], whose body is:
   *
   *     variables.product = arguments.product;
   *     if(isNew() or !arguments.product.hasSku( this )) {
   *         arrayAppend(arguments.product.getSkus(), this);
   *     }
   *
   * ---------------------------------------------------------------------------------------------
   * ⭐⭐ THE ORDERING COUPLING THAT THE ENTIRE SKU-CODE SEQUENCE DEPENDS ON — DO NOT BREAK IT
   * ---------------------------------------------------------------------------------------------
   * `SkuService.createSkus` composes each generated code as
   * `productCode & "-" & arrayLen(product.getSkus()) + 1`, and it does so BEFORE calling
   * `product.addSku(newSku)`. The first iteration therefore sees zero SKUs and produces `-1`, the
   * second sees one and produces `-2`, and so on.
   *
   * That works only because of three facts, all verified rather than assumed:
   *   1. `Product.getSkus()` RETURNS THE LIVE ARRAY — `src/domain/product/Product.ts` returns the
   *      field directly, with no copy and no defensive clone, exactly as
   *      [model/entity/Product.cfc:L157] returns `variables.skus`.
   *   2. `Product.addSku(sku)` IS A PURE DELEGATION to `sku.setProduct(this)`, so the append happens
   *      HERE and nowhere else.
   *   3. THE APPEND BELOW TARGETS THAT SAME LIVE ARRAY.
   *
   * ⚠️ IF ANY ONE OF THE THREE IS BROKEN — if this method appended to a copy, or if `getSkus()`
   * returned a defensive copy — EVERY GENERATED SKU WOULD COLLIDE ON `-1`, and the failure would
   * surface far away, as the `unique: true` `skuCode` rule at [model/validation/Sku.json:11] rejecting
   * the second SKU of every multi-option product. Anyone changing either module must preserve all
   * three.
   *
   * ---------------------------------------------------------------------------------------------
   * ⚠️ TODO(parity) [model/entity/Sku.cfc:L606] — THE SHORT-CIRCUIT DOUBLE-APPEND, CARRIED
   * ---------------------------------------------------------------------------------------------
   * CFML `or` short-circuits, so FOR A NEW SKU THE MEMBERSHIP TEST IS NEVER EVALUATED AND THE APPEND
   * IS UNCONDITIONAL. Calling `product.addSku(sku)` twice on the same NEW SKU therefore appends it
   * twice, which inflates the collection length and makes the next generated SKU code SKIP A NUMBER.
   * NO IDEMPOTENCY GUARD IS ADDED: reordering the disjunction or testing membership first would be a
   * silent repair, and Guideline 4 forbids it. The `||` below preserves the short-circuit exactly.
   *
   * ---------------------------------------------------------------------------------------------
   * ⚠️ S8 MISMATCH M-i — `Product.hasSku` DOES NOT EXIST
   * ---------------------------------------------------------------------------------------------
   * [:L606] calls `arguments.product.hasSku( this )`, which the ORM synthesizes from
   * `singularname="sku"`. A repository-wide search finds NO such body in [model/entity/Product.cfc],
   * and `src/domain/product/Product.ts` declares none either. The identical containment predicate is
   * therefore evaluated INLINE below, against the live collection. That is not a reimplementation of a
   * `Product` member and not a widening of another module's surface; it is the same test computed
   * locally, in the one file that needs it.
   *
   * ⚠️ UNLIKE THE REST OF THIS FILE THIS MEMBER TAKES A REQUIRED ARGUMENT and reads a foreign
   * collection. That is faithful: it is one of only two legacy members on this entity that maintain
   * both sides of a relationship, which is why the ORM-synthesized setter was overridden at all.
   *
   * @param product the product to associate
   */
  setProduct(product: Product): void {
    /* [:L605]. */
    this.product = product;
    const productSkus = product.getSkus();
    /*
     * [:L606] — the short-circuit is preserved by `||`. For a new SKU the right-hand side is never
     * evaluated, which is the double-append behaviour recorded above.
     */
    if (this.isNew() || !productSkus.includes(this)) {
      /* [:L607] — appends to the LIVE array. See the ordering coupling above. */
      productSkus.push(this);
    }
  }

  /**
   * Disassociates this SKU from a product — [model/entity/Sku.cfc:L610-L619], whose body is:
   *
   *     if(!structKeyExists(arguments, "product")) {
   *         arguments.product = variables.product;
   *     }
   *     var index = arrayFind(arguments.product.getSkus(), this);
   *     if(index > 0) {
   *         arrayDeleteAt(arguments.product.getSkus(), index);
   *     }
   *     structDelete(variables, "product");
   *
   * THREE DETAILS PRESERVED:
   *   - THE ARGUMENT DEFAULTS FROM THE CURRENT ASSOCIATION at [:L612], so `removeProduct()` with no
   *     argument detaches from whatever this SKU is currently attached to.
   *   - THE SENTINEL AT [:L615] IS CFML's, so `index > 0` becomes `!== -1`. Transliterating the
   *     comparison literally would delete the FIRST SKU of the product whenever the search missed.
   *   - THE FIELD IS CLEARED UNCONDITIONALLY at [:L618], OUTSIDE the removal guard. So a SKU that was
   *     not in the collection is still detached. `delete` is used rather than an assignment to
   *     `undefined`, because under `exactOptionalPropertyTypes` an absent key and a key holding
   *     `undefined` are different states and only the former matches `structDelete`.
   *
   * @param product the product to detach from, defaulting to the current association
   */
  removeProduct(product?: Product): void {
    /* [:L611-L613]. */
    const removeFrom = product ?? this.product;
    if (removeFrom !== undefined) {
      const productSkus = removeFrom.getSkus();
      /* [:L614-L617] — `arrayFind` returns 0 when absent; `indexOf` returns −1. */
      const index = productSkus.indexOf(this);
      if (index !== -1) {
        productSkus.splice(index, 1);
      }
    }
    /* [:L618] — unconditional, outside the guard, exactly as the legacy places it. */
    delete this.product;
  }

  /**
   * Associates this SKU with a subscription term — [model/entity/Sku.cfc:L622-L627].
   *
   * ⚠️ S8 MISMATCH M-iv — THE FAR SIDE IS NOT MAINTAINED, AND THAT IS FLAGGED RATHER THAN HIDDEN.
   * The legacy body mirrors {@link Sku.setProduct} exactly, including a second synthesized `hasSku`
   * — this time on `SubscriptionTerm` — and an append to `arguments.subscriptionTerm.getSkus()` at
   * [:L625]. `SubscriptionTerm` is out of scope (AAP §0.2.2.1, `model/**\/Subscription*.cfc`, 11
   * files) and {@link SubscriptionTermRef} exposes no collection to append to, so ONLY THE LOCAL SIDE
   * IS MAINTAINED here. Inventing a collection on the reference would be inventing surface (S9), and
   * silently dropping the member would violate TR-5.
   *
   * TODO(boundary) [model/entity/Sku.cfc:L624-L626] — the far-side append belongs to a ported
   * `SubscriptionTerm`, and the short-circuit double-append of [:L624] is the same defect as
   * [:L606] applied to that relationship.
   *
   * @param subscriptionTerm the term to associate
   */
  setSubscriptionTerm(subscriptionTerm: SubscriptionTermRef): void {
    /* [:L623]. */
    this.subscriptionTerm = subscriptionTerm;
  }

  /**
   * Disassociates this SKU from a subscription term — [model/entity/Sku.cfc:L628-L637].
   *
   * The structural twin of {@link Sku.removeProduct}: the argument defaults from the current
   * association at [:L630], the removal guard at [:L633] uses CFML's zero sentinel — translated to
   * `!== -1` wherever it applies — and the field is cleared UNCONDITIONALLY at [:L636].
   *
   * The far-side splice at [:L632-L635] is not performed, for the reason given on
   * {@link Sku.setSubscriptionTerm}. TODO(boundary) [model/entity/Sku.cfc:L632-L635]. The parameter is
   * retained even though this implementation does not read it, because the legacy signature accepts
   * one and a caller written against the legacy contract must keep compiling; it is named with a
   * leading underscore so the unused-argument rule recognises the omission as deliberate.
   *
   * @param _subscriptionTerm the term to detach from; unread, see above
   */
  removeSubscriptionTerm(_subscriptionTerm?: SubscriptionTermRef): void {
    /* [:L636] — unconditional, outside the guard the far side would have needed. */
    delete this.subscriptionTerm;
  }

  /* ---------------------------------------------------------------------------------------------
   * PRICE AND CURRENCY
   *
   * Four members are REQUIRED by `Product.ts`'s nine default-SKU delegating guards — `getPrice`,
   * `getListPrice`, `getRenewalPrice` and `getCurrencyCode`. Four are retained behind a pricing port
   * per TR-5 because the Google product feed reads two of them. Six are boundary-stubbed, because
   * every one of them reads `getCurrencyDetails()` — an EXCLUDED member — or delegates straight to an
   * out-of-scope service.
   * ------------------------------------------------------------------------------------------- */

  /**
   * This SKU's price — the explicit form of the accessor synthesized from
   * [model/entity/Sku.cfc:L56].
   *
   * Declared as a method rather than left to direct field access because `Product.ts`'s default-SKU
   * delegate requires it by name, and because the legacy is full of `getPrice()` call sites — among
   * them [model/service/ProductService.cfc:L133] and the sale-price fallback at
   * [model/entity/Sku.cfc:L550].
   *
   * @returns the price, `0` on a fresh SKU
   */
  getPrice(): number {
    return this.price;
  }

  /**
   * This SKU's list price — the explicit form of the accessor synthesized from
   * [model/entity/Sku.cfc:L55]. Required by `Product.ts`'s default-SKU delegate.
   *
   * @returns the list price, `0` on a fresh SKU
   */
  getListPrice(): number {
    return this.listPrice;
  }

  /**
   * This SKU's renewal price — the explicit form of the accessor synthesized from
   * [model/entity/Sku.cfc:L57]. Required by `Product.ts`'s default-SKU delegate, and set by the
   * subscription creation branch at [model/service/SkuService.cfc:L157].
   *
   * @returns the renewal price, `0` on a fresh SKU
   */
  getRenewalPrice(): number {
    return this.renewalPrice;
  }

  /**
   * The currency this SKU is priced in — [model/entity/Sku.cfc:L360-L365], whose body memoizes
   * `this.setting('skuCurrency')`.
   *
   * READ THROUGH THIS SKU, not through the product: [:L362] writes `this.setting(...)`, and the
   * resolution context below records that. Contrast {@link Sku.generateImageFileName}, whose two
   * setting reads go through the product — the distinction is real, because a setting's effective value
   * is resolved against the entity it is asked of.
   *
   * SYNCHRONOUS, matching both the legacy accessor and the real setting port. Per-instance
   * memoization reproduces the guard at [:L361].
   *
   * @param settings resolves the currency setting
   * @returns the currency code
   */
  getCurrencyCode(settings: SkuSettingResolver): string {
    if (this.#currencyCode === undefined) {
      this.#currencyCode = settings.setting('skuCurrency', {
        entityName: 'Sku',
        entityId: this.skuID,
      });
    }
    return this.#currencyCode;
  }

  /**
   * This SKU's sale-price detail — [model/entity/Sku.cfc:L539-L544], whose body memoizes
   * `getProduct().getSkuSalePriceDetails( getSkuID() )`.
   *
   * ⭐ ONE OF THE FOUR EXCLUDED MEMBERS RETAINED BEHIND A PORT RATHER THAN DROPPED, and the reason TR-5
   * exists: "the member is never quietly dropped from the interface". The Google product feed's
   * conditional `g:sale_price` and `g:sale_price_effective_date` fields read two of the values this
   * one feeds (AAP §0.6.4.2), so deleting it would break `ProductFeedBuilder.ts`.
   *
   * TODO(boundary) [model/entity/Sku.cfc:L541] — promotion evaluation is out of scope
   * (AAP §0.2.2.1). See {@link SkuSalePricingLookup} for why the lookup is keyed by PRODUCT rather
   * than by SKU: that is the legacy shape and the real port's shape both.
   *
   * AN UNASSOCIATED SKU YIELDS EMPTY DETAIL rather than raising, unlike the members governed by the
   * unguarded-dereference policy. The reasoning is the same as for {@link Sku.getDefaultFlag}: every
   * consumer of this value branches on the ABSENCE of each member — the three readers below all have
   * an explicit fallback — so empty detail is a well-defined answer that flows correctly through all
   * of them, and it means an unassociated SKU reports its ordinary price rather than failing a feed
   * render. The divergence is flagged here.
   *
   * @param pricing resolves sale-price detail for every SKU of a product
   * @returns this SKU's detail, possibly empty
   */
  async getSalePriceDetails(pricing: SkuSalePricingLookup): Promise<SkuSalePriceDetails> {
    if (this.#salePriceDetails === undefined) {
      const product = this.product;
      if (product === undefined) {
        this.#salePriceDetails = {};
      } else {
        const detailsBySkuId = await pricing.getSalePriceDetailsForProductSkus(product.productID);
        this.#salePriceDetails = detailsBySkuId[this.skuID] ?? {};
      }
    }
    return this.#salePriceDetails;
  }

  /**
   * This SKU's sale price, falling back to its ordinary price —
   * [model/entity/Sku.cfc:L546-L551], whose body returns the detail entry when present and
   * `getPrice()` otherwise.
   *
   * ⚠️ THE FALLBACK IS TO THE PRICE, NOT TO ZERO AND NOT TO `undefined`. That is what makes the Google
   * feed's conditional correct: `ProductFeedBuilder.ts` emits `g:sale_price` only when the SKU's price
   * EXCEEDS its sale price, and with this fallback a SKU on no promotion compares equal to itself and
   * the field is correctly omitted. Returning zero would emit a sale price of nothing for every
   * unpromoted SKU.
   *
   * @param pricing forwarded to {@link Sku.getSalePriceDetails}
   * @returns the sale price, or this SKU's price when no promotion applies
   */
  async getSalePrice(pricing: SkuSalePricingLookup): Promise<number> {
    const details = await this.getSalePriceDetails(pricing);
    return details.salePrice ?? this.getPrice();
  }

  /**
   * The kind of discount producing this SKU's sale price — [model/entity/Sku.cfc:L553-L558], which
   * returns the detail entry when present and THE EMPTY STRING otherwise.
   *
   * The empty-string fallback is the legacy's own, at [:L557], and is preserved rather than replaced
   * with `undefined`: it is a display value, and a caller interpolating it expects a string.
   *
   * @param pricing forwarded to {@link Sku.getSalePriceDetails}
   * @returns the discount type, or the empty string
   */
  async getSalePriceDiscountType(pricing: SkuSalePricingLookup): Promise<string> {
    const details = await this.getSalePriceDetails(pricing);
    return details.salePriceDiscountType ?? '';
  }

  /**
   * When this SKU's sale price stops applying — [model/entity/Sku.cfc:L560-L565], which returns the
   * detail entry when present and THE EMPTY STRING otherwise.
   *
   * ⚠️ THE RETURN TYPE ADMITS THE EMPTY STRING ALONGSIDE A DATE, because [:L564] genuinely returns a
   * string from a member whose declared property type at [:L118] is `date`. That union is faithful and
   * it is the same idiom `../base/AuditableEntity` uses for its own date accessors, so a consumer
   * meeting it here has met it before. Substituting `undefined` would be tidier and would diverge:
   * the Google feed's `g:sale_price_effective_date` interpolates this value, and an empty string
   * interpolates to nothing where `undefined` would interpolate the text of the word.
   *
   * @param pricing forwarded to {@link Sku.getSalePriceDetails}
   * @returns the expiration timestamp, or the empty string
   */
  async getSalePriceExpirationDateTime(pricing: SkuSalePricingLookup): Promise<Date | ''> {
    const details = await this.getSalePriceDetails(pricing);
    return details.salePriceExpirationDateTime ?? '';
  }

  /* ---------------------------------------------------------------------------------------------
   * BOUNDARY-STUBBED MEMBERS — declared, typed, and honest about not being implementable here
   *
   * Each reaches a service AAP §0.2.2.1 excludes outright, through a dependency this port has no
   * declared surface for. They are DECLARED rather than omitted because each has a real legacy caller
   * and TR-5 forbids quietly dropping a member; they RAISE rather than returning a plausible value
   * because a fabricated price or quantity is far more dangerous than an explicit refusal. The
   * established pattern in this subtree is the same: `Product.getProductOptionsByGroup` raises a
   * not-implemented error for its own carried defect.
   * ------------------------------------------------------------------------------------------- */

  /**
   * This SKU's price under a promotion — [model/entity/Sku.cfc:L257-L259], which delegates to
   * `promotionService.calculateSkuPriceBasedOnPromotion`.
   *
   * TODO(boundary) [model/entity/Sku.cfc:L257-L259] — `promotionService` is out of scope
   * (AAP §0.2.2.1, `model/**\/Promotion*.cfc`, 9 files). No port in the plan exposes promotion price
   * CALCULATION; the pricing port exposes resolved sale-price DETAIL, which is a different question,
   * so this cannot be satisfied by {@link SkuSalePricingLookup}.
   *
   * @param _promotion the promotion to price against; unread
   * @returns never
   * @throws {NotImplementedError} always
   */
  getPriceByPromotion(_promotion: object): never {
    throw new NotImplementedError(
      'Sku.getPriceByPromotion',
      'model/entity/Sku.cfc:L257-L259 delegates to promotionService, which AAP 0.2.2.1 excludes, ' +
        'and no port in the plan exposes promotion price calculation',
      { context: { skuID: this.skuID, locator: 'model/entity/Sku.cfc:L257-L259' } },
    );
  }

  /**
   * This SKU's price under a price group — [model/entity/Sku.cfc:L261-L263], which delegates to
   * `priceGroupService.calculateSkuPriceBasedOnPriceGroup`.
   *
   * TODO(boundary) [model/entity/Sku.cfc:L261-L263] — `priceGroupService` is out of scope
   * (AAP §0.2.2.1, `model/**\/PriceGroup*.cfc`, 4 files).
   *
   * @param _priceGroup the price group to price against; unread
   * @returns never
   * @throws {NotImplementedError} always
   */
  getPriceByPriceGroup(_priceGroup: object): never {
    throw new NotImplementedError(
      'Sku.getPriceByPriceGroup',
      'model/entity/Sku.cfc:L261-L263 delegates to priceGroupService, which AAP 0.2.2.1 excludes',
      { context: { skuID: this.skuID, locator: 'model/entity/Sku.cfc:L261-L263' } },
    );
  }

  /**
   * The price-group rate applying to this SKU — [model/entity/Sku.cfc:L265-L267], which delegates to
   * `priceGroupService.getRateForSkuBasedOnPriceGroup`.
   *
   * TODO(boundary) [model/entity/Sku.cfc:L265-L267] — `priceGroupService` is out of scope, and the
   * rate entity itself is the excluded `priceGroupRates` relationship at [model/entity/Sku.cfc:L86].
   *
   * @param _priceGroup the price group whose rate is wanted; unread
   * @returns never
   * @throws {NotImplementedError} always
   */
  getAppliedPriceGroupRateByPriceGroup(_priceGroup: object): never {
    throw new NotImplementedError(
      'Sku.getAppliedPriceGroupRateByPriceGroup',
      'model/entity/Sku.cfc:L265-L267 delegates to priceGroupService, which AAP 0.2.2.1 excludes',
      { context: { skuID: this.skuID, locator: 'model/entity/Sku.cfc:L265-L267' } },
    );
  }

  /**
   * This SKU's price in a given currency — [model/entity/Sku.cfc:L269-L273].
   *
   * TODO(boundary) [model/entity/Sku.cfc:L269-L273] — it reads `getCurrencyDetails()`, one of the
   * THIRTEEN EXCLUDED non-persistent members ([:L104], getter at [:L367]), which builds its map from
   * `currencyService` and the excluded `skuCurrencies` relationship at [:L72]. Both are out of scope
   * (AAP §0.2.2.1). The legacy has NO `else` arm here, so it returns null on a miss — which is why the
   * member cannot simply be replaced by reading {@link Sku.getPrice}: an unknown currency is a
   * distinct answer from the base price.
   *
   * @param _currencyCode the currency wanted; unread
   * @returns never
   * @throws {NotImplementedError} always
   */
  getPriceByCurrencyCode(_currencyCode: string): never {
    throw new NotImplementedError(
      'Sku.getPriceByCurrencyCode',
      'model/entity/Sku.cfc:L269-L273 reads getCurrencyDetails(), an excluded calculated member ' +
        'built from currencyService and the excluded skuCurrencies relationship',
      { context: { skuID: this.skuID, locator: 'model/entity/Sku.cfc:L269-L273' } },
    );
  }

  /**
   * This SKU's list price in a given currency — [model/entity/Sku.cfc:L275-L279].
   *
   * TODO(boundary) [model/entity/Sku.cfc:L275-L279] — same excluded dependency as
   * {@link Sku.getPriceByCurrencyCode}. Note the legacy guard here is a TWO-PART test, checking both
   * that the currency is present and that its entry carries a list price, so an entry without one
   * returns null rather than falling back.
   *
   * @param _currencyCode the currency wanted; unread
   * @returns never
   * @throws {NotImplementedError} always
   */
  getListPriceByCurrencyCode(_currencyCode: string): never {
    throw new NotImplementedError(
      'Sku.getListPriceByCurrencyCode',
      'model/entity/Sku.cfc:L275-L279 reads getCurrencyDetails(), an excluded calculated member',
      { context: { skuID: this.skuID, locator: 'model/entity/Sku.cfc:L275-L279' } },
    );
  }

  /**
   * This SKU's renewal price in a given currency — [model/entity/Sku.cfc:L281-L285].
   *
   * TODO(boundary) [model/entity/Sku.cfc:L281-L285] — same excluded dependency and the same two-part
   * guard as {@link Sku.getListPriceByCurrencyCode}.
   *
   * @param _currencyCode the currency wanted; unread
   * @returns never
   * @throws {NotImplementedError} always
   */
  getRenewalPriceByCurrencyCode(_currencyCode: string): never {
    throw new NotImplementedError(
      'Sku.getRenewalPriceByCurrencyCode',
      'model/entity/Sku.cfc:L281-L285 reads getCurrencyDetails(), an excluded calculated member',
      { context: { skuID: this.skuID, locator: 'model/entity/Sku.cfc:L281-L285' } },
    );
  }

  /**
   * A quantity of this SKU of a requested type — [model/entity/Sku.cfc:L291-L316].
   *
   * TODO(boundary) [model/entity/Sku.cfc:L291-L316] — the largest boundary member of the entity. Its
   * four branches reach `locationService` [:L295], `stockService` [:L296] and [:L300],
   * `Product.getQuantity` [:L308] and `inventoryService` through a DYNAMIC METHOD-NAME COMPOSITION at
   * [:L310] — `invokeMethod("get#arguments.quantityType#", …)`, which is the same metaprogramming
   * IR-1 exists to eliminate. Every one of those services is excluded (AAP §0.2.2.1:
   * `model/**\/Location*.cfc` 4 files, `model/**\/Stock*.cfc` 11, `model/**\/Inventory*.cfc` 3).
   *
   * It also memoizes into its own `variables` scope KEYED BY QUANTITY TYPE at [:L305] and [:L310], a
   * per-instance cache that would need the same M7 treatment as the rest of this file were the member
   * ever implemented.
   *
   * ⚠️ THE INVALID-QUANTITY-TYPE MESSAGE AT [:L312] IS **NOT** AUTHORED HERE. It is a throw-string
   * literal, and every such literal in this port belongs to `src/errors/DomainError.ts` so that a
   * repository-wide check can assert each occurs exactly once. Neither the message nor its list of
   * valid types appears anywhere in this file, in code or in comment.
   *
   * @param _quantityType the quantity type wanted; unread
   * @param _locationID optional location scope; unread
   * @param _stockID optional stock scope; unread
   * @returns never
   * @throws {NotImplementedError} always
   */
  getQuantity(_quantityType: string, _locationID?: string, _stockID?: string): never {
    throw new NotImplementedError(
      'Sku.getQuantity',
      'model/entity/Sku.cfc:L291-L316 reaches locationService, stockService and inventoryService, ' +
        'all excluded by AAP 0.2.2.1, and composes an inventory method name dynamically at :L310',
      { context: { skuID: this.skuID, locator: 'model/entity/Sku.cfc:L291-L316' } },
    );
  }

  /**
   * Whether this SKU's stock records may be deleted — [model/entity/Sku.cfc:L567-L572].
   *
   * ⚠️⚠️ TODO(parity) [model/entity/Sku.cfc:L567-L572] — DEFECT D4, CARRIED NOT REPAIRED.
   * THIS MEMBER CANNOT RESOLVE IN THE LEGACY SYSTEM EITHER.
   *
   * The legacy body memoizes
   * `getService("skuService").getSkuStocksDeletableFlag( skuID=this.getSkuID() )` — the call site is
   * precisely [:L569]. That service member exists, at
   * [model/service/SkuService.cfc:L281-L283], and it delegates to
   * `getSkuDAO().getSkuStocksDeletableFlag()` — WHICH EXISTS NOWHERE IN THE REPOSITORY. AAP §0.6.7.3
   * records the same finding. The chain is therefore broken in the source, and this member has never
   * been able to return a value.
   *
   * NO IMPLEMENTATION IS INVENTED. Writing one would be the most damaging possible form of the repair
   * Guideline 4 forbids: it would answer a question the legacy system cannot answer, and the answer
   * would gate deletions. An explicit refusal that names the defect is the honest port.
   *
   * @returns never
   * @throws {NotImplementedError} always, naming defect D4
   */
  getStocksDeletableFlag(): never {
    throw new NotImplementedError(
      'Sku.getStocksDeletableFlag',
      'carried unrepaired as defect D4: model/entity/Sku.cfc:L569 calls ' +
        'SkuService.getSkuStocksDeletableFlag, which at model/service/SkuService.cfc:L281-L283 ' +
        'delegates to a DAO member that exists nowhere in the repository, so the chain is broken ' +
        'in the legacy source and no implementation is invented here',
      {
        context: {
          skuID: this.skuID,
          defect: 'D4',
          locator: 'model/entity/Sku.cfc:L567-L572',
        },
      },
    );
  }

  /* ---------------------------------------------------------------------------------------------
   * DEPRECATED MEMBERS — [model/entity/Sku.cfc:L882-L912], carried WITH their hints (D16)
   *
   * AAP §0.6.7.2's D16 entry names THREE of these, at [:L894], [:L899] and [:L908]. A full read of the
   * legacy block finds a FOURTH deprecation hint at [:L885], which the register does not name; it is
   * carried too, and recorded as an OBSERVED EXTRA rather than given a defect identifier of its own,
   * because the register is AAP §0.6.7's and inventing an identifier would imply an authority this
   * file does not have (S9).
   *
   * All four are retained rather than dropped: they are public members of the legacy surface, and
   * Guideline 2 requires existing behaviour be preserved. The `@deprecated` tags carry the legacy hint
   * text verbatim so a consumer sees the original guidance rather than a paraphrase. The lint
   * configuration uses the type-checked recommended preset rather than the strict one, so these
   * annotations do not turn every internal call into an error — which matters, because [:L895] and
   * [:L909] are legacy calls from one member to another.
   * ------------------------------------------------------------------------------------------- */

  /**
   * The option names of this SKU joined by a delimiter — [model/entity/Sku.cfc:L885-L891].
   *
   * @deprecated USE skuDefinition() — the legacy hint at [model/entity/Sku.cfc:L884], verbatim.
   *
   * ⚠️ ITS BODY IS BYTE-FOR-BYTE IDENTICAL TO {@link Sku.getOptionsDisplay} at [:L233-L239], down to
   * the local variable name and the default delimiter of a single space. It delegates below rather
   * than duplicating the loop, which is an idiom change the Minimal Change Clause permits and which
   * cannot alter the result, since the two legacy bodies are the same text.
   *
   * OBSERVED EXTRA, not a registered defect: AAP §0.6.7.2's D16 entry names the three members at
   * [:L894], [:L899] and [:L908] and does not name this one, although [:L884] carries the same kind of
   * hint. Recorded so the discrepancy reads as a finding rather than an oversight.
   *
   * @param delimiter the separator, defaulting to {@link SKU_OPTIONS_DISPLAY_DEFAULT_DELIMITER}
   * @returns the joined option names
   */
  displayOptions(delimiter: string = SKU_OPTIONS_DISPLAY_DEFAULT_DELIMITER): string {
    return this.getOptionsDisplay(delimiter);
  }

  /**
   * This SKU's options keyed by option group identifier — [model/entity/Sku.cfc:L894-L896].
   *
   * @deprecated USE getOptionsByOptionGroupIDStruct() — the legacy hint at
   *   [model/entity/Sku.cfc:L893], verbatim. Registered as part of defect D16.
   *
   * A pure delegation, exactly as [:L895] is. It therefore inherits defect D2 in full and ALWAYS
   * RETURNS AN EMPTY MAP; see {@link Sku.getOptionsByOptionGroupIDStruct}.
   *
   * @returns an empty map, always
   * @throws {DomainError} propagated from D2 when its loop runs and an option carries no option group
   */
  getOptionsByGroupIDStruct(): Record<string, Option> {
    return this.getOptionsByOptionGroupIDStruct();
  }

  /**
   * This SKU's option identifiers keyed by option group NAME — [model/entity/Sku.cfc:L899-L905].
   *
   * @deprecated NEVER USE — the legacy hint at [model/entity/Sku.cfc:L898], verbatim and unsoftened.
   *   Registered as part of defect D16.
   *
   * ⚠️ LAST-WINS, UNLIKE ITS SIBLINGS. [:L902] assigns unconditionally, with NO
   * `if(!structKeyExists(...))` guard, so when two options share an option group NAME the LATER one
   * overwrites the earlier. Contrast {@link Sku.getOptionsByOptionGroupCodeStruct} at [:L504], whose
   * guard keeps the FIRST. Both are preserved as written; that inconsistency is very likely why the
   * legacy author wrote the hint above.
   *
   * KEYED BY NAME, VALUED BY IDENTIFIER, which is the other reason the hint exists: a display string
   * is a poor map key, and two option groups may legitimately share one.
   *
   * Not memoized — [:L900] builds a fresh map on every call, and the legacy has no guard here.
   *
   * @returns a map of option group name to option identifier
   * @throws {DomainError} when an option carries no option group, per the unguarded-dereference
   *   policy — [:L902] dereferences it without a guard
   */
  getOptionsValueStruct(): Record<string, string> {
    const optionsByOptionGroupName: Record<string, string> = {};
    for (const option of this.options) {
      const optionGroupName =
        this.#requireOptionGroup(option, 'model/entity/Sku.cfc:L902').optionGroupName ?? '';
      /* [:L902] — unconditional assignment, so the last option for a name wins. */
      optionsByOptionGroupName[optionGroupName] = option.optionID;
    }
    return optionsByOptionGroupName;
  }

  /**
   * Whether this SKU is NOT its product's default — [model/entity/Sku.cfc:L908-L910], whose body is
   * `return !getDefaultFlag();`.
   *
   * @deprecated USE getDefaultFlag() — the legacy hint at [model/entity/Sku.cfc:L907], verbatim.
   *   Registered as part of defect D16.
   *
   * The negation is preserved exactly, including its consequence: because
   * {@link Sku.getDefaultFlag} answers `false` for a SKU with no product, this member answers `true`
   * for one — an unassociated SKU is indeed not any product's default.
   *
   * @param readDefaultSkuId forwarded to {@link Sku.getDefaultFlag}
   * @returns `true` when this SKU is not its product's default
   */
  isNotDefaultSku(readDefaultSkuId: DefaultSkuIdReader): boolean {
    return !this.getDefaultFlag(readDefaultSkuId);
  }
}

/* ================================================================================================
 * THE POPULATION CONTRACT
 *
 * `populate()` at [model/entity/HibachiEntity.cfc:L56] walked property METADATA at runtime and
 * assigned by composing accessor names from it. TR-3 replaces that with the declarations below, which
 * `../base/populate` consumes. Nothing here reflects, composes a method name, or reads metadata.
 * ============================================================================================== */

/**
 * Every PERSISTENT property name [model/entity/Sku.cfc] declares — all thirty-one, in declaration
 * order: the eight scalars [`:L52-:L59`], the calculated column [`:L62`], the two many-to-one
 * relationships [`:L65-:L66`], the five one-to-many collections [`:L69-:L73`], the four owning
 * many-to-many relationships [`:L76-:L79`], the six inverse many-to-many relationships [`:L82-:L87`],
 * `remoteID` [`:L90`] and the four audit properties [`:L93-:L96`], the last of these reused from
 * {@link AuditPropertyName} rather than re-spelled so this union cannot drift from
 * `../base/AuditableEntity`.
 *
 * IT IS THE COMPLETE PERSISTENT SURFACE EVEN THOUGH THE DESCRIPTOR SET BELOW IS NARROWER, and the
 * difference is deliberate — the same distinction `src/domain/product/Brand.ts` and
 * `src/domain/product/ProductType.ts` both draw. This union is the KEY SPACE that
 * `PopulationTarget<TPropertyName>` is parameterised by, so an indexed write during population can
 * only ever target a name declared here and a typo is a compile error rather than a silently created
 * property. The descriptor set is the narrower statement of what population may ACT on.
 *
 * ⚠️ THE NON-PERSISTENT BLOCK IS DELIBERATELY EXCLUDED, following the `ProductType` precedent, which
 * omits its own single non-persistent property. Admitting `salePrice` or `qats` to this union would
 * let population target a calculated member, which is neither what the legacy did nor what any
 * descriptor below permits. {@link SkuNonPersistentPropertyName} carries those names separately.
 */
export type SkuPropertyName =
  | 'skuID'
  | 'activeFlag'
  | 'skuCode'
  | 'listPrice'
  | 'price'
  | 'renewalPrice'
  | 'imageFile'
  | 'userDefinedPriceFlag'
  | 'calculatedQATS'
  | 'product'
  | 'subscriptionTerm'
  | 'alternateSkuCodes'
  | 'attributeValues'
  | 'orderItems'
  | 'skuCurrencies'
  | 'stocks'
  | 'options'
  | 'accessContents'
  | 'subscriptionBenefits'
  | 'renewalSubscriptionBenefits'
  | 'promotionRewards'
  | 'promotionRewardExclusions'
  | 'promotionQualifiers'
  | 'promotionQualifierExclusions'
  | 'priceGroupRates'
  | 'physicals'
  | 'remoteID'
  | AuditPropertyName;

/**
 * Every NON-PERSISTENT property name [model/entity/Sku.cfc:L99-L121] declares — all twenty-three, in
 * declaration order.
 *
 * Declared because two of them are VALIDATED PROPERTIES: [model/validation/Sku.json:3] and [:12] name
 * `defaultFlag` and `transactionExistsFlag` in the delete context, and
 * `src/validation/rules/sku.rules.ts` needs a compile-checked way to refer to them.
 * {@link SkuValidatedPropertyName} composes exactly that from this union and
 * {@link SkuPropertyName}.
 *
 * It is also the documentary record of the calculated-property boundary: thirteen of these names are
 * excluded and ten are carried, as the module header enumerates member by member. Declaring the
 * complete set here means a reader can see what the entity declares without inferring it from which
 * methods happen to exist.
 *
 * ⚠️ `physicalCounts` IS ABSENT FROM BOTH THIS UNION AND {@link SkuPropertyName}, AND THAT ABSENCE IS
 * LOAD-BEARING. [model/validation/Sku.json:13] names it, the entity declares `physicals` at
 * [model/entity/Sku.cfc:L87], and the presence gate at
 * [org/Hibachi/HibachiValidationService.cfc:L171] therefore skips the rule silently in the legacy
 * system. `src/validation/rules/brand.rules.ts` makes that inertness a COMPILE-CHECKED INVARIANT by
 * excluding the identifier from the entity's property-name union; keeping it out of both unions here
 * is what lets the same construction work for this entity.
 */
export type SkuNonPersistentPropertyName =
  | 'adminIcon'
  | 'assignedOrderItemAttributeSetSmartList'
  | 'baseProductType'
  | 'currentAccountPrice'
  | 'currencyCode'
  | 'currencyDetails'
  | 'defaultFlag'
  | 'eligibleFulfillmentMethods'
  | 'imageExistsFlag'
  | 'livePrice'
  | 'nextEstimatedAvailableDate'
  | 'optionsByOptionGroupCodeStruct'
  | 'optionsByOptionGroupIDStruct'
  | 'optionsIDList'
  | 'qats'
  | 'salePriceDetails'
  | 'salePrice'
  | 'salePriceDiscountType'
  | 'salePriceDiscountAmount'
  | 'salePriceExpirationDateTime'
  | 'skuDefinition'
  | 'stocksDeletableFlag'
  | 'transactionExistsFlag';

/**
 * The seven property identifiers [model/validation/Sku.json] names that this entity actually declares.
 *
 * ⭐ A CROSS-FILE CONTRACT. `src/validation/rules/sku.rules.ts` pins each identifier with the
 * compile-checked idiom `src/validation/rules/brand.rules.ts` established —
 * `Extract<…PropertyName, 'name'>` for an identifier that must exist and
 * `Exclude<'physicalCounts', …PropertyName>` for the one that must not. Composing the seven here from
 * BOTH unions means that module resolves each of them without having to know which of the two carries
 * it, and it means a rename on either side of the boundary breaks the build instead of silently
 * disabling a rule.
 *
 * FIVE COME FROM THE PERSISTENT SURFACE and two from the non-persistent block, which is itself worth
 * recording: `defaultFlag` and `transactionExistsFlag` are CALCULATED delete guards, so the validation
 * engine reads them through accessors rather than off columns.
 */
export type SkuValidatedPropertyName =
  | Extract<SkuPropertyName, 'listPrice' | 'options' | 'price' | 'renewalPrice' | 'skuCode'>
  | Extract<SkuNonPersistentPropertyName, 'defaultFlag' | 'transactionExistsFlag'>;

/**
 * The eight populate-enabled simple properties, in legacy declaration order —
 * [model/entity/Sku.cfc:L53-:L59] plus the calculated column at [`:L62`].
 *
 * NONE carries `populateEnabled: false`, because [model/entity/Sku.cfc] declares
 * `hb_populateEnabled="false"` on EXACTLY FOUR properties and all four are the audit properties at
 * [`:L93-:L96`]. That makes this entity ordinary in the slice and `Brand` the outlier, which declares
 * nine.
 *
 * `calculatedQATS` IS INCLUDED, and the inclusion is faithful rather than convenient: [`:L62`] carries
 * no populate flag, so the legacy population pass could write it. See {@link Sku.calculatedQATS} for
 * why the persisted column and the excluded calculated member of the same name are different things.
 */
const SKU_SIMPLE_PROPERTY_DESCRIPTORS: readonly ColumnPropertyDescriptor<SkuPropertyName>[] = [
  { name: 'activeFlag' },
  { name: 'skuCode' },
  { name: 'listPrice' },
  { name: 'price' },
  { name: 'renewalPrice' },
  { name: 'imageFile' },
  { name: 'userDefinedPriceFlag' },
  { name: 'calculatedQATS' },
];

/**
 * `remoteID` — [model/entity/Sku.cfc:L90]. A populate-enabled simple property, declared apart from the
 * eight above because it sits AFTER the relationship block in the legacy source and declaration order
 * is preserved.
 */
const SKU_REMOTE_ID_DESCRIPTOR: ColumnPropertyDescriptor<SkuPropertyName> = { name: 'remoteID' };

/**
 * The four audit properties as populate-disabled descriptors, GENERATED from
 * {@link AUDIT_PROPERTY_NAMES} so that each name is written exactly once in this file and cannot drift
 * from `../base/AuditableEntity`.
 *
 * `populateEnabled: false` is the transliteration of `hb_populateEnabled="false"` at
 * [model/entity/Sku.cfc:L93-:L96]. These are the ONLY four populate-disabled properties this entity
 * declares.
 */
const SKU_AUDIT_PROPERTY_DESCRIPTORS: readonly PopulatePropertyDescriptor<
  Sku,
  AuditPropertyName
>[] = AUDIT_PROPERTY_NAMES.map<PopulatePropertyDescriptor<Sku, AuditPropertyName>>(
  (auditPropertyName) => ({ name: auditPropertyName, populateEnabled: false }),
);

/**
 * The collaborators the two in-scope relationships need before population can act on them.
 *
 * WHY THEY ARE PARAMETERS AND NOT IMPORTS (S3). The legacy population pass resolved each related
 * entity through `getService("hibachiService").getServiceByEntityName(...)` and then invoked a
 * dynamically composed getter — a string-keyed service locator feeding runtime method-name
 * composition, which is exactly what TR-3 and IR-1 replace. Supplying the loaders from
 * `src/config/container.ts` keeps this module free of any service or adapter import.
 *
 * Both relationships are OPTIONAL as a group: {@link SKU_PROPERTY_DESCRIPTORS} is the dependency-free
 * form, for the many callers that populate scalars only.
 */
export interface SkuPopulationCollaborators {
  /** Loads or creates a `Product` by identifier, for the many-to-one at [model/entity/Sku.cfc:L65]. */
  readonly productLoader: RelatedEntityLoader<Product>;

  /** Populates a loaded `Product` from nested data. */
  readonly populateProduct: SubPropertyPopulator<Product>;

  /** Loads or creates an `Option` by identifier, for the many-to-many at [model/entity/Sku.cfc:L76]. */
  readonly optionLoader: RelatedEntityLoader<Option>;

  /** Populates a loaded `Option` from nested data. */
  readonly populateOption: SubPropertyPopulator<Option>;
}

/**
 * Builds this entity's population contract, wiring the two in-scope relationships when their
 * collaborators are supplied.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IS LISTED AND WHAT IS OMITTED, IN LEGACY DECLARATION ORDER WITH EVERY GAP ACCOUNTED FOR
 * ---------------------------------------------------------------------------------------------
 *   [:L52] skuID                        OMITTED — no populate branch admits an identifier field; see
 *                                                 {@link SKU_PRIMARY_ID_PROPERTY_NAME}
 *   [:L53-:L59] the eight scalars        listed
 *   [:L62] calculatedQATS                listed (grouped with the scalars above)
 *   [:L65] product                       listed when its collaborators are supplied
 *   [:L66] subscriptionTerm              OMITTED — boundary: `SubscriptionTerm` is out of scope, so
 *                                                 there is no entity for a loader to load
 *   [:L69-:L73] the five one-to-many     OMITTED — boundary: `AlternateSkuCode`, `AttributeValue`,
 *                                                 `OrderItem`, `SkuCurrency` and `Stock` are all out
 *                                                 of scope. AAP §0.4.1.4's folder requirements forbid
 *                                                 creating `SkuCurrency.ts` and `AlternateSkuCode.ts`
 *                                                 by name
 *   [:L76] options                       listed when its collaborators are supplied
 *   [:L77-:L79] accessContents,          OMITTED — boundary: `Content` and `SubscriptionBenefit` are
 *              subscriptionBenefits,               out of scope
 *              renewalSubscriptionBenefits
 *   [:L82-:L87] the six inverse m2m      OMITTED — boundary: `Promotion*`, `PriceGroup*` and
 *                                                 `Physical*` are all out of scope, and each is the
 *                                                 INVERSE side, so this entity would not own the write
 *                                                 in any case
 *   [:L90] remoteID                      listed
 *   [:L93-:L96] the four audit props     listed, populate-disabled
 *
 * ⚠️ NONE OF THE OMITTED RELATIONSHIPS IS POPULATE-DISABLED IN THE LEGACY. Not one of them carries
 * `hb_populateEnabled="false"`, so the legacy population pass WOULD have written them. They are
 * omitted because the RELATED TYPE is out of scope, not because the legacy forbade population — a
 * genuinely different reason, and the honest one to record. No placeholder type is invented to keep
 * them (S9). This is the same treatment `src/domain/product/Brand.ts` applies to its own unflagged
 * out-of-scope relationship.
 *
 * @param collaborators the loaders and sub-populators for `product` and `options`; omit to build the
 *   dependency-free form
 * @returns the population contract for this entity
 */
export function createSkuPropertyDescriptors(
  collaborators?: SkuPopulationCollaborators,
): PropertyDescriptorSet<Sku, SkuPropertyName> {
  /*
   * `product` — [model/entity/Sku.cfc:L65], `fieldtype="many-to-one" fkcolumn="productID"`.
   *
   * `relatedPrimaryIdPropertyName: 'productID'` is Product's declared identifier
   * [model/entity/Product.cfc:L52]. The legacy resolved that name at runtime through
   * `getPrimaryIDPropertyNameByEntityName(...)` over an interpolated entity name; TR-3 replaces the
   * lookup with this declaration.
   *
   * ⚠️ NOTE WHAT IS **NOT** HERE: no `addRelated`, because the many-to-one shape declares none. That
   * matters, because {@link Sku.setProduct} maintains BOTH sides and the ordering coupling documented
   * on it depends on being the single place the append happens. Population assigns the field through
   * `../base/populate`'s own indexed write; a caller that needs the collection maintained calls
   * `product.addSku(sku)`, which reaches {@link Sku.setProduct}.
   */
  const productDescriptors: readonly ManyToOnePropertyDescriptor<'product', Product>[] =
    collaborators === undefined
      ? []
      : [
          {
            kind: 'many-to-one',
            name: 'product',
            relatedPrimaryIdPropertyName: 'productID',
            loader: collaborators.productLoader,
            populateRelated(product, data) {
              collaborators.populateProduct(product, data);
            },
          },
        ];

  /*
   * `options` — [model/entity/Sku.cfc:L76], the many-to-many this entity OWNS. See
   * {@link Sku.options} for the ownership proof from both sides.
   *
   * `singularName: 'option'` is the legacy `singularname="option"` attribute, and the capital N is the
   * spelling `../base/populate` pins. NOTHING CONCATENATES IT INTO A MEMBER NAME (TR-3, S3): it is
   * declared provenance, and `addRelated` and `removeRelated` below are the explicit replacements for
   * the dispatch that once composed `addOption` and `removeOption` from it. Those two members are the
   * IR-1 declarations whose absence would otherwise break three other modules.
   *
   * `addRelated` and `removeRelated` delegate to {@link Sku.addOption} and {@link Sku.removeOption}
   * rather than touching the array, so the add-if-absent semantics and the owning-side-only rule hold
   * for population exactly as they do for a direct call.
   *
   * `readRelated` returns the LIVE collection through {@link Sku.getOptions}, matching what the legacy
   * accessor returned.
   */
  const optionsDescriptors: readonly ManyToManyPropertyDescriptor<Sku, 'options', Option>[] =
    collaborators === undefined
      ? []
      : [
          {
            kind: 'many-to-many',
            name: 'options',
            relatedPrimaryIdPropertyName: 'optionID',
            singularName: 'option',
            loader: collaborators.optionLoader,
            addRelated(sku, option) {
              sku.addOption(option);
            },
            populateRelated(option, data) {
              collaborators.populateOption(option, data);
            },
            removeRelated(sku, option) {
              sku.removeOption(option);
            },
            readRelated(sku) {
              return sku.getOptions();
            },
            readRelatedPrimaryId(option) {
              return option.optionID;
            },
          },
        ];

  return {
    /*
     * [model/entity/Sku.cfc:L49] declares `persistent=true`, so this is `true` — and the flag is
     * load-bearing rather than informational: `../base/populate` uses it as the first arm of the
     * legacy authorisation test, where a transient process object populates freely and a persistent
     * entity such as this one had per-property access control consulted. Those framework arms are
     * flagged boundary omissions in that module, not here.
     */
    persistent: true,

    properties: [
      ...SKU_SIMPLE_PROPERTY_DESCRIPTORS,
      ...productDescriptors,
      ...optionsDescriptors,
      SKU_REMOTE_ID_DESCRIPTOR,
      ...SKU_AUDIT_PROPERTY_DESCRIPTORS,
    ],
  };
}

/**
 * This entity's dependency-free population contract.
 *
 * The form most callers need: thirteen descriptors covering the nine populate-enabled scalars and the
 * four populate-disabled audit properties, with no loader required. Pass collaborators to
 * {@link createSkuPropertyDescriptors} wherever `product` or `options` sub-population is genuinely
 * needed — which the odometer at [model/service/SkuService.cfc:L58-L211] does not, since it attaches
 * options through {@link Sku.addOption} directly rather than through population.
 *
 * ⭐ THIS EXPORT IS WHAT REPLACES `populate()`. The AAP row for this file requires it by name, and it
 * is the reason no `populate` member appears on the class: assignment is data-driven by these
 * declarations rather than by runtime metadata reflection.
 *
 * Evaluated once at module load and structurally immutable — every descriptor member is `readonly` or
 * a method, the audit list it derives from is frozen, and nothing here is mutable module-scope state
 * that could bleed across warm Lambda invocations (M7 / S8).
 */
export const SKU_PROPERTY_DESCRIPTORS: PropertyDescriptorSet<Sku, SkuPropertyName> =
  createSkuPropertyDescriptors();

/* ================================================================================================
 * THE DOCUMENT-AND-OMIT REGISTER
 *
 * Every member [model/entity/Sku.cfc] declares that this port does NOT declare, with its locator and
 * the reason. It is written out in full rather than summarised because an omission that is not
 * recorded is indistinguishable from an oversight, and because AAP Guideline 6 requires the judgment
 * call to be visible at the place it was made. A reader auditing this port against its 916-line origin
 * should be able to account for every member from the two lists — the members declared above, and the
 * members named here.
 *
 * The counts: the class above declares FORTY-SEVEN members. This register accounts for THIRTY-SIX
 * further legacy members plus three empty comment-delimited sections. Nothing in [model/entity/Sku.cfc]
 * is unaccounted for.
 *
 * ------------------------------------------------------------------------------------------------
 * 1. THE FOURTEEN OUT-OF-SCOPE COLLECTIONS AND THEIR ACCESSORS
 * ------------------------------------------------------------------------------------------------
 * Every one is declared in the property block and every one targets an entity AAP §0.2.2.1 or §0.2.2.4
 * excludes by name. No field, accessor or placeholder type is created for any of them, because S9
 * forbids inventing a type for an entity this slice does not port and AAP §0.4.1.4's folder
 * requirements forbid `SkuCurrency.ts` and `AlternateSkuCode.ts` by name.
 *
 *   ONE-TO-MANY [:L69-:L73]
 *     alternateSkuCodes            [:L69]  `AlternateSkuCode`      — out of scope; file forbidden
 *     attributeValues              [:L70]  `AttributeValue`        — `Attribute*` family excluded
 *     orderItems                   [:L71]  `OrderItem`             — `Order*` family excluded.
 *                                          ⚠️ Uniquely declares `lazy="extra"`, the only such
 *                                          declaration in this entity — Hibernate's collection-size
 *                                          optimisation, which has no `mysql2` analogue and is
 *                                          therefore an execution-model detail with nothing to port
 *     skuCurrencies                [:L72]  `SkuCurrency`           — out of scope; file forbidden.
 *                                          Its own validation document `model/validation/SkuCurrency.json`
 *                                          is excluded by AAP §0.2.2.4
 *     stocks                       [:L73]  `Stock`                 — `Stock*` family excluded
 *
 *   OWNING MANY-TO-MANY [:L77-:L79]
 *     accessContents               [:L77]  `Content`, link `SwSkuAccessContent`    — `Content*` excluded
 *     subscriptionBenefits         [:L78]  `SubscriptionBenefit`, `SwSkuSubsBenefit` — `Subscription*` excluded
 *     renewalSubscriptionBenefits  [:L79]  `SubscriptionBenefit`, `SwSkuRenewalSubsBenefit` — same
 *
 *   INVERSE MANY-TO-MANY [:L82-:L87] — all six are the INVERSE side, so this entity would not own the
 *   write even if the far type were in scope. That is worth stating: these are not merely out of
 *   reach, they are not this entity's data to maintain.
 *     promotionRewards             [:L82]  `Promotion*` excluded
 *     promotionRewardExclusions    [:L83]  `Promotion*` excluded
 *     promotionQualifiers          [:L84]  `Promotion*` excluded
 *     promotionQualifierExclusions [:L85]  `Promotion*` excluded
 *     priceGroupRates              [:L86]  `PriceGroup*` excluded
 *     physicals                    [:L87]  `Physical*` excluded.
 *                                          ⚠️ THIS IS THE PROPERTY [model/validation/Sku.json:13]
 *                                          MEANT when it wrote `physicalCounts`. See
 *                                          {@link SkuNonPersistentPropertyName} for why the JSON's
 *                                          spelling is preserved and its inertness made a
 *                                          compile-checked invariant rather than repaired
 *
 * ------------------------------------------------------------------------------------------------
 * 2. THE NINE ONE-LINE DELEGATING HELPER PAIRS — [:L640-:L749]
 * ------------------------------------------------------------------------------------------------
 * Eighteen members, each a single line delegating to the far side's own bidirectional helper:
 *
 *     addAlternateSkuCode / removeAlternateSkuCode                     [:L640] / [:L643]
 *     addAttributeValue / removeAttributeValue                         [:L648] / [:L651]
 *     addSkuCurrency / removeSkuCurrency                               [:L656] / [:L659]
 *     addStock / removeStock                                           [:L664] / [:L667]
 *     addPromotionReward / removePromotionReward                       [:L672] / [:L675]
 *     addPromotionRewardExclusion / removePromotionRewardExclusion     [:L680] / [:L683]
 *     addPromotionQualifier / removePromotionQualifier                 [:L688] / [:L691]
 *     addPromotionQualifierExclusion / removePromotionQualifierExclusion [:L696] / [:L699]
 *     addPhysical / removePhysical                                     [:L744] / [:L747]
 *
 * All eighteen target the out-of-scope collections of section 1, so all eighteen are omitted. Keeping
 * them would require inventing eighteen placeholder parameter types for entities this slice does not
 * port, which S9 forbids.
 *
 * ✅ WORTH RECORDING BECAUSE IT IS THE OPPOSITE OF WHAT THE SIBLING FILE FOUND: all four exclusion
 * helpers here — `addPromotionRewardExclusion`, `removePromotionRewardExclusion`,
 * `addPromotionQualifierExclusion`, `removePromotionQualifierExclusion` — delegate to the CORRECT far
 * member. `src/domain/option/Option.ts` records a copy-paste defect in its analogous helpers. There is
 * no such defect here, and confirming a defect's ABSENCE is as much a finding as confirming its
 * presence.
 *
 * ------------------------------------------------------------------------------------------------
 * 3. THE TWO FULL TWO-SIDED PAIRS — and a previously unregistered legacy inconsistency
 * ------------------------------------------------------------------------------------------------
 * Unlike section 2 these four members carry real bodies that mutate BOTH arrays, exactly as
 * {@link Sku.setProduct} does. Both target out-of-scope entities, so both pairs are omitted — but the
 * asymmetry between them is recorded because it is a genuine finding this port surfaced, and AAP
 * §0.6.7 has no identifier for it.
 *
 *   addAccessContent / removeAccessContent — [:L704-:L722]
 *     `addAccessContent` [:L704-:L712] guards the LOCAL append with `isNew()` and the FAR append with
 *     `arguments.accessContent.isNew()`. `removeAccessContent` [:L714-:L722] uses `arrayFind` on both
 *     sides — the sentinel sites at [:L715] and [:L719], two of the six this port translates with
 *     `!== -1`.
 *
 *   addSubscriptionBenefit / removeSubscriptionBenefit — [:L724-:L742]
 *     ⚠️ TODO(parity) — THE GUARDS ARE SWAPPED RELATIVE TO `addAccessContent`.
 *     [:L724-:L732] guards the LOCAL append with `arguments.subscriptionBenefit.isNew()` and the FAR
 *     append with `isNew()` — the exact inverse of the pairing three lines above it. One of the two is
 *     wrong; the legacy source does not say which, and neither does this comment, because deciding
 *     would be a repair. AAP §0.6.7 registers no identifier for it, so none is invented here (S9) and
 *     it is recorded as an observed inconsistency rather than as a numbered defect. The sentinel sites
 *     are [:L735] and [:L739], completing the six.
 *
 *   The six `arrayFind` sentinel sites in full — [:L610], [:L628], [:L715], [:L719], [:L735], [:L739].
 *   The first two are translated in {@link Sku.removeProduct} and {@link Sku.removeSubscriptionTerm};
 *   the four here fall inside the omitted pairs. Every translation uses `!== -1` rather than `> 0`,
 *   because CFML `arrayFind` returns 0 on a miss while `indexOf` returns -1, and reusing the legacy
 *   `> 0` test would silently delete element 0.
 *
 * ------------------------------------------------------------------------------------------------
 * 4. THE THREE MEMBERS CALLED BUT NEVER DECLARED THAT ARE **NOT** PORTED
 * ------------------------------------------------------------------------------------------------
 * IR-1's rule is that a synthesized member becomes an explicit declaration WHERE THE SLICE CALLS IT.
 * {@link Sku.addOption}, {@link Sku.removeOption} and {@link Sku.hasOption} met that test and are
 * declared. These three do not, because each one's collection is out of scope:
 *
 *     hasAccessContent            called [:L705]                     — `Content` out of scope
 *     hasSubscriptionBenefit      called [:L725]                     — `SubscriptionBenefit` out of scope
 *     addRenewalSubscriptionBenefit  called [model/service/SkuService.cfc:L164], synthesized from
 *                                 `singularname="renewalSubscriptionBenefit"` [:L79]
 *                                 — `SubscriptionBenefit` out of scope. Its ONLY caller is the
 *                                 subscription branch of the odometer, which AAP §0.4.1.8 places
 *                                 behind `SubscriptionTermPort` and does not port
 *
 * AAP §0.4.2.5's closing row states the principle plainly: synthesis is not reproduced wholesale, only
 * where used.
 *
 * ------------------------------------------------------------------------------------------------
 * 5. THE FRAMEWORK OVERRIDES — forbidden, and the reason they existed is now obsolete
 * ------------------------------------------------------------------------------------------------
 *     getPropertyMetaData  [:L843-:L856]  Overrode the base accessor to answer for an option group by
 *                                         32-character `optionGroupID`, sniffing UUID-shaped keys the
 *                                         same way [model/entity/HibachiEntity.cfc:L153] does.
 *                                         ⚠️ RECORDED FOR ITS OWN SAKE: [:L843] writes the length
 *                                         threshold as the STRING `"32"` where `HibachiEntity` writes
 *                                         the NUMBER `32`. CFML's weak comparison coerces the two, so
 *                                         both work; TypeScript would not, and a transliteration that
 *                                         carried the string literal into a `===` against a `number`
 *                                         would not compile. The divergence is moot because IR-1
 *                                         replaces the whole mechanism.
 *     onMissingMethod      [:L858-:L874]  The per-entity arm of the same trick, resolving
 *                                         `getOption<uuid>`-shaped calls dynamically.
 *
 * BOTH ARE ON THE FORBIDDEN-MEMBER LIST AND NEITHER IS PORTED. IR-1 replaces them with the explicit,
 * typed accessors above — {@link Sku.getOptionByOptionGroupID} and
 * {@link Sku.getOptionByOptionGroupCode} — which is why a metadata-reflection facility is not merely
 * unwanted here but unnecessary.
 *
 * ------------------------------------------------------------------------------------------------
 * 6. THE TWO SMART-LIST GETTERS
 * ------------------------------------------------------------------------------------------------
 *     getAssignedOrderItemAttributeSetSmartList  [:L327-:L332]  reaches `attributeService`, and its
 *                                                              backing property is one of the thirteen
 *                                                              excluded calculated members
 *     getAssignedAttributeSetSmartList           [:L813-:L822]  same collaborator; sits under the
 *                                                              legacy's own
 *                                                              `Overridden Smart List Getters` heading
 *
 * Both are forbidden members twice over: `*SmartList` getters are on the forbidden list, and
 * `attributeService` is out of scope. AAP §0.2.2.7 places the paginated-query abstraction behind
 * `SmartListQueryPort`, which no member of this entity consumes.
 *
 * ------------------------------------------------------------------------------------------------
 * 7. THE THREE EMPTY COMMENT-DELIMITED SECTIONS
 * ------------------------------------------------------------------------------------------------
 *     `START/END: Custom Formatting Methods`   around [:L802-:L806]
 *     `START/END: ORM Event Hooks`             around [:L878-:L880]
 *     `Deprecated Properties`                  [:L123]
 *
 * All three are GENUINELY EMPTY in the legacy source. Nothing is invented to fill them (S9), and their
 * emptiness is itself informative: this entity registers NO ORM lifecycle hook, so there is no
 * `preInsert` or `preUpdate` behaviour for `../base/AuditableEntity` to have to reproduce beyond the
 * audit block, and it declares no deprecated PROPERTY even though it declares four deprecated METHODS
 * (the D16 family plus the observed fourth at [:L885]).
 * ============================================================================================== */
