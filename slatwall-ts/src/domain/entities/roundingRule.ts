// slatwall-ts - RoundingRule: the SwRoundingRule row and its three behaviours.
// Schema contract [model/entity/RoundingRule.cfc:L49]: table `SwRoundingRule`, ORM entity name `SlatwallRoundingRule`; no migration,
// no rename, no column change.
//
// No legacy TODO falls inside this file.
import { listGetAt, listLen } from '../../lib/cfml/list.js';
import { cfFoldKey } from '../../lib/cfml/struct.js';

// CFML `len()`. Returns a COUNT and never a boolean, which is exactly what the validator's
// arithmetic needs.
import { cfLen } from '../../lib/cfml/truthiness.js';

// Type-only, and never a value import: this entity never performs arithmetic and never constructs
// a Money. It receives one and hands one back.
import type { Money } from '../valueObjects/money.js';

// Type-only, for the `priceGroupRates` inverse collection [model/entity/RoundingRule.cfc:L64].
import type { PriceGroupRate } from './priceGroupRate.js';

// Module-local CFML `isNumeric` equivalent.
//
// Not an export, and deliberately not a sixth entry in src/lib/cfml/list.ts or a new export on
// src/lib/cfml/truthiness.ts.

/**
 * What CFML's `isNumeric()` accepts, expressed as one pattern.
 *
 * A module-scope `const` holding an immutable `RegExp` literal, hoisted so it is compiled once
 * rather than per loop iteration.
 *
 * Deliberately REJECTED, each because CFML rejects it too: the empty string, a lone `'.'` or
 * `'-'`, group separators (`'1,000'`), hexadecimal (`'0x1F'`), `'Infinity'`, `'NaN'`.
 */
const CFML_NUMERIC_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * A local equivalent of CFML's `isNumeric()`, scoped to the values that can actually reach it
 * here.
 *
 * CFML parity [model/entity/RoundingRule.cfc:L81]: this stands in for the `!isNumeric(thisValue)`
 * half of the validator's condition.
 *
 * @param value one element of a rounding-rule expression list, exactly as `listGetAt` returned it.
 * @returns `true` when CFML would consider `value` numeric.
 */
function isNumeric(value: string): boolean {
  return CFML_NUMERIC_PATTERN.test(value.trim());
}

// Co-located type declarations.

/**
 * The three rounding directions the legacy option list offers.
 *
 * DERIVED from [model/entity/RoundingRule.cfc:L70-L76], not invented: the union members are
 * exactly the three `value` strings that method returns, in the order it returns them.
 *
 * This union does not constrain the persisted column, and must not be made to.
 */
export type RoundingRuleDirection = 'Closest' | 'Up' | 'Down';

/**
 * One entry of the direction option list.
 *
 * The two keys are the legacy struct keys VERBATIM [model/entity/RoundingRule.cfc:L72-L74]:
 * `value` and `name`.
 *
 * `name` is typed `string` rather than a union of the three display literals on purpose: it is
 * human-readable text.
 */
export interface RoundingRuleDirectionOption {
  readonly value: RoundingRuleDirection;
  readonly name: string;
}

/**
 * The collaborator surface this entity needs from the rounding-rule service.
 *
 * Two translations of that line, both load-bearing: * `any value` becomes `Money`.
 */
interface RoundingRuleValueRounder {
  roundValueByRoundingRule(value: Money, rule: RoundingRule): Money;
}

/**
 * The `SwRoundingRule` row: a named rounding expression, a direction, and the three behaviours the
 * legacy component declares over them.
 */
export class RoundingRule {
  /**
   * Primary key. [model/entity/RoundingRule.cfc:L52]
   *
   * `string` and never `string | undefined`: `default=""` means the column always holds a string,
   * possibly the empty one.
   *
   * `length="32"` records the column width for the schema contract.
   */
  private readonly roundingRuleID: string;

  /**
   * The rule's display name. [model/entity/RoundingRule.cfc:L53]
   *
   * No `default`, no `notnull`, so the column is genuinely nullable and this is
   * `string | undefined`. model/validation/RoundingRule.json requires it in the `save` context;
   * that rule is enforced at the service tier, not here.
   */
  private roundingRuleName: string | undefined;

  /**
   * The rounding expression: a CFML comma list of decimal candidates such as `'.99'` or
   * `'.95,.99'`. [model/entity/RoundingRule.cfc:L54]
   */
  private roundingRuleExpression: string | undefined;

  /**
   * The rounding direction. [model/entity/RoundingRule.cfc:L55]
   */
  private roundingRuleDirection: string | undefined;

  // All four carry `hb_populateEnabled="false"`, which is how the legacy framework excluded them
  // from mass assignment.
  //
  // Both account-side properties are declared `cfc="Account" fieldtype="many-to-one"` in the
  // source. model/entity/Account.cfc is explicitly out of SCOPE.

  /**
   * `createdDateTime`, or `undefined`. [model/entity/RoundingRule.cfc:L58]
   */
  private readonly createdDateTime: Date | undefined;

  /**
   * The `createdByAccountID` column, opaque. [model/entity/RoundingRule.cfc:L59]
   */
  private readonly createdByAccountID: string | undefined;

  /**
   * `modifiedDateTime`, or `undefined`. [model/entity/RoundingRule.cfc:L60]
   */
  private readonly modifiedDateTime: Date | undefined;

  /**
   * The `modifiedByAccountID` column, opaque. [model/entity/RoundingRule.cfc:L61]
   */
  private readonly modifiedByAccountID: string | undefined;

  /**
   * The `priceGroupRates` inverse one-to-many. [model/entity/RoundingRule.cfc:L64]
   */
  private readonly priceGroupRates: readonly PriceGroupRate[];

  /**
   * The rounding-rule service, reduced to the single method this entity calls.
   */
  private readonly valueRounder: RoundingRuleValueRounder;

  /**
   * Hydrates one `SwRoundingRule` row and injects its one collaborator.
   *
   * Two PARAMETERS, and the split is meaningful: `init` is DATA read out of the database,
   * `valueRounder` is a COLLABORATOR wired in the composition root.
   *
   * `init` is a single readonly INLINE object type rather than a second exported interface,
   * matching the convention this folder already follows: the module exports exactly one runtime
   * unit.
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

  // `accessors=true` on [model/entity/RoundingRule.cfc:L49] made ColdFusion generate one getter
  // per persistent property, and callers across the legacy tree use them.
  //
  // There is deliberately no `getRoundingRule()` self-accessor and no `getPrimaryIDValue()`.

  /**
   * [model/entity/RoundingRule.cfc:L52] Always a string; `''` means unsaved.
   */
  getRoundingRuleID(): string {
    return this.roundingRuleID;
  }
  getRoundingRuleName(): string | undefined {
    return this.roundingRuleName;
  }

  /**
   * The raw persisted expression, UNNORMALIZED: no trim, no case change, no default substituted
   * for a null column.
   *
   * `undefined` is meaningful downstream and must not be collapsed to `''` on the way out.
   * model/service/RoundingRuleService.cfc:L88 declares `roundingExpression="0.00"` as a DEFAULT.
   */
  getRoundingRuleExpression(): string | undefined {
    return this.roundingRuleExpression;
  }

  /**
   * `string | undefined` and not {@link RoundingRuleDirection} - see the ruling on that union.
   */
  getRoundingRuleDirection(): string | undefined {
    return this.roundingRuleDirection;
  }
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /**
   * The `createdByAccountID` column, opaque. [model/entity/RoundingRule.cfc:L59]
   */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /**
   * The `modifiedByAccountID` column, opaque. [model/entity/RoundingRule.cfc:L61]
   */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  /**
   * The materialized `priceGroupRates` collection. [model/entity/RoundingRule.cfc:L64]
   *
   * Returns `readonly PriceGroupRate[]` and never `undefined`, so `.length` is always a legal
   * question.
   *
   * `readonly` on the array, not merely on the field: handing out a mutable reference would let a
   * caller reproduce the legacy `arrayAppend(x.getPriceGroupRates(), this)` idiom
   * [model/entity/PriceGroupRate.cfc:L184] against this collection.
   */
  getPriceGroupRates(): readonly PriceGroupRate[] {
    return this.priceGroupRates;
  }

  /**
   * Whether this instance has been persisted yet.
   *
   * Inherited from the framework base in the legacy tree rather than declared on the component,
   * and authored here because it is GENUINELY CALLED on a RoundingRule:
   * [model/service/RoundingRuleService.cfc:L57] is `if(!arguments.entity.isNew())`.
   *
   * LEGACY-NOTE [org/Hibachi/HibachiEntity.cfc:L707-L711]: `isNew()` sits under that file's
   * `Deprecated Methods` banner, while `getNewFlag()` does not.
   */
  isNew(): boolean {
    return this.roundingRuleID === '';
  }

  // The orm-generated scalar setters - the `populate` targets.

  /**
   * [model/entity/RoundingRule.cfc:L53] The ORM-generated `setRoundingRuleName()`. Populate
   * target.
   */
  setRoundingRuleName(roundingRuleName: string): void {
    this.roundingRuleName = roundingRuleName;
  }

  /**
   * [model/entity/RoundingRule.cfc:L54] The ORM-generated `setRoundingRuleExpression()`.
   */
  setRoundingRuleExpression(roundingRuleExpression: string): void {
    this.roundingRuleExpression = roundingRuleExpression;
  }

  /**
   * [model/entity/RoundingRule.cfc:L55] The ORM-generated `setRoundingRuleDirection()`.
   *
   * ACCEPTS any STRING, which is what makes the defaultless dispatch in
   * `src/services/roundingRuleService.ts` reachable rather than dead.
   */
  setRoundingRuleDirection(roundingRuleDirection: string): void {
    this.roundingRuleDirection = roundingRuleDirection;
  }

  // The error register - the framework's refusal channel.

  /**
   * The accumulated errors, keyed by FOLDED error name and carrying each name's ORIGINAL spelling.
   *
   * Two pieces of state per entry, because a CFML struct carries both.
   */
  private readonly errors = new Map<
    string,
    { readonly name: string; readonly messages: string[] }
  >();

  /**
   * Every error, keyed by error name [org/Hibachi/HibachiTransient.cfc:L30-L32]. Frozen
   * projection.
   */
  getErrors(): Readonly<Record<string, readonly string[]>> {
    const projected: Record<string, readonly string[]> = {};

    for (const entry of this.errors.values()) {
      // `defineProperty` rather than assignment: an error name is server-authored here, but the
      // projection is a plain object and `__proto__` must never be interceptable on one.
      Object.defineProperty(projected, entry.name, {
        value: Object.freeze([...entry.messages]),
        enumerable: true,
        writable: false,
        configurable: false,
      });
    }

    return Object.freeze(projected);
  }

  /**
   * Whether this entity carries any error [org/Hibachi/HibachiTransient.cfc:L47-L53].
   */
  hasErrors(): boolean {
    return this.errors.size > 0;
  }

  /**
   * Whether one named error is present [org/Hibachi/HibachiTransient.cfc:L57-L59].
   */
  hasError(errorName: string): boolean {
    return this.errors.has(cfFoldKey(errorName));
  }

  /**
   * The messages under one name, or an EMPTY ARRAY [org/Hibachi/HibachiTransient.cfc:L34-L43].
   */
  getError(errorName: string): readonly string[] {
    return Object.freeze([...(this.errors.get(cfFoldKey(errorName))?.messages ?? [])]);
  }

  /**
   * Record one error; messages accumulate [org/Hibachi/HibachiTransient.cfc:L61-L64].
   */
  addError(errorName: string, errorMessage: string): void {
    const key = cfFoldKey(errorName);
    const existing = this.errors.get(key);

    if (existing === undefined) {
      this.errors.set(key, { name: errorName, messages: [errorMessage] });
      return;
    }

    existing.messages.push(errorMessage);
  }

  /**
   * Applies this rule to a monetary value.
   *
   * LEGACY-NOTE [model/entity/RoundingRule.cfc:L66 vs model/service/RoundingRuleService.cfc:L88]:
   * the entity declares returntype="numeric" while the service's roundValue() declares
   * returntype="string" and returns a decimal string; CFML coerced implicitly.
   *
   * @param value the amount to round.
   * @returns the rounded amount, as produced by the collaborator.
   */
  roundValue(value: Money): Money {
    return this.valueRounder.roundValueByRoundingRule(value, this);
  }

  /**
   * The admin-facing option list for `roundingRuleDirection`.
   *
   * Exactly three options, in that order, with those exact strings.
   *
   * Pure and synchronous: no `this` access, no i/o, no state.
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
   * Whether every element of `roundingRuleExpression` passes the legacy numeric shape test.
   *
   * Branch 2 of the HibachiEntity dynamic dispatcher - the `hasUnique<Prop>`-family declarative
   * invocation [org/Hibachi/HibachiEntity.cfc:L514].
   *
   * `find(".", v)` returns a 1-BASED POSITION, or **0** when the substring is absent, and the
   * arithmetic is built on that.
   *
   * @returns `true` when every element passes, or when there are no elements.
   */
  hasExpressionWithListOfNumericValuesOnly(): boolean {
    const expression = this.roundingRuleExpression ?? '';

    for (let i = 1; i <= listLen(expression); i++) {
      const thisValue = listGetAt(expression, i);

      // CFML `find(".", thisValue)` answers a 1-BASED position, or 0 when the substring is absent.
      //
      // Implemented inline rather than as a helper because src/lib/cfml/list.ts declares its
      // surface CLOSED at five functions and exports no `find`.
      const decimalPointPosition = thisValue.indexOf('.') + 1;

      // `cfLen` is CFML `len()`: a character COUNT, never a boolean, and it never trims - so a
      // padded element such as `'.99'` is measured with its space, exactly as CFML measures it.
      const lengthMinusDecimalPointPosition = cfLen(thisValue) - decimalPointPosition;

      if (lengthMinusDecimalPointPosition !== 2 || !isNumeric(thisValue)) {
        return false;
      }
    }

    return true;
  }

  // [model/entity/RoundingRule.cfc:L88-L90] - EMPTY in the source.

  // [model/entity/RoundingRule.cfc:L96-L98] - empty in the source. No `preInsert`, no `preUpdate`,
  // no `postInsert`, no `postUpdate`.
}
