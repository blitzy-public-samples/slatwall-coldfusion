// slatwall-ts - unit suite pinning `src/services/optionService.ts`
//
// The ported surface is the legacy component's three declared methods and nothing more.
// Everything else a caller might expect of an option service - `getOption`, `newOption`,
// `saveOption`, `deleteOption`, `validateOption`, a smart-list accessor, and the same set again
// for option GROUPS - was inherited from the Hibachi service base and is not ported.
//
// LEGACY-NOTE [model/service/OptionService.cfc:L53]: the legacy component declares a
// `productService` DI/1 property that no method ever uses, so no corresponding port is wired.

import { beforeEach, describe, expect, it } from 'vitest';

import { Option } from '../../../src/domain/entities/option.js';
import { OptionGroup } from '../../../src/domain/entities/optionGroup.js';
import type { OptionRepository, SelectOption } from '../../../src/domain/ports/optionRepository.js';
import { OptionService } from '../../../src/services/optionService.js';

// Argument-list types, derived from the shipped port rather than restated.

// JUDGMENT CALL: both recording arrays below are typed with `Parameters<...>` read off the shipped
// port instead of with a hand-written record of named fields. Two reasons, and the second is the
// stronger one.
type UnusedProductOptionsArgs = Parameters<OptionRepository['getUnusedProductOptions']>;

type UnusedProductOptionGroupsArgs = Parameters<OptionRepository['getUnusedProductOptionGroups']>;

// Deterministic synthetic values.

/**
 * Product whose SKUs the legacy `NOT EXISTS` subquery checks [model/dao/OptionDAO.cfc:L78].
 *
 * Obviously synthetic, so no assertion can pass because a value happened to look plausible, and
 * deliberately not identifier-shaped in the legacy sense.
 */
const PRODUCT_ID = 'product-under-option-assignment';

/**
 * A CFML comma-delimited list of option group identifiers, with three elements and no surrounding
 * whitespace.
 */
const MULTI_ID_LIST = 'og-size,og-colour,og-fit';

/**
 * The same parameter carrying a single identifier, so no delimiter is present at all.
 */
const SINGLE_ID_LIST = 'og-size';

/**
 * The same parameter carrying the empty string.
 *
 * Neither legacy function guards an empty list - no length test, no default, no branch - so the
 * raw argument reaches a list-expanded bound parameter as it stands.
 */
const EMPTY_ID_LIST = '';

// Inline entity construction.

/**
 * Builds an option group with the two columns this suite reads and inert values everywhere else.
 *
 * `sortOrder` is an entity sort ordinal rather than a quantity, and nothing here performs
 * arithmetic on it; the group's own `options` association is left empty because no method under
 * test traverses it.
 *
 * The sort tie-breaker is supplied as a FIXED function rather than left to default.
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
 * `optionName` is deliberately required-but-nullable here, mirroring the entity:
 * [model/entity/Option.cfc:L54] declares `optionName ormtype="string"` with no `notnull` and no
 * default.
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

// The seeded repository rows.

// JUDGMENT CALL: the rows the double answers with are built from real entities through the two
// helpers below, rather than written as bare literals, so the seeded data carries the SHAPE the
// legacy queries actually produce.

/**
 * One select row as `getUnusedProductOptions` builds it [model/dao/OptionDAO.cfc:L88]: the label
 * is the COMPOSITE `"<optionGroupName> - <optionName>"` and the value is the option identifier.
 *
 * Absent names resolve to the empty string, which is what the legacy runtime put in the
 * interpolated label for a NULL column on the engines Slatwall targets.
 */
function daoStyleOptionRow(option: Option): SelectOption {
  const groupName = option.getOptionGroup()?.getOptionGroupName() ?? '';
  const optionName = option.getOptionName() ?? '';

  return { name: `${groupName} - ${optionName}`, value: option.getOptionID() };
}

/**
 * One select row as `getUnusedProductOptionGroups` builds it [model/dao/OptionDAO.cfc:L113]: the
 * label is the group name ALONE - no composition, no separator - and the value is the group
 * identifier.
 */
function daoStyleOptionGroupRow(optionGroup: OptionGroup): SelectOption {
  return { name: optionGroup.getOptionGroupName() ?? '', value: optionGroup.getOptionGroupID() };
}

// The in-memory double.

/**
 * In-memory stand-in for the option repository port.
 *
 * Replaces the legacy `property name="optionDAO" type="any";`
 * [model/service/OptionService.cfc:L51] - the component's one and only LIVE collaborator.
 *
 * Implements EXACTLY the port's two members and no third.
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

    // Seeded in the shape each legacy query produces, and in the order each legacy `ORDER BY`
    // would have produced it - by group name then option name for the option query
    // [model/dao/OptionDAO.cfc:L82-L84].
    seededOptionRows = [daoStyleOptionRow(teal), daoStyleOptionRow(large)];
    seededOptionGroupRows = [
      daoStyleOptionGroupRow(colourGroup),
      daoStyleOptionGroupRow(sizeGroup),
    ];

    optionRepository = new RecordingOptionRepository(seededOptionRows, seededOptionGroupRows);

    // JUDGMENT CALL: the collaborator is handed to the constructor, and that is the whole wiring
    // story.
    service = new OptionService(optionRepository);
  });

  it('carries all three legacy method names verbatim and publishes no wider surface', () => {
    const publishedMembers = Object.getOwnPropertyNames(OptionService.prototype);

    // CFML parity [model/service/OptionService.cfc:L55, L72, L76]: the three names are the legacy
    // CFML camelCase names, character for character.
    expect(publishedMembers).toContain('getOptionsForSelect');
    expect(publishedMembers).toContain('getUnusedProductOptions');
    expect(publishedMembers).toContain('getUnusedProductOptionGroups');

    // None of them was "improved" into a more idiomatic name.
    expect(publishedMembers).not.toContain('toSelectOptions');
    expect(publishedMembers).not.toContain('getUnusedOptions');
    expect(publishedMembers).not.toContain('findOptions');
    expect(publishedMembers).not.toContain('findOptionGroups');
    expect(publishedMembers).not.toContain('getOption');
    expect(publishedMembers).not.toContain('newOption');
    expect(publishedMembers).not.toContain('saveOption');
    expect(publishedMembers).not.toContain('deleteOption');
    expect(publishedMembers).not.toContain('validateOption');
    expect(publishedMembers).not.toContain('getOptionSmartList');

    // and it is absent for option GROUPS too, which matters here more than in any sibling
    // service: [model/entity/OptionGroup.cfc:L49] names this same component as its service.
    expect(publishedMembers).not.toContain('getOptionGroup');
    expect(publishedMembers).not.toContain('newOptionGroup');
    expect(publishedMembers).not.toContain('saveOptionGroup');
    expect(publishedMembers).not.toContain('deleteOptionGroup');
    expect(publishedMembers).not.toContain('getOptionGroupSmartList');
  });

  it('takes the option repository alone, with no productService-shaped collaborator', () => {
    // LEGACY-NOTE [model/service/OptionService.cfc:L53]: the legacy component declares a
    // productService DI/1 property that no method ever uses.
    expect(OptionService.length).toBe(1);

    // Constructing with the repository ALONE is the operative proof.
    const constructedWithTheRepositoryAlone = new OptionService(
      new RecordingOptionRepository([], []),
    );

    expect(constructedWithTheRepositoryAlone).toBeInstanceOf(OptionService);

    // The double it was handed implements EXACTLY the port two members and no third, so nothing in
    // this file can accidentally describe a wider contract than the port declares.
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

    // The double built in `beforeEach` was handed to a DIFFERENT instance and recorded nothing.
    expect(optionRepository.unusedOptionCalls).toStrictEqual([]);
    expect(optionRepository.unusedOptionGroupCalls).toStrictEqual([]);
  });

  describe('getOptionsForSelect', () => {
    it('projects each option onto the name and value row the legacy body built', () => {
      const options = [
        anOption({ optionID: 'opt-large', optionName: 'Large' }),
        anOption({ optionID: 'opt-medium', optionName: 'Medium' }),
      ];

      // CFML parity [model/service/OptionService.cfc:L59]: `name` comes from `getOptionName()` and
      // `value` from `getOptionID()`, in that order, with no third key.
      //
      // CFML parity [model/service/OptionService.cfc:L58]: the legacy loop counter is un-var'd and
      // leaks into the component variables scope.
      expect(service.getOptionsForSelect(options)).toStrictEqual([
        { name: 'Large', value: 'opt-large' },
        { name: 'Medium', value: 'opt-medium' },
      ]);
    });

    it('preserves the input order exactly and sorts nothing', () => {
      // CFML parity [model/service/OptionService.cfc:L55]: the legacy local is named sortedOptions
      // but no sort is ever performed; input order is preserved verbatim. The target must not
      // sort, and this test pins input order to prove it.
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

      // Position by position against the input, so the claim is about ORDER rather than about one
      // expected literal happening to match.
      const emittedValues = rows.map((row) => row.value);
      const inputIdentifiers = options.map((option) => option.getOptionID());

      expect(emittedValues).toStrictEqual(inputIdentifiers);

      // Alphabetical order would have been ['Large', 'Medium', 'Small'] and identifier order would
      // have been ['opt-1-large', 'opt-2-medium', 'opt-3-small']. Neither is what came back.
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
      // Handed in as a `readonly Option[]`, which the shipped parameter type accepts by design:
      // entity accessors across the ported slice publish option arrays with differing mutability.
      const options: readonly Option[] = [
        anOption({ optionID: 'opt-single', optionName: 'Single' }),
      ];

      const rows = service.getOptionsForSelect(options);

      expect(rows).toHaveLength(1);

      // Indexed access is NARROWED rather than asserted away: under the strict profile `rows[0]`
      // is `SelectOption | undefined`, and a non-null assertion would silence the very check that
      // keeps absence visible.
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

      // The two tiers project DIFFERENT labels from the same option, and that is faithful rather
      // than inconsistent.
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
      // `getOptionName()` is `string | undefined` because [model/entity/Option.cfc:L54] declares
      // the column with no `notnull` and no default.
      const options = [
        anOption({ optionID: 'opt-unnamed', optionName: undefined }),
        anOption({ optionID: 'opt-named', optionName: 'Named' }),
      ];

      // The row SURVIVES with an empty label: it is neither filtered out, nor replaced by the
      // identifier, nor turned into a throw, and the option beside it is unaffected.
      expect(service.getOptionsForSelect(options)).toStrictEqual([
        { name: '', value: 'opt-unnamed' },
        { name: 'Named', value: 'opt-named' },
      ]);
    });

    it('answers synchronously, with an array rather than a promise, and consults no port', () => {
      // JUDGMENT CALL: the async-boundary contract keeps this method SYNCHRONOUS. A method becomes
      // `async` if and only if its legacy body reaches the DAO or the ORM, and this body reaches
      // neither - it reads two accessors off objects the caller already holds.
      const rows: SelectOption[] = service.getOptionsForSelect([
        anOption({ optionID: 'opt-large', optionName: 'Large' }),
      ]);

      // and these are the run-time half.
      expect(Array.isArray(rows)).toBe(true);
      expect(rows).not.toBeInstanceOf(Promise);
      expect(rows).toStrictEqual([{ name: 'Large', value: 'opt-large' }]);

      // PURE as well as synchronous: the projection touches the injected port not at all, which is
      // why it needs no stub, no fake clock and no database.
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

      // and the entities inside it are untouched.
      expect(options.map((option) => option.getOptionID())).toStrictEqual(identifiersBefore);
      expect(options.map((option) => option.getOptionName())).toStrictEqual(namesBefore);
    });

    it('answers a fresh array on each call, holding no memo between them', () => {
      const options = [anOption({ optionID: 'opt-large', optionName: 'Large' })];

      const firstCall = service.getOptionsForSelect(options);
      const secondCall = service.getOptionsForSelect(options);

      // Equal in content, distinct in identity.
      expect(secondCall).toStrictEqual(firstCall);
      expect(secondCall).not.toBe(firstCall);
    });
  });

  describe('getUnusedProductOptions', () => {
    // The statement this method ultimately feeds is at [model/dao/OptionDAO.cfc:L51-L92], and
    // reproducing it - `IN` over the list, the `NOT EXISTS` subquery, the `ORDER BY`, and one
    // bound parameter per parsed list element per [model/dao/OptionDAO.cfc:L68] and
    // [model/dao/OptionDAO.cfc:L78].

    it('forwards both arguments unchanged and in order, exactly once', async () => {
      await service.getUnusedProductOptions(PRODUCT_ID, MULTI_ID_LIST);

      // CFML parity [model/service/OptionService.cfc:L73]: the legacy body forwards with
      // `argumentCollection=arguments`, an argument list assembled at run time; the ported method
      // forwards NAMED parameters.
      expect(optionRepository.unusedOptionCalls).toStrictEqual([[PRODUCT_ID, MULTI_ID_LIST]]);

      const recordedCall = optionRepository.unusedOptionCalls[0];

      if (recordedCall === undefined) {
        throw new Error('the repository double recorded no call, so there is nothing to assert');
      }

      // Two arguments arrived, `productID` first - the source order at
      // [model/dao/OptionDAO.cfc:L52-L53], preserved rather than harmonised with the one-argument
      // sibling.
      expect(recordedCall).toHaveLength(2);
      expect(recordedCall[0]).toBe(PRODUCT_ID);
      expect(recordedCall[1]).toBe(MULTI_ID_LIST);

      // The sibling member of the port was not consulted at all.
      expect(optionRepository.unusedOptionGroupCalls).toStrictEqual([]);
    });

    it('answers exactly the rows the repository produced, by identity', async () => {
      const rows = await service.getUnusedProductOptions(PRODUCT_ID, MULTI_ID_LIST);

      // A passthrough, and deliberately nothing more: no filtering, no re-ordering, no defensive
      // copy and no re-projection.
      expect(rows).toBe(seededOptionRows);

      // Spelled out as well, so the row SHAPE is visible in this file and not only in the seed:
      // the label is the composite the legacy loop built [model/dao/OptionDAO.cfc:L88] and the
      // value is the option identifier.
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

      // CFML parity [model/dao/OptionDAO.cfc:L53]: the parameter is a comma-delimited `string`,
      // never an array, because signature parity is the acceptance contract.
      expect(forwardedList).toBe(MULTI_ID_LIST);
      expect(forwardedList).toBe('og-size,og-colour,og-fit');
      expect(typeof forwardedList).toBe('string');
      expect(Array.isArray(forwardedList)).toBe(false);
    });

    it('forwards a single identifier carrying no delimiter unchanged', async () => {
      await service.getUnusedProductOptions(PRODUCT_ID, SINGLE_ID_LIST);

      // A one-element CFML list has no delimiter in it at all, and the service neither appends one
      // nor wraps the value.
      expect(optionRepository.unusedOptionCalls).toStrictEqual([[PRODUCT_ID, SINGLE_ID_LIST]]);
      expect(SINGLE_ID_LIST).not.toContain(',');
    });

    it('forwards an empty list as the empty string, neither dropped nor defaulted', async () => {
      await service.getUnusedProductOptions(PRODUCT_ID, EMPTY_ID_LIST);

      // The legacy body performs no length test on either argument and takes no branch, so the
      // empty string reaches the port exactly as it stands.
      expect(optionRepository.unusedOptionCalls).toStrictEqual([[PRODUCT_ID, '']]);

      const recordedCall = optionRepository.unusedOptionCalls[0];

      if (recordedCall === undefined) {
        throw new Error('the repository double recorded no call, so there is nothing to assert');
      }

      // Spelled out, because each negative here is a distinct way the value could have been
      // quietly mishandled: it is not coerced to undefined, not omitted from the call so that the
      // argument count changes.
      expect(recordedCall).toHaveLength(2);
      expect(recordedCall[1]).toBe('');
      expect(recordedCall[1]).not.toBeUndefined();
      expect(Array.isArray(recordedCall[1])).toBe(false);
    });

    it('answers an empty array when the repository finds nothing', async () => {
      // A fresh double seeded with nothing, because an empty result is a legitimate and MEANINGFUL
      // outcome here rather than an error: [model/validation/Product.json:L13] puts
      // `unusedProductOptions` under `{"contexts":"addOption","minCollection":1}`.
      const emptyRepository = new RecordingOptionRepository([], []);
      const serviceOverEmptyData = new OptionService(emptyRepository);

      const rows = await serviceOverEmptyData.getUnusedProductOptions(PRODUCT_ID, MULTI_ID_LIST);

      expect(rows).toStrictEqual([]);
      expect(rows).toHaveLength(0);
      expect(rows).not.toBeUndefined();

      // The call still happened - an empty answer is what the port said, not a short-circuit the
      // service took.
      expect(emptyRepository.unusedOptionCalls).toStrictEqual([[PRODUCT_ID, MULTI_ID_LIST]]);
    });
  });

  describe('getUnusedProductOptionGroups', () => {
    // Parameterized SQL - not applicable in this tier, for the same reason as its sibling.

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
      // The COMPILE-TIME half of the arity claim is these two call shapes themselves: handing a
      // product identifier to the group method, or omitting it from the option method.
      await service.getUnusedProductOptions(PRODUCT_ID, MULTI_ID_LIST);
      await service.getUnusedProductOptionGroups(MULTI_ID_LIST);

      const optionCall = optionRepository.unusedOptionCalls[0];
      const groupCall = optionRepository.unusedOptionGroupCalls[0];

      if (optionCall === undefined || groupCall === undefined) {
        throw new Error('one of the two repository members recorded no call');
      }

      // The run-time half.
      //
      // The asymmetry is the source own, at [model/dao/OptionDAO.cfc:L95] against
      // [model/dao/OptionDAO.cfc:L52-L53], and it is preserved rather than harmonised: this method
      // answers "every option group not in this list" across the whole catalog.
      expect(optionCall).toHaveLength(2);
      expect(groupCall).toHaveLength(1);
    });

    it('answers exactly the rows the repository produced, by identity', async () => {
      const rows = await service.getUnusedProductOptionGroups(MULTI_ID_LIST);

      expect(rows).toBe(seededOptionGroupRows);
    });

    it('answers option-group rows under the same select row type as its sibling', async () => {
      const rows = await service.getUnusedProductOptionGroups(MULTI_ID_LIST);

      // The legacy result here is option-GROUP rows, and the label is the group name ALONE - no
      // composition, no separator [model/dao/OptionDAO.cfc:L113].
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
      // unchanged.
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

      // Neither legacy function guards an empty list, and this one is where that matters most:
      // with `NOT IN` an empty list excludes nothing.
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
      // `{"contexts":"addOptionGroup","minCollection":1}`.
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
