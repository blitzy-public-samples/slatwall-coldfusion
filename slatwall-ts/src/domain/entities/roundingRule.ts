// ---------------------------------------------------------------------------
// slatwall-ts - RoundingRule: the SwRoundingRule row and its three behaviours
//
// WHAT THIS FILE IS
// A 1:1 logic extraction of model/entity/RoundingRule.cfc (99 lines). That CFC
// is the SOLE authority for behaviour here; nothing below is derived from a
// sibling, from a convention, or from what a rounding rule "ought" to do.
//
// THE COMPONENT DECLARATION, VERBATIM [model/entity/RoundingRule.cfc:L49]
//
//   component displayname="Rounding Rule" entityname="SlatwallRoundingRule"
//   table="SwRoundingRule" persistent=true output=false accessors=true
//   extends="HibachiEntity" cacheuse="transactional"
//   hb_serviceName="roundingRuleService" hb_permission="this" {
//
// Each attribute, and what became of it:
//   * `entityname="SlatwallRoundingRule"` and `table="SwRoundingRule"` are the
//     SCHEMA CONTRACT. The `Sw*` tables are read and written unchanged by this
//     migration - no migration, no rename, no new column - so both names are
//     recorded here as the authority a repository binds its SQL against.
//   * `accessors=true` is why every persistent property below has a hand-written
//     `get<Property>()` on this class. ColdFusion generated those getters and
//     callers across the legacy tree use them, so they are part of the public
//     surface and interface parity is the acceptance contract.
//   * `hb_serviceName="roundingRuleService"` -> model/service/RoundingRuleService.cfc,
//     which owns CRUD for this entity. Preserved verbatim as inert doc text so the
//     legacy admin can still resolve it. It is NOT re-implemented as a service
//     locator: see the T2 ruling on `roundValue` below.
//   * `hb_permission="this"` is the literal four-character string `this`, NOT a
//     dotted permission path and NOT a self-reference. Contrast
//     model/entity/PriceGroupRate.cfc:L49, which carries the dotted
//     `hb_permission="priceGroup.priceGroupRates"`. Preserved verbatim as inert
//     doc text for the same reason.
//   * `cacheuse="transactional"` was Hibernate second-level cache configuration.
//     There is no ORM in the target, so it has no counterpart: entity instances
//     are constructed per request by src/repositories/mysql/** and are never
//     shared across invocations.
//   * `persistent=true output=false` are engine directives with no target meaning.
//
// BOTH `hb_*` ATTRIBUTES ARE DOC TEXT, NOT CODE, AND THAT IS DELIBERATE. They are
// not module-scope constants, because `noUnusedLocals` is enabled and an
// unexported constant that nothing reads is a compile error, and they are not
// exported constants either, because this module exports exactly one runtime
// value. JavaRB is not ported and no i18n runtime is introduced anywhere in this
// subtree; this entity declares no `rbKey`, no `hb_rbKey` and no `hb_nullRBKey`
// in any case - verified by census over all 99 source lines.
//
// THE PROPERTY CENSUS, AND WHAT IS DELIBERATELY ABSENT
// Nine persistent properties in total: four own columns [L52-L55], four audit
// columns [L58-L61], and one inverse collection [L64]. Each absence below was
// checked against the source rather than assumed:
//   * NO `remoteID`. Most siblings declare one immediately before the audit run -
//     model/entity/PromotionApplied.cfc:L64 is `property name="remoteID"
//     ormtype="string";` - and this entity does not. A `grep -c remoteID` over
//     model/entity/RoundingRule.cfc returns 0. A real schema difference, not an
//     omission, and inventing the column would breach schema continuity.
//   * NO boolean property of either casing. The census matters because a
//     case-sensitive grep for `ormtype="boolean"` under-counts:
//     model/entity/PriceGroupRate.cfc:L53 writes `ormType="boolean"` with a
//     capital T. Zero of either form here, so `cfBoolean()` is NOT imported -
//     importing it speculatively would trip `noUnusedLocals`.
//   * NO `activeFlag`, NO `sortOrder`, NO `currencyCode` and NO monetary column.
//     `Money` therefore appears in this file ONLY in the `roundValue` signature
//     and in the collaborator interface it delegates through - never as a field.
//   * NO `attributeValues`. The EAV path is not ported anywhere in this folder,
//     and the `getAttributeValue` branch of the legacy dispatcher
//     [org/Hibachi/HibachiEntity.cfc:L559] is guarded on an `attributeValues`
//     property this entity does not declare, so it was unreachable here even in
//     CFML.
//   * NO non-persistent property, so none of the memoized-accessor patterns - and
//     none of the three known memo defects that live on other entities - has any
//     counterpart here.
//
// THREE METHODS, AND FOUR EMPTY BANNERS
// The source declares exactly three methods: `roundValue` [L66-L68],
// `getRoundingRuleDirectionOptions` [L70-L76] and
// `hasExpressionWithListOfNumericValuesOnly` [L78-L86]. Lines L88-L98 are
// comment-delimited banner sections - `Non-Persistent Property Methods`,
// `Bidirectional Helper Methods` and `ORM Event Hooks` - and every one of them is
// EMPTY. An empty banner implies nothing and nothing is invented for it:
//   * No ORM lifecycle hook. Only Category, PriceGroup, ProductType and
//     PromotionCode carry `preInsert`/`preUpdate` in the in-scope slice.
//   * No bidirectional helper. The `priceGroupRates` side is `inverse="true"`
//     [L64], so the owning side is model/entity/PriceGroupRate.cfc:L68
//     (`property name="roundingRule" cfc="RoundingRule" fieldtype="many-to-one"
//     fkcolumn="roundingRuleID"`) and it owns the add/remove bookkeeping. There is
//     no `addPriceGroupRate` and no `removePriceGroupRate` to port.
//   * No smart-list surface. Smart lists are a Hibachi artifact replaced by typed
//     repository queries, and this entity declares none to begin with.
//
// THE VALIDATION SCHEMA, VERBATIM [model/validation/RoundingRule.json]
//
//   "roundingRuleName":        [{"contexts":"save","required":true}]
//   "roundingRuleExpression":  [{"contexts":"save","required":true,
//                                "method":"hasExpressionWithListOfNumericValuesOnly"}]
//   "roundingRuleDirection":   [{"contexts":"save","required":true}]
//   "priceGroupRates":         [{"contexts":"delete","maxCollection":0}]
//
// NONE of those four rules is ENFORCED in this file. There is no requiredness
// check on any of the three save-context properties and no collection-count gate.
// Entities carry the property metadata and, in this one case, the declaratively
// invoked predicate; zod schemas at the service tier carry enforcement. The one
// rule that does reach into this file is the `"method"` on
// `roundingRuleExpression`, and it is answered by the method of that name below.
//
// `roundingRuleExpression` STAYS FREE TEXT. The column has no format constraint in
// the legacy schema and none is added here - see the extended note on
// `hasExpressionWithListOfNumericValuesOnly` for the consequence that follows from
// that (an expression shorter than three characters drives a FRACTIONAL power
// inside model/service/RoundingRuleService.cfc:L95). That consequence is recorded,
// not repaired: repairing it would invent a constraint the source does not have.
//
// LIVE CALLER CENSUS - MEASURED REPO-WIDE, NOT ASSUMED
//   * `roundValue` has EXACTLY ONE live caller:
//     [model/service/PriceGroupService.cfc:L327]
//         newPrice = arguments.priceGroupRate.getRoundingRule().roundValue(newPrice);
//     It sits inside the `case "percentageOff" :` branch [L322] of
//     `calculateSkuPriceBasedOnPriceGroupRate` [L316], behind an
//     `if(!isNull(arguments.priceGroupRate.getRoundingRule()))` guard [L326]. The
//     value handed in is the output of `precisionEvaluate` at [L323] and the value
//     handed back flows into `numberFormat(newPrice, "0.00")` at [L339]. That
//     round trip is the whole justification for Money in and Money out.
//     Worth knowing, and NOT this file's to fix: the other two branches of that
//     switch - `amountOff` [L330] and `amount` [L333] - DO NOT apply the rounding
//     rule at all. The asymmetry is a legacy defect owned by
//     src/services/priceGroupService.ts, where the amount-type strategies live.
//   * `hasExpressionWithListOfNumericValuesOnly` has ZERO code callers. Its only
//     invocation in the entire legacy tree is the declarative `"method"` above. It
//     is NOT dead code, and it is authored.
//   * `getRoundingRuleDirectionOptions` has zero direct callers: it is reached
//     through the `get<Property>Options` branch of the legacy dispatcher
//     [org/Hibachi/HibachiEntity.cfc:L533-L534], which a hand-written method on
//     the component overrides outright.
//   * `getPriceGroupRates()` ON THIS ENTITY has ZERO live callers. Every
//     `getPriceGroupRates()` call site in the legacy tree is on a PriceGroup, a
//     ProductType, a Product or a Sku - never on a RoundingRule. Its only consumer
//     is the delete-context rule quoted above. See the accessor's own note for why
//     that makes the guard vacuous in the target.
//
// NO NUMBERED LEGACY DEFECT BELONGS TO THIS FILE - CHECKED, NOT OVERLOOKED
// The migration's twenty-entry legacy defect register contains no entry from
// model/entity/RoundingRule.cfc. Consequently the two-line `LEGACY-DEFECT` marker
// appears NOWHERE below, and its absence is a finding rather than an oversight.
// This file also spends none of the migration's three deliberate divergences.
// What it does carry is one SECONDARY register item - the `returntype` mismatch
// between the entity's `roundValue` and the service's - annotated as a
// `LEGACY-NOTE` on the method itself. Secondary items are not numbered and do not
// consume a divergence.
//
// No legacy TODO falls inside this file either. The one in the in-scope slice is
// the return-and-exchange no-op at [model/service/PromotionService.cfc:L542-L544]
// carrying `issue #1766`, and it belongs to the promotion engine.
//
// LAYERING - WHAT THIS FILE MAY AND MAY NOT REACH
// `src/domain/**` imports only inward or laterally: `src/lib/**` and other
// `src/domain/**` modules. It may not reach `src/repositories/**`,
// `src/handlers/**`, `src/integrations/**` or `src/services/**`, and it may not
// import `mysql2`, `dotenv`, `aws-lambda`/`@types/aws-lambda`, `src/lib/logger.ts`
// or `src/lib/config.ts`. `decimal.js` is likewise not imported: the Money value
// object is the only domain module permitted to reach it, and this file composes
// Money rather than duplicating its substrate. The ESLint `no-restricted-imports`
// boundary makes the layer half of that a BUILD FAILURE rather than a review note.
//
// This file holds no SQL, reads no environment variable, holds no credential and
// does not log. It contains no `getService`, no service locator and no ambient
// request scope: T6 makes context an explicit parameter, and the one outward reach
// the source has is an explicit constructor argument.
//
// NO USER RULES WERE PROVIDED
// The project rules document contains exactly "No user rules provided." - stated
// explicitly rather than assumed, and re-queried rather than inherited. No rule is
// invented to fill the gap, and the absence is not licence to lower the bar: the
// enterprise-standard substitute applies at full strength, which in this file
// means maximal strictness with no `any`, no suppression comment and no non-null
// assertion; one cohesive exported runtime unit and no barrel; every monetary
// value through `Money`; no module-scope mutable state; and every judgment call
// annotated where it was made. Zero files enter scope by rule mandate.
//
// LICENSE CONTINUITY is satisfied at subtree level by slatwall-ts/NOTICE-GPL.md.
// There is deliberately no per-file GPL header, and the special exception
// permitting custom code under /integrationServices/ does not extend here.
//
// TEST COVERAGE FOR THIS ENTITY IS NET-NEW
// The suite belongs at tests/unit/domain/entities/roundingRule.test.ts, is OWNED
// BY A DIFFERENT AGENT, and is not authored from here. All of it is NET-NEW and
// must be labelled net-new rather than presented as parity: no legacy test under
// meta/tests/** touches RoundingRule. The only legacy suites extended anywhere in
// this migration are meta/tests/unit/entity/BrandTest.cfc and
// meta/tests/unit/entity/ProductTest.cfc, and
// meta/tests/functional/admin/entity/ProductTest.cfc is an empty stub contributing
// zero coverage. The behavioural consequences documented on
// `hasExpressionWithListOfNumericValuesOnly` are stated concretely so the test
// author has the expected values to hand.
// ---------------------------------------------------------------------------

// The two CFML list primitives the declarative validator is built from. Both are
// used below, so neither trips `noUnusedLocals`. `listGetAt` is 1-BASED and
// answers `''` for a position out of range; `listLen('')` is 0. Those two
// properties are what make the 1-based loop port faithfully.
import { listGetAt, listLen } from '../../lib/cfml/list.js';

// CFML `len()`. Returns a COUNT and never a boolean, which is exactly what the
// validator's arithmetic needs.
import { cfLen } from '../../lib/cfml/truthiness.js';

// Type-only, and never a value import: this entity never performs arithmetic and
// never constructs a Money. It receives one and hands one back.
import type { Money } from '../valueObjects/money.js';

// Type-only, for the `priceGroupRates` inverse collection [L64].
//
// src/domain/entities/priceGroupRate.ts is one of the eighteen enumerated entity
// modules of this migration and is authored later in the locked sequence. That is
// irrelevant here for a structural reason rather than a hopeful one: `import type`
// is ERASED AT EMIT, so this module has no runtime dependency on that one and the
// mutual reference between them - PriceGroupRate declares a `roundingRule`
// many-to-one at model/entity/PriceGroupRate.cfc:L68, this entity declares the
// inverse one-to-many at L64 - can never become a runtime cycle. An entity class
// in this folder never instantiates a sibling, because row-to-entity hydration is
// a repository responsibility. A VALUE import between entity modules must never be
// introduced. Five sibling entities in this folder already reference their own
// not-yet-authored siblings exactly this way.
import type { PriceGroupRate } from './priceGroupRate.js';

// ---------------------------------------------------------------------------
// Module-local CFML `isNumeric` equivalent
//
// NOT an export, and deliberately not a sixth entry in src/lib/cfml/list.ts or a
// new export on src/lib/cfml/truthiness.ts. `list.ts` states its surface is CLOSED
// at five functions under an explicit overflow rule: a translation need that none
// of the five covers belongs INSIDE the consuming module with a documented
// annotation. `isNumeric` is not a list operation at all, and this is its only
// consumer in the subtree, so this is where it lives.
// ---------------------------------------------------------------------------

/**
 * What CFML's `isNumeric()` accepts, expressed as one pattern.
 *
 * A module-scope `const` holding an immutable `RegExp` literal, hoisted so it is
 * compiled once rather than per loop iteration. It is not mutable module state -
 * nothing reassigns it - and it carries no `g` or `y` flag, so it holds no
 * `lastIndex` cursor that could leak between calls on a warm container.
 *
 * The four branches, in order:
 *   `[+-]?`                  an optional leading sign. CFML accepts both.
 *   `\d+(?:\.\d*)?`          digits with an optional fractional part, so `'99'`,
 *                            `'0.99'` and the trailing-point form `'99.'` all pass.
 *   `\.\d+`                  the leading-point form, which is how a rounding
 *                            expression is normally written: `'.99'`, `'.95'`.
 *   `(?:[eE][+-]?\d+)?`      an optional exponent. See the reachability note on
 *                            {@link isNumeric}.
 *
 * Deliberately REJECTED, each because CFML rejects it too: the empty string,
 * a lone `'.'` or `'-'`, group separators (`'1,000'`), hexadecimal (`'0x1F'`),
 * `'Infinity'`, `'NaN'`, and an exponent with no digits (`'1e'`).
 */
const CFML_NUMERIC_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * A LOCAL EQUIVALENT of CFML's `isNumeric()`, scoped to the values that can
 * actually reach it here.
 *
 * CFML parity [model/entity/RoundingRule.cfc:L81]: this stands in for the
 * `!isNumeric(thisValue)` half of the validator's condition. `thisValue` is always
 * the return of `listGetAt`, so it is always a `string` - which is why the
 * parameter is typed `string` and not the wider union a general-purpose helper
 * would need.
 *
 * WHITESPACE IS TRIMMED BEFORE TESTING, and that is CFML parity rather than
 * convenience. Both target engines tolerate surrounding whitespace in
 * `isNumeric()`, and whitespace genuinely reaches here: `src/lib/cfml/list.ts`
 * NEVER TRIMS an element, so a rounding expression written `'.95, .99'` yields the
 * second element as `' .99'` with its leading space intact. That element must be
 * judged numeric, exactly as CFML judges it. Note the interaction with the
 * character-count arithmetic in the validator - the space is counted by `len()` and
 * shifts the position `find()` reports, so both sides of the condition see the
 * untrimmed value and only this predicate looks past the padding. That asymmetry is
 * CFML's, and it is preserved.
 *
 * ON THE EXPONENT BRANCH, which is very nearly unreachable and is included for
 * faithfulness rather than for use. The validator only consults this predicate
 * after `(len(v) - find('.', v)) === 2` has already held, and no exponent form
 * satisfies that together with a decimal point: `'9.9e5'` gives `5 - 2 = 3`. The
 * forms that DO reach here are two-character values with no point at all, such as
 * `'99'` (which passes) and `'1e'` (which the pattern rejects, as CFML does).
 *
 * TWO CFML BEHAVIOURS ARE DELIBERATELY NOT REPRODUCED, because neither can arise
 * from a `string` element of a comma list: `isNumeric()` applied to a boolean, and
 * `isNumeric()` applied to a date. Widening this predicate to cover them would add
 * unreachable behaviour and invite a caller to depend on it.
 *
 * @param value - one element of a rounding-rule expression list, exactly as
 *   `listGetAt` returned it.
 * @returns `true` when CFML would consider `value` numeric.
 */
function isNumeric(value: string): boolean {
  return CFML_NUMERIC_PATTERN.test(value.trim());
}

// ---------------------------------------------------------------------------
// Co-located type declarations
//
// All three are TYPE-ONLY and erased at emit, so this module still exports exactly
// ONE runtime value - the `RoundingRule` class. Each exists because a signature on
// that class requires it; none is a speculative convenience, and there is no
// barrel, no `index.ts` and no re-export anywhere in this subtree.
// ---------------------------------------------------------------------------

/**
 * The three rounding directions the legacy option list offers.
 *
 * DERIVED FROM [model/entity/RoundingRule.cfc:L70-L76], not invented: the union
 * members are exactly the three `value` strings that method returns, in the order
 * it returns them. They are also the three literals
 * model/service/RoundingRuleService.cfc branches on, and `'Closest'` is that
 * service's declared default at [model/service/RoundingRuleService.cfc:L88].
 *
 * ★ THIS UNION DOES NOT CONSTRAIN THE PERSISTED COLUMN, and must not be made to.
 * `roundingRuleDirection` is `ormtype="string"` [L55] with no ORM-level check
 * constraint and no `hb_formFieldType` enumeration, so `SwRoundingRule` can and
 * does hold any string at all. The option list is ADVISORY - it populates an admin
 * select - exactly as in CFML. Narrowing the column to this union would reject rows
 * the legacy system accepts and would turn a data-quality question into a hydration
 * failure, so {@link RoundingRule.getRoundingRuleDirection} deliberately returns
 * `string | undefined` and no validation is performed.
 */
export type RoundingRuleDirection = 'Closest' | 'Up' | 'Down';

/**
 * One entry of the direction option list.
 *
 * The two keys are the legacy struct keys VERBATIM [model/entity/RoundingRule.cfc:L72-L74]:
 * `value` and `name`. Renaming either - to `label`, `text` or `display` - would
 * break the shape a consumer diffs against the CFC, so neither is renamed.
 *
 * `name` is typed `string` rather than a union of the three display literals on
 * purpose: it is human-readable text, and pinning it as a type would make an
 * innocuous copy edit a compile error in every consumer. The `value` side is where
 * the meaning lives, and that one IS pinned.
 */
export interface RoundingRuleDirectionOption {
  readonly value: RoundingRuleDirection;
  readonly name: string;
}

/**
 * The collaborator surface this entity needs from the rounding-rule service.
 *
 * CO-LOCATED DELIBERATELY, and this is a ruling rather than a preference.
 * `src/domain/**` may not import `src/services/**`, so the concrete service is
 * unreachable from here by design; and the port budget under `src/domain/ports/` is
 * closed at thirteen interfaces, so there is no fourteenth port to declare. An
 * interface declared at the point of use is therefore the faithful translation: it
 * names precisely the one method the legacy body invokes and nothing more.
 * `src/services/roundingRuleService.ts` satisfies it STRUCTURALLY - TypeScript
 * needs no `implements` clause and the service never imports this file to get one -
 * and `src/handlers/bootstrap.ts` wires the concrete instance in.
 *
 * The signature mirrors [model/service/RoundingRuleService.cfc:L84-L86] exactly:
 *
 *   public numeric function roundValueByRoundingRule(required any value,
 *                                                   required any roundingRule)
 *
 * Two translations of that line, both load-bearing:
 *   * `any value` becomes `Money`. Every monetary value in the target passes
 *     through the Money value object, so no `number` appears in a monetary position
 *     anywhere in this file.
 *   * `any roundingRule` becomes `RoundingRule`. The legacy call passes
 *     `roundingRule=this` [model/entity/RoundingRule.cfc:L67], and the service's
 *     body reads `getRoundingRuleExpression()` and `getRoundingRuleDirection()` off
 *     it [model/service/RoundingRuleService.cfc:L85] - both of which this class
 *     provides.
 *
 * SYNCHRONOUS, with no promise anywhere in the signature. The async boundary rule
 * is per-method: a method becomes `async` only where its body genuinely reaches a
 * repository or another I/O port. `roundValueByRoundingRule` reaches neither - it
 * reads two already-materialized fields off the entity handed to it and performs
 * decimal arithmetic - so making it `async` would invent an await point the legacy
 * system does not have and would force `roundValue` to become async with it,
 * breaking the one live caller at [model/service/PriceGroupService.cfc:L327], which
 * consumes the result synchronously inside a `switch`.
 *
 * Contrast the SIBLING service method that legitimately is async:
 * `roundValueByRoundingRuleID` [model/service/RoundingRuleService.cfc:L79-L82]
 * resolves the rule through `getRoundingRuleDetailsByID` [L67-L77] and therefore
 * does reach the DAO. It is deliberately NOT part of this interface: this entity
 * already holds its own expression and direction, so it never needs a lookup.
 */
export interface RoundingRuleValueRounder {
  roundValueByRoundingRule(value: Money, rule: RoundingRule): Money;
}

/**
 * The `SwRoundingRule` row: a named rounding expression, a direction, and the three
 * behaviours the legacy component declares over them.
 *
 * A CLASS rather than an interface or a bag of free functions, for two reasons that
 * are both contractual rather than stylistic. First, the legacy entities carry
 * behaviour and not merely data - this one carries a delegating money operation, an
 * option list and a declaratively invoked predicate - and collapsing that into free
 * functions would dissolve the surface a reviewer diffs against the CFC. Second,
 * interface parity IS the acceptance contract, so every public method name below is
 * the legacy CFML name VERBATIM in camelCase. That is exactly why eslint.config.mjs
 * deliberately enables no `naming-convention`, `camelcase` or `id-match` rule.
 *
 * A STANDALONE CLASS WITH NO BASE. The legacy component extends `HibachiEntity`
 * through a three-level chain - the local model/entity/HibachiEntity.cfc (274 lines)
 * extending Slatwall.org.Hibachi.HibachiEntity - and none of it is ported. The
 * intermediate class alone holds twelve further `getService(...)` sites (L123, L130,
 * L135, L145, L178, L180, L182, L194, L196, L207, L257, L266), seven of them
 * reaching `attributeService`. All twelve are MOOT here because the EAV path is not
 * ported and this entity declares no `attributeValues` - but moot is not the same as
 * absent, so they are recorded rather than silently re-implemented. There is no base
 * class in the target, no inheritance emulation, no `onMissingMethod` equivalent,
 * and above all NO DYNAMIC DISPATCH: no `Proxy`, no index signature, no
 * `evaluate()`, no `variables.` scope object. Everything the legacy dispatcher could
 * synthesise for this entity is either hand-written below or genuinely unreachable.
 *
 * ASSOCIATIONS ARRIVE ALREADY MATERIALIZED. Hibernate lazy collections have no
 * equivalent in a driver-only stack, so src/repositories/mysql/** owns
 * row-to-entity hydration and documents the fetch shape at the producing method;
 * this class receives what it is given and NEVER simulates laziness. There is no
 * fetch-shape ruling to make for this entity, and that was checked rather than
 * overlooked: a case-insensitive census found NO `fetch=` and NO `lazy=` attribute
 * anywhere in model/entity/RoundingRule.cfc. For contrast, the only in-scope
 * `fetch="join"` sites are model/entity/Product.cfc:L68-L70 and
 * model/entity/PromotionPeriod.cfc:L59.
 *
 * IMMUTABLE. Every field is `readonly` and there is no setter for anything, because
 * the legacy component declares no setter of its own - CFML's `accessors=true`
 * generated write-side accessors, but the only writes in the legacy tree go through
 * `saveRoundingRule` [model/service/RoundingRuleService.cfc:L56-L64], which is a
 * service-tier concern. Instances are constructed per request and are never shared
 * across Lambda invocations, so nothing here is mutable state on a warm container.
 */
export class RoundingRule {
  // --- Persistent Properties [model/entity/RoundingRule.cfc:L52-L55] ---------------------------

  /**
   * Primary key. [model/entity/RoundingRule.cfc:L52]
   *
   *   property name="roundingRuleID" ormtype="string" length="32" fieldtype="id"
   *   generator="uuid" unsavedvalue="" default="";
   *
   * `string` and never `string | undefined`: `default=""` means the column always
   * holds a string, possibly the empty one. That empty string is LOAD-BEARING - it
   * is exactly what {@link RoundingRule.isNew} keys on, and it is the same value
   * `unsavedvalue=""` told Hibernate to treat as unsaved.
   *
   * `length="32"` records the column width for the schema contract. It is NOT
   * enforced here, and `generator="uuid"` is NOT reproduced: ID generation belongs
   * to the repository on insert, and this class never mints an identifier.
   */
  private readonly roundingRuleID: string;

  /**
   * The rule's display name. [model/entity/RoundingRule.cfc:L53]
   *
   *   property name="roundingRuleName" ormtype="string";
   *
   * No `default`, no `notnull`, so the column is genuinely nullable and this is
   * `string | undefined`. model/validation/RoundingRule.json requires it in the
   * `save` context; that rule is enforced at the service tier, not here, so a
   * hydrated row may legitimately carry `undefined` for it.
   */
  private readonly roundingRuleName: string | undefined;

  /**
   * The rounding expression: a CFML comma list of decimal candidates such as
   * `'.99'` or `'.95,.99'`. [model/entity/RoundingRule.cfc:L54]
   *
   *   property name="roundingRuleExpression" ormtype="string";
   *
   * ★ FREE TEXT, WITH NO FORMAT CONSTRAINT, AND THAT IS THE POINT. There is no
   * check constraint, no length limit, no pattern and no `hb_formFieldType` on the
   * legacy column, and none is added here. Two consequences follow, both recorded
   * rather than repaired:
   *   * model/service/RoundingRuleService.cfc:L95 derives its step as
   *     `var rrPower = 1 * (10 ^ (len(rr)-3));` - so an element SHORTER THAN THREE
   *     CHARACTERS makes the exponent negative and, for a two-character element,
   *     drives a FRACTIONAL power. Nothing in the legacy system prevents that.
   *   * the declarative predicate below rejects some of those shapes at save time
   *     and admits others, on arithmetic that is not the "two decimal places" test
   *     it looks like. See
   *     {@link RoundingRule.hasExpressionWithListOfNumericValuesOnly}.
   *
   * `undefined` when the column is null. It is NOT coerced to `''` here: the
   * distinction between "no expression recorded" and "the empty expression" is real
   * at the persistence boundary, and normalizing it away would hide it from the one
   * consumer that has to make a decision about it. The predicate below does the
   * normalization explicitly, at its own call site, with the reasoning attached.
   */
  private readonly roundingRuleExpression: string | undefined;

  /**
   * The rounding direction. [model/entity/RoundingRule.cfc:L55]
   *
   *   property name="roundingRuleDirection" ormtype="string";
   *
   * LEGACY-NOTE [model/entity/RoundingRule.cfc:L55]: the source line carries a
   * trailing space after its semicolon, and the file uses CRLF line endings. Both
   * are cosmetic warts with no semantic effect; recorded so a reviewer diffing this
   * file against the CFC knows they were seen, and deliberately not reproduced.
   *
   * Typed `string | undefined` and NOT {@link RoundingRuleDirection}. See the ★ note
   * on that union for the full ruling: the option list is advisory and the database
   * does not constrain this column, so narrowing it here would reject rows the
   * legacy system accepts. No validation is performed.
   */
  private readonly roundingRuleDirection: string | undefined;

  // --- Audit properties [model/entity/RoundingRule.cfc:L58-L61] --------------------------------
  //
  // All four carry `hb_populateEnabled="false"`, which is how the legacy framework
  // excluded them from mass assignment. The TypeScript equivalent needs no
  // mechanism at all: they are `readonly`, set once during hydration, and exposed
  // through getters with no setter anywhere in this class.
  //
  // Both account-side properties are declared `cfc="Account" fieldtype="many-to-one"`
  // in the source. model/entity/Account.cfc is explicitly OUT OF SCOPE - the plan
  // excludes model/service/AccountService.cfc and the whole account module - so each
  // many-to-one collapses to its opaque foreign-key column. No `Account` type is
  // imported, neither column is ever typed as an entity, and no `Account` instance
  // is ever constructed. The columns themselves are PRESERVED rather than dropped,
  // because the schema contract must stay auditable.

  /** `createdDateTime`, or `undefined`. [model/entity/RoundingRule.cfc:L58] */
  private readonly createdDateTime: Date | undefined;

  /**
   * The `createdByAccountID` column, opaque. [model/entity/RoundingRule.cfc:L59]
   *
   *   property name="createdByAccount" hb_populateEnabled="false" cfc="Account"
   *   fieldtype="many-to-one" fkcolumn="createdByAccountID";
   */
  private readonly createdByAccountID: string | undefined;

  /** `modifiedDateTime`, or `undefined`. [model/entity/RoundingRule.cfc:L60] */
  private readonly modifiedDateTime: Date | undefined;

  /**
   * The `modifiedByAccountID` column, opaque. [model/entity/RoundingRule.cfc:L61]
   *
   *   property name="modifiedByAccount" hb_populateEnabled="false" cfc="Account"
   *   fieldtype="many-to-one" fkcolumn="modifiedByAccountID";
   */
  private readonly modifiedByAccountID: string | undefined;

  // --- Related Object Properties [model/entity/RoundingRule.cfc:L64] --------------------------

  /**
   * The `priceGroupRates` inverse one-to-many. [model/entity/RoundingRule.cfc:L64]
   *
   *   property name="priceGroupRates" singularname="priceGroupRate"
   *   cfc="PriceGroupRate" fieldtype="one-to-many" fkcolumn="roundingRuleID"
   *   inverse="true";
   *
   * ALWAYS AN ARRAY, never `undefined`. CFML's ORM answers an initialized collection
   * for a one-to-many, so `arrayLen(x.getPriceGroupRates())` is always a legal
   * question in the legacy tree; widening this to `readonly PriceGroupRate[] |
   * undefined` would break that parity and force every consumer to branch on a state
   * the legacy system never presents.
   *
   * `inverse="true"` means this side owns NO bookkeeping. The owning side is
   * model/entity/PriceGroupRate.cfc:L68 (`property name="roundingRule"
   * cfc="RoundingRule" fieldtype="many-to-one" fkcolumn="roundingRuleID"
   * hb_optionsNullRBKey="define.none"`), which is why this class declares no
   * `addPriceGroupRate` and no `removePriceGroupRate` - the source declares neither,
   * and its Bidirectional Helper Methods banner is empty.
   *
   * ★ AND IT CREATES A REAL ANTI-CORRUPTION TENSION THAT MUST NOT BE PAPERED OVER.
   * model/validation/RoundingRule.json declares
   * `priceGroupRates: [{"contexts":"delete","maxCollection":0}]` - a guard meaning
   * "refuse to delete a rounding rule that price-group rates still reference". In
   * CFML that rule consults a LIVE Hibernate lazy collection, so it BLOCKS whenever
   * child rows exist. In TypeScript it would consult this array, which reflects only
   * what the repository chose to materialize - so on a rule hydrated without its
   * rates the array is empty and the rule TRIVIALLY PASSES. Delete-context
   * enforcement therefore CANNOT be an in-memory length check: it must be a
   * `SELECT COUNT(*) FROM SwPriceGroupRate WHERE roundingRuleID = ?` in
   * src/repositories/mysql/**, or an equivalent service-tier gate. That is stated
   * here, at the site, because the consequence is invisible from anywhere else. The
   * same situation holds for `Brand.products`, `PriceGroup.appliedOrderItems` and
   * `PromotionCode.orders`.
   */
  private readonly priceGroupRates: readonly PriceGroupRate[];

  // --- Injected collaborator ------------------------------------------------------------------

  /**
   * The rounding-rule service, reduced to the single method this entity calls.
   *
   * T2 IN ONE FIELD: this replaces the lone `getService("roundingRuleService")`
   * lookup at [model/entity/RoundingRule.cfc:L67] - the only `getService(` site in
   * the whole component, confirmed by census - with an explicit, compile-checked
   * constructor argument. No runtime bean-factory scan, no service locator, no
   * ambient scope. See {@link RoundingRuleValueRounder} for why the interface is
   * co-located rather than imported.
   */
  private readonly valueRounder: RoundingRuleValueRounder;

  /**
   * Hydrates one `SwRoundingRule` row and injects its one collaborator.
   *
   * TWO PARAMETERS, and the split is meaningful: `init` is DATA read out of the
   * database, `valueRounder` is a COLLABORATOR wired in the composition root. Fusing
   * them into one object would blur a row against a dependency and make the
   * distinction that T1 and T2 exist to draw invisible at the call site.
   *
   * `init` is a single readonly INLINE object type rather than a second exported
   * interface, matching the convention this folder already follows: the module
   * exports exactly one runtime unit, and an exported `RoundingRuleProps` would be a
   * second name for something only the repository ever constructs.
   *
   * EVERY NULLABLE SLOT IS REQUIRED AND TYPED `T | undefined`, never an optional
   * `?:` slot. `exactOptionalPropertyTypes` is enabled, so "absent" and
   * "present-but-undefined" are genuinely different types, and requiring the key
   * forces a hydrating repository to state "I looked and found nothing" instead of
   * silently omitting it. `priceGroupRates` is required for the same reason and is
   * NOT defaulted here - a repository that did not fetch the collection must say so
   * by passing an empty array, which is precisely the state the ★ note on that field
   * warns makes the delete guard vacuous. There is deliberately no `= {}` default on
   * the parameter: a rounding rule with no data at all is not a thing the legacy
   * system produces, and no legacy test constructs one.
   *
   * No clock parameter, because this entity performs no date comparison of any kind:
   * its two timestamps are carried and returned, never tested. Contrast
   * `PromotionPeriod.isCurrent()`, which takes an explicit `now` for exactly that
   * reason.
   */
  constructor(
    init: {
      readonly roundingRuleID: string;
      readonly roundingRuleName: string | undefined;
      readonly roundingRuleExpression: string | undefined;
      readonly roundingRuleDirection: string | undefined;
      readonly createdDateTime: Date | undefined;
      readonly createdByAccountID: string | undefined;
      readonly modifiedDateTime: Date | undefined;
      readonly modifiedByAccountID: string | undefined;
      readonly priceGroupRates: readonly PriceGroupRate[];
    },
    valueRounder: RoundingRuleValueRounder,
  ) {
    this.roundingRuleID = init.roundingRuleID;
    this.roundingRuleName = init.roundingRuleName;
    this.roundingRuleExpression = init.roundingRuleExpression;
    this.roundingRuleDirection = init.roundingRuleDirection;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
    this.priceGroupRates = init.priceGroupRates;
    this.valueRounder = valueRounder;
  }

  // --- Accessors --------------------------------------------------------------------------------
  //
  // `accessors=true` on [model/entity/RoundingRule.cfc:L49] made ColdFusion generate
  // one getter per persistent property, and callers across the legacy tree use them -
  // so these ARE part of the public surface even though no hand-written body exists in
  // the CFC to port. The locator on each one cites the property declaration it serves.
  //
  // GETTERS ONLY. CFML also generated setters, and not one of them is reproduced,
  // because nothing in the legacy tree calls a setter on this entity: writes go
  // through `saveRoundingRule` [model/service/RoundingRuleService.cfc:L56-L64]. Adding
  // setters would widen the surface beyond the source and break the immutability this
  // class relies on.
  //
  // There is deliberately NO `getRoundingRule()` self-accessor and no
  // `getPrimaryIDValue()`. The latter was a framework member
  // [org/Hibachi/HibachiEntity.cfc:L244-L246] implemented by dynamic invocation
  // (`this.invokeMethod("get#getPrimaryIDPropertyName()#")`), and reproducing it would
  // mean reproducing dynamic dispatch. `isNew()` below reads the field directly
  // instead, which is what that indirection resolved to for this entity anyway.

  /** [model/entity/RoundingRule.cfc:L52] Always a string; `''` means unsaved. */
  getRoundingRuleID(): string {
    return this.roundingRuleID;
  }

  /** [model/entity/RoundingRule.cfc:L53] */
  getRoundingRuleName(): string | undefined {
    return this.roundingRuleName;
  }

  /**
   * [model/entity/RoundingRule.cfc:L54]
   *
   * The raw persisted expression, UNNORMALIZED: no trim, no case change, no default
   * substituted for a null column. Callers get exactly what the column holds.
   *
   * `undefined` is meaningful downstream and must not be collapsed to `''` on the way
   * out. model/service/RoundingRuleService.cfc:L88 declares
   * `roundingExpression="0.00"` as a DEFAULT, and CFML applies a declared default when
   * an argument arrives null - so a rule with no expression is rounded by `'0.00'`,
   * which is emphatically not a no-op. Handing `''` out instead would suppress that
   * default and silently change the arithmetic. The decision belongs to the service;
   * this accessor only reports the truth.
   */
  getRoundingRuleExpression(): string | undefined {
    return this.roundingRuleExpression;
  }

  /**
   * [model/entity/RoundingRule.cfc:L55]
   *
   * `string | undefined` and NOT {@link RoundingRuleDirection} - see the ★ ruling on
   * that union. The value is whatever `SwRoundingRule.roundingRuleDirection` holds,
   * unvalidated and unnarrowed, exactly as CFML returned it.
   */
  getRoundingRuleDirection(): string | undefined {
    return this.roundingRuleDirection;
  }

  /** [model/entity/RoundingRule.cfc:L58] */
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /** The `createdByAccountID` column, opaque. [model/entity/RoundingRule.cfc:L59] */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /** [model/entity/RoundingRule.cfc:L60] */
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /** The `modifiedByAccountID` column, opaque. [model/entity/RoundingRule.cfc:L61] */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  /**
   * The materialized `priceGroupRates` collection. [model/entity/RoundingRule.cfc:L64]
   *
   * Returns `readonly PriceGroupRate[]` and NEVER `undefined`, so
   * `.length` is always a legal question - matching the `arrayLen(...)` idiom the
   * legacy tree uses on every other entity's rate collection.
   *
   * `readonly` on the array, not merely on the field: handing out a mutable reference
   * would let a caller reproduce the legacy
   * `arrayAppend(x.getPriceGroupRates(), this)` idiom
   * [model/entity/PriceGroupRate.cfc:L184] against THIS collection, which is the
   * inverse side and owns no bookkeeping. Nothing in the legacy tree does that to a
   * RoundingRule - measured: this accessor has ZERO live callers, every
   * `getPriceGroupRates()` call site being on a PriceGroup, ProductType, Product or
   * Sku - and the type makes it impossible rather than merely unlikely.
   *
   * See the ★ note on the field for why the delete-context `maxCollection: 0` guard
   * cannot be answered from this array.
   */
  getPriceGroupRates(): readonly PriceGroupRate[] {
    return this.priceGroupRates;
  }

  // --- Framework members ------------------------------------------------------------------------

  /**
   * Whether this instance has been persisted yet.
   *
   * Inherited from the framework base in the legacy tree rather than declared on the
   * component, and authored here because it is GENUINELY CALLED on a RoundingRule:
   * [model/service/RoundingRuleService.cfc:L57] is `if(!arguments.entity.isNew())`,
   * guarding the memo eviction inside `saveRoundingRule`. Omitting it would leave the
   * ported service unable to express its own first line.
   *
   * The empty-string test is not an approximation of the framework - it is literally
   * what the framework does, and the chain was read rather than assumed.
   * `isNew()` at [org/Hibachi/HibachiEntity.cfc:L707-L709] returns `getNewFlag()`;
   * `getNewFlag()` at [org/Hibachi/HibachiEntity.cfc:L571-L576] is
   * `if(getPrimaryIDValue() == "") { return true; } return false;`; and
   * `getPrimaryIDValue()` at [org/Hibachi/HibachiEntity.cfc:L244-L246] dynamically
   * invokes this entity's own `getRoundingRuleID()`. The empty string it compares
   * against is the `unsavedvalue=""` / `default=""` on the id property at
   * [model/entity/RoundingRule.cfc:L52]. The local model/entity/HibachiEntity.cfc
   * overrides neither method - verified.
   *
   * LEGACY-NOTE [org/Hibachi/HibachiEntity.cfc:L707-L711]: `isNew()` sits under that
   * file's `Deprecated Methods` banner, while `getNewFlag()` does not. The deprecated
   * spelling is nevertheless the one the in-scope caller uses, so it is the one
   * ported; `getNewFlag()` is NOT also exposed, because nothing in scope calls it and
   * two names for one boolean would widen the surface beyond the source.
   *
   * This is the ONLY framework member authored on this entity. Nothing else the
   * dispatcher at [org/Hibachi/HibachiEntity.cfc:L507-L565] can synthesise is
   * concretely called on a RoundingRule, so there is no `hasAny*` (the one collection
   * is never tested that way), no `hasUnique*` (the validation schema declares no
   * `unique` rule), no `get*AssignedIDList`, no `get*SmartList`, no `get*Struct`, no
   * `get*Count`, and no `getAttributeValue` - that last one unreachable in any case,
   * since the L559 guard requires an `attributeValues` property this entity does not
   * declare. `getRoundingRuleDirectionOptions()` is the one dispatcher-shaped name
   * that IS present, and it is present because the component hand-writes it.
   */
  isNew(): boolean {
    return this.roundingRuleID === '';
  }

  // --- Declared methods [model/entity/RoundingRule.cfc:L66-L86] --------------------------------

  /**
   * Applies this rule to a monetary value.
   *
   * CFML parity [model/entity/RoundingRule.cfc:L66-L68], the body VERBATIM:
   *
   *   public numeric function roundValue(required any value) {
   *       return getService("roundingRuleService").roundValueByRoundingRule(
   *           value=arguments.value, roundingRule=this);
   *   }
   *
   * T2 APPLIED: the `getService("roundingRuleService")` lookup - the ONLY `getService(`
   * site in the entire component, confirmed by census over all 99 source lines - is now
   * the constructor-injected {@link RoundingRuleValueRounder}. The delegation itself is
   * unchanged: same collaborator method, same two arguments, `this` still passed as the
   * rule.
   *
   * SYNCHRONOUS. The legacy body performs no DAO access and no ORM access, so there is
   * nothing to await; the async boundary rule is per-method and this method does not
   * cross one. Its one live caller consumes the result synchronously inside a `switch`
   * at [model/service/PriceGroupService.cfc:L327], so making it async would break that
   * call site outright.
   *
   * `Money` IN AND `Money` OUT. The legacy signature is `required any value` and the
   * legacy return type is `numeric`; both become `Money`, because every monetary value
   * in the target passes through the value object and no floating-point arithmetic ever
   * touches money. The single live caller confirms this is the right shape rather than a
   * generalization: [model/service/PriceGroupService.cfc:L327] hands in the output of
   * `precisionEvaluate` from [L323] and feeds the result into
   * `numberFormat(newPrice, "0.00")` at [L339] - a monetary value in both directions.
   *
   * NO ROUNDING LOGIC LIVES HERE, and none may be added. The decimal-string algorithm -
   * `left()` slicing, candidate concatenation, the `10 ^ (len(rr)-3)` step and the
   * closest/up/down selection - is entirely
   * [model/service/RoundingRuleService.cfc:L88-L175] and is ported into
   * src/services/roundingRuleService.ts, along with its measured characterization
   * outputs. This method is a one-line delegation in the source and is a one-line
   * delegation here.
   *
   * LEGACY-NOTE [model/entity/RoundingRule.cfc:L66 vs model/service/RoundingRuleService.cfc:L88]:
   * the entity declares returntype="numeric" while the service's roundValue() declares
   * returntype="string" and returns a decimal string; CFML coerced implicitly.
   * The target performs the conversion explicitly at the service boundary.
   *
   * The mismatch is three-deep rather than two-deep, and the middle link is worth
   * naming: the intermediate `roundValueByRoundingRule`
   * [model/service/RoundingRuleService.cfc:L84] ALSO declares `numeric`, so the
   * string-returning `roundValue` at [L88] is wrapped by a `numeric` declaration at
   * [L84] and reached through another at [L66] - and [L79]
   * (`roundValueByRoundingRuleID`) is a fourth `numeric` declaration over the same
   * string. This is a SECONDARY register item: it is not one of the twenty numbered
   * legacy defects, it consumes none of the migration's three deliberate divergences,
   * and it is resolved by typing rather than by changing behaviour.
   *
   * @param value - the amount to round.
   * @returns the rounded amount, as produced by the collaborator.
   */
  roundValue(value: Money): Money {
    // Legacy [model/entity/RoundingRule.cfc:L67]:
    //   getService("roundingRuleService").roundValueByRoundingRule(
    //       value=arguments.value, roundingRule=this)
    return this.valueRounder.roundValueByRoundingRule(value, this);
  }

  /**
   * The admin-facing option list for `roundingRuleDirection`.
   *
   * CFML parity [model/entity/RoundingRule.cfc:L70-L76], the body VERBATIM:
   *
   *   public array function getRoundingRuleDirectionOptions() {
   *       return [
   *           {value="Closest", name="Round to Closest"},
   *           {value="Up", name="Only Round Up"},
   *           {value="Down", name="Only Round Down"}
   *       ];
   *   }
   *
   * EXACTLY THREE OPTIONS, IN THAT ORDER, WITH THOSE EXACT STRINGS. The return type is a
   * readonly TUPLE rather than a readonly array precisely so the count and the order are
   * part of the type: adding a fourth direction, dropping one, or reordering them
   * becomes a compile error rather than a silent behavioural change. Order is not
   * cosmetic here - it is the order the option appears in the admin select.
   *
   * THE DISPLAY NAMES ARE HARDCODED ENGLISH LITERALS, NOT `rbKey`s, and that is a
   * finding rather than an omission. Every other user-facing string in the legacy admin
   * resolves through JavaRB, and these three do not - the source writes
   * `name="Round to Closest"` inline. They are preserved verbatim and NO LOCALISATION IS
   * INTRODUCED: JavaRB is not ported, this subtree has no i18n runtime, and inventing
   * resource-bundle keys for three strings the source hardcodes would fabricate a
   * mechanism the legacy system does not have here.
   *
   * PURE AND SYNCHRONOUS: no `this` access, no I/O, no state. A fresh array is returned
   * on every call, exactly as the CFML literal was re-evaluated on every call, so a
   * caller can never mutate a shared instance - and `readonly` on the tuple and on both
   * keys means a caller cannot mutate its own copy either. Hoisting the literal to
   * module scope would create shared state on a warm Lambda container for no benefit,
   * and is deliberately not done.
   *
   * This method OVERRIDES what the legacy dispatcher would otherwise have synthesised
   * for a `get<Property>Options` name [org/Hibachi/HibachiEntity.cfc:L533-L534]. Because
   * the component hand-writes it, the dispatcher branch never runs for this name - which
   * is why a hand-written method is the faithful port and dynamic dispatch is not needed
   * to explain it.
   *
   * @returns the three directions, in legacy order.
   */
  getRoundingRuleDirectionOptions(): readonly [
    RoundingRuleDirectionOption,
    RoundingRuleDirectionOption,
    RoundingRuleDirectionOption,
  ] {
    return [
      { value: 'Closest', name: 'Round to Closest' },
      { value: 'Up', name: 'Only Round Up' },
      { value: 'Down', name: 'Only Round Down' },
    ];
  }

  /**
   * Whether every element of `roundingRuleExpression` passes the legacy numeric shape
   * test.
   *
   * THIS IS A DECLARATIVELY INVOKED VALIDATOR, and it is NOT dead code even though no
   * line of CFML calls it. model/validation/RoundingRule.json invokes it by name in the
   * `save` context:
   *
   *   "roundingRuleExpression": [{"contexts":"save","required":true,
   *                              "method":"hasExpressionWithListOfNumericValuesOnly"}]
   *
   * Branch 2 of the HibachiEntity dynamic dispatcher - the `hasUnique<Prop>`-family
   * declarative invocation [org/Hibachi/HibachiEntity.cfc:L514]. Authored as an
   * explicit typed method: TypeScript must NOT emulate dynamic dispatch
   * (no Proxy, no index signatures).
   *
   * CFML parity [model/entity/RoundingRule.cfc:L78-L86], the body VERBATIM:
   *
   *   public boolean function hasExpressionWithListOfNumericValuesOnly() {
   *       for(var i=1; i<=listLen(getRoundingRuleExpression()); i++) {
   *           var thisValue = listGetAt(getRoundingRuleExpression(), i);
   *           if((len(thisValue) - find(".", thisValue)) != 2 || !isNumeric(thisValue)) {
   *               return false;
   *           }
   *       }
   *       return true;
   *   }
   *
   * WHAT THIS TEST ACTUALLY ENFORCES - AND IT IS NOT "TWO DECIMAL PLACES". CFML's
   * `find(".", v)` returns a 1-BASED POSITION, or **0** when the substring is absent, and
   * the arithmetic is built on that 0. So the condition admits two quite different
   * shapes and rejects a third that looks obviously valid:
   *   * `'0.99'` PASSES: len 4, point at position 2, `4 - 2 = 2`, and it is numeric.
   *   * `'.99'`  PASSES: len 3, point at position 1, `3 - 1 = 2`.
   *   * `'99'`   PASSES: len 2, NO point so `find` is 0, `2 - 0 = 2`, and it is numeric.
   *     A bare two-character integer is accepted purely because the absent-point
   *     sentinel is zero.
   *   * `'9.9'`  FAILS: len 3, point at position 2, `3 - 2 = 1`. One decimal place is
   *     rejected.
   *   * `'0.999'` FAILS: len 5, point at position 2, `5 - 2 = 3`.
   * The real rule is therefore "exactly two characters after the dot, OR a bare
   * two-character numeric". That is reproduced as written and NOT rewritten into the
   * two-decimal-places test it resembles.
   *
   * AN EMPTY EXPRESSION RETURNS `true`. `listLen('')` is 0, so the loop body never
   * executes even once and control falls straight through to `return true`. The
   * predicate is therefore VACUOUSLY SATISFIED by an empty expression - it is the
   * separate `"required":true` rule in the same schema entry that rejects an empty
   * value, not this method. Reproduced deliberately; "fixing" it here would duplicate
   * requiredness enforcement inside a shape check.
   *
   * A NULL COLUMN IS NORMALIZED TO THE EMPTY LIST, EXPLICITLY AND AT THIS ONE SITE.
   * `roundingRuleExpression` is nullable [L54] and this file keeps `undefined` visible
   * on the accessor rather than coercing it there. CFML's `listLen()` requires a string
   * and the legacy engines coerce a null argument to the empty string before counting,
   * which yields 0 - observationally identical to the empty-expression case documented
   * above, and the same `true`. Normalizing here rather than in the field or the getter
   * keeps the coercion where its consequence is visible, and keeps the persistence
   * distinction between "no expression" and "the empty expression" intact for the
   * service tier, which treats them differently: see the note on
   * {@link RoundingRule.getRoundingRuleExpression}.
   *
   * NO FORMAT VALIDATION IS ADDED ANYWHERE. `roundingRuleExpression` stays free text.
   * An element shorter than three characters drives a fractional power at
   * [model/service/RoundingRuleService.cfc:L95] (`1 * (10 ^ (len(rr)-3))`), and this
   * predicate does not prevent that - `'99'` passes it and is two characters long.
   * Recorded without asserting any repair.
   *
   * THE LOOP IS 1-BASED AND THE BOUND IS RE-EVALUATED, both faithfully. `listGetAt` is
   * 1-based and answers `''` for a position out of range, so the `i = 1; i <= listLen()`
   * shape ports directly with no off-by-one adjustment and no index guard. The bound is
   * recomputed each iteration exactly as CFML recomputes it; that is observationally
   * identical here because `expression` is a `const`, and it is left as-written rather
   * than hoisted so the port stays a line-for-line correspondence.
   *
   * THE SHORT-CIRCUIT ORDER IS PRESERVED. The arithmetic test is evaluated first and
   * `isNumeric` is consulted only when it holds, and the method returns `false` on the
   * FIRST offending element without examining the rest.
   *
   * @returns `true` when every element passes, or when there are no elements.
   */
  hasExpressionWithListOfNumericValuesOnly(): boolean {
    const expression = this.roundingRuleExpression ?? '';

    for (let i = 1; i <= listLen(expression); i++) {
      const thisValue = listGetAt(expression, i);

      // CFML `find(".", thisValue)` answers a 1-BASED POSITION, OR 0 when the substring
      // is absent. `indexOf` answers a 0-based position, or -1 when absent, so a single
      // `+ 1` converts both cases at once: position 0 becomes 1, and -1 becomes 0. That
      // absent-value 0 is not incidental - it is what makes a bare `'99'` pass.
      //
      // Implemented inline rather than as a helper because src/lib/cfml/list.ts declares
      // its surface CLOSED at five functions and exports no `find`; under its stated
      // overflow rule a need it does not cover belongs in the consuming module, annotated
      // here.
      const decimalPointPosition = thisValue.indexOf('.') + 1;

      // `cfLen` is CFML `len()`: a character COUNT, never a boolean, and it never trims -
      // so a padded element such as `' .99'` is measured with its space, exactly as CFML
      // measures it. Only `isNumeric` looks past the padding; see the note there.
      const lengthMinusDecimalPointPosition = cfLen(thisValue) - decimalPointPosition;

      if (lengthMinusDecimalPointPosition !== 2 || !isNumeric(thisValue)) {
        return false;
      }
    }

    return true;
  }

  // ============ START: Non-Persistent Property Methods =================
  // [model/entity/RoundingRule.cfc:L88-L90] - EMPTY in the source. This entity declares
  // no non-persistent property, so there is no memoized accessor to port and none of the
  // memo defects that live on other entities has a counterpart here.
  // ============  END:  Non-Persistent Property Methods =================

  // ============= START: Bidirectional Helper Methods ===================
  // [model/entity/RoundingRule.cfc:L92-L94] - EMPTY in the source. `priceGroupRates` is
  // `inverse="true"` [L64], so the owning side at model/entity/PriceGroupRate.cfc:L68
  // holds the add/remove bookkeeping. The mandatory "remove-that-ADDs" inversion
  // cross-check is therefore VACUOUS here - there are no helpers to inspect - which is
  // itself the finding, and no helper is invented to fill the banner.
  // =============  END:  Bidirectional Helper Methods ===================

  // =================== START: ORM Event Hooks  =========================
  // [model/entity/RoundingRule.cfc:L96-L98] - EMPTY in the source. No `preInsert`, no
  // `preUpdate`, no `postInsert`, no `postUpdate`. In the in-scope slice only Category,
  // PriceGroup, ProductType and PromotionCode carry hooks, and none of the audit columns
  // above is maintained by this class: the repository sets them on write, exactly as the
  // framework did.
  // ===================  END:  ORM Event Hooks  =========================
}
