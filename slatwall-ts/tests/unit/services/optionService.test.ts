// ---------------------------------------------------------------------------
// slatwall-ts - unit suite pinning `src/services/optionService.ts`
//
// ---------------------------------------------------------------------------
// 100% NET-NEW COVERAGE - NEVER TO BE PRESENTED AS PARITY
// ---------------------------------------------------------------------------
// Not one assertion below has a legacy antecedent. `meta/tests/unit/service/`
// holds exactly four components - AccountServiceTest, HibachiServiceTest,
// PaymentServiceTest and UtilityRBServiceTest - none of them in scope and none
// of them touching the option service, so there is NO legacy
// `OptionServiceTest` anywhere under `meta/tests/`. The data tier is no better
// off: `meta/tests/unit/dao/` contains only `AccountDAOTest` and
// `PaymentDAOTest`, so nothing covers `model/dao/OptionDAO.cfc` either. There is
// no antecedent to extend, this suite is net-new in full, and saying so is a
// requirement rather than a courtesy - presenting net-new coverage as parity
// would fail the traceability gate.
//
// ! WORTH RECORDING ABOUT THE LEGACY SUITE ITSELF. Only three legacy test files
// touch the migrated slice at all, and every legacy "unit" test boots the real
// Application, the ORM and the DI container - with its teardown commented out -
// so nothing in that suite is isolated in the modern sense. Traceability in this
// project therefore means the same assertions about the same behaviour, never
// the same test architecture. This file boots nothing: it constructs two plain
// objects and calls three methods.
//
// ---------------------------------------------------------------------------
// WHAT IS UNDER TEST
// ---------------------------------------------------------------------------
// `model/service/OptionService.cfc` is 99 lines and declares exactly THREE
// functions, which together are the whole observable surface of the ported
// class:
//
//   L55-L63  getOptionsForSelect(options)                      SYNCHRONOUS, pure
//   L72-L74  getUnusedProductOptions(productID, listString)    async passthrough
//   L76-L78  getUnusedProductOptionGroups(listString)          async passthrough
//
// Everything else a caller might expect of an option service - `getOption`,
// `newOption`, `saveOption`, `deleteOption`, `validateOption`, a smart-list
// accessor, and the same set again for option GROUPS, since
// [model/entity/OptionGroup.cfc:L49] names this same component as its service -
// arrived by inheritance from the framework base component, which is
// deliberately not ported. Its absence from the shipped class is faithful rather
// than incomplete, so nothing below asserts that any of it exists, and the
// surface case near the top asserts that none of it was invented.
//
// THIS SUITE IS THE FOLDER'S FIRST SYNC/ASYNC MIX, and that is the fact it
// exists to pin. One method returns an array and two return promises, decided by
// a rule rather than by taste: a method becomes `async` if and only if its
// legacy body reaches the DAO or the ORM. `getOptionsForSelect` reaches neither -
// it reads two accessors off objects the caller already holds - so it is called
// below WITHOUT `await`, from tests that are not `async` at all. The two
// passthroughs are awaited. Invoking each method exactly as shipped is what
// enforces the boundary; a suite that awaited everything would hide a violation
// of it rather than catch one.
//
// ---------------------------------------------------------------------------
// THE SCOPE DECISION THIS SUITE PINS - ONE INJECTION IS DEAD
// ---------------------------------------------------------------------------
// LEGACY-NOTE [model/service/OptionService.cfc:L53]: the legacy component
// declares a productService DI/1 property that no method ever uses.
// The dead injection is dropped rather than ported, so the target constructor
// takes only the option repository port; this suite deliberately supplies no
// productService double.
//
// The claim is checkable rather than assumed: sweeping the 99-line component for
// `productService` returns exactly one hit, and that hit IS the L53 declaration.
// Under DI/1 the declaration alone was enough to have a collaborator resolved
// and injected, so an edge that no code used stayed invisible; naming
// collaborators as constructor parameters is what makes an unused one apparent.
// Wiring one here would also have dragged in the product service's own eight
// declared collaborators [model/service/ProductService.cfc:L52-L60] just to
// build an option select list.
//
// Collaborator counts across the slice, for calibration only - nothing below
// asserts on them: BrandService 1, OptionService 2 declared / 1 real,
// PriceGroupService 3, PromotionService 3, RoundingRuleService 1, SkuService 5
// declared / 4 real, ProductService 8 declared / 6 real, and the out-of-scope
// OrderService 16. The "16+" figure that gets quoted about this migration is a
// property of that one out-of-scope component, not of anything tested here.
//
// ---------------------------------------------------------------------------
// THE IN-MEMORY DOUBLE IDIOM, FOLLOWED AS THE SIBLING SUITE ESTABLISHED IT
// ---------------------------------------------------------------------------
// The one port is replaced by a hand-written in-memory double declared inline in
// this file. Four properties make it a double rather than a mock, and each is
// load-bearing:
//
//   1. It is TYPED against the shipped port, and its two recording arrays are
//      typed with `Parameters<...>` taken off that port, so a change to the
//      contract breaks compilation here instead of drifting silently past a
//      permissive mock.
//   2. It RECORDS rather than asserts - and it records the whole ARGUMENT LIST,
//      not a re-assembled copy of it, which is what lets the cases below prove
//      how many arguments arrived as well as which.
//   3. It is PURE and DETERMINISTIC - no randomness, no clock reading, no
//      counter that survives a case - so no assertion can pass by accident.
//   4. It is CONSTRUCTED FRESH in `beforeEach`, so no state leaks between cases.
//      There is no mutable module-level state in this file at all.
//
// ---------------------------------------------------------------------------
// WHAT THIS SUITE DELIBERATELY DOES NOT DO, EACH STATED RATHER THAN LEFT SILENT
// ---------------------------------------------------------------------------
//   * NO SQL, PARAMETERISED OR OTHERWISE - AND THAT IS NOT A GAP. The project
//     holds every query to prepared statements, which is what preserves the
//     injection-safety guarantee the legacy `cfqueryparam` gave. That obligation
//     cannot be discharged from here, because the unit under test issues no
//     query at all: two of its three methods hand their arguments to a PORT and
//     return what it answers. The two `<cfquery>` bodies at
//     [model/dao/OptionDAO.cfc:L51-L92] and [model/dao/OptionDAO.cfc:L94-L117]
//     are the SQL source of truth, and reproducing them - including binding each
//     parsed element of the comma list as its own parameter, per
//     [model/dao/OptionDAO.cfc:L68] and [model/dao/OptionDAO.cfc:L107] - belongs
//     to the MySQL adapter. Statement-text and parameter-binding assertions
//     therefore belong EXCLUSIVELY to the sibling-owned
//     `tests/integration/repositories/` tier, where a real statement exists to
//     assert against. This unit tier asserts only that the port was called with
//     the right arguments and that its result is what came back. Recording that
//     here is the difference between "not applicable" and "forgotten".
//   * NO DATABASE, NO NETWORK, NO FILESYSTEM AND NO ENVIRONMENT READ. The one
//     collaborator is an in-memory double, so this suite passes with a
//     completely empty environment and no `.env` present. `tests/setup.ts` loads
//     dotenv defensively for the tiers that need it; nothing here reads what it
//     loaded, and no credential, host name or connection value appears anywhere
//     in this file.
//   * NO MONETARY VALUE IS TOUCHED. There is no price, discount, rate or total
//     anywhere in this component, so the project rule that all money arithmetic
//     passes through the `Money` value object is vacuous here. Every number below
//     is either a count of recorded calls or an entity sort ordinal, and no
//     arithmetic of any kind is performed on one. Stated so that nobody later
//     introduces a raw numeric price here believing no rule applies.
//   * NO MOCKING LIBRARY AND NO SPY. `package.json` pins thirteen packages - three
//     runtime, ten development - and this
//     suite adds none. `vi` ships inside the runner and would have been
//     permitted, but hand-written doubles are the idiom here, so `vi` is not
//     imported at all - which also means this suite owes no spy restoration
//     beyond the global `afterEach` that `tests/setup.ts` already registers.
//   * NO SHARED FIXTURE MODULE. Options and option groups are constructed inline
//     from the shipped entities. There is deliberately no `optionFixtures.ts`
//     among the fixture modules and none is created here: inline construction
//     inside the consuming suite is the intended shape.
//   * NO IMPORT THAT CROSSES THE LAYER BOUNDARY OUTWARD. Nothing here comes from
//     `src/repositories/**`, `src/handlers/**` or `src/integrations/**`. The
//     `no-restricted-imports` block that makes that a build failure is scoped to
//     `src/domain/**` and does NOT fence `tests/**`, which is exactly why it is
//     worth stating: a test file is the one place the boundary could be walked
//     around without the linter objecting, and it is not walked around here.
//     Five imports in total - the runner, the two entities, the port and the
//     service - and the composition root, a container and a service locator are
//     all absent because none is needed to construct the subject.
//   * NO EXPORT, NO BARREL. This file exports nothing, and no helper module or
//     shared base suite is created or imported.
//   * NO MXUNIT HARNESS. The legacy assertions are carried; the legacy harness is
//     not. There is no assertion shim, no set-up/tear-down base component
//     analogue, no test-helper class port and no browser-driver analogue.
//   * NO LICENCE HEADER. Attribution is carried once, in
//     `slatwall-ts/NOTICE-GPL.md`, and is never restated per file.
//   * NO CLAIM ABOUT EXECUTION CHARACTERISTICS. No timing assertion, no repeat
//     count standing in for one, and no runner timeout read as a service level.
//     The legacy system publishes no such requirement and none is invented here.
//
// ---------------------------------------------------------------------------
// NO USER RULES WERE PROVIDED
// ---------------------------------------------------------------------------
// The project rules document says exactly that, and it was read in full rather
// than sampled. No rule has been invented to fill the gap, no file enters scope
// by rule mandate, and the absence is NOT licence to lower the bar: the
// enterprise substitute standard applies at full strength to a suite covering a
// 99-line service. Concretely, here that means maximal strictness with no `any`,
// no suppression comment and no non-null assertion; legacy method names asserted
// verbatim; no dependency outside the fixed pinned set; no credential,
// connection value, host name or table name present as a value; every judgment
// call annotated at the point where it was made; and every deliberate omission
// written down instead of left to be inferred.
//
// ---------------------------------------------------------------------------
// WHY NO `LEGACY-DEFECT` MARKER APPEARS BELOW - AN ABSENCE, NOT AN OVERSIGHT
// ---------------------------------------------------------------------------
// `model/service/OptionService.cfc` owns no numbered entry in the project defect
// register. The warts it does own are secondary-register items and each is
// recorded next to the assertion that meets it: the misnamed `sortedOptions`
// local [L56], the un-var'd loop counter [L58], and a duplicated section banner
// where L70 and L80 both read `START: DAO Passthrough` so that section never
// closes. Writing a `LEGACY-DEFECT` marker for any of those would falsely
// promote it to a numbered defect, so none is written; the marker forms that do
// appear here are LEGACY-NOTE, JUDGMENT CALL and CFML parity.
//
// This suite also spends from none of the project budget ledgers: no signature
// reshaping, no visibility widening, no signature widening and no deliberate
// divergence. All three methods are called by their verbatim legacy names with
// their shipped parameter lists, all three were already `public`, and every
// expectation below is the legacy outcome.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it } from 'vitest';

import { Option } from '../../../src/domain/entities/option.js';
import { OptionGroup } from '../../../src/domain/entities/optionGroup.js';
import type { OptionRepository, SelectOption } from '../../../src/domain/ports/optionRepository.js';
import { OptionService } from '../../../src/services/optionService.js';

// ---------------------------------------------------------------------------
// Argument-list types, derived from the shipped port rather than restated
// ---------------------------------------------------------------------------

// JUDGMENT CALL: both recording arrays below are typed with `Parameters<...>`
// read off the shipped port instead of with a hand-written record of named
// fields. Two reasons, and the second is the stronger one. First, a derived type
// cannot drift: rename a parameter, reorder the pair, or add a third, and this
// file stops compiling - which is exactly the signal a suite should give rather
// than continuing to pass against a contract that has moved. Second, recording
// the ARGUMENT LIST rather than a re-assembled object means the recorded value
// reflects what the service actually passed, including how MANY values it
// passed. A double that unpacked its parameters into a fresh object would report
// the shape IT declared and could never reveal a stray extra argument.
type UnusedProductOptionsArgs = Parameters<OptionRepository['getUnusedProductOptions']>;

type UnusedProductOptionGroupsArgs = Parameters<OptionRepository['getUnusedProductOptionGroups']>;

// ---------------------------------------------------------------------------
// Deterministic synthetic values
// ---------------------------------------------------------------------------

/**
 * Product whose SKUs the legacy `NOT EXISTS` subquery checks
 * [model/dao/OptionDAO.cfc:L78].
 *
 * Obviously synthetic, so no assertion can pass because a value happened to look
 * plausible, and deliberately NOT identifier-shaped in the legacy sense - the
 * ported service performs no format check on it, exactly as the legacy body
 * performed none, and pinning a UUID here would imply a validation that does not
 * exist.
 */
const PRODUCT_ID = 'product-under-option-assignment';

/**
 * A CFML comma-delimited list of option group identifiers, with THREE elements
 * and no surrounding whitespace.
 *
 * The service must forward this byte for byte. Splitting it is the adapter's job,
 * exactly as it was the DAO's, which is why this suite imports no list helper.
 */
const MULTI_ID_LIST = 'og-size,og-colour,og-fit';

/** The same parameter carrying a single identifier, so no delimiter is present at all. */
const SINGLE_ID_LIST = 'og-size';

/**
 * The same parameter carrying the empty string.
 *
 * Neither legacy function guards an empty list - no length test, no default, no
 * branch - so the raw argument reaches a list-expanded bound parameter as it
 * stands. Because the two statements use the list with OPPOSITE polarity, `IN` at
 * [model/dao/OptionDAO.cfc:L68] against `NOT IN` at [model/dao/OptionDAO.cfc:L107],
 * an empty list leaves one query matching nothing and the other excluding
 * nothing. That asymmetry belongs to the caller and to the adapter; what the
 * SERVICE owes is to forward the empty string unchanged, and the cases below pin
 * exactly that.
 */
const EMPTY_ID_LIST = '';

// ---------------------------------------------------------------------------
// Inline entity construction
// ---------------------------------------------------------------------------

/**
 * Builds an option group with the two columns this suite reads and inert values
 * everywhere else.
 *
 * `sortOrder` is an entity sort ordinal rather than a quantity, and nothing here
 * performs arithmetic on it; the group's own `options` association is left empty
 * because no method under test traverses it, and inventing bidirectional wiring
 * would add a collaboration this suite does not describe.
 *
 * The sort tie-breaker is supplied as a FIXED function rather than left to
 * default. The shipped default draws a random number, and although no code path
 * exercised here reaches a sort at all, supplying a constant makes "no random
 * source anywhere in this suite" true by construction instead of true by
 * argument.
 */
function anOptionGroup(init: {
  readonly optionGroupID: string;
  readonly optionGroupName: string | undefined;
}): OptionGroup {
  return new OptionGroup({
    optionGroupID: init.optionGroupID,
    optionGroupName: init.optionGroupName,
    optionGroupCode: undefined,
    optionGroupImage: undefined,
    optionGroupDescription: undefined,
    imageGroupFlag: false,
    sortOrder: 1,
    remoteID: undefined,
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
    options: [],
    optionSortTieBreaker: () => 1,
  });
}

/**
 * Builds an option with the two columns `getOptionsForSelect` reads, plus an
 * optional owning group for the one case that proves the group is NOT read.
 *
 * `optionName` is deliberately required-but-nullable here, mirroring the entity:
 * [model/entity/Option.cfc:L54] declares `optionName ormtype="string"` with no
 * `notnull` and no default, so a caller must decide the absent case rather than
 * have it defaulted out of sight. Every optional key of the shipped constructor
 * is OMITTED rather than assigned `undefined`, because the strict profile treats
 * an absent key and a present-but-undefined key as different states.
 */
function anOption(init: {
  readonly optionID: string;
  readonly optionName: string | undefined;
  readonly optionGroup?: OptionGroup;
}): Option {
  return new Option({
    optionID: init.optionID,
    optionCode: undefined,
    optionName: init.optionName,
    optionDescription: undefined,
    sortOrder: undefined,
    optionGroup: init.optionGroup,
    defaultImageID: undefined,
    remoteID: undefined,
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
  });
}

// ---------------------------------------------------------------------------
// The seeded repository rows
// ---------------------------------------------------------------------------

// JUDGMENT CALL: the rows the double answers with are built from real entities
// through the two helpers below, rather than written as bare literals, so the
// seeded data carries the SHAPE the legacy queries actually produce. Neither
// helper is a port of adapter logic and nothing below asserts that the SERVICE
// composes either label - it does not, and the case named "reads the option's own
// name" proves it. Reproducing the two projections for real belongs to the MySQL
// adapter, and asserting them belongs to `tests/integration/repositories/`.

/**
 * One select row as `getUnusedProductOptions` builds it
 * [model/dao/OptionDAO.cfc:L88]: the label is the COMPOSITE
 * `"<optionGroupName> - <optionName>"` and the value is the option identifier.
 *
 * Absent names resolve to the empty string, which is what the legacy runtime put
 * in the interpolated label for a NULL column on the engines Slatwall targets.
 */
function daoStyleOptionRow(option: Option): SelectOption {
  const groupName = option.getOptionGroup()?.getOptionGroupName() ?? '';
  const optionName = option.getOptionName() ?? '';

  return { name: `${groupName} - ${optionName}`, value: option.getOptionID() };
}

/**
 * One select row as `getUnusedProductOptionGroups` builds it
 * [model/dao/OptionDAO.cfc:L113]: the label is the group name ALONE - no
 * composition, no separator - and the value is the group identifier.
 */
function daoStyleOptionGroupRow(optionGroup: OptionGroup): SelectOption {
  return { name: optionGroup.getOptionGroupName() ?? '', value: optionGroup.getOptionGroupID() };
}

// ---------------------------------------------------------------------------
// The in-memory double
// ---------------------------------------------------------------------------

/**
 * In-memory stand-in for the option repository port.
 *
 * Replaces the legacy `property name="optionDAO" type="any";`
 * [model/service/OptionService.cfc:L51] - the component's one and only LIVE
 * collaborator, which DI/1 resolved by scanning component properties at run time
 * and which the ported class takes as an explicit constructor argument instead.
 *
 * Implements EXACTLY the port's two members and no third. Each records the whole
 * argument list it received, in arrival order, and answers a pre-seeded array by
 * identity - so a case can assert HOW MANY calls fired, HOW MANY arguments each
 * carried, WHICH values arrived, and that the result travelled back untouched.
 *
 * Neither method is `async`, deliberately: both answer a promise, and returning
 * an already-resolved one keeps the double free of an `await` it has no work to
 * wait for.
 */
class RecordingOptionRepository implements OptionRepository {
  readonly unusedOptionCalls: UnusedProductOptionsArgs[] = [];

  readonly unusedOptionGroupCalls: UnusedProductOptionGroupsArgs[] = [];

  constructor(
    private readonly unusedOptionRows: readonly SelectOption[],
    private readonly unusedOptionGroupRows: readonly SelectOption[],
  ) {}

  getUnusedProductOptions(...args: UnusedProductOptionsArgs): Promise<readonly SelectOption[]> {
    this.unusedOptionCalls.push(args);

    return Promise.resolve(this.unusedOptionRows);
  }

  getUnusedProductOptionGroups(
    ...args: UnusedProductOptionGroupsArgs
  ): Promise<readonly SelectOption[]> {
    this.unusedOptionGroupCalls.push(args);

    return Promise.resolve(this.unusedOptionGroupRows);
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('OptionService', () => {
  let optionRepository: RecordingOptionRepository;
  let service: OptionService;
  let seededOptionRows: readonly SelectOption[];
  let seededOptionGroupRows: readonly SelectOption[];

  beforeEach(() => {
    const sizeGroup = anOptionGroup({ optionGroupID: 'og-size', optionGroupName: 'Size' });
    const colourGroup = anOptionGroup({ optionGroupID: 'og-colour', optionGroupName: 'Colour' });
    const large = anOption({ optionID: 'opt-large', optionName: 'Large', optionGroup: sizeGroup });
    const teal = anOption({ optionID: 'opt-teal', optionName: 'Teal', optionGroup: colourGroup });

    // Seeded in the shape each legacy query produces, and in the order each legacy
    // `ORDER BY` would have produced it - by group name then option name for the option
    // query [model/dao/OptionDAO.cfc:L82-L84], by group name for the group query
    // [model/dao/OptionDAO.cfc:L108-L109]. Ordering the seed that way is presentation
    // only: the service re-orders nothing, and no case below asserts that it does.
    seededOptionRows = [daoStyleOptionRow(teal), daoStyleOptionRow(large)];
    seededOptionGroupRows = [
      daoStyleOptionGroupRow(colourGroup),
      daoStyleOptionGroupRow(sizeGroup),
    ];

    optionRepository = new RecordingOptionRepository(seededOptionRows, seededOptionGroupRows);

    // JUDGMENT CALL: the collaborator is handed to the constructor, and that is the whole
    // wiring story. The legacy bodies reached it through `getOptionDAO()`
    // [model/service/OptionService.cfc:L73, L77], a DI/1 convention lookup resolved at
    // run time by scanning component properties; the ported class takes it as an
    // explicit, compile-checked constructor argument instead, which is transformation
    // rule T1. That is why no container, composition root or locator is imported by this
    // file, and why constructing the subject needs nothing but one object.
    service = new OptionService(optionRepository);
  });

  it('carries all three legacy method names verbatim and publishes no wider surface', () => {
    const publishedMembers = Object.getOwnPropertyNames(OptionService.prototype);

    // CFML parity [model/service/OptionService.cfc:L55, L72, L76]: the three names are
    // the legacy CFML camelCase names, character for character, because method-level
    // interface parity is this migration acceptance contract and a reviewer has to be
    // able to diff the two surfaces directly.
    expect(publishedMembers).toContain('getOptionsForSelect');
    expect(publishedMembers).toContain('getUnusedProductOptions');
    expect(publishedMembers).toContain('getUnusedProductOptionGroups');

    // None of them was "improved" into a more idiomatic name.
    expect(publishedMembers).not.toContain('toSelectOptions');
    expect(publishedMembers).not.toContain('getUnusedOptions');
    expect(publishedMembers).not.toContain('findOptions');
    expect(publishedMembers).not.toContain('findOptionGroups');

    // The framework-inherited CRUD and smart-list surface is absent because the base
    // component is deliberately not ported, and that absence is faithful rather than
    // incomplete - so none of it may be invented. An exact whole-list assertion is
    // deliberately not used here: it would also fail for a private helper, which is an
    // implementation detail this contract does not speak to.
    expect(publishedMembers).not.toContain('getOption');
    expect(publishedMembers).not.toContain('newOption');
    expect(publishedMembers).not.toContain('saveOption');
    expect(publishedMembers).not.toContain('deleteOption');
    expect(publishedMembers).not.toContain('validateOption');
    expect(publishedMembers).not.toContain('getOptionSmartList');

    // ...and it is absent for option GROUPS too, which matters here more than in any
    // sibling service: [model/entity/OptionGroup.cfc:L49] names this same component as
    // its service, so the component that owns option-group CRUD declares no
    // option-group method whatsoever.
    expect(publishedMembers).not.toContain('getOptionGroup');
    expect(publishedMembers).not.toContain('newOptionGroup');
    expect(publishedMembers).not.toContain('saveOptionGroup');
    expect(publishedMembers).not.toContain('deleteOptionGroup');
    expect(publishedMembers).not.toContain('getOptionGroupSmartList');
  });

  it('takes the option repository alone, with no productService-shaped collaborator', () => {
    // LEGACY-NOTE [model/service/OptionService.cfc:L53]: the legacy component declares a
    // productService DI/1 property that no method ever uses.
    // The dead injection is dropped rather than ported, so the target constructor takes
    // only the option repository port; this suite deliberately supplies no productService
    // double.
    expect(OptionService.length).toBe(1);

    // Constructing with the repository ALONE is the operative proof, and it is a
    // compile-time one as much as a run-time one: a second required parameter would make
    // this very line fail to compile under the strict profile.
    const constructedWithTheRepositoryAlone = new OptionService(
      new RecordingOptionRepository([], []),
    );

    expect(constructedWithTheRepositoryAlone).toBeInstanceOf(OptionService);

    // The double it was handed implements EXACTLY the port two members and no third, so
    // nothing in this file can accidentally describe a wider contract than the port
    // declares.
    expect(Object.getOwnPropertyNames(RecordingOptionRepository.prototype)).toStrictEqual([
      'constructor',
      'getUnusedProductOptions',
      'getUnusedProductOptionGroups',
    ]);
  });

  it('reaches its repository only through the constructor, never through a locator', async () => {
    const isolatedRows: readonly SelectOption[] = [
      { name: 'Isolated Group - Isolated Option', value: 'opt-isolated' },
    ];
    const isolatedGroupRows: readonly SelectOption[] = [
      { name: 'Isolated Group', value: 'og-isolated' },
    ];
    const isolatedRepository = new RecordingOptionRepository(isolatedRows, isolatedGroupRows);
    const isolatedService = new OptionService(isolatedRepository);

    const options = await isolatedService.getUnusedProductOptions(PRODUCT_ID, MULTI_ID_LIST);
    const groups = await isolatedService.getUnusedProductOptionGroups(MULTI_ID_LIST);

    expect(options).toBe(isolatedRows);
    expect(groups).toBe(isolatedGroupRows);
    expect(isolatedRepository.unusedOptionCalls).toStrictEqual([[PRODUCT_ID, MULTI_ID_LIST]]);
    expect(isolatedRepository.unusedOptionGroupCalls).toStrictEqual([[MULTI_ID_LIST]]);

    // The double built in `beforeEach` was handed to a DIFFERENT instance and recorded
    // nothing. Were either instance resolving its collaborator from a registry, a module
    // singleton or an ambient request scope, the calls would have landed somewhere other
    // than the double that instance was constructed with, and this case would fail. That
    // is the whole proof, and it is also a demonstration of the per-case isolation every
    // assertion in this file depends on.
    expect(optionRepository.unusedOptionCalls).toStrictEqual([]);
    expect(optionRepository.unusedOptionGroupCalls).toStrictEqual([]);
  });

  describe('getOptionsForSelect', () => {
    it('projects each option onto the name and value row the legacy body built', () => {
      const options = [
        anOption({ optionID: 'opt-large', optionName: 'Large' }),
        anOption({ optionID: 'opt-medium', optionName: 'Medium' }),
      ];

      // CFML parity [model/service/OptionService.cfc:L59]: `name` comes from
      // `getOptionName()` and `value` from `getOptionID()`, in that order, with no third
      // key. `toStrictEqual` is what makes the "no third key" half real - an extra key
      // would fail here rather than slip past unnoticed.
      //
      // CFML parity [model/service/OptionService.cfc:L58]: the legacy loop counter is
      // un-var'd and leaks into the component variables scope. It is a harness-style
      // hygiene artifact with no observable effect - nothing reads it - and block scoping
      // in TypeScript makes the leak unreproducible, so no analogue is attempted and
      // nothing below asserts one. Recorded as parity, deliberately NOT as a defect: it
      // is a secondary-register item, not one of the numbered entries. The loop FORM is
      // not transliterated either; a 1-based numeric index loop would violate the
      // minimal-change directive, which scopes the functional surface rather than the
      // code style, and it would also force an indexed read the strict profile then has
      // to prove safe.
      expect(service.getOptionsForSelect(options)).toStrictEqual([
        { name: 'Large', value: 'opt-large' },
        { name: 'Medium', value: 'opt-medium' },
      ]);
    });

    it('preserves the input order exactly and sorts nothing', () => {
      // CFML parity [model/service/OptionService.cfc:L55]: the legacy local is named
      // sortedOptions but no sort is ever performed; input order is preserved verbatim.
      // The target must not sort, and this test pins input order to prove it.
      //
      // The input is DELIBERATELY out of order on every axis a well-meaning
      // implementation might have reached for: not alphabetical by name, not
      // alphabetical by identifier, and carrying no sort ordinal at all - the entity
      // column is left unset here precisely so no ordering signal exists to sort by. A
      // case built from already-ordered input would be vacuous.
      const options = [
        anOption({ optionID: 'opt-3-small', optionName: 'Small' }),
        anOption({ optionID: 'opt-1-large', optionName: 'Large' }),
        anOption({ optionID: 'opt-2-medium', optionName: 'Medium' }),
      ];

      const rows = service.getOptionsForSelect(options);

      expect(rows).toStrictEqual([
        { name: 'Small', value: 'opt-3-small' },
        { name: 'Large', value: 'opt-1-large' },
        { name: 'Medium', value: 'opt-2-medium' },
      ]);

      // Position by position against the input, so the claim is about ORDER rather than
      // about one expected literal happening to match.
      const emittedValues = rows.map((row) => row.value);
      const inputIdentifiers = options.map((option) => option.getOptionID());

      expect(emittedValues).toStrictEqual(inputIdentifiers);

      // Alphabetical order would have been ['Large', 'Medium', 'Small'] and identifier
      // order would have been ['opt-1-large', 'opt-2-medium', 'opt-3-small']. Neither is
      // what came back.
      expect(rows.map((row) => row.name)).toStrictEqual(['Small', 'Large', 'Medium']);
      expect(rows.map((row) => row.name)).not.toStrictEqual(['Large', 'Medium', 'Small']);
      expect(emittedValues).not.toStrictEqual(['opt-1-large', 'opt-2-medium', 'opt-3-small']);
    });

    it('answers an empty array for an empty input, never undefined and never null', () => {
      const rows = service.getOptionsForSelect([]);

      expect(rows).toStrictEqual([]);
      expect(Array.isArray(rows)).toBe(true);
      expect(rows).toHaveLength(0);
      expect(rows).not.toBeUndefined();
      expect(rows).not.toBeNull();
    });

    it('answers exactly one row for a single option', () => {
      // Handed in as a `readonly Option[]`, which the shipped parameter type accepts by
      // design: entity accessors across the ported slice publish option arrays with
      // differing mutability, and the read-only form is the only one that accepts all of
      // them. The legacy body only ever reads the incoming array, so a read-only
      // parameter makes that a compiler guarantee instead of a comment.
      const options: readonly Option[] = [
        anOption({ optionID: 'opt-single', optionName: 'Single' }),
      ];

      const rows = service.getOptionsForSelect(options);

      expect(rows).toHaveLength(1);

      // Indexed access is NARROWED rather than asserted away: under the strict profile
      // `rows[0]` is `SelectOption | undefined`, and a non-null assertion would silence
      // the very check that keeps absence visible.
      const first = rows[0];

      if (first === undefined) {
        throw new Error('the projection answered no row, so there is nothing to assert');
      }

      expect(first.name).toBe('Single');
      expect(first.value).toBe('opt-single');
      expect(Object.keys(first)).toStrictEqual(['name', 'value']);
    });

    it('reads the name off the option itself, never composing the DAO group label', () => {
      const sizeGroup = anOptionGroup({ optionGroupID: 'og-size', optionGroupName: 'Shirt Size' });
      const option = anOption({
        optionID: 'opt-large',
        optionName: 'Large',
        optionGroup: sizeGroup,
      });

      const rows = service.getOptionsForSelect([option]);

      // The two tiers project DIFFERENT labels from the same option, and that is faithful
      // rather than inconsistent. The DAO composes `"<optionGroupName> - <optionName>"`
      // [model/dao/OptionDAO.cfc:L88]; the service body reads `getOptionName()` alone
      // [model/service/OptionService.cfc:L59]. The owning group is deliberately
      // reachable from the option here so that this case can prove the service does not
      // reach for it.
      expect(rows).toStrictEqual([{ name: 'Large', value: 'opt-large' }]);
      expect(daoStyleOptionRow(option)).toStrictEqual({
        name: 'Shirt Size - Large',
        value: 'opt-large',
      });

      const first = rows[0];

      if (first === undefined) {
        throw new Error('the projection answered no row, so there is nothing to assert');
      }

      expect(first.name).not.toContain('Shirt Size');
      expect(first.name).not.toContain(' - ');

      // The group was there to be read, and reading it was not what happened.
      expect(option.getOptionGroup()).toBe(sizeGroup);
    });

    it('resolves an absent option name to the empty string, keeping the row', () => {
      // The shipped service records this as a judgment call, and it is worth pinning:
      // `getOptionName()` is `string | undefined` because [model/entity/Option.cfc:L54]
      // declares the column with no `notnull` and no default, while the select row type
      // requires a `string`. The absent case resolves to the EMPTY STRING, which
      // reproduces legacy behaviour rather than inventing a default - Slatwall targets
      // ColdFusion 9.0.1 and Railo 4.1 [readme.md:L1-L14], engines on which a NULL
      // string column read through the ORM surfaces as the empty string, so that is the
      // value the legacy runtime itself put into this key.
      const options = [
        anOption({ optionID: 'opt-unnamed', optionName: undefined }),
        anOption({ optionID: 'opt-named', optionName: 'Named' }),
      ];

      // The row SURVIVES with an empty label: it is neither filtered out, nor replaced by
      // the identifier, nor turned into a throw, and the option beside it is unaffected.
      expect(service.getOptionsForSelect(options)).toStrictEqual([
        { name: '', value: 'opt-unnamed' },
        { name: 'Named', value: 'opt-named' },
      ]);
    });

    it('answers synchronously, with an array rather than a promise, and consults no port', () => {
      // JUDGMENT CALL: the async-boundary contract keeps this method SYNCHRONOUS. A
      // method becomes `async` if and only if its legacy body reaches the DAO or the ORM,
      // and this body reaches neither - it reads two accessors off objects the caller
      // already holds. Making it async for the convenience of a uniform test shape is
      // forbidden: it would change the shipped signature, oblige every call site to
      // await, and spend a signature reshaping the project has already allocated
      // elsewhere. So this case is not an `async` test and performs no await at all -
      // awaiting a non-promise is itself a lint failure here.
      //
      // The type annotation is the compile-time half of the proof: were the shipped
      // method async, `SelectOption[]` would not accept its return and this line would
      // not compile.
      const rows: SelectOption[] = service.getOptionsForSelect([
        anOption({ optionID: 'opt-large', optionName: 'Large' }),
      ]);

      // ...and these are the run-time half.
      expect(Array.isArray(rows)).toBe(true);
      expect(rows).not.toBeInstanceOf(Promise);
      expect(rows).toStrictEqual([{ name: 'Large', value: 'opt-large' }]);

      // PURE as well as synchronous: the projection touches the injected port not at all,
      // which is why it needs no stub, no fake clock and no database.
      expect(optionRepository.unusedOptionCalls).toStrictEqual([]);
      expect(optionRepository.unusedOptionGroupCalls).toStrictEqual([]);
    });

    it('mutates neither the array it is handed nor the options inside it', () => {
      const small = anOption({ optionID: 'opt-3-small', optionName: 'Small' });
      const large = anOption({ optionID: 'opt-1-large', optionName: 'Large' });
      const options = [small, large];

      const identifiersBefore = options.map((option) => option.getOptionID());
      const namesBefore = options.map((option) => option.getOptionName());

      service.getOptionsForSelect(options);

      // The array is neither reordered, extended nor truncated...
      expect(options).toHaveLength(2);
      expect(options[0]).toBe(small);
      expect(options[1]).toBe(large);

      // ...and the entities inside it are untouched. The arrays handed to this method in
      // production are live entity collections rather than defensive copies, so a
      // mutation here would reach back into the caller's own object graph.
      expect(options.map((option) => option.getOptionID())).toStrictEqual(identifiersBefore);
      expect(options.map((option) => option.getOptionName())).toStrictEqual(namesBefore);
    });

    it('answers a fresh array on each call, holding no memo between them', () => {
      const options = [anOption({ optionID: 'opt-large', optionName: 'Large' })];

      const firstCall = service.getOptionsForSelect(options);
      const secondCall = service.getOptionsForSelect(options);

      // Equal in content, distinct in identity. The legacy component declares no
      // `variables.` memo of any kind, so the ported class holds none either - and a
      // module-level cache would be unsafe in a container reused across unrelated
      // invocations, where it would outlive the request that filled it.
      expect(secondCall).toStrictEqual(firstCall);
      expect(secondCall).not.toBe(firstCall);
    });
  });

  describe('getUnusedProductOptions', () => {
    // PARAMETERIZED SQL - NOT APPLICABLE IN THIS TIER, AND SAID SO RATHER THAN SKIPPED.
    // The statement this method ultimately feeds is at [model/dao/OptionDAO.cfc:L51-L92],
    // and reproducing it - `IN` over the list, the `NOT EXISTS` subquery, the
    // `ORDER BY`, and one bound parameter per parsed list element per
    // [model/dao/OptionDAO.cfc:L68] and [model/dao/OptionDAO.cfc:L78] - is the MySQL
    // adapter obligation, asserted in the sibling-owned
    // `tests/integration/repositories/` tier where a real statement exists. The cases
    // below assert only what the SERVICE owes: that the port was called with the right
    // arguments, and that its result came back untouched.

    it('forwards both arguments unchanged and in order, exactly once', async () => {
      await service.getUnusedProductOptions(PRODUCT_ID, MULTI_ID_LIST);

      // CFML parity [model/service/OptionService.cfc:L73]: the legacy body forwards with
      // `argumentCollection=arguments`, an argument list assembled at run time; the
      // ported method forwards NAMED parameters, which is what makes the forwarded list
      // visible to the compiler instead. Recording the whole argument list pins the
      // count, the order and the values in one expression, and a stray third argument
      // would fail it.
      expect(optionRepository.unusedOptionCalls).toStrictEqual([[PRODUCT_ID, MULTI_ID_LIST]]);

      const recordedCall = optionRepository.unusedOptionCalls[0];

      if (recordedCall === undefined) {
        throw new Error('the repository double recorded no call, so there is nothing to assert');
      }

      // TWO arguments arrived, `productID` first - the source order at
      // [model/dao/OptionDAO.cfc:L52-L53], preserved rather than harmonised with the
      // one-argument sibling.
      expect(recordedCall).toHaveLength(2);
      expect(recordedCall[0]).toBe(PRODUCT_ID);
      expect(recordedCall[1]).toBe(MULTI_ID_LIST);

      // The sibling member of the port was not consulted at all.
      expect(optionRepository.unusedOptionGroupCalls).toStrictEqual([]);
    });

    it('answers exactly the rows the repository produced, by identity', async () => {
      const rows = await service.getUnusedProductOptions(PRODUCT_ID, MULTI_ID_LIST);

      // A passthrough, and deliberately nothing more: no filtering, no re-ordering, no
      // defensive copy and no re-projection. Identity is the strongest available
      // statement of that - the array that comes back IS the one the port answered.
      expect(rows).toBe(seededOptionRows);

      // Spelled out as well, so the row SHAPE is visible in this file and not only in
      // the seed: the label is the composite the legacy loop built
      // [model/dao/OptionDAO.cfc:L88] and the value is the option identifier.
      expect(rows).toStrictEqual([
        { name: 'Colour - Teal', value: 'opt-teal' },
        { name: 'Size - Large', value: 'opt-large' },
      ]);
    });

    it('forwards a multi-identifier comma list byte for byte, parsing nothing', async () => {
      await service.getUnusedProductOptions(PRODUCT_ID, MULTI_ID_LIST);

      const recordedCall = optionRepository.unusedOptionCalls[0];

      if (recordedCall === undefined) {
        throw new Error('the repository double recorded no call, so there is nothing to assert');
      }

      const forwardedList = recordedCall[1];

      // CFML parity [model/dao/OptionDAO.cfc:L53]: the parameter is a comma-delimited
      // `string`, never an array, because signature parity is the acceptance contract.
      // It arrives unchanged - not split, not trimmed, not case-folded, not turned into
      // an array and not re-joined. Splitting the list is the adapter job, exactly as it
      // was the DAO job, which is why this suite imports no list helper.
      expect(forwardedList).toBe(MULTI_ID_LIST);
      expect(forwardedList).toBe('og-size,og-colour,og-fit');
      expect(typeof forwardedList).toBe('string');
      expect(Array.isArray(forwardedList)).toBe(false);
    });

    it('forwards a single identifier carrying no delimiter unchanged', async () => {
      await service.getUnusedProductOptions(PRODUCT_ID, SINGLE_ID_LIST);

      // A one-element CFML list has no delimiter in it at all, and the service neither
      // appends one nor wraps the value.
      expect(optionRepository.unusedOptionCalls).toStrictEqual([[PRODUCT_ID, SINGLE_ID_LIST]]);
      expect(SINGLE_ID_LIST).not.toContain(',');
    });

    it('forwards an empty list as the empty string, neither dropped nor defaulted', async () => {
      await service.getUnusedProductOptions(PRODUCT_ID, EMPTY_ID_LIST);

      // The legacy body performs no length test on either argument and takes no branch,
      // so the empty string reaches the port exactly as it stands.
      expect(optionRepository.unusedOptionCalls).toStrictEqual([[PRODUCT_ID, '']]);

      const recordedCall = optionRepository.unusedOptionCalls[0];

      if (recordedCall === undefined) {
        throw new Error('the repository double recorded no call, so there is nothing to assert');
      }

      // Spelled out, because each negative here is a distinct way the value could have
      // been quietly mishandled: it is NOT coerced to undefined, NOT omitted from the
      // call so that the argument count changes, and NOT replaced by an empty array.
      expect(recordedCall).toHaveLength(2);
      expect(recordedCall[1]).toBe('');
      expect(recordedCall[1]).not.toBeUndefined();
      expect(Array.isArray(recordedCall[1])).toBe(false);
    });

    it('answers an empty array when the repository finds nothing', async () => {
      // A fresh double seeded with nothing, because an empty result is a legitimate and
      // MEANINGFUL outcome here rather than an error: [model/validation/Product.json:L13]
      // puts `unusedProductOptions` under `{"contexts":"addOption","minCollection":1}`,
      // so an empty array is precisely what tells the caller this product can accept no
      // further option. It must never be smoothed into a default, a fallback or a
      // synthesised placeholder row.
      const emptyRepository = new RecordingOptionRepository([], []);
      const serviceOverEmptyData = new OptionService(emptyRepository);

      const rows = await serviceOverEmptyData.getUnusedProductOptions(PRODUCT_ID, MULTI_ID_LIST);

      expect(rows).toStrictEqual([]);
      expect(rows).toHaveLength(0);
      expect(rows).not.toBeUndefined();

      // The call still happened - an empty answer is what the port said, not a
      // short-circuit the service took.
      expect(emptyRepository.unusedOptionCalls).toStrictEqual([[PRODUCT_ID, MULTI_ID_LIST]]);
    });
  });

  describe('getUnusedProductOptionGroups', () => {
    // PARAMETERIZED SQL - NOT APPLICABLE IN THIS TIER, for the same reason as its
    // sibling. The statement is at [model/dao/OptionDAO.cfc:L94-L117] and its list
    // binding at [model/dao/OptionDAO.cfc:L107]; reproducing and asserting them belongs
    // to the MySQL adapter and to `tests/integration/repositories/` respectively.

    it('forwards its one argument unchanged, exactly once', async () => {
      await service.getUnusedProductOptionGroups(MULTI_ID_LIST);

      // CFML parity [model/service/OptionService.cfc:L77]: one argument in, one argument
      // forwarded, with no product identifier synthesised alongside it.
      expect(optionRepository.unusedOptionGroupCalls).toStrictEqual([[MULTI_ID_LIST]]);

      const recordedCall = optionRepository.unusedOptionGroupCalls[0];

      if (recordedCall === undefined) {
        throw new Error('the repository double recorded no call, so there is nothing to assert');
      }

      expect(recordedCall).toHaveLength(1);
      expect(recordedCall[0]).toBe(MULTI_ID_LIST);

      // The sibling member of the port was not consulted at all.
      expect(optionRepository.unusedOptionCalls).toStrictEqual([]);
    });

    it('carries one parameter where its sibling carries two', async () => {
      // The COMPILE-TIME half of the arity claim is these two call shapes themselves:
      // handing a product identifier to the group method, or omitting it from the option
      // method, would fail to compile under the strict profile.
      await service.getUnusedProductOptions(PRODUCT_ID, MULTI_ID_LIST);
      await service.getUnusedProductOptionGroups(MULTI_ID_LIST);

      const optionCall = optionRepository.unusedOptionCalls[0];
      const groupCall = optionRepository.unusedOptionGroupCalls[0];

      if (optionCall === undefined || groupCall === undefined) {
        throw new Error('one of the two repository members recorded no call');
      }

      // The RUN-TIME half. Because the double records the whole argument list rather
      // than a re-assembled object, these lengths are the counts the service actually
      // passed - a quietly forwarded extra argument would show up here.
      //
      // ★ The asymmetry is the source own, at [model/dao/OptionDAO.cfc:L95] against
      // [model/dao/OptionDAO.cfc:L52-L53], and it is preserved rather than harmonised:
      // this method answers "every option group not in this list" across the whole
      // catalog, scoped to no product at all. An optional productID is deliberately NOT
      // added, because adding one would invent a requirement and quietly change the
      // result set.
      expect(optionCall).toHaveLength(2);
      expect(groupCall).toHaveLength(1);
    });

    it('answers exactly the rows the repository produced, by identity', async () => {
      const rows = await service.getUnusedProductOptionGroups(MULTI_ID_LIST);

      expect(rows).toBe(seededOptionGroupRows);
    });

    it('answers option-group rows under the same select row type as its sibling', async () => {
      const rows = await service.getUnusedProductOptionGroups(MULTI_ID_LIST);

      // The legacy result here is option-GROUP rows, and the label is the group name
      // ALONE - no composition, no separator [model/dao/OptionDAO.cfc:L113] - yet the
      // element type is the same select row the option query answers. That is faithful:
      // both queries project a label and an identifier, which is why the ported service
      // references no OptionGroup type at all and no second row type exists to convert
      // between.
      expect(rows).toStrictEqual([
        { name: 'Colour', value: 'og-colour' },
        { name: 'Size', value: 'og-size' },
      ]);

      const first = rows[0];

      if (first === undefined) {
        throw new Error('the repository answered no row, so there is nothing to assert');
      }

      expect(first.name).not.toContain(' - ');
      expect(Object.keys(first)).toStrictEqual(['name', 'value']);
    });

    it('forwards a multi-identifier comma list byte for byte, parsing nothing', async () => {
      await service.getUnusedProductOptionGroups(MULTI_ID_LIST);

      const recordedCall = optionRepository.unusedOptionGroupCalls[0];

      if (recordedCall === undefined) {
        throw new Error('the repository double recorded no call, so there is nothing to assert');
      }

      const forwardedList = recordedCall[0];

      // CFML parity [model/dao/OptionDAO.cfc:L95]: a comma-delimited `string`, forwarded
      // unchanged. Note that the adapter behind this method uses the very same list with
      // the OPPOSITE polarity to its sibling - `NOT IN` at
      // [model/dao/OptionDAO.cfc:L107] against `IN` at [model/dao/OptionDAO.cfc:L68] -
      // which is one more reason the service must not normalise it on the way through:
      // the same string has to mean the same set of identifiers in both statements.
      expect(forwardedList).toBe(MULTI_ID_LIST);
      expect(forwardedList).toBe('og-size,og-colour,og-fit');
      expect(typeof forwardedList).toBe('string');
      expect(Array.isArray(forwardedList)).toBe(false);
    });

    it('forwards a single identifier carrying no delimiter unchanged', async () => {
      await service.getUnusedProductOptionGroups(SINGLE_ID_LIST);

      expect(optionRepository.unusedOptionGroupCalls).toStrictEqual([[SINGLE_ID_LIST]]);
      expect(SINGLE_ID_LIST).not.toContain(',');
    });

    it('forwards an empty list as the empty string, neither dropped nor defaulted', async () => {
      await service.getUnusedProductOptionGroups(EMPTY_ID_LIST);

      // Neither legacy function guards an empty list, and this one is where that matters
      // most: with `NOT IN` an empty list excludes nothing. The outcome belongs to the
      // caller and to the adapter; what the SERVICE owes is to forward the empty string
      // as it stands, and it does.
      expect(optionRepository.unusedOptionGroupCalls).toStrictEqual([['']]);

      const recordedCall = optionRepository.unusedOptionGroupCalls[0];

      if (recordedCall === undefined) {
        throw new Error('the repository double recorded no call, so there is nothing to assert');
      }

      expect(recordedCall).toHaveLength(1);
      expect(recordedCall[0]).toBe('');
      expect(recordedCall[0]).not.toBeUndefined();
      expect(Array.isArray(recordedCall[0])).toBe(false);
    });

    it('answers an empty array when the repository finds nothing', async () => {
      // As with the sibling, an empty result is meaningful rather than exceptional:
      // [model/validation/Product.json:L14] puts `unusedProductOptionGroups` under
      // `{"contexts":"addOptionGroup","minCollection":1}`, so an empty array is what
      // tells the caller this product already carries every option group there is.
      const emptyRepository = new RecordingOptionRepository([], []);
      const serviceOverEmptyData = new OptionService(emptyRepository);

      const rows = await serviceOverEmptyData.getUnusedProductOptionGroups(MULTI_ID_LIST);

      expect(rows).toStrictEqual([]);
      expect(rows).toHaveLength(0);
      expect(rows).not.toBeUndefined();
      expect(emptyRepository.unusedOptionGroupCalls).toStrictEqual([[MULTI_ID_LIST]]);
    });
  });
});
