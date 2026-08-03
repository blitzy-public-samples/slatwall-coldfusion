// slatwall-ts - SkuCurrency entity. Port of model/entity/SkuCurrency.cfc (131 lines).
//
// One `SwSkuCurrency` row: the per-currency price-override table. An IMPLICIT-SCOPE entity rather
// than a directly named one - it is read by STEP 2 of the four-step currency cascade at
// [model/entity/Sku.cfc:L399-L414], the third complexity hotspot, which is not portable without it.
//
// Cascade Step 2 calls SIX members of this class, so every one is on a live must-preserve path:
//
//   [model/entity/Sku.cfc:L400]  getCurrencyCode()  the match key for the override lookup, compared
//                               with CFML `eq`
//   [model/entity/Sku.cfc:L401]  getRenewalPrice()  inside `!isNull(...)`
//   [model/entity/Sku.cfc:L402]  getRenewalPrice()  the value write
//   [model/entity/Sku.cfc:L405]  getListPrice()     inside `!isNull(...)`
//   [model/entity/Sku.cfc:L406]  getListPrice()     the value write
//   [model/entity/Sku.cfc:L409]  getPrice()         written UNCONDITIONALLY, with no `!isNull`
//                               guard, unlike the other two
//   [model/entity/Sku.cfc:L412]  getSkuCurrencyID() recorded alongside the override so the cascade
//                               can name its source
//   [model/entity/Sku.cfc:L403, L407, L410]  getFormattedValue(...) - a FRAMEWORK member,
//                               deliberately not ported; see the hand-off note at the foot.
//
// THOSE TWO `!isNull` GUARDS ARE EVIDENCE, NOT DECORATION: the legacy cascade tests
// `getRenewalPrice()` and `getListPrice()` for null before writing them, which demonstrates that a
// `SwSkuCurrency` row can legitimately hold NULL in those columns. That is the empirical basis for
// typing all three monetary fields `Money | undefined`.
//
// THE COMPONENT DECLARATION, VERBATIM [model/entity/SkuCurrency.cfc:L49]
//
//   component entityname="SlatwallSkuCurrency" table="SwSkuCurrency"
//   persistent="true" accessors="true" extends="HibachiEntity"
//   cacheuse="transactional" hb_serviceName="skuService"
//   hb_permission="sku.skuCurrencies" {
//
// Schema continuity is binding and the property metadata IS the contract: table `SwSkuCurrency`,
// entity name `SlatwallSkuCurrency`, no migration, no rename, no new or dropped column. Every
// `hb_*` attribute value is carried forward verbatim in a comment so the legacy admin can still
// resolve it, and inert columns are preserved rather than removed.
//
// `hb_serviceName="skuService"` POINTS AT model/service/SkuService.cfc, NOT AT A SERVICE OF ITS
// OWN. There is no `SkuCurrencyService` in the legacy tree and none is invented - CRUD for this
// entity belongs to the SKU service by design, exactly as [model/entity/Category.cfc:L49] routes to
// `contentService`.
//
// `hb_permission="sku.skuCurrencies"` IS A NESTED PATH rather than the usual `"this"`: it names the
// parent entity and the parent's collection, placing this entity in the small child/link family
// that does the same - the closest in-scope sibling is [model/entity/PriceGroupRate.cfc:L49] with
// `hb_permission="priceGroup.priceGroupRates"`. Preserved verbatim as inert text: no authorization
// is evaluated in this layer and JavaRB is not ported.
//
// THE `extends` CHAIN IS THREE LEVELS DEEP, NOT TWO. `extends="HibachiEntity"` on L49 is
// UNQUALIFIED, so it resolves to the local model/entity/HibachiEntity.cfc (274 lines), which itself
// extends `Slatwall.org.Hibachi.HibachiEntity`. The intermediate class alone holds 12
// `getService(...)` sites (L123, L130, L135, L145, L178, L180, L182, L194, L196, L207, L257, L266),
// seven of them reaching `attributeService`. All are moot here - the EAV attribute path is out of
// scope - but moot is not silently reimplemented: NO BASE CLASS IS PORTED, there is no inheritance
// emulation, and this is a standalone class.
//
// This entity declares NO `attributeValues`; exactly four in-scope entities do (Sku L70, Product
// L75, ProductType L67, Brand L60) and this is not one of them. The eleven dynamic-dispatch
// patterns at [org/Hibachi/HibachiEntity.cfc:L507-L565], which terminate in a throw at L565, are
// likewise NOT emulated: no `Proxy`, no index signature, no dynamic dispatch. Only
// concretely-called members appear below, each explicitly typed.
//
// EVERY IMPORT IN THIS FILE IS TYPE-ONLY, DELIBERATELY. This entity performs ZERO arithmetic and
// ZERO validation: it holds monetary values and hands them back untouched, so `Money` is never
// constructed or operated on here, and it receives an already-branded `CurrencyCode` from the
// hydration boundary rather than validating one. The emitted JavaScript therefore imports nothing
// at all, which is the correct outcome for a class whose only executable behaviour is one field
// assignment, one field clear and one string concatenation. Three consequences:
//   * `decimal.js` IS NOT IMPORTED. `src/domain/valueObjects/money.ts` and
//     `src/lib/cfml/precision.ts` are the only modules permitted to touch it.
//   * NO PORT IS INJECTED, because there is nothing to inject: this entity has ZERO `getService(`
//     sites. The census found 45 across only five entities (Sku 19, Product 18, ProductType 6,
//     OptionGroup 1, RoundingRule 1), and this is one of the thirteen in-scope entities with none.
//   * NO CFML PARITY HELPER IS IMPORTED. This entity declares ZERO boolean properties, so
//     `cfBoolean()` has nothing to convert, and it performs no list, struct or truthiness
//     operation.
//
// NO USER RULES WERE PROVIDED FOR THIS PROJECT. (1) The project rules document
// was read and it contains exactly one statement: that no user rules exist.
// (2) That absence is NOT license to lower the bar - the enterprise-standard
// substitute applies at full strength, which for this file means maximal
// strictness with no `any`, no `@ts-ignore`/`@ts-expect-error` and no non-null
// assertion; one exported runtime unit and no barrel; every monetary field
// routed through the Money value object; no credential, connection detail or
// environment read of any kind; and every judgment call annotated at the point
// where it was made. (3) No rule is invented to fill the gap; any "rule" cited
// here would be fabrication. (4) Zero files enter scope by rule mandate, so
// there are no rule conflicts to resolve either.
//
// THIS FILE OWNS ZERO NUMBERED DEFECTS AND ZERO DELIBERATE DIVERGENCES, and
// that is a finding rather than an absence of effort. The migration's register
// carries thirty numbered defects plus eight secondary items, and none of them is
// here. In particular the
// bidirectional pair at [model/entity/SkuCurrency.cfc:L89-L104] is the CORRECT
// pattern: `removeSku` dereferences the RIGHT argument at L99 and L101, unlike
// [model/entity/PromotionPeriod.cfc:L110] and
// [model/entity/PromotionAccount.cfc:L103], which both leak an `arguments.
// account` that was never declared. No `LEGACY-DEFECT` marker appears anywhere
// below, therefore, and none is invented to look thorough. The annotations here
// are `LEGACY-NOTE` and `JUDGMENT CALL` instead.
//
// NO LEGACY TODO FALLS INSIDE THIS FILE, and none is fabricated. The project
// carries source TODOs forward as explicitly flagged TODOs rather than
// completing them silently - the return/exchange no-op at
// [model/service/PromotionService.cfc:L542-L544] with its `issue #1766`
// reference is the canonical example - but a sweep of this CFC finds no TODO,
// no FIXME and no deprecated member.
//
// PARAMETERIZED SQL IS NOT APPLICABLE HERE, stated rather than quietly skipped.
// The project standard is that every query uses a prepared statement, preserving
// the injection-safety guarantee `cfqueryparam` gave. This file contains no
// query of any kind and no SQL string; that obligation rests wholly with
// `src/repositories/mysql/**`. It also reads no environment and holds no
// credential, host, DSN or connection string - `src/lib/config.ts` owns static
// process configuration and an entity must never read it - and it does not log,
// so `src/lib/logger.ts` is deliberately not imported either.
//
// LICENSE CONTINUITY is satisfied at subtree level by slatwall-ts/NOTICE-GPL.md,
// which carries the GPL v3.0 attribution forward and records that the special
// exception permitting custom code under `/integrationServices/` does NOT extend
// to this subtree. There is deliberately no per-file GPL header.
//
// TEST COVERAGE FOR THIS MODULE IS NET-NEW, and must never be presented as
// parity. `SkuCurrency` has NO legacy test whatsoever. Only two of the eighteen
// in-scope entities have a legacy antecedent - brand.ts from
// meta/tests/unit/entity/BrandTest.cfc and product.ts from
// meta/tests/unit/entity/ProductTest.cfc - and
// meta/tests/functional/admin/entity/ProductTest.cfc is an empty stub
// contributing zero coverage. The suite owed at
// tests/unit/domain/entities/skuCurrency.test.ts is authored SEPARATELY, by the
// owner of the test tier, and is not created from here. The contract it has to
// pin is enumerated at the foot of this file.
// ---------------------------------------------------------------------------

import type { CurrencyCode } from '../valueObjects/currencyCode.js';
import type { Money } from '../valueObjects/money.js';
import type { Sku } from './sku.js';

// LEGACY-NOTE [model/entity/SkuCurrency.cfc:L59] and [model/entity/Sku.cfc:L72]: THE `skuCurrency`
// <-> `sku` TYPE CYCLE IS UNAVOIDABLE AND SAFE. L59 here declares a `many-to-one` onto `Sku` and
// Sku.cfc:L72 the matching `one-to-many` back, so the two modules necessarily reference each other.
// Three properties make that harmless:
//
//   1. BOTH DIRECTIONS ARE `import type` ONLY, which TypeScript ERASES AT EMIT. The compiled
//      JavaScript contains no `require`/`import` of `./sku.js` at all, so there is no
//      module-initialisation order to get wrong. `consistent-type-imports` is configured with
//      `fixStyle: 'separate-type-imports'` and `no-import-type-side-effects` is an error, so the
//      inline `{ type Sku }` form - which DOES emit a runtime import - cannot be used.
//   2. ENTITY CLASSES NEVER INSTANTIATE SIBLINGS. Row-to-entity hydration belongs entirely to
//      `src/repositories/mysql/**`, so no `new Sku(...)` appears here.
//   3. A VALUE IMPORT BETWEEN ENTITY MODULES MUST NEVER BE INTRODUCED, in either direction. That is
//      the one change that would turn this benign type cycle into a real one.
//
// THREE MEMBERS OF `./sku.js` ARE CANONICAL FOR THIS MODULE and must not be renamed or reshaped:
//
//   1. `getSkuCode(): string` - guaranteed by [model/entity/Sku.cfc:L54] (`property name="skuCode"
//      ormtype="string" unique="true" length="50"`) with `accessors=true` on
//      [model/entity/Sku.cfc:L49]. Consumed by `getSimpleRepresentation()`.
//   2. `getSkuCurrencies(): SkuCurrency[]` MUST RETURN THE LIVE ARRAY REFERENCE, NOT A COPY, and
//      the
//      return type must be the MUTABLE `SkuCurrency[]` rather than `readonly SkuCurrency[]` so the
//      contract is visible in the type. [model/entity/SkuCurrency.cfc:L92] `arrayAppend` and
//      [model/entity/SkuCurrency.cfc:L101] `arrayDeleteAt` both mutate it IN PLACE, so a defensive
//      copy would silently break bidirectional synchronization: the append would land on a
//      throwaway
//      array and the two sides would drift apart with no error anywhere. The folder-wide rule is
//      that
//      an accessor is live exactly when the source mutates that accessor's result in place.
//      [model/entity/Sku.cfc:L72] declares the collection `type="array"
//      cascade="all-delete-orphan" inverse="true"`, which is why `SkuCurrency` owns the write.
//   3. `hasSkuCurrency(skuCurrency: SkuCurrency): boolean` MUST BE A PRIMARY-KEY COMPARISON ON
//      `skuCurrencyID`, falling back to reference identity when either side is unsaved - never
//      object identity as its only basis, never deep equality. It returns `false` on an empty
//      array.
//      It has no hand-written legacy body: it is the accessor ColdFusion's ORM generates for a
//      collection carrying `singularname="skuCurrency"`, whose CFML semantics are Hibernate's
//      implicit collection-contains, i.e. session identity / PK. The unsaved-row caveat documented
//      on `isSameRowAs` below applies equally there.
//
// Nothing else about `Sku` is depended upon here; the coupling is deliberately narrow.

/**
 * One `SwSkuCurrency` row: a per-currency price override for a single SKU.
 *
 * A CLASS rather than an interface: the legacy entities carry behaviour and not merely data - this
 * one carries three methods - and interface parity is the acceptance contract, so a reviewer diffs
 * this public surface against the CFC member by member. Method names are therefore the legacy CFML
 * names VERBATIM in camelCase, which is why eslint.config.mjs enables no `naming-convention`,
 * `camelcase` or `id-match` rule.
 *
 * ASSOCIATIONS ARRIVE ALREADY MATERIALIZED, OR ABSENT. Laziness is not simulated:
 * `src/repositories/mysql/**` owns hydration and documents its fetch shape at the producing method.
 * There is no fetch-shape ruling to make for this entity - model/entity/SkuCurrency.cfc declares no
 * `fetch=` and no `lazy=` attribute anywhere, and it declares ZERO collections, so no field here is
 * an array and no `hasAny*` member exists.
 *
 * IMMUTABLE EXCEPT FOR ONE FIELD: every field is `readonly` apart from `sku`, which
 * `setSku`/`removeSku` must be able to assign and clear.
 */
export class SkuCurrency {
  // --- Persistent Properties [model/entity/SkuCurrency.cfc:L51-L55]

  /**
   * Primary key. [model/entity/SkuCurrency.cfc:L52]
   *
   *   property name="skuCurrencyID" ormtype="string" length="32" fieldtype="id"
   *   generator="uuid" unsavedvalue="" default="";
   *
   * `string` and never `string | undefined`: `default=""` means the column always holds a string,
   * possibly the empty one. That empty string is load-bearing - it is what `isNew()` keys on, via
   * `getNewFlag()` testing `getPrimaryIDValue() == ""`. Read-only with no setter, matching the
   * legacy id property. Cascade Step 2 reads it at [model/entity/Sku.cfc:L412] to record which
   * override row supplied a price, so it is on a must-preserve path.
   */
  private readonly skuCurrencyID: string;

  // ===========================================================================================
  // THE THREE MONETARY COLUMNS. ALL THREE ARE `Money | undefined`, AND THIS IS THE
  // HIGHEST-CONSEQUENCE DECISION IN THIS FILE.
  //
  // NEVER SUBSTITUTE `0` FOR A MISSING VALUE - not `?? Money.zero`, not an `orZero()` helper, not a
  // `0` constructor default, not a `0` accessor fallback. SUBSTITUTING 0 ON A PRICE PATH WOULD
  // SILENTLY SELL PRODUCTS FOR FREE.
  // ===========================================================================================
  //
  // Four independent lines of evidence, each verified against the source:
  //
  // 1. `price` HAS NO `default=` AT ALL. [model/entity/SkuCurrency.cfc:L53] is the whole
  //    declaration: `property name="price" ormtype="big_decimal" hb_formatType="currency"
  //    hb_rbKey='entity.sku.price';`. Its two immediate neighbours, L54 `renewalPrice` and L55
  //    `listPrice`, BOTH carry `default="0"`. The ORM schema encodes that asymmetry, so a hydrated
  //    row can legitimately carry SQL NULL in `price`. This is one of exactly FOUR no-default money
  //    columns across the in-scope model; the others are [model/entity/PriceGroupRate.cfc:L54],
  //    [model/entity/PromotionApplied.cfc:L53] and [model/entity/PromotionReward.cfc:L61]. Contrast
  //    Sku's OWN money columns at [model/entity/Sku.cfc:L55-L57], where all three declare
  //    `default="0"` - same three names, opposite nullability, which is why they cannot share one
  //    convention.
  // 2. `default="0"` ON L54 AND L55 APPLIES AT ORM INSERT TIME ONLY. It does not retroactively
  //    guarantee non-null for rows that already exist, so reading NULL from either column is a
  //    reachable state. The legacy cascade proves it: [model/entity/Sku.cfc:L401] and
  //    [model/entity/Sku.cfc:L405] guard those exact two accessors with `!isNull(...)` before
  //    writing them, and a guard against an impossible state would be dead code.
  // 3. THE MOST IMPORTANT REASON - A SECOND KEY-EXISTENCE CHECK DOWNSTREAM DEPENDS ON IT.
  //    `Sku.getListPriceByCurrencyCode()` [model/entity/Sku.cfc:L275-L279] and
  //    `Sku.getRenewalPriceByCurrencyCode()` [model/entity/Sku.cfc:L281-L285] each perform TWO
  //    `structKeyExists` tests on one line: the first on the currency key, the SECOND on the inner
  //    `"listPrice"` / `"renewalPrice"` sub-key. They therefore return null EVEN FOR A CURRENCY
  //    PRESENT IN THE CASCADE MAP that has no list or renewal price recorded. PRESENCE IS NOT
  //    VALUE:
  //    reporting `0` instead of "absent" would make the cascade write a `0` sub-key, that second
  //    check would always succeed, and it would become DEAD CODE.
  //    `Sku.getPriceByCurrencyCode()` [model/entity/Sku.cfc:L269-L273] is the blunter case - one
  //    `structKeyExists`, no `else`, no fallback.
  // 4. `Money.zero` IS EXPLICITLY OFF-LIMITS FOR THIS PURPOSE by the contract published on the
  //    constant itself: it exists to reproduce the two accumulator seeds of `getDiscountAmount` at
  //    [model/service/PromotionService.cfc:L988-L989] and their defaultless-switch fall-through.
  //
  // THE SCHEMA/COLUMN TENSION IS DOCUMENTED, NOT RESOLVED. model/validation/SkuCurrency.json
  // declares `"price": [{"contexts":"save","required":true,"dataType":"numeric","minValue":0}]` -
  // REQUIRED - while the ORM column on L53 tolerates NULL. Both are true simultaneously and both
  // are preserved, because they constrain different moments: the SAVE-CONTEXT schema requires a
  // price, the COLUMN tolerates NULL, and legacy rows may already hold NULL. `listPrice` and
  // `renewalPrice` carry `minValue 0` in the same file but are NOT required. THIS FIELD MUST NOT BE
  // NARROWED TO A REQUIRED `Money` ON THE STRENGTH OF THAT SCHEMA - requiredness is enforced at the
  // SERVICE tier by the ported zod schema, at save time in a named context, exactly where the
  // legacy framework enforced it.
  //
  // ALL THREE ARE `Money`, NEVER `number` AND NEVER A RAW DECIMAL: `ormtype="big_decimal"` is not
  // representable in IEEE-754 without drift. No arithmetic happens in this class at all.
  //
  // ALL THREE `hb_rbKey` VALUES POINT AT `entity.sku.*`, NOT `entity.skuCurrency.*` - the
  // resource-bundle keys are BORROWED FROM Sku, and they use SINGLE quotes where every other
  // attribute on those lines uses double quotes. Preserved as inert doc text: JavaRB is not ported,
  // but the identifiers survive so the legacy admin can still resolve them.
  //
  // `hb_formatType="currency"` on all three drove the framework's `getFormattedValue`, which
  // cascade Step 2 calls at [model/entity/Sku.cfc:L403, L407, L410]. That member is not ported; see
  // the hand-off note at the foot of this file.

  /**
   * `price`, or `undefined` when the column is NULL. [model/entity/SkuCurrency.cfc:L53]
   *
   *   property name="price" ormtype="big_decimal" hb_formatType="currency"
   *   hb_rbKey='entity.sku.price';
   *
   * NO `default=` - genuinely nullable in the schema. Read UNCONDITIONALLY by cascade Step 2 at
   * [model/entity/Sku.cfc:L409], with no `!isNull` guard, unlike its two neighbours.
   */
  private readonly price: Money | undefined;

  /**
   * `renewalPrice`, or `undefined` when the column is NULL. [model/entity/SkuCurrency.cfc:L54]
   *
   *   property name="renewalPrice" ormtype="big_decimal" hb_formatType="currency" default="0"
   *   hb_rbKey='entity.sku.renewalPrice';
   *
   * `default="0"` binds at ORM insert time only. Guarded with `!isNull(...)` by cascade Step 2 at
   * [model/entity/Sku.cfc:L401] - which is the proof that NULL is reachable here.
   */
  private readonly renewalPrice: Money | undefined;

  /**
   * `listPrice`, or `undefined` when the column is NULL. [model/entity/SkuCurrency.cfc:L55]
   *
   *   property name="listPrice" ormtype="big_decimal" hb_formatType="currency" default="0"
   *   hb_rbKey='entity.sku.listPrice';
   *
   * `default="0"` binds at ORM insert time only. Guarded with `!isNull(...)` by cascade Step 2 at
   * [model/entity/Sku.cfc:L405]. Note the source declares `renewalPrice` BEFORE `listPrice`; that
   * ordering is kept here so the file diffs cleanly against the CFC.
   */
  private readonly listPrice: Money | undefined;

  // --- Related Object Properties (many-to-one) [model/entity/SkuCurrency.cfc:L57-L59]
  //
  // Exactly two, and they are resolved in two DIFFERENT ways because only one of their targets is
  // in scope. L58's `Currency` is not one of the eighteen in-scope entities and collapses to a
  // value object; L59's `Sku` is in scope and stays an entity reference.

  /**
   * The currency this override is denominated in, as the branded three-character code.
   *
   * TWO SOURCE LINES COLLAPSE INTO THIS ONE FIELD, and the collapse is exact:
   *
   *   [model/entity/SkuCurrency.cfc:L58]
   *     property name="currency" cfc="Currency" fieldtype="many-to-one" fkcolumn="currencyCode";
   *   [model/entity/SkuCurrency.cfc:L68]
   *     property name="currencyCode" insert="false" update="false";
   *
   * L58's foreign-key column IS `currencyCode` itself, not a surrogate id, so the association and
   * its key are the SAME column and L68 is that column surfaced as a readable property. Nothing
   * else in `Currency` this slice needs, which is what makes the collapse lossless.
   *
   * A READ-ONLY PROJECTION WITH NO SETTER. `insert="false" update="false"` mapped the property onto
   * the FK column for READING ONLY, reproduced structurally: the field is `readonly`, there is no
   * `setCurrencyCode`, and it takes part in no write path. L68 declares no `ormtype` and no
   * `length`
   * - CFML defaults an undeclared `ormtype` to string, and the three-character constraint comes
   *   from
   * the branded type, which traces its length to [model/entity/PromotionApplied.cfc:L55]
   * (`ormtype="string" length="3"`), the one in-scope entity that genuinely declares it. No
   * `Currency` class is created and no runtime currency table is introduced.
   *
   * JUDGMENT CALL: non-optional, though neither L58 nor L68 declares `notnull` and the column is
   * therefore nullable at the schema level - and the column is deliberately not changed. What is
   * decided here is the TYPE THIS CLASS PUBLISHES, and non-optional is faithful for three reasons:
   * the row's entire purpose is to name a currency; the only in-scope consumer dereferences it
   * UNCONDITIONALLY at [model/entity/Sku.cfc:L400], where CFML would raise on a NULL rather than
   * skip the row, so NULL is not a consumable state; and stating the requirement in the type puts
   * the obligation to refuse such a row at the hydration boundary. The guarantee is about SHAPE,
   * never that the currency exists, is active, or is eligible for the SKU - eligibility is the
   * `skuEligibleCurrencies` setting, gated at [model/entity/Sku.cfc:L373].
   *
   * THE DEFAULT CURRENCY CODE IS NOT DECIDED HERE and its three-letter literal appears nowhere in
   * this file. The default is the `skuCurrency` SETTING, declared once as a `fieldType="select"`
   * entry carrying a three-letter `defaultValue` at [model/service/SettingService.cfc:L221] and
   * resolved through the settingsProvider port by `src/domain/entities/sku.ts`, whose
   * `getCurrencyCode()` at [model/entity/Sku.cfc:L360-L365] does nothing but memoize
   * `this.setting('skuCurrency')`. Hardcoding it here would create a second source of truth. This
   * field holds the code a ROW carries, which is a different thing.
   */
  private readonly currencyCode: CurrencyCode;

  /**
   * The materialized far side of the `sku` many-to-one. [model/entity/SkuCurrency.cfc:L59]
   *
   *   property name="sku" cfc="Sku" fieldtype="many-to-one" fkcolumn="skuID";
   *
   * THE ONLY MUTABLE FIELD ON THIS CLASS: `setSku` assigns it and `removeSku` clears it.
   *
   * DECLARED `Sku | undefined` AND DELIBERATELY NOT AS AN OPTIONAL `sku?: Sku`. Under
   * `exactOptionalPropertyTypes` an optional property cannot be assigned `undefined` explicitly,
   * and the legacy `structDelete(variables, "sku")` at [model/entity/SkuCurrency.cfc:L103] makes
   * the field ABSENT - so this declaration is what makes `this.sku = undefined` legal. `undefined`
   * therefore means one of three things, and the class does not distinguish them because the legacy
   * did not either: the repository chose not to fetch the far side, `setSku` has never run, or
   * `removeSku` has cleared it.
   *
   * NO `skuID` FIELD AND NO `getSkuID()` ACCESSOR EXIST, and the asymmetry with `currencyCode` is
   * deliberate: `fkcolumn="skuID"` on L59 is an ATTRIBUTE OF THE ASSOCIATION, whereas L68's
   * `currencyCode` genuinely is a declared property, so `accessors=true` generated
   * `getCurrencyCode()` but never a `getSkuID()`. Adding one would invent a member the legacy
   * public surface does not have. The column itself is untouched; only the accessor is absent.
   */
  private sku: Sku | undefined;

  // --- Remote Properties [model/entity/SkuCurrency.cfc:L70-L71]

  /**
   * `remoteID` - the external-system correlation key. [model/entity/SkuCurrency.cfc:L71]
   *
   *   property name="remoteID" ormtype="string";
   *
   * No `length`, no `default`, so `string | undefined`. Present on 15 of the 18 in-scope entities
   * and preserved here as an inert persisted column: nothing in the slice reads or writes it and no
   * synchronisation behaviour is ported, but the schema contract must stay auditable.
   */
  private readonly remoteID: string | undefined;

  // --- Audit Properties [model/entity/SkuCurrency.cfc:L73-L77]
  //
  // All four carry `hb_populateEnabled="false"`, the legacy mechanism for excluding them from mass
  // assignment. No mechanism is needed here: they are `readonly`, set once during hydration, and
  // exposed through getters with no setter.
  //
  // THE TWO ACCOUNT ASSOCIATIONS COLLAPSE TO OPAQUE ID STRINGS. L75 and L77 declare
  //   `cfc="Account" fieldtype="many-to-one"`,
  // but model/entity/Account.cfc is out of scope. So no `Account` type is imported, neither column
  // is ever typed as an entity, and no `Account` instance is constructed. The columns are
  // preserved; only the object graph is not.

  /** `createdDateTime`. [model/entity/SkuCurrency.cfc:L74] `ormtype="timestamp"`. */
  private readonly createdDateTime: Date | undefined;

  /** The `createdByAccountID` column, opaque. [model/entity/SkuCurrency.cfc:L75] */
  private readonly createdByAccountID: string | undefined;

  /** `modifiedDateTime`. [model/entity/SkuCurrency.cfc:L76] `ormtype="timestamp"`. */
  private readonly modifiedDateTime: Date | undefined;

  /** The `modifiedByAccountID` column, opaque. [model/entity/SkuCurrency.cfc:L77] */
  private readonly modifiedByAccountID: string | undefined;

  /**
   * Hydrates one `SwSkuCurrency` row.
   *
   * A single readonly parameter object, typed inline rather than as a second exported interface,
   * because this module exports exactly one unit.
   *
   * EVERY NULLABLE SLOT IS A REQUIRED KEY TYPED `T | undefined`, NOT AN OPTIONAL `?:` SLOT.
   * `exactOptionalPropertyTypes` makes "absent" and "present-but-undefined" genuinely different
   * types, and requiring the key forces a hydrating repository to state "I looked and found
   * nothing" rather than silently omitting it. For the three monetary slots that distinction IS the
   * safety property: a repository cannot forget to mention a price.
   *
   * NO DEFAULTS ARE APPLIED HERE - not `0`, not `Money.zero`, not a clock reading, not a currency
   * code. Applying an ORM-style `default="0"` at construction time would fabricate the very value
   * the null contract exists to keep distinguishable. There is no collaborator port parameter
   * because this entity has zero `getService(` sites, and no clock parameter because it performs no
   * date comparison.
   */
  constructor(init: {
    readonly skuCurrencyID: string;
    readonly price: Money | undefined;
    readonly renewalPrice: Money | undefined;
    readonly listPrice: Money | undefined;
    readonly currencyCode: CurrencyCode;
    readonly sku: Sku | undefined;
    readonly remoteID: string | undefined;
    readonly createdDateTime: Date | undefined;
    readonly createdByAccountID: string | undefined;
    readonly modifiedDateTime: Date | undefined;
    readonly modifiedByAccountID: string | undefined;
  }) {
    this.skuCurrencyID = init.skuCurrencyID;
    this.price = init.price;
    this.renewalPrice = init.renewalPrice;
    this.listPrice = init.listPrice;
    this.currencyCode = init.currencyCode;
    this.sku = init.sku;
    this.remoteID = init.remoteID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
  }

  // --- Accessors
  //
  // ColdFusion generated every one of these from the property metadata - `accessors="true"` on
  // [model/entity/SkuCurrency.cfc:L49] - so there is no legacy body to port, and the locator on
  // each cites the property declaration it serves. Cascade Step 2 reaches five of the seven.
  //
  // GETTERS ONLY. The component declares no setter for any of them; the only write-side members it
  // declares at all are the `setSku`/`removeSku` pair below. In particular there is no
  // `setCurrencyCode`, because L68's `insert="false" update="false"` makes that column unwritable.

  /** [model/entity/SkuCurrency.cfc:L52] Read by cascade Step 2 at [model/entity/Sku.cfc:L412]. */
  getSkuCurrencyID(): string {
    return this.skuCurrencyID;
  }

  /**
   * `price`, or `undefined`. [model/entity/SkuCurrency.cfc:L53]
   *
   * `undefined` MEANS ABSENT AND MUST STAY `undefined`. Never `0`, never `Money.zero`, never a
   * fabricated value - substituting one would silently sell products for free. Read unconditionally
   * by cascade Step 2 at [model/entity/Sku.cfc:L409].
   */
  getPrice(): Money | undefined {
    return this.price;
  }

  /**
   * `renewalPrice`, or `undefined`. [model/entity/SkuCurrency.cfc:L54]
   *
   * `undefined` MEANS ABSENT. Never `0`. Cascade Step 2 tests exactly this with `!isNull(...)` at
   * [model/entity/Sku.cfc:L401] before writing the sub-key, and
   * `Sku.getRenewalPriceByCurrencyCode()` [model/entity/Sku.cfc:L281-L285] then re-tests that
   * sub-key's existence - so a `0` here would make that second check dead code.
   */
  getRenewalPrice(): Money | undefined {
    return this.renewalPrice;
  }

  /**
   * `listPrice`, or `undefined`. [model/entity/SkuCurrency.cfc:L55]
   *
   * `undefined` MEANS ABSENT. Never `0`. Guarded by `!isNull(...)` at [model/entity/Sku.cfc:L405],
   * and re-tested as a sub-key by `Sku.getListPriceByCurrencyCode()`
   * [model/entity/Sku.cfc:L275-L279].
   */
  getListPrice(): Money | undefined {
    return this.listPrice;
  }

  /**
   * The read-only projection of the `currency` foreign key. [model/entity/SkuCurrency.cfc:L68],
   * projecting the FK column named at [model/entity/SkuCurrency.cfc:L58].
   *
   * ON A LIVE MUST-PRESERVE PATH: cascade Step 2 keys its per-currency override lookup off exactly
   * this value at [model/entity/Sku.cfc:L400], comparing with CFML `eq`.
   *
   * CFML `eq` IS CASE-INSENSITIVE AND `===` IS NOT, so a caller comparing two currency codes must
   * route through `currencyCodeEquals`. That obligation sits with the CALLER; this accessor returns
   * the code the row carries with its casing preserved exactly as stored, because folding case here
   * would corrupt the round trip. There is no matching setter, by design.
   */
  getCurrencyCode(): CurrencyCode {
    return this.currencyCode;
  }

  /**
   * The materialized far side of the `sku` many-to-one, or `undefined`.
   * [model/entity/SkuCurrency.cfc:L59]
   *
   * `undefined` when the repository did not fetch it, when `setSku` has never run, or after
   * `removeSku` has cleared it. Laziness is not simulated: nothing is fetched on demand here.
   */
  getSku(): Sku | undefined {
    return this.sku;
  }

  /** [model/entity/SkuCurrency.cfc:L71] Inert in this slice; no synchronisation is ported. */
  getRemoteID(): string | undefined {
    return this.remoteID;
  }

  /** [model/entity/SkuCurrency.cfc:L74] `hb_populateEnabled="false"`. */
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /** The `createdByAccountID` column, opaque. [model/entity/SkuCurrency.cfc:L75] */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /** [model/entity/SkuCurrency.cfc:L76] `hb_populateEnabled="false"`. */
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /** The `modifiedByAccountID` column, opaque. [model/entity/SkuCurrency.cfc:L77] */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  // =============
  // START: Bidirectional Helper Methods
  // ===================
  // [model/entity/SkuCurrency.cfc:L86] .. [model/entity/SkuCurrency.cfc:L106], holding exactly one
  // pair under the inline sub-banner `// Sku (many-to-one)` at [model/entity/SkuCurrency.cfc:L88].

  // LEGACY-NOTE [model/entity/SkuCurrency.cfc:L89-L104]: THIS PAIR IS THE CORRECT, NON-DEFECTIVE
  // PATTERN, and it carries no defect marker for exactly that reason. Two failure modes that are
  // real elsewhere in this tree were checked against the verbatim source:
  //
  //   1. THE "remove-that-ADDs" INVERSION. Some Slatwall `remove*` helpers ADD instead of removing
  //      -
  //      [model/entity/Option.cfc:L129-L131] `removePromotionRewardExclusion` and
  //      [model/entity/Option.cfc:L145-L147] `removePromotionQualifierExclusion` each call
  //      `addExcludedOption(this)`. CLEAN here: L101 is `arrayDeleteAt`, L103 a `structDelete`, and
  //      no
  //      `add*` call sits on any path.
  //   2. THE LEAKED ARGUMENT. CLEAN here: L99's `arrayFind` and L101's `arrayDeleteAt` both
  //      dereference the same, correctly declared `arguments.sku`. Contrast
  //      [model/entity/PromotionPeriod.cfc:L110] and [model/entity/PromotionAccount.cfc:L103],
  //      which
  //      both leak an `arguments.account` that was never declared - registered defects in their own
  //      files, and this pair is one of the controls proving they are copy-paste errors rather than
  //      a
  //      CFML idiom.

  // LEGACY-NOTE [model/entity/SkuCurrency.cfc:L91-L93] and [model/entity/SkuCurrency.cfc:L99-L102]:
  // THE IN-MEMORY GRAPH SYMMETRY IS REPRODUCED, so `sku.getSkuCurrencies()` and
  // `skuCurrency.getSku()` can never disagree. Both legacy bodies mutate the FAR SIDE's collection
  // in addition to the near-side field:
  //   L91-L93  if(isNew() or !arguments.sku.hasSkuCurrency( this )) {
  //                arrayAppend(arguments.sku.getSkuCurrencies(), this);
  //            }
  //   L99-L102 var index = arrayFind(arguments.sku.getSkuCurrencies(), this);
  //            if(index > 0) {
  //                arrayDeleteAt(arguments.sku.getSkuCurrencies(), index);
  //            }
  //
  // Dropping either half would produce a SILENT inconsistency rather than avoid one: two accessors
  // disagreeing about one link, with no error anywhere. On this association that is not academic -
  // an override missing from the currency map is exactly the state [model/entity/Sku.cfc:L399-L414]
  // cannot distinguish from "there is no override", so the cascade would fall through to step 3 and
  // CONVERT a price meant to be read verbatim. "It changes no row" is an argument about
  // persistence, not about the graph: the link's persisted state is `skuID` on THIS row
  // [model/entity/SkuCurrency.cfc:L59], while the far-side array is the in-memory view of the same
  // link, and `Sku.getCurrencyDetails()` reads it within the request.
  //
  // The L91 guard is ported too, with the `isNew()` it calls and the `isSameRowAs` the `arrayFind`
  // needs. (The source writes `hasSkuCurrency( this )` with spaces inside the parens: a cosmetic
  // wart, recorded and not reproduced.) The UNHONOURED `all-delete-orphan` obligation on
  // [model/entity/Sku.cfc:L72] belongs to `src/repositories/mysql/**`.

  /**
   * Bidirectional helper for the `sku` many-to-one. [model/entity/SkuCurrency.cfc:L89]
   *
   * The parameter is REQUIRED, matching L89's `required any sku`.
   *
   * BOTH STATEMENTS ARE REPRODUCED IN THE SOURCE'S ORDER: the near-side assignment at
   * [model/entity/SkuCurrency.cfc:L90] runs first and unconditionally, then the guarded far-side
   * append at [model/entity/SkuCurrency.cfc:L91-L93]. The ordering matters because the guard calls
   * back into the sku.
   *
   * THE SHORT-CIRCUIT IS LOAD-BEARING. `isNew() or !arguments.sku.hasSkuCurrency( this )` evaluates
   * `isNew()` first, so for an unsaved row the far-side membership test is not performed at all and
   * the append simply happens - which is what makes it safe, since every unsaved SkuCurrency has an
   * empty `skuCurrencyID` and a key-based test could not tell them apart. `||` reproduces CFML `or`
   * faithfully because both operands are already booleans.
   *
   * Returns `void`, as the legacy `public void function` does, and is synchronous: nothing here
   * reaches a port or a repository.
   */
  setSku(sku: Sku): void {
    // [model/entity/SkuCurrency.cfc:L90] - before the guard, always.
    this.sku = sku;

    // [model/entity/SkuCurrency.cfc:L91-L93] - the guarded append onto the sku's LIVE array. `push`
    // mutates in place, which is required: `arrayAppend` mutated the very array that
    // `Sku.getSkuCurrencies()` hands back.
    if (this.isNew() || !sku.hasSkuCurrency(this)) {
      sku.getSkuCurrencies().push(this);
    }
  }

  /**
   * Whether this row has never been persisted. [org/Hibachi/HibachiEntity.cfc:L571-L576] via
   * [org/Hibachi/HibachiEntity.cfc:L707-L709]
   *
   * The framework base defines `isNew()` as `getNewFlag()`, and `getNewFlag()` as
   * `getPrimaryIDValue() == ""`. The base is not ported, so the one line it contributed is restated
   * here. Ported because it is concretely called, at [model/entity/SkuCurrency.cfc:L91] inside
   * `setSku`'s guard; `unsavedvalue=""` and `default=""` on [model/entity/SkuCurrency.cfc:L52] are
   * what make an unsaved row's key empty.
   */
  isNew(): boolean {
    return this.skuCurrencyID === '';
  }

  /**
   * Whether `candidate` denotes the same `SwSkuCurrency` row as this instance.
   *
   * Private, with no legacy counterpart by name: it stands for CFML's `arrayFind(array, this)` at
   * [model/entity/SkuCurrency.cfc:L99], which was reference identity in the language and row
   * identity under Hibernate's session. With no session those come apart, so the comparison is made
   * on the primary key and falls back to reference identity when either side is unsaved. Identical
   * in shape to the helpers of the same name on the sibling entities: one containment rule
   * folder-wide.
   */
  private isSameRowAs(candidate: SkuCurrency): boolean {
    const candidateSkuCurrencyID: string = candidate.getSkuCurrencyID();

    if (candidateSkuCurrencyID === '' || this.skuCurrencyID === '') {
      return candidate === this;
    }

    return candidateSkuCurrencyID === this.skuCurrencyID;
  }

  /**
   * Bidirectional helper for the `sku` many-to-one. [model/entity/SkuCurrency.cfc:L95]
   *
   * THE PARAMETER IS OPTIONAL, matching the legacy signature exactly: L95 declares `any sku`, NOT
   * `required any sku`. L96-L98 is the default-to-the-currently-set-value idiom,
   * `if(!structKeyExists(arguments, "sku")) { arguments.sku = variables.sku; }`, whose idiomatic
   * TypeScript form is an optional parameter. The branch tests `!== undefined` rather than
   * truthiness, because `structKeyExists` asks about PRESENCE.
   *
   * THE NEAR-SIDE CLEAR ALWAYS RUNS, AND THE ORDERING IS PRESERVED EXACTLY.
   * `structDelete(variables, "sku")` at [model/entity/SkuCurrency.cfc:L103] sits OUTSIDE the
   * `if(index > 0)` block at L100-L102, so the legacy clears the near side whether or not the
   * far-side removal found anything. The far-side removal is reproduced, so `resolvedSku` is
   * consumed by the search as well as by the guard.
   *
   * IT THROWS WHEN THE ARGUMENT IS OMITTED AND NO SKU IS SET, and that is behaviour preservation
   * rather than defensiveness: at [model/entity/SkuCurrency.cfc:L97] the legacy executes
   * `arguments.sku = variables.sku;`, and with the key already absent - `structDelete` at L103
   * having removed it, or the association never having been set - CFML raises "Element SKU is
   * undefined in VARIABLES." right there, INSIDE the defaulting block. Silently no-opping would
   * invent a success path the legacy does not have. Same ruling as the identical construct at
   * [model/entity/PromotionCode.cfc:L110-L113]. On that one path the field was ALREADY absent, so
   * the skipped clear would have been a no-op: every completing path ends with the field absent, in
   * both implementations. A plain `Error` is thrown because this module exports exactly one runtime
   * value.
   */
  removeSku(sku?: Sku): void {
    // [model/entity/SkuCurrency.cfc:L96-L98] - default the argument from the currently-set value.
    // Tested with `!== undefined` rather than for truthiness: `structKeyExists` asks about
    // PRESENCE, and only an explicit undefined comparison asks the same question.
    const resolvedSku: Sku | undefined = sku !== undefined ? sku : this.sku;

    if (resolvedSku === undefined) {
      // [model/entity/SkuCurrency.cfc:L97] - CFML fails here reading an absent `variables.sku`.
      throw new Error(
        'SkuCurrency.removeSku was called with no argument while no sku is set. ' +
          'model/entity/SkuCurrency.cfc:L96-L98 defaults the argument from variables.sku, and ' +
          'CFML raises "Element SKU is undefined in VARIABLES." on that read once the key has ' +
          'been structDelete-d at L103. Reproduced rather than silently absorbed.',
      );
    }

    // [model/entity/SkuCurrency.cfc:L99] ARRAY INDEX BASE CHANGE: CFML `arrayFind` returns a
    // 1-BASED index, or 0 for "not found", which is why the source guards with `index > 0` at L100.
    // `Array.prototype.findIndex` returns a 0-BASED index, or -1 for "not found", so the guard MUST
    // become `!== -1`. Carrying `> 0` across would silently skip element 0 - the first currency row
    // on the sku, and the very one [model/entity/Sku.cfc:L399-L414] would then fail to see.
    //
    // Containment is BY PRIMARY KEY with a reference fallback for an unsaved row, per
    // `isSameRowAs`; see the note on that method for why a key comparison reproduces the legacy
    // meaning where a reference comparison would only reproduce its letter.
    const skuCurrencies: SkuCurrency[] = resolvedSku.getSkuCurrencies();
    const index: number = skuCurrencies.findIndex((candidate: SkuCurrency) =>
      this.isSameRowAs(candidate),
    );

    // [model/entity/SkuCurrency.cfc:L100-L102]
    if (index !== -1) {
      skuCurrencies.splice(index, 1);
    }

    // [model/entity/SkuCurrency.cfc:L103] - UNCONDITIONAL, outside the `if(index > 0)` block at
    // L100-L102. The legacy clears the near side whether or not the far-side removal found
    // anything, and that ordering is preserved: the field becomes absent.
    this.sku = undefined;
  }

  // =============
  // END:  Bidirectional Helper Methods
  // ===================

  // ==================
  // START: Overridden Methods
  // ========================
  // [model/entity/SkuCurrency.cfc:L116] .. [model/entity/SkuCurrency.cfc:L122]

  /**
   * A short human-readable label for this row. [model/entity/SkuCurrency.cfc:L118-L120]
   *
   * The legacy body is one line:
   *   return getSku().getSkuCode() & " - " & getCurrency().getCurrencyCode();
   *
   * The separator is EXACTLY `' - '` - space, hyphen, space - reproduced byte for byte.
   *
   * `getCurrency().getCurrencyCode()` collapses to the projected code: there is no `Currency`
   * entity to dereference, and [model/entity/SkuCurrency.cfc:L68] holds the identical value L58's
   * foreign key points at, because the FK column literally IS `currencyCode`.
   *
   * JUDGMENT CALL: an unhydrated sku is GUARDED rather than thrown on, with the empty string
   * standing in for the missing code. CFML's implicit lazy load made the null case unreachable in
   * practice, so there is no legacy behaviour to preserve here - only a hole the ORM used to fill.
   * For a genuinely unhydrated instance CFML would have raised at
   * [model/entity/SkuCurrency.cfc:L119]; making a DISPLAY HELPER fail a request is a poor trade
   * against a partial label, and a label is not a price - the never-substitute rule governing the
   * three monetary accessors is about values money is computed from, and nothing is computed from
   * this string. With no sku materialized the result is the separator followed by the currency
   * code. A caller needing to distinguish "no sku" from "a sku whose code is empty" consults
   * `getSku()`.
   */
  getSimpleRepresentation(): string {
    // [model/entity/SkuCurrency.cfc:L119] - `getSku().getSkuCode()`, guarded on BOTH levels.
    //
    // The second `?? ''` covers a materialized SKU whose own `skuCode` column is null. That column
    // is `unique="true" length="50"` at [model/entity/Sku.cfc:L54] with NO `notnull`, so
    // `Sku.getSkuCode()` is `string | undefined` - and CFML concatenating a null-backed accessor
    // into a string raises. The same three reasons recorded above for guarding the absent SKU apply
    // verbatim to the absent CODE: a display helper is the wrong thing to fail a request on, and a
    // label is not a price. A caller that must tell the two holes apart asks `getSku()` and then
    // `getSkuCode()`.
    const skuCode: string = this.sku === undefined ? '' : (this.sku.getSkuCode() ?? '');

    // [model/entity/SkuCurrency.cfc:L119] - the separator is EXACTLY one space, one hyphen, one
    // space, reproduced byte for byte from `& " - " &`. (The source line also carries a trailing
    // space before its newline; that is a whitespace wart in the CFC, not part of the returned
    // value, and it is deliberately not reproduced.)
    return `${skuCode} - ${this.currencyCode}`;
  }

  // ==================
  // END:  Overridden Methods
  // ========================
}

// LEGACY-NOTE [model/entity/SkuCurrency.cfc:L79-L130]: of the component's seven banner sections
// FIVE ARE EMPTY, and nothing is authored for them - Non-Persistent Property Methods [L82-L84],
// Custom Validation Methods [L108-L110], Custom Formatting Methods [L112-L114], ORM Event Hooks
// [L124-L126] and Deprecated Methods [L128-L130]. Two consequences matter: with no `preInsert` or
// `preUpdate` there is no materialized path to maintain here, and with no non-persistent property
// there is no memoized accessor and none of the three memo defects that pattern carries elsewhere.
// The property sections at [L61], [L63], [L65] and [L79-L80] are empty too, so no field here is an
// array. The entire behavioural surface is three methods: `setSku`, `removeSku` and
// `getSimpleRepresentation`.

// HAND-OFF NOTES - obligations that belong to other modules, recorded here because this entity's
// contract assumes them.
//
//   1. `getFormattedValue(...)` IS NOT PORTED, and cascade Step 2 calls it on this entity at
//      [model/entity/Sku.cfc:L403, L407, L410] to populate the `renewalPriceFormatted`,
//      `listPriceFormatted` and `priceFormatted` keys. It is a framework member
//      [org/Hibachi/HibachiTransient.cfc:L493] driven by the `hb_formatType="currency"` metadata on
//      the three monetary fields. Money PRESENTATION belongs to `src/lib/cfml/numberFormat.ts`, and
//      whether the ported cascade carries those three `*Formatted` keys is decided by
//      `src/domain/entities/sku.ts`.
//   2. THE CASE-INSENSITIVITY OBLIGATION AT [model/entity/Sku.cfc:L400] IS THE CALLER'S. CFML `eq`
//      ignores case and `===` does not, so that comparison must route through `currencyCodeEquals`.
//      A raw `===` there is a parity bug, and it is invisible from this file.
//   3. THE `cascade="all-delete-orphan"` OBLIGATION ON [model/entity/Sku.cfc:L72] IS THE
//      REPOSITORY'S. With no ORM there is no cascade, so orphan deletion is explicit; `removeSku`
//      clears only the near-side reference and deletes nothing.
//   4. THE HYDRATION BOUNDARY OWNS THREE THINGS THIS CLASS ASSUMES: branding the `currencyCode` via
//      `toCurrencyCode`, constructing each `Money` from the `big_decimal` column's decimal STRING
//      form (never via a `number`), and passing `undefined` - never `0` - for a NULL monetary
//      column.
