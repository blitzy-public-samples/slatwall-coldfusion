// slatwall-ts - unit suite for `src/domain/entities/promotion.ts`
//
// `Promotion` is the `SwPromotion` row and the HUB of the promotion aggregate.
//
// Three MEMOIZED ROLLUPS that each compute exactly once and then go STALE against later child
// mutation [model/entity/Promotion.cfc:L83-L121].
//
// The four cases [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67] handed every legacy
// entity suite for free are not inherited, and no shared base class is introduced to imitate them
// `validate_as_save_for_a_new_instance_doesnt_pass`
// [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L54].
// !! HARD BOUNDARY - WHAT IS DELIBERATELY NOT TESTED HERE !!

import { afterEach, describe, expect, it, vi } from 'vitest';

import { Promotion } from '../../../../src/domain/entities/promotion.js';
import { PromotionPeriod } from '../../../../src/domain/entities/promotionPeriod.js';
import { PromotionCode } from '../../../../src/domain/entities/promotionCode.js';
// A VALUE import, deliberately, where the brief's import sketch shows `import type`.
import { PromotionApplied } from '../../../../src/domain/entities/promotionApplied.js';
import { makePromotionFixtures } from '../../../fixtures/promotionFixtures.js';

// Chosen to line up with the fixture module's own literals so a fixture-built child and a
// locally-built child are evaluated against the same timeline.

/**
 * The instant every predicate in this suite is evaluated against.
 */
const NOW_UTC = '2024-06-15T12:00:00.000Z';

/**
 * Comfortably before `NOW_UTC`.
 */
const PERIOD_START_UTC = '2024-06-01T00:00:00.000Z';

/**
 * Comfortably after `NOW_UTC`.
 */
const PERIOD_END_UTC = '2024-07-01T00:00:00.000Z';

/**
 * A window that closed before `NOW_UTC`.
 */
const EXPIRED_START_UTC = '2024-01-01T00:00:00.000Z';

/**
 * The end of that closed window.
 */
const EXPIRED_END_UTC = '2024-02-01T00:00:00.000Z';

/**
 * A window that has not opened yet.
 */
const FUTURE_START_UTC = '2024-08-01T00:00:00.000Z';

/**
 * The end of that unopened window.
 */
const FUTURE_END_UTC = '2024-09-01T00:00:00.000Z';

/**
 * An audit value, distinct from the business dates so the two cannot be confused.
 */
const CREATED_DATE_TIME_UTC = '2024-05-01T09:30:00.000Z';

/**
 * The matching modification audit value.
 */
const MODIFIED_DATE_TIME_UTC = '2024-06-10T17:45:00.000Z';

/**
 * Every member `src/domain/entities/promotion.ts` installs on an instance, sorted.
 */
const PORTED_PUBLIC_SURFACE: readonly string[] = [
  // Persistent property accessors [model/entity/Promotion.cfc:L52-L56, L59, L67, L70-L73]
  'getPromotionID',
  'getPromotionName',
  'getPromotionSummary',
  'getPromotionDescription',
  'getActiveFlag',
  'getDefaultImageID',
  'getRemoteID',
  'getCreatedDateTime',
  'getCreatedByAccountID',
  'getModifiedDateTime',
  'getModifiedByAccountID',
  // Collection accessors [model/entity/Promotion.cfc:L62-L64]
  'getPromotionPeriods',
  'getPromotionCodes',
  'getAppliedPromotions',
  // Containment probes - ORM-generated in the legacy, required across module boundaries.
  'hasPromotionPeriod',
  'hasPromotionCode',
  'hasAppliedPromotion',
  // Non-persistent property methods [model/entity/Promotion.cfc:L83-L134]
  'getCurrentFlag',
  'getCurrentPromotionPeriodFlag',
  'getCurrentPromotionCodeFlag',
  'getPromotionCodesDeletableFlag',
  // Bidirectional helpers [model/entity/Promotion.cfc:L141-L164]
  'addPromotionPeriod',
  'removePromotionPeriod',
  'addPromotionCode',
  'removePromotionCode',
  'addAppliedPromotion',
  'removeAppliedPromotion',
  // Overridden methods [model/entity/Promotion.cfc:L170-L172]
  'isDeletable',
];

/**
 * Members the legacy framework base and its dispatcher supplied, none of them ported.
 *
 * [org/Hibachi/HibachiEntity.cfc:L507-L565] is an `onMissingMethod` dispatcher matching eleven
 * method-name patterns and terminating in a throw at L565.
 */
const UNPORTED_FRAMEWORK_MEMBERS: readonly string[] = [
  'isNew',
  'getNewFlag',
  'getPrimaryIDValue',
  'getPrimaryIDPropertyName',
  'getSimpleRepresentation',
  'getSimpleRepresentationPropertyName',
  'getPrintTemplates',
  'getEmailTemplates',
  'getAttributeValue',
  'clearAttributeCache',
  'validate',
  'hasErrors',
  'getErrors',
  'getPromotionCodesDeletableFlagOptions',
];

/**
 * The `promotionAccounts` ANTI-CONTRACT, asserted rather than merely documented.
 */
const PROMOTION_ACCOUNT_ANTI_CONTRACT: readonly string[] = [
  'getPromotionAccounts',
  'hasPromotionAccount',
  'addPromotionAccount',
  'removePromotionAccount',
];

/**
 * The ORM lifecycle hooks `Promotion` deliberately does not declare.
 *
 * [model/entity/Promotion.cfc:L176-L178] is an ORM Event Hooks banner pair with nothing between
 * the two lines.
 */
const UNDECLARED_ORM_HOOKS: readonly string[] = [
  'preInsert',
  'preUpdate',
  'preDelete',
  'postInsert',
];

/**
 * `model/validation/Promotion.json`, transcribed VERBATIM and in file order.
 *
 * The whole file is three properties and nothing else - read first-hand, seven lines including
 * both braces.
 *
 * Enforcement of these rules is a SERVICE-TIER concern: the zod schemas live with the services,
 * not on the entity.
 */
const PROMOTION_VALIDATION_RULES: readonly {
  readonly property: string;
  readonly context: string;
  readonly constraint: string;
  readonly locator: string;
}[] = [
  {
    property: 'promotionName',
    context: 'save',
    constraint: 'required',
    locator: 'model/validation/Promotion.json:L3',
  },
  {
    property: 'appliedPromotions',
    context: 'delete',
    constraint: 'maxCollection:0',
    locator: 'model/validation/Promotion.json:L4',
  },
  {
    property: 'promotionCodes',
    context: 'delete',
    constraint: 'method:getPromotionCodesDeletableFlag',
    locator: 'model/validation/Promotion.json:L5',
  },
];

/**
 * A `Date` from an explicit UTC ISO-8601 literal.
 *
 * Fresh on every call, so a test that mutates a returned `Date` cannot move another test's
 * timeline.
 *
 * @param isoUTC an explicit UTC ISO-8601 instant.
 * @returns that instant.
 */
function instant(isoUTC: string): Date {
  return new Date(isoUTC);
}

/**
 * The clock closure `PromotionPeriod` and `PromotionCode` each take as a REQUIRED constructor
 * slot.
 *
 * `Promotion` itself takes no clock and none may be added: `model/entity/Promotion.cfc` contains
 * ZERO `now()` calls.
 *
 * @param isoUTC the fixed instant the child should read.
 * @returns a closure yielding a fresh `Date` at that instant on every call, so the two separate
 * `now()` reads the legacy line performs cannot be told apart by identity.
 */
function fixedClock(isoUTC: string): () => Date {
  return (): Date => new Date(isoUTC);
}

/**
 * A promotion with no children, ready for a test to attach exactly what it needs.
 *
 * `promotionID` defaults to a saved-looking value; pass `''` for the `unsavedvalue=""` sentinel
 * declared at [model/entity/Promotion.cfc:L52].
 *
 * @param init the handful of columns any test here varies.
 * @returns a fresh `Promotion` with three empty collections.
 */
function aPromotion(
  init: {
    readonly promotionID?: string;
    readonly promotionName?: string | undefined;
    readonly promotionPeriods?: PromotionPeriod[];
    readonly promotionCodes?: PromotionCode[];
    readonly appliedPromotions?: PromotionApplied[];
  } = {},
): Promotion {
  return new Promotion({
    promotionID: init.promotionID ?? 'promotion-under-test',
    promotionName: init.promotionName ?? 'Suite Promotion',
    promotionPeriods: init.promotionPeriods ?? [],
    promotionCodes: init.promotionCodes ?? [],
    appliedPromotions: init.appliedPromotions ?? [],
  });
}

/**
 * A promotion period bounded by two explicit UTC literals and carrying its own fixed clock.
 *
 * Every one of the thirteen persistent slots plus `now` is supplied explicitly, because the
 * shipped constructor declares them REQUIRED rather than optional - `undefined` has to be passed,
 * not omitted.
 *
 * @param init the identity, the two bounds and the instant to evaluate against.
 * @returns a fresh `PromotionPeriod` whose `getCurrentFlag()` has not yet been read.
 */
function aPromotionPeriod(init: {
  readonly promotionPeriodID: string;
  readonly startDateTimeUTC: string | undefined;
  readonly endDateTimeUTC: string | undefined;
  readonly nowUTC?: string;
}): PromotionPeriod {
  return new PromotionPeriod({
    promotionPeriodID: init.promotionPeriodID,
    startDateTime: init.startDateTimeUTC === undefined ? undefined : instant(init.startDateTimeUTC),
    endDateTime: init.endDateTimeUTC === undefined ? undefined : instant(init.endDateTimeUTC),
    // NULL means UNLIMITED on both columns, never zero uses
    // [model/entity/PromotionPeriod.cfc:L55-L56].
    maximumUseCount: undefined,
    maximumAccountUseCount: undefined,
    promotion: undefined,
    promotionID: undefined,
    remoteID: undefined,
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
    now: fixedClock(init.nowUTC ?? NOW_UTC),
  });
}

/**
 * A promotion code bounded by two explicit UTC literals and carrying its own fixed clock.
 *
 * @param init the identity, the two bounds and the instant to evaluate against.
 * @returns a fresh `PromotionCode` whose `getCurrentFlag()` has not yet been read.
 */
function aPromotionCode(init: {
  readonly promotionCodeID: string;
  readonly startDateTimeUTC: string | undefined;
  readonly endDateTimeUTC: string | undefined;
  readonly nowUTC?: string;
}): PromotionCode {
  return new PromotionCode({
    promotionCodeID: init.promotionCodeID,
    promotionCode: 'SUITE10',
    startDateTime: init.startDateTimeUTC === undefined ? undefined : instant(init.startDateTimeUTC),
    endDateTime: init.endDateTimeUTC === undefined ? undefined : instant(init.endDateTimeUTC),
    maximumUseCount: undefined,
    maximumAccountUseCount: undefined,
    promotion: undefined,
    promotionID: undefined,
    accounts: [],
    orders: [],
    remoteID: undefined,
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
    now: fixedClock(init.nowUTC ?? NOW_UTC),
  });
}

/**
 * An applied-promotion row: the write-side output of the engine, and the collection
 * `isDeletable()` counts.
 *
 * All three money-and-currency slots are passed as explicit `undefined`, which is legal because
 * the shipped constructor types them `T | undefined` without `?`.
 *
 * @param promotionAppliedID the primary key the containment probe compares on.
 * @returns a fresh `PromotionApplied` attached to nothing.
 */
function anAppliedPromotion(promotionAppliedID: string): PromotionApplied {
  return new PromotionApplied({
    promotionAppliedID,
    discountAmount: undefined,
    appliedType: undefined,
    currencyCode: undefined,
    promotion: undefined,
    promotionID: undefined,
    // The three order-side foreign keys are OPAQUE and stay absent here: `Order`, `OrderItem` and
    // `OrderFulfillment` are out of scope, and no method on any of them is ever called.
    orderItemID: undefined,
    orderFulfillmentID: undefined,
    orderID: undefined,
    remoteID: undefined,
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
  });
}

// Hand-rolled counting doubles (P3)
//
// Each is a REAL entity instance carrying one own-property method that shadows the prototype's.
//
// Written by hand rather than with `vi.mock` because what has to be observed is a CALL COUNT on A
// SPECIFIC INSTANCE, which is the thing a module mock cannot express.

/**
 * A mutable tally, passed by reference into a double so a test can read it afterwards.
 */
type CallTally = { calls: number };

/**
 * A fresh tally at zero.
 *
 * @returns the tally.
 */
function aTally(): CallTally {
  return { calls: 0 };
}

/**
 * A promotion period whose `getCurrentFlag()` answers a fixed value and counts its calls.
 *
 * @param promotionPeriodID the identity, so containment probes stay meaningful.
 * @param answer the value `getCurrentFlag()` should report.
 * @param tally incremented on every consultation.
 * @returns the period, still typed as a `PromotionPeriod`.
 */
function countingPeriod(
  promotionPeriodID: string,
  answer: boolean,
  tally: CallTally,
): PromotionPeriod {
  const period: PromotionPeriod = aPromotionPeriod({
    promotionPeriodID,
    startDateTimeUTC: PERIOD_START_UTC,
    endDateTimeUTC: PERIOD_END_UTC,
  });

  return Object.assign(period, {
    getCurrentFlag: (): boolean => {
      tally.calls += 1;
      return answer;
    },
  });
}

/**
 * A promotion code whose `getCurrentFlag()` answers a fixed value and counts its calls.
 *
 * The counterpart of {@link countingPeriod}, for the `break` at [model/entity/Promotion.cfc:L115].
 *
 * @param promotionCodeID the identity.
 * @param answer the value `getCurrentFlag()` should report.
 * @param tally incremented on every consultation.
 * @returns the code, still typed as a `PromotionCode`.
 */
function countingCode(promotionCodeID: string, answer: boolean, tally: CallTally): PromotionCode {
  const code: PromotionCode = aPromotionCode({
    promotionCodeID,
    startDateTimeUTC: PERIOD_START_UTC,
    endDateTimeUTC: PERIOD_END_UTC,
  });

  return Object.assign(code, {
    getCurrentFlag: (): boolean => {
      tally.calls += 1;
      return answer;
    },
  });
}

/**
 * A promotion code that carries the framework-inherited `isDeletable()` and counts its calls.
 *
 * The rule this double obeys: it adds EXACTLY the one member the ported body actually calls, and
 * nothing else.
 *
 * @param promotionCodeID the identity.
 * @param deletable the value `isDeletable()` should report.
 * @param tally incremented on every consultation, which is how non-memoization is proven.
 * @returns the code, still typed as a `PromotionCode`.
 */
function deletableCode(
  promotionCodeID: string,
  deletable: boolean,
  tally: CallTally,
): PromotionCode {
  const code: PromotionCode = aPromotionCode({
    promotionCodeID,
    startDateTimeUTC: PERIOD_START_UTC,
    endDateTimeUTC: PERIOD_END_UTC,
  });

  return Object.assign(code, {
    isDeletable: (): boolean => {
      tally.calls += 1;
      return deletable;
    },
  });
}

/**
 * A class's own prototype members, minus the constructor, sorted.
 *
 * Typed against a bare constructor signature rather than a specific class so the same helper can
 * census `Promotion` and, where a cross-entity fact is being recorded, its collaborators.
 *
 * @param subject the class whose prototype is being censused.
 * @returns every member name the class installs on its instances.
 */
function prototypeMembers(subject: { readonly prototype: object }): string[] {
  return Object.getOwnPropertyNames(subject.prototype)
    .filter((name: string) => name !== 'constructor')
    .sort();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the ported surface is the legacy surface, verbatim and nothing more', () => {
  it('installs exactly the twenty-eight authored members and no private helper', () => {
    // Unlike `promotionApplied.ts`, this class needs no private primary-key helper: its three
    // containment probes inline the comparison, so the prototype carries the public surface and
    // nothing else.
    expect(prototypeMembers(Promotion)).toEqual([...PORTED_PUBLIC_SURFACE].sort());
    expect(PORTED_PUBLIC_SURFACE).toHaveLength(28);
  });

  it('takes a single parameter object rather than a positional argument list', () => {
    // Fourteen positional arguments of which thirteen are optional is a defect waiting to happen,
    // so the constructor takes one well-typed object.
    expect(Promotion.length).toBe(1);
  });

  it('ports none of the framework base members, and invents no replacement for them', () => {
    const subject: Promotion = aPromotion();
    const members: string[] = prototypeMembers(Promotion);

    for (const unported of UNPORTED_FRAMEWORK_MEMBERS) {
      expect(members).not.toContain(unported);
      expect(unported in subject).toBe(false);
    }
  });

  it('declares no promotionAccounts collection, keeping a legacy defect reproduced', () => {
    // The anti-contract is as binding as the contract - see the constant's own note.
    const subject: Promotion = aPromotion();
    const members: string[] = prototypeMembers(Promotion);

    for (const forbidden of PROMOTION_ACCOUNT_ANTI_CONTRACT) {
      expect(members).not.toContain(forbidden);
      expect(forbidden in subject).toBe(false);
    }
  });

  it('declares no ORM lifecycle hook, because the legacy banner pair is empty', () => {
    const subject: Promotion = aPromotion();
    const members: string[] = prototypeMembers(Promotion);

    for (const hook of UNDECLARED_ORM_HOOKS) {
      expect(members).not.toContain(hook);
      expect(hook in subject).toBe(false);
    }
  });

  it('exposes the default image only as an opaque foreign key, with no image behaviour', () => {
    // [model/entity/Promotion.cfc:L59] declares a `defaultImage` many-to-one, and `Image` is not
    // one of the eighteen in-scope entities, so the association is collapsed to the inert FK
    // column.
    const subject: Promotion = aPromotion();
    const members: string[] = prototypeMembers(Promotion);

    expect(members).toContain('getDefaultImageID');
    expect(members).not.toContain('getDefaultImage');
    expect('getDefaultImage' in subject).toBe(false);
  });

  it('names no accessor for the component attributes that stayed documentation', () => {
    // [model/entity/Promotion.cfc:L49] carries `table="SwPromotion"`,
    // `entityname="SlatwallPromotion"`, `hb_serviceName="promotionService"` and the
    // self-referential `hb_permission="this"`.
    const members: string[] = prototypeMembers(Promotion);

    for (const absent of [
      'getTableName',
      'getEntityName',
      'getClassName',
      'getHibachiPermission',
    ]) {
      expect(members).not.toContain(absent);
    }
  });

  it('keeps every member synchronous, because nothing on this entity reaches a port', () => {
    // The async boundary rule for this port is that a method becomes `async` if and only if its
    // legacy body reached the DAO or the ORM.
    const subject: Promotion = aPromotion({
      promotionPeriods: [
        aPromotionPeriod({
          promotionPeriodID: 'sync-period',
          startDateTimeUTC: PERIOD_START_UTC,
          endDateTimeUTC: PERIOD_END_UTC,
        }),
      ],
    });

    const results: readonly unknown[] = [
      subject.getPromotionID(),
      subject.getActiveFlag(),
      subject.getCurrentFlag(),
      subject.getCurrentPromotionPeriodFlag(),
      subject.getCurrentPromotionCodeFlag(),
      subject.getPromotionCodesDeletableFlag(),
      subject.isDeletable(),
      subject.getPromotionPeriods(),
      subject.getPromotionCodes(),
      subject.getAppliedPromotions(),
    ];

    for (const result of results) {
      expect(result).not.toBeInstanceOf(Promise);
    }
  });
});

describe('the row hydrates its columns without coalescing any of them away', () => {
  it('reports the unsaved-row sentinel for a primary key that was never generated', () => {
    // CORRECTION A, asserted rather than merely noted.
    expect(aPromotion({ promotionID: '' }).getPromotionID()).toBe('');
    expect(aPromotion({ promotionID: 'saved-promotion' }).getPromotionID()).toBe('saved-promotion');
  });

  it('makes the unsaved sentinel load-bearing for a child that has not been saved', () => {
    // Proof that the sentinel is the real mechanism and not a coincidence: an unsaved child
    // short-circuits its own guard on `isNew()` and appends without ever asking the parent.
    const promotion: Promotion = aPromotion();
    const unsavedPeriod: PromotionPeriod = aPromotionPeriod({
      promotionPeriodID: '',
      startDateTimeUTC: PERIOD_START_UTC,
      endDateTimeUTC: PERIOD_END_UTC,
    });

    const probe = vi.spyOn(promotion, 'hasPromotionPeriod');

    promotion.addPromotionPeriod(unsavedPeriod);

    expect(promotion.getPromotionPeriods()).toEqual([unsavedPeriod]);
    expect(probe).not.toHaveBeenCalled();
  });

  it('defaults activeFlag to true when the column was never set', () => {
    // [model/entity/Promotion.cfc:L56] declares `activeFlag ormtype="boolean" default="1"`, so a
    // promotion hydrated without the column reads TRUE - the same answer a freshly created CFML
    // entity gives.
    expect(aPromotion().getActiveFlag()).toBe(true);
  });

  it('coerces every persisted boolean shape through the one CFML helper', () => {
    // The `default="1"` is carried over as the raw literal and coerced by the same helper that
    // coerces a hydrated column, rather than being short-circuited by a hand-written `true`.
    for (const truthy of ['1', 1, true] as const) {
      expect(new Promotion({ promotionID: 'p', activeFlag: truthy }).getActiveFlag()).toBe(true);
    }

    for (const falsy of ['0', 0, false] as const) {
      expect(new Promotion({ promotionID: 'p', activeFlag: falsy }).getActiveFlag()).toBe(false);
    }
  });

  it('distinguishes a SQL NULL flag from a column that was never supplied', () => {
    // Two kinds of absence, and they mean different things.
    expect(new Promotion({ promotionID: 'p', activeFlag: null }).getActiveFlag()).toBe(false);
    expect(new Promotion({ promotionID: 'p', activeFlag: undefined }).getActiveFlag()).toBe(true);
  });

  it('annotates the activeFlag default asymmetry across the folder without normalising it', () => {
    // `Promotion.activeFlag` [model/entity/Promotion.cfc:L56] carries `default="1"`, as does
    // `Sku.activeFlag`. `Product.activeFlag` and `Brand.activeFlag` [model/entity/Brand.cfc:L53]
    // declare no default at all.
    const graph = makePromotionFixtures();

    expect(graph.activeFlagOrmDefault).toBe(true);
    expect(graph.promotion.getActiveFlag()).toBe(true);
  });

  it('reports undefined for a nullable name, never an empty string or a placeholder', () => {
    // [model/entity/Promotion.cfc:L53] declares `promotionName ormtype="string"` with no
    // `notnull="true"` - contrast [model/entity/Product.cfc:L55], which does carry it.
    //
    // The `undefined` is LOAD-BEARING and must never become `''`: `promotionPeriod.ts` consumes
    // this accessor inside `getSimpleRepresentation()` and RAISES when it is absent.
    expect(new Promotion({ promotionID: 'nameless' }).getPromotionName()).toBeUndefined();
    expect(aPromotion({ promotionName: 'Spring Sale' }).getPromotionName()).toBe('Spring Sale');
  });

  it('reports undefined for every unset opaque identifier and audit column', () => {
    const subject: Promotion = new Promotion({ promotionID: 'audit-probe' });

    expect(subject.getPromotionSummary()).toBeUndefined();
    expect(subject.getPromotionDescription()).toBeUndefined();
    expect(subject.getDefaultImageID()).toBeUndefined();
    expect(subject.getRemoteID()).toBeUndefined();
    expect(subject.getCreatedByAccountID()).toBeUndefined();
    expect(subject.getModifiedByAccountID()).toBeUndefined();
  });

  it('reports undefined rather than the epoch for an unset audit timestamp', () => {
    // An absent timestamp is absent. Substituting `new Date(0)` would turn "never modified" into
    // "modified in 1970", which is a different and wrong fact.
    const subject: Promotion = new Promotion({ promotionID: 'audit-probe' });

    expect(subject.getCreatedDateTime()).toBeUndefined();
    expect(subject.getModifiedDateTime()).toBeUndefined();
  });

  it('round-trips the audit timestamps it was given, unchanged', () => {
    const subject: Promotion = new Promotion({
      promotionID: 'audit-probe',
      createdDateTime: instant(CREATED_DATE_TIME_UTC),
      modifiedDateTime: instant(MODIFIED_DATE_TIME_UTC),
      createdByAccountID: 'opaque-account-created',
      modifiedByAccountID: 'opaque-account-modified',
      remoteID: 'opaque-remote-correlation',
      defaultImageID: 'opaque-default-image',
    });

    expect(subject.getCreatedDateTime()).toEqual(instant(CREATED_DATE_TIME_UTC));
    expect(subject.getModifiedDateTime()).toEqual(instant(MODIFIED_DATE_TIME_UTC));
    expect(subject.getCreatedByAccountID()).toBe('opaque-account-created');
    expect(subject.getModifiedByAccountID()).toBe('opaque-account-modified');
    expect(subject.getRemoteID()).toBe('opaque-remote-correlation');
    expect(subject.getDefaultImageID()).toBe('opaque-default-image');
  });

  it('presents every collection as an empty array when hydrated without a join', () => {
    // A Hibernate-managed collection never handed back null, so an entity hydrated without a join
    // must present `[]` rather than `undefined`.
    const subject: Promotion = new Promotion({ promotionID: 'bare' });

    expect(subject.getPromotionPeriods()).toEqual([]);
    expect(subject.getPromotionCodes()).toEqual([]);
    expect(subject.getAppliedPromotions()).toEqual([]);
  });
});

describe('getCurrentPromotionPeriodFlag seeds false and narrows to true on first match', () => {
  it('answers false for a promotion with no periods at all', () => {
    // Empty is restrictive here. A promotion with no periods is never current.
    expect(aPromotion().getCurrentPromotionPeriodFlag()).toBe(false);
  });

  it('answers true when its single period is current', () => {
    const subject: Promotion = aPromotion({
      promotionPeriods: [
        aPromotionPeriod({
          promotionPeriodID: 'current',
          startDateTimeUTC: PERIOD_START_UTC,
          endDateTimeUTC: PERIOD_END_UTC,
        }),
      ],
    });

    expect(subject.getCurrentPromotionPeriodFlag()).toBe(true);
  });

  it('answers false when every period sits outside the window', () => {
    const subject: Promotion = aPromotion({
      promotionPeriods: [
        aPromotionPeriod({
          promotionPeriodID: 'expired',
          startDateTimeUTC: EXPIRED_START_UTC,
          endDateTimeUTC: EXPIRED_END_UTC,
        }),
        aPromotionPeriod({
          promotionPeriodID: 'future',
          startDateTimeUTC: FUTURE_START_UTC,
          endDateTimeUTC: FUTURE_END_UTC,
        }),
      ],
    });

    expect(subject.getCurrentPromotionPeriodFlag()).toBe(false);
  });

  it('answers true when only a LATER period in the array is current', () => {
    // The scan does not stop at the first non-match, so a current period behind two non-current
    // ones still carries the promotion.
    const subject: Promotion = aPromotion({
      promotionPeriods: [
        aPromotionPeriod({
          promotionPeriodID: 'expired',
          startDateTimeUTC: EXPIRED_START_UTC,
          endDateTimeUTC: EXPIRED_END_UTC,
        }),
        aPromotionPeriod({
          promotionPeriodID: 'future',
          startDateTimeUTC: FUTURE_START_UTC,
          endDateTimeUTC: FUTURE_END_UTC,
        }),
        aPromotionPeriod({
          promotionPeriodID: 'current',
          startDateTimeUTC: PERIOD_START_UTC,
          endDateTimeUTC: PERIOD_END_UTC,
        }),
      ],
    });

    expect(subject.getCurrentPromotionPeriodFlag()).toBe(true);
  });

  it('stops at the FIRST current period and never consults a later one', () => {
    // FIRST-MATCH-WINS is the deliberate opposite of the two LAST-MATCH-WINS cascades in this
    // project - the currency Step 2 overwrite on `Sku` and the price-group service loop.
    const firstTally: CallTally = aTally();
    const secondTally: CallTally = aTally();

    const subject: Promotion = aPromotion({
      promotionPeriods: [
        countingPeriod('first-current', true, firstTally),
        countingPeriod('second-current', true, secondTally),
      ],
    });

    expect(subject.getCurrentPromotionPeriodFlag()).toBe(true);
    expect(firstTally.calls).toBe(1);
    expect(secondTally.calls).toBe(0);
  });

  it('consults every period when none of them matches', () => {
    // The complement of the previous case: with no match there is nothing to break on, so the
    // whole collection is walked exactly once.
    const firstTally: CallTally = aTally();
    const secondTally: CallTally = aTally();

    const subject: Promotion = aPromotion({
      promotionPeriods: [
        countingPeriod('first-stale', false, firstTally),
        countingPeriod('second-stale', false, secondTally),
      ],
    });

    expect(subject.getCurrentPromotionPeriodFlag()).toBe(false);
    expect(firstTally.calls).toBe(1);
    expect(secondTally.calls).toBe(1);
  });
});

describe('getCurrentPromotionCodeFlag mirrors the period rollup exactly', () => {
  // [model/entity/Promotion.cfc:L109-L121] is structurally identical to L95-L107 over
  // `promotionCodes`, with its own `break` at L115.

  it('answers false for a promotion with no codes at all', () => {
    // RESTRICTIVE, and this is the answer that must not be confused with the permissive gate in
    // `getCurrentFlag()`. This method asks "is some code current?", whose honest answer for no
    // codes is no.
    expect(aPromotion().getCurrentPromotionCodeFlag()).toBe(false);
  });

  it('answers true when its single code is current', () => {
    const subject: Promotion = aPromotion({
      promotionCodes: [
        aPromotionCode({
          promotionCodeID: 'current',
          startDateTimeUTC: PERIOD_START_UTC,
          endDateTimeUTC: PERIOD_END_UTC,
        }),
      ],
    });

    expect(subject.getCurrentPromotionCodeFlag()).toBe(true);
  });

  it('answers false when every code sits outside the window', () => {
    const subject: Promotion = aPromotion({
      promotionCodes: [
        aPromotionCode({
          promotionCodeID: 'expired',
          startDateTimeUTC: EXPIRED_START_UTC,
          endDateTimeUTC: EXPIRED_END_UTC,
        }),
        aPromotionCode({
          promotionCodeID: 'future',
          startDateTimeUTC: FUTURE_START_UTC,
          endDateTimeUTC: FUTURE_END_UTC,
        }),
      ],
    });

    expect(subject.getCurrentPromotionCodeFlag()).toBe(false);
  });

  it('answers true when only a LATER code in the array is current', () => {
    const subject: Promotion = aPromotion({
      promotionCodes: [
        aPromotionCode({
          promotionCodeID: 'expired',
          startDateTimeUTC: EXPIRED_START_UTC,
          endDateTimeUTC: EXPIRED_END_UTC,
        }),
        aPromotionCode({
          promotionCodeID: 'current',
          startDateTimeUTC: PERIOD_START_UTC,
          endDateTimeUTC: PERIOD_END_UTC,
        }),
      ],
    });

    expect(subject.getCurrentPromotionCodeFlag()).toBe(true);
  });

  it('stops at the FIRST current code and never consults a later one', () => {
    // The `break` at [model/entity/Promotion.cfc:L115].
    const firstTally: CallTally = aTally();
    const secondTally: CallTally = aTally();

    const subject: Promotion = aPromotion({
      promotionCodes: [
        countingCode('first-current', true, firstTally),
        countingCode('second-current', true, secondTally),
      ],
    });

    expect(subject.getCurrentPromotionCodeFlag()).toBe(true);
    expect(firstTally.calls).toBe(1);
    expect(secondTally.calls).toBe(0);
  });

  it('consults every code when none of them matches', () => {
    const firstTally: CallTally = aTally();
    const secondTally: CallTally = aTally();

    const subject: Promotion = aPromotion({
      promotionCodes: [
        countingCode('first-stale', false, firstTally),
        countingCode('second-stale', false, secondTally),
      ],
    });

    expect(subject.getCurrentPromotionCodeFlag()).toBe(false);
    expect(firstTally.calls).toBe(1);
    expect(secondTally.calls).toBe(1);
  });
});

// CFML parity [model/entity/Promotion.cfc:L86]: the composite is
// `getCurrentPromotionPeriodFlag() && ( !arrayLen(getPromotionCodes()) || getCurrentPromotionCodeFlag() )`.
describe('getCurrentFlag composes the two rollups over a four-row truth table', () => {
  /**
   * One row of the L86 truth table, with the subject that realises it.
   */
  const truthTable: readonly {
    readonly periodFlag: boolean;
    readonly codes: 'none' | 'presentAndCurrent' | 'presentAndStale';
    readonly expected: boolean;
    readonly why: string;
    readonly build: () => Promotion;
  }[] = [
    {
      periodFlag: false,
      codes: 'none',
      expected: false,
      why: 'no current period, and no code to compensate',
      build: (): Promotion =>
        aPromotion({
          promotionPeriods: [
            aPromotionPeriod({
              promotionPeriodID: 'row1a-expired',
              startDateTimeUTC: EXPIRED_START_UTC,
              endDateTimeUTC: EXPIRED_END_UTC,
            }),
          ],
          promotionCodes: [],
        }),
    },
    {
      periodFlag: false,
      codes: 'presentAndCurrent',
      expected: false,
      why: 'no current period, and a perfectly current code cannot rescue it',
      build: (): Promotion =>
        aPromotion({
          promotionPeriods: [
            aPromotionPeriod({
              promotionPeriodID: 'row1b-expired',
              startDateTimeUTC: EXPIRED_START_UTC,
              endDateTimeUTC: EXPIRED_END_UTC,
            }),
          ],
          promotionCodes: [
            aPromotionCode({
              promotionCodeID: 'row1b-current',
              startDateTimeUTC: PERIOD_START_UTC,
              endDateTimeUTC: PERIOD_END_UTC,
            }),
          ],
        }),
    },
    {
      periodFlag: true,
      codes: 'none',
      expected: true,
      // The PERMISSIVE ROW. `!arrayLen(getPromotionCodes())` short-circuits the `||`, so
      // `getCurrentPromotionCodeFlag()` is never even consulted.
      why: 'a current period and NO codes: the permissive !arrayLen clause carries it',
      build: (): Promotion =>
        aPromotion({
          promotionPeriods: [
            aPromotionPeriod({
              promotionPeriodID: 'row2-current',
              startDateTimeUTC: PERIOD_START_UTC,
              endDateTimeUTC: PERIOD_END_UTC,
            }),
          ],
          promotionCodes: [],
        }),
    },
    {
      periodFlag: true,
      codes: 'presentAndStale',
      expected: false,
      why: 'a current period but codes exist and none is current, so the restriction bites',
      build: (): Promotion =>
        aPromotion({
          promotionPeriods: [
            aPromotionPeriod({
              promotionPeriodID: 'row3-current',
              startDateTimeUTC: PERIOD_START_UTC,
              endDateTimeUTC: PERIOD_END_UTC,
            }),
          ],
          promotionCodes: [
            aPromotionCode({
              promotionCodeID: 'row3-expired',
              startDateTimeUTC: EXPIRED_START_UTC,
              endDateTimeUTC: EXPIRED_END_UTC,
            }),
          ],
        }),
    },
    {
      periodFlag: true,
      codes: 'presentAndCurrent',
      expected: true,
      why: 'a current period and at least one current code: both conjuncts hold',
      build: (): Promotion =>
        aPromotion({
          promotionPeriods: [
            aPromotionPeriod({
              promotionPeriodID: 'row4-current',
              startDateTimeUTC: PERIOD_START_UTC,
              endDateTimeUTC: PERIOD_END_UTC,
            }),
          ],
          promotionCodes: [
            aPromotionCode({
              promotionCodeID: 'row4-current',
              startDateTimeUTC: PERIOD_START_UTC,
              endDateTimeUTC: PERIOD_END_UTC,
            }),
          ],
        }),
    },
  ];

  it('answers exactly as the truth table requires on every row', () => {
    for (const row of truthTable) {
      const subject: Promotion = row.build();

      expect(subject.getCurrentFlag(), row.why).toBe(row.expected);
      // The composed answer is checked against the CONJUNCTS as well, so a row that passes for the
      // wrong reason cannot hide.
      expect(subject.getCurrentPromotionPeriodFlag(), row.why).toBe(row.periodFlag);
    }
  });

  it('covers both permissive and restrictive empty-collection readings in one table', () => {
    // The table is not merely a list of cases: rows 3 and 5 differ from row 2 only in whether the
    // code collection is empty, which is precisely the asymmetry L86 encodes.
    const permissiveRows = truthTable.filter((row) => row.codes === 'none' && row.expected);
    const restrictiveRows = truthTable.filter(
      (row) => row.codes === 'presentAndStale' && !row.expected,
    );

    expect(permissiveRows).toHaveLength(1);
    expect(restrictiveRows).toHaveLength(1);
    expect(truthTable).toHaveLength(5);
  });

  it('never evaluates the code side when no period is current', () => {
    // `&&` and `||` short-circuit in CFML exactly as they do in typescript, so the operand order
    // at L86 is meaningful and is preserved verbatim.
    const codeTally: CallTally = aTally();

    const subject: Promotion = aPromotion({
      promotionPeriods: [
        aPromotionPeriod({
          promotionPeriodID: 'short-circuit-expired',
          startDateTimeUTC: EXPIRED_START_UTC,
          endDateTimeUTC: EXPIRED_END_UTC,
        }),
      ],
      promotionCodes: [countingCode('never-consulted', true, codeTally)],
    });

    expect(subject.getCurrentFlag()).toBe(false);
    expect(codeTally.calls).toBe(0);
  });

  it('never evaluates the code rollup when the code collection is empty', () => {
    // The `!arrayLen(...)` term short-circuits the `||`, so `getCurrentPromotionCodeFlag()` is not
    // reached at all.
    const subject: Promotion = aPromotion({
      promotionPeriods: [
        aPromotionPeriod({
          promotionPeriodID: 'codeless-current',
          startDateTimeUTC: PERIOD_START_UTC,
          endDateTimeUTC: PERIOD_END_UTC,
        }),
      ],
      promotionCodes: [],
    });

    const codeRollup = vi.spyOn(subject, 'getCurrentPromotionCodeFlag');

    expect(subject.getCurrentFlag()).toBe(true);
    expect(codeRollup).not.toHaveBeenCalled();
  });

  it('agrees with the independently-built fixture variants on all four rows', () => {
    // A cross-check from a second source.
    const graph = makePromotionFixtures();

    // A current period and a current code.
    expect(graph.promotion.getCurrentFlag()).toBe(true);
    // A current period and no codes - the permissive row.
    expect(graph.codelessPromotion.getPromotionCodes()).toEqual([]);
    expect(graph.codelessPromotion.getCurrentFlag()).toBe(true);
    // A current period, codes present, none current.
    expect(graph.promotionWithOnlyExpiredCodes.getPromotionCodes()).toHaveLength(1);
    expect(graph.promotionWithOnlyExpiredCodes.getCurrentFlag()).toBe(false);
    // No current period; the code is irrelevant.
    expect(graph.promotionWithOnlyExpiredPeriods.getCurrentFlag()).toBe(false);
  });
});

// CFML parity [model/entity/Promotion.cfc:L99, L113]: both rollups consume the child's
// `getCurrentFlag()`, not its `isCurrent()`. That distinction is not cosmetic.
//
// The consequence for the port is that `PromotionPeriod.isCurrent()` is dead in the legacy rollup.
describe('the rollups reach the end-inclusive predicate, never the end-exclusive one', () => {
  it('follows getCurrentFlag when the two child predicates disagree', () => {
    // The discriminating test. The double answers `true` to `getCurrentFlag()` and `false` to
    // `isCurrent()`.
    const currentFlagTally: CallTally = aTally();
    const isCurrentTally: CallTally = aTally();

    const period: PromotionPeriod = Object.assign(
      aPromotionPeriod({
        promotionPeriodID: 'disagreeing-period',
        startDateTimeUTC: PERIOD_START_UTC,
        endDateTimeUTC: PERIOD_END_UTC,
      }),
      {
        getCurrentFlag: (): boolean => {
          currentFlagTally.calls += 1;
          return true;
        },
        isCurrent: (): boolean => {
          isCurrentTally.calls += 1;
          return false;
        },
      },
    );

    const subject: Promotion = aPromotion({ promotionPeriods: [period] });

    expect(subject.getCurrentPromotionPeriodFlag()).toBe(true);
    expect(currentFlagTally.calls).toBe(1);
    // The end-exclusive predicate is not merely outvoted - it is never invoked at all.
    expect(isCurrentTally.calls).toBe(0);
  });

  it('follows getCurrentFlag in the opposite disagreement too', () => {
    // The mirror image, so the previous test cannot pass by accident on a port that ignores both
    // predicates and hard-codes an answer.
    const isCurrentTally: CallTally = aTally();

    const period: PromotionPeriod = Object.assign(
      aPromotionPeriod({
        promotionPeriodID: 'inverted-disagreement',
        startDateTimeUTC: PERIOD_START_UTC,
        endDateTimeUTC: PERIOD_END_UTC,
      }),
      {
        getCurrentFlag: (): boolean => false,
        isCurrent: (): boolean => {
          isCurrentTally.calls += 1;
          return true;
        },
      },
    );

    const subject: Promotion = aPromotion({ promotionPeriods: [period] });

    expect(subject.getCurrentPromotionPeriodFlag()).toBe(false);
    expect(isCurrentTally.calls).toBe(0);
  });

  it('resolves the boundary instant end-to-end through the composed getCurrentFlag', () => {
    // No DOUBLES at all. A REAL period whose `endDateTime` is the very instant its injected clock
    // reports, so the disagreement arises from the shipped arithmetic rather than from a stub.
    const boundaryPeriod: PromotionPeriod = aPromotionPeriod({
      promotionPeriodID: 'ends-exactly-now',
      startDateTimeUTC: PERIOD_START_UTC,
      endDateTimeUTC: NOW_UTC,
      nowUTC: NOW_UTC,
    });

    // The child's own two answers, established first so the parent's choice is unambiguous.
    // `promotionPeriod.test.ts` owns why these differ; this reads them only as the discriminator.
    expect(boundaryPeriod.isCurrent(instant(NOW_UTC))).toBe(false);
    expect(boundaryPeriod.getCurrentFlag()).toBe(true);

    const subject: Promotion = aPromotion({
      promotionPeriods: [boundaryPeriod],
      promotionCodes: [],
    });

    expect(subject.getCurrentPromotionPeriodFlag()).toBe(true);
    // A promotion is CURRENT on the closing instant of its period. An engine that switched the
    // rollup to `isCurrent()` would stop honouring discounts one instant early.
    expect(subject.getCurrentFlag()).toBe(true);
  });

  it('reaches the same verdict on the fixture row built for this exact divergence', () => {
    // An independent construction of the same instant, from `periodDateBoundsCases`.
    const graph = makePromotionFixtures();

    const boundaryRow = graph.datedPromotionPeriods.find(
      (row) => row.bounds.name === 'nowAtEndDateTime',
    );

    expect(boundaryRow).toBeDefined();
    if (boundaryRow === undefined) {
      throw new Error('the fixture no longer publishes a nowAtEndDateTime row');
    }

    // The table's own declaration of the divergence.
    expect(boundaryRow.bounds.isCurrentOutcome).toBe(false);
    expect(boundaryRow.bounds.getCurrentFlagOutcome).toBe(true);

    // And the live entity, rolled up through a promotion that owns only this period.
    const subject: Promotion = aPromotion({
      promotionPeriods: [boundaryRow.promotionPeriod],
      promotionCodes: [],
    });

    expect(subject.getCurrentPromotionPeriodFlag()).toBe(boundaryRow.bounds.getCurrentFlagOutcome);
    expect(subject.getCurrentFlag()).toBe(true);
  });

  it('records that the code side has no end-exclusive predicate to choose between', () => {
    // `PromotionCode` declares no `isCurrent()` - not in `model/entity/PromotionCode.cfc` and not
    // on the ported class.
    expect(prototypeMembers(PromotionCode)).toContain('getCurrentFlag');
    expect(prototypeMembers(PromotionCode)).not.toContain('isCurrent');

    // The period, by contrast, carries both - hence the choice this describe pins.
    expect(prototypeMembers(PromotionPeriod)).toContain('getCurrentFlag');
    expect(prototypeMembers(PromotionPeriod)).toContain('isCurrent');
  });

  it('agrees with the fixture contrast exhibit on which predicate is live', () => {
    const graph = makePromotionFixtures();
    const contrast = graph.periodPredicateContrast;

    expect(contrast.livePredicate).toBe('getCurrentFlag');
    expect(contrast.deadPredicate).toBe('isCurrent');
    expect(contrast.livePredicateEndBoundInclusive).toBe(true);
    expect(contrast.deadPredicateEndBoundInclusive).toBe(false);
    // The live predicate is the memoized one, which is why the staleness this suite pins next is a
    // property of the rollup and not of `isCurrent()`.
    expect(contrast.livePredicateMemoizes).toBe(true);
  });
});

// CFML parity [model/entity/Promotion.cfc:L84, L96, L110]: all three rollups are memoized on the
// `!structKeyExists(variables, '<flag>')` idiom, so each computes at most once per entity instance
// and then FREEZES.
describe('each rollup memo computes once, then freezes, and never leaves its instance', () => {
  it('keeps answering false after a current period is appended', () => {
    // The period rollup goes stale.
    const subject: Promotion = aPromotion({
      promotionPeriods: [
        aPromotionPeriod({
          promotionPeriodID: 'stale-expired',
          startDateTimeUTC: EXPIRED_START_UTC,
          endDateTimeUTC: EXPIRED_END_UTC,
        }),
      ],
    });

    expect(subject.getCurrentPromotionPeriodFlag()).toBe(false);

    subject.getPromotionPeriods().push(
      aPromotionPeriod({
        promotionPeriodID: 'appended-current',
        startDateTimeUTC: PERIOD_START_UTC,
        endDateTimeUTC: PERIOD_END_UTC,
      }),
    );

    // The collection genuinely changed...
    expect(subject.getPromotionPeriods()).toHaveLength(2);
    // and the answer genuinely did not.
    expect(subject.getCurrentPromotionPeriodFlag()).toBe(false);
  });

  it('keeps answering true after the only current period is removed', () => {
    // The opposite direction, so the memo is shown to freeze rather than merely to be
    // monotonically permissive.
    const subject: Promotion = aPromotion({
      promotionPeriods: [
        aPromotionPeriod({
          promotionPeriodID: 'soon-removed',
          startDateTimeUTC: PERIOD_START_UTC,
          endDateTimeUTC: PERIOD_END_UTC,
        }),
      ],
    });

    expect(subject.getCurrentPromotionPeriodFlag()).toBe(true);

    subject.getPromotionPeriods().splice(0, 1);

    expect(subject.getPromotionPeriods()).toEqual([]);
    expect(subject.getCurrentPromotionPeriodFlag()).toBe(true);
  });

  it('keeps answering false after a current code is appended', () => {
    const subject: Promotion = aPromotion({
      promotionCodes: [
        aPromotionCode({
          promotionCodeID: 'stale-expired-code',
          startDateTimeUTC: EXPIRED_START_UTC,
          endDateTimeUTC: EXPIRED_END_UTC,
        }),
      ],
    });

    expect(subject.getCurrentPromotionCodeFlag()).toBe(false);

    subject.getPromotionCodes().push(
      aPromotionCode({
        promotionCodeID: 'appended-current-code',
        startDateTimeUTC: PERIOD_START_UTC,
        endDateTimeUTC: PERIOD_END_UTC,
      }),
    );

    expect(subject.getPromotionCodes()).toHaveLength(2);
    expect(subject.getCurrentPromotionCodeFlag()).toBe(false);
  });

  it('keeps answering true after the only current code is expired away', () => {
    const subject: Promotion = aPromotion({
      promotionCodes: [
        aPromotionCode({
          promotionCodeID: 'soon-expired-code',
          startDateTimeUTC: PERIOD_START_UTC,
          endDateTimeUTC: PERIOD_END_UTC,
        }),
      ],
    });

    expect(subject.getCurrentPromotionCodeFlag()).toBe(true);

    subject.getPromotionCodes().splice(0, 1);

    expect(subject.getPromotionCodes()).toEqual([]);
    expect(subject.getCurrentPromotionCodeFlag()).toBe(true);
  });

  it('keeps the composed flag frozen even when the mutation would flip its second conjunct', () => {
    // The composite goes doubly stale: `getCurrentFlag()` caches its own verdict and the two
    // conjuncts it read are themselves frozen.
    const subject: Promotion = aPromotion({
      promotionPeriods: [
        aPromotionPeriod({
          promotionPeriodID: 'composite-current-period',
          startDateTimeUTC: PERIOD_START_UTC,
          endDateTimeUTC: PERIOD_END_UTC,
        }),
      ],
      promotionCodes: [
        aPromotionCode({
          promotionCodeID: 'composite-expired-code',
          startDateTimeUTC: EXPIRED_START_UTC,
          endDateTimeUTC: EXPIRED_END_UTC,
        }),
      ],
    });

    expect(subject.getCurrentFlag()).toBe(false);

    subject.getPromotionCodes().push(
      aPromotionCode({
        promotionCodeID: 'composite-rescue-code',
        startDateTimeUTC: PERIOD_START_UTC,
        endDateTimeUTC: PERIOD_END_UTC,
      }),
    );

    expect(subject.getCurrentFlag()).toBe(false);
    expect(subject.getCurrentPromotionCodeFlag()).toBe(false);
  });

  it('keeps the composed flag frozen when every code is removed, not falling back to permissive', () => {
    // A subtle one. Emptying the code collection would satisfy L86's PERMISSIVE `!arrayLen` clause
    // on a recomputing implementation, flipping the promotion to current.
    const subject: Promotion = aPromotion({
      promotionPeriods: [
        aPromotionPeriod({
          promotionPeriodID: 'permissive-current-period',
          startDateTimeUTC: PERIOD_START_UTC,
          endDateTimeUTC: PERIOD_END_UTC,
        }),
      ],
      promotionCodes: [
        aPromotionCode({
          promotionCodeID: 'permissive-expired-code',
          startDateTimeUTC: EXPIRED_START_UTC,
          endDateTimeUTC: EXPIRED_END_UTC,
        }),
      ],
    });

    expect(subject.getCurrentFlag()).toBe(false);

    subject.getPromotionCodes().splice(0, 1);

    expect(subject.getPromotionCodes()).toEqual([]);
    expect(subject.getCurrentFlag()).toBe(false);
  });

  it('computes each rollup exactly once no matter how often it is asked', () => {
    // The other half of memoization: repeated reads do not re-walk the collections. Proven with
    // counting doubles rather than by timing anything (C7).
    const periodTally: CallTally = aTally();
    const codeTally: CallTally = aTally();

    const subject: Promotion = aPromotion({
      promotionPeriods: [countingPeriod('once-only-period', true, periodTally)],
      promotionCodes: [countingCode('once-only-code', true, codeTally)],
    });

    for (let read = 0; read < 5; read += 1) {
      expect(subject.getCurrentPromotionPeriodFlag()).toBe(true);
      expect(subject.getCurrentPromotionCodeFlag()).toBe(true);
      expect(subject.getCurrentFlag()).toBe(true);
    }

    // Five reads of three accessors, and each child was consulted exactly once.
    expect(periodTally.calls).toBe(1);
    expect(codeTally.calls).toBe(1);
  });

  it('never lets one promotion observe another promotion memo', () => {
    const firstTally: CallTally = aTally();
    const secondTally: CallTally = aTally();

    const current: Promotion = aPromotion({
      promotionID: 'instance-one',
      promotionPeriods: [countingPeriod('one-current', true, firstTally)],
    });
    const stale: Promotion = aPromotion({
      promotionID: 'instance-two',
      promotionPeriods: [countingPeriod('two-stale', false, secondTally)],
    });

    expect(current.getCurrentPromotionPeriodFlag()).toBe(true);
    expect(stale.getCurrentPromotionPeriodFlag()).toBe(false);

    // Each instance did its own work; neither short-circuited on the other's cached answer.
    expect(firstTally.calls).toBe(1);
    expect(secondTally.calls).toBe(1);

    // And re-reading in the opposite order does not cross-contaminate.
    expect(stale.getCurrentPromotionPeriodFlag()).toBe(false);
    expect(current.getCurrentPromotionPeriodFlag()).toBe(true);
  });

  it('never lets a memo survive into a second, independently built fixture graph', () => {
    // The fixture factory hands back a fresh graph per call precisely so this is assertable.
    const first = makePromotionFixtures();
    expect(first.promotion.getCurrentFlag()).toBe(true);

    // Freeze the first graph's promotion into a FALSE verdict by emptying its periods after the
    // read... Which, per the tests above, cannot change its own answer either.
    first.promotion.getPromotionPeriods().splice(0, first.promotion.getPromotionPeriods().length);
    expect(first.promotion.getCurrentFlag()).toBe(true);

    const second = makePromotionFixtures();
    expect(second.promotion).not.toBe(first.promotion);
    expect(second.promotion.getPromotionPeriods()).toHaveLength(1);
    expect(second.promotion.getCurrentFlag()).toBe(true);
  });

  it('holds no mutable state at module scope for any rollup', () => {
    // Two promotions with the same identifier and opposite children. A module-level cache keyed by
    // anything - identifier, insertion order, a shared counter - would make the second answer
    // agree with the first.
    const currentFirst: Promotion = aPromotion({
      promotionID: 'shared-identifier',
      promotionCodes: [
        aPromotionCode({
          promotionCodeID: 'shared-current',
          startDateTimeUTC: PERIOD_START_UTC,
          endDateTimeUTC: PERIOD_END_UTC,
        }),
      ],
    });
    const staleSecond: Promotion = aPromotion({
      promotionID: 'shared-identifier',
      promotionCodes: [
        aPromotionCode({
          promotionCodeID: 'shared-stale',
          startDateTimeUTC: FUTURE_START_UTC,
          endDateTimeUTC: FUTURE_END_UTC,
        }),
      ],
    });

    expect(currentFirst.getPromotionID()).toBe(staleSecond.getPromotionID());
    expect(currentFirst.getCurrentPromotionCodeFlag()).toBe(true);
    expect(staleSecond.getCurrentPromotionCodeFlag()).toBe(false);
  });
});

// LEGACY-DEFECT [model/entity/Promotion.cfc:L79, L124, L125, L128, L133]:
// getPromotionCodesDeletableFlag uses three different spellings across five sites -- the property
// is declared plural "promotionCodesDeletableFlag" (L79), the structKeyExists guard checks
// singular "promotionCodeDeletableFlag" (L124).
// Preserved deliberately; do not fix without a product decision.
describe('getPromotionCodesDeletableFlag returns the right answer and never caches it', () => {
  it('reports true when every code is deletable', () => {
    const tally: CallTally = aTally();

    const subject: Promotion = aPromotion({
      promotionCodes: [
        deletableCode('all-deletable-first', true, tally),
        deletableCode('all-deletable-second', true, tally),
      ],
    });

    expect(subject.getPromotionCodesDeletableFlag()).toBe(true);
    // Every code had to be consulted to reach `true` - there is no early exit on this branch.
    expect(tally.calls).toBe(2);
  });

  it('reports false when any single code is not deletable', () => {
    const subject: Promotion = aPromotion({
      promotionCodes: [
        deletableCode('mixed-deletable', true, aTally()),
        deletableCode('mixed-blocked', false, aTally()),
      ],
    });

    expect(subject.getPromotionCodesDeletableFlag()).toBe(false);
  });

  it('reports true on an empty code collection, permissively', () => {
    // [model/entity/Promotion.cfc:L125] seeds `true` and the L126 loop never runs, so a promotion
    // with no codes is reported deletable-as-far-as-codes-go.
    const subject: Promotion = aPromotion({ promotionCodes: [] });

    expect(subject.getPromotionCodes()).toEqual([]);
    expect(subject.getPromotionCodesDeletableFlag()).toBe(true);
  });

  it('re-walks the whole collection on every single call', () => {
    // The non-memoization gate. N calls over m codes must produce n x m invocations of the child
    // predicate.
    const tally: CallTally = aTally();

    const subject: Promotion = aPromotion({
      promotionCodes: [
        deletableCode('rewalk-first', true, tally),
        deletableCode('rewalk-second', true, tally),
        deletableCode('rewalk-third', true, tally),
      ],
    });

    const calls = 4;
    const codes = 3;

    for (let read = 0; read < calls; read += 1) {
      expect(subject.getPromotionCodesDeletableFlag()).toBe(true);
    }

    expect(tally.calls).toBe(calls * codes);
  });

  it('stops at the first non-deletable code, exactly as the break does', () => {
    // [model/entity/Promotion.cfc:L129]. FIRST-WINS, like both rollup breaks at L101 and L115, and
    // unlike the last-match-wins cascades elsewhere in the folder.
    const firstTally: CallTally = aTally();
    const secondTally: CallTally = aTally();

    const subject: Promotion = aPromotion({
      promotionCodes: [
        deletableCode('break-first-blocked', false, firstTally),
        deletableCode('break-second-blocked', false, secondTally),
      ],
    });

    expect(subject.getPromotionCodesDeletableFlag()).toBe(false);
    expect(firstTally.calls).toBe(1);
    expect(secondTally.calls).toBe(0);
  });

  it('re-runs the short-circuited walk on every call too', () => {
    // The two behaviours compose: first-wins on each pass, and a fresh pass every time. Three
    // reads over a collection whose first entry blocks means the first entry is consulted three
    // times and the second never.
    const firstTally: CallTally = aTally();
    const secondTally: CallTally = aTally();

    const subject: Promotion = aPromotion({
      promotionCodes: [
        deletableCode('repeat-blocked', false, firstTally),
        deletableCode('repeat-unreached', true, secondTally),
      ],
    });

    expect(subject.getPromotionCodesDeletableFlag()).toBe(false);
    expect(subject.getPromotionCodesDeletableFlag()).toBe(false);
    expect(subject.getPromotionCodesDeletableFlag()).toBe(false);

    expect(firstTally.calls).toBe(3);
    expect(secondTally.calls).toBe(0);
  });

  it('sees a code appended after the first read, unlike all three memoized rollups', () => {
    // The OBSERVABLE CONSEQUENCE, stated as a behavioural difference rather than as a cost. The
    // three memoized rollups freeze on first read; this one does not, so appending a blocking code
    // FLIPS the answer.
    const subject: Promotion = aPromotion({
      promotionCodes: [deletableCode('initially-clear', true, aTally())],
    });

    expect(subject.getPromotionCodesDeletableFlag()).toBe(true);

    subject.getPromotionCodes().push(deletableCode('appended-blocker', false, aTally()));

    expect(subject.getPromotionCodesDeletableFlag()).toBe(false);
  });

  it('freezes the three sibling rollups under the identical mutation', () => {
    // The control for the previous test, so the difference is attributed to the memo and not to
    // the collection access.
    const subject: Promotion = aPromotion({
      promotionCodes: [
        Object.assign(
          aPromotionCode({
            promotionCodeID: 'control-current-and-deletable',
            startDateTimeUTC: PERIOD_START_UTC,
            endDateTimeUTC: PERIOD_END_UTC,
          }),
          { isDeletable: (): boolean => true },
        ),
      ],
    });

    expect(subject.getCurrentPromotionCodeFlag()).toBe(true);
    expect(subject.getPromotionCodesDeletableFlag()).toBe(true);

    subject.getPromotionCodes().push(
      Object.assign(
        aPromotionCode({
          promotionCodeID: 'control-expired-and-blocking',
          startDateTimeUTC: EXPIRED_START_UTC,
          endDateTimeUTC: EXPIRED_END_UTC,
        }),
        { isDeletable: (): boolean => false },
      ),
    );
    expect(subject.getCurrentPromotionCodeFlag()).toBe(true);
    expect(subject.getPromotionCodesDeletableFlag()).toBe(false);
  });

  it('never leaks a verdict from one promotion into another', () => {
    const blocked: Promotion = aPromotion({
      promotionID: 'blocked-promotion',
      promotionCodes: [deletableCode('leak-blocked', false, aTally())],
    });
    const clear: Promotion = aPromotion({
      promotionID: 'clear-promotion',
      promotionCodes: [deletableCode('leak-clear', true, aTally())],
    });

    expect(blocked.getPromotionCodesDeletableFlag()).toBe(false);
    expect(clear.getPromotionCodesDeletableFlag()).toBe(true);
    expect(blocked.getPromotionCodesDeletableFlag()).toBe(false);
  });

  it('declares no backing field for the property the legacy declares at L79', () => {
    // The structural counterpart of the behavioural gate. The three memoized rollups each keep a
    // private field; this member keeps none, which is the mechanism by which it cannot cache.
    const members: string[] = prototypeMembers(Promotion);

    expect(members).toContain('getPromotionCodesDeletableFlag');
    // No setter, and no separately-spelled accessor for any of the three CFML spellings. The
    // target has one binding; the defect is reproduced behaviourally, never by declaring lookalike
    // identifiers in TypeScript.
    expect(members).not.toContain('setPromotionCodesDeletableFlag');
    expect(members).not.toContain('getPromotionCodeDeletableFlag');
    expect(members).not.toContain('getPromotionCodeDeleteableFlag');
  });
});

// CFML parity [model/entity/Promotion.cfc:L127, model/entity/PromotionCode.cfc]: isDeletable is
// not declared on PromotionCode.cfc -- it was inherited from the Hibachi base, which is not
// ported, so the member is reproduced on the entity from its own delete-context rule in
// model/validation/PromotionCode.json. These cases drive REAL, un-doubled promotion codes.
describe('the framework-inherited PromotionCode.isDeletable is reproduced, not doubled', () => {
  it('answers on a real code with no order references, without raising', () => {
    const subject: Promotion = aPromotion({
      promotionCodes: [
        aPromotionCode({
          promotionCodeID: 'real-code-unused',
          startDateTimeUTC: PERIOD_START_UTC,
          endDateTimeUTC: PERIOD_END_UTC,
        }),
      ],
    });

    expect(() => subject.getPromotionCodesDeletableFlag()).not.toThrow();
    expect(subject.getPromotionCodesDeletableFlag()).toBe(true);
  });

  it('confirms the member is declared on the ported promotion code', () => {
    // The structural counterpart: the answer above comes from the class, not from a test double.
    expect(prototypeMembers(PromotionCode)).toContain('isDeletable');
  });

  it('does not raise when there is no code to reach', () => {
    expect(aPromotion({ promotionCodes: [] }).getPromotionCodesDeletableFlag()).toBe(true);
  });

  it('agrees with the fixture exhibit that records the same contract independently', () => {
    // The fixture publishes this as data. Two independent records of one cross-file contract, so
    // neither can quietly drift into silence.
    const graph = makePromotionFixtures();
    const defect = graph.promotionCodesDeletableFlagDefect;

    expect(defect.portedAccessorRaisesOnMaterializedCode).toBe(false);
    expect(defect.memoCanEverHit).toBe(false);
    expect(defect.resolvedBy.length).toBeGreaterThan(0);

    // And the spelling census, reconciled above: three distinct spellings.
    expect(defect.distinctSpellingCount).toBe(3);
    expect(defect.declaredPropertyName).toBe('promotionCodesDeletableFlag');
    expect(defect.guardedKeyName).toBe('promotionCodeDeletableFlag');
    expect(defect.assignedKeyName).toBe('promotionCodeDeleteableFlag');
    // All three differ from one another - the mechanism in one assertion.
    expect(
      new Set([defect.declaredPropertyName, defect.guardedKeyName, defect.assignedKeyName]).size,
    ).toBe(3);
  });

  it('answers on both fixture variants, from the same graph, in the same test', () => {
    const graph = makePromotionFixtures();

    // No codes at all: the walk is vacuous and the permissive answer stands.
    expect(graph.codelessPromotion.getPromotionCodes()).toEqual([]);
    expect(graph.codelessPromotion.getPromotionCodesDeletableFlag()).toBe(true);

    // The coded variant answers too, and it answers `false` for a reason the graph carries: its
    // code is referenced by `promotionCodeOrders`, which is exactly what
    // `model/validation/PromotionCode.json`'s `maxCollection: 0` delete rule forbids.
    expect(graph.promotion.getPromotionCodes().length).toBeGreaterThan(0);
    expect(graph.promotionCodeOrders.length).toBeGreaterThan(0);
    expect(graph.promotion.getPromotionCodesDeletableFlag()).toBe(false);
  });
});

// CFML parity [model/entity/Promotion.cfc:L141-L164]: all six bidirectional helpers are pure
// far-side delegations -- none mutates a near-side array.
//
// CFML parity [model/entity/Promotion.cfc:L141, L144]: the promotionPeriod helpers declare a
// CAPITALIZED argument (`required any PromotionPeriod`) while the promotionCode and
// appliedPromotion helpers use lowercase.
describe('all six bidirectional helpers delegate to the far side and touch nothing near', () => {
  it('adds a period only because the period adds itself', () => {
    // The delegation proof. The double accepts `setPromotion` and does nothing with it.
    const inertTally: CallTally = aTally();
    const inertPeriod: PromotionPeriod = Object.assign(
      aPromotionPeriod({
        promotionPeriodID: 'inert-period',
        startDateTimeUTC: PERIOD_START_UTC,
        endDateTimeUTC: PERIOD_END_UTC,
      }),
      {
        setPromotion: (): void => {
          inertTally.calls += 1;
        },
      },
    );

    const subject: Promotion = aPromotion();
    subject.addPromotionPeriod(inertPeriod);

    expect(inertTally.calls).toBe(1);
    expect(subject.getPromotionPeriods()).toEqual([]);
  });

  it('adds a code only because the code adds itself', () => {
    const inertTally: CallTally = aTally();
    const inertCode: PromotionCode = Object.assign(
      aPromotionCode({
        promotionCodeID: 'inert-code',
        startDateTimeUTC: PERIOD_START_UTC,
        endDateTimeUTC: PERIOD_END_UTC,
      }),
      {
        setPromotion: (): void => {
          inertTally.calls += 1;
        },
      },
    );

    const subject: Promotion = aPromotion();
    subject.addPromotionCode(inertCode);

    expect(inertTally.calls).toBe(1);
    expect(subject.getPromotionCodes()).toEqual([]);
  });

  it('adds an applied promotion only because the applied promotion adds itself', () => {
    const inertTally: CallTally = aTally();
    const inertApplied: PromotionApplied = Object.assign(anAppliedPromotion('inert-applied'), {
      setPromotion: (): void => {
        inertTally.calls += 1;
      },
    });

    const subject: Promotion = aPromotion();
    subject.addAppliedPromotion(inertApplied);

    expect(inertTally.calls).toBe(1);
    expect(subject.getAppliedPromotions()).toEqual([]);
  });

  it('completes the round trip on a real period, with the child doing the appending', () => {
    // Undoubled, so the observable outcome of the delegation is pinned as well as its mechanism.
    const period: PromotionPeriod = aPromotionPeriod({
      promotionPeriodID: 'round-trip-period',
      startDateTimeUTC: PERIOD_START_UTC,
      endDateTimeUTC: PERIOD_END_UTC,
    });
    const subject: Promotion = aPromotion({ promotionID: 'round-trip-owner' });

    subject.addPromotionPeriod(period);

    // Both sides of the association now agree.
    expect(period.getPromotion()).toBe(subject);
    // Membership is compared by PRIMARY KEY, never by object identity or deep equality, and never
    // by testing a `findIndex` result with `> 0` - index 0 is a real position.
    expect(
      subject.getPromotionPeriods().map((held: PromotionPeriod) => held.getPromotionPeriodID()),
    ).toEqual(['round-trip-period']);
    expect(subject.hasPromotionPeriod(period)).toBe(true);
  });

  it('leaves the collection at one entry when the same identified period is added twice', () => {
    // Not a near-side duplicate assertion - there is no near-side code to assert.
    const period: PromotionPeriod = aPromotionPeriod({
      promotionPeriodID: 'added-twice',
      startDateTimeUTC: PERIOD_START_UTC,
      endDateTimeUTC: PERIOD_END_UTC,
    });
    const subject: Promotion = aPromotion();

    subject.addPromotionPeriod(period);
    subject.addPromotionPeriod(period);

    expect(subject.getPromotionPeriods()).toHaveLength(1);
  });

  it('appends an unsaved period twice, because the child guard short-circuits on isNew', () => {
    // The guard is `isNew() OR NOT promotion.hasPromotionPeriod(this)`, so an unsaved child - one
    // whose identifier is still the `unsavedvalue=""` sentinel - appends UNCONDITIONALLY and can
    // therefore land twice.
    const unsaved: PromotionPeriod = aPromotionPeriod({
      promotionPeriodID: '',
      startDateTimeUTC: PERIOD_START_UTC,
      endDateTimeUTC: PERIOD_END_UTC,
    });
    const subject: Promotion = aPromotion();

    subject.addPromotionPeriod(unsaved);
    subject.addPromotionPeriod(unsaved);

    expect(subject.getPromotionPeriods()).toHaveLength(2);
  });

  it('completes the round trip on a real code', () => {
    const code: PromotionCode = aPromotionCode({
      promotionCodeID: 'round-trip-code',
      startDateTimeUTC: PERIOD_START_UTC,
      endDateTimeUTC: PERIOD_END_UTC,
    });
    const subject: Promotion = aPromotion();

    subject.addPromotionCode(code);

    expect(code.getPromotion()).toBe(subject);
    expect(
      subject.getPromotionCodes().map((held: PromotionCode) => held.getPromotionCodeID()),
    ).toEqual(['round-trip-code']);
  });

  it('completes the round trip on a real applied promotion', () => {
    const applied: PromotionApplied = anAppliedPromotion('round-trip-applied');
    const subject: Promotion = aPromotion();

    subject.addAppliedPromotion(applied);

    expect(applied.getPromotion()).toBe(subject);
    expect(
      subject.getAppliedPromotions().map((held: PromotionApplied) => held.getPromotionAppliedID()),
    ).toEqual(['round-trip-applied']);
  });
});

// LEGACY-DEFECT [model/entity/Promotion.cfc:L144-L146 -> model/entity/PromotionPeriod.cfc:L110]:
// removePromotionPeriod delegates to PromotionPeriod.removePromotion, whose found path deletes
// from the leaked arguments.account and therefore throws.
// Preserved deliberately; do not fix without a product decision.
describe('removePromotionPeriod is inoperable on the found path, unlike its two siblings', () => {
  it('throws when the period really is in the collection', () => {
    const period: PromotionPeriod = aPromotionPeriod({
      promotionPeriodID: 'present-period',
      startDateTimeUTC: PERIOD_START_UTC,
      endDateTimeUTC: PERIOD_END_UTC,
    });
    const subject: Promotion = aPromotion();
    subject.addPromotionPeriod(period);

    expect(subject.hasPromotionPeriod(period)).toBe(true);
    expect(() => subject.removePromotionPeriod(period)).toThrow(/arguments\.account/);

    // And the COLLECTION is UNCHANGED. The raise precedes the deletion, so the association
    // survives the failed removal attempt - the caller is left holding exactly what it tried to
    // detach.
    expect(subject.getPromotionPeriods()).toHaveLength(1);
    expect(subject.hasPromotionPeriod(period)).toBe(true);
  });

  it('does not throw when the period is absent, reaching the near-side clear instead', () => {
    // The not-found path never evaluates the leaked reference, so it completes. The removal is a
    // no-op against the parent collection, which was already the truth.
    const stranger: PromotionPeriod = aPromotionPeriod({
      promotionPeriodID: 'never-attached',
      startDateTimeUTC: PERIOD_START_UTC,
      endDateTimeUTC: PERIOD_END_UTC,
    });
    const subject: Promotion = aPromotion({
      promotionPeriods: [
        aPromotionPeriod({
          promotionPeriodID: 'unrelated-occupant',
          startDateTimeUTC: PERIOD_START_UTC,
          endDateTimeUTC: PERIOD_END_UTC,
        }),
      ],
    });

    expect(subject.hasPromotionPeriod(stranger)).toBe(false);
    expect(() => subject.removePromotionPeriod(stranger)).not.toThrow();
    expect(subject.getPromotionPeriods()).toHaveLength(1);
  });

  it('removes a code cleanly, which is the working control', () => {
    const code: PromotionCode = aPromotionCode({
      promotionCodeID: 'removable-code',
      startDateTimeUTC: PERIOD_START_UTC,
      endDateTimeUTC: PERIOD_END_UTC,
    });
    const subject: Promotion = aPromotion();

    subject.addPromotionCode(code);
    expect(subject.getPromotionCodes()).toHaveLength(1);

    subject.removePromotionCode(code);

    expect(subject.getPromotionCodes()).toEqual([]);
    expect(subject.hasPromotionCode(code)).toBe(false);
    expect(code.getPromotion()).toBeUndefined();
  });

  it('removes an applied promotion cleanly, the second working control', () => {
    const applied: PromotionApplied = anAppliedPromotion('removable-applied');
    const subject: Promotion = aPromotion();

    subject.addAppliedPromotion(applied);
    expect(subject.getAppliedPromotions()).toHaveLength(1);

    subject.removeAppliedPromotion(applied);

    expect(subject.getAppliedPromotions()).toEqual([]);
    expect(subject.hasAppliedPromotion(applied)).toBe(false);
  });

  it('never grows a collection from any of the three remove helpers', () => {
    // The inversion cross-check, executed rather than merely asserted in prose. For each of the
    // three, the collection either shrinks or stays put; none of them can grow, because none
    // delegates to an `add*`.
    const subject: Promotion = aPromotion();

    const period: PromotionPeriod = aPromotionPeriod({
      promotionPeriodID: 'inversion-period',
      startDateTimeUTC: PERIOD_START_UTC,
      endDateTimeUTC: PERIOD_END_UTC,
    });
    const code: PromotionCode = aPromotionCode({
      promotionCodeID: 'inversion-code',
      startDateTimeUTC: PERIOD_START_UTC,
      endDateTimeUTC: PERIOD_END_UTC,
    });
    const applied: PromotionApplied = anAppliedPromotion('inversion-applied');

    subject.addPromotionPeriod(period);
    subject.addPromotionCode(code);
    subject.addAppliedPromotion(applied);

    try {
      subject.removePromotionPeriod(period);
    } catch {
      // Expected on the found path, and asserted properly in its own test above. Swallowed here
      // only so the inversion check can continue to the other two.
    }
    subject.removePromotionCode(code);
    subject.removeAppliedPromotion(applied);

    expect(subject.getPromotionPeriods().length).toBeLessThanOrEqual(1);
    expect(subject.getPromotionCodes()).toEqual([]);
    expect(subject.getAppliedPromotions()).toEqual([]);
  });

  it('keeps the legacy addAppliedPromotion spelling, three-way mismatch and all', () => {
    // C4. The method is `addAppliedPromotion` (L158), the collection is `appliedPromotions` (L64)
    // and the entity is `PromotionApplied` - three related spellings for one association.
    const members: string[] = prototypeMembers(Promotion);

    expect(members).toContain('addAppliedPromotion');
    expect(members).toContain('removeAppliedPromotion');
    expect(members).toContain('getAppliedPromotions');
    expect(members).not.toContain('addPromotionApplied');
    expect(members).not.toContain('removePromotionApplied');
    expect(members).not.toContain('getPromotionsApplied');
  });
});

// CFML parity [model/entity/Promotion.cfc:L170-L172]: `isDeletable()` is one statement -
// `return arrayLen( getAppliedPromotions() ) == 0;`. It consults no child, calls no service, reads
// no memo and cannot raise.
//
// CFML parity [model/entity/Promotion.cfc:L62-L64]: `appliedPromotions` is declared
// `cascade="all"`, while `promotionPeriods` (L62) and `promotionCodes` (L63) are
// `cascade="all-delete-orphan"`.
describe('isDeletable counts applied promotions and nothing else', () => {
  it('reports true when nothing has been applied', () => {
    expect(aPromotion({ appliedPromotions: [] }).isDeletable()).toBe(true);
  });

  it('reports false as soon as one promotion has been applied', () => {
    const subject: Promotion = aPromotion({
      appliedPromotions: [anAppliedPromotion('blocks-deletion')],
    });

    expect(subject.isDeletable()).toBe(false);
  });

  it('reports false for many applied promotions, without short-circuiting on a truthy first', () => {
    const subject: Promotion = aPromotion({
      appliedPromotions: [
        anAppliedPromotion('blocker-one'),
        anAppliedPromotion('blocker-two'),
        anAppliedPromotion('blocker-three'),
      ],
    });

    expect(subject.isDeletable()).toBe(false);
  });

  it('consults no child, so neither a period nor a code can affect it', () => {
    // The ISOLATION PROPERTY. `removePromotionPeriod()` raises on a present period and
    // `getPromotionCodesDeletableFlag()` walks every code, yet `isDeletable()` reads only
    // `appliedPromotions` and is unbothered by either.
    const subject: Promotion = aPromotion({
      promotionPeriods: [
        aPromotionPeriod({
          promotionPeriodID: 'irrelevant-period',
          startDateTimeUTC: PERIOD_START_UTC,
          endDateTimeUTC: PERIOD_END_UTC,
        }),
      ],
      promotionCodes: [
        aPromotionCode({
          promotionCodeID: 'irrelevant-code',
          startDateTimeUTC: PERIOD_START_UTC,
          endDateTimeUTC: PERIOD_END_UTC,
        }),
      ],
      appliedPromotions: [],
    });

    // The code gate walks the code and answers on its own terms...
    expect(subject.getPromotionCodesDeletableFlag()).toBe(true);
    // and `isDeletable()` answers from `appliedPromotions` alone, which is empty.
    expect(() => subject.isDeletable()).not.toThrow();
    expect(subject.isDeletable()).toBe(true);
  });

  it('recomputes rather than memoizing, and tracks the live collection', () => {
    // No memo is declared for this member either - but unlike D43 there is no BROKEN memo, just an
    // absent one, which is faithful to L170-L172's single statement. The answer therefore follows
    // the collection.
    const subject: Promotion = aPromotion({ appliedPromotions: [] });

    expect(subject.isDeletable()).toBe(true);

    subject.getAppliedPromotions().push(anAppliedPromotion('appended-after-first-read'));
    expect(subject.isDeletable()).toBe(false);

    subject.getAppliedPromotions().splice(0, 1);
    expect(subject.isDeletable()).toBe(true);
  });

  it('flips as the association is built and torn down through the helpers', () => {
    // End to end through the public surface rather than by poking the array: `addAppliedPromotion`
    // blocks deletion and `removeAppliedPromotion` unblocks it, which is the pairing a caller
    // actually uses.
    const applied: PromotionApplied = anAppliedPromotion('lifecycle-applied');
    const subject: Promotion = aPromotion();

    expect(subject.isDeletable()).toBe(true);

    subject.addAppliedPromotion(applied);
    expect(subject.isDeletable()).toBe(false);

    subject.removeAppliedPromotion(applied);
    expect(subject.isDeletable()).toBe(true);
  });

  it('is the terminal link the child delete chains bottom out in', () => {
    // [model/entity/PromotionPeriod.cfc:L88] is `!isExpired() AND getPromotion().isDeletable()`,
    // and the qualifier and reward chains reach the same place.
    const graph = makePromotionFixtures();

    // The fixture's main promotion carries exactly one applied promotion...
    expect(graph.promotion.getAppliedPromotions()).toHaveLength(1);
    expect(graph.promotion.isDeletable()).toBe(false);

    // while the codeless variant carries none.
    expect(graph.codelessPromotion.getAppliedPromotions()).toEqual([]);
    expect(graph.codelessPromotion.isDeletable()).toBe(true);
  });
});

// CFML parity `model/validation/Promotion.json`: the whole file is three properties and nothing
// else - `promotionName` required on `save`, `appliedPromotions` capped at zero on `delete`, and
// `promotionCodes` gated on `delete` by a method call.
describe('the entity surface satisfies every rule model/validation/Promotion.json declares', () => {
  it('declares exactly three rules, in file order, and no fourth', () => {
    expect(PROMOTION_VALIDATION_RULES).toHaveLength(3);
    expect(PROMOTION_VALIDATION_RULES.map((rule) => rule.property)).toEqual([
      'promotionName',
      'appliedPromotions',
      'promotionCodes',
    ]);
    const constrained: string[] = PROMOTION_VALIDATION_RULES.map((rule) => rule.property);
    expect(constrained).not.toContain('activeFlag');
    expect(constrained).not.toContain('promotionPeriods');
  });

  it('splits the rules across exactly the save and delete contexts the file names', () => {
    const saveRules = PROMOTION_VALIDATION_RULES.filter((rule) => rule.context === 'save');
    const deleteRules = PROMOTION_VALIDATION_RULES.filter((rule) => rule.context === 'delete');

    expect(saveRules.map((rule) => rule.property)).toEqual(['promotionName']);
    expect(deleteRules.map((rule) => rule.property)).toEqual([
      'appliedPromotions',
      'promotionCodes',
    ]);
  });

  it('exposes a readable name for the save-context required rule', () => {
    // The rule constrains the `save` context only, so a row already in the table may hold a null
    // name.
    expect(prototypeMembers(Promotion)).toContain('getPromotionName');
    expect(aPromotion({ promotionName: 'Named For Save' }).getPromotionName()).toBe(
      'Named For Save',
    );
  });

  it('agrees with isDeletable on the appliedPromotions maxCollection zero gate', () => {
    // The `{"contexts":"delete","maxCollection":0}` rule at L4 duplicates `isDeletable()`'s logic
    // declaratively.
    const rule = PROMOTION_VALIDATION_RULES.find((row) => row.property === 'appliedPromotions');
    expect(rule?.constraint).toBe('maxCollection:0');

    const empty: Promotion = aPromotion({ appliedPromotions: [] });
    const occupied: Promotion = aPromotion({
      appliedPromotions: [anAppliedPromotion('violates-max-collection')],
    });

    // The declarative cap and the imperative predicate reach the same verdict on both shapes.
    expect(empty.getAppliedPromotions().length <= 0).toBe(true);
    expect(empty.isDeletable()).toBe(true);
    expect(occupied.getAppliedPromotions().length <= 0).toBe(false);
    expect(occupied.isDeletable()).toBe(false);
  });

  it('names a promotionCodes gate method that genuinely exists on the entity', () => {
    // D43 is on the validated path.
    const rule = PROMOTION_VALIDATION_RULES.find((row) => row.property === 'promotionCodes');
    expect(rule?.constraint).toBe('method:getPromotionCodesDeletableFlag');
    expect(rule?.locator).toBe('model/validation/Promotion.json:L5');

    const namedMethod: string = 'getPromotionCodesDeletableFlag';
    expect(prototypeMembers(Promotion)).toContain(namedMethod);
  });

  it('reaches the declared gate method and gets the permissive answer on a codeless promotion', () => {
    // The gate as the validator would invoke it: by the name the JSON declares, on a shape that
    // can answer.
    const gate: boolean = aPromotion({ promotionCodes: [] }).getPromotionCodesDeletableFlag();

    expect(gate).toBe(true);
  });

  it('is one of the small set of method-based entity gates, not a lone oddity', () => {
    const methodRules = PROMOTION_VALIDATION_RULES.filter((rule) =>
      rule.constraint.startsWith('method:'),
    );

    expect(methodRules).toHaveLength(1);
    expect(methodRules.map((rule) => rule.property)).toEqual(['promotionCodes']);
  });

  it('matches the fixture census on the validation file itself', () => {
    // The fixture publishes the folder-wide census; the row for this entity is read here so a
    // future change to the file cannot pass unnoticed by both records at once.
    const graph = makePromotionFixtures();
    const row = graph.promotionValidationCensus.find((entry) => entry.entity === 'Promotion');

    expect(row).toBeDefined();
    expect(row?.present).toBe(true);
    expect(row?.validationFile).toBe('model/validation/Promotion.json');
    // Newline terminators, per the reconciliation above.
    expect(row?.lineCount).toBe(6);
  });
});
