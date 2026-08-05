/**
 * `OptionService` — the seven-member parity surface of `model/service/OptionService.cfc`.
 *
 * AAP authority: AAP §0.4.1.12 lists `slatwall-ts/test/services/OptionService.test.ts` | create |
 * "**NET-NEW**", and the AAP §0.4.4 wildcard row authorises `slatwall-ts/test/**` | create. The
 * member inventory this file is measured against is AAP §0.4.2.4 (the three members the component
 * declares) together with AAP §0.4.2.5 (the four the framework synthesized at run time and IR-1
 * requires be declared explicitly).
 *
 * Rules status: `review_rules` returned **No user rules provided**. Nothing below is derived from a
 * rule, none is invented, and the bar is held instead to the standards inventory of AAP §0.7.3 —
 * strict type safety, explicit dependency injection, one labelled test per converted member, and
 * preserve-and-annotate rather than repair.
 */
import type { SmartListMaterialisationBudget } from '../../src/adapters/mysql/SmartListQueryBuilder';
import { SmartListQueryBuilder } from '../../src/adapters/mysql/SmartListQueryBuilder';
import { createCatalogAggregateLoaders } from '../../src/adapters/mysql/SmartListQueryBuilder';
import { Option } from '../../src/domain/option/Option';
import { OptionGroup } from '../../src/domain/option/OptionGroup';
import { PUBLIC_ERROR_CODE, SmartListPropertyUnresolvedError } from '../../src/errors/DomainError';
import {
  OptionService,
  findProductOptionGroups,
  findProductOptionsByOptionGroup,
} from '../../src/services/OptionService';
import {
  DENY_ALL_POPULATION_AUTHORIZATION,
  buildOption,
  buildOptionGroup,
  buildProduct,
  buildSku,
  createFanningSqlExecutorDouble,
  createInMemoryOptionRepository,
  createSmartListQueryDouble,
  GENEROUS_SMART_LIST_BUDGET,
  smartListBudgetWithRowCeiling,
} from '../support/inMemoryRepositories';
import type { SelectOption } from '../../src/services/OptionService';
/*
 * No bounded-read type is imported here, because neither `optionService` nor `optionRepository` offers a
 * windowed listing: the window shape lives in `src/ports/SmartListQueryPort.ts` and waits for a member
 * with a production caller. A type import no declaration uses is the residue that makes an absent member
 * look like part of the surface, so there is none.
 */
import type {
  OptionRepository,
  UnusedOptionGroupRow,
  UnusedOptionRow,
} from '../../src/ports/repositories/OptionRepository';
import type { SmartListInput, SmartListQuery } from '../../src/ports/SmartListQueryPort';
import type {
  FanningSqlExecutorDouble,
  FanningSqlExecutorDoubleOptions,
  InMemoryOptionRepository,
  InMemoryOptionRepositoryOptions,
  SmartListQueryDouble,
  SmartListQueryDoubleOptions,
} from '../support/inMemoryRepositories';
import { OPTION_ACCESS_MATRIX, createOptionHandler } from '../../src/handlers/optionHandler';
import type {
  OptionAuthorizationEvent,
  OptionHandler,
  OptionSurface,
  OptionsForSelectEvent,
  UnusedProductOptionGroupsEvent,
  UnusedProductOptionsEvent,
} from '../../src/handlers/optionHandler';
import type {
  AccountReference,
  EntityAuthorizationRequest,
  RequestAuthorizationResolver,
} from '../../src/ports/AccountContextPort';

/*
 * Identifiers — 32 characters, no dashes (IR-6)
 * AAP IR-6, citing tech specification §6.2, records that 107 of 113 legacy entities declare
 * `fieldtype="id" generator="uuid" ormtype="string" length="32"`, so a primary key is a 32-character
 * string produced in application code and never a dashed RFC-4122 value and never an auto-increment
 * integer. These fixtures honour that width so a length or format assumption cannot pass here and
 * fail against `SwOption.optionID`.
 */

/**
 * `size` — the group whose name sorts last of the three, which is what makes ordering observable.
 */
const SIZE_GROUP_ID = '11111111111111111111111111111111';

/** `Colour` — sorts first of the three. */
const COLOUR_GROUP_ID = '22222222222222222222222222222222';

/**
 * `material` — sorts between the other two, so a leaked row lands mid-list rather than at an end.
 */
const MATERIAL_GROUP_ID = '33333333333333333333333333333333';

/**
 * `large`, in the `size` group. Sorts after `small` by name even though its sortOrder is higher.
 */
const LARGE_OPTION_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const SMALL_OPTION_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const BLUE_OPTION_ID = 'cccccccccccccccccccccccccccccccc';

const COTTON_OPTION_ID = 'dddddddddddddddddddddddddddddddd';

/** An identifier deliberately matching no seeded row, for the not-found paths. */
const ABSENT_OPTION_ID = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

/** The option-group counterpart of {@link ABSENT_OPTION_ID}. */
const ABSENT_GROUP_ID = 'ffffffffffffffffffffffffffffffff';

/** The product whose SKUs decide which options already count as used. */
const PRODUCT_ID = '99999999999999999999999999999999';

/** A second product, used to prove the usage correlation is per-product rather than global. */
const OTHER_PRODUCT_ID = '88888888888888888888888888888888';

/* Pure factories — fresh objects per call, never shared. */

/** One case's service together with the two doubles it was constructed from. */
interface Harness {
  readonly service: OptionService;
  readonly options: InMemoryOptionRepository;
  readonly smartList: SmartListQueryDouble;
}

/** Builds one isolated service graph. */
function harness(
  repositoryOptions: InMemoryOptionRepositoryOptions = {},
  smartListOptions: SmartListQueryDoubleOptions = {},
): Harness {
  const options = createInMemoryOptionRepository(repositoryOptions);
  const smartList = createSmartListQueryDouble(smartListOptions);

  return {
    service: new OptionService(options.repository, smartList.smartList),
    options,
    smartList,
  };
}

/** The three option groups and their four options, all freshly built. */
interface Catalogue {
  readonly size: OptionGroup;
  readonly colour: OptionGroup;
  readonly material: OptionGroup;
  readonly large: Option;
  readonly small: Option;
  readonly blue: Option;
  readonly cotton: Option;
}

/** Builds a fresh catalogue of three groups carrying four options between them. */
function catalogue(): Catalogue {
  const size = buildOptionGroup({
    optionGroupID: SIZE_GROUP_ID,
    optionGroupName: 'Size',
    optionGroupCode: 'size',
    sortOrder: 1,
  });
  const colour = buildOptionGroup({
    optionGroupID: COLOUR_GROUP_ID,
    optionGroupName: 'Colour',
    optionGroupCode: 'colour',
    sortOrder: 2,
  });
  const material = buildOptionGroup({
    optionGroupID: MATERIAL_GROUP_ID,
    optionGroupName: 'Material',
    optionGroupCode: 'material',
    sortOrder: 3,
  });

  return {
    size,
    colour,
    material,
    large: buildOption({
      optionID: LARGE_OPTION_ID,
      optionName: 'Large',
      optionCode: 'lg',
      sortOrder: 2,
      optionGroup: size,
    }),
    small: buildOption({
      optionID: SMALL_OPTION_ID,
      optionName: 'Small',
      optionCode: 'sm',
      sortOrder: 1,
      optionGroup: size,
    }),
    blue: buildOption({
      optionID: BLUE_OPTION_ID,
      optionName: 'Blue',
      optionCode: 'blue',
      sortOrder: 1,
      optionGroup: colour,
    }),
    cotton: buildOption({
      optionID: COTTON_OPTION_ID,
      optionName: 'Cotton',
      optionCode: 'cotton',
      sortOrder: 1,
      optionGroup: material,
    }),
  };
}

/** Builds one SKU, belonging to a freshly built product, that already uses the given options. */
function skuUsing(productID: string, usedOptions: readonly Option[]) {
  return buildSku({
    skuCode: `${productID}-1`,
    options: usedOptions,
    product: buildProduct({ productID }),
  });
}

/**
 * Builds a one-off repository that answers both unbounded members with the same array instance every
 * time, so a caller can prove the service returned that instance rather than a copy of it.
 */
function passThroughRepository(
  optionRows: UnusedOptionRow[],
  optionGroupRows: UnusedOptionGroupRow[],
): OptionRepository {
  const seeded = createInMemoryOptionRepository();

  return {
    ...seeded.repository,
    findUnusedOptions: () => Promise.resolve(optionRows),
    findUnusedOptionGroups: () => Promise.resolve(optionGroupRows),
  };
}

/*
 * 1. getOptionsForSelect —, the one synchronous, I/O-free member
 * port of [model/service/OptionService.cfc:L55-L63]:
 *
 * Public array function getOptionsForSelect(required any options){
 * var sortedOptions = [];
 * for(i=1; i <= arrayLen(arguments.options); i++){
 * arrayAppend(sortedOptions,{name=arguments.options[i].getOptionName(),
 * value=arguments.options[i].getOptionID()});
 *
 * TODO(parity) — model/service/OptionService.cfc:L58: the loop counter `i` is declared without
 * `var`, so it lands in the component's shared `variables` scope. DI/1 registers services as
 * singletons, so on a persistent application server that scope is shared across concurrent requests
 * — the same concurrency-hazard class as carried defect D10 in `model/service/ProductService.cfc`.
 */
describe('OptionService.getOptionsForSelect', () => {
  it('NET-NEW — model/service/OptionService.cfc:L55-L63 — projects an ARRAY of options into {name, value} entries in input order', () => {
    const { size } = catalogue();
    /*
     * The legacy parameter is `required any`, but the body immediately applies `arrayLen` and `[i]`
     * to it at [:L58], so the observed contract is an array. AAP §0.4.2.4 records that TR-1
     * tightening, and this case exercises the tightened form.
     */
    const options: Option[] = size.getOptions();

    const entries: SelectOption[] = harness().service.getOptionsForSelect(options);

    expect(entries).toStrictEqual([
      { name: 'Large', value: LARGE_OPTION_ID },
      { name: 'Small', value: SMALL_OPTION_ID },
    ]);
  });

  it('NET-NEW — `sortedOptions` is a MISNOMER: no sort happens, so a non-alphabetical input order survives verbatim', () => {
    const { large, small, blue, cotton } = catalogue();
    /*
     * Deliberately neither alphabetical by name nor ascending by sortOrder. The legacy local is
     * named `sortedOptions` at [model/service/OptionService.cfc:L56], but there is no `arraySort`,
     * no comparator and no ordered query anywhere in the body — the name is simply wrong, and it is
     * carried rather than corrected in either direction.
     */
    const unsorted: Option[] = [cotton, large, blue, small];

    const entries = harness().service.getOptionsForSelect(unsorted);

    expect(entries.map((entry) => entry.name)).toStrictEqual(['Cotton', 'Large', 'Blue', 'Small']);
  });

  it('NET-NEW — the label is the BARE option name; the composite "<group> - <option>" form belongs ONLY to getUnusedProductOptions', async () => {
    const { size, large } = catalogue();
    const { service } = harness({ optionGroups: [size] });

    const projected = service.getOptionsForSelect([large]);
    const unused = await service.getUnusedProductOptions(PRODUCT_ID, SIZE_GROUP_ID);

    /*
     * The two members produce the same shape carrying different label semantics, and harmonising
     * them would change output. This member reads the option's own name at
     * [model/service/OptionService.cfc:L59]; the repository composes the group name and the option
     * name into one label at [model/dao/OptionDAO.cfc:L88]. Both are asserted here, side by side, so
     * the distinction is pinned rather than argued about.
     */
    expect(projected).toStrictEqual([{ name: 'Large', value: LARGE_OPTION_ID }]);
    expect(projected).not.toContainEqual({ name: 'Size - Large', value: LARGE_OPTION_ID });
    expect(unused).toContainEqual({ name: 'Size - Large', value: LARGE_OPTION_ID });
  });

  it('NET-NEW — an EMPTY input yields an empty array, because `arrayLen` of an empty array is zero', () => {
    /*
     * `arrayLen([])` is 0, the legacy loop body never runs, and `sortedOptions` is returned as the
     * empty array it was initialised to at [model/service/OptionService.cfc:L56]. No guard, no
     * throw, no null.
     */
    expect(harness().service.getOptionsForSelect([])).toStrictEqual([]);
  });

  it('NET-NEW — DUPLICATES and CARDINALITY are preserved: N options in yields N entries out', () => {
    const { large } = catalogue();

    const entries = harness().service.getOptionsForSelect([large, large, large]);

    /*
     * The legacy appends once per index with no membership test, so a caller that passes the same
     * option three times gets three entries. De-duplicating would change cardinality, which callers
     * building a drop-down would observe.
     */
    expect(entries).toStrictEqual([
      { name: 'Large', value: LARGE_OPTION_ID },
      { name: 'Large', value: LARGE_OPTION_ID },
      { name: 'Large', value: LARGE_OPTION_ID },
    ]);
  });

  it('NET-NEW — an ABSENT optionName yields an EMPTY label rather than a skipped entry or a substituted one', () => {
    /*
     * [model/entity/Option.cfc:L54] declares `optionName` as a nullable column, and CFML models a
     * null column as a key absent from the object — so `{name=<null>}` simply does not create the
     * key and the renderer emits an entry with an empty label. It does not fail and it does not skip
     * the entry. The empty string reproduces that outcome. Skipping would change cardinality, and
     * substituting the identifier or the option code would invent a display rule the source does not
     * have.
     */
    const nameless = buildOption({ optionID: LARGE_OPTION_ID, optionCode: 'lg' });
    expect(nameless.optionName).toBeUndefined();

    expect(harness().service.getOptionsForSelect([nameless])).toStrictEqual([
      { name: '', value: LARGE_OPTION_ID },
    ]);
  });

  it('NET-NEW — the input array is NOT mutated and the entries are new objects, not the options themselves', () => {
    const { large, small } = catalogue();
    const options: Option[] = [large, small];

    const entries = harness().service.getOptionsForSelect(options);

    expect(options).toStrictEqual([large, small]);
    expect(options[0]).toBe(large);
    expect(entries[0]).not.toBe(large);
    expect(large).toBeInstanceOf(Option);
  });

  it('NET-NEW — the member touches NEITHER collaborator: no repository call and no smart-list query is issued', () => {
    const { size } = catalogue();
    const { service, options, smartList } = harness({ optionGroups: [size] });

    service.getOptionsForSelect(size.getOptions());

    /*
     * This is the only member of the service whose legacy body reads no data-access object and no
     * collaborator — it reads two accessors off objects the caller already holds. That is why the
     * landed signature returns the array directly instead of a promise, and the two empty logs below
     * are what make the claim checkable rather than asserted.
     */
    expect(options.calls).toStrictEqual([]);
    expect(smartList.queries).toStrictEqual([]);
  });
});

/*
 * 2. getUnusedProductOptions — the first DAO pass-through
 * port of [model/service/OptionService.cfc:L72-L74]:
 *
 * Public array function getUnusedProductOptions(required string productID,
 * required string existingOptionGroupIDList){
 * return getOptionDAO().getUnusedProductOptions(argumentCollection=arguments);
 * }.
 */
describe('OptionService.getUnusedProductOptions', () => {
  it('NET-NEW — model/service/OptionService.cfc:L72-L74 — forwards BOTH required arguments explicitly, productID first and the group list second', async () => {
    const { size, colour } = catalogue();
    const { service, options } = harness({ optionGroups: [size, colour] });

    await service.getUnusedProductOptions(PRODUCT_ID, `${SIZE_GROUP_ID},${COLOUR_GROUP_ID}`);

    /*
     * The roles are asserted, not just the values: the recorded call names each argument, so a
     * transposed forwarding — product identifier into the list slot — fails here rather than
     * silently returning the wrong set.
     */
    expect(options.calls).toStrictEqual([
      {
        member: 'findUnusedOptions',
        productID: PRODUCT_ID,
        existingOptionGroupIDList: `${SIZE_GROUP_ID},${COLOUR_GROUP_ID}`,
      },
    ]);
  });

  it('NET-NEW — model/dao/OptionDAO.cfc:L87-L89 — each row carries the composite "<group> - <option>" label and the OPTION identifier as its value', async () => {
    const { size } = catalogue();
    const { service } = harness({ optionGroups: [size] });

    const rows = await service.getUnusedProductOptions(PRODUCT_ID, SIZE_GROUP_ID);

    /*
     * [:L88] builds `{name="#rs.optionGroupName# - #rs.optionName#", value=rs.optionID}` — one
     * literal space, one hyphen, one literal space — and the value is the option's identifier, never
     * the group's. Both halves are pinned because either could drift without a type error.
     */
    expect(rows).toStrictEqual([
      { name: 'Size - Large', value: LARGE_OPTION_ID },
      { name: 'Size - Small', value: SMALL_OPTION_ID },
    ]);
  });

  it('NET-NEW — model/dao/OptionDAO.cfc:L68 — only options of groups IS IN the supplied list are returned', async () => {
    const { size, colour, material } = catalogue();
    const { service } = harness({ optionGroups: [size, colour, material] });

    const rows = await service.getUnusedProductOptions(
      PRODUCT_ID,
      `${SIZE_GROUP_ID},${COLOUR_GROUP_ID}`,
    );

    /*
     * `Material` is seeded but not listed, and its name sorts between the two that are, so a leak
     * would appear in the middle of the sequence rather than at either end.
     */
    expect(rows).toStrictEqual([
      { name: 'Colour - Blue', value: BLUE_OPTION_ID },
      { name: 'Size - Large', value: LARGE_OPTION_ID },
      { name: 'Size - Small', value: SMALL_OPTION_ID },
    ]);
  });

  it('NET-NEW — model/dao/OptionDAO.cfc:L70-L81 — an option already used by THIS product is excluded by the correlated NOT EXISTS', async () => {
    const { size, large, small } = catalogue();
    const { service } = harness({ optionGroups: [size], skus: [skuUsing(PRODUCT_ID, [large])] });

    const rows = await service.getUnusedProductOptions(PRODUCT_ID, SIZE_GROUP_ID);

    expect(rows).toStrictEqual([{ name: 'Size - Small', value: small.optionID }]);
    expect(rows).not.toContainEqual({ name: 'Size - Large', value: large.optionID });
  });

  it('NET-NEW — the usage exclusion is CORRELATED PER PRODUCT: another product using the option does not exclude it here', async () => {
    const { size } = catalogue();
    const { service } = harness({
      optionGroups: [size],
      skus: [skuUsing(OTHER_PRODUCT_ID, size.getOptions())],
    });

    const rows = await service.getUnusedProductOptions(PRODUCT_ID, SIZE_GROUP_ID);

    /*
     * [:L78] binds the product identifier into the subquery, so usage is asked of one product. A
     * global "is this option used anywhere" reading would return an empty list here.
     */
    expect(rows).toStrictEqual([
      { name: 'Size - Large', value: LARGE_OPTION_ID },
      { name: 'Size - Small', value: SMALL_OPTION_ID },
    ]);
  });

  it('NET-NEW — model/dao/OptionDAO.cfc:L82-L84 — rows are ordered by GROUP NAME then OPTION NAME, not by sortOrder and not in seeded order', async () => {
    const { size, colour, material } = catalogue();
    /*
     * Seeded Size, Colour, Material — alphabetically Colour, Material, Size — with sortOrder values
     * 1, 2, 3 in the seeded arrangement. All three orderings are distinguishable, and only the
     * two-term name ordering of [:L82-L84] produces the sequence below.
     */
    const { service } = harness({ optionGroups: [size, colour, material] });

    const rows = await service.getUnusedProductOptions(
      PRODUCT_ID,
      `${SIZE_GROUP_ID},${COLOUR_GROUP_ID},${MATERIAL_GROUP_ID}`,
    );

    expect(rows.map((row) => row.name)).toStrictEqual([
      'Colour - Blue',
      'Material - Cotton',
      'Size - Large',
      'Size - Small',
    ]);
  });

  it('NET-NEW — an EMPTY group list is a legal input and yields NO rows, because the single empty identifier matches no group on the IN side', async () => {
    const { size, colour, material } = catalogue();
    const { service, options } = harness({ optionGroups: [size, colour, material] });

    const rows = await service.getUnusedProductOptions(PRODUCT_ID, '');

    /*
     * The asymmetry with the sibling member is load bearing and is asserted in both directions —
     * here, and in the group suite below. It is not reconciled: [model/dao/OptionDAO.cfc:L68] keeps
     * rows whose group is in the list, so an empty list keeps nothing, whereas [:L107] keeps rows
     * whose group is not in it, so an empty list keeps everything. Both answers are correct for the
     * question each member asks.
     */
    expect(rows).toStrictEqual([]);
    expect(options.calls).toStrictEqual([
      { member: 'findUnusedOptions', productID: PRODUCT_ID, existingOptionGroupIDList: '' },
    ]);
  });

  it('NET-NEW — the repository result is returned BY IDENTITY: the service performs no map, sort, filter or relabelling of its own', async () => {
    const rows: UnusedOptionRow[] = [{ name: 'Size - Large', value: LARGE_OPTION_ID }];
    const service = new OptionService(
      passThroughRepository(rows, []),
      createSmartListQueryDouble().smartList,
    );

    /*
     * A one-statement pass-through ported as a one-statement delegation. Identity is the strongest
     * available statement of "no mapping happened", and it is the property that keeps the label
     * semantics of [model/dao/OptionDAO.cfc:L88] decided in exactly one place.
     */
    expect(await service.getUnusedProductOptions(PRODUCT_ID, SIZE_GROUP_ID)).toBe(rows);
  });
});

/*
 * 3. getUnusedProductOptionGroups — the second DAO pass-through
 * port of [model/service/OptionService.cfc:L76-L78]:
 *
 * Public array function getUnusedProductOptionGroups(required string existingOptionGroupIDList){
 * return getOptionDAO().getUnusedProductOptionGroups(argumentCollection=arguments);
 * }.
 */
describe('OptionService.getUnusedProductOptionGroups', () => {
  it('NET-NEW — model/service/OptionService.cfc:L76-L78 — forwards its ONE required argument explicitly, with no argument bag', async () => {
    const { size, colour } = catalogue();
    const { service, options } = harness({ optionGroups: [size, colour] });

    await service.getUnusedProductOptionGroups(SIZE_GROUP_ID);

    /*
     * The legacy `argumentCollection=arguments` at [:L77] forwarded a by-name bag; the landed member
     * forwards one typed positional parameter. The recorded call carries exactly that one argument
     * and nothing else, which is what "never reintroduce an argument bag" looks like from the
     * repository's side.
     */
    expect(options.calls).toStrictEqual([
      { member: 'findUnusedOptionGroups', existingOptionGroupIDList: SIZE_GROUP_ID },
    ]);
  });

  it('NET-NEW — model/dao/OptionDAO.cfc:L113 — each row is {name: optionGroupName, value: optionGroupID}: a BARE group name and the GROUP identifier', async () => {
    const { size } = catalogue();
    const { service } = harness({ optionGroups: [size] });

    const rows = await service.getUnusedProductOptionGroups(COLOUR_GROUP_ID);

    /*
     * No composition of any kind here — contrast [:L88], which joins two names into one label — and
     * the value is the GROUP's identifier, not an option's. The two members return the same shape
     * carrying different meanings, so neither the labels nor the identifier kinds may be harmonised.
     */
    expect(rows).toStrictEqual([{ name: 'Size', value: SIZE_GROUP_ID }]);
  });

  it('NET-NEW — model/dao/OptionDAO.cfc:L107 — the set polarity is INVERTED relative to the sibling member: groups NOT IN the supplied list', async () => {
    const { size, colour, material } = catalogue();
    const { service } = harness({ optionGroups: [size, colour, material] });

    const rows = await service.getUnusedProductOptionGroups(SIZE_GROUP_ID);

    /*
     * One token of difference between [:L68] (`IN`) and [:L107] (`NOT IN`), opposite questions. The
     * group named in the argument is the one absent from the answer.
     */
    expect(rows).toStrictEqual([
      { name: 'Colour', value: COLOUR_GROUP_ID },
      { name: 'Material', value: MATERIAL_GROUP_ID },
    ]);
    expect(rows).not.toContainEqual({ name: 'Size', value: SIZE_GROUP_ID });
  });

  it('NET-NEW — an EMPTY list resolves to EVERY option group, which is the OPPOSITE of the sibling member and is correct', async () => {
    const { size, colour, material } = catalogue();
    const { service } = harness({ optionGroups: [size, colour, material] });

    const rows = await service.getUnusedProductOptionGroups('');

    /*
     * A product with no option groups yet has none used, so every group is available to add. This is
     * the widest read in the service and it is preserved exactly: no default window, no cap and no
     * refusal is introduced, because introducing one would suppress the single most useful call the
     * member has.
     */
    expect(rows).toStrictEqual([
      { name: 'Colour', value: COLOUR_GROUP_ID },
      { name: 'Material', value: MATERIAL_GROUP_ID },
      { name: 'Size', value: SIZE_GROUP_ID },
    ]);
  });

  it('NET-NEW — model/dao/OptionDAO.cfc:L108-L109 — rows are ordered by GROUP NAME, not by sortOrder and not in seeded order', async () => {
    const { size, colour, material } = catalogue();
    const { service } = harness({ optionGroups: [size, colour, material] });

    const rows = await service.getUnusedProductOptionGroups(ABSENT_GROUP_ID);

    /*
     * Seeded Size, Colour, Material with sortOrder 1, 2, 3 in that same arrangement, so ordering by
     * sortOrder and ordering by seeded position both yield Size first. Only the name ordering of
     * [:L108-L109] yields colour first.
     */
    expect(rows.map((row) => row.name)).toStrictEqual(['Colour', 'Material', 'Size']);
  });

  it('NET-NEW — a multi-entry list excludes EVERY named group, and the list is forwarded byte for byte', async () => {
    const { size, colour, material } = catalogue();
    const { service, options } = harness({ optionGroups: [size, colour, material] });
    const suppliedList = `${SIZE_GROUP_ID},${MATERIAL_GROUP_ID}`;

    const rows = await service.getUnusedProductOptionGroups(suppliedList);

    expect(rows).toStrictEqual([{ name: 'Colour', value: COLOUR_GROUP_ID }]);
    expect(options.calls).toStrictEqual([
      { member: 'findUnusedOptionGroups', existingOptionGroupIDList: suppliedList },
    ]);
  });

  it('NET-NEW — the repository result is returned BY IDENTITY here too: no map, sort, filter or relabelling in the service', async () => {
    const groupRows: UnusedOptionGroupRow[] = [{ name: 'Colour', value: COLOUR_GROUP_ID }];
    const service = new OptionService(
      passThroughRepository([], groupRows),
      createSmartListQueryDouble().smartList,
    );

    expect(await service.getUnusedProductOptionGroups(SIZE_GROUP_ID)).toBe(groupRows);
  });

  it('NET-NEW — the two delegates reach DIFFERENT repository members, so neither is a rename of the other', async () => {
    const { size, colour } = catalogue();
    const { service, options } = harness({ optionGroups: [size, colour] });

    await service.getUnusedProductOptions(PRODUCT_ID, SIZE_GROUP_ID);
    await service.getUnusedProductOptionGroups(SIZE_GROUP_ID);

    expect(options.calls).toStrictEqual([
      {
        member: 'findUnusedOptions',
        productID: PRODUCT_ID,
        existingOptionGroupIDList: SIZE_GROUP_ID,
      },
      { member: 'findUnusedOptionGroups', existingOptionGroupIDList: SIZE_GROUP_ID },
    ]);
  });
});

/*
 * 4. getOption — IR-1, declared explicitly because nothing declared it before
 * There is no declaration of this member anywhere in `model/service/OptionService.cfc`. It resolved at
 * run time through `onMissingMethod` [org/Hibachi/HibachiService.cfc:L255-L281], whose `get` prefix
 * test at [:L258] routed it to the framework's identifier load. The dispatcher's own docblock states
 * "Ordered arguments only--named arguments not supported" at [:L253], and an unmatched name reached a
 * throw at [:L280] — so the surface existed only as long as the prefix convention did.
 */
describe('OptionService.getOption', () => {
  it('NET-NEW — AAP §0.4.2.5 / model/service/SkuService.cfc:L74 — the identifier is forwarded verbatim as an optionID filter rooted at SlatwallOption', async () => {
    const { large } = catalogue();
    const { service, smartList } = harness(
      {},
      { outcomes: [{ kind: 'page', metrics: {}, records: [large] }] },
    );

    await service.getOption(LARGE_OPTION_ID);

    /*
     * A whole-query assertion rather than a spot check on one field: it pins the root entity, the
     * filter property, the bound value and the absence of anything else — no ordering, no pagination,
     * no distinct flag and no second filter is added by the service.
     */
    expect(smartList.lastQuery()).toStrictEqual({
      entityName: 'SlatwallOption',
      whereGroups: [{ filters: [{ propertyIdentifier: 'optionID', value: LARGE_OPTION_ID }] }],
    });
  });

  it('NET-NEW — a MATCH resolves to that option instance, and it is a real Option entity', async () => {
    const { large } = catalogue();
    const { service } = harness(
      {},
      { outcomes: [{ kind: 'page', metrics: {}, records: [large] }] },
    );

    const found = await service.getOption(LARGE_OPTION_ID);

    expect(found).toBe(large);
    expect(found).toBeInstanceOf(Option);
  });

  it('NET-NEW — a MISS resolves to null and NEVER to a newly created option', async () => {
    const { service, smartList } = harness();

    const found = await service.getOption(ABSENT_OPTION_ID);

    /*
     * The dispatcher's convention was `getXXX(required any ID, boolean isReturnNewOnNotFound = false)`
     * and both real slice call sites pass the identifier alone, so the second argument took its
     * default of `false` and the framework returned nothing at all on a miss. The landed member
     * therefore offers no `isReturnNewOnNotFound` parameter: offering one would widen the surface
     * beyond the observed contract.
     */
    expect(found).toBeNull();
    expect(smartList.lastQuery()).toStrictEqual({
      entityName: 'SlatwallOption',
      whereGroups: [{ filters: [{ propertyIdentifier: 'optionID', value: ABSENT_OPTION_ID }] }],
    });
  });

  it('NET-NEW — the FIRST record wins when a query somehow answers with several, rather than raising', async () => {
    const { large, small } = catalogue();
    const { service } = harness(
      {},
      { outcomes: [{ kind: 'page', metrics: {}, records: [large, small] }] },
    );

    /*
     * A primary-key filter can match at most one row against MySQL, so this is a defensive statement
     * about the landed `records[0] ?? null` rather than a reachable production case. It is asserted
     * because the alternative reading — raise on more than one — would be a behaviour the legacy
     * primary-key load never had.
     */
    expect(await service.getOption(LARGE_OPTION_ID)).toBe(large);
  });

  it('NET-NEW — the read asks for the RECORDS view alone, so one statement is issued rather than three', async () => {
    const { service, smartList } = harness();

    await service.getOption(LARGE_OPTION_ID);

    /*
     * `SmartListQueryPort` declares `execute` for all three legacy views and `executeRecords` for the
     * unpaged collection alone. A primary-key load is one statement in the legacy
     * (`entityLoadByPK`), so selecting the records-only view is what keeps it one here.
     */
    expect(smartList.executions.map((execution) => execution.selection)).toStrictEqual([
      'recordsOnly',
    ]);
  });

  it('NET-NEW — an EMPTY identifier is still forwarded rather than short-circuited, so no guard the legacy lacked is invented', async () => {
    const { service, smartList } = harness();

    const found = await service.getOption('');

    expect(found).toBeNull();
    expect(smartList.lastQuery()).toStrictEqual({
      entityName: 'SlatwallOption',
      whereGroups: [{ filters: [{ propertyIdentifier: 'optionID', value: '' }] }],
    });
  });
});

/*
 * 5. getOptionGroup — IR-1, the same treatment for the other root entity
 * Also undeclared in `model/service/OptionService.cfc`, also synthesized by the `get` prefix branch of
 * `onMissingMethod` [org/Hibachi/HibachiService.cfc:L255-L281].
 */
describe('OptionService.getOptionGroup', () => {
  it('NET-NEW — AAP §0.4.2.5 / model/service/ProductService.cfc:L115 — the identifier is forwarded verbatim as an optionGroupID filter rooted at SlatwallOptionGroup', async () => {
    const { size } = catalogue();
    const { service, smartList } = harness(
      {},
      { outcomes: [{ kind: 'page', metrics: {}, records: [size] }] },
    );

    await service.getOptionGroup(SIZE_GROUP_ID);

    expect(smartList.lastQuery()).toStrictEqual({
      entityName: 'SlatwallOptionGroup',
      whereGroups: [{ filters: [{ propertyIdentifier: 'optionGroupID', value: SIZE_GROUP_ID }] }],
    });
  });

  it('NET-NEW — a MATCH resolves to that group instance, whose options are readable exactly as the call site reads them', async () => {
    const { size, large, small } = catalogue();
    const { service } = harness({}, { outcomes: [{ kind: 'page', metrics: {}, records: [size] }] });

    const found = await service.getOptionGroup(SIZE_GROUP_ID);

    expect(found).toBe(size);
    expect(found).toBeInstanceOf(OptionGroup);
    /*
     * [model/service/ProductService.cfc:L115] chains straight into `.getOptions()`, so the returned
     * group has to be the live entity rather than a projection. Asserted through the entity's own
     * accessor, which returns the live array.
     */
    expect(size.getOptions()).toStrictEqual([large, small]);
  });

  it('NET-NEW — a MISS resolves to null, which is the arm model/service/ProductService.cfc:L115 dereferences without checking', async () => {
    const { service } = harness();

    expect(await service.getOptionGroup(ABSENT_GROUP_ID)).toBeNull();
  });

  it('NET-NEW — the two identifier lookups are ROOTED DIFFERENTLY, so neither can answer the other question', async () => {
    const { service, smartList } = harness();

    await service.getOption(LARGE_OPTION_ID);
    await service.getOptionGroup(SIZE_GROUP_ID);

    /*
     * Two separate declared members, two different root entities and two different filter
     * properties. A single generic identifier member would have made these indistinguishable and
     * would have let an option identifier resolve against the group root with no compile error.
     */
    expect(smartList.queries.map((query: SmartListQuery) => query.entityName)).toStrictEqual([
      'SlatwallOption',
      'SlatwallOptionGroup',
    ]);
    expect(smartList.executions.map((execution) => execution.selection)).toStrictEqual([
      'recordsOnly',
      'recordsOnly',
    ]);
  });
});

/*
 * 6. getOptionSmartList — IR-1, the paginated dynamic query over options
 * Undeclared in `model/service/OptionService.cfc`. The legacy resolved it through `onMissingMethod`
 * [org/Hibachi/HibachiService.cfc:L255-L281], whose suffix test at [:L259-L260] recognised the
 * trailing `SmartList` and routed it to the framework's smart-list factory rather than to the
 * identifier load. AAP §0.4.2.5 mandates the explicit declaration.
 */
describe('OptionService.getOptionSmartList', () => {
  it('NET-NEW — AAP §0.4.2.5 / model/entity/Product.cfc:L341 — called with NO argument, the query carries the SlatwallOption root and nothing else', async () => {
    const { service, smartList } = harness();

    await service.getOptionSmartList();

    /*
     * An exact whole-query match, which is the point: it proves the service contributes no filter, no
     * ordering, no keyword property, no join, no page size and — critically — no `selectDistinctFlag`.
     * That matches the all-collections-empty state the legacy smart list is constructed in before its
     * caller touches it. The argument is optional precisely because [model/entity/Product.cfc:L341]
     * supplies none.
     */
    expect(smartList.lastQuery()).toStrictEqual({ entityName: 'SlatwallOption' });
  });

  it('NET-NEW — an EMPTY input object is indistinguishable from no argument at all', async () => {
    const { service, smartList } = harness();

    await service.getOptionSmartList({});

    expect(smartList.lastQuery()).toStrictEqual({ entityName: 'SlatwallOption' });
  });

  it('NET-NEW — model/entity/Product.cfc:L343-L345 — the caller-owned filters and ordering are forwarded VERBATIM, in the caller order, into one conjoined where group', async () => {
    const { service, smartList } = harness();

    await service.getOptionSmartList({
      'F:optionGroup.optionGroupID': SIZE_GROUP_ID,
      'F:skus.product.productID': PRODUCT_ID,
      OrderBy: 'sortOrder|ASC',
    });

    /*
     * Both filters land in one where group, which the legacy conjoins — so this is "options of this
     * group used by this product", not a union. The two paths differ in hop count and neither is a
     * typo for the other: `optionGroup.optionGroupID` is one hop over the required many-to-one at
     * [model/entity/Option.cfc:L59], while `skus.product.productID` is two, an option reaching its
     * SKUs directly through the `SwSkuOption` link table and thence their product.
     */
    expect(smartList.lastQuery()).toStrictEqual({
      entityName: 'SlatwallOption',
      whereGroups: [
        {
          filters: [
            { propertyIdentifier: 'optionGroup.optionGroupID', value: SIZE_GROUP_ID },
            { propertyIdentifier: 'skus.product.productID', value: PRODUCT_ID },
          ],
        },
      ],
      orders: [{ propertyIdentifier: 'sortOrder', direction: 'ASC' }],
    });
  });

  it('NET-NEW — the distinct flag of model/entity/Product.cfc:L342 is NOT expressible through the input, and is NOT switched on unilaterally', async () => {
    const { service, smartList } = harness();

    await service.getOptionSmartList({ 'F:optionName': 'Large' });

    /*
     * AAP §0.7.3 — the mismatch the landed service flags rather than fakes, asserted here so it cannot be
     * closed by accident. `src/services/OptionService.ts:241` and `:779` record it: the distinct flag
     * of the call site is a consequence left "for whoever ports model/entity/Product.cfc".
     */
    expect(smartList.lastQuery()).toStrictEqual({
      entityName: 'SlatwallOption',
      whereGroups: [{ filters: [{ propertyIdentifier: 'optionName', value: 'Large' }] }],
    });
  });

  /*
   * — the closed-identifier review item, asserted at this service's own boundary.
   * `src/services/OptionService.ts:288` states that the port resolves a caller-supplied property
   * path against its entity whitelist rather than accepting an open `string`, and
   * `src/ports/SmartListQueryPort.ts:268` carries the entity schema those closed identifiers are
   * derived from. The pair of cases below is that closure, observed through the only surface this
   * suite may touch: a path that does not resolve for the root cannot reach the emitted query.
   *
   * These cases previously asserted that such a path was dropped SILENTLY and that the query was
   * emitted without it, on the reasoning that raising "would turn a silently ignored request key into a
   * failed request". That reasoning was incomplete, and the QA pass that followed measured what it had
   * missed: the request the caller actually sent asked for a filtered selection, and dropping its one
   * predicate answers `200` with the ENTIRE table — rows the caller explicitly asked not to be given,
   * with nothing in the response indicating that anything was ignored. The refusal is now the asserted
   * behaviour, and it is a declared divergence from the legacy's discard, recorded in full beside
   * `composeUnresolvedPropertyPublicMessage` in `src/errors/DomainError.ts`.
   */
  it('NET-NEW — an option-GROUP property REFUSES an OPTION smart list rather than being dropped, so the request cannot be answered with the whole table', async () => {
    const { service, smartList } = harness();

    /*
     * `optionGroupName` is not a property of `SwOption`; reaching it from this root requires the
     * relationship hop asserted in the next case. The two roots genuinely use different property sets,
     * and resolving one against the other would compile, would not throw, and would silently admit the
     * wrong identifiers — so the closure itself is unchanged. Only the answer given to a path outside it
     * has changed, from a discard to a report.
     */
    await expect(service.getOptionSmartList({ 'F:optionGroupName': 'Size' })).rejects.toThrow(
      SmartListPropertyUnresolvedError,
    );

    // Refused before composition: no query was ever handed to the builder, so nothing was selected.
    expect(smartList.lastQuery()).toBeUndefined();
  });

  it('NET-NEW — the refusal names the offending path publicly and classifies as an invalid request, so a caller can act on it', async () => {
    const { service } = harness();

    const raised = await service.getOptionSmartList({ 'F:optionGroupName': 'Size' }).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(raised).toBeInstanceOf(SmartListPropertyUnresolvedError);
    const error = raised as SmartListPropertyUnresolvedError;

    // The path is quoted back, because a caller told only that "a" path was wrong has been told nothing
    // actionable. The request key it arrived on stays in the context, server-side.
    expect(error.getPublicError()).toStrictEqual({
      code: PUBLIC_ERROR_CODE.REQUEST_INVALID,
      message:
        'The request names a property path that the queried entity does not declare: ' +
        '"optionGroupName"',
    });
    expect(error.propertyPath).toBe('optionGroupName');
    expect(error.context).toStrictEqual({
      entityName: 'SlatwallOption',
      dataKey: 'F:optionGroupName',
    });
  });

  it('NET-NEW — a path spelled in the wrong case RESOLVES, because the legacy folded case and emitted the declared spelling', async () => {
    const { service, smartList } = harness();

    /*
     * The parity half of the same finding, and the larger half in practice. CFML admitted a path by
     * `structKeyExists` — case-insensitive — at `org/Hibachi/HibachiService.cfc:L750-L752`, then emitted
     * `entityProperties[ … ].name` at `org/Hibachi/HibachiSmartList.cfc:L347`, which is the DECLARED
     * spelling. So this filter reached Hibernate as `optionName` and filtered correctly. The port had
     * matched case-sensitively, which turned it into an unresolvable path and therefore, before the fix
     * above, into an unfiltered answer.
     */
    await service.getOptionSmartList({ 'F:OPTIONNAME': 'Large', OrderBy: 'SORTORDER|DESC' });

    expect(smartList.lastQuery()).toStrictEqual({
      entityName: 'SlatwallOption',
      whereGroups: [{ filters: [{ propertyIdentifier: 'optionName', value: 'Large' }] }],
      orders: [{ propertyIdentifier: 'sortOrder', direction: 'DESC' }],
    });
  });

  it('NET-NEW — a wrong-case RELATIONSHIP segment resolves too, and the emitted path carries the declared spelling of every segment', async () => {
    const { service, smartList } = harness();

    await service.getOptionSmartList({ 'F:OptionGroup.OPTIONGROUPNAME': 'Size' });

    /*
     * Both segments are rewritten, not merely admitted: the value that reaches the adapter is composed
     * entirely of schema-declared identifiers, which is a stronger guarantee than validating the
     * caller's string and then forwarding that. `joinRelatedProperty` folded intermediate segments the
     * same way at `org/Hibachi/HibachiSmartList.cfc:L239` and `:L273-L290`.
     */
    expect(smartList.lastQuery()).toStrictEqual({
      entityName: 'SlatwallOption',
      whereGroups: [
        { filters: [{ propertyIdentifier: 'optionGroup.optionGroupName', value: 'Size' }] },
      ],
    });
  });

  it('NET-NEW — the same group property SURVIVES when reached through the relationship hop, so the drop above is closure and not breakage', async () => {
    const { service, smartList } = harness();

    await service.getOptionSmartList({ 'F:optionGroup.optionGroupName': 'Size' });

    expect(smartList.lastQuery()).toStrictEqual({
      entityName: 'SlatwallOption',
      whereGroups: [
        { filters: [{ propertyIdentifier: 'optionGroup.optionGroupName', value: 'Size' }] },
      ],
    });
  });

  it('NET-NEW — an unresolvable OrderBy term refuses the whole request rather than being dropped beside a legal companion term', async () => {
    const { service, smartList } = harness();

    /*
     * The ordering family is refused for the same reason as the filter families, and refusing the whole
     * request rather than the one term is the deliberate choice: a caller who asked for two orderings and
     * silently received one has been given a differently sorted page than the one they asked for, and a
     * page is the unit they consume. `OrderBy` is one request key carrying a list, so one refusal answers
     * it.
     */
    await expect(
      service.getOptionSmartList({ OrderBy: 'optionGroupName|ASC,sortOrder|DESC' }),
    ).rejects.toThrow(SmartListPropertyUnresolvedError);

    expect(smartList.lastQuery()).toBeUndefined();
  });

  it('NET-NEW — a legal OrderBy list still reaches the query with every term and its direction, so the refusal above is closure and not breakage', async () => {
    const { service, smartList } = harness();

    await service.getOptionSmartList({ OrderBy: 'optionName|ASC,sortOrder|DESC' });

    expect(smartList.lastQuery()).toStrictEqual({
      entityName: 'SlatwallOption',
      orders: [
        { propertyIdentifier: 'optionName', direction: 'ASC' },
        { propertyIdentifier: 'sortOrder', direction: 'DESC' },
      ],
    });
  });

  it('NET-NEW — every section of the input grammar reaches the query, and the service adds nothing to any of them', async () => {
    const { service, smartList } = harness();

    await service.getOptionSmartList({
      'FK:optionName': 'lar',
      'FI:optionID': `${LARGE_OPTION_ID},${SMALL_OPTION_ID}`,
      'R:sortOrder': '1^5',
      keyword: 'red shirt',
      'P:Show': 25,
      'P:Start': 11,
      'P:Current': 3,
    });

    /*
     * One case rather than seven, because the claim is about the whole projection: like filters gain
     * their wildcards, in-filters keep their raw comma list, ranges split on the caret, keywords split
     * on the separator, and all three page controls arrive — with `P:Current` carried as a string,
     * which is the shape the legacy request key had. Nothing is added and nothing is silently
     * normalised away.
     */
    expect(smartList.lastQuery()).toStrictEqual({
      entityName: 'SlatwallOption',
      whereGroups: [
        {
          likeFilters: [{ propertyIdentifier: 'optionName', value: '%lar%' }],
          inFilters: [
            {
              propertyIdentifier: 'optionID',
              value: `${LARGE_OPTION_ID},${SMALL_OPTION_ID}`,
            },
          ],
          ranges: [{ propertyIdentifier: 'sortOrder', lowerBound: '1', upperBound: '5' }],
        },
      ],
      keywords: ['red', 'shirt'],
      pagination: { pageRecordsStart: 11, pageRecordsShow: 25, currentPageDeclaration: '3' },
    });
  });

  it('NET-NEW — the executed outcome is returned intact: records, page records and all four paging figures', async () => {
    const { large, small } = catalogue();
    const { service } = harness(
      {},
      { outcomes: [{ kind: 'page', metrics: {}, records: [large, small] }] },
    );

    const result = await service.getOptionSmartList();

    /*
     * The landed signature returns an already-executed result rather than a configurable object, so
     * the whole page is the service's return value and every figure on it is observable.
     */
    expect(result.records).toStrictEqual([large, small]);
    expect(result.pageRecords).toStrictEqual([large, small]);
    expect(result.recordsCount).toBe(2);
    expect(result.pageRecordsStart).toBe(1);
    expect(result.pageRecordsEnd).toBe(2);
    expect(result.currentPage).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it('NET-NEW — the read asks for ALL THREE views, unlike the identifier lookups which ask for records alone', async () => {
    const { service, smartList } = harness();

    await service.getOptionSmartList();
    await service.getOption(LARGE_OPTION_ID);

    /*
     * A smart list materialises the collection, the page and the total — three statements in the
     * legacy, each on first read. An identifier load is one. Recording the selection is what makes
     * that difference checkable rather than a matter of reading the implementation.
     */
    expect(smartList.executions.map((execution) => execution.selection)).toStrictEqual([
      'allViews',
      'recordsOnly',
    ]);
  });

  it('NET-NEW — a failing query REJECTS rather than resolving to an empty page, so a caller cannot mistake an error for no rows', async () => {
    const failure = new Error('the option smart list could not be materialised');
    const { service } = harness({}, { outcomes: [{ kind: 'failure', failure }] });

    await expect(service.getOptionSmartList()).rejects.toThrow(failure);
  });
});

/*
 * 7. getOptionGroupSmartList — IR-1, the same member on the other root entity
 * Also undeclared, also synthesized by the `SmartList` suffix branch of `onMissingMethod`
 * [org/Hibachi/HibachiService.cfc:L255-L281].
 */
describe('OptionService.getOptionGroupSmartList', () => {
  it('NET-NEW — AAP §0.4.2.5 / model/entity/Product.cfc:L254 — called with NO argument, the query carries the SlatwallOptionGroup root and nothing else', async () => {
    const { service, smartList } = harness();

    await service.getOptionGroupSmartList();

    expect(smartList.lastQuery()).toStrictEqual({ entityName: 'SlatwallOptionGroup' });
  });

  it('NET-NEW — model/entity/Product.cfc:L256-L257 — the THREE-HOP product path and the ordering are forwarded verbatim on THIS root', async () => {
    const { service, smartList } = harness();

    await service.getOptionGroupSmartList({
      'F:options.skus.product.productID': PRODUCT_ID,
      OrderBy: 'sortOrder|ASC',
    });

    /*
     * The path resolves here and only here: group -> options -> skus -> product. It is one hop longer
     * than the option-side equivalent asserted in the previous suite, and the difference is real
     * rather than a transcription slip. `sortOrder` is a persistent column on both entities —
     * [model/entity/OptionGroup.cfc:L58] and [model/entity/Option.cfc:L56] — so the same ordering term
     * is legal on either root.
     */
    expect(smartList.lastQuery()).toStrictEqual({
      entityName: 'SlatwallOptionGroup',
      whereGroups: [
        { filters: [{ propertyIdentifier: 'options.skus.product.productID', value: PRODUCT_ID }] },
      ],
      orders: [{ propertyIdentifier: 'sortOrder', direction: 'ASC' }],
    });
  });

  it('NET-NEW — an OPTION property REFUSES an OPTION-GROUP smart list, which is the mirror image of the option-root case', async () => {
    const { service, smartList } = harness();

    /*
     * Asserted in both directions on purpose. This service is the only one in the slice that roots a
     * smart list at either of two entities, so a whitelist applied to the wrong root would compile,
     * would not throw, and would silently admit or discard the wrong identifiers — precisely the
     * class of failure that has to be pinned by a test rather than argued about. The root-specific
     * closure is unchanged; what this case now pins is that crossing it is reported.
     */
    await expect(service.getOptionGroupSmartList({ 'F:optionName': 'Large' })).rejects.toThrow(
      SmartListPropertyUnresolvedError,
    );

    expect(smartList.lastQuery()).toBeUndefined();
  });

  it('NET-NEW — the same option property SURVIVES through the group\u2019s own collection hop', async () => {
    const { service, smartList } = harness();

    await service.getOptionGroupSmartList({ 'F:options.optionName': 'Large' });

    expect(smartList.lastQuery()).toStrictEqual({
      entityName: 'SlatwallOptionGroup',
      whereGroups: [{ filters: [{ propertyIdentifier: 'options.optionName', value: 'Large' }] }],
    });
  });

  it('NET-NEW — the distinct flag of model/entity/Product.cfc:L255 is not added here either', async () => {
    const { service, smartList } = harness();

    await service.getOptionGroupSmartList({ 'F:optionGroupCode': 'size' });

    expect(smartList.lastQuery()).toStrictEqual({
      entityName: 'SlatwallOptionGroup',
      whereGroups: [{ filters: [{ propertyIdentifier: 'optionGroupCode', value: 'size' }] }],
    });
  });

  it('NET-NEW — the executed outcome is returned intact, carrying real OptionGroup entities', async () => {
    const { size, colour } = catalogue();
    const { service } = harness(
      {},
      { outcomes: [{ kind: 'page', metrics: {}, records: [size, colour] }] },
    );

    const result = await service.getOptionGroupSmartList();

    expect(result.records).toStrictEqual([size, colour]);
    expect(result.recordsCount).toBe(2);
    /*
     * The records are the live entities the caller at [model/entity/Product.cfc:L258] stores and later
     * reads options off, so their type is part of the contract rather than incidental.
     */
    expect(result.records.every((record) => record instanceof OptionGroup)).toBe(true);
  });

  it('NET-NEW — the two smart lists are ROOTED DIFFERENTLY and neither leaks its root into the other', async () => {
    const { service, smartList } = harness();

    await service.getOptionSmartList({ 'F:optionName': 'Large' });
    await service.getOptionGroupSmartList({ 'F:optionGroupName': 'Size' });
    await service.getOptionSmartList();

    expect(smartList.queries.map((query: SmartListQuery) => query.entityName)).toStrictEqual([
      'SlatwallOption',
      'SlatwallOptionGroup',
      'SlatwallOption',
    ]);
    /*
     * And the third call, made with no argument after two configured ones, carries no residue of
     * either — the projection is computed per call and nothing is accumulated on the service.
     */
    expect(smartList.lastQuery()).toStrictEqual({ entityName: 'SlatwallOption' });
  });

  it('NET-NEW — a failing query REJECTS here too', async () => {
    const failure = new Error('the option-group smart list could not be materialised');
    const { service } = harness({}, { outcomes: [{ kind: 'failure', failure }] });

    await expect(service.getOptionGroupSmartList()).rejects.toThrow(failure);
  });
});

/*
 * 8. M7 — invocation isolation: nothing survives between two service graphs
 * AAP §0.6.6 mismatch M7 is the one execution-model difference this file can and must demonstrate.
 */
describe('OptionService — M7 invocation isolation', () => {
  it('NET-NEW — M7: two independently constructed services do not share smart-list query state', async () => {
    const first = catalogue();
    const firstGraph = harness(
      {},
      { outcomes: [{ kind: 'page', metrics: {}, records: [first.large, first.small] }] },
    );
    const second = catalogue();
    const secondGraph = harness(
      {},
      { outcomes: [{ kind: 'page', metrics: {}, records: [second.blue] }] },
    );

    /* Invocation 1 configures a filter, an ordering and a page size on the option root. */
    await firstGraph.service.getOptionSmartList({
      'F:optionGroup.optionGroupID': SIZE_GROUP_ID,
      OrderBy: 'sortOrder|DESC',
      'P:Show': 5,
    });
    /* Invocation 2 is a bare call on the option-GROUP root, through a different service. */
    const secondResult = await secondGraph.service.getOptionGroupSmartList();

    expect(secondGraph.smartList.queries).toHaveLength(1);
    expect(secondGraph.smartList.lastQuery()).toStrictEqual({
      entityName: 'SlatwallOptionGroup',
    });
    expect(secondResult.records).toStrictEqual([second.blue]);
    /*
     * And the first graph is equally untouched by the second, so isolation is symmetric rather than
     * merely one-directional.
     */
    expect(firstGraph.smartList.queries).toHaveLength(1);
    expect(firstGraph.smartList.lastQuery()).toStrictEqual({
      entityName: 'SlatwallOption',
      whereGroups: [
        { filters: [{ propertyIdentifier: 'optionGroup.optionGroupID', value: SIZE_GROUP_ID }] },
      ],
      orders: [{ propertyIdentifier: 'sortOrder', direction: 'DESC' }],
      pagination: { pageRecordsShow: 5 },
    });
  });

  it('NET-NEW — M7: two independently constructed services do not share repository state or seeded rows', async () => {
    const first = catalogue();
    const firstGraph = harness({ optionGroups: [first.size, first.colour, first.material] });
    const second = catalogue();
    const secondGraph = harness({ optionGroups: [second.colour] });

    const firstRows = await firstGraph.service.getUnusedProductOptionGroups('');
    const secondRows = await secondGraph.service.getUnusedProductOptionGroups('');

    /*
     * The same call, the same argument, two different answers — because each graph reads only its own
     * seeds. A module-scope catalogue shared between them would make the second answer include the
     * first's groups.
     */
    expect(firstRows.map((row) => row.name)).toStrictEqual(['Colour', 'Material', 'Size']);
    expect(secondRows.map((row) => row.name)).toStrictEqual(['Colour']);
    expect(firstGraph.options.calls).toHaveLength(1);
    expect(secondGraph.options.calls).toHaveLength(1);
  });

  it('NET-NEW — M7: nothing is memoised WITHIN one service either, so a repeated call re-reads rather than replaying', async () => {
    const { size, colour } = catalogue();
    const graph = harness({ optionGroups: [size] });

    const before = await graph.service.getUnusedProductOptionGroups(ABSENT_GROUP_ID);
    /*
     * A group added between the two calls must be visible to the second one. The legacy memo this
     * mirrors is the option-group sort-order cache at `model/dao/SkuDAO.cfc:L204-L228`, whose clear
     * function is inverted so the cache is never actually cleared (carried defect D7). No equivalent
     * memo exists on this service, and this case is what would fail if one were introduced.
     */
    graph.options.addOptionGroup(colour);
    const after = await graph.service.getUnusedProductOptionGroups(ABSENT_GROUP_ID);

    expect(before.map((row) => row.name)).toStrictEqual(['Size']);
    expect(after.map((row) => row.name)).toStrictEqual(['Colour', 'Size']);
    expect(before).not.toBe(after);
    expect(graph.options.calls).toHaveLength(2);
  });

  it('NET-NEW — M7: a rejected invocation leaves the service usable, because no state was staged to unwind', async () => {
    const { large } = catalogue();
    const failure = new Error('transient smart-list failure');
    const { service, smartList } = harness(
      {},
      {
        outcomes: [
          { kind: 'failure', failure },
          { kind: 'page', metrics: {}, records: [large] },
        ],
      },
    );

    await expect(service.getOptionSmartList()).rejects.toThrow(failure);
    const recovered = await service.getOption(LARGE_OPTION_ID);

    expect(recovered).toBe(large);
    expect(smartList.executions.map((execution) => execution.selection)).toStrictEqual([
      'allViews',
      'recordsOnly',
    ]);
  });

  it('NET-NEW — M7: the seven parity members are all present on the constructed instance, as declared members rather than as a dynamic fallback', () => {
    const { service } = harness();

    /*
     * IR-1, checked at run time as well as at compile time. Four of these seven had no declaration in
     * `model/service/OptionService.cfc` and existed only while `onMissingMethod`
     * [org/Hibachi/HibachiService.cfc:L255-L281] was there to fabricate them by prefix. Each is now a
     * real member reached by name — this case asserts the function is genuinely there, and every case
     * above calls each one directly, which is the part no dynamic dispatcher could satisfy. There is
     * deliberately no catch-all, no proxy and no string-keyed invocation anywhere in this file.
     */
    expect(typeof service.getOptionsForSelect).toBe('function');
    expect(typeof service.getUnusedProductOptions).toBe('function');
    expect(typeof service.getUnusedProductOptionGroups).toBe('function');
    expect(typeof service.getOption).toBe('function');
    expect(typeof service.getOptionGroup).toBe('function');
    expect(typeof service.getOptionSmartList).toBe('function');
    expect(typeof service.getOptionGroupSmartList).toBe('function');

    /*
     * And that list is complete. Asserting `typeof service.getUnusedProductOptionsBounded` and
     * `typeof service.getUnusedProductOptionGroupsBounded` alongside it would presume members this
     * service may not declare: AAP §0.4.2.4 and §0.4.2.5 fix the surface at three declared plus
     * four synthesized members, and §0.8.3.1 requires that surface to be checkable method by
     * method.
     */
    expect(service.getUnusedProductOptions).toHaveLength(2);
    expect(service.getUnusedProductOptionGroups).toHaveLength(1);
    expect(service.getOptionsForSelect).toHaveLength(1);
  });

  it('NET-NEW — the input type admits the caller keys the two smart lists actually use, and the service stays indifferent to which arrive', async () => {
    /*
     * A typed input value built once and handed to both roots, which is only meaningful because
     * `SmartListInput` is a single declared type rather than a per-member shape. It also documents the
     * one asymmetry a reader might expect and not find: there is no `currentURL` member to supply.
     */
    const input: SmartListInput = { OrderBy: 'sortOrder|ASC', 'P:Show': 10 };
    const { service, smartList } = harness();

    await service.getOptionSmartList(input);
    await service.getOptionGroupSmartList(input);

    expect(smartList.queries).toStrictEqual([
      {
        entityName: 'SlatwallOption',
        orders: [{ propertyIdentifier: 'sortOrder', direction: 'ASC' }],
        pagination: { pageRecordsShow: 10 },
      },
      {
        entityName: 'SlatwallOptionGroup',
        orders: [{ propertyIdentifier: 'sortOrder', direction: 'ASC' }],
        pagination: { pageRecordsShow: 10 },
      },
    ]);
    /* The caller's own object is not mutated by the translation. */
    expect(input).toStrictEqual({ OrderBy: 'sortOrder|ASC', 'P:Show': 10 });
  });
});

/*
 * 9. the real builder, driven through this service, over a genuinely fanning join
 * why this section exists as its own thing. Every case above answers through
 * `createSmartListQueryDouble`, which records the `SmartListQuery` it was handed and returns seeded
 * entities. That is the right instrument for asserting what this service emits, and it is the wrong one
 * for asserting what a caller receives: a double that returns two already-distinct entities returns
 * them whether or not the adapter emitted `SELECT DISTINCT`, so a distinctness assertion built on it.
 */

/** The SKU-to-option link table's rows are what fan; these are the SKUs the fan comes from. */
const FIRST_SKU_ID = '77777777777777777777777777777771';
const SECOND_SKU_ID = '77777777777777777777777777777772';

/**
 * A real {@link SmartListQueryBuilder} over a fanning executor, wired exactly as production wires it.
 */
function realBuilderOver(
  fanning: FanningSqlExecutorDoubleOptions,
  budget?: SmartListMaterialisationBudget,
): { readonly builder: SmartListQueryBuilder; readonly executor: FanningSqlExecutorDouble } {
  const executor = createFanningSqlExecutorDouble(fanning);
  const loaders = createCatalogAggregateLoaders({
    bindDefaultSkuDelegate: () => {
      throw new Error(
        'The default-SKU binder ran, which means a case in section 9 executed against a root that ' +
          'resolves Product.defaultSku. Neither the option nor the option-group root does.',
      );
    },
  });

  return {
    /* — the budget is required now; a scenario stating none gets the generous fixture. */
    builder: new SmartListQueryBuilder(
      executor.executor,
      loaders,
      budget ?? GENEROUS_SMART_LIST_BUDGET,
    ),
    executor,
  };
}

/** The option-group root's rows as the three-hop join returns them: size twice, colour once. */
const FANNED_GROUP_ROWS = Object.freeze([
  Object.freeze({ optionGroupID: SIZE_GROUP_ID, optionGroupName: 'Size', sortOrder: 1 }),
  Object.freeze({ optionGroupID: SIZE_GROUP_ID, optionGroupName: 'Size', sortOrder: 1 }),
  Object.freeze({ optionGroupID: COLOUR_GROUP_ID, optionGroupName: 'Colour', sortOrder: 2 }),
]);

/** The option root's rows as the two-hop join returns them: large twice, small once. */
const FANNED_OPTION_ROWS = Object.freeze([
  Object.freeze({
    optionID: LARGE_OPTION_ID,
    optionName: 'Large',
    optionCode: 'large',
    optionGroupID: SIZE_GROUP_ID,
    sortOrder: 1,
  }),
  Object.freeze({
    optionID: LARGE_OPTION_ID,
    optionName: 'Large',
    optionCode: 'large',
    optionGroupID: SIZE_GROUP_ID,
    sortOrder: 1,
  }),
  Object.freeze({
    optionID: SMALL_OPTION_ID,
    optionName: 'Small',
    optionCode: 'small',
    optionGroupID: SIZE_GROUP_ID,
    sortOrder: 2,
  }),
]);

/** The rows the built-in relationship pass reads for `OptionGroup.options`, owner key aliased. */
const GROUP_OPTION_ASSOCIATION_ROWS = Object.freeze([
  Object.freeze({
    smartListAssociationOwnerKey: SIZE_GROUP_ID,
    optionID: LARGE_OPTION_ID,
    optionName: 'Large',
    optionGroupID: SIZE_GROUP_ID,
    sortOrder: 1,
  }),
  Object.freeze({
    smartListAssociationOwnerKey: COLOUR_GROUP_ID,
    optionID: BLUE_OPTION_ID,
    optionName: 'Blue',
    optionGroupID: COLOUR_GROUP_ID,
    sortOrder: 1,
  }),
]);

/** The rows the injected option loader reads for `Option.optionGroup`. */
const OPTION_GROUP_ASSOCIATION_ROWS = Object.freeze([
  Object.freeze({ optionGroupID: SIZE_GROUP_ID, optionGroupName: 'Size', sortOrder: 1 }),
]);

describe('NET-NEW OptionService × the real SmartListQueryBuilder — fanning joins', () => {
  it('[NET-NEW] the three-hop option-group query collapses its fan: three rows in, two groups out', async () => {
    const { builder, executor } = realBuilderOver({
      rootRows: FANNED_GROUP_ROWS,
      rootIdentityColumn: 'optionGroupID',
      associations: [
        { matching: 'FROM SwOption associationFar', rows: GROUP_OPTION_ASSOCIATION_ROWS },
      ],
    });

    const groups = await findProductOptionGroups(builder, PRODUCT_ID);

    /*
     * The assertion that fails if `DISTINCT` is removed. `setSelectDistinctFlag(1)` at
     * [model/entity/Product.cfc:L255] is what makes size appear once for a product whose two SKUs both
     * carry it. Drop `DISTINCT` from `composeSelectClause` and this executor hands back all three rows,
     * `materialiseRows` pushes one array element per row — it shares instances through the identity map
     * but never collapses the array — and this length becomes three.
     */
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.optionGroupID)).toStrictEqual([
      SIZE_GROUP_ID,
      COLOUR_GROUP_ID,
    ]);

    /*
     * And the distinct projection is genuinely in the statement, not merely implied by the outcome.
     */
    const statements = executor.statements();
    expect(statements[1]?.startsWith('SELECT DISTINCT aslatwalloptiongroup.*')).toBe(true);
  });

  it('[NET-NEW] the fan is a real join through the link table, and the product identifier is BOUND, never interpolated', async () => {
    const { builder, executor } = realBuilderOver({
      rootRows: FANNED_GROUP_ROWS,
      rootIdentityColumn: 'optionGroupID',
      associations: [
        { matching: 'FROM SwOption associationFar', rows: GROUP_OPTION_ASSOCIATION_ROWS },
      ],
    });

    await findProductOptionGroups(builder, PRODUCT_ID);

    const recordStatement = executor.statements()[1] ?? '';

    /*
     * Three hops, and the middle one is the many-to-many link table — which is why the fan exists. A
     * shorter path would not fan, so a case that asserted distinctness without this join would be
     * asserting it against a statement that never produced a duplicate.
     */
    expect(recordStatement).toContain('LEFT JOIN SwOption aslatwalloption');
    expect(recordStatement).toContain('LEFT JOIN SwSkuOption aslatwallsku_link');
    expect(recordStatement).toContain('LEFT JOIN SwSku aslatwallsku');
    expect(recordStatement).toContain('LEFT JOIN SwProduct aslatwallproduct');

    /*
     * AAP §0.7.3 — `?` binds values only. The identifier never appears in statement text on any of the three.
     */
    for (const statement of executor.statements()) {
      expect(statement).not.toContain(PRODUCT_ID);
    }
    expect(executor.calls[1]?.params).toStrictEqual([PRODUCT_ID]);
  });

  it('[NET-NEW] the count runs FIRST and counts OWNERS, not rows — the asymmetry, observed', async () => {
    const { builder, executor } = realBuilderOver({
      rootRows: FANNED_GROUP_ROWS,
      rootIdentityColumn: 'optionGroupID',
      associations: [
        { matching: 'FROM SwOption associationFar', rows: GROUP_OPTION_ASSOCIATION_ROWS },
      ],
    });

    await findProductOptionGroups(builder, PRODUCT_ID);

    /*
     * The count is `COUNT(DISTINCT <pk>)` unconditionally — `SMARTLIST_DISTINCT_ASYMMETRY` declares
     * exactly that — so it answers two for three fanned rows. It also runs first, because the
     * materialisation bound must be able to refuse before a row is read; the case below shows it doing
     * so through this very member.
     */
    const statements = executor.statements();
    expect(
      statements[0]?.startsWith('SELECT COUNT(DISTINCT aslatwalloptiongroup.optionGroupID)'),
    ).toBe(true);
    expect(statements[0]).toContain('AS recordsCount');
    expect(executor.distinctRootCount()).toBe(2);
  });

  it('[NET-NEW] the page statement is SKIPPED when the default window already covers every record', async () => {
    const { builder, executor } = realBuilderOver({
      rootRows: FANNED_GROUP_ROWS,
      rootIdentityColumn: 'optionGroupID',
      associations: [
        { matching: 'FROM SwOption associationFar', rows: GROUP_OPTION_ASSOCIATION_ROWS },
      ],
    });

    await findProductOptionGroups(builder, PRODUCT_ID);

    /*
     * Three statements: count, records, and one association read. No page statement, because these two
     * members declare no pagination and the legacy default window starts at record one and shows ten —
     * so a bounded re-read could only return the rows already in hand.
     */
    const statements = executor.statements();
    expect(statements).toHaveLength(3);
    for (const statement of statements) {
      expect(statement).not.toContain('LIMIT');
    }
  });

  it('[NET-NEW] the page statement IS issued when a window cannot cover the record set, and it windows the COLLAPSED rows', async () => {
    /*
     * Driven directly rather than through the two finders, because neither declares pagination — which
     * is itself the legacy behaviour [model/entity/Product.cfc:L251-L261 declares no page]. The window
     * belongs to the composition all the same: a caller reading `pageRecords` must not receive
     * duplicates either, and `LIMIT` applies after `DISTINCT` in MySQL.
     */
    const { builder, executor } = realBuilderOver({
      rootRows: FANNED_GROUP_ROWS,
      rootIdentityColumn: 'optionGroupID',
      associations: [
        { matching: 'FROM SwOption associationFar', rows: GROUP_OPTION_ASSOCIATION_ROWS },
      ],
    });

    const result = await builder.execute({
      entityName: 'SlatwallOptionGroup',
      selectDistinctFlag: true,
      whereGroups: [
        { filters: [{ propertyIdentifier: 'options.skus.product.productID', value: PRODUCT_ID }] },
      ],
      orders: [{ propertyIdentifier: 'sortOrder', direction: 'ASC' }],
      /*
       * The second window, not the first, and the choice is what makes this falsifiable. Record one
       * is size in both the collapsed set and the fanned set, so a first-page assertion would pass
       * either way. Record two is colour in the collapsed set and the duplicate size in the fanned set —
       * so this window can only be answered correctly by a page taken after the duplicates are gone.
       */
      pagination: { pageRecordsStart: 2, pageRecordsShow: 1 },
    });

    const statements = executor.statements();
    expect(statements).toHaveLength(4);
    expect(statements[2]?.endsWith(' LIMIT ? OFFSET ?')).toBe(true);
    expect(executor.calls[2]?.params).toStrictEqual([PRODUCT_ID, '1', '1']);

    /*
     * `LIMIT` applies after `DISTINCT` in MySQL, so the window is one record of the collapsed set. That
     * is the difference `DISTINCT` makes to a page rather than to a collection, and it is precisely the
     * shape `issue_1296` was raised about — page-record distinctness.
     */
    expect(result.pageRecords).toHaveLength(1);
    expect(result.pageRecords[0]?.optionGroupID).toBe(COLOUR_GROUP_ID);
    /* And the unpaged collection is collapsed too, so the two views agree with the count. */
    expect(result.records).toHaveLength(2);
    expect(result.recordsCount).toBe(2);
    expect(result.totalPages).toBe(2);
    expect(result.pageRecordsStart).toBe(2);
    expect(result.pageRecordsEnd).toBe(2);
  });

  it('[NET-NEW] association hydration is ONE batched statement at FIXED depth, with one placeholder per distinct owner', async () => {
    const { builder, executor } = realBuilderOver({
      rootRows: FANNED_GROUP_ROWS,
      rootIdentityColumn: 'optionGroupID',
      associations: [
        { matching: 'FROM SwOption associationFar', rows: GROUP_OPTION_ASSOCIATION_ROWS },
      ],
    });

    const groups = await findProductOptionGroups(builder, PRODUCT_ID);

    const associationStatements = executor
      .statements()
      .filter((statement) => statement.includes('FROM SwOption associationFar'));

    /*
     * One statement for the whole collection, never one per owner: the N+1 read the batching exists
     * to prevent would show up here as two. Two placeholders for two distinct owners — the fanned
     * duplicate contributes its owner key once, which `collectDistinctEntities` is what guarantees, and
     * a repeated owner would otherwise have its collection appended to twice.
     */
    expect(associationStatements).toHaveLength(1);
    expect(associationStatements[0]).toContain('IN (?, ?)');

    /*
     * Fixed depth: the loaded options are not themselves re-hydrated, so no third statement follows.
     */
    expect(executor.statements()).toHaveLength(3);
    expect(groups[0]?.options.map((option) => option.optionID)).toStrictEqual([LARGE_OPTION_ID]);
    expect(groups[1]?.options.map((option) => option.optionID)).toStrictEqual([BLUE_OPTION_ID]);
  });

  it('[NET-NEW] the two-hop option query collapses its own fan through the injected loader path', async () => {
    const { builder, executor } = realBuilderOver({
      rootRows: FANNED_OPTION_ROWS,
      rootIdentityColumn: 'optionID',
      associations: [{ matching: 'FROM SwOptionGroup WHERE', rows: OPTION_GROUP_ASSOCIATION_ROWS }],
    });

    const options = await findProductOptionsByOptionGroup(builder, SIZE_GROUP_ID, PRODUCT_ID);

    /*
     * Three rows in, two options out. This root has an injected aggregate loader
     * (`createCatalogAggregateLoaders` supplies one for `SlatwallOption` and deliberately none for
     * `SlatwallOptionGroup`), so this case exercises the other of the builder's two mutually exclusive
     * hydration mechanisms — and the collapse has to hold on both.
     */
    expect(options).toHaveLength(2);
    expect(options.map((option) => option.optionID)).toStrictEqual([
      LARGE_OPTION_ID,
      SMALL_OPTION_ID,
    ]);
    expect(options[0]?.optionGroup?.optionGroupName).toBe('Size');

    /*
     * Both filters bound, in the legacy's order: the group first [model/entity/Product.cfc:L343], the
     * product second [:L344]. Order matters because they are positional.
     */
    expect(executor.calls[1]?.params).toStrictEqual([SIZE_GROUP_ID, PRODUCT_ID]);
  });

  it('[NET-NEW] the materialisation budget refuses this service’s query on the COUNT, before a row is read', async () => {
    const { builder, executor } = realBuilderOver(
      {
        rootRows: FANNED_GROUP_ROWS,
        rootIdentityColumn: 'optionGroupID',
        associations: [
          { matching: 'FROM SwOption associationFar', rows: GROUP_OPTION_ASSOCIATION_ROWS },
        ],
      },
      smartListBudgetWithRowCeiling(1),
    );

    await expect(findProductOptionGroups(builder, PRODUCT_ID)).rejects.toThrow(
      /matched more records than the configured materialisation budget admits/,
    );

    /*
     * The gate measures owners, which is the right thing for it to measure. Two distinct groups
     * against a budget of one is over; the three fanned rows are never read at all. Exactly one
     * statement ran — the count — so nothing was materialised and no association read followed.
     */
    expect(executor.statements()).toHaveLength(1);
    expect(executor.statements()[0]).toContain('COUNT(DISTINCT');
  });

  it('[NET-NEW] with NO budget wired the same query is answered, so the bound is opt-in and invents nothing', async () => {
    const { builder } = realBuilderOver({
      rootRows: FANNED_GROUP_ROWS,
      rootIdentityColumn: 'optionGroupID',
      associations: [
        { matching: 'FROM SwOption associationFar', rows: GROUP_OPTION_ASSOCIATION_ROWS },
      ],
    });

    /*
     * IR-12 and AAP §0.7.3 forbid inventing a maximum the legacy does not state, and
     * `org/Hibachi/HibachiSmartList.cfc` states none. An operator who wires no figure gets the legacy's
     * unbounded materialisation, and this case is what stops a default from being introduced quietly.
     */
    await expect(findProductOptionGroups(builder, PRODUCT_ID)).resolves.toHaveLength(2);
  });

  it('[NET-NEW] a fan that repeats across SEPARATE skus still yields ONE instance per group, shared by identity', async () => {
    /*
     * The two SKUs the fan comes from, named so the row set reads as the join result it is rather than
     * as an arbitrary duplicate. Both carry the size group; only the first carries colour.
     */
    const rootRows = Object.freeze([
      Object.freeze({ optionGroupID: SIZE_GROUP_ID, optionGroupName: 'Size', skuID: FIRST_SKU_ID }),
      Object.freeze({
        optionGroupID: SIZE_GROUP_ID,
        optionGroupName: 'Size',
        skuID: SECOND_SKU_ID,
      }),
      Object.freeze({
        optionGroupID: COLOUR_GROUP_ID,
        optionGroupName: 'Colour',
        skuID: FIRST_SKU_ID,
      }),
    ]);
    const { builder } = realBuilderOver({
      rootRows,
      rootIdentityColumn: 'optionGroupID',
      associations: [
        { matching: 'FROM SwOption associationFar', rows: GROUP_OPTION_ASSOCIATION_ROWS },
      ],
    });

    const first = await findProductOptionGroups(builder, PRODUCT_ID);
    const second = await findProductOptionGroups(builder, PRODUCT_ID);

    expect(first).toHaveLength(2);
    /*
     * And the instances are not shared across calls. The identity map is scoped to one execution and
     * discarded when it returns (M7): nothing may survive between invocations on a warm container, so
     * a second read of the same product must build fresh entities. Sharing them would be exactly the
     * cross-request bleed the per-call scope exists to prevent.
     */
    expect(second).toHaveLength(2);
    expect(second[0]).not.toBe(first[0]);
  });
});

/*
 * 10. The declared surface, asserted as a ceiling. AAP §0.4.2.4 and §0.4.2.5 fix this service at three
 * declared plus four synthesized members, so the cases below assert that nothing else is reachable —
 * no batch read and no windowed companion — because §0.7.3 forbids inventing a member the plan does
 * not name.
 */

describe('OptionService — the declared public surface', () => {
  it('NET-NEW — AAP §0.4.2.4/§0.4.2.5 — the surface is exactly seven members, in both directions', () => {
    /*
     * Bidirectional by construction, which is the whole point of the case. The list is not checked
     * member-by-member with `toContain`, because that direction alone proves only that nothing was lost.
     * Enumerating `Object.getOwnPropertyNames(OptionService.prototype)` and comparing the sorted result
     * with `toStrictEqual` closes the other direction too: a member added to the service fails here, and
     * it fails by name, without anyone having to remember to extend this file.
     */
    expect(Object.getOwnPropertyNames(OptionService.prototype).sort()).toStrictEqual([
      'constructor',
      // The three declared in model/service/OptionService.cfc, at :L55, :L72 and :L76.
      'getOption',
      'getOptionGroup',
      'getOptionGroupSmartList',
      'getOptionSmartList',
      'getOptionsForSelect',
      'getUnusedProductOptionGroups',
      'getUnusedProductOptions',
    ]);
  });

  it('NET-NEW — AAP §0.7.3 — none of the three forbidden additions is reachable by name', () => {
    /*
     * The negative half stated explicitly, so a reader sees the boundary rather than inferring it.
     * Each of these three would compile and could be documented, and each would still be a parity
     * defect: AAP §0.4.2.5 reproduces the legacy's run-time synthesis "only where used", §0.7.3
     * names "batch" among the things a port may not invent, and §0.8.2 Guideline 4 forbids
     * optimising beyond what the migration requires. A bound and a batch are optimisations.
     */
    const forbiddenMembers = [
      'getUnusedProductOptionsBounded',
      'getUnusedProductOptionGroupsBounded',
      'getOptionsByIDs',
    ] as const;

    for (const member of forbiddenMembers) {
      expect(Object.getOwnPropertyNames(OptionService.prototype)).not.toContain(member);
      /*
       * The descriptor rather than the value, so the claim needs no cast to read a member the type
       * system correctly says is not there — and so it also rules out a non-enumerable or accessor
       * declaration that a value read could have reported as `undefined`.
       */
      expect(Object.getOwnPropertyDescriptor(OptionService.prototype, member)).toBeUndefined();
    }
  });

  it('NET-NEW — AAP §0.4.2.5 — the unsynthesized CRUD prefixes were not fabricated either', () => {
    /*
     * `org/Hibachi/HibachiService.cfc:L255-L281` would have answered every one of these on demand for
     * the legacy, from a lower-cased name prefix. AAP §0.4.2.5 reproduces synthesis "only where used",
     * and the slice uses none of them — so their absence is the ported behaviour, and asserting it keeps
     * a future reader from adding one because the dispatcher could have produced it.
     */
    for (const neverSynthesized of [
      'newOption',
      'newOptionGroup',
      'saveOption',
      'saveOptionGroup',
      'deleteOption',
      'deleteOptionGroup',
      'countOption',
      'listOption',
      'exportOption',
      'processOption',
    ]) {
      expect(Object.getOwnPropertyNames(OptionService.prototype)).not.toContain(neverSynthesized);
    }
  });
});

/*
 * AAP §0.4.1.12 declares exactly seventeen executable suites, so this subject is covered
 * inside an approved suite rather than in one of its own.
 */

/* FOLDED IN FROM handlers/optionHandler */

/**
 * `optionHandler` — the authorization gate in front of the Option boundary, and the two classifications
 * of member behind it.
 */
describe('The option surface final wiring', () => {
  /** A principal, defaulting to the one shape the gate admits: logged in, non-admin. */
  function account(overrides: Partial<AccountReference>): AccountReference {
    return {
      accountID: 'ffffffffffffffffffffffffffffffff',
      newFlag: false,
      adminAccountFlag: false,
      ...overrides,
    };
  }

  /** The projection member's event slice, with the headers container the resolver is handed. */
  function optionsBodyEvent(body: string): OptionsForSelectEvent {
    return { body, headers: {} };
  }

  /** The two-input member's event slice. */
  function unusedOptionsEvent(
    productID: string,
    existingOptionGroupIDList: string,
  ): UnusedProductOptionsEvent {
    return {
      pathParameters: { productID },
      queryStringParameters: { existingOptionGroupIDList },
      headers: {},
    };
  }

  /** The one-input member's event slice. */
  function unusedGroupsEvent(existingOptionGroupIDList: string): UnusedProductOptionGroupsEvent {
    return { queryStringParameters: { existingOptionGroupIDList }, headers: {} };
  }

  describe('optionHandler — the gate and the two classifications', () => {
    interface Probe {
      readonly asked: EntityAuthorizationRequest[];
      readonly resolutions: { count: number };
      readonly serviceCalls: string[];
      /**
       * The arguments each reached service member was handed, so verbatim forwarding is observable.
       */
      readonly forwarded: unknown[][];
      readonly handler: OptionHandler;
    }

    function makeHandler(account: AccountReference | undefined, grant: readonly string[]): Probe {
      const asked: EntityAuthorizationRequest[] = [];
      const resolutions = { count: 0 };
      const serviceCalls: string[] = [];
      const forwarded: unknown[][] = [];

      const surface: OptionSurface = {
        getOptionsForSelect: (options: Option[]): SelectOption[] => {
          serviceCalls.push('getOptionsForSelect');
          forwarded.push([options.length]);
          return options.map((option) => ({
            name: option.optionName ?? '',
            value: option.optionID,
          }));
        },
        getUnusedProductOptions: (
          productID: string,
          existingOptionGroupIDList: string,
        ): Promise<SelectOption[]> => {
          serviceCalls.push('getUnusedProductOptions');
          forwarded.push([productID, existingOptionGroupIDList]);
          return Promise.resolve([{ name: 'Group - Option', value: 'option-1' }]);
        },
        getUnusedProductOptionGroups: (
          existingOptionGroupIDList: string,
        ): Promise<SelectOption[]> => {
          serviceCalls.push('getUnusedProductOptionGroups');
          forwarded.push([existingOptionGroupIDList]);
          return Promise.resolve([{ name: 'Group', value: 'group-1' }]);
        },
      };

      const resolve: RequestAuthorizationResolver<OptionAuthorizationEvent> = () => {
        resolutions.count += 1;

        return {
          accountContext: { getCurrentAccount: () => account },
          entityAuthorization: {
            authenticateEntity: (request: EntityAuthorizationRequest): boolean => {
              asked.push(request);
              return grant.includes(request.crudType);
            },
          },
          /*
           * — the third member of one invocation's context. Deny-all, matching the shipped
           * fail-closed default: these cases drive the gate, and nothing here populates a property.
           */
          populationAuthorization: DENY_ALL_POPULATION_AUTHORIZATION,
        };
      };

      return {
        asked,
        resolutions,
        serviceCalls,
        forwarded,
        handler: createOptionHandler(surface, resolve),
      };
    }

    it('NET-NEW — HibachiAuthenticationService.cfc:L83 — NO principal refuses all three with 401', async () => {
      const probe = makeHandler(undefined, ['read']);

      const results = [
        probe.handler.getOptionsForSelect(optionsBodyEvent('{"options":[]}')),
        await probe.handler.getUnusedProductOptions(unusedOptionsEvent('product-1', '')),
        await probe.handler.getUnusedProductOptionGroups(unusedGroupsEvent('')),
      ];

      for (const result of results) {
        expect(result.statusCode).toBe(401);
        expect(JSON.parse(result.body)).toStrictEqual({ message: 'Authentication is required' });
      }

      expect(probe.serviceCalls).toStrictEqual([]);
      expect(probe.asked).toStrictEqual([]);
    });

    it('NET-NEW — optionHandler — HibachiScope.cfc:L40-L45 — the logged-in test is the NEGATION of newFlag', async () => {
      const notLoggedIn = makeHandler(account({ newFlag: true }), ['read']);
      expect(
        (await notLoggedIn.handler.getUnusedProductOptionGroups(unusedGroupsEvent(''))).statusCode,
      ).toBe(401);
      expect(notLoggedIn.serviceCalls).toStrictEqual([]);

      const loggedIn = makeHandler(account({ newFlag: false }), []);
      expect(
        (await loggedIn.handler.getUnusedProductOptionGroups(unusedGroupsEvent(''))).statusCode,
      ).toBe(200);
    });

    it('NET-NEW — L67-L68 — an anyLogin row asks NO entity question and succeeds on login alone', async () => {
      // The permission model grants nothing, and both rows still answer 200: the legacy `preProcess`
      // branch returns true outright once the :L30 logged-in gate has passed. Asking an entity question
      // here would refuse a caller the legacy admitted.
      const probe = makeHandler(account({}), []);

      expect(
        (await probe.handler.getUnusedProductOptions(unusedOptionsEvent('product-1', 'g1')))
          .statusCode,
      ).toBe(200);
      expect(
        (await probe.handler.getUnusedProductOptionGroups(unusedGroupsEvent('g1'))).statusCode,
      ).toBe(200);

      expect(probe.asked).toStrictEqual([]);
      expect(probe.serviceCalls).toStrictEqual([
        'getUnusedProductOptions',
        'getUnusedProductOptionGroups',
      ]);
    });

    it('NET-NEW — L43-L49 — the secure row DOES ask, and a logged-in principal without permission gets 403', () => {
      const probe = makeHandler(account({}), []);
      const result = probe.handler.getOptionsForSelect(optionsBodyEvent('{"options":[]}'));

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body)).toStrictEqual({ message: 'Not authorized' });
      expect(probe.serviceCalls).toStrictEqual([]);
    });

    it('NET-NEW — L55-L56 — the secure row asks exactly `read` on `Option`, from a module constant', () => {
      const probe = makeHandler(account({}), []);
      probe.handler.getOptionsForSelect(optionsBodyEvent('{"options":[]}'));

      // The entity name is never a request value, so no caller can redirect the question.
      expect(probe.asked).toStrictEqual([{ crudType: 'read', entityName: 'Option' }]);
    });

    it('NET-NEW — a granted secure row reaches the service and returns the projection unaltered', () => {
      const probe = makeHandler(account({}), ['read']);
      const result = probe.handler.getOptionsForSelect(
        optionsBodyEvent('{"options":[{"optionID":"o1","optionName":"Red"}]}'),
      );

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toStrictEqual([{ name: 'Red', value: 'o1' }]);
      expect(probe.asked).toStrictEqual([{ crudType: 'read', entityName: 'Option' }]);
    });

    it('NET-NEW — the gate runs BEFORE the body is parsed, so a refusal never reports a body problem', () => {
      const probe = makeHandler(account({}), []);

      // Four distinct bad-request texts exist below the gate; an unauthorised caller can reach none of
      // them, so none can be used to discover the request shape.
      for (const body of ['<<not json>>', '[]', '{}', '{"options":[7]}']) {
        const result = probe.handler.getOptionsForSelect(optionsBodyEvent(body));
        expect(result.statusCode).toBe(403);
        expect(JSON.parse(result.body)).toStrictEqual({ message: 'Not authorized' });
      }
    });

    it('NET-NEW — the gate runs BEFORE the product identifier is read, so it is not an existence oracle', async () => {
      const probe = makeHandler(undefined, []);

      const addressed = await probe.handler.getUnusedProductOptions(
        unusedOptionsEvent('product-1', ''),
      );
      const other = await probe.handler.getUnusedProductOptions(
        unusedOptionsEvent('no-such-product', ''),
      );
      const missing = await probe.handler.getUnusedProductOptions({
        pathParameters: null,
        queryStringParameters: null,
        headers: {},
      });

      expect(addressed).toStrictEqual(other);
      expect(other).toStrictEqual(missing);
      expect(addressed.statusCode).toBe(401);
    });

    it('NET-NEW — the resolver is invoked exactly once per request, on every member', async () => {
      const projection = makeHandler(account({}), ['read']);
      projection.handler.getOptionsForSelect(optionsBodyEvent('{"options":[]}'));
      expect(projection.resolutions.count).toBe(1);

      const options = makeHandler(account({}), []);
      await options.handler.getUnusedProductOptions(unusedOptionsEvent('p', ''));
      expect(options.resolutions.count).toBe(1);

      const groups = makeHandler(account({}), []);
      await groups.handler.getUnusedProductOptionGroups(unusedGroupsEvent(''));
      expect(groups.resolutions.count).toBe(1);
    });

    it('NET-NEW — judgment (d) survives the gate: an EMPTY list is still forwarded verbatim', async () => {
      // An empty list resolves to every option group [model/dao/OptionDAO.cfc:L107], which is the single
      // most useful call this member has. The gate must protect it, not suppress it.
      const probe = makeHandler(account({}), []);
      const result = await probe.handler.getUnusedProductOptionGroups(unusedGroupsEvent(''));

      expect(result.statusCode).toBe(200);
      expect(probe.forwarded).toStrictEqual([['']]);
    });

    it('NET-NEW — judgment (c) survives the gate: the list reaches the service byte for byte', async () => {
      const probe = makeHandler(account({}), []);
      await probe.handler.getUnusedProductOptions(unusedOptionsEvent('product-1', ' g1 ,,G2,'));

      // Not split, not trimmed, not de-duplicated, not re-ordered — and the identifier is first.
      expect(probe.forwarded).toStrictEqual([['product-1', ' g1 ,,G2,']]);
    });

    it('NET-NEW — an authorised request still reports an ABSENT input as a bad request', async () => {
      const probe = makeHandler(account({}), []);
      const result = await probe.handler.getUnusedProductOptionGroups({
        queryStringParameters: null,
        headers: {},
      });

      // Absent is not empty: the gate passes, and only then is the required argument enforced.
      expect(result.statusCode).toBe(400);
      expect(probe.serviceCalls).toStrictEqual([]);
    });

    it('NET-NEW — optionHandler — no refusal carries a WWW-Authenticate header or names any scheme', () => {
      const probe = makeHandler(undefined, []);
      const result = probe.handler.getOptionsForSelect(optionsBodyEvent('{"options":[]}'));

      expect(result.headers).toStrictEqual({ 'Content-Type': 'application/json' });
      expect(result.body).not.toMatch(/bearer|basic|scheme|token/i);
    });

    it('NET-NEW — every routed member carries a requirement, and the matrix is frozen through and through', () => {
      /*
       * The set is exactly three, one per declared service member, and closure is the assertion.
       * The claim is not merely "every mounted member is classified" — `toStrictEqual` over the sorted keys
       * makes it bidirectional, so an unclassified addition and an invented fourth route both fail here.
       */
      expect(Object.keys(OPTION_ACCESS_MATRIX).sort()).toStrictEqual([
        'getOptionsForSelect',
        'getUnusedProductOptionGroups',
        'getUnusedProductOptions',
      ]);

      expect(OPTION_ACCESS_MATRIX.getOptionsForSelect).toStrictEqual({
        classification: 'secure',
        crudType: 'read',
      });
      expect(OPTION_ACCESS_MATRIX.getUnusedProductOptions).toStrictEqual({
        classification: 'anyLogin',
      });
      expect(OPTION_ACCESS_MATRIX.getUnusedProductOptionGroups).toStrictEqual({
        classification: 'anyLogin',
      });

      expect(Object.isFrozen(OPTION_ACCESS_MATRIX)).toBe(true);
      for (const requirement of Object.values(OPTION_ACCESS_MATRIX)) {
        expect(Object.isFrozen(requirement)).toBe(true);
      }
    });

    it('NET-NEW — AAP §0.4.2.5 — the four synthesized members are still unroutable', () => {
      const probe = makeHandler(account({}), ['read']);

      // The gate did not become a reason to expose them, and judgment (a) still holds.
      expect(Object.keys(probe.handler).sort()).toStrictEqual([
        'getOptionsForSelect',
        'getUnusedProductOptionGroups',
        'getUnusedProductOptions',
      ]);
      for (const synthesized of [
        'getOption',
        'getOptionGroup',
        'getOptionSmartList',
        'getOptionGroupSmartList',
      ]) {
        expect(synthesized in probe.handler).toBe(false);
      }
    });
  });
});
