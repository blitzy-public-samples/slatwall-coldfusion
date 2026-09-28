// slatwall-ts - PromotionAccount entity suite.
//
// Measured: `PromotionAccount` has no legacy test of any kind.
//
// Reproducing that faithfully is the requirement; both faults are PRESERVED, never repaired.
//
// The entity carries no date comparator and no clock, and this suite adds neither: no `isCurrent`,
// `isExpired` or `isActive` test, no injected clock.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PromotionAccount } from '../../../../src/domain/entities/promotionAccount.js';
import { Promotion } from '../../../../src/domain/entities/promotion.js';

// JUDGMENT CALL: `Promotion` is imported as a value, not with `import type`, because this suite
// must construct one.

// Every business date is an explicit UTC ISO-8601 literal: no bare `new Date()`, no `Date.now()`,
// no fake timers - the subject reads no clock.

/**
 * Lower bound of the exhibit window.
 */
const START_DATE_TIME_UTC = '2024-06-01T00:00:00.000Z';

/**
 * Upper bound of the exhibit window.
 */
const END_DATE_TIME_UTC = '2024-07-01T00:00:00.000Z';

/**
 * Audit creation instant.
 */
const CREATED_DATE_TIME_UTC = '2024-06-01T00:00:00.000Z';

/**
 * Audit modification instant.
 */
const MODIFIED_DATE_TIME_UTC = '2024-06-15T12:30:00.000Z';

/**
 * CFML parity [model/entity/PromotionAccount.cfc:L53-L54]: an absent timestamp is `undefined` and
 * never this.
 */
const UNIX_EPOCH_UTC = '1970-01-01T00:00:00.000Z';

/**
 * The constructor's parameter object, DERIVED rather than restated.
 *
 * The subject declares its init shape INLINE and exports only the class, so there is no init type
 * to import.
 */
type PromotionAccountInit = ConstructorParameters<typeof PromotionAccount>[0];

/**
 * The columns of an UNSAVED row, with every one of the ten slots explicit.
 *
 * CFML parity [model/entity/PromotionAccount.cfc:L52]: `promotionAccountID` starts `''` rather
 * than absent, because `unsavedvalue="" default=""` makes the empty string the honest answer for a
 * row never saved - and it is what `isNew()` keys on.
 *
 * @returns a fresh init object for an unsaved row.
 */
function unsavedRowColumns(): PromotionAccountInit {
  return {
    promotionAccountID: '',
    startDateTime: undefined,
    endDateTime: undefined,
    promotion: undefined,
    promotionID: undefined,
    accountID: undefined,
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
  };
}

/**
 * Builds one `SwPromotionAccount` link row, overriding only what a test cares about.
 *
 * @param overrides the columns this test is about.
 * @returns a fresh `PromotionAccount`.
 */
function aPromotionAccount(overrides: Partial<PromotionAccountInit> = {}): PromotionAccount {
  return new PromotionAccount({ ...unsavedRowColumns(), ...overrides });
}

/**
 * Builds a SAVED row - primary key non-empty, so `isNew()` is false.
 *
 * Split out because the two `isNew()` states select DIFFERENT throw messages inside
 * `setPromotion`, reproducing CFML's short-circuiting `or`.
 *
 * @param overrides the columns this test is about.
 * @returns a fresh, persisted-looking `PromotionAccount`.
 */
function aSavedPromotionAccount(overrides: Partial<PromotionAccountInit> = {}): PromotionAccount {
  return aPromotionAccount({ promotionAccountID: 'promotion-account-1', ...overrides });
}

/**
 * Builds the one in-scope far side.
 *
 * The three collections `Promotion` declares [model/entity/Promotion.cfc:L62-L64] each default to
 * a fresh empty array, and none is `promotionAccounts` - the reason the helpers below throw.
 *
 * @param promotionID the identifier to give it.
 * @returns a fresh `Promotion`.
 */
function aPromotion(promotionID: string): Promotion {
  return new Promotion({ promotionID });
}

/**
 * The subject's own prototype members, minus the constructor, sorted.
 *
 * @returns every member name the class installs on instances.
 */
function prototypeMembers(): string[] {
  return Object.getOwnPropertyNames(PromotionAccount.prototype)
    .filter((name: string) => name !== 'constructor')
    .sort();
}

/**
 * The far side's prototype members, minus the constructor.
 *
 * Used to PROVE the anti-contract that makes both bidirectional helpers throw.
 *
 * @returns every member name `Promotion` installs on instances.
 */
function promotionPrototypeMembers(): string[] {
  return Object.getOwnPropertyNames(Promotion.prototype).filter(
    (name: string) => name !== 'constructor',
  );
}

/**
 * The framework's terminal missing-method message, rebuilt for comparison.
 *
 * "does not exists" is grammatically wrong in the SOURCE.
 *
 * Rebuilt locally rather than imported, so the assertion is a real check.
 *
 * @param methodName The dead call target, without parentheses - they are added here.
 * @param className The bare component name of the entity the call was made ON.
 * @returns the exact message the framework would have thrown.
 */
function hibachiMissingMethodMessage(methodName: string, className: string): string {
  return `You have called a method ${methodName}() which does not exists in the ${className} entity.`;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// The censuses, named so each assertion reads as a claim about an enumerated set.

/**
 * Every member the class actually installs, and the complete list of them.
 *
 * Thirteen: ten accessors, one framework member, two throwing bidirectional helpers.
 */
const PORTED_PUBLIC_SURFACE: readonly string[] = [
  // Persistent properties [model/entity/PromotionAccount.cfc:L52-L54]
  'getPromotionAccountID',
  'getStartDateTime',
  'getEndDateTime',
  // Related entities [model/entity/PromotionAccount.cfc:L57-L58]
  'getPromotion',
  'getPromotionID',
  'getAccountID',
  // Audit properties [model/entity/PromotionAccount.cfc:L62-L65]
  'getCreatedDateTime',
  'getCreatedByAccountID',
  'getModifiedDateTime',
  'getModifiedByAccountID',
  // The single framework member concretely called by the legacy body, at L74 and L92.
  'isNew',
  // Bidirectional helpers [model/entity/PromotionAccount.cfc:L90, L97] - both throw.
  'setPromotion',
  'removePromotion',
];

/**
 * The Account-side bidirectional pair, DROPPED at the anti-corruption boundary.
 *
 * Their far side is `model/entity/Account.cfc`, explicitly out of SCOPE along with
 * `model/service/AccountService.cfc` and the whole account module, so their three reach-throughs
 * have no in-scope counterpart: `account.hasAccountPromotion(this)` at L74, and
 * `account.getAccountPromotions()` at L75.
 */
const DROPPED_ACCOUNT_SIDE_HELPERS: readonly string[] = ['setAccount', 'removeAccount'];

/**
 * Members the framework base could synthesise, none of which is authored here.
 *
 * CFML parity [org/Hibachi/HibachiEntity.cfc:L507-L565]: `onMissingMethod` matches eleven
 * method-name patterns - `hasUniqueOrNull*`, `hasUnique*`, `hasAny*`, `get*AssignedIDList`,
 * `get*ID`, `get*Options`, `get*OptionsSmartList`, `get*SmartList`, `get*Struct`, `get*Count`, and
 * a `getAttributeValue` fallback whose guard sits at L559.
 */
const UNPORTED_FRAMEWORK_MEMBERS: readonly string[] = [
  'getNewFlag',
  'getPrimaryIDValue',
  'getPrimaryIDPropertyName',
  'getSimpleRepresentation',
  'getPrintTemplates',
  'getEmailTemplates',
  'getAttributeValue',
  'clearAttributeCache',
  'validate',
  'hasErrors',
  'getErrors',
  'preInsert',
  'preUpdate',
  'isDeletable',
];

/**
 * Members that exist on sibling promotion entities but must not exist here.
 *
 * Every entry was checked against `model/entity/PromotionAccount.cfc` and has no declaration.
 */
const MEMBERS_ABSENT_BY_SOURCE: readonly string[] = [
  // No `remoteID` column. Contrast model/entity/Promotion.cfc:L67 and
  // model/entity/PromotionPeriod.cfc:L66, both of which declare one.
  'getRemoteID',
  'setRemoteID',
  // No `activeFlag` column. Contrast model/entity/Promotion.cfc:L56.
  'getActiveFlag',
  'setActiveFlag',
  // No date comparator and no clock; contrast [model/entity/PromotionPeriod.cfc:L78-L85], which
  // declares isCurrent() and isExpired() over now(), and its L137 getCurrentFlag().
  'isCurrent',
  'isExpired',
  'isActive',
  'getCurrentFlag',
  // The commented-out L59 association, in every spelling it could have taken.
  'getPromotionPeriod',
  'setPromotionPeriod',
  'removePromotionPeriod',
  'getPromotionPeriodID',
  // No collection of any kind is declared, so no membership predicate is synthesised either.
  'hasPromotionAccount',
  'getPromotionAccounts',
];

/**
 * Write-side members the legacy declares no setter for.
 *
 * The legacy declares exactly four methods - the Account-side helpers at L72/L78 and the
 * Promotion-side helpers at L90/L97 - and not one is a property setter.
 */
const UNAUTHORED_SETTERS: readonly string[] = [
  'setPromotionAccountID',
  'setStartDateTime',
  'setEndDateTime',
  'setPromotionID',
  'setAccountID',
  'setCreatedDateTime',
  'setCreatedByAccountID',
  'setModifiedDateTime',
  'setModifiedByAccountID',
];

describe('the ported surface, and everything deliberately left off it', () => {
  it('installs exactly the thirteen authored members and nothing else', () => {
    // Thirteen members in census order.
    expect(prototypeMembers()).toEqual([...PORTED_PUBLIC_SURFACE].sort());
    expect(PORTED_PUBLIC_SURFACE).toHaveLength(13);
  });

  it('drops both Account-side bidirectional helpers, whose far side is out of scope', () => {
    const subject = aPromotionAccount();
    const members = prototypeMembers();

    for (const dropped of DROPPED_ACCOUNT_SIDE_HELPERS) {
      expect(members).not.toContain(dropped);
      expect(dropped in subject).toBe(false);
    }

    expect(DROPPED_ACCOUNT_SIDE_HELPERS).toHaveLength(2);
  });

  it('refuses a dropped Account-side helper at compile time as well as at run time', () => {
    const subject = aPromotionAccount();

    // Removing the dispatcher turns this into a TYPE error rather than a runtime surprise: in CFML
    // the call resolves - `setAccount` exists at [model/entity/PromotionAccount.cfc:L72].
    // @ts-expect-error PromotionAccount authors no setAccount: the far side is the out-of-scope Account entity [model/entity/PromotionAccount.cfc:L72-L77].
    const absentHelper: unknown = subject.setAccount;

    expect(absentHelper).toBeUndefined();
  });

  it('keeps exactly the two helpers the legacy declares for the in-scope association', () => {
    const members = prototypeMembers();

    // [model/entity/PromotionAccount.cfc:L57] is the one foreign key with an in-scope far side, so
    // its pair is the only pair authored - though both members of it throw.
    const helpers = members.filter(
      (name: string) => name.startsWith('set') || name.startsWith('remove'),
    );

    expect(helpers.sort()).toEqual(['removePromotion', 'setPromotion']);
  });

  it('authors no setter for any column, because the legacy declares none', () => {
    const subject = aPromotionAccount();
    const members = prototypeMembers();

    for (const unauthored of UNAUTHORED_SETTERS) {
      expect(members).not.toContain(unauthored);
      expect(unauthored in subject).toBe(false);
    }

    // Nine columns, nine absent setters: the ten slots minus `promotion`, the only mutable field,
    // written solely by the throwing `setPromotion`.
    expect(UNAUTHORED_SETTERS).toHaveLength(9);
  });

  it('synthesises none of the members the framework dispatcher could have produced', () => {
    const subject = aPromotionAccount();
    const members = prototypeMembers();

    for (const unported of UNPORTED_FRAMEWORK_MEMBERS) {
      expect(members).not.toContain(unported);
      expect(unported in subject).toBe(false);
    }
  });

  it('invents no member that only a sibling promotion entity declares', () => {
    const subject = aPromotionAccount();
    const members = prototypeMembers();

    for (const absent of MEMBERS_ABSENT_BY_SOURCE) {
      expect(members).not.toContain(absent);
      expect(absent in subject).toBe(false);
    }
  });

  it('exposes no accessor for the component-level metadata, which stayed documentation', () => {
    const members = prototypeMembers();

    // CFML parity [model/entity/PromotionAccount.cfc:L49]: `displayname`, `entityname`, `table`,
    // `persistent`, `cacheuse` and `hb_serviceName` are component ATTRIBUTES, exposed by the
    // legacy through metadata introspection rather than instance accessors.
    for (const metadataAccessor of [
      'getTable',
      'getEntityName',
      'getClassName',
      'getDisplayName',
      'getServiceName',
      'getCacheUse',
    ]) {
      expect(members).not.toContain(metadataAccessor);
    }
  });

  it('carries no hb_permission-derived member, because the component declares none', () => {
    const members = prototypeMembers();

    // CFML parity [model/entity/PromotionAccount.cfc:L49]: this component carries no
    // `hb_permission` attribute at all, re-verified case-insensitively - unusual among its
    // siblings.
    for (const permissionMember of ['getPermission', 'getHbPermission', 'hasPermission']) {
      expect(members).not.toContain(permissionMember);
    }
  });
});

describe('the structural surface the SwPromotionAccount row carries', () => {
  it('hydrates the primary key, the two date bounds and both association keys', () => {
    // CFML parity [model/entity/PromotionAccount.cfc:L49]: the physical table is
    // `SwPromotionAccount` - the full, unabbreviated name.
    const promotion = aPromotion('promotion-1');
    const subject = aPromotionAccount({
      promotionAccountID: 'promotion-account-1',
      startDateTime: new Date(START_DATE_TIME_UTC),
      endDateTime: new Date(END_DATE_TIME_UTC),
      promotion,
      promotionID: 'promotion-1',
      accountID: 'account-1',
      createdDateTime: new Date(CREATED_DATE_TIME_UTC),
      createdByAccountID: 'author-account-1',
      modifiedDateTime: new Date(MODIFIED_DATE_TIME_UTC),
      modifiedByAccountID: 'editor-account-1',
    });

    expect(subject.getPromotionAccountID()).toBe('promotion-account-1');
    expect(subject.getStartDateTime()).toEqual(new Date(START_DATE_TIME_UTC));
    expect(subject.getEndDateTime()).toEqual(new Date(END_DATE_TIME_UTC));
    expect(subject.getPromotion()).toBe(promotion);
    expect(subject.getPromotionID()).toBe('promotion-1');
    expect(subject.getAccountID()).toBe('account-1');
    expect(subject.getCreatedDateTime()).toEqual(new Date(CREATED_DATE_TIME_UTC));
    expect(subject.getCreatedByAccountID()).toBe('author-account-1');
    expect(subject.getModifiedDateTime()).toEqual(new Date(MODIFIED_DATE_TIME_UTC));
    expect(subject.getModifiedByAccountID()).toBe('editor-account-1');
  });

  it('installs exactly the ten hydrated columns as instance state, and no eleventh', () => {
    const subject = aPromotionAccount();

    // The constructor declares every slot REQUIRED as `T | undefined`, so all ten become own
    // properties even when the column was NULL.
    expect(Object.keys(subject).sort()).toEqual([
      'accountID',
      'createdByAccountID',
      'createdDateTime',
      'endDateTime',
      'modifiedByAccountID',
      'modifiedDateTime',
      'promotion',
      'promotionAccountID',
      'promotionID',
      'startDateTime',
    ]);
  });

  it('hands back the very Promotion instance it was given, materializing nothing', () => {
    const promotion = aPromotion('promotion-1');
    const subject = aPromotionAccount({ promotion, promotionID: 'promotion-1' });
    expect(subject.getPromotion()).toBe(promotion);
  });

  it('exposes the promotionID column even when the association was not materialized', () => {
    // The repository may fetch the key without the far side, and a caller must still read it.
    //
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L365-L372]: the legacy `get<Assoc>ID` accessors
    // resolved through the dispatcher into `getPropertyPrimaryID`, which invoked the ASSOCIATION
    // getter.
    const subject = aPromotionAccount({ promotion: undefined, promotionID: 'promotion-1' });

    expect(subject.getPromotion()).toBeUndefined();
    expect(subject.getPromotionID()).toBe('promotion-1');
    expect(subject.getPromotionID()).not.toBe('');
  });
});

describe('the account side is an opaque identifier, and no Account is ever constructed', () => {
  // No `Account` type is imported anywhere; the columns are PRESERVED rather than dropped.

  it('returns opaque strings for all three account-side keys', () => {
    const subject = aPromotionAccount({
      accountID: 'account-1',
      createdByAccountID: 'author-account-1',
      modifiedByAccountID: 'editor-account-1',
    });

    expect(subject.getAccountID()).toBe('account-1');
    expect(subject.getCreatedByAccountID()).toBe('author-account-1');
    expect(subject.getModifiedByAccountID()).toBe('editor-account-1');

    // Strings, not objects.
    expect(typeof subject.getAccountID()).toBe('string');
    expect(typeof subject.getCreatedByAccountID()).toBe('string');
    expect(typeof subject.getModifiedByAccountID()).toBe('string');
  });

  it('returns undefined for each account-side key the row does not carry', () => {
    const subject = aPromotionAccount();

    expect(subject.getAccountID()).toBeUndefined();
    expect(subject.getCreatedByAccountID()).toBeUndefined();
    expect(subject.getModifiedByAccountID()).toBeUndefined();

    // Never the empty string, which is what the legacy dispatcher-backed form would have answered.
    expect(subject.getAccountID()).not.toBe('');
    expect(subject.getCreatedByAccountID()).not.toBe('');
    expect(subject.getModifiedByAccountID()).not.toBe('');
  });

  it('exposes no hydrated accessor for any out-of-scope account association', () => {
    const members = prototypeMembers();

    // The ID accessor exists; the ENTITY accessor must not. `getAccount()` would imply an
    // `Account` far side this port does not have.
    for (const hydratedAccessor of ['getAccount', 'getCreatedByAccount', 'getModifiedByAccount']) {
      expect(members).not.toContain(hydratedAccessor);
    }

    expect(members).toContain('getAccountID');
    expect(members).toContain('getCreatedByAccountID');
    expect(members).toContain('getModifiedByAccountID');
  });

  it('offers getters only for the account side, with no setter to re-point them', () => {
    const subject = aPromotionAccount({ accountID: 'account-1' });
    const members = prototypeMembers();

    expect(members).not.toContain('setAccountID');
    expect(members).not.toContain('setCreatedByAccountID');
    expect(members).not.toContain('setModifiedByAccountID');
    expect('setAccountID' in subject).toBe(false);
  });
});

describe('the commented-out promotionPeriod foreign key stays a comment', () => {
  it('declares no promotionPeriod member in any spelling', () => {
    const subject = aPromotionAccount();
    const members = prototypeMembers();

    for (const spelling of [
      'getPromotionPeriod',
      'setPromotionPeriod',
      'removePromotionPeriod',
      'getPromotionPeriodID',
      'setPromotionPeriodID',
      'promotionPeriod',
      'promotionPeriodID',
    ]) {
      expect(members).not.toContain(spelling);
      expect(spelling in subject).toBe(false);
    }
  });

  it('carries no promotionPeriod column in its hydrated state either', () => {
    const subject = aPromotionAccount();

    // Not merely absent from the prototype - absent from the row.
    expect(Object.keys(subject)).not.toContain('promotionPeriod');
    expect(Object.keys(subject)).not.toContain('promotionPeriodID');
    expect(Object.keys(subject)).toHaveLength(10);
  });

  it('cannot be supplied through the constructor at compile time', () => {
    // @ts-expect-error promotionPeriod is commented out at [model/entity/PromotionAccount.cfc:L59] and is deliberately not a member, so there is no constructor slot for it.
    const rejected = new PromotionAccount({ ...unsavedRowColumns(), promotionPeriodID: 'pp-1' });

    expect(rejected.getPromotionAccountID()).toBe('');
  });
});

describe('the four timestamps are Date or undefined, and absence is never an epoch', () => {
  // CFML parity [model/entity/PromotionAccount.cfc:L53-L54, L62, L64]: all four timestamp columns
  // are `ormtype="timestamp"` with no ORM default, so a NULL column hydrates to `undefined`.
  //
  // For the two promotion bounds, `undefined` means forever - the permissive extreme: an absent
  // bound is no bound.

  it('reports undefined for every timestamp the row does not carry', () => {
    const subject = aPromotionAccount();

    expect(subject.getStartDateTime()).toBeUndefined();
    expect(subject.getEndDateTime()).toBeUndefined();
    expect(subject.getCreatedDateTime()).toBeUndefined();
    expect(subject.getModifiedDateTime()).toBeUndefined();
  });

  it('never substitutes the Unix epoch, a zero, or any other sentinel for an absent bound', () => {
    const subject = aPromotionAccount();
    const epoch = new Date(UNIX_EPOCH_UTC);

    for (const absent of [
      subject.getStartDateTime(),
      subject.getEndDateTime(),
      subject.getCreatedDateTime(),
      subject.getModifiedDateTime(),
    ]) {
      expect(absent).toBeUndefined();
      expect(absent).not.toEqual(epoch);
      // Not a Date at all, so there is no instant to misread as a bound.
      expect(absent instanceof Date).toBe(false);
    }

    // And explicitly not the numeric or string forms a coercing implementation might have chosen.
    expect(subject.getStartDateTime()).not.toEqual(0);
    expect(subject.getEndDateTime()).not.toEqual(0);
    expect(subject.getStartDateTime()).not.toEqual('');
    expect(subject.getEndDateTime()).not.toEqual('');
  });

  it('distinguishes an absent bound from a bound that genuinely is the epoch', () => {
    // The two are different rows and must read differently.
    const unbounded = aPromotionAccount();
    const boundedAtEpoch = aPromotionAccount({ startDateTime: new Date(UNIX_EPOCH_UTC) });

    expect(unbounded.getStartDateTime()).toBeUndefined();
    expect(boundedAtEpoch.getStartDateTime()).toEqual(new Date(UNIX_EPOCH_UTC));
    expect(boundedAtEpoch.getStartDateTime()).not.toBeUndefined();
  });

  it('round-trips each bound independently, so one absent bound does not erase the other', () => {
    // A half-open window is a legitimate row: "from this instant, forever" and "until this
    // instant, from forever" are both expressible, and the columns are independent.
    const openEnded = aPromotionAccount({
      startDateTime: new Date(START_DATE_TIME_UTC),
      endDateTime: undefined,
    });
    const openStarted = aPromotionAccount({
      startDateTime: undefined,
      endDateTime: new Date(END_DATE_TIME_UTC),
    });

    expect(openEnded.getStartDateTime()).toEqual(new Date(START_DATE_TIME_UTC));
    expect(openEnded.getEndDateTime()).toBeUndefined();

    expect(openStarted.getStartDateTime()).toBeUndefined();
    expect(openStarted.getEndDateTime()).toEqual(new Date(END_DATE_TIME_UTC));
  });

  it('hands back the exact instant it was given, reinterpreting no timezone', () => {
    const start = new Date(START_DATE_TIME_UTC);
    const subject = aPromotionAccount({ startDateTime: start });

    expect(subject.getStartDateTime()).toBe(start);
    expect(subject.getStartDateTime()?.toISOString()).toBe(START_DATE_TIME_UTC);
  });

  it('accepts an end bound earlier than its start bound, because the row constrains no order', () => {
    // CFML parity: `model/entity/PromotionAccount.cfc` declares no comparator and no ORM event
    // hook, with a case-insensitive census confirming zero `preInsert` and zero `preUpdate`, and
    // there is no validation file to impose a cross-field rule.
    const inverted = aPromotionAccount({
      startDateTime: new Date(END_DATE_TIME_UTC),
      endDateTime: new Date(START_DATE_TIME_UTC),
    });

    expect(inverted.getStartDateTime()).toEqual(new Date(END_DATE_TIME_UTC));
    expect(inverted.getEndDateTime()).toEqual(new Date(START_DATE_TIME_UTC));
  });

  it('offers no comparator to evaluate the window with, and reads no clock', () => {
    const subject = aPromotionAccount({
      startDateTime: new Date(START_DATE_TIME_UTC),
      endDateTime: new Date(END_DATE_TIME_UTC),
    });
    const members = prototypeMembers();

    // The bounds are INERT COLUMNS, not a live window; this entity evaluates nothing about them.
    for (const comparator of ['isCurrent', 'isExpired', 'isActive', 'getCurrentFlag']) {
      expect(members).not.toContain(comparator);
    }

    expect(Object.keys(subject)).not.toContain('now');
    expect(Object.keys(subject)).not.toContain('clock');
  });
});

describe('isNew is honest, keyed on the unsavedvalue empty string', () => {
  // CFML parity [model/entity/PromotionAccount.cfc:L52]: `unsavedvalue="" default=""` makes the
  // empty string the honest answer for a row never saved, and the empty-string test is what the
  // framework does.

  it('reports true for an unsaved row whose key is the empty string', () => {
    const subject = aPromotionAccount();

    expect(subject.getPromotionAccountID()).toBe('');
    expect(subject.isNew()).toBe(true);
  });

  it('reports false once the row carries a generated key', () => {
    const subject = aSavedPromotionAccount();

    expect(subject.getPromotionAccountID()).toBe('promotion-account-1');
    expect(subject.isNew()).toBe(false);
  });

  it('treats only the empty string as unsaved, and not any other falsy-looking key', () => {
    // A whitespace key is not the unsaved value.
    expect(aPromotionAccount({ promotionAccountID: ' ' }).isNew()).toBe(false);
    expect(aPromotionAccount({ promotionAccountID: '0' }).isNew()).toBe(false);
    expect(aPromotionAccount({ promotionAccountID: '' }).isNew()).toBe(true);
  });

  it('exposes the key as a string and never as undefined', () => {
    // CFML parity [model/entity/PromotionAccount.cfc:L52]: `default=""` means the column always
    // holds a string, possibly the empty one.
    //
    // `string | undefined` is therefore never this accessor's type - which is what lets `isNew()`
    // compare without a guard.
    const subject = aPromotionAccount();

    expect(typeof subject.getPromotionAccountID()).toBe('string');
    expect(subject.getPromotionAccountID()).not.toBeUndefined();
  });

  it('reports the primary key without a framework accessor for it', () => {
    const members = prototypeMembers();

    // `getPrimaryIDValue()` and `getPrimaryIDPropertyName()` are framework members
    // [org/Hibachi/HibachiEntity.cfc:L244, L249] and deliberately not ported.
    expect(members).not.toContain('getPrimaryIDValue');
    expect(members).not.toContain('getPrimaryIDPropertyName');
    expect(members).toContain('getPromotionAccountID');
  });
});

describe('the far-side anti-contract that makes both bidirectional helpers throw', () => {
  // There is consequently no `SwPromotion` -> `SwPromotionAccount` inverse to honour, and
  // `src/domain/entities/promotion.ts` must not gain one: adding the far side would SILENTLY
  // REPAIR both defects below.

  it('confirms Promotion declares neither method the helpers call', () => {
    const members = promotionPrototypeMembers();

    expect(members).not.toContain('getPromotionAccounts');
    expect(members).not.toContain('hasPromotionAccount');
    expect(members).not.toContain('addPromotionAccount');
    expect(members).not.toContain('removePromotionAccount');
  });

  it('confirms Promotion DOES declare the equivalents for its three real collections', () => {
    const members = promotionPrototypeMembers();

    // The contrast is the point.
    expect(members).toContain('getPromotionPeriods');
    expect(members).toContain('hasPromotionPeriod');
    expect(members).toContain('getPromotionCodes');
    expect(members).toContain('hasPromotionCode');
    expect(members).toContain('getAppliedPromotions');
    expect(members).toContain('hasAppliedPromotion');
  });

  it('confirms a real Promotion instance carries no promotionAccounts collection', () => {
    const promotion = aPromotion('promotion-1');

    // Instance-level, not just prototype-level: no own property either, so nothing could be
    // reached through a hydration slot.
    expect('getPromotionAccounts' in promotion).toBe(false);
    expect('promotionAccounts' in promotion).toBe(false);
    expect(Object.keys(promotion)).not.toContain('promotionAccounts');
  });
});

// LEGACY-DEFECT [model/entity/PromotionAccount.cfc:L90-L95]: setPromotion assigns
// variables.promotion at L91 and only then calls hasPromotionAccount()/getPromotionAccounts() at
// L92-L93, neither of which Promotion.cfc declares.
// Preserved deliberately; do not fix without a product decision.
describe('setPromotion throws on every path, and mutates before it does', () => {
  // Branches are fatal: with isNew() TRUE the second operand at L92 is never EVALUATED, control
  // enters the body, and the getPromotionAccounts() call at L93 throws.
  //
  // Fact two - the assignment at L91 succeeds first, leaving the instance half-mutated.

  it('throws when called on an unsaved row, naming the L93 call target', () => {
    const subject = aPromotionAccount();
    const promotion = aPromotion('promotion-1');

    expect(subject.isNew()).toBe(true);
    expect(() => {
      subject.setPromotion(promotion);
    }).toThrow(hibachiMissingMethodMessage('getPromotionAccounts', 'Promotion'));
  });

  it('throws when called on a saved row, naming the L92 call target instead', () => {
    const subject = aSavedPromotionAccount();
    const promotion = aPromotion('promotion-1');

    expect(subject.isNew()).toBe(false);
    expect(() => {
      subject.setPromotion(promotion);
    }).toThrow(hibachiMissingMethodMessage('hasPromotionAccount', 'Promotion'));
  });

  it('reproduces the framework message byte for byte, including the grammatical error', () => {
    const subject = aPromotionAccount();
    const promotion = aPromotion('promotion-1');

    let captured: string = '';
    try {
      subject.setPromotion(promotion);
    } catch (error: unknown) {
      captured = error instanceof Error ? error.message : String(error);
    }

    // The terminal statement at [org/Hibachi/HibachiEntity.cfc:L565] is an observable error
    // contract; the three details that must never be "corrected" are enumerated on the helper.
    expect(captured).toBe(
      'You have called a method getPromotionAccounts() which does not exists in the Promotion entity.',
    );
    expect(captured).toContain('does not exists');
    expect(captured).toContain(' entity.');
    expect(captured).not.toContain('Slatwall.model.entity.Promotion');
    expect(captured).not.toContain('SlatwallPromotion');
  });

  it('LEAVES THE PROMOTION FIELD SET after throwing, on an unsaved row', () => {
    const subject = aPromotionAccount();
    const promotion = aPromotion('promotion-1');

    expect(subject.getPromotion()).toBeUndefined();

    expect(() => {
      subject.setPromotion(promotion);
    }).toThrow();

    // The HALF-MUTATION. This is the assertion the whole defect turns on: the throw did not roll
    // the assignment back, because L91 ran before L92/L93 were reached.
    expect(subject.getPromotion()).toBe(promotion);
  });

  it('LEAVES THE PROMOTION FIELD SET after throwing, on a saved row too', () => {
    const subject = aSavedPromotionAccount();
    const promotion = aPromotion('promotion-1');

    expect(() => {
      subject.setPromotion(promotion);
    }).toThrow();

    // Both branches mutate, because the assignment at L91 precedes the branch at L92 entirely.
    expect(subject.getPromotion()).toBe(promotion);
  });

  it('OVERWRITES an already-hydrated promotion before throwing, losing the previous value', () => {
    const original = aPromotion('promotion-original');
    const replacement = aPromotion('promotion-replacement');
    const subject = aSavedPromotionAccount({
      promotion: original,
      promotionID: 'promotion-original',
    });

    expect(subject.getPromotion()).toBe(original);

    expect(() => {
      subject.setPromotion(replacement);
    }).toThrow();

    // The assignment is unconditional, so a failed call still clobbers a good value.
    expect(subject.getPromotion()).toBe(replacement);
    expect(subject.getPromotion()).not.toBe(original);

    // And the foreign-key column does not follow the association, because L91 writes only the
    // object.
    expect(subject.getPromotionID()).toBe('promotion-original');
  });

  it('is typed void rather than never, matching the legacy void declaration', () => {
    const subject = aPromotionAccount();
    const promotion = aPromotion('promotion-1');

    // A `never` return would let TypeScript treat every later statement as unreachable, which
    // misrepresents the contract: `public void function setPromotion` at
    // [model/entity/PromotionAccount.cfc:L90] declares void.
    const returnValue: void = ((): void => {
      try {
        subject.setPromotion(promotion);
      } catch {
        // Swallowed on purpose: this case is about the TYPE, and the throw itself is pinned above.
      }
    })();

    expect(returnValue).toBeUndefined();
  });
});

// LEGACY-DEFECT [model/entity/PromotionAccount.cfc:L97-L106]: removePromotion throws at L101
// because Promotion.cfc declares no getPromotionAccounts().
// Preserved deliberately; do not fix without a product decision.
describe('removePromotion throws at L101, masking the stray at L103 and stranding L105', () => {
  // Fact one - L101 throws unconditionally, before any guard on the index, because
  // `getPromotionAccounts()` does not resolve on `Promotion`.
  //
  // Fact three - L105 is stranded: `structDelete(variables, "promotion")` never executes, so the
  // legacy never clears the field it set.

  it('throws when given an explicit promotion, naming the L101 call target', () => {
    const subject = aSavedPromotionAccount();
    const promotion = aPromotion('promotion-1');

    expect(() => {
      subject.removePromotion(promotion);
    }).toThrow(hibachiMissingMethodMessage('getPromotionAccounts', 'Promotion'));
  });

  it('throws when called with no argument while a promotion IS hydrated', () => {
    const promotion = aPromotion('promotion-1');
    const subject = aSavedPromotionAccount({ promotion, promotionID: 'promotion-1' });

    // The L98-L100 default-argument read succeeds here, so control reaches L101 and fails there -
    // the same contract message as the explicit-argument case.
    expect(() => {
      subject.removePromotion();
    }).toThrow(hibachiMissingMethodMessage('getPromotionAccounts', 'Promotion'));
  });

  it('fails DIFFERENTLY when no target resolves at all, and not with the missing-method contract', () => {
    const subject = aSavedPromotionAccount();

    expect(subject.getPromotion()).toBeUndefined();

    let captured: string = '';
    try {
      subject.removePromotion();
    } catch (error: unknown) {
      captured = error instanceof Error ? error.message : String(error);
    }

    // CFML parity [model/entity/PromotionAccount.cfc:L98-L100]: with no argument and no
    // `variables.promotion`, CFML fails on the default read itself with "Element promotion is
    // undefined in variables." - before any method is called.
    expect(captured).toContain('Element PROMOTION is undefined in VARIABLES.');
    expect(captured).not.toContain('does not exists');
    expect(captured).not.toBe(hibachiMissingMethodMessage('getPromotionAccounts', 'Promotion'));
  });

  it('NEVER CLEARS the promotion field, because the L105 structDelete is unreachable', () => {
    const promotion = aPromotion('promotion-1');
    const subject = aSavedPromotionAccount({ promotion, promotionID: 'promotion-1' });

    expect(() => {
      subject.removePromotion();
    }).toThrow();

    // The STRANDED L105. A remove that removes nothing: the field it was asked to clear is still
    // set, because the throw at L101 happens first.
    expect(subject.getPromotion()).toBe(promotion);
    expect(subject.getPromotionID()).toBe('promotion-1');
  });

  it('leaves the field set even when called with an explicit argument', () => {
    const promotion = aPromotion('promotion-1');
    const subject = aSavedPromotionAccount({ promotion, promotionID: 'promotion-1' });

    expect(() => {
      subject.removePromotion(promotion);
    }).toThrow();

    expect(subject.getPromotion()).toBe(promotion);
  });

  it('never reaches the stray at L103, so no account-side collection is ever touched', () => {
    const promotion = aPromotion('promotion-1');
    const subject = aSavedPromotionAccount({ promotion, promotionID: 'promotion-1' });

    // No account object is in play on this path, so the only observable evidence that L103 was not
    // reached is that the failure message is the L101 one - the honest limit of what a test can
    // see.
    let captured: string = '';
    try {
      subject.removePromotion();
    } catch (error: unknown) {
      captured = error instanceof Error ? error.message : String(error);
    }

    expect(captured).toBe(hibachiMissingMethodMessage('getPromotionAccounts', 'Promotion'));
    expect(subject.getAccountID()).toBeUndefined();
  });

  it('accepts the argument as optional, matching the legacy untyped `any promotion`', () => {
    const promotion = aPromotion('promotion-1');
    const subject = aSavedPromotionAccount({ promotion, promotionID: 'promotion-1' });

    // CFML parity [model/entity/PromotionAccount.cfc:L97]: `any promotion` without `required`, and
    // the L98 `structKeyExists` probe is what makes the absence meaningful.
    expect(() => {
      subject.removePromotion();
    }).toThrow();
    expect(() => {
      subject.removePromotion(promotion);
    }).toThrow();
    expect(() => {
      subject.removePromotion(undefined);
    }).toThrow();
  });

  it('is typed void rather than never, for the same parity reason as setPromotion', () => {
    const subject = aSavedPromotionAccount();
    const promotion = aPromotion('promotion-1');

    const returnValue: void = ((): void => {
      try {
        subject.removePromotion(promotion);
      } catch {
        // Swallowed on purpose: this case is about the TYPE.
      }
    })();

    expect(returnValue).toBeUndefined();
  });
});

describe('the remove-that-ADDs inversion cross-check', () => {
  it('records the verdict: CLEAN - zero inversions among the four legacy helpers', () => {
    // The cross-check was run against all four legacy bidirectional helpers, reading the verbatim
    // source. The verdict is clean: zero inversions - neither `remove*` calls an `add*`.
    const members = prototypeMembers();
    const removers = members.filter((name: string) => name.startsWith('remove'));
    const adders = members.filter((name: string) => name.startsWith('add'));

    // One remover survives the port and this entity has no `add*` for it to invert into, so an
    // inversion is not even expressible here.
    expect(removers).toEqual(['removePromotion']);
    expect(adders).toEqual([]);
  });
});

describe('no validation surface, because the legacy declares none', () => {
  it('exposes no validator, schema or error-reporting member', () => {
    const subject = aPromotionAccount();
    const members = prototypeMembers();

    // CFML parity: `model/validation/PromotionAccount.json` is VERIFIED ABSENT - not missing, not
    // pending, but by DESIGN - and one of exactly six deliberate absences across the in-scope set.
    for (const validationMember of [
      'validate',
      'hasErrors',
      'getErrors',
      'getValidations',
      'hasUniquePromotionAccountID',
      'hasUniqueOrNullPromotionAccountID',
    ]) {
      expect(members).not.toContain(validationMember);
      expect(validationMember in subject).toBe(false);
    }
  });

  it('accepts a row that a validation schema might well have rejected', () => {
    // Nothing in the legacy rejects an all-NULL row: no schema file, no ORM hook, no notnull
    // attribute on any of the nine nullable columns.
    const subject = aPromotionAccount();

    expect(subject.isNew()).toBe(true);
    expect(subject.getPromotion()).toBeUndefined();
    expect(subject.getAccountID()).toBeUndefined();
    expect(subject.getStartDateTime()).toBeUndefined();
    expect(subject.getEndDateTime()).toBeUndefined();
  });
});

describe('framework behaviour that is documented rather than reproduced', () => {
  it('has no dynamic dispatch, so an unknown accessor is absent instead of throwing', () => {
    const subject = aPromotionAccount();

    // CFML parity [org/Hibachi/HibachiEntity.cfc:L507-L565]: in the legacy an undeclared
    // `getSomething()` entered `onMissingMethod`, matched none of its eleven patterns and hit the
    // terminal throw at L565.
    expect('getAnythingUndeclared' in subject).toBe(false);

    // @ts-expect-error There is no dynamic dispatch: an undeclared accessor is a compile error here, where CFML would have thrown at [org/Hibachi/HibachiEntity.cfc:L565] only when executed.
    const undeclared: unknown = subject.getAnythingUndeclared;

    expect(undeclared).toBeUndefined();
  });

  it('exposes no getSimpleRepresentation, so the inherited base-class case is not forced', () => {
    const members = prototypeMembers();

    // Explain rather than fabricate.
    expect(members).not.toContain('getSimpleRepresentation');
  });

  it('carries no ORM event hook, because both banner sections are empty in the source', () => {
    const members = prototypeMembers();

    // CFML parity [model/entity/PromotionAccount.cfc:L121-L123]: the ORM Event Hooks banner pair
    // is EMPTY, and a case-insensitive census confirms zero `preInsert` and zero `preUpdate`
    // occurrences.
    expect(members).not.toContain('preInsert');
    expect(members).not.toContain('preUpdate');
  });

  it('records the malformed banner layout as a source wart, and normalises nothing', () => {
    // CFML parity [model/entity/PromotionAccount.cfc:L68, L109, L113-L123]: this component's
    // banner layout is MALFORMED, uniquely so among the eighteen in-scope entities.
    //
    // A copy-paste artifact with ZERO behavioural consequence, annotated and never normalised.
    expect(prototypeMembers()).toHaveLength(13);
    expect(new Set(prototypeMembers()).size).toBe(13);
  });
});

describe('freshness, because the half-mutation assertions depend on it', () => {
  it('builds an independent subject on every call, sharing no state', () => {
    const first = aPromotionAccount();
    const second = aPromotionAccount();
    const promotion = aPromotion('promotion-1');

    expect(first).not.toBe(second);

    expect(() => {
      first.setPromotion(promotion);
    }).toThrow();

    expect(first.getPromotion()).toBe(promotion);
    // The mutation stayed local to `first`.
    expect(second.getPromotion()).toBeUndefined();
  });

  it('returns a distinct init object from the column builder on every call', () => {
    const first = unsavedRowColumns();
    const second = unsavedRowColumns();

    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });
});
