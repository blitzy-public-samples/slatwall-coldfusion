/**
 * PORT OF `model/entity/Sku.cfc` (916 lines, confirmed by `wc -l`).
 *
 * Legacy declaration, verbatim [model/entity/Sku.cfc:L49]:
 *
 *   component entityname="SlatwallSku" table="SwSku" persistent=true accessors=true output=false
 *             extends="HibachiEntity" cacheuse="transactional" hb_serviceName="skuService"
 *             hb_permission="this"
 *
 * ★ WHY THIS IS THE LAST AND HARDEST ENTITY IN THE SLICE. It carries one of the three areas the plan
 * names as must-preserve-exactly: the four-step currency resolution cascade
 * [model/entity/Sku.cfc:L367-L433] together with the three currency accessors it feeds
 * [L269-L285], whose `undefined` returns are LOAD-BEARING - AAP 0.6.3 states plainly that
 * substituting `0` for them "would silently sell products for free". It is also the far side of nine
 * separate in-place mutations from other entities, the near side of the option-combination validation
 * the SKU-resolution path depends on, and the single entity that overrides `onMissingMethod` to expose
 * a dynamic per-option-group getter.
 *
 * THE RECEIVER-QUALIFIED ASSOCIATION CENSUS. Seventeen associations - fifteen collections and two
 * many-to-one references. Liveness is decided by measurement, never by shape: an accessor is LIVE if
 * and only if some other component mutates ITS RESULT in place.
 *
 *   | property                        | L    | kind             | accessor  | mutated in place by |
 *   |---------------------------------|------|------------------|-----------|---------------------|
 *   | product                         | L64  | many-to-one      | reference | -                   |
 *   | subscriptionTerm                | L65  | many-to-one      | reference | -                   |
 *   | alternateSkuCodes               | L68  | one-to-many      | LIVE      | AlternateSkuCode.cfc:L76, L85 |
 *   | attributeValues                 | L69  | one-to-many      | LIVE      | AttributeValue.cfc:L278, L287 |
 *   | orderItems                      | L70  | one-to-many      | readonly  | -                   |
 *   | skuCurrencies                   | L71  | one-to-many      | LIVE      | SkuCurrency.cfc:L92, L101 |
 *   | stocks                          | L72  | one-to-many      | readonly  | -                   |
 *   | options                         | L75  | m2m owner        | readonly  | this entity only    |
 *   | accessContents                  | L76  | m2m owner        | readonly  | this entity only    |
 *   | subscriptionBenefits            | L77  | m2m owner        | readonly  | this entity only    |
 *   | renewalSubscriptionBenefits     | L78  | m2m owner        | readonly  | -                   |
 *   | promotionRewards                | L81  | m2m inverse      | LIVE      | PromotionReward.cfc:L243, L253 |
 *   | promotionRewardExclusions       | L82  | m2m inverse      | LIVE      | PromotionReward.cfc:L343, L353 |
 *   | promotionQualifiers             | L83  | m2m inverse      | LIVE      | PromotionQualifier.cfc:L185, L195 |
 *   | promotionQualifierExclusions    | L84  | m2m inverse      | LIVE      | PromotionQualifier.cfc:L285, L295 |
 *   | priceGroupRates                 | L85  | m2m inverse      | LIVE      | PriceGroupRate.cfc:L244, L254 |
 *   | physicals                       | L86  | m2m inverse      | LIVE      | Physical.cfc:L204, L214 |
 *
 * The census command, so a reviewer can re-run it rather than trust the table:
 *
 *   grep -rnE "array(Append|DeleteAt)\(\s*(arguments\.)?sku\.get" model/ integrationServices/
 *
 * It returns EIGHTEEN hits over the NINE accessors marked LIVE, and nothing else. `getOptions()` in
 * particular returns NO hit, which is why it is `readonly` here despite this entity owning the
 * `SwSkuOption` link table.
 *
 * ★ FOUR ROWS DESERVE COMMENT.
 *
 *   * `options` [L75] IS MAINTAINED BY THE ORM'S GENERATED HELPERS, NOT BY HAND-WRITTEN ONES. `Sku.cfc`
 *     declares no `addOption`/`removeOption` anywhere - grep confirms zero hits - yet
 *     `model/entity/Option.cfc` calls `arguments.sku.addOption( this )` from its own `addSku`. The
 *     helpers exist because `accessors=true` plus `singularname="option"` makes the CFML ORM generate
 *     them, and the generated pair appends to and removes from `variables.options` with NO duplicate
 *     guard and NO far-side maintenance. That is reproduced exactly, and it stands in deliberate
 *     contrast to the next row.
 *   * `accessContents` [L76] AND `subscriptionBenefits` [L77] ARE THE SAME KIND OF ASSOCIATION AND ARE
 *     MAINTAINED BY HAND [L704-L741], WITH GUARDS AND FAR-SIDE APPENDS. So this one entity carries
 *     three many-to-many owner collections maintained three different ways: ORM-generated for
 *     `options`, hand-written-with-guards for the other two, and nothing at all for
 *     `renewalSubscriptionBenefits` [L78]. The asymmetry is the source's and it is preserved rather
 *     than harmonised.
 *   * `orderItems` [L70] IS DECLARED `lazy="extra"` and belongs to the excluded order pipeline. It is
 *     retained as an inert readonly projection carrying only the order-item identifier, on the same
 *     reasoning AAP 0.8.1 applies to `Category.cmsCategoryID`: preserving an association nothing in
 *     scope reads keeps the schema contract legible, whereas dropping it makes a future reader ask
 *     whether the port lost it.
 *   * `physicals` [L86] IS LIVE HERE and is LIVE on `productType.ts`, yet `brand.ts` deliberately does
 *     NOT materialize its own identically-declared `physicals` property. The deciding factor is the
 *     census, not the declaration: `model/entity/Physical.cfc:L204` appends into `sku.getPhysicals()`
 *     and nothing appends into `brand.getPhysicals()`. See the note in `brand.ts` for the full ruling.
 *
 * ELEVEN CONTAINMENT PROBES, and the split between them matters. NINE are called by a far side and are
 * therefore part of this entity's published contract: `hasAlternateSkuCode`
 * [AlternateSkuCode.cfc:L74], `hasAttributeValue` [AttributeValue.cfc:L276], `hasSkuCurrency`
 * [SkuCurrency.cfc:L91], `hasPriceGroupRate` [PriceGroupRate.cfc:L242], `hasPromotionReward`
 * [PromotionReward.cfc:L241], `hasPromotionRewardExclusion` [PromotionReward.cfc:L341],
 * `hasPromotionQualifier` [PromotionQualifier.cfc:L183], `hasPromotionQualifierExclusion`
 * [PromotionQualifier.cfc:L283] and `hasPhysical` [Physical.cfc:L202]. TWO more - `hasAccessContent`
 * [L705] and `hasSubscriptionBenefit` [L725] - are called only by this entity's own owner helpers. No
 * aggregate `hasAnyXXX` probe is authored: the promotion engine's four aggregate call sites
 * [PromotionService.cfc:L885, L914, L951, L980] all target a reward or a qualifier, never a sku.
 *
 * TEN DISTINCT DEFECTS LIVE IN THIS COMPONENT. Eight are reproduced; TWO are fixed as documented
 * deliberate divergences because AAP 0.6.7 names them among its three permitted exceptions.
 *
 *   D1  L257-L259  `getPriceByPromotion()` calls `promotionService.calculateSkuPriceBasedOnPromotion`,
 *                  which is declared NOWHERE - grep for the name returns exactly one hit in the whole
 *                  repository and it is this call. AAP 0.6.7 defect 16. REPRODUCED as a throwing stub.
 *   D2  L247-L251  `getOptionByOptionGroupCode()` GUARDS the option-group-CODE struct and then READS
 *                  the option-group-ID struct with the code as its key. REPRODUCED.
 *   D3  L500-L510  `getOptionsByOptionGroupCodeStruct()` initialises `optionsByOptionGroupIDStruct` -
 *                  the WRONG memo - and then reads and writes `optionsByOptionGroupCodeStruct`, which
 *                  therefore never exists. AAP 0.6.7 defect 17. FIXED; see the method.
 *   D4  L512-L522  `getOptionsByOptionGroupIDStruct()` guards and initialises the right memo but WRITES
 *                  to `variables.OptionsByGroupIDStruct` - a third, undeclared name - so it always
 *                  returns `{}`. AAP 0.6.7 defect 18. FIXED; see the method.
 *   D5  L474       `getNextEstimatedAvailableDate()` evaluates `quantityNeeded - dates[i].quantity` as
 *                  a BARE STATEMENT with no assignment, so the running requirement never decreases.
 *                  REPRODUCED in the method doc.
 *   D6  L460-L477  the same method wraps its whole body in a memo guard and then returns from inside
 *                  it every time, so `variables.nextEstimatedAvailableDate` is NEVER assigned and the
 *                  memo is dead. REPRODUCED in the method doc.
 *   D7  L583       `getSkuDefinition()` calls `trim(variables.skuDefinition);` with no assignment, so
 *                  the leading space that each appended element carries [L581] survives into the
 *                  returned string. REPRODUCED.
 *   D8  L167-L179 vs L200-L214  the two deprecated-size blocks in `getResizedImage()` and
 *                  `getResizedImagePath()` DISAGREE. The first accepts a positional argument and
 *                  leaves an unrecognised size untouched; the second accepts only the named argument
 *                  and its `else` forces ANY unrecognised size to "Small". REPRODUCED in the docs.
 *   D9  L560-L565  `getSalePriceExpirationDateTime()` returns the empty STRING when no sale-price
 *                  detail carries an expiry, while the matching property declares `type="date"`
 *                  [L120]. REPRODUCED in the return type.
 *   D10 L553-L558  `getSalePriceDiscountType()` substitutes `""` for an absent detail while the
 *                  product-level twin substitutes `"none"` [Product.cfc:L606]. Two entities, two
 *                  stand-ins, one underlying absence. REPRODUCED.
 *
 * EIGHT SECONDARY ITEMS are recorded at their sites and are not counted above. Each is labelled `S<n>`
 * in the member that carries it, so the list here and the markers in the body can be checked against one
 * another:
 *
 *   S1  L443       the DOUBLE unguarded dereference in `getDefaultFlag()` - neither `getProduct()` nor
 *                  `getDefaultSku()` is null-tested, and the second case is entirely ordinary.
 *   S2  L135, L138 the unguarded `getProduct()` and `option.getOptionGroup()` in
 *                  `generateImageFileName()`.
 *   S3  L485       the array literal in `getLivePrice()`, which cannot hold a null price - so a sku with
 *                  no price fails at array construction rather than at comparison.
 *   S4  L828       the unguarded `getProduct().getProductType()` in `getAssignedAttributeSetSmartList()`,
 *                  where the product-level twin DOES guard [Product.cfc:L809], for the identical query.
 *   S5  L894       the deprecated `getOptionsByGroupIDStruct()`, whose NAME is exactly the typo'd
 *                  variable D4 writes to - which is almost certainly where that typo came from.
 *   S6  L388-L395 vs L419-L426  the cascade formats in TWO DIFFERENT CURRENCY CONTEXTS: steps 1 and 2
 *                  use `getFormattedValue`, which formats in the AMBIENT session currency, while step 3
 *                  uses `formatValue(..., {currencyCode=...})`, which names the ROW's currency. See
 *                  {@link CurrencyDetail} for the census that decided not to reproduce the three
 *                  `*Formatted` keys at all.
 *   S7  Sku.json   the `"physicalCounts"` rule constrains a property this entity does not declare - see
 *                  the VALIDATION note below.
 *   S8  L725, L728 the two `isNew()` disjuncts in `addSubscriptionBenefit()` are SWAPPED relative to
 *                  `addAccessContent()` [L705, L708] twenty lines above, in this same file and the same
 *                  shape - each guard tests the newness of the entity whose collection it is NOT about
 *                  to write to. Found while porting the helper block rather than while reading the
 *                  property block, which is why it is last. `Product.addListingPage` carries the
 *                  identical inversion (its own S5), suggesting a copy-paste lineage. It is a secondary
 *                  item rather than a numbered defect because it changes duplicate handling on a
 *                  multi-add rather than a returned value; see the method for the full argument.
 *
 * THE `extends` CHAIN IS THREE LEVELS DEEP, NOT TWO. `Sku` extends `HibachiEntity`, which extends
 * `model/entity/HibachiEntity.cfc`, which extends `org/Hibachi/HibachiEntity.cfc`. Nineteen
 * `getService(` sites sit in this file, and transformation rule T2 converts each one into either an
 * injected collaborator or a documented stub - the inventory is in the members themselves.
 *
 * ★ THE ASYNC BOUNDARY ON THIS ENTITY, AND WHY IT FALLS WHERE IT DOES. AAP 0.4.2 draws it at "reaches
 * the DAO or ORM", and AAP 0.4.1 then names ONE explicit exception for this class: "keep
 * `getPriceByCurrencyCode` synchronous by materializing currency details upstream". Both rules are
 * honoured, and the result is three different treatments that a reader should be able to tell apart:
 *
 *   * MATERIALIZED, ACCESSOR STAYS SYNC - the currency cascade's per-currency CONVERSIONS and this
 *     sku's own sale-price detail row. `src/domain/ports/currencyConverter.ts`'s header states the
 *     same ruling from the other side: every method there is `async` precisely "so that the SKU
 *     accessors downstream can stay synchronous". Note what is NOT materialized: every DECISION in the
 *     cascade - the eligibility gate, which step wins, the overwrite order, the `converted` flag -
 *     stays in this entity. Only the arithmetic it cannot perform arrives from outside.
 *   * SYNC THROUGH AN INJECTED COLLABORATOR - `getPriceByPriceGroup` and
 *     `getAppliedPriceGroupRateByPriceGroup`, because AAP 0.4.2 declares both of the price-group
 *     service methods behind them SYNC.
 *   * GENUINELY ASYNC - `getCurrentAccountPrice`, `getLivePrice`, `getStocksDeletableFlag` and
 *     `getTransactionExistsFlag`, because each reaches a service method AAP 0.4.2 declares async.
 *     `getLivePrice` is async only by contagion from the first.
 *
 * ★ AND NO METHOD ON THIS CLASS GAINS A PARAMETER. AAP 0.4.2 permits exactly ONE entity-layer
 * signature widening in the entire port - `PromotionPeriod.isCurrent(now: Date)` - so
 * `getCurrentAccountPrice()` takes the `CurrentAccountContext` that transformation rule T6 requires
 * from its CONSTRUCTOR rather than from an argument list. That is the only shape that satisfies T6 and
 * the widening ban at the same time.
 *
 * SMART LISTS ARE NOT PORTED, on the three-bullet dividing line stated once in
 * `src/domain/entities/product.ts`. Two members here fall in its third bullet - the smart list IS the
 * whole behaviour and its consumer is out of scope - and both are recorded at their locators instead
 * of converted: `getAssignedOrderItemAttributeSetSmartList()` [L326-L354] and
 * `getAssignedAttributeSetSmartList()` [L813-L840].
 *
 * VALIDATION. `model/validation/Sku.json` constrains eight properties. Two of its rules are METHOD
 * rules that call straight into this class - `options` must satisfy `hasUniqueOptions` and
 * `hasOneOptionPerOptionGroup`, both in the `save` context - which is why those two methods are ported
 * in full rather than recorded. `price` is `required` with `minValue:0`; `listPrice` and `renewalPrice`
 * share the `minValue:0` rule without being required; `skuCode` is `required` and `unique`;
 * `defaultFlag` and `transactionExistsFlag` must both be `false` to delete. The eighth rule constrains
 * `physicalCounts` - SECONDARY ITEM S7 - which this entity does not declare at all, so the rule can
 * never fire. Nothing is invented to satisfy it, and no `physicalCounts` property is added.
 *
 * TEST COVERAGE. There is NO legacy test for this entity. AAP 0.6.6 records that only two legacy test
 * files touch the in-scope slice and neither is this one, so every obligation in this module's footer
 * is NET-NEW and must be labelled as such in `tests/traceability/legacyTestMap.ts`. Given that this
 * class carries a named must-preserve behaviour, the characterization suites listed there are the only
 * thing standing between the cascade and a silent regression.
 *
 * NO USER RULES WERE PROVIDED for this project (AAP 0.7), so the enterprise-standard practices AAP
 * 0.8.3 enumerates apply in their place - most visibly here that all money passes through `Money` and
 * that no float arithmetic touches a monetary value.
 */

import { listAppend, listToArray } from '../../lib/cfml/list.js';
import { cfEquals, structGet, structKeyExists } from '../../lib/cfml/struct.js';
import { cfBoolean, cfLen, type CfBooleanInput } from '../../lib/cfml/truthiness.js';
import type { CurrentAccountContext } from '../ports/priceGroupRepository.js';
import type { SalePriceDetail } from '../ports/promotionRepository.js';
// `Money` is a TYPE-ONLY import here, which is worth a word because every other money-bearing module in
// this port imports it as a value. This entity never CONSTRUCTS a money value - it stores, forwards and
// compares the ones the repository hydrates - so nothing here calls `Money.fromDecimalString`. Contrast
// `src/domain/entities/product.ts`, whose `getSalePrice()` has to manufacture the source's literal
// `return 0` and therefore needs the value binding.
import type { Money } from '../valueObjects/money.js';
import type { Option } from './option.js';
import type { PriceGroup } from './priceGroup.js';
import type { PriceGroupRate } from './priceGroupRate.js';
import type { Product } from './product.js';
import type { PromotionQualifier } from './promotionQualifier.js';
import type { PromotionReward } from './promotionReward.js';
import type { Promotion } from './promotion.js';
import type { SkuCurrency } from './skuCurrency.js';

/**
 * One currency's resolved prices, as the four-step cascade leaves them.
 *
 * EXPORTED, because it is the element type of {@link Sku.getCurrencyDetails}'s public return and AAP
 * 0.4.2 names that signature directly. `brand.ts` exports its five link projections and `category.ts`
 * exports its pre-update snapshot on the same footing; exporting a type from an ENTITY module has no
 * bearing on the thirteen-file port inventory AAP 0.4.1 locks.
 *
 * ★ `price` IS OPTIONAL, AND THAT IS THE WHOLE POINT OF THE TYPE. The cascade writes
 * `skuCurrencyID = ""` for every eligible currency BEFORE any price is resolved
 * [model/entity/Sku.cfc:L381-L382], so a currency can legitimately appear in the map with no price at
 * all - and `Sku.getPriceByCurrencyCode` then answers `undefined` for it. AAP 0.6.3 is explicit that
 * this absence is load-bearing. Making `price` required and defaulting it to zero would be the exact
 * mistake that section warns about.
 *
 * `listPrice` and `renewalPrice` are optional for a second, independent reason: all three cascade steps
 * gate them on the source value being non-null [L386, L390, L401, L405, L417, L421], so a currency can
 * carry a `price` and no `listPrice`. That is why
 * {@link Sku.getListPriceByCurrencyCode} performs a SECOND existence check that
 * {@link Sku.getPriceByCurrencyCode} does not.
 *
 * ★ THE THREE `*Formatted` KEYS THE LEGACY ALSO WRITES ARE NOT REPRODUCED, and the reason is
 * evidential rather than aesthetic. `priceFormatted`, `listPriceFormatted` and `renewalPriceFormatted`
 * [L388, L392, L395, L403, L407, L410, L419, L423, L426] have exactly ONE consumer in the entire
 * repository - `admin/views/entity/skutabs/currencies.cfm:L68-L73` - and `admin/**` is excluded
 * wholesale by AAP 0.2.2. Producing them would require the CFML currency-and-locale formatting tier,
 * which AAP 0.5.3 does not port; emitting a bare two-decimal string in its place would be a
 * WELL-FORMED WRONG VALUE, since the legacy renders a currency symbol and a locale-specific
 * separator. `Money.toFixed2()` exists for presentation and is deliberately not pressed into service
 * here. Every in-scope consumer reads `price`, `listPrice` or `renewalPrice` and none reads a formatted
 * string.
 *
 * ★ SECONDARY ITEM S6, recorded because reproducing the formatted keys later would have to reproduce
 * this too: THE LEGACY FORMATS STEPS 1 AND 2 IN A DIFFERENT CURRENCY CONTEXT THAN STEP 3. Steps 1 and 2 use
 * `getFormattedValue("price")` [L395, L410], which resolves through the entity's own
 * `hb_formatType="currency"` metadata and the AMBIENT session currency; step 3 uses
 * `formatValue(value, "currency", {currencyCode=thisCurrency.getCurrencyCode()})` [L426], which names
 * the ROW's currency explicitly. So a base-currency or overridden row is formatted in the viewer's
 * currency while a converted row is formatted in its own.
 */
export type CurrencyDetail = {
  /**
   * The resolved price. Absent where no cascade step supplied one - see the type's doc block.
   *
   * Steps 1 and 2 write it unconditionally [L394, L409]; step 3 writes it unconditionally too [L425]
   * but only runs when the earlier two did not [L416].
   */
  readonly price?: Money | undefined;

  /** The resolved list price. Absent where the sku or the override row carried none. */
  readonly listPrice?: Money | undefined;

  /** The resolved renewal price. Absent where the sku or the override row carried none. */
  readonly renewalPrice?: Money | undefined;

  /**
   * `false` where the price came from the sku's own columns or a `SwSkuCurrency` override row, `true`
   * where it was converted on the fly [L396, L411, L427].
   *
   * OPTIONAL, because the legacy leaves it UNSET for an eligible currency that is neither the default
   * currency, nor overridden, nor reachable by conversion - the same hole `price` can have. The admin
   * view reads it inside an `<cfelseif>` [currencies.cfm:L78] and would fail on that row.
   */
  readonly converted?: boolean | undefined;

  /**
   * The `SwSkuCurrency` row's identifier where step 2 supplied the price [L412], and the EMPTY STRING
   * otherwise.
   *
   * REQUIRED, and `''` rather than `undefined` for the absent case, because the legacy sets it for
   * every eligible currency before anything else happens [L382]. It is the one member of this type that
   * is never missing.
   */
  readonly skuCurrencyID: string;
};

/**
 * The per-currency conversion results step 3 of the cascade needs, resolved during hydration.
 *
 * MODULE-LOCAL AND UN-EXPORTED. This is not a port and not part of the published vocabulary; it is the
 * shape of one constructor input. See {@link Sku.convertedCurrencyPrices} for why the conversion
 * ARITHMETIC arrives pre-computed while every conversion DECISION stays in
 * {@link Sku.getCurrencyDetails}.
 *
 * Each member mirrors one `convertCurrency` call in the legacy's step 3, in source order:
 * `renewalPrice` from [L418], `listPrice` from [L422], `price` from [L425]. All three are optional
 * here because the entity decides which ones to read, from its OWN null checks on
 * `renewalPrice`/`listPrice`; supplying a value the entity does not ask for is harmless, and failing to
 * supply one it does ask for is a hydration error the entity raises on.
 */
type ConvertedCurrencyPrices = {
  readonly price?: Money | undefined;
  readonly listPrice?: Money | undefined;
  readonly renewalPrice?: Money | undefined;
};

/**
 * The narrow price-group collaborator this entity is constructed with.
 *
 * ★ RELOCATED HERE BY F11, DELIBERATELY MODULE-LOCAL AND UN-EXPORTED. It used to be published as
 * `export interface SkuPriceGroupResolver` from `src/domain/ports/priceGroupRepository.ts`; the
 * relocation note that remains at the foot of that file explains the reasoning in full, and the short
 * version is that the port inventory is locked at the THIRTEEN files AAP 0.4.1 enumerates, and an
 * exported collaborator contract reads as a fourteenth whether or not it occupies a file of its own.
 * `src/handlers/bootstrap.ts` satisfies this interface STRUCTURALLY by adapting the ported
 * `src/services/priceGroupService.ts` surface, and needs no name to import in order to do so.
 *
 * IT COVERS THE THREE `getService("priceGroupService")` SITES transformation rule T2 converts:
 * [model/entity/Sku.cfc:L262], [L266] and [L437].
 *
 * ★ TWO OF THE THREE ARE SYNC AND ONE IS ASYNC, and that split is not this file's choice - it is
 * AAP 0.4.2's, which declares `calculateSkuPriceBasedOnPriceGroup` and `getRateForSkuBasedOnPriceGroup`
 * synchronous and `calculateSkuPriceBasedOnCurrentAccount` asynchronous. Flattening them to one
 * convention would contradict the plan in one direction or the other.
 */
interface SkuPriceGroupResolver {
  /**
   * [model/service/PriceGroupService.cfc:L301] `calculateSkuPriceBasedOnPriceGroup` - SYNC per
   * AAP 0.4.2.
   */
  calculateSkuPriceBasedOnPriceGroup(sku: Sku, priceGroup: PriceGroup): Money;

  /**
   * [model/service/PriceGroupService.cfc:L140] `getRateForSkuBasedOnPriceGroup` - SYNC per AAP 0.4.2,
   * and `undefined` where the five-level cascade finds no rate.
   */
  getRateForSkuBasedOnPriceGroup(sku: Sku, priceGroup: PriceGroup): PriceGroupRate | undefined;

  /**
   * [model/service/PriceGroupService.cfc:L262] `calculateSkuPriceBasedOnCurrentAccount` - ASYNC per
   * AAP 0.4.2, and it takes the explicit context transformation rule T6 substitutes for the legacy's
   * ambient `getSlatwallScope()` reach [model/service/PriceGroupService.cfc:L262-L268].
   */
  calculateSkuPriceBasedOnCurrentAccount(sku: Sku, context: CurrentAccountContext): Promise<Money>;
}

/**
 * The two in-scope `skuService` reaches this entity makes, as an injected collaborator.
 *
 * MODULE-LOCAL AND UN-EXPORTED, on the same budget reasoning as {@link SkuPriceGroupResolver}.
 *
 * ★ BOTH TARGETS ARE GENUINELY IN SCOPE, which makes this the one collaborator on this class that is
 * neither a materialized value nor a stub: `SkuService.getSkuStocksDeletableFlag`
 * [model/service/SkuService.cfc:L281] and `SkuService.getTransactionExistsFlag` [L285] are both ported,
 * and both are backed by `SkuDAO` methods the plan keeps [model/dao/SkuDAO.cfc:L53].
 *
 * ★ NOTE THE ARGUMENT ASYMMETRY WITH THE PRODUCT-LEVEL TWIN. `Sku` calls
 * `getTransactionExistsFlag( skuID = ... )` [model/entity/Sku.cfc:L594] while `Product` calls
 * `getTransactionExistsFlag( productID = ... )` [model/entity/Product.cfc:L627] - the SAME service
 * method, reached with different named arguments, answering "has this sku been transacted" versus "has
 * any sku of this product been transacted". The two are separate questions and the port keeps them
 * separate.
 */
interface SkuQuerySupport {
  /** [model/service/SkuService.cfc:L281] Whether this sku's stock rows can be deleted. */
  getSkuStocksDeletableFlag(skuID: string): Promise<boolean>;

  /** [model/service/SkuService.cfc:L285] Whether any order transaction references THIS sku. */
  getTransactionExistsFlag(skuID: string): Promise<boolean>;
}

/**
 * The one resource-bundle label this entity interpolates, resolved outside the domain.
 *
 * MODULE-LOCAL AND UN-EXPORTED. JavaRB is not ported (AAP 0.5.3), and the house policy for `rbKey` is
 * to emit the key verbatim as a constant where the KEY is the contract and to inject a resolved label
 * where the VALUE flows into rendered data. `getSkuDefinition()` [model/entity/Sku.cfc:L585]
 * interpolates `rbKey('entity.subscriptionTerm')` into a human-readable string, so the value flows
 * outward and the label is injected. `src/domain/entities/promotionReward.ts` establishes the same
 * pattern with named methods rather than a key-string API, so a missing label is a compile error
 * instead of a runtime miss.
 */
interface SkuLabelProvider {
  /** The label for `rbKey('entity.subscriptionTerm')` [model/entity/Sku.cfc:L585]. */
  getSubscriptionTermLabel(): string;
}

/**
 * `model/entity/AlternateSkuCode.cfc`, projected to what this entity touches.
 *
 * OUT OF SCOPE as an entity, so it is a module-local structural projection rather than an imported
 * class - the pattern `product.ts` uses for `Vendor` and `Physical`. It carries a primary-key accessor,
 * so {@link Sku.hasAlternateSkuCode} can match by key the way the legacy framework probe does.
 */
/**
 * The optional argument bag the two image-resizing members accept.
 *
 * ★ THE SHAPE IS DICTATED BY WHAT THE LEGACY READS OUT OF `arguments`, not by a designed API. CFML
 * lets a caller pass anything and the body probes for named keys, so the honest port is an optional
 * bag with exactly the keys the source tests: `size` [L167, L200], `width`/`height` [L167, L200],
 * `alt` [L160], `missingImagePath` [L165, L197] and `resizeMethod` (written, never read, [L178, L211]).
 *
 * ★ THE LEGACY ALSO ACCEPTS `size` POSITIONALLY as `arguments[1]` [L167, L173] - see LEGACY-DEFECT D8,
 * where that asymmetry between the two members is the defect itself. A positional form has no
 * TypeScript equivalent that is worth inventing, so the named key is the port's single entry point and
 * the defect note records what the positional path did.
 *
 * Structurally identical to the same-named type in `src/domain/entities/product.ts`, which is what lets
 * `Product`'s two image delegators pass their bag straight through to a sku.
 */
type ImageResizeOptions = {
  readonly size?: string;
  readonly width?: number;
  readonly height?: number;
  readonly alt?: string;
  readonly resizeMethod?: string;
  readonly missingImagePath?: string;
};

interface SkuAlternateSkuCodeLink {
  /** [model/entity/AlternateSkuCode.cfc:L52] the `uuid` primary key, `''` while unsaved. */
  getAlternateSkuCodeID(): string;
  /** [model/entity/AlternateSkuCode.cfc:L70] sets the owning sku and appends to its LIVE array. */
  setSku(sku: Sku): void;
  /** [model/entity/AlternateSkuCode.cfc:L79] splices itself out of the owning sku's LIVE array. */
  removeSku(sku?: Sku): void;
}

/**
 * `model/entity/AttributeValue.cfc`, projected to what this entity touches.
 *
 * NO KEY ACCESSOR, so {@link Sku.hasAttributeValue} is REFERENCE-ONLY. That is stricter than the
 * legacy framework probe and is safe for the same reason `product.ts` records for its three
 * reference-only probes: association arrays are materialized once per request, so the same row is the
 * same object throughout.
 */
interface SkuAttributeValueLink {
  /** [model/entity/AttributeValue.cfc:L270] sets the owning sku and appends to its LIVE array. */
  setSku(sku: Sku): void;
  /** [model/entity/AttributeValue.cfc:L281] splices itself out of the owning sku's LIVE array. */
  removeSku(sku?: Sku): void;
}

/**
 * `model/entity/OrderItem.cfc`, projected to the identifier alone.
 *
 * ★ INERT IN THIS SLICE. The order pipeline is the plan's largest exclusion (AAP 0.2.2) and nothing in
 * scope reads {@link Sku.getOrderItems}. The projection exists so the association is visibly PRESENT
 * rather than silently dropped, and it carries only the identifier because that is the one value the
 * `SwOrderItem.skuID` foreign key guarantees exists without reaching into an excluded aggregate.
 */
interface SkuOrderItemLink {
  /** The order item's identifier. */
  getOrderItemID(): string;
}

/**
 * `model/entity/Stock.cfc`, projected to what this entity's helpers touch.
 *
 * The stock subsystem is excluded, and `getStocks()` is `readonly` because nothing mutates it in place.
 * The two delegating members exist because `Sku.cfc` declares `addStock`/`removeStock` [L664-L669].
 */
interface SkuStockLink {
  /** [model/entity/Stock.cfc] sets the owning sku. */
  setSku(sku: Sku): void;
  /** [model/entity/Stock.cfc] clears the owning sku. */
  removeSku(sku?: Sku): void;
}

/**
 * `model/entity/Content.cfc` in its access-content role, projected to what this entity's owner helpers
 * touch [model/entity/Sku.cfc:L704-L721].
 *
 * The content-access module is excluded. `getSkus()` is MUTABLE here because `addAccessContent`
 * appends into it [L709] - the far side of an association this entity owns.
 */
interface SkuAccessContentLink {
  /** Whether this content row is unsaved - the far-side guard's first disjunct [L708]. */
  isNew(): boolean;
  /** Whether this content row already lists the given sku [L708]. */
  hasSku(sku: Sku): boolean;
  /** The content row's sku collection, mutated in place by this entity's owner helpers. */
  getSkus(): Sku[];
}

/**
 * `model/entity/SubscriptionBenefit.cfc`, projected to what this entity's owner helpers touch
 * [model/entity/Sku.cfc:L724-L741].
 *
 * The subscription module is excluded. Structurally identical to {@link SkuAccessContentLink}, and kept
 * separate because the two associations are separate link tables over separate entities and collapsing
 * them would imply an interchangeability that does not exist.
 */
interface SkuSubscriptionBenefitLink {
  /** Whether this benefit row is unsaved [L728]. */
  isNew(): boolean;
  /** Whether this benefit row already lists the given sku [L728]. */
  hasSku(sku: Sku): boolean;
  /** The benefit row's sku collection, mutated in place by this entity's owner helpers. */
  getSkus(): Sku[];
}

/**
 * `model/entity/SubscriptionTerm.cfc`, projected to what this entity touches.
 *
 * The subscription module is excluded, but this projection is NOT inert: `getSkuDefinition()`'s
 * subscription branch reads the term's name [model/entity/Sku.cfc:L585], and
 * `setSubscriptionTerm`/`removeSubscriptionTerm` maintain the term's sku collection in place
 * [L625, L634].
 */
interface SkuSubscriptionTermLink {
  /** The term's display name, read by `getSkuDefinition()` [model/entity/Sku.cfc:L585]. */
  getSubscriptionTermName(): string | undefined;
  /** Whether this term already lists the given sku - the far-side guard [L624]. */
  hasSku(sku: Sku): boolean;
  /** The term's sku collection, mutated in place by this entity's many-to-one helpers. */
  getSkus(): Sku[];
}

/**
 * `model/entity/Physical.cfc`, projected to what this entity delegates to.
 *
 * Out of scope as an entity. It carries a primary-key accessor so {@link Sku.hasPhysical} can match by
 * key, and the two owner-side methods because `Sku.addPhysical`/`removePhysical` delegate straight into
 * them [model/entity/Sku.cfc:L744-L749].
 */
interface SkuPhysicalLink {
  /** [model/entity/Physical.cfc] the `uuid` primary key, `''` while unsaved. */
  getPhysicalID(): string;
  /** [model/entity/Physical.cfc:L200] adds the sku on the owning side. */
  addSku(sku: Sku): void;
  /** [model/entity/Physical.cfc:L211] removes the sku on the owning side. */
  removeSku(sku: Sku): void;
}

/**
 * A purchasable variant of a product - `SwSku`.
 *
 * See the module header for the association census, the defect register, the async-boundary ruling and
 * the signature-widening ban this class observes.
 */
export class Sku {
  // --- Persistent properties [model/entity/Sku.cfc:L51-L59] --------------------------------------

  /**
   * [model/entity/Sku.cfc:L52] `uuid` primary key with `unsavedvalue="" default=""`.
   *
   * `''` MEANS UNSAVED, which is what {@link Sku.isNew} tests and what every containment probe on this
   * class falls back to reference identity for.
   */
  private readonly skuID: string;

  /** [model/entity/Sku.cfc:L53] `ormtype="boolean" default="1"` - note the default is TRUE. */
  private readonly activeFlag: boolean;

  /**
   * [model/entity/Sku.cfc:L54] `unique="true" length="50"`.
   *
   * OPTIONAL despite `model/validation/Sku.json` marking it `required` in the `save` context: the
   * column itself is nullable, validation runs at the service tier, and an entity hydrated from a row
   * written before the rule existed must still be representable.
   */
  private readonly skuCode: string | undefined;

  /** [model/entity/Sku.cfc:L55] `big_decimal hb_formatType="currency" default="0"`. */
  private readonly listPrice: Money | undefined;

  /**
   * [model/entity/Sku.cfc:L56] `big_decimal hb_formatType="currency" default="0"`.
   *
   * ★ THE ANCHOR OF THE WHOLE CURRENCY CASCADE - step 1 writes it as the base-currency price [L394] and
   * step 3 converts it for every other eligible currency [L425]. It is also `getSalePrice()`'s fallback
   * [L550] and one of the three candidates `getLivePrice()` minimises over [L485].
   */
  private readonly price: Money | undefined;

  /** [model/entity/Sku.cfc:L57] `big_decimal hb_formatType="currency" default="0"`. */
  private readonly renewalPrice: Money | undefined;

  /**
   * [model/entity/Sku.cfc:L58] `length="50"` - the default image's filename, not a path.
   *
   * Read by {@link Sku.getImagePath} and {@link Sku.getImageExtension}, and by
   * `Product.getDefaultProductImageFiles()` [model/entity/Product.cfc:L508] which skips skus where it
   * is absent.
   */
  private readonly imageFile: string | undefined;

  /** [model/entity/Sku.cfc:L59] `ormtype="boolean" default="0"`. */
  private readonly userDefinedPriceFlag: boolean;

  // --- Calculated property [model/entity/Sku.cfc:L62] -------------------------------------------

  /**
   * [model/entity/Sku.cfc:L62] `ormtype="integer"` - a persisted quantity-available-to-sell.
   *
   * ★ {@link Sku.getQATS} DOES NOT READ IT, exactly as `Product.getTitle()` does not read
   * `calculatedTitle`. The source recomputes through the inventory service instead, so the column and
   * the accessor can legitimately disagree. Both are exposed and neither is derived from the other.
   */
  private readonly calculatedQATS: number | undefined;

  // --- Associations [model/entity/Sku.cfc:L64-L86] ----------------------------------------------

  /**
   * [model/entity/Sku.cfc:L64] `many-to-one` with `hb_cascadeCalculate="true"`.
   *
   * MUTABLE, because {@link Sku.setProduct} and {@link Sku.removeProduct} assign and clear it. Ten
   * members on this class dereference it, and only some of them guard - see
   * {@link Sku.getBaseProductType} and {@link Sku.getDefaultFlag}.
   */
  private product: Product | undefined;

  /** [model/entity/Sku.cfc:L65] `many-to-one` into the excluded subscription module. */
  private subscriptionTerm: SkuSubscriptionTermLink | undefined;

  /**
   * [model/entity/Sku.cfc:L68] `one-to-many cascade="all-delete-orphan" inverse="true"`.
   *
   * LIVE - `model/entity/AlternateSkuCode.cfc:L76` appends into this accessor's result.
   */
  private readonly alternateSkuCodes: SkuAlternateSkuCodeLink[];

  /** [model/entity/Sku.cfc:L69] LIVE - `model/entity/AttributeValue.cfc:L278`. */
  private readonly attributeValues: SkuAttributeValueLink[];

  /** [model/entity/Sku.cfc:L70] `lazy="extra"`, inert in this slice - see the link projection. */
  private readonly orderItems: SkuOrderItemLink[];

  /**
   * [model/entity/Sku.cfc:L71] LIVE - `model/entity/SkuCurrency.cfc:L92`.
   *
   * ★ STEP 2 OF THE CURRENCY CASCADE READS IT [L399-L414], which is why `SkuCurrency` is one of the
   * three entities AAP 0.2.1 adds to the prompt's list by implicit necessity: without it the cascade is
   * not portable at all.
   */
  private readonly skuCurrencies: SkuCurrency[];

  /** [model/entity/Sku.cfc:L72] `one-to-many` into the excluded stock subsystem. */
  private readonly stocks: SkuStockLink[];

  /**
   * [model/entity/Sku.cfc:L75] `many-to-many` OWNER over `SwSkuOption`.
   *
   * PRIVATE STORAGE WITH A `readonly` ACCESSOR, because the ORM-generated `addOption`/`removeOption`
   * mutate this field and no far side reaches through {@link Sku.getOptions}. Eleven members read it,
   * and it is the input to the option-combination validation the SKU-resolution path depends on.
   */
  private readonly options: Option[];

  /** [model/entity/Sku.cfc:L76] `many-to-many` OWNER over `SwSkuAccessContent`, hand-maintained. */
  private readonly accessContents: SkuAccessContentLink[];

  /** [model/entity/Sku.cfc:L77] `many-to-many` OWNER over `SwSkuSubsBenefit`, hand-maintained. */
  private readonly subscriptionBenefits: SkuSubscriptionBenefitLink[];

  /**
   * [model/entity/Sku.cfc:L78] `many-to-many` OWNER over `SwSkuRenewalSubsBenefit`.
   *
   * ★ THE ONLY COLLECTION ON THIS ENTITY WITH NO HELPER PAIR ON EITHER SIDE, so it is maintained by the
   * ORM alone and is `readonly` here. Retained rather than dropped, on the schema-legibility reasoning
   * in the module header.
   */
  private readonly renewalSubscriptionBenefits: SkuSubscriptionBenefitLink[];

  /** [model/entity/Sku.cfc:L81] LIVE - `model/entity/PromotionReward.cfc:L243`. */
  private readonly promotionRewards: PromotionReward[];

  /** [model/entity/Sku.cfc:L82] LIVE - `model/entity/PromotionReward.cfc:L343`. Separate link table. */
  private readonly promotionRewardExclusions: PromotionReward[];

  /** [model/entity/Sku.cfc:L83] LIVE - `model/entity/PromotionQualifier.cfc:L185`. */
  private readonly promotionQualifiers: PromotionQualifier[];

  /** [model/entity/Sku.cfc:L84] LIVE - `model/entity/PromotionQualifier.cfc:L285`. */
  private readonly promotionQualifierExclusions: PromotionQualifier[];

  /** [model/entity/Sku.cfc:L85] LIVE - `model/entity/PriceGroupRate.cfc:L244`. */
  private readonly priceGroupRates: PriceGroupRate[];

  /** [model/entity/Sku.cfc:L86] LIVE - `model/entity/Physical.cfc:L204`. */
  private readonly physicals: SkuPhysicalLink[];

  // --- Remote and audit properties [model/entity/Sku.cfc:L89-L97] -------------------------------

  /** [model/entity/Sku.cfc:L89] the external-system identifier. */
  private readonly remoteID: string | undefined;

  /** [model/entity/Sku.cfc:L92] `hb_populateEnabled="false"`. */
  private readonly createdDateTime: Date | undefined;

  /**
   * [model/entity/Sku.cfc:L93] the creating account, reduced to its identifier.
   *
   * The `Account` entity is excluded, and AAP's anti-corruption boundary reduces it to an opaque id -
   * the same reduction `CurrentAccountContext` applies.
   */
  private readonly createdByAccountID: string | undefined;

  /** [model/entity/Sku.cfc:L94] `hb_populateEnabled="false"`. */
  private readonly modifiedDateTime: Date | undefined;

  /** [model/entity/Sku.cfc:L95] the modifying account, reduced to its identifier. */
  private readonly modifiedByAccountID: string | undefined;

  // --- Repository-materialized inputs -----------------------------------------------------------
  //
  // Everything below arrives from the repository or the composition root because the domain cannot
  // compute it: a setting this port does not expose, a framework scope value, or the result of an
  // asynchronous call an accessor's declared synchrony forbids. Each is `undefined` when it was not
  // supplied, and the member that needs it RAISES rather than substituting a default - the reasoning is
  // per-member and is stated at each one.

  /**
   * The resolved `skuCurrency` setting - the sku's base currency code.
   *
   * ★ THIS IS WHERE THE "USD DEFAULT" OF THE CASCADE ACTUALLY LIVES, one tier out. AAP 0.6.3 is
   * emphatic on the point: `skuCurrency` is declared `{fieldType="select", defaultValue="USD"}` at
   * [model/service/SettingService.cfc:L221], and there is NO hardcoded `"USD"` anywhere in
   * `model/entity/Sku.cfc`. {@link Sku.getCurrencyCode} memoizes the setting and nothing more, so this
   * port must resolve it through the settings tier with the same default and must NOT bake a literal
   * into the entity.
   *
   * It is one of the FOUR keys `src/domain/ports/settingsProvider.ts` exposes, and it arrives
   * pre-resolved as a string here rather than through a `SettingsProvider` reference, matching the house
   * pattern every other entity in this port follows.
   */
  private readonly skuCurrencySetting: string | undefined;

  /**
   * The resolved `skuEligibleCurrencies` setting - a COMMA-DELIMITED list of currency codes.
   *
   * ★ IT IS THE CASCADE'S ELIGIBILITY GATE, and the gate is real. `getCurrencyDetails()` wraps its
   * entire body in `if(len(setting('skuEligibleCurrencies')))` [L373], so an empty setting leaves the
   * memo `{}` and makes EVERY currency accessor answer `undefined`. The setting's own default is
   * `getCurrencyService().getAllActiveCurrencyIDList()` [model/service/SettingService.cfc:L222], so a
   * normal installation populates it - but a port that drops the gate changes behaviour in the edge
   * case, and AAP 0.6.3 calls that out specifically.
   *
   * KEPT AS A RAW COMMA STRING rather than an array, for signature parity with the `len()` test at L373
   * and the `addInFilter` at L375. `src/domain/ports/currencyConverter.ts` documents the same decision
   * from the other side.
   */
  private readonly skuEligibleCurrenciesSetting: string | undefined;

  /**
   * The eligible currency codes, in the order the legacy record set yields them.
   *
   * These are the rows behind `eligibleCurrencySL.getRecords()` [L377-L379], produced by
   * `CurrencyConverter.getCurrenciesByCurrencyCodeList` - the listing that applies NO active-status
   * filter, mirroring the cascade's single `addInFilter` [L375]. That port's own documentation warns
   * that adding an active filter would be a behaviour change rather than a correction, because an
   * inactive-but-eligible currency IS returned and IS priced.
   *
   * ORDER IS PRESERVED because it is the map's insertion order, and although a CFML struct is unordered
   * so the legacy order is not observable through `getCurrencyDetails()` itself, reproducing it costs
   * nothing and keeps a diff against the legacy record set readable.
   */
  private readonly eligibleCurrencyCodes: readonly string[] | undefined;

  /**
   * Step 3's conversion results, keyed by target currency code.
   *
   * ★ WHY THE ARITHMETIC ARRIVES AND THE DECISIONS DO NOT. `CurrencyConverter.convertCurrency` is
   * `async` - it has to be, since conversion rates come from the database - while AAP 0.4.1 requires
   * {@link Sku.getPriceByCurrencyCode} to stay synchronous. The only way to satisfy both is for the
   * three converted amounts per currency to be resolved during hydration. What is NOT delegated is
   * every decision the cascade makes: the eligibility gate, which step wins, the `structKeyExists(...,
   * "price")` test that suppresses step 3 entirely [L416], the `!isNull` tests on the sku's own list and
   * renewal prices [L417, L421], and the `converted` flag [L427] all stay in
   * {@link Sku.getCurrencyDetails}. That is the same division `Option.getImageDirectory` and
   * `Product.getTitle` draw: the domain keeps the logic, the outside supplies what it cannot compute.
   */
  private readonly convertedCurrencyPrices:
    Readonly<Record<string, ConvertedCurrencyPrices>> | undefined;

  /**
   * This sku's own sale-price detail row, resolved during hydration.
   *
   * The legacy reaches `getProduct().getSkuSalePriceDetails( getSkuID() )` [L541], and the product-level
   * method behind it is `async` in this port because it awaits the promotion tier's six-branch UNION.
   * Materializing the one row this sku needs keeps {@link Sku.getSalePrice},
   * {@link Sku.getSalePriceDiscountType} and {@link Sku.getSalePriceExpirationDateTime} synchronous,
   * which `Product`'s five delegators require.
   *
   * ★ `undefined` MEANS "NO SALE PRICE", NOT "HYDRATION FORGOT". That is not a compromise: the legacy's
   * `getSalePriceDetails()` always yields a struct and that struct is EMPTY for any sku with no active
   * sale-price reward, which is the common case. `structKeyExists(details, "salePrice")` is false in
   * exactly that situation, so an absent detail and an empty struct are indistinguishable in the source
   * and are treated identically here. No member raises on its absence.
   */
  private readonly salePriceDetail: SalePriceDetail | undefined;

  /**
   * The base image URL - `getHibachiScope().getBaseImageURL()` [L146].
   *
   * A framework SCOPE value, not a setting, and `org/Hibachi/**` is a boundary this port extracts from
   * and never reimplements (AAP 0.2.2). {@link Sku.getImagePath} interpolates it and raises when it is
   * absent, on the same reasoning `option.ts` records for `getImageDirectory`: a well-formed WRONG path
   * is worse than a failure, because the legacy consumers do file-existence checks, deletes and moves
   * against the result.
   */
  private readonly baseImageUrl: string | undefined;

  /**
   * The resolved `productImageOptionCodeDelimiter` setting, read through the product [L135].
   *
   * NOT one of the four keys this port exposes, so it arrives pre-resolved.
   * {@link Sku.generateImageFileName} joins option codes with it.
   */
  private readonly productImageOptionCodeDelimiterSetting: string | undefined;

  /**
   * The resolved `productImageDefaultExtension` setting, read through the product [L138].
   *
   * NOT one of the four keys this port exposes, so it arrives pre-resolved.
   */
  private readonly productImageDefaultExtensionSetting: string | undefined;

  /**
   * The current-account context {@link Sku.getCurrentAccountPrice} needs.
   *
   * ★ A CONSTRUCTOR INPUT AND NOT A METHOD PARAMETER, and the reason is a hard constraint rather than a
   * preference. Transformation rule T6 replaces the legacy's ambient scope reach
   * [model/service/PriceGroupService.cfc:L262-L268] with an explicit context, and AAP 0.4.2 permits
   * exactly ONE entity-layer signature widening in the whole port - `PromotionPeriod.isCurrent(now)`.
   * Threading the context through the constructor satisfies both: the state is explicit, and
   * `getCurrentAccountPrice()` keeps its zero-argument legacy signature.
   *
   * `{ accountID: undefined }` is a MEANINGFUL value, not a missing one - it is how the port represents
   * a request with no authenticated account, which the legacy resolves to the sku's own price without
   * attempting price-group resolution at all. `undefined` here means the context itself was never
   * supplied, which is a hydration error.
   */
  private readonly currentAccountContext: CurrentAccountContext | undefined;

  // --- Injected collaborators -------------------------------------------------------------------

  /** Replaces the three `getService("priceGroupService")` sites [L262, L266, L437]. */
  private readonly priceGroupResolver: SkuPriceGroupResolver | undefined;

  /** Replaces the two in-scope `getService("skuService")` sites [L569, L594]. */
  private readonly querySupport: SkuQuerySupport | undefined;

  /** Replaces the one `rbKey` interpolation [L585]. */
  private readonly labelProvider: SkuLabelProvider | undefined;

  // --- Memo slots -------------------------------------------------------------------------------
  //
  // Every memo below mirrors a `variables.<name>` slot the legacy tests with `structKeyExists`, and
  // every guard here tests `=== undefined` rather than falsiness - `''`, `0` and `false` are all
  // legitimate memoized answers on this class and must not re-trigger their computation.
  //
  // ★ ALL OF THEM ARE REQUEST-SCOPED, per AAP 0.6.5, and on this entity that is a correctness
  // requirement rather than hygiene: `currentAccountPrice` and `livePrice` are ACCOUNT-DEPENDENT and
  // `currencyDetails` depends on a setting, so a value surviving into another invocation on a warm
  // container could price one customer's cart with another customer's account.

  /** [model/entity/Sku.cfc:L361] memo for {@link Sku.getCurrencyCode}. */
  private currencyCode: string | undefined;

  /** [model/entity/Sku.cfc:L368] memo for {@link Sku.getCurrencyDetails}. */
  private currencyDetails: Readonly<Record<string, CurrencyDetail>> | undefined;

  /** [model/entity/Sku.cfc:L436] memo for {@link Sku.getCurrentAccountPrice}. */
  private currentAccountPrice: Money | undefined;

  /** [model/entity/Sku.cfc:L483] memo for {@link Sku.getLivePrice}. */
  private livePrice: Money | undefined;

  /** [model/entity/Sku.cfc:L501] memo for {@link Sku.getOptionsByOptionGroupCodeStruct}. */
  private optionsByOptionGroupCodeStruct: Record<string, Option> | undefined;

  /** [model/entity/Sku.cfc:L513] memo for {@link Sku.getOptionsByOptionGroupIDStruct}. */
  private optionsByOptionGroupIDStruct: Record<string, Option> | undefined;

  /** [model/entity/Sku.cfc:L525] memo for {@link Sku.getOptionsIDList}. */
  private optionsIDList: string | undefined;

  /** [model/entity/Sku.cfc:L575] memo for {@link Sku.getSkuDefinition}. */
  private skuDefinition: string | undefined;

  /** [model/entity/Sku.cfc:L568] memo for {@link Sku.getStocksDeletableFlag}. */
  private stocksDeletableFlag: boolean | undefined;

  /** [model/entity/Sku.cfc:L593] memo for {@link Sku.getTransactionExistsFlag}. */
  private transactionExistsFlag: boolean | undefined;

  /** [model/entity/Sku.cfc:L795] memo for {@link Sku.getImageName}. */
  private imageName: string | undefined;

  /**
   * Construct a sku from a repository row plus its materialized associations and collaborators.
   *
   * EVERY ARGUMENT IS OPTIONAL, so a test can build the narrowest sku a given behaviour needs. The two
   * boolean columns run through `cfBoolean()` so that `1`, `'1'`, `'true'`, `0`, `'0'`, `'false'` and
   * absence all resolve exactly as CFML resolves them - and note the two DIFFERENT column defaults:
   * `activeFlag` defaults to TRUE [L53] and `userDefinedPriceFlag` to FALSE [L59].
   */
  constructor(
    init: {
      readonly skuID?: string;
      readonly activeFlag?: CfBooleanInput;
      readonly skuCode?: string | undefined;
      readonly listPrice?: Money | undefined;
      readonly price?: Money | undefined;
      readonly renewalPrice?: Money | undefined;
      readonly imageFile?: string | undefined;
      readonly userDefinedPriceFlag?: CfBooleanInput;
      readonly calculatedQATS?: number | undefined;
      readonly product?: Product | undefined;
      readonly subscriptionTerm?: SkuSubscriptionTermLink | undefined;
      readonly alternateSkuCodes?: SkuAlternateSkuCodeLink[];
      readonly attributeValues?: SkuAttributeValueLink[];
      readonly orderItems?: SkuOrderItemLink[];
      readonly skuCurrencies?: SkuCurrency[];
      readonly stocks?: SkuStockLink[];
      readonly options?: Option[];
      readonly accessContents?: SkuAccessContentLink[];
      readonly subscriptionBenefits?: SkuSubscriptionBenefitLink[];
      readonly renewalSubscriptionBenefits?: SkuSubscriptionBenefitLink[];
      readonly promotionRewards?: PromotionReward[];
      readonly promotionRewardExclusions?: PromotionReward[];
      readonly promotionQualifiers?: PromotionQualifier[];
      readonly promotionQualifierExclusions?: PromotionQualifier[];
      readonly priceGroupRates?: PriceGroupRate[];
      readonly physicals?: SkuPhysicalLink[];
      readonly remoteID?: string | undefined;
      readonly createdDateTime?: Date | undefined;
      readonly createdByAccountID?: string | undefined;
      readonly modifiedDateTime?: Date | undefined;
      readonly modifiedByAccountID?: string | undefined;
      readonly skuCurrencySetting?: string | undefined;
      readonly skuEligibleCurrenciesSetting?: string | undefined;
      readonly eligibleCurrencyCodes?: readonly string[] | undefined;
      readonly convertedCurrencyPrices?:
        Readonly<Record<string, ConvertedCurrencyPrices>> | undefined;
      readonly salePriceDetail?: SalePriceDetail | undefined;
      readonly baseImageUrl?: string | undefined;
      readonly productImageOptionCodeDelimiterSetting?: string | undefined;
      readonly productImageDefaultExtensionSetting?: string | undefined;
      readonly currentAccountContext?: CurrentAccountContext | undefined;
      readonly priceGroupResolver?: SkuPriceGroupResolver | undefined;
      readonly querySupport?: SkuQuerySupport | undefined;
      readonly labelProvider?: SkuLabelProvider | undefined;
    } = {},
  ) {
    // [model/entity/Sku.cfc:L52] `unsavedvalue=""` - an unsaved sku's key IS the empty string.
    this.skuID = init.skuID ?? '';
    // [L53] `default="1"`.
    this.activeFlag = cfBoolean(init.activeFlag ?? true);
    this.skuCode = init.skuCode;
    this.listPrice = init.listPrice;
    this.price = init.price;
    this.renewalPrice = init.renewalPrice;
    this.imageFile = init.imageFile;
    // [L59] `default="0"`.
    this.userDefinedPriceFlag = cfBoolean(init.userDefinedPriceFlag ?? false);
    this.calculatedQATS = init.calculatedQATS;

    this.product = init.product;
    this.subscriptionTerm = init.subscriptionTerm;

    this.alternateSkuCodes = init.alternateSkuCodes ?? [];
    this.attributeValues = init.attributeValues ?? [];
    this.orderItems = init.orderItems ?? [];
    this.skuCurrencies = init.skuCurrencies ?? [];
    this.stocks = init.stocks ?? [];
    this.options = init.options ?? [];
    this.accessContents = init.accessContents ?? [];
    this.subscriptionBenefits = init.subscriptionBenefits ?? [];
    this.renewalSubscriptionBenefits = init.renewalSubscriptionBenefits ?? [];
    this.promotionRewards = init.promotionRewards ?? [];
    this.promotionRewardExclusions = init.promotionRewardExclusions ?? [];
    this.promotionQualifiers = init.promotionQualifiers ?? [];
    this.promotionQualifierExclusions = init.promotionQualifierExclusions ?? [];
    this.priceGroupRates = init.priceGroupRates ?? [];
    this.physicals = init.physicals ?? [];

    this.remoteID = init.remoteID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;

    this.skuCurrencySetting = init.skuCurrencySetting;
    this.skuEligibleCurrenciesSetting = init.skuEligibleCurrenciesSetting;
    this.eligibleCurrencyCodes = init.eligibleCurrencyCodes;
    this.convertedCurrencyPrices = init.convertedCurrencyPrices;
    this.salePriceDetail = init.salePriceDetail;
    this.baseImageUrl = init.baseImageUrl;
    this.productImageOptionCodeDelimiterSetting = init.productImageOptionCodeDelimiterSetting;
    this.productImageDefaultExtensionSetting = init.productImageDefaultExtensionSetting;
    this.currentAccountContext = init.currentAccountContext;

    this.priceGroupResolver = init.priceGroupResolver;
    this.querySupport = init.querySupport;
    this.labelProvider = init.labelProvider;
  }

  // --- Persistent and audit accessors -----------------------------------------------------------

  /** [model/entity/Sku.cfc:L52] `''` while unsaved - see {@link Sku.isNew}. */
  getSkuID(): string {
    return this.skuID;
  }

  /** [model/entity/Sku.cfc:L53] */
  getActiveFlag(): boolean {
    return this.activeFlag;
  }

  /**
   * [model/entity/Sku.cfc:L54]
   *
   * Read by `SkuCurrency.getSimpleRepresentation()` [model/entity/SkuCurrency.cfc:L1029], which
   * substitutes `''` for an absent owning sku - see that module for the canonical far-side contract this
   * accessor is part of.
   */
  getSkuCode(): string | undefined {
    return this.skuCode;
  }

  /** [model/entity/Sku.cfc:L55] */
  getListPrice(): Money | undefined {
    return this.listPrice;
  }

  /** [model/entity/Sku.cfc:L56] */
  getPrice(): Money | undefined {
    return this.price;
  }

  /** [model/entity/Sku.cfc:L57] */
  getRenewalPrice(): Money | undefined {
    return this.renewalPrice;
  }

  /** [model/entity/Sku.cfc:L58] the filename only - {@link Sku.getImagePath} builds the path. */
  getImageFile(): string | undefined {
    return this.imageFile;
  }

  /** [model/entity/Sku.cfc:L59] */
  getUserDefinedPriceFlag(): boolean {
    return this.userDefinedPriceFlag;
  }

  /** [model/entity/Sku.cfc:L62] the PERSISTED quantity - not what {@link Sku.getQATS} computes. */
  getCalculatedQATS(): number | undefined {
    return this.calculatedQATS;
  }

  /** [model/entity/Sku.cfc:L89] */
  getRemoteID(): string | undefined {
    return this.remoteID;
  }

  /** [model/entity/Sku.cfc:L92] */
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /** [model/entity/Sku.cfc:L93] the creating account, reduced to its identifier. */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /** [model/entity/Sku.cfc:L94] */
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /** [model/entity/Sku.cfc:L95] the modifying account, reduced to its identifier. */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  // ==============================================================================================
  // ASSOCIATION ACCESSORS
  // ==============================================================================================
  //
  // ★ NINE OF THE FIFTEEN COLLECTIONS RETURN THE LIVE MUTABLE ARRAY. Which nine is not a judgement
  // call - it is the answer to a single mechanical question the house contract asks: does a legacy CFC
  // mutate the far side THROUGH this accessor? The census that decides it is
  //
  //   grep -rnE "array(Append|DeleteAt)\(\s*(arguments\.)?sku\.get" model/ integrationServices/
  //
  // and it returns eighteen hits over exactly nine accessors - two hits each, one append and one delete,
  // from the owning entity's own helper pair. Every other collection here is `readonly`.
  //
  // ★ `getOptions()` IS READONLY DESPITE THIS ENTITY OWNING `SwSkuOption`, which looks backwards until
  // you check what mutates it: `Option.addSku` [model/entity/Option.cfc] calls
  // `arguments.sku.addOption( this )`, an ORM-GENERATED member that mutates the FIELD, never the
  // accessor's result. Ownership does not imply liveness; the census does.

  /**
   * [model/entity/Sku.cfc:L64] the owning product, or `undefined` for an orphan sku.
   *
   * ★ THE MOST-DEREFERENCED MEMBER ON THIS CLASS - ten members reach through it - and the source guards
   * it INCONSISTENTLY. {@link Sku.getBaseProductType} and {@link Sku.getDefaultFlag} do not guard it at
   * all, and this port reproduces each site's own choice rather than normalising them.
   */
  getProduct(): Product | undefined {
    return this.product;
  }

  /** [model/entity/Sku.cfc:L65] the subscription term, from the excluded subscription module. */
  getSubscriptionTerm(): SkuSubscriptionTermLink | undefined {
    return this.subscriptionTerm;
  }

  /**
   * [model/entity/Sku.cfc:L68] LIVE - `model/entity/AlternateSkuCode.cfc:L76` appends into this result
   * and `:L85` splices out of it.
   */
  getAlternateSkuCodes(): SkuAlternateSkuCodeLink[] {
    return this.alternateSkuCodes;
  }

  /** [model/entity/Sku.cfc:L69] LIVE - `model/entity/AttributeValue.cfc:L278` and `:L287`. */
  getAttributeValues(): SkuAttributeValueLink[] {
    return this.attributeValues;
  }

  /**
   * [model/entity/Sku.cfc:L70] `lazy="extra"`, INERT in this slice.
   *
   * The order pipeline is excluded (AAP 0.2.2) and no in-scope member reads this collection, but the
   * association is retained on the `Category.cmsCategoryID` precedent: dropping it would make the entity
   * a less faithful description of `SwSku`'s actual shape, and the projection carries only the primary
   * key so nothing about the excluded aggregate leaks in.
   */
  getOrderItems(): readonly SkuOrderItemLink[] {
    return this.orderItems;
  }

  /**
   * [model/entity/Sku.cfc:L71] LIVE - `model/entity/SkuCurrency.cfc:L92` and `:L101`.
   *
   * ★ PART OF THE CANONICAL FAR-SIDE CONTRACT `skuCurrency.ts` was written against, alongside
   * {@link Sku.getSkuCode} and {@link Sku.hasSkuCurrency}. Read by STEP 2 of the currency cascade
   * [L399-L414].
   */
  getSkuCurrencies(): SkuCurrency[] {
    return this.skuCurrencies;
  }

  /**
   * [model/entity/Sku.cfc:L72] the stock rows, from the excluded stock subsystem.
   *
   * `readonly`: no far side reaches through it in this slice. {@link Sku.getStocksDeletableFlag} does not
   * read it either - it asks the service tier instead.
   */
  getStocks(): readonly SkuStockLink[] {
    return this.stocks;
  }

  /**
   * [model/entity/Sku.cfc:L75] the options that define this variant.
   *
   * `readonly` per the census note above. ELEVEN MEMBERS READ IT, more than any other collection here:
   * {@link Sku.generateImageFileName}, {@link Sku.getOptionsDisplay},
   * {@link Sku.getOptionsByOptionGroupCodeStruct}, {@link Sku.getOptionsByOptionGroupIDStruct},
   * {@link Sku.getOptionsIDList}, {@link Sku.getSkuDefinition}, {@link Sku.hasUniqueOptions},
   * {@link Sku.hasOneOptionPerOptionGroup}, plus `Product.applyFetchOptionsFilter`,
   * `Product.sortSkusByOptionGroupWeighting` and `SkuService.getProductSkus`'s sort guard.
   */
  getOptions(): readonly Option[] {
    return this.options;
  }

  /**
   * [model/entity/Sku.cfc:L76] the access-content rows, from the excluded content-access module.
   *
   * `readonly` even though {@link Sku.addAccessContent} maintains BOTH sides by hand - it mutates the
   * FAR side's `getSkus()` and this side's private field, never this accessor's result.
   */
  getAccessContents(): readonly SkuAccessContentLink[] {
    return this.accessContents;
  }

  /** [model/entity/Sku.cfc:L77] the subscription benefits, from the excluded subscription module. */
  getSubscriptionBenefits(): readonly SkuSubscriptionBenefitLink[] {
    return this.subscriptionBenefits;
  }

  /**
   * [model/entity/Sku.cfc:L78] the renewal subscription benefits.
   *
   * ★ THE ONE COLLECTION ON THIS ENTITY WITH NO HELPER PAIR ANYWHERE - not here, not on the far side.
   * The ORM maintains it alone, so there is nothing for this port to reproduce beyond exposing it.
   */
  getRenewalSubscriptionBenefits(): readonly SkuSubscriptionBenefitLink[] {
    return this.renewalSubscriptionBenefits;
  }

  /**
   * [model/entity/Sku.cfc:L81] LIVE - `model/entity/PromotionReward.cfc:L243` and `:L253`.
   *
   * The INCLUDE side of reward membership. `PromotionService.getOrderItemInReward`
   * [model/service/PromotionService.cfc:L921-L985] tests it through the reward, not through the sku.
   */
  getPromotionRewards(): PromotionReward[] {
    return this.promotionRewards;
  }

  /** [model/entity/Sku.cfc:L82] LIVE - `model/entity/PromotionReward.cfc:L343` and `:L353`. */
  getPromotionRewardExclusions(): PromotionReward[] {
    return this.promotionRewardExclusions;
  }

  /** [model/entity/Sku.cfc:L83] LIVE - `model/entity/PromotionQualifier.cfc:L185` and `:L195`. */
  getPromotionQualifiers(): PromotionQualifier[] {
    return this.promotionQualifiers;
  }

  /** [model/entity/Sku.cfc:L84] LIVE - `model/entity/PromotionQualifier.cfc:L285` and `:L295`. */
  getPromotionQualifierExclusions(): PromotionQualifier[] {
    return this.promotionQualifierExclusions;
  }

  /**
   * [model/entity/Sku.cfc:L85] LIVE - `model/entity/PriceGroupRate.cfc:L244` and `:L254`.
   *
   * ★ THE CASCADE'S FIRST LEVEL READS IT. `PriceGroupService.getRateForSkuBasedOnPriceGroup`
   * [model/service/PriceGroupService.cfc:L140-L181] walks this collection before falling through to the
   * product rate, the product-type parent chain, the global rate and finally the parent price group.
   */
  getPriceGroupRates(): PriceGroupRate[] {
    return this.priceGroupRates;
  }

  /** [model/entity/Sku.cfc:L86] LIVE - `model/entity/Physical.cfc:L204` and `:L214`. */
  getPhysicals(): SkuPhysicalLink[] {
    return this.physicals;
  }

  // ==============================================================================================
  // CONTAINMENT PROBES
  // ==============================================================================================
  //
  // ELEVEN PROBES, NO AGGREGATE PROBE. Nine are called from a far side's helper pair and two are
  // internal to this class's own helpers. Every one matches by PRIMARY KEY with a REFERENCE FALLBACK
  // when either side is unsaved, which is the house contract - and it is not interchangeable with the
  // reference-only matching `remove*` uses, so the two must never be normalised into one another.
  //
  // ★ `hasAttributeValue` IS REFERENCE-ONLY, and that is forced rather than chosen: the
  // `SkuAttributeValueLink` projection carries no key accessor, because the attribute/EAV subsystem is
  // excluded and exposing its identifier would widen the boundary for no in-scope reader.

  /** [org/Hibachi/HibachiEntity.cfc:L519] - called from `model/entity/AlternateSkuCode.cfc:L74`. */
  hasAlternateSkuCode(alternateSkuCode: SkuAlternateSkuCodeLink): boolean {
    const key = alternateSkuCode.getAlternateSkuCodeID();
    return this.alternateSkuCodes.some((candidate) =>
      key === '' || candidate.getAlternateSkuCodeID() === ''
        ? candidate === alternateSkuCode
        : candidate.getAlternateSkuCodeID() === key,
    );
  }

  /**
   * [org/Hibachi/HibachiEntity.cfc:L519] - called from `model/entity/AttributeValue.cfc:L276`.
   *
   * ★ REFERENCE-ONLY, for the boundary reason stated in the section header.
   */
  hasAttributeValue(attributeValue: SkuAttributeValueLink): boolean {
    return this.attributeValues.includes(attributeValue);
  }

  /**
   * [org/Hibachi/HibachiEntity.cfc:L519] - called from `model/entity/SkuCurrency.cfc:L90`.
   *
   * ★ THE CANONICAL FAR-SIDE PROBE `skuCurrency.ts` WAS WRITTEN AGAINST, and its documented contract is
   * exactly this: primary key with a reference fallback. That module's own note records the shape, so
   * changing it here would silently break the pair.
   */
  hasSkuCurrency(skuCurrency: SkuCurrency): boolean {
    const key = skuCurrency.getSkuCurrencyID();
    return this.skuCurrencies.some((candidate) =>
      key === '' || candidate.getSkuCurrencyID() === ''
        ? candidate === skuCurrency
        : candidate.getSkuCurrencyID() === key,
    );
  }

  /** [org/Hibachi/HibachiEntity.cfc:L519] - called from `model/entity/PriceGroupRate.cfc:L242`. */
  hasPriceGroupRate(priceGroupRate: PriceGroupRate): boolean {
    const key = priceGroupRate.getPriceGroupRateID();
    return this.priceGroupRates.some((candidate) =>
      key === '' || candidate.getPriceGroupRateID() === ''
        ? candidate === priceGroupRate
        : candidate.getPriceGroupRateID() === key,
    );
  }

  /** [org/Hibachi/HibachiEntity.cfc:L519] - called from `model/entity/PromotionReward.cfc:L241`. */
  hasPromotionReward(promotionReward: PromotionReward): boolean {
    const key = promotionReward.getPromotionRewardID();
    return this.promotionRewards.some((candidate) =>
      key === '' || candidate.getPromotionRewardID() === ''
        ? candidate === promotionReward
        : candidate.getPromotionRewardID() === key,
    );
  }

  /** [org/Hibachi/HibachiEntity.cfc:L519] - called from `model/entity/PromotionReward.cfc:L341`. */
  hasPromotionRewardExclusion(promotionReward: PromotionReward): boolean {
    const key = promotionReward.getPromotionRewardID();
    return this.promotionRewardExclusions.some((candidate) =>
      key === '' || candidate.getPromotionRewardID() === ''
        ? candidate === promotionReward
        : candidate.getPromotionRewardID() === key,
    );
  }

  /** [org/Hibachi/HibachiEntity.cfc:L519] - called from `model/entity/PromotionQualifier.cfc:L183`. */
  hasPromotionQualifier(promotionQualifier: PromotionQualifier): boolean {
    const key = promotionQualifier.getPromotionQualifierID();
    return this.promotionQualifiers.some((candidate) =>
      key === '' || candidate.getPromotionQualifierID() === ''
        ? candidate === promotionQualifier
        : candidate.getPromotionQualifierID() === key,
    );
  }

  /** [org/Hibachi/HibachiEntity.cfc:L519] - called from `model/entity/PromotionQualifier.cfc:L283`. */
  hasPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): boolean {
    const key = promotionQualifier.getPromotionQualifierID();
    return this.promotionQualifierExclusions.some((candidate) =>
      key === '' || candidate.getPromotionQualifierID() === ''
        ? candidate === promotionQualifier
        : candidate.getPromotionQualifierID() === key,
    );
  }

  /** [org/Hibachi/HibachiEntity.cfc:L519] - called from `model/entity/Physical.cfc:L202`. */
  hasPhysical(physical: SkuPhysicalLink): boolean {
    const key = physical.getPhysicalID();
    return this.physicals.some((candidate) =>
      key === '' || candidate.getPhysicalID() === ''
        ? candidate === physical
        : candidate.getPhysicalID() === key,
    );
  }

  /**
   * [model/entity/Sku.cfc:L705] - INTERNAL, called only by this class's own helper pair.
   *
   * The `SkuAccessContentLink` projection carries no key accessor, so this is reference-only for the same
   * boundary reason as {@link Sku.hasAttributeValue}: the content-access module is excluded.
   */
  hasAccessContent(accessContent: SkuAccessContentLink): boolean {
    return this.accessContents.includes(accessContent);
  }

  /**
   * [model/entity/Sku.cfc:L725] - INTERNAL, called only by this class's own helper pair.
   *
   * Reference-only, as above.
   */
  hasSubscriptionBenefit(subscriptionBenefit: SkuSubscriptionBenefitLink): boolean {
    return this.subscriptionBenefits.includes(subscriptionBenefit);
  }

  /**
   * `true` while this sku has never been persisted.
   *
   * [org/Hibachi/HibachiEntity.cfc:L571-L576, L707-L709] the framework's `getNewFlag`/`isNew` test the
   * primary key against its `unsavedvalue`, which for this entity is `''` [model/entity/Sku.cfc:L52].
   * Every helper on this class reads it as the first disjunct of its containment guard.
   */
  isNew(): boolean {
    return this.skuID === '';
  }

  // ==============================================================================================
  // LOGICAL METHODS - IMAGE [model/entity/Sku.cfc:L130-L227]
  // ==============================================================================================

  /**
   * The conventional filename for this sku's default image. [model/entity/Sku.cfc:L131-L139]
   *
   *   var optionString = "";
   *   for(var option in getOptions()){
   *     if(option.getOptionGroup().getImageGroupFlag()){
   *       optionString &= getProduct().setting('productImageOptionCodeDelimiter')
   *                     & reReplaceNoCase(option.getOptionCode(), "[^a-z0-9\-\_]","","all");
   *     }
   *   }
   *   return reReplaceNoCase(getProduct().getProductCode(), "[^a-z0-9\-\_]","","all")
   *        & optionString & ".#getProduct().setting('productImageDefaultExtension')#";
   *
   * ★ THE DELIMITER PRECEDES EACH OPTION CODE RATHER THAN SEPARATING THEM, so two image-group options
   * with delimiter `-` and product code `SHIRT` yield `SHIRT-RED-LG.jpg`, not `SHIRT-RED-LG` with the
   * first delimiter suppressed. That is `&=` accumulation and not `listAppend`, and it is preserved
   * exactly - the resulting names are what is on disk.
   *
   * ★ `reReplaceNoCase(x, "[^a-z0-9\-\_]", "", "all")` STRIPS rather than substitutes, and `NoCase`
   * makes the negated class cover A-Z as well as a-z, so upper-case letters SURVIVE. A naive port using
   * a case-sensitive `[^a-z0-9\-_]` would delete every capital and silently produce a different
   * filename; `gi` is therefore not optional here.
   *
   * SECONDARY ITEM S2: BOTH OUTWARD REACHES ARE UNGUARDED. `option.getOptionGroup()` [L135] and
   * `getProduct()` [L135, L138] are dereferenced with no `isNull` test, so an option with no group or a
   * sku with no product fails. Reproduced as raises with messages that name the real cause.
   */
  generateImageFileName(): string {
    if (this.product === undefined) {
      throw new Error(
        'Sku.generateImageFileName dereferences getProduct() unguarded ' +
          '[model/entity/Sku.cfc:L135, L138] and this sku has no product. The legacy fails on the ' +
          'same input.',
      );
    }
    if (this.productImageOptionCodeDelimiterSetting === undefined) {
      throw new Error(
        'Sku.generateImageFileName reads getProduct().setting(' +
          "'productImageOptionCodeDelimiter') [model/entity/Sku.cfc:L135] and no resolved value was " +
          'materialized for this sku. Substituting a delimiter would produce a well-formed but wrong ' +
          'filename for an image that exists on disk under another name.',
      );
    }
    if (this.productImageDefaultExtensionSetting === undefined) {
      throw new Error(
        'Sku.generateImageFileName reads getProduct().setting(' +
          "'productImageDefaultExtension') [model/entity/Sku.cfc:L138] and no resolved value was " +
          'materialized for this sku. Substituting an extension would produce a well-formed but ' +
          'wrong filename.',
      );
    }

    let optionString: string = '';
    for (const option of this.options) {
      const optionGroup = option.getOptionGroup();
      if (optionGroup === undefined) {
        throw new Error(
          'Sku.generateImageFileName dereferences option.getOptionGroup() unguarded ' +
            '[model/entity/Sku.cfc:L135] and option ' +
            `'${option.getOptionID()}' has no option group. The legacy fails on the same input.`,
        );
      }
      if (optionGroup.getImageGroupFlag()) {
        // [L136] `&=` accumulation - the delimiter PRECEDES each code. Case-insensitive strip.
        optionString += this.productImageOptionCodeDelimiterSetting;
        optionString += (option.getOptionCode() ?? '').replace(/[^a-z0-9\-_]/gi, '');
      }
    }

    // [L138] the product code is stripped the same way; `''` when the column is null, exactly as CFML
    // concatenates a null-backed accessor result.
    const productCode: string = (this.product.getProductCode() ?? '').replace(/[^a-z0-9\-_]/gi, '');
    return `${productCode}${optionString}.${this.productImageDefaultExtensionSetting}`;
  }

  /**
   * The extension of the stored image filename. [model/entity/Sku.cfc:L140-L142]
   *
   *   return listLast(getImageFile(), ".");
   *
   * ★ `listLast` ON A DOT-DELIMITED LIST, NOT A FILENAME PARSE, and the difference is observable:
   * CFML lists collapse consecutive delimiters and ignore leading and trailing ones, so `'a..jpg'`
   * yields `'jpg'`, `'photo.'` yields `'photo'` - NOT `''` - and a name with no dot at all yields the
   * WHOLE NAME. A `split('.').pop()` port gets two of those three wrong.
   *
   * TOTAL: an absent `imageFile` reads as the empty string, which is a zero-element list, and CFML's
   * `listLast('')` is `''`.
   */
  getImageExtension(): string {
    const elements: readonly string[] = (this.imageFile ?? '').split('.').filter((e) => e !== '');
    return elements.length === 0 ? '' : (elements[elements.length - 1] as string);
  }

  /**
   * The public URL of this sku's default image. [model/entity/Sku.cfc:L144-L146]
   *
   *   return "#getHibachiScope().getBaseImageURL()#/product/default/#getImageFile()#";
   *
   * `getHibachiScope()` is a framework reach into `org/Hibachi/**`, which AAP 0.2.2 designates a
   * boundary to extract from and never reimplement, so the base URL is materialized (see
   * {@link Sku.baseImageUrl}). Raises when it was not supplied rather than emitting a relative path:
   * the result is fed to `expandPath`, to file deletes and to rendered markup, and a plausible-looking
   * wrong path is worse than a failure. The same argument is recorded on `Option.getImageDirectory`.
   *
   * ★ THE `imageFile` IS INTERPOLATED WITHOUT A PRESENCE TEST, so a sku with no image file yields a
   * URL ending in `/product/default/` - a directory, not a file. Preserved: `getImageExistsFlag()` is
   * the source's own way of asking whether the result is real, and `Product.getDefaultProductImageFiles`
   * skips absent filenames precisely because this method does not.
   */
  getImagePath(): string {
    if (this.baseImageUrl === undefined) {
      throw new Error(
        'Sku.getImagePath interpolates getHibachiScope().getBaseImageURL() ' +
          '[model/entity/Sku.cfc:L145] and no resolved base image URL was materialized for this sku. ' +
          'Emitting a relative path would produce a well-formed but wrong location.',
      );
    }
    return `${this.baseImageUrl}/product/default/${this.imageFile ?? ''}`;
  }

  /**
   * A rendered `<img>` element for this sku's default image. [model/entity/Sku.cfc:L148-L150]
   *
   *   return getResizedImage(argumentcollection=arguments);
   *
   * A pure forward, so it inherits {@link Sku.getResizedImage}'s outcome - which is a raise, because
   * the image service is a stub port in this plan. Note the source's lower-case `argumentcollection`,
   * which CFML accepts and which has no bearing on behaviour.
   */
  getImage(options?: ImageResizeOptions): never {
    return this.getResizedImage(options);
  }

  /**
   * A rendered `<img>` for a resized version of this sku's default image.
   * [model/entity/Sku.cfc:L152-L189]
   *
   * NOT PORTED - it raises. The body's final statement is
   * `getService("imageService").getResizedImage(argumentCollection=arguments)` [L188], and AAP 0.2.1
   * makes the image service a NARROW STUB PORT because image handling is out of scope. What this port
   * keeps is the argument-shaping the body performs before that call, recorded here so a later
   * conversion of the image tier has the semantics written down:
   *
   *   * [L155] `arguments.imagePath = getImagePath()` - always overwritten, never read from the caller.
   *   * [L158-L161] `alt` defaults to `stringReplace(setting('imageAltString'))` ONLY when the caller
   *     omitted it AND the setting is non-empty. `stringReplace` is the Hibachi template expander, so
   *     the alt text can interpolate entity properties.
   *   * [L164-L166] `missingImagePath` defaults to `setting('imageMissingImagePath')` unconditionally
   *     when omitted, with no `len()` test - the asymmetry with `alt` is the source's.
   *   * [L167-L179] THE DEPRECATED SIZE BRANCH - see LEGACY-DEFECT D8 below.
   *
   * *** LEGACY-DEFECT [model/entity/Sku.cfc:L167-L179 vs L200-L214] (D8): THE TWO DEPRECATED-SIZE
   * BLOCKS ON THIS ENTITY DISAGREE IN TWO WAYS. (a) THIS one accepts the size POSITIONALLY as
   * `arguments[1]` [L167, L173] as well as by name; {@link Sku.getResizedImagePath}'s accepts it by
   * NAME ONLY [L200], so `getResizedImagePath('m')` silently ignores the argument and returns an
   * UNRESIZED path while `getImage('m')` honours it. (b) THIS one maps `l`/`m`/`s` to
   * `Large`/`Medium`/`Small` and LEAVES ANY OTHER VALUE UNTOUCHED [L175-L179], so `size='xl'` reads
   * `setting("productImagexlWidth")`; the other block's `else` forces EVERY unrecognised value to
   * `Small` [L206-L208]. The same input therefore produces different dimensions through the two
   * members. Preserved deliberately; do not fix without a product decision.
   */
  getResizedImage(_options?: ImageResizeOptions): never {
    throw new Error(
      'Sku.getResizedImage delegates to the image service ' +
        '[model/entity/Sku.cfc:L188], which AAP 0.2.1 makes a narrow stub port because image ' +
        'handling is out of scope for this slice. The argument-shaping the legacy performs before ' +
        'that call is documented at this member.',
    );
  }

  /**
   * The path of a resized version of this sku's default image. [model/entity/Sku.cfc:L191-L218]
   *
   * NOT PORTED - it raises, for the same reason as {@link Sku.getResizedImage}: the final statement is
   * `getService("imageService").getResizedImagePath(argumentCollection=arguments)` [L217].
   *
   * Its argument shaping differs from its sibling's in exactly the two ways LEGACY-DEFECT D8 records,
   * and it also LACKS the `alt` defaulting altogether - reasonably, since a path has no alt text.
   *
   * ★ THIS IS THE MEMBER `Product.getImageGalleryArray` CALLS THREE TIMES PER SKU
   * [model/entity/Product.cfc:L283], so that method raises transitively. `product.ts` records the same
   * fact from the other side; neither works around it, because the gallery's STRUCTURE is the behaviour
   * worth porting and its consumers are the excluded admin and storefront views.
   */
  getResizedImagePath(_options?: ImageResizeOptions): never {
    throw new Error(
      'Sku.getResizedImagePath delegates to the image service ' +
        '[model/entity/Sku.cfc:L217], which AAP 0.2.1 makes a narrow stub port because image ' +
        'handling is out of scope for this slice.',
    );
  }

  /**
   * Whether the default image file is actually present. [model/entity/Sku.cfc:L221-L227]
   *
   *   if( fileExists(expandPath(getImagePath())) ) { return true; } else { return false; }
   *
   * NOT PORTED - it raises. `expandPath` maps a web-relative path onto the CFML application's
   * filesystem root, a framework service `org/Hibachi/**` supplies and that a Lambda has no equivalent
   * of; and `fileExists` asks a question about local disk that is meaningless where product images live
   * in object storage. `src/domain/ports/imageStore.ts` deliberately declares only `saveImageFile` and
   * `deleteImageFile`, so there is no existence probe to route this through either.
   *
   * ★ RAISING RATHER THAN ANSWERING `false` IS THE POINT. `false` is a legitimate answer this method
   * really can give, so returning it would be indistinguishable from a genuine "not on disk" and would
   * make callers silently render the missing-image placeholder for every sku. A raise says the question
   * was not asked, which is the truth.
   */
  getImageExistsFlag(): never {
    throw new Error(
      'Sku.getImageExistsFlag performs fileExists(expandPath(...)) ' +
        '[model/entity/Sku.cfc:L222] against the CFML application root, which has no equivalent in ' +
        'this runtime, and src/domain/ports/imageStore.ts declares no existence probe. Answering ' +
        'false would be indistinguishable from a genuine miss.',
    );
  }

  // ==============================================================================================
  // LOGICAL METHODS - OPTION [model/entity/Sku.cfc:L231-L253]
  // ==============================================================================================

  /**
   * This sku's option names joined for display. [model/entity/Sku.cfc:L233-L239]
   *
   *   var dspOptions = "";
   *   for(var i=1;i<=arrayLen(getOptions());i++) {
   *     dspOptions = listAppend(dspOptions, getOptions()[i].getOptionName(), arguments.delimiter);
   *   }
   *   return dspOptions;
   *
   * ★ `listAppend` AND NOT `arrayToList`, AND THE DIFFERENCE IS CONFINED TO THE LEADING POSITION.
   * `listAppend` suppresses the delimiter only while the accumulator is still empty. So `listAppend('',
   * '')` is `''`: an option with no name in FIRST position contributes nothing at all and leaves no
   * leading delimiter, where `arrayToList(['', 'LG'], ' ')` would yield `' LG'`. But `listAppend('RED',
   * '')` is `'RED '` and NOT `'RED'` - a later empty name still contributes a BARE DELIMITER.
   *
   * Empty names therefore do NOT generally vanish, and this doc previously claimed they did. The claim
   * was disproved by executing the shared helper rather than by re-reading it, which is the only reason
   * it was caught: the implementation below was already correct, because it delegates. A port that had
   * hand-rolled the join to match the mistaken reading would have trimmed a trailing space the source
   * emits. Ported through the shared `listAppend` helper so the exact asymmetry is inherited rather than
   * re-derived.
   *
   * ★ THE DEFAULT DELIMITER IS A SINGLE SPACE [L233], not a comma, which is the one place in this
   * entity where a CFML list is built on a non-default delimiter.
   *
   * TOTAL - no dereference here can fail.
   */
  getOptionsDisplay(delimiter: string = ' '): string {
    let dspOptions: string = '';
    for (const option of this.options) {
      dspOptions = listAppend(dspOptions, option.getOptionName() ?? '', delimiter);
    }
    return dspOptions;
  }

  /**
   * This sku's option within a given option group, by group id. [model/entity/Sku.cfc:L241-L245]
   *
   *   if(structKeyExists(getOptionsByOptionGroupIDStruct(), arguments.optionGroupID)) {
   *     return getOptionsByOptionGroupIDStruct()[ arguments.optionGroupID ];
   *   }
   *
   * ★ NO `else`, SO A MISS RETURNS NULL - and that null is load-bearing in the same way the currency
   * accessors' is: the declared `returntype="any"` accepts it, and callers test the result. `undefined`
   * here, never a placeholder option.
   */
  getOptionByOptionGroupID(optionGroupID: string): Option | undefined {
    const byID: Record<string, Option> = this.getOptionsByOptionGroupIDStruct();
    return structKeyExists(byID, optionGroupID) ? structGet(byID, optionGroupID) : undefined;
  }

  /**
   * This sku's option within a given option group, by group CODE. [model/entity/Sku.cfc:L247-L251]
   *
   *   if(structKeyExists(getOptionsByOptionGroupCodeStruct(), arguments.optionGroupCode)) {
   *     return getOptionsByOptionGroupIDStruct()[ arguments.optionGroupCode ];
   *   }
   *
   * *** LEGACY-DEFECT [model/entity/Sku.cfc:L247-L251] (D2): IT GUARDS ONE STRUCT AND READS ANOTHER.
   * The `structKeyExists` test [L248] interrogates the CODE-keyed struct, and the subscript [L249] then
   * indexes the ID-keyed struct with the same option group CODE. Codes and uuids never collide, so when
   * the guard passes the read misses - and in CFML, subscripting a struct with an absent key RAISES
   * rather than yielding null, so this member THROWS for exactly the inputs it was meant to succeed on
   * and returns null for every input it was meant to reject.
   *
   * ★ THE DEFECT IS ALSO SELF-CANCELLING IN THE LEGACY, AND WOULD NOT BE HERE. D3 leaves the
   * code-keyed struct permanently EMPTY, so the guard never passes and the broken read is never
   * reached: the method silently answers null for everything. This port FIXES D3 (see
   * {@link Sku.getOptionsByOptionGroupCodeStruct}), which un-hides D2 and makes the raise reachable -
   * so preserving D2 here means the raise is now the observable behaviour on a code that IS present.
   * That is the correct outcome under AAP 0.6.7: D3 is one of the three sanctioned divergences and D2
   * is not, so each is treated on its own terms rather than one being used to excuse the other.
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  getOptionByOptionGroupCode(optionGroupCode: string): Option | undefined {
    // [L248] the guard reads the CODE-keyed struct.
    if (!structKeyExists(this.getOptionsByOptionGroupCodeStruct(), optionGroupCode)) {
      return undefined;
    }

    // [L249] ...and the subscript reads the ID-keyed struct. A CFML struct subscript on an absent key
    // raises, so this is a raise and not an `undefined`.
    const byID: Record<string, Option> = this.getOptionsByOptionGroupIDStruct();
    if (!structKeyExists(byID, optionGroupCode)) {
      throw new Error(
        'Sku.getOptionByOptionGroupCode guards getOptionsByOptionGroupCodeStruct() and then ' +
          'subscripts getOptionsByOptionGroupIDStruct() with the same option group CODE ' +
          `'${optionGroupCode}' [model/entity/Sku.cfc:L248-L249]. Codes are never uuids, so the read ` +
          'misses and the legacy struct subscript raises. Preserved deliberately.',
      );
    }
    return structGet(byID, optionGroupCode);
  }

  // ==============================================================================================
  // LOGICAL METHODS - PRICE AND CURRENCY [model/entity/Sku.cfc:L255-L287]
  // ==============================================================================================

  /**
   * This sku's price under a given promotion. [model/entity/Sku.cfc:L257-L259]
   *
   *   return getService("promotionService").calculateSkuPriceBasedOnPromotion(
   *     sku=this, promotion=arguments.promotion);
   *
   * *** LEGACY-DEFECT [model/entity/Sku.cfc:L258] (D1): THE CALL TARGET DOES NOT EXIST. A
   * repository-wide search for `calculateSkuPriceBasedOnPromotion` returns EXACTLY ONE HIT - this call
   * site. `model/service/PromotionService.cfc` declares no such method, and because the missing member
   * is reached on a SERVICE rather than an entity there is no `onMissingMethod` fallback to absorb it,
   * so the request fails with a plain missing-method error. AAP 0.6.7 registers this as defect 16 and
   * AAP 0.4.2 maps the target signature to `never` for precisely this reason.
   *
   * ★ THE PARAMETER IS STILL TYPED, AND DELIBERATELY SO. Interface parity is the acceptance contract
   * (AAP 0.8.1), so the member must be callable with a promotion and must fail at CALL TIME, not at
   * compile time - a reviewer diffing the two surfaces sees the same one-argument method here as there.
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  getPriceByPromotion(_promotion: Promotion): never {
    throw new Error(
      'Sku.getPriceByPromotion calls promotionService.calculateSkuPriceBasedOnPromotion ' +
        '[model/entity/Sku.cfc:L258], which is declared nowhere in the legacy source - the call site ' +
        'is its only occurrence in the repository. AAP 0.6.7 defect 16. The legacy fails at runtime ' +
        'on every invocation.',
    );
  }

  /**
   * This sku's price under a given price group. [model/entity/Sku.cfc:L261-L263]
   *
   *   return getService("priceGroupService").calculateSkuPriceBasedOnPriceGroup(
   *     sku=this, priceGroup=arguments.priceGroup);
   *
   * SYNCHRONOUS, and that is the AAP's ruling rather than this file's convenience: AAP 0.4.2 maps
   * `calculateSkuPriceBasedOnPriceGroup` to a synchronous signature because its body walks the already
   * materialized rate graph and performs arithmetic - it reaches no DAO. The collaborator is the
   * F11-relocated {@link SkuPriceGroupResolver}, declared module-locally and un-exported.
   */
  getPriceByPriceGroup(priceGroup: PriceGroup): Money {
    if (this.priceGroupResolver === undefined) {
      throw new Error(
        'Sku.getPriceByPriceGroup reaches priceGroupService.calculateSkuPriceBasedOnPriceGroup ' +
          '[model/entity/Sku.cfc:L262] and no price-group resolver was injected into this sku.',
      );
    }
    return this.priceGroupResolver.calculateSkuPriceBasedOnPriceGroup(this, priceGroup);
  }

  /**
   * The price-group rate that actually applies to this sku. [model/entity/Sku.cfc:L265-L267]
   *
   *   return getService("priceGroupService").getRateForSkuBasedOnPriceGroup(
   *     sku=this, priceGroup=arguments.priceGroup);
   *
   * `undefined` when no level of the five-level cascade matches, which is the legacy's null - AAP 0.4.2
   * maps the service method to `PriceGroupRate | undefined` for the same reason. Synchronous, as above.
   */
  getAppliedPriceGroupRateByPriceGroup(priceGroup: PriceGroup): PriceGroupRate | undefined {
    if (this.priceGroupResolver === undefined) {
      throw new Error(
        'Sku.getAppliedPriceGroupRateByPriceGroup reaches ' +
          'priceGroupService.getRateForSkuBasedOnPriceGroup [model/entity/Sku.cfc:L266] and no ' +
          'price-group resolver was injected into this sku.',
      );
    }
    return this.priceGroupResolver.getRateForSkuBasedOnPriceGroup(this, priceGroup);
  }

  /**
   * This sku's price in a given currency, or `undefined`. [model/entity/Sku.cfc:L269-L273]
   *
   *   if(structKeyExists(getCurrencyDetails(), arguments.currencyCode)) {
   *     return getCurrencyDetails()[ arguments.currencyCode ].price;
   *   }
   *
   * ★ ONE OF THE THREE MUST-PRESERVE AREAS, AND THE `undefined` IS THE PART THAT MATTERS. There is no
   * `else` and no fallback: an unknown currency yields null. AAP 0.6.3 states the consequence in one
   * sentence - substituting `0` for these nulls would silently sell products for free - and AAP 0.9.2
   * names this the single highest-consequence parity check in the plan.
   *
   * ★ SINGLE-CHECK, UNLIKE ITS TWO SIBLINGS. This member tests only that the CURRENCY is present and
   * then reads `.price` unconditionally, where {@link Sku.getListPriceByCurrencyCode} and
   * {@link Sku.getRenewalPriceByCurrencyCode} test the SUB-KEY as well. The asymmetry is real and is
   * reproduced: `price` is the one key every step of the cascade writes when it writes anything
   * [L394, L409, L425], so the source's author could rely on its presence - but step 1 writes
   * `skuCurrencyID` BEFORE any price [L382], so a currency whose eligible row matched no step at all
   * exists in the map with no `price` key. This port answers `undefined` there rather than raising,
   * because CFML's `.price` on a struct missing that key raises and a raise from a price accessor
   * would be a far worse outcome than the null the method already promises for the neighbouring case.
   * See {@link CurrencyDetail} for why the field is optional in the type.
   */
  getPriceByCurrencyCode(currencyCode: string): Money | undefined {
    const details = this.getCurrencyDetails();
    if (!structKeyExists(details, currencyCode)) {
      return undefined;
    }
    return structGet(details, currencyCode)?.price;
  }

  /**
   * This sku's list price in a given currency, or `undefined`. [model/entity/Sku.cfc:L275-L279]
   *
   *   if(structKeyExists(getCurrencyDetails(), arguments.currencyCode)
   *      && structKeyExists(getCurrencyDetails()[ arguments.currencyCode ], "listPrice")) {
   *     return getCurrencyDetails()[ arguments.currencyCode ].listPrice;
   *   }
   *
   * ★ THE SECOND EXISTENCE CHECK IS THE WHOLE POINT: this returns `undefined` EVEN FOR A CURRENCY THAT
   * IS PRESENT IN THE MAP, when no step recorded a list price for it. That happens routinely - step 1
   * only writes `listPrice` when the sku's own column is non-null [L390], step 2 only when the override
   * row's is [L405], and step 3 only when the sku's own is [L421]. AAP 0.6.3 calls this out
   * specifically.
   */
  getListPriceByCurrencyCode(currencyCode: string): Money | undefined {
    const details = this.getCurrencyDetails();
    if (!structKeyExists(details, currencyCode)) {
      return undefined;
    }
    const detail: CurrencyDetail | undefined = structGet(details, currencyCode);
    // [L276] the SECOND structKeyExists - on the sub-key, not the currency.
    if (detail === undefined || !structKeyExists(detail, 'listPrice')) {
      return undefined;
    }
    return detail.listPrice;
  }

  /**
   * This sku's renewal price in a given currency, or `undefined`. [model/entity/Sku.cfc:L281-L285]
   *
   * Structurally identical to {@link Sku.getListPriceByCurrencyCode}, including the second existence
   * check, and `undefined` is load-bearing for the same reason.
   */
  getRenewalPriceByCurrencyCode(currencyCode: string): Money | undefined {
    const details = this.getCurrencyDetails();
    if (!structKeyExists(details, currencyCode)) {
      return undefined;
    }
    const detail: CurrencyDetail | undefined = structGet(details, currencyCode);
    if (detail === undefined || !structKeyExists(detail, 'renewalPrice')) {
      return undefined;
    }
    return detail.renewalPrice;
  }

  // ==============================================================================================
  // LOGICAL METHODS - QUANTITY [model/entity/Sku.cfc:L289-L317]
  // ==============================================================================================

  /**
   * A quantity of this sku by type. [model/entity/Sku.cfc:L291-L316]
   *
   * NOT PORTED - it raises for every input. The stock, location and inventory subsystems are all
   * excluded (AAP 0.2.2) and this member reaches all three: `locationService` [L295], `stockService`
   * [L296, L300] and `inventoryService` [L310]. What IS ported is the documentation of its dispatch,
   * because the same two whitelists appear on `Product` and the pair only makes sense together:
   *
   *   * [L294-L302] TWO EARLY DELEGATIONS, both gated on the CALCULATED whitelist
   *     `QC,QE,QNC,QATS,QIATS` AND on the presence of a `locationID` or a `stockID`. The location form
   *     resolves the location, then the stock for this sku at it; the stock form resolves the stock
   *     directly. Both then ask the STOCK for the quantity.
   *   * [L305] a memo guard, `!structKeyExists(variables, arguments.quantityType)` - so the memo slot
   *     name IS the quantity type, computed at runtime.
   *   * [L306-L308] THE ORDER whitelist `QOH,QOSH,QNDOO,QNDORVO,QNDOSA,QNRORO,QNROVO,QNROSA` sets
   *     `arguments.skuID = this.getSkuID()` and forwards the WHOLE argument collection to
   *     `getProduct().getQuantity(...)` - which is itself a `never` in this port
   *     [model/entity/Product.cfc:L434].
   *   * [L309-L310] THE CALCULATED whitelist invokes `inventoryService` dynamically as
   *     `get#quantityType#` with `{entity=this}` and MEMOIZES the result.
   *   * [L311-L313] anything else throws, and the message enumerates all thirteen valid types.
   *
   * ★ THE TWO WHITELISTS ARE DISJOINT AND ARE MATCHED CASE-INSENSITIVELY (`listFindNoCase`), so
   * `'qats'` is accepted. A port that reintroduces this member must fold the comparison.
   *
   * ★ AND NOTE WHAT THE EARLY DELEGATIONS SKIP: they bypass the memo entirely, so a location- or
   * stock-scoped read is never cached while an entity-scoped one always is. That asymmetry is the
   * source's and would need reproducing.
   *
   * The raise below reproduces the SHAPE of [L312]'s message for an invalid type and states the real
   * reason for a valid one, so a caller learns which of the two it hit.
   */
  getQuantity(quantityType: string, _locationID?: string, _stockID?: string): never {
    const orderWhitelist: readonly string[] = [
      'QOH',
      'QOSH',
      'QNDOO',
      'QNDORVO',
      'QNDOSA',
      'QNRORO',
      'QNROVO',
      'QNROSA',
    ];
    const calculatedWhitelist: readonly string[] = ['QC', 'QE', 'QNC', 'QATS', 'QIATS'];
    const folded: string = quantityType.toUpperCase();

    if (!orderWhitelist.includes(folded) && !calculatedWhitelist.includes(folded)) {
      // [model/entity/Sku.cfc:L312] the source's own message, reproduced verbatim.
      throw new Error(
        `The quantity type you passed in '${quantityType}' is not a valid quantity type.  Valid ` +
          'quantity types are: QOH, QOSH, QNDOO, QNDORVO, QNDOSA, QNRORO, QNROVO, QNROSA, QC, QE, ' +
          'QNC, QATS, QIATS',
      );
    }

    throw new Error(
      `Sku.getQuantity('${quantityType}') reaches the stock, location and inventory subsystems ` +
        '[model/entity/Sku.cfc:L295-L296, L300, L308, L310], all of which AAP 0.2.2 excludes from ' +
        'this slice. The dispatch it performs is documented at this member.',
    );
  }

  // ==============================================================================================
  // NON-PERSISTENT PROPERTY METHODS [model/entity/Sku.cfc:L321-L597]
  // ==============================================================================================

  /**
   * A 55x55 rendering of this sku's image, for admin lists. [model/entity/Sku.cfc:L323-L325]
   *
   *   return getImage(width=55, height=55);
   *
   * Ported as a pure forward, so it raises transitively through the stubbed image service. The literal
   * dimensions are the source's and are carried verbatim - they are the only place in this entity where
   * an image size is hard-coded rather than read from a setting.
   */
  getAdminIcon(): never {
    return this.getImage({ width: 55, height: 55 });
  }

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L327-L354]: `getAssignedOrderItemAttributeSetSmartList()` IS NOT
   * PORTED.
   *
   * It falls on the third side of the smart-list dividing line stated in the module header: the smart
   * list IS the whole behaviour, and its consumers are the excluded admin views. The body assembles an
   * `attributeService` smart list, applies two filters (`activeFlag=1` and
   * `attributeSetType.systemCode='astOrderItem'`), LEFT-joins four related properties, and then adds a
   * hand-built OR-condition [L340-L350].
   *
   * ★ TWO FACTS ARE RECORDED HERE BECAUSE THEY MATTER ELSEWHERE.
   *
   * FIRST, THE WHERE CONDITION INTERPOLATES FOUR ENTITY VALUES DIRECTLY INTO SQL TEXT [L342, L343,
   * L345, L347] with no parameterisation. Every one is a uuid or a uuid path today, so it is not
   * exploitable - but AAP 0.8.3 commits this port to parameterised SQL exclusively, so any future
   * conversion of this member must bind rather than interpolate. `model/entity/Product.cfc:L795-L822`
   * carries the identical wart and the identical note.
   *
   * SECOND, IT CONVERTS A COMMA PATH INTO AN SQL `IN` LIST by `replace(path, ",", "','", "all")`
   * [L342] - the idiom that belongs in `src/domain/valueObjects/materializedIdPath.ts` rather than in an
   * entity, and the reason that value object exists.
   *
   * ★ AND UNLIKE ITS `Product` TWIN, THIS BODY GUARDS `getProduct().getBrand()` [L344] BUT NOT
   * `getProduct().getProductType()` [L342] - see secondary item S4 at
   * {@link Sku.getAssignedAttributeSetSmartList}, where the same asymmetry appears again.
   */

  /**
   * The system code of this sku's product's root product type. [model/entity/Sku.cfc:L356-L358]
   *
   *   return getProduct().getBaseProductType();
   *
   * ★ UNGUARDED, AND THE ASYMMETRY IS DELIBERATE ON THE SOURCE'S PART OR NOT AT ALL - either way it is
   * reproduced. `model/dao/SkuDAO.cfc:L156` builds an HQL filter from this value, and
   * `Product.applyFetchOptionsFilter` branches on it, so an orphan sku failing here fails early rather
   * than being silently classified as a non-merchandise sku.
   *
   * `undefined` when the product's own root product type has no system code - `ProductType`'s accessor
   * is `string | undefined` and this member forwards it unchanged.
   */
  getBaseProductType(): string | undefined {
    if (this.product === undefined) {
      throw new Error(
        'Sku.getBaseProductType dereferences getProduct() unguarded ' +
          '[model/entity/Sku.cfc:L357] and this sku has no product. The legacy fails on the same ' +
          'input.',
      );
    }
    return this.product.getBaseProductType();
  }

  /**
   * This sku's base currency code. [model/entity/Sku.cfc:L360-L365]
   *
   *   if(!structKeyExists(variables, "currencyCode")) {
   *     variables.currencyCode = this.setting('skuCurrency');
   *   }
   *   return variables.currencyCode;
   *
   * ★ THERE IS NO HARDCODED `"USD"` HERE, AND AAP 0.6.3 IS EMPHATIC THAT THERE MUST NOT BE. The prompt
   * describes an order -> SKU -> `skuCurrency` -> USD-default cascade, and the USD default is a SETTING
   * DEFAULT: `skuCurrency` is declared `{fieldType="select", defaultValue="USD"}` at
   * [model/service/SettingService.cfc:L221]. This member memoizes the resolved setting and does nothing
   * else. Baking a literal in would move the default one tier inward and make it unconfigurable.
   *
   * `string` and not the branded `CurrencyCode`, per the AAP 0.4.2 mapping - the setting is free text at
   * source and validating it here would add a failure mode the legacy does not have.
   *
   * Raises when the setting was not materialized, on the {@link Sku.skuCurrencySetting} reasoning: a
   * substituted `'USD'` would be a well-formed wrong answer that silently reprices the catalogue.
   */
  getCurrencyCode(): string {
    if (this.currencyCode === undefined) {
      if (this.skuCurrencySetting === undefined) {
        throw new Error(
          "Sku.getCurrencyCode reads this.setting('skuCurrency') " +
            '[model/entity/Sku.cfc:L362] and no resolved value was materialized for this sku. The ' +
            "legacy always resolves it, defaulting to 'USD' at " +
            'model/service/SettingService.cfc:L221; substituting that literal here would move the ' +
            'default inward and make it unconfigurable.',
        );
      }
      this.currencyCode = this.skuCurrencySetting;
    }
    return this.currencyCode;
  }

  /**
   * The per-currency price map for this sku. [model/entity/Sku.cfc:L367-L433]
   *
   * ★★ THIS IS THE CENTREPIECE OF THE WHOLE MODULE. AAP 0.8.1 names the price-group and currency
   * resolution cascade as one of exactly THREE must-preserve areas, AAP 0.6.3 devotes a whole
   * sub-section to it, and AAP 0.9.3 requires it to be tested at all four steps including the gate. It
   * is also the reason `SkuCurrency` is in scope at all (AAP 0.2.1).
   *
   * THE STRUCTURE, STEP BY STEP, WITH THE SOURCE'S OWN ORDERING:
   *
   *   STEP 0 - THE ELIGIBILITY GATE [L373]. The ENTIRE body is wrapped in
   *   `if(len(setting('skuEligibleCurrencies')))`. When that setting resolves empty the memo stays `{}`
   *   and EVERY currency accessor on this class answers `undefined` for EVERY currency. The setting's
   *   own default is `getCurrencyService().getAllActiveCurrencyIDList()`
   *   [model/service/SettingService.cfc:L222], so a normal installation populates it - but the gate is
   *   real, and AAP 0.6.3 warns specifically that dropping it changes behaviour in the edge case.
   *
   *   The eligible rows are then narrowed by ONE filter, `addInFilter('currencyCode', ...)` [L375], and
   *   NOT by active status - `src/domain/ports/currencyConverter.ts` documents the same fact from the
   *   other side and warns that adding an active filter would be a behaviour change.
   *
   *   STEP 1 - THE SKU'S OWN COLUMNS [L385-L397], applied only to the single eligible currency EQUAL to
   *   `this.setting('skuCurrency')`. `renewalPrice` and `listPrice` are written only when non-null
   *   [L386, L390]; `price` is written UNCONDITIONALLY [L394]; `converted` is set FALSE [L396].
   *
   *   STEP 2 - `SwSkuCurrency` OVERRIDE ROWS [L399-L414], which OVERWRITE anything step 1 wrote for the
   *   same currency. Same three conditional/unconditional writes, `converted` FALSE again [L411], and
   *   additionally `skuCurrencyID` [L412] - the ONLY step that sets it to anything but `''`.
   *
   *   ★ THE INNER LOOP HAS NO `break`, so when a sku carries TWO override rows for the same currency
   *   the LAST one wins. There is no unique constraint preventing that. Reproduced.
   *
   *   STEP 3 - ON-THE-FLY CONVERSION [L416-L428], gated on `!structKeyExists(details[code], "price")`
   *   so it runs ONLY where neither earlier step supplied a price. `renewalPrice` and `listPrice` are
   *   converted only when the SKU'S OWN corresponding column is non-null [L417, L421] - note it tests
   *   the sku's column, not the map - and `price` is converted unconditionally [L425]. `converted` is
   *   set TRUE [L427].
   *
   * ★ WHY THIS MEMBER IS SYNCHRONOUS. `CurrencyConverter.convertCurrency` is `async` - conversion rates
   * live in the database - while AAP 0.4.1 requires {@link Sku.getPriceByCurrencyCode} to stay
   * synchronous, and AAP 0.6.3 states the porting strategy explicitly: the currency detail map is
   * materialized at the repository boundary. What is materialized is ONLY THE ARITHMETIC: the eligible
   * currency list ({@link Sku.eligibleCurrencyCodes}) and step 3's three converted amounts
   * ({@link Sku.convertedCurrencyPrices}). Every DECISION - the gate, which step wins, the
   * `structKeyExists(..., "price")` suppression, the two null tests, and the `converted` flag - stays
   * here, in the domain.
   *
   * ★ WHY A KEY IS NEVER WRITTEN WITH AN `undefined` VALUE. `src/lib/cfml/struct.ts` keeps ABSENT and
   * PRESENT-BUT-`undefined` as different states, deliberately, because the legacy's two-check accessors
   * depend on the difference. CFML has the same property from the other direction: assigning a
   * null-returning expression to a struct key does not create the key, so `structKeyExists` stays false.
   * Every write below is therefore guarded, including the three the source performs
   * "unconditionally" - for a persisted row those columns carry `default="0"` and are never null, so the
   * guard is unobservable there and is load-bearing only for a hand-built sku.
   *
   * THE THREE `*Formatted` KEYS ARE NOT REPRODUCED - see {@link CurrencyDetail} for the census that
   * settled it and for the reason a substitute would be worse than an omission.
   */
  getCurrencyDetails(): Readonly<Record<string, CurrencyDetail>> {
    if (this.currencyDetails !== undefined) {
      return this.currencyDetails;
    }

    // [model/entity/Sku.cfc:L369] `variables.currencyDetails = {};`
    const details: Record<string, CurrencyDetail> = {};

    // [L373] STEP 0 - THE ELIGIBILITY GATE. `cfLen` reproduces CFML's `len()` over a possibly-absent
    // setting: an unresolved setting is a zero-length value and the gate closes, which is the same
    // outcome the legacy reaches for an empty setting.
    if (cfLen(this.skuEligibleCurrenciesSetting ?? '') > 0) {
      if (this.skuCurrencySetting === undefined) {
        throw new Error(
          "Sku.getCurrencyDetails compares each eligible currency to this.setting('skuCurrency') " +
            '[model/entity/Sku.cfc:L385] and no resolved base currency was materialized for this ' +
            'sku. Every step of the cascade is keyed on that comparison, so proceeding would ' +
            'produce a map in which no currency is ever recognised as the base currency.',
        );
      }
      if (this.eligibleCurrencyCodes === undefined) {
        throw new Error(
          'Sku.getCurrencyDetails iterates the eligible currency rows ' +
            '[model/entity/Sku.cfc:L377-L379] and none were materialized for this sku, even though ' +
            "the skuEligibleCurrencies setting is non-empty. An empty list here would answer 'no " +
            "prices in any currency' for a sku that has them.",
        );
      }

      // [L377-L379] one iteration per eligible currency row, in the record set's order.
      for (const thisCurrencyCode of this.eligibleCurrencyCodes) {
        // [L381-L382] the entry is created, and `skuCurrencyID` is seeded to `''`, BEFORE any price is
        // considered. This is why `skuCurrencyID` is the one required member of CurrencyDetail and why
        // `price` is optional: an eligible currency that matches no step still has an entry.
        const detail: {
          price?: Money;
          listPrice?: Money;
          renewalPrice?: Money;
          converted?: boolean;
          skuCurrencyID: string;
        } = { skuCurrencyID: '' };

        // [L385] STEP 1 - the sku's own columns, for the base currency only. `cfEquals` folds case, as
        // CFML's `eq` does; both operands are known present here, so it cannot raise.
        if (cfEquals(thisCurrencyCode, this.skuCurrencySetting)) {
          // [L386-L389] conditional on the column being non-null.
          if (this.renewalPrice !== undefined) {
            detail.renewalPrice = this.renewalPrice;
          }
          // [L390-L393] likewise.
          if (this.listPrice !== undefined) {
            detail.listPrice = this.listPrice;
          }
          // [L394] unconditional at source; see the header note on why the guard is still correct.
          if (this.price !== undefined) {
            detail.price = this.price;
          }
          // [L396]
          detail.converted = false;
        }

        // [L399-L414] STEP 2 - `SwSkuCurrency` override rows OVERWRITE step 1. No `break`, so the last
        // matching row wins.
        for (const skuCurrency of this.skuCurrencies) {
          // [L400] the row's currency code is branded and required, so this comparison cannot raise.
          if (cfEquals(skuCurrency.getCurrencyCode(), thisCurrencyCode)) {
            const rowRenewalPrice: Money | undefined = skuCurrency.getRenewalPrice();
            // [L401-L404]
            if (rowRenewalPrice !== undefined) {
              detail.renewalPrice = rowRenewalPrice;
            }
            const rowListPrice: Money | undefined = skuCurrency.getListPrice();
            // [L405-L408]
            if (rowListPrice !== undefined) {
              detail.listPrice = rowListPrice;
            }
            const rowPrice: Money | undefined = skuCurrency.getPrice();
            // [L409]
            if (rowPrice !== undefined) {
              detail.price = rowPrice;
            }
            // [L411]
            detail.converted = false;
            // [L412] the ONLY write of a non-empty skuCurrencyID anywhere in the cascade.
            detail.skuCurrencyID = skuCurrency.getSkuCurrencyID();
          }
        }

        // [L416] STEP 3 - suppressed entirely when a price is already present. This is the test that
        // makes ABSENT-versus-PRESENT-`undefined` matter, and it is why no earlier write installs an
        // undefined value.
        if (detail.price === undefined) {
          const converted: ConvertedCurrencyPrices | undefined =
            this.convertedCurrencyPrices?.[thisCurrencyCode];

          // [L417] the guard tests THE SKU'S OWN renewal price, not the map's.
          if (this.renewalPrice !== undefined) {
            if (converted?.renewalPrice === undefined) {
              throw new Error(
                'Sku.getCurrencyDetails needs a converted renewal price for ' +
                  `'${thisCurrencyCode}' [model/entity/Sku.cfc:L418] because this sku carries a ` +
                  'renewal price and no earlier cascade step supplied one for that currency, but ' +
                  'none was materialized. Omitting it would make the renewal price silently absent ' +
                  'in that currency.',
              );
            }
            detail.renewalPrice = converted.renewalPrice;
          }

          // [L421] likewise, the guard tests the sku's own list price.
          if (this.listPrice !== undefined) {
            if (converted?.listPrice === undefined) {
              throw new Error(
                'Sku.getCurrencyDetails needs a converted list price for ' +
                  `'${thisCurrencyCode}' [model/entity/Sku.cfc:L422] because this sku carries a list ` +
                  'price and no earlier cascade step supplied one for that currency, but none was ' +
                  'materialized.',
              );
            }
            detail.listPrice = converted.listPrice;
          }

          // [L425] unconditional at source. The sku's own `price` is what gets converted, so when the
          // sku has none there is nothing to convert and nothing to install - which leaves the entry
          // with no `price` key at all, exactly the hole {@link Sku.getPriceByCurrencyCode} answers
          // `undefined` for.
          if (this.price !== undefined) {
            if (converted?.price === undefined) {
              throw new Error(
                `Sku.getCurrencyDetails needs a converted price for '${thisCurrencyCode}' ` +
                  '[model/entity/Sku.cfc:L425] because this sku carries a price and no earlier ' +
                  'cascade step supplied one for that currency, but none was materialized. ' +
                  'Answering undefined here would let a caller read no price for an eligible ' +
                  'currency, which AAP 0.6.3 identifies as the failure that sells products for free.',
              );
            }
            detail.price = converted.price;
          }

          // [L427]
          detail.converted = true;
        }

        details[thisCurrencyCode] = detail;
      }
    }

    this.currencyDetails = details;
    return this.currencyDetails;
  }

  /**
   * This sku's price for the requesting account. [model/entity/Sku.cfc:L435-L440]
   *
   *   if(!structKeyExists(variables, "currentAccountPrice")) {
   *     variables.currentAccountPrice = getService("priceGroupService")
   *       .calculateSkuPriceBasedOnCurrentAccount(sku=this);
   *   }
   *   return variables.currentAccountPrice;
   *
   * ASYNC, because AAP 0.4.2 declares `calculateSkuPriceBasedOnCurrentAccount` async - its body reaches
   * the subscription price-group query behind the price-group repository port. This is one of the four
   * genuinely asynchronous members on this class.
   *
   * ★ AND IT TAKES NO PARAMETER, WHICH IS THE POINT. The legacy reads the account from the ambient
   * request scope through the inconsistent `getSlatwallScope()`
   * [model/service/PriceGroupService.cfc:L262-L268]; transformation rule T6 replaces ambient state with
   * an explicit context, and AAP 0.4.2 permits exactly ONE entity-layer signature widening in the whole
   * port - `PromotionPeriod.isCurrent(now)`. Threading the context through the CONSTRUCTOR satisfies
   * both constraints at once. See {@link Sku.currentAccountContext}.
   *
   * ★ THE MEMO IS THE REASON THIS INSTANCE MUST BE REQUEST-SCOPED. A price computed for one account and
   * surviving on a warm container into another account's request is a data leak, not a stale cache.
   */
  async getCurrentAccountPrice(): Promise<Money> {
    if (this.currentAccountPrice === undefined) {
      if (this.priceGroupResolver === undefined) {
        throw new Error(
          'Sku.getCurrentAccountPrice reaches ' +
            'priceGroupService.calculateSkuPriceBasedOnCurrentAccount ' +
            '[model/entity/Sku.cfc:L437] and no price-group resolver was injected into this sku.',
        );
      }
      if (this.currentAccountContext === undefined) {
        throw new Error(
          'Sku.getCurrentAccountPrice needs the current-account context that replaces the legacy ' +
            'ambient scope reach [model/service/PriceGroupService.cfc:L262-L268] and none was ' +
            'supplied to this sku. Note that a context whose accountID is absent IS a valid value - ' +
            'it represents a request with no authenticated account - so this is a missing context ' +
            'rather than a missing account.',
        );
      }
      this.currentAccountPrice =
        await this.priceGroupResolver.calculateSkuPriceBasedOnCurrentAccount(
          this,
          this.currentAccountContext,
        );
    }
    return this.currentAccountPrice;
  }

  /**
   * Whether this sku is its product's default. [model/entity/Sku.cfc:L442-L447]
   *
   *   if(getProduct().getDefaultSku().getSkuID() == getSkuID()) { return true; }
   *   return false;
   *
   * SECONDARY ITEM S1: A DOUBLE UNGUARDED DEREFERENCE [L443]. Neither `getProduct()` nor
   * `getDefaultSku()` is null-tested, so an orphan sku and a product with no default sku both fail -
   * and the second case is entirely ordinary, since `defaultSku` is a nullable many-to-one
   * [model/entity/Product.cfc:L70]. Reproduced as two raises that name which dereference failed.
   *
   * ★ THE COMPARISON IS `==` ON UUIDS, so two unsaved skus - both with `skuID` of `''` - compare EQUAL.
   * An unsaved sku on a product whose default sku is also unsaved therefore reports itself as the
   * default. That is the legacy's answer and it is preserved rather than upgraded to reference identity,
   * which is the same distinction the containment probes draw.
   */
  getDefaultFlag(): boolean {
    if (this.product === undefined) {
      throw new Error(
        'Sku.getDefaultFlag dereferences getProduct() unguarded ' +
          '[model/entity/Sku.cfc:L443] and this sku has no product. The legacy fails on the same ' +
          'input.',
      );
    }
    const defaultSku: Sku | undefined = this.product.getDefaultSku();
    if (defaultSku === undefined) {
      throw new Error(
        'Sku.getDefaultFlag dereferences getProduct().getDefaultSku() unguarded ' +
          '[model/entity/Sku.cfc:L443] and the product has no default sku - an ordinary state, since ' +
          'defaultSku is a nullable many-to-one [model/entity/Product.cfc:L70]. The legacy fails on ' +
          'the same input.',
      );
    }
    return defaultSku.getSkuID() === this.skuID;
  }

  /**
   * The fulfillment methods this sku may be fulfilled by. [model/entity/Sku.cfc:L449-L457]
   *
   * NOT PORTED - it raises. The body builds a `fulfillmentService` smart list, filters it by the
   * `skuEligibleFulfillmentMethods` setting and orders by `sortOrder|ASC` [L451-L454]. The fulfillment
   * pipeline is excluded (AAP 0.2.2), the setting is NOT one of the four approved keys (AAP 0.2.1), and
   * the smart list falls on the third side of the dividing line - so all three reasons point the same
   * way.
   *
   * ★ RAISING RATHER THAN ANSWERING `[]`. An empty array is a legitimate answer this method can give -
   * a sku with no eligible methods - and returning it would make a caller conclude the sku is
   * unfulfillable rather than that the question was not asked.
   */
  getEligibleFulfillmentMethods(): never {
    throw new Error(
      'Sku.getEligibleFulfillmentMethods builds a fulfillmentService smart list filtered by the ' +
        'skuEligibleFulfillmentMethods setting [model/entity/Sku.cfc:L451-L454]. The fulfillment ' +
        'pipeline is excluded by AAP 0.2.2 and the setting is not one of the four keys AAP 0.2.1 ' +
        'approves. Answering an empty array would be indistinguishable from a sku with no eligible ' +
        'methods.',
    );
  }

  /**
   * When this sku is next expected to be available. [model/entity/Sku.cfc:L459-L480]
   *
   * NOT PORTED - it raises, because its very first act is `getQuantity("QIATS")` [L461] and quantity
   * resolution reaches the excluded inventory tier. Two defects in the body are recorded here rather
   * than at a call site, because there is no ported call site to record them at:
   *
   * *** LEGACY-DEFECT [model/entity/Sku.cfc:L474] (D5): THE RUNNING TOTAL IS NEVER UPDATED. The `else`
   * branch is the bare statement `quantityNeeded - dates[i].quantity;` - an expression whose value is
   * discarded. `quantityNeeded` therefore holds its initial `getQuantity("QNC") * -1` for the whole
   * loop, so the method returns the FIRST receival date whose own quantity exceeds the total need
   * rather than the date at which the ACCUMULATED incoming quantity covers it. On a backorder spread
   * across several inbound shipments it reports a date that is too early, or - when no single shipment
   * is large enough - falls out of the loop and answers `""`.
   *
   * *** LEGACY-DEFECT [model/entity/Sku.cfc:L460-L477] (D6): THE MEMO IS NEVER ASSIGNED. Every path
   * inside the `if(!structKeyExists(variables, "nextEstimatedAvailableDate"))` guard either RETURNS
   * [L462, L470, L472] or falls out of the loop, and nothing ever writes
   * `variables.nextEstimatedAvailableDate`. So the guard is always true, the memo never exists, and
   * `return ""` at [L479] is reached on EVERY call that does not return from inside the loop. The memo
   * is decorative.
   *
   * ★ AND THE TWO COMPOUND: because the memo is never written, the discarded subtraction cannot even
   * accumulate across calls. Both are recorded rather than repaired; repairing either changes a date
   * shown to customers.
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  getNextEstimatedAvailableDate(): never {
    throw new Error(
      'Sku.getNextEstimatedAvailableDate begins with getQuantity("QIATS") ' +
        '[model/entity/Sku.cfc:L461] and also calls getProduct().getEstimatedReceivalDates() [L465]; ' +
        'both reach the inventory and stock subsystems AAP 0.2.2 excludes. Two defects in the body ' +
        'are documented at this member.',
    );
  }

  /**
   * The best price currently available for this sku. [model/entity/Sku.cfc:L482-L498]
   *
   *   var prices = [getPrice()];
   *   arrayAppend(prices, getSalePrice());
   *   arrayAppend(prices, getCurrentAccountPrice());
   *   arraySort(prices, "numeric", "asc");
   *   variables.livePrice = prices[1];
   *
   * ASYNC BY CONTAGION, not by its own reach: it awaits {@link Sku.getCurrentAccountPrice}, which
   * AAP 0.4.2 makes async. Nothing else in the body touches a repository.
   *
   * ★ THE MINIMUM IS TAKEN OVER `Money`, NEVER OVER NUMBERS. `arraySort(..., "numeric", ...)` is the
   * legacy's comparison and AAP 0.8.3 commits this port to `Money` as the single arithmetic surface, so
   * the sort is expressed as a `Money.compare` reduction. That also removes the float drift the legacy
   * sort would introduce on a three-element list of currency values.
   *
   * SECONDARY ITEM S3: THE ARRAY LITERAL AT [L485] CANNOT HOLD A NULL. `var prices = [getPrice()]`
   * builds a one-element array from a nullable accessor, and CFML raises rather than storing a null
   * element - so a sku with no price fails HERE, before the sort, with an array-construction error
   * rather than a price error. Reproduced as an explicit raise that says what actually went wrong.
   */
  async getLivePrice(): Promise<Money> {
    if (this.livePrice === undefined) {
      // [L485] the array literal is built from a nullable accessor, and CFML will not store a null
      // element - see secondary item S3.
      if (this.price === undefined) {
        throw new Error(
          'Sku.getLivePrice builds `var prices = [getPrice()]` [model/entity/Sku.cfc:L485] and this ' +
            'sku has no price, which CFML cannot store as an array element. The legacy fails on the ' +
            'same input, before any comparison happens.',
        );
      }

      const candidates: Money[] = [this.price];

      // [L488] the sale price. `getSalePrice()` falls back to `getPrice()` and so is present here
      // whenever the guard above passed.
      const salePrice: Money | undefined = this.getSalePrice();
      if (salePrice !== undefined) {
        candidates.push(salePrice);
      }

      // [L489] the current-account price - the one await in this method.
      candidates.push(await this.getCurrentAccountPrice());

      // [L492, L495] ascending numeric sort, then element 1: the MINIMUM. Expressed as a reduction over
      // Money.compare so no float arithmetic touches a currency value.
      this.livePrice = candidates.reduce((best, candidate) =>
        candidate.compare(best) < 0 ? candidate : best,
      );
    }
    return this.livePrice;
  }

  /**
   * This sku's options keyed by their option group's CODE. [model/entity/Sku.cfc:L500-L510]
   *
   *   if(!structKeyExists(variables, "optionsByOptionGroupCodeStruct")) {
   *     variables.optionsByOptionGroupIDStruct = {};              // <-- the wrong memo
   *     for(var option in getOptions()) {
   *       if( !structKeyExists(variables.optionsByOptionGroupCodeStruct,
   *                            option.getOptionGroup().getOptionGroupCode())){
   *         variables.optionsByOptionGroupCodeStruct[ ... ] = option;
   *       }
   *     }
   *   }
   *   return variables.optionsByOptionGroupCodeStruct;
   *
   * *** LEGACY-DEFECT [model/entity/Sku.cfc:L500-L510] (D3): IT INITIALISES THE WRONG MEMO, AND DOES SO
   * TWICE OVER. Line 502 creates `variables.optionsByOptionGroupIDStruct` - the ID struct - where it
   * meant to create the CODE struct. Two things follow. First, the loop's own guard [L504] and its write
   * [L505] then reference `variables.optionsByOptionGroupCodeStruct`, which does not exist, so the very
   * first iteration raises; and for a sku with NO options the loop never runs and the `return` [L509]
   * raises instead. The method cannot succeed for any input. Second, on the way to failing it CLOBBERS
   * the ID struct, so a subsequent {@link Sku.getOptionsByOptionGroupIDStruct} finds its memo already
   * present and returns the empty map.
   *
   * ★ FIXED, AS ONE OF THE THREE DIVERGENCES AAP 0.6.7 SANCTIONS - it is registered there as defect 17
   * among the "entity memo bugs" that are unobservable through the public contract. The
   * characterisation is worth being precise about: what is unobservable is the CLOBBERING, because
   * per-request instances mean the ID struct is rebuilt for the next reader anyway (AAP 0.6.5). The
   * RAISE is very much observable - and repairing it is what makes {@link Sku.getOptionByOptionGroupID}
   * and {@link Sku.getOptionByOptionGroupCode} reachable at all.
   *
   * ★ AND FIXING IT UN-HIDES D2. The code-keyed struct being permanently unbuildable is what stopped
   * `getOptionByOptionGroupCode`'s guard from ever passing; with this repaired, that member's own defect
   * becomes reachable. Each is judged on its own terms rather than one excusing the other - see D2.
   *
   * FIRST-WINS, not last-wins: the guard [L504] skips an option whose group code is already keyed, so a
   * sku carrying two options from one group keeps the FIRST. That IS the source's behaviour and is
   * preserved.
   *
   * `option.getOptionGroup()` is dereferenced unguarded [L504-L505] - reproduced as a raise.
   */
  getOptionsByOptionGroupCodeStruct(): Record<string, Option> {
    if (this.optionsByOptionGroupCodeStruct === undefined) {
      // *** LEGACY-DEFECT [model/entity/Sku.cfc:L502] (D3): the source initialises
      // `variables.optionsByOptionGroupIDStruct` here - the ID struct, not this one - which makes every
      // path through the method raise AND clobbers the ID memo on the way. FIXED as one of the three
      // divergences AAP 0.6.7 sanctions (defect 17); see the doc block for why the AAP's
      // "unobservable" characterisation applies to the clobbering and not to the raise.
      const byCode: Record<string, Option> = {};

      for (const option of this.options) {
        const optionGroup = option.getOptionGroup();
        if (optionGroup === undefined) {
          throw new Error(
            'Sku.getOptionsByOptionGroupCodeStruct dereferences option.getOptionGroup() unguarded ' +
              `[model/entity/Sku.cfc:L504-L505] and option '${option.getOptionID()}' has no option ` +
              'group. The legacy fails on the same input.',
          );
        }
        const code: string = optionGroup.getOptionGroupCode() ?? '';
        // [L504] FIRST-WINS - an already-keyed group code is skipped.
        if (!structKeyExists(byCode, code)) {
          byCode[code] = option;
        }
      }

      this.optionsByOptionGroupCodeStruct = byCode;
    }
    return this.optionsByOptionGroupCodeStruct;
  }

  /**
   * This sku's options keyed by their option group's ID. [model/entity/Sku.cfc:L512-L522]
   *
   *   if(!structKeyExists(variables, "optionsByOptionGroupIDStruct")) {
   *     variables.optionsByOptionGroupIDStruct = {};
   *     for(var option in getOptions()) {
   *       if( !structKeyExists(variables.optionsByOptionGroupIDStruct,
   *                            option.getOptionGroup().getOptionGroupID())){
   *         variables.OptionsByGroupIDStruct[ ... ] = option;      // <-- a third, undeclared name
   *       }
   *     }
   *   }
   *   return variables.optionsByOptionGroupIDStruct;
   *
   * *** LEGACY-DEFECT [model/entity/Sku.cfc:L517] (D4): THE WRITE TARGETS A THIRD VARIABLE NAME.
   * `variables.OptionsByGroupIDStruct` is neither the memo the guard tests nor the one the method
   * returns - CFML happily creates it on first write - so the method builds a complete map into a
   * variable nobody reads and returns the EMPTY map it initialised at [L514]. Every caller therefore
   * sees no options at all: {@link Sku.getOptionByOptionGroupID} always answers `undefined`, and
   * `getOptionByOptionGroupCode`'s subscript [L249] always misses.
   *
   * ★ THE NAME IS THE CLUE TO THE DEFECT'S ORIGIN. `getOptionsByGroupIDStruct` is the DEPRECATED alias
   * at [L894], so [L517] is almost certainly a half-completed rename: the accessor was renamed and one
   * write inside the new body kept the old spelling.
   *
   * ★ FIXED, as the third of AAP 0.6.7's sanctioned divergences (defect 18). Here the AAP's
   * "unobservable through the public contract" framing does NOT hold, and the difference is worth
   * stating plainly: this defect changes the RETURNED VALUE, from a populated map to an empty one, for
   * every sku that has options. It is fixed on the AAP's explicit DIRECTIVE, which names defect 18
   * among the three, rather than on its stated reasoning - the same treatment
   * `Product.getBrandName` records for defect 19.
   *
   * FIRST-WINS on a duplicate group ID [L516], as with the code struct. `option.getOptionGroup()` is
   * unguarded - reproduced as a raise.
   */
  getOptionsByOptionGroupIDStruct(): Record<string, Option> {
    if (this.optionsByOptionGroupIDStruct === undefined) {
      const byID: Record<string, Option> = {};

      for (const option of this.options) {
        const optionGroup = option.getOptionGroup();
        if (optionGroup === undefined) {
          throw new Error(
            'Sku.getOptionsByOptionGroupIDStruct dereferences option.getOptionGroup() unguarded ' +
              `[model/entity/Sku.cfc:L516-L517] and option '${option.getOptionID()}' has no option ` +
              'group. The legacy fails on the same input.',
          );
        }
        const groupID: string = optionGroup.getOptionGroupID();
        // [L516] FIRST-WINS.
        if (!structKeyExists(byID, groupID)) {
          // *** LEGACY-DEFECT [model/entity/Sku.cfc:L517] (D4): the source writes to
          // `variables.OptionsByGroupIDStruct` - a third, undeclared name - so the map it returns is
          // always empty. FIXED as one of the three divergences AAP 0.6.7 sanctions (defect 18); see
          // the doc block for why the AAP's "unobservable" reasoning is superseded here.
          byID[groupID] = option;
        }
      }

      this.optionsByOptionGroupIDStruct = byID;
    }
    return this.optionsByOptionGroupIDStruct;
  }

  /**
   * This sku's option identifiers as a comma list. [model/entity/Sku.cfc:L524-L533]
   *
   *   variables.optionsIDList = "";
   *   for(var option in getOptions()) {
   *     variables.optionsIDList = listAppend(variables.optionsIDList, option.getOptionID());
   *   }
   *
   * ★ THIS LIST IS THE INPUT TO A MUST-PRESERVE BEHAVIOUR. {@link Sku.hasUniqueOptions} feeds it to
   * `Product.getSkusBySelectedOptions()`, which AAP 0.8.1 names among the three areas that must be
   * preserved exactly, and whose SQL is the AND-of-EXISTS statement at
   * [model/dao/SkuDAO.cfc:L107-L128]. Built through the shared `listAppend` helper so the exact
   * empty-element behaviour is inherited - and that behaviour is ASYMMETRIC rather than a clean
   * suppression. An unsaved option has `getOptionID() === ''`, and it contributes nothing in FIRST
   * position but a BARE COMMA in any later position: `[saved, unsaved]` yields `'O1,'` while
   * `[unsaved, saved]` yields `'O1'`.
   *
   * ★ THE TRAILING COMMA DOES NOT REACH THE SQL, AND THAT IS WORTH STATING BECAUSE IT IS THE MUST-PRESERVE
   * PATH. The string is parsed exactly once, by `listToArray` at the repository boundary, and
   * `listToArray('O1,')` is `['O1']` - CFML's list READERS discard empty elements even though
   * `listAppend` emits them. So the AND-of-EXISTS statement sees one identifier either way; only the
   * intermediate string differs. Verified by executing both helpers.
   *
   * TOTAL - `getOptionID()` is required on `Option`, so nothing here can fail.
   */
  getOptionsIDList(): string {
    if (this.optionsIDList === undefined) {
      let list: string = '';
      for (const option of this.options) {
        list = listAppend(list, option.getOptionID());
      }
      this.optionsIDList = list;
    }
    return this.optionsIDList;
  }

  /**
   * This sku's quantity available to sell. [model/entity/Sku.cfc:L535-L537]
   *
   *   return getQuantity("QATS");
   *
   * NOT PORTED - it raises, by delegation to {@link Sku.getQuantity}. Delegating rather than throwing
   * directly is deliberate: the failure then names the inventory tier, which is the real reason, instead
   * of naming this accessor.
   *
   * ★ AND NOTE WHAT IT DOES NOT READ: `calculatedQATS` [L62]. The persisted column and this accessor are
   * independent, exactly as `Product.getTitle()` ignores `calculatedTitle`. A caller that wants the
   * stored figure asks {@link Sku.getCalculatedQATS}.
   */
  getQATS(): never {
    return this.getQuantity('QATS');
  }

  /**
   * This sku's sale-price detail, or `undefined` when it has none. [model/entity/Sku.cfc:L539-L544]
   *
   *   if(!structKeyExists(variables, "salePriceDetails")) {
   *     variables.salePriceDetails = getProduct().getSkuSalePriceDetails( getSkuID() );
   *   }
   *   return variables.salePriceDetails;
   *
   * MATERIALIZED, NOT DELEGATED, and the reason is a hard one: `Product.getSkuSalePriceDetails` is
   * `async` in this port - it awaits the promotion tier's six-branch UNION at
   * [model/dao/PromotionDAO.cfc:L298-L591] - while the three members that read this map
   * ({@link Sku.getSalePrice}, {@link Sku.getSalePriceDiscountType},
   * {@link Sku.getSalePriceExpirationDateTime}) are all synchronous, and must be, because `Product`'s
   * own five sale-price delegators are. See {@link Sku.salePriceDetail}.
   *
   * ★ `undefined` HERE IS AN EMPTY STRUCT, NOT A MISSING ONE. The legacy always receives a struct and
   * that struct is EMPTY for any sku with no active sale-price reward - the common case - so
   * `structKeyExists(details, "salePrice")` is false in exactly that situation. An absent detail and an
   * empty struct are therefore indistinguishable in the source, and no reader here raises on absence.
   *
   * ★ THE ONE THING NOT REPRODUCED IS THE UNGUARDED `getProduct()` AT [L541]. Materializing the row
   * moves that dereference to hydration time, so an orphan sku answers `undefined` here where the legacy
   * would fail. That is a consequence of the async boundary the AAP mandates rather than a choice made
   * at this member, and it is recorded rather than hidden - the alternative would be to make three
   * synchronous accessors async and break `Product`'s delegators.
   */
  getSalePriceDetails(): SalePriceDetail | undefined {
    return this.salePriceDetail;
  }

  /**
   * This sku's sale price, falling back to its ordinary price. [model/entity/Sku.cfc:L546-L551]
   *
   *   if(structKeyExists(getSalePriceDetails(), "salePrice")) {
   *     return getSalePriceDetails()[ "salePrice"];
   *   }
   *   return getPrice();
   *
   * ★ THE FALLBACK IS `getPrice()`, WHICH CAN ITSELF BE ABSENT - so this returns `Money | undefined` and
   * not `Money`. That propagates: `Product.getSalePrice()` reads it through the default sku, and
   * {@link Sku.getLivePrice} pushes it into its candidate list only when present.
   *
   * ★ A ZERO WOULD BE THE WRONG SUBSTITUTE HERE FOR THE SAME REASON AS ON THE CURRENCY PATH. AAP 0.6.3's
   * warning is about the currency accessors specifically, but the mechanism is identical: this value is
   * a price a customer is charged, and `0` is a valid price rather than a sentinel.
   */
  getSalePrice(): Money | undefined {
    const details: SalePriceDetail | undefined = this.getSalePriceDetails();
    // [L547] `salePrice` is REQUIRED on SalePriceDetail, so a present detail always has one - the
    // structKeyExists test collapses to a presence test on the detail itself.
    if (details !== undefined) {
      return details.salePrice;
    }
    return this.price;
  }

  /**
   * How this sku's sale price is discounted. [model/entity/Sku.cfc:L553-L558]
   *
   *   if(structKeyExists(getSalePriceDetails(), "salePriceDiscountType")) {
   *     return getSalePriceDetails()[ "salePriceDiscountType"];
   *   }
   *   return "";
   *
   * *** LEGACY-DEFECT [model/entity/Sku.cfc:L553-L558] (D10): THE EMPTY-STRING FALLBACK DISAGREES WITH
   * THE PRODUCT TWIN. `Product.getSalePriceDiscountType()` seeds its memo with the STRING `"none"`
   * [model/entity/Product.cfc:L606] and only then overwrites it from the default sku - so a product with
   * no default sku reports `"none"` while a sku with no sale price reports `""`. Two different
   * "no discount" sentinels for the same concept, one of which is falsy in every CFML truthiness test
   * and the other of which is not. A view that branches on the value behaves differently depending on
   * which entity it asked.
   *
   * ★ AND THIS IS THE PAIR THAT MAKES THE DEFECT VISIBLE RATHER THAN THEORETICAL: `Product`'s delegator
   * assigns THIS method's result over its own `"none"` seed, so the product reports `""` whenever it HAS
   * a default sku and `"none"` only when it does not. The sentinel therefore depends on the product's
   * shape, not on the discount.
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  getSalePriceDiscountType(): string {
    const details: SalePriceDetail | undefined = this.getSalePriceDetails();
    // [L554] `salePriceDiscountType` is REQUIRED on SalePriceDetail.
    if (details !== undefined) {
      return details.salePriceDiscountType;
    }
    // *** LEGACY-DEFECT [model/entity/Sku.cfc:L557] (D10): `""` here where the product twin uses
    // `"none"` [model/entity/Product.cfc:L606].
    // Preserved deliberately; do not fix without a product decision.
    return '';
  }

  /**
   * When this sku's sale price stops applying. [model/entity/Sku.cfc:L560-L565]
   *
   *   if(structKeyExists(getSalePriceDetails(), "salePriceExpirationDateTime")) {
   *     return getSalePriceDetails()[ "salePriceExpirationDateTime"];
   *   }
   *   return "";
   *
   * *** LEGACY-DEFECT [model/entity/Sku.cfc:L564] (D9): IT RETURNS THE EMPTY STRING FROM A DATE
   * PROPERTY. The matching non-persistent property is declared `type="date"` at [L120], and the method's
   * own `returntype="any"` lets the mismatch through - so a sku with no sale price answers `""` where
   * every caller expects a date. `Product.getSalePriceExpirationDateTime()` then coerces the result
   * through a `returntype="date"` [model/entity/Product.cfc:L614] and RAISES on it, which is the second
   * half of that method's own defect chain.
   *
   * ★ THE RETURN TYPE IS THEREFORE `Date | ''` AND NOT `Date | undefined`. `''` is not "absent" - it is
   * the actual value the legacy hands back, and it is what makes the product-side coercion fail. Typing
   * it as `undefined` would let a caller `?? new Date()` its way past a failure the legacy really has.
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  getSalePriceExpirationDateTime(): Date | '' {
    const details: SalePriceDetail | undefined = this.getSalePriceDetails();
    // [L561] OPTIONAL on SalePriceDetail - a sale price need not expire - so this is a genuine two-state
    // test rather than a collapsed one.
    if (details?.salePriceExpirationDateTime !== undefined) {
      return details.salePriceExpirationDateTime;
    }
    // *** LEGACY-DEFECT [model/entity/Sku.cfc:L564] (D9): the empty string from a `type="date"`
    // property. Preserved deliberately; do not fix without a product decision.
    return '';
  }

  /**
   * Whether this sku's stock rows may be deleted. [model/entity/Sku.cfc:L567-L572]
   *
   *   variables.stocksDeletableFlag = getService("skuService")
   *     .getSkuStocksDeletableFlag( skuID=this.getSkuID() );
   *
   * ASYNC - AAP 0.4.2 declares `SkuService.getSkuStocksDeletableFlag` async because it reaches the DAO.
   * Routed through {@link SkuQuerySupport}, the module-local collaborator that stands in for the two
   * in-scope `getService("skuService")` reaches on this entity.
   *
   * ★ IT DOES NOT READ {@link Sku.getStocks}, even though this entity holds the collection. The service
   * asks the database whether any stock row is referenced elsewhere, which is a question the graph cannot
   * answer - so the association and this flag are genuinely independent.
   */
  async getStocksDeletableFlag(): Promise<boolean> {
    if (this.stocksDeletableFlag === undefined) {
      if (this.querySupport === undefined) {
        throw new Error(
          'Sku.getStocksDeletableFlag reaches skuService.getSkuStocksDeletableFlag ' +
            '[model/entity/Sku.cfc:L569] and no query support was injected into this sku.',
        );
      }
      this.stocksDeletableFlag = await this.querySupport.getSkuStocksDeletableFlag(this.skuID);
    }
    return this.stocksDeletableFlag;
  }

  /**
   * A human-readable description of what distinguishes this sku. [model/entity/Sku.cfc:L574-L590]
   *
   *   variables.skuDefinition = "";
   *   if(getBaseProductType() eq "contentAccess") {
   *                                                   // <-- deliberately empty
   *   } else if (getBaseProductType() eq "merchandise") {
   *     for(var option in getOptions()) {
   *       variables.skuDefinition = listAppend(variables.skuDefinition,
   *         " #option.getOptionGroup().getOptionGroupName()#: #option.getOptionName()#", ",");
   *     }
   *     trim(variables.skuDefinition);
   *   } else if (getBaseProductType() eq "subscription") {
   *     variables.skuDefinition = "#rbKey('entity.subscriptionTerm')#: "
   *                             & "#getSubscriptionTerm().getSubscriptionTermName()#";
   *   }
   *
   * *** LEGACY-DEFECT [model/entity/Sku.cfc:L583] (D7): `trim()` IS CALLED AND ITS RESULT DISCARDED. The
   * statement has no assignment, so the LEADING SPACE the appended template opens with [L581] survives
   * into the returned value - every merchandise sku definition begins with a space, and each subsequent
   * element begins with one too because the space is inside the appended fragment rather than around the
   * delimiter. `" Colour: Red, Size: Large"` is what callers actually receive.
   *
   * ★ THE `trim` WOULD ONLY EVER HAVE FIXED THE FIRST SPACE ANYWAY, since the inner ones are mid-string.
   * So even the intended code was insufficient - which is worth recording, because a "fix" that only
   * trims would still not produce the obvious intent.
   *
   * ★ THE `contentAccess` BRANCH IS PRESENT AND EMPTY [L577-L578], and that is not the same thing as
   * having no branch: it means a content-access sku deliberately answers `''` rather than falling through
   * to the else-if chain's end. Reproduced as an explicit no-op branch so the intent survives.
   *
   * ★ AND THE COMPARISONS ARE UNGUARDED ON A NULLABLE VALUE. `getBaseProductType()` can be `undefined`,
   * and `cfEquals` raises on a nullish operand by design (see `src/lib/cfml/struct.ts`). The legacy's
   * `eq` against a null left operand raises too, so the behaviour matches - but the comparison is written
   * defensively below so the message names the real cause instead of surfacing a bare comparison error.
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  getSkuDefinition(): string {
    if (this.skuDefinition === undefined) {
      // [L576]
      let definition: string = '';

      const baseProductType: string | undefined = this.getBaseProductType();
      if (baseProductType === undefined) {
        throw new Error(
          'Sku.getSkuDefinition compares getBaseProductType() against three literals ' +
            '[model/entity/Sku.cfc:L577, L579, L584] and this sku resolves no base product type. The ' +
            'legacy comparison against a null left operand fails on the same input.',
        );
      }

      if (cfEquals(baseProductType, 'contentAccess')) {
        // [L577-L578] PRESENT AND EMPTY in the source - a content-access sku answers `''` deliberately.
      } else if (cfEquals(baseProductType, 'merchandise')) {
        for (const option of this.options) {
          const optionGroup = option.getOptionGroup();
          if (optionGroup === undefined) {
            throw new Error(
              'Sku.getSkuDefinition dereferences option.getOptionGroup() unguarded ' +
                `[model/entity/Sku.cfc:L581] and option '${option.getOptionID()}' has no option ` +
                'group. The legacy fails on the same input.',
            );
          }
          // [L581] note the LEADING SPACE inside the appended fragment, and the explicit `,` delimiter.
          definition = listAppend(
            definition,
            ` ${optionGroup.getOptionGroupName() ?? ''}: ${option.getOptionName() ?? ''}`,
            ',',
          );
        }
        // *** LEGACY-DEFECT [model/entity/Sku.cfc:L583] (D7): the source calls `trim(...)` here and
        // discards the result, so the leading space survives. Reproduced by NOT trimming.
        // Preserved deliberately; do not fix without a product decision.
      } else if (cfEquals(baseProductType, 'subscription')) {
        if (this.labelProvider === undefined) {
          throw new Error(
            "Sku.getSkuDefinition interpolates rbKey('entity.subscriptionTerm') " +
              '[model/entity/Sku.cfc:L585] and no label provider was injected into this sku. The key ' +
              'itself is not the contract here - the RESOLVED LABEL flows into displayed text - so ' +
              'emitting the raw key would put an internal identifier in front of a customer.',
          );
        }
        if (this.subscriptionTerm === undefined) {
          throw new Error(
            'Sku.getSkuDefinition dereferences getSubscriptionTerm() unguarded ' +
              '[model/entity/Sku.cfc:L585] and this sku has no subscription term, even though its ' +
              "base product type is 'subscription'. The legacy fails on the same input.",
          );
        }
        // [L585]
        definition = `${this.labelProvider.getSubscriptionTermLabel()}: ${this.subscriptionTerm.getSubscriptionTermName()}`;
      }

      this.skuDefinition = definition;
    }
    return this.skuDefinition;
  }

  /**
   * Whether any transaction references this sku. [model/entity/Sku.cfc:L592-L597]
   *
   *   variables.transactionExistsFlag = getService("skuService")
   *     .getTransactionExistsFlag( skuID=this.getSkuID() );
   *
   * ASYNC, per AAP 0.4.2. Routed through {@link SkuQuerySupport}.
   *
   * ★ NOTE THE ARGUMENT ASYMMETRY WITH THE PRODUCT TWIN, which the port keeps rather than tidies:
   * `Product.getTransactionExistsFlag` passes `productID=` [model/entity/Product.cfc:L627] to the same
   * SERVICE METHOD NAME, and the legacy service dispatches on which argument arrived. The two entities
   * therefore call one method two ways, which is why {@link SkuQuerySupport} declares the sku-shaped
   * signature separately from `ProductQuerySupport`'s.
   */
  async getTransactionExistsFlag(): Promise<boolean> {
    if (this.transactionExistsFlag === undefined) {
      if (this.querySupport === undefined) {
        throw new Error(
          'Sku.getTransactionExistsFlag reaches skuService.getTransactionExistsFlag ' +
            '[model/entity/Sku.cfc:L594] and no query support was injected into this sku.',
        );
      }
      this.transactionExistsFlag = await this.querySupport.getTransactionExistsFlag(this.skuID);
    }
    return this.transactionExistsFlag;
  }

  // ==============================================================================================
  // BIDIRECTIONAL HELPER METHODS [model/entity/Sku.cfc:L601-L751]
  // ==============================================================================================
  //
  // THIRTEEN HAND-WRITTEN PAIRS PLUS ONE ORM-GENERATED PAIR, IN FOUR DISTINCT SHAPES. Stating the
  // shapes once here means each pair below can be short:
  //
  //   SHAPE 1 - MANY-TO-ONE `set`/`remove` [L604-L637]: assigns the field, then appends `this` to the
  //   far side's LIVE collection under an `isNew() or !far.hasSku(this)` guard. The `remove` half
  //   defaults its argument from the field, splices the far side BY REFERENCE, and then deletes the
  //   field UNCONDITIONALLY - so the local link is severed even when the far-side splice found nothing.
  //   Two pairs: product and subscriptionTerm.
  //
  //   SHAPE 2 - PURE DELEGATION [L640-L701, L744-L749]: the whole body is one call to the other side.
  //   No local collection is touched, because the other side owns the write. Ten pairs.
  //
  //   SHAPE 3 - MANY-TO-MANY OWNER, HAND-MAINTAINED [L704-L741]: guards and appends on BOTH sides, and
  //   the `remove` half splices both. Two pairs: accessContents and subscriptionBenefits.
  //
  //   SHAPE 4 - ORM-GENERATED: `addOption`/`removeOption`. No body exists in the CFC at all.
  //
  // ★ AND `arrayFind` IS REFERENCE MATCHING WHERE `has*` IS KEY MATCHING. Every `remove` below splices
  // by identity (`indexOf`), every guard tests by primary key with a reference fallback. The two are not
  // interchangeable and are never normalised - a stale duplicate row that a probe considers "already
  // present" is precisely a row a splice will not find.
  //
  // ★ INDEX BASES DIFFER. CFML `arrayFind` is 1-BASED with 0 meaning miss, hence `if(index > 0)`;
  // `indexOf` is 0-BASED with -1 meaning miss, hence `if (index !== -1)`. Transcribing the guard
  // literally would silently skip element 1.

  // --- Shape 1: many-to-one ---------------------------------------------------------------------

  /**
   * Attaches this sku to a product. [model/entity/Sku.cfc:L604-L609]
   *
   *   variables.product = arguments.product;
   *   if(isNew() or !arguments.product.hasSku( this )) {
   *     arrayAppend(arguments.product.getSkus(), this);
   *   }
   *
   * ★ THE FAR SIDE IS `Product.getSkus()`, WHICH IS LIVE FOR EXACTLY THIS REASON. `product.ts`'s
   * accessor returns the mutable array when called with no arguments - its documented "LIVE fast path" -
   * and this append is one of the two writes that depend on it.
   *
   * ★ THE GUARD READS `isNew()` ON **THIS SKU**, NOT ON THE PRODUCT, which is the house ordering and the
   * one `Product.addListingPage` gets backwards (its secondary item S5). An unsaved sku therefore skips
   * the containment test and appends unconditionally - correct, because an unsaved sku has key `''` and a
   * key-matching probe would report every other unsaved sku as itself.
   */
  setProduct(product: Product): void {
    // [L605]
    this.product = product;
    // [L606-L608]
    if (this.isNew() || !product.hasSku(this)) {
      product.getSkus().push(this);
    }
  }

  /**
   * Detaches this sku from a product. [model/entity/Sku.cfc:L610-L619]
   *
   *   if(!structKeyExists(arguments, "product")) { arguments.product = variables.product; }
   *   var index = arrayFind(arguments.product.getSkus(), this);
   *   if(index > 0) { arrayDeleteAt(arguments.product.getSkus(), index); }
   *   structDelete(variables, "product");
   *
   * ★ THE ARGUMENT DEFAULTS FROM THE FIELD, AND THAT DEFAULT CAN BE NULL. Calling this with no argument
   * on a sku that has no product makes `arguments.product` null, and the very next line dereferences it -
   * so the legacy raises. Reproduced.
   *
   * ★ THE FIELD IS DELETED UNCONDITIONALLY [L618], OUTSIDE THE `if`. So removing this sku from a
   * DIFFERENT product than the one it is attached to still severs its own link - the splice fails to find
   * it on the other product's array and the local field is cleared anyway. That is the source's behaviour
   * and it is preserved.
   */
  removeProduct(product?: Product): void {
    // [L611-L613] the argument defaults from the field.
    const target: Product | undefined = product ?? this.product;
    if (target === undefined) {
      throw new Error(
        'Sku.removeProduct was called with no argument on a sku that has no product, so the legacy ' +
          'default `arguments.product = variables.product` [model/entity/Sku.cfc:L612] yields null ' +
          'and the next line dereferences it [L614]. The legacy fails on the same input.',
      );
    }

    // [L614-L617] reference matching, 1-based in the source.
    const skus: Sku[] = target.getSkus();
    const index: number = skus.indexOf(this);
    if (index !== -1) {
      skus.splice(index, 1);
    }

    // [L618] UNCONDITIONAL - outside the `if`.
    this.product = undefined;
  }

  /**
   * Attaches this sku to a subscription term. [model/entity/Sku.cfc:L622-L627]
   *
   * Structurally identical to {@link Sku.setProduct}, including the `isNew()`-on-this-sku guard. The far
   * side belongs to the excluded subscription module and is reached through
   * {@link SkuSubscriptionTermLink}, whose `getSkus()` is typed MUTABLE precisely because this append
   * writes through it.
   */
  setSubscriptionTerm(subscriptionTerm: SkuSubscriptionTermLink): void {
    // [L623]
    this.subscriptionTerm = subscriptionTerm;
    // [L624-L626]
    if (this.isNew() || !subscriptionTerm.hasSku(this)) {
      subscriptionTerm.getSkus().push(this);
    }
  }

  /**
   * Detaches this sku from a subscription term. [model/entity/Sku.cfc:L628-L637]
   *
   * Structurally identical to {@link Sku.removeProduct}, including the nullable argument default and the
   * unconditional field delete.
   */
  removeSubscriptionTerm(subscriptionTerm?: SkuSubscriptionTermLink): void {
    // [L629-L631]
    const target: SkuSubscriptionTermLink | undefined = subscriptionTerm ?? this.subscriptionTerm;
    if (target === undefined) {
      throw new Error(
        'Sku.removeSubscriptionTerm was called with no argument on a sku that has no subscription ' +
          'term, so the legacy default at [model/entity/Sku.cfc:L630] yields null and the next line ' +
          'dereferences it [L632]. The legacy fails on the same input.',
      );
    }

    // [L632-L635]
    const skus: Sku[] = target.getSkus();
    const index: number = skus.indexOf(this);
    if (index !== -1) {
      skus.splice(index, 1);
    }

    // [L636] UNCONDITIONAL.
    this.subscriptionTerm = undefined;
  }

  // --- Shape 2: pure delegation -----------------------------------------------------------------

  /** [model/entity/Sku.cfc:L640-L642] `arguments.alternateSkuCode.setSku( this );` */
  addAlternateSkuCode(alternateSkuCode: SkuAlternateSkuCodeLink): void {
    alternateSkuCode.setSku(this);
  }

  /** [model/entity/Sku.cfc:L643-L645] `arguments.alternateSkuCode.removeSku( this );` */
  removeAlternateSkuCode(alternateSkuCode: SkuAlternateSkuCodeLink): void {
    alternateSkuCode.removeSku(this);
  }

  /** [model/entity/Sku.cfc:L648-L650] `arguments.attributeValue.setSku( this );` */
  addAttributeValue(attributeValue: SkuAttributeValueLink): void {
    attributeValue.setSku(this);
  }

  /** [model/entity/Sku.cfc:L651-L653] `arguments.attributeValue.removeSku( this );` */
  removeAttributeValue(attributeValue: SkuAttributeValueLink): void {
    attributeValue.removeSku(this);
  }

  /**
   * [model/entity/Sku.cfc:L656-L658] `arguments.skuCurrency.setSku( this );`
   *
   * The far side is `SkuCurrency.setSku` [model/entity/SkuCurrency.cfc:L88-L94], which is what actually
   * appends into {@link Sku.getSkuCurrencies} - and is why that accessor is LIVE and why
   * {@link Sku.hasSkuCurrency} exists at all.
   */
  addSkuCurrency(skuCurrency: SkuCurrency): void {
    skuCurrency.setSku(this);
  }

  /** [model/entity/Sku.cfc:L659-L661] `arguments.skuCurrency.removeSku( this );` */
  removeSkuCurrency(skuCurrency: SkuCurrency): void {
    skuCurrency.removeSku(this);
  }

  /** [model/entity/Sku.cfc:L664-L666] `arguments.stock.setSku( this );` */
  addStock(stock: SkuStockLink): void {
    stock.setSku(this);
  }

  /** [model/entity/Sku.cfc:L667-L669] `arguments.stock.removeSku( this );` */
  removeStock(stock: SkuStockLink): void {
    stock.removeSku(this);
  }

  /** [model/entity/Sku.cfc:L672-L674] `arguments.promotionReward.addSku( this );` */
  addPromotionReward(promotionReward: PromotionReward): void {
    promotionReward.addSku(this);
  }

  /** [model/entity/Sku.cfc:L675-L677] `arguments.promotionReward.removeSku( this );` */
  removePromotionReward(promotionReward: PromotionReward): void {
    promotionReward.removeSku(this);
  }

  /**
   * [model/entity/Sku.cfc:L680-L682] `arguments.promotionReward.addExcludedSku( this );`
   *
   * ★ NOTE THE PARAMETER NAME IN THE SOURCE IS `promotionReward`, NOT `promotionRewardExclusion` - the
   * exclusion is a ROLE the same reward plays over a different link table
   * [model/entity/PromotionReward.cfc:L343], not a different entity. Kept, because renaming it would
   * suggest a second type exists.
   */
  addPromotionRewardExclusion(promotionReward: PromotionReward): void {
    promotionReward.addExcludedSku(this);
  }

  /** [model/entity/Sku.cfc:L683-L685] `arguments.promotionReward.removeExcludedSku( this );` */
  removePromotionRewardExclusion(promotionReward: PromotionReward): void {
    promotionReward.removeExcludedSku(this);
  }

  /** [model/entity/Sku.cfc:L688-L690] `arguments.promotionQualifier.addSku( this );` */
  addPromotionQualifier(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addSku(this);
  }

  /** [model/entity/Sku.cfc:L691-L693] `arguments.promotionQualifier.removeSku( this );` */
  removePromotionQualifier(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.removeSku(this);
  }

  /** [model/entity/Sku.cfc:L696-L698] `arguments.promotionQualifier.addExcludedSku( this );` */
  addPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addExcludedSku(this);
  }

  /** [model/entity/Sku.cfc:L699-L701] `arguments.promotionQualifier.removeExcludedSku( this );` */
  removePromotionQualifierExclusion(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.removeExcludedSku(this);
  }

  /** [model/entity/Sku.cfc:L744-L746] `arguments.physical.addSku( this );` */
  addPhysical(physical: SkuPhysicalLink): void {
    physical.addSku(this);
  }

  /** [model/entity/Sku.cfc:L747-L749] `arguments.physical.removeSku( this );` */
  removePhysical(physical: SkuPhysicalLink): void {
    physical.removeSku(this);
  }

  // --- Shape 3: many-to-many owner, hand-maintained ---------------------------------------------

  /**
   * Links this sku to an access-content row. [model/entity/Sku.cfc:L704-L711]
   *
   *   if(isNew() or !hasAccessContent(arguments.accessContent)) {
   *     arrayAppend(variables.accessContents, arguments.accessContent);
   *   }
   *   if(arguments.accessContent.isNew() or !arguments.accessContent.hasSku( this )) {
   *     arrayAppend(arguments.accessContent.getSkus(), this);
   *   }
   *
   * ★ THIS IS THE HOUSE ORDERING, AND ITS SIBLING IS NOT. Here the NEAR guard reads `isNew()` on THIS
   * sku and the FAR guard reads `isNew()` on the ARGUMENT - which is the ordering every correct
   * many-to-many owner in the tree uses, because each guard tests the newness of the entity whose
   * collection it is about to skip a containment check on.
   * {@link Sku.addSubscriptionBenefit} - twenty lines below, same file, same shape - has them the OTHER
   * WAY ROUND. One of the two is wrong, and this port reproduces each as written rather than picking a
   * winner; see that method for which side the consequence falls on.
   */
  addAccessContent(accessContent: SkuAccessContentLink): void {
    // [L705-L707] NEAR side, guarded on THIS sku's newness.
    if (this.isNew() || !this.hasAccessContent(accessContent)) {
      this.accessContents.push(accessContent);
    }
    // [L708-L710] FAR side, guarded on the ARGUMENT's newness.
    if (accessContent.isNew() || !accessContent.hasSku(this)) {
      accessContent.getSkus().push(this);
    }
  }

  /**
   * Unlinks this sku from an access-content row. [model/entity/Sku.cfc:L712-L721]
   *
   * Both splices are BY REFERENCE and are INDEPENDENTLY GUARDED, so a half-linked pair is half-repaired
   * rather than raising. Both sides are spliced even though only one of them is the owner - the source
   * does not rely on the ORM to mirror the removal.
   */
  removeAccessContent(accessContent: SkuAccessContentLink): void {
    // [L713-L716]
    const thisIndex: number = this.accessContents.indexOf(accessContent);
    if (thisIndex !== -1) {
      this.accessContents.splice(thisIndex, 1);
    }
    // [L717-L720]
    const farSide: Sku[] = accessContent.getSkus();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /**
   * Links this sku to a subscription benefit. [model/entity/Sku.cfc:L724-L731]
   *
   *   if(arguments.subscriptionBenefit.isNew() or !hasSubscriptionBenefit(arguments.subscriptionBenefit)) {
   *     arrayAppend(variables.subscriptionBenefits, arguments.subscriptionBenefit);
   *   }
   *   if(isNew() or !arguments.subscriptionBenefit.hasSku( this )) {
   *     arrayAppend(arguments.subscriptionBenefit.getSkus(), this);
   *   }
   *
   * SECONDARY ITEM S8 - THE TWO `isNew()` TESTS ARE SWAPPED RELATIVE TO {@link Sku.addAccessContent},
   * TWENTY LINES ABOVE.
   * The NEAR guard - about to append to THIS sku's own collection - tests the ARGUMENT's newness, and the
   * FAR guard - about to append to the argument's collection - tests THIS sku's. Each guard therefore
   * short-circuits on the newness of the entity it is NOT about to write to.
   *
   * ★ AND THE CONSEQUENCE IS ASYMMETRIC, WHICH IS WHY IT IS WORTH RECORDING RATHER THAN SHRUGGING AT.
   * Adding an UNSAVED benefit to a SAVED sku skips the near containment test, so calling this twice with
   * the same unsaved benefit puts it in `variables.subscriptionBenefits` TWICE. Adding a SAVED benefit to
   * an UNSAVED sku skips the far test and duplicates on the far side instead. Both are reachable in the
   * admin, where entities are constructed unsaved and linked before the first flush. `Product`'s
   * `addListingPage` has the identical inversion (its secondary item S5), which suggests a copy-paste
   * lineage rather than two independent slips.
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  addSubscriptionBenefit(subscriptionBenefit: SkuSubscriptionBenefitLink): void {
    // *** SECONDARY ITEM S8 [model/entity/Sku.cfc:L725, L728]: the two `isNew()` disjuncts are swapped
    // relative to `addAccessContent` [L705, L708] in this same file - each guard tests the newness of
    // the entity whose collection it is NOT writing to.
    // Preserved deliberately; do not fix without a product decision.

    // [L725-L727] NEAR side, guarded on the ARGUMENT's newness.
    if (subscriptionBenefit.isNew() || !this.hasSubscriptionBenefit(subscriptionBenefit)) {
      this.subscriptionBenefits.push(subscriptionBenefit);
    }
    // [L728-L730] FAR side, guarded on THIS sku's newness.
    if (this.isNew() || !subscriptionBenefit.hasSku(this)) {
      subscriptionBenefit.getSkus().push(this);
    }
  }

  /**
   * Unlinks this sku from a subscription benefit. [model/entity/Sku.cfc:L732-L741]
   *
   * Identical in shape to {@link Sku.removeAccessContent} - the inversion above affects only the `add`
   * halves.
   */
  removeSubscriptionBenefit(subscriptionBenefit: SkuSubscriptionBenefitLink): void {
    // [L733-L736]
    const thisIndex: number = this.subscriptionBenefits.indexOf(subscriptionBenefit);
    if (thisIndex !== -1) {
      this.subscriptionBenefits.splice(thisIndex, 1);
    }
    // [L737-L740]
    const farSide: Sku[] = subscriptionBenefit.getSkus();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  // --- Shape 4: ORM-generated -------------------------------------------------------------------

  /**
   * Links this sku to an option. NO SOURCE BODY EXISTS.
   *
   * ★ THIS PAIR IS ORM-GENERATED, AND ESTABLISHING THAT TOOK A CENSUS RATHER THAN AN ASSUMPTION. A
   * repository-wide grep for `addOption` inside `model/entity/Sku.cfc` returns NOTHING, yet
   * `model/entity/Option.cfc:L110-L112` calls `arguments.sku.addOption( this )` and relies on it working.
   * The mechanism is the collection declaration itself: [model/entity/Sku.cfc:L75] declares `options`
   * with `singularname="option"` and NO `inverse` attribute, so the CFML ORM synthesises `addOption` and
   * `removeOption` on the OWNING side.
   *
   * WHAT THE ORM SYNTHESISES IS DELIBERATELY LESS THAN A HAND-WRITTEN HELPER: it appends to this entity's
   * own collection and does nothing else. NO newness guard, NO containment test, and NO far-side
   * maintenance - the far side is the inverse side and the ORM mirrors it at flush time from the owning
   * collection. That is why {@link Sku.getOptions} is `readonly` despite this entity owning `SwSkuOption`:
   * the writes go through the FIELD, never through the accessor.
   *
   * ★ SO A DOUBLE `addOption` WITH THE SAME OPTION REALLY DOES PRODUCE A DUPLICATE ENTRY, where
   * `addAccessContent` would not. That is not an oversight in this port - it is the difference between a
   * generated accessor and a written one, and flattening it would give this entity a guard the legacy
   * never had.
   *
   * ★ AND THERE IS NO `hasOption` PROBE, for the same reason: nothing generates one on the owning side
   * and no far side calls one. The eleven probes on this class are enumerated in the module header, and
   * `hasOption` is deliberately not among them.
   */
  addOption(option: Option): void {
    this.options.push(option);
  }

  /**
   * Unlinks this sku from an option. NO SOURCE BODY EXISTS - ORM-generated, as
   * {@link Sku.addOption} explains.
   *
   * The generated `remove` splices the owning collection by REFERENCE and, like its partner, performs no
   * far-side maintenance. Reference matching is what the ORM does and it is also what every hand-written
   * `remove` in this file does, so the two agree here even though their `add` halves do not.
   */
  removeOption(option: Option): void {
    const index: number = this.options.indexOf(option);
    if (index !== -1) {
      this.options.splice(index, 1);
    }
  }

  // ==============================================================================================
  // CUSTOM VALIDATION METHODS [model/entity/Sku.cfc:L753-L786]
  // ==============================================================================================
  //
  // ★ BOTH OF THESE ARE DECLARED CONSTRAINTS, NOT HELPERS. `model/validation/Sku.json` attaches them to
  // the `options` property as METHOD rules:
  //
  //   "options": [ {"validate":"method","method":"hasUniqueOptions"},
  //                {"validate":"method","method":"hasOneOptionPerOptionGroup"} ]
  //
  // so they are the only two members on this entity that the validation tier invokes by name. Renaming
  // either would silently disable a rule, which is why the names are carried verbatim even though
  // `hasUniqueOptions` reads like a containment probe and is not one.

  /**
   * Whether no OTHER sku on this product carries the same option combination.
   * [model/entity/Sku.cfc:L756-L769]
   *
   *   var optionsList = "";
   *   for(var i=1; i<=arrayLen(getOptions()); i++){
   *     optionsList = listAppend(optionsList, getOptions()[i].getOptionID());
   *   }
   *   var skus = getProduct().getSkusBySelectedOptions(selectedOptions=optionsList);
   *   if(!arrayLen(skus) || (arrayLen(skus) == 1 && skus[1].getSkuID() == getSkuID() )) {
   *     return true;
   *   }
   *   return false;
   *
   * ★ IT REACHES A MUST-PRESERVE BEHAVIOUR, WHICH IS WHY IT IS ASYNC. `Product.getSkusBySelectedOptions`
   * runs the AND-of-EXISTS statement at [model/dao/SkuDAO.cfc:L107-L128] - named by AAP 0.8.1 among the
   * three areas that must be preserved exactly - so this member inherits its asynchrony. It is the only
   * async member outside the price and flag group.
   *
   * ★ THE LIST IT BUILDS IS THE SAME LIST {@link Sku.getOptionsIDList} MEMOIZES, rebuilt inline [L757-L761]
   * rather than reused. The duplication is the source's; this port calls the memoized accessor, which is
   * a pure de-duplication with no observable difference - the two loops are character-for-character the
   * same computation over the same collection.
   *
   * ★ `skus[1].getSkuID() == getSkuID()` COMPARES UUIDS, so an unsaved sku (key `''`) matching exactly one
   * unsaved sku reports itself unique. Preserved, on the same reasoning as {@link Sku.getDefaultFlag}.
   *
   * `getProduct()` is dereferenced unguarded [L763] - reproduced as a raise.
   */
  async hasUniqueOptions(): Promise<boolean> {
    if (this.product === undefined) {
      throw new Error(
        'Sku.hasUniqueOptions dereferences getProduct() unguarded ' +
          '[model/entity/Sku.cfc:L763] and this sku has no product. The legacy fails on the same ' +
          'input.',
      );
    }

    // [L757-L761] the same list getOptionsIDList memoizes.
    const optionsList: string = this.getOptionsIDList();

    // [L763]
    const skus: readonly Sku[] = await this.product.getSkusBySelectedOptions(optionsList);

    // [L764] `!arrayLen(skus)` - CFML numeric truthiness - OR exactly one match that is this sku.
    if (skus.length === 0) {
      return true;
    }
    const onlyMatch: Sku | undefined = skus[0];
    return skus.length === 1 && onlyMatch !== undefined && onlyMatch.getSkuID() === this.skuID;
  }

  /**
   * Whether this sku carries at most one option per option group. [model/entity/Sku.cfc:L772-L784]
   *
   *   var optionGroupList = "";
   *   for(var i=1; i<=arrayLen(getOptions()); i++){
   *     if(listFind(optionGroupList, getOptions()[i].getOptionGroup().getOptionGroupID())) {
   *       return false;
   *     } else {
   *       optionGroupList = listAppend(optionGroupList, ... );
   *     }
   *   }
   *   return true;
   *
   * ★ `listFind` IS CASE-SENSITIVE, AND THAT IS THE ONE PLACE ON THIS ENTITY WHERE CASE MATTERS.
   * Everywhere else the source uses `listFindNoCase` or `eq`, both of which fold; here it does not.
   * `src/lib/cfml/list.ts` deliberately exports only the folding `listFindNoCase`, so the exact match is
   * implemented locally over `listToArray` rather than by reaching for the wrong helper - which would
   * make two group IDs differing only in case collide and turn a valid sku invalid.
   *
   * In practice the IDs are uuids from one generator, so the distinction is theoretical - but a validation
   * rule is exactly the wrong place to substitute a looser comparison than the source's.
   *
   * ★ EARLY RETURN ON THE FIRST DUPLICATE, so a sku with three options from one group reports `false`
   * after examining two. No count is accumulated and no diagnostic names the offending group; the rule
   * answers only yes or no, and the validation tier supplies the message.
   *
   * `option.getOptionGroup()` is dereferenced unguarded [L776, L779] - reproduced as a raise.
   */
  hasOneOptionPerOptionGroup(): boolean {
    let optionGroupList: string = '';

    for (const option of this.options) {
      const optionGroup = option.getOptionGroup();
      if (optionGroup === undefined) {
        throw new Error(
          'Sku.hasOneOptionPerOptionGroup dereferences option.getOptionGroup() unguarded ' +
            `[model/entity/Sku.cfc:L776, L779] and option '${option.getOptionID()}' has no option ` +
            'group. The legacy fails on the same input.',
        );
      }
      const groupID: string = optionGroup.getOptionGroupID();

      // [L776] `listFind` - CASE-SENSITIVE exact element match, hence `===` over the parsed elements
      // rather than the folding listFindNoCase helper.
      if (listToArray(optionGroupList).includes(groupID)) {
        return false;
      }
      // [L779]
      optionGroupList = listAppend(optionGroupList, groupID);
    }

    return true;
  }

  // ==============================================================================================
  // OVERRIDDEN IMPLICIT GETTERS [model/entity/Sku.cfc:L792-L801]
  // ==============================================================================================

  /**
   * The conventional name of this sku's image. [model/entity/Sku.cfc:L794-L799]
   *
   *   if(!structKeyExists(variables, "imageName")) {
   *     variables.imageName = generateImageFileName();
   *   }
   *   return variables.imageName;
   *
   * ★ IT OVERRIDES AN IMPLICIT GETTER FOR A NON-PERSISTENT PROPERTY [L107], so `imageName` is a
   * DERIVED value that looks like a column. The memo is what makes the derivation happen once.
   *
   * Raises transitively through {@link Sku.generateImageFileName} - it needs a product and both
   * image settings.
   *
   * ★ AND NOTE THE ASYMMETRY WITH `imageFile` [L58], WHICH IS PERSISTED. `getImageFile()` reports what
   * is actually stored; this reports what the convention says the name SHOULD be. They can disagree,
   * and `Product.getDefaultProductImageFiles` deliberately reads the stored one.
   */
  getImageName(): string {
    if (this.imageName === undefined) {
      this.imageName = this.generateImageFileName();
    }
    return this.imageName;
  }

  // ==============================================================================================
  // OVERRIDDEN METHODS [model/entity/Sku.cfc:L807-L876]
  // ==============================================================================================

  /**
   * Which property stands for this entity in a label. [model/entity/Sku.cfc:L809-L811]
   *
   *   return "skuCode";
   *
   * ★ NOT DEAD CODE, THOUGH IT LOOKS IT. The framework reads the returned name in two places: it
   * aliases that property as `name` when projecting a smart list
   * [org/Hibachi/HibachiEntity.cfc:L390], and it registers it as a keyword-search property with
   * weight 1 [org/Hibachi/HibachiService.cfc:L31]. So the string decides how a sku is labelled and
   * how it is found, and porting it keeps both contracts legible even though neither consumer is in
   * this slice.
   *
   * ★ CONTRAST `Product`'s, WHICH RETURNS `"productName"` [model/entity/Product.cfc:L791]. A sku is
   * labelled by its CODE and a product by its NAME - which is why `SkuCurrency.getSimpleRepresentation`
   * builds `"<skuCode> - <currencyCode>"` [model/entity/SkuCurrency.cfc:L119] rather than using a name.
   */
  getSimpleRepresentationPropertyName(): string {
    return 'skuCode';
  }

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L813-L840]: `getAssignedAttributeSetSmartList()` IS NOT PORTED.
   *
   * The attribute/EAV subsystem is excluded (AAP 0.2.2) and this member is a smart list of the third
   * kind - it IS the whole behaviour and its consumers are the excluded admin views. Its body is the
   * `astSku` twin of {@link Sku.getAssignedOrderItemAttributeSetSmartList}'s `astOrderItem` version,
   * differing only in that one filter value.
   *
   * SECONDARY ITEM S4: IT GUARDS ONE DEREFERENCE AND NOT THE OTHER, AND THE PRODUCT TWIN GUARDS BOTH.
   * `getProduct().getBrand()` IS null-tested [L830], while `getProduct().getProductType()` is
   * dereferenced bare [L828] and then has `getProductTypeIDPath()` called on it. Compare
   * [model/entity/Product.cfc:L809], which guards `getProductType()` before reading the same path. So
   * the sku-scoped variant fails on a product with no product type where the product-scoped variant
   * does not, for the identical query.
   *
   * ★ AND IT CARRIES THE SAME UNPARAMETERISED INTERPOLATION [L828, L829, L831, L833] that
   * `getAssignedOrderItemAttributeSetSmartList` does. AAP 0.8.3 commits this port to parameterised SQL
   * exclusively; any future conversion must bind.
   */

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L843-L855]: `getPropertyMetaData(propertyName)` IS NOT PORTED.
   *
   * It overrides a member of the non-ported framework base [org/Hibachi/HibachiEntity.cfc] purely so
   * that the `onMissingMethod` override below can work: when the requested property name is 32
   * characters long it is "probably an optionGroupID" [L845-L846], so the body scans this sku's options
   * for a group with that ID and returns THAT OPTION'S metadata for `optionName` [L849]. Anything else
   * falls through to `super`.
   *
   * ★ THE `len(...) eq "32"` TEST COMPARES A NUMBER TO A STRING, which CFML resolves numerically. It is
   * also a heuristic rather than a check: any 32-character property name is treated as a candidate group
   * ID, and a real property with a 32-character name would be misrouted. There is none today.
   *
   * ★ AND IT IS THE REASON `getPropertyMetaData` MUST NOT BE REINVENTED HERE. Property metadata is a
   * framework reflection service over CFC attributes; TypeScript has no equivalent and manufacturing one
   * would import exactly the coupling the ESLint layer boundary exists to prevent. The behaviour is
   * recorded so the dynamic-accessor contract below is legible.
   */

  /**
   * LEGACY-NOTE [model/entity/Sku.cfc:L858-L873]: `onMissingMethod` IS NOT PORTED.
   *
   * The override gives every sku a DYNAMIC ACCESSOR PER OPTION GROUP: `get<optionGroupID>()` returns the
   * name of this sku's option in that group [L861-L869], and anything unmatched falls through to
   * `super.onMissingMethod` - the eleven-convention dispatcher at
   * [org/Hibachi/HibachiEntity.cfc:L507-L565] whose last branch is the attribute-value fallback.
   *
   * ★ THAT DYNAMIC SURFACE IS UNTYPEABLE AND IS DELIBERATELY NOT REPLACED. The typed equivalents already
   * exist and are what a caller should use: {@link Sku.getOptionByOptionGroupID} returns the OPTION and
   * {@link Sku.getOptionsByOptionGroupIDStruct} returns the whole map. Synthesising a Proxy to reproduce
   * the string dispatch would defeat `strict` and hide the very lookups the port is meant to make
   * visible.
   *
   * ★ AND `option.getOptionGroup()` IS UNGUARDED HERE TOO [L866], as it is in five other members on this
   * entity - so the dynamic accessor fails on a sku carrying a group-less option, for any requested name.
   */

  // ==============================================================================================
  // ORM EVENT HOOKS [model/entity/Sku.cfc:L878-L880]
  // ==============================================================================================
  //
  // ★ THE BANNER IS PRESENT AND THE BLOCK IS EMPTY, and that is a FACT about this entity's lifecycle
  // contract rather than an absence worth glossing over: `Sku` declares NO `preInsert`, NO `preUpdate` and
  // NO `preDelete`. Contrast `Category`, `PriceGroup`, `ProductType` and `PromotionCode`, each of which
  // declares hooks that F13 standardised, and `SkuCurrency`, whose banner is likewise empty.
  //
  // Nothing is invented to fill it. A repository saving a sku performs no entity-side lifecycle work.

  // ==============================================================================================
  // DEPRECATED METHODS [model/entity/Sku.cfc:L882-L912]
  // ==============================================================================================
  //
  // FOUR MEMBERS, ALL PORTED. They are ordinary public methods with real bodies and no framework reach,
  // so interface parity favours carrying them: a reviewer diffing the two surfaces sees the same four
  // names. Each keeps the source's own `@hint` as the deprecation notice, because that hint IS the
  // migration instruction the source gives.

  /**
   * This sku's option names joined for display. [model/entity/Sku.cfc:L885-L891]
   *
   * DEPRECATED at source - `// @hint: USE skuDefinition()`. Note the hint names `skuDefinition()`,
   * whereas the actual member is {@link Sku.getSkuDefinition}; and note also that the two do NOT produce
   * the same string - `getSkuDefinition` emits `" Group: Option, Group: Option"` with group labels and a
   * leading space, while this emits `"Option Option"` with neither. The hint points at a REPLACEMENT, not
   * an equivalent.
   *
   * ★ THE SOURCE DUPLICATES {@link Sku.getOptionsDisplay}'S BODY VERBATIM [L886-L890 vs L234-L238],
   * including the same `" "` default delimiter, rather than delegating. Ported as a delegation, which is
   * a pure de-duplication: the two loops are character-for-character identical over the same collection,
   * so no behaviour can differ.
   */
  displayOptions(delimiter: string = ' '): string {
    return this.getOptionsDisplay(delimiter);
  }

  /**
   * Alias for {@link Sku.getOptionsByOptionGroupIDStruct}. [model/entity/Sku.cfc:L894-L896]
   *
   * DEPRECATED at source - `// @hint: USE getOptionsByOptionGroupIDStruct()`.
   *
   * SECONDARY ITEM S5 - THIS NAME IS THE CLUE TO LEGACY-DEFECT D4. `getOptionsByGroupIDStruct` is
   * exactly the spelling of
   * the third, undeclared variable that [L517] writes into - `variables.OptionsByGroupIDStruct`. So the
   * defect is almost certainly a half-completed rename: the accessor was renamed from this name to the
   * longer one, an alias was left behind here, and one write inside the new body kept the old spelling.
   * Recording the connection is the point of porting the alias at all.
   */
  getOptionsByGroupIDStruct(): Record<string, Option> {
    return this.getOptionsByOptionGroupIDStruct();
  }

  /**
   * This sku's option IDs keyed by their option group's NAME. [model/entity/Sku.cfc:L899-L905]
   *
   *   var options = {};
   *   for(var i=1;i<=arrayLen(getOptions());i++) {
   *     options[getOptions()[i].getOptionGroup().getOptionGroupName()] = getOptions()[i].getOptionID();
   *   }
   *   return options;
   *
   * DEPRECATED at source - `// @hint: NEVER USE`, the strongest of the four hints and the only one that
   * offers no replacement.
   *
   * ★ AND THE HINT IS EARNED: THE KEY IS A DISPLAY NAME. Option group names are human-editable and not
   * unique, so two groups sharing a name collapse into one entry - LAST-WINS here, unlike the FIRST-WINS
   * of the two structs above, because there is no containment guard. The value is also an option ID
   * rather than an option, so a caller gets a string it must then resolve. Both are reproduced.
   *
   * `option.getOptionGroup()` is dereferenced unguarded [L902] - reproduced as a raise.
   */
  getOptionsValueStruct(): Record<string, string> {
    const options: Record<string, string> = {};
    for (const option of this.options) {
      const optionGroup = option.getOptionGroup();
      if (optionGroup === undefined) {
        throw new Error(
          'Sku.getOptionsValueStruct dereferences option.getOptionGroup() unguarded ' +
            `[model/entity/Sku.cfc:L902] and option '${option.getOptionID()}' has no option group. ` +
            'The legacy fails on the same input.',
        );
      }
      // LAST-WINS: no containment guard, and the key is a non-unique display name.
      options[optionGroup.getOptionGroupName() ?? ''] = option.getOptionID();
    }
    return options;
  }

  /**
   * Whether this sku is NOT its product's default. [model/entity/Sku.cfc:L908-L910]
   *
   *   return !getDefaultFlag();
   *
   * DEPRECATED at source - `// @hint: USE getDefaultFlag()`.
   *
   * ★ IT INHERITS BOTH OF {@link Sku.getDefaultFlag}'S RAISES, which is worth stating because a negated
   * boolean reads as though it must be total. An orphan sku and a product with no default sku both fail
   * here, exactly as they do there - the negation happens after the dereference, not instead of it.
   */
  isNotDefaultSku(): boolean {
    return !this.getDefaultFlag();
  }
}

// ---------------------------------------------------------------------------------------------------
// WHAT THE TEST TIER MUST PIN FOR THIS MODULE
//
// AAP 0.6.6 records that only TWO legacy test files touch the in-scope slice, and NEITHER IS THIS ONE -
// `meta/tests/unit/entity/BrandTest.cfc` and `meta/tests/unit/entity/ProductTest.cfc` are the two, and
// there is no `SkuTest.cfc` anywhere under `meta/tests/`. EVERY obligation below is therefore NET-NEW and
// must be labelled as such in `tests/traceability/legacyTestMap.ts`; presenting any of it as parity would
// fail AAP 0.9.4.
//
// That is a striking fact worth stating rather than burying: the entity that owns one of the three
// must-preserve behaviours in the entire plan has ZERO legacy coverage. Obligations 1 through 9 are
// consequently the highest-value tests in this module and arguably in the port - AAP 0.9.3 requires the
// currency cascade to be tested at all four steps INCLUDING the gate, and AAP 0.9.2 names the
// `undefined` returns of the three currency accessors "the single highest-consequence parity check in
// the plan".
//
//   1. ★ THE ELIGIBILITY GATE (STEP 0). With `skuEligibleCurrenciesSetting` empty or absent,
//      `getCurrencyDetails()` is `{}` and ALL THREE currency accessors answer `undefined` for EVERY
//      currency - including the sku's own base currency, and including a currency for which a
//      `SwSkuCurrency` override row exists. Assert the empty map AND the three `undefined`s; a test that
//      only checks the map would pass against a port that leaked a fallback into the accessors.
//   2. ★ STEP 1 - the sku's own columns are applied to EXACTLY ONE currency, the one equal to
//      `skuCurrencySetting`, and the match is CASE-INSENSITIVE (`cfEquals`). Assert `converted === false`
//      and `skuCurrencyID === ''` on that entry, and assert that a second eligible currency does NOT
//      receive the sku's columns.
//   3. ★ STEP 1's TWO CONDITIONAL WRITES. A sku with a `price` but no `listPrice` and no `renewalPrice`
//      must produce an entry where `getPriceByCurrencyCode` answers a value while
//      `getListPriceByCurrencyCode` and `getRenewalPriceByCurrencyCode` answer `undefined` FOR THE SAME
//      PRESENT CURRENCY. This is the second-existence-check behaviour AAP 0.6.3 calls out, and it is the
//      one a naive port loses first.
//   4. ★ STEP 2 OVERWRITES STEP 1. Give the sku a base-currency price AND a `SwSkuCurrency` row for the
//      same currency with a different price; assert the ROW's price wins, `converted === false`, and
//      `skuCurrencyID` is the ROW's id rather than `''`. Then assert the inverse: for a currency with a
//      row but no step-1 match, `skuCurrencyID` is still the row's.
//   5. ★ STEP 2 HAS NO `break`, SO THE LAST ROW WINS. Two `SwSkuCurrency` rows for one currency must
//      yield the SECOND row's price and the SECOND row's `skuCurrencyID`. There is no unique constraint
//      preventing the input, so the behaviour is reachable.
//   6. ★ STEP 3 IS SUPPRESSED BY A PRESENT PRICE, NOT BY A PRESENT ENTRY. A currency that step 1 or 2
//      priced must come back with `converted === false` and must NOT consult
//      `convertedCurrencyPrices` - spy on the input and assert it was not read for that code. A currency
//      neither step priced must come back with `converted === true`.
//   7. ★ STEP 3's TWO GUARDS TEST THE SKU'S OWN COLUMNS, NOT THE MAP'S KEYS. A sku with a `price` and a
//      `listPrice` but no `renewalPrice` must, for a converted currency, receive a converted price and a
//      converted list price and NO renewal price - even if `convertedCurrencyPrices` supplies one.
//      Supplying an unread value must be harmless.
//   8. ★ A MISSING CONVERTED VALUE RAISES, IT DOES NOT DEFAULT. With `this.price` present and
//      `convertedCurrencyPrices[code].price` absent, `getCurrencyDetails()` must THROW. Assert the throw
//      and assert the message names the currency - answering `undefined` there is precisely the failure
//      AAP 0.6.3 describes as selling products for free.
//   9. ★ NO KEY IS EVER WRITTEN WITH AN `undefined` VALUE. For an eligible currency that matches no step
//      at all - no base-currency match, no override row, and a sku with no `price` - the entry must
//      exist, `skuCurrencyID` must be `''`, and `structKeyExists(detail, 'price')` must be FALSE rather
//      than true-with-undefined. `src/lib/cfml/struct.ts` keeps those states distinct deliberately and
//      the two-check accessors depend on the difference.
//  10. `getCurrencyCode()` returns the resolved setting and MEMOIZES it; with no setting materialized it
//      RAISES. Assert that the raise message explains why a `'USD'` literal is not substituted - the
//      default belongs at `model/service/SettingService.cfc:L221`, one tier out.
//  11. ★ D1 - `getPriceByPromotion(promotion)` THROWS on every call, and the message must name
//      `calculateSkuPriceBasedOnPromotion` and record that the legacy declares it nowhere. Assert the
//      method is CALLABLE WITH ONE ARGUMENT: interface parity is the acceptance contract, so the failure
//      belongs at call time and not at compile time.
//  12. ★ D2 - `getOptionByOptionGroupCode(code)` THROWS for a code that IS present in the code-keyed
//      struct, and answers `undefined` for one that is not. Both halves matter: the guard passes and the
//      read misses, which is the whole defect. A test that only checks the `undefined` would pass against
//      a corrected implementation.
//  13. ★ D3 FIXED - `getOptionsByOptionGroupCodeStruct()` returns a POPULATED map keyed by group code,
//      and calling it does NOT clobber `getOptionsByOptionGroupIDStruct()`. Assert both, in that order,
//      on one instance. Then assert the reverse order gives the same two answers.
//  14. ★ D4 FIXED - `getOptionsByOptionGroupIDStruct()` returns a POPULATED map keyed by group ID.
//      Assert that `getOptionByOptionGroupID(id)` therefore finds the option, which it never could in the
//      legacy. The doc comment must record that AAP 0.6.7's "unobservable through the public contract"
//      framing does NOT hold for this one - the returned value changes from `{}` to a populated map.
//  15. ★ BOTH OPTION STRUCTS ARE FIRST-WINS. Two options from the same group must yield the FIRST, in
//      both the ID-keyed and the code-keyed map. Contrast obligation 25.
//  16. ★ D5 and D6 - `getNextEstimatedAvailableDate()` THROWS, naming the inventory and stock
//      subsystems. The two defects are documented rather than executable; assert the doc comment carries
//      both markers so a future port of the inventory tier inherits them.
//  17. ★ D7 - `getSkuDefinition()` on a merchandise sku with two options returns a string whose FIRST
//      CHARACTER IS A SPACE, and whose second element also opens with one:
//      `' Colour: Red, Size: Large'`. Assert the leading space explicitly; a `.trim()` in the assertion
//      would hide the defect the test exists to pin.
//  18. ★ D7's THREE BRANCHES. `contentAccess` returns `''` (the PRESENT-AND-EMPTY branch, not a
//      fall-through); `merchandise` builds the option list; `subscription` returns
//      `'<resolved label>: <term name>'` and RAISES without a label provider or without a term. A base
//      product type outside the three returns `''` by falling off the chain.
//  19. ★ D8 - the two deprecated-size blocks disagree. Both `getResizedImage` and `getResizedImagePath`
//      throw here, so assert the DOCS record: that the first accepts a positional size and the second
//      does not, and that the first leaves an unrecognised size untouched while the second forces it to
//      `Small`. These are the semantics a future image-tier port must reproduce.
//  20. ★ D9 - `getSalePriceExpirationDateTime()` returns the EMPTY STRING, not `undefined`, when no
//      detail carries an expiry, and a `Date` when one does. The return type must be `Date | ''`;
//      typing it `Date | undefined` would let a caller `?? new Date()` past a failure the legacy has.
//  21. ★ D10 - `getSalePriceDiscountType()` returns `''` for a sku with no sale-price detail, where
//      `Product.getSalePriceDiscountType()` seeds `'none'`. Assert BOTH values in ONE test so the
//      disagreement is the assertion rather than a footnote.
//  22. `getSalePrice()` returns the detail's `salePrice` when present and falls back to `getPrice()` -
//      which means it can be `undefined`. Assert the `undefined` for a sku with neither; a `0` there
//      would be a price a customer is charged.
//  23. `getSalePriceDetails()` answers `undefined` for a sku with no sale price and does NOT raise. An
//      absent detail and an empty legacy struct are indistinguishable at source, and the common case is
//      absence.
//  24. ★ `getImageExtension()` IS LIST SEMANTICS, NOT A FILENAME PARSE. Assert `'a..jpg'` -> `'jpg'`,
//      `'photo.'` -> `'photo'` (NOT `''`), `'photo'` -> `'photo'`, and `undefined` -> `''`. A
//      `split('.').pop()` implementation fails the middle two.
//  25. ★ `getOptionsDisplay()` ELIDES AN EMPTY NAME ONLY IN THE LEADING POSITION. Assert BOTH halves of
//      the asymmetry, because asserting only one of them is how the mistaken reading survives: options
//      `[unnamed, 'LG']` must yield `'LG'` with NO leading space, while `['RED', unnamed]` must yield
//      `'RED '` WITH the trailing space. Assert the default delimiter is a SINGLE SPACE and that a
//      supplied delimiter is honoured. `displayOptions()` must produce the identical string.
//      The same asymmetry governs `getOptionsIDList()` - `[saved, unsaved]` is `'O1,'` - so assert that
//      too, together with the fact that `listToArray` discards the trailing empty so the must-preserve
//      SQL is unaffected.
//  26. ★ `generateImageFileName()` STRIPS CASE-INSENSITIVELY. A product code of `'SHIRT'` must survive
//      as `'SHIRT'`, not `'shirt'` and not `''`. Assert the DELIMITER PRECEDES each option code - with
//      delimiter `'-'` and two image-group options the result is `'SHIRT-RED-LG.jpg'` - and that
//      non-image-group options contribute nothing.
//  27. ★ THE NINE LIVE ASSOCIATION ACCESSORS RETURN THE SAME ARRAY INSTANCE ON REPEATED CALLS, and the
//      other six do not permit mutation through the accessor. Assert identity
//      (`a.getSkuCurrencies() === a.getSkuCurrencies()`) for all nine, and assert that `getOptions()` is
//      typed `readonly` even though this entity OWNS `SwSkuOption`. The census in the association section
//      is the authority; a test that assumes ownership implies liveness will contradict it.
//  28. ★ `addOption`/`removeOption` ARE ORM-GENERATED AND HAVE NO GUARD. Calling `addOption` twice with
//      the SAME option must produce TWO entries, where `addAccessContent` twice produces one. Assert
//      both in one test - the contrast IS the behaviour.
//  29. ★ THERE IS NO `hasOption` PROBE. Assert `('hasOption' in sku)` is false. The eleven probes are
//      enumerated in the module header and `hasOption` is deliberately absent, because nothing generates
//      one on the owning side and no far side calls one.
//  30. ★ THE ELEVEN PROBES MATCH BY PRIMARY KEY WITH A REFERENCE FALLBACK - except
//      `hasAttributeValue`, `hasAccessContent` and `hasSubscriptionBenefit`, which are REFERENCE-ONLY
//      because their link projections carry no key accessor. Assert a saved far-side row is found by an
//      equal-key twin for the eight keyed probes and NOT found for the three reference-only ones.
//  31. ★ S8 - `addSubscriptionBenefit`'s TWO `isNew()` DISJUNCTS ARE SWAPPED relative to
//      `addAccessContent`'s. Assert all four newness combinations for BOTH methods in one table-driven
//      test: an unsaved benefit added twice to a SAVED sku duplicates on the NEAR side, and a saved
//      benefit added twice to an UNSAVED sku duplicates on the FAR side, while `addAccessContent`
//      duplicates in the mirror-image cases.
//  32. ★ `setProduct` APPENDS INTO `Product.getSkus()`, WHICH IS LIVE. Assert the far-side array grew,
//      assert the guard skipped the containment test for an unsaved sku, and assert `removeProduct`
//      splices BY REFERENCE while `hasSku` matches BY KEY - so a distinct object with an equal key is
//      "present" to the probe and invisible to the splice.
//  33. ★ `removeProduct` DELETES THE LOCAL FIELD UNCONDITIONALLY. Call it with a DIFFERENT product than
//      the sku is attached to: the far-side splice must find nothing and `getProduct()` must still become
//      `undefined`. Then call it with NO argument on a product-less sku and assert the raise.
//  34. ★ S1 - `getDefaultFlag()` RAISES TWICE OVER, and `isNotDefaultSku()` inherits both. Assert the
//      raise for an orphan sku and for a product with no default sku, through BOTH members. Then assert
//      that two UNSAVED skus - both with key `''` - compare EQUAL, so an unsaved sku reports itself the
//      default of a product whose default sku is also unsaved.
//  35. ★ S3 - `getLivePrice()` RAISES when the sku has no price, BEFORE any comparison. Assert the raise,
//      then assert the minimum is taken over `Money.compare` and not over numbers: with price `19.99`,
//      sale price `19.90` and current-account price `19.95` the answer is `19.90`, and with three values
//      that differ only in the third decimal the answer must still be exact.
//  36. ★ `hasUniqueOptions()` IS ASYNC AND REACHES A MUST-PRESERVE PATH. Assert it passes
//      `getOptionsIDList()`'s exact string to `Product.getSkusBySelectedOptions`, and assert all three
//      outcomes: no match -> `true`, one match that IS this sku -> `true`, one match that is NOT ->
//      `false`, two matches -> `false`. Assert the raise for a product-less sku.
//  37. ★ `hasOneOptionPerOptionGroup()` IS CASE-SENSITIVE. Two group IDs differing only in case must NOT
//      collide, so a sku carrying both must answer `true`. A port that reached for `listFindNoCase`
//      answers `false` and turns a valid sku invalid - which is why this one comparison is implemented
//      locally rather than through the shared helper.
//  38. ★ BOTH VALIDATION METHODS ARE REACHED BY NAME FROM `model/validation/Sku.json`. Assert the two
//      names exist on the prototype exactly as spelled there - `hasUniqueOptions` and
//      `hasOneOptionPerOptionGroup`. A rename silently disables a rule.
//  39. `getOptionsValueStruct()` IS LAST-WINS and keys by a NON-UNIQUE DISPLAY NAME. Two groups sharing a
//      name must collapse to one entry holding the SECOND option's id - the mirror image of obligation
//      15's first-wins, in the same file.
//  40. THE FOUR DEPRECATED MEMBERS ARE ALL PRESENT AND ALL DELEGATE:
//      `displayOptions === getOptionsDisplay`, `getOptionsByGroupIDStruct ===
//      getOptionsByOptionGroupIDStruct`, `getOptionsValueStruct` as above, and `isNotDefaultSku ===
//      !getDefaultFlag`. Interface parity is checked member by member (AAP 0.9.2), so their absence is a
//      failure even though their use is discouraged.
//  41. `getQuantity(type)` THROWS THE SOURCE'S OWN MESSAGE BYTE FOR BYTE for an invalid type - including
//      the DOUBLE SPACE after the first sentence - and throws the subsystem-exclusion message for a valid
//      one. Assert both whitelists are matched CASE-INSENSITIVELY, so `'qats'` reaches the second throw
//      and not the first. `getQATS()` must delegate, so its failure names the inventory tier.
//  42. ★ THE ANTI-CONTRACT, in three parts. (a) `Sku.prototype` has NO `preInsert`, NO `preUpdate` and NO
//      `preDelete` - the ORM Event Hooks banner is present and empty, which is a fact about the lifecycle
//      contract. (b) It has NO `getImageDirectory`, because `Product.getImageDirectory` reproduces the
//      legacy's `''` answer and documents WHY at its own site; adding one here would change that answer.
//      (c) It has NO aggregate probe - no `hasAnyOption` and no `hasAnySkuCurrency` - because no engine
//      call site asks for one, unlike `promotionQualifier.ts` and `promotionReward.ts` where two each are
//      required.
//  43. EVERY MONETARY MEMBER RETURNS `Money`, NEVER `number`. Assert the constructor accepts `Money` for
//      `price`, `listPrice` and `renewalPrice`, that the three currency accessors and `getSalePrice`
//      return `Money | undefined`, and that `getPriceByPriceGroup`, `getCurrentAccountPrice` and
//      `getLivePrice` return `Money`. AAP 0.8.3 admits no float arithmetic on a currency value anywhere
//      in this port.
//  44. THE TWO BOOLEAN COLUMNS HAVE DIFFERENT DEFAULTS. `activeFlag` defaults to TRUE [L53] and
//      `userDefinedPriceFlag` to FALSE [L59]. Assert both with the field omitted, and assert `cfBoolean`
//      parity for `1`, `'1'`, `'true'`, `0`, `'0'` and `'false'`.
//  45. `getCalculatedQATS()` AND `getQATS()` ARE INDEPENDENT. Assert a sku can report a persisted
//      `calculatedQATS` while `getQATS()` still throws - the column and the accessor answer different
//      questions, exactly as `Product.getTitle()` ignores `calculatedTitle`.
// ---------------------------------------------------------------------------------------------------
