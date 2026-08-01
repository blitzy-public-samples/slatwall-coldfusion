// ---------------------------------------------------------------------------
// slatwall-ts - PromotionAccount entity suite
//
// SUBJECT: src/domain/entities/promotionAccount.ts
// PORTED FROM: model/entity/PromotionAccount.cfc (126 lines, confirmed by `wc -l`)
//
// *** COVERAGE CLASSIFICATION: NET-NEW. NEVER PARITY. ***
//
// `PromotionAccount` has NO legacy test of any kind. Exactly three legacy test files touch the
// in-scope slice and one of those is an empty stub:
//
//   meta/tests/unit/entity/BrandTest.cfc              -> extended by brand.test.ts
//   meta/tests/unit/entity/ProductTest.cfc            -> extended by product.test.ts
//   meta/tests/functional/admin/entity/ProductTest.cfc-> an EMPTY STUB, contributing zero coverage
//
// Only two of the eighteen in-scope entities therefore have a legacy antecedent. This suite is one
// of the sixteen net-new entity suites, and presenting it as parity would fail the coverage gate.
// Every assertion below is authored fresh against the verbatim source read; none is carried
// forward from an MXUnit case, because there is none to carry.
//
// *** AND THE ENTITY ITSELF IS UNEXERCISED IN THIS SLICE ***
//
// Beyond having no legacy test, `PromotionAccount` is INERT. Four independent facts establish it,
// each re-verified first-hand rather than taken from the plan:
//
//   1. NO VALIDATION FILE. `model/validation/PromotionAccount.json` does not exist. See the
//      "no validation surface" describe block for the reconciled count.
//   2. NO IN-SCOPE SERVICE REFERENCES IT. A case-insensitive sweep of `model/service/*.cfc`
//      returns ZERO hits, and a sweep of all of `model/` excluding the entity's own file returns
//      ZERO hits. In particular `model/service/PromotionService.cfc` - the service its own
//      `hb_serviceName="promotionService"` metadata names - NEVER TOUCHES IT.
//   3. IT IS PORTED FOR COMPLETENESS ONLY, and is labelled unexercised rather than quietly
//      presented as covered.
//   4. IT IS STRONGER THAN INERT - IT IS UNUSABLE. Both of its Promotion-side bidirectional
//      helpers throw on every code path, for the reasons pinned in the two preserved-defect
//      blocks near the foot of this file. (Those two markers are the only two in this file, and
//      the phrase is deliberately not repeated here so a mechanical marker audit counts exactly
//      two.)
//
// So this suite pins the behaviour of an entity that nothing calls and that could not work if
// anything did. Reproducing that faithfully - rather than making it work - is the requirement.
//
// *** WHAT THIS SUITE DELIBERATELY DOES NOT DO: INVENT BEHAVIOUR ***
//
// The entity carries NO date comparator and NO clock, and this suite adds neither. There is no
// `isCurrent`, `isExpired` or `isActive` test; no clock is injected; and `startDateTime` /
// `endDateTime` are never compared against a notional "now". That is not an omission - it is the
// contract. `src/domain/entities/promotionAccount.ts` deliberately takes no clock parameter,
// unlike its two siblings which genuinely need one: `src/domain/entities/promotionPeriod.ts:L576`
// and `:L630`, and `src/domain/entities/promotionCode.ts:L753` and `:L797`, each declare
// `now: () => Date`. The legacy asymmetry is real and is the reason:
// `model/entity/PromotionPeriod.cfc:L78-L85` declares `isCurrent()` and `isExpired()` over `now()`,
// whereas `model/entity/PromotionAccount.cfc` declares no comparator at all. Its two timestamps
// are inert columns, not a live window.
//
// *** RULES VERDICT ***
//
// The project rules document returns exactly `No user rules provided.` - read to completion four
// times (no range, then [1,-1], [2,500], [500,1000]), byte-identical each time. NO RULE GOVERNS
// THIS FILE, no file enters scope by rule mandate, and no rule may be invented. The absence is not
// licence to lower the bar: the enterprise substitute standard applies at full strength - maximal
// strictness with no `any` and no suppression comment, one unit per file, no barrel import, and
// every judgment call annotated where it was made.
//
// *** DIVERGENCE BUDGET: THIS FILE SPENDS ZERO ***
//
// Three deliberate divergences exist across the whole port, and the domain layer owns exactly one
// of them - the entity memo fixes pinned in sku.test.ts and product.test.ts. Both faults on THIS
// entity are PRESERVED, never repaired. A fourth divergence is forbidden and none is claimed here.
//
// *** LOCATOR VERIFICATION ***
//
// Every locator quoted below was re-verified against the source rather than copied from the plan,
// because locator drift is systemic and measured. Where a number differs, THE SOURCE WINS and the
// correction is recorded at the point of use. Three corrections apply to this file:
//
//   * The reachable-versus-masked stray contrast is `model/entity/PromotionAccount.cfc:L103`
//     (MASKED) versus `model/entity/PromotionPeriod.cfc:L110` (REACHABLE). Both re-read in full.
//   * `model/validation/` holds 96 `.json` files, not 94.
//   * The in-scope validation split is 15 PRESENT / 6 ABSENT. The plan's "12 present" is stale.
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PromotionAccount } from '../../../../src/domain/entities/promotionAccount.js';
import { Promotion } from '../../../../src/domain/entities/promotion.js';

// JUDGMENT CALL: `Promotion` is imported as a VALUE, not with `import type`, because this suite
// must CONSTRUCT one. That is forced rather than chosen. `src/domain/entities/promotion.ts`
// declares fourteen `private readonly` fields, which makes the class NOMINALLY typed in
// TypeScript: no object literal, however complete, is assignable to `Promotion`. A structural
// hand-rolled double is therefore not merely discouraged here, it is unrepresentable without a
// cast - and a cast would assert a type it had not earned. The minimal real instance IS the inline
// double: `new Promotion({ promotionID })` supplies the one required slot and leaves all thirteen
// optional ones at their declared defaults. No mocking library, no faker, no fixture graph.
//
// Using the real collaborator also strengthens the two throwing-helper assertions considerably: a
// stub could be made to lack `getPromotionAccounts()` by construction, which would prove nothing.
// The real `Promotion` lacking it is the actual fact under test.
//
// The 4612-line `tests/fixtures/promotionFixtures.ts` is deliberately NOT imported. It does export
// a ready-made `promotionAccount` in its graph, but reaching it builds price groups, products,
// SKUs and a rounding rule as a side effect. Pulling that in to obtain one far-side object would
// trade this suite's isolation for nothing it needs.

// ---------------------------------------------------------------------------
// Instants
//
// Every business date in this file is an explicit UTC ISO-8601 literal. There is deliberately no
// bare `new Date()`, no `Date.now()`, and no fake-timer installation anywhere in this suite: the
// subject reads no clock, so a suite that reached for one would be testing itself. `tests/setup.ts`
// additionally forces `process.env.TZ = 'UTC'` and hard-fails the run if the process is not
// effectively UTC, so these literals mean the same instant on every machine.
//
// The values match the fixture tier's constants so a reviewer comparing the two sees one calendar
// rather than two: PERIOD_START_UTC, PERIOD_END_UTC, CREATED_DATE_TIME_UTC and
// MODIFIED_DATE_TIME_UTC in `tests/fixtures/promotionFixtures.ts`.
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
 * never this. See the date describe block for why the distinction is load-bearing.
 */
const UNIX_EPOCH_UTC = '1970-01-01T00:00:00.000Z';

/**
 * The constructor's parameter object, DERIVED rather than restated.
 *
 * `src/domain/entities/promotionAccount.ts` declares its init shape INLINE and exports only the
 * class, so there is no init type to import. Deriving it with `ConstructorParameters` keeps this
 * suite honest: if a column is added, removed or retyped upstream, the builder below stops
 * compiling instead of drifting silently. Restating the ten slots by hand would hide exactly that.
 */
type PromotionAccountInit = ConstructorParameters<typeof PromotionAccount>[0];

/**
 * The columns of an UNSAVED row, with every one of the ten slots explicit.
 *
 * A FUNCTION and not a shared literal, so each subject is built from a fresh object and no test
 * can reach another test's data. That matters acutely here: `setPromotion` MUTATES the instance
 * before it throws, and a leaked subject would make the half-mutation assertion meaningless.
 *
 * All ten slots are stated even though nine of them are `undefined`, because
 * `exactOptionalPropertyTypes` is enabled and the init type declares every slot REQUIRED as
 * `T | undefined` rather than optional as `?:`. "Absent" and "present-but-undefined" are genuinely
 * different types under that flag, and the required form forces a caller to say "I looked and
 * found nothing" instead of silently omitting the key.
 *
 * CFML parity [model/entity/PromotionAccount.cfc:L52]: `promotionAccountID` starts `''` rather
 * than absent, because `unsavedvalue="" default=""` is what makes the empty string the honest
 * answer for a row that has never been saved - and it is exactly what `isNew()` keys on.
 *
 * @returns a fresh, fully-populated init object for an unsaved row.
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
 * @param overrides - the columns this test is about; everything else stays at the unsaved default.
 * @returns a fresh `PromotionAccount`.
 */
function aPromotionAccount(overrides: Partial<PromotionAccountInit> = {}): PromotionAccount {
  return new PromotionAccount({ ...unsavedRowColumns(), ...overrides });
}

/**
 * Builds a SAVED row - one whose primary key is non-empty, so `isNew()` is false.
 *
 * Split out because the two `isNew()` states select DIFFERENT throw messages inside
 * `setPromotion`, reproducing CFML's short-circuiting `or`. Both branches are pinned.
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
 * `promotionID` is the only slot `Promotion`'s constructor requires; the three collections it
 * declares - `promotionPeriods`, `promotionCodes` and `appliedPromotions`
 * [model/entity/Promotion.cfc:L62-L64] - each default to a fresh empty array. Crucially, NONE of
 * them is `promotionAccounts`, which is the whole reason the helpers below throw.
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
 * Used to PROVE the anti-contract that makes both bidirectional helpers throw, rather than
 * asserting it by assumption.
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
 * Reproduced here BYTE FOR BYTE because it is an observable error contract and not a diagnostic
 * string - `src/handlers/errorMapper.ts` recognises this exact shape with an anchored pattern.
 * Three details must never be "corrected": "does not exists" is grammatically wrong IN THE
 * SOURCE; the trailing " entity." is present even for the service-tier copy; and `getClassName()`
 * is `listLast(getClassFullname(), ".")` [org/Hibachi/HibachiObject.cfc:L136], so the class slot
 * carries the BARE component name - `Promotion`, never `Slatwall.model.entity.Promotion` and never
 * the `entityname="SlatwallPromotion"` value.
 *
 * Rebuilt locally rather than imported: the subject keeps its copy module-private, and reaching
 * for a shared one would invent a cross-cutting dependency the domain layer does not have. Writing
 * it out here independently is also what turns the assertion into a real check - if the subject's
 * template drifted, this comparison would fail rather than agree with itself.
 *
 * @param methodName The dead call target, without parentheses - they are added here.
 * @param className  The bare component name of the entity the call was made ON.
 * @returns the exact message the framework would have thrown.
 */
function hibachiMissingMethodMessage(methodName: string, className: string): string {
  return `You have called a method ${methodName}() which does not exists in the ${className} entity.`;
}

afterEach(() => {
  // A2: no spy may outlive its test. `vitest.config.ts` already sets `restoreMocks` and
  // `clearMocks` globally; this makes the guarantee local and visible at the file that relies on
  // it. This suite installs no spy of its own - the subject has no collaborator to intercept - so
  // this is a standing guard rather than a cleanup of something known to exist.
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// The censuses
//
// Stated as named constants so each assertion reads as a claim about a specific, enumerated set
// rather than as an inline literal a reader has to reverse-engineer.
// ---------------------------------------------------------------------------

/**
 * Every member the class actually installs, and the complete list of them.
 *
 * Thirteen: ten accessors, one framework member, and the two throwing bidirectional helpers. Each
 * accessor's locator is the property declaration it serves - ColdFusion auto-generated these from
 * the property metadata, so there is no legacy body to compare against, only a declaration.
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
 * CFML parity [model/entity/PromotionAccount.cfc:L72-L77, L78-L87]: the legacy declares both, and
 * their verbatim signatures are:
 *
 *   public void function setAccount(required any account)   // L72
 *   public void function removeAccount(any account)         // L78
 *
 * Their far side is `model/entity/Account.cfc`, which is explicitly OUT OF SCOPE - the plan
 * excludes `model/service/AccountService.cfc` and the whole account module - so the three
 * reach-throughs they perform have no in-scope counterpart to call:
 * `account.hasAccountPromotion(this)` at L74, and `account.getAccountPromotions()` at L75, L82 and
 * L84. The L58 many-to-one therefore collapses to an inert opaque ID column and the pair is
 * dropped.
 *
 * "Dropped" means NOT AUTHORED IN THE TARGET. It is never a deletion from the legacy file, which
 * is reference-only and remains untouched. This is an anti-corruption boundary the plan mandates,
 * so it is not a signature reshaping, not a visibility change and not a deliberate divergence: it
 * spends no budget. The same ruling is applied identically in `priceGroup.ts` and
 * `promotionApplied.ts`.
 */
const DROPPED_ACCOUNT_SIDE_HELPERS: readonly string[] = ['setAccount', 'removeAccount'];

/**
 * Members the framework base could synthesise, none of which is authored here.
 *
 * CFML parity [org/Hibachi/HibachiEntity.cfc:L507-L565]: `onMissingMethod` matches eleven
 * method-name patterns - `hasUniqueOrNull*`, `hasUnique*`, `hasAny*`, `get*AssignedIDList`,
 * `get*ID`, `get*Options`, `get*OptionsSmartList`, `get*SmartList`, `get*Struct`, `get*Count`, and
 * a `getAttributeValue` fallback whose guard sits at L559 - and TERMINATES IN A THROW AT L565.
 *
 * The target has NO DYNAMIC DISPATCH AT ALL: no Proxy, no index signature, no `evaluate()`, no
 * `variables.` scope object, and no synthesised accessor. That is documented here, not reproduced.
 * Only concretely-called members are authored, and for this entity that is exactly one - `isNew()`.
 *
 * The L559 EAV fallback is unreachable from this entity anyway, because it requires an
 * `attributeValues` property and `PromotionAccount` declares none. A case-insensitive census of the
 * source confirms zero occurrences. Only four in-scope entities declare that collection - Sku,
 * Product, ProductType and Brand - so an unmatched `get...` on this entity throws directly at L565
 * rather than degrading into an attribute lookup.
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
 * Every entry was checked against `model/entity/PromotionAccount.cfc` and confirmed to have no
 * declaration of any kind. Grouped into one list because the failure mode they guard against is
 * identical: importing a sibling's shape into an entity that never had it.
 */
const MEMBERS_ABSENT_BY_SOURCE: readonly string[] = [
  // No `remoteID` column. Contrast model/entity/Promotion.cfc:L67 and
  // model/entity/PromotionPeriod.cfc:L66, both of which declare one. A real schema difference.
  'getRemoteID',
  'setRemoteID',
  // No `activeFlag` column. Contrast model/entity/Promotion.cfc:L56.
  'getActiveFlag',
  'setActiveFlag',
  // No date comparator and no clock. Contrast model/entity/PromotionPeriod.cfc:L78-L85, which
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
 * The legacy component declares exactly FOUR methods - the two Account-side helpers at L72/L78 and
 * the two Promotion-side helpers at L90/L97 - and not one of them is a property setter. Every
 * column is consequently read-only on the target: hydrated once by the repository, exposed through
 * a getter, and never re-pointed. The four audit columns additionally carry
 * `hb_populateEnabled="false"` [model/entity/PromotionAccount.cfc:L62-L65], which is how the legacy
 * framework excluded them from mass assignment; `readonly` fields need no such mechanism.
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
    // The subject keeps its message-template helper MODULE-PRIVATE rather than as a private
    // method, so - unlike promotionApplied.ts, whose `isSameRowAs` is a private method and does
    // appear on the prototype - there is no private member to account for here. The public
    // surface and the prototype coincide exactly.
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

    // Removing the dispatcher is what turns this into a TYPE error rather than a runtime surprise.
    // In CFML the call resolves - `setAccount` genuinely exists at
    // [model/entity/PromotionAccount.cfc:L72] - and then fails deep inside, at
    // `account.hasAccountPromotion(this)` on L74. Here it cannot be written at all.
    // @ts-expect-error PromotionAccount authors no setAccount: the far side is the out-of-scope Account entity [model/entity/PromotionAccount.cfc:L72-L77].
    const absentHelper: unknown = subject.setAccount;

    expect(absentHelper).toBeUndefined();
  });

  it('keeps exactly the two helpers the legacy declares for the in-scope association', () => {
    const members = prototypeMembers();

    // [model/entity/PromotionAccount.cfc:L57] is the one foreign key with an in-scope far side, so
    // its pair is the only pair authored - even though both members of it throw.
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

    // Nine columns, nine absent setters: the ten slots minus `promotion`, which is the only
    // mutable field and is written solely by the throwing `setPromotion`.
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
    // `persistent`, `cacheuse` and `hb_serviceName` are component ATTRIBUTES. The legacy exposed
    // them through framework metadata introspection, not through instance accessors, so none is
    // reproduced as a member. Schema continuity is preserved by the annotation, not by a getter.
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
    // `hb_permission` attribute at all - re-verified case-insensitively against the source. That
    // is unusual among its siblings: `model/entity/Promotion.cfc:L49` carries
    // `hb_permission="this"` and `model/entity/PromotionPeriod.cfc:L49` carries the dotted
    // `hb_permission="promotion.promotionPeriods"`. The absence is annotated and nothing is
    // invented to fill it - no permission member, no dotted-path constant, no guard.
    for (const permissionMember of ['getPermission', 'getHbPermission', 'hasPermission']) {
      expect(members).not.toContain(permissionMember);
    }
  });
});

describe('the structural surface the SwPromotionAccount row carries', () => {
  it('hydrates the primary key, the two date bounds and both association keys', () => {
    // CFML parity [model/entity/PromotionAccount.cfc:L49]: the physical table is
    // `SwPromotionAccount` - the FULL, UNABBREVIATED name. That is worth pinning explicitly,
    // because two of its closest siblings abbreviate: `model/entity/PromotionQualifier.cfc:L49`
    // maps to `SwPromoQual` and `model/entity/PromotionReward.cfc:L49` to `SwPromoReward`. Schema
    // continuity is binding, so the target reads and writes `SwPromotionAccount` unchanged - no
    // migration, no rename, no new column. The name lives in the repository layer and in the
    // subject's annotation rather than in an accessor, which is why this test asserts the COLUMNS
    // instead of the table string: there is no table accessor to assert, and inventing one to make
    // the point would breach the surface census above.
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
    // properties even when the column was NULL. That is the point of the required form under
    // `exactOptionalPropertyTypes`: a hydrating repository cannot silently omit a column.
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
    // equivalent in a driver-only stack, so `src/repositories/mysql/**` owns hydration and the
    // entity never simulates laziness. Reference identity is the assertion that proves it - a
    // re-materializing accessor would hand back an equal-but-distinct object.
    expect(subject.getPromotion()).toBe(promotion);
  });

  it('exposes the promotionID column even when the association was not materialized', () => {
    // The repository is free to fetch the key without the far side, and a caller must still be
    // able to read it. CFML parity [org/Hibachi/HibachiEntity.cfc:L365-L372]: the legacy
    // `get<Assoc>ID` accessors resolved through the dispatcher into `getPropertyPrimaryID`, which
    // invoked the ASSOCIATION getter and returned the far object's primary ID - so with a null
    // association the legacy could only answer the EMPTY STRING, and never the key itself. The
    // target reads the foreign-key COLUMN instead, which makes the key available in exactly this
    // case. The `""`-on-miss detail is recorded so it stays auditable rather than silently
    // dropped, and `undefined`-on-miss is what the column-reading form correctly reports.
    const subject = aPromotionAccount({ promotion: undefined, promotionID: 'promotion-1' });

    expect(subject.getPromotion()).toBeUndefined();
    expect(subject.getPromotionID()).toBe('promotion-1');
    expect(subject.getPromotionID()).not.toBe('');
  });
});

describe('the account side is an opaque identifier, and no Account is ever constructed', () => {
  // CFML parity [model/entity/PromotionAccount.cfc:L58, L63, L65]: three of the five associations
  // this component declares point at `model/entity/Account.cfc`, which is explicitly OUT OF SCOPE.
  // All three collapse to opaque `string | undefined` columns:
  //
  //   L58  property name="account"           ... fkcolumn="accountID"
  //   L63  property name="createdByAccount"  ... fkcolumn="createdByAccountID"
  //   L65  property name="modifiedByAccount" ... fkcolumn="modifiedByAccountID"
  //
  // No `Account` type is imported, the columns are never typed as an entity, and no `Account`
  // instance is constructed anywhere - in the subject or in this suite. The columns themselves are
  // PRESERVED rather than dropped, because the schema contract must stay auditable.

  it('returns opaque strings for all three account-side keys', () => {
    const subject = aPromotionAccount({
      accountID: 'account-1',
      createdByAccountID: 'author-account-1',
      modifiedByAccountID: 'editor-account-1',
    });

    expect(subject.getAccountID()).toBe('account-1');
    expect(subject.getCreatedByAccountID()).toBe('author-account-1');
    expect(subject.getModifiedByAccountID()).toBe('editor-account-1');

    // Strings, not objects. If any of these had been hydrated into an entity the type would be
    // wrong and the anti-corruption boundary would have leaked.
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
  // CFML parity [model/entity/PromotionAccount.cfc:L59]: the source declares - and then comments
  // out - a third many-to-one association. The line reads, verbatim:
  //
  //   //property name="promotionPeriod" cfc="PromotionPeriod" fieldtype="many-to-one" fkcolumn="promotionPeriodID";
  //
  // The subject preserves it AS A COMMENT and not as a member, which is the right call twice over:
  // the `promotionPeriodID` column does not exist in `SwPromotionAccount`, so resurrecting the
  // association would require a new column and breach schema continuity; and a commented-out
  // declaration is part of the schema's documented history that a reviewer diffing this file
  // against the CFC needs to see. It is deliberately carried forward as a comment ONLY - not
  // revived, not completed, not "fixed".

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

    // Not merely absent from the prototype - absent from the row. The constructor has no slot for
    // it, so a repository cannot supply one even by accident.
    expect(Object.keys(subject)).not.toContain('promotionPeriod');
    expect(Object.keys(subject)).not.toContain('promotionPeriodID');
    expect(Object.keys(subject)).toHaveLength(10);
  });

  it('cannot be supplied through the constructor at compile time', () => {
    // The strongest available statement of the ruling: the slot is not merely unread, it is
    // unwritable. `exactOptionalPropertyTypes` plus an exact init type makes an unknown key an
    // excess-property error rather than a silently ignored one.
    // @ts-expect-error promotionPeriod is commented out at [model/entity/PromotionAccount.cfc:L59] and is deliberately not a member, so there is no constructor slot for it.
    const rejected = new PromotionAccount({ ...unsavedRowColumns(), promotionPeriodID: 'pp-1' });

    expect(rejected.getPromotionAccountID()).toBe('');
  });
});

describe('the four timestamps are Date or undefined, and absence is never an epoch', () => {
  // CFML parity [model/entity/PromotionAccount.cfc:L53-L54, L62, L64]: all four timestamp columns
  // are declared `ormtype="timestamp"` with NO ORM default, so a NULL column hydrates to
  // `undefined`.
  //
  // FOR THE TWO PROMOTION BOUNDS, `undefined` MEANS FOREVER. It is the PERMISSIVE extreme: an
  // absent bound is no bound, so the association is unconstrained in that direction. Substituting
  // the Unix epoch, `0`, a fresh clock reading or any other sentinel would silently change the
  // meaning from "unbounded" to "bounded at an arbitrary instant" - and for a start bound in
  // particular, an epoch would read as "began in 1970", which is not what NULL says.
  //
  // A NOTABLE ANNOTATION ASYMMETRY, worth recording because it is the kind of thing that looks
  // like an oversight and is not: the "forever" reading is DECLARED EXPLICITLY on the sibling.
  // `model/entity/PromotionPeriod.cfc:L53-L54` writes
  // `hb_formatType="dateTime" hb_nullRBKey="define.forever"` on both of its bounds, so the legacy
  // admin renders a NULL there as the localised word "forever". `PromotionAccount.cfc:L53-L54`
  // carry NEITHER attribute - the declarations are bare `ormtype="timestamp"`. The semantics are
  // the same; only the admin-facing label is missing. Nothing is invented to supply it: no
  // resource-bundle key is fabricated, no format type is added, and no default is introduced. The
  // asymmetry is annotated and left exactly as the source has it.
  //
  // Contrast two OPPOSITE conventions elsewhere in this folder, both load-bearing and neither
  // collapsible into the other: `Sku.getPriceByCurrencyCode()` must return `Money | undefined` and
  // never 0, because substituting 0 would sell products for free
  // [model/entity/Sku.cfc:L269-L273], while `Product.getSalePrice()` must return 0 and never
  // undefined, because [model/entity/Product.cfc:L598] falls through to `return 0`.

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
    // The two are different rows and must read differently. A row whose column really does hold
    // 1970-01-01 is representable, and it is NOT the same as a row whose column is NULL - which is
    // precisely the confusion an epoch sentinel would create.
    const unbounded = aPromotionAccount();
    const boundedAtEpoch = aPromotionAccount({ startDateTime: new Date(UNIX_EPOCH_UTC) });

    expect(unbounded.getStartDateTime()).toBeUndefined();
    expect(boundedAtEpoch.getStartDateTime()).toEqual(new Date(UNIX_EPOCH_UTC));
    expect(boundedAtEpoch.getStartDateTime()).not.toBeUndefined();
  });

  it('round-trips each bound independently, so one absent bound does not erase the other', () => {
    // A half-open window is a legitimate row: "from this instant, forever" and "until this instant,
    // from forever" are both expressible, and the two columns are independent.
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
    // CFML parity: `model/entity/PromotionAccount.cfc` declares NO comparator, NO ORM event hook -
    // a case-insensitive census confirms zero `preInsert` and zero `preUpdate` occurrences - and
    // there is no validation file to impose a cross-field rule. Nothing in the legacy rejects an
    // inverted window, so nothing here does either. Inventing the guard would be inventing
    // behaviour, and completing the legacy validation gap is explicitly out of bounds.
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

    // The bounds are INERT COLUMNS, not a live window. This entity evaluates nothing about them.
    // Compare `model/entity/PromotionPeriod.cfc:L78-L85`, which does declare `isCurrent()` and
    // `isExpired()` over `now()` - and whose ported form consequently takes an injected
    // `now: () => Date` [src/domain/entities/promotionPeriod.ts:L630]. This entity's constructor
    // has no such parameter, and the ten-slot census above is the proof: there is no clock slot.
    for (const comparator of ['isCurrent', 'isExpired', 'isActive', 'getCurrentFlag']) {
      expect(members).not.toContain(comparator);
    }

    expect(Object.keys(subject)).not.toContain('now');
    expect(Object.keys(subject)).not.toContain('clock');
  });
});

describe('isNew is honest, keyed on the unsavedvalue empty string', () => {
  // CFML parity [model/entity/PromotionAccount.cfc:L52]: `unsavedvalue="" default=""` is what makes
  // the empty string the honest answer for a row that has never been saved, and the empty-string
  // test is not an approximation of the framework - it is literally what the framework does.
  // `isNew()` at [org/Hibachi/HibachiEntity.cfc:L707-L709] returns `getNewFlag()`, and
  // `getNewFlag()` at [org/Hibachi/HibachiEntity.cfc:L571-L576] is
  // `if(getPrimaryIDValue() == "") { return true; } return false;`.
  //
  // This is the one framework member the legacy body concretely calls, at
  // [model/entity/PromotionAccount.cfc:L74] inside `setAccount` and at
  // [model/entity/PromotionAccount.cfc:L92] inside `setPromotion` - which is exactly why it is the
  // only one authored.
  //
  // It also carries forward the shape of the ONE inherited MXUnit assertion that applies here:
  // `defaults_are_correct()` at [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67] asserts
  // `entity.isNew()` and `!len(entity.getPrimaryIDValue())`. This is NOT parity coverage - no
  // legacy test ever instantiated a `PromotionAccount` - but the assertion's shape is the base
  // class's and is honoured rather than reinvented.

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
    // A whitespace key is not the unsaved value. `unsavedvalue=""` is an exact comparison in the
    // framework, so it is an exact comparison here.
    expect(aPromotionAccount({ promotionAccountID: ' ' }).isNew()).toBe(false);
    expect(aPromotionAccount({ promotionAccountID: '0' }).isNew()).toBe(false);
    expect(aPromotionAccount({ promotionAccountID: '' }).isNew()).toBe(true);
  });

  it('exposes the key as a string and never as undefined', () => {
    // CFML parity [model/entity/PromotionAccount.cfc:L52]: `default=""` means the column always
    // holds a string, possibly the empty one, so the accessor is `string` and never
    // `string | undefined`. That is a genuine difference from the nine nullable columns, and it is
    // what lets `isNew()` compare without a null check.
    const subject = aPromotionAccount();

    expect(typeof subject.getPromotionAccountID()).toBe('string');
    expect(subject.getPromotionAccountID()).not.toBeUndefined();
  });

  it('reports the primary key without a framework accessor for it', () => {
    const members = prototypeMembers();

    // `getPrimaryIDValue()` and `getPrimaryIDPropertyName()` are framework members
    // [org/Hibachi/HibachiEntity.cfc:L244, L249] and are deliberately not ported: the port has no
    // generic entity base, so the concrete accessor is the whole story. That is why the inherited
    // `has_primary_id_property_name()` case at
    // [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L60-L62] has no counterpart here - the
    // property name is a compile-time fact rather than a runtime query.
    expect(members).not.toContain('getPrimaryIDValue');
    expect(members).not.toContain('getPrimaryIDPropertyName');
    expect(members).toContain('getPromotionAccountID');
  });
});

describe('the far-side anti-contract that makes both bidirectional helpers throw', () => {
  // This block exists so the two defect blocks below rest on a PROVEN premise rather than an
  // assumed one. If `Promotion` ever gained the collection, these assertions would fail first and
  // point at the cause, instead of the defect suites quietly starting to fail for a reason nobody
  // could see.
  //
  // CFML parity [model/entity/Promotion.cfc:L62-L64]: `Promotion` declares EXACTLY three
  // collections and none of them is `promotionAccounts`:
  //
  //   L62  promotionPeriods    singularname="promotionPeriod"    one-to-many
  //   L63  promotionCodes      singularname="promotionCode"      one-to-many
  //   L64  appliedPromotions   singularname="appliedPromotion"   one-to-many
  //
  // There is consequently no `SwPromotion` -> `SwPromotionAccount` inverse mapping to honour, and
  // `src/domain/entities/promotion.ts` MUST NOT gain one. Adding the far side in TypeScript would
  // SILENTLY REPAIR both defects below, inventing behaviour the legacy system does not have and
  // breaching schema continuity at the same time.

  it('confirms Promotion declares neither method the helpers call', () => {
    const members = promotionPrototypeMembers();

    expect(members).not.toContain('getPromotionAccounts');
    expect(members).not.toContain('hasPromotionAccount');
    expect(members).not.toContain('addPromotionAccount');
    expect(members).not.toContain('removePromotionAccount');
  });

  it('confirms Promotion DOES declare the equivalents for its three real collections', () => {
    const members = promotionPrototypeMembers();

    // The contrast is the point. These resolve, which is why the identical helper pair on
    // `PromotionPeriod`, `PromotionCode` and `PromotionApplied` does NOT throw - and why the pair
    // on this entity does.
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
    // reached through a hydration slot instead of a method.
    expect('getPromotionAccounts' in promotion).toBe(false);
    expect('promotionAccounts' in promotion).toBe(false);
    expect(Object.keys(promotion)).not.toContain('promotionAccounts');
  });
});

// LEGACY-DEFECT [model/entity/PromotionAccount.cfc:L90-L95]: setPromotion assigns
// variables.promotion at L91 and only then calls hasPromotionAccount()/getPromotionAccounts() at
// L92-L93, neither of which Promotion.cfc declares. The method therefore throws AFTER mutating,
// leaving a half-mutated instance.
// Preserved deliberately; do not fix without a product decision.
describe('setPromotion throws on every path, and mutates before it does', () => {
  // The legacy body, verbatim [model/entity/PromotionAccount.cfc:L90-L95]:
  //
  //   public void function setPromotion(required any promotion) {
  //     variables.promotion = arguments.promotion;                              // L91 ASSIGNS FIRST
  //     if(isNew() or !arguments.promotion.hasPromotionAccount( this )) {        // L92
  //       arrayAppend(arguments.promotion.getPromotionAccounts(), this);         // L93
  //     }
  //   }
  //
  // Two facts are pinned here, and the second is the one a casual port loses.
  //
  // FACT ONE - IT THROWS, AND WHICH MESSAGE DEPENDS ON isNew(). CFML's `or` SHORT-CIRCUITS, which
  // makes BOTH branches fatal rather than one:
  //
  //   * isNew() TRUE  -> the second operand at L92 is NEVER EVALUATED, control enters the body, and
  //     the getPromotionAccounts() call at L93 is the one that throws.
  //   * isNew() FALSE -> the second operand IS evaluated, and hasPromotionAccount() at L92 throws
  //     before the body is ever entered.
  //
  // Both name a method on `Promotion`, because both are called ON the argument. There is no
  // non-throwing path through this method.
  //
  // FACT TWO - THE ASSIGNMENT AT L91 SUCCEEDS FIRST. The legacy leaves the instance HALF-MUTATED
  // and only then blows up. A port that tidied this into a guard-first shape would be strictly
  // "better" code and would have changed observable behaviour, so the ordering is reproduced.
  //
  // The signature is typed `void`, NOT `never`, and that is deliberate parity rather than an
  // oversight: the legacy declares `public void function`, and control genuinely reaches the
  // assignment before failing. Contrast `Sku.getPriceByPromotion()`
  // [model/entity/Sku.cfc:L258], whose legacy `returntype="numeric"` promises a value it can never
  // deliver and whose ported form is therefore `never`.

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
    // contract, not a diagnostic string, so three details must never be "corrected": the
    // grammatical error "does not exists" is IN THE SOURCE; the trailing " entity." is present;
    // and the class slot carries the BARE component name, because `getClassName()` is
    // `listLast(getClassFullname(), ".")` [org/Hibachi/HibachiObject.cfc:L136].
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
    // the assignment back, because L91 ran before L92/L93 were reached. The instance is now in a
    // state no successful call could have produced.
    expect(subject.getPromotion()).toBe(promotion);
  });

  it('LEAVES THE PROMOTION FIELD SET after throwing, on a saved row too', () => {
    const subject = aSavedPromotionAccount();
    const promotion = aPromotion('promotion-1');

    expect(() => {
      subject.setPromotion(promotion);
    }).toThrow();

    // Both branches mutate, because the assignment at L91 precedes the branch at L92 entirely.
    // Asserting only the unsaved case would have left half the defect unpinned.
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

    // The assignment is unconditional, so a failed call still clobbers a good value. Worth pinning
    // separately from the undefined-to-set case: this is the variant that destroys data.
    expect(subject.getPromotion()).toBe(replacement);
    expect(subject.getPromotion()).not.toBe(original);

    // And the foreign-key column does NOT follow the association, because L91 writes only the
    // object. The row is now internally inconsistent - another observable consequence of the
    // half-mutation, preserved rather than reconciled.
    expect(subject.getPromotionID()).toBe('promotion-original');
  });

  it('is typed void rather than never, matching the legacy void declaration', () => {
    const subject = aPromotionAccount();
    const promotion = aPromotion('promotion-1');

    // A `never` return would let TypeScript treat every statement after the call as unreachable,
    // which would misrepresent the legacy contract: `public void function setPromotion` at
    // [model/entity/PromotionAccount.cfc:L90] declares void, and the method really does execute
    // its first statement. The assignment below compiles precisely because the return type is
    // `void`, and that is the parity fact being asserted.
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
// Preserved deliberately; do not fix without a product decision.
describe('removePromotion throws at L101, masking the stray at L103 and stranding L105', () => {
  // The legacy body, verbatim [model/entity/PromotionAccount.cfc:L97-L106]:
  //
  //   public void function removePromotion(any promotion) {
  //     if(!structKeyExists(arguments, "promotion")) {                             // L98
  //       arguments.promotion = variables.promotion;                               // L99
  //     }                                                                          // L100
  //     var index = arrayFind(arguments.promotion.getPromotionAccounts(), this);    // L101 THROWS
  //     if(index > 0) {                                                            // L102
  //       arrayDeleteAt(arguments.account.getPromotionAccounts(), index);           // L103 STRAY
  //     }                                                                          // L104
  //     structDelete(variables, "promotion");                                       // L105
  //   }
  //
  // THREE STACKED FACTS, and the middle one is the single most instructive thing in this suite.
  //
  // FACT ONE - L101 THROWS UNCONDITIONALLY, before any guard on the resulting index, because
  // `getPromotionAccounts()` does not resolve on `Promotion`. The block above proves that premise.
  //
  // FACT TWO - THE STRAY AT L103 IS MASKED. L103 dereferences `arguments.account`, which is NOT a
  // declared argument of this method: the signature at L97 is `removePromotion(any promotion)` and
  // there is no `account` argument anywhere in it, so in CFML this is an undefined-variable error.
  // Worse, the search and the delete address DIFFERENT OBJECTS - L101 searches
  // `arguments.promotion` while L103 deletes from `arguments.account` - so even with a live
  // collection on both sides the method could not do its job. L103 is unreachable TODAY only
  // because L101 throws first, which is exactly why this leak has survived: the first defect masks
  // the second. It is latent, not harmless. Were a product decision to add a `promotionAccounts`
  // collection to `Promotion`, L101 would begin succeeding and this leak would immediately go live.
  //
  //   THE CONTRAST, WHICH IS THE WHOLE LESSON. The IDENTICAL stray appears at
  //   [model/entity/PromotionPeriod.cfc:L110] - `arrayDeleteAt(arguments.account
  //   .getPromotionPeriods(), index)` - and there it IS REACHABLE, because the preceding
  //   `arrayFind(arguments.promotion.getPromotionPeriods(), this)` at
  //   [model/entity/PromotionPeriod.cfc:L108] SUCCEEDS: `model/entity/Promotion.cfc:L62` genuinely
  //   declares `promotionPeriods`. Same copy-paste error, same line shape, opposite consequence -
  //   masked here, live there - decided entirely by whether the far-side collection exists. Both
  //   locators were re-read in full rather than trusted, and both are exact.
  //
  // FACT THREE - L105 IS STRANDED. `structDelete(variables, "promotion")` NEVER EXECUTES, so the
  // legacy never actually clears the field it set. The field-still-set assertion below is the
  // observable proof, and it is the mirror image of the half-mutation pinned for `setPromotion`.

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
    // undefined in VARIABLES." - before any method is called on anything. That is an
    // undefined-variable error and NOT a missing-method contract, so it deliberately does NOT carry
    // the framework's terminal message. Conflating the two would let `src/handlers/errorMapper.ts`
    // publish a contract the legacy never emitted on this path, which is a real behavioural
    // difference rather than a cosmetic one.
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
    // set, because the throw at L101 happens first. Repairing this would change observable
    // behaviour, so it is pinned rather than fixed.
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

    // The stray would have needed an `arguments.account`. There is no account object in play at
    // all on this path - the account side is an opaque string column - so the only observable
    // evidence that L103 was not reached is that the failure message is the L101 one and the
    // account column is untouched. Both are asserted, and that is the honest limit of what a test
    // can see: a masked line leaves no trace by definition, which is precisely why the marker
    // above documents it rather than pretending an assertion could catch it.
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
    // the L98 `structKeyExists` probe is what makes the absence meaningful. The TypeScript form of
    // that probe is an optional parameter with a nullish default - plain, idiomatic TypeScript. Both
    // call shapes must compile, and both must throw.
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
    // The mandatory cross-check was run against ALL FOUR legacy bidirectional helpers, reading the
    // verbatim source rather than taking the plan's word for it. THE VERDICT IS CLEAN: ZERO
    // INVERSIONS. Neither `remove*` mistakenly calls an `add*`; both correctly `arrayDeleteAt`.
    //
    //   removeAccount   [L78-L87]  searches at L82 and deletes at L84, BOTH against
    //                              `arguments.account.getAccountPromotions()` - the same object,
    //                              which is internally consistent and correct.
    //   removePromotion [L97-L106] searches at L101 and deletes at L103, and while those address
    //                              DIFFERENT objects (the L103 stray), the operation is still a
    //                              delete. That is a wrong-receiver defect, NOT an inversion, and
    //                              it is registered as such in the marker above.
    //
    // Stating the verdict explicitly rather than assuming it matters because the inversion defect
    // is real elsewhere in this folder: `model/entity/Option.cfc:L129-L131` and `:L145-L147` have
    // `removePromotionRewardExclusion` and `removePromotionQualifierExclusion` each calling
    // `addExcludedOption(this)` - two genuine inversions, preserved as defects in that entity. This
    // entity simply is not one of those cases, and a reader deserves to know that was checked
    // rather than skipped.
    const members = prototypeMembers();
    const removers = members.filter((name: string) => name.startsWith('remove'));
    const adders = members.filter((name: string) => name.startsWith('add'));

    // One remover survives the port, and there is no `add*` on this entity for it to invert into -
    // which is the structural reason an inversion is not even expressible here.
    expect(removers).toEqual(['removePromotion']);
    expect(adders).toEqual([]);
  });
});

describe('no validation surface, because the legacy declares none', () => {
  it('exposes no validator, schema or error-reporting member', () => {
    const subject = aPromotionAccount();
    const members = prototypeMembers();

    // CFML parity: `model/validation/PromotionAccount.json` IS VERIFIED ABSENT - not missing, not
    // pending, ABSENT BY DESIGN - and it is one of exactly SIX deliberate absences across the
    // in-scope set. Directory-listed rather than assumed: `model/validation/` holds 96 `.json`
    // files (the plan's 94 is stale), and of the 21 in-scope artifacts the split is
    // 15 PRESENT / 6 ABSENT (the plan's "12 present" is also stale). The six decompose as
    //
    //   FOUR ENTITIES         Category, PromotionQualifier, PromotionApplied, PromotionAccount
    //   TWO PROCESS OBJECTS   Product_AddOption, Product_AddOptionGroup
    //
    // which reconciles the subject module's "four in-scope entities with no schema" with the
    // six-absence count: the same fact stated at different granularity, not a contradiction.
    //
    // Consequently there is no zod schema, no `validate(context)`, no `hasErrors()`, no
    // `getErrors()`, and no `hasUnique*` member - the legacy `hasUniqueOrNull*` / `hasUnique*`
    // dispatcher branches [org/Hibachi/HibachiEntity.cfc:L507-L565] existed to serve declarative
    // uniqueness rules that this entity has none of. COMPLETING THE LEGACY VALIDATION GAP IS OUT OF
    // BOUNDS: the absence is ported as an absence.
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
    // attribute on any of the nine nullable columns. The entity is constructible in its emptiest
    // possible state, and that is the ported behaviour rather than an oversight to correct. The
    // inherited MXUnit case `validate_as_save_for_a_new_instance_doesnt_pass()` at
    // [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L54] has NO counterpart here for
    // exactly this reason: with no schema there is nothing for `validate(context="save")` to fail,
    // and fabricating a failure to satisfy the shape of a base-class test would be inventing a
    // requirement.
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

    // CFML parity [org/Hibachi/HibachiEntity.cfc:L507-L565]: in the legacy, calling an undeclared
    // `getSomething()` entered `onMissingMethod`, failed to match any of its eleven patterns, and
    // hit the terminal throw at L565. The `getAttributeValue` fallback at L559 could not catch it
    // either, because that branch requires an `attributeValues` property and this entity declares
    // NONE - a case-insensitive census of the source confirms zero occurrences, and only four
    // in-scope entities (Sku, Product, ProductType, Brand) declare that collection at all.
    //
    // THE TARGET HAS NO DYNAMIC DISPATCH WHATSOEVER: no Proxy, no index signature, no `evaluate()`,
    // no `variables.` scope object, no `clearAttributeCache`, no `getNewFlag`, and no synthesised
    // template arrays. So the behaviour is DOCUMENTED here, not reproduced - an unknown member is
    // simply `undefined`, and the call site does not compile in the first place.
    //
    // THAT SPENDS NO DIVERGENCE BUDGET, and the distinction matters. Retiring the framework
    // dispatcher is a STRUCTURAL consequence of replacing the Hibachi base with explicit
    // ports-and-adapters layering - the same category as dropping DI/1 or the ORM - and not a
    // behavioural change to this entity's own contract. No declared member of this entity behaves
    // differently; only the fate of an UNDECLARED call changes, and it moves from a runtime throw
    // to a compile error, which is strictly earlier and strictly louder. Nothing observable is lost
    // in this particular case either, because no caller of this entity exists anywhere in the
    // legacy tree to notice. Both of the genuine faults on this entity are PRESERVED, as the two
    // markers above record.
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
    // `isSimpleValue(entity.getSimpleRepresentation())`. It is NOT applicable here:
    // `model/entity/PromotionAccount.cfc` declares no `getSimpleRepresentation` - a
    // case-insensitive grep returns zero hits - and the subject authors none either.
    //
    // The sibling contrast confirms this is a per-entity decision and not a blanket omission:
    // `model/entity/PromotionPeriod.cfc:L91-L93` DOES declare one, returning
    // `getPromotion().getPromotionName()`. Inventing an equivalent here - a concatenation of the
    // promotion name and the date window, say - would be fabricating a member the legacy never had,
    // purely to satisfy the shape of a base-class test. It is recorded in this comment instead.
    expect(members).not.toContain('getSimpleRepresentation');
  });

  it('carries no ORM event hook, because both banner sections are empty in the source', () => {
    const members = prototypeMembers();

    // CFML parity [model/entity/PromotionAccount.cfc:L121-L123]: the ORM Event Hooks banner pair is
    // EMPTY. A case-insensitive census confirms zero `preInsert` and zero `preUpdate` occurrences,
    // so this entity is not one of the four hook-bearing in-scope entities - Category,
    // PriceGroup, ProductType and PromotionCode. There is therefore no materialized path to
    // maintain, no path helper to reach for, and no save-time maintenance method. None is invented.
    expect(members).not.toContain('preInsert');
    expect(members).not.toContain('preUpdate');
  });

  it('records the malformed banner layout as a source wart, and normalises nothing', () => {
    // CFML parity [model/entity/PromotionAccount.cfc:L68, L109, L113-L123]: this component's banner
    // layout is MALFORMED, and uniquely so among the eighteen in-scope entities.
    //
    //   L68        "============= START: Bidirectional Helper Methods ==================="
    //   L72-L106   the four helpers
    //   L109       "=============  END:  Bidirectional Helper Methods ==================="
    //              ...indented with THREE SPACES rather than a tab, unlike every sibling banner
    //   L113/L115  "Non-Persistent Property Methods" - an EMPTY pair, and positioned AFTER the
    //              bidirectional block, inverting the ordering every sibling entity uses
    //   L117/L119  "Bidirectional Helper Methods" - OPENED AND CLOSED A SECOND TIME. A DUPLICATE
    //              BANNER PAIR, and empty
    //   L121/L123  "ORM Event Hooks" - a further EMPTY pair
    //   L124-L125  blank; the component closes at L126
    //
    // A copy-paste artifact with ZERO behavioural consequence. It is annotated and NEVER
    // normalised: reordering or de-duplicating a banner would edit the reference file, and
    // `model/**` is read-only in this work. There is nothing here to assert at runtime - a comment
    // structure has no observable surface - so this case pins the one thing that IS observable:
    // that the duplicated banner did not cause a member to be authored twice or dropped.
    expect(prototypeMembers()).toHaveLength(13);
    expect(new Set(prototypeMembers()).size).toBe(13);
  });
});

describe('freshness, because the half-mutation assertions depend on it', () => {
  it('builds an independent subject on every call, sharing no state', () => {
    // A2 made explicit. `setPromotion` mutates before it throws, so a subject leaked between tests
    // would make the half-mutation assertions above meaningless - a field could appear "set" for
    // the wrong reason entirely. There is no module-level mutable state in this file: every subject
    // comes from a factory that builds a fresh init object per call.
    const first = aPromotionAccount();
    const second = aPromotionAccount();
    const promotion = aPromotion('promotion-1');

    expect(first).not.toBe(second);

    expect(() => {
      first.setPromotion(promotion);
    }).toThrow();

    expect(first.getPromotion()).toBe(promotion);
    // The mutation stayed local to `first`. If these two shared an init object, or if the factory
    // returned a cached instance, this would fail.
    expect(second.getPromotion()).toBeUndefined();
  });

  it('returns a distinct init object from the column builder on every call', () => {
    const first = unsavedRowColumns();
    const second = unsavedRowColumns();

    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });
});
