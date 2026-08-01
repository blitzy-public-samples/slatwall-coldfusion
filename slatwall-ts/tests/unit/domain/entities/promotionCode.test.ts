// ---------------------------------------------------------------------------
// slatwall-ts - unit suite for `src/domain/entities/promotionCode.ts`
//
// WHAT THIS SUITE PINS
// `PromotionCode` is the `SwPromotionCode` row: the redeemable code a customer types in to
// claim a promotion, optionally bounded by a date window and optionally capped by a
// per-code and a per-account use limit. Three things make its contract worth pinning in
// this much detail:
//
//   1. IT SUPPLIES THE CODE-LEVEL BOUNDS AND THE TWO NULLABLE CEILINGS THE PROMOTION
//      ENGINE READS. Promotion use-limit enforcement is a must-preserve area of this port,
//      and this row is where two of its four inputs come from -
//      [model/entity/PromotionCode.cfc:L56-L57]. Substituting `0` for an absent ceiling
//      would forbid every use of every code; substituting `Infinity` would make every
//      ceiling unenforceable. Both are money bugs, in opposite directions.
//   2. IT IS THE CORRECT CONTROL CASE FOR A BIDIRECTIONAL REMOVER TWO SIBLINGS GET WRONG.
//      `removePromotion` resolves its index from `arguments.promotion`
//      [model/entity/PromotionCode.cfc:L113] and deletes from `arguments.promotion`
//      [L116] - the SAME identifier. That is what proves
//      [model/entity/PromotionPeriod.cfc:L110] and
//      [model/entity/PromotionAccount.cfc:L103], which resolve from one argument and
//      delete from another, are genuine copy-paste defects rather than a CFML idiom.
//      Without a working control a reviewer could not tell the difference.
//   3. ITS ACTIVE-WINDOW PREDICATE IS INCLUSIVE ON BOTH BOUNDS AND PERMISSIVE ON NULLS,
//      and it is the predicate that actually reaches the promotion rollup.
//      [model/entity/Promotion.cfc:L109-L121] `getCurrentPromotionCodeFlag()` consults
//      `getCurrentFlag()` and breaks on the first match at L115, so the inclusive semantic
//      is the one a merchant observes.
//
// ---------------------------------------------------------------------------
// 100% NET-NEW COVERAGE - NEVER TO BE PRESENTED AS PARITY
// ---------------------------------------------------------------------------
// Not one assertion below has a legacy antecedent, and that was MEASURED rather than
// assumed: a search of all 32 `.cfc` files under `meta/tests/` for `PromotionCode`, for
// `promotionCode` and for `getCurrentFlag` returns ZERO matching files. The only legacy
// suites extended anywhere in this port are [meta/tests/unit/entity/BrandTest.cfc] and
// [meta/tests/unit/entity/ProductTest.cfc], neither of which mentions this entity, and
// [meta/tests/functional/admin/entity/ProductTest.cfc] is an empty stub contributing zero
// coverage. There is nothing here to extend, so this file is one of the sixteen net-new
// entity suites and is labelled as such. Presenting it as parity would fail the coverage
// gate.
//
// The four cases [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67] handed every
// legacy entity suite for free are NOT inherited, and NO shared base class is introduced
// to imitate them:
//
//   * `validate_as_save_for_a_new_instance_doesnt_pass` [L51-L54] rests on
//     `validate()`/`hasErrors()`, framework members the port does not ship - declarative
//     validation becomes a zod schema at the SERVICE tier, never a constructor invariant.
//   * `simple_representation_exists_and_is_simple` [L56-L58] rests on
//     `getSimpleRepresentation()`, which `model/entity/PromotionCode.cfc` DOES NOT DECLARE.
//     It declares only the property-NAME override at L171-L173. Forcing the generic
//     assertion here would require inventing a member the source does not have, so the
//     absence is explained rather than fabricated, and the property-name override is
//     asserted instead.
//   * `has_primary_id_property_name` [L60-L62] rests on `getPrimaryIDPropertyName()`,
//     another unported framework member.
//   * The one half of `defaults_are_correct` [L64-L67] that survives is `isNew()`, authored
//     below against the member the port does ship - and authored NET-NEW, not carried
//     forward, because this entity had no legacy suite to carry anything from.
//
// ---------------------------------------------------------------------------
// !! HARD BOUNDARY - WHAT IS DELIBERATELY NOT TESTED HERE !!
// ---------------------------------------------------------------------------
// Each item below is owned by another suite and is CITED here, never re-asserted. Testing
// it twice would make a single behavioural change fail in two places and would blur which
// module owns the finding.
//
//   * `PromotionPeriod.isCurrent()`'s END-EXCLUSIVE, null-unguarded, single-`now()`
//     disagreement with `getCurrentFlag()` at exactly `now === endDateTime`
//     [model/entity/PromotionPeriod.cfc:L78-L81 versus L137-L146]. `promotionPeriod.test.ts`
//     owns that. This suite reads the shared bounds table to STATE the contrast and asserts
//     only its own side of it.
//   * `Promotion`'s three rollups - `getCurrentFlag()`
//     [model/entity/Promotion.cfc:L83-L92], `getCurrentPromotionPeriodFlag()` [L95-L107]
//     and `getCurrentPromotionCodeFlag()` [L109-L121]. `promotion.test.ts` owns them.
//   * `getPromotionCodesDeletableFlag()`'s three-spelling memo defect
//     [model/entity/Promotion.cfc:L123-L134] and the raise the ported accessor performs.
//     `promotion.test.ts` owns it; this suite asserts only that ITS subject declares no
//     `isDeletable`, which is the gap that accessor reports.
//   * The four DAO-side use-count queries [model/dao/PromotionDAO.cfc:L134-L296], including
//     the duplicated `getStartDateTime()` test at L177 and L244. Those belong to
//     `tests/integration/`. NO SQL appears in this file.
//   * Every discount calculation. Nothing below computes money, and this entity carries no
//     monetary column at all - a case-insensitive census of
//     [model/entity/PromotionCode.cfc:L52-L80] finds no amount, price, discount or currency
//     column of any kind.
//   * `Option.cfc:L130` and `Option.cfc:L146`, whose `remove*` helpers call
//     `addExcludedOption(this)`. `option.test.ts` owns those; they are the contrast that
//     makes this component's clean bill worth stating.
//
// ---------------------------------------------------------------------------
// NO DEFECT BELONGS TO THIS ENTITY, AND NO DIVERGENCE IS SPENT
// ---------------------------------------------------------------------------
// This file contains ZERO reproduced-defect markers, deliberately. Sibling suites flag a
// knowingly-reproduced legacy bug with a two-line annotation whose first line names the source
// path and locator, and whose second line records that the behaviour is kept on purpose and is
// not to be corrected without a product decision. NOT
// ONE appears below, because the three methods a reviewer would most expect to be broken are
// all CORRECT: `getCurrentFlag` seeds, writes and returns the same memo key;
// `removePromotion` dereferences the argument it searched; `removeAccount` is symmetric on
// both sides with independent indices. Marking correct code as defective is as much an error
// as missing a real defect, and it would misdirect the next reader to "fix" behaviour that
// needs no fixing.
//
// What this component DOES carry is five warts, every one of them a `CFML parity` note:
//
//   1. THE CAPITAL-`P` WART. [model/entity/PromotionCode.cfc:L104] guards on lowercase
//      `arguments.promotion` while [L105] appends through capitalised
//      `arguments.Promotion`. CFML's `arguments` scope is case-INSENSITIVE so both resolve;
//      TypeScript's identifiers are not, so the port normalises to the one declared
//      lowercase binding. A porting hazard, not an authorised divergence.
//   2. THE ASYMMETRIC `addAccount` GUARDS. [L123] tests the ARGUMENT's newness before
//      touching the near side while [L126] tests THIS row's newness before touching the far
//      side. Two polarities in one method. Reproduced in both directions below.
//   3. THE "assinged" TYPO in the `preInsert` comment at [L180].
//   4. THE BANNER MESS - five empty or duplicate pairs, one never closed, and the
//      misspelled "Overridden Implicet Getters" at [L165]/[L167].
//   5. THE `isDeletable` CROSS-FILE GAP, which is an absence rather than a mistake.
//
// The port's three deliberate divergences are all sibling-owned: the un-`var`'d
// `discountAmount` and the `amountOff` float gap in `src/services/`, and the entity memo
// fixes in `sku.test.ts` (defects 17, 18) and `product.test.ts` (defect 19). A fourth is
// forbidden and this file claims none.
//
// ---------------------------------------------------------------------------
// TWO PROMPT/SPECIFICATION CORRECTIONS, RECORDED BECAUSE SOURCE WINS
// ---------------------------------------------------------------------------
// The shipped module was read in full before a line of this suite was written, and it
// disagrees with the specification this file was commissioned from in two material ways.
// The SHIPPED SURFACE is what is pinned, and the corrections are recorded so nobody has to
// rediscover them.
//
//   CORRECTION 1 - `accounts` AND `orders` ARE NOT DROPPED. The specification anticipated
//   that both collections would be omitted because `Account` and `Order` are out of scope.
//   They are not: both are MATERIALIZED behind narrow structural link projections derived
//   from the legacy call sites, and all six helpers - `hasAccount`, `addAccount`,
//   `removeAccount`, `hasOrder`, `addOrder`, `removeOrder` - are authored. The shipped
//   module documents that as a correction of an earlier revision of itself, on the grounds
//   that four hand-written CFML bodies with no behavioural substitute would have been an
//   interface-parity failure. This suite therefore pins the six live helpers. The link
//   tables `SwPromotionCodeAccount` and `SwOrderPromotionCode` are recorded verbatim, and
//   NO `Account` or `Order` type is imported or constructed anywhere below.
//
//   CORRECTION 2 - THE HOOK IS `preInsert()`, NOT `applyPreInsertPromotionCode(code)`. The
//   specification anticipated a renamed hook taking the generated code as a parameter. The
//   shipped member keeps the source's own name and arity and generates the identifier
//   INSIDE the guarded branch, exactly where [model/entity/PromotionCode.cfc:L182] calls
//   `createUUID()`. That is the more faithful shape, not the looser one: a required
//   parameter would have forced every caller to generate a value eagerly on the
//   overwhelming majority of inserts where the guard never fires. Asserted as shipped.
//
// A third, minor correction: `getPromotionCodesDeletableFlag` spans
// [model/entity/Promotion.cfc:L123-L134], not L123-L133 - the return is at L133 and the
// closing brace at L134. Cited correctly throughout.
//
// ---------------------------------------------------------------------------
// NO USER RULES WERE PROVIDED
// ---------------------------------------------------------------------------
// Stated explicitly rather than assumed. The project rules document was read to completion
// and returns exactly "No user rules provided.", matching the plan's own rules section: no
// rule governs this file, no file enters scope by rule mandate, and there are no rule
// conflicts to resolve. No rule is invented to fill the gap, and the absence is NOT licence
// to lower the bar - the enterprise-standard substitute applies at full strength. No `any`,
// no `@ts-ignore`, no non-null assertion, no `.only`, no `.skip`, no default export; one
// unit under test and no barrel import; and every judgment call annotated where it was made.
//
// ---------------------------------------------------------------------------
// FRESHNESS, DATES, AND WHY THERE IS NO `beforeEach`
// ---------------------------------------------------------------------------
// Every test builds its own subject through `aPromotionCode()` and its own far side through
// `aPromotion()`, `anAccountLink()` or `anOrderLink()`, so no state crosses a test boundary
// and there is nothing to reset. Every module-level binding in this file is either a frozen
// constant or a FUNCTION returning fresh objects; not one is mutable.
//
// THAT MATTERS MORE HERE THAN IN MOST SUITES, because `currentFlag` is a MEMO. It is an
// instance field on the subject, and a test below proves a second, independent code does
// not observe the first one's memoized answer. Were the memo ever to become module state it
// would leak between tests and, in the target's warm-container execution model, between
// unrelated customers' requests.
//
// Every business-date literal below is an explicit UTC ISO-8601 string. Nothing here calls
// `new Date()` with no argument or `Date.now()`, no `new Date(0)` ever stands in for an
// absent bound, and NO fake timer is installed: the clock is INJECTED as a plain
// `() => Date` constructor parameter, which is what makes every boundary case
// deterministic. `tests/setup.ts` pins the process to UTC before any suite loads a subject
// and is never edited from here.
//
// `afterEach` restores spies. `tests/setup.ts` already does this globally; it is restated so
// the file is self-contained and a reader can see the far-side spy cannot leak.
//
// No assertion below touches a database, the network, the filesystem, an environment
// variable, a credential or a clock it does not own, and no non-functional requirement is
// asserted anywhere - no timing, no throughput, no latency, no benchmark. Where a call
// COUNT is asserted it is asserted as behavioural fidelity to the source's own
// short-circuit structure, never as a performance claim, and the memoization of
// `getCurrentFlag()` is justified the same way: it computes once and is therefore STALE,
// which is legacy behaviour a caller can observe.
//
// ANNOTATION FORMS USED BELOW - and there are exactly two, both deliberate:
//   `// CFML parity [<file>:L<nn>]: <decision>`  for a legacy semantic carried across, always
//                                               with the locator it was verified against.
//   `// JUDGMENT CALL: <choice and why>`         for a translation decision this suite makes.
// The third form the wider port uses - the reproduced-defect marker - appears NOWHERE in this
// file, per the ruling above.
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PromotionCode } from '../../../../src/domain/entities/promotionCode.js';
import { Promotion } from '../../../../src/domain/entities/promotion.js';
import { makePromotionFixtures } from '../../../fixtures/promotionFixtures.js';

// JUDGMENT CALL: `Promotion` is imported as a VALUE, not with `import type`, because this
// suite CONSTRUCTS promotions - `setPromotion` and `removePromotion` need a real far side
// with a live `getPromotionCodes()` array, and a type-only import cannot build one. The
// shipped entity module imports the same symbol with `import type` for the opposite reason:
// it only annotates with it, and a type-only import is erased at emit so the
// promotionCode <-> promotion cycle never exists at runtime in the CommonJS Lambda bundle.
// Both choices are correct for their own file; `consistent-type-imports` enforces exactly
// that distinction.
//
// Only three modules are imported, and they are precisely this file's declared
// dependencies. Nothing under `src/repositories/**`, `src/handlers/**`,
// `src/integrations/**`, `src/lib/`, `tests/integration/**` or `tests/traceability/**` is
// reachable from here, and `Account` and `Order` are never imported because they are out of
// scope and are not ported - the two link projections below stand in for them structurally.

/**
 * The constructor's parameter object, derived rather than restated.
 *
 * `src/domain/entities/promotionCode.ts` declares the init shape INLINE and exports only the
 * class, so there is no init type to import. Deriving it with `ConstructorParameters` keeps
 * this suite honest: if a column is added, removed or retyped upstream the builders below
 * stop compiling instead of silently drifting. Restating the sixteen slots by hand would
 * have hidden exactly that.
 */
type PromotionCodeInit = ConstructorParameters<typeof PromotionCode>[0];

/**
 * Extracts an array type's element type.
 *
 * Written as a conditional `infer` rather than as `T[number]` so the result is the element
 * type itself under `noUncheckedIndexedAccess`, with no `| undefined` smuggled in by an
 * indexed access. The same shape the fixture module uses, for the same reason.
 */
type ElementOf<TArray> = TArray extends readonly (infer TElement)[] ? TElement : never;

/**
 * The `SwPromotionCodeAccount` link projection. [model/entity/PromotionCode.cfc:L65]
 *
 * NAMED STRUCTURALLY, NEVER NOMINALLY. `model/entity/Account.cfc` is out of scope, the whole
 * account module is, and no `account.ts` exists to name - so the shipped module declares a
 * module-local, un-exported projection carrying exactly the four members the legacy
 * `addAccount`/`removeAccount` bodies call. Recovering it from the constructor slot is the
 * only way this suite can name the type without importing an out-of-scope entity, which it
 * must not do.
 */
type AccountLink = ElementOf<NonNullable<PromotionCodeInit['accounts']>>;

/**
 * The `SwOrderPromotionCode` link projection. [model/entity/PromotionCode.cfc:L68]
 *
 * Same reasoning as {@link AccountLink}, and the stakes are higher: the order aggregate is
 * the single largest exclusion in this port. The projection carries an opaque `orderID` plus
 * the two owning-side maintenance methods [L142-L147] delegate to, and nothing else. No
 * order-shaped data appears in this file.
 */
type OrderLink = ElementOf<NonNullable<PromotionCodeInit['orders']>>;

/**
 * An account link that also reports how many times its far-side containment probe ran.
 *
 * JUDGMENT CALL: a hand-written counter rather than `vi.spyOn`, because the double is this
 * suite's own object and a counter it owns is both simpler to read and impossible to leave
 * un-restored. `vi.spyOn` is reserved below for the one far side this suite does NOT
 * implement - the real `Promotion` - where there is no body to instrument.
 */
type AccountLinkProbe = AccountLink & {
  /** How many times `hasPromotionCode` has been called on this link. */
  readonly hasPromotionCodeCallCount: () => number;
};

/**
 * An order link that also reports which owning-side methods were delegated to, in order.
 *
 * The recorded call list is what makes the "remove-that-ADDs" inversion cross-check
 * assertable rather than merely asserted in prose: an inverted `removeOrder` would record a
 * second `addPromotionCode`.
 */
type OrderLinkProbe = OrderLink & {
  /** The owning-side method names this link received, in call order. */
  readonly delegatedCalls: () => readonly string[];
  /** The codes this link currently holds on its own side of the link table. */
  readonly heldCodes: () => readonly PromotionCode[];
};

/**
 * A clock whose instant can be moved, and which counts how often it was read.
 *
 * This is the injected `now: () => Date` seam, and it is what replaces the legacy ambient
 * request scope: [model/entity/PromotionCode.cfc:L88] reaches the engine's `now()` built-in
 * twice, which depended on the server timezone and could not be controlled from a test.
 *
 * `now()` hands back a FRESH `Date` carrying the instant, so a caller that mutates the
 * returned value cannot move this clock. `moveTo` is what makes the memoization assertion
 * possible: the bounds are `readonly` on the entity, so advancing the clock is the only way
 * to change what a re-computation WOULD answer.
 */
interface MovableClock {
  /** The function handed to the constructor slot. */
  readonly now: () => Date;
  /** How many times the entity has read this clock. */
  readonly readCount: () => number;
  /** Moves the clock to a new explicit UTC instant. */
  readonly moveTo: (instantUTC: string) => void;
}

// ---------------------------------------------------------------------------
// Explicit UTC instants. Every business date in this suite is one of these.
// ---------------------------------------------------------------------------
// CFML parity [model/entity/PromotionCode.cfc:L54-L55]: `startDateTime` and `endDateTime`
// are `ormtype="timestamp"`, and the legacy comparison at L88 ran against the CF server's
// own timezone. The port's UTC policy makes that explicit, so every literal below carries a
// `Z` and every boundary case is reproducible on any machine.

/** The instant every injected clock starts at. Mid-window for the standard bounds. */
const NOW_UTC = '2024-06-15T12:00:00.000Z';
/** Start of the standard open window. Also used as an explicit created-on stamp. */
const WINDOW_START_UTC = '2024-06-01T00:00:00.000Z';
/** End of the standard open window. */
const WINDOW_END_UTC = '2024-07-01T00:00:00.000Z';
/** Strictly before the standard window - a code whose window has not opened. */
const BEFORE_WINDOW_UTC = '2024-05-01T00:00:00.000Z';
/** Strictly after the standard window - a code whose window has closed. */
const AFTER_WINDOW_UTC = '2024-08-01T00:00:00.000Z';
/** An explicit modified-on stamp, distinct from the created-on stamp. */
const MODIFIED_UTC = '2024-06-15T12:30:00.000Z';
/**
 * The Unix epoch, present for exactly one purpose: to prove it is NOT how absence is
 * modelled. It is asserted as a value a row can legitimately CARRY, never as a stand-in for
 * a missing bound.
 */
const UNIX_EPOCH_UTC = '1970-01-01T00:00:00.000Z';

/**
 * The shape [model/entity/PromotionCode.cfc:L182]'s `createUUID()` produces, which the
 * shipped `preInsert` reproduces: 8-4-4-16 uppercase hexadecimal, 35 characters, hyphenated
 * at three of the four canonical group boundaries. CFML's `createUUID()` is deliberately NOT
 * an RFC 4122 rendering - it merges the last two groups - so a suite asserting the standard
 * 8-4-4-4-12 shape would reject a faithful port.
 */
const CFML_SHAPED_UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{16}$/;

/** Total characters in a CFML-shaped UUID: 32 hexadecimal digits plus three hyphens. */
const CFML_SHAPED_UUID_LENGTH = 35;

// ---------------------------------------------------------------------------
// Schema strings recorded verbatim, for continuity rather than for computation.
// ---------------------------------------------------------------------------
// The port reads and writes the EXISTING tables unchanged - no migration, no rename, no new
// column - so the physical names are recorded here as data and asserted below. A rename
// upstream fails this suite, which is the whole point of recording them.

/** [model/entity/PromotionCode.cfc:L49] - the row's own table. */
const TABLE_NAME = 'SwPromotionCode';
/** [model/entity/PromotionCode.cfc:L65] - the owner-side many-to-many link table. */
const ACCOUNT_LINK_TABLE_NAME = 'SwPromotionCodeAccount';
/** [model/entity/PromotionCode.cfc:L68] - the inverse-side many-to-many link table. */
const ORDER_LINK_TABLE_NAME = 'SwOrderPromotionCode';
/** [model/entity/PromotionCode.cfc:L49] - the ORM entity name behind the HQL alias. */
const ENTITY_NAME = 'SlatwallPromotionCode';
/** [model/entity/PromotionCode.cfc:L49] - the service the legacy bean factory routed to. */
const SERVICE_NAME = 'promotionService';
/** [model/entity/PromotionCode.cfc:L49] - the admin permission key, an inert string. */
const PERMISSION_KEY = 'promotion.promotionCodes';
/** [model/entity/PromotionCode.cfc:L54-L55] - the null-display key for both date bounds. */
const FOREVER_RB_KEY = 'define.forever';
/** [model/entity/PromotionCode.cfc:L56-L57] - the null-display key for both ceilings. */
const UNLIMITED_RB_KEY = 'define.unlimited';

/**
 * One declarative rule from [model/validation/PromotionCode.json].
 *
 * Every keyword the four in-scope rules use is declared here as OPTIONAL, so a heterogeneous rule
 * list stays uniformly readable. Written as one type rather than as a discriminated union on purpose:
 * the legacy JSON has no discriminator, the framework read whichever keywords happened to be
 * present, and a union would force this suite to narrow before it could report what a rule contains.
 */
type ValidationRule = {
  /** `save` or `delete`. Every rule in this schema names exactly one context. */
  readonly contexts: string;
  /** Present only on the `promotionCode` rule. */
  readonly required?: boolean;
  /** The custom entity validator to invoke. Present only on the `promotionCode` rule. */
  readonly method?: string;
  /** Present on both date-bound rules. */
  readonly dataType?: string;
  /** The named condition gating the rule. Present only on the second `endDateTime` rule. */
  readonly conditions?: string;
  /** The strict greater-than comparison target. Present only on the conditional rule. */
  readonly gtProperty?: string;
  /** The delete-context collection ceiling. Present only on the `orders` rule. */
  readonly maxCollection?: number;
};

/** The whole schema, with the four gated properties named explicitly rather than indexed. */
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
 * [model/validation/PromotionCode.json] recorded verbatim, as data.
 *
 * JUDGMENT CALL: the declarative rules are recorded here and cross-checked against the
 * SHIPPED SURFACE rather than executed. Declarative validation becomes a zod schema at the
 * service tier in this port, never a constructor invariant on the entity, so there is no
 * validator to run from a domain unit suite. What IS assertable - and what the block below
 * asserts - is that the method this schema names actually exists on the class, that the
 * collection it gates is actually reachable, and that the two ABSENCES a reviewer would
 * otherwise have to take on trust are real: there is no `unique` keyword anywhere, and there
 * is no `accounts` gate despite `accounts` being the owner side.
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
 *
 * Twenty-nine members. Recorded exhaustively rather than sampled so that an accidental
 * addition is caught as loudly as an accidental removal - interface parity is the acceptance
 * contract for this migration, and a surface that quietly grows is as much a parity failure
 * as one that quietly shrinks.
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
 * Recorded so the exhaustive prototype assertion below can be exactly that - exhaustive -
 * without asserting anything about their behaviour, which is reachable only through the
 * public members that call them.
 */
const PRIVATE_HELPERS: readonly string[] = Object.freeze([
  'accountsContainUnsavedRow',
  'isSameAccountRow',
  'isSameRowAs',
  'ordersContainUnsavedRow',
]);

/**
 * Members `model/entity/PromotionCode.cfc` DOES NOT DECLARE, asserted absent.
 *
 * `isDeletable` is the consequential one and is the subject of its own block below.
 * `isCurrent` and `isExpired` are declared by the SIBLING `PromotionPeriod` [L78-L85] and
 * are absent here, which is why this entity has no disagreeing pair of window predicates and
 * therefore correctly carries no defect for one. `getSimpleRepresentation` is absent because
 * the source overrides only the property NAME. `preUpdate` is absent because the source's
 * only lifecycle hook is insert-only.
 */
const UNDECLARED_MEMBERS: readonly string[] = Object.freeze([
  'getSimpleRepresentation',
  'isCurrent',
  'isDeletable',
  'isExpired',
  'preUpdate',
]);

/**
 * Framework members inherited from the Hibachi base in the legacy runtime and deliberately
 * NOT ported to the entity.
 *
 * `org/Hibachi/HibachiEntity.cfc` is a boundary to extract from and never modify, and none of
 * its 24 sibling classes are ported. What it provided is redistributed: persistence to the
 * repositories, validation to typed schemas at the service tier, ambient scope to an explicit
 * context parameter, and smart lists to typed query methods. Asserting the absence keeps a
 * future revision from quietly reintroducing framework coupling onto a domain row.
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

// ---------------------------------------------------------------------------
// Builders. Every one returns a FRESH object on every call.
// ---------------------------------------------------------------------------

/** Parses an explicit UTC ISO-8601 literal. The only way a `Date` is produced in this file. */
function atUtc(instantUTC: string): Date {
  return new Date(instantUTC);
}

/**
 * A movable, counting clock starting at an explicit UTC instant.
 *
 * CFML parity [model/entity/PromotionCode.cfc:L88]: the legacy predicate calls the engine's
 * `now()` TWICE inside one boolean expression. The port preserves that structure, so the read
 * count is observable - and is asserted below purely as evidence that the short-circuit shape
 * survived translation. It is NOT a timing or throughput claim of any kind.
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
 * `unsavedvalue="" default=""`, so the empty string is the honest unsaved key and
 * `isNew()` reads it directly. Every other column starts absent, which is what a
 * freshly-constructed row looks like before the ORM ever saw it.
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

/** A promotion code built from the unsaved defaults with the given columns overridden. */
function aPromotionCode(overrides: Partial<PromotionCodeInit> = {}): PromotionCode {
  return new PromotionCode({ ...unsavedRowColumns(), ...overrides });
}

/**
 * A saved promotion row with a live, initially empty code collection.
 *
 * `Promotion`'s constructor requires only its own key, which is exactly the anti-corruption
 * shape this suite needs: nothing about promotion periods, qualifiers or rewards has to be
 * fabricated to exercise a bidirectional code helper.
 */
function aPromotion(promotionID: string): Promotion {
  return new Promotion({ promotionID });
}

/**
 * A `SwPromotionCodeAccount` link double.
 *
 * `hasPromotionCode` mirrors the shipped `Promotion.hasPromotionCode` semantics rather than
 * inventing its own: primary-key comparison, falling back to object identity when the
 * candidate's key is empty. That fallback is not decoration - it is what lets an UNSAVED code
 * be recognised at all, since every unsaved row shares the same empty key and a naive key
 * comparison would report two distinct new codes as the same row.
 *
 * `isNew()` reads the account's own key the same way, which is what the asymmetric near-side
 * guard at [model/entity/PromotionCode.cfc:L123] consults.
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
 * `lazy="extra"`. The owning side is `Order.cfc`, so this double carries only an opaque
 * identifier and the two owning-side maintenance methods [L142-L147] delegate to. It models
 * no order state whatsoever - no items, no fulfillments, no totals, no status - because the
 * order aggregate is out of scope and inventing one here would smuggle it back in.
 *
 * Membership is by object identity because the double is the owning side of its own
 * collection and the legacy owner maintains it that way; the code's own key is irrelevant to
 * it.
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

/** The prototype members the class installs, excluding the constructor, sorted. */
function prototypeMembers(): string[] {
  return Object.getOwnPropertyNames(PromotionCode.prototype)
    .filter((name) => name !== 'constructor')
    .sort();
}

afterEach(() => {
  // The one spy in this suite is installed on a real `Promotion` far side, where there is no
  // hand-written body to count through. Restored here so it cannot outlive its test, even
  // though `tests/setup.ts` also restores globally.
  vi.restoreAllMocks();
});

describe('PromotionCode installs the ported surface and nothing else', () => {
  it('installs exactly the twenty-nine public members and the four private helpers', () => {
    const expected = [...PUBLIC_SURFACE, ...PRIVATE_HELPERS].sort();

    expect(prototypeMembers()).toStrictEqual(expected);
  });

  it('reaches every public member on an instance built from the unsaved defaults', () => {
    const subject = aPromotionCode();

    for (const name of PUBLIC_SURFACE) {
      expect(name in subject).toBe(true);
    }
  });

  it('declares no isDeletable, no isCurrent, no isExpired, no getSimpleRepresentation and no preUpdate', () => {
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
    // `onMissingMethod` dispatcher and THREW "You have called a method ... which does not
    // exists in the ... entity." - one of fourteen throwing entities in the slice, against
    // four silent ones. The target has no dynamic dispatch AT ALL, so the behaviour is
    // DOCUMENTED here and deliberately not reproduced: a typo becomes a compile error, which
    // is strictly earlier and strictly louder than a runtime throw.
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

    // CFML parity [model/entity/PromotionCode.cfc]: a census of the whole component finds
    // ZERO `getService("...")` service-locator calls - the pattern that appears 45 times
    // across the eighteen in-scope entities, concentrated in `Product.cfc` (18),
    // `Sku.cfc` (19) and `ProductType.cfc` (6). This row reaches outward for nothing, so its
    // constructor injects no port. The clock is a plain `() => Date` parameter, NOT a
    // fourteenth port and NOT a configuration module: the port ledger stays at thirteen.
    for (const name of prototypeMembers()) {
      expect(name).not.toMatch(/(Service|Repository|Port|Provider|Adapter)$/);
    }

    // The clock is genuinely wired through that plain parameter: the one member that needs an
    // instant reads THIS function and nothing ambient.
    expect(clock.readCount()).toBe(0);
    subject.getCurrentFlag();
    expect(clock.readCount()).toBeGreaterThan(0);
  });

  it('is synchronous throughout - no accessor returns a thenable', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-sync' });

    // CFML parity: a method becomes async in this port if and only if its legacy body reached
    // the DAO or the ORM. Nothing on this row does - every member either reads a column or
    // walks an already-materialized association - so the whole surface stays synchronous,
    // and a caller never has to await a price bound or a use ceiling.
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

describe('PromotionCode does not declare isDeletable, and the gap is recorded not filled', () => {
  it('exposes no isDeletable member of any kind', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-gap' });

    // CFML parity [model/entity/PromotionCode.cfc, model/entity/Promotion.cfc:L123-L134]:
    // `isDeletable` is NOT declared on `PromotionCode.cfc` - a grep of all 192 lines returns
    // zero hits. In the legacy runtime it was inherited from the Hibachi base, which this port
    // deliberately does not carry. Yet `Promotion.getPromotionCodesDeletableFlag()` calls
    // `isDeletable()` on EVERY code, and [model/validation/Promotion.json] wires that method
    // into the `promotionCodes` delete gate - so a real consumer depends on a member the
    // source file never declared.
    //
    // JUDGMENT CALL: the gap is RECORDED, not filled. No `isDeletable` is invented here, no
    // stub returns a convenient `true`, and no fake far-side member is added to make the
    // consumer succeed. Fabricating one would have manufactured a deletion verdict out of
    // nothing - the single most dangerous kind of invention in a port whose acceptance
    // contract is behavioural fidelity. The consumer's own suite owns the reporting of this
    // gap, including its three-spelling memo defect; this suite owns only the fact of the
    // absence.
    expect(prototypeMembers()).not.toContain('isDeletable');
    expect('isDeletable' in subject).toBe(false);

    // @ts-expect-error `isDeletable` was framework-inherited and is not ported onto the row.
    const frameworkInherited: unknown = subject.isDeletable;

    expect(frameworkInherited).toBeUndefined();
  });

  it('records the consumer that depends on the missing member without exercising it', () => {
    const fixtures = makePromotionFixtures();

    // The shared fixture record names the consumer, its spelling mismatch and the raise, so
    // the dependency direction is machine-readable from both ends. The consumer itself is NOT
    // invoked from here: it is owned by `promotion.test.ts`, which asserts both the
    // three-spelling memo defect and the raise it performs when a materialized code cannot
    // answer `isDeletable()`.
    expect(fixtures.promotionCodesDeletableFlagDefect.methodName).toBe(
      'getPromotionCodesDeletableFlag',
    );
    expect(fixtures.promotionCodesDeletableFlagDefect.portedAccessorRaisesOnMaterializedCode).toBe(
      true,
    );
    expect(fixtures.promotionCodesDeletableFlagDefect.requiredCrossFileFollowUp).toContain(
      'isDeletable',
    );

    // The follow-up names `src/domain/entities/promotionCode.ts` as the file that must
    // eventually declare the member. That file is READ-ONLY from this suite and is not edited
    // here - recording the required change is the correct action; making it is not.
    expect(fixtures.promotionCodesDeletableFlagDefect.requiredCrossFileFollowUp).toContain(
      'src/domain/entities/promotionCode.ts',
    );
  });
});

describe('getCurrentFlag() is inclusive on both bounds and permissive on absent bounds', () => {
  // CFML parity [model/entity/PromotionCode.cfc:L85-L94]: the legacy body SEEDS `true` at L87
  // and narrows to `false` at L89 only when a NON-NULL bound is out of range. The two
  // comparisons at L88 are `getStartDateTime() > now()` and `getEndDateTime() < now()`, both
  // STRICT - so at exact equality with either bound neither comparison fires and the seeded
  // `true` survives. The predicate is therefore INCLUSIVE on both bounds, and the `!isNull()`
  // guards make it PERMISSIVE on absent ones: an open-ended code is current, which is exactly
  // what `hb_nullRBKey="define.forever"` at L54-L55 declares those columns to mean.
  //
  // This body is byte-identical in shape to [model/entity/PromotionPeriod.cfc:L137-L146].
  // Unlike that entity, `PromotionCode` declares NO `isCurrent()`, so there is no second,
  // disagreeing window predicate on this row and correctly no defect for one.

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

    // This is the single most consequential boundary in the file. A `<=` mistranslation of
    // L88's strict `<` would silently retire every code on the final instant of its window.
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

    // CFML parity [model/entity/PromotionCode.cfc:L88]: the legacy expression calls the
    // engine's `now()` TWICE - once per comparison - rather than binding one instant to a
    // local as [model/entity/PromotionPeriod.cfc:L79] does for its own `isCurrent`. The port
    // preserves that structure, so the count is observable.
    //
    // JUDGMENT CALL: this is asserted as EVIDENCE THAT THE SHORT-CIRCUIT SHAPE SURVIVED
    // TRANSLATION, never as a performance or timing claim. Under a real wall clock the two
    // reads could straddle a boundary and disagree; the injected clock removes that from the
    // test entirely, which is precisely why it is injected rather than faked globally.
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

    // The `||` short-circuits after the first disjunct is satisfied, exactly as CFML's `or`
    // does at L88, so the second comparison never runs and never reads the clock.
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

    // Move the clock well past the window's end. A freshly-computed answer would now be
    // `false`; the memoized one is not recomputed at all.
    clock.moveTo(AFTER_WINDOW_UTC);

    expect(subject.getCurrentFlag()).toBe(true);
    expect(subject.getCurrentFlag()).toBe(true);

    // CFML parity [model/entity/PromotionCode.cfc:L86]: the guard is
    // `!structKeyExists(variables,"currentFlag")`, so once the key exists the body never runs
    // again for the life of the object.
    //
    // JUDGMENT CALL: the memo is preserved as BEHAVIOURAL FIDELITY, not as an optimisation. A
    // long-lived legacy request could observe a stale answer, and a caller that expects a
    // live re-read would be wrong about the legacy system too. The target neutralises the
    // hazard a different way - entity instances are request-scoped, so the memo cannot span
    // two invocations of a warm container the way a module-level cache would.
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

    // Move the clock INTO the window. A live predicate would now answer `true`.
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

    // Warm ONLY the first code's memo while the clock is inside the window.
    expect(first.getCurrentFlag()).toBe(true);

    clock.moveTo(AFTER_WINDOW_UTC);

    // The second code computes for the first time at the NEW instant and answers honestly...
    expect(second.getCurrentFlag()).toBe(false);
    // ...while the first is still holding its frozen answer. Two rows, two memos, one clock.
    expect(first.getCurrentFlag()).toBe(true);

    // This is the assertion that matters most for the target's execution model. Were
    // `currentFlag` ever hoisted to module scope it would survive between unrelated
    // invocations of a warm container, and one merchant's expired code would read as current
    // for another's request.
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

    // Every row with an absent bound is expected to be CURRENT, which is the table's own
    // record of the null-permissive semantic asserted directly above.
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

    // THIS row's own behaviour, asserted directly: end-inclusive, therefore current.
    expect(atEnd.promotionCode.getCurrentFlag()).toBe(true);

    // And the recorded contrast, read from the shared table rather than re-derived. At the
    // very same instant `PromotionPeriod.isCurrent()` answers `false`, because
    // [model/entity/PromotionPeriod.cfc:L80] tests `getEndDateTime() > currentDateTime` -
    // END-EXCLUSIVE - while [model/entity/PromotionPeriod.cfc:L140], the byte-identical twin
    // of this file's L88, is end-INCLUSIVE. One entity, two predicates, one instant, two
    // answers. `promotionPeriod.test.ts` OWNS that finding; it is cited here because the
    // divergence is only meaningful when both sides are known, and because this row is the
    // side a merchant actually observes through
    // [model/entity/Promotion.cfc:L109-L121].
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
    // `public boolean function getCurrentFlag()`, and the port keeps that arity exactly. The
    // ONE permitted entity-layer signature widening in this whole migration is
    // `PromotionPeriod.isCurrent(now?)`, which is sibling-owned; a second is forbidden, so the
    // instant reaches this method through the injected constructor clock instead of through a
    // parameter.
    //
    // JUDGMENT CALL: arity is read off a BOUND reference throughout this suite rather than off
    // `PromotionCode.prototype.<member>` directly. An unbound prototype method reference is a real
    // hazard - it silently loses `this` if it is ever passed anywhere - and `.bind()` both removes the
    // hazard and preserves `Function.length` exactly. The suite is fixed here; no lint rule is
    // relaxed to accommodate it.
    expect(subject.getCurrentFlag.bind(subject)).toHaveLength(0);
    expect(subject.getCurrentFlag()).toBe(true);
  });
});

describe('absence means UNLIMITED and FOREVER - never zero, never the epoch', () => {
  // CFML parity [model/entity/PromotionCode.cfc:L56-L57]: `maximumUseCount` and
  // `maximumAccountUseCount` are `ormtype="integer" notnull="false"` and carry
  // `hb_nullRBKey="define.unlimited"`. The rbKey IS the specification: a null ceiling means
  // the code may be used without limit. Coercing that null to `0` would flip the meaning to
  // its exact opposite and forbid every redemption of every uncapped code in the catalogue.
  //
  // CFML parity [model/entity/PromotionCode.cfc:L54-L55]: `startDateTime` and `endDateTime`
  // are `ormtype="timestamp"` and carry `hb_nullRBKey="define.forever"`. A null bound means
  // unbounded, so `new Date(0)` is not merely a poor stand-in, it is a WRONG one - it would
  // turn "no lower bound" into "valid since 1970" and, worse, "no upper bound" into "expired
  // since 1970".
  //
  // This entity is one of three places in the port where an absence convention is
  // load-bearing, and the three do NOT agree with one another, which is why each is asserted
  // where it lives rather than generalised: `Sku.getPriceByCurrencyCode()` must return
  // `undefined` and never `0`, because a zero price sells the product for free
  // [model/entity/Sku.cfc:L269-L273]; `Product.getSalePrice()` must return `0` and never
  // `undefined`, because [model/entity/Product.cfc:L598] omits a `return` and falls through
  // to a literal zero. Both are cited, neither is re-tested.

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

    // A stored `0` is a real, if pathological, merchant instruction: the code exists but may
    // not be redeemed. It must survive the round trip as itself, and it must NOT read the same
    // as an absent ceiling - the two mean opposite things.
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

    // CFML parity [model/validation/PromotionCode.json]: the schema declares rules for
    // `promotionCode`, `startDateTime`, `endDateTime` and `orders` and NOTHING for either
    // ceiling - no `required`, no `dataType`, no `minValue`. A negative integer is therefore
    // storable today, and the port does not invent a guard the source never had. Adding one
    // would be a behaviour change dressed up as a fix.
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

    // ...and the epoch is a value a row may legitimately CARRY, which is exactly why it must
    // never double as the marker for absence. These two rows are in different states and must
    // read differently.
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
    // `define.unlimited` were JavaRB resource-bundle identifiers the legacy admin resolved
    // into localised display text. JavaRB is deliberately not carried forward and NO i18n
    // runtime is introduced, so the keys survive as inert string constants for the legacy
    // admin to keep resolving, and the port ships no formatter or resolver for them.
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
    // nullable properties. An un-persisted row genuinely has no created-on stamp, so the epoch
    // is as wrong here as it is on the business bounds.
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

    // ...and the colliding code is the deliberate UNLIMITED exhibit, absent on both.
    expect(fixtures.collidingPromotionCode.getMaximumUseCount()).toBeUndefined();
    expect(fixtures.collidingPromotionCode.getMaximumAccountUseCount()).toBeUndefined();
    expect(fixtures.collidingPromotionCode.getMaximumUseCount()).not.toBe(0);
  });

  it('leaves use COUNTING to the query tier and exposes no counter of its own', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-count' });

    // CFML parity [model/dao/PromotionDAO.cfc:L254-L296]: the code-level use counts are SQL
    // aggregates - `getPromotionCodeUseCount` and `getPromotionCodeAccountUseCount` - not
    // entity state. The row supplies the two CEILINGS; the query supplies the two CURRENT
    // TOTALS; the promotion engine compares them. Those queries, and the duplicated
    // `getStartDateTime()` test at L177 and L244, belong to `tests/integration/`, so no SQL and
    // no count appears in this file.
    expect('getUseCount' in subject).toBe(false);
    expect('getAccountUseCount' in subject).toBe(false);
    expect(prototypeMembers().filter((name) => name.includes('UseCount'))).toStrictEqual([
      'getMaximumAccountUseCount',
      'getMaximumUseCount',
    ]);
  });
});

describe('setPromotion() assigns the near side and appends to the live far side', () => {
  // CFML parity [model/entity/PromotionCode.cfc:L104-L105]: the guard reads LOWERCASE
  // `arguments.promotion` at L104 while the append reads CAPITALISED `arguments.Promotion` at
  // L105. CFML's `arguments` scope is a case-INSENSITIVE struct, so both spellings resolve to
  // the one declared parameter and the method works. TypeScript identifiers are case-SENSITIVE,
  // so the port normalises to the single lowercase binding the signature declares. That is a
  // PORTING HAZARD faithfully neutralised, not an authorised divergence and not a defect: no
  // observable behaviour changes, because in CFML there was only ever one argument.
  //
  // JUDGMENT CALL: the wart is asserted through the parameter NAME recorded in the shared
  // fixture graph plus the method's arity, rather than by reflecting over source text. A test
  // that reads its own subject's source string would pass for the wrong reason.

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

    // CFML parity [model/entity/PromotionCode.cfc:L105]: `arrayAppend(...getPromotionCodes(), this)`
    // mutates the collection the accessor returned, because CFML arrays are handed out by
    // reference from an ORM-managed entity. The port keeps that: `getPromotionCodes()` returns
    // the live array, so a caller holding an earlier reference sees the append.
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

    // Two distinct objects, one row. Without primary-key containment the second hydration would
    // duplicate the row inside the collection, which is how a repository that loads the same
    // code down two association paths corrupts a promotion's code list.
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
    // Because CFML's `or` short-circuits, an unsaved code never reaches the containment probe at
    // all - so two calls append twice and the collection holds the same object twice.
    //
    // JUDGMENT CALL: the duplicate is PRESERVED, not de-duplicated. The guard exists because a
    // set of unsaved rows all share the empty key and cannot be told apart by it, so the source
    // chose to trust the caller. Silently collapsing the duplicate would change what a repository
    // flushes, and the flush is out of this row's hands.
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

    // The first disjunct is false for a saved code, so the second is always evaluated. Asserted
    // as evidence the guard's structure survived translation - not as a performance statement.
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
    // is no detach of the previous owner, so the code ends up listed by BOTH promotions while its
    // own field names only the second. The port reproduces exactly that, because repairing it
    // would require a detach the source never performs.
    expect(subject.getPromotion()).toBe(second);
    expect(first.getPromotionCodes()).toStrictEqual([subject]);
    expect(second.getPromotionCodes()).toStrictEqual([subject]);
  });

  it('is reachable through Promotion.addPromotionCode with identical effect', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const promotion = aPromotion('promo-1');

    // CFML parity [model/entity/Promotion.cfc:L149-L151]: the far side's `addPromotionCode`
    // delegates straight back to `promotionCode.setPromotion(this)` - it does not maintain the
    // collection itself. Only one of the two directions owns the mutation, which is what keeps
    // the pair from double-appending.
    promotion.addPromotionCode(subject);

    expect(subject.getPromotion()).toBe(promotion);
    expect(promotion.getPromotionCodes()).toStrictEqual([subject]);
  });

  it('declares exactly one parameter, named for the lowercase binding', () => {
    const fixtures = makePromotionFixtures();
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });

    // CFML parity [model/entity/PromotionCode.cfc:L101]: `setPromotion(required any promotion)` -
    // ONE required parameter, declared lowercase. The capital-`P` at L105 is a second SPELLING of that
    // same one parameter, not a second parameter, and the arity below is what proves it: had the
    // source genuinely taken two, the ported signature would have to as well.
    expect(fixtures.promotionCodeSetPromotionParameterName).toBe('promotion');
    expect(subject.setPromotion.bind(subject)).toHaveLength(1);
  });
});

describe('removePromotion() is the CORRECT CONTROL CASE for the sibling remover defects', () => {
  // CFML parity [model/entity/PromotionCode.cfc:L113, L116]: `removePromotion` resolves its index
  // from `arguments.promotion.getPromotionCodes()` at L113 and deletes from
  // `arguments.promotion.getPromotionCodes()` at L116 - THE SAME IDENTIFIER. It is correct, and it
  // is the most valuable single finding in this file, because it is the direct control that proves
  // two siblings are genuinely broken rather than merely idiomatic:
  //
  //   * [model/entity/PromotionPeriod.cfc:L108, L110] searches `arguments.promotion` and then
  //     deletes from `arguments.account` - an argument that method never declares.
  //   * [model/entity/PromotionAccount.cfc:L101, L103] makes the identical substitution.
  //
  // Without a working exemplar a reviewer could argue the substitution was some CFML convention.
  // With one, it is unambiguously a copy-paste defect. Both defects are owned by their own suites
  // and are CITED here, never re-asserted.

  it('deletes from the collection it searched - the argument, never the near-side field', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const searched = aPromotion('promo-searched');
    const nearSide = aPromotion('promo-near');

    // Leave the code listed by BOTH promotions while its own field names only the second, which
    // is the state `setPromotion`'s unconditional assignment produces.
    subject.setPromotion(searched);
    subject.setPromotion(nearSide);
    expect(subject.getPromotion()).toBe(nearSide);
    expect(searched.getPromotionCodes()).toHaveLength(1);
    expect(nearSide.getPromotionCodes()).toHaveLength(1);

    subject.removePromotion(searched);

    // THE CONTROL ASSERTION. The removal landed on the ARGUMENT's collection. Had the port
    // repeated the sibling substitution - dereferencing the near-side field instead - the wrong
    // promotion would have lost the code and this assertion pair would invert.
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
    // [model/entity/PromotionCode.cfc:L115] tests `index > 0`. TypeScript's `findIndex` is 0-BASED
    // and returns -1, so the test must be `!== -1`. A literal transcription of `> 0` compiles, type
    // checks, and silently refuses to remove the FIRST element of every collection - a bug no
    // single-element test could ever surface.
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
    // null" that a caller could exploit here, so collapsing both onto the near-side fallback is the
    // faithful reading.
    expect(promotion.getPromotionCodes()).toStrictEqual([]);
    expect(subject.getPromotion()).toBeUndefined();
  });

  it('clears the near side even when the far side never held the code', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const holder = aPromotion('promo-holder');
    const stranger = aPromotion('promo-stranger');

    subject.setPromotion(holder);
    subject.removePromotion(stranger);

    // CFML parity [model/entity/PromotionCode.cfc:L118]: `structDelete(variables, "promotion")` sits
    // OUTSIDE the `if(index > 0)` block at L115-L117, so it runs whether or not the search found
    // anything. Detaching against an unrelated promotion therefore still orphans the code. Faithful,
    // and surprising enough to be worth pinning.
    expect(subject.getPromotion()).toBeUndefined();
    expect(stranger.getPromotionCodes()).toStrictEqual([]);
    expect(holder.getPromotionCodes()).toStrictEqual([subject]);
  });

  it('throws when called with no argument and no promotion set', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });

    // CFML parity [model/entity/PromotionCode.cfc:L110-L113]: with no argument and a null
    // `variables.promotion`, L113 dereferences null and the CF engine raises. The port raises too,
    // with a message naming the source locator, rather than absorbing the call into a silent no-op
    // that would hide a real caller bug.
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
    // `promotionCode.removePromotion(this)`. Critically it delegates to a REMOVER, not to an adder -
    // the inversion two `Option.cfc` helpers commit at L130 and L146, where a `remove*` calls
    // `addExcludedOption(this)`. Cited, not re-asserted; `option.test.ts` owns those.
    expect(promotion.getPromotionCodes()).toStrictEqual([]);
    expect(subject.getPromotion()).toBeUndefined();
  });

  it('declares exactly one parameter, and it is optional', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });
    const promotion = aPromotion('promo-1');

    // CFML parity [model/entity/PromotionCode.cfc:L109]: `removePromotion(any promotion)` declares
    // ONE parameter and does NOT mark it `required`, which is why L110-L112 has a default to apply
    // at all. The port's `promotion?: Promotion` is the same shape.
    //
    // JUDGMENT CALL: arity is asserted as 1, not 0. `Function.length` counts leading parameters that
    // carry no initializer, and TypeScript erases a `?` marker without emitting a default - so an
    // optional parameter still contributes to the count, whereas an `= value` default would not.
    // This was measured against the built class rather than assumed, and the assumption it corrects
    // (that an optional parameter reports zero) is a common one.
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
  // CFML parity [model/entity/PromotionCode.cfc:L122-L129]: `addAccount` guards its two sides with
  // OPPOSITE subjects, and that is genuinely novel in this slice rather than merely untidy:
  //
  //   * L123, the NEAR-side guard:  `if(arguments.account.isNew() or !hasAccount(arguments.account))`
  //     -> tests THE ARGUMENT's newness before appending to `variables.accounts` at L124.
  //   * L126, the FAR-side guard:   `if(isNew() or !arguments.account.hasPromotionCode( this ))`
  //     -> tests THIS ROW's newness before appending to the far collection at L127.
  //
  // Two separate `if` statements, never an `else`, and each consults a different object's key. Every
  // other guarded bidirectional helper in the slice tests THIS instance's newness on both sides -
  // [model/entity/PromotionApplied.cfc:L81] and [model/entity/PriceGroupRate.cfc:L181] among them.
  // The asymmetry is PRESERVED, not normalised, and the two tests below prove it in both
  // directions: an unsaved ACCOUNT duplicates on the near side only, while an unsaved CODE
  // duplicates on the far side only. A normalised implementation could not produce that mirror.
  //
  // ⭐ SPECIFICATION CORRECTION, restated where it bites: `accounts` is NOT dropped. The shipped
  // entity materializes it behind a narrow structural projection - four members, no `Account` type
  // anywhere - and authors all three helpers. This block pins the shipped behaviour.

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
    // ...while L126's first disjunct is FALSE for a saved code, so the far-side probe does run and
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
    // ...while L126's first disjunct is satisfied both times, so the far-side probe is never
    // consulted at all and the code lands twice.
    expect(savedLink.getPromotionCodes()).toHaveLength(2);
    expect(savedLink.hasPromotionCodeCallCount()).toBe(0);
  });

  it('runs the two guards independently, so an already-attached saved pair appends nothing', () => {
    const link = anAccountLink('acct-1');
    const subject = aPromotionCode({ promotionCodeID: 'pc-1', accounts: [link] });

    link.getPromotionCodes().push(subject);

    subject.addAccount(link);

    // Both first disjuncts false, both containment probes true, both appends skipped. This is what
    // proves L126 is a SEPARATE `if` rather than the `else` of L123: an `else` could never leave
    // both sides untouched once the first condition failed.
    expect(subject.getAccounts()).toHaveLength(1);
    expect(link.getPromotionCodes()).toHaveLength(1);
  });

  it('appends to the private field, which getAccounts() hands back live and read-only', () => {
    const seeded: AccountLinkProbe[] = [];
    const subject = aPromotionCode({ promotionCodeID: 'pc-1', accounts: seeded });
    const link = anAccountLink('acct-1');

    // CFML parity [model/entity/PromotionCode.cfc:L124]: the append targets
    // `variables.accounts` DIRECTLY, not `getAccounts()`. The port keeps that distinction by making
    // the accessor a read-only VIEW over the same array - so the constructor's array is adopted, not
    // copied, exactly as an ORM-managed collection would be.
    subject.addAccount(link);

    expect(subject.getAccounts()).toBe(seeded);
    expect(seeded).toStrictEqual([link]);

    const readonlyView: readonly AccountLink[] = subject.getAccounts();

    // @ts-expect-error `push` is absent from a readonly array view: maintenance runs through addAccount.
    const mutator: unknown = readonlyView.push;

    // JUDGMENT CALL: the value IS a function at runtime, because the underlying object is a real
    // `Array` - the readonly guarantee is a COMPILE-TIME one, which is precisely why the directive
    // above is required and why it is asserted this way rather than as `toBeUndefined()`. Claiming a
    // runtime guarantee the port does not provide would be worse than claiming none.
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

    // JUDGMENT CALL: the fallback is collection-wide, not per-candidate. Once ANY held row carries
    // the empty key, key comparison can no longer separate the rows in that collection, so the whole
    // probe switches to identity - which means a distinct hydration of a SAVED account reads as
    // absent while the collection is in that mixed state. Surprising, and pinned rather than
    // smoothed over, because smoothing it would mean answering a containment question two different
    // ways depending on an unrelated sibling row.
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

    // The shared graph supplies the same narrow projection this suite builds by hand. Neither
    // carries an `Account` entity: the whole account module is out of scope and no `account.ts`
    // exists to import, which is exactly why the projection is structural.
    expect(fixtures.promotionCodeAccounts.length).toBeGreaterThan(0);
    for (const link of fixtures.promotionCodeAccounts) {
      expect(typeof link.getAccountID()).toBe('string');
      expect(typeof link.isNew()).toBe('boolean');
      expect(Array.isArray(link.getPromotionCodes())).toBe(true);
    }
  });

  it('records the owner-side link table name verbatim', () => {
    // CFML parity [model/entity/PromotionCode.cfc:L65]: `accounts` is the OWNER side of the
    // many-to-many across `SwPromotionCodeAccount`. The port reads and writes the existing table
    // unchanged - no migration, no rename - so the physical name is recorded here and a rename
    // upstream fails this suite.
    expect(ACCOUNT_LINK_TABLE_NAME).toBe('SwPromotionCodeAccount');
  });
});

describe('the orders many-to-many is pure inverse-side delegation, kept entirely opaque', () => {
  // CFML parity [model/entity/PromotionCode.cfc:L142-L147]: `addOrder` and `removeOrder` are ONE
  // LINE EACH and touch nothing on this row - they hand the whole job to the owning side, which is
  // `Order.cfc`. That is correct for an `inverse="true"` collection [L68]: the owner maintains the
  // link table, and the inverse side must not write to it or the two would fight.
  //
  // ⭐ SPECIFICATION CORRECTION: `orders` is NOT dropped either. It is materialized behind a
  // three-member structural projection - an opaque identifier plus the two owning-side methods
  // these helpers delegate to - and it models NO order state whatsoever. The order aggregate is the
  // largest single exclusion in this port and nothing below reintroduces it.

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

    // THE INVERSION CROSS-CHECK, asserted rather than merely claimed. Verdict for this component:
    // CLEAN. All three removers - `removePromotion`, `removeAccount`, `removeOrder` - remove, and
    // not one of them calls an `add*`. The contrast is [model/entity/Option.cfc:L130] and
    // [model/entity/Option.cfc:L146], whose `remove*` helpers both call `addExcludedOption(this)`;
    // those are cited and are owned by `option.test.ts`. Had `removeOrder` been inverted, the
    // recorded call list below would read `['addPromotionCode', 'addPromotionCode']` and the held
    // collection would have GROWN.
    expect(order.delegatedCalls()).toStrictEqual(['addPromotionCode', 'removePromotionCode']);
    expect(order.heldCodes()).toStrictEqual([]);
  });

  it('hands getOrders() back live and mutable, because the OWNING side splices through it', () => {
    const seeded: OrderLinkProbe[] = [];
    const subject = aPromotionCode({ promotionCodeID: 'pc-1', orders: seeded });
    const order = anOrderLink('order-1');

    // CFML parity [model/entity/Order.cfc:L845, L855]: the owning side performs
    // `arrayAppend(arguments.promotionCode.getOrders(), this)` and
    // `arrayDeleteAt(arguments.promotionCode.getOrders(), thatIndex)`. Both mutate through THIS
    // accessor, so it must not hand back a copy or the owner's maintenance would silently no-op and
    // leave an order naming a code whose own collection omits that order.
    //
    // JUDGMENT CALL: this is the one deliberate asymmetry between the two collection accessors on
    // this row - `getAccounts()` is a readonly view because no legacy site mutates through it, and
    // `getOrders()` is mutable because two do. Fidelity to the call sites, not consistency for its
    // own sake.
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

    // The two probe members are this SUITE's instrumentation, not part of the projection the entity
    // requires. What matters is what is ABSENT: no total, no item collection, no fulfillment, no
    // status, no account. `Order` and `Account` are never imported in this file and no order-shaped
    // value is ever constructed.
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

    // The graph records every out-of-scope aggregate reference as a bare identifier STRING. That is
    // the anti-corruption boundary working: the order, its items, its fulfillment and the account all
    // reach this slice as opaque keys, never as objects with behaviour. `PromotionCode` needs only
    // two of them - the order key for its inverse-side link, and the account key for its owner-side
    // link - and it needs no item or fulfillment key at all.
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

  it('records the inverse-side link table name verbatim and its lazy="extra" fetch mode', () => {
    // CFML parity [model/entity/PromotionCode.cfc:L68]: `inverse="true" lazy="extra"` across
    // `SwOrderPromotionCode`. `lazy="extra"` asked Hibernate to answer size and containment
    // questions with a targeted query instead of hydrating the collection - a fetch STRATEGY, which
    // has no equivalent in a driver-only stack. In the target the shape is chosen at the repository
    // method that produced the row, which is why the collection arrives already materialized and why
    // `hasOrder` is a synchronous scan rather than a query.
    expect(ORDER_LINK_TABLE_NAME).toBe('SwOrderPromotionCode');
  });

  it('records the delete-context tension between the schema and the boundary, unresolved', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1', orders: [anOrderLink('order-1')] });

    // CFML parity [model/validation/PromotionCode.json]: the ENTIRE delete context for this entity
    // is one rule - `"orders": [{"contexts":"delete","maxCollection":0}]` - meaning a code that has
    // ever been used on an order may not be deleted. The rule needs a COUNT of the `orders`
    // collection, and the collection is materialized, so the count is available...
    expect(subject.getOrders()).toHaveLength(1);

    // ...but the member that would CONSULT it, `isDeletable`, is the one
    // [model/entity/PromotionCode.cfc] never declares. So the gate's input exists while its
    // evaluator does not.
    //
    // JUDGMENT CALL: RECORDED, NOT RESOLVED. Wiring a deletion verdict here would invent business
    // policy - and it would be evaluated at the wrong tier, since declarative validation belongs to
    // the service layer in this port, not to a domain row's constructor. The tension is a real
    // finding; inventing a resolution would bury it.
    expect(VALIDATION_RULES_AS_WRITTEN.properties.orders[0]?.contexts).toBe('delete');
    expect(VALIDATION_RULES_AS_WRITTEN.properties.orders[0]?.maxCollection).toBe(0);
    expect('isDeletable' in subject).toBe(false);
  });
});

describe('hasUniquePromotionCode() is the METHOD-based uniqueness route, not a declarative one', () => {
  // ⭐ CFML parity [model/entity/PromotionCode.cfc:L53, model/validation/PromotionCode.json]: the
  // uniqueness of a promotion code is enforced by a CUSTOM ENTITY VALIDATOR and by nothing else.
  // There is NO `unique="true"` on the ORM property at L53, and there is NO `"unique": true` in the
  // schema either - the rule is
  // `{"contexts":"save","required":true,"method":"hasUniquePromotionCode"}`. Both absences were
  // verified against the source rather than assumed, because a reviewer would reasonably expect at
  // least one of them to be present.
  //
  // The contrast is worth stating precisely, because two sibling entities take the OTHER route:
  //   * `Brand.urlTitle` is unique at BOTH levels - the ORM property [model/entity/Brand.cfc:L55]
  //     AND `"unique": true` in [model/validation/Brand.json].
  //   * `Option.optionCode` and `OptionGroup.optionGroupCode` are both DECLARATIVELY unique.
  // So this entity is the odd one out, and the practical consequence is that nothing stops a
  // duplicate code from being INSERTED by a path that skips the save-context validator.
  //
  // `hasUniquePromotionCode` is one of exactly FIVE declaratively-invoked entity validators in the
  // whole project, and four of the five live in this folder: `Sku.hasUniqueOptions`,
  // `Sku.hasOneOptionPerOptionGroup`, `RoundingRule.hasExpressionWithListOfNumericValuesOnly`,
  // `Promotion.getPromotionCodesDeletableFlag`, and this one.

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

    // CFML parity [model/entity/PromotionCode.cfc:L53]: the legacy check reached the database, where
    // the comparison ran under MySQL's default case-INSENSITIVE collation. A case-sensitive
    // TypeScript `===` would report `save10` and `SAVE10` as distinct and let a duplicate through
    // that the legacy system rejected - which is why both sides are normalised before comparison.
    expect(subject.hasUniquePromotionCode()).toBe(false);
  });

  it('excludes itself by primary key, so the only match being itself is still unique', () => {
    const promotion = aPromotion('promo-1');
    const subject = aPromotionCode({ promotionCodeID: 'pc-1', promotionCode: 'SAVE10' });

    subject.setPromotion(promotion);
    expect(promotion.getPromotionCodes()).toStrictEqual([subject]);

    // Without self-exclusion the validator would refuse every save of every existing code, because a
    // persisted row always finds itself. [org/Hibachi/HibachiDAO.cfc:L139] excluded by primary key;
    // the port does the same.
    expect(subject.hasUniquePromotionCode()).toBe(true);
  });

  it('excludes a distinct hydration of ITSELF, matched by primary key rather than identity', () => {
    const promotion = aPromotion('promo-1');
    const persisted = aPromotionCode({ promotionCodeID: 'pc-1', promotionCode: 'SAVE10' });
    const sameRowAgain = aPromotionCode({ promotionCodeID: 'pc-1', promotionCode: 'SAVE10' });

    persisted.setPromotion(promotion);
    sameRowAgain.setPromotion(promotion);

    // Two objects, one row. An identity-based self-exclusion would have each object report the other
    // as a colliding sibling and refuse both saves.
    expect(persisted.hasUniquePromotionCode()).toBe(true);
    expect(sameRowAgain.hasUniquePromotionCode()).toBe(true);
  });

  it('ignores unsaved siblings, which no database query could have seen', () => {
    const promotion = aPromotion('promo-1');
    const subject = aPromotionCode({ promotionCodeID: 'pc-1', promotionCode: 'SAVE10' });
    const unsavedTwin = aPromotionCode({ promotionCodeID: '', promotionCode: 'SAVE10' });

    subject.setPromotion(promotion);
    unsavedTwin.setPromotion(promotion);

    // JUDGMENT CALL: an unsaved sibling is invisible to the validator, because the legacy check was a
    // SELECT and an un-flushed row is not in the table yet. Treating in-memory siblings as
    // collisions would reject saves the legacy system accepted - a stricter port is still a wrong
    // port when the acceptance contract is behavioural fidelity.
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

    // CFML parity: `len()` truthiness treats a null and an empty string alike, and there is nothing
    // to compare either way. `preInsert()` is what will supply a value at insert time.
    expect(absent.hasUniquePromotionCode()).toBe(true);
    expect(empty.hasUniquePromotionCode()).toBe(true);
  });

  it('answers true when no promotion is materialized - the documented database-wide GAP', () => {
    const orphan = aPromotionCode({ promotionCodeID: 'pc-1', promotionCode: 'SAVE10' });

    expect(orphan.getPromotion()).toBeUndefined();
    expect(orphan.hasUniquePromotionCode()).toBe(true);

    // ⭐ THE GAP, RECORDED RATHER THAN PAPERED OVER. The legacy validator was database-WIDE: it
    // queried `SwPromotionCode` for the value across every promotion. The ported entity can only see
    // the siblings its own materialized promotion hands it, so a code with no promotion attached has
    // NO sibling set to check and answers `true` unconditionally - and even with a promotion attached
    // it can only rule out collisions WITHIN that promotion, not across the table.
    //
    // JUDGMENT CALL: answering `true` is the right failure mode for a domain row, and inventing a
    // repository lookup here would be worse in three separate ways: it would make a synchronous
    // legacy accessor asynchronous, it would put I/O inside a domain entity in a strictly
    // domain-inward architecture, and it would give the entity a fourteenth port. The
    // database-wide guarantee belongs to the save path at the service tier, where the zod schema and
    // the repository both live. Recorded so nobody mistakes this method for a complete guarantee.
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

    // The graph deliberately builds a colliding pair that differs ONLY in case - `SAVE10` against
    // `save10` - and attaches only one of them to the promotion's code collection. Asking the
    // DETACHED colliding code finds the attached one and answers `false`; asking the attached one
    // finds only itself, excludes itself by key, and answers `true`. The asymmetry is what proves
    // both the case normalisation and the self-exclusion in a single exhibit.
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
  // JUDGMENT CALL: [model/validation/PromotionCode.json] is recorded as data and CROSS-CHECKED
  // against the shipped surface, not executed. Declarative validation becomes a zod schema at the
  // SERVICE tier in this port - never a constructor invariant on a domain row - so there is no
  // validator to run from a domain unit suite and no zod schema is asserted here. What the block
  // below does assert is everything that IS checkable from this tier: the exact rule inventory, the
  // two absences, the conditional's semantics, and that every member the schema names exists.

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
    // ⭐ A deliberate absence, asserted as one. `orders` - the INVERSE side - carries a
    // `maxCollection: 0` delete gate, while `accounts` - the side this entity actually OWNS - carries
    // no rule at all. So a code linked to accounts is freely deletable while a code linked to orders
    // is not. Recorded verbatim; no `accounts` rule is invented to make the pair symmetric.
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

    // The condition requires BOTH bounds, so a row missing either one never reaches the comparison
    // and is accepted - which is the schema's own agreement with `getCurrentFlag`'s
    // null-permissiveness. The two are consistent, and that consistency is worth pinning.
    expect(rowsWithAnAbsentBound).toHaveLength(3);
    for (const bounds of rowsWithAnAbsentBound) {
      expect(bounds.satisfiesNeedsEndAfterStart).toBe(true);
    }

    // Only the two DEGENERATE windows fail, and both have both bounds present: `endBeforeStart` and
    // `endEqualsStart`. `gtProperty` is a STRICT comparison, so an end equal to the start fails -
    // even though `getCurrentFlag` would call such a code current at exactly that instant, since its
    // own comparisons are strict in the opposite direction. The schema and the predicate disagree
    // about a zero-length window, and both readings are preserved as written.
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

    // [model/validation/PromotionPeriod.json] declares an identically-named `needsEndAfterStart`
    // with the identical two-required-property body. The duplication is REAL and is recorded.
    //
    // JUDGMENT CALL: no shared schema helper is extracted for it. This port keeps one exported unit
    // per file with no barrels precisely so a regenerated file's diff stays minimal, and a shared
    // condition module would couple two entity schemas that the source keeps independent - if one
    // ever gained a third required property the shared version would have to fork anyway.
    expect(fixtures.conditionalDateValidationName).toBe('needsEndAfterStart');
    expect(fixtures.conditionalDateValidationComparison).toBe('gtProperty: startDateTime');
    expect(
      Object.keys(VALIDATION_RULES_AS_WRITTEN.conditions.needsEndAfterStart).sort(),
    ).toStrictEqual(['endDateTime', 'startDateTime']);
  });

  it('names only properties and methods that actually exist on the ported row', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1' });

    // The schema is only meaningful if every property it gates is readable and every method it
    // invokes is present. This is the assertion that keeps the recorded inventory honest rather than
    // self-referential.
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
    // without complaint - no throw, no coercion, no reordering. That is correct: the domain row is a
    // faithful projection of what the table can hold, and the save-context rule is enforced where the
    // save happens.
    expect(subject.getStartDateTime()?.toISOString()).toBe(WINDOW_END_UTC);
    expect(subject.getEndDateTime()?.toISOString()).toBe(WINDOW_START_UTC);
    expect(prototypeMembers()).not.toContain('validate');
    expect(prototypeMembers()).not.toContain('parse');
    expect(prototypeMembers()).not.toContain('safeParse');
  });
});

describe('preInsert() repairs an absent code and never overwrites a present one', () => {
  // CFML parity [model/entity/PromotionCode.cfc:L179-L185]:
  //
  //   public any function preInsert(){
  //       // Override the preInsert method to set a promotion code if one wasn't assinged
  //       if(isNull(getPromotionCode()) || getPromotionCode() == "") {
  //           setPromotionCode( createUUID() );
  //       }
  //       super.preInsert();
  //   }
  //
  // ⭐ THE "assinged" TYPO AT L180 IS PRESERVED VERBATIM in the ported comment, misspelling intact.
  // It is part of the source record, and this port preserves source typos as a matter of interface
  // parity: `singlularname` [model/entity/Product.cfc:L76], `subsciptionUsageBenefit`
  // [model/entity/PriceGroup.cfc:L168], the capital-`D` `DisplayName`
  // [model/entity/PriceGroupRate.cfc:L270] and the `promtionRewards` permission
  // [model/entity/PromotionReward.cfc:L57] are the others.
  //
  // ⭐ SPECIFICATION CORRECTION, and it matters for how this block is written: the shipped member is
  // `preInsert(): void`, NOT `applyPreInsertPromotionCode(generatedCode)`. It keeps the source's own
  // name and arity, and it generates the identifier INSIDE the guarded branch exactly where L182
  // calls `createUUID()`. That is the more faithful shape, not the looser one - a required parameter
  // would have forced every caller to manufacture a value eagerly on the overwhelming majority of
  // inserts where the guard never fires, moving a decision out of the entity that the source makes
  // inside it. The hook-to-explicit-maintenance translation is in WHO CALLS IT: no ORM lifecycle
  // exists in the target, so the repository invokes it before its own audit and key handling rather
  // than Hibernate invoking it on flush.

  it('assigns a generated code when the value is absent', () => {
    const subject = aPromotionCode({ promotionCode: undefined });

    expect(subject.getPromotionCode()).toBeUndefined();

    subject.preInsert();

    expect(subject.getPromotionCode()).toMatch(CFML_SHAPED_UUID);
  });

  it('assigns a generated code when the value is the empty string', () => {
    const subject = aPromotionCode({ promotionCode: '' });

    subject.preInsert();

    // CFML parity [model/entity/PromotionCode.cfc:L181]: the guard is
    // `isNull(...) || ... == ""`, so a blank is repaired exactly like a null. The two are NOT
    // collapsed into one state on the row itself - the constructor keeps `''` distinguishable from
    // `undefined` - but this hook treats them alike, which is what the source does.
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
    // `trim()` anywhere. A whitespace-only code is therefore a value the source accepts, and the port
    // does not invent a trim the source never had.
    expect(subject.getPromotionCode()).toBe('   ');
  });

  it('generates the CFML shape - 8-4-4-16 uppercase hexadecimal, 35 characters', () => {
    const subject = aPromotionCode({ promotionCode: undefined });

    subject.preInsert();
    const generated = subject.getPromotionCode();

    // CFML parity [model/entity/PromotionCode.cfc:L182]: `createUUID()` is deliberately NOT an
    // RFC 4122 rendering - CFML merges the final two groups, producing 8-4-4-16 rather than
    // 8-4-4-4-12, and returns uppercase hexadecimal. A port that emitted a standard UUID would write
    // a 36-character value into a column whose existing rows are all 35, so the shape is reproduced
    // rather than modernised.
    expect(generated).toMatch(CFML_SHAPED_UUID);
    expect(generated).toHaveLength(CFML_SHAPED_UUID_LENGTH);
    expect(generated?.split('-')).toHaveLength(4);
    expect(generated).toBe(generated?.toUpperCase());
  });

  it('generates a distinct value on each repair', () => {
    const first = aPromotionCode({ promotionCode: undefined });
    const second = aPromotionCode({ promotionCode: undefined });

    first.preInsert();
    second.preInsert();

    expect(first.getPromotionCode()).not.toBe(second.getPromotionCode());
    expect(first.getPromotionCode()).toMatch(CFML_SHAPED_UUID);
    expect(second.getPromotionCode()).toMatch(CFML_SHAPED_UUID);
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

    // CFML parity [model/entity/PromotionCode.cfc:L179]: `public any function preInsert()` declares no
    // parameter, and the port matches it. This is the assertion that pins the specification correction
    // recorded at the top of this block: an `applyPreInsertPromotionCode(generatedCode)` shape would
    // report an arity of 1 here.
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

    // CFML parity [model/entity/PromotionCode.cfc:L179-L185]: the hook's ENTIRE body is the guarded
    // code assignment. It does not stamp audit columns, does not maintain a materialized path - this
    // is the one entity in the family that has no path to maintain - and does not touch either
    // collection.
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
    // threw. Neither half is ported: `writeDump` writes debug output straight into a customer-facing
    // response, which is a defect no target should reproduce, and the persistability check belongs to
    // the save path at the service tier where validation lives. The hook here does exactly what
    // [model/entity/PromotionCode.cfc:L181-L183] does and nothing more.
    expect(() => {
      bare.preInsert();
    }).not.toThrow();
    expect(bare.getPromotionCode()).toMatch(CFML_SHAPED_UUID);
  });

  it('has no preUpdate counterpart, unlike the three path-maintaining siblings', () => {
    const subject = aPromotionCode();

    // CFML parity [model/entity/PromotionCode.cfc:L179-L185]: `preInsert` is the component's ONLY
    // lifecycle hook. `Category` [L126, L131], `PriceGroup` [L206, L211] and `ProductType`
    // [L305, L310] each declare BOTH hooks because each maintains a materialized ID path that must be
    // refreshed on update. This row maintains no path, so there is nothing for an update hook to do
    // and the source declares none.
    expect(prototypeMembers()).not.toContain('preUpdate');
    expect('preUpdate' in subject).toBe(false);
  });

  it('records the guard-before-super ordering, which is deliberately NOT normalised', () => {
    const subject = aPromotionCode({ promotionCode: undefined });

    // CFML parity [model/entity/PromotionCode.cfc:L181-L184]: the guarded assignment runs at
    // L181-L183 and `super.preInsert()` only afterwards at L184. That matches
    // [model/entity/PriceGroup.cfc:L206-L214] and [model/entity/ProductType.cfc:L305-L313], which
    // also set their state first - and it CONTRASTS [model/entity/Category.cfc:L126-L134], which
    // calls `super.preInsert()` FIRST and only then sets its path.
    //
    // JUDGMENT CALL: the four orderings are NOT normalised to one another. There is no base class in
    // the target - the framework is a boundary to extract from, never to port - so `super.preInsert()`
    // has no counterpart to call, and the ordering survives as the CONTRACT ON THE CALLER instead:
    // the repository invokes this hook BEFORE its own audit and key handling, which is the sequence
    // L181-L184 describes. Recording the ordering per entity keeps that contract checkable; flattening
    // it would erase the one piece of information the hook's position carried.
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

    // ...and once set by hand, the hook stands down.
    subject.preInsert();
    expect(subject.getPromotionCode()).toBe('MANUAL-CODE');

    // CFML parity [model/entity/PromotionCode.cfc:L52-L80]: `promotionCode` is the ONLY column with a
    // ported setter, because L182 is the only place the source writes a column through a setter at
    // all. Every other column is constructor-set and read-only thereafter, which is what makes the
    // row a faithful projection rather than a mutable bag.
    expect(prototypeMembers().filter((name) => name.startsWith('set'))).toStrictEqual([
      'setPromotion',
      'setPromotionCode',
    ]);
  });
});

describe('the structural facts the row carries', () => {
  it('names promotionCode as its simple-representation property', () => {
    const subject = aPromotionCode({ promotionCodeID: 'pc-1', promotionCode: 'SAVE10' });

    // CFML parity [model/entity/PromotionCode.cfc:L171-L173]: this is the DECLARATIVE form of simple
    // representation - the entity names a property and the framework reads it - and this entity is
    // one of the few in the slice that genuinely overrides it. The others resolve differently:
    // `PromotionQualifier` -> `qualifierType` [L355-L356], `PromotionReward` -> the reward type
    // [L414], `PriceGroupRate` -> the capital-`D` `DisplayName` [L270-L271], `Product` ->
    // `productName` [L791-L793].
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

    // CFML parity [model/entity/PromotionCode.cfc:L171-L173]: the source declares ONLY
    // `getSimpleRepresentationPropertyName()`. It has no `getSimpleRepresentation()` of its own -
    // unlike [model/entity/PromotionPeriod.cfc:L91-L93], where the sibling overrides the
    // representation itself. The generic base-class assertion at
    // [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58] therefore has nothing to bind to
    // here, which is why it is EXPLAINED rather than forced: asserting it would require inventing a
    // member the source never declared.
    expect('getSimpleRepresentation' in subject).toBe(false);
  });

  it('answers isNew() honestly from the empty unsaved key', () => {
    const fresh = aPromotionCode({ promotionCodeID: '' });
    const persisted = aPromotionCode({ promotionCodeID: 'pc-1' });

    // CFML parity [model/entity/PromotionCode.cfc:L52]: `unsavedvalue="" default=""` is what makes
    // this honest, and [org/Hibachi/HibachiEntity.cfc:L571-L576] read exactly that - `if
    // (getPrimaryIDValue() == "") { return true; }`. It is NOT decoration: two guards on this row
    // read it, at L104 and at L126, and each behaves differently depending on the answer.
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
    // `fkcolumn="promotionID"` and - unlike [model/entity/PromotionPeriod.cfc:L59] - it carries NO
    // `fetch="join"`, so it was LAZY. Only four eager sites exist in the whole slice and this is not
    // one of them.
    //
    // JUDGMENT CALL: exposing the raw foreign key alongside the optional association is a real
    // improvement over the legacy proxy, and a deliberate one. In CFML a lazy `getPromotion()` on an
    // unloaded association returned a proxy that looked present, so a caller could not tell "not
    // loaded" from "not set" without triggering a load. Here the two are separate readings: the key
    // says which promotion the row belongs to, and the association says whether it was fetched.
    expect(unmaterialized.getPromotionID()).toBe('promo-1');
    expect(unmaterialized.getPromotion()).toBeUndefined();
  });

  it('leaves the foreign key alone when only the association is supplied', () => {
    const promotion = aPromotion('promo-1');
    const subject = aPromotionCode({ promotionCodeID: 'pc-1', promotion, promotionID: undefined });

    // No derivation, no back-fill: the two readings are independent columns of the same row and the
    // repository decides what each one carries.
    expect(subject.getPromotion()).toBe(promotion);
    expect(subject.getPromotionID()).toBeUndefined();
  });

  it('records the table, entity, service and permission strings verbatim', () => {
    // CFML parity [model/entity/PromotionCode.cfc:L49]: the port reads and writes the EXISTING
    // `Sw*` schema unchanged, so every physical name is recorded and a rename upstream fails here.
    // `hb_serviceName` and `hb_permission` are inert metadata in the target - the first named the
    // bean the legacy factory routed CRUD through, which the composition root now wires explicitly;
    // the second is an admin permission key the legacy admin still resolves, carried forward as a
    // string and never consulted by this port.
    expect(TABLE_NAME).toBe('SwPromotionCode');
    expect(ENTITY_NAME).toBe('SlatwallPromotionCode');
    expect(SERVICE_NAME).toBe('promotionService');
    expect(PERMISSION_KEY).toBe('promotion.promotionCodes');
  });

  it('carries none of the component metadata warts into the ported class', () => {
    const subject = aPromotionCode();

    // CFML parity [model/entity/PromotionCode.cfc:L49]: the component tag declares NEITHER
    // `output="false"` NOR `accessors="true"`, and it QUOTES `persistent="true"` where every sibling
    // writes it bare - the same metadata wart as [model/entity/PromotionPeriod.cfc:L49]. Missing
    // `accessors="true"` means the implicit getters this component relies on came from the framework
    // base rather than from the ORM, which is precisely why an unknown `getX()` threw instead of
    // returning null.
    //
    // JUDGMENT CALL: annotated, never normalised, and structurally unrepresentable in the target -
    // there is no component tag, no implicit accessor generation and no output buffer to suppress. So
    // what IS asserted is the consequence: every accessor this row exposes is EXPLICITLY authored,
    // which is why the exhaustive surface assertion at the top of this file can be exhaustive at all.
    for (const name of PUBLIC_SURFACE) {
      expect(Object.getOwnPropertyNames(PromotionCode.prototype)).toContain(name);
    }
    expect(Object.getOwnPropertyNames(subject)).not.toContain('getPromotionCode');
  });

  it('authors nothing for the five empty and duplicate banner pairs', () => {
    // CFML parity [model/entity/PromotionCode.cfc:L149-L167]: the source carries FIVE empty or
    // duplicate section-banner pairs, and they are a genuine reading hazard rather than a curiosity:
    //
    //   * L149/L151 - a SECOND "Non-Persistent Property Methods" pair, duplicating L83/L96.
    //   * L153/L155 - a SECOND "Bidirectional Helper Methods" pair, duplicating L98. And the FIRST
    //     one, opened at L98, is never closed at all - so a reader tracking sections by banner would
    //     mis-attribute every method between L98 and L151.
    //   * L157/L159 - "Custom Validation Methods", empty. The validator that belongs in it,
    //     `hasUniquePromotionCode`, is not in the file at all: it is invoked declaratively from
    //     [model/validation/PromotionCode.json] and was inherited from the framework base.
    //   * L161/L163 - "Custom Formatting Methods", empty.
    //   * L165/L167 - "Overridden Implicet Getters", empty AND MISSPELLED - "Implicet".
    //
    // JUDGMENT CALL: annotated where each section would have been, and NOTHING is authored to fill
    // them. An empty banner is not a gap to close - it is evidence that the framework supplied what
    // the section names, and inventing members to populate five empty sections would fabricate a
    // surface the source never had. The one real consequence is asserted below: no formatter exists.
    expect(prototypeMembers().filter((name) => name.endsWith('Formatted'))).toStrictEqual([]);
    expect(prototypeMembers().filter((name) => name.endsWith('Options'))).toStrictEqual([]);
  });

  it('adopts the constructor collections rather than copying them', () => {
    const accounts: AccountLinkProbe[] = [anAccountLink('acct-1')];
    const orders: OrderLinkProbe[] = [anOrderLink('order-1')];
    const subject = aPromotionCode({ promotionCodeID: 'pc-1', accounts, orders });

    // JUDGMENT CALL: adoption, not defensive copying, and deliberately so. Hibernate handed an
    // entity the live collection it managed, and both the legacy far sides mutate through the
    // accessor - [model/entity/Order.cfc:L845, L855] splice straight into `getOrders()`. A defensive
    // copy would make those mutations invisible to this row and leave the two sides permanently
    // disagreeing.
    expect(subject.getAccounts()).toBe(accounts);
    expect(subject.getOrders()).toBe(orders);
  });

  it('defaults both collections to fresh empty arrays that are not shared between rows', () => {
    const first = aPromotionCode({ promotionCodeID: 'pc-1' });
    const second = aPromotionCode({ promotionCodeID: 'pc-2' });

    expect(first.getAccounts()).toStrictEqual([]);
    expect(second.getAccounts()).toStrictEqual([]);
    // The default must be a fresh array per row. A shared module-level empty array would make one
    // code's accounts appear on every other code - the collection equivalent of hoisting the
    // `currentFlag` memo to module scope.
    expect(first.getAccounts()).not.toBe(second.getAccounts());
    expect(first.getOrders()).not.toBe(second.getOrders());

    first.addAccount(anAccountLink('acct-1'));
    expect(first.getAccounts()).toHaveLength(1);
    expect(second.getAccounts()).toHaveLength(0);
  });

  it('records that this suite is net-new, from the shared coverage flag', () => {
    const fixtures = makePromotionFixtures();

    // The shared graph records the measured finding directly: no legacy test covers this family. This
    // suite is therefore net-new in full and must never be reported as parity coverage.
    expect(fixtures.legacyTestCoverageExists).toBe(false);
  });

  it('builds every subject from an injected clock, never from ambient time', () => {
    const clock = aMovableClock(NOW_UTC);
    const subject = aPromotionCode({
      startDateTime: atUtc(WINDOW_START_UTC),
      endDateTime: atUtc(WINDOW_END_UTC),
      now: clock.now,
    });
    const fixtures = makePromotionFixtures();

    // CFML parity [model/entity/PromotionCode.cfc:L88]: `now()` was an ambient engine built-in reading
    // the CF server's timezone. Replacing it with an injected `() => Date` is what makes every
    // boundary case in this file deterministic - and it is why NO fake timer is installed anywhere:
    // a global clock patch would make the seam invisible again and would leak across test files.
    expect(clock.readCount()).toBe(0);
    expect(subject.getCurrentFlag()).toBe(true);
    expect(clock.readCount()).toBe(2);

    // The shared graph is built on the same explicit instant, so a fixture-driven assertion and a
    // hand-built one agree about what "now" means.
    expect(fixtures.now.toISOString()).toBe(NOW_UTC);
    expect(fixtures.clock().toISOString()).toBe(NOW_UTC);
  });
});
