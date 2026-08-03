// ---------------------------------------------------------------------------
// slatwall-ts - PromotionAccount entity suite
//
// SUBJECT: src/domain/entities/promotionAccount.ts PORTED FROM: model/entity/PromotionAccount.cfc
// (126 lines, confirmed by `wc -l`)
//
// --- 100% net-new coverage, never to be presented as parity ---
//
// MEASURED: `PromotionAccount` has NO legacy test of any kind. Exactly three legacy test files
// touch the in-scope slice: meta/tests/unit/entity/BrandTest.cfc (extended by brand.test.ts),
// meta/tests/unit/entity/ProductTest.cfc (extended by product.test.ts) and
// meta/tests/functional/admin/entity/ProductTest.cfc, an EMPTY STUB contributing zero coverage.
// Only two of the eighteen in-scope entities have a legacy antecedent; this is one of the sixteen
// net-new entity suites.
//
// --- and the entity itself is unexercised in this slice ---
//
// `PromotionAccount` is INERT, on four first-hand facts:
//
//   1. NO VALIDATION FILE. `model/validation/PromotionAccount.json` does not exist.
//   2. NO IN-SCOPE SERVICE REFERENCES IT. A case-insensitive sweep of `model/service/*.cfc`
//      returns ZERO hits, as does one over all of `model/` excluding the entity's own file. In
//      particular `model/service/PromotionService.cfc` - the service its own
//      `hb_serviceName="promotionService"` names - NEVER TOUCHES IT.
//   3. PORTED FOR COMPLETENESS ONLY, labelled unexercised rather than covered.
//   4. STRONGER THAN INERT - UNUSABLE: both Promotion-side helpers throw on every path.
//
// Reproducing that faithfully is the requirement; both faults are PRESERVED, never repaired.
//
// --- what this suite deliberately does not do: invent behaviour ---
//
// The entity carries NO date comparator and NO clock, and this suite adds neither: no `isCurrent`,
// `isExpired` or `isActive` test, no injected clock, and the two bounds are never compared to a
// notional "now". `model/entity/PromotionPeriod.cfc:L78-L85` declares `isCurrent()` and
// `isExpired()` over `now()`, so its port declares `now: () => Date`
// [slatwall-ts/src/domain/entities/promotionPeriod.ts:L576] and `:L630`, as does
// [slatwall-ts/src/domain/entities/promotionCode.ts:L753] and `:L797`;
// `model/entity/PromotionAccount.cfc` declares no comparator, so
// `src/domain/entities/promotionAccount.ts` takes no clock parameter.
//
// --- locator verification ---
//
// Every locator was re-verified against the source; where a number differs THE SOURCE WINS. Three
// corrections apply: the masked-versus-reachable stray contrast is
// `model/entity/PromotionAccount.cfc:L103` (MASKED) against `model/entity/PromotionPeriod.cfc:L110`
// (REACHABLE); `model/validation/` holds 96 `.json` files, not 94; and the in-scope validation
// split is 15 PRESENT / 6 ABSENT, so "12 present" is stale.
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PromotionAccount } from '../../../../src/domain/entities/promotionAccount.js';
import { Promotion } from '../../../../src/domain/entities/promotion.js';

// JUDGMENT CALL: `Promotion` is imported as a VALUE, not with `import type`, because this suite
// must CONSTRUCT one. `src/domain/entities/promotion.ts` declares fourteen `private readonly`
// fields, which makes the class NOMINALLY typed: no object literal is assignable to `Promotion`, so
// a structural double is unrepresentable without a cast. `new Promotion({ promotionID })` supplies
// the one required slot and leaves the other thirteen at their declared defaults, and the real
// collaborator lacking `getPromotionAccounts()` is the fact under test rather than something a stub
// was made to do. The 4612-line `tests/fixtures/promotionFixtures.ts` is deliberately NOT imported:
// its ready-made `promotionAccount` builds price groups, products, SKUs and a rounding rule as a
// side effect.

// ---------------------------------------------------------------------------
// Instants
//
// Every business date is an explicit UTC ISO-8601 literal: no bare `new Date()`, no `Date.now()`,
// no fake timers - the subject reads no clock. `tests/setup.ts` forces `process.env.TZ = 'UTC'` and
// hard-fails otherwise, so these literals mean the same instant everywhere; the values match
// PERIOD_START_UTC, PERIOD_END_UTC, CREATED_DATE_TIME_UTC and MODIFIED_DATE_TIME_UTC in
// `tests/fixtures/promotionFixtures.ts`.
// ---------------------------------------------------------------------------

/** Lower bound of the exhibit window. */
const START_DATE_TIME_UTC = '2024-06-01T00:00:00.000Z';

/** Upper bound of the exhibit window. */
const END_DATE_TIME_UTC = '2024-07-01T00:00:00.000Z';

/** Audit creation instant. */
const CREATED_DATE_TIME_UTC = '2024-06-01T00:00:00.000Z';

/** Audit modification instant. */
const MODIFIED_DATE_TIME_UTC = '2024-06-15T12:30:00.000Z';

/**
 * The Unix epoch, present ONLY as the value every date assertion proves is NOT used.
 *
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
 * A FUNCTION, not a shared literal: `setPromotion` MUTATES before it throws, and a leaked subject
 * would make the half-mutation assertion meaningless.
 *
 * All ten slots are stated even though nine are `undefined`, because `exactOptionalPropertyTypes`
 * is enabled and the init type declares every slot REQUIRED rather than optional as `?:` - "absent"
 * and "present-but-undefined" are different types under that flag.
 *
 * CFML parity [model/entity/PromotionAccount.cfc:L52]: `promotionAccountID` starts `''` rather than
 * absent, because `unsavedvalue="" default=""` makes the empty string the honest answer for a row
 * never saved - and it is what `isNew()` keys on.
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
 * @param overrides - the columns this test is about.
 * @returns a fresh `PromotionAccount`.
 */
function aPromotionAccount(overrides: Partial<PromotionAccountInit> = {}): PromotionAccount {
  return new PromotionAccount({ ...unsavedRowColumns(), ...overrides });
}

/**
 * Builds a SAVED row - primary key non-empty, so `isNew()` is false.
 *
 * Split out because the two `isNew()` states select DIFFERENT throw messages inside `setPromotion`,
 * reproducing CFML's short-circuiting `or`.
 *
 * @param overrides - the columns this test is about.
 * @returns a fresh, persisted-looking `PromotionAccount`.
 */
function aSavedPromotionAccount(overrides: Partial<PromotionAccountInit> = {}): PromotionAccount {
  return aPromotionAccount({ promotionAccountID: 'promotion-account-1', ...overrides });
}

/**
 * Builds the one in-scope far side.
 *
 * The three collections `Promotion` declares [model/entity/Promotion.cfc:L62-L64] each default to a
 * fresh empty array, and NONE is `promotionAccounts` - the reason the helpers below throw.
 *
 * @param promotionID - the identifier to give it.
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
 * The legacy statement is identical at [org/Hibachi/HibachiEntity.cfc:L565] and
 * [org/Hibachi/HibachiService.cfc:L280]:
 *
 *   throw('You have called a method #arguments.missingMethodName#() which does not exists in
 *          the #getClassName()# entity.');
 *
 * Reproduced BYTE FOR BYTE because it is an observable error contract:
 * `src/handlers/errorMapper.ts` recognises this exact shape with an anchored pattern. Three details
 * must never be "corrected":
 *
 *   1. "does not exists" is grammatically wrong IN THE SOURCE.
 *   2. The trailing " entity." is present even for the service-tier copy.
 *   3. `getClassName()` is `listLast(getClassFullname(), ".")`
 *      [org/Hibachi/HibachiObject.cfc:L136], so the class slot carries the BARE component name -
 *      `Promotion`, never `Slatwall.model.entity.Promotion` and never the
 *      `entityname="SlatwallPromotion"` value.
 *
 * Rebuilt locally rather than imported, so the assertion is a real check.
 *
 * @param methodName The dead call target, without parentheses - they are added here.
 * @param className  The bare component name of the entity the call was made ON.
 * @returns the exact message the framework would have thrown.
 */
function hibachiMissingMethodMessage(methodName: string, className: string): string {
  return `You have called a method ${methodName}() which does not exists in the ${className} entity.`;
}

afterEach(() => {
  // A2: no spy may outlive its test. `vitest.config.ts` sets `restoreMocks` and `clearMocks`
  // globally; this makes it local and visible, and this suite installs no spy.
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// The censuses, named so each assertion reads as a claim about an enumerated set.
// ---------------------------------------------------------------------------

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
  // The single framework member concretely called by the legacy body, at L74 and L92
  'isNew',
  // Bidirectional helpers [model/entity/PromotionAccount.cfc:L90, L97] - both throw
  'setPromotion',
  'removePromotion',
];

/**
 * The Account-side bidirectional pair, DROPPED at the anti-corruption boundary.
 *
 * CFML parity [model/entity/PromotionAccount.cfc:L72-L77, L78-L87], verbatim signatures:
 *
 *   public void function setAccount(required any account)   // L72
 *   public void function removeAccount(any account)         // L78
 *
 * Their far side is `model/entity/Account.cfc`, explicitly OUT OF SCOPE along with
 * `model/service/AccountService.cfc` and the whole account module, so their three reach-throughs
 * have no in-scope counterpart: `account.hasAccountPromotion(this)` at L74, and
 * `account.getAccountPromotions()` at L75, L82 and L84. The L58 many-to-one collapses to an inert
 * opaque ID column, and "dropped" means NOT AUTHORED IN THE TARGET rather than removed from the
 * legacy file, which is reference-only and untouched.
 */
const DROPPED_ACCOUNT_SIDE_HELPERS: readonly string[] = ['setAccount', 'removeAccount'];

/**
 * Members the framework base could synthesise, none of which is authored here.
 *
 * CFML parity [org/Hibachi/HibachiEntity.cfc:L507-L565]: `onMissingMethod` matches eleven
 * method-name patterns - `hasUniqueOrNull*`, `hasUnique*`, `hasAny*`, `get*AssignedIDList`,
 * `get*ID`, `get*Options`, `get*OptionsSmartList`, `get*SmartList`, `get*Struct`, `get*Count`, and
 * a `getAttributeValue` fallback whose guard sits at L559 - and TERMINATES IN A THROW AT L565. The
 * target has NO DYNAMIC DISPATCH AT ALL: only concretely-called members are authored, and for this
 * entity that is exactly one, `isNew()`.
 *
 * The L559 EAV fallback is unreachable here anyway - it requires an `attributeValues` property and
 * `PromotionAccount` declares none, confirmed by a case-insensitive census. Only Sku, Product,
 * ProductType and Brand declare that collection, so an unmatched `get...` throws directly at L565.
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
 * Members that exist on sibling promotion entities but MUST NOT exist here.
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
 * The legacy declares exactly FOUR methods - the Account-side helpers at L72/L78 and the
 * Promotion-side helpers at L90/L97 - and not one is a property setter, so every column is
 * read-only on the target. The four audit columns additionally carry `hb_populateEnabled="false"`
 * [model/entity/PromotionAccount.cfc:L62-L65], the legacy's mass-assignment exclusion.
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
    // Thirteen members in census order. The message helper is MODULE-PRIVATE rather than a private
    // method, unlike `promotionApplied.ts` whose `isSameRowAs` IS one and appears on the prototype,
    // so surface and prototype coincide exactly and drift either way fails here.
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
    // the call resolves - `setAccount` exists at [model/entity/PromotionAccount.cfc:L72] - then
    // fails at `account.hasAccountPromotion(this)` on L74.
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
    // `persistent`, `cacheuse` and `hb_serviceName` are component ATTRIBUTES, exposed by the legacy
    // through metadata introspection rather than instance accessors.
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

    // CFML parity [model/entity/PromotionAccount.cfc:L49]: this component carries NO
    // `hb_permission` attribute at all, re-verified case-insensitively - unusual among its
    // siblings, since `model/entity/Promotion.cfc:L49` carries `hb_permission="this"` and
    // `model/entity/PromotionPeriod.cfc:L49` the dotted
    // `hb_permission="promotion.promotionPeriods"`.
    for (const permissionMember of ['getPermission', 'getHbPermission', 'hasPermission']) {
      expect(members).not.toContain(permissionMember);
    }
  });
});

describe('the structural surface the SwPromotionAccount row carries', () => {
  it('hydrates the primary key, the two date bounds and both association keys', () => {
    // CFML parity [model/entity/PromotionAccount.cfc:L49]: the physical table is
    // `SwPromotionAccount` - the FULL, UNABBREVIATED name, worth pinning because two close siblings
    // abbreviate: `model/entity/PromotionQualifier.cfc:L49` maps to `SwPromoQual` and
    // `model/entity/PromotionReward.cfc:L57` to `SwPromoReward`. Schema continuity binds: the
    // target reads and writes it unchanged.
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

    // Associations arrive ALREADY MATERIALIZED OR ABSENT: Hibernate lazy collections have no
    // equivalent in a driver-only stack, so `src/repositories/mysql/**` owns hydration. Reference
    // identity proves it - a re-materializing accessor would return an equal-but-distinct object.
    expect(subject.getPromotion()).toBe(promotion);
  });

  it('exposes the promotionID column even when the association was not materialized', () => {
    // The repository may fetch the key without the far side, and a caller must still read it.
    //
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L365-L372]: the legacy `get<Assoc>ID` accessors
    // resolved through the dispatcher into `getPropertyPrimaryID`, which invoked the ASSOCIATION
    // getter, so with a null association the legacy could only answer the EMPTY STRING. The target
    // reads the foreign-key COLUMN.
    const subject = aPromotionAccount({ promotion: undefined, promotionID: 'promotion-1' });

    expect(subject.getPromotion()).toBeUndefined();
    expect(subject.getPromotionID()).toBe('promotion-1');
    expect(subject.getPromotionID()).not.toBe('');
  });
});

describe('the account side is an opaque identifier, and no Account is ever constructed', () => {
  // CFML parity [model/entity/PromotionAccount.cfc:L58, L63, L65]: three of the five associations
  // point at `model/entity/Account.cfc`, explicitly OUT OF SCOPE, and all three collapse to opaque
  // nullable ID columns:
  //
  //   L58  property name="account"           ... fkcolumn="accountID"
  //   L63  property name="createdByAccount"  ... fkcolumn="createdByAccountID"
  //   L65  property name="modifiedByAccount" ... fkcolumn="modifiedByAccountID"
  //
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

    // The ID accessor exists; the ENTITY accessor must not. `getAccount()` would imply an `Account`
    // far side this port does not have.
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
  // CFML parity [model/entity/PromotionAccount.cfc:L59]: the source declares - and then comments
  // out - a third many-to-one association. The line reads, verbatim:
  //
  //   //property name="promotionPeriod" cfc="PromotionPeriod" fieldtype="many-to-one" fkcolumn="promotionPeriodID";
  //
  // Preserved AS A COMMENT and not as a member, which is right twice over: the `promotionPeriodID`
  // column does not exist in `SwPromotionAccount`, so reviving the association would need a new
  // column and breach schema continuity; and a commented-out declaration is documented schema
  // history a reviewer diffing against the CFC needs. Not revived, not completed, not "fixed".

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
    // The strongest available statement of the ruling: the slot is not merely unread, it is
    // unwritable, because `exactOptionalPropertyTypes` plus an exact init type makes an unknown key
    // an excess-property error.
    // @ts-expect-error promotionPeriod is commented out at [model/entity/PromotionAccount.cfc:L59] and is deliberately not a member, so there is no constructor slot for it.
    const rejected = new PromotionAccount({ ...unsavedRowColumns(), promotionPeriodID: 'pp-1' });

    expect(rejected.getPromotionAccountID()).toBe('');
  });
});

describe('the four timestamps are Date or undefined, and absence is never an epoch', () => {
  // CFML parity [model/entity/PromotionAccount.cfc:L53-L54, L62, L64]: all four timestamp columns
  // are `ormtype="timestamp"` with NO ORM default, so a NULL column hydrates to `undefined`.
  //
  // FOR THE TWO PROMOTION BOUNDS, `undefined` MEANS FOREVER - the PERMISSIVE extreme: an absent
  // bound is no bound. Substituting the Unix epoch, `0`, a clock reading or any other sentinel
  // would change the meaning from "unbounded" to "bounded at an arbitrary instant", and for a start
  // bound an epoch would read as "began in 1970", which is not what NULL says.
  //
  // AN ANNOTATION ASYMMETRY that looks like an oversight and is not: the "forever" reading is
  // DECLARED on the sibling. `model/entity/PromotionPeriod.cfc:L53-L54` writes
  // `hb_formatType="dateTime" hb_nullRBKey="define.forever"` on both bounds, so the legacy admin
  // renders a NULL there as the localised word "forever"; `PromotionAccount.cfc:L53-L54` carry
  // NEITHER, so only the admin-facing label is missing.
  //
  // The convention is per-entity, not global: contrast `Sku.getPriceByCurrencyCode()`
  // [model/entity/Sku.cfc:L269-L273], which must return `Money | undefined` and never 0, and
  // `Product.getSalePrice()` [model/entity/Product.cfc:L598], which must `return 0` and never
  // undefined.

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
    // A half-open window is a legitimate row: "from this instant, forever" and "until this instant,
    // from forever" are both expressible, and the columns are independent.
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
    // CFML parity: `model/entity/PromotionAccount.cfc` declares NO comparator and NO ORM event
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
    // Compare `model/entity/PromotionPeriod.cfc:L78-L85`, which does declare `isCurrent()` and
    // `isExpired()` over the clock, and whose ported form consequently takes an injected clock
    // [slatwall-ts/src/domain/entities/promotionPeriod.ts:L630].
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
  // framework does. `isNew()` at [org/Hibachi/HibachiEntity.cfc:L707-L709] returns `getNewFlag()`,
  // and `getNewFlag()` at [org/Hibachi/HibachiEntity.cfc:L571-L576] is, verbatim:
  //
  //   if(getPrimaryIDValue() == "") { return true; } return false;
  //
  // This is the one framework member the legacy body concretely calls - at
  // [model/entity/PromotionAccount.cfc:L74] in `setAccount` and at
  // [model/entity/PromotionAccount.cfc:L92] in `setPromotion` - which is why it is the only one
  // authored. It also carries the ONE inherited MXUnit assertion that applies:
  // `defaults_are_correct()` at [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67] asserts
  // `entity.isNew()` and `!len(entity.getPrimaryIDValue())`.

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
    // [org/Hibachi/HibachiEntity.cfc:L244, L249] and deliberately not ported, which is why the
    // inherited `has_primary_id_property_name()` case at
    // [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L60-L62] has no counterpart.
    expect(members).not.toContain('getPrimaryIDValue');
    expect(members).not.toContain('getPrimaryIDPropertyName');
    expect(members).toContain('getPromotionAccountID');
  });
});

describe('the far-side anti-contract that makes both bidirectional helpers throw', () => {
  // CFML parity [model/entity/Promotion.cfc:L62-L64]: `Promotion` declares EXACTLY three
  // collections and none is `promotionAccounts`:
  //
  //   L62  promotionPeriods    singularname="promotionPeriod"    one-to-many
  //   L63  promotionCodes      singularname="promotionCode"      one-to-many
  //   L64  appliedPromotions   singularname="appliedPromotion"   one-to-many
  //
  // There is consequently no `SwPromotion` -> `SwPromotionAccount` inverse to honour, and
  // `src/domain/entities/promotion.ts` MUST NOT gain one: adding the far side would SILENTLY REPAIR
  // both defects below, inventing behaviour the legacy lacks.

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

    // Instance-level, not just prototype-level: no own property either, so nothing could be reached
    // through a hydration slot.
    expect('getPromotionAccounts' in promotion).toBe(false);
    expect('promotionAccounts' in promotion).toBe(false);
    expect(Object.keys(promotion)).not.toContain('promotionAccounts');
  });
});

// LEGACY-DEFECT [model/entity/PromotionAccount.cfc:L90-L95]: setPromotion assigns
// variables.promotion at L91 and only then calls hasPromotionAccount()/getPromotionAccounts() at
// L92-L93, neither of which Promotion.cfc declares. The method therefore throws AFTER mutating,
// leaving a half-mutated instance.
//
// Preserved deliberately; do not fix without a product decision.
describe('setPromotion throws on every path, and mutates before it does', () => {
  // The legacy body, verbatim [model/entity/PromotionAccount.cfc:L90-L95]:
  //
  //   public void function setPromotion(required any promotion) {
  //     variables.promotion = arguments.promotion;                     // L91 ASSIGNS FIRST
  //     if(isNew() or !arguments.promotion.hasPromotionAccount( this )) {   // L92
  //       arrayAppend(arguments.promotion.getPromotionAccounts(), this);    // L93
  //     }
  //   }
  //
  // FACT ONE - IT THROWS, AND WHICH MESSAGE DEPENDS ON isNew(). CFML's `or` SHORT-CIRCUITS, so BOTH
  // branches are fatal: with isNew() TRUE the second operand at L92 is NEVER EVALUATED, control
  // enters the body, and the getPromotionAccounts() call at L93 throws; with isNew() FALSE the
  // second operand IS evaluated, and hasPromotionAccount() at L92 throws before the body is
  // entered. Both name a method on `Promotion`, because both are called ON the argument.
  //
  // FACT TWO - THE ASSIGNMENT AT L91 SUCCEEDS FIRST, leaving the instance HALF-MUTATED. Tidying
  // this into a guard-first shape would change observable behaviour, so the ordering is reproduced.
  //
  // The signature is typed `void`, NOT `never`: the legacy declares `public void function`, and
  // control reaches the assignment before failing. Contrast `Sku.getPriceByPromotion()`
  // [model/entity/Sku.cfc:L258], whose `returntype="numeric"` promises a value it can never
  // deliver, and whose ported form is `never`.

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

    // THE HALF-MUTATION. This is the assertion the whole defect turns on: the throw did NOT roll
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

    // And the foreign-key column does NOT follow the association, because L91 writes only the
    // object.
    expect(subject.getPromotionID()).toBe('promotion-original');
  });

  it('is typed void rather than never, matching the legacy void declaration', () => {
    const subject = aPromotionAccount();
    const promotion = aPromotion('promotion-1');

    // A `never` return would let TypeScript treat every later statement as unreachable, which
    // misrepresents the contract: `public void function setPromotion` at
    // [model/entity/PromotionAccount.cfc:L90] declares void, and the method really does execute its
    // first statement.
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
// because Promotion.cfc declares no getPromotionAccounts(). The undeclared `arguments.account`
// stray at L103 is therefore MASKED and unreachable -- the exact opposite of
// [model/entity/PromotionPeriod.cfc:L110], where the equivalent stray IS reachable because
// Promotion.cfc does declare getPromotionPeriods().
//
// Preserved deliberately; do not fix without a product decision.
describe('removePromotion throws at L101, masking the stray at L103 and stranding L105', () => {
  // The legacy body, verbatim [model/entity/PromotionAccount.cfc:L97-L106]:
  //
  //   public void function removePromotion(any promotion) {
  //     if(!structKeyExists(arguments, "promotion")) {                       // L98
  //       arguments.promotion = variables.promotion;                         // L99
  //     }                                                                   // L100
  //     var index = arrayFind(arguments.promotion.getPromotionAccounts(), this);  // L101 THROWS
  //     if(index > 0) {                                                     // L102
  //       arrayDeleteAt(arguments.account.getPromotionAccounts(), index);    // L103 STRAY
  //     }                                                                   // L104
  //     structDelete(variables, "promotion");                               // L105
  //   }
  //
  // THREE STACKED FACTS, the middle the most instructive.
  //
  // FACT ONE - L101 THROWS UNCONDITIONALLY, before any guard on the index, because
  // `getPromotionAccounts()` does not resolve on `Promotion`.
  //
  // FACT TWO - THE STRAY AT L103 IS MASKED. L103 dereferences `arguments.account`, which is NOT a
  // declared argument: the signature at L97 is `removePromotion(any promotion)`, so in CFML this is
  // an undefined-variable error. Worse, search and delete address DIFFERENT OBJECTS - L101 searches
  // `arguments.promotion` while L103 deletes from `arguments.account` - so even with live
  // collections on both sides the method could not do its job. L103 is unreachable only because
  // L101 throws first: the first defect masks the second. Latent, not harmless - were a product
  // decision to add a `promotionAccounts` collection to `Promotion`, L101 would begin succeeding
  // and this leak would go live.
  //
  //   THE CONTRAST, AND THE LESSON. The IDENTICAL stray appears at
  //   [model/entity/PromotionPeriod.cfc:L110] as
  //   `arrayDeleteAt(arguments.account.getPromotionPeriods(), index)`
  //   and there it IS REACHABLE, because the preceding
  //   `arrayFind(arguments.promotion.getPromotionPeriods(), this)` at
  //   [model/entity/PromotionPeriod.cfc:L108] SUCCEEDS: `model/entity/Promotion.cfc:L62` genuinely
  //   declares `promotionPeriods`. Same error, opposite consequence - masked here, live
  //   there - decided by whether the far-side collection exists.
  //
  // FACT THREE - L105 IS STRANDED: `structDelete(variables, "promotion")` NEVER EXECUTES, so the
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
    // `variables.promotion`, CFML fails on the DEFAULT READ ITSELF with "Element PROMOTION is
    // undefined in VARIABLES." - before any method is called. An undefined-variable error and NOT a
    // missing-method contract, so it deliberately does NOT carry the framework's terminal message.
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

    // THE STRANDED L105. A remove that removes nothing: the field it was asked to clear is still
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

    // CFML parity [model/entity/PromotionAccount.cfc:L97]: `any promotion` WITHOUT `required`, and
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
    // The cross-check was run against ALL FOUR legacy bidirectional helpers, reading the verbatim
    // source. THE VERDICT IS CLEAN: ZERO INVERSIONS - neither `remove*` calls an `add*`.
    //
    //   removeAccount   [L78-L87]  searches at L82 and deletes at L84, BOTH against
    //                              `arguments.account.getAccountPromotions()` - one object.
    //   removePromotion [L97-L106] searches at L101 and deletes at L103, and while those address
    //                              DIFFERENT objects (the L103 stray), the operation is still a
    //                              delete: a wrong-receiver defect, NOT an inversion.
    //
    // The defect is real elsewhere: `model/entity/Option.cfc:L129-L131` and `:L145-L147` have
    // `removePromotionRewardExclusion` and `removePromotionQualifierExclusion` each calling
    // `addExcludedOption(this)` - two genuine inversions, preserved as defects there.
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

    // CFML parity: `model/validation/PromotionAccount.json` IS VERIFIED ABSENT - not missing, not
    // pending, but BY DESIGN - and one of exactly SIX deliberate absences across the in-scope set.
    // Directory-listed, not assumed: `model/validation/` holds 96 `.json` files, not 94, and of the
    // 21 in-scope artifacts the split is 15 PRESENT / 6 ABSENT, not the plan's "12 present". The
    // six are FOUR ENTITIES - Category, PromotionQualifier, PromotionApplied, PromotionAccount -
    // and TWO PROCESS OBJECTS - Product_AddOption, Product_AddOptionGroup. Consequently there is no
    // zod schema, no `validate(context)`, no `hasErrors()`, no `getErrors()` and no `hasUnique*`
    // member, since the legacy dispatcher branches [org/Hibachi/HibachiEntity.cfc:L507-L565] served
    // declarative uniqueness rules this entity has none of. COMPLETING THE LEGACY VALIDATION GAP IS
    // OUT OF BOUNDS.
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
    // attribute on any of the nine nullable columns. The inherited MXUnit case
    // `validate_as_save_for_a_new_instance_doesnt_pass()` at
    // [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L54] has NO counterpart for exactly
    // this reason: with no schema there is nothing for `validate(context="save")` to fail.
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
    // terminal throw at L565. The `getAttributeValue` fallback at L559 could not catch it either,
    // for the reason the census JSDoc above records.
    //
    // THE TARGET HAS NO DYNAMIC DISPATCH WHATSOEVER: no Proxy, no index signature, no `evaluate()`,
    // no `variables.` scope object, no `clearAttributeCache`, no `getNewFlag`. DOCUMENTED, not
    // reproduced - an unknown member is simply `undefined` and the call site does not compile. A
    // STRUCTURAL CONSEQUENCE, NOT A BEHAVIOURAL CHANGE: only the fate of an UNDECLARED call moves,
    // from a runtime throw to a compile error.
    expect('getAnythingUndeclared' in subject).toBe(false);

    // @ts-expect-error There is no dynamic dispatch: an undeclared accessor is a compile error here, where CFML would have thrown at [org/Hibachi/HibachiEntity.cfc:L565] only when executed.
    const undeclared: unknown = subject.getAnythingUndeclared;

    expect(undeclared).toBeUndefined();
  });

  it('exposes no getSimpleRepresentation, so the inherited base-class case is not forced', () => {
    const members = prototypeMembers();

    // EXPLAIN RATHER THAN FABRICATE. The inherited MXUnit case
    // `simple_representation_exists_and_is_simple()` at
    // [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58] asserts
    // `isSimpleValue(entity.getSimpleRepresentation())` and is NOT applicable:
    // `model/entity/PromotionAccount.cfc` declares no `getSimpleRepresentation`. Per-entity rather
    // than blanket: `model/entity/PromotionPeriod.cfc:L91-L93` DOES declare one, returning
    // `getPromotion().getPromotionName()`.
    expect(members).not.toContain('getSimpleRepresentation');
  });

  it('carries no ORM event hook, because both banner sections are empty in the source', () => {
    const members = prototypeMembers();

    // CFML parity [model/entity/PromotionAccount.cfc:L121-L123]: the ORM Event Hooks banner pair is
    // EMPTY, and a case-insensitive census confirms zero `preInsert` and zero `preUpdate`
    // occurrences - so this entity is not one of the four hook-bearing in-scope entities (Category,
    // PriceGroup, ProductType, PromotionCode).
    expect(members).not.toContain('preInsert');
    expect(members).not.toContain('preUpdate');
  });

  it('records the malformed banner layout as a source wart, and normalises nothing', () => {
    // CFML parity [model/entity/PromotionAccount.cfc:L68, L109, L113-L123]: this component's banner
    // layout is MALFORMED, uniquely so among the eighteen in-scope entities.
    //
    //   L68        "============= START: Bidirectional Helper Methods ==================="
    //   L72-L106   the four helpers
    //   L109       "=============  END:  Bidirectional Helper Methods ==================="
    //              ...indented with THREE SPACES rather than a tab, unlike every sibling
    //   L113/L115  "Non-Persistent Property Methods" - an EMPTY pair, positioned AFTER the
    //              bidirectional block, inverting the ordering every sibling uses
    //   L117/L119  "Bidirectional Helper Methods" - OPENED AND CLOSED A SECOND TIME: a
    //              DUPLICATE BANNER PAIR, and empty
    //   L121/L123  "ORM Event Hooks" - a further EMPTY pair
    //   L124-L125  blank; the component closes at L126
    //
    // A copy-paste artifact with ZERO behavioural consequence, annotated and NEVER normalised.
    // Comment structure has no observable surface, so this case pins what does: the duplicated
    // banner authored no member twice and dropped none.
    expect(prototypeMembers()).toHaveLength(13);
    expect(new Set(prototypeMembers()).size).toBe(13);
  });
});

describe('freshness, because the half-mutation assertions depend on it', () => {
  it('builds an independent subject on every call, sharing no state', () => {
    // A2 made explicit: `setPromotion` mutates before it throws, so a subject leaked between tests
    // would make the half-mutation assertions meaningless.
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
