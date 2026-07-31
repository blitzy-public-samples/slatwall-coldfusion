// ---------------------------------------------------------------------------
// slatwall-ts - PriceGroupRate entity
//
// PORT OF model/entity/PriceGroupRate.cfc (284 lines, confirmed by `wc -l`; the class body
// spans L49-L283 and L284 is a trailing blank line).
//
// THE COMPONENT DECLARATION, VERBATIM [model/entity/PriceGroupRate.cfc:L49]
//
//   component displayname="Price Group Rate" entityname="SlatwallPriceGroupRate"
//   table="SwPriceGroupRate" persistent=true output=false accessors=true
//   extends="HibachiEntity" cacheuse="transactional" hb_serviceName="priceGroupService"
//   hb_permission="priceGroup.priceGroupRates" {
//
// Schema continuity is a binding constraint: the entity property metadata IS the contract.
// Table `SwPriceGroupRate`, entity name `SlatwallPriceGroupRate`. No migration, no rename, no
// new table, no column change. Every `hb_*`, `rbKey` and `hb_*RBKey` value is carried forward
// verbatim so the legacy admin can still resolve it. JavaRB is NOT ported and NO i18n runtime
// is introduced, so a resource-bundle identifier travels as the identifier itself.
//
// LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L49]: the three boolean attributes are written
// UNQUOTED - `persistent=true output=false accessors=true` - whereas model/entity/Brand.cfc:L49
// and model/entity/Category.cfc:L49 quote the same three. The same wart appears on
// model/entity/PriceGroup.cfc:L49, this entity's parent. CFML accepts both spellings, so it is
// cosmetic; the declaration recorded above is reproduced as written and is NOT normalised.
//
// LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L49]: `hb_serviceName="priceGroupService"` is
// SHARED with model/entity/PriceGroup.cfc:L49 - both entities resolve to the one real
// model/service/PriceGroupService.cfc, which is why there is no `PriceGroupRateService` to port
// and no such omission to explain. Contrast model/entity/Category.cfc:L49, whose
// `hb_serviceName="contentService"` points at a service that is genuinely out of scope, and
// model/entity/ProductType.cfc:L49, which points at `productService`.
//
// LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L49]: `hb_permission="priceGroup.priceGroupRates"`
// is a DOTTED child-of-parent permission, nesting this entity's permissions under its parent
// rather than under itself. Contrast model/entity/PriceGroup.cfc:L49, which declares
// `hb_permission="this"`. It is spelled CORRECTLY here, and that is worth recording: it is the
// correctly-spelled analogue of the preserved typo `hb_permission="promotionPeriod.promtionRewards"`
// at model/entity/PromotionReward.cfc:L57. Both are preserved verbatim - the misspelled one
// because it is a data contract the legacy admin resolves, this one because it is right.
//
// LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L49]: there is NO `hb_parentPropertyName` and NO
// `hb_processContexts` on this component. The first is correct - this is not a self-referential
// materialized-path entity, unlike model/entity/PriceGroup.cfc, model/entity/ProductType.cfc and
// model/entity/Category.cfc. The second means no process object targets this entity, so no
// `processPriceGroupRate_*` surface exists to port.
//
// ★ THIS IS THE LEAF THE PRICE-GROUP CASCADE RESOLVES TO, which is why it participates in one of
// the three must-preserve behaviours. All three rate resolvers -
// `getRateForProductTypeBasedOnPriceGroup` [model/service/PriceGroupService.cfc:L57],
// `getRateForProductBasedOnPriceGroup` [L102] and `getRateForSkuBasedOnPriceGroup` [L140] - return
// an instance of THIS class, the five-level resolution cascade at [L140-L181] selects one, and
// `calculateSkuPriceBasedOnPriceGroupRate` [L316-L340] then reads `getAmountType()`, `getAmount()`
// and `getRoundingRule()` off it to compute the price a customer is charged. Two documented
// asymmetries are visible from here and BOTH live in the SERVICE, not in this file:
//
//   * ONLY THE `percentageOff` BRANCH APPLIES THE ROUNDING RULE [L321-L330]. `amountOff` [L331]
//     and `amount` [L334] skip it entirely even though `roundingRule` is declared on THIS entity
//     and is equally available to all three. Registered against the service; noted on
//     `getRoundingRule()` below so a reader of this file is not misled into assuming uniform use.
//   * THE PARENT RECURSION AT [L174] calls `getRateForProductBasedOnPriceGroup` rather than the
//     SKU variant, breaking the cascade's symmetry. Also the service's, also preserved there.
//
//   A third fidelity point about the same switch: [L321-L336] has NO `default:` case, so an
//   `amountType` outside the three published values passes straight through with the SKU's own
//   price. That is the observable consequence of the vocabulary this file publishes, and it is why
//   `PriceGroupRateAmountType` below is a closed union rather than an open string.
//
// ★ `getGlobalFlag()` IS THE CASCADE'S GLOBAL FALLBACK SELECTOR. `PriceGroup.getGlobalPriceGroupRate()`
// [model/entity/PriceGroup.cfc:L83-L90] scans a price group's rates for the one whose flag is set
// and FALLS OFF THE END returning null when there is none - which is load-bearing for the
// cascade's fall-through. This class is where the flag it scans for lives.
//
// THE ASSOCIATION CENSUS [model/entity/PriceGroupRate.cfc:L67-L77]
//
//   | locator | property             | fieldtype    | link table                    | accessor |
//   |---------|----------------------|--------------|-------------------------------|----------|
//   | L67     | priceGroup           | many-to-one  | (fkcolumn priceGroupID)       | single   |
//   | L68     | roundingRule         | many-to-one  | (fkcolumn roundingRuleID)     | single   |
//   | L71     | productTypes         | many-to-many | SwPriceGroupRateProductType   | LIVE     |
//   | L72     | products             | many-to-many | SwPriceGroupRateProduct       | LIVE     |
//   | L73     | skus                 | many-to-many | SwPriceGroupRateSku           | LIVE     |
//   | L75     | excludedProductTypes | many-to-many | SwPriceGrpRateExclProductType | readonly |
//   | L76     | excludedProducts     | many-to-many | SwPriceGroupRateExclProduct   | readonly |
//   | L77     | excludedSkus         | many-to-many | SwPriceGroupRateExclSku       | readonly |
//
// ★ NONE OF THE SIX DECLARES `inverse="true"`, SO THIS ENTITY OWNS ALL SIX LINK TABLES. That is
// exactly why the helper block at [L198-L256] is captioned `(many-to-many - owner)` and mutates
// BOTH the near-side array AND the far side's `getPriceGroupRates()`. The three INCLUDED
// collections are handed out LIVE because they are mutation targets in this very class -
// [L201, L208-L210], [L221, L228-L230] and [L241, L248-L250] append to and delete from them. The
// three EXCLUDED collections are handed out readonly because NOTHING mutates them anywhere: this
// component declares no helper for them at all (see the gap flag on their declarations).
//
// ★ NONE OF THE SIX DECLARES `type="array"` EITHER, matching the same omission on
// model/entity/PriceGroup.cfc L63/L64/L67. All six are still materialized as arrays, because a
// Hibernate-managed collection never handed back null; the metadata omission is recorded and not
// corrected.
//
// ASSOCIATIONS ARE MATERIALIZED AT THE REPOSITORY BOUNDARY. Hibernate lazy collections have no
// equivalent in a driver-only stack, so each association arrives already populated and the fetch
// shape is an explicit, documented decision at the repository method that produced it. This
// entity declares NEITHER `fetch="join"` NOR `lazy="extra"` on any property - verified across
// L52-L82 - so there is no eager-fetch and no extra-lazy ruling to encode here, and a later
// reader should not go looking for one. Contrast model/entity/Product.cfc L68/L69/L70, which do
// declare three eager `fetch="join"` many-to-ones.
//
// EVERY METHOD ON THIS CLASS IS SYNCHRONOUS. `model/entity/PriceGroupRate.cfc` contains ZERO
// `getService(` call sites - independently re-verified by grep across all 284 lines - and NO
// collaborator port is injected. The async boundary rule is that a method becomes `async` if and
// only if its legacy body reached the DAO or the ORM, and no body here does: `getAppliesTo()`
// counts already-materialized arrays, `getAmountFormatted()` and `getDisplayName()` do pure
// string work, and the helpers splice materialized arrays. That keeps the accessor shape
// identical to the legacy contract.
//
// ALL MONEY PASSES THROUGH `Money`. `amount` is `ormType="big_decimal"` [L54] and feeds
// `calculateSkuPriceBasedOnPriceGroupRate`, where `precisionEvaluate` guards the arithmetic
// [model/service/PriceGroupService.cfc:L322, L328]. No raw floating-point operation on this value
// exists anywhere in the target, and `decimal.js` is NOT imported here - the Money value object is
// the only domain module permitted to import it.
//
// THE `extends` CHAIN IS THREE LEVELS DEEP, NOT TWO. `extends="HibachiEntity"` on L49 is
// UNQUALIFIED, so it resolves to the local model/entity/HibachiEntity.cfc (274 lines), whose own
// declaration reads `extends="Slatwall.org.Hibachi.HibachiEntity"`. The intermediate class holds
// TWELVE `getService(...)` sites (L123, L130, L135, L145, L178, L180, L182, L194, L196, L207,
// L257, L266), seven of them `attributeService`. They are moot here because the EAV path is not
// ported, and they are NOT silently re-implemented: an entity reaching outward through a service
// locator is exactly the pattern the ESLint `no-restricted-imports` layer boundary makes
// impossible.
//
// THE FRAMEWORK'S DYNAMIC DISPATCH IS NOT EMULATED. `org/Hibachi/HibachiEntity.cfc:L507-L565`
// resolves ELEVEN method-name patterns at runtime (`hasUniqueOrNull*`, `hasUnique*`, `hasAny*`,
// `get*AssignedIDList`, `get*ID`, `get*Options`, `get*OptionsSmartList`, `get*SmartList`,
// `get*Struct`, `get*Count`, plus a `getAttributeValue` fallback) and terminates in a THROW at
// L565. There is no `Proxy`, no index signature, no string-keyed method resolution and no
// `onMissingMethod` emulation anywhere in this file. Only the concretely-called patterns are
// generated, each annotated with the dispatch branch it replaces - here that is exactly three
// singular `has*` probes plus `isNew()`.
//
//   AND THIS ENTITY CAN NEVER REACH THE EAV FALLBACK. The `getAttributeValue` branch at
//   [org/Hibachi/HibachiEntity.cfc:L559] requires `hasProperty("attributeValues")`, and
//   `PriceGroupRate` declares NO `attributeValues` property - only Sku, Product, ProductType and
//   Brand do. So an unmatched `get…` on this entity throws directly at L565. `attributeValues` is
//   NOT materialized here, the EAV read path is NOT ported, and no nineteenth entity module is
//   created for it.
//
// NO `hasAny*` PROBE IS AUTHORED. Branch 3 of the dispatcher, backed by `hasAnyInProperty` at
// [org/Hibachi/HibachiEntity.cfc:L340-L350], is live only on the promotion qualifier and promotion
// reward modules. Nothing calls it on a price group rate.
//
// NO SMART LIST AND NO VALIDATION SCHEMA. There is no `get*SmartList` override on this component
// and none is added: `HibachiSmartList` is a generic, string-keyed, dynamically-filtered query
// builder, and porting it would re-import exactly the framework coupling this refactor exists to
// remove while being untypeable under the strict profile. It is replaced by explicit typed
// repository query methods owned by src/repositories/mysql/** and src/services/**. Declarative
// validation is likewise the service tier's, not this class's - see the note on the orphan
// condition at the foot of this file.
//
// THE PRESERVED-DEFECT BUDGET FOR THIS FILE IS EXACTLY THREE, and behaviour preservation extends
// to defects: a method that throws at runtime today throws in the target.
//
//   1. [L131-L133] `getAppliesTo()`'s INCLUDING branch replaces only the FIRST comma, despite a
//      comment claiming "all commas".
//   2. [L156-L159] the EXCLUDING branch carries the identical defect.
//   3. [L275] `getDisplayName()` dereferences `getPriceGroup()` with no null guard.
//
// Everything else recorded in this file is a LEGACY-NOTE: an architecture consequence, a
// preserved cosmetic wart, or a preserved identifier/casing wart. ZERO signature widenings, ZERO
// deliberate divergences, ZERO signature reshapings and ZERO visibility widenings are spent here.
//
// NO USER RULES WERE PROVIDED for this project - the rules source returns exactly "No user rules
// provided." Their absence is not licence to lower the bar: the enterprise substitute standard
// applies at full strength - maximal strictness, no `any` and no suppression comment, one
// exported unit per file, no barrel, parameterized SQL kept out of the domain entirely, and every
// judgment call annotated where it was made.
// ---------------------------------------------------------------------------

import { listAppend, listLen } from '../../lib/cfml/list.js';
import { cfNumberToString, numberFormat } from '../../lib/cfml/numberFormat.js';
import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import { cfBoolean, cfLen, isNullish } from '../../lib/cfml/truthiness.js';
import type { Money } from '../valueObjects/money.js';
import type { PriceGroup } from './priceGroup.js';
import type { Product } from './product.js';
import type { ProductType } from './productType.js';
import type { RoundingRule } from './roundingRule.js';
import type { Sku } from './sku.js';

/**
 * The three values the persisted `amountType` column [model/entity/PriceGroupRate.cfc:L55] is
 * allowed to hold, published verbatim by `getAmountTypeOptions()` [L87-L93].
 *
 * ★ THIS IS THE AUTHORITATIVE `amountType` VOCABULARY BACKING THE STRATEGY DISPATCH, and it is the
 * ONE co-located exported type alias this module carries. It is exported because
 * src/services/priceGroupService.ts needs it to type the amount-type Strategy dispatch that ports
 * `calculateSkuPriceBasedOnPriceGroupRate` [model/service/PriceGroupService.cfc:L316-L340], and
 * because there is no other legal home for it: `valueObjects/`, `views/` and `promotionEngine/`
 * own different concerns, and no nineteenth entity module may be created. Nothing else in this
 * module is exported - no barrel, no `index.ts`, no `types.ts`, no second exported class.
 *
 * ★ NOTE THE THIRD MEMBER. Its display key is `define.fixedAmount` but its stored value is plain
 * `amount`, and the persisted column holds `"amount"` - never `"fixedAmount"`. The mismatch is
 * the source's [L91] and is preserved verbatim, because `amount` is the literal the service's
 * `switch` compares against [model/service/PriceGroupService.cfc:L334]. Renaming it to match its
 * own label would silently break the pricing dispatch.
 *
 * The three values are lowercase-first camelCase and are written that way at every site in the
 * legacy source, which is what makes a case-sensitive `===` comparison faithful - see
 * {@link PriceGroupRate.getAmountFormatted}.
 *
 * NARROWING BELONGS AT THE REPOSITORY BOUNDARY. `SwPriceGroupRate.amountType` is a plain
 * `ormType="string"` column with no check constraint, so the row-to-entity factory in
 * src/repositories/mysql/** is where a hydrated value is proven to be one of these three. Typing
 * the column as the closed union here is what forces that proof to happen exactly once, at the
 * boundary, instead of being re-litigated at every read.
 */
export type PriceGroupRateAmountType = 'percentageOff' | 'amountOff' | 'amount';

/**
 * One row of `getAmountTypeOptions()` [model/entity/PriceGroupRate.cfc:L87-L93].
 *
 * A `type` alias rather than an `interface`, and that is load-bearing rather than stylistic: an
 * `interface` is NOT assignable to `Readonly<Record<string, unknown>>` (TS2322) because it has no
 * implicit index signature, whereas a type alias IS. The same decision is recorded on
 * `ParentPriceGroupOption` in src/domain/entities/priceGroup.ts.
 *
 * The two keys are the framework's own `name`/`value` option pair, reproduced verbatim. `name`
 * carries a RESOURCE-BUNDLE KEY and not display text - see the method.
 */
type AmountTypeOption = {
  readonly name: string;
  readonly value: PriceGroupRateAmountType;
};

/**
 * The resource-bundle key returned verbatim by the global short-circuit
 * [model/entity/PriceGroupRate.cfc:L106-L108]:
 *
 *   if(getGlobalFlag()) {
 *     return rbKey('admin.pricegroup.edit.priceGroupRateAppliesToAllProducts');
 *   }
 *
 * LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L107]: `rbKey(...)` is a non-ported
 * org/Hibachi/** framework helper that resolves an identifier against a JavaRB resource bundle.
 * JavaRB is NOT ported and NO i18n runtime is introduced, so the KEY ITSELF is emitted,
 * unresolved. That is the honest, lossless option: substituting invented English would fabricate
 * a translation the legacy system looks up at runtime, and the identifier is preserved verbatim
 * so whoever owns localisation can still resolve it.
 *
 * Named rather than inlined so the one place the key is written is also the place its provenance
 * is recorded.
 */
const APPLIES_TO_ALL_PRODUCTS_RB_KEY = 'admin.pricegroup.edit.priceGroupRateAppliesToAllProducts';

/**
 * A single price-group rate - the leaf the price-group resolution cascade resolves to, and the
 * carrier of the `amount` / `amountType` / `roundingRule` triple the pricing switch reads.
 *
 * A class rather than an interface, because the legacy entity carries behaviour and not merely
 * data: `getAppliesTo()` alone is eighty lines of string assembly [L95-L174], there are four
 * bidirectional helper pairs [L181-L256], and three representation methods are overridden
 * [L262-L276].
 *
 * See the module header for the association census, the owner-side liveness ruling, the
 * synchronous-by-construction proof, the dynamic-dispatch policy and the three-marker defect
 * budget this class observes.
 *
 * EXACTLY ONE MEMBER OF THIS CLASS CAN THROW: `getDisplayName()`, reproducing the unguarded
 * dereference at [L275]. Every other member is total - `getAppliesTo()` returns the empty string
 * rather than raising when nothing applies, and `getAmountFormatted()` reproduces CFML's
 * null-to-empty-string concatenation rather than raising on an absent amount.
 */
export class PriceGroupRate {
  // --- Persistent properties [model/entity/PriceGroupRate.cfc:L51-L55] --------------------------
  //
  // LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L52-L55, L58, L61, L63]: THE `ormType` /
  // `ormtype` CASING IS INCONSISTENT WITHIN THIS ONE COMPONENT. L53, L54 and L55 spell the
  // attribute `ormType` with a CAPITAL T, while L52, L58, L61 and L63 spell it `ormtype` all
  // lowercase. CFML attribute names are case-insensitive so every one of them works. The
  // inconsistency is recorded because a reader diffing this file against the CFC will notice it,
  // and the metadata quoted in each field's doc below is reproduced exactly as written - it is NOT
  // "corrected" to one spelling.

  /**
   * [model/entity/PriceGroupRate.cfc:L52]
   * `ormtype="string" length="32" fieldtype="id" generator="uuid" unsavedvalue="" default=""`
   *
   * The primary key, and the comparison basis for every containment predicate on the far side of
   * this entity's four bidirectional pairs. `unsavedvalue=""` together with `default=""` is what
   * makes an unsaved row's key the empty string, which is in turn what makes `isNew()` a simple
   * emptiness test - see that method.
   */
  private readonly priceGroupRateID: string;

  /**
   * [model/entity/PriceGroupRate.cfc:L53] `ormType="boolean" default="false"`.
   *
   * ★ TYPED `CfBooleanInput` AND RESOLVED THROUGH `cfBoolean()`, DESPITE THE `default="false"`. A
   * default constrains what the ORM WRITES on insert and says nothing about what a row already
   * sitting in `SwPriceGroupRate` holds: a row inserted before the default existed, or by any
   * writer other than this ORM, can still deliver SQL NULL. Narrowing this field to `boolean` on
   * the strength of a default would be trusting the schema to enforce something it does not, and
   * hand-rolling a coercion or defaulting with a bare `??` would diverge from the one CFML
   * boolean-truthiness definition the subtree shares.
   *
   * The value is the price-group cascade's global fallback selector: `getGlobalPriceGroupRate()`
   * [model/entity/PriceGroup.cfc:L83-L90] scans a price group's rates for the one whose flag is
   * set. It is also the entire input to `getAppliesTo()`'s short-circuit [L106].
   */
  private readonly globalFlag: CfBooleanInput;

  /**
   * [model/entity/PriceGroupRate.cfc:L54] `ormType="big_decimal" hb_formatType="custom"`.
   *
   * ★ THIS COLUMN DECLARES NO `default=`, AND THAT IS LOAD-BEARING. It is one of only FOUR
   * no-default money columns in the whole in-scope set - the others being
   * [model/entity/SkuCurrency.cfc:L53] `price`, [model/entity/PromotionApplied.cfc:L53]
   * `discountAmount` and [model/entity/PromotionReward.cfc:L61] `amount`. Contrast
   * model/entity/Sku.cfc L55/L56/L57 (`listPrice`/`price`/`renewalPrice`), every one of which
   * declares `default="0"`. THE ORM SCHEMA ITSELF ENCODES THE ASYMMETRY, so the port must too:
   * this field is `Money | undefined` and NO code path substitutes `0` for its absence. That is the
   * same family of absence convention as [model/entity/Sku.cfc:L269-L273], where substituting `0`
   * would silently sell products for free.
   *
   * `hb_formatType="custom"` is precisely WHY `getAmountFormatted()` exists at [L262] - it is the
   * framework's custom-format hook, so the attribute and the method are two halves of one
   * mechanism and both are preserved.
   */
  private readonly amount: Money | undefined;

  /**
   * [model/entity/PriceGroupRate.cfc:L55] `ormType="string" hb_formFieldType="select"`, no default.
   *
   * Typed as the closed {@link PriceGroupRateAmountType} union rather than as an open string,
   * because `getAmountTypeOptions()` [L87-L93] publishes the vocabulary authoritatively and the
   * service's `switch` [model/service/PriceGroupService.cfc:L321-L336] dispatches on exactly those
   * three literals. `hb_formFieldType="select"` is the metadata that makes the admin render the
   * option list rather than a free-text box, which is the schema's own statement that the value
   * space is closed.
   */
  private readonly amountType: PriceGroupRateAmountType | undefined;

  // --- Remote properties [model/entity/PriceGroupRate.cfc:L57-L58] -------------------------------

  /**
   * [model/entity/PriceGroupRate.cfc:L58] `ormtype="string"`.
   *
   * ⚠ THE PARENT DOES NOT HAVE THIS COLUMN. model/entity/PriceGroup.cfc declares NO `remoteID`,
   * but `PriceGroupRate` does. An inert persisted column preserved for schema continuity: no
   * behaviour in the in-scope slice reads or writes it, and none is invented for it.
   */
  private readonly remoteID: string | undefined;

  // --- Audit properties [model/entity/PriceGroupRate.cfc:L60-L64] --------------------------------
  //
  // All four declare `hb_populateEnabled="false"`, recorded here as inert metadata: population
  // control is a framework concern, and in the target the decision of what a caller may write
  // belongs to src/services/** and src/repositories/mysql/**, never to the entity.
  //
  // EXPLICIT UTC POLICY. Both timestamp columns are carried as `Date`, which is an absolute
  // instant, and every comparison or derivation performed on one anywhere in this subtree is done
  // in UTC. The legacy relied on the CF server's ambient timezone; the target does not reproduce
  // that ambient dependency, and this entity performs no date arithmetic at all - it only holds
  // and hands back the two instants.

  /** [model/entity/PriceGroupRate.cfc:L61] `hb_populateEnabled="false" ormtype="timestamp"`. */
  private readonly createdDateTime: Date | undefined;

  /**
   * [model/entity/PriceGroupRate.cfc:L62]
   * `hb_populateEnabled="false" cfc="Account" fieldtype="many-to-one" fkcolumn="createdByAccountID"`
   *
   * `Account` IS OUT OF SCOPE, so this many-to-one is reduced to its INERT FOREIGN-KEY COLUMN.
   * Schema continuity is preserved - `SwPriceGroupRate.createdByAccountID` still round-trips - and
   * NO account behaviour is ported. This mirrors the `Category.site` -> `siteID` treatment in
   * src/domain/entities/category.ts and the opaque order identifiers on
   * src/domain/entities/promotionApplied.ts.
   */
  private readonly createdByAccountID: string | undefined;

  /** [model/entity/PriceGroupRate.cfc:L63] `hb_populateEnabled="false" ormtype="timestamp"`. */
  private readonly modifiedDateTime: Date | undefined;

  /**
   * [model/entity/PriceGroupRate.cfc:L64]
   * `hb_populateEnabled="false" cfc="Account" fieldtype="many-to-one" fkcolumn="modifiedByAccountID"`
   *
   * Same inert foreign-key treatment as `createdByAccountID` above, for the same reason.
   */
  private readonly modifiedByAccountID: string | undefined;

  // --- Related object properties, many-to-one [model/entity/PriceGroupRate.cfc:L66-L68] ----------
  //
  // NEITHER declares `hb_cascadeCalculate`, so no calculated-property cascade is triggered from
  // this entity. Recorded so the absence reads as a decision rather than an omission.

  /**
   * [model/entity/PriceGroupRate.cfc:L67] `cfc="PriceGroup" fieldtype="many-to-one"
   * fkcolumn="priceGroupID"` - and note it carries NO `hb_optionsNullRBKey`, unlike its sibling
   * below.
   *
   * MUTABLE, uniquely among this entity's fields: `setPriceGroup` assigns it [L182] and
   * `removePriceGroup` clears it [L195]. `undefined` covers both an unattached rate and one the
   * repository hydrated without its parent - two states the port cannot distinguish, exactly as
   * CFML cannot.
   *
   * The far side is `priceGroupRates` [model/entity/PriceGroup.cfc:L64], declared
   * `one-to-many ... cascade="all-delete-orphan" inverse="true"` - so deleting a price group
   * deletes its rates, and an orphaned rate is deleted rather than left dangling. That cascade is
   * a persistence concern owned by src/repositories/mysql/**, recorded here because it explains
   * why this entity has no independent lifecycle.
   */
  private priceGroup: PriceGroup | undefined;

  /**
   * [model/entity/PriceGroupRate.cfc:L68] `cfc="RoundingRule" fieldtype="many-to-one"
   * fkcolumn="roundingRuleID" hb_optionsNullRBKey="define.none"`.
   *
   * `hb_optionsNullRBKey="define.none"` - preserved verbatim as inert metadata - makes the
   * framework PREPEND a blank `{value:'', name:<resolved "define.none">}` row to this property's
   * option list, which is how the admin offers "no rounding rule" as a selectable choice. No
   * option-list generator is introduced for it, for the same reason smart lists are not ported.
   *
   * LEGACY-NOTE [model/service/PriceGroupService.cfc:L316-L340]: THIS ASSOCIATION IS CONSULTED BY
   * ONLY ONE OF THE THREE AMOUNT-TYPE BRANCHES. `calculateSkuPriceBasedOnPriceGroupRate` applies
   * the rule inside its `percentageOff` case [L326-L328] and the `amountOff` [L331] and `amount`
   * [L334] cases skip it entirely, even though the association is equally available to all three.
   * That asymmetry is enforced at the SERVICE tier and is registered against the service; this
   * entity's sole obligation is to expose the association faithfully so the service can read it.
   * model/entity/PromotionReward.cfc references the same `RoundingRule` entity, which is why
   * `RoundingRule` is in scope at all.
   */
  private readonly roundingRule: RoundingRule | undefined;

  // --- Related object properties, many-to-many OWNER [model/entity/PriceGroupRate.cfc:L70-L77] ---
  //
  // All six use `fkcolumn="priceGroupRateID"`; the inversejoincolumn is `productTypeID`,
  // `productID` or `skuID`. None declares `type="array"` and none declares `inverse="true"` - see
  // the census in the module header for what both omissions mean.

  /**
   * [model/entity/PriceGroupRate.cfc:L71] `singularname="productType" cfc="ProductType"
   * fieldtype="many-to-many" linktable="SwPriceGroupRateProductType"
   * fkcolumn="priceGroupRateID" inversejoincolumn="productTypeID"`.
   *
   * HANDED OUT LIVE: mutated in place by this class's own helpers at [L201] and [L208-L210].
   */
  private readonly productTypes: ProductType[];

  /**
   * [model/entity/PriceGroupRate.cfc:L72] `singularname="product" cfc="Product"
   * fieldtype="many-to-many" linktable="SwPriceGroupRateProduct" fkcolumn="priceGroupRateID"
   * inversejoincolumn="productID"`.
   *
   * HANDED OUT LIVE: mutated in place at [L221] and [L228-L230].
   */
  private readonly products: Product[];

  /**
   * [model/entity/PriceGroupRate.cfc:L73] `singularname="sku" cfc="Sku"
   * fieldtype="many-to-many" linktable="SwPriceGroupRateSku" fkcolumn="priceGroupRateID"
   * inversejoincolumn="skuID"`.
   *
   * HANDED OUT LIVE: mutated in place at [L241] and [L248-L250].
   */
  private readonly skus: Sku[];

  /**
   * [model/entity/PriceGroupRate.cfc:L75] `singularname="excludedProductType" cfc="ProductType"
   * fieldtype="many-to-many" linktable="SwPriceGrpRateExclProductType"
   * fkcolumn="priceGroupRateID" inversejoincolumn="productTypeID"`.
   *
   * ★ LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L75]: THIS LINK TABLE'S NAME IS ABBREVIATED -
   * `SwPriceGrpRateExclProductType`, with `PriceGrp` rather than `PriceGroup` - while all five of
   * its siblings spell it out in full. It is a real physical table name and therefore a schema
   * contract: preserved verbatim and NEVER normalised. Same family as `SwPromoQual`,
   * `SwPromoReward` and `SwPromoRewardEligiblePriceGrp`.
   */
  // LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L75-L77]: `excludedProductTypes`, `excludedProducts`
  // and `excludedSkus` are declared, persisted, and reported by getAppliesTo() below — but the
  // five-level price-group resolution cascade at [model/service/PriceGroupService.cfc:L140-L181]
  // NEVER CONSULTS THEM. They also have NO bidirectional add*/remove* helpers anywhere in the legacy
  // component (contrast the three include collections, which do, at L198-L256). They are therefore
  // display-only in practice. Retained in full so the schema contract is unbroken (B5); the gap is
  // flagged rather than closed, because closing it would change which price a customer is charged.
  private readonly excludedProductTypes: ProductType[];

  /**
   * [model/entity/PriceGroupRate.cfc:L76] `singularname="excludedProduct" cfc="Product"
   * fieldtype="many-to-many" linktable="SwPriceGroupRateExclProduct" fkcolumn="priceGroupRateID"
   * inversejoincolumn="productID"`.
   *
   * Carries the same cascade-never-consults-it and no-bidirectional-helper gap flag as
   * `excludedProductTypes` above [L75-L77].
   */
  private readonly excludedProducts: Product[];

  /**
   * [model/entity/PriceGroupRate.cfc:L77] `singularname="excludedSku" cfc="Sku"
   * fieldtype="many-to-many" linktable="SwPriceGroupRateExclSku" fkcolumn="priceGroupRateID"
   * inversejoincolumn="skuID"`.
   *
   * Carries the same cascade-never-consults-it and no-bidirectional-helper gap flag as
   * `excludedProductTypes` above [L75-L77].
   */
  private readonly excludedSkus: Sku[];

  // --- Non-persistent properties [model/entity/PriceGroupRate.cfc:L79-L82] ----------------------
  //
  // Three framework declarations, recorded here as inert metadata because they hold no state -
  // they are the framework's way of exposing the three computed methods below to the admin's
  // generic property machinery, and each method is authored explicitly further down:
  //
  //   L80  property name="amountTypeOptions" persistent="false"                -> getAmountTypeOptions()
  //   L81  property name="appliesTo"    type="string" persistent="false"       -> getAppliesTo()
  //   L82  property name="displayName"  type="string" persistent="false"       -> getDisplayName()
  //
  // LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L80]: `amountTypeOptions` declares NO `type=`
  // attribute, unlike its two siblings on L81 and L82 which both declare `type="string"`. The
  // omission is harmless in CFML - the property is non-persistent and returns an array - and is
  // recorded rather than corrected.
  //
  // LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L52-L82]: PROPERTIES THAT ARE ABSENT, confirmed
  // by reading every declaration rather than assumed: there is NO `attributeValues`, NO
  // `activeFlag`, NO `sortOrder`, NO `physicals` and NO materialized ID path on this entity. None
  // is added. The first absence is what makes the EAV fallback unreachable (module header); the
  // last is what makes the ORM event-hook section legitimately empty (foot of this class).

  /**
   * Constructed from a repository row plus its materialized associations. Never constructed from a
   * sibling entity module: row-to-entity hydration, collaborator wiring and association
   * materialization all belong to src/repositories/mysql/**, which documents the fetch shape at
   * the producing repository method.
   *
   * Every collection parameter is OPTIONAL and defaults to `[]`, because a Hibernate-managed
   * collection never handed back null - an entity hydrated without its join must present an empty
   * array rather than `undefined`. meta/tests/unit/entity/BrandTest.cfc asserts exactly that
   * convention for `Brand.getProducts()`, and it is applied uniformly across this folder.
   *
   * NO COLLABORATOR PORT IS INJECTED, because the legacy component has zero `getService(` sites.
   */
  constructor(init: {
    readonly priceGroupRateID: string;
    readonly globalFlag?: CfBooleanInput;
    readonly amount?: Money | undefined;
    readonly amountType?: PriceGroupRateAmountType | undefined;
    readonly remoteID?: string | undefined;
    readonly createdDateTime?: Date | undefined;
    readonly createdByAccountID?: string | undefined;
    readonly modifiedDateTime?: Date | undefined;
    readonly modifiedByAccountID?: string | undefined;
    readonly priceGroup?: PriceGroup | undefined;
    readonly roundingRule?: RoundingRule | undefined;
    readonly productTypes?: ProductType[] | undefined;
    readonly products?: Product[] | undefined;
    readonly skus?: Sku[] | undefined;
    readonly excludedProductTypes?: ProductType[] | undefined;
    readonly excludedProducts?: Product[] | undefined;
    readonly excludedSkus?: Sku[] | undefined;
  }) {
    this.priceGroupRateID = init.priceGroupRateID;
    this.globalFlag = init.globalFlag;
    this.amount = init.amount;
    this.amountType = init.amountType;
    this.remoteID = init.remoteID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
    this.priceGroup = init.priceGroup;
    this.roundingRule = init.roundingRule;
    this.productTypes = init.productTypes ?? [];
    this.products = init.products ?? [];
    this.skus = init.skus ?? [];
    this.excludedProductTypes = init.excludedProductTypes ?? [];
    this.excludedProducts = init.excludedProducts ?? [];
    this.excludedSkus = init.excludedSkus ?? [];
  }

  // ============ START: Persistent Property Accessors ===================
  // `accessors=true` on [L49] is what generated every one of these in CFML. Legacy names are
  // carried over verbatim in CFML camelCase, because interface parity is the acceptance contract
  // for this port - not because camelCase is idiomatic here.

  /** [model/entity/PriceGroupRate.cfc:L52] the `uuid` primary key; `''` while unsaved. */
  getPriceGroupRateID(): string {
    return this.priceGroupRateID;
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L53] the cascade's global fallback selector.
   *
   * Resolved through `cfBoolean()` rather than through a bare `??` or `Boolean()` - see the field
   * doc for why a `default="false"` is not a guarantee about the rows already in the table.
   */
  getGlobalFlag(): boolean {
    return cfBoolean(this.globalFlag);
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L54]
   *
   * `undefined` for a NULL column, and that is load-bearing rather than incidental: the column
   * declares no `default=`, and substituting `0` would hand the pricing switch
   * [model/service/PriceGroupService.cfc:L321-L336] a zero discount, a zero amount-off or a zero
   * fixed price depending on the branch - three different wrong prices, silently.
   */
  getAmount(): Money | undefined {
    return this.amount;
  }

  /** [model/entity/PriceGroupRate.cfc:L55] one of the three published values, or `undefined`. */
  getAmountType(): PriceGroupRateAmountType | undefined {
    return this.amountType;
  }

  /** [model/entity/PriceGroupRate.cfc:L58] the inert integration correlation column. */
  getRemoteID(): string | undefined {
    return this.remoteID;
  }

  /** [model/entity/PriceGroupRate.cfc:L61] an absolute instant; UTC policy per the field doc. */
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /** [model/entity/PriceGroupRate.cfc:L62] the inert `Account` foreign key, never an entity. */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /** [model/entity/PriceGroupRate.cfc:L63] an absolute instant; UTC policy per the field doc. */
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /** [model/entity/PriceGroupRate.cfc:L64] the inert `Account` foreign key, never an entity. */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L67] the parent price group, or `undefined` for an unattached
   * or unjoined rate. `getDisplayName()` dereferences this WITHOUT a guard - see that method.
   */
  getPriceGroup(): PriceGroup | undefined {
    return this.priceGroup;
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L68] the rounding rule, or `undefined` - which is the
   * `hb_optionsNullRBKey="define.none"` choice, and is also the state the service's
   * `if(!isNull(...getRoundingRule()))` guard [model/service/PriceGroupService.cfc:L326] tests for.
   */
  getRoundingRule(): RoundingRule | undefined {
    return this.roundingRule;
  }

  // ============  END: Persistent Property Accessors ====================

  // ============ START: Collection Accessors ============================
  // THE THREE INCLUDE COLLECTIONS ARE HANDED OUT LIVE and the three EXCLUDE collections are handed
  // out readonly. That is not a style choice: this class's own owner-side helpers append to and
  // splice the three include arrays [L201, L208-L210, L221, L228-L230, L241, L248-L250], so the
  // mutation must be observable through the accessor a caller reads. Nothing anywhere mutates the
  // three exclude arrays - the legacy component declares no helper for them at all - so handing
  // those out readonly states that fact in the type system.

  /** [model/entity/PriceGroupRate.cfc:L71] the LIVE included-product-type array. */
  getProductTypes(): ProductType[] {
    return this.productTypes;
  }

  /** [model/entity/PriceGroupRate.cfc:L72] the LIVE included-product array. */
  getProducts(): Product[] {
    return this.products;
  }

  /** [model/entity/PriceGroupRate.cfc:L73] the LIVE included-SKU array. */
  getSkus(): Sku[] {
    return this.skus;
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L75] the materialized excluded-product-type array, readonly.
   *
   * Read by `getAppliesTo()` below and by NOTHING else in the in-scope slice - the price-group
   * cascade never consults it, and no helper on this class can populate it. See the gap flag on
   * the field declaration.
   */
  getExcludedProductTypes(): readonly ProductType[] {
    return this.excludedProductTypes;
  }

  /** [model/entity/PriceGroupRate.cfc:L76] readonly; same gap flag as `getExcludedProductTypes()`. */
  getExcludedProducts(): readonly Product[] {
    return this.excludedProducts;
  }

  /** [model/entity/PriceGroupRate.cfc:L77] readonly; same gap flag as `getExcludedProductTypes()`. */
  getExcludedSkus(): readonly Sku[] {
    return this.excludedSkus;
  }

  // ============  END: Collection Accessors =============================

  // ============ START: Framework-Generated Members ======================
  // None of the four members below has a hand-written legacy body. Each replaces one branch of the
  // runtime dispatcher at [org/Hibachi/HibachiEntity.cfc:L507-L565], and each is authored ONLY
  // because this class's own code calls it - `hasProductType` at [L200], `hasProduct` at [L220],
  // `hasSku` at [L240], and `isNew()` at [L183, L200, L203, L220, L223, L240, L243].
  //
  // THE CONTAINMENT PROBES COMPARE BY PRIMARY KEY - `productTypeID`, `productID`, `skuID` - never
  // by object reference and never by deep equality. The dispatcher's `has*` is Hibernate's
  // collection-contains, which works on session identity, i.e. the primary key for a persistent
  // row, and a primary-key comparison is what faithfully reproduces that. This matches
  // `hasPriceGroupRate` and `hasChildPriceGroup` in src/domain/entities/priceGroup.ts exactly; no
  // second convention is invented in this folder.
  //
  // A NOTE ON UNSAVED ROWS, so the choice is auditable rather than merely asserted: every unsaved
  // row's key is `''` (`unsavedvalue=""`), so a key comparison cannot distinguish two DIFFERENT
  // unsaved rows. It never has to here, because every call site in this class reaches the probe
  // only after `arguments.<x>.isNew()` has already short-circuited a new argument [L200, L220,
  // L240] - so the argument is provably saved whenever the probe runs, and a held unsaved
  // candidate correctly fails to match a saved key.

  /**
   * Whether `productType` is already among this rate's included product types.
   * [org/Hibachi/HibachiEntity.cfc:L507-L565], called from
   * [model/entity/PriceGroupRate.cfc:L200].
   */
  hasProductType(productType: ProductType): boolean {
    const candidateProductTypeID: string = productType.getProductTypeID();

    return this.productTypes.some(
      (held: ProductType) => held.getProductTypeID() === candidateProductTypeID,
    );
  }

  /**
   * Whether `product` is already among this rate's included products.
   * [org/Hibachi/HibachiEntity.cfc:L507-L565], called from
   * [model/entity/PriceGroupRate.cfc:L220].
   */
  hasProduct(product: Product): boolean {
    const candidateProductID: string = product.getProductID();

    return this.products.some((held: Product) => held.getProductID() === candidateProductID);
  }

  /**
   * Whether `sku` is already among this rate's included SKUs.
   * [org/Hibachi/HibachiEntity.cfc:L507-L565], called from
   * [model/entity/PriceGroupRate.cfc:L240].
   */
  hasSku(sku: Sku): boolean {
    const candidateSkuID: string = sku.getSkuID();

    return this.skus.some((held: Sku) => held.getSkuID() === candidateSkuID);
  }

  /**
   * Whether this rate has never been persisted.
   *
   * [org/Hibachi/HibachiEntity.cfc:L707-L709] `isNew()` returns `getNewFlag()`, and
   * [org/Hibachi/HibachiEntity.cfc:L571-L576] `getNewFlag()` returns `getPrimaryIDValue() == ""`.
   * With `unsavedvalue="" default=""` on [model/entity/PriceGroupRate.cfc:L52] that reduces
   * exactly to the emptiness test below - which is the identical treatment given in
   * src/domain/entities/priceGroup.ts, deliberately, so this folder carries one convention.
   *
   * The persisted-state flag is therefore the primary key itself, supplied by the repository at
   * hydration: a row read from `SwPriceGroupRate` carries its `uuid`, and a rate built for insert
   * carries `''`.
   */
  isNew(): boolean {
    return this.priceGroupRateID === '';
  }

  // ============  END: Framework-Generated Members =======================

  // ============ START: Non-Persistent Property Methods =================
  // [model/entity/PriceGroupRate.cfc:L85] opens this banner and L176 closes it.

  /**
   * The three amount types the admin offers, in the order it offers them.
   * [model/entity/PriceGroupRate.cfc:L87-L93]
   *
   * The legacy body verbatim:
   *
   *   public array function getAmountTypeOptions() {
   *     return [
   *       {name=rbKey("define.percentageOff"), value="percentageOff"},
   *       {name=rbKey("define.amountOff"), value="amountOff"},
   *       {name=rbKey("define.fixedAmount"), value="amount"}
   *     ];
   *   }
   *
   * ★ THIS IS THE AUTHORITATIVE `amountType` VOCABULARY BACKING THE STRATEGY DISPATCH at
   * [model/service/PriceGroupService.cfc:L316-L340], which is why {@link PriceGroupRateAmountType}
   * is derived from exactly these three values with zero drift.
   *
   * LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L89-L91]: THE THREE `name` VALUES ARE
   * RESOURCE-BUNDLE KEYS, NOT DISPLAY TEXT. `rbKey(...)` resolves them against a JavaRB bundle at
   * runtime; JavaRB is not ported and no i18n runtime is introduced, so the keys travel verbatim as
   * `'define.percentageOff'`, `'define.amountOff'` and `'define.fixedAmount'`. Inventing English
   * labels here would fabricate translations the legacy resolves for itself. Contrast
   * `RoundingRule.getRoundingRuleDirectionOptions()`, whose labels ARE hardcoded English in the
   * source - so that port keeps English and this one keeps keys, each matching its own source.
   *
   * ★ LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L91]: THE THIRD ENTRY'S NAME AND VALUE DO NOT
   * MATCH. Its display key is `define.fixedAmount` but its stored value is plain `amount`, and the
   * persisted `amountType` column holds `"amount"` - never `"fixedAmount"`. This is a real data
   * contract: the value is preserved verbatim and is never renamed to agree with its own label,
   * because `amount` is the literal the service's `switch` compares against
   * [model/service/PriceGroupService.cfc:L334].
   *
   * THE RETURN TYPE IS A READONLY THREE-TUPLE rather than a plain readonly array, precisely so the
   * count and the order are part of the type: adding a fourth amount type, dropping one, or
   * reordering them becomes a compile error rather than a silent behavioural change. Order is not
   * cosmetic - it is the order the option appears in the admin select.
   *
   * PURE AND SYNCHRONOUS. A fresh array on every call, exactly as the CFML literal was
   * re-evaluated on every call, so no caller can mutate a shared instance; `readonly` on the tuple
   * and on both keys means a caller cannot mutate its own copy either. Hoisting the literal to
   * module scope would create shared state on a warm Lambda container for no benefit.
   */
  getAmountTypeOptions(): readonly [AmountTypeOption, AmountTypeOption, AmountTypeOption] {
    return [
      { name: 'define.percentageOff', value: 'percentageOff' },
      { name: 'define.amountOff', value: 'amountOff' },
      { name: 'define.fixedAmount', value: 'amount' },
    ];
  }

  /**
   * The human-readable summary of what this rate covers.
   * [model/entity/PriceGroupRate.cfc:L95-L174]
   *
   * Eighty lines of string assembly in the source - the largest method in the component -
   * reproduced step for step. It has FIVE possible outcomes and every one is exercised:
   *
   *   1. GLOBAL SHORT-CIRCUIT [L106-L108]: `globalFlag` set, so the resource-bundle key is returned
   *      and none of the six collections is consulted.
   *   2. INCLUDING ONLY: `"Including: X"`.
   *   3. EXCLUDING ONLY: `"Excluding: Y"`.
   *   4. BOTH: `"Including: X. Excluding: Y"` - the `". "` joiner appears only here.
   *   5. NEITHER: the EMPTY STRING. See the note at the return.
   *
   * FOUR POINTS OF FIDELITY WORTH STATING.
   *
   *   * THE PLURAL BOUNDARY IS `GT 1` [L112, L115, L118, L137, L140, L143], so a count of 1 is
   *     singular; a count of 0 never reaches the pluraliser because the `arrayLen` guard skips it.
   *   * THE FRAGMENT ORDER IS FIXED AND NOT SORTED: products, then product types, then SKUs, in
   *     both halves. It is observable in the output string, so it is part of the behaviour.
   *   * THE LABELS ARE HARDCODED ENGLISH, NOT `rbKey`s - `"Product"`, `"Product Type"`, `"SKU"`,
   *     `"Including: "`, `"Excluding: "` and `". "` are all literals in the source [L112-L118,
   *     L163, L168, L170]. ONLY the global branch localises. That inconsistency is the source's and
   *     is preserved rather than smoothed: introducing keys for the literals would fabricate a
   *     mechanism this method does not have, and hardcoding English for the global branch would
   *     fabricate a translation.
   *   * THE ACCUMULATION GOES THROUGH `listAppend`, NOT THROUGH STRING CONCATENATION. `listAppend`
   *     emits NO leading delimiter when the list is empty, which is exactly what makes the first
   *     append produce `"3 Products"` rather than `",3 Products"`. Hand-rolling it with `+ ','`
   *     would have to re-derive that property; using the shared CFML parity helper inherits it.
   *     Note also that `listLen` returns a NUMBER, so every guard compares `> 0` explicitly.
   *
   * SYNCHRONOUS: it counts already-materialized arrays and does pure string work.
   */
  getAppliesTo(): string {
    // [model/entity/PriceGroupRate.cfc:L96-L104] all NINE locals, every one seeded to the empty
    // string exactly as the source seeds them, so the control flow below is traceable line for
    // line against the CFC.
    let including = '';
    let excluding = '';
    let finalString = '';
    let productsList = '';
    let productTypesList = '';
    let skusList = '';
    let excludedProductsList = '';
    let excludedProductTypesList = '';
    let excludedSkusList = '';

    // [model/entity/PriceGroupRate.cfc:L106-L108] THE GLOBAL SHORT-CIRCUIT. Checked FIRST, before
    // any collection is counted, which is why a global rate reports nothing about the six
    // collections even when they are populated.
    if (this.getGlobalFlag()) {
      return APPLIES_TO_ALL_PRODUCTS_RB_KEY;
    }

    // --------- Including --------- [model/entity/PriceGroupRate.cfc:L110-L133]
    //
    // `IIF(arrayLen(...) GT 1, DE('s'), DE(''))` is CFML's inline conditional with delayed-
    // evaluation quoting; the faithful TypeScript is a plain ternary, factored into `plural()`
    // below because the source repeats it six times. Neither `IIF` nor `DE` is emulated - `DE()`
    // exists only because `IIF` evaluates its branches as expressions, and it has no semantic
    // effect on the returned string.

    // [L111-L113] products first.
    const productCount: number = this.products.length;
    if (productCount > 0) {
      productsList = `${String(productCount)} Product${plural(productCount)}`;
    }

    // [L114-L116] then product types.
    const productTypeCount: number = this.productTypes.length;
    if (productTypeCount > 0) {
      productTypesList = `${String(productTypeCount)} Product Type${plural(productTypeCount)}`;
    }

    // [L117-L119] then SKUs.
    //
    // LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L101,L118,L126,L127]: the local is declared
    // `skusList` but assigned and read as `SkusList` at three sites. CFML variable names are
    // case-insensitive so the legacy code functions correctly. Normalised to one spelling here
    // because this is a purely internal local, not a data contract. No behaviour changes.
    const skuCount: number = this.skus.length;
    if (skuCount > 0) {
      skusList = `${String(skuCount)} SKU${plural(skuCount)}`;
    }

    // [L120-L128] accumulate the non-empty fragments, comma-delimited.
    if (listLen(productsList) > 0) {
      including = listAppend(including, productsList);
    }
    if (listLen(productTypesList) > 0) {
      including = listAppend(including, productTypesList);
    }
    if (listLen(skusList) > 0) {
      including = listAppend(including, skusList);
    }

    // LEGACY-DEFECT [model/entity/PriceGroupRate.cfc:L131-L133]: the comment claims "Replace all
    // commas" but CFML Replace() defaults to scope "once", so only the FIRST comma becomes " and ".
    // With three populated collections the second comma survives, yielding
    // "3 Products and 2 Product Types,5 SKUs". Reproduced with String.replace(',', ' and '), which
    // is also first-occurrence-only. Do NOT use replaceAll() or a global regex.
    // Preserved deliberately; do not fix without a product decision.
    //
    // Proven from the codebase rather than asserted from memory: model/service/BrandService.cfc and
    // model/service/ProductService.cfc both write `Replace(urlTitle, "[ ]+", "-", "all")` with the
    // scope SPELLED OUT, which is only necessary because the default is not "all".
    //
    // The defect is invisible with fewer than three populated collections, because then the list
    // holds at most one comma and one replacement is enough. ⚠ `replaceAll(',', ' and ')` or
    // `.replace(/,/g, ' and ')` here would SILENTLY CHANGE OBSERVABLE OUTPUT - what an
    // administrator reads about which products a price rate covers.
    if (listLen(including) > 0) {
      including = including.replace(',', ' and ');
    }

    // --------- Excluding --------- [model/entity/PriceGroupRate.cfc:L135-L159]
    //
    // Structurally identical to the including half, over the three EXCLUDED collections - which no
    // helper on this class can populate and which the price-group cascade never consults. See the
    // gap flag on their field declarations.
    //
    // LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L136]: this one source line is indented with
    // three spaces followed by two tabs, breaking the four-space-plus-tab pattern used everywhere
    // else in the method. Purely cosmetic; the TypeScript is formatted normally.

    // [L136-L138] excluded products first.
    const excludedProductCount: number = this.excludedProducts.length;
    if (excludedProductCount > 0) {
      excludedProductsList = `${String(excludedProductCount)} Product${plural(
        excludedProductCount,
      )}`;
    }

    // [L139-L141] then excluded product types.
    const excludedProductTypeCount: number = this.excludedProductTypes.length;
    if (excludedProductTypeCount > 0) {
      excludedProductTypesList = `${String(excludedProductTypeCount)} Product Type${plural(
        excludedProductTypeCount,
      )}`;
    }

    // [L142-L144] then excluded SKUs.
    const excludedSkuCount: number = this.excludedSkus.length;
    if (excludedSkuCount > 0) {
      excludedSkusList = `${String(excludedSkuCount)} SKU${plural(excludedSkuCount)}`;
    }

    // [L146-L154] accumulate, in the same fixed order.
    //
    // LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L103,L140,L149,L150]: the L149 guard reads
    // `ListLen(excludedproductTypesList)` with a LOWERCASE `p`, while the local is declared with a
    // capital P at L103, assigned with a capital P at L140 and appended with a capital P at L150.
    // CFML variable names are case-insensitive so the legacy code functions correctly. Normalised
    // to one spelling here because this is a purely internal local, not a data contract. No
    // behaviour changes.
    if (listLen(excludedProductsList) > 0) {
      excluding = listAppend(excluding, excludedProductsList);
    }
    if (listLen(excludedProductTypesList) > 0) {
      excluding = listAppend(excluding, excludedProductTypesList);
    }
    if (listLen(excludedSkusList) > 0) {
      excluding = listAppend(excluding, excludedSkusList);
    }

    // LEGACY-DEFECT [model/entity/PriceGroupRate.cfc:L156-L159]: the comment claims "Replace all
    // commas" but CFML Replace() defaults to scope "once", so only the FIRST comma becomes " and ".
    // With three populated collections the second comma survives, yielding
    // "3 Products and 2 Product Types,5 SKUs". Reproduced with String.replace(',', ' and '), which
    // is also first-occurrence-only. Do NOT use replaceAll() or a global regex.
    // Preserved deliberately; do not fix without a product decision.
    //
    // The excluding half is character-for-character the same code as the including half at
    // [L131-L133] and fails identically. ⚠ Repairing either site would silently change output.
    if (listLen(excluding) > 0) {
      excluding = excluding.replace(',', ' and ');
    }

    // Assemble Including and Excluding strings [model/entity/PriceGroupRate.cfc:L161-L173].
    //
    // `cfLen` is the ported `len()`, and it returns a NUMBER, so both guards compare `> 0`. The
    // literals `'Including: '`, `'Excluding: '` and the `'. '` separator are preserved exactly,
    // trailing spaces included.
    if (cfLen(including) > 0) {
      finalString = `Including: ${including}`;
    }

    if (cfLen(excluding) > 0) {
      // [L167-L169] the `". "` separator is emitted ONLY when BOTH halves are present, which is why
      // the inner `if(len(including))` is nested inside the outer `if(len(excluding))` rather than
      // sitting beside it.
      if (cfLen(including) > 0) {
        finalString += '. ';
      }
      finalString += `Excluding: ${excluding}`;
    }

    // LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L98,L173]: with globalFlag false and all six
    // collections empty this returns the EMPTY STRING, not undefined - the legacy declares
    // returntype="string" and finalString is seeded to "". Contrast the three other absence
    // conventions in this domain, which are deliberately different and must never be collapsed
    // together:
    //   [model/entity/PriceGroup.cfc:L83-L90]  getGlobalPriceGroupRate() falls off the end => NULL,
    //                                          load-bearing for cascade level-5 fall-through
    //   [model/entity/Product.cfc:L598]        getSalePrice() falls through => MUST return 0
    //   [model/entity/Sku.cfc:L269-L273]       getPriceByCurrencyCode() => MUST return undefined
    // getAppliesTo() is the fourth, distinct case: an empty display string. It is therefore NOT a
    // failure and this method does NOT raise for it.
    return finalString;
  }

  // ============  END:  Non-Persistent Property Methods =================

  // ============= START: Bidirectional Helper Methods ===================
  // [model/entity/PriceGroupRate.cfc:L178] opens this banner and L258 closes it. Four pairs: one
  // many-to-one and three many-to-many owner pairs.
  //
  // LEGACY-NOTE: mandatory "remove-that-ADDs" inversion cross-check performed against
  // [model/entity/PriceGroupRate.cfc:L187, L207, L227, L247]. RESULT: CLEAN - all four remove*
  // helpers correctly remove; ZERO inversions found in this component. Contrast
  // [model/entity/Option.cfc:L129-L131] and [model/entity/Option.cfc:L145-L147], where both
  // "remove" methods call addExcludedOption() and DO carry the inversion defect (preserved there).
  // Independently re-verified for this port by reading all four bodies: every one calls
  // `arrayDeleteAt`, none calls an `add*`.
  //
  // LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L192, L208, L212, L228, L232, L248, L252]: the
  // legacy splices with `arrayFind(<collection>, <needle>)`, whose object-needle behaviour is CFML
  // identity - which for a Hibernate-managed row is the primary key. Every splice below therefore
  // matches by PRIMARY KEY (`priceGroupRateID`, `productTypeID`, `productID`, `skuID`), never by
  // object reference and never by deep equality, which is the same rule the containment probes
  // above follow. `arrayFind` is 1-BASED and returns 0 on a miss, which is why the legacy guard is
  // `index > 0`; `Array.prototype.findIndex` is 0-BASED and returns -1, so the equivalent guard is
  // an explicit `!== -1` - never a truthiness test, which would wrongly treat the valid index 0 as
  // "not found". One consequence is recorded rather than hidden: two UNSAVED rows share the key
  // `''`, so a key match cannot tell them apart. No reference fallback is added, because the legacy
  // semantics being reproduced are Hibernate's session identity and because these helpers are
  // driven from the far side's managed instances - [model/entity/PriceGroup.cfc:L147],
  // [model/entity/ProductType.cfc:L211], [model/entity/Product.cfc:L743] and
  // [model/entity/Sku.cfc:L683] - never from a bag of unsaved duplicates.

  /**
   * Attaches this rate to a price group, adding it to that price group's rate collection.
   * [model/entity/PriceGroupRate.cfc:L181-L186]
   *
   *   public void function setPriceGroup(required any priceGroup) {
   *     variables.priceGroup = arguments.priceGroup;
   *     if(isNew() or !arguments.priceGroup.hasPriceGroupRate( this )) {
   *       arrayAppend(arguments.priceGroup.getPriceGroupRates(), this);
   *     }
   *   }
   *
   * ★ THIS IS ONE OF THE TWO METHODS `model/entity/PriceGroup.cfc` DELEGATES TO. Its
   * `addPriceGroupRate` at [model/entity/PriceGroup.cfc:L144] is nothing but
   * `arguments.priceGroupRate.setPriceGroup( this )`, so the already-authored
   * src/domain/entities/priceGroup.ts depends on this method existing with this exact name and
   * shape.
   *
   * BOTH HALVES OF THE DISJUNCT ARE PRESERVED, in order, with CFML's short-circuit semantics that
   * JavaScript's `||` reproduces exactly. `isNew()` first: an unsaved rate is appended
   * unconditionally, because its `''` key makes the membership test meaningless. Only then is
   * `hasPriceGroupRate` consulted, which keeps a saved rate from being appended twice.
   *
   * Note WHOSE newness is tested here - `this`, the rate - and contrast the three owner-side pairs
   * below, whose NEAR-side guard tests the ARGUMENT instead. The polarities differ per site and
   * none is normalised.
   *
   * `arrayAppend` becomes `push` onto the LIVE array from `PriceGroup.getPriceGroupRates()`: the
   * mutation must be observable through that accessor, which is exactly why priceGroup.ts declares
   * that collection live and cites THIS line as its census site.
   */
  setPriceGroup(priceGroup: PriceGroup): void {
    this.priceGroup = priceGroup;

    if (this.isNew() || !priceGroup.hasPriceGroupRate(this)) {
      priceGroup.getPriceGroupRates().push(this);
    }
  }

  /**
   * Detaches this rate from a price group.
   * [model/entity/PriceGroupRate.cfc:L187-L196]
   *
   *   public void function removePriceGroup(any priceGroup) {
   *     if(!structKeyExists(arguments, "priceGroup")) {
   *       arguments.priceGroup = variables.priceGroup;
   *     }
   *     var index = arrayFind(arguments.priceGroup.getPriceGroupRates(), this);
   *     if(index > 0) {
   *       arrayDeleteAt(arguments.priceGroup.getPriceGroupRates(), index);
   *     }
   *     structDelete(variables, "priceGroup");
   *   }
   *
   * ★ THIS IS THE SECOND METHOD `model/entity/PriceGroup.cfc` DELEGATES TO -
   * `removePriceGroupRate` at [model/entity/PriceGroup.cfc:L147] is
   * `arguments.priceGroupRate.removePriceGroup( this )`.
   *
   * THE ARGUMENT IS OPTIONAL, exactly as the legacy declaration is - `any priceGroup` with no
   * `required`, uniquely among this class's four `remove*` helpers. The default branch tests
   * `!== undefined`, reproducing `structKeyExists(arguments, "priceGroup")` and NEVER truthiness:
   * an argument that was passed is a different state from one that was not.
   *
   * `structDelete(variables, "priceGroup")` becomes assigning `undefined`, and it runs
   * UNCONDITIONALLY - outside the index guard - just as at [L195].
   *
   * LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L187-L192]: when the argument is omitted AND this
   * rate has no stored price group, the legacy assigns null into `arguments.priceGroup` at [L189]
   * and then invokes `.getPriceGroupRates()` on it at [L192] - a method call on null, which throws
   * under every CFML engine. Reproduced rather than smoothed over: returning early would silently
   * skip the [L195] field clear as well, so it would not be the same behaviour reached by a
   * different route. The identical unguarded shape appears at
   * [model/entity/PriceGroup.cfc:L116-L122], [model/entity/Category.cfc:L107-L112] and
   * [model/entity/ProductType.cfc:L155-L159], so it is the framework-wide idiom rather than a local
   * slip - which is why it is recorded as a note here and the defect budget is spent on the three
   * sites the module header names.
   *
   * @throws Error when called with no argument on a rate that has no price group.
   */
  removePriceGroup(priceGroup?: PriceGroup): void {
    // [L188-L190] the `structKeyExists` default, as an explicit `!== undefined` test.
    const targetPriceGroup: PriceGroup | undefined =
      priceGroup !== undefined ? priceGroup : this.priceGroup;

    if (targetPriceGroup === undefined) {
      throw new Error(
        'PriceGroupRate.removePriceGroup was called with no argument on a rate that has no ' +
          'priceGroup. This reproduces the legacy runtime failure at ' +
          'model/entity/PriceGroupRate.cfc:L189-L192, where the omitted argument defaults to a ' +
          'null price group and getPriceGroupRates() is then invoked on it.',
      );
    }

    // [L191-L194] find by primary key, then splice. The far-side array is LIVE, so the splice is
    // observable through `PriceGroup.getPriceGroupRates()`.
    const siblingRates: PriceGroupRate[] = targetPriceGroup.getPriceGroupRates();
    const index: number = siblingRates.findIndex(
      (rate: PriceGroupRate) => rate.getPriceGroupRateID() === this.priceGroupRateID,
    );

    if (index !== -1) {
      siblingRates.splice(index, 1);
    }

    // [L195] unconditional, outside the guard.
    this.priceGroup = undefined;
  }

  // Product Types (many-to-many - owner) [model/entity/PriceGroupRate.cfc:L198-L216]

  /**
   * Adds a product type to this rate, on BOTH sides.
   * [model/entity/PriceGroupRate.cfc:L199-L206]
   *
   *   if(arguments.productType.isNew() or !hasProductType(arguments.productType)) {
   *     arrayAppend(variables.productTypes, arguments.productType);
   *   }
   *   if(isNew() or !arguments.productType.hasPriceGroupRate( this )) {
   *     arrayAppend(arguments.productType.getPriceGroupRates(), this);
   *   }
   *
   * ★ PRESERVE THE GUARD ASYMMETRY: the NEAR-side guard tests THE ARGUMENT's newness
   * (`arguments.productType.isNew()`) while the FAR-side guard tests THIS rate's newness
   * (`isNew()`). The asymmetry is consistent across all three owner pairs below and is reproduced
   * exactly - each guard asks about the entity whose `''` key would make the corresponding
   * membership probe meaningless. Normalising both guards to one subject would change which appends
   * are skipped.
   *
   * THE NEAR SIDE MUTATES `variables.productTypes`, which this port reaches as `this.productTypes`;
   * the accessor hands out that same live array, so both writers agree. THE FAR SIDE pushes onto
   * `ProductType.getPriceGroupRates()`, which src/domain/entities/productType.ts declares LIVE and
   * cites THIS line as its census site.
   *
   * The inverse direction is `ProductType.addPriceGroupRate` [model/entity/ProductType.cfc:L207-L209],
   * which delegates straight back here.
   */
  addProductType(productType: ProductType): void {
    if (productType.isNew() || !this.hasProductType(productType)) {
      this.productTypes.push(productType);
    }
    if (this.isNew() || !productType.hasPriceGroupRate(this)) {
      productType.getPriceGroupRates().push(this);
    }
  }

  /**
   * Removes a product type from this rate, on BOTH sides.
   * [model/entity/PriceGroupRate.cfc:L207-L216]
   *
   *   var thisIndex = arrayFind(variables.productTypes, arguments.productType);
   *   if(thisIndex > 0) { arrayDeleteAt(variables.productTypes, thisIndex); }
   *   var thatIndex = arrayFind(arguments.productType.getPriceGroupRates(), this);
   *   if(thatIndex > 0) { arrayDeleteAt(arguments.productType.getPriceGroupRates(), thatIndex); }
   *
   * THE TWO GUARDS ARE INDEPENDENT: a needle present on one side only is still removed from that
   * side. Reproduced exactly, including the order - near side first.
   *
   * The argument is `required` here, unlike `removePriceGroup` above, so NO `structKeyExists`
   * defaulting applies and no optional parameter is introduced.
   */
  removeProductType(productType: ProductType): void {
    const candidateProductTypeID: string = productType.getProductTypeID();
    const thisIndex: number = this.productTypes.findIndex(
      (held: ProductType) => held.getProductTypeID() === candidateProductTypeID,
    );
    if (thisIndex !== -1) {
      this.productTypes.splice(thisIndex, 1);
    }

    const farSideRates: PriceGroupRate[] = productType.getPriceGroupRates();
    const thatIndex: number = farSideRates.findIndex(
      (rate: PriceGroupRate) => rate.getPriceGroupRateID() === this.priceGroupRateID,
    );
    if (thatIndex !== -1) {
      farSideRates.splice(thatIndex, 1);
    }
  }

  // Products (many-to-many - owner) [model/entity/PriceGroupRate.cfc:L218-L236]

  /**
   * Adds a product to this rate, on BOTH sides.
   * [model/entity/PriceGroupRate.cfc:L219-L226]
   *
   * Structurally identical to `addProductType` above, including the preserved guard asymmetry -
   * argument's newness on the near side [L220], this rate's newness on the far side [L223]. The
   * inverse direction is `Product.addPriceGroupRate` [model/entity/Product.cfc:L740-L742].
   */
  addProduct(product: Product): void {
    if (product.isNew() || !this.hasProduct(product)) {
      this.products.push(product);
    }
    if (this.isNew() || !product.hasPriceGroupRate(this)) {
      product.getPriceGroupRates().push(this);
    }
  }

  /**
   * Removes a product from this rate, on BOTH sides.
   * [model/entity/PriceGroupRate.cfc:L227-L236]
   *
   * Two independent guards, near side first, `required` argument - identical shape to
   * `removeProductType` above.
   */
  removeProduct(product: Product): void {
    const candidateProductID: string = product.getProductID();
    const thisIndex: number = this.products.findIndex(
      (held: Product) => held.getProductID() === candidateProductID,
    );
    if (thisIndex !== -1) {
      this.products.splice(thisIndex, 1);
    }

    const farSideRates: PriceGroupRate[] = product.getPriceGroupRates();
    const thatIndex: number = farSideRates.findIndex(
      (rate: PriceGroupRate) => rate.getPriceGroupRateID() === this.priceGroupRateID,
    );
    if (thatIndex !== -1) {
      farSideRates.splice(thatIndex, 1);
    }
  }

  // Skus (many-to-many - owner) [model/entity/PriceGroupRate.cfc:L238-L256]

  /**
   * Adds a SKU to this rate, on BOTH sides.
   * [model/entity/PriceGroupRate.cfc:L239-L246]
   *
   * Structurally identical to the two `add*` helpers above, including the preserved guard
   * asymmetry - argument's newness on the near side [L240], this rate's newness on the far side
   * [L243]. The inverse direction is `Sku.addPriceGroupRate` [model/entity/Sku.cfc:L680-L682].
   */
  addSku(sku: Sku): void {
    if (sku.isNew() || !this.hasSku(sku)) {
      this.skus.push(sku);
    }
    if (this.isNew() || !sku.hasPriceGroupRate(this)) {
      sku.getPriceGroupRates().push(this);
    }
  }

  /**
   * Removes a SKU from this rate, on BOTH sides.
   * [model/entity/PriceGroupRate.cfc:L247-L256]
   *
   * Two independent guards, near side first, `required` argument - identical shape to the two
   * `remove*` helpers above.
   */
  removeSku(sku: Sku): void {
    const candidateSkuID: string = sku.getSkuID();
    const thisIndex: number = this.skus.findIndex(
      (held: Sku) => held.getSkuID() === candidateSkuID,
    );
    if (thisIndex !== -1) {
      this.skus.splice(thisIndex, 1);
    }

    const farSideRates: PriceGroupRate[] = sku.getPriceGroupRates();
    const thatIndex: number = farSideRates.findIndex(
      (rate: PriceGroupRate) => rate.getPriceGroupRateID() === this.priceGroupRateID,
    );
    if (thatIndex !== -1) {
      farSideRates.splice(thatIndex, 1);
    }
  }

  // ★ NO HELPER EXISTS FOR THE THREE EXCLUDE COLLECTIONS, and none is invented.
  //
  // There is no `addExcludedProductType`, `removeExcludedProductType`, `addExcludedProduct`,
  // `removeExcludedProduct`, `addExcludedSku` or `removeExcludedSku` anywhere in the 284 lines of
  // model/entity/PriceGroupRate.cfc - verified by reading the whole helper block [L178-L258]. In
  // CFML those three collections are populated by the framework/ORM population path only, which is
  // half of why they are display-only in practice; the other half is that the five-level cascade at
  // [model/service/PriceGroupService.cfc:L140-L181] never reads them. Both facts are flagged on the
  // field declarations.
  //
  // AUTHORING THE MISSING PAIRS HERE WOULD SILENTLY MAKE THE THREE EXCLUDE COLLECTIONS MUTABLE FOR
  // THE FIRST TIME, which is a behavioural change to what a price rate covers. So the absence is
  // itself part of the contract, exactly as it is in the source.

  // =============  END:  Bidirectional Helper Methods ===================

  // ================== START: Overridden Methods ========================
  // [model/entity/PriceGroupRate.cfc:L260] opens this banner and L278 closes it.

  /**
   * The admin display form of `amount`.
   * [model/entity/PriceGroupRate.cfc:L262-L268]
   *
   *   public string function getAmountFormatted() {
   *     if(getAmountType() == "percentageOff") {
   *       return getAmount() & "%";
   *     } else {
   *       return formatValue(getAmount(),"currency");
   *     }
   *   }
   *
   * THIS METHOD IS WHAT `hb_formatType="custom"` ON [L54] ROUTES TO - the attribute and the method
   * are two halves of one mechanism, and both are preserved.
   *
   * ON THE COMPARISON OPERATOR. `getAmountType() == "percentageOff"` at [L263] uses CFML `==`, which
   * compares strings CASE-INSENSITIVELY, whereas `eqeqeq: always` requires `===` here. `===` is
   * faithful in this port because `amountType` is the closed {@link PriceGroupRateAmountType} union
   * of exactly three lowercase-first literals, written that way at every site in the legacy source
   * and proven to be one of the three at the repository boundary. Stating that reasoning explicitly
   * rather than leaving it implicit is the point: no `.toLowerCase()` normalisation is silently
   * added, because adding one would accept values the ported column type does not admit.
   *
   * ON THE PERCENTAGE BRANCH [L264]. `getAmount() & "%"` is CFML string concatenation of a
   * `big_decimal`, and CFML DROPS TRAILING ZEROS when it stringifies a number: a stored `12.50`
   * renders `"12.5%"`, NOT `"12.50%"`. `cfNumberToString()` exists precisely to replicate that, and
   * it is the same stringification mechanism that Finding A inside `RoundingRuleService.roundValue`
   * turns on - there it is money-critical, here it is display-only, but the fidelity requirement is
   * identical. Neither `toFixed(2)` nor a raw-number template interpolation is used.
   *
   * LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L266]: formatValue(v,"currency") is a non-ported
   * org/Hibachi/** framework formatter. Its locale resolution and currency-symbol behaviour are NOT
   * reproduced, because JavaRB is not ported and no i18n runtime is introduced. The target emits
   * the two-decimal numeric presentation only. NO currency symbol is invented - fabricating one
   * would assert behaviour the source does not define here.
   *
   * ON THE ABSENT AMOUNT. `amount` is nullable [L54, no `default=`, no `notNull`] and BOTH legacy
   * branches concatenate or pass it with no guard. CFML concatenation of a null operand yields the
   * EMPTY STRING rather than raising, so the percentage branch renders a bare `"%"` and the currency
   * branch renders `""`. Both are reproduced, and `0` is NEVER substituted - see the field doc for
   * why that substitution is forbidden on this particular column.
   *
   * SYNCHRONOUS and TOTAL: it never raises.
   */
  getAmountFormatted(): string {
    const amount: Money | undefined = this.amount;

    // [model/entity/PriceGroupRate.cfc:L263-L264]
    if (this.amountType === 'percentageOff') {
      return isAbsent(amount) ? '%' : `${cfNumberToString(amount.toDecimalString())}%`;
    }

    // [model/entity/PriceGroupRate.cfc:L266] the two-decimal presentation step, and nothing more.
    return isAbsent(amount) ? '' : numberFormat(amount.toDecimalString(), '0.00');
  }

  /**
   * The name of the property that stands for this entity in the admin.
   * [model/entity/PriceGroupRate.cfc:L270-L272]
   *
   *   public string function getSimpleRepresentationPropertyName() {
   *     return "DisplayName";
   *   }
   *
   * LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L271]: returns "DisplayName" with a capital D while
   * the property is declared `displayName` at L82 and the accessor is getDisplayName() at L274. CFML
   * property lookup is case-insensitive, so the legacy framework resolves it. Preserved VERBATIM
   * because this is a returned data value consumed by framework code, not an internal identifier.
   *
   * The mechanism that consumes it: the framework base builds a method name out of this string and
   * invokes `get#getSimpleRepresentationPropertyName()#()`, so `"DisplayName"` yields
   * `getDisplayName()`. That is exactly why the casing is a data contract here and why the two
   * purely internal casing warts inside `getAppliesTo()` are normalised while this one is not.
   *
   * THIS ENTITY DECLARES THE PROPERTY-NAME VARIANT, NOT THE OVERRIDE VARIANT. Contrast
   * [model/entity/ProductType.cfc:L273], which overrides `getSimpleRepresentation()` itself. Since
   * this component supplies the property-name form, no `getSimpleRepresentation()` is authored here.
   */
  getSimpleRepresentationPropertyName(): string {
    return 'DisplayName';
  }

  /**
   * The label `getSimpleRepresentationPropertyName()` names.
   * [model/entity/PriceGroupRate.cfc:L274-L276]
   *
   *   public string function getDisplayName(){
   *     return getPriceGroup().getPriceGroupName() & " - " & getAmount() & " - " & getAmountType();
   *   }
   *
   * THE SEPARATOR IS THE THREE CHARACTERS `" - "`, space-hyphen-space, twice. Preserved byte for
   * byte.
   *
   * THREE NULLABLE READS, ONE RAISE AND TWO EMPTY-STRING FOLDS - and the difference is CFML's, not
   * a choice made here. `getPriceGroup()` is DEREFERENCED, so a null there is a method call on null
   * and the legacy throws; `getAmount()` and `getAmountType()` are merely CONCATENATED, and CFML
   * concatenation of a null operand yields the empty string rather than raising. The far side's
   * `getPriceGroupName()` is itself nullable and is likewise concatenated, so it folds to `''` too.
   *
   * The return type stays `string` - NOT `string | undefined`. Widening it would be an unbudgeted
   * signature reshaping, and this file spends none.
   *
   * @throws Error when this rate has no materialized price group.
   */
  getDisplayName(): string {
    // LEGACY-DEFECT [model/entity/PriceGroupRate.cfc:L275]: getPriceGroup() is dereferenced with no
    // null guard, so a rate whose priceGroup is unset throws at runtime in CFML. Reproduced as an
    // explicit throw rather than a partial string or an empty-string substitution, because
    // behaviour preservation extends to defects: a method that throws today throws in the target.
    // Preserved deliberately; do not fix without a product decision.
    if (isAbsent(this.priceGroup)) {
      throw new Error(
        'PriceGroupRate.getDisplayName was called on a rate with no materialized priceGroup. ' +
          'model/entity/PriceGroupRate.cfc:L275 calls getPriceGroup().getPriceGroupName() with no ' +
          'null guard, so an unattached or unjoined rate is a CFML null-reference error there too. ' +
          'Reproduced rather than smoothed into a partial label.',
      );
    }

    const priceGroupName: string | undefined = this.priceGroup.getPriceGroupName();
    const amount: Money | undefined = this.amount;

    // CFML concatenation is total: each null operand contributes the empty string. `amount` is
    // stringified through `cfNumberToString()`, so trailing zeros are dropped exactly as CFML drops
    // them - a stored `12.50` renders `12.5`.
    const priceGroupNameText: string = isAbsent(priceGroupName) ? '' : priceGroupName;
    const amountText: string = isAbsent(amount) ? '' : cfNumberToString(amount.toDecimalString());
    const amountTypeText: string = isAbsent(this.amountType) ? '' : this.amountType;

    return `${priceGroupNameText} - ${amountText} - ${amountTypeText}`;
  }

  // ==================  END:  Overridden Methods ========================

  // =================== START: ORM Event Hooks  =========================
  // [model/entity/PriceGroupRate.cfc:L280] opens this banner and L282 closes it, and IT IS
  // COMPLETELY EMPTY - the two banner lines are adjacent with nothing between them.
  //
  // SO NEITHER `preInsert()` NOR `preUpdate()` IS DECLARED HERE, deliberately, and NO materialized
  // path is maintained. Only four in-scope entities carry hooks at all -
  // model/entity/Category.cfc (L126/L131), model/entity/PriceGroup.cfc (L206/L211),
  // model/entity/ProductType.cfc (L305/L310) and model/entity/PromotionCode.cfc (L179,
  // insert-only) - and every one of them exists to maintain derived state on save. This entity
  // maintains none, so authoring an empty hook would assert an obligation the source does not have
  // and would send a reader looking for a path this class does not own.
  //
  // The empty banner is recorded rather than omitted so a reviewer diffing this file against the
  // CFC finds the same structure, and so the absence reads as a decision rather than an oversight.
  // ===================  END:  ORM Event Hooks  =========================
}

/**
 * `IIF(count GT 1, DE('s'), DE(''))` - the pluraliser `getAppliesTo()` applies six times.
 * [model/entity/PriceGroupRate.cfc:L112, L115, L118, L137, L140, L143]
 *
 * A plain ternary, which is the faithful translation: `IIF` is CFML's inline conditional and `DE()`
 * is its delayed-evaluation quoting wrapper, needed only because `IIF` evaluates its branches as
 * expressions. Neither is imported and neither is emulated.
 *
 * Module-local and UN-EXPORTED. It is not a CFML semantic-parity helper - src/lib/cfml/ holds
 * those, and this is not one: it is one entity's display convention, appearing nowhere else in the
 * in-scope slice, so promoting it would imply a generality it does not have.
 *
 * THE BOUNDARY IS `GT 1`, so 1 is singular. A count of 0 never reaches here at all, because every
 * call site sits inside an `arrayLen(...)` guard - which means the `''` branch is only ever taken
 * for exactly 1. Worth stating, because it makes the function look more permissive than its
 * reachable domain.
 */
function plural(count: number): string {
  return count > 1 ? 's' : '';
}

/**
 * A narrowing wrapper over the shared `isNullish()` CFML `isNull()` port.
 *
 * The shared helper is declared `(value: unknown) => boolean`, which is the right shape for a
 * general-purpose predicate but gives the compiler nothing to narrow with. Wrapping it in a type
 * predicate keeps ONE definition of "nullish" in the subtree - the delegation is real, not
 * decorative - while letting `strict` mode see the narrowing, so no non-null assertion (banned in
 * `src/**`) and no type assertion is needed at any call site.
 *
 * Every site that uses it is reproducing one of the two CFML null semantics this entity depends on:
 * concatenation folding a null operand to the empty string [L264, L275], and the unguarded
 * dereference that raises [L275].
 */
function isAbsent(value: unknown): value is null | undefined {
  return isNullish(value);
}

// ---------------------------------------------------------------------------
// DELIBERATE OMISSIONS AND THE STRUCTURAL RECORD
//
// BANNER RUNS [model/entity/PriceGroupRate.cfc]. The source's four banner pairs are mirrored above
// so a reviewer can diff structure as well as behaviour: L85/L176 Non-Persistent Property Methods,
// L178/L258 Bidirectional Helper Methods, L260/L278 Overridden Methods, and L280/L282 ORM Event
// Hooks - the last one empty. The component closes at L283 and L284 is a trailing blank line.
// LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L178, L258]: L258 indents its closing banner with
// FOUR SPACES while L178 opens with a TAB - the same indentation drift that runs through
// getAppliesTo(). Cosmetic, recorded, not corrected. An empty banner never implies missing
// behaviour.
//
// LEGACY-NOTE [model/validation/PriceGroupRate.json]: declares a condition `isNotGlobal`
// ({"getGlobalFlag":{"eq":0}}) that is DECLARED BUT NEVER REFERENCED by any property - an orphan.
// Note also that it keys on a METHOD name (getGlobalFlag) whereas
// model/validation/Product_UpdateSkus.json keys its conditions on PROPERTY names - an inconsistency
// in the legacy schema vocabulary. Reproduced faithfully by NOT inventing a use for it. Schema
// enforcement (zod) belongs to src/services/**, not to this entity.
//
//   The file's three property rules - `priceGroup`, `amountType` and `amount`, each
//   `{"contexts":"save","required":true}` with `amount` additionally `"dataType":"numeric"` - are
//   likewise the service tier's to enforce. This entity therefore declares NO zod schema, NO
//   runtime validation and NO declaratively-invoked validator method, exactly as the source
//   declares none: unlike model/validation/Sku.json, RoundingRule.json, Promotion.json and
//   PromotionCode.json, PriceGroupRate.json names no entity method to call.
//
// B8 TEST OBLIGATION - RECORDED HERE, NOT AUTHORED HERE. Every converted method needs a test, and
// slatwall-ts/tests/ is owned by another agent, so no test file is created by this module.
// `PriceGroupRate` HAS NO LEGACY TEST: the only legacy coverage touching this folder is
// meta/tests/unit/entity/BrandTest.cfc and meta/tests/unit/entity/ProductTest.cfc, and
// meta/tests/functional/admin/entity/ProductTest.cfc is an EMPTY STUB that is never counted as
// coverage. The future suite at tests/unit/domain/entities/priceGroupRate.test.ts MUST therefore be
// labelled NET-NEW and must never be presented as parity;
// tests/traceability/legacyTestMap.ts fails the suite if this module has no test at all.
//
// WHAT THAT NET-NEW SUITE HAS TO PIN, so the contract is not rediscovered from scratch:
//
//   1. `getAppliesTo()` on a global rate returns the resource-bundle KEY
//      'admin.pricegroup.edit.priceGroupRateAppliesToAllProducts' verbatim and consults NONE of the
//      six collections - assert with all six populated, so a leaked count would be visible.
//   2. `getAppliesTo()` on a non-global rate with all six collections empty returns `''` and does
//      NOT raise. This is the assertion that stops a well-meaning "surely this should throw".
//   3. ★ THE PRESERVED `Replace` DEFECT, asserted POSITIVELY, in BOTH halves. With products AND
//      product types AND SKUs all populated, the including half must read
//      "3 Products and 2 Product Types,1 SKU" - the SECOND comma SURVIVES. A test asserting " and "
//      twice would be asserting the repaired behaviour and must not be written.
//   4. The two-populated case yields a single " and " and no surviving comma - the case that makes
//      the defect invisible, worth pinning so the contrast with assertion 3 is unmistakable.
//   5. The plural boundary: 1 yields "1 Product" and 2 yields "2 Products", for all three nouns -
//      `Product`, `Product Type`, `SKU`.
//   6. Fragment ORDER is products, then product types, then SKUs - assert the exact string, not set
//      membership - and the `". "` joiner appears ONLY when both halves are non-empty.
//   7. `getAmountTypeOptions()` returns exactly three rows, in order, with values
//      percentageOff/amountOff/amount and names define.percentageOff/define.amountOff/
//      define.fixedAmount. ★ Assert the third pair's name/value MISMATCH explicitly - that is the
//      preserved quirk most likely to be "tidied" later - and assert a FRESH array per call.
//   8. `getAmountFormatted()` on `percentageOff` drops trailing zeros: a stored 12.50 yields
//      "12.5%" and NOT "12.50%". This is the assertion that catches a `toFixed2()` regression.
//   9. `getAmountFormatted()` on every other branch (`amountOff`, `amount`, `undefined`) emits the
//      two-decimal presentation with NO currency symbol, and with an absent amount yields '' on the
//      currency branch and a bare '%' on the percentage branch.
//  10. `getSimpleRepresentationPropertyName()` returns exactly "DisplayName" with a CAPITAL D.
//  11. `getDisplayName()` joins with " - " twice, drops trailing zeros, folds an absent amount and
//      an absent amountType to '', and RAISES on a missing price group. The asymmetry is the point.
//  12. `getGlobalFlag()` resolves undefined, null, 0, 1, '0', '1', 'true' and 'false' exactly as
//      `cfBoolean()` specifies, DESPITE the column's `default="false"`.
//  13. `isNew()` is TRUE for `priceGroupRateID: ''` and FALSE otherwise, and every collection
//      defaults to `[]` when the constructor omits it - never `undefined`.
//  14. `setPriceGroup()` appends to the price group's LIVE rate array unconditionally when THIS rate
//      is new, and at most once when it is saved; `removePriceGroup()` clears the local reference
//      EVEN WHEN the rate was not found in the collection, and RAISES when called with no argument
//      on an unattached rate.
//  15. All three `add*` pairs guard the NEAR side on the ARGUMENT's newness and the FAR side on THIS
//      rate's newness. Construct the four combinations and assert which appends happen - reversing
//      either polarity must fail a test.
//  16. All three `remove*` methods splice BOTH sides with INDEPENDENT guards, matching by PRIMARY
//      KEY: a needle present on one side only must still be removed from that side.
//  17. The three include-collection accessors hand out the LIVE array (a push through the returned
//      reference is observable) while the three exclude-collection accessors are readonly views.
//  18. ★ THE ANTI-CONTRACT: assert the ABSENCE of addExcludedProductType,
//      removeExcludedProductType, addExcludedProduct, removeExcludedProduct, addExcludedSku and
//      removeExcludedSku, and the absence of `preInsert`/`preUpdate`. Adding any of them would
//      assert behaviour the source does not have.
// ---------------------------------------------------------------------------
