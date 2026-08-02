/**
 * `OptionService` — the seven-member parity surface of `model/service/OptionService.cfc`.
 *
 * AAP authority: AAP §0.4.1.12 lists `slatwall-ts/test/services/OptionService.test.ts` | CREATE |
 * "**NET-NEW**", and the AAP §0.4.4 wildcard row authorises `slatwall-ts/test/**` | CREATE. The
 * member inventory this file is measured against is AAP §0.4.2.4 (the THREE members the component
 * declares) together with AAP §0.4.2.5 (the FOUR the framework synthesized at run time and IR-1
 * requires be declared explicitly).
 *
 * RULES STATUS: `review_rules` returned **No user rules provided**. Nothing below is derived from a
 * rule, none is invented, and the bar is held instead to the standards inventory of AAP §0.7.3 —
 * strict type safety, explicit dependency injection, one labelled test per converted member, and
 * preserve-and-annotate rather than repair.
 *
 * =================================================================================================
 * THESE ARE UNIT TESTS. THE LEGACY SUITE COULD NOT HAVE BEEN.
 * =================================================================================================
 * Every legacy test in `meta/tests/` inherits `meta/tests/unit/SlatwallUnitTestBase.cfc`, whose
 * `beforeTests` instantiates the whole FW/1 application at [:L52] and whose `setUp` boots it at
 * [:L60] before granting the request scope a super-user account at [:L62]
 * — [meta/tests/unit/SlatwallUnitTestBase.cfc:L49-L84]. A service under test was then RESOLVED BY
 * STRING from that booted scope: [meta/tests/unit/service/HibachiServiceTest.cfc:L49-L55] does
 * `variables.service = request.slatwallScope.getService("hibachiService")`. A legacy "unit" test was
 * therefore an integration test by construction — it could not name its collaborators, could not
 * substitute one, and could not run without an application server, a datasource and a populated
 * schema.
 *
 * This file inverts all three properties. `OptionService` is IMPORTED directly and CONSTRUCTED with
 * its two collaborators passed positionally to the explicit constructor (import rules R1 and R2 of
 * AAP §0.4.3.1 and §0.4.3.2). There is no application to boot, no container, no service locator, no
 * string-keyed resolution, no `jest.mock`, and no database. That difference is by design and a
 * reviewer comparing the two suites should expect it — AAP §0.4.3.6 states the same conclusion from
 * the planning side.
 *
 * =================================================================================================
 * LEGACY TRACEABILITY HERE IS DOCUMENTARY, AND SAYING SO MATTERS MORE THAN THE COVERAGE ITSELF
 * =================================================================================================
 * Every legacy locator cited below was established by READING legacy source, never by executing it:
 *   - MXUnit and CFSelenium are NOT vendored in this repository (AAP §0.5.4), and
 *     [meta/tests/readme.txt:L1-L7] states that the suite needs MXUnit installed on the machine with
 *     a mapping inside CFIDE — and CFSelenium likewise for the `functional` folder — neither of which
 *     exists here.
 *   - The reproducible CFML runtime the prompt offered is absent: `meta/docker/slatwall-local-dev/`
 *     does not exist in this repository, and no ColdFusion, Railo or Lucee engine is available
 *     (AAP §0.8.4.1).
 *   - Consequently NO RUNTIME COMPARISON against the original CFML behaviour was performed for any
 *     assertion in this file, and none is implied.
 *
 * TEST PROVENANCE: every case below is **NET-NEW**. AAP §0.6.5.2 verified that no legacy
 * `OptionServiceTest` and no legacy `OptionDAOTest` exists anywhere under `meta/tests/`, so all
 * seven parity members are net-new coverage. Nothing here extends a named legacy assertion and
 * nothing is labelled TRACEABLE.
 *
 * =================================================================================================
 * WHY EVERY CASE BUILDS ITS OWN SERVICE, REPOSITORY AND SMART-LIST DOUBLE
 * =================================================================================================
 * The legacy base class leaks state between tests, and it does so because two lifecycle calls are
 * COMMENTED OUT: the application reload at [meta/tests/unit/SlatwallUnitTestBase.cfc:L53]
 * (`//variables.slatwallFW1Application.reloadApplication();`) and the lifecycle teardown at [:L70]
 * (`//variables.slatwallFW1Application.endSlatwallLifecycle();`). With neither running, one test's
 * ORM session, singleton services and request scope survive into the next.
 *
 * This file closes that door structurally rather than by discipline. There is no `beforeEach`, no
 * shared instance and NO MODULE-SCOPE MUTABLE STATE of any kind — no array, no repository, no smart
 * list, no map and no entity. Everything at module scope is either an immutable string primitive or
 * a PURE FACTORY FUNCTION that returns freshly built objects on every call, so two cases cannot
 * observe each other even in principle. That is also the M7 property of AAP §0.6.6: a warm Lambda
 * container keeps module scope alive between invocations, so any state parked there would bleed
 * across requests in production exactly as it bleeds across tests here.
 *
 * =================================================================================================
 * WHAT THIS FILE COVERS, AND WHAT IT DELIBERATELY DOES NOT
 * =================================================================================================
 * COVERED — THE WHOLE PUBLIC SURFACE, in two labelled groups, one case minimum per member.
 *
 * The seven-member PARITY surface (AAP §0.4.2.4 for the declared members, §0.4.2.5 for the
 * synthesized ones):
 *   1. `getOptionsForSelect`            [model/service/OptionService.cfc:L55-L63]  (declared)
 *   2. `getUnusedProductOptions`        [:L72-L74]                                 (declared)
 *   3. `getUnusedProductOptionGroups`   [:L76-L78]                                 (declared)
 *   4. `getOption`                      synthesized; IR-1, AAP §0.4.2.5
 *   5. `getOptionGroup`                 synthesized; IR-1, AAP §0.4.2.5
 *   6. `getOptionSmartList`             synthesized; IR-1, AAP §0.4.2.5
 *   7. `getOptionGroupSmartList`        synthesized; IR-1, AAP §0.4.2.5
 *
 * ⛔ SEVEN IS ALSO THE CEILING, NOT ONLY THE FLOOR, AND ONE CASE PROVES IT IN BOTH DIRECTIONS. An
 * earlier revision of this list declared three further members NOT COVERED — the additive companions
 * `getUnusedProductOptionsBounded`, `getUnusedProductOptionGroupsBounded` and `getOptionsByIDs` — on
 * the ground that they fell outside the parity surface this file is scoped to. That reasoning had the
 * matter backwards: a member outside the parity surface is not a member this file may decline to
 * cover, it is a member the SERVICE MAY NOT DECLARE. AAP §0.4.1.8 and §0.4.2.4-§0.4.2.5 fix
 * `OptionService` at three declared plus four synthesized members, §0.8.3.1 requires that surface be
 * checkable "method-by-method", and §0.7.3 S9 names "batch" among the things a port may not invent.
 * All three were withdrawn from the service, and the case
 * `NET-NEW — AAP §0.4.2.4/§0.4.2.5 — the surface is exactly seven members, in both directions`
 * below enumerates the real prototype so that re-adding any of them fails here rather than passing
 * against a list that had excused itself from looking.
 *
 * NOT COVERED, each for a stated reason rather than by omission:
 *   - `optionHandler` and the account-authorisation gate. Those are different modules at different
 *     layers; a service unit test that imported them would be asserting someone else’s contract
 *     through this one. The AWS boundary in particular is confined to `src/handlers/**` by design
 *     (AAP §0.5.5), and no handler and no AWS type is imported here.
 *
 * ⚠️ `SmartListQueryBuilder` IS DELIBERATELY ABSENT FROM THAT EXCLUSION LIST, AND THE NEXT PARAGRAPH
 * IS WHY. An earlier revision named it there. It cannot be named there while section 9 exists.
 *
 * COVERED THROUGH THIS SERVICE, AND AN EARLIER REVISION SAID OTHERWISE — the real
 * `SmartListQueryBuilder`. This exclusion list used to name it alongside `optionHandler`, and
 * `src/adapters/mysql/SmartListQueryBuilder.ts` cited THIS FILE as the place its three-statement shape
 * and distinctness asymmetry were "asserted explicitly, under a real fanning join". Both claims could
 * not be true, and the builder's was the false one. The resolution is not to soften either comment but
 * to make the builder's true: section 9 below wires the REAL builder into `OptionService` as its
 * `SmartListQueryPort`, over an executor that fans rows the way a join does.
 *
 * ⚠️ THE DISTINCTION THAT KEEPS THAT FROM BEING LAYER-CONFUSION. The builder's OWN contract — every
 * clause it may emit, every operator's rendered form, every identifier it refuses — belongs to
 * `test/adapters/SmartListQueryBuilder.test.ts` and is NOT re-asserted here. What section 9 asserts is
 * the COMPOSITION: that this service's translated input, driven through the real adapter, issues the
 * statements in the order the budget depends on and returns a collection whose distinctness survives
 * a fanning join. That property spans the two modules and therefore belongs to neither alone; asserting
 * it against a double is what made it unfalsifiable.
 *   - `BaseService`, the validator and the option rule sets. NONE of this service's seven members is
 *     a save, a delete or a process member — the component's `Save Overrides` and `Process Methods`
 *     sections are both empty at [model/service/OptionService.cfc:L82-L88] — so importing either
 *     would manufacture coverage this service does not own.
 */
import { SmartListQueryBuilder } from '../../src/adapters/mysql/SmartListQueryBuilder';
import { createCatalogAggregateLoaders } from '../../src/adapters/mysql/catalogAggregates';
import { Option } from '../../src/domain/option/Option';
import { OptionGroup } from '../../src/domain/option/OptionGroup';
import {
  OptionService,
  findProductOptionGroups,
  findProductOptionsByOptionGroup,
} from '../../src/services/OptionService';
import {
  buildOption,
  buildOptionGroup,
  buildProduct,
  buildSku,
  createFanningSqlExecutorDouble,
  createInMemoryOptionRepository,
  createSmartListQueryDouble,
} from '../support/inMemoryRepositories';
import type { SelectOption } from '../../src/services/OptionService';
/* ⚠️ `BoundedReadResult` and `BoundedReadWindow` were imported here, for the two windowed companion
 * sections that section 10's banner records as withdrawn. Nothing in this file names either type now,
 * and the import is removed rather than left behind: a type import that no declaration uses is exactly
 * the residue that makes a withdrawn member look like it is still part of the surface. The port module
 * itself is untouched — the REPOSITORY may still offer bounded reads; the SERVICE may not. */
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

/* ================================================================================================
 * IDENTIFIERS — 32 CHARACTERS, NO DASHES (IR-6)
 * ================================================================================================
 * AAP IR-6, citing tech specification §6.2, records that 107 of 113 legacy entities declare
 * `fieldtype="id" generator="uuid" ormtype="string" length="32"`, so a primary key is a 32-character
 * string produced in application code and never a dashed RFC-4122 value and never an auto-increment
 * integer. These fixtures honour that width so a length or format assumption cannot pass here and
 * fail against `SwOption.optionID`.
 *
 * They are `const` STRING PRIMITIVES, which is the one kind of module-scope binding this file
 * permits: a primitive cannot be mutated, so it cannot carry state from one case into another.
 * ============================================================================================== */

/** `Size` — the group whose name sorts LAST of the three, which is what makes ordering observable. */
const SIZE_GROUP_ID = '11111111111111111111111111111111';

/** `Colour` — sorts FIRST of the three. */
const COLOUR_GROUP_ID = '22222222222222222222222222222222';

/** `Material` — sorts BETWEEN the other two, so a leaked row lands mid-list rather than at an end. */
const MATERIAL_GROUP_ID = '33333333333333333333333333333333';

/** `Large`, in the `Size` group. Sorts after `Small` by NAME even though its sortOrder is higher. */
const LARGE_OPTION_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const SMALL_OPTION_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const BLUE_OPTION_ID = 'cccccccccccccccccccccccccccccccc';

const COTTON_OPTION_ID = 'dddddddddddddddddddddddddddddddd';

/** An identifier deliberately matching NO seeded row, for the not-found paths. */
const ABSENT_OPTION_ID = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

/** The option-group counterpart of {@link ABSENT_OPTION_ID}. */
const ABSENT_GROUP_ID = 'ffffffffffffffffffffffffffffffff';

/** The product whose SKUs decide which options already count as used. */
const PRODUCT_ID = '99999999999999999999999999999999';

/** A second product, used to prove the usage correlation is per-product rather than global. */
const OTHER_PRODUCT_ID = '88888888888888888888888888888888';

/* ================================================================================================
 * PURE FACTORIES — FRESH OBJECTS PER CALL, NEVER SHARED
 * ============================================================================================== */

/** One case's service together with the two doubles it was constructed from. */
interface Harness {
  readonly service: OptionService;
  readonly options: InMemoryOptionRepository;
  readonly smartList: SmartListQueryDouble;
}

/**
 * Builds one isolated service graph.
 *
 * THE CONSTRUCTOR IS EXERCISED EXACTLY AS THE COMPOSITION ROOT WILL EXERCISE IT: two positional
 * arguments, the option repository first and the smart-list query port second, both satisfied by
 * plain typed doubles because both parameters are declared as INTERFACES.
 *
 * ⛔ THE DEAD `productService` INJECTION IS NOT WIRED, AND THERE IS NOWHERE TO WIRE IT. The legacy
 * component declares `property name="productService"` at [model/service/OptionService.cfc:L53] and
 * never calls it — zero call sites, per the dependency untangling of AAP §0.6.3.4 — so the landed
 * constructor has no third parameter. Omitting it also keeps the service acyclic: `ProductService`
 * and `SkuService` both consume this one, so a reverse edge would close a cycle for a collaborator
 * nothing ever called.
 */
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

/**
 * Builds a fresh catalogue of three groups carrying four options between them.
 *
 * The options are attached through `buildOption`'s `optionGroup` seed, which routes to the entity's
 * own `Option.setOptionGroup` — the port of [model/entity/Option.cfc:L90-L96] — so the inverse side
 * lands in the array `OptionGroup.getOptions()` returns rather than being assembled here. The
 * repository double reads exactly that array, which is how the `SwOption`/`SwOptionGroup` inner join
 * of [model/dao/OptionDAO.cfc:L65-L66] is modelled without inventing a link table.
 *
 * GROUP NAMES AND OPTION NAMES ARE CHOSEN SO ORDER IS OBSERVABLE. Alphabetically the groups run
 * Colour, Material, Size while their `sortOrder` values run 1, 2, 3 in the OPPOSITE arrangement
 * (Size 1, Colour 2, Material 3); and within `Size`, `Large` has the HIGHER sortOrder while sorting
 * LATER by name than `Small`. Any implementation that ordered by `sortOrder`, or that left the rows
 * in seeded order, produces a different sequence from the one
 * [model/dao/OptionDAO.cfc:L82-L84] specifies.
 */
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

/**
 * Builds one SKU, belonging to a freshly built product, that already uses the given options.
 *
 * This is the shape the legacy correlated subquery reads. [model/dao/OptionDAO.cfc:L70-L81] excludes
 * an option when a `SwSkuOption` row joins a `SwSku` whose `productID` matches, so "used" is derived
 * from the product's SKUs and their options rather than from any usage table — and the double derives
 * it the same way, from `sku.product.productID` and `sku.options`.
 *
 * The return type is INFERRED rather than annotated on purpose: naming it would mean importing the
 * SKU domain module, which is not in this file's declared dependency set. The SKU is a vehicle for
 * the usage correlation here and nothing in this file asserts against it directly.
 */
function skuUsing(productID: string, usedOptions: readonly Option[]) {
  return buildSku({
    skuCode: `${productID}-1`,
    options: usedOptions,
    product: buildProduct({ productID }),
  });
}

/**
 * Builds a one-off repository that answers both unbounded members with the SAME array instance every
 * time, so a caller can prove the service returned that instance rather than a copy of it.
 *
 * WHY THIS ONE-OFF EXISTS ALONGSIDE THE SUPPORT DOUBLE. `createInMemoryOptionRepository` computes its
 * rows from seeded entities and materialises a NEW array per call, which is right for asserting the
 * set semantics and the ordering but structurally cannot answer the different question these two
 * delegates raise: does the service pass the repository's own result straight through, or does it map
 * it? Only a repository that hands back a known instance can settle that, and the support module
 * genuinely has no such factory — which is the one circumstance the brief admits a local object for.
 *
 * THE TWO BOUNDED MEMBERS COME FROM THE SUPPORT DOUBLE BY SPREAD rather than being written out here.
 * That keeps the local object a complete {@link OptionRepository} — the constructor requires nothing
 * less — and the spread is enough because THIS factory's two overrides are what its own cases need.
 *
 * ⚠️ AN EARLIER REVISION ADDED "Neither bounded member is called by anything below", which stopped being
 * true when section 10 landed. The two windowed members are exercised there, against
 * {@link harness}'s seeded double rather than against this pass-through object — a distinction that
 * matters, because the property section 10 asserts is FORWARDING, and forwarding is only observable
 * against a double that records the arguments it was handed. This factory records nothing.
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

/* ================================================================================================
 * 1. getOptionsForSelect — X14, the one synchronous, I/O-free member
 * ================================================================================================
 * PORT OF [model/service/OptionService.cfc:L55-L63]:
 *
 *     public array function getOptionsForSelect(required any options){
 *         var sortedOptions = [];
 *         for(i=1; i <= arrayLen(arguments.options); i++){
 *             arrayAppend(sortedOptions,{name=arguments.options[i].getOptionName(),
 *                                        value=arguments.options[i].getOptionID()});
 *         }
 *         return sortedOptions;
 *     }
 *
 * TODO(parity) X14 — model/service/OptionService.cfc:L58: the loop counter `i` is declared WITHOUT
 * `var`, so it lands in the component's shared `variables` scope. DI/1 registers services as
 * singletons, so on a persistent application server that scope is shared across concurrent requests
 * — the same concurrency-hazard class as carried defect D10 in `model/service/ProductService.cfc`.
 * Strict TypeScript block scoping REMOVES the leak by construction: the landed member iterates with
 * `for (const option of options)`, whose binding cannot escape the loop. The removal is recorded as a
 * deliberate translation decision in the manner AAP §0.8.2 Guideline 6 requires, not as a repair, and
 * this file never reproduces the hazard with shared or module-scope state — every case below builds
 * its own service.
 * ============================================================================================== */
describe('OptionService.getOptionsForSelect', () => {
  it('NET-NEW — model/service/OptionService.cfc:L55-L63 — projects an ARRAY of options into {name, value} entries in input order', () => {
    const { size } = catalogue();
    /* The legacy parameter is `required any`, but the body immediately applies `arrayLen` and `[i]`
     * to it at [:L58], so the OBSERVED contract is an array. AAP §0.4.2.4 records that TR-1
     * tightening, and this case exercises the tightened form. */
    const options: Option[] = size.getOptions();

    const entries: SelectOption[] = harness().service.getOptionsForSelect(options);

    expect(entries).toStrictEqual([
      { name: 'Large', value: LARGE_OPTION_ID },
      { name: 'Small', value: SMALL_OPTION_ID },
    ]);
  });

  it('NET-NEW — `sortedOptions` is a MISNOMER: no sort happens, so a non-alphabetical input order survives verbatim', () => {
    const { large, small, blue, cotton } = catalogue();
    /* Deliberately neither alphabetical by name nor ascending by sortOrder. The legacy local is
     * named `sortedOptions` at [model/service/OptionService.cfc:L56], but there is no `arraySort`,
     * no comparator and no ordered query anywhere in the body — the name is simply wrong, and it is
     * CARRIED rather than corrected in either direction. */
    const unsorted: Option[] = [cotton, large, blue, small];

    const entries = harness().service.getOptionsForSelect(unsorted);

    expect(entries.map((entry) => entry.name)).toStrictEqual(['Cotton', 'Large', 'Blue', 'Small']);
  });

  it('NET-NEW — the label is the BARE option name; the composite "<group> - <option>" form belongs ONLY to getUnusedProductOptions', async () => {
    const { size, large } = catalogue();
    const { service } = harness({ optionGroups: [size] });

    const projected = service.getOptionsForSelect([large]);
    const unused = await service.getUnusedProductOptions(PRODUCT_ID, SIZE_GROUP_ID);

    /* The two members produce the same SHAPE carrying different label SEMANTICS, and harmonising
     * them would change output. This member reads the option's own name at
     * [model/service/OptionService.cfc:L59]; the repository composes the group name and the option
     * name into one label at [model/dao/OptionDAO.cfc:L88]. Both are asserted here, side by side, so
     * the distinction is pinned rather than argued about. */
    expect(projected).toStrictEqual([{ name: 'Large', value: LARGE_OPTION_ID }]);
    expect(projected).not.toContainEqual({ name: 'Size - Large', value: LARGE_OPTION_ID });
    expect(unused).toContainEqual({ name: 'Size - Large', value: LARGE_OPTION_ID });
  });

  it('NET-NEW — an EMPTY input yields an empty array, because `arrayLen` of an empty array is zero', () => {
    /* `arrayLen([])` is 0, the legacy loop body never runs, and `sortedOptions` is returned as the
     * empty array it was initialised to at [model/service/OptionService.cfc:L56]. No guard, no
     * throw, no null. */
    expect(harness().service.getOptionsForSelect([])).toStrictEqual([]);
  });

  it('NET-NEW — DUPLICATES and CARDINALITY are preserved: N options in yields N entries out', () => {
    const { large } = catalogue();

    const entries = harness().service.getOptionsForSelect([large, large, large]);

    /* The legacy appends once per index with no membership test, so a caller that passes the same
     * option three times gets three entries. De-duplicating would change cardinality, which callers
     * building a drop-down would observe. */
    expect(entries).toStrictEqual([
      { name: 'Large', value: LARGE_OPTION_ID },
      { name: 'Large', value: LARGE_OPTION_ID },
      { name: 'Large', value: LARGE_OPTION_ID },
    ]);
  });

  it('NET-NEW — an ABSENT optionName yields an EMPTY label rather than a skipped entry or a substituted one', () => {
    /* [model/entity/Option.cfc:L54] declares `optionName` as a nullable column, and CFML models a
     * null column as a key ABSENT from the object — so `{name=<null>}` simply does not create the
     * key and the renderer emits an entry with an empty label. It does not fail and it does not skip
     * the entry. The empty string reproduces that outcome. Skipping would change cardinality, and
     * substituting the identifier or the option code would invent a display rule the source does not
     * have. */
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

    /* This is the only member of the service whose legacy body reads no data-access object and no
     * collaborator — it reads two accessors off objects the caller already holds. That is why the
     * landed signature returns the array directly instead of a promise, and the two empty logs below
     * are what make the claim checkable rather than asserted. */
    expect(options.calls).toStrictEqual([]);
    expect(smartList.queries).toStrictEqual([]);
  });
});

/* ================================================================================================
 * 2. getUnusedProductOptions — the first DAO pass-through
 * ================================================================================================
 * PORT OF [model/service/OptionService.cfc:L72-L74]:
 *
 *     public array function getUnusedProductOptions(required string productID,
 *                                                   required string existingOptionGroupIDList){
 *         return getOptionDAO().getUnusedProductOptions(argumentCollection=arguments);
 *     }
 *
 * `argumentCollection=arguments` forwarded the WHOLE argument bag by name, which is exactly the
 * mechanism import rule R1 of AAP §0.4.3.1 retires: the landed member forwards two explicitly typed
 * positional parameters and no bag exists to forward. The cases below assert both arguments arrive,
 * in their correct ROLES, which a bag could never have guaranteed at compile time.
 * ============================================================================================== */
describe('OptionService.getUnusedProductOptions', () => {
  it('NET-NEW — model/service/OptionService.cfc:L72-L74 — forwards BOTH required arguments explicitly, productID first and the group list second', async () => {
    const { size, colour } = catalogue();
    const { service, options } = harness({ optionGroups: [size, colour] });

    await service.getUnusedProductOptions(PRODUCT_ID, `${SIZE_GROUP_ID},${COLOUR_GROUP_ID}`);

    /* The roles are asserted, not just the values: the recorded call names each argument, so a
     * transposed forwarding — product identifier into the list slot — fails here rather than
     * silently returning the wrong set. */
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

    /* [:L88] builds `{name="#rs.optionGroupName# - #rs.optionName#", value=rs.optionID}` — one
     * literal space, one hyphen, one literal space — and the value is the OPTION's identifier, never
     * the group's. Both halves are pinned because either could drift without a type error. */
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

    /* `Material` is seeded but not listed, and its name sorts BETWEEN the two that are, so a leak
     * would appear in the middle of the sequence rather than at either end. */
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

    /* [:L78] binds the product identifier into the subquery, so usage is asked of ONE product. A
     * global "is this option used anywhere" reading would return an empty list here. */
    expect(rows).toStrictEqual([
      { name: 'Size - Large', value: LARGE_OPTION_ID },
      { name: 'Size - Small', value: SMALL_OPTION_ID },
    ]);
  });

  it('NET-NEW — model/dao/OptionDAO.cfc:L82-L84 — rows are ordered by GROUP NAME then OPTION NAME, not by sortOrder and not in seeded order', async () => {
    const { size, colour, material } = catalogue();
    /* Seeded Size, Colour, Material — alphabetically Colour, Material, Size — with sortOrder values
     * 1, 2, 3 in the seeded arrangement. All three orderings are distinguishable, and only the
     * two-term name ordering of [:L82-L84] produces the sequence below. */
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

    /* The asymmetry with the sibling member is load bearing and is asserted in both directions —
     * here, and in the group suite below. It is NOT reconciled: [model/dao/OptionDAO.cfc:L68] keeps
     * rows whose group IS IN the list, so an empty list keeps nothing, whereas [:L107] keeps rows
     * whose group is NOT IN it, so an empty list keeps everything. Both answers are correct for the
     * question each member asks. */
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

    /* A one-statement pass-through ported as a one-statement delegation. Identity is the strongest
     * available statement of "no mapping happened", and it is the property that keeps the label
     * semantics of [model/dao/OptionDAO.cfc:L88] decided in exactly one place. */
    expect(await service.getUnusedProductOptions(PRODUCT_ID, SIZE_GROUP_ID)).toBe(rows);
  });
});

/* ================================================================================================
 * 3. getUnusedProductOptionGroups — the second DAO pass-through
 * ================================================================================================
 * PORT OF [model/service/OptionService.cfc:L76-L78]:
 *
 *     public array function getUnusedProductOptionGroups(required string existingOptionGroupIDList){
 *         return getOptionDAO().getUnusedProductOptionGroups(argumentCollection=arguments);
 *     }
 *
 * G6 — A DOCUMENTARY MARKER DEFECT, RECORDED AND NOT REPAIRED. The component opens its pass-through
 * section with `// ===================== START: DAO Passthrough ===========================` at
 * [model/service/OptionService.cfc:L70] and then CLOSES it with the SAME `START` marker at [:L80],
 * where every other section in the file pairs `START` with `END` — [:L66]/[:L68], [:L82]/[:L84],
 * [:L86]/[:L88], [:L90]/[:L92] and [:L94]/[:L96] all do. The second `START` is a copy-paste artifact
 * in a COMMENT. It is behaviourally inert — comments do not execute — so there is nothing to assert
 * about it and nothing here asserts anything about it; it is recorded because the register of
 * AAP §0.6.7 is a register of decisions, and "noticed, inert, therefore carried untouched" is the
 * decision. Repairing it would edit a legacy file, which AAP §0.4.1.1 forbids outright.
 * ============================================================================================== */
describe('OptionService.getUnusedProductOptionGroups', () => {
  it('NET-NEW — model/service/OptionService.cfc:L76-L78 — forwards its ONE required argument explicitly, with no argument bag', async () => {
    const { size, colour } = catalogue();
    const { service, options } = harness({ optionGroups: [size, colour] });

    await service.getUnusedProductOptionGroups(SIZE_GROUP_ID);

    /* The legacy `argumentCollection=arguments` at [:L77] forwarded a by-name bag; the landed member
     * forwards one typed positional parameter. The recorded call carries exactly that one argument
     * and nothing else, which is what "never reintroduce an argument bag" looks like from the
     * repository's side. */
    expect(options.calls).toStrictEqual([
      { member: 'findUnusedOptionGroups', existingOptionGroupIDList: SIZE_GROUP_ID },
    ]);
  });

  it('NET-NEW — model/dao/OptionDAO.cfc:L113 — each row is {name: optionGroupName, value: optionGroupID}: a BARE group name and the GROUP identifier', async () => {
    const { size } = catalogue();
    const { service } = harness({ optionGroups: [size] });

    const rows = await service.getUnusedProductOptionGroups(COLOUR_GROUP_ID);

    /* No composition of any kind here — contrast [:L88], which joins two names into one label — and
     * the value is the GROUP's identifier, not an option's. The two members return the same shape
     * carrying different meanings, so neither the labels nor the identifier kinds may be harmonised. */
    expect(rows).toStrictEqual([{ name: 'Size', value: SIZE_GROUP_ID }]);
  });

  it('NET-NEW — model/dao/OptionDAO.cfc:L107 — the set polarity is INVERTED relative to the sibling member: groups NOT IN the supplied list', async () => {
    const { size, colour, material } = catalogue();
    const { service } = harness({ optionGroups: [size, colour, material] });

    const rows = await service.getUnusedProductOptionGroups(SIZE_GROUP_ID);

    /* One token of difference between [:L68] (`IN`) and [:L107] (`NOT IN`), opposite questions. The
     * group named in the argument is the one absent from the answer. */
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

    /* A product with no option groups yet has none used, so every group is available to add. This is
     * the widest read in the service and it is preserved exactly: no default window, no cap and no
     * refusal is introduced, because introducing one would suppress the single most useful call the
     * member has. */
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

    /* Seeded Size, Colour, Material with sortOrder 1, 2, 3 in that same arrangement, so ordering by
     * sortOrder and ordering by seeded position both yield Size first. Only the name ordering of
     * [:L108-L109] yields Colour first. */
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

/* ================================================================================================
 * 4. getOption — IR-1, declared explicitly because nothing declared it before
 * ================================================================================================
 * There is NO declaration of this member anywhere in `model/service/OptionService.cfc`. It resolved at
 * run time through `onMissingMethod` [org/Hibachi/HibachiService.cfc:L255-L281], whose `get` prefix
 * test at [:L258] routed it to the framework's identifier load. The dispatcher's own docblock states
 * "Ordered arguments only--named arguments not supported" at [:L253], and an unmatched name reached a
 * throw at [:L280] — so the surface existed only as long as the prefix convention did.
 *
 * THE REAL SLICE CALL SITE IS [model/service/SkuService.cfc:L74]:
 *
 *     var option = getOptionService().getOption( listGetAt(arguments.data.options, i) );
 *
 * — one positional identifier, inside the combination engine's walk over a comma-delimited option
 * list. TypeScript under `strict` has no equivalent facility, so AAP §0.4.2.5 requires the member be
 * declared, and TR-3 requires the dispatcher itself never be reproduced. Nothing below invokes the
 * member dynamically, by string, or through any catch-all: `service.getOption(id)` is a compile-checked
 * call on a declared member.
 * ============================================================================================== */
describe('OptionService.getOption', () => {
  it('NET-NEW — AAP §0.4.2.5 / model/service/SkuService.cfc:L74 — the identifier is forwarded verbatim as an optionID filter rooted at SlatwallOption', async () => {
    const { large } = catalogue();
    const { service, smartList } = harness(
      {},
      { outcomes: [{ kind: 'page', metrics: {}, records: [large] }] },
    );

    await service.getOption(LARGE_OPTION_ID);

    /* A whole-query assertion rather than a spot check on one field: it pins the root entity, the
     * filter property, the bound value AND the absence of anything else — no ordering, no pagination,
     * no distinct flag and no second filter is added by the service. */
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

    /* The dispatcher's convention was `getXXX(required any ID, boolean isReturnNewOnNotFound = false)`
     * and both real slice call sites pass the identifier ALONE, so the second argument took its
     * default of `false` and the framework returned nothing at all on a miss. The landed member
     * therefore offers no `isReturnNewOnNotFound` parameter: offering one would widen the surface
     * beyond the observed contract. */
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

    /* A primary-key filter can match at most one row against MySQL, so this is a defensive statement
     * about the landed `records[0] ?? null` rather than a reachable production case. It is asserted
     * because the alternative reading — raise on more than one — would be a behaviour the legacy
     * primary-key load never had. */
    expect(await service.getOption(LARGE_OPTION_ID)).toBe(large);
  });

  it('NET-NEW — the read asks for the RECORDS view alone, so one statement is issued rather than three', async () => {
    const { service, smartList } = harness();

    await service.getOption(LARGE_OPTION_ID);

    /* `SmartListQueryPort` declares `execute` for all three legacy views and `executeRecords` for the
     * unpaged collection alone. A primary-key load is ONE statement in the legacy
     * (`entityLoadByPK`), so selecting the records-only view is what keeps it one here. */
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

/* ================================================================================================
 * 5. getOptionGroup — IR-1, the same treatment for the other root entity
 * ================================================================================================
 * Also undeclared in `model/service/OptionService.cfc`, also synthesized by the `get` prefix branch of
 * `onMissingMethod` [org/Hibachi/HibachiService.cfc:L255-L281].
 *
 * THE REAL SLICE CALL SITE IS [model/service/ProductService.cfc:L115]:
 *
 *     var options = getOptionService().getOptionGroup(arguments.processObject.getOptionGroup())
 *                                     .getOptions();
 *
 * — inside `processProduct_addOptionGroup`, which resolves the group through this service and then
 * reads its options. Note that the call site dereferences the result IMMEDIATELY, with no null test,
 * which is why the `null` arm below is worth pinning explicitly: the landed member's contract is where
 * that risk becomes visible to a compiler instead of at run time.
 *
 * The member is declared SEPARATELY from `getOption` rather than generalised into one
 * identifier-typed member, because the legacy surface was per-entity — the dispatcher recovered the
 * entity name from the member name — and because a single generic member would let an option
 * identifier be handed to a group lookup with no compile error.
 * ============================================================================================== */
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
    /* [model/service/ProductService.cfc:L115] chains straight into `.getOptions()`, so the returned
     * group has to be the live entity rather than a projection. Asserted through the entity's own
     * accessor, which returns the live array. */
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

    /* Two separate declared members, two different root entities and two different filter
     * properties. A single generic identifier member would have made these indistinguishable and
     * would have let an option identifier resolve against the group root with no compile error. */
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

/* ================================================================================================
 * 6. getOptionSmartList — IR-1, the paginated dynamic query over options
 * ================================================================================================
 * Undeclared in `model/service/OptionService.cfc`. The legacy resolved it through `onMissingMethod`
 * [org/Hibachi/HibachiService.cfc:L255-L281], whose SUFFIX test at [:L259-L260] recognised the
 * trailing `SmartList` and routed it to the framework's smart-list factory rather than to the
 * identifier load. AAP §0.4.2.5 mandates the explicit declaration.
 *
 * THE REAL SLICE CALL SITE IS `Product.getOptionsByOptionGroup()` at
 * [model/entity/Product.cfc:L340-L347]:
 *
 *     var smartList = getService("optionService").getOptionSmartList();   // :L341
 *     smartList.setSelectDistinctFlag(1);                                 // :L342
 *     smartList.addFilter("optionGroup.optionGroupID", arguments.optionGroupID);  // :L343
 *     smartList.addFilter("skus.product.productID", this.getProductID());         // :L344
 *     smartList.addOrder("sortOrder|ASC");                                // :L345
 *     return smartList.getRecords();                                      // :L346
 *
 * ⚠️ EVERY ONE OF THOSE FIVE LINES IS THE CALLER'S, AND NONE OF THEM MOVES INTO THIS SERVICE. The
 * legacy handed back a MUTABLE smart-list object and the caller configured it afterwards; the
 * distinct flag, both filters and the ordering are the caller's decisions. Setting any of them here
 * would invent behaviour for every other caller. The cases below therefore assert what the service
 * itself owns — the root entity and faithful forwarding of whatever input it was given — and assert
 * that the no-argument call adds NOTHING.
 *
 * A NOTE ON THE SIGNATURE, SINCE A READER MAY EXPECT A SECOND PARAMETER. The product and SKU smart
 * lists carry a `currentURL` argument in AAP §0.4.2.1 and §0.4.2.2; the two OPTION smart lists do not
 * — AAP §0.4.2.5 declares them as `(input?: SmartListInput)` and nothing else, and `SmartListInput`
 * has no member for a current URL. The landed signature matches that row exactly, so there is no
 * mismatch to expose here, and no second argument is invented to create the appearance of symmetry.
 * ============================================================================================== */
describe('OptionService.getOptionSmartList', () => {
  it('NET-NEW — AAP §0.4.2.5 / model/entity/Product.cfc:L341 — called with NO argument, the query carries the SlatwallOption root and nothing else', async () => {
    const { service, smartList } = harness();

    await service.getOptionSmartList();

    /* An EXACT whole-query match, which is the point: it proves the service contributes no filter, no
     * ordering, no keyword property, no join, no page size and — critically — no `selectDistinctFlag`.
     * That matches the all-collections-empty state the legacy smart list is constructed in before its
     * caller touches it. The argument is optional precisely because [model/entity/Product.cfc:L341]
     * supplies none. */
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

    /* Both filters land in ONE where group, which the legacy conjoins — so this is "options of THIS
     * group used by THIS product", not a union. The two paths differ in hop count and neither is a
     * typo for the other: `optionGroup.optionGroupID` is one hop over the required many-to-one at
     * [model/entity/Option.cfc:L59], while `skus.product.productID` is two, an option reaching its
     * SKUs directly through the `SwSkuOption` link table and thence their product. */
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

    /* ⭐ S8 — THE MISMATCH THE LANDED SERVICE FLAGS RATHER THAN FAKES, ASSERTED HERE SO IT CANNOT BE
     * CLOSED BY ACCIDENT. `src/services/OptionService.ts:241` and `:779` record it: the distinct flag
     * of the call site is a consequence left "FOR WHOEVER PORTS model/entity/Product.cfc".
     *
     * Stated precisely, because overstating it would be wrong in the other direction: the underlying
     * `SmartListQuery` DOES declare `selectDistinctFlag`, and the MySQL builder implements it. What
     * has no member for it is `SmartListInput`, which is the only thing this parity signature accepts.
     * So the flag is neither expressible here nor supplied here — it stays the caller's decision, and
     * the gap is recorded rather than closed by widening the signature or by defaulting the flag on. */
    expect(smartList.lastQuery()).toStrictEqual({
      entityName: 'SlatwallOption',
      whereGroups: [{ filters: [{ propertyIdentifier: 'optionName', value: 'Large' }] }],
    });
  });

  /* ⭐ SEC-09 — THE CLOSED-IDENTIFIER REVIEW ITEM, ASSERTED AT THIS SERVICE'S OWN BOUNDARY.
   * `src/services/OptionService.ts:288` states that the port resolves a caller-supplied property
   * path against its entity whitelist rather than accepting an open `string`, and
   * `src/ports/SmartListQueryPort.ts:268` carries the entity schema those closed identifiers are
   * derived from. The pair of cases below IS that closure, observed through the only surface this
   * suite may touch: a path that does not resolve for the root is absent from the emitted query,
   * and the same path reached through the declared relationship hop is present.
   *
   * ⚠️ THE SCOPE OF THIS LABEL, STATED SO IT CANNOT BE OVER-READ. It covers closure AS THIS SERVICE
   * EXPOSES IT, and nothing further — the emitted `SmartListQuery`, not the SQL compiled from it. The
   * builder's own statement shape, operator rendering and identifier refusals belong to
   * `test/adapters/SmartListQueryBuilder.test.ts`. Section 9 of THIS file drives the real builder for
   * the one property that spans both modules — that a fanning join's duplicates do not survive into the
   * collection this service returns — and says there why that composition belongs to neither alone. */
  it('NET-NEW — an option-GROUP property is DROPPED from an OPTION smart list, silently, exactly as the legacy dropped an unresolvable path', async () => {
    const { service, smartList } = harness();

    await service.getOptionSmartList({ 'F:optionGroupName': 'Size' });

    /* `optionGroupName` is not a property of `SwOption`; reaching it from this root requires the
     * relationship hop asserted in the next case. An unresolvable path yielded a query with the entry
     * MISSING and no error anywhere in the legacy, so raising here would turn a silently ignored
     * request key into a failed request — a behaviour change in the opposite direction. The two roots
     * genuinely use DIFFERENT property sets, and resolving one against the other would compile, would
     * not throw, and would silently admit the wrong identifiers. */
    expect(smartList.lastQuery()).toStrictEqual({ entityName: 'SlatwallOption' });
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

  it('NET-NEW — an unresolvable OrderBy term is dropped while a legal companion term is kept, and the direction token is honoured', async () => {
    const { service, smartList } = harness();

    await service.getOptionSmartList({ OrderBy: 'optionGroupName|ASC,sortOrder|DESC' });

    expect(smartList.lastQuery()).toStrictEqual({
      entityName: 'SlatwallOption',
      orders: [{ propertyIdentifier: 'sortOrder', direction: 'DESC' }],
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

    /* One case rather than seven, because the claim is about the WHOLE projection: like filters gain
     * their wildcards, in-filters keep their raw comma list, ranges split on the caret, keywords split
     * on the separator, and all three page controls arrive — with `P:Current` carried as a STRING,
     * which is the shape the legacy request key had. Nothing is added and nothing is silently
     * normalised away. */
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

    /* The landed signature returns an ALREADY-EXECUTED result rather than a configurable object, so
     * the whole page is the service's return value and every figure on it is observable. */
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

    /* A smart list materialises the collection, the page and the total — three statements in the
     * legacy, each on first read. An identifier load is one. Recording the selection is what makes
     * that difference checkable rather than a matter of reading the implementation. */
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

/* ================================================================================================
 * 7. getOptionGroupSmartList — IR-1, the same member on the other root entity
 * ================================================================================================
 * Also undeclared, also synthesized by the `SmartList` suffix branch of `onMissingMethod`
 * [org/Hibachi/HibachiService.cfc:L255-L281].
 *
 * THE REAL SLICE CALL SITE IS `Product.getOptionGroups()` at [model/entity/Product.cfc:L251-L261]:
 *
 *     var smartList = getService("OptionService").getOptionGroupSmartList();     // :L254
 *     smartList.setSelectDistinctFlag(1);                                        // :L255
 *     smartList.addFilter("options.skus.product.productID", this.getProductID()); // :L256
 *     smartList.addOrder("sortOrder|ASC");                                       // :L257
 *     variables.optionGroups = smartList.getRecords();                            // :L258
 *
 * ⚠️ AGAIN, THE CONFIGURATION IS THE CALLER'S. The distinct flag at [:L255], the filter at [:L256]
 * and the ordering at [:L257] all belong to `Product`, not to this service. Note also that this call
 * site is the one that feeds the group list BOTH unused-option members take as input, which is why
 * its filter path matters: `options.skus.product.productID` is THREE hops — group, its options, their
 * SKUs, those SKUs' product — because no direct option-group-to-product relationship exists.
 * Shortening it would answer a different question.
 *
 * The service is NOT exercised through `Product` here. `src/domain/product/Product.ts` is not in this
 * file's declared dependency set, and the locators above are documentary evidence for what the input
 * must be able to express — not an instruction to drive the caller. Only this service's own explicit
 * boundary is tested.
 * ============================================================================================== */
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

    /* The path resolves here and only here: group -> options -> skus -> product. It is one hop longer
     * than the option-side equivalent asserted in the previous suite, and the difference is real
     * rather than a transcription slip. `sortOrder` is a persistent column on BOTH entities —
     * [model/entity/OptionGroup.cfc:L58] and [model/entity/Option.cfc:L56] — so the same ordering term
     * is legal on either root. */
    expect(smartList.lastQuery()).toStrictEqual({
      entityName: 'SlatwallOptionGroup',
      whereGroups: [
        { filters: [{ propertyIdentifier: 'options.skus.product.productID', value: PRODUCT_ID }] },
      ],
      orders: [{ propertyIdentifier: 'sortOrder', direction: 'ASC' }],
    });
  });

  it('NET-NEW — an OPTION property is DROPPED from an OPTION-GROUP smart list, which is the mirror image of the option-root case', async () => {
    const { service, smartList } = harness();

    await service.getOptionGroupSmartList({ 'F:optionName': 'Large' });

    /* Asserted in BOTH directions on purpose. This service is the only one in the slice that roots a
     * smart list at either of two entities, so a whitelist applied to the wrong root would compile,
     * would not throw, and would silently admit or discard the wrong identifiers — precisely the
     * class of failure that has to be pinned by a test rather than argued about. */
    expect(smartList.lastQuery()).toStrictEqual({ entityName: 'SlatwallOptionGroup' });
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
    /* The records are the live entities the caller at [model/entity/Product.cfc:L258] stores and later
     * reads options off, so their type is part of the contract rather than incidental. */
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
    /* And the third call, made with no argument after two configured ones, carries no residue of
     * either — the projection is computed per call and nothing is accumulated on the service. */
    expect(smartList.lastQuery()).toStrictEqual({ entityName: 'SlatwallOption' });
  });

  it('NET-NEW — a failing query REJECTS here too', async () => {
    const failure = new Error('the option-group smart list could not be materialised');
    const { service } = harness({}, { outcomes: [{ kind: 'failure', failure }] });

    await expect(service.getOptionGroupSmartList()).rejects.toThrow(failure);
  });
});

/* ================================================================================================
 * 8. M7 — INVOCATION ISOLATION: NOTHING SURVIVES BETWEEN TWO SERVICE GRAPHS
 * ================================================================================================
 * AAP §0.6.6 mismatch M7 is the one execution-model difference this file can and must demonstrate.
 * The legacy ran on a persistent application server: 111 of 113 entities declare
 * `cacheuse="transactional"`, derived getters memoise into the entity's `variables` scope, and
 * `model/dao/SkuDAO.cfc:L204-L228` memoises an option-group sort order across calls. A Lambda
 * container keeps MODULE SCOPE alive between invocations and nothing else, so any state parked on a
 * service — a cache, a memo, a query log, an accumulated filter set — would bleed from one request
 * into the next on a warm container, which for a multi-tenant catalogue is a correctness failure and
 * not merely an untidiness.
 *
 * The landed service holds its two collaborators as `private readonly` fields and memoises nothing.
 * The cases below prove that from the outside, with TWO INDEPENDENTLY CONSTRUCTED services whose
 * doubles hold DIFFERENT state: the second invocation must see nothing of the first's query, its
 * configuration or its rows. The same property is why this file has no `beforeEach` and no shared
 * fixture — see the header on the two commented lifecycle calls at
 * [meta/tests/unit/SlatwallUnitTestBase.cfc:L53] and [:L70].
 * ============================================================================================== */
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

    /* Invocation 1 configures a filter, an ordering and a page size on the OPTION root. */
    await firstGraph.service.getOptionSmartList({
      'F:optionGroup.optionGroupID': SIZE_GROUP_ID,
      OrderBy: 'sortOrder|DESC',
      'P:Show': 5,
    });
    /* Invocation 2 is a bare call on the OPTION-GROUP root, through a different service. */
    const secondResult = await secondGraph.service.getOptionGroupSmartList();

    expect(secondGraph.smartList.queries).toHaveLength(1);
    expect(secondGraph.smartList.lastQuery()).toStrictEqual({
      entityName: 'SlatwallOptionGroup',
    });
    expect(secondResult.records).toStrictEqual([second.blue]);
    /* And the first graph is equally untouched by the second, so isolation is symmetric rather than
     * merely one-directional. */
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

    /* The same call, the same argument, two different answers — because each graph reads only its own
     * seeds. A module-scope catalogue shared between them would make the second answer include the
     * first's groups. */
    expect(firstRows.map((row) => row.name)).toStrictEqual(['Colour', 'Material', 'Size']);
    expect(secondRows.map((row) => row.name)).toStrictEqual(['Colour']);
    expect(firstGraph.options.calls).toHaveLength(1);
    expect(secondGraph.options.calls).toHaveLength(1);
  });

  it('NET-NEW — M7: nothing is memoised WITHIN one service either, so a repeated call re-reads rather than replaying', async () => {
    const { size, colour } = catalogue();
    const graph = harness({ optionGroups: [size] });

    const before = await graph.service.getUnusedProductOptionGroups(ABSENT_GROUP_ID);
    /* A group added between the two calls MUST be visible to the second one. The legacy memo this
     * mirrors is the option-group sort-order cache at `model/dao/SkuDAO.cfc:L204-L228`, whose clear
     * function is inverted so the cache is never actually cleared (carried defect D7). No equivalent
     * memo exists on this service, and this case is what would fail if one were introduced. */
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

    /* IR-1, checked at run time as well as at compile time. Four of these seven had NO declaration in
     * `model/service/OptionService.cfc` and existed only while `onMissingMethod`
     * [org/Hibachi/HibachiService.cfc:L255-L281] was there to fabricate them by prefix. Each is now a
     * real member reached by name — this case asserts the function is genuinely there, and every case
     * above calls each one directly, which is the part no dynamic dispatcher could satisfy. There is
     * deliberately no catch-all, no proxy and no string-keyed invocation anywhere in this file. */
    expect(typeof service.getOptionsForSelect).toBe('function');
    expect(typeof service.getUnusedProductOptions).toBe('function');
    expect(typeof service.getUnusedProductOptionGroups).toBe('function');
    expect(typeof service.getOption).toBe('function');
    expect(typeof service.getOptionGroup).toBe('function');
    expect(typeof service.getOptionSmartList).toBe('function');
    expect(typeof service.getOptionGroupSmartList).toBe('function');

    /*
     * ⛔ AND THAT LIST IS COMPLETE, WHICH IS A CHANGE FROM AN EARLIER REVISION OF THIS CASE. It also
     * asserted `typeof service.getUnusedProductOptionsBounded` and
     * `typeof service.getUnusedProductOptionGroupsBounded`, on the ground that
     * `src/handlers/optionHandler.ts` routed to both and a silently-disappearing member would take a
     * routed operation with it. The routing was the defect, not the evidence: AAP §0.4.2.4/§0.4.2.5 fix
     * this surface at three declared plus four synthesized members, §0.8.3.1 requires it be checkable
     * method-by-method, and §0.7.3 S9 forbids inventing a batch read — so both companions, and
     * `getOptionsByIDs` with them, were WITHDRAWN from the service and from the handler together.
     * `OptionService — the declared public surface` at the foot of this file now asserts the ceiling
     * directly, in both directions, which is the assertion that would have caught the additions here.
     *
     * ⚠️ THE ARITIES STILL EARN THEIR PLACE, for the surviving members. `getUnusedProductOptions` takes
     * the product and the existing-group list [model/service/OptionService.cfc:L72]; its group-only
     * sibling takes the list alone [:L76]. Those two differ by exactly one parameter and return the
     * same `SelectOption[]` shape, so a signature copied from the wrong sibling passes every `typeof`
     * assertion above and fails here.
     */
    expect(service.getUnusedProductOptions).toHaveLength(2);
    expect(service.getUnusedProductOptionGroups).toHaveLength(1);
    expect(service.getOptionsForSelect).toHaveLength(1);
  });

  it('NET-NEW — the input type admits the caller keys the two smart lists actually use, and the service stays indifferent to which arrive', async () => {
    /* A typed input value built once and handed to BOTH roots, which is only meaningful because
     * `SmartListInput` is a single declared type rather than a per-member shape. It also documents the
     * one asymmetry a reader might expect and not find: there is no `currentURL` member to supply. */
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

/* ================================================================================================
 * 9. THE REAL BUILDER, DRIVEN THROUGH THIS SERVICE, OVER A GENUINELY FANNING JOIN
 * ================================================================================================
 * ⚠️ WHY THIS SECTION EXISTS AS ITS OWN THING. Every case above answers through
 * `createSmartListQueryDouble`, which records the `SmartListQuery` it was handed and returns seeded
 * entities. That is the right instrument for asserting what this service EMITS, and it is the wrong one
 * for asserting what a caller RECEIVES: a double that returns two already-distinct entities returns
 * them whether or not the adapter emitted `SELECT DISTINCT`, so a distinctness assertion built on it
 * cannot fail. `src/adapters/mysql/SmartListQueryBuilder.ts` nevertheless cited this file as the place
 * its fanning-join behaviour was asserted — a claim nothing here supported. This section is the honest
 * resolution: the claim becomes true.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE TWO SUBJECTS, AND WHY THEY ARE THE RIGHT ONES
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * `findProductOptionGroups` and `findProductOptionsByOptionGroup` are exported by
 * `src/services/OptionService.ts`, so they are this file's subject matter and not a neighbouring
 * module's. They are also the only two members in the whole slice that set `selectDistinctFlag`, and
 * they set it because the legacy did — `setSelectDistinctFlag(1)` at [model/entity/Product.cfc:L255]
 * and [:L342]. And their filter paths are the authentic fanning ones:
 *
 *   `options.skus.product.productID`   THREE hops from the option-group root [:L256] — one-to-many to
 *                                      options, many-to-many through `SwSkuOption`, many-to-one to
 *                                      product. An option group reachable through several of the
 *                                      product's SKUs produces SEVERAL rows.
 *   `skus.product.productID`           TWO hops from the option root [:L344], fanning through the same
 *                                      link table. Shorter because an option relates to SKUs directly;
 *                                      the two paths are genuinely different questions.
 *
 * So the duplicate rows are not a contrivance — they are what MySQL returns for the statement the
 * legacy wrote, and `setSelectDistinctFlag(1)` is the legacy's own answer to them.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS SECTION DOES NOT ASSERT
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * Not the builder's own contract. Which clauses each statement may carry, how every operator renders,
 * and which identifiers are refused belong to `test/adapters/SmartListQueryBuilder.test.ts` and are not
 * restated here. What lives here is the COMPOSITION — that this service's query, run through the real
 * adapter, issues its statements in the order the resource bound depends on and hands back a collection
 * a fanning join cannot inflate. That property spans two modules and belongs to neither alone.
 *
 * NO DATABASE AND NO SQL ENGINE. `createFanningSqlExecutorDouble` answers from each statement's own
 * text — count, distinct, non-distinct, windowed — and evaluates no `WHERE` clause. AAP §0.8.4 records
 * that the `Sw*` tables exist in no artefact of this repository, so a live comparison is impossible and
 * none is implied.
 *
 * TEST PROVENANCE: every case below is **NET-NEW**. No legacy `OptionServiceTest` and no legacy smart-list
 * test exists anywhere under `meta/tests/` (AAP §0.6.5.2), so nothing here extends a named legacy
 * assertion and nothing is labelled TRACEABLE.
 * ============================================================================================== */

/** The SKU-to-option link table's rows are what fan; these are the SKUs the fan comes from. */
const FIRST_SKU_ID = '77777777777777777777777777777771';
const SECOND_SKU_ID = '77777777777777777777777777777772';

/**
 * A real {@link SmartListQueryBuilder} over a fanning executor, wired exactly as production wires it.
 *
 * The aggregate loaders are the REAL `createCatalogAggregateLoaders`, because which hydration mechanism
 * runs is decided per root by that registry and substituting it would change the behaviour under test:
 * `SlatwallOption` has an injected loader and `SlatwallOptionGroup` deliberately has none, so the option
 * root exercises the injected path and the group root exercises the builder's built-in relationship pass.
 *
 * The default-SKU binder THROWS. Neither root reaches it — it is needed only for `Product.defaultSku` —
 * so throwing is how that expectation is enforced rather than assumed.
 */
function realBuilderOver(
  fanning: FanningSqlExecutorDoubleOptions,
  budget?: { readonly maximumRecordsPerQuery: number },
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

  return { builder: new SmartListQueryBuilder(executor.executor, loaders, budget), executor };
}

/**
 * The option-group root's rows as the three-hop join returns them: SIZE twice, COLOUR once.
 *
 * SIZE fans because the product has TWO SKUs carrying options of that group, which is the ordinary
 * catalogue shape rather than an edge case — a size group is used by every SKU of a shirt.
 */
const FANNED_GROUP_ROWS = Object.freeze([
  Object.freeze({ optionGroupID: SIZE_GROUP_ID, optionGroupName: 'Size', sortOrder: 1 }),
  Object.freeze({ optionGroupID: SIZE_GROUP_ID, optionGroupName: 'Size', sortOrder: 1 }),
  Object.freeze({ optionGroupID: COLOUR_GROUP_ID, optionGroupName: 'Colour', sortOrder: 2 }),
]);

/** The option root's rows as the two-hop join returns them: LARGE twice, SMALL once. */
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

describe('NET-NEW OptionService × the real SmartListQueryBuilder — fanning joins (F-20)', () => {
  it('[NET-NEW] the three-hop option-group query collapses its fan: three rows in, two groups out', async () => {
    const { builder, executor } = realBuilderOver({
      rootRows: FANNED_GROUP_ROWS,
      rootIdentityColumn: 'optionGroupID',
      associations: [
        { matching: 'FROM SwOption associationFar', rows: GROUP_OPTION_ASSOCIATION_ROWS },
      ],
    });

    const groups = await findProductOptionGroups(builder, PRODUCT_ID);

    /* ⭐ THE ASSERTION THAT FAILS IF `DISTINCT` IS REMOVED. `setSelectDistinctFlag(1)` at
     * [model/entity/Product.cfc:L255] is what makes SIZE appear once for a product whose two SKUs both
     * carry it. Drop `DISTINCT` from `composeSelectClause` and this executor hands back all three rows,
     * `materialiseRows` pushes one array element per ROW — it shares instances through the identity map
     * but never collapses the array — and this length becomes three. */
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.optionGroupID)).toStrictEqual([
      SIZE_GROUP_ID,
      COLOUR_GROUP_ID,
    ]);

    /* And the distinct projection is genuinely in the statement, not merely implied by the outcome. */
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

    /* Three hops, and the middle one is the many-to-many link table — which is WHY the fan exists. A
     * shorter path would not fan, so a case that asserted distinctness without this join would be
     * asserting it against a statement that never produced a duplicate. */
    expect(recordStatement).toContain('LEFT JOIN SwOption aslatwalloption');
    expect(recordStatement).toContain('LEFT JOIN SwSkuOption aslatwallsku_link');
    expect(recordStatement).toContain('LEFT JOIN SwSku aslatwallsku');
    expect(recordStatement).toContain('LEFT JOIN SwProduct aslatwallproduct');

    /* S2 — `?` binds VALUES only. The identifier never appears in statement text on any of the three. */
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

    /* The count is `COUNT(DISTINCT <pk>)` unconditionally — `SMARTLIST_DISTINCT_ASYMMETRY` declares
     * exactly that — so it answers TWO for three fanned rows. It also runs first, because the
     * materialisation bound must be able to refuse before a row is read; the case below shows it doing
     * so through this very member. */
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

    /* THREE statements: count, records, and ONE association read. No page statement, because these two
     * members declare no pagination and the legacy default window starts at record one and shows ten —
     * so a bounded re-read could only return the rows already in hand. */
    const statements = executor.statements();
    expect(statements).toHaveLength(3);
    for (const statement of statements) {
      expect(statement).not.toContain('LIMIT');
    }
  });

  it('[NET-NEW] the page statement IS issued when a window cannot cover the record set, and it windows the COLLAPSED rows', async () => {
    /* Driven directly rather than through the two finders, because neither declares pagination — which
     * is itself the legacy behaviour [model/entity/Product.cfc:L251-L261 declares no page]. The window
     * belongs to the composition all the same: a caller reading `pageRecords` must not receive
     * duplicates either, and `LIMIT` applies AFTER `DISTINCT` in MySQL. */
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
      /* ⭐ THE SECOND WINDOW, NOT THE FIRST, AND THE CHOICE IS WHAT MAKES THIS FALSIFIABLE. Record one
       * is SIZE in BOTH the collapsed set and the fanned set, so a first-page assertion would pass
       * either way. Record TWO is COLOUR in the collapsed set and the DUPLICATE SIZE in the fanned set —
       * so this window can only be answered correctly by a page taken after the duplicates are gone. */
      pagination: { pageRecordsStart: 2, pageRecordsShow: 1 },
    });

    const statements = executor.statements();
    expect(statements).toHaveLength(4);
    expect(statements[2]?.endsWith(' LIMIT ? OFFSET ?')).toBe(true);
    expect(executor.calls[2]?.params).toStrictEqual([PRODUCT_ID, '1', '1']);

    /* `LIMIT` applies AFTER `DISTINCT` in MySQL, so the window is one record of the COLLAPSED set. That
     * is the difference `DISTINCT` makes to a PAGE rather than to a collection, and it is precisely the
     * shape `issue_1296` was raised about — page-record distinctness. */
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

    /* ⭐ ONE statement for the whole collection, never one per owner: the N+1 read the batching exists
     * to prevent would show up here as two. TWO placeholders for two distinct owners — the fanned
     * duplicate contributes its owner key ONCE, which `collectDistinctEntities` is what guarantees, and
     * a repeated owner would otherwise have its collection appended to twice. */
    expect(associationStatements).toHaveLength(1);
    expect(associationStatements[0]).toContain('IN (?, ?)');

    /* FIXED DEPTH: the loaded options are not themselves re-hydrated, so no third statement follows. */
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

    /* Three rows in, two options out. This root has an INJECTED aggregate loader
     * (`createCatalogAggregateLoaders` supplies one for `SlatwallOption` and deliberately none for
     * `SlatwallOptionGroup`), so this case exercises the other of the builder's two mutually exclusive
     * hydration mechanisms — and the collapse has to hold on both. */
    expect(options).toHaveLength(2);
    expect(options.map((option) => option.optionID)).toStrictEqual([
      LARGE_OPTION_ID,
      SMALL_OPTION_ID,
    ]);
    expect(options[0]?.optionGroup?.optionGroupName).toBe('Size');

    /* Both filters bound, in the legacy's order: the group first [model/entity/Product.cfc:L343], the
     * product second [:L344]. Order matters because they are positional. */
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
      { maximumRecordsPerQuery: 1 },
    );

    await expect(findProductOptionGroups(builder, PRODUCT_ID)).rejects.toThrow(
      /matched more records than the configured materialisation budget admits/,
    );

    /* ⭐ THE GATE MEASURES OWNERS, WHICH IS THE RIGHT THING FOR IT TO MEASURE. Two distinct groups
     * against a budget of one is over; the three fanned ROWS are never read at all. Exactly one
     * statement ran — the count — so nothing was materialised and no association read followed. */
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

    /* IR-12 and AAP §0.7.3 S9 forbid inventing a maximum the legacy does not state, and
     * `org/Hibachi/HibachiSmartList.cfc` states none. An operator who wires no figure gets the legacy's
     * unbounded materialisation, and this case is what stops a default from being introduced quietly. */
    await expect(findProductOptionGroups(builder, PRODUCT_ID)).resolves.toHaveLength(2);
  });

  it('[NET-NEW] a fan that repeats across SEPARATE skus still yields ONE instance per group, shared by identity', async () => {
    /* The two SKUs the fan comes from, named so the row set reads as the join result it is rather than
     * as an arbitrary duplicate. Both carry the SIZE group; only the first carries COLOUR. */
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
    /* ⚠️ AND THE INSTANCES ARE NOT SHARED ACROSS CALLS. The identity map is scoped to one execution and
     * discarded when it returns (M7): nothing may survive between invocations on a warm container, so
     * a second read of the same product must build fresh entities. Sharing them would be exactly the
     * cross-request bleed the per-call scope exists to prevent. */
    expect(second).toHaveLength(2);
    expect(second[0]).not.toBe(first[0]);
  });
});

/* ================================================================================================
 * 10. THE DECLARED SURFACE — THE CEILING, ASSERTED
 * ================================================================================================
 * ⚠️ WHAT REPLACED SECTION 10. This slot used to hold `THE TWO WINDOWED COMPANIONS — F3a`: six cases
 * over `getUnusedProductOptionsBounded` and seven over `getUnusedProductOptionGroupsBounded`, plus a
 * `soleBoundedCall` narrowing helper. Those two members, and `getOptionsByIDs` with them, have been
 * WITHDRAWN FROM THE SERVICE — AAP §0.4.2.4/§0.4.2.5 fix this surface at three declared plus four
 * synthesized members, and §0.7.3 S9 forbids inventing a batch read. Their cases could not be kept,
 * because there is nothing left for them to call; keeping them would have meant keeping the members,
 * which is the defect. What replaces them is stronger than a delegation assertion: the case below
 * enumerates the REAL prototype in BOTH directions, so re-adding any of the three fails HERE.
 *
 * ⚠️ SECTION 9 ABOVE IS UNAFFECTED AND WAS KEPT IN FULL. It asserts the composition of this service
 * with the real `SmartListQueryBuilder` over a fanning join, and it names none of the three withdrawn
 * members — so nothing in it depended on them. The withdrawal narrowed the SURFACE; it did not narrow
 * what the seven surviving members must be shown to do.
 * ============================================================================================== */

describe('OptionService — the declared public surface', () => {
  it('NET-NEW — AAP §0.4.2.4/§0.4.2.5 — the surface is exactly seven members, in both directions', () => {
    /*
     * ⛔ BIDIRECTIONAL BY CONSTRUCTION, WHICH IS THE WHOLE POINT OF THE CASE. The list is not checked
     * member-by-member with `toContain`, because that direction alone proves only that nothing was LOST.
     * Enumerating `Object.getOwnPropertyNames(OptionService.prototype)` and comparing the sorted result
     * with `toStrictEqual` closes the other direction too: a member ADDED to the service fails here, and
     * it fails by name, without anyone having to remember to extend this file.
     *
     * ⭐ WHY THIS IS ASSERTED AT ALL, GIVEN THE COMPILER. TypeScript checks that every call site matches
     * a declaration; it does not and cannot check that the set of declarations equals a frozen plan. AAP
     * §0.8.3.1 asks for parity that is "checkable method-by-method", and this case is where that check
     * lives for this service. Three additive companions — `getUnusedProductOptionsBounded`,
     * `getUnusedProductOptionGroupsBounded` and `getOptionsByIDs` — were previously declared alongside
     * these seven and every one of them compiled cleanly, so the compiler was never going to be the
     * thing that caught them.
     *
     * ⭐ `getOwnPropertyNames` ON THE PROTOTYPE, NOT `Object.keys` ON AN INSTANCE, AND THE DIFFERENCE
     * DECIDES WHETHER THE CASE WORKS. Class methods are non-enumerable, so `Object.keys` over an
     * instance answers the INJECTED FIELDS and not the members; and reading the prototype means no
     * collaborator has to be constructed to ask the question.
     *
     * `constructor` is present because every prototype carries it, and it is listed rather than filtered
     * so the expectation states the literal truth about the object rather than a tidied version of it.
     */
    expect(Object.getOwnPropertyNames(OptionService.prototype).sort()).toStrictEqual([
      'constructor',
      // The THREE declared in model/service/OptionService.cfc, at :L55, :L72 and :L76.
      'getOption',
      'getOptionGroup',
      'getOptionGroupSmartList',
      'getOptionSmartList',
      'getOptionsForSelect',
      'getUnusedProductOptionGroups',
      'getUnusedProductOptions',
    ]);
  });

  it('NET-NEW — AAP §0.7.3 S9 — none of the withdrawn additions is reachable by name', () => {
    /*
     * The negative half stated explicitly, so a reader sees WHICH members were withdrawn rather than
     * having to diff the list above against history. Each of these compiled, was documented and was
     * still a parity defect: AAP §0.4.2.5 reproduces the legacy's run-time synthesis "only where used",
     * §0.7.3 S9 names "batch" among the things a port may not invent, and §0.8.2 Guideline 4 forbids
     * optimising beyond what the migration requires. A bound and a batch are optimisations.
     */
    const withdrawn = [
      'getUnusedProductOptionsBounded',
      'getUnusedProductOptionGroupsBounded',
      'getOptionsByIDs',
    ] as const;

    for (const member of withdrawn) {
      expect(Object.getOwnPropertyNames(OptionService.prototype)).not.toContain(member);
      /* The descriptor rather than the value, so the claim needs no cast to read a member the type
       * system correctly says is not there — and so it also rules out a non-enumerable or accessor
       * declaration that a value read could have reported as `undefined`. */
      expect(Object.getOwnPropertyDescriptor(OptionService.prototype, member)).toBeUndefined();
    }
  });

  it('NET-NEW — AAP §0.4.2.5 — the unsynthesized CRUD prefixes were not fabricated either', () => {
    /*
     * `org/Hibachi/HibachiService.cfc:L255-L281` would have answered every one of these on demand for
     * the legacy, from a lower-cased name prefix. AAP §0.4.2.5 reproduces synthesis "only where used",
     * and the slice uses none of them — so their ABSENCE is the ported behaviour, and asserting it keeps
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
