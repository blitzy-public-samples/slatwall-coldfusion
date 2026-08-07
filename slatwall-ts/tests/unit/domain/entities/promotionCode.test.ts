// slatwall-ts - unit suite for `src/domain/entities/promotionCode.ts`
//
// The subject's insert hook is `preInsert()`, and every assertion below drives it under that name.
//
// Two annotation forms appear here, both deliberate: `CFML parity: <decision>` for a legacy
// semantic carried across, always with the locator it was verified against, and `JUDGMENT CALL:`
// for a choice this suite makes that the source does not settle.

import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as NodeCrypto from 'node:crypto';

import { PromotionCode } from '../../../../src/domain/entities/promotionCode.js';
import { Promotion } from '../../../../src/domain/entities/promotion.js';
import { makePromotionFixtures } from '../../../fixtures/promotionFixtures.js';

/**
 * A scriptable seam over the platform UUID generator.
 *
 * Deliberately a pass-through when nothing is scripted, so every other case in this file -
 * including the shape case, which asserts the real generator's output against the CFML pattern.
 */
const { scriptedUuid } = vi.hoisted(() => ({
  scriptedUuid: { queue: [] as string[], draws: 0 },
}));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeCrypto>();

  return {
    ...actual,
    randomUUID: (): string => {
      scriptedUuid.draws += 1;

      return scriptedUuid.queue.shift() ?? actual.randomUUID();
    },
  };
});

// JUDGMENT CALL: `Promotion` is imported as a VALUE, not with `import type`, because this suite
// CONSTRUCTS promotions - `setPromotion` and `removePromotion` need a real far side with a live
// `getPromotionCodes()` array, and a type-only import cannot build one.

/**
 * The constructor's parameter object, derived rather than restated.
 *
 * `src/domain/entities/promotionCode.ts` declares the init shape INLINE and exports only the
 * class, so there is no init type to import.
 */
type PromotionCodeInit = ConstructorParameters<typeof PromotionCode>[0];

/**
 * Extracts an array type's element type.
 *
 * Written as a conditional `infer` rather than as `T[number]` so the result is the element type
 * itself under `noUncheckedIndexedAccess`, with no `| undefined` smuggled in by an indexed access.
 */
type ElementOf<TArray> = TArray extends readonly (infer TElement)[] ? TElement : never;

/**
 * The `SwPromotionCodeAccount` link projection. [model/entity/PromotionCode.cfc:L65]
 */
type AccountLink = ElementOf<NonNullable<PromotionCodeInit['accounts']>>;

/**
 * The `SwOrderPromotionCode` link projection. [model/entity/PromotionCode.cfc:L68]
 *
 * Same reasoning as {@link AccountLink}, and the stakes are higher: the order aggregate is the
 * single largest exclusion in this port.
 */
type OrderLink = ElementOf<NonNullable<PromotionCodeInit['orders']>>;

/**
 * An account link that also reports how many times its far-side containment probe ran.
 *
 * JUDGMENT CALL: a hand-written counter rather than `vi.spyOn`, because the double is this suite's
 * own object and a counter it owns is both simpler to read and impossible to leave un-restored.
 */
type AccountLinkProbe = AccountLink & {
  /**
   * How many times `hasPromotionCode` has been called on this link.
   */
  readonly hasPromotionCodeCallCount: () => number;
};

/**
 * An order link that also reports which owning-side methods were delegated to, in order.
 */
type OrderLinkProbe = OrderLink & {
  /**
   * The owning-side method names this link received, in call order.
   */
  readonly delegatedCalls: () => readonly string[];
  readonly heldCodes: () => readonly PromotionCode[];
};

/**
 * A clock whose instant can be moved, and which counts how often it was read.
 *
 * This is the injected `now: () => Date` seam, and it is what replaces the legacy ambient request
 * scope: [model/entity/PromotionCode.cfc:L88] reaches the engine's `now()` built-in twice.
 *
 * `now()` hands back a FRESH `Date` carrying the instant, so a caller that mutates the returned
 * value cannot move this clock.
 */
interface MovableClock {
  /**
   * The function handed to the constructor slot.
   */
  readonly now: () => Date;
  /**
   * How many times the entity has read this clock.
   */
  readonly readCount: () => number;
  /**
   * Moves the clock to a new explicit UTC instant.
   */
  readonly moveTo: (instantUTC: string) => void;
}

// Explicit UTC instants. Every business date in this suite is one of these.

/**
 * The instant every injected clock starts at. Mid-window for the standard bounds.
 */
const NOW_UTC = '2024-06-15T12:00:00.000Z';
/**
 * Start of the standard open window. Also used as an explicit created-on stamp.
 */
const WINDOW_START_UTC = '2024-06-01T00:00:00.000Z';
/**
 * End of the standard open window.
 */
const WINDOW_END_UTC = '2024-07-01T00:00:00.000Z';
/**
 * Strictly before the standard window - a code whose window has not opened.
 */
const BEFORE_WINDOW_UTC = '2024-05-01T00:00:00.000Z';
/**
 * Strictly after the standard window - a code whose window has closed.
 */
const AFTER_WINDOW_UTC = '2024-08-01T00:00:00.000Z';
/**
 * An explicit modified-on stamp, distinct from the created-on stamp.
 */
const MODIFIED_UTC = '2024-06-15T12:30:00.000Z';
/**
 * The Unix epoch, present for exactly one purpose: to prove it is not how absence is modelled. It
 * is asserted as a value a row can legitimately CARRY, never as a stand-in for a missing bound.
 */
const UNIX_EPOCH_UTC = '1970-01-01T00:00:00.000Z';

/**
 * The shape [model/entity/PromotionCode.cfc:L182]'s `createUUID()` produces, which the shipped
 * `preInsert` reproduces: 8-4-4-16 uppercase hexadecimal, 35 characters.
 */
const CFML_SHAPED_UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{16}$/;

/**
 * Total characters in a CFML-shaped UUID: 32 hexadecimal digits plus three hyphens.
 */
const CFML_SHAPED_UUID_LENGTH = 35;
/**
 * [model/entity/PromotionCode.cfc:L54-L55] - the null-display key for both date bounds.
 */
const FOREVER_RB_KEY = 'define.forever';
/**
 * [model/entity/PromotionCode.cfc:L56-L57] - the null-display key for both ceilings.
 */
const UNLIMITED_RB_KEY = 'define.unlimited';

/**
 * One declarative rule from `model/validation/PromotionCode.json`.
 *
 * Every keyword the four in-scope rules use is declared here as OPTIONAL, so a heterogeneous rule
 * list stays uniformly readable.
 */
type ValidationRule = {
  /**
   * `save` or `delete`. Every rule in this schema names exactly one context.
   */
  readonly contexts: string;
  /**
   * Present only on the `promotionCode` rule.
   */
  readonly required?: boolean;
  /**
   * The custom entity validator to invoke. Present only on the `promotionCode` rule.
   */
  readonly method?: string;
  /**
   * Present on both date-bound rules.
   */
  readonly dataType?: string;
  /**
   * The named condition gating the rule. Present only on the second `endDateTime` rule.
   */
  readonly conditions?: string;
  /**
   * The strict greater-than comparison target. Present only on the conditional rule.
   */
  readonly gtProperty?: string;
  /**
   * The delete-context collection ceiling. Present only on the `orders` rule.
   */
  readonly maxCollection?: number;
};

/**
 * The whole schema, with the four gated properties named explicitly rather than indexed.
 */
type ValidationSchemaAsWritten = {
  readonly conditions: {
    readonly needsEndAfterStart: {
      readonly startDateTime: { readonly required: boolean };
      readonly endDateTime: { readonly required: boolean };
    };
  };
  readonly properties: {
    readonly promotionCode: readonly ValidationRule[];
    readonly startDateTime: readonly ValidationRule[];
    readonly endDateTime: readonly ValidationRule[];
    readonly orders: readonly ValidationRule[];
  };
};

/**
 * `model/validation/PromotionCode.json` recorded verbatim, as data.
 *
 * JUDGMENT CALL: the declarative rules are recorded here and cross-checked against the SHIPPED
 * SURFACE rather than executed.
 *
 * Frozen so no test can mutate the record other tests read.
 */
const VALIDATION_RULES_AS_WRITTEN: ValidationSchemaAsWritten = Object.freeze({
  conditions: Object.freeze({
    needsEndAfterStart: Object.freeze({
      startDateTime: Object.freeze({ required: true }),
      endDateTime: Object.freeze({ required: true }),
    }),
  }),
  properties: Object.freeze({
    promotionCode: Object.freeze([
      Object.freeze({ contexts: 'save', required: true, method: 'hasUniquePromotionCode' }),
    ]),
    startDateTime: Object.freeze([Object.freeze({ contexts: 'save', dataType: 'date' })]),
    endDateTime: Object.freeze([
      Object.freeze({ contexts: 'save', dataType: 'date' }),
      Object.freeze({
        contexts: 'save',
        conditions: 'needsEndAfterStart',
        gtProperty: 'startDateTime',
      }),
    ]),
    orders: Object.freeze([Object.freeze({ contexts: 'delete', maxCollection: 0 })]),
  }),
});

/**
 * The complete public surface the port ships, in sorted order.
 */
const PUBLIC_SURFACE: readonly string[] = Object.freeze([
  'addAccount',
  'addOrder',
  'getAccounts',
  'getCreatedByAccountID',
  'getCreatedDateTime',
  'getCurrentFlag',
  'getEndDateTime',
  'getMaximumAccountUseCount',
  'getMaximumUseCount',
  'getModifiedByAccountID',
  'getModifiedDateTime',
  'getOrders',
  'getPromotion',
  'getPromotionCode',
  'getPromotionCodeID',
  'getPromotionID',
  'getRemoteID',
  'getSimpleRepresentationPropertyName',
  'getStartDateTime',
  'hasAccount',
  'hasOrder',
  'hasUniquePromotionCode',
  'isDeletable',
  'isNew',
  'preInsert',
  'removeAccount',
  'removeOrder',
  'removePromotion',
  'setPromotion',
  'setPromotionCode',
]);

/**
 * The four private helpers the class installs on its prototype.
 *
 * Recorded so the exhaustive prototype assertion below can be exactly that - exhaustive - without
 * asserting anything about their behaviour.
 */
const PRIVATE_HELPERS: readonly string[] = Object.freeze([
  'accountsContainUnsavedRow',
  'isSameAccountRow',
  'isSameRowAs',
  'ordersContainUnsavedRow',
]);

/**
 * Members `model/entity/PromotionCode.cfc` does not declare, asserted absent.
 *
 * `isDeletable` is deliberately NOT in this list: the component does not declare it either, but the
 * legacy call at [model/entity/Promotion.cfc:L127] resolves it through the framework base, so the
 * port reproduces it from the entity's own delete-context rule. It has its own block below.
 */
const UNDECLARED_MEMBERS: readonly string[] = Object.freeze([
  'getSimpleRepresentation',
  'isCurrent',
  'isExpired',
  'preUpdate',
]);

/**
 * Framework members inherited from the Hibachi base in the legacy runtime and deliberately not
 * ported to the entity.
 *
 * `org/Hibachi/HibachiEntity.cfc` is a boundary to extract from and never modify, and none of its
 * 24 sibling classes are ported.
 */
const UNPORTED_FRAMEWORK_MEMBERS: readonly string[] = Object.freeze([
  'clearAttributeCache',
  'getAttributeValue',
  'getEmailTemplates',
  'getErrors',
  'getNewFlag',
  'getPrimaryIDPropertyName',
  'getPrimaryIDValue',
  'getPrintTemplates',
  'getPromotionCodeSmartList',
  'hasErrors',
  'onMissingMethod',
  'setAccounts',
  'setEndDateTime',
  'setMaximumAccountUseCount',
  'setMaximumUseCount',
  'setOrders',
  'setPromotionCodeID',
  'setStartDateTime',
  'validate',
]);

// Builders. Every one returns a FRESH object on every call.

/**
 * Parses an explicit UTC ISO-8601 literal. The only way a `Date` is produced in this file.
 */
function atUtc(instantUTC: string): Date {
  return new Date(instantUTC);
}

/**
 * A movable, counting clock starting at an explicit UTC instant.
 *
 * CFML parity [model/entity/PromotionCode.cfc:L88]: the legacy predicate calls the engine's
 * `now()` twice inside one boolean expression.
 */
function aMovableClock(instantUTC: string = NOW_UTC): MovableClock {
  let instant: Date = atUtc(instantUTC);
  let reads = 0;

  return {
    now: (): Date => {
      reads += 1;
      return new Date(instant.getTime());
    },
    readCount: (): number => reads,
    moveTo: (nextInstantUTC: string): void => {
      instant = atUtc(nextInstantUTC);
    },
  };
}

/**
 * Every constructor slot at its unsaved default, with a fresh clock.
 *
 * CFML parity [model/entity/PromotionCode.cfc:L52]: `promotionCodeID` carries
 * `unsavedvalue="" default=""`, so the empty string is the honest unsaved key and `isNew()` reads
 * it directly.
 */
function unsavedRowColumns(): PromotionCodeInit {
  return {
    promotionCodeID: '',
    promotionCode: undefined,
    startDateTime: undefined,
    endDateTime: undefined,
    maximumUseCount: undefined,
    maximumAccountUseCount: undefined,
    promotion: undefined,
    promotionID: undefined,
    remoteID: undefined,
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
    accounts: [],
    orders: [],
    now: aMovableClock().now,
  };
}

/**
 * A promotion code built from the unsaved defaults with the given columns overridden.
 */
function aPromotionCode(overrides: Partial<PromotionCodeInit> = {}): PromotionCode {
  return new PromotionCode({ ...unsavedRowColumns(), ...overrides });
}

/**
 * A saved promotion row with a live, initially empty code collection.
 *
 * `Promotion`'s constructor requires only its own key, which is exactly the anti-corruption shape
 * this suite needs: nothing about promotion periods.
 */
function aPromotion(promotionID: string): Promotion {
  return new Promotion({ promotionID });
}

/**
 * A `SwPromotionCodeAccount` link double.
 *
 * `hasPromotionCode` mirrors the shipped `Promotion.hasPromotionCode` semantics rather than
 * inventing its own: primary-key comparison.
 *
 * `isNew()` reads the account's own key the same way, which is what the asymmetric near-side guard
 * at [model/entity/PromotionCode.cfc:L123] consults.
 */
function anAccountLink(accountID: string): AccountLinkProbe {
  const promotionCodes: PromotionCode[] = [];
  let hasPromotionCodeCalls = 0;

  return {
    getAccountID: (): string => accountID,
    isNew: (): boolean => accountID === '',
    hasPromotionCode: (promotionCode: PromotionCode): boolean => {
      hasPromotionCodeCalls += 1;
      if (promotionCode.getPromotionCodeID() === '') {
        return promotionCodes.includes(promotionCode);
      }
      return promotionCodes.some(
        (held) => held.getPromotionCodeID() === promotionCode.getPromotionCodeID(),
      );
    },
    getPromotionCodes: (): PromotionCode[] => promotionCodes,
    hasPromotionCodeCallCount: (): number => hasPromotionCodeCalls,
  };
}

/**
 * A `SwOrderPromotionCode` link double, kept entirely opaque.
 *
 * CFML parity [model/entity/PromotionCode.cfc:L68]: `orders` is the INVERSE side and is
 * `lazy="extra"`. The owning side is `Order.cfc`, so this double carries only an opaque identifier
 * and the two owning-side maintenance methods [model/entity/PromotionCode.cfc:L142-L147] delegate
 * to.
 */
function anOrderLink(orderID: string): OrderLinkProbe {
  const promotionCodes: PromotionCode[] = [];
  const calls: string[] = [];

  return {
    getOrderID: (): string => orderID,
    addPromotionCode: (promotionCode: PromotionCode): void => {
      calls.push('addPromotionCode');
      if (!promotionCodes.includes(promotionCode)) {
        promotionCodes.push(promotionCode);
      }
    },
    removePromotionCode: (promotionCode: PromotionCode): void => {
      calls.push('removePromotionCode');
      const index = promotionCodes.indexOf(promotionCode);
      if (index !== -1) {
        promotionCodes.splice(index, 1);
      }
    },
    delegatedCalls: (): readonly string[] => [...calls],
    heldCodes: (): readonly PromotionCode[] => [...promotionCodes],
  };
}

/**
 * The prototype members the class installs, excluding the constructor, sorted.
 */
function prototypeMembers(): string[] {
  return Object.getOwnPropertyNames(PromotionCode.prototype)
    .filter((name) => name !== 'constructor')
    .sort();
}

afterEach(() => {
  // The one spy in this suite is installed on a real `Promotion` far side, where there is no
  // hand-written body to count through.
  vi.restoreAllMocks();
});

describe('PromotionCode installs the ported surface and nothing else', () => {
  it('installs exactly the thirty public members and the four private helpers', () => {
    const expected = [...PUBLIC_SURFACE, ...PRIVATE_HELPERS].sort();

    expect(prototypeMembers()).toStrictEqual(expected);
  });

  it('reaches every public member on an instance built from the unsaved defaults', () => {
    const subject = aPromotionCode();

    for (const name of PUBLIC_SURFACE) {
      expect(name in subject).toBe(true);
    }
  });

  it('declares no isCurrent, no isExpired, no getSimpleRepresentation and no preUpdate', () => {
    const subject = aPromotionCode();
    const members = prototypeMembers();

    for (const name of UNDECLARED_MEMBERS) {
      expect(members).not.toContain(name);
      expect(name in subject).toBe(false);
    }
  });

  it('authors no unported Hibachi framework member and no implicit setter', () => {
    const subject = aPromotionCode();
    const members = prototypeMembers();

    for (const name of UNPORTED_FRAMEWORK_MEMBERS) {
      expect(members).not.toContain(name);
      expect(name in subject).toBe(false);
    }
  });

  it('resolves an unknown member to undefined instead of throwing, unlike the legacy dispatcher', () => {
    const subject = aPromotionCode();

    // CFML parity [org/Hibachi/HibachiEntity.cfc:L565]: because `PromotionCode` declares no
    // `attributeValues` property, an unknown `getX()` fell through the framework's
    // `onMissingMethod` dispatcher and THREW "You have called a method... Which does not exists in
    // the... entity." - one of fourteen throwing entities in the slice.
    // @ts-expect-error `getNonsenseAttribute` is not a member; the compiler is the dispatcher now.
    const missing: unknown = subject.getNonsenseAttribute;

    expect(missing).toBeUndefined();
    expect(() => prototypeMembers()).not.toThrow();
  });

  it('injects no collaborator port - the only injected dependency is the plain clock', () => {
    const clock = aMovableClock();
    const subject = aPromotionCode({
      startDateTime: atUtc(WINDOW_START_UTC),
      endDateTime: atUtc(WINDOW_END_UTC),
      now: clock.now,
    });

    // CFML parity `model/entity/PromotionCode.cfc`: a census of the whole component finds ZERO
    // `getService("...")` service-locator calls - the pattern that appears 45 times across the
    // eighteen in-scope entities, concentrated in `Product.cfc` (18).
    for (const name of prototypeMembers()) {
      expect(name).not.toMatch(/(Service|Repository|Port|Provider|Adapter)$/);
    }

    // The clock is genuinely wired through that plain parameter: the one member that needs an
    // instant reads this function and nothing ambient.
    expect(clock.readCount()).toBe(0);
    subject.getCurrentFlag();
    expect(clock.readCount()).toBeGreaterThan(0);
  });

  it('is synchronous throughout - no accessor returns a thenable', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-sync' });

    // CFML parity: a method becomes async in this port if and only if its legacy body reached the
    // DAO or the ORM.
    const readings: readonly unknown[] = [
      subject.getPromotionCodeID(),
      subject.getPromotionCode(),
      subject.getStartDateTime(),
      subject.getEndDateTime(),
      subject.getMaximumUseCount(),
      subject.getMaximumAccountUseCount(),
      subject.getPromotion(),
      subject.getPromotionID(),
      subject.getAccounts(),
      subject.getOrders(),
      subject.getRemoteID(),
      subject.getCreatedDateTime(),
      subject.getCreatedByAccountID(),
      subject.getModifiedDateTime(),
      subject.getModifiedByAccountID(),
      subject.isNew(),
      subject.isDeletable(),
      subject.getCurrentFlag(),
      subject.hasUniquePromotionCode(),
      subject.getSimpleRepresentationPropertyName(),
      subject.preInsert(),
    ];

    for (const reading of readings) {
      expect(reading).not.toBeInstanceOf(Promise);
    }
  });
});

describe('isDeletable() resolves the framework predicate from the entity own delete rule', () => {
  // CFML parity [model/entity/PromotionCode.cfc, org/Hibachi/HibachiEntity.cfc:L204-L206]:
  // `isDeletable` is not declared on `PromotionCode.cfc` - a grep of all 192 lines returns zero
  // hits - so the legacy call at [model/entity/Promotion.cfc:L127] reached the framework base,
  // whose body validates the entity in the `delete` context. AAP 0.5.3 replaces that framework
  // responsibility with typed schemas, and `model/validation/PromotionCode.json` declares exactly
  // one delete-context rule, so the predicate reduces to "no order references this code".

  it('is declared on the prototype, with no argument and no injected collaborator', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-deletable' });

    expect(prototypeMembers()).toContain('isDeletable');
    expect(subject.isDeletable.bind(subject)).toHaveLength(0);
  });

  it('answers true for a code no order references', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-unused', orders: [] });

    expect(subject.getOrders()).toEqual([]);
    expect(subject.isDeletable()).toBe(true);
  });

  it('answers false as soon as one order references it - maxCollection is 0, not 1', () => {
    const subject = aPromotionCode({
      promotionCodeID: 'pc-used-once',
      orders: [anOrderLink('order-1')],
    });

    expect(subject.isDeletable()).toBe(false);
  });

  it('answers false for many referencing orders, on the same rule', () => {
    const subject = aPromotionCode({
      promotionCodeID: 'pc-used-often',
      orders: [anOrderLink('order-1'), anOrderLink('order-2'), anOrderLink('order-3')],
    });

    expect(subject.isDeletable()).toBe(false);
  });

  it('is the rule the validation record already carries, read from that record', () => {
    // Derived from `VALIDATION_RULES_AS_WRITTEN` rather than restated, so the predicate and the
    // recorded schema cannot drift apart.
    const ordersRules = VALIDATION_RULES_AS_WRITTEN.properties.orders;

    expect(ordersRules).toHaveLength(1);
    expect(ordersRules?.[0]?.contexts).toBe('delete');
    expect(ordersRules?.[0]?.maxCollection).toBe(0);
  });

  it('re-reads the live collection on every call, so it observes a far-side mutation', () => {
    const order = anOrderLink('order-late');
    const subject = aPromotionCode({ promotionCodeID: 'pc-live', orders: [] });

    expect(subject.isDeletable()).toBe(true);

    // The owning side is `Order.cfc`, so the near side is mutated the way the far side would.
    subject.getOrders().push(order);

    expect(subject.isDeletable()).toBe(false);
  });

  it('closes the consumer that depends on it, and the fixture record says so', () => {
    const fixtures = makePromotionFixtures();

    // The shared fixture record names the consumer and its spelling mismatch, so the dependency
    // direction stays machine-readable from both ends.
    expect(fixtures.promotionCodesDeletableFlagDefect.methodName).toBe(
      'getPromotionCodesDeletableFlag',
    );
    expect(fixtures.promotionCodesDeletableFlagDefect.portedAccessorRaisesOnMaterializedCode).toBe(
      false,
    );
    expect(fixtures.promotionCodesDeletableFlagDefect.resolvedBy).toContain('isDeletable');
    expect(fixtures.promotionCodesDeletableFlagDefect.resolvedBy).toContain(
      'src/domain/entities/promotionCode.ts',
    );
  });
});

describe('getCurrentFlag() is inclusive on both bounds and permissive on absent bounds', () => {
  // CFML parity [model/entity/PromotionCode.cfc:L85-L94]: the legacy body SEEDS `true` at L87 and
  // narrows to `false` at L89 only when a NON-NULL bound is out of range.

  it('is true at the exact start instant - the start bound is inclusive', () => {
    const subject = aPromotionCode({
      startDateTime: atUtc(NOW_UTC),
      endDateTime: atUtc(WINDOW_END_UTC),
      now: aMovableClock(NOW_UTC).now,
    });

    expect(subject.getCurrentFlag()).toBe(true);
  });

  it('is true at the exact end instant - the end bound is inclusive', () => {
    const subject = aPromotionCode({
      startDateTime: atUtc(WINDOW_START_UTC),
      endDateTime: atUtc(NOW_UTC),
      now: aMovableClock(NOW_UTC).now,
    });

    // This is the single most consequential boundary in the file. A `<=` mistranslation of L88's
    // strict `<` would silently retire every code on the final instant of its window.
    expect(subject.getCurrentFlag()).toBe(true);
  });

  it('is true strictly inside the window', () => {
    const subject = aPromotionCode({
      startDateTime: atUtc(WINDOW_START_UTC),
      endDateTime: atUtc(WINDOW_END_UTC),
      now: aMovableClock(NOW_UTC).now,
    });

    expect(subject.getCurrentFlag()).toBe(true);
  });

  it('is false when the window has not opened yet', () => {
    const subject = aPromotionCode({
      startDateTime: atUtc(AFTER_WINDOW_UTC),
      endDateTime: undefined,
      now: aMovableClock(NOW_UTC).now,
    });

    expect(subject.getCurrentFlag()).toBe(false);
  });

  it('is false when the window has already closed', () => {
    const subject = aPromotionCode({
      startDateTime: undefined,
      endDateTime: atUtc(BEFORE_WINDOW_UTC),
      now: aMovableClock(NOW_UTC).now,
    });

    expect(subject.getCurrentFlag()).toBe(false);
  });

  it('is false when the clock sits outside a fully closed historical window', () => {
    const subject = aPromotionCode({
      startDateTime: atUtc(UNIX_EPOCH_UTC),
      endDateTime: atUtc(BEFORE_WINDOW_UTC),
      now: aMovableClock(NOW_UTC).now,
    });

    expect(subject.getCurrentFlag()).toBe(false);
  });

  it('is true when only the start bound is absent - open-ended in the past', () => {
    const subject = aPromotionCode({
      startDateTime: undefined,
      endDateTime: atUtc(WINDOW_END_UTC),
      now: aMovableClock(NOW_UTC).now,
    });

    expect(subject.getCurrentFlag()).toBe(true);
  });

  it('is true when only the end bound is absent - open-ended in the future', () => {
    const subject = aPromotionCode({
      startDateTime: atUtc(WINDOW_START_UTC),
      endDateTime: undefined,
      now: aMovableClock(NOW_UTC).now,
    });

    expect(subject.getCurrentFlag()).toBe(true);
  });

  it('is true when BOTH bounds are absent - the fully unbounded code is always current', () => {
    const subject = aPromotionCode({
      startDateTime: undefined,
      endDateTime: undefined,
      now: aMovableClock(NOW_UTC).now,
    });

    expect(subject.getCurrentFlag()).toBe(true);

    // And it stays true no matter where the clock is, because neither guard ever opens.
    const distantFuture = aPromotionCode({ now: aMovableClock(AFTER_WINDOW_UTC).now });

    expect(distantFuture.getCurrentFlag()).toBe(true);
  });

  it('reads the injected clock twice when both bounds are present', () => {
    const clock = aMovableClock(NOW_UTC);
    const subject = aPromotionCode({
      startDateTime: atUtc(WINDOW_START_UTC),
      endDateTime: atUtc(WINDOW_END_UTC),
      now: clock.now,
    });

    expect(subject.getCurrentFlag()).toBe(true);

    // CFML parity [model/entity/PromotionCode.cfc:L88]: the legacy expression calls the engine's
    // `now()` twice - once per comparison - rather than binding one instant to a local as
    // [model/entity/PromotionPeriod.cfc:L79] does for its own `isCurrent`.
    expect(clock.readCount()).toBe(2);
  });

  it('reads the injected clock once when the start bound already disqualifies the code', () => {
    const clock = aMovableClock(NOW_UTC);
    const subject = aPromotionCode({
      startDateTime: atUtc(AFTER_WINDOW_UTC),
      endDateTime: atUtc(AFTER_WINDOW_UTC),
      now: clock.now,
    });

    expect(subject.getCurrentFlag()).toBe(false);

    // The `||` short-circuits after the first disjunct is satisfied, exactly as CFML's `or` does
    // at L88, so the second comparison never runs and never reads the clock.
    expect(clock.readCount()).toBe(1);
  });

  it('never reads the injected clock when both bounds are absent', () => {
    const clock = aMovableClock(NOW_UTC);
    const subject = aPromotionCode({
      startDateTime: undefined,
      endDateTime: undefined,
      now: clock.now,
    });

    expect(subject.getCurrentFlag()).toBe(true);

    // CFML parity [model/entity/PromotionCode.cfc:L88]: each `!isNull(...)` guard precedes its
    // comparison, so with no bounds to compare there is nothing to compare an instant against.
    expect(clock.readCount()).toBe(0);
  });

  it('computes once and then goes stale - the memo freezes a true answer', () => {
    const clock = aMovableClock(NOW_UTC);
    const subject = aPromotionCode({
      startDateTime: atUtc(WINDOW_START_UTC),
      endDateTime: atUtc(WINDOW_END_UTC),
      now: clock.now,
    });

    expect(subject.getCurrentFlag()).toBe(true);
    const readsAfterFirstCall = clock.readCount();

    // Move the clock well past the window's end. A freshly-computed answer would now be `false`;
    // the memoized one is not recomputed at all.
    clock.moveTo(AFTER_WINDOW_UTC);

    expect(subject.getCurrentFlag()).toBe(true);
    expect(subject.getCurrentFlag()).toBe(true);

    // CFML parity [model/entity/PromotionCode.cfc:L86]: the guard is
    // `!structKeyExists(variables,"currentFlag")`, so once the key exists the body never runs
    // again for the life of the object.
    //
    // JUDGMENT CALL: the memo is preserved as BEHAVIOURAL FIDELITY, not as an optimisation. A
    // long-lived legacy request could observe a stale answer, and a caller that expects a live
    // re-read would be wrong about the legacy system too.
    expect(clock.readCount()).toBe(readsAfterFirstCall);
  });

  it('freezes a false answer just as firmly as a true one', () => {
    const clock = aMovableClock(NOW_UTC);
    const subject = aPromotionCode({
      startDateTime: atUtc(AFTER_WINDOW_UTC),
      endDateTime: undefined,
      now: clock.now,
    });

    expect(subject.getCurrentFlag()).toBe(false);

    // Move the clock into the window. A live predicate would now answer `true`.
    clock.moveTo(AFTER_WINDOW_UTC);

    expect(subject.getCurrentFlag()).toBe(false);
  });

  it('keeps the memo instance-scoped - a second code never observes the first answer', () => {
    const clock = aMovableClock(NOW_UTC);
    const columns = {
      startDateTime: atUtc(WINDOW_START_UTC),
      endDateTime: atUtc(WINDOW_END_UTC),
      now: clock.now,
    };
    const first = aPromotionCode(columns);
    const second = aPromotionCode(columns);

    // Warm only the first code's memo while the clock is inside the window.
    expect(first.getCurrentFlag()).toBe(true);

    clock.moveTo(AFTER_WINDOW_UTC);

    // The second code computes for the first time at the NEW instant and answers honestly...
    expect(second.getCurrentFlag()).toBe(false);
    // while the first is still holding its frozen answer. Two rows, two memos, one clock.
    expect(first.getCurrentFlag()).toBe(true);

    // This is the assertion that matters most for the target's execution model.
    expect(second.getCurrentFlag()).toBe(false);
  });

  it('answers every row of the shared nine-case bounds table', () => {
    const fixtures = makePromotionFixtures();

    expect(fixtures.datedPromotionCodes).toHaveLength(9);

    for (const dated of fixtures.datedPromotionCodes) {
      expect(dated.promotionCode.getCurrentFlag()).toBe(dated.bounds.getCurrentFlagOutcome);
    }
  });

  it('covers both bounds, both absences and both degenerate windows in that table', () => {
    const fixtures = makePromotionFixtures();
    const names = fixtures.datedPromotionCodes.map((dated) => dated.bounds.name).sort();

    expect(names).toStrictEqual([
      'bothBoundsAbsent',
      'endBeforeStart',
      'endDateTimeAbsent',
      'endEqualsStart',
      'fullyExpired',
      'nowAtEndDateTime',
      'nowAtStartDateTime',
      'nowStrictlyInside',
      'startDateTimeAbsent',
    ]);

    // Every row with an absent bound is expected to be CURRENT, which is the table's own record of
    // the null-permissive semantic asserted directly above.
    const permissiveRows = fixtures.datedPromotionCodes.filter(
      (dated) =>
        dated.bounds.startDateTimeUTC === undefined || dated.bounds.endDateTimeUTC === undefined,
    );

    expect(permissiveRows).toHaveLength(3);
    for (const dated of permissiveRows) {
      expect(dated.bounds.getCurrentFlagOutcome).toBe(true);
      expect(dated.promotionCode.getCurrentFlag()).toBe(true);
    }
  });

  it('states the sibling contrast at now === endDateTime without re-asserting it', () => {
    const fixtures = makePromotionFixtures();
    const atEnd = fixtures.datedPromotionCodes.find(
      (dated) => dated.bounds.name === 'nowAtEndDateTime',
    );

    expect(atEnd).toBeDefined();
    if (atEnd === undefined) {
      throw new Error('the shared bounds table must carry a nowAtEndDateTime row');
    }

    // This row's own behaviour, asserted directly: end-inclusive, therefore current.
    expect(atEnd.promotionCode.getCurrentFlag()).toBe(true);
    expect(atEnd.bounds.isCurrentOutcome).toBe(false);
    expect(atEnd.bounds.getCurrentFlagOutcome).toBe(true);

    const contrast = fixtures.periodPredicateContrast;

    expect(contrast.livePredicate).toBe('getCurrentFlag');
    expect(contrast.livePredicateEndBoundInclusive).toBe(true);
    expect(contrast.livePredicateGuardsNullBounds).toBe(true);
    expect(contrast.livePredicateNowCallCount).toBe(2);
    expect(contrast.livePredicateMemoizes).toBe(true);
    expect(contrast.deadPredicate).toBe('isCurrent');
    expect(contrast.deadPredicateEndBoundInclusive).toBe(false);
    expect(contrast.deadPredicateGuardsNullBounds).toBe(false);
  });

  it('widens no signature - getCurrentFlag takes no argument at all', () => {
    const subject = aPromotionCode({ now: aMovableClock(NOW_UTC).now });

    // CFML parity [model/entity/PromotionCode.cfc:L85]: the legacy signature is
    // `public boolean function getCurrentFlag()`, and the port keeps that arity exactly.
    //
    // JUDGMENT CALL: arity is read off a BOUND reference throughout this suite rather than off
    // `PromotionCode.prototype.<member>` directly.
    expect(subject.getCurrentFlag.bind(subject)).toHaveLength(0);
    expect(subject.getCurrentFlag()).toBe(true);
  });
});

describe('absence means UNLIMITED and FOREVER - never zero, never the epoch', () => {
  // CFML parity [model/entity/PromotionCode.cfc:L56-L57]: `maximumUseCount` and
  // `maximumAccountUseCount` are `ormtype="integer" notnull="false"` and carry
  // `hb_nullRBKey="define.unlimited"`.
  //
  // CFML parity [model/entity/PromotionCode.cfc:L54-L55]: `startDateTime` and `endDateTime` are
  // `ormtype="timestamp"` and carry `hb_nullRBKey="define.forever"`.

  it('reports both use ceilings as undefined when the row carries none', () => {
    const subject = aPromotionCode({
      maximumUseCount: undefined,
      maximumAccountUseCount: undefined,
    });

    expect(subject.getMaximumUseCount()).toBeUndefined();
    expect(subject.getMaximumAccountUseCount()).toBeUndefined();
  });

  it('never coerces an absent ceiling to zero', () => {
    const subject = aPromotionCode({
      maximumUseCount: undefined,
      maximumAccountUseCount: undefined,
    });

    expect(subject.getMaximumUseCount()).not.toBe(0);
    expect(subject.getMaximumAccountUseCount()).not.toBe(0);
  });

  it('keeps an explicit zero ceiling distinguishable from an absent one', () => {
    const capped = aPromotionCode({ maximumUseCount: 0, maximumAccountUseCount: 0 });
    const uncapped = aPromotionCode({
      maximumUseCount: undefined,
      maximumAccountUseCount: undefined,
    });

    // A stored `0` is a real, if pathological, merchant instruction: the code exists but may not
    // be redeemed.
    expect(capped.getMaximumUseCount()).toBe(0);
    expect(capped.getMaximumAccountUseCount()).toBe(0);
    expect(capped.getMaximumUseCount()).not.toBeUndefined();
    expect(uncapped.getMaximumUseCount()).not.toBe(capped.getMaximumUseCount());
  });

  it('carries both ceilings through verbatim, clamping and defaulting nothing', () => {
    const subject = aPromotionCode({ maximumUseCount: 1_000_000, maximumAccountUseCount: 1 });

    expect(subject.getMaximumUseCount()).toBe(1_000_000);
    expect(subject.getMaximumAccountUseCount()).toBe(1);
  });

  it('carries a negative ceiling through unchanged, because the source validates neither', () => {
    const subject = aPromotionCode({ maximumUseCount: -5, maximumAccountUseCount: -1 });

    // CFML parity `model/validation/PromotionCode.json`: the schema declares rules for
    // `promotionCode`, `startDateTime`, `endDateTime` and `orders` and nothing for either ceiling
    // no `required`, no `dataType`, no `minValue`.
    expect(subject.getMaximumUseCount()).toBe(-5);
    expect(subject.getMaximumAccountUseCount()).toBe(-1);
  });

  it('reports both date bounds as undefined when the row carries none', () => {
    const subject = aPromotionCode({ startDateTime: undefined, endDateTime: undefined });

    expect(subject.getStartDateTime()).toBeUndefined();
    expect(subject.getEndDateTime()).toBeUndefined();
  });

  it('never substitutes the Unix epoch for an absent date bound', () => {
    const absent = aPromotionCode({ startDateTime: undefined, endDateTime: undefined });
    const epoch = aPromotionCode({
      startDateTime: atUtc(UNIX_EPOCH_UTC),
      endDateTime: atUtc(UNIX_EPOCH_UTC),
    });

    expect(absent.getStartDateTime()).not.toBeInstanceOf(Date);
    expect(absent.getEndDateTime()).not.toBeInstanceOf(Date);

    // and the epoch is a value a row may legitimately CARRY, which is exactly why it must never
    // double as the marker for absence. These two rows are in different states and must read
    // differently.
    expect(epoch.getStartDateTime()).toBeInstanceOf(Date);
    expect(epoch.getStartDateTime()?.toISOString()).toBe(UNIX_EPOCH_UTC);
    expect(epoch.getEndDateTime()?.toISOString()).toBe(UNIX_EPOCH_UTC);
    expect(absent.getStartDateTime()).not.toStrictEqual(epoch.getStartDateTime());
  });

  it('carries present date bounds through as the exact UTC instants supplied', () => {
    const subject = aPromotionCode({
      startDateTime: atUtc(WINDOW_START_UTC),
      endDateTime: atUtc(WINDOW_END_UTC),
    });

    expect(subject.getStartDateTime()?.toISOString()).toBe(WINDOW_START_UTC);
    expect(subject.getEndDateTime()?.toISOString()).toBe(WINDOW_END_UTC);
  });

  it('records the two rbKeys as inert strings and resolves neither', () => {
    const subject = aPromotionCode();

    // CFML parity [model/entity/PromotionCode.cfc:L54-L57]: `define.forever` and
    // `define.unlimited` were JavaRB resource-bundle identifiers the legacy admin resolved into
    // localised display text.
    expect(FOREVER_RB_KEY).toBe('define.forever');
    expect(UNLIMITED_RB_KEY).toBe('define.unlimited');

    for (const name of prototypeMembers()) {
      expect(name).not.toMatch(/(Formatted|RBKey|Localized|Localised)$/);
    }
    expect('getStartDateTimeFormatted' in subject).toBe(false);
    expect('getMaximumUseCountFormatted' in subject).toBe(false);
  });

  it('reports audit timestamps as undefined when absent and verbatim when present', () => {
    const bare = aPromotionCode();
    const audited = aPromotionCode({
      createdDateTime: atUtc(WINDOW_START_UTC),
      createdByAccountID: 'acct-author',
      modifiedDateTime: atUtc(MODIFIED_UTC),
      modifiedByAccountID: 'acct-editor',
    });

    // CFML parity [model/entity/PromotionCode.cfc:L74-L77]: the four audit columns are ordinary
    // nullable properties. An un-persisted row genuinely has no created-on stamp, so the epoch is
    // as wrong here as it is on the business bounds.
    expect(bare.getCreatedDateTime()).toBeUndefined();
    expect(bare.getCreatedByAccountID()).toBeUndefined();
    expect(bare.getModifiedDateTime()).toBeUndefined();
    expect(bare.getModifiedByAccountID()).toBeUndefined();

    expect(audited.getCreatedDateTime()?.toISOString()).toBe(WINDOW_START_UTC);
    expect(audited.getCreatedByAccountID()).toBe('acct-author');
    expect(audited.getModifiedDateTime()?.toISOString()).toBe(MODIFIED_UTC);
    expect(audited.getModifiedByAccountID()).toBe('acct-editor');
  });

  it('reports remoteID as undefined when absent and verbatim when present', () => {
    // CFML parity [model/entity/PromotionCode.cfc:L71]: `remoteID` is the external-system
    // correlation column. It is opaque to this port - never parsed, never generated, never
    // defaulted - so a blank in the database reads as absence and a value reads as itself.
    expect(aPromotionCode().getRemoteID()).toBeUndefined();
    expect(aPromotionCode({ remoteID: 'legacy-4471' }).getRemoteID()).toBe('legacy-4471');
  });

  it('exhibits both conventions side by side in the shared fixture graph', () => {
    const fixtures = makePromotionFixtures();

    // The graph's primary code is CAPPED on both ceilings...
    expect(fixtures.promotionCode.getMaximumUseCount()).toBe(50);
    expect(fixtures.promotionCode.getMaximumAccountUseCount()).toBe(1);

    // and the colliding code is the deliberate UNLIMITED exhibit, absent on both.
    expect(fixtures.collidingPromotionCode.getMaximumUseCount()).toBeUndefined();
    expect(fixtures.collidingPromotionCode.getMaximumAccountUseCount()).toBeUndefined();
    expect(fixtures.collidingPromotionCode.getMaximumUseCount()).not.toBe(0);
  });

  it('leaves use COUNTING to the query tier and exposes no counter of its own', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-count' });

    // CFML parity [model/dao/PromotionDAO.cfc:L254-L296]: the code-level use counts are SQL
    // aggregates - `getPromotionCodeUseCount` and `getPromotionCodeAccountUseCount` - not entity
    // state.
    expect('getUseCount' in subject).toBe(false);
    expect('getAccountUseCount' in subject).toBe(false);
    expect(prototypeMembers().filter((name) => name.includes('UseCount'))).toStrictEqual([
      'getMaximumAccountUseCount',
      'getMaximumUseCount',
    ]);
  });
});

describe('setPromotion() assigns the near side and appends to the live far side', () => {
  // CFML parity [model/entity/PromotionCode.cfc:L104-L105]: the guard reads lowercase
  // `arguments.promotion` at L104 while the append reads capitalised `arguments.Promotion` at
  // L105.
  //
  // JUDGMENT CALL: the wart is asserted through the parameter NAME recorded in the shared fixture
  // graph plus the method's arity, rather than by reflecting over source text. A test that reads
  // its own subject's source string would pass for the wrong reason.

  it('assigns the near side and appends the code to the promotion', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const promotion = aPromotion('promo-1');

    subject.setPromotion(promotion);

    expect(subject.getPromotion()).toBe(promotion);
    expect(promotion.getPromotionCodes()).toStrictEqual([subject]);
  });

  it('appends into the very array the far side hands out, not a copy of it', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const promotion = aPromotion('promo-1');
    const liveCollection = promotion.getPromotionCodes();

    subject.setPromotion(promotion);

    // CFML parity [model/entity/PromotionCode.cfc:L105]:
    // `arrayAppend(...getPromotionCodes(), this)` mutates the collection the accessor returned,
    // because CFML arrays are handed out by reference from an ORM-managed entity.
    expect(liveCollection).toHaveLength(1);
    expect(liveCollection).toBe(promotion.getPromotionCodes());
  });

  it('does not append a saved code twice', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const promotion = aPromotion('promo-1');

    subject.setPromotion(promotion);
    subject.setPromotion(promotion);

    expect(promotion.getPromotionCodes()).toHaveLength(1);
    expect(subject.getPromotion()).toBe(promotion);
  });

  it('recognises an already-present code by primary key, not by object identity', () => {
    const promotion = aPromotion('promo-1');
    const firstHydration = aPromotionCode({ promotionCodeID: 'pc-shared' });
    const secondHydration = aPromotionCode({ promotionCodeID: 'pc-shared' });

    firstHydration.setPromotion(promotion);
    secondHydration.setPromotion(promotion);

    // Two distinct objects, one row.
    expect(promotion.getPromotionCodes()).toHaveLength(1);
    expect(promotion.getPromotionCodes()[0]).toBe(firstHydration);
    expect(secondHydration.getPromotion()).toBe(promotion);
  });

  it('skips the containment probe entirely for an unsaved code, and so appends twice', () => {
    const subject = aPromotionCode({ promotionCodeID: '' });
    const promotion = aPromotion('promo-1');
    const probe = vi.spyOn(promotion, 'hasPromotionCode');

    expect(subject.isNew()).toBe(true);

    subject.setPromotion(promotion);
    subject.setPromotion(promotion);

    // CFML parity [model/entity/PromotionCode.cfc:L104]: `isNew() or !...hasPromotionCode(this)`.
    //
    // JUDGMENT CALL: the duplicate is PRESERVED, not de-duplicated. The guard exists because a set
    // of unsaved rows all share the empty key and cannot be told apart by it, so the source chose
    // to trust the caller.
    expect(probe).not.toHaveBeenCalled();
    expect(promotion.getPromotionCodes()).toHaveLength(2);
    expect(promotion.getPromotionCodes()[0]).toBe(subject);
    expect(promotion.getPromotionCodes()[1]).toBe(subject);
  });

  it('consults the containment probe on every call for a saved code', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const promotion = aPromotion('promo-1');
    const probe = vi.spyOn(promotion, 'hasPromotionCode');

    subject.setPromotion(promotion);
    subject.setPromotion(promotion);

    // The first disjunct is false for a saved code, so the second is always evaluated. Asserted as
    // evidence the guard's structure survived translation - not as a performance statement.
    expect(probe).toHaveBeenCalledTimes(2);
    expect(probe).toHaveBeenCalledWith(subject);
    expect(promotion.getPromotionCodes()).toHaveLength(1);
  });

  it('re-points the near side when a second promotion is set', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const first = aPromotion('promo-a');
    const second = aPromotion('promo-b');

    subject.setPromotion(first);
    subject.setPromotion(second);

    // CFML parity [model/entity/PromotionCode.cfc:L102]: the assignment is unconditional and there
    // is no detach of the previous owner, so the code ends up listed by both promotions while its
    // own field names only the second.
    expect(subject.getPromotion()).toBe(second);
    expect(first.getPromotionCodes()).toStrictEqual([subject]);
    expect(second.getPromotionCodes()).toStrictEqual([subject]);
  });

  it('is reachable through Promotion.addPromotionCode with identical effect', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const promotion = aPromotion('promo-1');

    // CFML parity [model/entity/Promotion.cfc:L149-L151]: the far side's `addPromotionCode`
    // delegates straight back to `promotionCode.setPromotion(this)` - it does not maintain the
    // collection itself.
    promotion.addPromotionCode(subject);

    expect(subject.getPromotion()).toBe(promotion);
    expect(promotion.getPromotionCodes()).toStrictEqual([subject]);
  });

  it('declares exactly one parameter, named for the lowercase binding', () => {
    const fixtures = makePromotionFixtures();
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });

    // CFML parity [model/entity/PromotionCode.cfc:L101]: `setPromotion(required any promotion)` -
    // one required parameter, declared lowercase.
    expect(fixtures.promotionCodeSetPromotionParameterName).toBe('promotion');
    expect(subject.setPromotion.bind(subject)).toHaveLength(1);
  });
});

describe('removePromotion() is the CORRECT CONTROL CASE for the sibling remover defects', () => {
  // CFML parity [model/entity/PromotionCode.cfc:L113, L116]: `removePromotion` resolves its index
  // from `arguments.promotion.getPromotionCodes()` at L113 and deletes from
  // `arguments.promotion.getPromotionCodes()` at L116 - the same identifier.

  it('deletes from the collection it searched - the argument, never the near-side field', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const searched = aPromotion('promo-searched');
    const nearSide = aPromotion('promo-near');

    // Leave the code listed by both promotions while its own field names only the second, which is
    // the state `setPromotion`'s unconditional assignment produces.
    subject.setPromotion(searched);
    subject.setPromotion(nearSide);
    expect(subject.getPromotion()).toBe(nearSide);
    expect(searched.getPromotionCodes()).toHaveLength(1);
    expect(nearSide.getPromotionCodes()).toHaveLength(1);

    subject.removePromotion(searched);

    // The control assertion. The removal landed on the ARGUMENT's collection.
    expect(searched.getPromotionCodes()).toStrictEqual([]);
    expect(nearSide.getPromotionCodes()).toStrictEqual([subject]);
  });

  it('removes the code and clears the near side on the ordinary round trip', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const promotion = aPromotion('promo-1');

    subject.setPromotion(promotion);
    subject.removePromotion(promotion);

    expect(promotion.getPromotionCodes()).toStrictEqual([]);
    expect(subject.getPromotion()).toBeUndefined();
  });

  it('removes a FIRST-ELEMENT match, proving the array index base change was translated', () => {
    const first = aPromotionCode({ promotionCodeID: 'pc-first' });
    const second = aPromotionCode({ promotionCodeID: 'pc-second' });
    const promotion = aPromotion('promo-1');

    first.setPromotion(promotion);
    second.setPromotion(promotion);
    expect(promotion.getPromotionCodes()).toStrictEqual([first, second]);

    first.removePromotion(promotion);

    // JUDGMENT CALL: this case exists solely to catch the single most likely mistranslation in the
    // whole port. CFML's `arrayFind` is 1-BASED and returns 0 for "not found", which is why
    // [model/entity/PromotionCode.cfc:L115] tests `index > 0`.
    expect(promotion.getPromotionCodes()).toStrictEqual([second]);
  });

  it('preserves the order of the codes it did not remove', () => {
    const codes = [
      aPromotionCode({ promotionCodeID: 'pc-a' }),
      aPromotionCode({ promotionCodeID: 'pc-b' }),
      aPromotionCode({ promotionCodeID: 'pc-c' }),
    ];
    const promotion = aPromotion('promo-1');

    for (const code of codes) {
      code.setPromotion(promotion);
    }
    codes[1]?.removePromotion(promotion);

    expect(promotion.getPromotionCodes().map((code) => code.getPromotionCodeID())).toStrictEqual([
      'pc-a',
      'pc-c',
    ]);
  });

  it('matches the row to remove by primary key, not by object identity', () => {
    const promotion = aPromotion('promo-1');
    const persisted = aPromotionCode({ promotionCodeID: 'pc-shared' });
    const otherHydration = aPromotionCode({ promotionCodeID: 'pc-shared' });

    persisted.setPromotion(promotion);
    otherHydration.removePromotion(promotion);

    // A second hydration of the same row must be able to detach it. Identity comparison would
    // leave a phantom entry behind that no caller could ever remove.
    expect(promotion.getPromotionCodes()).toStrictEqual([]);
  });

  it('falls back to the currently-set promotion when the argument is omitted', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const promotion = aPromotion('promo-1');

    subject.setPromotion(promotion);
    subject.removePromotion();

    // CFML parity [model/entity/PromotionCode.cfc:L110-L112]: the argument is OPTIONAL -
    // `removePromotion(any promotion)` with no `required` - and L110-L112 defaults it from
    // `variables.promotion` when `structKeyExists(arguments, 'promotion')` is false.
    expect(promotion.getPromotionCodes()).toStrictEqual([]);
    expect(subject.getPromotion()).toBeUndefined();
  });

  it('treats an explicit undefined argument exactly as an omitted one', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const promotion = aPromotion('promo-1');

    subject.setPromotion(promotion);
    subject.removePromotion(undefined);

    // CFML has no distinction between "key absent from the arguments scope" and "key present but
    // null" that a caller could exploit here, so collapsing both onto the near-side fallback is
    // the faithful reading.
    expect(promotion.getPromotionCodes()).toStrictEqual([]);
    expect(subject.getPromotion()).toBeUndefined();
  });

  it('clears the near side even when the far side never held the code', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const holder = aPromotion('promo-holder');
    const stranger = aPromotion('promo-stranger');

    subject.setPromotion(holder);
    subject.removePromotion(stranger);

    // CFML parity [model/entity/PromotionCode.cfc:L118]: `structDelete(variables, "promotion")`
    // sits OUTSIDE the `if(index > 0)` block at L115-L117, so it runs whether or not the search
    // found anything.
    expect(subject.getPromotion()).toBeUndefined();
    expect(stranger.getPromotionCodes()).toStrictEqual([]);
    expect(holder.getPromotionCodes()).toStrictEqual([subject]);
  });

  it('throws when called with no argument and no promotion set', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });

    // CFML parity [model/entity/PromotionCode.cfc:L110-L113]: with no argument and a null
    // `variables.promotion`, L113 dereferences null and the CF engine raises.
    expect(() => {
      subject.removePromotion();
    }).toThrow(/no argument while no promotion is set/);
  });

  it('throws again on a second argument-less call, because the first cleared the near side', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const promotion = aPromotion('promo-1');

    subject.setPromotion(promotion);
    subject.removePromotion();

    expect(() => {
      subject.removePromotion();
    }).toThrow(/model\/entity\/PromotionCode\.cfc:L110-L113/);
  });

  it('detaches an unsaved code by identity, since every unsaved row shares the empty key', () => {
    const subject = aPromotionCode({ promotionCodeID: '' });
    const sibling = aPromotionCode({ promotionCodeID: '' });
    const promotion = aPromotion('promo-1');

    subject.setPromotion(promotion);
    sibling.setPromotion(promotion);
    expect(promotion.getPromotionCodes()).toStrictEqual([subject, sibling]);

    subject.removePromotion(promotion);

    // Primary-key comparison alone would have matched the sibling too, because both keys are `''`.
    // The identity fallback is what makes an unsaved row detachable as itself.
    expect(promotion.getPromotionCodes()).toStrictEqual([sibling]);
  });

  it('is reachable through Promotion.removePromotionCode with identical effect', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const promotion = aPromotion('promo-1');

    promotion.addPromotionCode(subject);
    promotion.removePromotionCode(subject);

    // CFML parity [model/entity/Promotion.cfc:L153-L155]: the far side delegates to
    // `promotionCode.removePromotion(this)`.
    expect(promotion.getPromotionCodes()).toStrictEqual([]);
    expect(subject.getPromotion()).toBeUndefined();
  });

  it('declares exactly one parameter, and it is optional', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const promotion = aPromotion('promo-1');

    // CFML parity [model/entity/PromotionCode.cfc:L109]: `removePromotion(any promotion)` declares
    // one parameter and does not mark it `required`, which is why L110-L112 has a default to apply
    // at all. The port's `promotion?: Promotion` is the same shape.
    //
    // JUDGMENT CALL: arity is asserted as 1, not.
    expect(subject.removePromotion.bind(subject)).toHaveLength(1);

    // And it really is optional at both the type level and the call site - the two calls below are
    // the only two shapes the source supports, and both are exercised above.
    subject.setPromotion(promotion);
    expect(() => {
      subject.removePromotion();
    }).not.toThrow();
  });
});

describe('the accounts many-to-many reproduces addAccount ASYMMETRIC guard polarity', () => {
  // L123, the NEAR-side guard: `if(arguments.account.isNew() or !hasAccount(arguments.account))`
  // > tests the ARGUMENT's newness before appending to `variables.accounts` at L124. * L126.
  //
  // Two separate `if` statements, never an `else`, and each consults a different object's key.

  it('attaches both sides for a saved code and a saved account', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const link = anAccountLink('acct-1');

    subject.addAccount(link);

    expect(subject.getAccounts()).toStrictEqual([link]);
    expect(link.getPromotionCodes()).toStrictEqual([subject]);
    expect(subject.hasAccount(link)).toBe(true);
  });

  it('duplicates on the NEAR side only when the ACCOUNT is unsaved', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const unsavedLink = anAccountLink('');

    expect(unsavedLink.isNew()).toBe(true);
    expect(subject.isNew()).toBe(false);

    subject.addAccount(unsavedLink);
    subject.addAccount(unsavedLink);

    // L123's first disjunct is satisfied both times, so the near-side containment probe never runs
    // and the row is appended twice...
    expect(subject.getAccounts()).toHaveLength(2);
    // while L126's first disjunct is FALSE for a saved code, so the far-side probe does run and
    // suppresses the second append. One call, two different outcomes, by design.
    expect(unsavedLink.getPromotionCodes()).toHaveLength(1);
  });

  it('duplicates on the FAR side only when the CODE is unsaved - the exact mirror image', () => {
    const subject = aPromotionCode({ promotionCodeID: '' });
    const savedLink = anAccountLink('acct-1');

    expect(subject.isNew()).toBe(true);
    expect(savedLink.isNew()).toBe(false);

    subject.addAccount(savedLink);
    subject.addAccount(savedLink);

    // L123's first disjunct is FALSE for a saved account, so `hasAccount` runs and suppresses the
    // second near-side append...
    expect(subject.getAccounts()).toHaveLength(1);
    // while L126's first disjunct is satisfied both times, so the far-side probe is never
    // consulted at all and the code lands twice.
    expect(savedLink.getPromotionCodes()).toHaveLength(2);
    expect(savedLink.hasPromotionCodeCallCount()).toBe(0);
  });

  it('runs the two guards independently, so an already-attached saved pair appends nothing', () => {
    const link = anAccountLink('acct-1');
    const subject = aPromotionCode({ promotionCodeID: 'pc-1', accounts: [link] });

    link.getPromotionCodes().push(subject);

    subject.addAccount(link);
    expect(subject.getAccounts()).toHaveLength(1);
    expect(link.getPromotionCodes()).toHaveLength(1);
  });

  it('appends to the private field, which getAccounts() hands back live and read-only', () => {
    const seeded: AccountLinkProbe[] = [];
    const subject = aPromotionCode({ promotionCodeID: 'pc-1', accounts: seeded });
    const link = anAccountLink('acct-1');

    // CFML parity [model/entity/PromotionCode.cfc:L124]: the append targets `variables.accounts`
    // directly, not `getAccounts()`.
    subject.addAccount(link);

    expect(subject.getAccounts()).toBe(seeded);
    expect(seeded).toStrictEqual([link]);

    const readonlyView: readonly AccountLink[] = subject.getAccounts();

    // @ts-expect-error `push` is absent from a readonly array view: maintenance runs through addAccount.
    const mutator: unknown = readonlyView.push;

    // JUDGMENT CALL: the value is a function at runtime, because the underlying object is a real
    // `Array` - the readonly guarantee is a COMPILE-TIME one.
    expect(typeof mutator).toBe('function');
  });

  it('removes both sides on removeAccount, with independent guards', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const link = anAccountLink('acct-1');

    subject.addAccount(link);
    subject.removeAccount(link);

    // CFML parity [model/entity/PromotionCode.cfc:L130-L139]: `removeAccount` is FULLY SYMMETRIC -
    // `thisIndex` at L131 over the near side, `thatIndex` at L135 over the far side, each guarded
    // independently at L132 and L136. Both sides genuinely detach.
    expect(subject.getAccounts()).toStrictEqual([]);
    expect(link.getPromotionCodes()).toStrictEqual([]);
    expect(subject.hasAccount(link)).toBe(false);
  });

  it('removes a first-element match on BOTH sides, proving both index bases were translated', () => {
    const first = anAccountLink('acct-first');
    const second = anAccountLink('acct-second');
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const cohabitant = aPromotionCode({ promotionCodeID: 'pc-other' });

    subject.addAccount(first);
    subject.addAccount(second);
    cohabitant.addAccount(first);

    expect(subject.getAccounts()).toHaveLength(2);
    expect(first.getPromotionCodes()).toStrictEqual([subject, cohabitant]);

    subject.removeAccount(first);

    // The near side loses element 0 of two, and the far side loses element 0 of two. Both `> 0`
    // tests at L132 and L136 had to become `!== -1`; missing either would leave one side stale.
    expect(subject.getAccounts()).toStrictEqual([second]);
    expect(first.getPromotionCodes()).toStrictEqual([cohabitant]);
  });

  it('is total - removing an account neither side holds throws nothing and changes nothing', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const stranger = anAccountLink('acct-stranger');

    expect(() => {
      subject.removeAccount(stranger);
    }).not.toThrow();
    expect(subject.getAccounts()).toStrictEqual([]);
    expect(stranger.getPromotionCodes()).toStrictEqual([]);
  });

  it('separates unsaved account rows by identity rather than by their shared empty key', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const firstUnsaved = anAccountLink('');
    const secondUnsaved = anAccountLink('');

    subject.addAccount(firstUnsaved);
    subject.addAccount(secondUnsaved);
    expect(subject.getAccounts()).toStrictEqual([firstUnsaved, secondUnsaved]);

    subject.removeAccount(firstUnsaved);

    // Key comparison alone would have matched either row, since both `accountID`s are `''`.
    expect(subject.getAccounts()).toStrictEqual([secondUnsaved]);
    expect(subject.hasAccount(secondUnsaved)).toBe(true);
    expect(subject.hasAccount(firstUnsaved)).toBe(false);
  });

  it('answers hasAccount by primary key across two hydrations of the same account row', () => {
    const held = anAccountLink('acct-1');
    const otherHydration = anAccountLink('acct-1');
    const different = anAccountLink('acct-2');
    const subject = aPromotionCode({ promotionCodeID: 'pc-1', accounts: [held] });

    expect(subject.hasAccount(held)).toBe(true);
    expect(subject.hasAccount(otherHydration)).toBe(true);
    expect(subject.hasAccount(different)).toBe(false);
  });

  it('falls back to identity for the whole probe once any held account row is unsaved', () => {
    const unsavedHeld = anAccountLink('');
    const savedHeld = anAccountLink('acct-1');
    const otherHydrationOfSaved = anAccountLink('acct-1');
    const subject = aPromotionCode({
      promotionCodeID: 'pc-1',
      accounts: [unsavedHeld, savedHeld],
    });

    // JUDGMENT CALL: the fallback is collection-wide, not per-candidate.
    expect(subject.hasAccount(savedHeld)).toBe(true);
    expect(subject.hasAccount(unsavedHeld)).toBe(true);
    expect(subject.hasAccount(otherHydrationOfSaved)).toBe(false);
  });

  it('starts from an empty collection when the constructor names none', () => {
    const subject = aPromotionCode();

    expect(subject.getAccounts()).toStrictEqual([]);
  });

  it('exposes the shared fixture graph account links without naming an Account type', () => {
    const fixtures = makePromotionFixtures();

    // The shared graph supplies the same narrow projection this suite builds by hand.
    expect(fixtures.promotionCodeAccounts.length).toBeGreaterThan(0);
    for (const link of fixtures.promotionCodeAccounts) {
      expect(typeof link.getAccountID()).toBe('string');
      expect(typeof link.isNew()).toBe('boolean');
      expect(Array.isArray(link.getPromotionCodes())).toBe(true);
    }
  });
});

describe('the orders many-to-many is pure inverse-side delegation, kept entirely opaque', () => {
  // CFML parity [model/entity/PromotionCode.cfc:L142-L147]: `addOrder` and `removeOrder` are one
  // LINE each and touch nothing on this row - they hand the whole job to the owning side, which is
  // `Order.cfc`.

  it('delegates addOrder to the owning side and leaves its own collection untouched', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const order = anOrderLink('order-1');

    subject.addOrder(order);

    expect(order.delegatedCalls()).toStrictEqual(['addPromotionCode']);
    expect(order.heldCodes()).toStrictEqual([subject]);
    // CFML parity [model/entity/PromotionCode.cfc:L143]: no near-side append, no guard, no
    // containment probe. The inverse side stays out of it entirely.
    expect(subject.getOrders()).toStrictEqual([]);
  });

  it('delegates removeOrder to the owning side REMOVER, never to an adder', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const order = anOrderLink('order-1');

    subject.addOrder(order);
    subject.removeOrder(order);

    // The inversion cross-check, asserted rather than merely claimed. Verdict for this component:
    // clean.
    expect(order.delegatedCalls()).toStrictEqual(['addPromotionCode', 'removePromotionCode']);
    expect(order.heldCodes()).toStrictEqual([]);
  });

  it('hands getOrders() back live and mutable, because the OWNING side splices through it', () => {
    const seeded: OrderLinkProbe[] = [];
    const subject = aPromotionCode({ promotionCodeID: 'pc-1', orders: seeded });
    const order = anOrderLink('order-1');

    // CFML parity [model/entity/Order.cfc:L845, L855]: the owning side performs
    // `arrayAppend(arguments.promotionCode.getOrders(), this)` and
    // `arrayDeleteAt(arguments.promotionCode.getOrders(), thatIndex)`.
    //
    // JUDGMENT CALL: this is the one deliberate asymmetry between the two collection accessors on
    // this row - `getAccounts()` is a readonly view because no legacy site mutates through it, and
    // `getOrders()` is mutable because two do.
    expect(subject.getOrders()).toBe(seeded);

    subject.getOrders().push(order);
    expect(subject.getOrders()).toStrictEqual([order]);
    expect(subject.hasOrder(order)).toBe(true);

    subject.getOrders().splice(0, 1);
    expect(subject.getOrders()).toStrictEqual([]);
    expect(seeded).toStrictEqual([]);
  });

  it('answers hasOrder by primary key across two hydrations of the same order row', () => {
    const held = anOrderLink('order-1');
    const otherHydration = anOrderLink('order-1');
    const different = anOrderLink('order-2');
    const subject = aPromotionCode({ promotionCodeID: 'pc-1', orders: [held] });

    expect(subject.hasOrder(held)).toBe(true);
    expect(subject.hasOrder(otherHydration)).toBe(true);
    expect(subject.hasOrder(different)).toBe(false);
  });

  it('separates unsaved order rows by identity rather than by their shared empty key', () => {
    const firstUnsaved = anOrderLink('');
    const secondUnsaved = anOrderLink('');
    const subject = aPromotionCode({
      promotionCodeID: 'pc-1',
      orders: [firstUnsaved, secondUnsaved],
    });

    expect(subject.hasOrder(firstUnsaved)).toBe(true);
    expect(subject.hasOrder(secondUnsaved)).toBe(true);
    expect(subject.hasOrder(anOrderLink(''))).toBe(false);
  });

  it('models no order state - the projection carries an opaque id and two methods, nothing else', () => {
    const order = anOrderLink('order-1');
    const memberNames = Object.keys(order).sort();

    // The two probe members are this SUITE's instrumentation, not part of the projection the
    // entity requires. What matters is what is ABSENT: no total, no item collection, no
    // fulfillment, no status, no account.
    expect(memberNames).toStrictEqual([
      'addPromotionCode',
      'delegatedCalls',
      'getOrderID',
      'heldCodes',
      'removePromotionCode',
    ]);
    expect(order.getOrderID()).toBe('order-1');
  });

  it('keeps the opaque order references in the shared fixture graph opaque', () => {
    const fixtures = makePromotionFixtures();

    // The graph records every out-of-scope aggregate reference as a bare identifier STRING.
    const references = fixtures.opaqueOrderReferences;

    expect(typeof references.orderID).toBe('string');
    expect(typeof references.orderItemID).toBe('string');
    expect(typeof references.secondOrderItemID).toBe('string');
    expect(typeof references.orderFulfillmentID).toBe('string');
    expect(typeof references.accountID).toBe('string');

    expect(fixtures.promotionCodeOrders.length).toBeGreaterThan(0);
    for (const link of fixtures.promotionCodeOrders) {
      expect(typeof link.getOrderID()).toBe('string');
    }
  });

  it('connects the delete-context schema to the member that consults it', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1', orders: [anOrderLink('order-1')] });

    // CFML parity `model/validation/PromotionCode.json`: the ENTIRE delete context for this entity
    // is one rule - `"orders": [{"contexts":"delete","maxCollection":0}]` - meaning a code that
    // has ever been used on an order may not be deleted.
    expect(subject.getOrders()).toHaveLength(1);

    // The member that CONSULTS it is `isDeletable`, which `model/entity/PromotionCode.cfc` never
    // declares and the framework base supplied. The gate's input and its evaluator now sit on the
    // same object, and the evaluator answers from that input.
    expect(VALIDATION_RULES_AS_WRITTEN.properties.orders[0]?.contexts).toBe('delete');
    expect(VALIDATION_RULES_AS_WRITTEN.properties.orders[0]?.maxCollection).toBe(0);
    expect('isDeletable' in subject).toBe(true);
    expect(subject.isDeletable()).toBe(false);
  });
});

describe('hasUniquePromotionCode() is the METHOD-based uniqueness route, not a declarative one', () => {
  // CFML parity [model/entity/PromotionCode.cfc:L53, model/validation/PromotionCode.json]: the
  // uniqueness of a promotion code is enforced by a custom entity validator and by nothing else.

  it('is a real member on the class, wired by name from the schema', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const fixtures = makePromotionFixtures();

    // The one non-tautological half of the schema record: the method the JSON names must actually
    // exist on the ported class, or the declarative rule would reference nothing.
    expect(VALIDATION_RULES_AS_WRITTEN.properties.promotionCode[0]?.method).toBe(
      'hasUniquePromotionCode',
    );
    expect(fixtures.uniquePromotionCodeValidatorName).toBe('hasUniquePromotionCode');
    expect(prototypeMembers()).toContain('hasUniquePromotionCode');
    expect(typeof subject.hasUniquePromotionCode()).toBe('boolean');
  });

  it('carries no declarative unique keyword at either the ORM or the schema level', () => {
    const promotionCodeRule = VALIDATION_RULES_AS_WRITTEN.properties.promotionCode[0];

    expect(promotionCodeRule).toBeDefined();
    expect(
      promotionCodeRule === undefined ? [] : Object.keys(promotionCodeRule).sort(),
    ).toStrictEqual(['contexts', 'method', 'required']);
    expect(promotionCodeRule === undefined ? true : 'unique' in promotionCodeRule).toBe(false);
  });

  it('answers true for a genuinely unique value among several siblings', () => {
    const promotion = aPromotion('promo-1');
    const subject = aPromotionCode({ promotionCodeID: 'pc-1', promotionCode: 'SUMMER25' });

    subject.setPromotion(promotion);
    aPromotionCode({ promotionCodeID: 'pc-2', promotionCode: 'WINTER25' }).setPromotion(promotion);
    aPromotionCode({ promotionCodeID: 'pc-3', promotionCode: 'SPRING25' }).setPromotion(promotion);

    expect(subject.hasUniquePromotionCode()).toBe(true);
  });

  it('answers false for a sibling colliding on value but differing only in CASE', () => {
    const promotion = aPromotion('promo-1');
    const subject = aPromotionCode({ promotionCodeID: 'pc-1', promotionCode: 'save10' });

    subject.setPromotion(promotion);
    aPromotionCode({ promotionCodeID: 'pc-2', promotionCode: 'SAVE10' }).setPromotion(promotion);

    // CFML parity [model/entity/PromotionCode.cfc:L53]: the legacy check reached the database,
    // where the comparison ran under MySQL's default case-INSENSITIVE collation.
    expect(subject.hasUniquePromotionCode()).toBe(false);
  });

  it('excludes itself by primary key, so the only match being itself is still unique', () => {
    const promotion = aPromotion('promo-1');
    const subject = aPromotionCode({ promotionCodeID: 'pc-1', promotionCode: 'SAVE10' });

    subject.setPromotion(promotion);
    expect(promotion.getPromotionCodes()).toStrictEqual([subject]);

    // Without self-exclusion the validator would refuse every save of every existing code, because
    // a persisted row always finds itself.
    expect(subject.hasUniquePromotionCode()).toBe(true);
  });

  it('excludes a distinct hydration of ITSELF, matched by primary key rather than identity', () => {
    const promotion = aPromotion('promo-1');
    const persisted = aPromotionCode({ promotionCodeID: 'pc-1', promotionCode: 'SAVE10' });
    const sameRowAgain = aPromotionCode({ promotionCodeID: 'pc-1', promotionCode: 'SAVE10' });

    persisted.setPromotion(promotion);
    sameRowAgain.setPromotion(promotion);

    // Two objects, one row. An identity-based self-exclusion would have each object report the
    // other as a colliding sibling and refuse both saves.
    expect(persisted.hasUniquePromotionCode()).toBe(true);
    expect(sameRowAgain.hasUniquePromotionCode()).toBe(true);
  });

  it('ignores unsaved siblings, which no database query could have seen', () => {
    const promotion = aPromotion('promo-1');
    const subject = aPromotionCode({ promotionCodeID: 'pc-1', promotionCode: 'SAVE10' });
    const unsavedTwin = aPromotionCode({ promotionCodeID: '', promotionCode: 'SAVE10' });

    subject.setPromotion(promotion);
    unsavedTwin.setPromotion(promotion);

    // JUDGMENT CALL: an unsaved sibling is invisible to the validator, because the legacy check
    // was a SELECT and an un-flushed row is not in the table yet.
    expect(subject.hasUniquePromotionCode()).toBe(true);
  });

  it('ignores siblings whose own code value is absent or empty', () => {
    const promotion = aPromotion('promo-1');
    const subject = aPromotionCode({ promotionCodeID: 'pc-1', promotionCode: 'SAVE10' });

    subject.setPromotion(promotion);
    aPromotionCode({ promotionCodeID: 'pc-2', promotionCode: undefined }).setPromotion(promotion);
    aPromotionCode({ promotionCodeID: 'pc-3', promotionCode: '' }).setPromotion(promotion);

    // A sibling awaiting its `preInsert()` repair carries no value to collide with.
    expect(subject.hasUniquePromotionCode()).toBe(true);
  });

  it('answers true when this row has no code value of its own yet', () => {
    const promotion = aPromotion('promo-1');
    const absent = aPromotionCode({ promotionCodeID: 'pc-1', promotionCode: undefined });
    const empty = aPromotionCode({ promotionCodeID: 'pc-2', promotionCode: '' });

    absent.setPromotion(promotion);
    empty.setPromotion(promotion);
    aPromotionCode({ promotionCodeID: 'pc-3', promotionCode: 'SAVE10' }).setPromotion(promotion);

    // CFML parity: `len()` truthiness treats a null and an empty string alike, and there is
    // nothing to compare either way. `preInsert()` is what will supply a value at insert time.
    expect(absent.hasUniquePromotionCode()).toBe(true);
    expect(empty.hasUniquePromotionCode()).toBe(true);
  });

  it('answers true when no promotion is materialized - the documented database-wide GAP', () => {
    const orphan = aPromotionCode({ promotionCodeID: 'pc-1', promotionCode: 'SAVE10' });

    expect(orphan.getPromotion()).toBeUndefined();
    expect(orphan.hasUniquePromotionCode()).toBe(true);

    // The gap, recorded rather than papered over. The legacy validator was database-WIDE: it
    // queried `SwPromotionCode` for the value across every promotion.
    //
    // JUDGMENT CALL: answering `true` is the right failure mode for a domain row, and inventing a
    // repository lookup here would be worse in three separate ways: it would make a synchronous
    // legacy accessor asynchronous.
    const promotion = aPromotion('promo-1');
    const attached = aPromotionCode({ promotionCodeID: 'pc-2', promotionCode: 'SAVE10' });

    attached.setPromotion(promotion);
    expect(attached.hasUniquePromotionCode()).toBe(true);
  });

  it('takes no argument and returns a boolean, matching the declarative invocation shape', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1', promotionCode: 'SAVE10' });

    // The framework invoked a named validator with no arguments and read its boolean, so the port
    // keeps that arity. Widening it would break the very wiring the schema declares.
    expect(subject.hasUniquePromotionCode.bind(subject)).toHaveLength(0);
    expect(subject.hasUniquePromotionCode()).toBe(true);
  });

  it('exhibits the collision in the shared fixture graph, from both directions', () => {
    const fixtures = makePromotionFixtures();
    expect(fixtures.collidingPromotionCode.hasUniquePromotionCode()).toBe(false);
    expect(fixtures.promotionCode.hasUniquePromotionCode()).toBe(true);
    expect(fixtures.promotionCode.getPromotionCode()?.toLowerCase()).toBe(
      fixtures.collidingPromotionCode.getPromotionCode()?.toLowerCase(),
    );
    expect(fixtures.promotionCode.getPromotionCode()).not.toBe(
      fixtures.collidingPromotionCode.getPromotionCode(),
    );
  });
});

describe('the declarative validation schema is recorded exactly, and nothing is invented', () => {
  // JUDGMENT CALL: `model/validation/PromotionCode.json` is recorded as data and cross-checked
  // against the shipped surface, not executed.

  it('declares rules for exactly four properties and one condition', () => {
    expect(Object.keys(VALIDATION_RULES_AS_WRITTEN.properties).sort()).toStrictEqual([
      'endDateTime',
      'orders',
      'promotionCode',
      'startDateTime',
    ]);
    expect(Object.keys(VALIDATION_RULES_AS_WRITTEN.conditions)).toStrictEqual([
      'needsEndAfterStart',
    ]);
  });

  it('gates no accounts collection, despite accounts being the OWNER side', () => {
    // A deliberate absence, asserted as one. `orders` - the INVERSE side - carries a
    // `maxCollection: 0` delete gate, while `accounts` - the side this entity actually OWNS -
    // carries no rule at all.
    expect('accounts' in VALIDATION_RULES_AS_WRITTEN.properties).toBe(false);
  });

  it('names both date bounds as date-typed on save only', () => {
    expect(VALIDATION_RULES_AS_WRITTEN.properties.startDateTime[0]?.contexts).toBe('save');
    expect(VALIDATION_RULES_AS_WRITTEN.properties.startDateTime[0]?.dataType).toBe('date');
    expect(VALIDATION_RULES_AS_WRITTEN.properties.endDateTime[0]?.contexts).toBe('save');
    expect(VALIDATION_RULES_AS_WRITTEN.properties.endDateTime[0]?.dataType).toBe('date');
    expect(VALIDATION_RULES_AS_WRITTEN.properties.startDateTime).toHaveLength(1);
    expect(VALIDATION_RULES_AS_WRITTEN.properties.endDateTime).toHaveLength(2);
  });

  it('makes the end-after-start comparison CONDITIONAL on both bounds being present', () => {
    const conditionalRule = VALIDATION_RULES_AS_WRITTEN.properties.endDateTime[1];
    const condition = VALIDATION_RULES_AS_WRITTEN.conditions.needsEndAfterStart;

    expect(conditionalRule?.conditions).toBe('needsEndAfterStart');
    expect(conditionalRule?.gtProperty).toBe('startDateTime');
    expect(condition.startDateTime.required).toBe(true);
    expect(condition.endDateTime.required).toBe(true);
  });

  it('confirms the conditional does not fire on any row with an absent bound', () => {
    const fixtures = makePromotionFixtures();
    const rowsWithAnAbsentBound = fixtures.periodDateBoundsCases.filter(
      (bounds) => bounds.startDateTimeUTC === undefined || bounds.endDateTimeUTC === undefined,
    );
    const rowsFailingTheComparison = fixtures.periodDateBoundsCases.filter(
      (bounds) => !bounds.satisfiesNeedsEndAfterStart,
    );

    // The condition requires both bounds, so a row missing either one never reaches the comparison
    // and is accepted - which is the schema's own agreement with `getCurrentFlag`'s
    // null-permissiveness.
    expect(rowsWithAnAbsentBound).toHaveLength(3);
    for (const bounds of rowsWithAnAbsentBound) {
      expect(bounds.satisfiesNeedsEndAfterStart).toBe(true);
    }

    // Only the two DEGENERATE windows fail, and both have both bounds present: `endBeforeStart`
    // and `endEqualsStart`.
    expect(rowsFailingTheComparison.map((bounds) => bounds.name).sort()).toStrictEqual([
      'endBeforeStart',
      'endEqualsStart',
    ]);
    for (const bounds of rowsFailingTheComparison) {
      expect(bounds.startDateTimeUTC).toBeDefined();
      expect(bounds.endDateTimeUTC).toBeDefined();
    }
  });

  it('shares a condition NAME with the sibling schema without sharing an implementation', () => {
    const fixtures = makePromotionFixtures();

    // `model/validation/PromotionPeriod.json` declares an identically-named `needsEndAfterStart`
    // with the identical two-required-property body. The duplication is REAL and is recorded.
    //
    // JUDGMENT CALL: no shared schema helper is extracted for it.
    expect(fixtures.conditionalDateValidationName).toBe('needsEndAfterStart');
    expect(fixtures.conditionalDateValidationComparison).toBe('gtProperty: startDateTime');
    expect(
      Object.keys(VALIDATION_RULES_AS_WRITTEN.conditions.needsEndAfterStart).sort(),
    ).toStrictEqual(['endDateTime', 'startDateTime']);
  });

  it('names only properties and methods that actually exist on the ported row', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });

    // The schema is only meaningful if every property it gates is readable and every method it
    // invokes is present. This is the assertion that keeps the recorded inventory honest rather
    // than self-referential.
    expect(subject.getPromotionCode()).toBeUndefined();
    expect(subject.getStartDateTime()).toBeUndefined();
    expect(subject.getEndDateTime()).toBeUndefined();
    expect(subject.getOrders()).toStrictEqual([]);
    expect('hasUniquePromotionCode' in subject).toBe(true);
  });

  it('asserts no zod schema, because enforcement lives at the service tier', () => {
    const subject = aPromotionCode({
      promotionCodeID: 'pc-1',
      startDateTime: atUtc(WINDOW_END_UTC),
      endDateTime: atUtc(WINDOW_START_UTC),
    });

    // A row whose end precedes its start violates `needsEndAfterStart`, and the entity accepts it
    // without complaint - no throw, no coercion, no reordering.
    expect(subject.getStartDateTime()?.toISOString()).toBe(WINDOW_END_UTC);
    expect(subject.getEndDateTime()?.toISOString()).toBe(WINDOW_START_UTC);
    expect(prototypeMembers()).not.toContain('validate');
    expect(prototypeMembers()).not.toContain('parse');
    expect(prototypeMembers()).not.toContain('safeParse');
  });
});

describe('preInsert() repairs an absent code and never overwrites a present one', () => {
  // The "assinged" typo at L180 is preserved verbatim in the ported comment, misspelling intact.
  //
  // Specification correction, and it matters for how this block is written: the shipped member is
  // `preInsert(): void`, not `applyPreInsertPromotionCode(generatedCode)`.

  it('assigns a generated code when the value is absent', () => {
    const subject = aPromotionCode({ promotionCode: undefined });

    expect(subject.getPromotionCode()).toBeUndefined();

    subject.preInsert();

    expect(subject.getPromotionCode()).toMatch(CFML_SHAPED_UUID);
  });

  it('assigns a generated code when the value is the empty string', () => {
    const subject = aPromotionCode({ promotionCode: '' });

    subject.preInsert();

    // CFML parity [model/entity/PromotionCode.cfc:L181]: the guard is `isNull(...) ||... == ""`,
    // so a blank is repaired exactly like a null.
    expect(subject.getPromotionCode()).toMatch(CFML_SHAPED_UUID);
    expect(subject.getPromotionCode()).not.toBe('');
  });

  it('leaves a non-empty code completely untouched', () => {
    const subject = aPromotionCode({ promotionCode: 'SUMMER25' });

    subject.preInsert();

    expect(subject.getPromotionCode()).toBe('SUMMER25');
  });

  it('leaves even a whitespace-only code untouched, because the guard tests emptiness only', () => {
    const subject = aPromotionCode({ promotionCode: '   ' });

    subject.preInsert();

    // CFML parity [model/entity/PromotionCode.cfc:L181]: the comparison is against `""`, with no
    // `trim()` anywhere. A whitespace-only code is therefore a value the source accepts, and the
    // port does not invent a trim the source never had.
    expect(subject.getPromotionCode()).toBe('   ');
  });

  it('generates the CFML shape - 8-4-4-16 uppercase hexadecimal, 35 characters', () => {
    const subject = aPromotionCode({ promotionCode: undefined });

    subject.preInsert();
    const generated = subject.getPromotionCode();

    // CFML parity [model/entity/PromotionCode.cfc:L182]: `createUUID()` is deliberately not an RFC
    // 4122 rendering - CFML merges the final two groups, producing 8-4-4-16 rather than
    // 8-4-4-4-12, and returns uppercase hexadecimal.
    expect(generated).toMatch(CFML_SHAPED_UUID);
    expect(generated).toHaveLength(CFML_SHAPED_UUID_LENGTH);
    expect(generated?.split('-')).toHaveLength(4);
    expect(generated).toBe(generated?.toUpperCase());
  });

  it('★★ generates a distinct value on each repair, from a SCRIPTED source so both are exact', () => {
    // Deterministic, and strictly stronger than the form it replaces.
    scriptedUuid.queue.length = 0;
    scriptedUuid.draws = 0;
    scriptedUuid.queue.push(
      '0189a3b4-c5d6-47e8-9f01-23456789abcd',
      'fedcba98-7654-4321-8fed-cba987654321',
    );

    const first = aPromotionCode({ promotionCode: undefined });
    const second = aPromotionCode({ promotionCode: undefined });

    first.preInsert();
    second.preInsert();

    // 32 hexadecimal digits, uppercased, regrouped 8-4-4-16 - so the FOURTH group is the RFC
    // form's final two groups merged, which is exactly where CFML's 35-character shape comes from.
    expect(first.getPromotionCode()).toBe('0189A3B4-C5D6-47E8-9F0123456789ABCD');
    expect(second.getPromotionCode()).toBe('FEDCBA98-7654-4321-8FEDCBA987654321');

    expect(first.getPromotionCode()).not.toBe(second.getPromotionCode());
    expect(first.getPromotionCode()).toMatch(CFML_SHAPED_UUID);
    expect(second.getPromotionCode()).toMatch(CFML_SHAPED_UUID);

    // One draw per repair.
    expect(scriptedUuid.draws).toBe(2);
    expect(scriptedUuid.queue).toHaveLength(0);
  });

  it('is idempotent - a second call keeps the value the first one generated', () => {
    const subject = aPromotionCode({ promotionCode: undefined });

    subject.preInsert();
    const generated = subject.getPromotionCode();
    subject.preInsert();
    subject.preInsert();

    // This is what makes the hook safe to invoke on a retried insert, which matters because the
    // target has no ambient transaction to roll a partial write back with.
    expect(subject.getPromotionCode()).toBe(generated);
  });

  it('takes no argument and returns undefined', () => {
    const subject = aPromotionCode({ promotionCode: undefined });

    // CFML parity [model/entity/PromotionCode.cfc:L179]: `public any function preInsert()`
    // declares no parameter, and the port matches it.
    expect(subject.preInsert.bind(subject)).toHaveLength(0);
    expect(subject.preInsert()).toBeUndefined();
  });

  it('touches no other column while repairing the code', () => {
    const accountLink = anAccountLink('acct-1');
    const orderLink = anOrderLink('order-1');
    const promotion = aPromotion('promo-1');
    const subject = aPromotionCode({
      promotionCodeID: 'pc-1',
      promotionCode: undefined,
      startDateTime: atUtc(WINDOW_START_UTC),
      endDateTime: atUtc(WINDOW_END_UTC),
      maximumUseCount: 50,
      maximumAccountUseCount: 1,
      promotion,
      promotionID: 'promo-1',
      remoteID: 'legacy-4471',
      createdDateTime: atUtc(WINDOW_START_UTC),
      createdByAccountID: 'acct-author',
      modifiedDateTime: atUtc(MODIFIED_UTC),
      modifiedByAccountID: 'acct-editor',
      accounts: [accountLink],
      orders: [orderLink],
    });

    subject.preInsert();

    // CFML parity [model/entity/PromotionCode.cfc:L179-L185]: the hook's ENTIRE body is the
    // guarded code assignment.
    expect(subject.getPromotionCode()).toMatch(CFML_SHAPED_UUID);
    expect(subject.getPromotionCodeID()).toBe('pc-1');
    expect(subject.getStartDateTime()?.toISOString()).toBe(WINDOW_START_UTC);
    expect(subject.getEndDateTime()?.toISOString()).toBe(WINDOW_END_UTC);
    expect(subject.getMaximumUseCount()).toBe(50);
    expect(subject.getMaximumAccountUseCount()).toBe(1);
    expect(subject.getPromotion()).toBe(promotion);
    expect(subject.getPromotionID()).toBe('promo-1');
    expect(subject.getRemoteID()).toBe('legacy-4471');
    expect(subject.getCreatedDateTime()?.toISOString()).toBe(WINDOW_START_UTC);
    expect(subject.getCreatedByAccountID()).toBe('acct-author');
    expect(subject.getModifiedDateTime()?.toISOString()).toBe(MODIFIED_UTC);
    expect(subject.getModifiedByAccountID()).toBe('acct-editor');
    expect(subject.getAccounts()).toStrictEqual([accountLink]);
    expect(subject.getOrders()).toStrictEqual([orderLink]);
  });

  it('never throws for an unpersistable row, because the base-class throw path is not ported', () => {
    const bare = aPromotionCode();

    // JUDGMENT CALL: [org/Hibachi/HibachiEntity.cfc:L598-L606] wrapped its own `preInsert` in an
    // `!isPersistable()` check that dumped `getErrors()` to the response with `writeDump` and then
    // threw.
    expect(() => {
      bare.preInsert();
    }).not.toThrow();
    expect(bare.getPromotionCode()).toMatch(CFML_SHAPED_UUID);
  });

  it('has no preUpdate counterpart, unlike the three path-maintaining siblings', () => {
    const subject = aPromotionCode();

    // CFML parity [model/entity/PromotionCode.cfc:L179-L185]: `preInsert` is the component's only
    // lifecycle hook.
    expect(prototypeMembers()).not.toContain('preUpdate');
    expect('preUpdate' in subject).toBe(false);
  });

  it('records the guard-before-super ordering, which is deliberately NOT normalised', () => {
    const subject = aPromotionCode({ promotionCode: undefined });

    // CFML parity [model/entity/PromotionCode.cfc:L181-L184]: the guarded assignment runs at
    // L181-L183 and `super.preInsert()` only afterwards at L184.
    //
    // JUDGMENT CALL: the four orderings are not normalised to one another.
    subject.preInsert();

    expect(subject.getPromotionCode()).toMatch(CFML_SHAPED_UUID);
    // Nothing base-class-shaped survives for a caller to reach through.
    expect('super' in subject).toBe(false);
    expect(prototypeMembers()).not.toContain('isPersistable');
  });

  it('leaves setPromotionCode as the only writer of the code column', () => {
    const subject = aPromotionCode({ promotionCode: undefined });

    subject.setPromotionCode('MANUAL-CODE');
    expect(subject.getPromotionCode()).toBe('MANUAL-CODE');

    // and once set by hand, the hook stands down.
    subject.preInsert();
    expect(subject.getPromotionCode()).toBe('MANUAL-CODE');

    // CFML parity [model/entity/PromotionCode.cfc:L52-L80]: `promotionCode` is the only column
    // with a ported setter, because L182 is the only place the source writes a column through a
    // setter at all.
    expect(prototypeMembers().filter((name) => name.startsWith('set'))).toStrictEqual([
      'setPromotion',
      'setPromotionCode',
    ]);
  });
});

describe('the structural facts the row carries', () => {
  it('names promotionCode as its simple-representation property', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1', promotionCode: 'SAVE10' });

    // CFML parity [model/entity/PromotionCode.cfc:L171-L173]: this is the DECLARATIVE form of
    // simple representation - the entity names a property and the framework reads it - and this
    // entity is one of the few in the slice that genuinely overrides it.
    expect(subject.getSimpleRepresentationPropertyName()).toBe('promotionCode');
  });

  it('returns the property NAME, never the property VALUE', () => {
    const first = aPromotionCode({ promotionCode: 'SAVE10' });
    const second = aPromotionCode({ promotionCode: 'WINTER25' });
    const none = aPromotionCode({ promotionCode: undefined });

    // The single most likely misreading of this member, so it is pinned directly: the answer is
    // constant across rows and does not vary with the code value or with its absence.
    expect(first.getSimpleRepresentationPropertyName()).toBe('promotionCode');
    expect(second.getSimpleRepresentationPropertyName()).toBe('promotionCode');
    expect(none.getSimpleRepresentationPropertyName()).toBe('promotionCode');
    expect(none.getPromotionCode()).toBeUndefined();
  });

  it('overrides only the property name, and declares no getSimpleRepresentation body', () => {
    const subject = aPromotionCode();

    // CFML parity [model/entity/PromotionCode.cfc:L171-L173]: the source declares only
    // `getSimpleRepresentationPropertyName()`.
    expect('getSimpleRepresentation' in subject).toBe(false);
  });

  it('answers isNew() honestly from the empty unsaved key', () => {
    const fresh = aPromotionCode({ promotionCodeID: '' });
    const persisted = aPromotionCode({ promotionCodeID: 'pc-1' });

    // CFML parity [model/entity/PromotionCode.cfc:L52]: `unsavedvalue="" default=""` is what makes
    // this honest, and [org/Hibachi/HibachiEntity.cfc:L571-L576] read exactly that -
    // `if (getPrimaryIDValue() == "") { return true; }`.
    expect(fresh.isNew()).toBe(true);
    expect(persisted.isNew()).toBe(false);
  });

  it('carries the primary key through verbatim, normalising nothing', () => {
    expect(aPromotionCode({ promotionCodeID: 'PC-Mixed-Case' }).getPromotionCodeID()).toBe(
      'PC-Mixed-Case',
    );
    expect(aPromotionCode({ promotionCodeID: '' }).getPromotionCodeID()).toBe('');
  });

  it('reads the foreign key column even when the association is not materialized', () => {
    const unmaterialized = aPromotionCode({ promotionCodeID: 'pc-1', promotionID: 'promo-1' });

    // CFML parity [model/entity/PromotionCode.cfc:L60]: `promotion` is a many-to-one on
    // `fkcolumn="promotionID"` and - unlike [model/entity/PromotionPeriod.cfc:L59] - it carries no
    // `fetch="join"`, so it was LAZY.
    //
    // JUDGMENT CALL: exposing the raw foreign key alongside the optional association is a real
    // improvement over the legacy proxy, and a deliberate one.
    expect(unmaterialized.getPromotionID()).toBe('promo-1');
    expect(unmaterialized.getPromotion()).toBeUndefined();
  });

  it('leaves the foreign key alone when only the association is supplied', () => {
    const promotion = aPromotion('promo-1');
    const subject = aPromotionCode({ promotionCodeID: 'pc-1', promotion, promotionID: undefined });

    // No derivation, no back-fill: the two readings are independent columns of the same row and
    // the repository decides what each one carries.
    expect(subject.getPromotion()).toBe(promotion);
    expect(subject.getPromotionID()).toBeUndefined();
  });

  it('carries none of the component metadata warts into the ported class', () => {
    const subject = aPromotionCode();

    // CFML parity [model/entity/PromotionCode.cfc:L49]: the component tag declares neither
    // `output="false"` NOR `accessors="true"`, and it QUOTES `persistent="true"` where every
    // sibling writes it bare.
    //
    // JUDGMENT CALL: annotated, never normalised, and structurally unrepresentable in the target -
    // there is no component tag, no implicit accessor generation and no output buffer to suppress.
    for (const name of PUBLIC_SURFACE) {
      expect(Object.getOwnPropertyNames(PromotionCode.prototype)).toContain(name);
    }
    expect(Object.getOwnPropertyNames(subject)).not.toContain('getPromotionCode');
  });

  it('authors nothing for the five empty and duplicate banner pairs', () => {
    // L149/L151 - a SECOND "Non-Persistent Property Methods" pair, duplicating L83/L96. *
    // L153/L155 - a SECOND "Bidirectional Helper Methods" pair, duplicating L98.
    //
    // JUDGMENT CALL: annotated where each section would have been, and nothing is authored to fill
    // them.
    expect(prototypeMembers().filter((name) => name.endsWith('Formatted'))).toStrictEqual([]);
    expect(prototypeMembers().filter((name) => name.endsWith('Options'))).toStrictEqual([]);
  });

  it('adopts the constructor collections rather than copying them', () => {
    const accounts: AccountLinkProbe[] = [anAccountLink('acct-1')];
    const orders: OrderLinkProbe[] = [anOrderLink('order-1')];
    const subject = aPromotionCode({ promotionCodeID: 'pc-1', accounts, orders });

    // JUDGMENT CALL: adoption, not defensive copying, and deliberately so. Hibernate handed an
    // entity the live collection it managed, and both the legacy far sides mutate through the
    // accessor - [model/entity/Order.cfc:L845, L855] splice straight into `getOrders()`.
    expect(subject.getAccounts()).toBe(accounts);
    expect(subject.getOrders()).toBe(orders);
  });

  it('defaults both collections to fresh empty arrays that are not shared between rows', () => {
    const first = aPromotionCode({ promotionCodeID: 'pc-1' });
    const second = aPromotionCode({ promotionCodeID: 'pc-2' });

    expect(first.getAccounts()).toStrictEqual([]);
    expect(second.getAccounts()).toStrictEqual([]);
    // The default must be a fresh array per row.
    expect(first.getAccounts()).not.toBe(second.getAccounts());
    expect(first.getOrders()).not.toBe(second.getOrders());

    first.addAccount(anAccountLink('acct-1'));
    expect(first.getAccounts()).toHaveLength(1);
    expect(second.getAccounts()).toHaveLength(0);
  });

  it('builds every subject from an injected clock, never from ambient time', () => {
    const clock = aMovableClock(NOW_UTC);
    const subject = aPromotionCode({
      startDateTime: atUtc(WINDOW_START_UTC),
      endDateTime: atUtc(WINDOW_END_UTC),
      now: clock.now,
    });
    const fixtures = makePromotionFixtures();

    // CFML parity [model/entity/PromotionCode.cfc:L88]: `now()` was an ambient engine built-in
    // reading the CF server's timezone.
    expect(clock.readCount()).toBe(0);
    expect(subject.getCurrentFlag()).toBe(true);
    expect(clock.readCount()).toBe(2);

    // The shared graph is built on the same explicit instant, so a fixture-driven assertion and a
    // hand-built one agree about what "now" means.
    expect(fixtures.now.toISOString()).toBe(NOW_UTC);
    expect(fixtures.clock().toISOString()).toBe(NOW_UTC);
  });
});
