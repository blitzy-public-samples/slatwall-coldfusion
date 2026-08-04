/**
 * `BrandService` — the four-member surface, the exact URL-title algorithm, and the local
 * `BaseService` save/delete contracts it delegates to.
 *
 * AAP authority: AAP §0.4.1.12 lists `slatwall-ts/test/services/BrandService.test.ts` | create |
 * "**NET-NEW**", and the AAP §0.4.4 wildcard row authorises `slatwall-ts/test/**` | create. The
 * subject's contract is fixed by AAP §0.4.2.3 (the one declared member) and AAP §0.4.2.5 (the three
 * members that existed only through `onMissingMethod` synthesis, IR-1).
 *
 * These are unit tests. The legacy suite's equivalents were integration tests
 * Every case below imports the class under test directly and hands it collaborators through its
 * constructor. Nothing boots an application, nothing resolves a name at run time, and nothing
 * touches a database.
 */
import { BRAND_PROPERTY_DESCRIPTORS } from '../../src/domain/product/Brand';
import { BaseService } from '../../src/services/BaseService';
import { BrandService } from '../../src/services/BrandService';
/*
 * Neither `DomainError` nor `ValidationError` is imported, and the reason is visible in what this
 * file asserts. `save` does not raise for a validation failure — it attaches the findings to the
 * entity's own bag and returns the same instance, per `model/service/HibachiService.cfc:L103` — and
 * `delete` reports refusal as `false` rather than raising, per `:L68`. So no case in this file has an
 * error class to name, and the two imports would now be dead weight the linter would reject.
 */
import { createUniqueURLTitle, createUrlTitleProbeBudget } from '../../src/util/urlTitle';
import {
  brandValidationRules,
  physicalCountsPropertyValidation,
  productsPropertyValidation,
} from '../../src/validation/rules/brand.rules';
import {
  DENY_ALL_POPULATION_AUTHORIZATION,
  buildProduct,
  createBaseServicePersistenceDouble,
  createInMemoryBrandRepository,
  createManagedBrand,
  createPopulationAuthorizationDouble,
  createUrlTitleAvailabilityDouble,
  createValidatorHarness,
  physicalID,
  GENEROUS_URL_TITLE_PROBE_BUDGET,
  UNSTATED_URL_TITLE_PROBE_BUDGET,
} from '../support/inMemoryRepositories';

import type { BrandPropertyName } from '../../src/domain/product/Brand';
import type { BrandRepository } from '../../src/ports/repositories/BrandRepository';
import type { UniquePropertyPort } from '../../src/ports/UniquePropertyPort';
import type { BrandBaseService, ManagedBrand } from '../../src/services/BrandService';
import type { UniqueValueProbe, UrlTitleProbeBudget } from '../../src/util/urlTitle';
import type { ValidationContext } from '../../src/validation/Validator';
import type {
  BaseServicePersistenceDouble,
  BrandRepositoryCall,
  InMemoryBrandRepository,
  PopulationAuthorizationDouble,
  UniquePropertyValueSeed,
  UrlTitleAvailabilityCall,
  UrlTitleAvailabilityDouble,
  UrlTitleTableName,
  ValidatorHarness,
} from '../support/inMemoryRepositories';
import { BRAND_ENTITY_METADATA, Brand } from '../../src/domain/product/Brand';
import { manageEntity } from '../../src/domain/base/populate';
import { Product } from '../../src/domain/product/Product';
import { BRAND_ACCESS_MATRIX, createBrandHandler } from '../../src/handlers/brandHandler';
import type {
  BrandHandler,
  BrandHandlerService,
  BrandIdentifierEvent,
  BrandSaveEvent,
} from '../../src/handlers/brandHandler';
import type {
  AccountReference,
  EntityAuthorizationRequest,
  InvocationSecurityRequest,
  InvocationSecurityResolver,
  RequestAuthorizationContext,
} from '../../src/ports/AccountContextPort';
import type { TransactionalWriteRunner } from '../../src/config/container';
import { DomainError } from '../../src/errors/DomainError';
import {
  clearRequestAuthorizationResolver,
  registerRequestAuthorizationResolver,
  resolveRequestAuthorization,
} from '../../src/handlers/httpResponse';

/* Shared immutable bindings. */

/* Physically valid identifiers. */

/** The physical table the brand URL title must be unique on. */
const BRAND_TABLE = 'SwBrand' satisfies UrlTitleTableName;

/**
 * The legacy entity name every `Brand` uniqueness seed is keyed by — `entityname="SlatwallBrand"` at
 * `model/entity/Brand.cfc:L49`, which is what `Brand.getEntityName()` returns and therefore what
 * the entity-property uniqueness port compares against.
 */
const BRAND_ENTITY_NAME_FOR_SEEDS = 'SlatwallBrand';

/* Helpers — every one of them a pure function or a per-call factory. */

/** Narrows the table token the utility forwards, refusing anything that is not `SwBrand`. */
function requireBrandTable(tableName: string): UrlTitleTableName {
  if (tableName !== BRAND_TABLE) {
    throw new Error(
      `Expected the brand URL-title probe to receive the table token '${BRAND_TABLE}', ` +
        `as declared at model/service/BrandService.cfc:L70 and :L72, but it received ` +
        `'${tableName}'.`,
    );
  }

  return tableName;
}

/** Adapts the shared table-scoped probe double to the utility's injected-collaborator shape. */
function brandUrlTitleProbe(double: UrlTitleAvailabilityDouble): UniqueValueProbe {
  return (tableName: string, value: string): Promise<boolean> =>
    double.probe.isUrlTitleAvailable(requireBrandTable(tableName), value);
}

/** Seeds a list of already-held brand URL titles for the table-scoped probe double. */
function heldBrandTitles(values: readonly string[]): readonly UrlTitleAvailabilityCall[] {
  return values.map((value) => ({ tableName: BRAND_TABLE, value }));
}

/**
 * The candidate sequence the legacy algorithm probes for `base`, up to and including the `-count`
 * suffix.
 */
function candidateRun(base: string, suffixedCount: number): readonly string[] {
  const candidates: string[] = [base];

  for (let addon = 2; addon <= suffixedCount + 1; addon += 1) {
    candidates.push(`${base}-${String(addon)}`);
  }

  return candidates;
}

/** Every URL title the brand repository was asked to check, in order. */
function probedUrlTitles(calls: readonly BrandRepositoryCall[]): readonly string[] {
  return calls.flatMap((call) => (call.member === 'isUrlTitleAvailable' ? [call.urlTitle] : []));
}

/** Every brand handed to the repository's write member, in order and by reference. */
function persistedBrands(calls: readonly BrandRepositoryCall[]): readonly ManagedBrand[] {
  return calls.flatMap((call) => (call.member === 'saveBrand' ? [call.brand] : []));
}

/** Every brand handed to the repository's remove member, in order and by reference. */
function removedBrands(calls: readonly BrandRepositoryCall[]): readonly ManagedBrand[] {
  return calls.flatMap((call) => (call.member === 'deleteBrand' ? [call.brand] : []));
}

/** Every identifier the repository's read member was asked for, in order. */
function requestedBrandIDs(calls: readonly BrandRepositoryCall[]): readonly string[] {
  return calls.flatMap((call) => (call.member === 'getBrand' ? [call.brandID] : []));
}

/** How many times the repository's synchronous factory was invoked. */
function factoryCallCount(calls: readonly BrandRepositoryCall[]): number {
  return calls.filter((call) => call.member === 'newBrand').length;
}

/* Harness 1 — the real graph: real `validator`, real `baseService`, real ported rule set. */

/** Per-case seed configuration for {@link createBrandHarness}. */
interface BrandHarnessOptions {
  /**
   * URL titles the table-value probe reports as taken — the seam behind
   * `model/dao/DataDAO.cfc:L115-L131`, reached by the slug loop.
   */
  readonly takenUrlTitles?: readonly string[];
  /**
   * Rows the entity-property uniqueness port reports as holding a value — the seam behind
   * `org/Hibachi/HibachiDAO.cfc:L130-L146`, reached by the `unique` constraint of
   * `model/validation/Brand.json:L5`.
   */
  readonly uniqueValues?: readonly UniquePropertyValueSeed[];
  /**
   * What `updateAllSettingValuesToRemoveSpecificID` reports, per `model/service/HibachiService.cfc:L95`.
   */
  readonly settingValuesUpdated?: number;
  /** Brands already stored, so a read or a delete has something to find. */
  readonly storedBrands?: readonly ManagedBrand[];
  /** The probe ceiling this case states — see the probe-ceiling cases below. */
  readonly urlTitleProbeBudget?: UrlTitleProbeBudget;
}

/** The service under test plus every observation point the real graph offers. */
interface BrandHarness {
  readonly service: BrandService;
  readonly brands: InMemoryBrandRepository;
  readonly persistence: BaseServicePersistenceDouble<ManagedBrand>;
  readonly authorization: PopulationAuthorizationDouble;
  readonly validation: ValidatorHarness;
  /** Exposed so the two-argument positional delegation of `:L76` can be exercised directly. */
  readonly baseService: BaseService<ManagedBrand, BrandPropertyName>;
}

/** Wire a `brandService` over the real validation and base-service machinery. */
function createBrandHarness(options: BrandHarnessOptions = {}): BrandHarness {
  const brands = createInMemoryBrandRepository({
    ...(options.takenUrlTitles === undefined ? {} : { takenUrlTitles: options.takenUrlTitles }),
    ...(options.storedBrands === undefined ? {} : { brands: options.storedBrands }),
  });
  const validation = createValidatorHarness(options.uniqueValues ?? []);
  const authorization = createPopulationAuthorizationDouble();
  const persistence = createBaseServicePersistenceDouble<ManagedBrand>(
    options.settingValuesUpdated === undefined
      ? {}
      : { settingValuesUpdated: options.settingValuesUpdated },
  );

  const baseService = new BaseService<ManagedBrand, BrandPropertyName>({
    validator: validation.validator,
    ruleSet: brandValidationRules,
    propertyDescriptors: BRAND_PROPERTY_DESCRIPTORS,
    populationAuthorization: authorization.populationAuthorization,
    persist: brands.repository.saveBrand,
    remove: async (brand: ManagedBrand): Promise<void> => {
      await brands.repository.deleteBrand(brand);
    },
    settingCleanup: persistence.seams.settingCleanup,
    commentCleanup: persistence.seams.commentCleanup,
  });

  return {
    authorization,
    baseService,
    brands,
    persistence,
    service: new BrandService(
      brands.repository,
      baseService,
      options.urlTitleProbeBudget ?? GENEROUS_URL_TITLE_PROBE_BUDGET,
    ),
    validation,
  };
}

/* Harness 2 — pure delegation: a recording `brandBaseService`, no validation at all. */

/** One recorded delegation, capturing the arguments exactly as they arrived. */
interface RecordedSave {
  readonly brand: ManagedBrand;
  /** Captured by reference, so the identity of the caller's payload object is assertable. */
  readonly data: Record<string, unknown> | undefined;
  /** `undefined` here means the argument was omitted, which is what `:L76` does. */
  readonly context: ValidationContext | undefined;
}

/** Seed configuration for {@link createDelegationHarness}. */
interface DelegationHarnessOptions {
  readonly takenUrlTitles?: readonly string[];
  /** What the recording base collaborator reports for a delete. Defaults to `true`. */
  readonly deleteVerdict?: boolean;
}

/** The service under test plus the delegation log. */
interface DelegationHarness {
  readonly service: BrandService;
  readonly brands: InMemoryBrandRepository;
  readonly saves: readonly RecordedSave[];
  readonly deletes: readonly ManagedBrand[];
}

/** Wire a `brandService` over a recording base collaborator. */
function createDelegationHarness(options: DelegationHarnessOptions = {}): DelegationHarness {
  const brands = createInMemoryBrandRepository(
    options.takenUrlTitles === undefined ? {} : { takenUrlTitles: options.takenUrlTitles },
  );
  const saves: RecordedSave[] = [];
  const deletes: ManagedBrand[] = [];
  const deleteVerdict = options.deleteVerdict ?? true;

  const baseService: BrandBaseService = {
    save: (
      brand: ManagedBrand,
      data?: Record<string, unknown>,
      context?: ValidationContext,
    ): Promise<ManagedBrand> => {
      saves.push(Object.freeze({ brand, context, data }));
      return Promise.resolve(brand);
    },
    delete: (brand: ManagedBrand): Promise<boolean> => {
      deletes.push(brand);
      return Promise.resolve(deleteVerdict);
    },
  };

  return {
    brands,
    deletes,
    saves,
    service: new BrandService(brands.repository, baseService, GENEROUS_URL_TITLE_PROBE_BUDGET),
  };
}

/*
 * GROUP A — `createUniqueURLTitle`, the ported algorithm of `model/service/DataService.cfc:L53-L71`
 */

describe('createUniqueURLTitle — the slug pipeline, in the legacy order', () => {
  /**
   * Slug `input` against a probe that reports everything free, so only the transformation is under
   * test. A fresh double per call: no probe state is shared between assertions.
   */
  async function slug(input: string): Promise<string> {
    const probe = createUrlTitleAvailabilityDouble();
    return createUniqueURLTitle(
      input,
      BRAND_TABLE,
      brandUrlTitleProbe(probe),
      GENEROUS_URL_TITLE_PROBE_BUDGET,
    );
  }

  it('NET-NEW — model/service/DataService.cfc:L57-L58 — trims, lowercases, strips, THEN collapses spaces', async () => {
    /*
     * `:L57` nests the calls as `reReplace(lcase(trim(titleString)), "[^a-z0-9 \-]", "", "all")`, so
     * the trim is innermost and runs first, then the case fold, then the strip. Only afterwards does
     * `:L58` collapse `[ ]+` to a single hyphen. All four steps are visible in this one input:
     * Surrounding whitespace disappears, the capitals fold, the underscore and the exclamation mark
     * are discarded, and the interior space run becomes one hyphen.
     */
    await expect(slug('  My_Great Brand!  ')).resolves.toBe('mygreat-brand');
  });

  it('NET-NEW — model/service/DataService.cfc:L57-L58 — "A & B" becomes "a-b" because the ampersand goes before the collapse', async () => {
    /*
     * The order is observable here and nowhere else as sharply. Stripping `&` first leaves `'a b'`
     * — two spaces, the ampersand's former neighbours — and the single `[ ]+` run then collapses to
     * one hyphen. Collapsing first would instead give `'a-&-b'` and then `'a--b'`: a different URL
     * title, from the same input, with no error anywhere. That is why the sequence is reproduced
     * rather than tidied.
     */
    await expect(slug('A & B')).resolves.toBe('a-b');
  });

  it('NET-NEW — model/service/DataService.cfc:L58 — "a - b" becomes "a---b": only SPACES collapse, never hyphens', async () => {
    /*
     * The collapse class at `:L58` is exactly `[ ]+` — a single-space class. The hyphen is a member
     * of the retained set at `:L57` (`[^a-z0-9 \-]` keeps it), so an existing hyphen survives
     * untouched and each flanking single-space run contributes one more. Three hyphens: one for the
     * leading space run, the original, one for the trailing space run.
     */
    await expect(slug('a - b')).resolves.toBe('a---b');
  });

  it('NET-NEW — model/service/DataService.cfc:L57-L58 — a hyphen RUN survives and gains one per flanking space run', async () => {
    // four hyphens: the two already present plus one for each of the two collapsed space runs.
    await expect(slug('A -- B')).resolves.toBe('a----b');
  });

  it('NET-NEW — model/service/DataService.cfc:L57 — the trim runs BEFORE the strip, so a discarded edge character leaves its space behind', async () => {
    /*
     * `trim` removes whitespace from the original string; the strip then discards `!` and leaves the
     * space that was next to it, which collapses into a leading or trailing hyphen. The result is
     * neither re-trimmed nor stripped of edge hyphens, because the legacy does neither.
     */
    await expect(slug('! Foo')).resolves.toBe('-foo');
    await expect(slug('Foo !')).resolves.toBe('foo-');
  });

  it('NET-NEW — model/service/DataService.cfc:L57 — digits and existing hyphens pass through, and non-ASCII letters do not', async () => {
    /*
     * The retained class is exactly `[a-z0-9 \-]` after the lowercase fold, and `reReplace` carries
     * no `i` flag — `reReplaceNoCase` is not what `:L57` calls. So accented and non-Latin letters are
     * discarded rather than transliterated: no Unicode normalisation, no `é` to `e` mapping, nothing
     * the legacy did not do.
     */
    await expect(slug('Brand-99 Series 2')).resolves.toBe('brand-99-series-2');
    /*
     * `é` and `ω` are discarded outright. The interior space then survives the strip and collapses to
     * a trailing hyphen, because the strip ran after the trim and the legacy never re-trims — the same
     * mechanism as the `'Foo !'` case above, reached here through a different class of character.
     */
    await expect(slug('Café Ω')).resolves.toBe('caf-');
  });

  it('NET-NEW — model/service/DataService.cfc:L70 — an all-discarded title slugs to the EMPTY string and is returned as-is', async () => {
    /*
     * No error is raised, no placeholder is substituted and no identifier is generated in its place.
     * `urlTitle` being `required` at `model/validation/Brand.json:L5` means validation is what reports
     * the consequence — see the isolation case in Group C, which drives exactly this input through
     * the real rule set.
     */
    await expect(slug('!!!')).resolves.toBe('');
    await expect(slug('')).resolves.toBe('');
  });
});

describe('createUniqueURLTitle — the collision suffix sequence', () => {
  it('NET-NEW — model/service/DataService.cfc:L62 — no collision means ONE probe and NO suffix', async () => {
    const probe = createUrlTitleAvailabilityDouble();

    await expect(
      createUniqueURLTitle(
        'My Brand',
        BRAND_TABLE,
        brandUrlTitleProbe(probe),
        GENEROUS_URL_TITLE_PROBE_BUDGET,
      ),
    ).resolves.toBe('my-brand');

    /*
     * `:L62` probes once before the loop and `:L64` then finds `unique` already true, so the bare
     * candidate comes back unsuffixed. This is why the algorithm is not a `do…while`.
     */
    expect(probe.calls.map((call) => call.value)).toEqual(['my-brand']);
  });

  it('NET-NEW — model/service/DataService.cfc:L55,L65-L66 — the FIRST collision suffix is -2, and -1 is never proposed', async () => {
    const probe = createUrlTitleAvailabilityDouble(heldBrandTitles(['my-brand']));

    await expect(
      createUniqueURLTitle(
        'My Brand',
        BRAND_TABLE,
        brandUrlTitleProbe(probe),
        GENEROUS_URL_TITLE_PROBE_BUDGET,
      ),
    ).resolves.toBe('my-brand-2');

    /*
     * `var addon = 1` at `:L55`, then `addon++` at `:L65` runs before the suffix is interpolated at
     * `:L66`. The counter is therefore pre-incremented and `-1` is unreachable for every possible
     * input. This is observable output, not an off-by-one awaiting repair: initialising to 2,
     * post-incrementing, or starting at 0 would each change the titles the system produces.
     */
    expect(probe.calls.map((call) => call.value)).toEqual(['my-brand', 'my-brand-2']);
    expect(probe.calls.map((call) => call.value)).not.toContain('my-brand-1');
  });

  it('NET-NEW — model/service/DataService.cfc:L64-L67 — the second collision gives -3, and the run has no gaps', async () => {
    const probe = createUrlTitleAvailabilityDouble(heldBrandTitles(['my-brand', 'my-brand-2']));

    await expect(
      createUniqueURLTitle(
        'My Brand',
        BRAND_TABLE,
        brandUrlTitleProbe(probe),
        GENEROUS_URL_TITLE_PROBE_BUDGET,
      ),
    ).resolves.toBe('my-brand-3');

    expect(probe.calls.map((call) => call.value)).toEqual(candidateRun('my-brand', 2));
  });

  it('NET-NEW — model/service/DataService.cfc:L64-L67 — probe count and suffix stay in lockstep: N collisions cost N+1 probes and yield suffix N+1', async () => {
    /*
     * The invariant across the whole loop, checked at four widths rather than one so an off-by-one in
     * either direction — a probe skipped, a suffix advanced twice — cannot hide behind a single
     * sample. `0` is the no-collision boundary: no titles held, one probe, no suffix.
     */
    for (const collisions of [0, 1, 2, 7]) {
      const held = candidateRun('x', collisions).slice(0, collisions);
      const probe = createUrlTitleAvailabilityDouble(heldBrandTitles(held));

      const resolved = await createUniqueURLTitle(
        'X',
        BRAND_TABLE,
        brandUrlTitleProbe(probe),
        GENEROUS_URL_TITLE_PROBE_BUDGET,
      );

      expect(held).toHaveLength(collisions);
      expect(probe.calls).toHaveLength(collisions + 1);
      expect(resolved).toBe(collisions === 0 ? 'x' : `x-${String(collisions + 1)}`);
    }
  });

  it('NET-NEW — model/dao/DataDAO.cfc:L126-L130 — the probe polarity is true=available, false=collision', async () => {
    /*
     * The highest-risk semantic in the whole derivation, and it is silent when wrong. `:l126-l127`
     * returns `false` when the record count is non-zero — the value is taken — and `:L130` returns
     * `true` only when nothing holds it. Inverting the two produces no compile error and no type
     * error; it produces either duplicate `urlTitle` values reaching a `unique="true"` column, or a
     * loop that never terminates.
     */
    const probe = createUrlTitleAvailabilityDouble(heldBrandTitles(['taken']));

    await expect(probe.probe.isUrlTitleAvailable(BRAND_TABLE, 'taken')).resolves.toBe(false);
    await expect(probe.probe.isUrlTitleAvailable(BRAND_TABLE, 'free')).resolves.toBe(true);
    await expect(
      createUniqueURLTitle(
        'Taken',
        BRAND_TABLE,
        brandUrlTitleProbe(probe),
        GENEROUS_URL_TITLE_PROBE_BUDGET,
      ),
    ).resolves.toBe('taken-2');
  });

  it('NET-NEW — model/service/BrandService.cfc:L70,L72 — the probe receives the byte-exact table token SwBrand', async () => {
    /*
     * `tableName="SwBrand"` is passed explicitly at both legacy call sites, and it matches
     * `table="SwBrand"` on `model/entity/Brand.cfc:L49`. Two independent mechanisms pin it here:
     * {@link BRAND_TABLE} is written with `satisfies UrlTitleTableName`, so the literal is checked at
     * compile time against the union the support file derives from the real `PhysicalTableName`
     * whitelist; and {@link requireBrandTable} refuses any other token at run time, so a drift in
     * what the utility forwards fails loudly rather than passing quietly.
     */
    const probe = createUrlTitleAvailabilityDouble(heldBrandTitles(['acme']));

    await createUniqueURLTitle(
      'ACME',
      BRAND_TABLE,
      brandUrlTitleProbe(probe),
      GENEROUS_URL_TITLE_PROBE_BUDGET,
    );

    expect(probe.calls).toEqual([
      { tableName: 'SwBrand', value: 'acme' },
      { tableName: 'SwBrand', value: 'acme-2' },
    ]);
    for (const call of probe.calls) {
      expect(call.tableName).toBe('SwBrand');
    }
  });

  it('NET-NEW UNWIRED — model/service/DataService.cfc:L64 — the loop is UNBOUNDED: one round trip per iteration, no ceiling, no fabricated fallback', async () => {
    /*
     * TODO(parity) `model/service/DataService.cfc:L64` — `while(!unique)` carries no ceiling, so a
     * value that keeps colliding keeps issuing probes indefinitely. The exposure is real and it is
     * carried over rather than repaired: AAP §0.8.2 Guideline 4 forbids enhancing business logic
     * beyond what the migration requires, and IR-9 admits exactly one hardening exception — D18, the
     * importer's SQL parameterisation — which is not this. An attempt budget would therefore be a
     * behavioural change, not a fix, so none exists.
     */
    const collisions = 500;
    const probe = createUrlTitleAvailabilityDouble(
      heldBrandTitles(candidateRun('my-brand', collisions - 1)),
    );

    await expect(
      createUniqueURLTitle(
        'My Brand',
        BRAND_TABLE,
        brandUrlTitleProbe(probe),
        GENEROUS_URL_TITLE_PROBE_BUDGET,
      ),
    ).resolves.toBe('my-brand-501');

    // 501 round trips: the bare candidate plus `-2` through `-501`. One per iteration, no batching.
    expect(probe.calls).toHaveLength(collisions + 1);
    expect(probe.calls.map((call) => call.value)).toEqual(candidateRun('my-brand', collisions));
  });

  it('NET-NEW — model/service/DataService.cfc:L60,L66 — the suffix is appended to the SLUG, not to the raw title, and the empty slug is no exception', async () => {
    /*
     * `:L60` captures `returnTitle = urlTitle` — the already-slugged value — and `:L66` interpolates
     * `"#urlTitle#-#addon#"` from that same slugged base, never from `arguments.titleString`. So a
     * collision re-suffixes the slug and cannot smuggle stripped characters back in.
     */
    const slugged = createUrlTitleAvailabilityDouble(heldBrandTitles(['my-brand']));
    await expect(
      createUniqueURLTitle(
        '  My Brand!  ',
        BRAND_TABLE,
        brandUrlTitleProbe(slugged),
        GENEROUS_URL_TITLE_PROBE_BUDGET,
      ),
    ).resolves.toBe('my-brand-2');
    // The suffix hangs off `my-brand`, so the discarded `!` and the trimmed padding cannot reappear.
    expect(slugged.calls.map((call) => call.value)).toEqual(['my-brand', 'my-brand-2']);

    const empty = createUrlTitleAvailabilityDouble(heldBrandTitles(['']));
    await expect(
      createUniqueURLTitle(
        '!!!',
        BRAND_TABLE,
        brandUrlTitleProbe(empty),
        GENEROUS_URL_TITLE_PROBE_BUDGET,
      ),
    ).resolves.toBe('-2');
  });
});

/* The probe ceiling is required, not optional: the port never invents one. */

describe('saveBrand — the probe ceiling, which the operator states and the port never invents', () => {
  it('[NET-NEW] refuses a derivation that would outrun the stated ceiling, fabricating no title', async () => {
    /*
     * The refusal, at the smallest ceiling that still admits the no-collision case. `takeUrlTitle` seeds a
     * two-link collision chain, so the derivation needs three probes — `acme-widgets`, `acme-widgets-2`,
     * `acme-widgets-3` — and a ceiling of 2 stops it on the third.
     */
    const harness = createBrandHarness({
      urlTitleProbeBudget: createUrlTitleProbeBudget(2),
    });
    harness.brands.takeUrlTitle('acme-widgets');
    harness.brands.takeUrlTitle('acme-widgets-2');

    const brand = harness.service.newBrand();
    const data: Record<string, unknown> = { brandName: 'ACME Widgets' };

    await expect(harness.service.saveBrand(brand, data)).rejects.toThrow(
      /more than the 2 uniqueness probes/,
    );
    expect(brand.urlTitle).toBeUndefined();
    expect(data).not.toHaveProperty('urlTitle');

    /*
     * Exactly the two the operator permitted were issued — the ceiling stops the third before it is sent,
     * so the refusal costs no extra round trip.
     */
    expect(probedUrlTitles(harness.brands.calls)).toEqual(['acme-widgets', 'acme-widgets-2']);
  });

  it('[NET-NEW] admits a derivation that lands exactly AT the ceiling, with the legacy suffix', async () => {
    /*
     * The boundary is inclusive on the admitting side, and the admitted title is the legacy's own. One
     * collision, two probes, ceiling of 2 — and `acme-widgets-2` rather than `acme-widgets-1`, because
     * `DataService.cfc:L65` pre-increments. Off-by-one in the ceiling would fail here rather than silently
     * refusing one derivation in every chain length.
     */
    const harness = createBrandHarness({
      urlTitleProbeBudget: createUrlTitleProbeBudget(2),
    });
    harness.brands.takeUrlTitle('acme-widgets');

    const brand = harness.service.newBrand();
    await harness.service.saveBrand(brand, { brandName: 'ACME Widgets' });

    expect(brand.urlTitle).toBe('acme-widgets-2');
    expect(probedUrlTitles(harness.brands.calls)).toEqual(['acme-widgets', 'acme-widgets-2']);
  });

  it('[NET-NEW] counts the PRE-LOOP probe, so a ceiling of ONE admits exactly the no-collision case', async () => {
    /*
     * `model/service/DataService.cfc:L62` probes once before `L64`'s loop. A ceiling that counted only the
     * loop's probes would permit one more read than it claims, and a ceiling of 1 would then admit a
     * one-link collision chain instead of none at all. Both halves are asserted against the same ceiling.
     */
    const free = createBrandHarness({ urlTitleProbeBudget: createUrlTitleProbeBudget(1) });
    const admitted = free.service.newBrand();
    await free.service.saveBrand(admitted, { brandName: 'ACME Widgets' });
    expect(admitted.urlTitle).toBe('acme-widgets');
    expect(probedUrlTitles(free.brands.calls)).toEqual(['acme-widgets']);

    const collided = createBrandHarness({ urlTitleProbeBudget: createUrlTitleProbeBudget(1) });
    collided.brands.takeUrlTitle('acme-widgets');
    await expect(
      collided.service.saveBrand(collided.service.newBrand(), { brandName: 'ACME Widgets' }),
    ).rejects.toThrow(/more than the 1 uniqueness probes/);
  });

  it('[NET-NEW] spends the budget PER DERIVATION, not per service, so a graph does not degrade (M7)', async () => {
    /*
     * The counter's lifetime, which is the M7 half. `src/util/urlTitle.ts` declares `probesIssued` inside
     * the function, so two saves through one service each get the whole ceiling. A counter hoisted to the
     * budget object or to the service would make the second save refuse at a ceiling the first exhausted —
     * a slow-burn availability defect no single-save case would catch.
     */
    const harness = createBrandHarness({
      urlTitleProbeBudget: createUrlTitleProbeBudget(2),
    });
    harness.brands.takeUrlTitle('acme-widgets');
    harness.brands.takeUrlTitle('globex-tools');

    const first = harness.service.newBrand();
    await harness.service.saveBrand(first, { brandName: 'ACME Widgets' });
    expect(first.urlTitle).toBe('acme-widgets-2');

    const second = harness.service.newBrand();
    await harness.service.saveBrand(second, { brandName: 'Globex Tools' });
    expect(second.urlTitle).toBe('globex-tools-2');
  });

  it('[NET-NEW] refuses BEFORE the first probe when the operator stated no ceiling, naming the variable', async () => {
    /*
     * The fail-closed half, and the one that answers the "an optional bound is enough" position of step 1
     * in the block above. A composition root that states nothing does not get an unbounded loop; it gets a
     * `ConfigurationError` that names `CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION`.
     */
    const harness = createBrandHarness({
      urlTitleProbeBudget: UNSTATED_URL_TITLE_PROBE_BUDGET,
    });

    await expect(
      harness.service.saveBrand(harness.service.newBrand(), { brandName: 'ACME Widgets' }),
    ).rejects.toThrow(/CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION/);

    /*
     * `probedUrlTitles` rather than the whole call log, because `newBrand()` is itself a recorded
     * repository call and the property under test is that no probe was issued.
     */
    expect(probedUrlTitles(harness.brands.calls)).toEqual([]);
  });

  it('[NET-NEW] refuses a USELESS figure when the budget is BUILT, not when a derivation first runs', () => {
    /*
     * A wiring error should present at wiring time. Zero would refuse every derivation — including one
     * whose first candidate is free — rather than bounding a collision chain, and a fraction or a negative
     * bounds nothing at all. `createUrlTitleProbeBudget` refuses all of them where they are stated.
     */
    expect(() => createUrlTitleProbeBudget(0)).toThrow(/positive safe integer/);
    expect(() => createUrlTitleProbeBudget(-1)).toThrow(/positive safe integer/);
    expect(() => createUrlTitleProbeBudget(2.5)).toThrow(/positive safe integer/);
    expect(() => createUrlTitleProbeBudget(Number.NaN)).toThrow(/positive safe integer/);
    expect(() => createUrlTitleProbeBudget(Number.POSITIVE_INFINITY)).toThrow(
      /positive safe integer/,
    );

    // And a legitimate figure builds, so the guard is not simply refusing everything.
    expect(createUrlTitleProbeBudget(1).resolveMaximumProbes()).toBe(1);
  });
});

describe('saveBrand — the L68 derivation guard', () => {
  it('NET-NEW — model/service/BrandService.cfc:L68-L72 — derives a title when the entity has none AND the payload supplies none', async () => {
    /*
     * The both-missing case, which is the only one that derives. A fresh `Brand` leaves `urlTitle`
     * `undefined` — `src/domain/product/Brand.ts` declares it optional, standing in for the legacy
     * `isNull(getURLTitle())` — and the payload carries only a name.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand();
    const data: Record<string, unknown> = { brandName: 'ACME Widgets' };

    await harness.service.saveBrand(brand, data);

    expect(data.urlTitle).toBe('acme-widgets');
    expect(probedUrlTitles(harness.brands.calls)).toEqual(['acme-widgets']);
  });

  it('NET-NEW — model/service/BrandService.cfc:L68 — an entity that ALREADY has a title short-circuits the guard: no probe, value untouched', async () => {
    /*
     * `isNull(getURLTitle()) || !len(getURLTitle())` is the first half of the `and`, so a non-empty
     * entity title alone suppresses the derivation. The pre-existing value is not re-slugged, not
     * re-checked for uniqueness and not copied into the payload — the legacy touches none of those.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand({ brandName: 'ACME Widgets', urlTitle: 'legacy-slug' });
    const data: Record<string, unknown> = { brandName: 'Something Else Entirely' };

    await harness.service.saveBrand(brand, data);

    expect(brand.urlTitle).toBe('legacy-slug');
    expect(data).not.toHaveProperty('urlTitle');
    expect(harness.brands.calls).toEqual([]);
  });

  it('NET-NEW — model/service/BrandService.cfc:L68 — a payload that SUPPLIES a title short-circuits the guard, and the supplied value survives verbatim', async () => {
    /*
     * `!structKeyExists(arguments.data, "urlTitle") || !len(arguments.data.urlTitle)` is the second
     * half. An incoming title is passed through exactly as given — not slugged, not lowercased, not
     * uniqued — because the legacy only ever writes `data.urlTitle` inside the guard it has already
     * skipped. The value below is deliberately one the slug pipeline would mangle, so a stray
     * re-derivation could not pass this case.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand({ brandName: 'ACME Widgets' });
    const data: Record<string, unknown> = { brandName: 'ACME Widgets', urlTitle: 'Caller_Chosen!' };

    await harness.service.saveBrand(brand, data);

    expect(data.urlTitle).toBe('Caller_Chosen!');
    expect(harness.brands.calls).toEqual([]);
  });

  it('NET-NEW — model/service/BrandService.cfc:L68 — both halves supplied is still a short-circuit, and neither value moves', async () => {
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand({ brandName: 'ACME Widgets', urlTitle: 'entity-slug' });
    const data: Record<string, unknown> = { urlTitle: 'payload-slug' };

    await harness.service.saveBrand(brand, data);

    // Neither side wins, because the legacy never reconciles them: each stays where it was.
    expect(brand.urlTitle).toBe('entity-slug');
    expect(data.urlTitle).toBe('payload-slug');
    expect(harness.brands.calls).toEqual([]);
  });

  it('NET-NEW — model/service/BrandService.cfc:L68 — EMPTY counts as missing on both halves, so an empty pair still derives', async () => {
    /*
     * `len()` is the operative test on both halves, not `structKeyExists` alone and not a null check
     * alone. An entity title of `''` and a present payload key whose value is `''` are therefore both
     * "missing", and the derivation runs. This is the case a `!== undefined` or a bare
     * `structKeyExists` translation would get wrong, silently, by skipping the derivation and leaving
     * an empty `urlTitle` to fail `model/validation/Brand.json:L5` instead.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand({ brandName: 'ACME Widgets', urlTitle: '' });
    const data: Record<string, unknown> = { urlTitle: '' };

    await harness.service.saveBrand(brand, data);

    expect(data.urlTitle).toBe('acme-widgets');
    expect(probedUrlTitles(harness.brands.calls)).toEqual(['acme-widgets']);
  });

  it('NET-NEW — model/service/BrandService.cfc:L68 — a whitespace-only title is NOT empty, so it short-circuits', async () => {
    /*
     * `len(" ")` is 1. CFML's `len` does not trim, and neither does the port — the trim in the slug
     * pipeline belongs to `model/service/DataService.cfc:L57` and runs only once a derivation has
     * already been decided upon. So a single space suppresses the derivation and is handed on as-is.
     * Adding a trim to this guard would be a repair, not a translation.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand({ brandName: 'ACME Widgets' });
    const data: Record<string, unknown> = { urlTitle: ' ' };

    await harness.service.saveBrand(brand, data);

    expect(data.urlTitle).toBe(' ');
    expect(harness.brands.calls).toEqual([]);
  });
});

describe('saveBrand — which name source the derivation reads', () => {
  it('NET-NEW — model/service/BrandService.cfc:L69-L72 — the PAYLOAD name wins when both sources are present', async () => {
    /*
     * `:L69` tests the payload first and `:L71` is its `else if`, so the entity's own name is read
     * only when the payload has nothing usable. Both sources are populated here with different
     * values, which is the only arrangement that distinguishes the two arms.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand({ brandName: 'Entity Name' });
    const data: Record<string, unknown> = { brandName: 'Payload Name' };

    await harness.service.saveBrand(brand, data);

    expect(data.urlTitle).toBe('payload-name');
    expect(probedUrlTitles(harness.brands.calls)).toEqual(['payload-name']);
  });

  it('NET-NEW — model/service/BrandService.cfc:L71-L72 — an ABSENT payload name falls through to the entity name', async () => {
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand({ brandName: 'Entity Name' });
    const data: Record<string, unknown> = {};

    await harness.service.saveBrand(brand, data);

    expect(data.urlTitle).toBe('entity-name');
    expect(probedUrlTitles(harness.brands.calls)).toEqual(['entity-name']);
  });

  it('NET-NEW — model/service/BrandService.cfc:L69,L71 — an EMPTY payload name also falls through, because :L69 tests len() and not just existence', async () => {
    /*
     * `structKeyExists(arguments.data, "brandName") && len(arguments.data.brandName)` — the key is
     * present, its length is zero, so the `and` fails and control reaches the `else if`. A
     * key-existence-only translation would enter the first arm, hand `''` to the slug pipeline and
     * derive `''`, which is a different stored value.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand({ brandName: 'Entity Name' });
    const data: Record<string, unknown> = { brandName: '' };

    await harness.service.saveBrand(brand, data);

    expect(data.urlTitle).toBe('entity-name');
    expect(probedUrlTitles(harness.brands.calls)).toEqual(['entity-name']);
  });

  it('NET-NEW — model/service/BrandService.cfc:L73 — with BOTH name sources unusable, NO urlTitle key is added at all', async () => {
    /*
     * The fall-through the `if` / `else if` pair leaves open, and it is not an error path. `:L73`
     * closes the inner `else if` with no trailing `else`, so when the payload name is empty and the
     * entity name is null or empty, the guard body simply does nothing. No key is written, no probe is
     * issued and no exception is raised here — the consequence surfaces one layer up, in validation,
     * because `model/validation/Brand.json:L5` marks `urlTitle` required. Group C drives that
     * consequence through the real rule set.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand();
    const data: Record<string, unknown> = { brandName: '' };

    await harness.service.saveBrand(brand, data);

    expect(data).not.toHaveProperty('urlTitle');
    expect(harness.brands.calls).toEqual([]);
    // Still delegated: `:L76` is outside the guard and runs on every path.
    expect(harness.saves).toHaveLength(1);
  });

  it('NET-NEW — model/service/BrandService.cfc:L70 — the collision suffix reaches the payload, so the derivation is the real loop and not a one-shot slug', async () => {
    /*
     * `takenUrlTitles` seeds the repository's availability answer, so this case also proves the probe
     * the service constructs is wired to `BrandRepository.isUrlTitleAvailable` and not to some
     * always-free default. Two round trips, `-2` on the payload.
     */
    const harness = createDelegationHarness({ takenUrlTitles: ['acme-widgets'] });
    const { brand } = createManagedBrand();
    const data: Record<string, unknown> = { brandName: 'ACME Widgets' };

    await harness.service.saveBrand(brand, data);

    expect(data.urlTitle).toBe('acme-widgets-2');
    expect(probedUrlTitles(harness.brands.calls)).toEqual(['acme-widgets', 'acme-widgets-2']);
  });
});

describe('saveBrand — how a NON-STRING payload value is read, which is where CFML len() diverges', () => {
  /*
   * Why this block EXISTS at all. `model/service/BrandService.cfc:L68` and `:L69` both test payload
   * entries with CFML's `len()`, and CFML's payload struct is untyped: a form or API post can put a
   * number, a boolean, a date, an array or a struct under `brandName` or `urlTitle`. The landed port
   * reproduces `len()` over each of those shapes rather than assuming a string, so every shape is a
   * real branch of the two guards and each gets a case.
   */

  it('NET-NEW — model/service/BrandService.cfc:L69-L70 — a NUMERIC payload name is rendered as CFML would render it into a string parameter', async () => {
    /*
     * `len(12345)` is 5 in CFML, because the number is rendered to a string first; the same value then
     * reaches `createUniqueURLTitle`'s `required string titleString` parameter at
     * `model/service/DataService.cfc:L53` through the identical coercion. Digits survive the strip, so
     * the slug is the digits themselves.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand({ brandName: 'Entity Name' });
    const data: Record<string, unknown> = { brandName: 12345 };

    await harness.service.saveBrand(brand, data);

    expect(data.urlTitle).toBe('12345');
    // The payload arm was taken, so the entity's own name was never consulted.
    expect(probedUrlTitles(harness.brands.calls)).toEqual(['12345']);
  });

  it('NET-NEW — model/service/BrandService.cfc:L69-L70 — a BOOLEAN payload name is rendered too, and its rendered length is what the guard measures', async () => {
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand({ brandName: 'Entity Name' });
    const data: Record<string, unknown> = { brandName: true };

    await harness.service.saveBrand(brand, data);

    // `len(true)` is 4 — the length of the rendering, not of a cast to `1`.
    expect(data.urlTitle).toBe('true');
    expect(probedUrlTitles(harness.brands.calls)).toEqual(['true']);
  });

  it('NET-NEW — model/service/BrandService.cfc:L70 — TODO(parity): a DATE payload name renders through toISOString(), not through a CFML date mask', async () => {
    /*
     * TODO(parity) — `src/services/BrandService.ts` carries this one as a flagged annotation and it is
     * asserted here in the same spirit. CFML would render a date-valued payload entry with the
     * engine'S own date-time mask; the port renders it with `toISOString()`. The two differ in format
     * for this single pathological input, no in-scope caller supplies one, and choosing a mask would
     * mean inventing a format the source never states (AAP §0.7.3).
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand();
    const data: Record<string, unknown> = { brandName: new Date('2024-01-15T00:00:00.000Z') };

    await harness.service.saveBrand(brand, data);

    // '2024-01-15T00:00:00.000Z' lowercased, with ':' and '.' stripped and no space run to collapse.
    expect(data.urlTitle).toBe('2024-01-15t000000000z');
  });

  it('NET-NEW — model/service/BrandService.cfc:L69-L73 — a NON-SIMPLE payload name with a non-zero len() enters the FIRST arm and the :L71 else-if is never reached', async () => {
    /*
     * The subtlest branch in the member, and the reason the landed code nests its second check
     * instead of folding it into the first condition.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand({ brandName: 'Entity Name' });
    const data: Record<string, unknown> = { brandName: ['first', 'second'] };

    await harness.service.saveBrand(brand, data);

    expect(data).not.toHaveProperty('urlTitle');
    expect(harness.brands.calls).toEqual([]);
    // The entity name was usable and was still not used — that is the whole point of the case.
    expect(brand.brandName).toBe('Entity Name');
    expect(brand.urlTitle).toBeUndefined();
    // Delegation still happens, because `:L76` sits outside the guard.
    expect(harness.saves).toHaveLength(1);
  });

  it('NET-NEW — model/service/BrandService.cfc:L69,L71 — an EMPTY non-simple payload name has len() zero, so control DOES reach the entity name', async () => {
    /*
     * The other side of the same measurement: an empty array and an empty struct both count zero
     * members, `:L69` fails, and the `else if` at `:L71` runs normally. Together with the previous case
     * this pins that the guard measures the COUNT rather than merely testing complexity.
     */
    const emptyArray = createDelegationHarness();
    const arrayBrand = createManagedBrand({ brandName: 'Entity Name' }).brand;
    await emptyArray.service.saveBrand(arrayBrand, { brandName: [] });
    expect(probedUrlTitles(emptyArray.brands.calls)).toEqual(['entity-name']);

    const emptyStruct = createDelegationHarness();
    const structBrand = createManagedBrand({ brandName: 'Entity Name' }).brand;
    await emptyStruct.service.saveBrand(structBrand, { brandName: {} });
    expect(probedUrlTitles(emptyStruct.brands.calls)).toEqual(['entity-name']);
  });

  it('NET-NEW — model/service/BrandService.cfc:L69 — a NULL or explicitly-undefined payload name measures zero, and control reaches the entity name', async () => {
    /*
     * `null` is deliberately distinguished from an object here: it is the CFML null-equivalent, so it
     * measures zero rather than counting keys, and a key that is present with an undefined value
     * measures zero as well — matching `structKeyExists` being true while `len()` is not.
     */
    const nullName = createDelegationHarness();
    const nullBrand = createManagedBrand({ brandName: 'Entity Name' }).brand;
    await nullName.service.saveBrand(nullBrand, { brandName: null });
    expect(probedUrlTitles(nullName.brands.calls)).toEqual(['entity-name']);

    const undefinedName = createDelegationHarness();
    const undefinedBrand = createManagedBrand({ brandName: 'Entity Name' }).brand;
    const presentButUndefined: Record<string, unknown> = { brandName: undefined };
    expect(Object.prototype.hasOwnProperty.call(presentButUndefined, 'brandName')).toBe(true);
    await undefinedName.service.saveBrand(undefinedBrand, presentButUndefined);
    expect(probedUrlTitles(undefinedName.brands.calls)).toEqual(['entity-name']);
  });

  it('NET-NEW — model/service/BrandService.cfc:L68 — a NON-STRING payload urlTitle with a non-zero len() short-circuits the guard and is handed on untouched', async () => {
    /*
     * The same measurement applied to the other half of `:L68`. `len(42)` is 2, so the payload counts
     * as supplying a title, no derivation runs, and the numeric value is passed to `super.save()`
     * exactly as received — population, not this member, decides what to do with it.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand({ brandName: 'Entity Name' });
    const data: Record<string, unknown> = { brandName: 'Entity Name', urlTitle: 42 };

    await harness.service.saveBrand(brand, data);

    expect(data.urlTitle).toBe(42);
    expect(harness.brands.calls).toEqual([]);
    expect(harness.saves[0]?.data).toBe(data);
  });
});

describe('saveBrand — the by-reference payload write and the delegation at L76', () => {
  it('NET-NEW — model/service/BrandService.cfc:L70,L72 — the derived title is written onto the SAME payload object the caller passed', async () => {
    /*
     * `data.urlTitle = …` at `:L70` and `:L72` is unscoped CFML. It resolves through the scope
     * search order to `arguments.data`, because a local named `data` was never `var`-declared in this
     * function, so the assignment mutates the caller'S struct rather than a local copy. It is easy to
     * read as a local write and it is not one: the caller observes the derived title after the call
     * returns, and `:L76` passes that same mutated struct on to `super.save()`.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand();
    const data: Record<string, unknown> = { brandName: 'ACME Widgets' };

    await harness.service.saveBrand(brand, data);

    const [recorded] = harness.saves;

    expect(harness.saves).toHaveLength(1);
    expect(recorded?.data).toBe(data);
    expect(data.urlTitle).toBe('acme-widgets');
  });

  it('NET-NEW — model/service/BrandService.cfc:L70,L76 — the write happens BEFORE the delegation, so the base collaborator already sees the derived title', async () => {
    /*
     * Ordering matters and is not incidental: the derived title has to be present in the payload by
     * the time population runs, or `urlTitle` would never be set on the entity and
     * `model/validation/Brand.json:L5` would refuse every generated brand. The recording collaborator
     * snapshots the payload's `urlTitle` at the instant it is called, so a write moved after the
     * delegation — or an `await` misplaced so the derivation resolves later — fails here.
     */
    const harness = createDelegationHarness({ takenUrlTitles: ['acme-widgets'] });
    const { brand } = createManagedBrand();
    const data: Record<string, unknown> = { brandName: 'ACME Widgets' };

    await harness.service.saveBrand(brand, data);

    expect(harness.saves[0]?.data?.urlTitle).toBe('acme-widgets-2');
  });

  it('NET-NEW — model/service/BrandService.cfc:L70 — no key OTHER than urlTitle is added, removed or rewritten', async () => {
    /*
     * The legacy touches exactly one key. Everything the caller supplied — including keys that mean
     * nothing to `Brand` — arrives at `super.save()` untouched, because population, not this member,
     * is what decides which keys are honoured.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand();
    const data: Record<string, unknown> = {
      activeFlag: true,
      brandName: 'ACME Widgets',
      brandWebsite: 'https://example.test/acme',
      somethingUnknown: 'left alone',
    };

    await harness.service.saveBrand(brand, data);

    expect(Object.keys(data).sort()).toEqual([
      'activeFlag',
      'brandName',
      'brandWebsite',
      'somethingUnknown',
      'urlTitle',
    ]);
    expect(data.brandName).toBe('ACME Widgets');
    expect(data.brandWebsite).toBe('https://example.test/acme');
    expect(data.somethingUnknown).toBe('left alone');
    expect(data.activeFlag).toBe(true);
  });

  it('NET-NEW — model/service/BrandService.cfc:L76 — the delegation is POSITIONAL: (brand, data), with the context argument OMITTED', async () => {
    /*
     * `return super.save(arguments.brand, arguments.data)` passes two ordered arguments and no third.
     * `org/Hibachi/HibachiService.cfc:L253` records that the framework's dispatch supports ordered
     * arguments only — named arguments are not supported — so argument ORDER is part of the contract
     * and not a formatting choice.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand();
    const data: Record<string, unknown> = { brandName: 'ACME Widgets' };

    await harness.service.saveBrand(brand, data);

    expect(harness.saves).toEqual([{ brand, context: undefined, data }]);
    expect(harness.saves[0]?.brand).toBe(brand);
    expect(harness.saves[0]?.context).toBeUndefined();
  });

  it('NET-NEW — model/service/BrandService.cfc:L76 — the member RETURNS what the base collaborator returns, by reference', async () => {
    /*
     * `return super.save(...)` — the value is passed straight back, with no post-processing and no
     * re-read from the repository. `model/service/HibachiService.cfc:L103` returns `arguments.entity`,
     * so the identity that comes back is the identity that went in.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand();

    const returned = await harness.service.saveBrand(brand, { brandName: 'ACME Widgets' });

    expect(returned).toBe(brand);
  });

  it('NET-NEW — model/service/BrandService.cfc:L76 — the repository write member is NOT called directly: persistence is the base collaborator’s business', async () => {
    /*
     * A scope assertion, and a meaningful one. `BrandRepository` exposes a `saveBrand` member, and
     * calling it here would look harmless while bypassing validation entirely — the legacy routes
     * every brand write through `super.save()` so the rule set of `model/validation/Brand.json` gets
     * its say. With the recording collaborator in place nothing may reach the repository except the
     * URL-title probe.
     */
    const harness = createDelegationHarness();
    const { brand } = createManagedBrand();

    await harness.service.saveBrand(brand, { brandName: 'ACME Widgets' });

    expect(persistedBrands(harness.brands.calls)).toEqual([]);
    expect(harness.brands.calls.every((call) => call.member === 'isUrlTitleAvailable')).toBe(true);
  });
});

/*
 * GROUP C — `saveBrand` through the real graph: the ported rule set, the real `Validator`, the real
 * `BaseService`
 * `model/validation/Brand.json`, `model/service/HibachiService.cfc:L86-L104`
 */

describe('saveBrand — the real validation path', () => {
  it('NET-NEW — model/validation/Brand.json:L3,L5 — a derivable name yields a save that PASSES and persists exactly once', async () => {
    /*
     * The baseline the refusal cases are measured against. `brandName` satisfies `:L3`, the derived
     * `urlTitle` satisfies both constraints of `:L5`, and `brandWebsite` is absent — which `:L4`
     * permits, because a `dataType` check passes on an absent value
     * (`org/Hibachi/HibachiValidationService.cfc:L483`).
     */
    const harness = createBrandHarness();
    const { brand } = createManagedBrand();

    const saved = await harness.service.saveBrand(brand, { brandName: 'ACME Widgets' });

    expect(saved).toBe(brand);
    expect(brand.brandName).toBe('ACME Widgets');
    expect(brand.urlTitle).toBe('acme-widgets');
    // The derived title reached the entity through population, not through a direct field write.
    expect(harness.authorization.calls.map((call) => call.propertyName).sort()).toEqual([
      'brandName',
      'urlTitle',
    ]);
    expect(persistedBrands(harness.brands.calls)).toEqual([brand]);
    expect(harness.brands.brands).toEqual([brand]);
  });

  it('NET-NEW — model/validation/Brand.json:L5 — AAP-OMITTED PATH: a name that slugs to nothing leaves urlTitle unset, and urlTitle.required fails ALONE', async () => {
    /* The path the aap's own narrative steps over, isolated so the consequence is unambiguous. */
    const harness = createBrandHarness();
    const { brand } = createManagedBrand();
    const data: Record<string, unknown> = { brandName: '!!!' };

    const saved = await harness.service.saveBrand(brand, data);

    // The derivation ran and produced the empty slug, which is what reached the payload.
    expect(data.urlTitle).toBe('');
    expect(probedUrlTitles(harness.brands.calls)).toEqual(['']);
    // Population cleared it, so the entity carries no title at all.
    expect(brand.urlTitle).toBeUndefined();
    expect(brand.brandName).toBe('!!!');

    // The member resolves with the caller's own entity, and the finding rides on its bag —
    // `model/service/HibachiService.cfc:L103` returns on every path, failed validation included.
    expect(saved).toBe(brand);
    expect(saved.hasErrors()).toBe(true);
    expect(saved.getErrors()).toEqual({
      urlTitle: ['validate.save.Brand.urlTitle.required'],
    });

    expect(persistedBrands(harness.brands.calls)).toEqual([]);
    expect(harness.brands.brands).toEqual([]);
  });

  it('NET-NEW — model/service/BrandService.cfc:L73 + model/validation/Brand.json:L3,L5 — the true fall-through fails BOTH required rules, and that is reported rather than smoothed over', async () => {
    /*
     * A finding, not a test fixture. The `:L73` fall-through is reachable only when neither name
     * source is usable — and `model/validation/Brand.json:L3` makes `brandName` required in the very
     * same context. So the branch that produces no `urlTitle` can never be the only thing wrong: a
     * brand that reaches it fails `brandName.required` as well, always.
     */
    const harness = createBrandHarness();
    const { brand } = createManagedBrand();
    const data: Record<string, unknown> = {};

    const saved = await harness.service.saveBrand(brand, data);

    expect(data).not.toHaveProperty('urlTitle');
    expect(harness.brands.calls).toEqual([]);

    expect(saved).toBe(brand);
    expect(saved.hasErrors()).toBe(true);
    expect(saved.getErrors()).toEqual({
      brandName: ['validate.save.Brand.brandName.required'],
      urlTitle: ['validate.save.Brand.urlTitle.required'],
    });
    expect(persistedBrands(harness.brands.calls)).toEqual([]);
  });

  it('NET-NEW — model/validation/Brand.json:L5 — the TABLE-VALUE seam and the ENTITY-PROPERTY seam are different checks, and are left free to disagree', async () => {
    /*
     * Two uniqueness mechanisms, deliberately not harmonised. They are different legacy members
     * with different arguments and different call sites:
     *
     * * `model/dao/DataDAO.cfc:L115-L131` — `verifyUniqueTableValue(tableName, column, value)`.
     * Table-and-column scoped, no self-exclusion, reached only by the slug loop at
     * `model/service/DataService.cfc:L62` and `:L67`.
     * * `org/Hibachi/HibachiDAO.cfc:L130-L146` — `isUniqueProperty(propertyName, entity)`. entity
     * scoped, with the `e.<idProperty> != :entityID` self-exclusion, reached only by the `unique`
     * constraint of `model/validation/Brand.json:L5`.
     */
    const harness = createBrandHarness({
      uniqueValues: [
        {
          entityID: physicalID('incumbent-brand-id'),
          entityName: BRAND_ENTITY_NAME_FOR_SEEDS,
          propertyName: 'urlTitle',
          value: 'acme-widgets',
        },
      ],
    });
    const { brand } = createManagedBrand();

    const saved = await harness.service.saveBrand(brand, { brandName: 'ACME Widgets' });

    // One table-value probe, and it said "free" — no suffix was ever considered.
    expect(probedUrlTitles(harness.brands.calls)).toEqual(['acme-widgets']);
    expect(brand.urlTitle).toBe('acme-widgets');

    // The entity-property seam is a different member, asked with a different argument shape.
    const entityUniqueness: UniquePropertyPort = harness.validation.uniqueProperty.uniqueProperty;
    await expect(entityUniqueness.isUniqueProperty('urlTitle', brand)).resolves.toBe(false);

    expect(saved).toBe(brand);
    expect(saved.hasErrors()).toBe(true);
    expect(saved.getErrors()).toEqual({
      urlTitle: ['validate.save.Brand.urlTitle.unique'],
    });
    expect(persistedBrands(harness.brands.calls)).toEqual([]);
  });

  it('NET-NEW — org/Hibachi/HibachiDAO.cfc:L143 — the uniqueness check EXCLUDES the row being saved, so a brand keeps its own title on re-save', async () => {
    /*
     * `and e.#entityIDproperty# != :entityID` at `:L143`. Without it every update of an existing brand
     * would collide with itself and no brand could ever be saved twice. The incumbent row seeded here
     * holds the same value under the same identifier as the entity, which is the only arrangement the
     * self-exclusion clause distinguishes.
     */
    const harness = createBrandHarness();
    const { brand } = createManagedBrand({
      brandID: physicalID('brand-1'),
      urlTitle: 'acme-widgets',
    });
    harness.validation.uniqueProperty.take({
      entityID: physicalID('brand-1'),
      entityName: BRAND_ENTITY_NAME_FOR_SEEDS,
      propertyName: 'urlTitle',
      value: 'acme-widgets',
    });

    const saved = await harness.service.saveBrand(brand, { brandName: 'ACME Widgets Renamed' });

    expect(saved).toBe(brand);
    // The guard at `:L68` short-circuited, so the existing title is intact and unprobed.
    expect(brand.urlTitle).toBe('acme-widgets');
    expect(probedUrlTitles(harness.brands.calls)).toEqual([]);
    expect(persistedBrands(harness.brands.calls)).toEqual([brand]);
  });

  it('NET-NEW — model/validation/Brand.json:L4 — brandWebsite is an OPTIONAL url check: absent passes, malformed fails, well-formed passes', async () => {
    /*
     * `[{"contexts":"save","dataType":"url"}]` declares a format rule and nothing else — no
     * `required`, and no length ceiling anywhere in the document. Three inputs, one per branch:
     *
     * Not to be conflated with `hb_formatType="url"` at `model/entity/Brand.cfc:L57`. that
     * attribute is a display hint consumed by the admin rendering layer, which is out of scope; it is
     * not read by validation and carries no constraint. The live rule is the JSON one, and no maximum
     * length is derived from either, because neither declares one.
     */
    const absent = createBrandHarness();
    const absentBrand = createManagedBrand().brand;
    const savedAbsent = await absent.service.saveBrand(absentBrand, { brandName: 'No Website' });

    expect(savedAbsent).toBe(absentBrand);
    expect(savedAbsent.hasErrors()).toBe(false);
    expect(persistedBrands(absent.brands.calls)).toEqual([absentBrand]);

    const malformed = createBrandHarness();
    const malformedBrand = createManagedBrand().brand;
    const savedMalformed = await malformed.service.saveBrand(malformedBrand, {
      brandName: 'Bad Website',
      brandWebsite: 'not a url at all',
    });

    expect(savedMalformed).toBe(malformedBrand);
    expect(savedMalformed.hasErrors()).toBe(true);
    expect(savedMalformed.getErrors()).toEqual({
      brandWebsite: ['validate.save.Brand.brandWebsite.dataType.url'],
    });
    expect(persistedBrands(malformed.brands.calls)).toEqual([]);

    const wellFormed = createBrandHarness();
    const wellFormedBrand = createManagedBrand().brand;
    const savedWellFormed = await wellFormed.service.saveBrand(wellFormedBrand, {
      brandName: 'Good Website',
      brandWebsite: 'https://example.test/acme',
    });

    expect(savedWellFormed).toBe(wellFormedBrand);
    expect(savedWellFormed.hasErrors()).toBe(false);
    expect(persistedBrands(wellFormed.brands.calls)).toEqual([wellFormedBrand]);
  });
});

describe('saveBrand — the issue_1690_2 contract, kept whole rather than adapted to', () => {
  it('NET-NEW — meta/tests/unit/IssuesTest.cfc:L203-L206 — a validation failure is a KEYED, RECOVERABLE bag: nothing persisted, findings intact, entity reference alive', async () => {
    /*
     * Net-new, and the title says what it is not. There is no legacy `brandService` test of any
     * kind, and no brand variant of `issue_1690_2`: `meta/tests/unit/IssuesTest.cfc:L204` is
     * `newEntity("product")`. that locator belongs to `test/regression/issues.test.ts`, where the
     * product behaviour it exercises is asserted as `resolves`; citing it here would offer parity
     * evidence for the opposite contract, since this case asserts a raise.
     */
    const harness = createBrandHarness();
    const { brand } = createManagedBrand();

    // 1 — it resolves. No `.catch`, no `.rejects`: a rejection here fails the case outright.
    const saved = await harness.service.saveBrand(brand, {
      brandWebsite: 'https://example.test/acme',
    });

    // 2 — the resolved value is the caller's own entity.
    expect(saved).toBe(brand);

    // 3 — the findings, keyed and intact, on the entity's own bag.
    expect(saved.hasErrors()).toBe(true);
    expect(saved.hasError('brandName')).toBe(true);
    expect(saved.getError('brandName')).toEqual(['validate.save.Brand.brandName.required']);
    expect(saved.getError('urlTitle')).toEqual(['validate.save.Brand.urlTitle.required']);
    // The well-formed website was accepted, so its key is absent — findings are per-property.
    expect(saved.hasError('brandWebsite')).toBe(false);
    expect(Object.keys(saved.getErrors()).sort()).toEqual(['brandName', 'urlTitle']);

    // 4 — nothing persisted: no repository write call, and the store is still empty.
    expect(persistedBrands(harness.brands.calls)).toEqual([]);
    expect(harness.brands.brands).toEqual([]);

    // 5 — the caller's reference carries what population managed to write.
    expect(brand.brandWebsite).toBe('https://example.test/acme');
    expect(brand.brandName).toBeUndefined();
  });

  it('NET-NEW — src/validation/Validator.ts — the Validator NEVER persists: a dry run touches no write seam at all', async () => {
    /*
     * `Validator.validate` returns a bag and mutates nothing outside it — no write, no flush, no
     * repository call of any kind. Asserted by running the real rule set through the harness's
     * dry-run mode over a subject that would fail, and then observing that every write seam is
     * untouched. That separation is what lets `BaseService` gate persistence on the bag rather than
     * having to undo a write.
     */
    const harness = createBrandHarness();
    const { brand } = createManagedBrand();

    const errors = await harness.validation.validateDryRun(brand, brandValidationRules, 'save');

    expect(errors.hasErrors()).toBe(true);
    expect(Object.keys(errors.getErrors()).sort()).toEqual(['brandName', 'urlTitle']);
    expect(harness.brands.calls).toEqual([]);
    expect(harness.brands.brands).toEqual([]);
    expect(harness.persistence.settingCleanups).toEqual([]);
    expect(harness.persistence.commentCleanups).toEqual([]);
    // A dry run leaves the subject alone: no bag is attached to the entity.
    expect(brand.hasErrors()).toBe(false);
  });

  it('NET-NEW — model/service/HibachiService.cfc:L86 — the OMITTED third argument is what selects the "save" context, and the omitted second a fresh empty payload', async () => {
    /*
     * `save(required any entity, struct data={}, string context="save")` declares both defaults, and
     * `model/service/BrandService.cfc:L76` passes only two arguments, so the context default is what
     * `saveBrand` relies on. This case exercises the defaults at the boundary that owns them — the
     * base service — because `saveBrand` always forwards its own explicit payload and so can never
     * exercise the `data={}` default itself. No overload is fabricated on `saveBrand` to reach it.
     */
    const harness = createBrandHarness();
    const { brand } = createManagedBrand();

    const saved = await harness.baseService.save(brand);

    expect(harness.authorization.calls).toEqual([]);
    expect(saved).toBe(brand);
    expect(saved.hasErrors()).toBe(true);
    expect(saved.getErrors()).toEqual({
      brandName: ['validate.save.Brand.brandName.required'],
      urlTitle: ['validate.save.Brand.urlTitle.required'],
    });
    for (const messages of Object.values(saved.getErrors())) {
      for (const message of messages) {
        expect(message.startsWith('validate.save.Brand.')).toBe(true);
      }
    }
    expect(persistedBrands(harness.brands.calls)).toEqual([]);
  });
});

/*
 * GROUP D — `newBrand()`, the first of the three members that existed only as runtime synthesis
 * `org/Hibachi/HibachiService.cfc:L255-L265`, `:L544-L549`; AAP §0.4.2.5, IR-1.
 */

describe('newBrand — the explicitly declared factory', () => {
  it('NET-NEW — org/Hibachi/HibachiService.cfc:L264,L544-L549 — the member is DECLARED and SYNCHRONOUS, and forwards to the repository factory', async () => {
    /*
     * Synchronous, and that is a contract detail rather than an implementation choice: the legacy
     * `new` prefix constructs a transient CFC and hands it straight back — no query, no await, nothing
     * to resolve. `../ports/repositories/BrandRepository` declares `newBrand(): ManagedEntity<Brand>`
     * for the same reason, and a `Promise`-returning port would have forced every call site in the
     * legacy suite's shape to become asynchronous for no behavioural reason.
     */
    const harness = createBrandHarness();

    const brand = harness.service.newBrand();

    expect(brand).not.toBeInstanceOf(Promise);
    expect(factoryCallCount(harness.brands.calls)).toBe(1);
    expect(harness.brands.calls).toEqual([{ member: 'newBrand' }]);
    // Awaiting it is harmless and yields the same object, which is what "not a promise" means here.
    await expect(Promise.resolve(brand)).resolves.toBe(brand);
  });

  it('NET-NEW — model/entity/Brand.cfc:L49,L52 — the product is a real managed Brand, carrying the entity contract and the unsaved-value sentinel', async () => {
    /*
     * A factory that returned a bare object literal would satisfy the signature and then fail the
     * moment validation asked for metadata. The four members below are exactly the ones the ported
     * rule set and the uniqueness port consult, so they are asserted rather than assumed:
     * `getClassName()` keys every validation message, `getEntityName()` keys every uniqueness seed,
     * `getPrimaryIDPropertyName()` and `getPrimaryIDValue()` supply the self-exclusion clause of
     * `org/Hibachi/HibachiDAO.cfc:L143`.
     */
    const harness = createBrandHarness();

    const brand = harness.service.newBrand();

    expect(brand.getClassName()).toBe('Brand');
    expect(brand.getEntityName()).toBe(BRAND_ENTITY_NAME_FOR_SEEDS);
    expect(brand.getPrimaryIDPropertyName()).toBe('brandID');
    expect(brand.getPrimaryIDValue()).toBe('');
    expect(brand.isNew()).toBe(true);
    expect(brand.hasErrors()).toBe(false);

    // IR-6, observed end to end: the sentinel is replaced by a 32-character dash-free identifier.
    await harness.service.saveBrand(brand, { brandName: 'ACME Widgets' });
    expect(brand.isNew()).toBe(false);
    expect(brand.brandID).toMatch(/^[0-9a-f]{32}$/);
  });

  it('NET-NEW — meta/tests/unit/entity/BrandTest.cfc:L58-L60 — TRACEABLE DEFAULT: getProducts() is an EMPTY ARRAY, not undefined and not shared', () => {
    /*
     * The one thread in this file with a legacy counterpart, and it is an entity assertion reached
     * through this service member. `meta/tests/unit/entity/BrandTest.cfc` obtains its subject at `:L55`
     * with `request.slatwallScope.getService("brandService").newBrand()`, and then overrides the
     * inherited defaults assertion at `:L58-L60` with `assertEquals(variables.entity.getProducts(),
     * [])`. AAP §0.6.5.1 records it as "the overridden defaults assertion plus three inherited".
     */
    const harness = createBrandHarness();

    const brand = harness.service.newBrand();

    expect(Array.isArray(brand.getProducts())).toBe(true);
    expect(brand.getProducts()).toEqual([]);
    expect(brand.getProducts()).toHaveLength(0);
  });

  it('NET-NEW — org/Hibachi/HibachiService.cfc:L544-L549 — each call yields a FRESH instance with independent mutable state', () => {
    /*
     * The legacy `new` prefix constructs a new transient on every call; a memoised or module-scope
     * instance would be a different thing entirely, and under M7 (AAP §0.6.6) it would also leak
     * across invocations on a warm Lambda container. The collections are the sharp case: `products` is
     * the entity's own live array — `getProducts()` returns it by reference so
     * `Product.setBrand` can push into it — so two instances sharing one array would be invisible
     * until the first relationship was written.
     */
    const harness = createBrandHarness();

    const first = harness.service.newBrand();
    const second = harness.service.newBrand();

    expect(first).not.toBe(second);
    expect(first.getProducts()).not.toBe(second.getProducts());
    expect(factoryCallCount(harness.brands.calls)).toBe(2);

    first.brandName = 'First Brand';
    first.getProducts().push(buildProduct({ productID: physicalID('product-1') }));

    expect(second.brandName).toBeUndefined();
    expect(second.getProducts()).toEqual([]);
    expect(first.getProducts()).toHaveLength(1);
  });

  it('NET-NEW — org/Hibachi/HibachiService.cfc:L255-L281 — the factory neither validates nor persists: a brand-new instance touches no write seam', async () => {
    /*
     * `onMissingNewMethod` constructs and returns; it does not save. So a fresh brand — which would
     * fail `model/validation/Brand.json:L3` and `:L5` on both required rules — can be created without
     * any complaint at all, and only reaches validation when someone saves it. Asserted by creating
     * one and then observing that every write seam and the whole store are untouched.
     */
    const harness = createBrandHarness();

    const brand = harness.service.newBrand();

    expect(harness.brands.brands).toEqual([]);
    expect(persistedBrands(harness.brands.calls)).toEqual([]);
    expect(removedBrands(harness.brands.calls)).toEqual([]);
    // And it is genuinely invalid, which is why not validating here is observable behaviour.
    const errors = await harness.validation.validateDryRun(brand, brandValidationRules, 'save');
    expect(Object.keys(errors.getErrors()).sort()).toEqual(['brandName', 'urlTitle']);
  });
});

/*
 * GROUP E — `getBrand(brandID)`
 * `org/Hibachi/HibachiService.cfc:L258`; AAP §0.4.2.5, IR-1.
 */

describe('getBrand — the explicitly declared read', () => {
  it('NET-NEW — org/Hibachi/HibachiService.cfc:L258 — the identifier is forwarded to the repository EXACTLY as received', async () => {
    /*
     * `onMissingMethod`'s `get` prefix passes the first ordered argument straight through — `:L253`
     * records that ordered arguments are the only supported form — so the port must not trim, case-fold
     * or otherwise normalise it. Three deliberately awkward identifiers, forwarded byte for byte, in
     * call order.
     */
    const harness = createBrandHarness();

    await harness.service.getBrand('444df2f7ea9c87e60051f3cd87b435a1');
    await harness.service.getBrand('  Padded-ID  ');
    await harness.service.getBrand('');

    expect(requestedBrandIDs(harness.brands.calls)).toEqual([
      '444df2f7ea9c87e60051f3cd87b435a1',
      '  Padded-ID  ',
      '',
    ]);
  });

  it('NET-NEW — org/Hibachi/HibachiService.cfc:L258 — a HIT resolves the stored entity by reference, unmodified', async () => {
    /*
     * By reference, not by value: the services pass entities around by identity, and the uniqueness
     * self-exclusion of `org/Hibachi/HibachiDAO.cfc:L143` depends on the retrieved instance carrying
     * the same identifier the caller will save under. A copy would break both.
     */
    const stored = createManagedBrand({
      brandID: physicalID('brand-1'),
      brandName: 'ACME Widgets',
      urlTitle: 'acme-widgets',
    }).brand;
    const harness = createBrandHarness({ storedBrands: [stored] });

    const found = await harness.service.getBrand(physicalID('brand-1'));

    expect(found).toBe(stored);
    expect(found?.brandName).toBe('ACME Widgets');
    expect(found?.urlTitle).toBe('acme-widgets');
    expect(requestedBrandIDs(harness.brands.calls)).toEqual([physicalID('brand-1')]);
  });

  it('NET-NEW — org/Hibachi/HibachiService.cfc:L258 — a MISS resolves null, and fabricates nothing to fill the gap', async () => {
    /*
     * The three things a miss must not do, each asserted. `../ports/repositories/BrandRepository`
     * declares `Promise<ManagedEntity<Brand> | null>`, so the miss is a value and the caller decides:
     *
     * 1. It does not raise. The legacy `get` prefix returns whatever the DAO found, and a missing row
     * is an ordinary answer rather than an error condition.
     * 2. It does not fall back to the factory. The legacy framework's entity-get path has a
     * new-instance fallback, and `src/services/BrandService.ts` records that `getBrand` here does
     * not reproduce it: a caller wanting a fresh instance calls `newBrand()` explicitly. So a miss
     * leaves the factory call count at zero.
     */
    const stored = createManagedBrand({ brandID: physicalID('brand-1') }).brand;
    const harness = createBrandHarness({ storedBrands: [stored] });

    /*
     * The miss is probed with a physically valid identifier, not a readable
     * sentinel. The distinction matters precisely here: `physicalID('no-such-brand')` is a well-formed
     * IR-6 key that simply is not present, so a miss can only be the store's answer. A malformed
     * sentinel such as the literal `'no-such-brand'` would leave the case unable to distinguish "not
     * found" from "rejected, ignored or silently normalised because the key was the wrong shape", which
     * is the one thing the assertions below are trying to establish.
     */
    const found = await harness.service.getBrand(physicalID('no-such-brand'));

    expect(found).toBeNull();
    expect(found).not.toBeUndefined();
    expect(factoryCallCount(harness.brands.calls)).toBe(0);
    expect(persistedBrands(harness.brands.calls)).toEqual([]);
    expect(harness.brands.calls).toEqual([
      { brandID: physicalID('no-such-brand'), member: 'getBrand' },
    ]);
    // The store is untouched by a miss.
    expect(harness.brands.brands).toEqual([stored]);
  });

  it('NET-NEW — org/Hibachi/HibachiService.cfc:L258 — repeated reads are not memoised, so each call issues its own round trip (M7)', async () => {
    /*
     * M7 (AAP §0.6.6): the legacy relied on a `cacheuse="transactional"` second-level cache and on
     * lazy per-instance caches in entity `variables` scope, and nothing of that kind survives between
     * Lambda invocations except module-scope state. Memoising a read here would be worse than useless
     * — on a warm container it would serve one tenant's brand to the next request. Two identical reads
     * therefore produce two recorded calls.
     */
    const stored = createManagedBrand({ brandID: physicalID('brand-1') }).brand;
    const harness = createBrandHarness({ storedBrands: [stored] });

    const first = await harness.service.getBrand(physicalID('brand-1'));
    const second = await harness.service.getBrand(physicalID('brand-1'));

    expect(first).toBe(stored);
    expect(second).toBe(stored);
    expect(requestedBrandIDs(harness.brands.calls)).toEqual([
      physicalID('brand-1'),
      physicalID('brand-1'),
    ]);
  });
});

/*
 * GROUP F — `deleteBrand(brand)`
 * `model/validation/Brand.json:L6-L7`, `model/service/HibachiService.cfc:L68-L84`;
 * AAP §0.4.2.5, IR-1.
 */

describe('deleteBrand — the delete guards', () => {
  it('NET-NEW — model/validation/Brand.json:L6 — a brand with PRODUCTS is refused: false returned, nothing removed, no cleanup run', async () => {
    /*
     * `"products": [{"contexts":"delete","maxCollection":0}]` — a ceiling of zero on the collection,
     * so any product at all blocks the delete. This is the live half of the document's two delete
     * guards, and it is the reason `model/entity/Brand.cfc:L61` can declare its one-to-many with no
     * cascade: the application refuses the delete rather than orphaning or cascading rows.
     */
    const brand = createManagedBrand({
      brandID: physicalID('brand-1'),
      urlTitle: 'acme-widgets',
    }).brand;
    brand.addProduct(buildProduct({ productID: physicalID('product-1'), productName: 'Widget' }));
    const harness = createBrandHarness({ storedBrands: [brand] });

    const removed = await harness.service.deleteBrand(brand);

    expect(brand.getProducts()).toHaveLength(1);
    expect(removed).toBe(false);
    // Nothing was removed: no repository call, and the row is still in the store.
    expect(removedBrands(harness.brands.calls)).toEqual([]);
    expect(harness.brands.brands).toEqual([brand]);
    // And the two cleanup steps sit inside the `if(deleteOK)` gate at `:L73`, so neither ran.
    expect(harness.persistence.settingCleanups).toEqual([]);
    expect(harness.persistence.commentCleanups).toEqual([]);
  });

  it('NET-NEW — model/validation/Brand.json:L6 — an EMPTY products collection permits the delete, and the row really goes', async () => {
    /*
     * `maxCollection: 0` passes for a collection of length zero — and, per
     * `org/Hibachi/HibachiValidationService.cfc:L311`, also for an absent value, which is exactly why
     * the ported rule reads the array rather than a possibly-absent property. A brand from
     * `newBrand()` satisfies it by the traceable `products === []` default of Group D.
     */
    const brand = createManagedBrand({
      brandID: physicalID('brand-1'),
      urlTitle: 'acme-widgets',
    }).brand;
    const harness = createBrandHarness({ storedBrands: [brand] });

    const removed = await harness.service.deleteBrand(brand);

    expect(removed).toBe(true);
    expect(removedBrands(harness.brands.calls)).toEqual([brand]);
    expect(harness.brands.brands).toEqual([]);
  });

  it('NET-NEW — model/service/HibachiService.cfc:L73-L81 — the two cleanup steps run ONLY after a successful delete, and only then', async () => {
    /*
     * The local override's whole contribution over the framework base is this gate:
     *
     * If(deleteOK) {
     * getService("settingService").removeAllEntityRelatedSettings( entity=arguments.entity ); // :L76
     * getService("commentService").removeAllEntityRelatedComments( entity=arguments.entity ); // :L79
     * }.
     */
    const brand = createManagedBrand({
      brandID: physicalID('brand-1'),
      urlTitle: 'acme-widgets',
    }).brand;
    const harness = createBrandHarness({ storedBrands: [brand] });

    await expect(harness.service.deleteBrand(brand)).resolves.toBe(true);

    /*
     * Both ports receive `entity=arguments.entity` — the same instance, by reference, exactly as `:L76`
     * and `:L79` pass it. Identity is asserted rather than structural equality, because a copy would
     * carry the right class name and identifier while being the wrong object.
     */
    expect(harness.persistence.settingCleanups).toHaveLength(1);
    expect(harness.persistence.settingCleanups[0]).toBe(brand);
    expect(harness.persistence.commentCleanups).toHaveLength(1);
    expect(harness.persistence.commentCleanups[0]).toBe(brand);
    // And the ref members the ports actually read resolve to the brand's own metadata.
    expect(harness.persistence.settingCleanups[0]?.getClassName()).toBe('Brand');
    expect(harness.persistence.settingCleanups[0]?.getPrimaryIDValue()).toBe(physicalID('brand-1'));
  });

  it('NET-NEW — model/validation/Brand.json:L7 + model/entity/Brand.cfc:L71 — the physicalCounts guard is INERT, and is preserved unrenamed', async () => {
    /*
     * A validation-document defect, carried rather than corrected. `model/validation/Brand.json:L7`
     * declares its second delete guard against `physicalCounts`:
     *
     * "physicalCounts": [{"contexts":"delete","maxCollection":0}]
     */
    const brand = createManagedBrand({ brandID: physicalID('brand-1') }).brand;
    brand.addProduct(buildProduct({ productID: physicalID('product-1') }));
    const harness = createBrandHarness({ storedBrands: [brand] });

    // 1 — the identifier is preserved byte for byte, and the rule is in the live set.
    expect(physicalCountsPropertyValidation.propertyIdentifier).toBe('physicalCounts');
    expect(productsPropertyValidation.propertyIdentifier).toBe('products');
    expect(brandValidationRules.properties).toContain(physicalCountsPropertyValidation);
    expect(brandValidationRules.properties).toContain(productsPropertyValidation);
    /*
     * Its reader answers absent — and takes no subject at all, which is a stronger statement of
     * inertness than returning `undefined` from a subject it was handed: there is no argument through
     * which a future edit could accidentally make it read something. Compare
     * `productsPropertyValidation.read`, which genuinely reads its subject.
     */
    expect(physicalCountsPropertyValidation.read()).toBeUndefined();
    expect(productsPropertyValidation.read(brand)).toEqual(brand.getProducts());

    /*
     * 2 — the subject does not carry `physicalCounts`, which is what triggers the `:L171` skip. Note
     * which fact does the silencing: the brand does carry `physicals`, so the relationship is present
     * and the rule misses it purely on the name. That is the whole defect — a typo in a configuration
     * document, not an absent relationship — and it is why renaming the rule would activate a guard
     * that has never run rather than merely tidying a dead entry. `activeFlag` is asserted alongside
     * as the control: `hasProperty` really does answer true for a declared property, so the false.
     */
    expect(brand.hasProperty('physicalCounts')).toBe(false);
    expect(brand.hasProperty('physicals')).toBe(true);
    expect(brand.hasProperty('activeFlag')).toBe(true);

    // 3 — the guard never fires, on the very run where every delete rule is evaluated.
    const errors = await harness.validation.validateDryRun(brand, brandValidationRules, 'delete');
    expect(errors.getErrors()).toEqual({
      products: ['validate.delete.Brand.products.maxCollection'],
    });
    expect(errors.hasError('physicalCounts')).toBe(false);
    await expect(harness.service.deleteBrand(brand)).resolves.toBe(false);
  });

  it('NET-NEW — model/validation/Brand.json:L3-L5 — the SAVE-context rules do not run on a delete, so an unnamed brand is still deletable', async () => {
    /*
     * Context selection is the mechanism that keeps one rule set serving both members. `:L3`, `:L4` and
     * `:L5` all declare `"contexts":"save"`, and `src/validation/Validator.ts` reproduces the legacy
     * context gate at `org/Hibachi/HibachiValidationService.cfc:L71`, so none of them is evaluated
     * under `delete`. A brand that could never be saved is therefore perfectly deletable — which is
     * the behaviour the legacy has, and is not obviously right until you notice that a row already in
     * the database may predate a rule.
     */
    const brand = createManagedBrand({ brandID: physicalID('brand-1') }).brand;
    const harness = createBrandHarness({ storedBrands: [brand] });

    expect(brand.brandName).toBeUndefined();
    expect(brand.urlTitle).toBeUndefined();

    await expect(harness.service.deleteBrand(brand)).resolves.toBe(true);
    expect(removedBrands(harness.brands.calls)).toEqual([brand]);
  });

  it('NET-NEW — model/service/HibachiService.cfc:L86 — deleteBrand does NOT go through the save path: no populate, no persist, no save-context findings', async () => {
    /*
     * A scope assertion. The delete path validates under `delete`, removes, and cleans up; it never
     * populates and never persists. Zero authorisation requests is the sharpest evidence for the
     * first, because `populate` consults the authorisation port once per payload key it intends to
     * write and the delete path supplies no payload at all.
     */
    const brand = createManagedBrand({ brandID: physicalID('brand-1') }).brand;
    const harness = createBrandHarness({ storedBrands: [brand] });

    await expect(harness.service.deleteBrand(brand)).resolves.toBe(true);

    expect(harness.authorization.calls).toEqual([]);
    expect(persistedBrands(harness.brands.calls)).toEqual([]);
    expect(brand.hasErrors()).toBe(false);
    expect(brand.getErrors()).toEqual({});
  });
});

describe('the inactive-entity settings sweep of the local save override', () => {
  /*
   * TODO(parity) — `model/service/HibachiService.cfc:L93,L95`. The local `save()` override
   * declares `var settingsRemoved = 0;` at `:L93` and then declares `var settingsRemoved` a second
   * time, inside the `if` at `:L95`, in the same function scope. CFML has no block scope: both
   * declarations name one function-scoped variable, so the inner assignment is visible to the
   * `settingsRemoved gt 0` test at `:L98` and the duplicate `var` is inert.
   */

  it('NET-NEW — model/service/HibachiService.cfc:L91,L94-L96 — an INACTIVE brand that saved cleanly has its setting values scrubbed by primary ID', async () => {
    /*
     * The two-part gate at `:L91` — no errors and the entity declares `activeFlag` — then `:L94`'s
     * `if(!getActiveFlag())`. `Brand` declares `activeFlag` at `model/entity/Brand.cfc:L59`, so both
     * arms are live for this entity, and the identifier passed at `:L95` is `getPrimaryIDValue()`
     * exactly.
     */
    const harness = createBrandHarness({ settingValuesUpdated: 3 });
    const { brand } = createManagedBrand({ brandID: physicalID('brand-1') });

    await harness.service.saveBrand(brand, { activeFlag: false, brandName: 'ACME Widgets' });

    expect(brand.activeFlag).toBe(false);
    expect(harness.persistence.settingValueScrubs).toEqual([physicalID('brand-1')]);
    /*
     * `:L98` — `settingsRemoved gt 0` is the first arm of the disjunction and the only one that can
     * ever match for a brand: the second arm lists Currency, FulfillmentMethod, OrderOrigin,
     * PaymentTerm and PaymentMethod, every one of them an excluded entity. A non-zero count therefore
     * reaching the gate is precisely the data flow the duplicate `var` could have broken.
     */
    expect(harness.persistence.settingsCacheClears()).toBe(1);
  });

  it('NET-NEW — model/service/HibachiService.cfc:L98 — a ZERO scrub count leaves the settings cache alone, because Brand is not one of the five listed classes', async () => {
    const harness = createBrandHarness();
    const { brand } = createManagedBrand({ brandID: physicalID('brand-1') });

    await harness.service.saveBrand(brand, { activeFlag: false, brandName: 'ACME Widgets' });

    expect(harness.persistence.settingValueScrubs).toEqual([physicalID('brand-1')]);
    expect(harness.persistence.settingsCacheClears()).toBe(0);
  });

  it('NET-NEW — model/service/HibachiService.cfc:L94 — an ACTIVE brand skips the sweep entirely', async () => {
    const harness = createBrandHarness({ settingValuesUpdated: 3 });
    const { brand } = createManagedBrand({ brandID: physicalID('brand-1') });

    await harness.service.saveBrand(brand, { activeFlag: true, brandName: 'ACME Widgets' });

    expect(brand.activeFlag).toBe(true);
    expect(harness.persistence.settingValueScrubs).toEqual([]);
    expect(harness.persistence.settingsCacheClears()).toBe(0);
  });

  it('NET-NEW — model/service/HibachiService.cfc:L91 — a save that FAILED validation runs no sweep, whatever the activeFlag says', async () => {
    /*
     * The first arm of the `:L91` gate. The payload sets `activeFlag` false, which would otherwise
     * trigger the sweep, but validation refuses the save — so the post-processing block is skipped
     * along with the persist. Nothing half-applies.
     */
    const harness = createBrandHarness({ settingValuesUpdated: 3 });
    const { brand } = createManagedBrand({ brandID: physicalID('brand-1') });

    const saved = await harness.service.saveBrand(brand, { activeFlag: false });

    expect(saved).toBe(brand);
    expect(saved.hasErrors()).toBe(true);

    expect(persistedBrands(harness.brands.calls)).toEqual([]);
    expect(harness.persistence.settingValueScrubs).toEqual([]);
    expect(harness.persistence.settingsCacheClears()).toBe(0);
  });
});

/*
 * GROUP G — M7 isolation and the declared surface
 * AAP §0.6.6 M7; IR-1 / TR-3; `model/service/BrandService.cfc:L51`
 */

describe('M7 — nothing leaks between independently constructed service graphs', () => {
  it('NET-NEW — AAP §0.6.6 M7 — a collision sequence in one graph does not give the next graph a suffix', async () => {
    /*
     * The case this group EXISTS for. Graph a meets two taken titles and must climb to `-3`; graph B
     * is built independently with nothing taken and must resolve the bare candidate in one probe. If
     * the probe, the counter or the availability set were module-scope, memoised, or cached on the
     * service, B would inherit A's climb and answer `acme-widgets-3` — or, worse, answer `-3` without
     * probing at all.
     */
    const graphA = createBrandHarness({ takenUrlTitles: ['acme-widgets', 'acme-widgets-2'] });
    const graphB = createBrandHarness();

    const brandA = graphA.service.newBrand();
    await graphA.service.saveBrand(brandA, { brandName: 'ACME Widgets' });

    const brandB = graphB.service.newBrand();
    await graphB.service.saveBrand(brandB, { brandName: 'ACME Widgets' });

    expect(brandA.urlTitle).toBe('acme-widgets-3');
    expect(probedUrlTitles(graphA.brands.calls)).toEqual([
      'acme-widgets',
      'acme-widgets-2',
      'acme-widgets-3',
    ]);

    // B's first probe is the bare candidate, and it is B's only probe.
    expect(probedUrlTitles(graphB.brands.calls)).toEqual(['acme-widgets']);
    expect(brandB.urlTitle).toBe('acme-widgets');

    // The two call logs are distinct arrays, not two views of one.
    expect(graphA.brands.calls).not.toBe(graphB.brands.calls);
  });

  it('NET-NEW — AAP §0.6.6 M7 — entity-property uniqueness state is factory-local too, so one graph’s incumbent row does not refuse another graph’s save', async () => {
    /*
     * The same proof for the other uniqueness seam. Graph a is seeded with an incumbent row holding
     * `acme-widgets`, so its save is refused with `.unique`; graph B, built with no seeds, saves the
     * identical brand cleanly. A shared or memoised uniqueness port would refuse both.
     */
    const graphA = createBrandHarness({
      uniqueValues: [
        {
          entityID: physicalID('incumbent-brand-id'),
          entityName: BRAND_ENTITY_NAME_FOR_SEEDS,
          propertyName: 'urlTitle',
          value: 'acme-widgets',
        },
      ],
    });
    const graphB = createBrandHarness();

    const savedA = await graphA.service.saveBrand(graphA.service.newBrand(), {
      brandName: 'ACME Widgets',
    });

    expect(savedA.hasErrors()).toBe(true);
    expect(savedA.getError('urlTitle')).toEqual(['validate.save.Brand.urlTitle.unique']);
    expect(persistedBrands(graphA.brands.calls)).toEqual([]);

    const brandB = graphB.service.newBrand();
    const savedB = await graphB.service.saveBrand(brandB, { brandName: 'ACME Widgets' });

    expect(savedB).toBe(brandB);
    expect(savedB.hasErrors()).toBe(false);
    expect(persistedBrands(graphB.brands.calls)).toEqual([brandB]);
    expect(graphA.validation.uniqueProperty.calls).not.toBe(graphB.validation.uniqueProperty.calls);
  });

  it('NET-NEW — AAP §0.6.6 M7 — the store, the factory count and the cleanup logs are all per-graph', async () => {
    const stored = createManagedBrand({
      brandID: physicalID('brand-1'),
      urlTitle: 'acme-widgets',
    }).brand;
    const graphA = createBrandHarness({ storedBrands: [stored] });
    const graphB = createBrandHarness();

    // A read that hits in a must miss in B, from the same identifier.
    await expect(graphA.service.getBrand(physicalID('brand-1'))).resolves.toBe(stored);
    await expect(graphB.service.getBrand(physicalID('brand-1'))).resolves.toBeNull();

    // A delete in a leaves B's store — which never held the row — exactly as it was.
    await expect(graphA.service.deleteBrand(stored)).resolves.toBe(true);
    expect(graphA.brands.brands).toEqual([]);
    expect(graphB.brands.brands).toEqual([]);
    expect(graphA.persistence.settingCleanups).toHaveLength(1);
    expect(graphB.persistence.settingCleanups).toEqual([]);

    // The factory counter is per-graph as well.
    graphA.service.newBrand();
    graphA.service.newBrand();
    graphB.service.newBrand();
    expect(factoryCallCount(graphA.brands.calls)).toBe(2);
    expect(factoryCallCount(graphB.brands.calls)).toBe(1);
  });

  it('NET-NEW — model/service/DataService.cfc:L62 — WITHIN one graph the derivation re-probes every time and memoises no resolved title', async () => {
    /*
     * The intra-graph half of M7. `src/services/BrandService.ts` records that the uniqueness probe is
     * constructed fresh on every derivation and never memoised, so a second brand with the same name
     * must issue its own round trips against the current state of the table rather than replaying the
     * first brand's answer.
     */
    const harness = createBrandHarness();

    const first = harness.service.newBrand();
    await harness.service.saveBrand(first, { brandName: 'ACME Widgets' });
    expect(first.urlTitle).toBe('acme-widgets');

    harness.brands.takeUrlTitle('acme-widgets');

    const second = harness.service.newBrand();
    await harness.service.saveBrand(second, { brandName: 'ACME Widgets' });

    expect(second.urlTitle).toBe('acme-widgets-2');
    // Four probes in total: one for the first brand, then two for the second. Nothing was replayed.
    expect(probedUrlTitles(harness.brands.calls)).toEqual([
      'acme-widgets',
      'acme-widgets',
      'acme-widgets-2',
    ]);
  });
});

describe('the declared surface — no synthesis, no dead injection, no invented collaborator', () => {
  it('NET-NEW — model/service/BrandService.cfc:L51 — the constructor takes EXACTLY THREE REQUIRED collaborators, and BrandService has no dead injection to drop', async () => {
    /*
     * Brandservice is the one service in the slice with no dead injection, and that is a finding
     * worth pinning rather than a gap. AAP §0.6.3.5 counts four dead injections across the slice —
     * `productTypeDAO` and `contentService` on `ProductService`, `productService` on `SkuService`, and
     * `productService` on `OptionService` — and §0.6.3.3 records `BrandService` as "the cleanest of the
     * four services", with exactly one declared injection at `model/service/BrandService.cfc:L51`
     */
    expect(BrandService.length).toBe(3);

    // And the graph really is constructible from exactly those two collaborators.
    const harness = createBrandHarness();
    expect(harness.service).toBeInstanceOf(BrandService);
    await expect(
      harness.service.saveBrand(harness.service.newBrand(), { brandName: 'ACME Widgets' }),
    ).resolves.toBeInstanceOf(Object);

    /*
     * The first collaborator's surface, pinned exhaustively. Annotated with the landed port type so
     * the whole assertion is compile-checked as well as asserted, and stated as an exact member list
     * because that is what rules out a re-imported DAO layer: no `executeQuery`, no `ormExecuteQuery`
     * passthrough, no `getBrandSmartList`, no `countBrand`, no `listBrand`, no `exportBrand`. There is
     * no `BrandDAO` in the legacy repository to port — a repository-wide scan finds none, which is
     * precisely why AAP §0.4.1.6 declares this port from the synthesized surface at.
     */
    const repositoryPort: BrandRepository = harness.brands.repository;
    expect(Object.keys(repositoryPort).sort()).toEqual([
      'deleteBrand',
      'findProductIdentifiersByBrand',
      'getBrand',
      'isUrlTitleAvailable',
      'newBrand',
      'saveBrand',
    ]);
  });

  it('NET-NEW — org/Hibachi/HibachiService.cfc:L255-L281 — the prototype carries FOUR declared members and no dynamic dispatch of any kind (IR-1, TR-3)', () => {
    /*
     * The assertion that proves the synthesis is gone rather than relocated. `onMissingMethod` at
     * `:L255-L281` fabricated a member for nine prefixes — `get`, `get…SmartList`, `new`, `list`,
     * `save`, `delete`, `count`, `export` and `process` — so in CFML `brandService.countBrand()`,
     * `brandService.listBrand()` and `brandService.exportBrand()` all resolved too, whether or not
     * anything called them. AAP §0.4.2.5 states the rule the port follows instead: synthesis is
     * reproduced "only where used", so the four members the slice actually calls are declared and
     * nothing else is.
     */
    expect(Object.getOwnPropertyNames(BrandService.prototype).sort()).toEqual([
      'constructor',
      'createUniqueBrandUrlTitle',
      'deleteBrand',
      'getBrand',
      'newBrand',
      'saveBrand',
    ]);

    // No static surface either — no registry, no factory table, no memo cache hanging off the class.
    expect(Object.getOwnPropertyNames(BrandService).sort()).toEqual([
      'length',
      'name',
      'prototype',
    ]);

    // And the class extends nothing (R3, AAP §0.4.3.3): its prototype chain stops at Object.
    expect(Object.getPrototypeOf(BrandService.prototype)).toBe(Object.prototype);
  });

  it('NET-NEW — model/entity/Brand.cfc — Brand has NO calculated service-backed member, so no boundary port is needed and none is introduced', () => {
    /*
     * AAP §0.2.2.6 draws the calculated-property boundary and then records the exemption that applies
     * here: "`Brand.cfc`, `Option.cfc` and `OptionGroup.cfc` declare no non-persistent properties at
     * all, so they are unaffected." `Product` declares twenty such members and `Sku` twenty-three,
     * reaching into the excluded pricing, promotion, inventory and currency services; `Brand` declares
     * none. §0.4.1.4 says the same from the other side — "no non-persistent properties exist, so the
     * port is complete".
     */
    expect(BRAND_PROPERTY_DESCRIPTORS.persistent).toBe(true);
    expect(BRAND_PROPERTY_DESCRIPTORS.entityName).toBe('Brand');
    expect(BRAND_PROPERTY_DESCRIPTORS.properties.length).toBeGreaterThan(0);

    const brand = createManagedBrand().brand;

    for (const excludedCalculatedMember of [
      'salePrice',
      'salePriceDetails',
      'livePrice',
      'currentAccountPrice',
      'qats',
      'currencyDetails',
      'allowBackorderFlag',
      'eligibleFulfillmentMethods',
      'adminIcon',
    ]) {
      expect(brand.hasProperty(excludedCalculatedMember)).toBe(false);
      expect(excludedCalculatedMember in brand).toBe(false);
    }
    expect(brand.hasProperty('brandName')).toBe(true);

    // The rule set reaches the same two collections and nothing else outside the entity.
    expect(productsPropertyValidation.read(brand)).toBe(brand.getProducts());
    expect(physicalCountsPropertyValidation.read()).toBeUndefined();
  });
});

/*
 * AAP §0.4.1.12 declares exactly seventeen executable suites, so this subject is covered
 * inside an approved suite rather than in one of its own.
 */

/* FOLDED IN FROM handlers/brandHandler */

/**
 * `brandHandler` — the authorization gate in front of the Brand boundary, and the projection it answers
 * with instead of the entity.
 */
describe("The brand surface's final wiring — the handler is a thin adapter over `BrandService`", () => {
  /**
   * A write runner that evaluates the gate and throws on a roll-back.
   *
   * @param graph the transaction-scoped graph the work receives
   * @returns the runner plus the commit decisions it took, in order.
   */
  function makeBrandWriteRunner(graph: BrandHandlerService): {
    readonly runner: TransactionalWriteRunner<BrandHandlerService>;
    readonly decisions: ('commit' | 'rollback')[];
    readonly securityContexts: RequestAuthorizationContext[];
  } {
    const decisions: ('commit' | 'rollback')[] = [];
    /* — every context the handler handed the boundary, in order. */
    const securityContexts: RequestAuthorizationContext[] = [];

    return {
      decisions,
      securityContexts,
      runner: {
        runWrite: async <TResult>(
          /*
           * — the runner now receives the invocation's authorised context first. The double
           * records that it arrived, which is what proves the handler forwarded the gate's own context
           * rather than letting the write fall back to a memoised principal.
           */
          security: RequestAuthorizationContext,
          work: (graph: BrandHandlerService) => Promise<TResult>,
          hasErrors: () => boolean,
        ): Promise<TResult> => {
          securityContexts.push(security);

          const result = await work(graph);

          if (hasErrors()) {
            decisions.push('rollback');
            throw new DomainError('rolled back because the caller reported accumulated findings');
          }

          decisions.push('commit');
          return result;
        },
      },
    };
  }

  /**
   * A principal, defaulting to the one shape the gate admits: logged in, non-admin, no groups needed.
   */
  function account(overrides: Partial<AccountReference>): AccountReference {
    return {
      accountID: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      newFlag: false,
      adminAccountFlag: false,
      ...overrides,
    };
  }

  /** The identifier-addressed event slice, with the headers container the resolver is handed. */
  function identifierEvent(brandID: string): BrandIdentifierEvent {
    return { pathParameters: { brandID }, headers: {} };
  }

  /** The save event slice. No identifier is addressed, so the save is a creation. */
  function saveEvent(body: string): BrandSaveEvent {
    return { body, pathParameters: null, headers: {} };
  }

  /** The save event slice that addresses an existing brand, so the save is an update. */
  function addressedSaveEvent(body: string, brandID: string): BrandSaveEvent {
    return { body, pathParameters: { brandID }, headers: {} };
  }

  describe('brandHandler — the gate `setupRequest()` ran', () => {
    interface Probe {
      /** Every entity question asked, in the order asked, so the legacy sequence is observable. */
      readonly asked: EntityAuthorizationRequest[];
      /** Every request the resolver was handed —'s widened input. */
      readonly requests: InvocationSecurityRequest[];
      /** How many times the resolver was invoked, so per-request resolution is observable. */
      readonly resolutions: { count: number };
      /** Every service member reached, so "refused before the service" is observable. */
      readonly serviceCalls: string[];
      /** Every context handed to the write boundary —'s propagation half. */
      readonly securityContexts: readonly RequestAuthorizationContext[];
      readonly handler: BrandHandler;
    }

    /**
     * @param account the principal the resolver reports, or `undefined` for "no principal at all"
     */
    function makeHandler(account: AccountReference | undefined, grant: readonly string[]): Probe {
      const asked: EntityAuthorizationRequest[] = [];
      const requests: InvocationSecurityRequest[] = [];
      const resolutions = { count: 0 };
      const serviceCalls: string[] = [];

      const stored = managedBrand();
      stored.brandID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      stored.brandName = 'Stored Brand';
      stored.brandWebsite = 'https://example.com';
      stored.urlTitle = 'stored-brand';
      stored.activeFlag = true;
      stored.publishedFlag = false;
      stored.remoteID = 'REMOTE-1';
      stored.createdByAccount = 'account-1';
      stored.modifiedByAccount = 'account-2';

      const service: BrandHandlerService = {
        saveBrand: (brand: ManagedBrand): Promise<ManagedBrand> => {
          serviceCalls.push('saveBrand');
          return Promise.resolve(brand);
        },
        newBrand: (): ManagedBrand => {
          serviceCalls.push('newBrand');
          return stored;
        },
        getBrand: (): Promise<ManagedBrand | null> => {
          serviceCalls.push('getBrand');
          return Promise.resolve(stored);
        },
        deleteBrand: (): Promise<boolean> => {
          serviceCalls.push('deleteBrand');
          return Promise.resolve(true);
        },
      };

      const resolve: InvocationSecurityResolver = (request) => {
        resolutions.count += 1;
        requests.push(request);

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

      const writeRunner = makeBrandWriteRunner(service);

      return {
        asked,
        requests,
        resolutions,
        serviceCalls,
        securityContexts: writeRunner.securityContexts,
        /*
         * The graph is the same recording service here: these cases assert the authorisation ladder, and
         * routing the work through a second object would record each call twice. 's boundary behaviour
         * is asserted in its own describe block below.
         */
        handler: createBrandHandler(service, resolve, writeRunner.runner),
      };
    }

    it('NET-NEW — org/Hibachi/HibachiAuthenticationService.cfc:L83 — NO principal refuses all three with 401', async () => {
      const probe = makeHandler(undefined, ['create', 'read', 'update', 'delete']);

      const results = [
        await probe.handler.getBrand(identifierEvent('any-id')),
        await probe.handler.saveBrand(saveEvent('{}')),
        await probe.handler.deleteBrand(identifierEvent('any-id')),
      ];

      for (const result of results) {
        expect(result.statusCode).toBe(401);
        expect(JSON.parse(result.body)).toStrictEqual({ message: 'Authentication is required' });
      }

      // Refused before the service, so nothing was read, saved or deleted.
      expect(probe.serviceCalls).toStrictEqual([]);
      // And refused before any permission question, because there was no principal to ask about.
      expect(probe.asked).toStrictEqual([]);
    });

    it('NET-NEW — brandHandler — HibachiScope.cfc:L40-L45 — the logged-in test is the NEGATION of newFlag', async () => {
      // `getLoggedInFlag()` is `if(!getSession().getAccount().isNew())`, and `newFlag` carries
      // `isNew()`. A principal that is NEW is therefore not logged in.
      const notLoggedIn = makeHandler(account({ newFlag: true }), ['read']);
      expect((await notLoggedIn.handler.getBrand(identifierEvent('x'))).statusCode).toBe(401);
      expect(notLoggedIn.serviceCalls).toStrictEqual([]);

      // Inverting the predicate would have admitted exactly this caller and refused the next one.
      const loggedIn = makeHandler(account({ newFlag: false }), ['read']);
      expect((await loggedIn.handler.getBrand(identifierEvent('x'))).statusCode).toBe(200);
    });

    it('NET-NEW — L43-L49 — a logged-in principal without permission gets 403, not 401 and not 200', async () => {
      const probe = makeHandler(account({}), []);

      const results = [
        await probe.handler.getBrand(identifierEvent('x')),
        await probe.handler.saveBrand(saveEvent('{}')),
        await probe.handler.deleteBrand(identifierEvent('x')),
      ];

      for (const result of results) {
        expect(result.statusCode).toBe(403);
        expect(JSON.parse(result.body)).toStrictEqual({ message: 'Not authorized' });
      }

      expect(probe.serviceCalls).toStrictEqual([]);
    });

    it('NET-NEW — L55-L58 — each member asks for its OWN legacy crudType and only that one', async () => {
      const read = makeHandler(account({}), []);
      await read.handler.getBrand(identifierEvent('x'));
      /*
       * Also added the addressed identifier to the question, so a deployment can scope a
       * grant to the row being read. The entity name still comes from the handler's own constant.
       */
      expect(read.asked).toStrictEqual([{ crudType: 'read', entityName: 'Brand', entityID: 'x' }]);

      const remove = makeHandler(account({}), []);
      await remove.handler.deleteBrand(identifierEvent('x'));
      expect(remove.asked).toStrictEqual([
        { crudType: 'delete', entityName: 'Brand', entityID: 'x' },
      ]);
    });

    /*
     * Why the question follows the operation (CWE-862, CWE-639). Asking `create` first, then
     * `update`, and short-circuiting on the first grant would answer `200` for a `create`-only
     * principal saving a brand — and `saveBrand` updates the addressed row, so that principal would
     * be authorised for an operation it holds no grant for.
     */
    it('NET-NEW — save asks EXACTLY the operation it performs, and nothing else', async () => {
      // No grant at all is still 403, and exactly one question is asked rather than two.
      const neither = makeHandler(account({}), []);
      expect((await neither.handler.saveBrand(saveEvent('{}'))).statusCode).toBe(403);
      expect(neither.asked.map((request) => request.crudType)).toStrictEqual(['create']);

      // Unaddressed — a creation. `create` alone grants it, and `update` is never asked.
      const createOnly = makeHandler(account({}), ['create']);
      expect((await createOnly.handler.saveBrand(saveEvent('{}'))).statusCode).toBe(200);
      expect(createOnly.asked).toStrictEqual([{ crudType: 'create', entityName: 'Brand' }]);

      // The escalation itself: create-only, addressing an existing brand, must now be refused.
      const createOnlyAddressing = makeHandler(account({}), ['create']);
      const escalation = await createOnlyAddressing.handler.saveBrand(
        addressedSaveEvent('{}', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      );
      expect(escalation.statusCode).toBe(403);
      expect(createOnlyAddressing.asked).toStrictEqual([
        {
          crudType: 'update',
          entityName: 'Brand',
          entityID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      ]);
      expect(createOnlyAddressing.serviceCalls).toStrictEqual([]);

      // And `update` alone grants the addressed save — the operation it actually covers.
      const updateOnly = makeHandler(account({}), ['update']);
      expect(
        (
          await updateOnly.handler.saveBrand(
            addressedSaveEvent('{}', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
          )
        ).statusCode,
      ).toBe(200);
      expect(updateOnly.asked.map((request) => request.crudType)).toStrictEqual(['update']);

      // And the mirror image: update-only may no longer create.
      const updateOnlyCreating = makeHandler(account({}), ['update']);
      expect((await updateOnlyCreating.handler.saveBrand(saveEvent('{}'))).statusCode).toBe(403);
      expect(updateOnlyCreating.asked.map((request) => request.crudType)).toStrictEqual(['create']);
    });

    it('NET-NEW — the resolver is invoked EXACTLY ONCE per request, and now carries the whole question', async () => {
      // Two calls would ask two questions of two separately resolved principals.
      const probe = makeHandler(account({}), ['create']);
      await probe.handler.saveBrand(saveEvent('{}'));
      expect(probe.resolutions.count).toBe(1);

      /*
       * — what the resolver was told. A resolver handed only headers could not scope a grant
       * to the action, and could not read a claim its gateway had already verified.
       */
      expect(probe.requests).toHaveLength(1);
      expect(probe.requests[0]).toMatchObject({
        action: 'brand.saveBrand',
        crudType: 'create',
        entityName: 'Brand',
        headers: {},
      });
      expect(probe.requests[0]?.entityID).toBeUndefined();
    });

    it('NET-NEW — the resolved context reaches the transaction boundary, not a memoised one', async () => {
      /*
       * The gate resolves one context per invocation; the write must run under that principal, or property
       * population and audit stamping can execute as somebody else. The runner double records every
       * context it is handed, so an implementation that dropped it fails here.
       */
      const probe = makeHandler(account({}), ['create']);

      expect((await probe.handler.saveBrand(saveEvent('{}'))).statusCode).toBe(200);
      expect(probe.securityContexts).toHaveLength(1);
      expect(probe.securityContexts[0]?.accountContext.getCurrentAccount()).toStrictEqual(
        account({}),
      );
    });

    it('NET-NEW — the gate runs BEFORE the identifier is read, so it is not an existence oracle', async () => {
      const probe = makeHandler(account({}), []);

      const existing = await probe.handler.getBrand(
        identifierEvent('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      );
      const absent = await probe.handler.getBrand(identifierEvent('does-not-exist'));
      const noIdentifierAtAll = await probe.handler.getBrand({ pathParameters: null, headers: {} });

      // Three different addressing outcomes, one indistinguishable refusal.
      expect(existing).toStrictEqual(absent);
      expect(absent).toStrictEqual(noIdentifierAtAll);
      expect(existing.statusCode).toBe(403);
    });

    it('NET-NEW — the gate runs BEFORE the body is read, so a refusal never reports a body problem', async () => {
      const probe = makeHandler(account({}), []);
      const result = await probe.handler.saveBrand({
        body: '<<not json>>',
        pathParameters: null,
        headers: {},
      });

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body)).toStrictEqual({ message: 'Not authorized' });
    });

    it('NET-NEW — brandHandler — no refusal carries a WWW-Authenticate header or names any scheme', async () => {
      const probe = makeHandler(undefined, []);
      const result = await probe.handler.getBrand(identifierEvent('x'));

      expect(result.headers).toStrictEqual({ 'Content-Type': 'application/json' });
      expect(result.body).not.toMatch(/bearer|basic|scheme|token/i);
    });

    it('NET-NEW — newBrand is NOT a member of the routed surface', () => {
      const probe = makeHandler(account({}), ['create']);

      // `admin/views/entity/` carries only detailbrand.cfm and listbrand.cfm — no create or edit view —
      // and `newBrand` had no source declaration at all: `onMissingMethod` fabricated it. It is
      // therefore absent from the frozen result, so `router.ts` has nothing to mount.
      expect(Object.keys(probe.handler).sort()).toStrictEqual([
        'deleteBrand',
        'getBrand',
        'saveBrand',
      ]);
      expect('newBrand' in probe.handler).toBe(false);
    });

    it('NET-NEW — every routed member carries an access classification, and all three are secure', () => {
      // admin/controllers/entity.cfc:L66 declares `this.publicMethods=''`, so not one Brand item is
      // public. The matrix is keyed on `keyof BrandHandler`, so the two sets cannot drift.
      expect(BRAND_ACCESS_MATRIX).toStrictEqual({
        saveBrand: 'secure',
        getBrand: 'secure',
        deleteBrand: 'secure',
      });
      expect(Object.isFrozen(BRAND_ACCESS_MATRIX)).toBe(true);
    });
  });

  /** A brand carrying the error-surface members the base collaborator needs. */
  function managedBrand(): ManagedBrand {
    return manageEntity(new Brand(), BRAND_ENTITY_METADATA);
  }

  describe('brandHandler — the response is a projection and not the entity', () => {
    function handlerReturning(stored: ManagedBrand): BrandHandler {
      const service: BrandHandlerService = {
        saveBrand: (brand: ManagedBrand): Promise<ManagedBrand> => Promise.resolve(brand),
        newBrand: (): ManagedBrand => stored,
        getBrand: (): Promise<ManagedBrand | null> => Promise.resolve(stored),
        deleteBrand: (): Promise<boolean> => Promise.resolve(true),
      };

      return createBrandHandler(
        service,
        () => ({
          accountContext: { getCurrentAccount: () => account({}) },
          entityAuthorization: { authenticateEntity: () => true },
          populationAuthorization: DENY_ALL_POPULATION_AUTHORIZATION,
        }),
        makeBrandWriteRunner(service).runner,
      );
    }

    function fullyPopulatedBrand(): ManagedBrand {
      const brand = managedBrand();
      brand.brandID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      brand.brandName = 'Acme';
      brand.brandWebsite = 'https://acme.example';
      brand.urlTitle = 'acme';
      brand.activeFlag = true;
      brand.publishedFlag = true;
      brand.remoteID = 'ERP-4711';
      brand.createdByAccount = 'account-created';
      brand.modifiedByAccount = 'account-modified';
      brand.createdDateTime = new Date(0);
      brand.modifiedDateTime = new Date(0);
      return brand;
    }

    it('NET-NEW — the body carries exactly the six persistent members a caller asked for', async () => {
      const result = await handlerReturning(fullyPopulatedBrand()).getBrand(identifierEvent('x'));

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toStrictEqual({
        brandID: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        brandName: 'Acme',
        brandWebsite: 'https://acme.example',
        urlTitle: 'acme',
        activeFlag: true,
        publishedFlag: true,
      });
    });

    it('NET-NEW — brandWebsite reaches the body VERBATIM, and the body is the only consumer boundary for it', async () => {
      /*
       * This is the one place in the deliverable that hands `brandWebsite` to a consumer, so the
       * residual exposure the validation layer flags is pinned here as well as at the predicate.
       */
      const brand = fullyPopulatedBrand();
      brand.brandWebsite = 'mailto:hello@acme.example';

      const result = await handlerReturning(brand).getBrand(identifierEvent('x'));
      const body = JSON.parse(result.body) as Record<string, unknown>;

      expect(result.statusCode).toBe(200);
      expect(body['brandWebsite']).toBe('mailto:hello@acme.example');

      // And an absent website is omitted rather than emitted as a null, so a consumer distinguishes
      // "no website" from "an empty website" without inspecting the value.
      const withoutWebsite = fullyPopulatedBrand();
      delete withoutWebsite.brandWebsite;
      const bare = await handlerReturning(withoutWebsite).getBrand(identifierEvent('x'));
      expect(Object.keys(JSON.parse(bare.body) as Record<string, unknown>)).not.toContain(
        'brandWebsite',
      );
    });

    it('NET-NEW — model/entity/Brand.cfc:L75-L80 — remoteID and the audit members never reach the body', async () => {
      const result = await handlerReturning(fullyPopulatedBrand()).getBrand(identifierEvent('x'));
      const body: unknown = JSON.parse(result.body);

      for (const withheld of [
        'remoteID',
        'createdByAccount',
        'modifiedByAccount',
        'createdDateTime',
        'modifiedDateTime',
      ]) {
        expect(Object.prototype.hasOwnProperty.call(body, withheld)).toBe(false);
      }

      expect(result.body).not.toContain('ERP-4711');
      expect(result.body).not.toContain('account-created');
    });

    it('NET-NEW — model/entity/Brand.cfc:L60-L71 — none of the EIGHT relationship collections reaches the body', async () => {
      const result = await handlerReturning(fullyPopulatedBrand()).getBrand(identifierEvent('x'));
      const body: unknown = JSON.parse(result.body);

      // Six of the eight collaborators — promotion rewards and qualifiers with their exclusions,
      // vendors and physical counts — are explicitly out of scope (AAP §0.2.2.1), so publishing the
      // arrays would disclose structure this deliverable does not even model.
      for (const withheld of [
        'attributeValues',
        'products',
        'promotionRewards',
        'promotionRewardExclusions',
        'promotionQualifiers',
        'promotionQualifierExclusions',
        'vendors',
        'physicals',
      ]) {
        expect(Object.prototype.hasOwnProperty.call(body, withheld)).toBe(false);
      }
    });

    it('NET-NEW — a brand holding a product serializes, where the raw entity would have thrown', async () => {
      const brand = fullyPopulatedBrand();
      const product = new Product();
      product.productID = 'cccccccccccccccccccccccccccccccc';
      brand.addProduct(product);

      // `Brand.products` -> `Product.brand` is a cycle that `JSON.stringify` refuses outright, so
      // whole-entity serialization would have produced an opaque 500 for any brand with a product.
      expect(() => JSON.stringify(brand)).toThrow(TypeError);

      const result = await handlerReturning(brand).getBrand(identifierEvent('x'));
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).not.toHaveProperty('products');
    });

    it('NET-NEW — an unset optional member is OMITTED rather than published as null', async () => {
      const sparse = managedBrand();
      sparse.brandID = 'dddddddddddddddddddddddddddddddd';

      const result = await handlerReturning(sparse).getBrand(identifierEvent('x'));

      expect(JSON.parse(result.body)).toStrictEqual({
        brandID: 'dddddddddddddddddddddddddddddddd',
      });
      expect(result.body).not.toContain('null');
    });

    it('NET-NEW — deleteBrand still returns the boolean verdict, which is not an entity at all', async () => {
      const result = await handlerReturning(fullyPopulatedBrand()).deleteBrand(
        identifierEvent('x'),
      );

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toBe(true);
    });
  });

  describe('brandHandler — an unaddressed brand is a REQUEST fault, an unmatched one is a MISS', () => {
    /*
     * Why this block exists. `getBrand` and `deleteBrand` answered the neutral 404 for both "no
     * identifier was addressed" and "the addressed identifier matches nothing", and the collapse was
     * defended as non-disclosure. It is not one: the gate runs before the identifier is read, so an
     * unauthorised caller never reaches either answer (the block above asserts exactly that), and
     * among callers who do reach it, "you addressed nothing" says nothing whatsoever about any brand. The
     * cost fell entirely on a legitimate client, which could not tell a bug in its own request from a brand.
     */

    const STORED_BRAND_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const NAMED_REFUSAL = { message: 'A "brandID" path parameter is required' };

    /** A permitted principal, so every case below lands past the gate on the identifier logic. */
    function handlerFor(reached: string[]): BrandHandler {
      const stored = managedBrand();
      stored.brandID = STORED_BRAND_ID;
      stored.brandName = 'Stored Brand';

      const service: BrandHandlerService = {
        saveBrand: (brand: ManagedBrand): Promise<ManagedBrand> => Promise.resolve(brand),
        newBrand: (): ManagedBrand => stored,
        getBrand: (brandID: string): Promise<ManagedBrand | null> => {
          reached.push(brandID);
          return Promise.resolve(brandID === STORED_BRAND_ID ? stored : null);
        },
        deleteBrand: (): Promise<boolean> => Promise.resolve(true),
      };

      return createBrandHandler(
        service,
        () => ({
          accountContext: { getCurrentAccount: () => account({}) },
          entityAuthorization: { authenticateEntity: () => true },
          populationAuthorization: DENY_ALL_POPULATION_AUTHORIZATION,
        }),
        makeBrandWriteRunner(service).runner,
      );
    }

    it('NET-NEW — getBrand with NO identifier answers 400 NAMED, and never asks the service', async () => {
      const reached: string[] = [];
      const result = await handlerFor(reached).getBrand({ pathParameters: null, headers: {} });

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toStrictEqual(NAMED_REFUSAL);
      expect(reached).toEqual([]);
    });

    it('NET-NEW — deleteBrand with NO identifier answers 400 NAMED, and removes nothing', async () => {
      const reached: string[] = [];
      const result = await handlerFor(reached).deleteBrand({ pathParameters: null, headers: {} });

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toStrictEqual(NAMED_REFUSAL);
      expect(reached).toEqual([]);
    });

    it('NET-NEW — the EMPTY identifier is the legacy unsaved sentinel and is refused the same way', async () => {
      const reached: string[] = [];
      const handler = handlerFor(reached);

      const read = await handler.getBrand({ pathParameters: { brandID: '' }, headers: {} });
      const remove = await handler.deleteBrand({ pathParameters: { brandID: '' }, headers: {} });

      expect(read.statusCode).toBe(400);
      expect(remove.statusCode).toBe(400);
      expect(JSON.parse(read.body)).toStrictEqual(NAMED_REFUSAL);
      /* No row can carry `''`, so no lookup is attempted for it. */
      expect(reached).toEqual([]);
    });

    it('NET-NEW — an identifier that matches nothing STILL answers the neutral 404', async () => {
      const reached: string[] = [];
      const handler = handlerFor(reached);

      const read = await handler.getBrand({
        pathParameters: { brandID: 'ffffffffffffffffffffffffffffffff' },
        headers: {},
      });
      const remove = await handler.deleteBrand({
        pathParameters: { brandID: 'ffffffffffffffffffffffffffffffff' },
        headers: {},
      });

      expect(read.statusCode).toBe(404);
      expect(remove.statusCode).toBe(404);
      /* Still neutral: neither the identifier nor the route is echoed back. */
      expect(JSON.parse(read.body)).toStrictEqual({ message: 'Not found' });
      expect(reached).toEqual([
        'ffffffffffffffffffffffffffffffff',
        'ffffffffffffffffffffffffffffffff',
      ]);
    });

    it('NET-NEW — the two conditions are now DISTINGUISHABLE, which is the whole point', async () => {
      const reached: string[] = [];
      const handler = handlerFor(reached);

      const unaddressed = await handler.getBrand({ pathParameters: null, headers: {} });
      const unmatched = await handler.getBrand({
        pathParameters: { brandID: 'ffffffffffffffffffffffffffffffff' },
        headers: {},
      });

      expect(unaddressed.statusCode).not.toBe(unmatched.statusCode);
      expect(unaddressed.body).not.toBe(unmatched.body);
    });

    it('NET-NEW — a matched identifier is unaffected and still answers 200 with the projection', async () => {
      const reached: string[] = [];
      const result = await handlerFor(reached).getBrand({
        pathParameters: { brandID: STORED_BRAND_ID },
        headers: {},
      });

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toMatchObject({
        brandID: STORED_BRAND_ID,
        brandName: 'Stored Brand',
      });
    });

    it('NET-NEW — the GATE still answers first, so the 400 is unreachable without permission', async () => {
      /*
       * The anti-enumeration property the old collapse was defending lives here, in the ordering — not in
       * the status. An unauthorised caller gets the same refusal whatever it addresses.
       */
      const stored = managedBrand();
      stored.brandID = STORED_BRAND_ID;

      const refusingService: BrandHandlerService = {
        saveBrand: (brand: ManagedBrand): Promise<ManagedBrand> => Promise.resolve(brand),
        newBrand: (): ManagedBrand => stored,
        getBrand: (): Promise<ManagedBrand | null> => Promise.resolve(stored),
        deleteBrand: (): Promise<boolean> => Promise.resolve(true),
      };

      const refusing = createBrandHandler(
        refusingService,
        () => ({
          accountContext: { getCurrentAccount: () => account({}) },
          entityAuthorization: { authenticateEntity: () => false },
          populationAuthorization: DENY_ALL_POPULATION_AUTHORIZATION,
        }),
        makeBrandWriteRunner(refusingService).runner,
      );

      const unaddressed = await refusing.getBrand({ pathParameters: null, headers: {} });
      const addressed = await refusing.getBrand({
        pathParameters: { brandID: STORED_BRAND_ID },
        headers: {},
      });

      expect(unaddressed.statusCode).toBe(403);
      expect(unaddressed).toStrictEqual(addressed);
    });
  });

  /* — every brand mutation runs inside a transaction boundary. */

  describe('brandHandler —, every mutation runs inside a transaction boundary', () => {
    const BOUNDARY_BRAND_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    /** Which object answered a member: the pool-bound service, or the transaction-scoped graph. */
    type Answerer = 'service' | 'graph';

    /**
     * Two observably different brand services — one standing for the pool-bound graph, one for the
     * transaction-scoped one — plus the call log that says which answered.
     */
    function makeSurfaces(options: {
      readonly savedHasErrors?: boolean;
      readonly found?: boolean;
    }): {
      readonly service: BrandHandlerService;
      readonly graph: BrandHandlerService;
      readonly answered: { member: string; by: Answerer }[];
    } {
      const answered: { member: string; by: Answerer }[] = [];

      const build = (by: Answerer): BrandHandlerService => ({
        newBrand: (): ManagedBrand => {
          answered.push({ member: 'newBrand', by });
          const brand = managedBrand();
          brand.brandID = '';
          return brand;
        },
        getBrand: (brandID: string): Promise<ManagedBrand | null> => {
          answered.push({ member: 'getBrand', by });
          if (options.found === false) {
            return Promise.resolve(null);
          }
          const brand = managedBrand();
          brand.brandID = brandID;
          return Promise.resolve(brand);
        },
        saveBrand: (brand: ManagedBrand): Promise<ManagedBrand> => {
          answered.push({ member: 'saveBrand', by });
          if (options.savedHasErrors === true) {
            /*
             * The legacy's single exit: a failed save returns the entity carrying findings rather than
             * raising [`model/service/HibachiService.cfc:L103`]. This is the state the gate must catch.
             */
            brand.addError('brandName', 'validate.save.Brand.brandName.required');
            brand.addError('urlTitle', 'validate.save.Brand.urlTitle.required');
          }
          return Promise.resolve(brand);
        },
        deleteBrand: (): Promise<boolean> => {
          answered.push({ member: 'deleteBrand', by });
          return Promise.resolve(true);
        },
      });

      return { service: build('service'), graph: build('graph'), answered };
    }

    /** An assembled handler whose runner hands the work the boundary graph. */
    function makeProbe(
      options: { readonly savedHasErrors?: boolean; readonly found?: boolean } = {},
    ): {
      readonly handler: BrandHandler;
      readonly answered: { member: string; by: Answerer }[];
      readonly decisions: ('commit' | 'rollback')[];
    } {
      const surfaces = makeSurfaces(options);
      const runner = makeBrandWriteRunner(surfaces.graph);

      return {
        answered: surfaces.answered,
        decisions: runner.decisions,
        handler: createBrandHandler(
          surfaces.service,
          () => ({
            accountContext: { getCurrentAccount: () => account({}) },
            entityAuthorization: { authenticateEntity: () => true },
            populationAuthorization: DENY_ALL_POPULATION_AUTHORIZATION,
          }),
          runner.runner,
        ),
      };
    }

    const saveEvent = (brandID?: string): Parameters<BrandHandler['saveBrand']>[0] => ({
      pathParameters: brandID === undefined ? null : { brandID },
      headers: {},
      body: JSON.stringify({ brandName: 'ACME Widgets' }),
    });

    it('NET-NEW — a CREATE resolves and saves through the BOUNDARY graph, never the pool-bound service', async () => {
      const probe = makeProbe();

      const response = await probe.handler.saveBrand(saveEvent());

      expect(response.statusCode).toBe(200);
      // The assertion the finding turns on: both members answered from inside the transaction.
      expect(probe.answered).toStrictEqual([
        { member: 'newBrand', by: 'graph' },
        { member: 'saveBrand', by: 'graph' },
      ]);
      expect(probe.decisions).toStrictEqual(['commit']);
    });

    it('NET-NEW — an UPDATE resolves its subject INSIDE the unit, so the read shares the write connection (M6)', async () => {
      // `getBrand` reading on the pool while the save writes in a transaction is the partial-rebuild
      // failure mode: it compiles and the happy path passes.
      const probe = makeProbe();

      const response = await probe.handler.saveBrand(saveEvent(BOUNDARY_BRAND_ID));

      expect(response.statusCode).toBe(200);
      expect(probe.answered).toStrictEqual([
        { member: 'getBrand', by: 'graph' },
        { member: 'saveBrand', by: 'graph' },
      ]);
    });

    it('NET-NEW — a save that returns findings ROLLS BACK rather than committing (M5)', async () => {
      // The gate is the point. Without it the transaction would commit around a failed save, taking
      // any cleanup the operation performed with it, while the response still reported the failure.
      const probe = makeProbe({ savedHasErrors: true });

      const response = await probe.handler.saveBrand(saveEvent(BOUNDARY_BRAND_ID));

      expect(probe.decisions).toStrictEqual(['rollback']);
      /*
       * The runner raises a generic DomainError on the rollback decision. The handler must lift the
       * captured entity's findings back into the public validation contract rather than publishing an
       * opaque 500.
       */
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toStrictEqual({
        message: 'Validation failed',
        errors: {
          brandName: ['validate.save.Brand.brandName.required'],
          urlTitle: ['validate.save.Brand.urlTitle.required'],
        },
      });

      /*
       * The post-run `saved.hasErrors()` branch remains intentional and reachable for a substituted
       * runner that reports the gate reading but returns the outcome. It must publish the identical
       * contract, so the production rollback path and the override seam cannot drift.
       */
      const passThroughSurfaces = makeSurfaces({ savedHasErrors: true });
      const passThroughHandler = createBrandHandler(
        passThroughSurfaces.service,
        () => ({
          accountContext: { getCurrentAccount: () => account({}) },
          entityAuthorization: { authenticateEntity: () => true },
          populationAuthorization: DENY_ALL_POPULATION_AUTHORIZATION,
        }),
        {
          runWrite: async <TResult>(
            _security: RequestAuthorizationContext,
            work: (graph: BrandHandlerService) => Promise<TResult>,
            hasErrors: () => boolean,
          ): Promise<TResult> => {
            const result = await work(passThroughSurfaces.graph);
            expect(hasErrors()).toBe(true);
            return result;
          },
        },
      );
      const passThroughResponse = await passThroughHandler.saveBrand(saveEvent(BOUNDARY_BRAND_ID));

      expect(passThroughResponse.statusCode).toBe(400);
      expect(JSON.parse(passThroughResponse.body)).toStrictEqual(JSON.parse(response.body));
    });

    it('NET-NEW — the gate reads a SEPARATE capture, so it cannot throw from a temporal dead zone', async () => {
      // A regression guard for a real bug that was written and caught. `runWrite` evaluates the gate
      // before it commits, and therefore before the `const` holding the saved brand is initialised. A gate
      // closing over that `const` throws `ReferenceError` on exactly the failing-save path — the one path
      // where the gate matters. The rollback case above would surface it, so this case pins the success
      // path too: the gate is evaluated there as well, and must not throw.
      const probe = makeProbe();

      const response = await probe.handler.saveBrand(saveEvent(BOUNDARY_BRAND_ID));

      expect(response.statusCode).toBe(200);
      expect(probe.decisions).toStrictEqual(['commit']);
    });

    it('NET-NEW — a DELETE resolves and removes through the BOUNDARY graph', async () => {
      const probe = makeProbe();

      const response = await probe.handler.deleteBrand({
        pathParameters: { brandID: BOUNDARY_BRAND_ID },
        headers: {},
      });

      expect(response.statusCode).toBe(200);
      expect(probe.answered).toStrictEqual([
        { member: 'getBrand', by: 'graph' },
        { member: 'deleteBrand', by: 'graph' },
      ]);
      expect(probe.decisions).toStrictEqual(['commit']);
    });

    it('NET-NEW — a missing row COMMITS an empty transaction and answers 404, on both write paths', async () => {
      // Nothing was written, so a rollback would report a failure the caller did not cause. The same
      // reasoning `./productHandler` records for its own missing-product path.
      const onSave = makeProbe({ found: false });
      const onDelete = makeProbe({ found: false });

      const saveResponse = await onSave.handler.saveBrand(saveEvent(BOUNDARY_BRAND_ID));
      const deleteResponse = await onDelete.handler.deleteBrand({
        pathParameters: { brandID: BOUNDARY_BRAND_ID },
        headers: {},
      });

      expect(saveResponse.statusCode).toBe(404);
      expect(deleteResponse.statusCode).toBe(404);
      expect(onSave.decisions).toStrictEqual(['commit']);
      expect(onDelete.decisions).toStrictEqual(['commit']);
      // Neither reached its write member.
      expect(onSave.answered).toStrictEqual([{ member: 'getBrand', by: 'graph' }]);
      expect(onDelete.answered).toStrictEqual([{ member: 'getBrand', by: 'graph' }]);
    });
  });

  /*
   * The shipped composition is callable — the critical callable-boundary defect, pinned end to end.
   */

  describe('brandHandler — the production default resolver is a real seam, fail-closed until used', () => {
    const STORED_BRAND_ID = 'ffffffffffffffffffffffffffffffff';

    function handlerOnTheProductionDefault(): {
      readonly handler: BrandHandler;
      readonly serviceCalls: string[];
    } {
      const serviceCalls: string[] = [];
      const stored = managedBrand();
      stored.brandID = STORED_BRAND_ID;
      stored.brandName = 'Stored Brand';

      const service: BrandHandlerService = {
        saveBrand: (brand: ManagedBrand): Promise<ManagedBrand> => Promise.resolve(brand),
        newBrand: (): ManagedBrand => stored,
        getBrand: (): Promise<ManagedBrand | null> => {
          serviceCalls.push('getBrand');
          return Promise.resolve(stored);
        },
        deleteBrand: (): Promise<boolean> => Promise.resolve(true),
      };

      /*
       * The resolver is the production default, not a double. `createBrandHandlerFromContainer` supplies
       * exactly this function when a caller names none, so whatever this case observes is what a deployed
       * artifact does.
       */
      return {
        handler: createBrandHandler(
          service,
          resolveRequestAuthorization,
          makeBrandWriteRunner(service).runner,
        ),
        serviceCalls,
      };
    }

    afterEach(() => {
      clearRequestAuthorizationResolver();
    });

    it('NET-NEW — with no resolver registered the route answers 401 and the service is never reached', async () => {
      const { handler, serviceCalls } = handlerOnTheProductionDefault();

      const result = await handler.getBrand({
        pathParameters: { brandID: STORED_BRAND_ID },
        headers: {},
      });

      expect(result.statusCode).toBe(401);
      expect(serviceCalls).toStrictEqual([]);
    });

    it('NET-NEW — a registered resolver makes the SAME route reach the service and answer 200', async () => {
      const { handler, serviceCalls } = handlerOnTheProductionDefault();

      registerRequestAuthorizationResolver(() => ({
        accountContext: { getCurrentAccount: () => account({}) },
        entityAuthorization: { authenticateEntity: () => true },
        populationAuthorization: DENY_ALL_POPULATION_AUTHORIZATION,
      }));

      const result = await handler.getBrand({
        pathParameters: { brandID: STORED_BRAND_ID },
        headers: {},
      });

      expect(result.statusCode).toBe(200);
      expect(serviceCalls).toStrictEqual(['getBrand']);
      expect(JSON.parse(result.body)).toMatchObject({ brandID: STORED_BRAND_ID });
    });
  });
});
