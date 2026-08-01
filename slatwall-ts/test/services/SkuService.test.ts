/**
 * `SkuService` — the merchandise combination engine and its UNBOUNDED enumeration.
 *
 * AAP authority: AAP 0.4.1.12 lists `slatwall-ts/test/services/SkuService.test.ts` | CREATE |
 * "**NET-NEW** — including the combination engine and the three-way discriminator", and the AAP 0.4.4
 * wildcard row authorises `slatwall-ts/test/**` | CREATE.
 *
 * =============================================================================================
 * WHAT THIS FILE COVERS, AND WHAT IT DELIBERATELY DOES NOT
 * =============================================================================================
 * This file exists to pin the merchandise enumeration semantics of
 * `model/service/SkuService.cfc:L82-L122` — odometer order, duplicate retention, per-SKU
 * validate-then-write interleaving, and the ABSENCE of any ceiling on the combination count. It is
 * NOT the full combination-engine suite the AAP envisions: the three-way discriminator,
 * the subscription and content-access branches, the SKU-code sequence and the fallthrough throw at
 * `model/service/SkuService.cfc:L204` are all out of its scope and remain to be covered. Saying so
 * plainly is preferable to implying a completeness this file does not have.
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP 0.6.5.2 verified that no legacy `SkuServiceTest`
 * exists — "**No** `ProductServiceTest`, `SkuServiceTest`, `BrandServiceTest` or `OptionServiceTest`
 * exists — therefore **all 28 public service members of 0.4.2 are net-new coverage**, including
 * `createSkus`". Nothing here extends a legacy assertion, and none is labelled as though it did.
 *
 * =============================================================================================
 * WHY THESE CASES EXIST, AND WHY THERE IS NO LONGER A BOUND TO TEST
 * =============================================================================================
 * An earlier revision of the service took a REQUIRED `SkuCombinationBudget` collaborator and refused
 * any request above it, and this file tested that gate. Both are gone: the legacy states no maximum
 * anywhere — `totalCombos` is multiplied at `model/service/SkuService.cfc:L85` and looped at [:L89]
 * with no ceiling — so requiring a composition root to supply one relocated the fabrication instead
 * of avoiding it (AAP §0.7.3 S9, IR-12), and AAP §0.8.2 Guideline 4 with IR-9 permits exactly ONE
 * declared hardening exception, which is D18 and not this. The service now carries the unbounded
 * enumeration as a flagged `TODO(parity)`.
 *
 * What remains is the part that was always load-bearing. AAP 0.6.7.8 is explicit that the enumeration
 * must be ported exactly, "because the enumeration order determines both the generated SKU set and —
 * through 0.6.2 — the order in which uniqueness validation observes its siblings". The cases below
 * therefore pin odometer order, duplicate retention, the validate/write interleave, and — since the
 * gate's removal is itself behaviour — that a large request enumerates in full rather than being
 * refused. Without them a future "optimisation" could deduplicate the buckets, or reintroduce a
 * ceiling, and silently change the catalog.
 *
 * Test doubles are hand-written object literals: the legacy repository ships no mocking library at all
 * (AAP 0.4.3.6), and the ports are what make substitution possible without booting an application.
 */
import { SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE } from '../../src/domain/BaseProductType';
import { manageEntity } from '../../src/domain/base/populate';
import { Option } from '../../src/domain/option/Option';
import { OptionGroup } from '../../src/domain/option/OptionGroup';
import { Product } from '../../src/domain/product/Product';
import { ProductType } from '../../src/domain/product/ProductType';
import type { SkuImagePathResolver } from '../../src/domain/sku/Sku';
import { SKU_ENTITY_METADATA, SKU_UNSAVED_ID_VALUE, Sku } from '../../src/domain/sku/Sku';
import {
  ConfigurationError,
  DataIntegrityError,
  DomainError,
  LegacyParityError,
  NO_SINGLE_SKU_WITHOUT_SELECTED_OPTIONS_MESSAGE,
  NotImplementedError,
  UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE,
  moreThanOneSkuReturnedMessage,
  noSkusFoundForSelectedOptionsMessage,
} from '../../src/errors/DomainError';
import { ValidationError } from '../../src/errors/ValidationError';
import { PRODUCT_FEED_JOINS } from '../../src/integrations/google/ProductFeedQuery';
import {
  errorResponse,
  forbiddenResponse,
  unauthorizedResponse,
} from '../../src/handlers/httpResponse';
import type { SmartListQuery } from '../../src/ports/SmartListQueryPort';
import { resolveSmartListPropertyIdentifier } from '../../src/ports/SmartListQueryPort';
import type { ImageWebPath, SaveImageFileRequest } from '../../src/ports/ImagePathPort';
import { IMAGE_UPLOAD_ALLOWED_EXTENSIONS, toImageWebPath } from '../../src/ports/ImagePathPort';
import { SkuService, skuBatchHasErrors } from '../../src/services/SkuService';
import { createSlatwallUUID } from '../../src/util/uuid';

/**
 * Stands in for a collaborator this file's cases never reach.
 *
 * Every branch exercised here is the merchandise branch, which touches the SKU repository, the option
 * service, the validator, the product-type root resolver and the default-SKU binder and nothing else. A
 * collaborator that is never called needs no behaviour, and giving it one would suggest these cases
 * depend on it.
 *
 * ⚠️ THE SKU REPOSITORY USED TO BE ON THAT LIST, AND IT NO LONGER IS. It was genuinely unreached while
 * `createSkus` built and validated SKUs purely in memory — which was finding F01: no creation branch ever
 * persisted, so the next SKU's uniqueness read could not observe its predecessors and the M6 read-back
 * that AAP §0.6.2 calls the highest-risk item in the slice could not happen at all. The remediation added
 * {@link SkuRepository.persistSku} and a per-SKU await inside the creation loop, so the repository is now
 * on the hot path of every case below. See {@link makeService}.
 */
const UNREACHED_COLLABORATOR = {} as never;

/** One option group per index, each holding `perGroup` distinct options, plus the selection list. */
function buildOptionUniverse(
  groupCount: number,
  perGroup: number,
): { readonly options: Map<string, Option>; readonly selectionList: string } {
  const options = new Map<string, Option>();
  const selectedIds: string[] = [];

  for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
    const optionGroup = new OptionGroup();
    optionGroup.optionGroupID = `g${String(groupIndex)}`;

    for (let optionIndex = 0; optionIndex < perGroup; optionIndex++) {
      const option = new Option();
      option.optionID = `g${String(groupIndex)}o${String(optionIndex)}`;
      option.optionGroup = optionGroup;
      options.set(option.optionID, option);
      selectedIds.push(option.optionID);
    }
  }

  return { options, selectionList: selectedIds.join(',') };
}

interface ServiceUnderTest {
  readonly service: SkuService;
  /** One entry per SKU that reached validation, as `optionID+optionID` in the SKU's own option order. */
  readonly validatedOptionSets: string[];
  /** One entry per SKU that reached the repository, in the order it was written. */
  readonly persistedOptionSets: string[];
  /**
   * One entry per BATCH option lookup the merchandise walk issued, holding the distinct identifiers it
   * asked for. A comma-delimited selection of any length resolves in ONE batch, so this having exactly
   * one entry is the evidence that a repeated selection no longer costs a lookup per list position.
   */
  readonly optionLookupBatches: string[][];
  /**
   * Every SKU handed to the repository, BY REFERENCE and in write order.
   *
   * Kept alongside {@link ServiceUnderTest.persistedOptionSets} rather than replacing it because the
   * two answer different questions: the descriptions prove WHICH combinations were written, while these
   * references are needed to inspect what the write seam did TO each entity — specifically the
   * identifier assignment the F04 parity block below asserts.
   */
  readonly persistedSkus: Sku[];
  /**
   * Every validation and every write, interleaved in the order they happened, as `validate:<set>` and
   * `persist:<set>`.
   *
   * This is the M6 evidence AAP §0.6.2 asks for and {@link SkuService} names in its own contract: "a test
   * must be able to prove that EITHER naive ordering fails". Writing the whole batch after validating it,
   * or validating the whole batch before writing any of it, both produce a *sorted* trace — all the
   * validates then all the persists — whereas the legacy's per-SKU interleave produces the strictly
   * alternating trace asserted below. Neither naive ordering raises, neither fails to compile, and
   * neither is visible in the resulting SKU set, which is exactly why the ordering needs its own
   * assertion rather than being left to the counts.
   */
  readonly writeTrace: string[];
  /**
   * The `skuID` each SKU carried AT THE MOMENT the repository was handed it — DATA-01.
   *
   * Captured at persist time rather than read off `product.skus` afterwards, because the whole question
   * is WHEN the identifier exists. A SKU inspected after `createSkus` returns has one either way.
   */
  readonly persistedSkuIds: string[];
  /** The `skuID` each SKU carried at VALIDATION time, which is one step earlier. */
  readonly validatedSkuIds: string[];
}

function makeService(options: Map<string, Option>): ServiceUnderTest {
  const validatedOptionSets: string[] = [];
  const persistedOptionSets: string[] = [];
  const persistedSkus: Sku[] = [];
  const writeTrace: string[] = [];
  const persistedSkuIds: string[] = [];
  const validatedSkuIds: string[] = [];

  const describeOptions = (sku: Sku): string =>
    sku
      .getOptions()
      .map((option) => option.optionID)
      .join('+');

  /*
   * The write seam records the SKU it was asked to write and reports success.
   *
   * IT IS ITS OWN CONSTRUCTOR ARGUMENT, NOT A REPOSITORY MEMBER. `persistSku` is an
   * `EntityPersister<Sku>` callback; `src/ports/repositories/SkuRepository.ts` declares the seven
   * business queries of `model/dao/SkuDAO.cfc` and no write. Which is why the repository itself is
   * UNREACHED here and says so: the merchandise creation path reads nothing back through that port —
   * the uniqueness read the write makes visible belongs to the validator, doubled separately below.
   *
   * ⛔ IT MUST NOT BE REPLACED BY A NO-OP. The write is what makes each SKU visible to the NEXT SKU's
   * uniqueness read (M6 / F01); a double that silently swallows the call would let a future change delete
   * the await and still pass every case in this file.
   *
   * ⭐ F04 — IT ALSO ASSIGNS THE IDENTIFIER, BECAUSE THE ADAPTER DOES, AND THE DIVERGENCE THAT EXISTED
   * HERE IS WHY THE DEFECT SURVIVED A GREEN SUITE. `src/adapters/mysql/MySqlSkuRepository.ts` generates a
   * 32-character identifier on its insert branch — `model/entity/Sku.cfc:L52` declares
   * `fieldtype="id" generator="uuid"`, an instruction to the mapping layer to produce the value at save
   * time, and the legacy generator lives in the data-access layer at `model/dao/HibachiDAO.cfc`. An
   * earlier revision of the ADAPTER instead REFUSED any SKU carrying the unsaved sentinel, which made
   * every creation path in this file unreachable in production — while this double, implemented as a
   * bare recorder, accepted the same input happily and reported a pass. A double that is more permissive
   * than its adapter reports success for a path production cannot execute, so this one now performs the
   * same assignment, and the block at the end of this file asserts the result rather than trusting it.
   */
  const skuRepositoryDouble = {
    persistSku: (sku: Sku): Promise<void> => {
      /* Mirrors the adapter's insert branch: generate only while the entity is transient, so a
       * re-written SKU keeps the identifier its stored row is keyed on. */
      if (sku.isNew()) {
        sku.skuID = createSlatwallUUID();
      }
      const description = describeOptions(sku);
      persistedOptionSets.push(description);
      persistedSkuIds.push(sku.skuID);
      persistedSkus.push(sku);
      writeTrace.push(`persist:${description}`);
      return Promise.resolve();
    },
  } as never;

  /*
   * The option-service double answers BOTH lookup shapes, and the batch one is modelled rather than
   * faked: it collapses duplicates exactly as the real member does and records the identifier list it
   * was handed, so a test can prove how MANY statements the merchandise walk would have issued.
   *
   * ⛔ THE BATCH MEMBER MUST NOT SIMPLY DELEGATE PER IDENTIFIER TO `getOption`. Doing so would model a
   * collaborator production does not have and would make the one property these tests exist to protect
   * — that a repeated selection costs one lookup, not one per position — unobservable.
   *
   * ⚠️ AN IDENTIFIER WITH NO ENTRY IS OMITTED FROM THE MAP, not present holding `undefined`. That is the
   * real member's contract, and it is what lets the service treat absence as the null load of `[:L74]`.
   */
  const optionLookupBatches: string[][] = [];

  const optionServiceDouble = {
    getOption: (optionID: string): Promise<Option | undefined> =>
      Promise.resolve(options.get(optionID)),
    getOptionsByIDs: (optionIDs: readonly string[]): Promise<Map<string, Option>> => {
      const distinctIDs = [...new Set(optionIDs)];
      optionLookupBatches.push(distinctIDs);

      const resolved = new Map<string, Option>();
      for (const optionID of distinctIDs) {
        const option = options.get(optionID);
        if (option !== undefined) {
          resolved.set(optionID, option);
        }
      }

      return Promise.resolve(resolved);
    },
  } as never;

  /*
   * The validator double records the SKU it was handed and reports it clean. Recording here rather
   * than off `product.skus` is deliberate: it proves each SKU was fully built — options attached —
   * BEFORE validation saw it, which is the ordering AAP 0.6.2 makes load-bearing.
   */
  const validatorDouble = {
    validate: (sku: Sku): Promise<{ hasErrors: () => boolean }> => {
      const description = describeOptions(sku);
      validatedOptionSets.push(description);
      validatedSkuIds.push(sku.skuID);
      writeTrace.push(`validate:${description}`);
      return Promise.resolve({ hasErrors: (): boolean => false });
    },
  } as never;

  const productTypeRootResolverDouble = ((): undefined => undefined) as never;
  const defaultSkuBinderDouble = ((sku: Sku): Sku => sku) as never;

  const service = new SkuService(
    skuRepositoryDouble,
    optionServiceDouble,
    UNREACHED_COLLABORATOR,
    UNREACHED_COLLABORATOR,
    UNREACHED_COLLABORATOR,
    UNREACHED_COLLABORATOR,
    validatorDouble,
    productTypeRootResolverDouble,
    defaultSkuBinderDouble,
  );

  return {
    service,
    validatedOptionSets,
    persistedOptionSets,
    writeTrace,
    optionLookupBatches,
    persistedSkuIds,
    persistedSkus,
    validatedSkuIds,
  };
}

/**
 * A product whose base product type is the seeded merchandise discriminator.
 *
 * The UUID and system code come from `test/fixtures/productTypes`' source of truth,
 * `config/dbdata/SlatwallProductType.xml.cfm:L13-L15`, reused rather than retyped so IR-7
 * traceability holds.
 */
function makeMerchandiseProduct(): Product {
  const product = new Product();
  product.productID = 'p1';
  product.productCode = 'PC';

  const productType = new ProductType();
  productType.productTypeID = SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.merchandise.productTypeID;
  productType.systemCode = SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.merchandise.systemCode;
  product.productType = productType;

  return product;
}

describe('SkuService.createSkus — the odometer enumeration, exactly as the legacy produces it', () => {
  it('NET-NEW — model/service/SkuService.cfc:L110-L120 — indexedKeys[0] advances fastest', async () => {
    // Two groups of two options is the smallest shape in which a reversed odometer is detectable.
    const { options, selectionList } = buildOptionUniverse(2, 2);
    const { service, validatedOptionSets } = makeService(options);
    const product = makeMerchandiseProduct();

    await service.createSkus(product, { price: 10, options: selectionList });

    // The FIRST-SEEN group is the least significant wheel, so its option changes on every step.
    // Reversing this reverses the SKU sequence, the SKU codes and the default SKU.
    expect(validatedOptionSets).toEqual(['g0o0+g1o0', 'g0o1+g1o0', 'g0o0+g1o1', 'g0o1+g1o1']);
    expect(product.skus).toHaveLength(4);
  });

  it('NET-NEW — M6 — each SKU is WRITTEN before the next one is validated', async () => {
    /* AAP §0.6.2's read-back loop, asserted as an ordering rather than as a count. `hasUniqueOptions` is
     * a declarative rule in `model/validation/Sku.json` that runs a QUERY, so under Hibernate each SKU's
     * uniqueness check observed the siblings the session had already flushed. With no ORM session and no
     * automatic flush, that only holds if the port writes each SKU before validating the next — which is
     * the interleave below. A batch write, or a batch validation, would give the same four SKUs and the
     * same four validations in the same order, and would still be wrong. */
    const { options, selectionList } = buildOptionUniverse(2, 2);
    const { service, writeTrace, persistedOptionSets } = makeService(options);

    await service.createSkus(makeMerchandiseProduct(), { price: 10, options: selectionList });

    expect(writeTrace).toEqual([
      'validate:g0o0+g1o0',
      'persist:g0o0+g1o0',
      'validate:g0o1+g1o0',
      'persist:g0o1+g1o0',
      'validate:g0o0+g1o1',
      'persist:g0o0+g1o1',
      'validate:g0o1+g1o1',
      'persist:g0o1+g1o1',
    ]);
    /* Written in the odometer's own order, so the write sequence cannot silently diverge from the
     * enumeration the case above pins. */
    expect(persistedOptionSets).toEqual(['g0o0+g1o0', 'g0o1+g1o0', 'g0o0+g1o1', 'g0o1+g1o1']);
  });

  it('NET-NEW — model/service/SkuService.cfc:L101-L103 — the FIRST combination wins the default SKU', async () => {
    const { options, selectionList } = buildOptionUniverse(2, 2);
    const { service } = makeService(options);
    const product = makeMerchandiseProduct();

    await service.createSkus(product, { price: 10, options: selectionList });

    expect(product.defaultSku).toBeDefined();
  });

  it('NET-NEW — model/service/SkuService.cfc:L78 — DUPLICATE selections are RETAINED, not deduplicated', async () => {
    // `arrayAppend` appends unconditionally, so selecting one option three times genuinely produces a
    // three-element bucket and therefore three combinations. AAP 0.6.1.3 T1 requires the same
    // retention in the option-resolution query. Deduplicating would pass every count assertion in
    // this file while silently changing which SKUs exist — which is why this case is here.
    const { options } = buildOptionUniverse(1, 1);
    const { service, validatedOptionSets } = makeService(options);
    const product = makeMerchandiseProduct();

    await service.createSkus(product, { price: 10, options: 'g0o0,g0o0,g0o0' });

    expect(product.skus).toHaveLength(3);
    expect(validatedOptionSets).toEqual(['g0o0', 'g0o0', 'g0o0']);
  });

  it('NET-NEW — P2 — a THRICE-repeated selection costs ONE lookup, and still yields three SKUs', async () => {
    // The pair to the case above, asserting the OTHER half of the same behaviour. `[:L74]` issues one
    // primary-key load per LIST POSITION, so `g0o0,g0o0,g0o0` was three loads of one row. Batching must
    // collapse the STATEMENTS without collapsing the BUCKET: one lookup for one distinct identifier,
    // and still three combinations. If a future change deduplicated the walk instead of the lookup,
    // the first expectation would still pass and the second would fail — which is why both are here.
    const { options } = buildOptionUniverse(1, 1);
    const { service, validatedOptionSets, optionLookupBatches } = makeService(options);
    const product = makeMerchandiseProduct();

    await service.createSkus(product, { price: 10, options: 'g0o0,g0o0,g0o0' });

    expect(optionLookupBatches).toEqual([['g0o0']]);
    expect(validatedOptionSets).toEqual(['g0o0', 'g0o0', 'g0o0']);
  });

  it('NET-NEW — P2 — a WIDE selection resolves in ONE lookup, and the odometer order is unchanged', async () => {
    // Nine distinct options across three groups: the legacy would have issued nine primary-key loads.
    // One batch carries all nine, and the emission order is asserted in full rather than by count, so
    // this fails if batching ever perturbed the walk that builds `indexedKeys` or the buckets.
    const { options } = buildOptionUniverse(2, 2);
    const { service, validatedOptionSets, optionLookupBatches } = makeService(options);
    const product = makeMerchandiseProduct();

    await service.createSkus(product, { price: 10, options: 'g0o0,g0o1,g1o0,g1o1' });

    expect(optionLookupBatches).toEqual([['g0o0', 'g0o1', 'g1o0', 'g1o1']]);
    expect(validatedOptionSets).toEqual(['g0o0+g1o0', 'g0o1+g1o0', 'g0o0+g1o1', 'g0o1+g1o1']);
  });

  it('NET-NEW — P2 — an UNRESOLVABLE selection still raises on the FIRST bad identifier in list order', async () => {
    // The failure identity is the one observable batching could have disturbed: the batch resolves
    // every identifier at once, so it cannot itself decide which one is "first". The walk does, and it
    // walks in list order — so a list whose SECOND and THIRD entries are both unknown must report the
    // SECOND. Nothing is written before this point, so the raise leaves no partial product behind.
    const { options } = buildOptionUniverse(1, 1);
    const { service, validatedOptionSets } = makeService(options);
    const product = makeMerchandiseProduct();

    let raised: unknown;
    try {
      await service.createSkus(product, { price: 10, options: 'g0o0,absent-b,absent-c' });
    } catch (error: unknown) {
      raised = error;
    }

    expect(raised).toBeInstanceOf(DomainError);
    expect((raised as DomainError).message).toMatch(/A selected option does not exist/);
    // THE POINT OF THE CASE: `absent-b`, not `absent-c`, and not whichever the batch happened to miss
    // first. Asserting the identifier — not merely that something threw — is what pins list order.
    expect((raised as DomainError).context).toMatchObject({
      optionID: 'absent-b',
      locator: 'model/service/SkuService.cfc:L74',
    });
    expect(product.skus).toHaveLength(0);
    expect(validatedOptionSets).toHaveLength(0);
  });

  it('NET-NEW — model/service/SkuService.cfc:L64 — the no-options branch creates exactly one SKU', async () => {
    // `[:L64]` gates the whole combination block on a non-empty options list, so an absent list takes
    // the single-SKU path and never enumerates at all. The options universe is built and then ignored,
    // which is the point: nothing about the selection reaches this branch.
    const { options } = buildOptionUniverse(1, 1);
    const { service, validatedOptionSets } = makeService(options);
    const product = makeMerchandiseProduct();

    await service.createSkus(product, { price: 10 });

    expect(product.skus).toHaveLength(1);
    expect(validatedOptionSets).toHaveLength(1);
  });
});

describe('SkuService.createSkus — DATA-01, the identifier every SKU must carry', () => {
  /*
   * `model/entity/Sku.cfc:L52` declares `skuID` as
   * `fieldtype="id" generator="uuid" ormtype="string" length="32" unsavedvalue="" default=""`, so the
   * identifier is generated in APPLICATION code — never by the database (IR-6). Before the fix nothing
   * generated it on this path, so every SKU arrived at `persistSku` still holding the unsaved value and
   * the repository's guard refused all of them. `createSkus` reported success regardless, because the
   * write's outcome is not what the batch gates on.
   */
  it('NET-NEW — IR-6 — every SKU reaches the repository with a 32-character identifier', async () => {
    const { options, selectionList } = buildOptionUniverse(2, 2);
    const { service, persistedSkuIds } = makeService(options);

    await service.createSkus(makeMerchandiseProduct(), { price: 10, options: selectionList });

    expect(persistedSkuIds).toHaveLength(4);
    for (const skuID of persistedSkuIds) {
      /* 32 hex characters and no dashes — `createSlatwallUUID()`, not an RFC-4122 rendering. */
      expect(skuID).toMatch(/^[0-9a-f]{32}$/);
      expect(skuID).not.toBe(SKU_UNSAVED_ID_VALUE);
    }
  });

  it('NET-NEW — the identifiers are distinct, so the batch cannot collapse onto one row', async () => {
    /* Two groups of THREE options each, so the odometer enumerates 3 x 3 = 9 combinations. */
    const { options, selectionList } = buildOptionUniverse(2, 3);
    const { service, persistedSkuIds } = makeService(options);

    await service.createSkus(makeMerchandiseProduct(), { price: 10, options: selectionList });

    expect(persistedSkuIds).toHaveLength(9);
    /* A single shared identifier would make the batch overwrite one row nine times. */
    expect(new Set(persistedSkuIds).size).toBe(persistedSkuIds.length);
  });

  /*
   * THE PLACEMENT, ASSERTED AS AN ORDERING. The identifier is minted between validation and the write,
   * which is where Hibernate's flush-time generation sat. Minting it earlier would flip `Sku.isNew()` to
   * false while the graph was still being assembled and silently change `Sku.setProduct`'s decision about
   * whether to append the SKU to its product; minting it later is impossible, since the write needs it.
   * Both mistakes compile and neither raises, so the ordering needs its own case.
   */
  it('NET-NEW — the SKU is still unsaved at VALIDATION time and identified at WRITE time', async () => {
    const { options, selectionList } = buildOptionUniverse(2, 2);
    const { service, validatedSkuIds, persistedSkuIds } = makeService(options);

    await service.createSkus(makeMerchandiseProduct(), { price: 10, options: selectionList });

    /* Validation sees a genuinely new SKU, exactly as the legacy rule set does. */
    expect(validatedSkuIds).toEqual(['', '', '', '']);
    expect(validatedSkuIds.every((skuID) => skuID === SKU_UNSAVED_ID_VALUE)).toBe(true);
    /* One step later the same SKUs are identified. */
    expect(persistedSkuIds.every((skuID) => /^[0-9a-f]{32}$/.test(skuID))).toBe(true);
  });

  it('NET-NEW — the SKUs left on the product are the identified ones, not copies', async () => {
    const { options, selectionList } = buildOptionUniverse(2, 2);
    const { service, persistedSkuIds } = makeService(options);
    const product = makeMerchandiseProduct();

    await service.createSkus(product, { price: 10, options: selectionList });

    /* `Sku.setProduct` appended these while they were still new; the identifier was assigned in place, so
     * the product's collection must hold the very same identifiers the repository received. */
    /* `Product.skus` is declared as {@link ProductSkuMember}, a structural minimum that exposes only
     * `setProduct`/`removeProduct` — reading an identifier off it goes through `ProductSkuIdReader` in
     * production. Here the members are real `Sku` instances, so narrowing to the class is honest and
     * needs no reader. */
    const identifiersOnProduct = product.skus.map((sku) =>
      sku instanceof Sku ? sku.skuID : undefined,
    );
    expect(identifiersOnProduct).toEqual(persistedSkuIds);
  });
});

/**
 * The discriminator comparison at `model/service/SkuService.cfc:L61`, `:L139` and `:L173`.
 *
 * All three are CFML `==` on text operands, and CFML `==` FOLDS CASE, so a `SwProductType` row holding
 * `Merchandise` entered the merchandise branch. Nothing constrains the column to the seeded casing —
 * `systemCode` is a plain `varchar` with no check constraint and `model/validation/ProductType.json`
 * declares no format rule for it — so the differently-cased row is a legitimate input rather than a
 * hypothetical. A `===` comparison sent it to the fallthrough throw at [:L204] instead, which is why the
 * negative case below asserts the throw is still reachable for a genuinely unrecognised code.
 */
describe('SkuService.createSkus — the discriminator comparison folds case', () => {
  /*
   * Re-cases the stored `systemCode` without touching the seeded `productTypeID`: only the code is read
   * by the three branch tests, so re-casing the identifier as well would confuse two independent facts.
   * The product type is returned alongside the product because `Product.productType` is optional — the
   * legacy column is nullable — and the assertions need a non-optional reference to read back.
   */
  function makeProductWithStoredSystemCode(storedSystemCode: string): {
    readonly product: Product;
    readonly productType: ProductType;
  } {
    const product = makeMerchandiseProduct();
    const productType = new ProductType();
    productType.productTypeID = SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.merchandise.productTypeID;
    productType.systemCode = storedSystemCode;
    product.productType = productType;
    return { product, productType };
  }

  it('NET-NEW — model/service/SkuService.cfc:L61 — a differently-cased systemCode still creates SKUs', async () => {
    const { options } = buildOptionUniverse(1, 1);
    const { service, validatedOptionSets, persistedOptionSets } = makeService(options);
    const { product } = makeProductWithStoredSystemCode(
      SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.merchandise.systemCode.toUpperCase(),
    );

    await service.createSkus(product, { price: 10, options: 'g0o0' });

    expect(product.skus).toHaveLength(1);
    expect(validatedOptionSets).toEqual(['g0o0']);
    expect(persistedOptionSets).toEqual(['g0o0']);
  });

  it('NET-NEW — the stored systemCode is not rewritten by the comparison', async () => {
    const { options } = buildOptionUniverse(1, 1);
    const { service } = makeService(options);
    const storedSystemCode = 'MeRcHaNdIsE';
    const { product, productType } = makeProductWithStoredSystemCode(storedSystemCode);

    await service.createSkus(product, { price: 10, options: 'g0o0' });

    // Recognition answers with the canonical code; it must never write that answer back onto the row.
    expect(productType.systemCode).toBe(storedSystemCode);
  });

  it('NET-NEW — model/service/SkuService.cfc:L204 — an unrecognised code still reaches the fallthrough', async () => {
    const { options } = buildOptionUniverse(1, 1);
    const { service } = makeService(options);
    // Not a case variant of any seeded code, so folding case cannot rescue it.
    const { product } = makeProductWithStoredSystemCode('merchandising');

    await expect(service.createSkus(product, { price: 10, options: 'g0o0' })).rejects.toThrow(
      UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE,
    );
    expect(product.skus).toHaveLength(0);
  });
});

/* ================================================================================================
 * SEC-11 — WITHDRAWN. THE ENUMERATION IS UNBOUNDED, AND THE HAZARD IS FLAGGED INSTEAD
 *
 * ⛔ WHAT THESE CASES USED TO BE. Six cases pinned a `maximumCombinationsPerProduct` budget: an
 * inclusive boundary exactly AT the budget, a refusal above it, the shape of that refusal's diagnostic
 * context, an overflow refusal past `Number.MAX_SAFE_INTEGER`, and two constructor cases asserting the
 * budget was validated when the service graph was built. All six are gone, because every behaviour they
 * pinned is gone.
 *
 * ⛔ WHY. `model/service/SkuService.cfc:L82-L86` multiplies the group sizes with no check of any kind,
 * and `[:L89]` loops `for(var i = 1; i<=totalCombos; i++)` with no ceiling, so a refusal is an outcome
 * the legacy never produces. AAP §0.8.2 guideline 4 forbids enhancement beyond what the migration
 * requires; AAP §0.6.7 mandates "preserve and annotate, do not repair"; and D18 (AAP §0.6.7.7) is the
 * SOLE declared behaviour-hardening exception — a precedent only for a divergence that removes a flaw
 * class WITHOUT changing an outcome, which parameterised SQL does and a refusal does not. AAP §0.6.7.8
 * settles it a second time for this member specifically: the enumeration is to be ported EXACTLY,
 * "because the enumeration order determines both the generated SKU set and — through §0.6.2 — the order
 * in which uniqueness validation observes its siblings", and a gate that can stop the enumeration
 * before it starts is part of that behaviour rather than orthogonal to it. See THE UNBOUNDED CARTESIAN
 * ENUMERATION in `src/services/SkuService.ts` for the full withdrawal record.
 *
 * ⭐ WHAT REPLACES THEM: WITHDRAWAL REGRESSIONS — cases that FAIL if the gate is reinstated. An absence
 * cannot defend itself. A ceiling compiles, reads as prudent, and is invisible to every other case in
 * this file; the only thing that reveals it is a request that used to be serviced and stops being
 * serviced, which is exactly what these cases assert.
 *
 * ⚠️ ONE HAZARD DELIBERATELY HAS NO CASE, AND THE ABSENCE IS ITSELF THE EVIDENCE. Non-termination past
 * exact integer arithmetic — forty groups of forty options is 40^40, which saturates to `Infinity`, at
 * which point `combination < totalCombos` is permanently true — CANNOT be asserted here, because
 * asserting it means running it and running it never returns. The earlier revision could assert it only
 * because its own guard refused first. That this case had to be DELETED rather than inverted is how one
 * can tell the guard is really gone. The hazard is carried in the source register instead, together with
 * the observation that CFML numbers are IEEE-754 doubles too, so `[:L86]` loses precision identically
 * and `[:L89]` loops identically — the defect is the legacy's, and it is carried, not repaired.
 * ============================================================================================== */
describe('SkuService.createSkus — SEC-11 WITHDRAWN, no combination ceiling exists', () => {
  it('NET-NEW — WITHDRAWAL REGRESSION: a request the budget REFUSED is now serviced in full', async () => {
    /* Four groups of four options is 256 combinations — one past the 255 the deleted refusal case
     * configured precisely so it could watch the gate fire. Every one of the 256 is now constructed,
     * validated, written and attached, and the first of them still wins the default SKU, so the
     * withdrawal restored the legacy outcome without disturbing the enumeration. */
    const { options, selectionList } = buildOptionUniverse(4, 4);
    const { service, validatedOptionSets, persistedOptionSets } = makeService(options);
    const product = makeMerchandiseProduct();

    await service.createSkus(product, { price: 10, options: selectionList });

    expect(product.skus).toHaveLength(256);
    expect(validatedOptionSets).toHaveLength(256);
    expect(persistedOptionSets).toHaveLength(256);
    expect(product.defaultSku).toBeDefined();
  });

  it('NET-NEW — WITHDRAWAL REGRESSION: `createSkus` has no size-rejection path at all', async () => {
    /* Seven groups of three options is 2,187 combinations, past every budget the deleted cases
     * configured (256, 255, 10, and a constructor-validated 1,000). `resolves` rather than `rejects` is
     * the whole assertion: there is no `DomainError` to catch and no diagnostic context to inspect,
     * because there is no gate left to produce one. The value it resolves to is the vestigial
     * unconditional `true` of [model/service/SkuService.cfc:L207], asserted here only to show that the
     * method returned normally rather than being caught somewhere upstream. */
    const { options, selectionList } = buildOptionUniverse(7, 3);
    const { service, persistedOptionSets } = makeService(options);
    const product = makeMerchandiseProduct();

    await expect(service.createSkus(product, { price: 10, options: selectionList })).resolves.toBe(
      true,
    );

    expect(product.skus).toHaveLength(2187);
    expect(persistedOptionSets).toHaveLength(2187);
  });

  it('NET-NEW — WITHDRAWAL REGRESSION: the graph is built from NINE collaborators and validates none of them', () => {
    /* The two deleted constructor cases asserted that a malformed budget was rejected here — 0, -1,
     * 2.5, NaN and Infinity each raising "positive safe integer" — and that a well-formed one
     * constructed cleanly. There is no tenth argument left to be malformed, and this constructor now has
     * an empty body: it validates nothing and raises nothing. The arity is therefore the assertion, and
     * `Function.length` states it at runtime as well as `tsc` stating it at build time, so a
     * reinstatement would have to change this number to compile. */
    expect(SkuService.length).toBe(9);
    expect(
      () =>
        new SkuService(
          UNREACHED_COLLABORATOR,
          UNREACHED_COLLABORATOR,
          UNREACHED_COLLABORATOR,
          UNREACHED_COLLABORATOR,
          UNREACHED_COLLABORATOR,
          UNREACHED_COLLABORATOR,
          UNREACHED_COLLABORATOR,
          UNREACHED_COLLABORATOR,
          UNREACHED_COLLABORATOR,
        ),
    ).not.toThrow();
  });
});

/* ================================================================================================
 * SEC-09 — CLOSED SMARTLIST IDENTIFIERS
 *
 * The type system already refuses a fabricated literal: `{ propertyIdentifier: 'skuID) OR 1=1 --' }`
 * is a build error, which no runtime test can observe. What these cases pin is the RUNTIME half —
 * that a caller-supplied smart-list key is resolved against the declared whitelist and, when it does
 * not resolve, is DROPPED SILENTLY rather than passed through or raised.
 *
 * The silence is the parity requirement, not a softer option. Every legacy accumulator wraps its
 * append in a length test on the resolved property (filters at
 * org/Hibachi/HibachiSmartList.cfc:L369, like filters at :L396, in filters at :L422, ranges at :L449,
 * orders at :L480), so an unresolvable key yields a query with the entry missing and no error. See
 * DECISION S-1 in `src/ports/SmartListQueryPort.ts`.
 *
 * Every case is NET-NEW: AAP §0.6.5.2 records that no legacy `SkuDAOTest` or `SkuServiceTest` exists.
 * ============================================================================================== */

describe('resolveSmartListPropertyIdentifier — SEC-09, the whitelist', () => {
  it('NET-NEW — the reported injection payload does not resolve', () => {
    // The exact vector the review's runtime probe preserved unchanged: `F:skuID) OR 1=1 --`.
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'skuID) OR 1=1 --')).toBeUndefined();
  });

  it('NET-NEW — a real own property resolves to itself, unmodified', () => {
    // The value must come back byte-identical: this function decides membership, it does not
    // normalise. A trimmed or rewritten identifier would silently change the emitted column.
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'skuCode')).toBe('skuCode');
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'activeFlag')).toBe('activeFlag');
  });

  it('NET-NEW — every path the slice actually writes resolves', () => {
    // One assertion per legacy locator, so a whitelist regression names the caller it broke.
    // model/service/SkuService.cfc:L317
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'product.productName')).toBe(
      'product.productName',
    );
    // model/service/SkuService.cfc:L317 — the two-hop case
    expect(
      resolveSmartListPropertyIdentifier('SlatwallSku', 'product.productType.productTypeName'),
    ).toBe('product.productType.productTypeName');
    // model/service/SkuService.cfc:L321 — traverses into SlatwallAlternateSkuCode
    expect(
      resolveSmartListPropertyIdentifier('SlatwallSku', 'alternateSkuCodes.alternateSkuCode'),
    ).toBe('alternateSkuCodes.alternateSkuCode');
    // integrationServices/google/controllers/feed.cfc:L68-L72
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'product.activeFlag')).toBe(
      'product.activeFlag',
    );
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'product.calculatedQATS')).toBe(
      'product.calculatedQATS',
    );
    // model/entity/Product.cfc:L256 — the three-hop maximum, rooted at the option group
    expect(
      resolveSmartListPropertyIdentifier('SlatwallOptionGroup', 'options.skus.product.productID'),
    ).toBe('options.skus.product.productID');
    // model/service/ProductService.cfc:L352
    expect(resolveSmartListPropertyIdentifier('SlatwallProduct', 'brand.brandName')).toBe(
      'brand.brandName',
    );
  });

  it('NET-NEW — a misspelled or unknown property does not resolve', () => {
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'skuCod')).toBeUndefined();
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'password')).toBeUndefined();
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'product.nope')).toBeUndefined();
  });

  it('NET-NEW — a property of a DIFFERENT entity does not resolve against this root', () => {
    // This is the cross-entity confusion an open string permitted: `brandName` is real, but it is
    // not a property of SlatwallSku, and the legacy would not have resolved it there either.
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'brandName')).toBeUndefined();
    expect(resolveSmartListPropertyIdentifier('SlatwallOption', 'skuCode')).toBeUndefined();
  });

  it('NET-NEW — a path THROUGH an out-of-scope entity is dropped, per the traversal boundary', () => {
    // `subscriptionTerm` and `stocks` are real Sku relationships and resolve as properties in their
    // own right, but their target entities are excluded by AAP §0.2.2.1, so they are not traversable.
    // The legacy WOULD have resolved a path through them; declining on explicit AAP-exclusion grounds
    // is the documented narrowing recorded on SmartListEntityRelationships.
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'subscriptionTerm')).toBe(
      'subscriptionTerm',
    );
    expect(
      resolveSmartListPropertyIdentifier('SlatwallSku', 'subscriptionTerm.subscriptionTermID'),
    ).toBeUndefined();
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'stocks.stockID')).toBeUndefined();
  });

  it('NET-NEW — malformed paths are rejected without throwing', () => {
    for (const malformed of ['', '.', 'skuCode.', '.skuCode', 'product..productName', '..']) {
      expect(resolveSmartListPropertyIdentifier('SlatwallSku', malformed)).toBeUndefined();
    }
  });

  it('NET-NEW — the resolver imposes NO depth limit of its own', () => {
    // A five-segment path is longer than the literal union is generated to, and still resolves
    // because it is legal. The type depth is a compile-time convenience, not a policy bound.
    expect(
      resolveSmartListPropertyIdentifier(
        'SlatwallSku',
        'product.productType.parentProductType.parentProductType.productTypeName',
      ),
    ).toBe('product.productType.parentProductType.parentProductType.productTypeName');
  });
});

describe('SkuService.getSkuSmartList — SEC-09 end to end', () => {
  /** Captures the composed query instead of executing it, so the description can be asserted. */
  function makeService(): { readonly service: SkuService; readonly queries: SmartListQuery[] } {
    const queries: SmartListQuery[] = [];
    const smartListQueryPortDouble = {
      execute: (query: SmartListQuery): Promise<unknown> => {
        queries.push(query);
        return Promise.resolve({
          records: [],
          pageRecords: [],
          recordsCount: 0,
          pageRecordsStart: 1,
          pageRecordsEnd: 0,
        });
      },
    } as never;

    const service = new SkuService(
      UNREACHED_COLLABORATOR,
      UNREACHED_COLLABORATOR,
      UNREACHED_COLLABORATOR,
      UNREACHED_COLLABORATOR,
      UNREACHED_COLLABORATOR,
      smartListQueryPortDouble,
      UNREACHED_COLLABORATOR,
      UNREACHED_COLLABORATOR,
      UNREACHED_COLLABORATOR,
    );
    return { service, queries };
  }

  it('NET-NEW — an injected filter key reaches the port as NO filter at all', async () => {
    const { service, queries } = makeService();

    await service.getSkuSmartList({
      'F:skuID) OR 1=1 --': 'x',
      'FI:1=1': 'y',
      'FK:skuCode; DROP TABLE SwSku': 'z',
      'R:skuID) OR 1=1 --': '1^',
    });

    const query = queries[0];
    expect(query).toBeDefined();
    // Not merely absent from the filters — the whole where group collapses, because every entry in
    // it was unresolvable and therefore dropped.
    expect(query?.whereGroups ?? []).toEqual([]);
  });

  it('NET-NEW — a legal filter key still produces its filter, unchanged', async () => {
    const { service, queries } = makeService();

    await service.getSkuSmartList({ 'F:skuCode': 'ABC-1' });

    expect(queries[0]?.whereGroups?.[0]?.filters).toEqual([
      { propertyIdentifier: 'skuCode', value: 'ABC-1' },
    ]);
  });

  it('NET-NEW — legal and injected keys in ONE request: the legal one survives, the other vanishes', async () => {
    // The realistic shape of an attack: a valid filter carrying a hostile companion. Dropping the
    // whole request would be a behaviour change; dropping only the unresolvable entry is the legacy's
    // own behaviour.
    const { service, queries } = makeService();

    await service.getSkuSmartList({
      'F:skuCode': 'ABC-1',
      'F:skuID) OR 1=1 --': 'x',
    });

    expect(queries[0]?.whereGroups?.[0]?.filters).toEqual([
      { propertyIdentifier: 'skuCode', value: 'ABC-1' },
    ]);
  });

  it('NET-NEW — an injected OrderBy term is dropped; a legal one is kept', async () => {
    const { service, queries } = makeService();

    await service.getSkuSmartList({ OrderBy: 'skuCode; DROP TABLE SwSku|DESC' });
    expect(queries[0]?.orders ?? []).toEqual([]);

    const second = makeService();
    await second.service.getSkuSmartList({ OrderBy: 'skuCode|DESC' });
    expect(second.queries[0]?.orders).toEqual([
      { propertyIdentifier: 'skuCode', direction: 'DESC' },
    ]);
  });

  it('NET-NEW — the hard-coded joins and keyword properties are unaffected by the closure', async () => {
    // model/service/SkuService.cfc:L314-L321. These are compile-time literals, so the closure had to
    // leave every one of them still expressible; a whitelist that rejected them would not compile,
    // but asserting them here pins the pairing too.
    const { service, queries } = makeService();

    await service.getSkuSmartList();

    expect(queries[0]?.entityName).toBe('SlatwallSku');
    expect(queries[0]?.joins).toEqual([
      { parentEntityName: 'SlatwallSku', relatedProperty: 'product' },
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'productType' },
      { parentEntityName: 'SlatwallSku', relatedProperty: 'alternateSkuCodes', joinType: 'left' },
    ]);
    expect(queries[0]?.keywordProperties?.map((entry) => entry.propertyIdentifier)).toEqual([
      'skuCode',
      'skuID',
      'product.productName',
      'product.productType.productTypeName',
      'alternateSkuCodes.alternateSkuCode',
    ]);
  });

  it('NET-NEW — a caller\u2019s joins are APPENDED after the service\u2019s own, the repeat registering once', async () => {
    // The legacy composes the feed's join set in exactly this order: the service registers its own
    // three first at model/service/SkuService.cfc:L314-L316, and the caller mutates the returned smart
    // list to add three more at integrationServices/google/controllers/feed.cfc:L64-L66.
    //
    // Two properties are asserted because both are behaviour rather than convenience:
    //   ORDER — the caller's joins follow the service's, never precede them. Join order is significant
    //   and is carried by array position (org/Hibachi/HibachiSmartList.cfc:L9, :L536).
    //   THE REPEAT REGISTERS ONCE — feed join #1 repeats `SlatwallSku` → `product`, which :L314 already
    //   issued. This case previously asserted the duplicate was CARRIED, on decision Q4's open
    //   TODO(parity). Reading the second registration settled it: org/Hibachi/HibachiSmartList.cfc:L270
    //   appends to the join-order array and adds the entity ONLY when that entity is not already
    //   present, so the from-clause assembled from that array at :L536 names the join ONCE. Carrying
    //   the duplicate would emit a join the legacy never emits, so `product` appears once below — in
    //   the position its FIRST registration gave it.
    const { service, queries } = makeService();

    await service.getSkuSmartList(undefined, undefined, PRODUCT_FEED_JOINS);

    expect(queries[0]?.joins).toEqual([
      { parentEntityName: 'SlatwallSku', relatedProperty: 'product' },
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'productType' },
      { parentEntityName: 'SlatwallSku', relatedProperty: 'alternateSkuCodes', joinType: 'left' },
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'defaultSku' },
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'brand', joinType: 'left' },
    ]);
  });

  it('NET-NEW — omitting the third argument leaves the base join set exactly as it was', async () => {
    // The parameter is optional and defaults to contributing nothing, which is what keeps every
    // existing call site — five in the legacy, all argument-less — unaffected.
    const { service, queries } = makeService();

    await service.getSkuSmartList({ 'F:skuCode': 'ABC-1' });

    expect(queries[0]?.joins).toHaveLength(3);
  });
});

/* ================================================================================================
 * SEC-07 IS WITHDRAWN — the image path/upload boundary, asserted at LEGACY parity.
 *
 * All cases NET-NEW: AAP 0.6.5.2 records that no legacy `SkuServiceTest` exists, and a `grep` of
 * `test/**` before this block was first written found NO existing coverage of ANY image member.
 *
 * ⛔ WHAT THIS BLOCK USED TO ASSERT, AND WHY IT NO LONGER DOES. It pinned a seven-clause
 * `validateImageFileName` gate, a `processImageUpload` that RAISED on a stored name it judged invalid,
 * an existence probe that received the stored NAME rather than a composed path, and a save request that
 * carried a validated basename with no destination at all. Every one of those refused something the
 * legacy accepts:
 *   - `model/service/SkuService.cfc:L211-L212` composes a path from the unvalidated `imageFile` column
 *     and passes it as `filePath` to a member that WRITES;
 *   - `model/entity/Sku.cfc:L222` wraps the same composed value in `expandPath` and PROBES it.
 * `model/validation/Sku.json` declares no rule for `imageFile`, so nothing in the legacy inspects
 * either value. Refusing them changes an outcome, which AAP §0.8.2 guideline 4 forbids and which D18
 * (§0.6.7.7), the sole declared behaviour-hardening exception, does not license — D18 is a precedent for
 * removing a flaw class WITHOUT changing an outcome. `src/ports/ImagePathPort.ts` carries the withdrawal
 * and FLAGS the residual CWE-22 and CWE-434 exposure at those two locators for the operator to close
 * (S8). The cases below now pin the LEGACY behaviour, including the parts of it that are unpleasant.
 *
 * WHY THE ENTITY-LEVEL CASES LIVE IN A SERVICE TEST FILE. `test/domain/Sku.test.ts` is AAP
 * 0.4.1.12-enumerated and is the eventual owner of `Sku`'s own assertions, but it does not yet exist and
 * its AAP mandate is far broader than this boundary — the D1/D2/D3/D19 cluster, the two method-based
 * validation rules and the four inherited entity assertions all belong to it. Creating it containing
 * only image cases would deliver an enumerated file in a misleading, partial state. The behaviour under
 * test here is reached end-to-end through a port double either way, and `processImageUpload` is
 * unambiguously this file's member. The same reasoning placed the `src/util/urlTitle.ts` cases in
 * `test/services/BrandService.test.ts`.
 * ============================================================================================== */
describe('SkuService — the image path and upload boundary, at legacy parity', () => {
  /** The traversal vector an earlier revision refused, kept verbatim so the withdrawal is visible. */
  const TRAVERSAL_VECTOR = '../../../../tmp/payload.jpg';

  interface ImagePortCalls {
    readonly saved: SaveImageFileRequest[];
    readonly composed: string[];
    readonly probed: string[];
  }

  function makeImageService(saveSucceeds = true): {
    readonly service: SkuService;
    readonly calls: ImagePortCalls;
    /* Typed as the ENTITY'S OWN resolver shape, deliberately: `tsc` then proves the double satisfies
     * the real contract, so a case cannot pass against a double the production code would reject. */
    readonly port: SkuImagePathResolver;
  } {
    const calls: ImagePortCalls = { saved: [], composed: [], probed: [] };

    /*
     * The double composes exactly as `model/entity/Sku.cfc:146` composes — base URL, the hardcoded
     * segment, then the stored value — so the display assertions below are comparing against the legacy
     * construction rather than against a convenient stand-in.
     */
    const port = {
      getImagePath: (imageFile: string): Promise<ImageWebPath> => {
        calls.composed.push(imageFile);
        return Promise.resolve(toImageWebPath(`/assets/images/product/default/${imageFile}`));
      },
      getResizedImagePath: (): Promise<ImageWebPath> => Promise.resolve(toImageWebPath('/resized')),
      /* ⭐ THE PROBE RECORDS WHATEVER IT IS HANDED AND JUDGES NOTHING, which is the whole withdrawal.
       * A file "exists" here when the case seeded it, so the double cannot smuggle a policy back in. */
      getImageExistsFlag: (imagePath: ImageWebPath): Promise<boolean> => {
        calls.probed.push(imagePath);
        return Promise.resolve(existing.has(imagePath));
      },
      saveImageFile: (request: SaveImageFileRequest): Promise<boolean> => {
        calls.saved.push(request);
        return Promise.resolve(saveSucceeds);
      },
    };

    const service = new SkuService(
      UNREACHED_COLLABORATOR,
      UNREACHED_COLLABORATOR,
      UNREACHED_COLLABORATOR,
      UNREACHED_COLLABORATOR,
      /* NO CAST: the double satisfies the real `ImagePathPort` in full, all four members, so `tsc`
       * accepts it directly. That it needs no widening is itself part of the assertion. */
      port,
      UNREACHED_COLLABORATOR,
      UNREACHED_COLLABORATOR,
      UNREACHED_COLLABORATOR,
      UNREACHED_COLLABORATOR,
    );

    return { service, calls, port };
  }

  /** Composed paths the probe should answer `true` for. Seeded per case, never inferred. */
  const existing = new Set<string>();

  beforeEach(() => {
    existing.clear();
  });

  /** A SKU carrying whatever `imageFile` the case needs, as the column would hold it. */
  function makeSkuWithImageFile(imageFile: string | undefined): Sku {
    const sku = new Sku();
    sku.skuID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    if (imageFile !== undefined) {
      sku.imageFile = imageFile;
    }
    return sku;
  }

  /* ---- `processImageUpload` — [model/service/SkuService.cfc:L210-L218]. ----------------------- */

  it('NET-NEW — composes the path at :L211 and passes it as filePath at :L212', async () => {
    const { service, calls } = makeImageService();

    await expect(service.processImageUpload(makeSkuWithImageFile('shirt.jpg'), {})).resolves.toBe(
      true,
    );

    /* `:L211` reads `arguments.Sku.getImagePath()`, so the write path DOES compose — an earlier
     * revision asserted `calls.composed` was empty here, which was the hardening, not the legacy. */
    expect(calls.composed).toEqual(['shirt.jpg']);
    expect(calls.saved).toHaveLength(1);
    expect(calls.saved[0]?.filePath).toBe('/assets/images/product/default/shirt.jpg');
  });

  it('NET-NEW — forwards the allowed-extension list verbatim, in :L212 order', async () => {
    const { service, calls } = makeImageService();

    await service.processImageUpload(makeSkuWithImageFile('shirt.jpg'), {});

    expect(calls.saved[0]?.allowedExtensions).toBe('jpg,jpeg,png,gif');
    expect(calls.saved[0]?.allowedExtensions).toBe(IMAGE_UPLOAD_ALLOWED_EXTENSIONS);
  });

  it('NET-NEW — passes the upload result through opaquely, unread', async () => {
    const { service, calls } = makeImageService();
    const uploadResult = { serverFile: 'tmp-9f2.jpg', fileWasSaved: true };

    await service.processImageUpload(makeSkuWithImageFile('shirt.jpg'), uploadResult);

    // `:L212` forwards it without reading a single key, so the double receives it unchanged.
    expect(calls.saved[0]?.uploadResult).toStrictEqual(uploadResult);
  });

  it('NET-NEW — WITHDRAWAL REGRESSION: a traversal name is stored, not refused', async () => {
    const { service, calls } = makeImageService();

    /* This case exists to fail if the withdrawn gate is ever reinstated. `imageFile` carries no rule in
     * `model/validation/Sku.json`, so `:L211` composes the traversal into the path and `:L212` hands it
     * to the writer. The exposure is FLAGGED on `src/ports/ImagePathPort.ts`, not closed here. */
    await expect(
      service.processImageUpload(makeSkuWithImageFile(TRAVERSAL_VECTOR), {}),
    ).resolves.toBe(true);

    expect(calls.saved[0]?.filePath).toBe(`/assets/images/product/default/${TRAVERSAL_VECTOR}`);
  });

  it('NET-NEW — an absent imageFile still stores, against the empty trailing segment', async () => {
    const { service, calls } = makeImageService();

    /* CFML reads an unset property as the empty string, so `:L146` composes a path whose final segment
     * is empty and `:L212` passes exactly that. No raise: an earlier revision raised here. */
    await expect(service.processImageUpload(makeSkuWithImageFile(undefined), {})).resolves.toBe(
      true,
    );

    expect(calls.saved[0]?.filePath).toBe('/assets/images/product/default/');
  });

  it('NET-NEW — D24: the image service verdict is forwarded unchanged, false included', async () => {
    const { service } = makeImageService(false);

    /* `:L213-L217` narrows the image service's answer to `true`/`false` and returns it. The boolean IS
     * the observable contract, which is carried defect D24 — see the member. */
    await expect(service.processImageUpload(makeSkuWithImageFile('shirt.jpg'), {})).resolves.toBe(
      false,
    );
  });

  /* ---- display and existence — [model/entity/Sku.cfc:L145-L147] and [:L221-L227]. ------------- */

  it('NET-NEW — display composition accepts any stored value, exactly as the legacy does', async () => {
    // `model/entity/Sku.cfc:146` interpolates whatever is stored without inspecting it.
    const { port, calls } = makeImageService();
    const sku = makeSkuWithImageFile(TRAVERSAL_VECTOR);

    await expect(sku.getImagePath(port)).resolves.toBe(
      `/assets/images/product/default/${TRAVERSAL_VECTOR}`,
    );
    expect(calls.composed).toEqual([TRAVERSAL_VECTOR]);
  });

  it('NET-NEW — the existence probe receives the COMPOSED path, as :L222 probes with', async () => {
    const { port, calls } = makeImageService();
    existing.add('/assets/images/product/default/shirt.jpg');

    await expect(makeSkuWithImageFile('shirt.jpg').getImageExistsFlag(port)).resolves.toBe(true);

    /* `:L222` is `fileExists(expandPath(getImagePath()))` — compose first, probe second, in that order.
     * An earlier revision asserted the probe received the bare stored name and that nothing composed;
     * both assertions encoded the withdrawn hardening. */
    expect(calls.composed).toEqual(['shirt.jpg']);
    expect(calls.probed).toEqual(['/assets/images/product/default/shirt.jpg']);
  });

  it('NET-NEW — WITHDRAWAL REGRESSION: a traversal name reaches the probe composed', async () => {
    const { port, calls } = makeImageService();
    existing.add(`/assets/images/product/default/${TRAVERSAL_VECTOR}`);

    /* The legacy answers on the TRAVERSED file. This case pins that, so reinstating the withdrawn
     * `false`-on-refusal behaviour would fail here rather than pass silently. */
    await expect(makeSkuWithImageFile(TRAVERSAL_VECTOR).getImageExistsFlag(port)).resolves.toBe(
      true,
    );

    expect(calls.probed).toEqual([`/assets/images/product/default/${TRAVERSAL_VECTOR}`]);
  });

  it('NET-NEW — an unseeded path resolves false, which is :L225 and not a new state', async () => {
    const { port } = makeImageService();

    await expect(makeSkuWithImageFile('missing.jpg').getImageExistsFlag(port)).resolves.toBe(false);
    await expect(makeSkuWithImageFile(undefined).getImageExistsFlag(port)).resolves.toBe(false);
  });
});

/* ================================================================================================
 * SEC-05 — `src/handlers/httpResponse.ts`'s error mapping, and the parity boundary it now draws
 *
 * WHY THESE CASES LIVE HERE AND NOT IN `test/handlers/httpResponse.test.ts`. AAP §0.4.1.12 enumerates
 * NO `test/handlers/` directory, and `src/handlers/httpResponse.ts`'s own contract states the
 * consequence outright: "do not create a test file". Inventing an un-enumerated directory is exactly
 * the addition SCOPE-01 was raised about, so the cases go to an AAP-enumerated file. This one is the
 * right home on the merits: of the FOUR throw sites in the whole subtree that carry a legacy-mandated
 * message, one is `SkuService.createSkus`'s discriminator fallthrough, reproducing the throw at
 * [model/service/SkuService.cfc:L204] — and this file already owns that method's coverage. (The site is
 * named by member rather than by line: a line number into this subtree's own source goes stale on any
 * edit above it, and this one already had.) The other
 * three are `Product.getSkuBySelectedOptions`'s arity throws, asserted here through the exported
 * message helpers rather than duplicated into `test/domain/`.
 *
 * ⭐ WHAT IS ACTUALLY BEING PINNED. The mapping publishes a thrown message IF AND ONLY IF the throw
 * site declared it to be legacy behavior by raising `LegacyParityError`. The reason it is a TYPE and
 * not a flag or a text comparison is structural rather than statistical: a boolean option would have
 * been omittable at every raise in the subtree, and a message-text test would have been the error-code
 * registry S9 forbids AND could not have worked at all, because two of the four mandated strings
 * interpolate the caller's own option selection and so cannot be enumerated as literals. The subclass
 * makes disclosure default-deny, and these cases pin both halves — that the four mandated strings
 * still arrive verbatim, and that nothing else does.
 *
 * ⛔ AN EARLIER REVISION ARGUED THE SAME POINT FROM A CENSUS — "4 of the 47 `new DomainError(...)`
 * sites in the subtree carry a mandated string, and the other 43 carry diagnostics" — and that
 * sentence is withdrawn rather than re-counted. Both figures had already drifted well past the truth,
 * and they will drift again on any edit that adds or removes a raise, which makes a count the worst
 * possible support for a rule that must hold permanently. The mandated inventory is declared in ONE
 * place, `src/errors/DomainError.ts`, and the rule is stated positively above; neither depends on how
 * many diagnostics happen to exist alongside them.
 *
 * ⚠️ AND THE RULE IS ENFORCED AT THE RAISE, NOT HERE, WHICH MAKES A MISCLASSIFIED SITE A REAL DEFECT.
 * `errorResponse` acts on the TYPE, so a site raising `LegacyParityError` with a port-authored
 * diagnostic publishes that diagnostic verbatim. Exactly one such site existed — the D6 branch of
 * `ProductService.processProductAddSubscriptionTerm`, whose message named an internal legacy member,
 * the argument path `arguments.data.listPrice` and the defect identifier `D6` — and it now raises the
 * base class. The last case in the second describe below pins the shape of that correction here, where
 * the mapping lives, since constructing the product service's whole collaborator graph to reach one
 * throw would prove nothing this does not.
 *
 * TEST PROVENANCE: every case is **NET-NEW**.
 * ============================================================================================== */

describe('errorResponse — SEC-05, the four mandated legacy messages still arrive verbatim', () => {
  it('NET-NEW — model/service/SkuService.cfc:L204 — the createSkus fallthrough reaches the caller', () => {
    const result = errorResponse(new LegacyParityError(UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toStrictEqual({
      message: 'There was an unexpected error when creating this product',
    });
  });

  it('NET-NEW — model/entity/Product.cfc:L354 — the more-than-one message keeps its interpolation', () => {
    const result = errorResponse(new LegacyParityError(moreThanOneSkuReturnedMessage('red,large')));

    expect(JSON.parse(result.body)).toStrictEqual({
      message: 'More than one sku is returned when the selected options are: red,large',
    });
  });

  it('NET-NEW — model/entity/Product.cfc:L357 — the none-found message keeps its interpolation', () => {
    const result = errorResponse(
      new LegacyParityError(noSkusFoundForSelectedOptionsMessage('red,large')),
    );

    expect(JSON.parse(result.body)).toStrictEqual({
      message: 'No Skus are found for these selected options: red,large',
    });
  });

  it('NET-NEW — model/entity/Product.cfc:L361 — BOTH legacy misspellings survive byte for byte', () => {
    const result = errorResponse(
      new LegacyParityError(NO_SINGLE_SKU_WITHOUT_SELECTED_OPTIONS_MESSAGE),
    );

    // "seperated" and "indvidual" are the source's own spellings. Correcting either would be a
    // silent behavior change in an observable string.
    expect(JSON.parse(result.body)).toStrictEqual({
      message:
        'You must submit a comma seperated list of selectOptions to find an indvidual sku in this product',
    });
  });

  it('NET-NEW — SkuService.createSkus really raises the parity subclass, not the base class', async () => {
    const { options, selectionList } = buildOptionUniverse(1, 1);
    const { service } = makeService(options);
    const product = makeMerchandiseProduct();
    const productType = product.productType;

    // A systemCode that is none of the three seeded discriminators matches none of the three branches
    // and falls through to the throw at [model/service/SkuService.cfc:L204].
    if (productType !== undefined) {
      productType.systemCode = 'notADiscriminator';
    }

    await expect(
      service.createSkus(product, { price: 10, options: selectionList }),
    ).rejects.toBeInstanceOf(LegacyParityError);
  });
});

describe('errorResponse — SEC-05, everything else is masked', () => {
  it('NET-NEW — a plain DomainError is recognised by TYPE and its message is NOT published', () => {
    const leaky = new DomainError(
      'imageFile exceeds SwSku.imageFile length 50 while writing /var/task/storage/sku/abc.jpg',
      { context: { locator: 'model/entity/Sku.cfc:L145', column: 'SwSku.imageFile' } },
    );

    const result = errorResponse(leaky);

    // 500, NOT 400. The status is derived from the presentation the class declares about itself, and
    // `DomainError`'s deny-by-default presentation is `SERVICE_FAULT` — a failure the service is
    // answerable for and the caller cannot correct. A revision that pinned 400 here reported every
    // authored domain failure as though the caller had sent something wrong.
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toStrictEqual({
      message: 'The request could not be completed',
    });

    // The four categories the module's own contract forbids: a schema or table name, an internal
    // file path, a legacy source locator, and the diagnostic text itself.
    expect(result.body).not.toContain('SwSku');
    expect(result.body).not.toContain('/var/task');
    expect(result.body).not.toContain('Sku.cfc');
    expect(result.body).not.toContain('imageFile');
  });

  it('NET-NEW — SEC-01 — the parity type refuses an authored diagnostic at COMPILE time', () => {
    /* THIS ASSERTION IS THE TEST, and it is a compile-time one. `errorResponse` publishes a thrown
     * message verbatim on exactly one branch and selects that branch by type, so `LegacyParityError`
     * IS a disclosure authorisation. It used to be satisfied by any string, and a maintainer-facing
     * diagnostic in ProductService was raised on it and published word for word (CWE-209). The
     * constructor now takes `LegacyParityMessage`, which only the four verbatim legacy exports
     * satisfy. If anyone widens it back to `string`, the expectation below stops being violated and
     * `tsc` fails the build on an unused `@ts-expect-error`. */
    const authored = 'assigns from arguments.data.listPrice — SwProduct — ProductService.cfc:L181';

    // @ts-expect-error SEC-01 — a plain string is not a LegacyParityMessage and never will be.
    const construct = (): LegacyParityError => new LegacyParityError(authored);

    expect(construct).toBeInstanceOf(Function);
  });

  it('NET-NEW — API-03 — a ConfigurationError is a SERVER fault and is reported as one', () => {
    /* The regression this asserts: a mis-wired composition root used to be reported to the caller as
     * 400, i.e. as though the caller had sent something wrong. The classification travels with the
     * error class, so the status follows it without this branch inspecting a message. */
    const result = errorResponse(
      new ConfigurationError('optionService was not injected into SkuService'),
    );

    expect(result.statusCode).toBe(500);
    expect(Object.keys(JSON.parse(result.body) as object)).toStrictEqual(['message']);
    expect(result.body).not.toContain('optionService');
    expect(result.body).not.toContain('SkuService');
  });

  it('NET-NEW — API-03 — a DataIntegrityError is a SERVER fault and is reported as one', () => {
    /* Stored rows that contradict the model are not a client error either. Same mechanism, different
     * family: the presentation this class declares maps to 500, and its text is the neutral one the
     * class owns rather than one this module invented. */
    const result = errorResponse(
      new DataIntegrityError('SwSku.skuID matched two rows for one primary key'),
    );

    expect(result.statusCode).toBe(500);
    expect(Object.keys(JSON.parse(result.body) as object)).toStrictEqual(['message']);
    expect(result.body).not.toContain('SwSku');
    expect(result.body).not.toContain('skuID');
  });

  it('NET-NEW — a carried-defect diagnostic raised as the BASE class is masked, which is why the D6 branch no longer raises the parity subclass', () => {
    /* The exact message `ProductService.processProductAddSubscriptionTerm`'s D6 branch carries, and the
     * exact context it attaches. Raised as `LegacyParityError` it reached the caller verbatim, naming an
     * internal legacy member, an argument path and a carried-defect identifier — which contradicted
     * `src/handlers/httpResponse.ts`'s own invariant that the four mandated messages "name no member,
     * path, line or identifier". Raised as `DomainError` it takes BRANCH 4 and is masked. Nothing about
     * WHEN that branch raises changed; only what crosses the boundary did. */
    const result = errorResponse(
      new DomainError(
        'The legacy member guards on the process object but assigns from arguments.data.listPrice, ' +
          'and its signature declares no data argument, so the assignment cannot be performed. ' +
          'Carried unrepaired as defect D6.',
        {
          context: {
            defect: 'D6',
            locator: 'model/service/ProductService.cfc:L180-L182',
            assignedFrom: 'arguments.data.listPrice',
          },
        },
      ),
    );

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toStrictEqual({
      message: 'The request could not be completed',
    });
    expect(result.body).not.toContain('D6');
    expect(result.body).not.toContain('ProductService.cfc');
    expect(result.body).not.toContain('arguments.data.listPrice');
  });

  it('NET-NEW — a DomainError context object never reaches the body under any key', () => {
    const result = errorResponse(
      new DomainError('diagnostic', { context: { secretish: 'DB_PASSWORD', table: 'SwProduct' } }),
    );

    expect(Object.keys(JSON.parse(result.body) as object)).toStrictEqual(['message']);
    expect(result.body).not.toContain('DB_PASSWORD');
    expect(result.body).not.toContain('SwProduct');
  });

  it('NET-NEW — NotImplementedError publishes neither its message nor its member identifier', () => {
    const result = errorResponse(
      new NotImplementedError(
        'SkuService.getSkuStocksDeletableFlag',
        'carried defect D4 — model/service/SkuService.cfc:L281-L283 delegates to a DAO member that exists nowhere',
      ),
    );

    expect(result.statusCode).toBe(501);
    expect(JSON.parse(result.body)).toStrictEqual({
      message: 'This operation is not implemented',
    });

    // The status alone reports the boundary; the identifier and the locator stay server-side.
    expect(result.body).not.toContain('getSkuStocksDeletableFlag');
    expect(result.body).not.toContain('D4');
    expect(result.body).not.toContain('SkuService.cfc');
    expect(Object.keys(JSON.parse(result.body) as object)).toStrictEqual(['message']);
  });

  it('NET-NEW — the ordering is load-bearing: a ValidationError is NOT caught by the DomainError branch', () => {
    const error = new ValidationError();
    error.addError('skuCode', 'Sku Code is required');
    error.addError('price', 'Price must be at least 0');

    const result = errorResponse(error);

    // AAP §0.4.1.11 requires the legacy error-key structure to survive unchanged, so this is the one
    // branch that publishes a structured body. `ValidationError extends DomainError`, so testing the
    // base class first would have masked every validation failure as a generic refusal.
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toStrictEqual({
      message: 'Validation failed',
      errors: {
        skuCode: ['Sku Code is required'],
        price: ['Price must be at least 0'],
      },
    });
  });

  it('NET-NEW — LegacyParityError is a DomainError, so its branch must precede the base branch too', () => {
    const error = new LegacyParityError(UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE);

    expect(error).toBeInstanceOf(DomainError);
    expect(error.name).toBe('LegacyParityError');
    // Proven by the published message: if the base branch ran first, this would be masked.
    expect(JSON.parse(errorResponse(error).body)).toStrictEqual({
      message: 'There was an unexpected error when creating this product',
    });
  });

  it('NET-NEW — an error this port did not raise is masked at 500 and discloses nothing', () => {
    for (const thrown of [
      new TypeError('Converting circular structure to JSON'),
      new Error('connect ECONNREFUSED 127.0.0.1:3306'),
      'a thrown string',
      undefined,
    ]) {
      const result = errorResponse(thrown);

      expect(result.statusCode).toBe(500);
      expect(Object.keys(JSON.parse(result.body) as object)).toStrictEqual(['message']);
      expect(result.body).not.toContain('3306');
      expect(result.body).not.toContain('circular');
    }
  });

  it('NET-NEW — the status is DERIVED from the presentation, so an overriding subclass is honoured', () => {
    // ConfigurationError and DataIntegrityError exist solely to declare a different presentation from
    // the base class. Reading `getPublicError()` at the boundary is what makes that declaration
    // observable; restating a fixed status and a fixed text there discarded it silently.
    const configuration = errorResponse(
      new ConfigurationError('DB_HOST is not set in the deployment environment', {
        context: { variable: 'DB_HOST' },
      }),
    );

    expect(configuration.statusCode).toBe(500);
    expect(JSON.parse(configuration.body)).toStrictEqual({
      message: 'The service is not correctly configured',
    });
    expect(configuration.body).not.toContain('DB_HOST');

    const data = errorResponse(
      new DataIntegrityError('Column "skuID" is absent from the result set', {
        context: { columnName: 'skuID' },
      }),
    );

    expect(data.statusCode).toBe(500);
    expect(JSON.parse(data.body)).toStrictEqual({
      message: 'The request could not be completed from the stored data',
    });
    expect(data.body).not.toContain('skuID');
  });

  it('NET-NEW — LegacyParityError keeps its declared 400 even though it declares no presentation', () => {
    // The one exception to the derivation above, and it is deliberate: the subclass adds no member, so
    // it inherits the deny-by-default SERVICE_FAULT presentation, which would map to 500. A mandated
    // legacy text describes a caller-correctable option selection, so the branch pins 400 instead.
    const result = errorResponse(new LegacyParityError(UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE));

    expect(result.statusCode).toBe(400);
    expect(
      new LegacyParityError(UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE).getPublicError().code,
    ).toBe('SERVICE_FAULT');
  });

  it('NET-NEW — no failure body ever publishes a classification code', () => {
    // S9 forbids inventing classification surface the source does not state, and the nine codes are
    // this port's own invention with no counterpart in model/**. They decide the status and stop there.
    for (const thrown of [
      new DomainError('diagnostic'),
      new ConfigurationError('diagnostic'),
      new DataIntegrityError('diagnostic'),
      new NotImplementedError('SkuService.processImageUpload', 'reason'),
      new LegacyParityError(UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE),
      new TypeError('not ours'),
    ]) {
      const body: unknown = JSON.parse(errorResponse(thrown).body);

      expect(Object.keys(body as object)).toStrictEqual(['message']);
      expect(errorResponse(thrown).body).not.toContain('SERVICE_FAULT');
      expect(errorResponse(thrown).body).not.toContain('CATALOG_REQUEST_REJECTED');
    }
  });

  it('NET-NEW — no error response ever carries a stack trace, however it was raised', () => {
    const withCause = new DomainError('outer', {
      cause: new Error('inner with a stack'),
      context: { path: '/var/task/inner' },
    });

    const result = errorResponse(withCause);

    expect(result.body).not.toContain('stack');
    expect(result.body).not.toContain('at ');
    expect(result.body).not.toContain('/var/task');
  });

  it('NET-NEW — the two authorisation refusals are fixed texts with no scheme and no echo', () => {
    expect(unauthorizedResponse()).toStrictEqual({
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Authentication is required' }),
    });

    expect(forbiddenResponse()).toStrictEqual({
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Not authorized' }),
    });

    // RFC 9110 associates a WWW-Authenticate header with 401, but naming a scheme would invent an
    // authentication mechanism this deliverable does not implement (S9).
    expect(Object.keys(unauthorizedResponse().headers ?? {})).toStrictEqual(['Content-Type']);
  });
});

/*
 * ==================================================================================================
 * P14 — THE SORTED-SKU REORDERING
 *
 * `model/service/SkuService.cfc:L237` and `[:L262]` both reorder a product's SKUs into the order the
 * sorted-identifier query returns, and both located each SKU with `arrayFind` INSIDE the per-SKU loop.
 * The port indexes the ordering once instead. These cases pin the three properties that change would
 * have been able to break silently, since no legacy test covers either path (AAP §0.6.5.2).
 * ==================================================================================================
 */

/** A SKU carrying one option, which is what makes the sorted path reachable at `[:L224]`. */
function makeOptionBearingSku(skuID: string): Sku {
  const sku = new Sku();
  sku.skuID = skuID;

  const optionGroup = new OptionGroup();
  optionGroup.optionGroupID = `og-${skuID}`;
  const option = new Option();
  option.optionID = `o-${skuID}`;
  option.optionGroup = optionGroup;
  sku.addOption(option);

  return sku;
}

/** A service whose SKU repository answers the two reads the sorted paths make, and nothing else. */
function makeSortingService(skus: readonly Sku[], sortedSkuIds: readonly string[]): SkuService {
  const skuRepositoryDouble = {
    findByProduct: (): Promise<Sku[]> => Promise.resolve([...skus]),
    findSortedSkuIdsByProduct: (): Promise<string[]> => Promise.resolve([...sortedSkuIds]),
  } as never;

  return new SkuService(
    skuRepositoryDouble,
    UNREACHED_COLLABORATOR,
    UNREACHED_COLLABORATOR,
    UNREACHED_COLLABORATOR,
    UNREACHED_COLLABORATOR,
    UNREACHED_COLLABORATOR,
    UNREACHED_COLLABORATOR,
    ((): undefined => undefined) as never,
    ((sku: Sku): Sku => sku) as never,
  );
}

describe('SkuService sorted paths — P14, the ordering index', () => {
  it('NET-NEW — model/service/SkuService.cfc:L237 — SKUs are returned in the ordering position order', async () => {
    // The base case the index must not disturb: the ordering is authoritative and the supplied order
    // is irrelevant. Supplying the SKUs in the exact reverse of the ordering makes that observable.
    const skus = [
      makeOptionBearingSku('s3'),
      makeOptionBearingSku('s2'),
      makeOptionBearingSku('s1'),
    ];
    const service = makeSortingService(skus, ['s1', 's2', 's3']);

    const ordered = await service.getProductSkus(makeMerchandiseProduct(), true);

    expect(ordered.map((sku) => sku.skuID)).toEqual(['s1', 's2', 's3']);
  });

  it('NET-NEW — P14 — a DUPLICATED ordering entry still resolves to its FIRST position, and raises', async () => {
    // THE CASE A NAIVE MAP BREAKS. `arrayFind`/`indexOf` return the EARLIEST match, so with the
    // ordering ['s1','s1','s2'] both SKUs claim positions 0 and 2, position 1 is never claimed, and the
    // completeness guard reports it. A map assigning unconditionally would keep the LAST position for
    // 's1', claim positions 1 and 2, leave position 0 unclaimed — still raising, but naming the WRONG
    // position — so the assertion below is on the position, not merely on the failure.
    const skus = [makeOptionBearingSku('s1'), makeOptionBearingSku('s2')];
    const service = makeSortingService(skus, ['s1', 's1', 's2']);

    let raised: unknown;
    try {
      await service.getProductSkus(makeMerchandiseProduct(), true);
    } catch (error: unknown) {
      raised = error;
    }

    expect(raised).toBeInstanceOf(DomainError);
    expect((raised as DomainError).context).toMatchObject({ position: 1, defect: 'D13' });
  });

  it('NET-NEW — D13 — a SKU absent from the ordering still raises, carried unrepaired', async () => {
    // D13 itself: `getSortedProductSkusID` returns option-bearing SKUs only, so a SKU outside the
    // ordering reaches `arrayFind` and gets 0 — fatal in a one-based array. The index reproduces it by
    // being absent, and the SKU that failed is named.
    const skus = [makeOptionBearingSku('s1'), makeOptionBearingSku('unlisted')];
    const service = makeSortingService(skus, ['s1', 's2']);

    let raised: unknown;
    try {
      await service.getProductSkus(makeMerchandiseProduct(), true);
    } catch (error: unknown) {
      raised = error;
    }

    expect(raised).toBeInstanceOf(DomainError);
    expect((raised as DomainError).context).toMatchObject({ skuID: 'unlisted', defect: 'D13' });
  });

  it('NET-NEW — model/service/SkuService.cfc:L224 — an OPTION-LESS first SKU short-circuits before any ordering read', async () => {
    // The gate ahead of the reorder, asserted so the index is never reached for a product that the
    // legacy returns untouched. An ordering that would raise proves the read never happened.
    const optionLessSku = new Sku();
    optionLessSku.skuID = 'plain-1';
    const secondSku = new Sku();
    secondSku.skuID = 'plain-2';
    const service = makeSortingService([optionLessSku, secondSku], ['nothing-matches']);

    const ordered = await service.getProductSkus(makeMerchandiseProduct(), true);

    expect(ordered.map((sku) => sku.skuID)).toEqual(['plain-1', 'plain-2']);
  });
});

/**
 * A SKU service whose only live collaborator records how `transactionExists` was called.
 *
 * @param answer - What the repository reports, so a case can assert the boolean is returned unchanged.
 */
function makeTransactionExistenceService(answer = false): {
  readonly service: SkuService;
  readonly calls: { productID?: string | undefined; skuID?: string | undefined }[];
} {
  const calls: { productID?: string | undefined; skuID?: string | undefined }[] = [];

  const skuRepositoryDouble = {
    transactionExists: (productID?: string, skuID?: string): Promise<boolean> => {
      calls.push({ productID, skuID });
      return Promise.resolve(answer);
    },
  } as never;

  const service = new SkuService(
    skuRepositoryDouble,
    UNREACHED_COLLABORATOR,
    UNREACHED_COLLABORATOR,
    UNREACHED_COLLABORATOR,
    UNREACHED_COLLABORATOR,
    UNREACHED_COLLABORATOR,
    UNREACHED_COLLABORATOR,
    UNREACHED_COLLABORATOR,
    UNREACHED_COLLABORATOR,
  );

  return { service, calls };
}

describe('SkuService.getTransactionExistsFlag — D23 identifier forwarding (API-02)', () => {
  it('NET-NEW — model/entity/Sku.cfc:L594 — a SKU identifier reaches the repository', async () => {
    const { service, calls } = makeTransactionExistenceService();

    await service.getTransactionExistsFlag('sku-1');

    /* ⭐ THE SWAP IS THE ASSERTION. This member is `(skuID?, productID?)` and the repository is
     * `(productID?, skuID?)`, so a SKU identifier must arrive in the SECOND slot with the first empty.
     * Both identifiers are 32-character strings (IR-6), so an inverted forward type-checks perfectly and
     * would compare a SKU id against `SwSku.productID` — matching nothing, answering `false`, and
     * PERMITTING a delete the legacy blocks. Asserting the slots, not just "it was called", is what
     * makes that unrepresentable. */
    expect(calls).toEqual([{ productID: undefined, skuID: 'sku-1' }]);
  });

  it('NET-NEW — model/entity/Product.cfc:L626 — a product identifier reaches the repository', async () => {
    const { service, calls } = makeTransactionExistenceService();

    // The product-side caller leaves the SKU slot empty, so the product lands in the FIRST slot.
    await service.getTransactionExistsFlag(undefined, 'prod-1');

    expect(calls).toEqual([{ productID: 'prod-1', skuID: undefined }]);
  });

  it('NET-NEW — model/dao/SkuDAO.cfc:L58-L64 — both supplied forwards both, SKU precedence intact', async () => {
    const { service, calls } = makeTransactionExistenceService();

    await service.getTransactionExistsFlag('sku-1', 'prod-1');

    /* The service does not choose between them — the DAO's `structKeyExists(arguments,"skuID")` branch
     * does, and `MySqlSkuRepository.transactionExists` reproduces that. Both must therefore arrive. */
    expect(calls).toEqual([{ productID: 'prod-1', skuID: 'sku-1' }]);
  });

  it('NET-NEW — the repository’s answer is returned unchanged, not re-derived', async () => {
    const { service } = makeTransactionExistenceService(true);

    await expect(service.getTransactionExistsFlag('sku-1')).resolves.toBe(true);
  });

  it('NET-NEW — AAP 0.4.2.2 Discrepancy 4 — the zero-argument CALL FORM is still legal', async () => {
    const { service, calls } = makeTransactionExistenceService();

    /* The frozen shape still compiles and still runs. What it forwards is nothing, which is why
     * `MySqlSkuRepository.transactionExists` raises — parity with the legacy's unbound `:productID`
     * at [model/dao/SkuDAO.cfc:L90]. That failure is the repository's to raise, not this member's. */
    await service.getTransactionExistsFlag();

    expect(calls).toEqual([{ productID: undefined, skuID: undefined }]);
  });
});

/**
 * A SKU carrying the error bag `manageEntity` attaches.
 *
 * `Sku` itself declares no error surface — {@link SkuWithErrorState} is `ManagedEntity<Sku>`, and the bag
 * comes from `manageEntity` rather than from the class. Building the managed form is therefore not a
 * convenience here; it is the only shape whose findings the commit gate can read, and it is exactly what
 * `SkuService.newSku` produces.
 */
function makeManagedSku(): ReturnType<SkuService['newSku']> {
  return manageEntity(new Sku(), SKU_ENTITY_METADATA);
}

describe('skuBatchHasErrors — the complete commit gate (TX-01)', () => {
  it('NET-NEW — a clean batch reports no findings', () => {
    const product = makeMerchandiseProduct();
    product.skus = [makeManagedSku(), makeManagedSku()];

    expect(skuBatchHasErrors(product)).toBe(false);
  });

  it('NET-NEW — a finding on the PRODUCT is reported', () => {
    const product = makeMerchandiseProduct();
    product.addError('productType', 'Options cannot be added to this product type.');

    expect(skuBatchHasErrors(product)).toBe(true);
  });

  it('NET-NEW — ⭐ a finding on a SKU ALONE is reported, which product.hasErrors() cannot see', () => {
    const product = makeMerchandiseProduct();
    const clean = makeManagedSku();
    const failed = makeManagedSku();
    failed.addError('skuCode', 'This SKU code is already in use.');
    product.skus = [clean, failed];

    /* THE CASE THAT DEFINES THIS HELPER. Per-SKU rule findings deliberately never merge onto the
     * product, and `createSkus` returns `true` unconditionally, so for the commonest failure there is —
     * colliding SKU codes — the product's bag is EMPTY and the return value says success. A gate reading
     * only the product would commit the batch. */
    expect(product.hasErrors()).toBe(false);
    expect(skuBatchHasErrors(product)).toBe(true);
  });

  it('NET-NEW — a member with no error surface is skipped rather than crashing the gate', () => {
    const product = makeMerchandiseProduct();
    /* `Product.skus` is typed `ProductSkuMember[]`, a two-member interface, so a member carrying no
     * error bag is representable. The gate inspects capability, not class. */
    product.skus = [{ setProduct: (): void => undefined, removeProduct: (): void => undefined }];

    expect(skuBatchHasErrors(product)).toBe(false);
  });
});

/*
 * ==================================================================================================
 * F04 — THE WRITE SEAM ASSIGNS AN IDENTIFIER, AND EVERY SKU IN A BATCH GETS A DISTINCT ONE
 * ==================================================================================================
 * These are PARITY ASSERTIONS in the sense the review's own Areas of Concern asks for: a green suite
 * previously coexisted with a production path that could not execute, because the adapter refused a
 * transient SKU while this file's double accepted one. Asserting the identifier explicitly is what
 * stops that pairing from recurring — a future revision that reinstates the refusal, or that removes
 * the generation, fails here rather than passing quietly.
 *
 * The shape is not invented. `model/entity/Sku.cfc:L52` declares
 * `ormtype="string" length="32" fieldtype="id" generator="uuid" unsavedvalue=""`, and AAP IR-6 records
 * that 107 of 113 legacy entities declare exactly that, so the value is 32 lowercase hexadecimal
 * characters with NO DASHES. `/^[0-9a-f]{32}$/` is that declaration, written as a predicate.
 */
describe('SkuService.createSkus — F04 identifier assignment at the write seam', () => {
  const IDENTIFIER_SHAPE = /^[0-9a-f]{32}$/;

  it('NET-NEW — F04 PARITY: every SKU reaching the repository carries a 32-char lowercase-hex ID', async () => {
    const { options, selectionList } = buildOptionUniverse(2, 2);
    const { service, persistedSkus } = makeService(options);

    await service.createSkus(makeMerchandiseProduct(), { price: 10, options: selectionList });

    expect(persistedSkus).toHaveLength(4);
    for (const sku of persistedSkus) {
      expect(sku.skuID).toMatch(IDENTIFIER_SHAPE);
      /* The sentinel `model/entity/Sku.cfc:L52` declares as `unsavedvalue=""`, restated through the
       * entity's own predicate so this does not depend on the literal. */
      expect(sku.isNew()).toBe(false);
    }
  });

  it('NET-NEW — F04 PARITY: identifiers are DISTINCT across the batch, not one value reused', async () => {
    const { options, selectionList } = buildOptionUniverse(2, 3);
    const { service, persistedSkus } = makeService(options);

    await service.createSkus(makeMerchandiseProduct(), { price: 10, options: selectionList });

    expect(persistedSkus).toHaveLength(9);
    const identifiers = new Set(persistedSkus.map((sku) => sku.skuID));
    expect(identifiers.size).toBe(9);
  });

  it('NET-NEW — F04 PARITY: the no-options branch also receives an identifier', async () => {
    /* `model/service/SkuService.cfc:L64` creates exactly one SKU when no options are selected. That
     * branch reaches the same write seam, so it must be covered too — an identifier assigned only on
     * the odometer path would leave the single-SKU product unsaveable. */
    const { options } = buildOptionUniverse(1, 1);
    const { service, persistedSkus } = makeService(options);

    await service.createSkus(makeMerchandiseProduct(), { price: 10 });

    expect(persistedSkus).toHaveLength(1);
    expect(persistedSkus[0]?.skuID).toMatch(IDENTIFIER_SHAPE);
  });
});

/* ==================================================================================================
 * F07 — EXACT DECIMAL FIDELITY AT THE WRITE SEAM. NET-NEW.
 * ==================================================================================================
 * `model/entity/Sku.cfc:L55-L57` declares `listPrice`, `price` and `renewalPrice` as
 * `ormtype="big_decimal"`, which Hibernate mapped to a Java `BigDecimal` — exact, arbitrary precision.
 * The port carried them as IEEE-754 doubles, so a legacy-valid amount was ROUNDED on its way to the
 * bind site while the read mapper simultaneously refused to accept such a value coming back.
 *
 * These assertions sit at the seam the finding names: what `createSkus` hands the repository. They fail
 * if the domain fields return to `number`, if the coercion goes back through `Number(...)`, or if the
 * list-price guard is rewritten with a `>` between two branded strings.
 * ================================================================================================ */
describe('SkuService.createSkus — F07 exact decimal fidelity', () => {
  it('NET-NEW — F07 PARITY: a price no double can hold reaches the repository digit for digit', async () => {
    /* THE FINDING'S OWN EXAMPLE. `Number('9007199254740993.01')` is 9007199254740994, so a port that
     * coerces to a double writes an amount the caller never sent — with no error anywhere. */
    const exactPrice = '9007199254740993.01';
    const { options } = buildOptionUniverse(1, 1);
    const { service, persistedSkus } = makeService(options);

    await service.createSkus(makeMerchandiseProduct(), { price: exactPrice });

    expect(persistedSkus).toHaveLength(1);
    expect(persistedSkus[0]?.price).toBe(exactPrice);
    expect(persistedSkus[0]?.price).not.toBe(String(Number(exactPrice)));
  });

  it('NET-NEW — F07 PARITY: the supplied scale is preserved, and no scale is imposed', async () => {
    /* Scale is what the database supplied, so `'100.00'` stays `'100.00'`; and because no scale is
     * INVENTED (AAP §0.7.3 S9 — nothing in the repository declares one), `'50'` stays `'50'`. */
    const { options } = buildOptionUniverse(1, 1);

    const scaled = makeService(options);
    await scaled.service.createSkus(makeMerchandiseProduct(), { price: '100.00' });
    expect(scaled.persistedSkus[0]?.price).toBe('100.00');

    const unscaled = makeService(options);
    await unscaled.service.createSkus(makeMerchandiseProduct(), { price: '50' });
    expect(unscaled.persistedSkus[0]?.price).toBe('50');
  });

  it('NET-NEW — F07 PARITY: a non-numeric price becomes the sentinel rather than raising', async () => {
    /* THE `NaN`-NOT-EXCEPTION CONTRACT, PRESERVED THROUGH THE REPRESENTATION CHANGE.
     * `newSku.setPrice(arguments.data.price)` at [model/service/SkuService.cfc:L93] is a generated
     * setter with no declared type, so CFML stores whatever it is handed and the `numeric` rule at
     * `model/validation/Sku.json:L5` reports the problem under that property's own key. Raising here
     * would move the failure; substituting zero would hide it. The sentinel fails the validator's
     * `isCfNumeric` predicate, so the rule still catches it in the same place. */
    const { options } = buildOptionUniverse(1, 1);
    const { service, persistedSkus } = makeService(options);

    await service.createSkus(makeMerchandiseProduct(), { price: 'not-a-price' });

    expect(persistedSkus).toHaveLength(1);
    expect(persistedSkus[0]?.price).toBe('NaN');
  });

  it('NET-NEW — F07 PARITY: the list-price guard orders by magnitude, so a negative is refused', async () => {
    /* THE THREE-PART GUARD AT [model/service/SkuService.cfc:L94]: present AND numeric AND greater than
     * zero. All three operands are now branded strings, and `'-1' > '0'` is TRUE as a LEXICAL string
     * comparison — so writing the guard with `>` would admit the negative value it exists to refuse,
     * and would compile without complaint. A refused value leaves the entity default in place, which
     * `model/entity/Sku.cfc:L55` declares as `0`. */
    const { options } = buildOptionUniverse(1, 1);

    const negative = makeService(options);
    await negative.service.createSkus(makeMerchandiseProduct(), { price: '10', listPrice: '-1' });
    expect(negative.persistedSkus[0]?.listPrice).toBe('0');

    const zeroWithScale = makeService(options);
    await zeroWithScale.service.createSkus(makeMerchandiseProduct(), {
      price: '10',
      listPrice: '0.00',
    });
    expect(zeroWithScale.persistedSkus[0]?.listPrice).toBe('0');

    /* And a genuinely positive value IS applied, at its supplied scale — otherwise the assertions above
     * would also pass against a guard that refused everything. */
    const positive = makeService(options);
    await positive.service.createSkus(makeMerchandiseProduct(), {
      price: '10',
      listPrice: '19.90',
    });
    expect(positive.persistedSkus[0]?.listPrice).toBe('19.90');
  });

  it('NET-NEW — F07 PARITY: a nine-versus-ten magnitude is ordered numerically, not lexically', async () => {
    /* Lexically `'9'` is GREATER than `'10'`. The guard must treat 9 as greater than 0 (accept) and,
     * where the comparison is against a larger magnitude, order by value. This pins the digit-count
     * step of the comparison, which is the part a lexical implementation gets wrong. */
    const { options } = buildOptionUniverse(1, 1);
    const { service, persistedSkus } = makeService(options);

    await service.createSkus(makeMerchandiseProduct(), { price: '10', listPrice: '9' });

    expect(persistedSkus[0]?.listPrice).toBe('9');
  });
});

/* ==================================================================================================
 * F-11 — THE GOOGLE FEED'S JOINS REACH THE SMART-LIST QUERY
 * ==================================================================================================
 * `integrationServices/google/controllers/feed.cfc:L63` calls the SKU smart-list member with zero
 * arguments and then MUTATES the object it gets back, adding three related-property joins at
 * `:L64-L66`. This port returns a materialised result, so the additions have to travel INTO the member.
 *
 * These assertions are deliberately EXPLICIT about the merged list rather than checking only that the
 * brand join appears. The review's fifth Area of Concern is that a test-support layer can model correct
 * behaviour while production does not, so a test that merely asserted "brand is present" would pass
 * against a naive concatenation that ALSO emitted `SlatwallSku -> product` twice — the one outcome the
 * finding explicitly rules out ("without duplicating the base SKU service joins").
 * ================================================================================================== */
describe('SkuService.getSkuSmartList — F-11 join forwarding', () => {
  function captureQuery(): { readonly service: SkuService; readonly queries: SmartListQuery[] } {
    const queries: SmartListQuery[] = [];
    const smartListQueryPortDouble = {
      execute: (query: SmartListQuery): Promise<unknown> => {
        queries.push(query);
        return Promise.resolve({
          records: [],
          pageRecords: [],
          recordsCount: 0,
          pageRecordsStart: 1,
          pageRecordsEnd: 0,
        });
      },
    } as never;

    const service = new SkuService(
      UNREACHED_COLLABORATOR,
      UNREACHED_COLLABORATOR,
      UNREACHED_COLLABORATOR,
      UNREACHED_COLLABORATOR,
      UNREACHED_COLLABORATOR,
      smartListQueryPortDouble,
      UNREACHED_COLLABORATOR,
      UNREACHED_COLLABORATOR,
      UNREACHED_COLLABORATOR,
    );
    return { service, queries };
  }

  it('NET-NEW — with no additional joins the base list is emitted UNCHANGED', async () => {
    // The regression guard for every other caller: forwarding must cost nothing when nobody forwards.
    const { service, queries } = captureQuery();

    await service.getSkuSmartList({ 'F:skuCode': 'ABC-1' });

    expect(queries[0]?.joins).toEqual([
      { parentEntityName: 'SlatwallSku', relatedProperty: 'product' },
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'productType' },
      {
        parentEntityName: 'SlatwallSku',
        relatedProperty: 'alternateSkuCodes',
        joinType: 'left',
      },
    ]);
  });

  it("NET-NEW — the feed's three joins arrive, base joins first, with the duplicate dropped", async () => {
    const { service, queries } = captureQuery();

    await service.getSkuSmartList(undefined, undefined, PRODUCT_FEED_JOINS);

    // Base joins keep their positions; only `defaultSku` and `brand` are appended. `SlatwallSku ->
    // product` appears ONCE even though both lists declare it.
    expect(queries[0]?.joins).toEqual([
      { parentEntityName: 'SlatwallSku', relatedProperty: 'product' },
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'productType' },
      {
        parentEntityName: 'SlatwallSku',
        relatedProperty: 'alternateSkuCodes',
        joinType: 'left',
      },
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'defaultSku' },
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'brand', joinType: 'left' },
    ]);
  });

  it('NET-NEW — the brand join keeps its LEFT polarity, which is load-bearing', async () => {
    // `feed.cfc:L66` states `left` explicitly. An inner join would drop every brandless product from
    // the feed, so the polarity is asserted on its own rather than only inside the list comparison.
    const { service, queries } = captureQuery();

    await service.getSkuSmartList(undefined, undefined, PRODUCT_FEED_JOINS);

    const brandJoin = (queries[0]?.joins ?? []).find(
      (join) => join.parentEntityName === 'SlatwallProduct' && join.relatedProperty === 'brand',
    );
    expect(brandJoin?.joinType).toBe('left');
  });

  it("NET-NEW — forwarding joins does not disturb the feed's filters or its range", async () => {
    // The joins travel in a THIRD parameter, so they must not displace `data`. This pins that the
    // filter set and the availability range still arrive when joins are supplied alongside them.
    const { service, queries } = captureQuery();

    await service.getSkuSmartList(
      { 'F:activeFlag': 1, 'R:product.calculatedQATS': '1^' },
      undefined,
      PRODUCT_FEED_JOINS,
    );

    expect(queries[0]?.whereGroups?.[0]?.filters).toEqual([
      { propertyIdentifier: 'activeFlag', value: 1 },
    ]);
    // `1^` is the availability gate: a lower bound of 1 and NO upper bound, exactly as
    // `feed.cfc:L72` intends. The absent `upperBound` member is the assertion that matters — an
    // upper bound of any value would cap the feed.
    expect(queries[0]?.whereGroups?.[0]?.ranges).toEqual([
      { propertyIdentifier: 'product.calculatedQATS', lowerBound: '1' },
    ]);
  });
});
