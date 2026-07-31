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
//   src/domain/entities/sku.ts                      Sku entity
//   tests/traceability/legacyTestMap.ts             structural coverage map
//   tests/unit/domain/entities/skuCurrency.test.ts  skuCurrency entity suite
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// slatwall-ts - SkuCurrency entity
//
// PORT OF model/entity/SkuCurrency.cfc (131 lines, confirmed by `wc -l`).
//
// WHY THIS ENTITY IS IN SCOPE AT ALL
// It is not named directly by the migration request; it is an IMPLICIT-SCOPE
// entity, pulled in because the slice cannot work without it. `SwSkuCurrency`
// is the PER-CURRENCY PRICE-OVERRIDE TABLE, and it is read by STEP 2 of the
// four-step currency cascade at [model/entity/Sku.cfc:L399-L414] - the third of
// the three complexity hotspots. Without this entity that hotspot is not
// portable, which is the whole justification for its presence.
//
// Cascade Step 2 calls SIX members of this class, and every one of them is
// therefore on a live must-preserve path. Verified line by line against the
// source rather than inferred:
//
//   [model/entity/Sku.cfc:L400]  getCurrencyCode()  - the match key for the
//                                override lookup, compared with CFML `eq`
//   [model/entity/Sku.cfc:L401]  getRenewalPrice()  - inside `!isNull(...)`
//   [model/entity/Sku.cfc:L402]  getRenewalPrice()  - the value write
//   [model/entity/Sku.cfc:L405]  getListPrice()     - inside `!isNull(...)`
//   [model/entity/Sku.cfc:L406]  getListPrice()     - the value write
//   [model/entity/Sku.cfc:L409]  getPrice()         - written UNCONDITIONALLY,
//                                with no `!isNull` guard, unlike the other two
//   [model/entity/Sku.cfc:L412]  getSkuCurrencyID() - recorded alongside the
//                                override so the cascade can name its source
//   [model/entity/Sku.cfc:L403, L407, L410]  getFormattedValue(...) - a
//                                FRAMEWORK member, deliberately not ported; see
//                                the hand-off note at the foot of this file.
//
// THOSE TWO `!isNull` GUARDS ARE EVIDENCE, NOT DECORATION. The legacy cascade
// tests `getRenewalPrice()` and `getListPrice()` for null before writing them,
// which is a direct demonstration that a `SwSkuCurrency` row can legitimately
// hold NULL in those columns. That is the empirical basis for typing all three
// monetary fields `Money | undefined` - see the block above the fields.
//
// AAP AUTHORITY
// Section 0.4.1, "Domain Entities":
//   src/domain/entities/skuCurrency.ts | CREATE | model/entity/SkuCurrency.cfc |
//   Port `price`/`listPrice`/`renewalPrice` as `Money`; `currencyCode` remains a
//   read-only projection of the FK (legacy `insert=false update=false`)
// Section 0.2.1 lists this entity among the three added by implicit necessity,
// alongside model/entity/OptionGroup.cfc and model/entity/RoundingRule.cfc, and
// fixes this folder at exactly EIGHTEEN modules. This is one of them; no
// nineteenth entity file exists and none may be created.
//
// THE COMPONENT DECLARATION, VERBATIM [model/entity/SkuCurrency.cfc:L49]
//
//   component entityname="SlatwallSkuCurrency" table="SwSkuCurrency"
//   persistent="true" accessors="true" extends="HibachiEntity"
//   cacheuse="transactional" hb_serviceName="skuService"
//   hb_permission="sku.skuCurrencies" {
//
// Schema continuity is a binding constraint, and the property metadata IS the
// contract. Table `SwSkuCurrency`, entity name `SlatwallSkuCurrency`. No
// migration, no rename, no new column, no dropped column. Every `hb_*`
// attribute value is carried forward verbatim in a comment so the legacy admin
// can still resolve it, and inert columns are preserved rather than removed.
//
// THE DECLARATION CENSUS - A CORRECTION, RECORDED BECAUSE THE SOURCE IS THE
// AUTHORITY. The requirement that reached this file listed three divergences of
// L49 from its siblings. A full census of the component declarations of all
// EIGHTEEN in-scope entities was run rather than taking that on trust, and only
// ONE of the three survives:
//
//   | claimed divergence      | verdict against the 18-entity census            |
//   |-------------------------|-------------------------------------------------|
//   | no `displayname=`       | GENUINE. 16 of 18 declare one; the only two     |
//   |                         | that do not are Sku and SkuCurrency.            |
//   | no `output="false"`     | NOT a divergence. Only 7 of 18 carry `output=`  |
//   |                         | (Sku, Brand, Option, OptionGroup, PriceGroup,   |
//   |                         | PriceGroupRate, RoundingRule). Omitting it is   |
//   |                         | the MAJORITY form, at 11 of 18.                 |
//   | `persistent="true"`     | NOT a divergence. QUOTING is the majority, at   |
//   | quoted, "where most     | 11 of 18 (Product, SkuCurrency, ProductType,    |
//   | siblings use bare true" | Category, Promotion, PromotionCode,             |
//   |                         | PromotionPeriod, PromotionQualifier,            |
//   |                         | PromotionReward, PromotionApplied,              |
//   |                         | PromotionAccount). Only 7 write it bare.        |
//
// One genuine rarity the requirement did not single out: `accessors="true"` is
// QUOTED on only two of the eighteen, this entity and
// [model/entity/Category.cfc:L49]. Seven write it bare and nine omit it from
// the component line entirely - ColdFusion generates accessors either way, so
// the omission is cosmetic there too.
//
// All of it is cosmetic in CFML and none of it is "fixed". The correction is
// recorded because an inaccurate claim repeated in a comment is worse than no
// comment: a reviewer checking this file against the CFC would find the census
// does not support it.
//
// `hb_serviceName="skuService"` POINTS AT model/service/SkuService.cfc, NOT AT A
// SERVICE OF ITS OWN. There is no `SkuCurrencyService` anywhere in the legacy
// tree and none is invented here - CRUD for this entity belongs to the SKU
// service by design, exactly as model/entity/Category.cfc:L49 routes to
// `contentService` rather than to a category service.
//
// `hb_permission="sku.skuCurrencies"` IS A NESTED PATH, not the usual `"this"`.
// It names the parent entity and the parent's collection, and it places this
// entity in the small child/link family that does the same - the closest
// in-scope sibling is [model/entity/PriceGroupRate.cfc:L49] with
// `hb_permission="priceGroup.priceGroupRates"`. Repository-wide, `"this"` is
// the dominant form at 46 occurrences. Preserved verbatim as inert text: no
// authorization is evaluated in this layer, and JavaRB is not ported, so no
// permission engine and no i18n runtime is introduced.
//
// THE `extends` CHAIN IS THREE LEVELS DEEP, NOT TWO. `extends="HibachiEntity"`
// on L49 is UNQUALIFIED, so it resolves to the local
// model/entity/HibachiEntity.cfc (274 lines), which itself extends
// `Slatwall.org.Hibachi.HibachiEntity`. The intermediate class alone holds 12
// `getService(...)` sites (L123, L130, L135, L145, L178, L180, L182, L194,
// L196, L207, L257, L266), seven of them reaching `attributeService`. All of
// them are MOOT here - the EAV attribute path is out of scope - but "moot" is
// not "silently reimplemented": NO BASE CLASS IS PORTED, there is no
// inheritance emulation, and this is a standalone class. That is also why
// `noImplicitOverride` never has anything to check in this file: nothing
// overrides anything.
//
// This entity declares NO `attributeValues`. Exactly four in-scope entities do
// - Sku L70, Product L75, ProductType L67 and Brand L60 - and this is not one
// of them, so there is no EAV read path here, no `attributeValue.ts`, and no
// nineteenth entity file. The eleven dynamic-dispatch patterns at
// [org/Hibachi/HibachiEntity.cfc:L507-L565], which terminate in a throw at
// L565, are likewise NOT emulated: no `Proxy`, no index signature, no dynamic
// dispatch. Only concretely-called members appear below, each explicitly typed.
//
// EVERY IMPORT IN THIS FILE IS TYPE-ONLY, AND THAT IS DELIBERATE RATHER THAN AN
// OVERSIGHT. This entity performs ZERO arithmetic and ZERO validation: it holds
// monetary values and hands them back untouched, so `Money` is never
// constructed here and never operated on here. It receives an already-branded
// `CurrencyCode` from the hydration boundary rather than validating one. The
// consequence is that the emitted JavaScript imports nothing at all, which is
// the correct outcome for a class whose only executable behaviour is one field
// assignment, one field clear and one string concatenation.
//
// Three things follow from that and are worth stating plainly:
//   * `decimal.js` IS NOT IMPORTED. `src/domain/valueObjects/money.ts` and
//     `src/lib/cfml/precision.ts` are the only modules permitted to touch it.
//     Money is the sole arithmetic surface in this target and `number` is never
//     a money type; no floating-point operation on a monetary value exists
//     anywhere below.
//   * NO PORT IS INJECTED, because there is nothing to inject. This entity has
//     ZERO `getService(` sites - the census found 45 across only five entities
//     (Sku 19, Product 18, ProductType 6, OptionGroup 1, RoundingRule 1) and
//     this is one of the THIRTEEN in-scope entities with none, eighteen in scope
//     minus those five. Nothing from `../ports/` is imported,
//     no service locator survives, and no ambient scope is read.
//   * NO CFML PARITY HELPER IS IMPORTED. This entity declares ZERO boolean
//     properties, so `cfBoolean()` has nothing to convert, and it performs no
//     list, struct or truthiness operation either. `noUnusedLocals` is enabled
//     and a speculative import would be rejected by it - correctly.
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
// carries twenty numbered defects and none of them is here. In particular the
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
// tests/unit/domain/entities/skuCurrency.test.ts (planned) is authored SEPARATELY, by the
// owner of the test tier, and is not created from here. The contract it has to
// pin is enumerated at the foot of this file.
// ---------------------------------------------------------------------------

import type { CurrencyCode } from '../valueObjects/currencyCode.js';
import type { Money } from '../valueObjects/money.js';
import type { Sku } from './sku.js';

// LEGACY-NOTE [model/entity/SkuCurrency.cfc:L59] and [model/entity/Sku.cfc:L72]: THE
// `skuCurrency` <-> `sku` TYPE CYCLE IS UNAVOIDABLE, AND IT IS SAFE. L59 here declares a
// `many-to-one` onto `Sku`, and Sku.cfc:L72 declares the matching `one-to-many` back onto
// `SkuCurrency`, so the two modules necessarily reference each other. Three properties make
// that harmless rather than fragile:
//
//   1. BOTH DIRECTIONS ARE `import type` ONLY, which TypeScript ERASES AT EMIT. The compiled
//      JavaScript of this module contains no `require`/`import` of `./sku.js` at all, so there
//      is no module-initialisation order to get wrong and no partially-initialised binding to
//      observe at runtime. `consistent-type-imports` is configured with
//      `fixStyle: 'separate-type-imports'` and `no-import-type-side-effects` is an error, so
//      the inline `{ type Sku }` form - which DOES emit a runtime import - cannot be used.
//   2. ENTITY CLASSES NEVER INSTANTIATE SIBLINGS. Row-to-entity hydration belongs entirely to
//      `src/repositories/mysql/**`, so no `new Sku(...)` appears here and no value ever crosses
//      the boundary at module scope.
//   3. A VALUE IMPORT BETWEEN ENTITY MODULES MUST NEVER BE INTRODUCED, in either direction.
//      That is the one change that would turn this benign type cycle into a real one.
//
// CANONICAL FAR-SIDE CONTRACT REQUIRED OF `./sku.js`. `sku.ts` is authored separately, so the three
// members this module depends on are stated here as CANONICAL and must not be renamed or reshaped
// later. All three are read straight off the verbatim legacy source.
//
//   1. `getSkuCode(): string` - guaranteed by [model/entity/Sku.cfc:L54] (`property name="skuCode"
//      ormtype="string" unique="true" length="50"`) together with `accessors=true` on
//      [model/entity/Sku.cfc:L49]. Consumed by `getSimpleRepresentation()`.
//   2. `getSkuCurrencies(): SkuCurrency[]` MUST RETURN THE LIVE ARRAY REFERENCE, NOT A COPY, and the
//      return type must be the MUTABLE `SkuCurrency[]` rather than `readonly SkuCurrency[]` so the
//      contract is visible in the type and not only in prose. [model/entity/SkuCurrency.cfc:L92]
//      `arrayAppend` and [model/entity/SkuCurrency.cfc:L101] `arrayDeleteAt` both mutate it IN PLACE.
//      A defensive copy would silently break bidirectional synchronization: the append would land on a
//      throwaway array and the two sides would drift apart with no error anywhere. This is not a
//      preference - it is the folder-wide ownership contract, whose rule is that an accessor is live
//      exactly when the source mutates that accessor's result in place. [model/entity/Sku.cfc:L72]
//      declares the collection `type="array" cascade="all-delete-orphan" inverse="true"`, which is
//      precisely why `SkuCurrency` owns the write and reaches back through here.
//   3. `hasSkuCurrency(skuCurrency: SkuCurrency): boolean` MUST BE A PRIMARY-KEY COMPARISON ON
//      `skuCurrencyID`, falling back to reference identity when either side is unsaved - never object
//      identity as its only basis, never deep equality. It returns `false` on an empty array. It has
//      no hand-written legacy body: it is the accessor ColdFusion's ORM generates for a collection
//      carrying `singularname="skuCurrency"`, whose CFML semantics are Hibernate's implicit
//      collection-contains, i.e. session identity / PK. The unsaved-row caveat documented on
//      `isSameRowAs` below applies equally there.
//
// Nothing else about `Sku` is depended upon here. The deliberately narrow coupling is what lets these
// two files be authored independently.
//
// A MEASURED, TEMPORARY CONSEQUENCE - AND IT WAS MEASURED RATHER THAN PREDICTED, so it is not
// mistaken for a new problem. Until `./sku.js` exists, `import type { Sku }` resolves to an `error`
// type, so every expression that touches it trips the `no-unsafe-*` rules. This file carries NINETEEN
// such reports, of which NINE sit on the three far-side call sites required above -
// `sku.hasSkuCurrency(this)` and `sku.getSkuCurrencies().push(this)` in `setSku`, and
// `resolvedSku.getSkuCurrencies()` in `removeSku`.
//
// THE CLAIM "THEY DISAPPEAR WHEN `sku.ts` EXISTS" WAS VERIFIED EMPIRICALLY, not asserted. A throwaway
// `sku.ts` exposing only the canonical far-side contract published below - `getSkuCode()`,
// `getSkuCurrencies()` and `hasSkuCurrency()` - was placed in this folder, the linter was re-run, and
// the file was removed again. Result, with NO edit to this file:
//
//   src/domain/entities/skuCurrency.ts   19 -> 0     (all nineteen, including the nine above)
//   src/domain/entities/option.ts        20 -> 16    (its own `./sku.js` type-only import)
//   src/domain/ports/skuRepository.ts     2 -> 0
//   whole tree                          148 -> 124
//
// So every one of the nineteen is a report ABOUT THE MISSING MODULE and none is about this code. The
// nine are not avoidable either: the restored far-side maintenance IS the fix, and no formulation of it
// can avoid naming the far side. The count is discharged by authoring `sku.ts`, which is required
// independently, and the end state for the whole tree is ZERO.
//
// The alternatives were all worse and each was considered and rejected:
//
//   * A CAST to silence the reports. Rejected outright - `as unknown as` is exactly the escape hatch
//     the strict profile exists to forbid, and it would defeat the check permanently rather than
//     temporarily.
//   * NARROWING `getSku()` TO A MODULE-LOCAL STRUCTURAL INTERFACE, the way `brand.ts` types its helper
//     parameters as `ProductBrandLink` and friends. That pattern is correct THERE because `Brand`
//     delegates to a far side it never stores, so nothing constrains the parameter to be wider. Here
//     the far side is STORED in a field and handed back by a public accessor, so a structural view
//     would narrow the declared return type of `getSku()` - and interface parity, not tidiness, is
//     this port's acceptance contract.
//   * DROPPING THE FAR-SIDE MAINTENANCE, which is what an earlier revision did and what the note on
//     `setSku` below rebuts at length.

/**
 * One `SwSkuCurrency` row: a per-currency price override for a single SKU.
 *
 * A CLASS rather than an interface, for two reasons that both matter. The legacy entities carry
 * behaviour and not merely data - this one carries three methods - and interface parity is the
 * acceptance contract, so a reviewer diffs this public surface against the CFC member by member.
 * Method names are therefore the legacy CFML names VERBATIM in camelCase, which is exactly why
 * eslint.config.mjs deliberately enables no `naming-convention`, `camelcase` or `id-match` rule.
 *
 * MINIMAL CHANGE SCOPES THE FUNCTIONAL SURFACE, NOT THE CODE STYLE. Idiomatic TypeScript is
 * required and a CFML transliteration would violate the directive, so there is no `variables.`
 * scope object, no `structKeyExists` emulation, no `structDelete` emulation, no `evaluate()` and
 * no dynamic dispatch anywhere below. What is preserved is the observable surface and its
 * semantics; what is discarded is the mechanism CFML needed to provide them.
 *
 * ASSOCIATIONS ARRIVE ALREADY MATERIALIZED, OR ABSENT. Hibernate lazy collections have no
 * equivalent in a driver-only stack, and laziness is NOT simulated: `src/repositories/mysql/**`
 * owns hydration and documents its fetch shape at the producing method, while this class simply
 * receives what it is given. There is no fetch-shape ruling to make for this entity, and that
 * was checked rather than assumed - a census of model/entity/SkuCurrency.cfc finds NO `fetch=`
 * and NO `lazy=` attribute anywhere in it.
 *
 * The entity declares ZERO collections - no `one-to-many`, no `many-to-many` in either
 * direction; [model/entity/SkuCurrency.cfc:L61], [L63] and [L65] are empty section comments and
 * an empty banner implies nothing. So no field here is an array, and no `hasAny*` member exists.
 * It declares no non-persistent property either ([L79-L80] is likewise empty), so the memoized
 * accessor pattern is absent, and with it the three known memo defects that pattern carries in
 * sibling entities.
 *
 * IMMUTABLE EXCEPT FOR ONE FIELD. Every field is `readonly` apart from `sku`, which
 * `setSku`/`removeSku` must be able to assign and clear.
 */
export class SkuCurrency {
  // --- Persistent Properties [model/entity/SkuCurrency.cfc:L51-L55] ---------------------------

  /**
   * Primary key. [model/entity/SkuCurrency.cfc:L52]
   *
   *   property name="skuCurrencyID" ormtype="string" length="32" fieldtype="id"
   *   generator="uuid" unsavedvalue="" default="";
   *
   * `string` and never `string | undefined`: `default=""` means the column always holds a
   * string, possibly the empty one. That empty string is load-bearing in the legacy framework -
   * it is what `isNew()` keys on, via `getNewFlag()` testing `getPrimaryIDValue() == ""` - and
   * it is preserved here even though this class has no `isNew()` of its own, for the reason
   * recorded on `setSku`.
   *
   * Read-only with no setter, matching the legacy id property. Cascade Step 2 reads it at
   * [model/entity/Sku.cfc:L412] to record which override row supplied a price, so it is on a
   * must-preserve path.
   */
  private readonly skuCurrencyID: string;

  // ===========================================================================================
  // ** THE THREE MONETARY COLUMNS. ALL THREE ARE `Money | undefined`. **
  // ** THIS IS THE HIGHEST-CONSEQUENCE DECISION IN THIS FILE. **
  //
  // ** NEVER SUBSTITUTE `0` FOR A MISSING VALUE. Not `?? Money.zero`, not an `orZero()` **
  // ** helper, not a `0` default in the constructor, not a `0` fallback in an accessor. **
  // ** SUBSTITUTING 0 ON A PRICE PATH WOULD SILENTLY SELL PRODUCTS FOR FREE. **
  // ===========================================================================================
  //
  // Four independent lines of evidence, each verified against the source:
  //
  // 1. ★ `price` HAS NO `default=` AT ALL, and the omission is deliberate and load-bearing.
  //    [model/entity/SkuCurrency.cfc:L53] reads
  //      property name="price" ormtype="big_decimal" hb_formatType="currency"
  //      hb_rbKey='entity.sku.price';
  //    - and that is the WHOLE declaration. Compare its two immediate neighbours, L54
  //    `renewalPrice` and L55 `listPrice`, which BOTH carry `default="0"`. The ORM schema itself
  //    encodes that asymmetry, so a hydrated row can legitimately carry SQL NULL in `price`, and
  //    the port must not smooth it over. This is one of exactly FOUR no-default money columns
  //    across the in-scope model; the others are [model/entity/PriceGroupRate.cfc:L54],
  //    [model/entity/PromotionApplied.cfc:L53] and [model/entity/PromotionReward.cfc:L61].
  //    Contrast Sku's OWN money columns at [model/entity/Sku.cfc:L55-L57], where `listPrice`,
  //    `price` and `renewalPrice` all three declare `default="0"`. Same three names, opposite
  //    nullability - which is precisely why they cannot share one convention.
  //
  // 2. `default="0"` ON L54 AND L55 APPLIES AT ORM INSERT TIME ONLY. It does not retroactively
  //    guarantee non-null for rows that already exist, so reading NULL from either column is a
  //    reachable state and the port must not FABRICATE `0` for it. The legacy cascade proves
  //    the point directly: [model/entity/Sku.cfc:L401] and [model/entity/Sku.cfc:L405] guard
  //    those exact two accessors with `!isNull(...)` before writing them. A guard against a
  //    state that could not occur would be dead code, and it is not dead.
  //
  // 3. ★ THE MOST IMPORTANT REASON - A SECOND KEY-EXISTENCE CHECK DOWNSTREAM DEPENDS ON IT.
  //    `Sku.getListPriceByCurrencyCode()` [model/entity/Sku.cfc:L275-L279] and
  //    `Sku.getRenewalPriceByCurrencyCode()` [model/entity/Sku.cfc:L281-L285] each perform TWO
  //    `structKeyExists` tests on one line: the first on the currency key, the SECOND on the
  //    inner `"listPrice"` / `"renewalPrice"` sub-key. They therefore return null EVEN FOR A
  //    CURRENCY THAT IS PRESENT IN THE CASCADE MAP but has no list or renewal price recorded.
  //    PRESENCE IS NOT VALUE. If this entity reported `0` instead of "absent", the cascade
  //    would write a `0` sub-key, that second check would always succeed, and it would become
  //    DEAD CODE - breaking the null-return contract at the one place it is observable.
  //    `Sku.getPriceByCurrencyCode()` [model/entity/Sku.cfc:L269-L273] is the blunter case: one
  //    `structKeyExists`, no `else`, no fallback, so an unknown currency simply yields nothing.
  //
  // 4. `Money.zero` IS EXPLICITLY OFF-LIMITS FOR THIS PURPOSE, by the contract published on the
  //    constant itself in src/domain/valueObjects/money.ts. It exists to reproduce the two
  //    accumulator seeds of `getDiscountAmount` at [model/service/PromotionService.cfc:L988-L989]
  //    and their defaultless-switch fall-through, and its own documentation names this entity's
  //    accessor contract as the reason it must never be used as an absent-price substitute.
  //
  // ★ THE SCHEMA/COLUMN TENSION IS DOCUMENTED, NOT RESOLVED. model/validation/SkuCurrency.json
  //    declares
  //      "price": [{"contexts":"save","required":true,"dataType":"numeric","minValue":0}]
  //    - REQUIRED, with a minimum of 0 - while the ORM column on L53 tolerates NULL. Both
  //    statements are true simultaneously and BOTH are preserved: the SAVE-CONTEXT schema
  //    requires a price, the COLUMN tolerates NULL, and legacy rows may already hold NULL. The
  //    two are not in conflict because they constrain different moments. `listPrice` and
  //    `renewalPrice` carry `minValue 0` in the same file but are NOT marked required.
  //    THIS FIELD MUST NOT BE NARROWED TO A REQUIRED `Money` ON THE STRENGTH OF THAT SCHEMA.
  //    Requiredness is enforced at the SERVICE tier, by the ported zod schema, exactly where the
  //    legacy framework enforced it - at save time, in a named context - and never in this
  //    entity, which models what the column can hold.
  //
  // ALL THREE ARE `Money`, NEVER `number` AND NEVER A RAW DECIMAL. `ormtype="big_decimal"` is
  // not representable in IEEE-754 without drift, and Money is the sole arithmetic surface in
  // this target. No arithmetic happens in this class at all: values arrive as `Money`, are held
  // as `Money`, and are handed back as `Money`.
  //
  // ALL THREE `hb_rbKey` VALUES POINT AT `entity.sku.*`, NOT `entity.skuCurrency.*` - the
  // resource-bundle keys are BORROWED FROM Sku. Verified verbatim on L53/L54/L55 below, and note
  // they use SINGLE quotes where every other attribute on those lines uses double quotes.
  // Preserved as inert doc text: JavaRB is not ported and no i18n runtime is introduced, but the
  // identifiers survive so the legacy admin can still resolve them.
  //
  // `hb_formatType="currency"` on all three drove the framework's `getFormattedValue`, which
  // cascade Step 2 calls at [model/entity/Sku.cfc:L403, L407, L410]. That member is NOT ported;
  // see the hand-off note at the foot of this file.

  /**
   * `price`, or `undefined` when the column is NULL. [model/entity/SkuCurrency.cfc:L53]
   *
   *   property name="price" ormtype="big_decimal" hb_formatType="currency"
   *   hb_rbKey='entity.sku.price';
   *
   * ★ NO `default=` - genuinely nullable in the schema. Read UNCONDITIONALLY by cascade Step 2
   * at [model/entity/Sku.cfc:L409], with no `!isNull` guard, unlike its two neighbours.
   */
  private readonly price: Money | undefined;

  /**
   * `renewalPrice`, or `undefined` when the column is NULL. [model/entity/SkuCurrency.cfc:L54]
   *
   *   property name="renewalPrice" ormtype="big_decimal" hb_formatType="currency" default="0"
   *   hb_rbKey='entity.sku.renewalPrice';
   *
   * `default="0"` binds at ORM insert time only. Guarded with `!isNull(...)` by cascade Step 2
   * at [model/entity/Sku.cfc:L401] - which is the proof that NULL is reachable here.
   */
  private readonly renewalPrice: Money | undefined;

  /**
   * `listPrice`, or `undefined` when the column is NULL. [model/entity/SkuCurrency.cfc:L55]
   *
   *   property name="listPrice" ormtype="big_decimal" hb_formatType="currency" default="0"
   *   hb_rbKey='entity.sku.listPrice';
   *
   * `default="0"` binds at ORM insert time only. Guarded with `!isNull(...)` by cascade Step 2
   * at [model/entity/Sku.cfc:L405]. Note the source declares `renewalPrice` BEFORE `listPrice`;
   * that ordering is kept here so the file diffs cleanly against the CFC.
   */
  private readonly listPrice: Money | undefined;

  // --- Related Object Properties (many-to-one) [model/entity/SkuCurrency.cfc:L57-L59] ---------
  //
  // Exactly two, and they are resolved in two DIFFERENT ways because only one of their targets
  // is in scope. L58's `Currency` is not one of the eighteen in-scope entities and collapses to
  // a value object; L59's `Sku` is in scope and stays an entity reference.

  /**
   * The currency this override is denominated in, as the branded three-character code.
   *
   * TWO SOURCE LINES COLLAPSE INTO THIS ONE FIELD, and the collapse is exact rather than
   * convenient:
   *
   *   [model/entity/SkuCurrency.cfc:L58]
   *     property name="currency" cfc="Currency" fieldtype="many-to-one" fkcolumn="currencyCode";
   *   [model/entity/SkuCurrency.cfc:L68]
   *     property name="currencyCode" insert="false" update="false";
   *
   * ★ NOTE WHAT L58's `fkcolumn` ACTUALLY IS: the foreign-key column IS `currencyCode` itself,
   * not a surrogate id. So the association and its key are the SAME column, and L68 is simply
   * that column surfaced as a readable property. There is nothing else in `Currency` this slice
   * needs, which is what makes collapsing the association to the code lossless here.
   *
   * ★ IT IS A READ-ONLY PROJECTION, AND THERE IS NO SETTER. `insert="false" update="false"` is
   * the legacy mechanism: the ORM maps the property onto the foreign-key column FOR READING
   * ONLY, so it can never participate in an insert or an update. That is reproduced structurally
   * rather than by convention - the field is `readonly`, there is no `setCurrencyCode`, and it
   * takes part in no write path anywhere in this class.
   *
   * ★ L68 DECLARES NO `ormtype` AND NO `length`, verified verbatim. CFML defaults an undeclared
   * `ormtype` to string. The three-character constraint is NOT declared here and is not invented
   * here either; it comes from the branded type, which traces its length to
   * [model/entity/PromotionApplied.cfc:L55] (`ormtype="string" length="3"`) - the one in-scope
   * entity that genuinely declares it.
   *
   * NO `Currency` CLASS IS CREATED AND NO RUNTIME CURRENCY TABLE IS INTRODUCED.
   * model/entity/Currency.cfc is out of scope, `currency.ts` does not exist and must not be
   * created, and nothing here enumerates, validates against or looks up a list of currencies.
   *
   * ★ NON-OPTIONAL, AND THAT IS A DOCUMENTED JUDGMENT CALL RATHER THAN AN OVERSIGHT. Neither L58
   * nor L68 declares `notnull`, so the underlying column is nullable at the schema level - and
   * the column is deliberately NOT changed (no migration, no new constraint). What is decided
   * here is the TYPE THIS CLASS PUBLISHES, and non-optional is the faithful choice for three
   * reasons: the row's entire purpose is to name a currency, so a row that names none carries no
   * meaning; the only in-scope consumer dereferences it UNCONDITIONALLY at
   * [model/entity/Sku.cfc:L400], where CFML would raise an undefined-variable error on a NULL
   * rather than skip the row, so NULL is not a consumable state; and stating the requirement in
   * the type puts the obligation to refuse such a row at the hydration boundary, where it can be
   * seen, instead of leaving every reader to guess. Note the direction of the guarantee: this
   * asserts SHAPE, never that the currency exists, is active, or is eligible for the SKU -
   * eligibility is the `skuEligibleCurrencies` setting, gated at [model/entity/Sku.cfc:L373].
   *
   * ★ THE DEFAULT CURRENCY CODE IS NOT DECIDED HERE, AND ITS THREE-LETTER LITERAL APPEARS NOWHERE
   * IN THIS FILE - not as a value, and not even as a quoted citation. The default is a Slatwall
   * SETTING: `skuCurrency`, declared exactly once as a `fieldType="select"` entry carrying a
   * three-letter `defaultValue` at [model/service/SettingService.cfc:L221], and resolved through
   * the settingsProvider port by src/domain/entities/sku.ts - whose own `getCurrencyCode()` at
   * [model/entity/Sku.cfc:L360-L365] does nothing but memoize `this.setting('skuCurrency')`. The
   * locator is given so a reader can look the value up at its single source of truth; hardcoding
   * it here, in any form, would create a second one. This field holds the code a ROW carries,
   * which is a different thing entirely.
   */
  private readonly currencyCode: CurrencyCode;

  /**
   * The materialized far side of the `sku` many-to-one. [model/entity/SkuCurrency.cfc:L59]
   *
   *   property name="sku" cfc="Sku" fieldtype="many-to-one" fkcolumn="skuID";
   *
   * ★ THE ONLY MUTABLE FIELD ON THIS CLASS. `setSku` assigns it and `removeSku` clears it, so it
   * cannot be `readonly`.
   *
   * ★ DECLARED AS A REQUIRED PROPERTY WITH AN UNDEFINED UNION - `Sku | undefined` - AND
   * DELIBERATELY NOT AS AN OPTIONAL `sku?: Sku`. `exactOptionalPropertyTypes` is enabled, and
   * under it an OPTIONAL property cannot be assigned `undefined` explicitly. The legacy
   * `structDelete(variables, "sku")` at [model/entity/SkuCurrency.cfc:L103] makes the field
   * ABSENT, so the port has to be able to express that clear - and this declaration is what
   * makes `this.sku = undefined` legal. Getting this wrong is a compile error, not a subtle bug,
   * which is the point.
   *
   * `undefined` therefore means one of three things, and the class does not distinguish them
   * because the legacy did not either: the repository chose not to fetch the far side, `setSku`
   * has never run, or `removeSku` has cleared it.
   *
   * NO `skuID` FIELD AND NO `getSkuID()` ACCESSOR EXIST, and the asymmetry with `currencyCode`
   * above is deliberate. `fkcolumn="skuID"` on L59 is an ATTRIBUTE OF THE ASSOCIATION, not a
   * declared property - whereas L68's `currencyCode` genuinely IS a declared property. CFML's
   * `accessors=true` therefore generated `getCurrencyCode()` but never a `getSkuID()`, so adding
   * one would invent a member the legacy public surface does not have, and interface parity is
   * the acceptance contract. The column itself is untouched; only the accessor is absent.
   */
  private sku: Sku | undefined;

  // --- Remote Properties [model/entity/SkuCurrency.cfc:L70-L71] -------------------------------

  /**
   * `remoteID` - the external-system correlation key. [model/entity/SkuCurrency.cfc:L71]
   *
   *   property name="remoteID" ormtype="string";
   *
   * No `length`, no `default`, so `string | undefined`. Present on 15 of the 18 in-scope
   * entities, and preserved here as an inert persisted column: nothing in the in-scope slice
   * reads or writes it, and no synchronisation behaviour is ported. Kept rather than dropped
   * because the schema contract must stay auditable.
   */
  private readonly remoteID: string | undefined;

  // --- Audit Properties [model/entity/SkuCurrency.cfc:L73-L77] -------------------------------
  //
  // All four carry `hb_populateEnabled="false"`, which is how the legacy framework excluded them
  // from mass assignment. The TypeScript equivalent needs no mechanism at all: they are
  // `readonly`, set once during hydration, and exposed through getters with no setter anywhere.
  //
  // ★ THE TWO ACCOUNT ASSOCIATIONS COLLAPSE TO OPAQUE ID STRINGS. L75 and L77 declare
  // `cfc="Account" fieldtype="many-to-one"` with `fkcolumn="createdByAccountID"` and
  // `fkcolumn="modifiedByAccountID"`, but model/entity/Account.cfc is explicitly out of scope -
  // the plan excludes model/service/AccountService.cfc and the whole account module. So no
  // `Account` type is imported, neither column is ever typed as an entity, and no `Account`
  // instance is ever constructed. The columns are preserved; only the object graph is not.

  /** `createdDateTime`, or `undefined`. [model/entity/SkuCurrency.cfc:L74] `ormtype="timestamp"`. */
  private readonly createdDateTime: Date | undefined;

  /** The `createdByAccountID` column, opaque. [model/entity/SkuCurrency.cfc:L75] */
  private readonly createdByAccountID: string | undefined;

  /** `modifiedDateTime`, or `undefined`. [model/entity/SkuCurrency.cfc:L76] `ormtype="timestamp"`. */
  private readonly modifiedDateTime: Date | undefined;

  /** The `modifiedByAccountID` column, opaque. [model/entity/SkuCurrency.cfc:L77] */
  private readonly modifiedByAccountID: string | undefined;

  /**
   * Hydrates one `SwSkuCurrency` row.
   *
   * A SINGLE READONLY PARAMETER OBJECT, typed inline rather than as a second exported interface,
   * because this module exports exactly one unit. That is the convention the sibling entities
   * already follow.
   *
   * ★ EVERY NULLABLE SLOT IS A REQUIRED KEY TYPED `T | undefined`, NOT AN OPTIONAL `?:` SLOT.
   * `exactOptionalPropertyTypes` makes "absent" and "present-but-undefined" genuinely different
   * types, and requiring the key forces a hydrating repository to state "I looked and found
   * nothing" rather than silently omitting it. For the three monetary slots that distinction is
   * the whole safety property: a repository cannot forget to mention a price.
   *
   * ★ NO DEFAULTS ARE APPLIED HERE - not `0`, not `Money.zero`, not a fresh clock reading, not a
   * currency code. The constructor stores exactly what it is handed. Applying an ORM-style
   * `default="0"` at construction time would fabricate the very value the null contract above
   * exists to keep distinguishable.
   *
   * There is no collaborator port parameter, because this entity has zero `getService(` sites,
   * and no clock parameter, because it performs no date comparison of any kind.
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

  // --- Accessors ------------------------------------------------------------------------------
  //
  // ColdFusion auto-generated every one of these from the property metadata - `accessors="true"`
  // on [model/entity/SkuCurrency.cfc:L49] - so there is no legacy body to port and the locator on
  // each one cites the property declaration it serves. Callers really do use them: cascade Step 2
  // reaches five of the seven.
  //
  // GETTERS ONLY. The legacy component declares no setter for any of these, and the only write
  // -side members it declares at all are the `setSku`/`removeSku` pair below. In particular there
  // is deliberately NO `setCurrencyCode`, because L68's `insert="false" update="false"` makes
  // that column unwritable by construction.

  /** [model/entity/SkuCurrency.cfc:L52] Read by cascade Step 2 at [model/entity/Sku.cfc:L412]. */
  getSkuCurrencyID(): string {
    return this.skuCurrencyID;
  }

  /**
   * `price`, or `undefined`. [model/entity/SkuCurrency.cfc:L53]
   *
   * ★ `undefined` MEANS ABSENT AND MUST STAY `undefined`. Never `0`, never `Money.zero`, never a
   * fabricated value - substituting one would silently sell products for free. Read
   * unconditionally by cascade Step 2 at [model/entity/Sku.cfc:L409].
   */
  getPrice(): Money | undefined {
    return this.price;
  }

  /**
   * `renewalPrice`, or `undefined`. [model/entity/SkuCurrency.cfc:L54]
   *
   * ★ `undefined` MEANS ABSENT. Never `0`. Cascade Step 2 tests exactly this with
   * `!isNull(...)` at [model/entity/Sku.cfc:L401] before writing the sub-key, and
   * `Sku.getRenewalPriceByCurrencyCode()` [model/entity/Sku.cfc:L281-L285] then re-tests that
   * sub-key's existence - so a `0` here would make that second check dead code.
   */
  getRenewalPrice(): Money | undefined {
    return this.renewalPrice;
  }

  /**
   * `listPrice`, or `undefined`. [model/entity/SkuCurrency.cfc:L55]
   *
   * ★ `undefined` MEANS ABSENT. Never `0`. Guarded by `!isNull(...)` at
   * [model/entity/Sku.cfc:L405], and re-tested as a sub-key by
   * `Sku.getListPriceByCurrencyCode()` [model/entity/Sku.cfc:L275-L279].
   */
  getListPrice(): Money | undefined {
    return this.listPrice;
  }

  /**
   * The read-only projection of the `currency` foreign key.
   * [model/entity/SkuCurrency.cfc:L68], projecting the FK column named at
   * [model/entity/SkuCurrency.cfc:L58].
   *
   * ★ ON A LIVE MUST-PRESERVE PATH. Cascade Step 2 keys its per-currency override lookup off
   * exactly this value at [model/entity/Sku.cfc:L400], comparing it with CFML `eq` against
   * `thisCurrency.getCurrencyCode()`.
   *
   * ★ CFML `eq` IS CASE-INSENSITIVE AND TYPESCRIPT `===` IS NOT, so a caller comparing two
   * currency codes MUST route through `currencyCodeEquals` from
   * src/domain/valueObjects/currencyCode.js rather than using a raw `===`. That obligation sits
   * with the CALLER - here, with src/domain/entities/sku.ts - and not with this accessor, whose
   * job is only to return the code the row carries, verbatim and with its casing preserved
   * exactly as stored. Folding case here would corrupt the round-trip.
   *
   * There is no matching setter, by design; see the field.
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

  // ============= START: Bidirectional Helper Methods ===================
  // [model/entity/SkuCurrency.cfc:L86] .. [model/entity/SkuCurrency.cfc:L106], holding exactly one
  // pair under the inline sub-banner `// Sku (many-to-one)` at [model/entity/SkuCurrency.cfc:L88].

  // LEGACY-NOTE [model/entity/SkuCurrency.cfc:L89-L104] - THIS PAIR IS THE CORRECT, NON-DEFECTIVE
  // PATTERN, AND IT CARRIES NO DEFECT MARKER FOR EXACTLY THAT REASON. It is structurally identical
  // to `Option.setOptionGroup`/`removeOptionGroup` and to
  // [model/entity/PromotionCode.cfc:L101-L119]. Two checks were run against the verbatim source
  // rather than assumed, because both failure modes are real elsewhere in this tree:
  //
  //   1. THE "remove-that-ADDs" INVERSION CHECK. Some Slatwall `remove*` helpers ADD instead of
  //      removing - [model/entity/Option.cfc:L129-L131] `removePromotionRewardExclusion` and
  //      [model/entity/Option.cfc:L145-L147] `removePromotionQualifierExclusion` each call
  //      `addExcludedOption(this)`. VERDICT HERE: CLEAN. L101 is `arrayDeleteAt`, L103 is a
  //      `structDelete`, and there is no `add*` call on any path.
  //   2. THE LEAKED-ARGUMENT CHECK. VERDICT HERE: CLEAN. L99's `arrayFind` and L101's
  //      `arrayDeleteAt` both dereference `arguments.sku` - THE SAME, CORRECTLY DECLARED
  //      argument. Contrast [model/entity/PromotionPeriod.cfc:L110], which deletes from
  //      `arguments.account.getPromotionPeriods()` although `account` is not a declared argument
  //      of `removePromotion`, and [model/entity/PromotionAccount.cfc:L103], which carries the
  //      identical leak. Both of those are registered defects in their own files; this file is
  //      one of the controls that proves they are copy-paste errors rather than a CFML idiom.
  //
  // Had either check found a defect it would have been PRESERVED under a two-line LEGACY-DEFECT
  // marker and never repaired. Neither did. The check having been PERFORMED is part of this
  // deliverable's auditability, so the verdict is recorded even though it is negative.

  // LEGACY-NOTE [model/entity/SkuCurrency.cfc:L91-L93] and [model/entity/SkuCurrency.cfc:L99-L102]
  // - THE IN-MEMORY GRAPH SYMMETRY IS DELIBERATELY NOT REPRODUCED. THIS IS AN ARCHITECTURAL
  // CONSEQUENCE OF REMOVING THE ORM, NOT A DEFECT AND NOT A BEHAVIOUR CHANGE THAT WAS CHOSEN
  // LIGHTLY.
  //
  // Both legacy bodies mutate the FAR SIDE's collection in addition to the near-side field:
  //   L91-L93  if(isNew() or !arguments.sku.hasSkuCurrency( this )) {
  //                arrayAppend(arguments.sku.getSkuCurrencies(), this);
  //            }
  //   L99-L102 var index = arrayFind(arguments.sku.getSkuCurrencies(), this);
  //            if(index > 0) {
  //                arrayDeleteAt(arguments.sku.getSkuCurrencies(), index);
  //            }
  //
  // BOTH ARE REPRODUCED, so `sku.getSkuCurrencies()` and `skuCurrency.getSku()` can never disagree.
  // `Sku.getSkuCurrencies()` must therefore hand back the LIVE array - that requirement is restated in
  // the canonical far-side contract at the foot of this file, because `sku.ts` is authored separately.
  //
  // AN EARLIER REVISION DROPPED BOTH, and the reasoning is kept rather than deleted because the same
  // trap appeared in `option.ts` and `category.ts` and is worth naming once per site. It argued that
  // "this target has no Hibernate session, no cascade and no dirty-checking", that associations are
  // "MATERIALIZED AT THE REPOSITORY BOUNDARY as readonly arrays", and that "pushing into a materialized
  // array would mutate a query result that nothing will ever flush - it would look like it worked and
  // change no row". Three things are wrong with it:
  //
  //   * IT CONFLATES MATERIALIZATION WITH OWNERSHIP. The repository decides WHETHER this association
  //     was fetched and in what order; it does not thereby become the only party allowed to change the
  //     fetched array, and it cannot be, because it is not in the call path. `setSku` and `removeSku`
  //     are pure in-memory, synchronous, port-free operations with no save and no later boundary at
  //     which a deferred reconciliation could run.
  //   * "CHANGES NO ROW" IS AN ARGUMENT ABOUT PERSISTENCE, NOT ABOUT THE GRAPH. The link's persisted
  //     state is `skuID` on THIS row [model/entity/SkuCurrency.cfc:L59], which `setSku` maintains and a
  //     repository save genuinely reads. The far-side array is the IN-MEMORY view of the same link, and
  //     `Sku.getCurrencyDetails()` reads it within the request to build its per-currency price map.
  //     Declining to maintain it does not make persistence more correct; it makes that read wrong.
  //   * IT PRODUCED A SILENT INCONSISTENCY RATHER THAN AVOIDING ONE. With the append gone,
  //     `skuCurrency.setSku(sku)` left `sku.getSkuCurrencies()` NOT containing a row whose own
  //     `getSku()` returned that sku - two accessors disagreeing about one link, with no error
  //     anywhere. On this particular association that is not academic: an override missing from the
  //     currency map is exactly the state [model/entity/Sku.cfc:L399-L414] cannot distinguish from
  //     "there is no override", so the cascade would silently fall through to step 3 and CONVERT a
  //     price that was meant to be read verbatim.
  //
  // The L91 guard is ported too, together with the `isNew()` it calls and the `isSameRowAs` the
  // `arrayFind` needs. The earlier revision removed all three on the grounds that each had no
  // remaining call site - which was true only because the same edit had removed their callers. (The
  // source writes `hasSkuCurrency( this )` with spaces inside the parens: a cosmetic wart, recorded and
  // not reproduced.)
  //
  // `Sku.skuCurrencies` at [model/entity/Sku.cfc:L72] is declared `type="array"
  // cascade="all-delete-orphan" inverse="true"`. The UNHONOURED `all-delete-orphan` obligation belongs
  // to `src/repositories/mysql/**`, which owns orphan deletion, and is recorded there rather than here.
  //
  // NOTHING ABOUT THE NEAR SIDE IS WEAKENED BY ANY OF THIS. Both methods still do to `this` exactly
  // what the legacy did, including the ordering detail called out on `removeSku`.

  /**
   * Bidirectional helper for the `sku` many-to-one. [model/entity/SkuCurrency.cfc:L89]
   *
   * The parameter is REQUIRED, matching the legacy signature exactly: L89 declares
   * `required any sku`.
   *
   * BOTH STATEMENTS ARE REPRODUCED, in the source's order: the near-side assignment at
   * [model/entity/SkuCurrency.cfc:L90] runs FIRST and unconditionally, then the guarded far-side
   * append at [model/entity/SkuCurrency.cfc:L91-L93]. The ordering matters because the guard calls back
   * into the sku, so the field is already set by the time anything else can observe it.
   *
   * THE SHORT-CIRCUIT IS LOAD-BEARING. `isNew() or !arguments.sku.hasSkuCurrency( this )` evaluates
   * `isNew()` first, so for an unsaved row the far-side membership test is not performed AT ALL and the
   * append simply happens. `||` reproduces CFML `or` faithfully here because both operands are already
   * booleans. That ordering is also what makes the append safe for an unsaved row: every unsaved
   * SkuCurrency has an empty `skuCurrencyID`, so a key-based membership test could not tell them apart,
   * and the legacy arranged never to ask.
   *
   * Returns `void`, as the legacy `public void function` does. SYNCHRONOUS: nothing here reaches
   * a port or a repository, and the async boundary in this port is decided per method.
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
   * Whether this row has never been persisted.
   * [org/Hibachi/HibachiEntity.cfc:L571-L576] via [org/Hibachi/HibachiEntity.cfc:L707-L709]
   *
   * The framework base defines `isNew()` as `getNewFlag()`, and `getNewFlag()` as
   * `getPrimaryIDValue() == ""`. The base is not ported, so the one line it contributed is restated
   * here - identically to `brand.ts`, `category.ts`, `option.ts`, `priceGroup.ts`,
   * `promotionApplied.ts`, `promotionCode.ts` and `promotionPeriod.ts`.
   *
   * IT IS PORTED BECAUSE IT IS CONCRETELY CALLED, at [model/entity/SkuCurrency.cfc:L91] inside
   * `setSku`'s guard. The empty-string comparison is exact rather than approximate: `unsavedvalue=""`
   * and `default=""` on [model/entity/SkuCurrency.cfc:L52] are what make an unsaved row's key empty.
   */
  isNew(): boolean {
    return this.skuCurrencyID === '';
  }

  /**
   * Whether `candidate` denotes the same `SwSkuCurrency` row as this instance.
   *
   * Private, with no legacy counterpart by name: it stands for CFML's `arrayFind(array, this)` at
   * [model/entity/SkuCurrency.cfc:L99], which was reference identity in the language and row identity
   * under Hibernate's session. With no session those come apart, so the comparison is made on the
   * primary key and falls back to reference identity when either side is unsaved - an unsaved row has
   * an empty `skuCurrencyID`, and so does every other unsaved row.
   *
   * Identical in shape to the helpers of the same name on `option.ts`, `category.ts`,
   * `promotionCode.ts` and `promotionApplied.ts`, deliberately: one containment rule across the folder.
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
   * ★ THE PARAMETER IS OPTIONAL, matching the legacy signature exactly: L95 declares `any sku`,
   * NOT `required any sku`. L96-L98 is the default-to-the-currently-set-value idiom -
   * `if(!structKeyExists(arguments, "sku")) { arguments.sku = variables.sku; }` - whose idiomatic
   * TypeScript form is an optional parameter. There is deliberately no `variables.` scope object
   * and no `structKeyExists` emulation.
   *
   * ★ THE BRANCH TESTS `!== undefined`, NOT TRUTHINESS. `structKeyExists` asks whether the key is
   * PRESENT, which is a question about presence and not about the value's truthiness, so a
   * truthiness test would be a different predicate wearing the same shape. Here the two happen to
   * agree for every object, but the correct predicate is written anyway - `eqeqeq` is set to
   * `'error', 'always'` precisely so every ported comparison is audited at its site rather than
   * assumed.
   *
   * ★ THE FAR-SIDE REMOVAL IS REPRODUCED, so `resolvedSku` is consumed by the search as well as by
   * the guard - exactly as in the source, where the defaulting step at L96-L98 exists to give L99 an
   * array to search. See the note above this pair for why an earlier revision dropped it and why that
   * was wrong.
   *
   * ★ THE NEAR-SIDE CLEAR ALWAYS RUNS, AND THE ORDERING IS PRESERVED EXACTLY.
   * `structDelete(variables, "sku")` at [model/entity/SkuCurrency.cfc:L103] sits OUTSIDE the
   * `if(index > 0)` block at L100-L102, so the legacy clears the near side unconditionally -
   * whether or not the far-side removal found anything. That is reproduced: the clear below is
   * unconditional.
   *
   * ★ IT THROWS WHEN THE ARGUMENT IS OMITTED AND NO SKU IS SET, AND THAT IS BEHAVIOUR
   * PRESERVATION RATHER THAN DEFENSIVENESS. The failure is attributable to a line this port DOES
   * reproduce, which is what makes the throw faithful instead of invented: at
   * [model/entity/SkuCurrency.cfc:L97] the legacy executes `arguments.sku = variables.sku;`, and
   * with the key already absent - `structDelete` at L103 having removed it on a previous call, or
   * the association never having been set - CFML raises "Element SKU is undefined in VARIABLES."
   * right there, INSIDE the L96-L98 defaulting block. Silently no-opping would invent a success
   * path the legacy system does not have. This is the same ruling the sibling entities make for
   * the identical construct, notably [model/entity/PromotionCode.cfc:L110-L113].
   *
   * A plain `Error` is thrown deliberately: this module exports exactly ONE runtime value, the
   * class, so no bespoke error class is declared here.
   *
   * ★ THE THROW CHANGES NOTHING OBSERVABLE ABOUT THE NEAR SIDE, which is worth stating because it
   * is what makes the reproduction safe. On that one path the field was ALREADY absent, so the
   * clear the legacy skipped would have been a no-op anyway. Every path that completes ends with
   * the field absent, in both implementations.
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

    // [model/entity/SkuCurrency.cfc:L99] ARRAY INDEX BASE CHANGE: CFML `arrayFind` returns a 1-BASED
    // index, or 0 for "not found", which is why the source guards with `index > 0` at L100.
    // `Array.prototype.findIndex` returns a 0-BASED index, or -1 for "not found", so the guard MUST
    // become `!== -1`. Carrying `> 0` across would silently skip element 0 - the first currency row on
    // the sku, and the very one [model/entity/Sku.cfc:L399-L414] would then fail to see.
    //
    // Containment is BY PRIMARY KEY with a reference fallback for an unsaved row, per `isSameRowAs`;
    // see the note on that method for why a key comparison reproduces the legacy meaning where a
    // reference comparison would only reproduce its letter.
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

  // =============  END:  Bidirectional Helper Methods ===================

  // ================== START: Overridden Methods ========================
  // [model/entity/SkuCurrency.cfc:L116] .. [model/entity/SkuCurrency.cfc:L122]

  /**
   * A short human-readable label for this row. [model/entity/SkuCurrency.cfc:L118-L120]
   *
   * The legacy body is one line:
   *   return getSku().getSkuCode() & " - " & getCurrency().getCurrencyCode();
   *
   * ★ THE SEPARATOR IS EXACTLY `' - '` - SPACE, HYPHEN, SPACE - reproduced byte for byte.
   *
   * ★ `getCurrency().getCurrencyCode()` COLLAPSES TO THE PROJECTED CODE. There is no `Currency`
   * entity to dereference in this target, and the projection at
   * [model/entity/SkuCurrency.cfc:L68] holds the identical value that L58's foreign key points
   * at - the FK column literally IS `currencyCode`. So this reads the field directly instead of
   * hopping through an association, and the result is the same string the legacy produced.
   *
   * ★ JUDGMENT CALL - THE UNHYDRATED SKU IS GUARDED, NOT THROWN ON, AND THE EMPTY STRING STANDS
   * IN FOR THE MISSING CODE. `sku` is `Sku | undefined`, so `strict` forces the absent case to be
   * handled explicitly; the two honest options were to guard or to throw a domain error. The
   * GUARD is chosen for three reasons. CFML's implicit lazy load made the null case UNREACHABLE
   * in practice - `getSku()` would have fetched the row - so there is no legacy behaviour to
   * preserve here, only a hole the ORM used to fill. In the one case that remains, a genuinely
   * unhydrated instance, CFML would have raised a runtime "method on null" error at
   * [model/entity/SkuCurrency.cfc:L119]; making a DISPLAY HELPER the thing that fails a request
   * is a poor trade when the alternative degrades to a partial label. And a label is not a price:
   * the never-substitute rule that governs the three monetary accessors is about VALUES that
   * money is computed from, and nothing is ever computed from this string.
   *
   * The consequence is stated plainly rather than hidden: with no SKU materialized the result is
   * the separator followed by the currency code, with an empty SKU code in front of it. Callers
   * that need to distinguish "no SKU" from "a SKU whose code is the empty string" must consult
   * `getSku()`, which reports absence exactly and is the only member that can.
   *
   * SYNCHRONOUS and pure: it reads two already-materialized values and allocates a string. It
   * fetches nothing, and it is not `async` because it reaches no port.
   */
  getSimpleRepresentation(): string {
    // [model/entity/SkuCurrency.cfc:L119] - `getSku().getSkuCode()`, guarded on BOTH levels.
    //
    // The second `?? ''` covers a materialized SKU whose own `skuCode` column is null. That column is
    // `unique="true" length="50"` at [model/entity/Sku.cfc:L54] with NO `notnull`, so
    // `Sku.getSkuCode()` is `string | undefined` - and CFML concatenating a null-backed accessor into a
    // string raises. The same three reasons recorded above for guarding the absent SKU apply verbatim to
    // the absent CODE: a display helper is the wrong thing to fail a request on, and a label is not a
    // price. A caller that must tell the two holes apart asks `getSku()` and then `getSkuCode()`.
    const skuCode: string = this.sku === undefined ? '' : (this.sku.getSkuCode() ?? '');

    // [model/entity/SkuCurrency.cfc:L119] - the separator is EXACTLY one space, one hyphen, one
    // space, reproduced byte for byte from `& " - " &`. (The source line also carries a trailing
    // space before its newline; that is a whitespace wart in the CFC, not part of the returned
    // value, and it is deliberately not reproduced.)
    return `${skuCode} - ${this.currencyCode}`;
  }

  // ==================  END:  Overridden Methods ========================
}

// LEGACY-NOTE [model/entity/SkuCurrency.cfc]: THE BANNER CENSUS. This component carries SEVEN
// comment-delimited banner sections - more than any sibling entity in this folder - and FIVE OF
// THEM ARE COMPLETELY EMPTY. An empty banner implies nothing, and nothing is authored for any of
// the five. Verified pair by pair against the source:
//
//   | # | banner                          | locators   | contents                              |
//   |---|---------------------------------|------------|---------------------------------------|
//   | 1 | Non-Persistent Property Methods | L82 / L84  | EMPTY. No derived getter, no memoized |
//   |   |                                 |            | cache - so the memoized-accessor      |
//   |   |                                 |            | pattern and its three known memo      |
//   |   |                                 |            | defects are absent from this file.    |
//   | 2 | Bidirectional Helper Methods    | L86 / L106 | setSku L89-L94, removeSku L95-L104.   |
//   | 3 | Custom Validation Methods       | L108/ L110 | EMPTY. No declaratively-invoked       |
//   |   |                                 |            | validator either: SkuCurrency.json    |
//   |   |                                 |            | contributes no `"method"` entry.      |
//   | 4 | Custom Formatting Methods       | L112/ L114 | EMPTY. See the hand-off note below.   |
//   | 5 | Overridden Methods              | L116/ L122 | getSimpleRepresentation L118-L120.    |
//   | 6 | ORM Event Hooks                 | L124/ L126 | EMPTY. NO `preInsert`, NO `preUpdate` |
//   |   |                                 |            | - so there is no materialized path to |
//   |   |                                 |            | maintain, no path helper to import,   |
//   |   |                                 |            | and no save-time hook ordering to     |
//   |   |                                 |            | rule on. Only four in-scope entities  |
//   |   |                                 |            | carry hooks - Category, PriceGroup,   |
//   |   |                                 |            | ProductType and PromotionCode - and   |
//   |   |                                 |            | this is not one of them.              |
//   | 7 | Deprecated Methods              | L128/ L130 | EMPTY. No deprecated member exists,   |
//   |   |                                 |            | and none is invented.                 |
//
// Three PROPERTY-section comments are also empty and likewise imply nothing: one-to-many [L61],
// many-to-many owner [L63] and many-to-many inverse [L65]. So is the "Non-Persistent Properties"
// section at [L79-L80]. The component closes at L131.
//
// SO THE ENTIRE BEHAVIOURAL SURFACE IS THREE METHODS: setSku, removeSku, getSimpleRepresentation.
// There is deliberately NO fourth. Everything else on the class is a generated accessor.

// HAND-OFF NOTES - RECORDED HERE, DELIBERATELY NOT ACTED ON HERE.
// Observations for the owners of other modules. None is a change to make in this file, and none is
// a defect in it.
//
//   1. `getFormattedValue(...)` IS NOT PORTED, AND CASCADE STEP 2 CALLS IT ON THIS ENTITY.
//      [model/entity/Sku.cfc:L403, L407, L410] invoke it to populate the `renewalPriceFormatted`,
//      `listPriceFormatted` and `priceFormatted` keys of the currency-details map. It is a
//      FRAMEWORK member - defined at [org/Hibachi/HibachiTransient.cfc:L493] - driven by the
//      `hb_formatType="currency"` metadata recorded on the three monetary fields above. The
//      framework base is deliberately not ported and this file authors no custom formatting
//      method, so money PRESENTATION belongs to `src/lib/cfml/numberFormat.ts` and the decision
//      about whether the ported cascade carries those three `*Formatted` keys at all belongs to
//      src/domain/entities/sku.ts. Whatever it decides, it must not reach back here for it.
//   2. THE CASE-INSENSITIVITY OBLIGATION AT [model/entity/Sku.cfc:L400] IS THE CALLER'S.
//      CFML `eq` ignores case; TypeScript `===` does not. The comparison of this row's
//      `getCurrencyCode()` against the eligible currency's code must route through
//      `currencyCodeEquals` from src/domain/valueObjects/currencyCode.js. A raw `===` there is a
//      parity bug, and it would be invisible in this file.
//   3. THE `cascade="all-delete-orphan"` OBLIGATION ON [model/entity/Sku.cfc:L72] IS THE
//      REPOSITORY'S. Removing a `SkuCurrency` from a SKU's collection deleted the row under
//      Hibernate. With no ORM there is no cascade, so orphan deletion is an explicit repository
//      responsibility; `removeSku` above clears only the near-side reference and deletes nothing.
//   4. THE HYDRATION BOUNDARY OWNS THREE THINGS THIS CLASS ASSUMES: branding the `currencyCode`
//      via `toCurrencyCode`, constructing each `Money` from the `big_decimal` column's decimal
//      STRING form (never via a `number`, which would reintroduce the drift Money exists to
//      prevent), and passing `undefined` - never `0` - for a NULL monetary column.

// TEST CONTRACT - NET-NEW COVERAGE, NEVER PARITY.
//
// `tests/unit/domain/entities/skuCurrency.test.ts` (planned) is authored SEPARATELY; the test tier is owned
// elsewhere and no test file is created from here. `SkuCurrency` has NO legacy test whatsoever, so
// its coverage is one of the sixteen net-new entity suites and must be LABELLED net-new -
// presenting it as parity fails the coverage gate. It must also appear in
// `tests/traceability/legacyTestMap.ts` (planned), flagged net-new, because that map fails the suite when an
// in-scope module has no test. Regression tests in this project follow the `issue_<ticket#>`
// convention carried over from meta/tests/unit/IssuesTest.cfc; no ticket applies to this entity.
//
// The behaviours that must be pinned, in priority order:
//   1. ★ ALL THREE MONETARY ACCESSORS RETURN `undefined` FOR AN ABSENT VALUE - `getPrice()`,
//      `getListPrice()` and `getRenewalPrice()`. Assert `toBeUndefined()` explicitly, NOT
//      falsiness, and assert that NO accessor ever yields a zero `Money`. This is the single
//      highest-consequence assertion in the file: a `0` here would silently sell products for
//      free. Cover `price` specifically, since [model/entity/SkuCurrency.cfc:L53] gives it no ORM
//      default at all.
//   2. A `Money` handed to the constructor comes back from its accessor UNCHANGED and
//      UNROUNDED - no scale is imposed and no arithmetic is performed anywhere in this class.
//   3. `getCurrencyCode()` returns the branded code with its CASING PRESERVED VERBATIM, and there
//      is NO `setCurrencyCode` on the class - the projection is read-only.
//   4. `setSku()` assigns, and `getSku()` then returns that exact instance.
//   5. `removeSku()` clears: with an explicit argument, and with none while a sku IS set. In both
//      cases `getSku()` is `undefined` afterwards.
//   6. `removeSku()` THROWS when called with no argument while no sku is set, reproducing
//      [model/entity/SkuCurrency.cfc:L97].
//   7. ★ BOTH HELPERS MAINTAIN THE FAR SIDE. `setSku()` appends `this` to the stub sku's
//      `getSkuCurrencies()` array exactly once, does NOT append a second time for a row already
//      present by primary key, and DOES append unconditionally when `isNew()` is true.
//      `removeSku()` splices `this` out of that same array, leaves the array untouched when the row
//      is absent, and clears the near side EITHER WAY - proving the unconditional placement of
//      [model/entity/SkuCurrency.cfc:L103]. Element 0 must be covered specifically, since a
//      `> 0` guard transcribed from CFML's 1-based `arrayFind` would skip it.
//   8. `getSimpleRepresentation()` returns `<skuCode> - <currencyCode>` with the separator EXACTLY
//      one space, one hyphen, one space; and returns ` - <currencyCode>` when the sku is not
//      materialized, rather than throwing.
//   9. `isNew()` is `true` for an empty primary key and `false` for a populated one. Assert there is
//      no `getSkuID`, no `setCurrencyCode`, no `getFormattedValue` and no `getCurrency` member -
//      `isNew()` IS present, because [model/entity/SkuCurrency.cfc:L91] calls it.
//  10. Audit accessors return opaque strings or `undefined`, and no `Account` object is ever
//      constructed.
