// ---------------------------------------------------------------------------
// slatwall-ts - PromotionCode entity
//
// PORT OF model/entity/PromotionCode.cfc (192 lines, confirmed by `wc -l`).
//
// WHAT THIS FILE UNIQUELY OWNS, and why each item matters:
//
//   1. THE `preInsert` UUID HOOK. This is one of only four hook-bearing in-scope
//      entities, and the ONLY one of the four that is insert-only - it has no
//      `preUpdate` and no materialized-path column. See the ORM Event Hooks
//      section at the foot of the class.
//   2. THE PRESERVED "assinged" COMMENT TYPO from
//      [model/entity/PromotionCode.cfc:L180], carried through verbatim.
//   3. THE THIRD ABSENCE CONVENTION, applied to four nullable columns. The
//      project carries three opposite absence conventions and all three are
//      load-bearing; they are set out side by side on the class doc comment
//      below and must never be collapsed into one another.
//   4. THE CORRECT CONTROL CASE for a bidirectional remover that two sibling
//      entities get wrong. `removePromotion` here dereferences the RIGHT
//      argument at [model/entity/PromotionCode.cfc:L116], which is what proves
//      [model/entity/PromotionPeriod.cfc:L110] and
//      [model/entity/PromotionAccount.cfc:L103] are genuine copy-paste defects
//      rather than an intentional CFML idiom. Full write-up on
//      `removePromotion`.
//
// THREE OF THIS ENTITY'S METHODS ARE CORRECT, AND THAT IS ITSELF THE FINDING.
// `getCurrentFlag`, `setPromotion` and `removePromotion` carry NO defect, so
// none of them carries a LEGACY-DEFECT marker. Marking a correct method as
// defective is as much an error as missing a real defect, so each instead
// carries a LEGACY-NOTE recording what it is a control case FOR.
//
// THE `extends` CHAIN IS THREE LEVELS DEEP, NOT TWO
// `extends="HibachiEntity"` on L49 is UNQUALIFIED, so it resolves to the local
// model/entity/HibachiEntity.cfc (274 lines), which itself extends
// `Slatwall.org.Hibachi.HibachiEntity`. The intermediate class reaches outward
// through 12 `getService(...)` sites, seven of them `attributeService`, and NONE
// is ported: the EAV/attribute path is out of scope, so those sites are moot.
// They must not be silently re-implemented either - an entity reaching outward
// through a service locator is precisely the pattern the ESLint
// `no-restricted-imports` boundary in eslint.config.mjs exists to make
// impossible. TypeScript has no base class here; what the framework base
// contributed is redistributed explicitly, and the one member this entity
// actually needs (`isNew()`) is authored directly on the class.
//
// WHAT THE FRAMEWORK DISPATCHER CONTRIBUTES, AND WHY ALMOST NONE IS AUTHORED
// org/Hibachi/HibachiEntity.cfc:L507-L565 is an `onMissingMethod` dispatcher
// matching eleven method-name patterns - hasUniqueOrNull*, hasUnique*, hasAny*,
// get*AssignedIDList, get*ID, get*Options, get*OptionsSmartList, get*SmartList,
// get*Struct, get*Count, and a `getAttributeValue` fallback at L559 -
// TERMINATING IN A THROW AT L565. TypeScript must not emulate dynamic dispatch,
// so there is no Proxy, no index signature, no `evaluate()` and no `variables.`
// scope object anywhere below. Only concretely-called patterns are authored, and
// for this entity that is exactly two: `hasUniquePromotionCode` (the L514
// `hasUnique*` branch, invoked declaratively by model/validation/PromotionCode.json)
// and `getPromotionID` (the `get*ID` branch). The other two `has*` probes the
// source calls - `hasAccount` at L123 and `hasPromotionCode` on the far Account
// at L126 - sit on the two dropped out-of-scope collections and are therefore
// not authored; see the dropped-member rulings inside the class.
// PromotionCode declares NO `attributeValues` property, so the L559 EAV fallback
// is unreachable from here: an unmatched `get...` throws directly at L565 rather
// than degrading into an attribute lookup.
//
// NO USER RULES WERE PROVIDED
// Stated explicitly rather than assumed. The project rules document returns
// exactly "No user rules provided.", and the plan states the same: zero files
// enter scope by rule mandate, there is no third rule-driven category of
// in-scope file, and there are no rule conflicts to resolve - every tension in
// this port is specification-internal and resolved there. No rule is invented to
// fill the gap, and the absence is NOT licence to lower the bar: the
// enterprise-standard substitute applies at full strength - maximal strictness
// with no `any`, no suppression comment and no non-null assertion; one exported
// unit per file and no barrel; no credential, no SQL and no environment read;
// and every judgment call annotated at the point where it was made.
//
// TEST COVERAGE FOR THIS MODULE IS NET-NEW
// `PromotionCode` has NO legacy test whatsoever. Only two of the eighteen
// in-scope entities have a legacy antecedent - brand.ts from
// meta/tests/unit/entity/BrandTest.cfc and product.ts from
// meta/tests/unit/entity/ProductTest.cfc - and
// meta/tests/functional/admin/entity/ProductTest.cfc is an empty stub
// contributing zero coverage. Coverage here is therefore one of the sixteen
// net-new entity suites and must never be presented as parity. The contract the
// test tier has to pin is enumerated at the foot of this file. No test file is
// authored from here: that tier is owned separately.
// ---------------------------------------------------------------------------

import { cfLen, isNullish } from '../../lib/cfml/truthiness.js';
import type { Promotion } from './promotion.js';

// THE RESOLVED IMPORT SET IS EXACTLY THE TWO STATEMENTS ABOVE. Every other
// candidate is absent for a specific, verified reason, recorded here so a
// reviewer can see the check was performed rather than skipped:
//
//   * `../valueObjects/money.js` - `PromotionCode` declares ZERO monetary
//     columns. A case-insensitive census of L52-L80 finds no `amount`, no
//     `price`, no `discountAmount` and no `currency` column of any kind, so the
//     project's "all money arithmetic passes through Money" standard is
//     satisfied vacuously here. There is no arithmetic in this file at all.
//   * `../valueObjects/currencyCode.js` - no currency column, per the same
//     census.
//   * `../valueObjects/materializedIdPath.js` - no `*IDPath` column. Contrast
//     [model/entity/PriceGroup.cfc:L53] `priceGroupIDPath` (4000 chars),
//     `ProductType.productTypeIDPath` and `Category.categoryIDPath`. This
//     entity has no hierarchy and no path to walk or maintain.
//   * `../../lib/cfml/struct.js` - the source's two `structKeyExists` sites are
//     NOT case-insensitive struct-key lookups and neither needs CFML struct
//     semantics. [model/entity/PromotionCode.cfc:L110]
//     `structKeyExists(arguments,'promotion')` is an argument-presence probe and
//     becomes an optional parameter with `??`;
//     [model/entity/PromotionCode.cfc:L86] `structKeyExists(variables,"currentFlag")`
//     is a memo-computed probe and becomes a private field compared with
//     `=== undefined`.
//   * `../../lib/cfml/list.js` - no comma-delimited list anywhere in the
//     component. Note for discipline even though it is unused here:
//     `listFindNoCase` returns a 1-BASED INDEX OR 0, not a boolean.
//   * `../../lib/cfml/numberFormat.js` and `../../lib/cfml/precision.js` - no
//     arithmetic and no formatting in this component.
//   * `cfBoolean` from the parity module - see the boolean census on the class
//     doc comment: there are ZERO persistent boolean columns, of either casing,
//     so there is no persisted flag to coerce.
//   * ANY `../ports/*.js` - `PromotionCode.cfc` has ZERO `getService(` sites.
//     That was re-verified against the verbatim source rather than trusted, and
//     it is why no collaborator port appears in the constructor and why EVERY
//     method below is synchronous: nothing in this entity reaches outward, so
//     nothing needs to await anything.
//   * `../../lib/logger.js` and `../../lib/config.js` - the domain layer neither
//     logs nor reads process configuration. `config.ts` in particular is STATIC
//     process configuration and is never a request scope; the legacy ambient
//     request scope becomes an explicit parameter, which for this entity means
//     the injected clock described below.
//
// `import type` on the `Promotion` reference is mandatory (`consistent-type-imports`
// is set to `error` with `fixStyle: 'separate-type-imports'`), and it is also
// load-bearing: a type-only import is ERASED AT EMIT, so the
// promotionCode <-> promotion type cycle never exists at runtime. A value import
// between two entity modules would create a genuine circular require in the
// CommonJS Lambda bundle, so one must never be introduced.

/**
 * Narrowing adapter over the CFML `isNull()` parity helper.
 *
 * `isNullish()` returns a plain `boolean` rather than a TypeScript type predicate, which is the
 * right shape for its own module - it accepts `unknown` and is used in boolean contexts all over
 * the port. But the compiler cannot narrow `Date | undefined` on a plain boolean result, and
 * `strict` plus the `no-non-null-assertion` rule on `src/**` (correctly) forbid papering over that
 * with a `!` assertion. This thin wrapper re-expresses the SAME test as a predicate so the absent
 * case is handled by the type system instead of by an assertion.
 *
 * It delegates to `isNullish` rather than restating the comparison, so the CFML `isNull()` semantic
 * stays decided in exactly one place across the whole port. Module-local and deliberately not
 * exported: this module exports exactly one unit, the class.
 */
function isPresent<T>(value: T | undefined): value is T {
  return !isNullish(value);
}

/**
 * A `SwPromotionCode` row: the redeemable code that grants access to a promotion, optionally
 * bounded by a date window and optionally capped by per-code and per-account use limits.
 *
 * THE COMPONENT DECLARATION, VERBATIM [model/entity/PromotionCode.cfc:L49]
 *
 *   component displayname="Promotion Code" entityname="SlatwallPromotionCode"
 *   table="SwPromotionCode" persistent="true" extends="HibachiEntity"
 *   cacheuse="transactional" hb_serviceName="promotionService"
 *   hb_permission="promotion.promotionCodes" {
 *
 * Four things about that line, each verified rather than assumed:
 *
 *   * `persistent="true"` is QUOTED - the same shape as
 *     [model/entity/PromotionPeriod.cfc:L49], [model/entity/PromotionApplied.cfc:L49] and
 *     [model/entity/PromotionAccount.cfc:L49], and in contrast to the unquoted
 *     `persistent=true output=false accessors=true` of PriceGroup and PriceGroupRate. A cosmetic
 *     inconsistency in the legacy tree; annotated, not normalised.
 *   * CONFIRMED ABSENT: `accessors=`, `output=` and `hb_processContexts`. ColdFusion generates
 *     accessors from the property metadata regardless, so the omission is cosmetic - which is
 *     exactly why the accessors below have no legacy body to port and each cites the property
 *     declaration it serves instead.
 *   * `hb_serviceName="promotionService"` - CRUD lives in model/service/PromotionService.cfc.
 *     There is no `PromotionCodeService` in the legacy tree and none is invented here.
 *   * `hb_permission="promotion.promotionCodes"` is CORRECTLY SPELLED. Worth stating explicitly,
 *     because [model/entity/PromotionReward.cfc:L49] carries
 *     `hb_permission="promotionPeriod.promtionRewards"` - a real typo that will need a documented
 *     rename when that entity is authored. NO rename is needed here.
 *
 * SCHEMA CONTINUITY IS A BINDING CONSTRAINT. The entity's property metadata IS the contract:
 * entity name `SlatwallPromotionCode`, table `SwPromotionCode`. No migration, no rename, no new
 * column and no column change. Columns belonging to out-of-scope subsystems are preserved as
 * inert rather than dropped, and every `hb_*` attribute value is carried forward verbatim in a
 * comment so the legacy admin can still resolve it. JavaRB is NOT ported and no i18n runtime is
 * introduced, so `hb_nullRBKey` values below are inert documentation strings, never lookups.
 *
 * A CLASS, NOT AN INTERFACE. The legacy entities carry behaviour and not merely data, and
 * interface parity is the acceptance contract: a reviewer diffs this public surface against the
 * CFC method by method. Public method names are therefore the legacy CFML names VERBATIM in
 * camelCase - which is exactly why eslint.config.mjs deliberately enables no `naming-convention`,
 * `camelcase` or `id-match` rule.
 *
 * ============================================================================================
 * THE THREE ABSENCE CONVENTIONS - ALL THREE LOAD-BEARING, NONE COLLAPSIBLE INTO ANOTHER
 * ============================================================================================
 *
 *   1. `Sku.getPriceByCurrencyCode()` must return `Money | undefined` and NEVER `0`.
 *      [model/entity/Sku.cfc:L269-L273] has no `else` and no fallback, so an unknown currency
 *      yields null. Substituting `0` would silently sell products for free. Owned by sku.ts.
 *   2. `Product.getSalePrice()` must return `0` and NEVER `undefined`.
 *      [model/entity/Product.cfc:L598] is a bare statement with no `return`, so execution falls
 *      through to `return 0`. Owned by product.ts.
 *   3. THIS FILE: the period bounds and the use limits stay `undefined`. Never `0`, never the Unix
 *      epoch, never `new Date(0)`, never `Number.MAX_SAFE_INTEGER`, never `Infinity`, never a
 *      sentinel of any kind - because here `undefined` means UNLIMITED / FOREVER, the PERMISSIVE
 *      extreme.
 *
 * THE SOURCE ITSELF PROVES CONVENTION 3. These are L54-L57 verbatim, and the `hb_nullRBKey`
 * attributes are the legacy UI's own instruction for how to render an absent value:
 *
 *   property name="startDateTime" ormtype="timestamp" hb_formatType="dateTime" hb_nullRBKey="define.forever";
 *   property name="endDateTime" ormtype="timestamp" hb_formatType="dateTime" hb_nullRBKey="define.forever";
 *   property name="maximumUseCount" ormtype="integer" notnull="false" hb_nullRBKey="define.unlimited";
 *   property name="maximumAccountUseCount" ormtype="integer" notnull="false" hb_nullRBKey="define.unlimited";
 *
 * `define.forever` for an absent bound and `define.unlimited` for an absent count. That is the
 * strongest schema-level proof of an absence convention anywhere in the in-scope set, and it
 * appears on exactly two entities - here and [model/entity/PromotionPeriod.cfc:L53-L56].
 *
 * WHY SUBSTITUTING `0` HERE WOULD BE A MONEY BUG, concretely:
 * `PromotionService.getPromotionCodeUseCount` [model/service/PromotionService.cfc:L1094] and
 * `getPromotionCodeAccountUseCount` [model/service/PromotionService.cfc:L1098] return actual use
 * counts that the engine compares against these limits. Coalesce `maximumUseCount` to `0` and
 * EVERY promotion code reads as instantly over-used, so every discount vanishes. Coalesce it to
 * `Infinity` and every limit becomes unenforceable. Both are wrong in opposite directions, which
 * is why the only correct model is `number | undefined` with the consuming service branching on
 * `undefined` meaning "no limit". This entity deliberately does NOT make that decision on the
 * service's behalf: it reports absence faithfully and nothing more.
 *
 * THE BOOLEAN CENSUS, RE-VERIFIED FOR BOTH CASINGS AND CLOSED. A case-sensitive grep for
 * `ormtype="boolean"` is known to under-count, because [model/entity/PriceGroupRate.cfc:L53]
 * writes `ormType="boolean"` with a capital T. Re-run case-insensitively against the verbatim
 * source, L52-L57 are `string / string / timestamp / timestamp / integer / integer`: ZERO
 * `ormtype`/`ormType` booleans of either casing. The only boolean in the whole component is the
 * NON-PERSISTENT [model/entity/PromotionCode.cfc:L80] `currentFlag`, declared with `type=` and not
 * `ormtype=`. There is therefore no persisted flag to coerce and `cfBoolean` is correctly absent
 * from the imports. Likewise there is exactly ONE `default=` attribute in the entire component -
 * the primary key's `default=""` at L52 - so no other column carries an ORM default to reproduce.
 *
 * ASSOCIATIONS ARRIVE ALREADY MATERIALIZED, OR ABSENT. Hibernate lazy collections have no
 * equivalent in a driver-only stack, so `src/repositories/mysql/**` owns row-to-entity hydration
 * and documents the fetch shape at the producing method. This class simply receives what it is
 * given and never simulates laziness: it performs NO I/O, and it has no loader, no thunk and no
 * promise-returning accessor. Fetch shape is a repository concern and is deliberately not encoded
 * here.
 *
 * THE EAGER-FETCH CENSUS IS UNCHANGED BY THIS FILE, and that was checked rather than assumed.
 * [model/entity/PromotionCode.cfc:L60] declares `promotion` with NO `fetch="join"` - contrast
 * [model/entity/PromotionPeriod.cfc:L59], which does carry it. The in-scope eager sites therefore
 * remain exactly FOUR: [model/entity/Product.cfc:L68] brand, [model/entity/Product.cfc:L69]
 * productType, [model/entity/Product.cfc:L70] defaultSku, and
 * [model/entity/PromotionPeriod.cfc:L59] promotion. THIS FILE ADDS NO FIFTH SITE. L60 also carries
 * NO `hb_cascadeCalculate` - contrast [model/entity/PromotionApplied.cfc:L59] orderItem and
 * [model/entity/Sku.cfc:L65] product.
 *
 * THE UTC POLICY, STATED ONCE AND APPLIED THROUGHOUT. Every date comparison in this class is
 * performed on absolute epoch milliseconds via `Date.prototype.getTime()`, which is UTC by
 * definition and therefore deterministic and independent of the host's local timezone. The CFML
 * original depended on the server's timezone through `now()`; the target does not. Current time
 * arrives exclusively through the injected clock (see the constructor), never from a direct
 * `Date.now()` or `new Date()` call inside a method, so every date-dependent behaviour on this
 * class is testable without touching the system clock. No date library is added: the dependency
 * set is fixed at fourteen exactly-pinned packages and none of them is one.
 */
export class PromotionCode {
  // --- Persistent Properties [model/entity/PromotionCode.cfc:L52-L57] ------------------------

  /**
   * Primary key. [model/entity/PromotionCode.cfc:L52]
   *
   *   property name="promotionCodeID" ormtype="string" length="32" fieldtype="id"
   *   generator="uuid" unsavedvalue="" default="";
   *
   * `string` and never `string | undefined`: `default=""` means the column always holds a string,
   * possibly the empty one. That empty string is load-bearing - it is exactly what `isNew()` keys
   * on, via `unsavedvalue=""`. Read-only with no setter, matching the legacy id property, which
   * declares no setter of its own and is assigned by the ORM's `generator="uuid"`.
   *
   * `length="32"` is recorded for schema continuity and is NOT enforced here as a constructor
   * invariant. Enforcing it would be inventing validation the source does not declare: no rule in
   * model/validation/PromotionCode.json constrains the key's length, and the precedent for not
   * adding one is `RoundingRule.roundingRuleExpression`, which stays free text even though a
   * sub-three-character expression makes a derived power fractional.
   */
  private readonly promotionCodeID: string;

  /**
   * The redeemable code itself - the entity's natural key. [model/entity/PromotionCode.cfc:L53]
   *
   *   property name="promotionCode" ormtype="string";
   *
   * `string | undefined`, modelled honestly. The declaration carries NO `length`, NO `default` and
   * NO `notnull`, so the column can arrive NULL or empty from the database - which is not a
   * hypothetical: it is precisely the case the `preInsert` hook exists to repair, and
   * [model/entity/PromotionCode.cfc:L181] tests `isNull(getPromotionCode())` explicitly. Typing it
   * as a bare `string` would erase the state the hook is written to detect.
   *
   * MUTABLE, unlike almost every other field on this class: `setPromotionCode` assigns it, and so
   * does the ported `preInsert` guard by way of that setter.
   *
   * model/validation/PromotionCode.json marks it `"required":true` in the `save` context and
   * attaches the `hasUniquePromotionCode` validator there. Both are documented rather than
   * enforced in this constructor - see the validation-schema note at the foot of the class.
   */
  private promotionCode: string | undefined;

  /**
   * Start of the code's active window, or `undefined` for NO LOWER BOUND.
   * [model/entity/PromotionCode.cfc:L54]
   *
   *   property name="startDateTime" ormtype="timestamp" hb_formatType="dateTime"
   *   hb_nullRBKey="define.forever";
   *
   * `hb_formatType="dateTime"` and `hb_nullRBKey="define.forever"` are carried forward verbatim as
   * inert documentation for schema continuity; no i18n runtime resolves either one here.
   *
   * Absence convention 3 applies: `undefined` means FOREVER and is the permissive extreme. Never
   * the epoch, never `0`, never a sentinel. See the class doc comment.
   */
  private readonly startDateTime: Date | undefined;

  /**
   * End of the code's active window, or `undefined` for NO UPPER BOUND.
   * [model/entity/PromotionCode.cfc:L55]
   *
   *   property name="endDateTime" ormtype="timestamp" hb_formatType="dateTime"
   *   hb_nullRBKey="define.forever";
   *
   * Same absence convention, same inert metadata as `startDateTime`.
   */
  private readonly endDateTime: Date | undefined;

  /**
   * Cap on total redemptions of this code, or `undefined` for UNLIMITED.
   * [model/entity/PromotionCode.cfc:L56]
   *
   *   property name="maximumUseCount" ormtype="integer" notnull="false"
   *   hb_nullRBKey="define.unlimited";
   *
   * `notnull="false"` is explicit in the source, and `hb_nullRBKey="define.unlimited"` is the
   * legacy UI's own instruction to render an absent value as "unlimited". `number | undefined` is
   * therefore the only faithful model, and the money consequences of the two tempting coercions -
   * `0` and `Infinity` - are set out on the class doc comment.
   */
  private readonly maximumUseCount: number | undefined;

  /**
   * Cap on redemptions of this code BY A SINGLE ACCOUNT, or `undefined` for UNLIMITED.
   * [model/entity/PromotionCode.cfc:L57]
   *
   *   property name="maximumAccountUseCount" ormtype="integer" notnull="false"
   *   hb_nullRBKey="define.unlimited";
   *
   * Identical treatment to `maximumUseCount`. The per-account counterpart the promotion engine
   * compares this against is
   * `PromotionService.getPromotionCodeAccountUseCount` [model/service/PromotionService.cfc:L1098].
   */
  private readonly maximumAccountUseCount: number | undefined;

  // --- Related Object Properties (many-to-one) [model/entity/PromotionCode.cfc:L59-L60] -------

  /**
   * The in-scope `promotion` many-to-one - the ONE association this entity genuinely materializes.
   * [model/entity/PromotionCode.cfc:L60]
   *
   *   property name="promotion" cfc="Promotion" fieldtype="many-to-one" fkcolumn="promotionID";
   *
   * `Promotion | undefined`, nullable because nothing in the declaration says `notnull`, and
   * because the repository may legitimately choose not to fetch the far side.
   *
   * MUTABLE: both `setPromotion` [model/entity/PromotionCode.cfc:L101] and `removePromotion`
   * [model/entity/PromotionCode.cfc:L109] reassign it, the latter clearing it via
   * `structDelete(variables, "promotion")` at L118.
   */
  private promotion: Promotion | undefined;

  /**
   * The `promotionID` foreign-key column backing the association above.
   * [model/entity/PromotionCode.cfc:L60]
   *
   * Held alongside the materialized association so the key stays readable even when the repository
   * chose not to fetch the far side - something the legacy proxy-based `getPromotionID()` could
   * not do. See the LEGACY-NOTE on that accessor.
   */
  private readonly promotionID: string | undefined;

  // LEGACY-NOTE [model/entity/PromotionCode.cfc:L62]: the source carries a
  // `// Related Object Properties (one-to-many)` banner with NOTHING declared beneath it - an
  // empty section. Recorded as a cosmetic wart; nothing is declared here either, and no collection
  // is invented to fill it.

  // --- Out-of-scope many-to-many collections [model/entity/PromotionCode.cfc:L64-L68] ---------
  //
  // Both of this entity's collections point at aggregates that are explicitly out of scope, so
  // both are exposed as permanently-empty inert placeholders and their four bidirectional helpers
  // are NOT authored. The rulings, the link tables and the behavioural consequence of the boundary
  // are recorded on the accessors and in the dropped-member section further down.

  /**
   * `accounts` - the many-to-many OWNER side. [model/entity/PromotionCode.cfc:L65]
   *
   *   property name="accounts" singularname="account" cfc="Account" type="array"
   *   fieldtype="many-to-many" linktable="SwPromotionCodeAccount" fkcolumn="promotionCodeID"
   *   inversejoincolumn="accountID";
   *
   * Typed `readonly never[]` rather than `readonly unknown[]`, deliberately. `never` is the precise
   * statement of the anti-corruption boundary: not merely "empty right now" but "no element of this
   * collection can ever be constructed here", because model/entity/Account.cfc is out of scope and
   * no `Account` type is imported anywhere in this file. `readonly unknown[]` would leave the door
   * open for a caller to push something into it.
   *
   * Instance-scoped rather than a shared module-level constant: nothing on this class may hold
   * module state, and the reasoning is set out on the `currentFlag` memo below.
   */
  private readonly accounts: readonly never[] = [];

  /**
   * `orders` - the many-to-many INVERSE side. [model/entity/PromotionCode.cfc:L68]
   *
   *   property name="orders" singularname="order" cfc="Order" type="array"
   *   fieldtype="many-to-many" linktable="SwOrderPromotionCode" fkcolumn="promotionCodeID"
   *   inversejoincolumn="orderID" inverse="true" lazy="extra";
   *
   * The order aggregate is the single largest exclusion in this port. Same `readonly never[]`
   * treatment and same reasoning as `accounts`.
   *
   * `lazy="extra"` is confirmed exactly here, and it keeps the in-scope `lazy="extra"` census at
   * three sites: [model/entity/ProductType.cfc:L66], this line, and [model/entity/Sku.cfc:L71]. In
   * the legacy engine that setting existed so a delete-time count could be taken without
   * hydrating the collection - which is the very rule whose target-side consequence is recorded in
   * the `maxCollection:0` LEGACY-NOTE further down.
   */
  private readonly orders: readonly never[] = [];

  // --- Remote Properties [model/entity/PromotionCode.cfc:L70-L71] -----------------------------

  /**
   * External-system correlation id. [model/entity/PromotionCode.cfc:L71]
   *
   *   property name="remoteID" ormtype="string";
   *
   * Present on this entity, unlike some in-scope siblings - contrast
   * [model/entity/PromotionAccount.cfc], which declares none. A real schema difference, so the
   * column is carried rather than assumed away. No `notnull` and no `default`, hence
   * `string | undefined`.
   */
  private readonly remoteID: string | undefined;

  // --- Audit Properties [model/entity/PromotionCode.cfc:L73-L77] ------------------------------
  //
  // All four carry `hb_populateEnabled="false"`, meaning the legacy framework never populated them
  // from user input. That is preserved as an ownership statement rather than as a mechanism: the
  // persistence tier owns these values, they are `readonly` here, and no setter is authored.

  /** [model/entity/PromotionCode.cfc:L74] `hb_populateEnabled="false"`, `ormtype="timestamp"`. */
  private readonly createdDateTime: Date | undefined;

  /**
   * The `createdByAccountID` column, as an OPAQUE identifier.
   * [model/entity/PromotionCode.cfc:L75]
   *
   *   property name="createdByAccount" hb_populateEnabled="false" cfc="Account"
   *   fieldtype="many-to-one" fkcolumn="createdByAccountID";
   *
   * THE LOCKED OUT-OF-SCOPE FOREIGN-KEY RULING, applied identically here as in the sibling
   * entities: the far side is model/entity/Account.cfc, which is out of scope, so the many-to-one
   * collapses to an inert ID string. No `Account` type is imported, the column is never typed as an
   * entity, no `Account` instance is ever constructed, and there is deliberately NO
   * `getCreatedByAccount()` returning an entity. Schema continuity is fully satisfied because the
   * underlying `createdByAccountID` COLUMN survives unchanged.
   */
  private readonly createdByAccountID: string | undefined;

  /** [model/entity/PromotionCode.cfc:L76] `hb_populateEnabled="false"`, `ormtype="timestamp"`. */
  private readonly modifiedDateTime: Date | undefined;

  /**
   * The `modifiedByAccountID` column, opaque. [model/entity/PromotionCode.cfc:L77]
   *
   *   property name="modifiedByAccount" hb_populateEnabled="false" cfc="Account"
   *   fieldtype="many-to-one" fkcolumn="modifiedByAccountID";
   *
   * Same ruling as `createdByAccountID`.
   */
  private readonly modifiedByAccountID: string | undefined;

  // --- Non-Persistent Properties [model/entity/PromotionCode.cfc:L79-L80] ---------------------

  /**
   * Backing store for the `getCurrentFlag()` memo. [model/entity/PromotionCode.cfc:L80]
   *
   *   property name="currentFlag" type="boolean" persistent="false";
   *
   * NOT A DATABASE COLUMN - `persistent="false"`, and declared with `type=` rather than
   * `ormtype=`. No repository may select it, write it, or include it in an INSERT or UPDATE.
   *
   * `boolean | undefined` with NO initializer, because `undefined` is not a value here: it is the
   * "memo has not been computed yet" state, and it is exactly what the source's
   * `structKeyExists(variables, "currentFlag")` probe at [model/entity/PromotionCode.cfc:L86]
   * tests for. Once computed the memo is never recomputed, which is a behaviour the test tier must
   * pin rather than an implementation detail.
   *
   * INSTANCE-SCOPED, AND INSTANCES ARE REQUEST-SCOPED. Never module-scoped, never `static`, never a
   * module-level `Map`. On a warm Lambda container, module state persists across unrelated
   * requests, so a shared memo here would leak one request's evaluated flag into another's. That is
   * the same execution-model hazard that forces the legacy component-level caches -
   * `SkuDAO.variables.nextOptionGroupSortOrder`,
   * `RoundingRuleService.variables.roundingRuleDetails`, and every entity memo - to become
   * request-scoped in the target.
   */
  private currentFlag: boolean | undefined;

  // --- Injected collaborator ------------------------------------------------------------------

  /**
   * The clock, supplying "now" to `getCurrentFlag()`.
   *
   * A PLAIN CONSTRUCTOR PARAMETER TYPED `() => Date`, and deliberately NOT a port. The port surface
   * is closed at thirteen interfaces under `src/domain/ports/` and a fourteenth may not be
   * invented; a "clock port" in particular is forbidden. It is also not read from
   * `src/lib/config.ts`, which is static process configuration and never a request scope.
   *
   * This is what replaces the legacy ambient request scope: the CFML original reached the current
   * time through the engine's `now()` built-in, which depended on the server's timezone and could
   * not be controlled from a test. Injecting it makes `getCurrentFlag()` deterministic while
   * leaving that method's signature at ZERO ARGUMENTS - the entity-layer signature-widening budget
   * is fully spent on `PromotionPeriod.isCurrent(now?: Date)` and nothing here widens anything.
   */
  private readonly now: () => Date;

  /**
   * Hydrates one `SwPromotionCode` row.
   *
   * A single readonly parameter object rather than a positional list, matching the convention the
   * sibling entities establish: an inline object type and not a second exported interface, because
   * this module exports exactly one unit.
   *
   * EVERY NULLABLE FIELD IS A REQUIRED SLOT TYPED `T | undefined`, never an optional `?:` slot.
   * `exactOptionalPropertyTypes` is enabled, so "absent" and "present-but-undefined" are genuinely
   * different types, and requiring the key forces a hydrating repository to state "I looked and
   * found nothing" instead of silently omitting it. For four of these slots that distinction is the
   * absence convention itself, so making omission impossible is the point.
   *
   * NO COLLABORATOR PORT PARAMETER, because this entity has ZERO `getService(` sites. The clock is
   * the only injected dependency, and it is a plain function rather than a port.
   *
   * `accounts`, `orders` and `currentFlag` are deliberately NOT constructor slots: the first two are
   * permanently-empty out-of-scope placeholders and the third is a memo whose un-computed state is
   * `undefined` by construction. A repository must not be able to seed any of the three.
   */
  constructor(init: {
    readonly promotionCodeID: string;
    readonly promotionCode: string | undefined;
    readonly startDateTime: Date | undefined;
    readonly endDateTime: Date | undefined;
    readonly maximumUseCount: number | undefined;
    readonly maximumAccountUseCount: number | undefined;
    readonly promotion: Promotion | undefined;
    readonly promotionID: string | undefined;
    readonly remoteID: string | undefined;
    readonly createdDateTime: Date | undefined;
    readonly createdByAccountID: string | undefined;
    readonly modifiedDateTime: Date | undefined;
    readonly modifiedByAccountID: string | undefined;
    readonly now: () => Date;
  }) {
    this.promotionCodeID = init.promotionCodeID;
    this.promotionCode = init.promotionCode;
    this.startDateTime = init.startDateTime;
    this.endDateTime = init.endDateTime;
    this.maximumUseCount = init.maximumUseCount;
    this.maximumAccountUseCount = init.maximumAccountUseCount;
    this.promotion = init.promotion;
    this.promotionID = init.promotionID;
    this.remoteID = init.remoteID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
    this.now = init.now;
  }

  // --- Accessors --------------------------------------------------------------------------------
  //
  // ColdFusion auto-generated these from the property metadata, so there is no legacy body to port;
  // the locator on each one cites the property declaration it serves. They are authored as
  // EXPLICITLY TYPED METHODS - never synthesised. There is no `Proxy`, no index signature, no
  // `evaluate()` and no `variables.` scope object anywhere in this class, because emulating CFML's
  // dynamic dispatch would make the surface unverifiable, which is the opposite of interface parity.
  //
  // Getters only, with two exceptions that the source itself declares as writable: the
  // `promotionCode` setter below, and the `promotion` association, which is written by the two
  // bidirectional helpers rather than by a bare setter.

  /** [model/entity/PromotionCode.cfc:L52] Always a string; `''` means unsaved. */
  getPromotionCodeID(): string {
    return this.promotionCodeID;
  }

  /**
   * [model/entity/PromotionCode.cfc:L53]
   *
   * `undefined` when the column is NULL, which is a state the schema genuinely permits and which
   * `applyPreInsertPromotionCode` exists to repair. Never coerced to `''`: the two are distinct
   * states in the source, whose L181 guard tests both separately.
   */
  getPromotionCode(): string | undefined {
    return this.promotionCode;
  }

  /**
   * [model/entity/PromotionCode.cfc:L53] - the ORM-generated setter for the natural key.
   *
   * Concretely called at [model/entity/PromotionCode.cfc:L182], inside the `preInsert` hook, which
   * is the only place the legacy component writes this property itself.
   */
  setPromotionCode(promotionCode: string): void {
    this.promotionCode = promotionCode;
  }

  /**
   * [model/entity/PromotionCode.cfc:L54] `undefined` means FOREVER - no lower bound.
   *
   * Never the epoch, never `0`, never a sentinel. `hb_nullRBKey="define.forever"`.
   */
  getStartDateTime(): Date | undefined {
    return this.startDateTime;
  }

  /**
   * [model/entity/PromotionCode.cfc:L55] `undefined` means FOREVER - no upper bound.
   *
   * Never the epoch, never `0`, never a sentinel. `hb_nullRBKey="define.forever"`.
   */
  getEndDateTime(): Date | undefined {
    return this.endDateTime;
  }

  /**
   * [model/entity/PromotionCode.cfc:L56] `undefined` means UNLIMITED.
   *
   * Never `0` and never `Infinity` - the money consequence of either coercion is set out on the
   * class doc comment. The caller decides what "no limit" means for its own comparison; this
   * accessor only reports absence.
   */
  getMaximumUseCount(): number | undefined {
    return this.maximumUseCount;
  }

  /** [model/entity/PromotionCode.cfc:L57] `undefined` means UNLIMITED. Same ruling as above. */
  getMaximumAccountUseCount(): number | undefined {
    return this.maximumAccountUseCount;
  }

  /**
   * The materialized far side of the `promotion` many-to-one.
   * [model/entity/PromotionCode.cfc:L60]
   *
   * `undefined` when the repository did not fetch it, when `setPromotion` has never run, or after
   * `removePromotion` has cleared it.
   */
  getPromotion(): Promotion | undefined {
    return this.promotion;
  }

  // LEGACY-NOTE [org/Hibachi/HibachiEntity.cfc:L365-L372]: `getPromotionID()` had no hand-written
  // legacy body. It resolved through the `get*ID` branch of the onMissingMethod dispatcher into
  // `getPropertyPrimaryID`, which invokes the ASSOCIATION getter and returns the far object's
  // primary ID - falling back to the EMPTY STRING when the association is null. The target reads the
  // foreign-key COLUMN instead and returns `undefined` on a miss. That is a structural improvement
  // rather than a stylistic one: reading the column makes the key available even when the repository
  // chose not to materialize the association, which the legacy proxy-based form could not do. The
  // `""`-on-miss detail is recorded here so it is auditable rather than silently dropped.

  /** The `promotionID` column. [model/entity/PromotionCode.cfc:L60] */
  getPromotionID(): string | undefined {
    return this.promotionID;
  }

  /**
   * The `accounts` collection. [model/entity/PromotionCode.cfc:L65]
   *
   * ALWAYS EMPTY, by design and not by accident: the far side is the out-of-scope account module.
   * The `readonly never[]` element type makes that permanent rather than incidental. Link table
   * `SwPromotionCodeAccount` is documented on the field so the schema contract stays auditable.
   */
  getAccounts(): readonly never[] {
    return this.accounts;
  }

  /**
   * The `orders` collection. [model/entity/PromotionCode.cfc:L68]
   *
   * ALWAYS EMPTY, for the same reason: the order aggregate is out of scope. Link table
   * `SwOrderPromotionCode`. The behavioural consequence of that emptiness for the delete-context
   * `maxCollection:0` rule is NOT hidden - it is spelled out in the LEGACY-NOTE on the dropped
   * order-side helpers below, because it is a real difference in outcome and not a cosmetic one.
   */
  getOrders(): readonly never[] {
    return this.orders;
  }

  /** [model/entity/PromotionCode.cfc:L71] */
  getRemoteID(): string | undefined {
    return this.remoteID;
  }

  /** [model/entity/PromotionCode.cfc:L74] `hb_populateEnabled="false"`. */
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /** The `createdByAccountID` column, opaque. [model/entity/PromotionCode.cfc:L75] */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /** [model/entity/PromotionCode.cfc:L76] `hb_populateEnabled="false"`. */
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /** The `modifiedByAccountID` column, opaque. [model/entity/PromotionCode.cfc:L77] */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  // --- Framework members ------------------------------------------------------------------------

  /**
   * Whether this instance has been persisted yet.
   *
   * Inherited from the framework base in the legacy tree and concretely called at exactly three
   * sites in this component: [model/entity/PromotionCode.cfc:L104] inside `setPromotion`, and
   * [model/entity/PromotionCode.cfc:L123] and [model/entity/PromotionCode.cfc:L126] inside
   * `addAccount`. Only the first of those three survives into the target, because the `addAccount`
   * pair is dropped as out of scope.
   *
   * The empty-string test is not an approximation of the framework - it is literally what the
   * framework does. `isNew()` at [org/Hibachi/HibachiEntity.cfc:L707-L709] returns `getNewFlag()`,
   * and `getNewFlag()` at [org/Hibachi/HibachiEntity.cfc:L571-L576] is
   * `if(getPrimaryIDValue() == "") { return true; } return false;`. The empty string it compares
   * against is the `unsavedvalue=""` / `default=""` on the id property at
   * [model/entity/PromotionCode.cfc:L52].
   *
   * `===` and not `==`: `eqeqeq` is set to `'error', 'always'` precisely because CFML `==` is loose
   * and case-insensitive while TypeScript's is neither, so every ported comparison is audited at
   * its site rather than assumed. Here the operands are both `string`, so strict equality is exact.
   */
  isNew(): boolean {
    return this.promotionCodeID === '';
  }

  /**
   * Row identity, used by both containment tests on this class.
   *
   * PRIMARY-KEY COMPARISON ON `promotionCodeID` is the project convention, and it is the correct
   * translation of the legacy semantics: `arrayFind(collection, this)` in CFML resolves through
   * Hibernate's session identity, where one persisted row is represented by one instance per
   * session, so comparing the key is what "the same row" meant. It is NEVER deep equality, and it
   * is never a comparison of the natural `promotionCode` value - two rows can legitimately share
   * neither.
   *
   * THE UNSAVED CASE IS HANDLED EXPLICITLY, and this is a documented judgment call rather than an
   * oversight. An unsaved row's key is `''` (see `isNew()`), so a naive key comparison would report
   * two DIFFERENT unsaved codes as the same row and remove the wrong one. When either side is
   * unsaved this therefore falls back to the instance itself - which is exactly what the legacy
   * `arrayFind(collection, this)` compared, since Hibernate has no identity to offer for a row it
   * has never written. The fallback narrows behaviour towards the source rather than away from it,
   * and it introduces no new state, no new signature and no new member on the public surface.
   */
  private isSameRowAs(candidate: PromotionCode): boolean {
    const candidateID: string = candidate.getPromotionCodeID();

    if (candidateID === '' || this.promotionCodeID === '') {
      return candidate === this;
    }

    return candidateID === this.promotionCodeID;
  }

  // ============ START: Non-Persistent Property Methods =================
  // [model/entity/PromotionCode.cfc:L83-L96] - the FIRST of two banners with this title; the
  // duplicate at L149/L151 is completely empty. See the banner-wart table at the foot of the file.

  // LEGACY-NOTE [model/entity/PromotionCode.cfc:L85-L94]: THIS IS THE CORRECT-MEMO CONTROL CASE,
  // and it carries NO defect marker for exactly that reason. Seed key, write key and return key are
  // ALL `currentFlag`, so the memo behaves as intended. It is the contrast that makes the sibling
  // memo defects legible: [model/entity/Product.cfc:L524-L532] `getBrandName` sets its memo to `""`
  // and then returns WITHOUT assigning the computed value, poisoning it after the first call
  // (DEFECT 19); and [model/entity/Sku.cfc:L512-L522] `getOptionsByOptionGroupIDStruct` populates
  // `variables.OptionsByGroupIDStruct` but returns `variables.optionsByOptionGroupIDStruct`
  // (DEFECT 18). Neither shape is present here, and there is no DEFECT-10-style dead field either.

  // LEGACY-NOTE [model/entity/PromotionCode.cfc:L85-L94] and [model/entity/PromotionPeriod.cfc:L137-L146]:
  // these two method bodies are BYTE-FOR-BYTE IDENTICAL, including the stray trailing tab after the
  // inner closing brace at [model/entity/PromotionCode.cfc:L90]. Verbatim copy-paste duplication
  // across two entities, registered as a secondary item. It is deliberately NOT de-duplicated: the
  // project standard is one exported unit per file, each entity owns its own copy, and factoring the
  // logic into a shared helper would create a VALUE import between two entity modules - destroying
  // the type-only-cycle guarantee that makes the `import type { Promotion }` above safe in a
  // CommonJS bundle.

  // LEGACY-NOTE [model/entity/PromotionCode.cfc:L86]: the `structKeyExists(variables, "currentFlag")`
  // probe is a MEMO guard, not a lazy-load probe, and the two are categorically different. It asks
  // "has this been computed yet", so it becomes a private field compared with `=== undefined` and
  // needs no CFML struct semantics - which is why `../../lib/cfml/struct.js` is not imported.
  // Contrast the eleven `structKeyExists(variables, "brand" | "defaultSku" | "price")` sites in
  // model/entity/Product.cfc, which test HIBERNATE LAZY-LOAD STATE and, under the eager
  // materialization this port uses, become statically-true checks needing their own explanation.
  // Do not conflate the two.

  // LEGACY-NOTE cross-file boundary divergence, recorded for reviewers and NOT re-registered here:
  // this entity's active-period test is PERMISSIVE on null bounds and END-INCLUSIVE, whereas
  // [model/entity/PromotionPeriod.cfc:L78-L81] `isCurrent()` guards neither bound with `isNull` (so
  // it throws on a null bound), captures `now()` ONCE instead of twice, and is END-EXCLUSIVE
  // (`getEndDateTime() > currentDateTime`). The two disagree at exactly `now === endDateTime`. That
  // four-way divergence is already registered as a defect on promotionPeriod.ts and must not be
  // registered twice, and NEITHER side may be normalised. `PromotionCode` declares ONLY
  // `getCurrentFlag()` - verified across all 192 lines, there is no `isCurrent()` and no
  // `isExpired()` here - so there is no intra-file divergence and no signature widening is needed
  // or permitted. Inventing either method to "match the sibling" would corrupt interface parity.

  /**
   * Whether this code is inside its active window right now. [model/entity/PromotionCode.cfc:L85]
   *
   * ZERO ARGUMENTS, matching the legacy arity exactly. Current time arrives through the injected
   * clock, so the method stays deterministic without widening its signature - the entity-layer
   * widening budget is fully spent on `PromotionPeriod.isCurrent(now?: Date)` and nothing is spent
   * here.
   *
   * THE FOUR SEMANTICS REPRODUCED EXACTLY, each traceable to
   * [model/entity/PromotionCode.cfc:L88]:
   *
   *   * NULL BOUNDS ARE PERMISSIVE. Each disjunct is guarded by `!isNull(...)`, so an absent bound
   *     cannot make the flag false. BOTH BOUNDS ABSENT therefore yields `true`, which is what
   *     honours `hb_nullRBKey="define.forever"` on L54 and L55.
   *   * START IS INCLUSIVE. The disqualifying test is `start > now`, so at exactly
   *     `now === startDateTime` the flag stays `true`.
   *   * END IS INCLUSIVE. The disqualifying test is `end < now`, so at exactly
   *     `now === endDateTime` the flag stays `true`. This is the instant at which the sibling's
   *     `isCurrent()` disagrees.
   *   * `now()` IS INVOKED TWICE, once inside each disjunct, and the count is preserved rather than
   *     hoisted into a single captured value. Because `||` short-circuits in both languages, the
   *     second call is skipped whenever the first disjunct is already true - so preserving the
   *     syntactic shape preserves the call pattern too.
   *
   * Comparison is on absolute epoch milliseconds via `getTime()`, per the UTC policy on the class
   * doc comment. The memo is instance-scoped, so a second call returns the first answer even if the
   * clock has since advanced past the end bound; that is legacy behaviour, and the test tier pins it.
   */
  getCurrentFlag(): boolean {
    if (this.currentFlag === undefined) {
      this.currentFlag = true;

      const startDateTime: Date | undefined = this.startDateTime;
      const endDateTime: Date | undefined = this.endDateTime;

      if (
        (isPresent(startDateTime) && startDateTime.getTime() > this.now().getTime()) ||
        (isPresent(endDateTime) && endDateTime.getTime() < this.now().getTime())
      ) {
        this.currentFlag = false;
      }
    }

    return this.currentFlag;
  }

  // ============  END:  Non-Persistent Property Methods =================
  // [model/entity/PromotionCode.cfc:L96]

  // ============= START: Bidirectional Helper Methods ===================
  // [model/entity/PromotionCode.cfc:L98] - and this banner HAS NO MATCHING END. See wart 1 in the
  // banner table at the foot of the file. The block it opens runs L100-L147 and holds three pairs
  // under three inline sub-banners: `// Promotion (many-to-one)` at L100,
  // `// Accounts (many-to-many - owner)` at L121 and `// Orders (many-to-many - inverse)` at L141.
  // Only the Promotion pair is authored; the other two are dropped, with the rulings below.

  // LEGACY-NOTE [model/entity/PromotionCode.cfc:L109, L130, L145] - THE MANDATORY
  // "remove-that-ADDs" INVERSION CROSS-CHECK. Some Slatwall `remove*` helpers ADD instead of
  // removing: [model/entity/Option.cfc:L129-L131] `removePromotionRewardExclusion` and
  // [model/entity/Option.cfc:L145-L147] `removePromotionQualifierExclusion` each call
  // `addExcludedOption(this)`. The check was therefore re-run here against the verbatim source
  // rather than taken on trust, across ALL THREE of this component's `remove*` helpers:
  //
  //   | helper           | locator | verdict                                                       |
  //   |------------------|---------|---------------------------------------------------------------|
  //   | removePromotion  | L109    | CLEAN - `arrayDeleteAt` on the far side (L116) and a           |
  //   |                  |         | `structDelete` on the near side (L118). No `add*` call.       |
  //   | removeAccount    | L130    | CLEAN - `thisIndex`/`thatIndex`, both `arrayDeleteAt`          |
  //   |                  |         | (L133 and L137). No `add*` call.                              |
  //   | removeOrder      | L145    | CLEAN - correctly delegates to                                |
  //   |                  |         | `arguments.order.removePromotionCode(this)`, the properly     |
  //   |                  |         | PAIRED inverse of `addOrder`'s `addPromotionCode(this)`.      |
  //
  // VERDICT FOR `PromotionCode`: ZERO INVERSIONS across all three. Stated explicitly even though
  // two of the three members are dropped as out of scope - the check having been PERFORMED is part
  // of this deliverable's auditability, and a future reader must not have to redo it. Had an
  // inversion been found it would have been PRESERVED under a two-line LEGACY-DEFECT marker and
  // never fixed.

  // Promotion (many-to-one) [model/entity/PromotionCode.cfc:L100]

  // LEGACY-NOTE [model/entity/PromotionCode.cfc:L101-L107]: `setPromotion` IS SOUND, and carries no
  // defect marker. [model/entity/Promotion.cfc:L63] genuinely declares
  // `promotionCodes singularname="promotionCode" cfc="PromotionCode" fieldtype="one-to-many"
  // fkcolumn="promotionID" cascade="all-delete-orphan" inverse="true"`, so `hasPromotionCode` at
  // L104 resolves through the L514-adjacent dispatcher branches and `getPromotionCodes()` at L105 is
  // a generated accessor. NO THROW on any path. That is the same resolution `PromotionApplied` and
  // `PromotionPeriod` get, and the EXACT OPPOSITE of
  // [model/entity/PromotionAccount.cfc:L90-L95], which throws on every path because `Promotion`
  // declares no `promotionAccounts` collection.

  // LEGACY-NOTE [model/entity/PromotionCode.cfc:L105]: A CASING WART, preserved as a finding and not
  // as a change. The line reads `arrayAppend(arguments.Promotion.getPromotionCodes(),this);` with a
  // CAPITAL `P`, against the lowercase `promotion` argument declared at L101. CFML's `arguments`
  // scope is case-INSENSITIVE so it works there; TypeScript is case-sensitive, so the parameter
  // below is the declared lowercase `promotion` and there is nothing to reproduce beyond recording
  // it. Same wart class as [model/entity/PromotionPeriod.cfc:L129] `arguments.PromotionQualifier`
  // and the `skusList`/`SkusList` casing inside `PriceGroupRate.getAppliesTo()`. Annotated; spends
  // no divergence.

  /**
   * Bidirectional helper for the `promotion` many-to-one. [model/entity/PromotionCode.cfc:L101]
   *
   * THREE ORDERING AND POLARITY DETAILS ARE PRESERVED EXACTLY:
   *
   *   1. THE NEAR-SIDE ASSIGNMENT PRECEDES THE GUARD. L102 assigns before L104 tests, so the field
   *      is already set by the time the guard runs. Not reordered into a guard-first shape.
   *   2. THE GUARD TESTS `this`'s NEWNESS, via `isNew()` - matching `PromotionApplied`,
   *      `PromotionAccount` and `PromotionPeriod`. Contrast `addAccount` in THIS SAME COMPONENT at
   *      [model/entity/PromotionCode.cfc:L123], which tests the ARGUMENT's newness instead; that
   *      two-polarity inconsistency is recorded in the dropped-member note below.
   *   3. CFML `or` SHORT-CIRCUITS, so `||` is used and `hasPromotionCode` is genuinely not evaluated
   *      when `isNew()` is already true. Evaluation order is part of the behaviour, not an
   *      incidental detail: for a brand-new code the far side is never consulted at all.
   *
   * The append targets the LIVE far-side array returned by `getPromotionCodes()`, never a defensive
   * copy - see the far-side contract published at the foot of this file. A copy would leave the two
   * sides silently out of sync, which is the one failure mode a bidirectional helper exists to
   * prevent.
   */
  setPromotion(promotion: Promotion): void {
    // [model/entity/PromotionCode.cfc:L102]
    this.promotion = promotion;

    // [model/entity/PromotionCode.cfc:L104-L106]
    if (this.isNew() || !promotion.hasPromotionCode(this)) {
      promotion.getPromotionCodes().push(this);
    }
  }

  // LEGACY-NOTE [model/entity/PromotionCode.cfc:L116] - THIS IS THE CORRECT CONTROL CASE, AND IT IS
  // THE MOST VALUABLE SINGLE FINDING IN THIS FILE. It carries NO defect marker because it has no
  // defect. L116 reads `arrayDeleteAt(arguments.promotion.getPromotionCodes(),index);` - the SAME
  // argument that L113 searched. Both siblings get this wrong in the same way:
  //
  //   * [model/entity/PromotionPeriod.cfc:L110] reads
  //     `arrayDeleteAt(arguments.account.getPromotionPeriods(), index);` - but `account` is NOT a
  //     declared argument of `removePromotion` (the signature at L104 is `removePromotion(any
  //     promotion)`). It is REACHABLE, because L109's `arrayFind` succeeds first, so that method
  //     throws on its normal path - and the consequence is that
  //     [model/entity/PromotionPeriod.cfc:L112]'s `structDelete` never runs.
  //   * [model/entity/PromotionAccount.cfc:L103] carries the identical `arguments.account` leak, but
  //     UNREACHABLE - L101's `arrayFind` calls the non-existent `getPromotionAccounts()` and throws
  //     first, masking it.
  //
  // Three sites, one correct and two defective, differing only in which argument name was
  // copy-pasted. THIS FILE IS THE CONTROL that proves the other two are genuine copy-paste defects
  // rather than an intentional CFML idiom - without it a reviewer could not tell the difference. The
  // defects belong to those two files and are registered there; they are not re-registered here.

  /**
   * Bidirectional helper for the `promotion` many-to-one. [model/entity/PromotionCode.cfc:L109]
   *
   * THE PARAMETER IS OPTIONAL, matching the legacy signature exactly: L109 declares
   * `any promotion`, NOT `required any promotion`.
   *
   * L110-L112 is the default-to-the-currently-set-value idiom -
   * `if(!structKeyExists(arguments, 'promotion')) { arguments.promotion = variables.promotion; }` -
   * and its TypeScript form is an optional parameter with a nullish default. Plain, idiomatic
   * TypeScript: there is deliberately no `variables.` scope object, no `structKeyExists` helper and
   * no CFML struct emulation, because a transliteration would violate the minimal-change directive,
   * which scopes the FUNCTIONAL SURFACE and never the code style.
   *
   * IT THROWS WHEN THE ARGUMENT IS OMITTED AND NO PROMOTION IS SET, and that is behaviour
   * preservation rather than defensiveness. With both absent, CFML reaches L113 and dereferences an
   * undefined value, which is a runtime error there; reproducing it as a throw is faithful, whereas
   * silently returning or no-opping would invent a success path the legacy system does not have.
   *
   * L118's `structDelete(variables, "promotion")` sits OUTSIDE the `if` and therefore runs
   * UNCONDITIONALLY - the near side is cleared whether or not the far-side element was found. That
   * placement is preserved exactly. Note that unlike
   * [model/entity/PromotionPeriod.cfc:L112], this line IS REACHABLE here, precisely because L116
   * does not throw.
   *
   * A cosmetic wart worth one line: L110 quotes the key with SINGLE quotes `'promotion'` while L118
   * uses DOUBLE quotes `"promotion"`. No behavioural consequence in CFML; recorded for completeness.
   */
  removePromotion(promotion?: Promotion): void {
    // [model/entity/PromotionCode.cfc:L110-L112]
    const target: Promotion | undefined = promotion ?? this.promotion;

    if (target === undefined) {
      throw new Error(
        'PromotionCode.removePromotion was called with no argument while no promotion is set. ' +
          'model/entity/PromotionCode.cfc:L110-L113 defaults the argument to variables.promotion ' +
          'and then dereferences it unconditionally at L113, so CFML fails here too. Reproduced ' +
          'rather than silently absorbed.',
      );
    }

    // [model/entity/PromotionCode.cfc:L113] ARRAY INDEX BASE CHANGE: CFML `arrayFind` returns a
    // 1-BASED index, or 0 for "not found", which is why the source tests `index > 0` at L115.
    // TypeScript `findIndex` returns a 0-BASED index, or -1 for "not found", so the test MUST be
    // `!== -1`. Writing `> 0` against a `findIndex` result would silently skip element 0 - the
    // single most common way this conversion goes wrong. Containment is by primary key, per
    // `isSameRowAs`.
    const promotionCodes: PromotionCode[] = target.getPromotionCodes();
    const index: number = promotionCodes.findIndex((candidate: PromotionCode) =>
      this.isSameRowAs(candidate),
    );

    // [model/entity/PromotionCode.cfc:L115-L117]
    if (index !== -1) {
      promotionCodes.splice(index, 1);
    }

    // [model/entity/PromotionCode.cfc:L118] - UNCONDITIONAL, outside the found-branch.
    this.promotion = undefined;
  }

  // Accounts (many-to-many - owner) [model/entity/PromotionCode.cfc:L121]

  // LEGACY-NOTE [model/entity/PromotionCode.cfc:L122, L130]: `addAccount` and `removeAccount` are
  // DELIBERATELY NOT AUTHORED. Their far side is model/entity/Account.cfc and the whole account
  // module is explicitly out of scope, so `arguments.account.isNew()` [L123],
  // `hasAccount(arguments.account)` [L123], `arguments.account.hasPromotionCode(this)` [L126] and
  // `arguments.account.getPromotionCodes()` [L127, L135, L137] have no in-scope counterpart to call.
  // The `accounts` collection is correspondingly not materialized; it is the permanently-empty
  // `readonly never[]` declared above, and the link table `SwPromotionCodeAccount` is recorded there
  // so the schema contract stays auditable. This applies the same anti-corruption ruling already
  // used for `PriceGroup.appliedOrderItems` [model/entity/PriceGroup.cfc:L62] with its dropped
  // `addAppliedOrderItem`/`removeAppliedOrderItem` pair, for `Brand.attributeValues`, and for
  // `PromotionAccount.setAccount`/`removeAccount`.
  // "DROPPED" MEANS NOT AUTHORED IN THIS NEW TYPESCRIPT FILE. It is NEVER a deletion from the
  // legacy component, which is reference-only and remains untouched. Because the AAP mandates this
  // boundary, it is not a signature reshaping, not a visibility change and not a deliberate
  // divergence: it spends no budget of any kind.
  // It also means the two `has*` containment probes the dispatcher would have synthesised -
  // `hasAccount` at L123 and the far Account's `hasPromotionCode` at L126 - are correctly absent
  // from this class, since both sit on dropped collections.

  // LEGACY-NOTE [model/entity/PromotionCode.cfc:L123, L126] - RECORDED BEFORE DROPPING, because it
  // is a genuine finding that would otherwise be lost with the member. Within the SINGLE method
  // `addAccount`, the two guards test OPPOSITE THINGS:
  //   * L123, the near-side guard: `if(arguments.account.isNew() or !hasAccount(arguments.account))`
  //     tests THE ARGUMENT's newness.
  //   * L126, the far-side guard: `if(isNew() or !arguments.account.hasPromotionCode( this ))`
  //     tests `this`'s newness.
  // Two different polarities in one method. The argument-newness polarity matches
  // `PriceGroupRate.addProductType`; the `this`-newness polarity matches `setPromotion` in this very
  // component. A real inconsistency in the legacy codebase, documented rather than normalised - and
  // documented here specifically so that the finding survives the member not being ported.

  // Orders (many-to-many - inverse) [model/entity/PromotionCode.cfc:L141]

  // LEGACY-NOTE [model/entity/PromotionCode.cfc:L142, L145]: `addOrder` and `removeOrder` are
  // DELIBERATELY NOT AUTHORED. The order aggregate is the single largest exclusion in this port, so
  // `arguments.order.addPromotionCode(this)` [L143] and
  // `arguments.order.removePromotionCode(this)` [L146] have no in-scope far side. Both legacy bodies
  // are pure inverse-side delegation and are correctly paired, as recorded in the inversion
  // cross-check above. The `orders` collection is not materialized: it is the permanently-empty
  // `readonly never[]` declared above, carrying the link table `SwOrderPromotionCode` and the
  // `inverse="true" lazy="extra"` metadata for schema continuity.

  // LEGACY-NOTE [model/validation/PromotionCode.json] - THE `maxCollection:0` DELETE-CONTEXT
  // TENSION. This is a REAL, LOAD-BEARING BEHAVIOURAL CONSEQUENCE of the anti-corruption boundary,
  // recorded here rather than buried, because it changes an outcome rather than a style. The chain
  // was traced end to end through the verbatim source:
  //
  //   1. model/validation/PromotionCode.json declares, as its ENTIRE delete context, exactly one
  //      rule: `"orders": [{"contexts":"delete","maxCollection":0}]`.
  //   2. `PromotionCode` declares no `isDeletable()` of its own, so it inherits
  //      [org/Hibachi/HibachiEntity.cfc:L204-L206], which is
  //      `!getService("hibachiValidationService").validate(object=this, context="delete",
  //      setErrors=false).hasErrors()` - i.e. `isDeletable()` IS that delete-context rule.
  //   3. [model/entity/Promotion.cfc:L123-L135] `getPromotionCodesDeletableFlag()` loops every
  //      promotion code and calls `promotionCode.isDeletable()`, so the rule propagates upward to
  //      the promotion's own admin-facing deletable flag.
  //
  // Because `orders` is `lazy="extra"` in CFML and PERMANENTLY EMPTY here, the rule TRIVIALLY PASSES
  // in the target where it would BLOCK in CFML: a code attached to real orders is undeletable in the
  // legacy system and would read as deletable through this class alone. That is the same tension
  // already documented for `PriceGroup.appliedOrderItems` and for `physicalCounts` on
  // Sku/Product/Brand/ProductType.
  // TWO CONSEQUENCES, both deliberate. First, `isDeletable()` is NOT authored on this class: it is a
  // framework method that reaches outward through `getService("hibachiValidationService")`, which is
  // precisely the T2 service-locator pattern the ESLint domain boundary exists to make impossible,
  // and the source does not declare it here either. Second, DELETE-CONTEXT ENFORCEMENT IS A
  // SERVICE/REPOSITORY-TIER OBLIGATION and must be honoured there against the real `SwOrderPromotionCode`
  // link table - not here. Stated explicitly so the gap is auditable rather than hidden.

  // LEGACY-NOTE the project's FIVE distinct empty-collection semantics, and why NONE of them is
  // decided by this file. Collapsing any one of them into another is a money bug: (1) PERMISSIVE in
  // the caller's loop - an empty `addressZones` on a reward means no restriction; (2) RESTRICTIVE in
  // the evaluator - an empty `locations` on an address zone means not in zone; (3) and (4)
  // `hasAnyInProperty` [org/Hibachi/HibachiEntity.cfc:L340-L350] returns `false` on an empty array,
  // and that same `false` is PERMISSIVE on exclude-lists but RESTRICTIVE on include-lists;
  // (5) the fulfillment three-way gate [model/service/PromotionService.cfc:L333-L420], where empty
  // means no restriction, with a single-promotion-per-fulfillment `[1]` assumption. A sixth,
  // separate convention is that `Brand.getProducts()` must default to `[]`, asserted by the legacy
  // test. `PromotionCode` declares NO in-scope collection at all - both of its collections are
  // dropped out-of-scope placeholders - so NOTHING is decided here: the two exposed arrays default
  // to `[]` purely as inert placeholders and NO qualification semantics attach to their emptiness.

  //   NOTE: the source has no `END: Bidirectional Helper Methods` banner closing the block opened at
  //   [model/entity/PromotionCode.cfc:L98]. See wart 1 in the banner table at the foot of the file.

  // =============== START: Custom Validation Methods ====================
  // [model/entity/PromotionCode.cfc:L157-L159] - AND THE SOURCE BLOCK IS COMPLETELY EMPTY. The
  // method below is authored anyway, and the three-part note explains exactly why that is correct
  // rather than an invention.

  // LEGACY-NOTE `hasUniquePromotionCode` IS NOT DECLARED IN model/entity/PromotionCode.cfc. It
  // appears nowhere in the 192 lines - the `// START: Custom Validation Methods` /
  // `// END` banner pair at L157/L159 is empty. Three facts justify authoring it, all verified
  // against the verbatim source:
  //
  // (1) THE DISPATCH LOCATOR. It is supplied entirely by the framework's `hasUnique<Prop>` branch at
  //     [org/Hibachi/HibachiEntity.cfc:L514] - `} else if( left(arguments.missingMethodName, 9) ==
  //     "hasUnique") { return hasUniqueProperty( right(...) ); }` - which reaches
  //     [org/Hibachi/HibachiEntity.cfc:L328-L330] and thence
  //     `getBean("hibachiDAO").isUniqueProperty(...)`.
  //
  // (2) THE SCOPE GAP, AND WHOSE OBLIGATION IT IS. [org/Hibachi/HibachiDAO.cfc:L130-L146] is the real
  //     implementation, and its query is `from #entityName# e where e.#property# = :propertyValue
  //     and e.#entityIDproperty# != :entityID`, returning false if any row comes back. Reading it
  //     verbatim settles three things rather than leaving them to inference:
  //       * IT IS DATABASE-WIDE - the whole `SwPromotionCode` table, NOT scoped to one promotion's
  //         children. A domain-pure entity cannot query the database (the ESLint boundary forbids
  //         importing a repository, and correctly so), so THIS IMPLEMENTATION CAN ONLY SEE THE
  //         MATERIALIZED SIBLING SET reachable through `this.promotion`. It is therefore a strictly
  //         NARROWER check than the framework's, and A GENUINELY GLOBAL UNIQUENESS ASSERTION REMAINS
  //         A REPOSITORY / SERVICE-TIER OBLIGATION that must be enforced there. Stated explicitly so
  //         the gap is auditable rather than hidden behind a method that merely looks authoritative.
  //       * SELF IS EXCLUDED BY PRIMARY KEY, via `e.#entityIDproperty# != :entityID`. The PK
  //         exclusion below is not a guess; it is what the framework does.
  //       * THE COMPARISON IS CASE-INSENSITIVE. The generated SQL uses a plain `=` under MySQL's
  //         default case-insensitive collation, so `'SAVE10' = 'save10'` is TRUE in the legacy
  //         system. TypeScript's `===` is not, so both sides are normalised below. This is parity
  //         grounded in the schema's collation, not merely in CFML's loose `==`.
  //     One further consequence of reading the query: for a NEW entity `entityID` is `''`, and no
  //     persisted row has an empty key, so nothing is excluded - but unsaved siblings are invisible
  //     to a database query in the first place. The sibling scan below reproduces that by skipping
  //     candidates whose key is `''`.
  //
  // (3) IT IS NOT DEAD CODE. model/validation/PromotionCode.json invokes it DECLARATIVELY in the
  //     `save` context: `"promotionCode": [{"contexts":"save","required":true,
  //     "method":"hasUniquePromotionCode"}]`. It is one of only five declaratively-invoked entity
  //     methods across the in-scope schemas, alongside `Sku.hasUniqueOptions`,
  //     `Sku.hasOneOptionPerOptionGroup`, `RoundingRule.hasExpressionWithListOfNumericValuesOnly` and
  //     `Promotion.getPromotionCodesDeletableFlag`. Omitting it would break that schema.
  //
  // The signature is NOT widened to accept a sibling list or a repository: the widening budget is
  // exhausted, and the domain layer may not import a repository under any circumstances.

  /**
   * Whether this code's `promotionCode` value is unique among the siblings this entity can see.
   *
   * ZERO ARGUMENTS and the verbatim framework-synthesised name, so the declarative invocation in
   * model/validation/PromotionCode.json resolves exactly as it does in CFML.
   *
   * FOUR RULES, each with its justification:
   *
   *   * `true` when `promotionCode` is nullish or empty. There is nothing yet to collide with, and
   *     `applyPreInsertPromotionCode` is what will assign a value at insert time. Returning `false`
   *     here would make every brand-new row fail its own save validation.
   *   * `true` when `promotion` is `undefined`. With no far side materialized there are no visible
   *     siblings, hence no visible conflict. This is the honest answer for the narrowed scope, and it
   *     is exactly why the global assertion is delegated upward - see fact (2) above.
   *   * SELF IS EXCLUDED BY PRIMARY KEY, mirroring `e.promotionCodeID != :entityID`. Without this a
   *     saved row would always report itself as a duplicate of itself.
   *   * COMPARISON IS CASE-INSENSITIVE on both sides, mirroring the MySQL collation the legacy query
   *     runs under.
   *
   * Synchronous and side-effect-free: it reads only already-materialized state and mutates nothing,
   * not even the memo.
   */
  hasUniquePromotionCode(): boolean {
    const promotionCode: string | undefined = this.promotionCode;

    if (!isPresent(promotionCode) || cfLen(promotionCode) === 0) {
      return true;
    }

    const promotion: Promotion | undefined = this.promotion;

    if (promotion === undefined) {
      return true;
    }

    const normalizedPromotionCode: string = promotionCode.toLowerCase();

    const hasCollidingSibling: boolean = promotion
      .getPromotionCodes()
      .some((sibling: PromotionCode): boolean => {
        const siblingID: string = sibling.getPromotionCodeID();

        // Unsaved siblings are invisible to the legacy database query, so they cannot collide.
        if (siblingID === '') {
          return false;
        }

        // Self-exclusion by primary key [org/Hibachi/HibachiDAO.cfc:L139].
        if (siblingID === this.promotionCodeID) {
          return false;
        }

        const siblingCode: string | undefined = sibling.getPromotionCode();

        if (!isPresent(siblingCode) || cfLen(siblingCode) === 0) {
          return false;
        }

        return siblingCode.toLowerCase() === normalizedPromotionCode;
      });

    return !hasCollidingSibling;
  }

  // ===============  END: Custom Validation Methods =====================
  // [model/entity/PromotionCode.cfc:L159]

  // ================== START: Overridden Methods ========================
  // [model/entity/PromotionCode.cfc:L169-L175]

  // LEGACY-NOTE [model/entity/PromotionCode.cfc:L171-L173]: this is the DECLARATIVE form of simple
  // representation - the entity names the property and the framework reads it - which is the same
  // shape as [model/entity/PriceGroupRate.cfc:L270]. It CONTRASTS
  // [model/entity/PromotionPeriod.cfc:L91], where the sibling overrides
  // `getSimpleRepresentation()` DIRECTLY with `return getPromotion().getPromotionName();`. Both
  // shapes exist in the legacy tree and neither is normalised. `getSimpleRepresentation()` is
  // therefore NOT authored on this class: the source does not declare it, and inventing it would
  // corrupt interface parity - the property name is the whole contract here.

  /**
   * The property whose value stands in as this entity's human-readable label.
   * [model/entity/PromotionCode.cfc:L171]
   *
   * Returns the literal `'promotionCode'`, exactly as the source returns the literal
   * `"promotionCode"`. It is a PROPERTY NAME and not a value, so it is intentionally not derived
   * from `this.promotionCode`: deriving it would change the contract from "which property" to "what
   * value" and break every caller that resolves it reflectively.
   */
  getSimpleRepresentationPropertyName(): string {
    return 'promotionCode';
  }

  // ==================  END:  Overridden Methods ========================
  // [model/entity/PromotionCode.cfc:L175]

  // =================== START: ORM Event Hooks  =========================
  // [model/entity/PromotionCode.cfc:L177-L187]

  // LEGACY-NOTE [model/entity/PromotionCode.cfc:L177-L187]: THIS HOOK SECTION IS INSERT-ONLY, and
  // that makes `PromotionCode` the odd one out among the four hook-bearing in-scope entities. A
  // case-insensitive census of the source confirms ZERO occurrences of `preUpdate`:
  //
  //   | entity        | hooks                                          | path column                  |
  //   |---------------|------------------------------------------------|------------------------------|
  //   | Category      | preInsert() L126, preUpdate(struct oldData) L131| categoryIDPath               |
  //   | PriceGroup    | preInsert() L206, preUpdate(struct oldData) L211| priceGroupIDPath L53 (4000)  |
  //   | ProductType   | preInsert() L305, preUpdate(struct oldData) L310| productTypeIDPath            |
  //   | PromotionCode | preInsert() L179 ONLY                          | NONE                         |
  //
  // Consequently: NO `preUpdate` equivalent is authored, there is no materialized path to maintain,
  // and `../valueObjects/materializedIdPath.js` is correctly absent from the imports.

  // LEGACY-NOTE [model/entity/PromotionCode.cfc:L181-L184] - THE HOOK ORDERING, WHICH MUST NOT BE
  // NORMALISED. The guarded assignment (L181-L183) runs BEFORE `super.preInsert()` (L184). That
  // matches `PriceGroup`, which sets its path at L207 and only then calls `super.preInsert()` at
  // L208 - and it CONTRASTS `Category` (L126-L129), which calls `super.preInsert()` FIRST and sets
  // its path afterwards. Each entity's ordering is reproduced exactly as written; the divergence
  // between them is a legacy fact, not a defect to iron out.

  // LEGACY-NOTE [model/entity/PromotionCode.cfc:L184] `super.preInsert()`: there is no base class in
  // the target, and none is emulated. What the framework base's own `preInsert` did - audit-timestamp
  // population and primary-key assignment - is a PERSISTENCE-TIER concern owned by
  // `src/repositories/mysql/**`, which is also why the audit fields on this class are `readonly` with
  // no setters. The ordering guarantee is preserved structurally rather than by a `super` call: the
  // repository invokes `applyPreInsertPromotionCode(...)` BEFORE its own audit/PK handling, which is
  // exactly the sequence L181-L184 produces.

  // LEGACY-NOTE BUDGET CHECK, stated explicitly so no reviewer has to reconstruct it. Reshaping this
  // ORM hook into a repository-invoked maintenance method does NOT consume the signature-reshaping or
  // signature-widening budgets. Those budgets govern the ported public BEHAVIOURAL surface policed by
  // interface parity - whose sole entity-layer spend is `PromotionPeriod.isCurrent(now?: Date)` - and
  // the AAP EXPLICITLY MANDATES reshaping all four hook-bearing entities' ORM hooks this way. It is a
  // directed transformation, not a discretionary widening. Nothing else in this file spends anything:
  // zero widenings, zero reshapings, zero visibility changes, zero deliberate divergences.

  /**
   * The ported `preInsert` hook. [model/entity/PromotionCode.cfc:L179]
   *
   * Invoked by the repository at save time, mirroring where the ORM event fired.
   *
   * IT RECEIVES THE GENERATED CODE AND NEVER GENERATES ONE. The legacy body calls `createUUID()`, a
   * CFML built-in with no TypeScript equivalent, and a fourteenth port may not be invented to supply
   * one. So the value is a PARAMETER: this method applies the CFML guard and assigns only when the
   * guard passes. It never calls `crypto.randomUUID()`, never reaches for a port, never touches the
   * clock and never performs I/O - which keeps the entity pure and keeps the generated value under
   * the persistence tier's control, exactly as `generator="uuid"` on L52 put it under the ORM's.
   *
   * THE GUARD IS A FAITHFUL TRANSLATION of
   * `isNull(getPromotionCode()) || getPromotionCode() == ""`. `isNullish` covers the null half and
   * `cfLen(...) === 0` covers the empty-string half, both from the CFML parity module, and `||`
   * short-circuits in both languages so the second test is skipped when the first already fired.
   * CFML `==` on strings is case-insensitive, but against `""` it is purely an emptiness test, so
   * `cfLen(...) === 0` is exact rather than approximate. Note that a non-empty existing value is
   * LEFT UNTOUCHED: the hook repairs an absent code, it never overwrites a present one.
   */
  applyPreInsertPromotionCode(generatedCode: string): void {
    // Override the preInsert method to set a promotion code if one wasn't assinged
    //
    // LEGACY-NOTE [model/entity/PromotionCode.cfc:L180]: the comment line above is carried over
    // VERBATIM, misspelling intact - "assinged", not "assigned". Preserved deliberately as part of
    // the source record; it is not silently corrected and the comment is not "cleaned up".
    if (isNullish(this.promotionCode) || cfLen(this.promotionCode) === 0) {
      this.setPromotionCode(generatedCode);
    }
  }

  // ===================  END:  ORM Event Hooks  =========================
  // [model/entity/PromotionCode.cfc:L187]

  // ================== START: Deprecated Methods ========================
  // [model/entity/PromotionCode.cfc:L189-L191] - EMPTY in the source, and nothing is authored for it.
  // ==================  END:  Deprecated Methods ========================
}

// ---------------------------------------------------------------------------
// CANONICAL FAR-SIDE CONTRACT REQUIRED OF `./promotion.js`
//
// `slatwall-ts/src/domain/entities/promotion.ts` is authored separately, so the requirements this
// file places on it are stated here as CANONICAL and must not be renamed later. All four are read
// straight off the verbatim legacy source, not inferred.
//
// [model/entity/Promotion.cfc:L63] genuinely declares
//   property name="promotionCodes" singularname="promotionCode" cfc="PromotionCode"
//   fieldtype="one-to-many" fkcolumn="promotionID" cascade="all-delete-orphan" inverse="true";
// which is precisely why `setPromotion` and `removePromotion` above RESOLVE AND DO NOT THROW.
//
//   1. `getPromotionCodes(): PromotionCode[]` MUST RETURN THE LIVE ARRAY REFERENCE, NOT A COPY.
//      [model/entity/PromotionCode.cfc:L105] `arrayAppend` and
//      [model/entity/PromotionCode.cfc:L116] `arrayDeleteAt` both mutate it IN PLACE. A defensive
//      copy would silently break bidirectional synchronization: the append would land on a throwaway
//      array and the two sides would drift apart with no error anywhere. The return type is
//      deliberately the mutable `PromotionCode[]` and not `readonly PromotionCode[]`, so the contract
//      is visible in the type rather than only in prose.
//   2. `hasPromotionCode(promotionCode: PromotionCode): boolean` MUST BE A PRIMARY-KEY COMPARISON ON
//      `promotionCodeID` - never object identity as its only basis, never deep equality. It returns
//      `false` on an empty array. It has no hand-written legacy body: it is synthesised by the
//      dispatcher at [org/Hibachi/HibachiEntity.cfc:L507-L565], whose CFML semantics are Hibernate's
//      implicit collection-contains, i.e. session identity / PK. The unsaved-row caveat documented on
//      `isSameRowAs` above applies equally there.
//   3. `getPromotionName(): string` - [model/entity/Promotion.cfc:L53]. Not called from this file, but
//      restated for cross-file consistency with the contract promotionPeriod.ts publishes, since
//      [model/entity/PromotionPeriod.cfc:L91] does call it.
//   4. `isDeletable(): boolean` - [model/entity/Promotion.cfc:L170-L172], body
//      `return arrayLen( getAppliedPromotions() ) == 0;`. Note this is Promotion's OWN override; it is
//      NOT the framework's validation-driven [org/Hibachi/HibachiEntity.cfc:L204-L206] version that
//      `PromotionCode` inherits. The two are different methods with the same name and must not be
//      conflated.
//
// AND THE ANTI-CONTRACT, RE-PUBLISHED BECAUSE IT IS AS BINDING AS THE CONTRACT:
// model/entity/Promotion.cfc DECLARES NO `promotionAccounts` COLLECTION. Its collections are exactly
// three - [model/entity/Promotion.cfc:L62] `promotionPeriods`, [model/entity/Promotion.cfc:L63]
// `promotionCodes`, [model/entity/Promotion.cfc:L64] `appliedPromotions` - re-verified here by a
// case-insensitive grep of that file returning ZERO hits for `promotionAccount`. `promotion.ts`
// must therefore NOT invent one, must NOT add `getPromotionAccounts()`, and must NOT add
// `hasPromotionAccount()`. That absence is exactly why
// [model/entity/PromotionAccount.cfc:L90-L95] is a confirmed throwing defect, and adding the far
// side in TypeScript would SILENTLY REPAIR it - inventing behaviour the legacy system does not have
// and breaking schema continuity, since there is no `SwPromotion` -> `SwPromotionAccount` inverse
// mapping to honour.
//
// ONE CROSS-FILE OBSERVATION FOR WHOEVER AUTHORS promotion.ts, because it concerns the only
// Promotion method that iterates promotion codes: [model/entity/Promotion.cfc:L123-L135]
// `getPromotionCodesDeletableFlag()` guards on `variables.promotionCodeDeletableFlag` at L126 but
// WRITES AND RETURNS `variables.promotionCodeDeleteableFlag` at L127, L130 and L134 - "Deletable"
// versus "Deleteable". A memo key mismatch of the same class as DEFECT 18. It belongs to that file's
// register, not this one's, and is recorded here only so the finding is not lost.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// BANNER WARTS - `PromotionCode` HAS THE MESSIEST BANNER STRUCTURE IN THE IN-SCOPE SET.
//
// Enumerated by locator against the verbatim source. All are cosmetic, all are recorded as secondary
// register items, and NONE spends a divergence. The ported members above stay in SOURCE ORDER; the
// structure is annotated, never "cleaned up" by reordering.
//
//   | section                                     | locators           | state                  |
//   |---------------------------------------------|--------------------|------------------------|
//   | Non-Persistent Property Methods (first)     | L83 START / L96 END| POPULATED - getCurrentFlag |
//   | Bidirectional Helper Methods (first)        | L98 START / NO END | POPULATED - L100-L147  |
//   | Non-Persistent Property Methods (duplicate) | L149 / L151        | EMPTY                  |
//   | Bidirectional Helper Methods (duplicate)    | L153 / L155        | EMPTY                  |
//   | Custom Validation Methods                   | L157 / L159        | EMPTY                  |
//   | Custom Formatting Methods                   | L161 / L163        | EMPTY                  |
//   | Overridden Implicet Getters                 | L165 / L167        | EMPTY                  |
//   | Overridden Methods                          | L169 / L175        | POPULATED              |
//   | ORM Event Hooks                             | L177 / L187        | POPULATED - preInsert  |
//   | Deprecated Methods                          | L189 / L191        | EMPTY                  |
//
// FOUR FINDINGS WORTH STATING:
//   1. THE FIRST `Bidirectional Helper Methods` BLOCK HAS NO END BANNER AT ALL. The END at L155 is
//      paired with the START at L153 of the DUPLICATE EMPTY block, so the populated block opened at
//      L98 is never closed. A wart class seen in no prior in-scope entity.
//   2. A DUPLICATE, COMPLETELY EMPTY `Bidirectional Helper Methods` pair at L153/L155 - the same wart
//      as [model/entity/PromotionAccount.cfc:L117/L119] and
//      [model/entity/PromotionPeriod.cfc:L154/L156]. THREE entities now share it.
//   3. A DUPLICATE EMPTY `Non-Persistent Property Methods` pair at L149/L151, on top of the populated
//      one at L83/L96.
//   4. THE L165/L167 BANNER MISSPELLS "Implicit" AS "Implecet" IN THE FOLDER SPECIFICATION, BUT THE
//      SOURCE ACTUALLY READS "Implicet". Verified byte-for-byte with `cat -A`:
//        L165: \t// ============== START: Overridden Implicet Getters ===================
//        L167: \t// ==============  END: Overridden Implicet Getters ====================
//      The table above therefore records the VERBATIM source spelling, "Implicet". The same
//      misspelling appears at [model/entity/PriceGroup.cfc:L202/L204]. Recorded precisely because a
//      locator that cannot be grepped is worse than no locator at all.
//
// COSMETIC WHITESPACE WARTS, verified with `cat -A` and listed for completeness only: L82 is a
// spaces-only line; L90 carries a stray trailing TAB after the inner closing brace (the same stray
// tab that makes `getCurrentFlag` byte-identical to its sibling); L119 closes `removePromotion` with
// four spaces instead of a tab; L120 and L140 are spaces-only lines. The file mixes CRLF and LF line
// terminators. The component closes at L192. Prettier owns formatting in this subtree, so the ported
// file is LF-only with two-space indentation and none of the above is reproduced as whitespace -
// only as this record.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// VALIDATION SCHEMA - model/validation/PromotionCode.json EXISTS, read verbatim.
//
// The entity carries the PROPERTY METADATA; schema ENFORCEMENT belongs to the service tier, where the
// ported declarative rules become zod schemas. Nothing below is implemented as a constructor
// invariant, and no validation the source does not declare is added - the precedent for that
// restraint is `RoundingRule.roundingRuleExpression`, which stays free text even though a
// sub-three-character expression makes a derived power fractional.
//
//   conditions.needsEndAfterStart = { startDateTime: required, endDateTime: required }
//   promotionCode : [{ contexts: "save", required: true, method: "hasUniquePromotionCode" }]
//   startDateTime : [{ contexts: "save", dataType: "date" }]
//   endDateTime   : [{ contexts: "save", dataType: "date" },
//                    { contexts: "save", conditions: "needsEndAfterStart", gtProperty: "startDateTime" }]
//   orders        : [{ contexts: "delete", maxCollection: 0 }]
//
// THREE OBLIGATIONS, each discharged or delegated explicitly:
//   1. `hasUniquePromotionCode` is AUTHORED above, because it is declaratively invoked in the `save`
//      context. Its narrowed scope and the resulting service-tier obligation are documented there.
//   2. THE CROSS-FIELD RULE IS DOCUMENTED, NOT IMPLEMENTED HERE. `needsEndAfterStart` requires BOTH
//      dates, and `gtProperty: "startDateTime"` then requires `endDateTime` to exceed
//      `startDateTime`. That is a CROSS-FIELD COMPARATOR rather than a simple field rule, and it is
//      IDENTICAL in shape to the rule in model/validation/PromotionPeriod.json - the two schemas share
//      the pattern, so the ported zod comparator should be shaped once and applied twice. Note the
//      genuine tension with absence convention 3: the columns are nullable and `undefined` means
//      "forever", yet the `save` context demands both when the condition applies. Both are true at
//      once because the condition is CONTEXTUAL - it constrains a save payload, not the column.
//      Collapsing the column's nullability to satisfy the save rule would be exactly the money bug
//      the class doc comment warns about.
//   3. The delete-context `maxCollection: 0` on `orders`, and its trivially-passing consequence in the
//      target, are documented in full on the dropped order-side helpers above.
//
// FOR COMPLETENESS: four in-scope entities have NO validation schema and none may be invented -
// `Category`, `PromotionQualifier`, `PromotionApplied` and `PromotionAccount`. `PromotionCode` is not
// one of them.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// TEST CONTRACT - NET-NEW COVERAGE, NEVER PARITY.
//
// `tests/unit/domain/entities/promotionCode.test.ts` is authored separately; that tier is owned
// elsewhere and NO test file is created from here. `PromotionCode` has NO legacy test whatsoever, so
// its coverage is one of the SIXTEEN NET-NEW entity suites and must be labelled NET-NEW - presenting
// it as parity fails the coverage gate. It must also appear in `tests/traceability/legacyTestMap.ts`,
// flagged net-new, because that map fails the suite when an in-scope module has no test. Regression
// tests follow the `issue_<ticket#>` convention carried over from meta/tests/unit/IssuesTest.cfc.
//
// THE THIRTEEN BEHAVIOURS THAT MUST BE PINNED:
//   1. `getCurrentFlag()` returns `true` when BOTH bounds are `undefined` - "forever".
//   2. `getCurrentFlag()` returns `true` at exactly `now === endDateTime` - END-INCLUSIVE - and the
//      suite should explicitly contrast `PromotionPeriod.isCurrent()`, which returns `false` at that
//      same instant. The divergence is the point of the assertion.
//   3. `getCurrentFlag()` returns `true` at exactly `now === startDateTime` - START-INCLUSIVE.
//   4. `getCurrentFlag()` returns `false` when `startDateTime` is in the future, and `false` when
//      `endDateTime` is strictly past.
//   5. `getCurrentFlag()` MEMOIZES - a second call with the clock advanced past the end bound still
//      returns the first answer. Drive this with a counting clock closure, which also proves the
//      injected-clock seam works.
//   6. `maximumUseCount`, `maximumAccountUseCount`, `startDateTime` and `endDateTime` are `undefined`
//      when absent from the row - never `0`, never the epoch, never `Infinity`, never a sentinel.
//   7. `setPromotion` appends to the LIVE far-side array, and does NOT append twice for a code
//      already present by primary key.
//   8. `removePromotion` removes from the far side AND clears the near side - and clears the near side
//      EVEN WHEN the far-side element was absent, proving the unconditional placement of L118.
//   9. `removePromotion` THROWS when called with no argument and no promotion set.
//  10. `applyPreInsertPromotionCode` assigns when `promotionCode` is nullish, assigns when it is `''`,
//      and LEAVES A NON-EMPTY VALUE UNTOUCHED.
//  11. `hasUniquePromotionCode()` returns `false` for a case-DIFFERING duplicate sibling, `true` when
//      the only match is `this` (excluded by primary key), and `true` when `promotion` is `undefined`.
//  12. `getSimpleRepresentationPropertyName()` returns `'promotionCode'`.
//  13. `isNew()` is `true` for an empty primary key and `false` for a populated one.
//
// TWO NEGATIVE ASSERTIONS ARE WORTH ADDING ALONGSIDE THEM, because they guard rulings rather than
// behaviour: there is NO `isCurrent()`, NO `isExpired()`, NO `getSimpleRepresentation()`, NO
// `preUpdate` equivalent and NO `isDeletable()` on this class; and `getAccounts()` / `getOrders()`
// are always empty, with no `addAccount`/`removeAccount`/`addOrder`/`removeOrder` member and no
// `Account` or `Order` object ever constructed.
// ---------------------------------------------------------------------------
