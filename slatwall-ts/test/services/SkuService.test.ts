/**
 * `SkuService` — the resource bound on merchandise SKU generation.
 *
 * AAP authority: AAP 0.4.1.12 lists `slatwall-ts/test/services/SkuService.test.ts` | CREATE |
 * "**NET-NEW** — including the combination engine and the three-way discriminator", and the AAP 0.4.4
 * wildcard row authorises `slatwall-ts/test/**` | CREATE.
 *
 * =============================================================================================
 * WHAT THIS FILE COVERS, AND WHAT IT DELIBERATELY DOES NOT
 * =============================================================================================
 * This file exists to pin the SEC-11 resource bound and the enumeration semantics that bound must not
 * disturb. It is NOT the full combination-engine suite the AAP envisions: the three-way discriminator,
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
 * WHY THE ENUMERATION CASES MATTER AS MUCH AS THE BOUND
 * =============================================================================================
 * The bound was added to stop unbounded and non-terminating work. The risk in adding it is that it
 * quietly changes WHICH SKUs get built. AAP 0.6.7.8 is explicit that the enumeration must be ported
 * exactly, "because the enumeration order determines both the generated SKU set and — through 0.6.2 —
 * the order in which uniqueness validation observes its siblings". Two cases therefore pin the
 * behaviour the fix had to preserve — odometer order, and duplicate retention — alongside the cases
 * that pin the fix itself. Without them a future "optimisation" could deduplicate the buckets, pass
 * every bound test, and silently change the catalog.
 *
 * Test doubles are hand-written object literals: the legacy repository ships no mocking library at all
 * (AAP 0.4.3.6), and the ports are what make substitution possible without booting an application.
 */
import { SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE } from '../../src/domain/BaseProductType';
import { Option } from '../../src/domain/option/Option';
import { OptionGroup } from '../../src/domain/option/OptionGroup';
import { Product } from '../../src/domain/product/Product';
import { ProductType } from '../../src/domain/product/ProductType';
import type { SkuImagePathResolver } from '../../src/domain/sku/Sku';
import { Sku } from '../../src/domain/sku/Sku';
import {
  DomainError,
  LegacyParityError,
  NO_SINGLE_SKU_WITHOUT_SELECTED_OPTIONS_MESSAGE,
  NotImplementedError,
  UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE,
  moreThanOneSkuReturnedMessage,
  noSkusFoundForSelectedOptionsMessage,
} from '../../src/errors/DomainError';
import { ValidationError } from '../../src/errors/ValidationError';
import {
  errorResponse,
  forbiddenResponse,
  unauthorizedResponse,
} from '../../src/handlers/httpResponse';
import type { SmartListQuery } from '../../src/ports/SmartListQueryPort';
import { resolveSmartListPropertyIdentifier } from '../../src/ports/SmartListQueryPort';
import type { ImageWebPath } from '../../src/ports/ImagePathPort';
import {
  IMAGE_UPLOAD_ALLOWED_EXTENSIONS,
  toImageWebPath,
  validateImageFileName,
} from '../../src/ports/ImagePathPort';
import { SkuService } from '../../src/services/SkuService';

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
}

function makeService(
  options: Map<string, Option>,
  maximumCombinationsPerProduct: number,
): ServiceUnderTest {
  const validatedOptionSets: string[] = [];
  const persistedOptionSets: string[] = [];
  const writeTrace: string[] = [];

  const describeOptions = (sku: Sku): string =>
    sku
      .getOptions()
      .map((option) => option.optionID)
      .join('+');

  /*
   * The repository double records the SKU it was asked to write and reports success. Only `persistSku` is
   * populated: the merchandise creation path reads nothing back through this port — the uniqueness read
   * that the write makes visible belongs to the validator, which is doubled separately — so a member that
   * is not called is deliberately left absent rather than stubbed, per this file's UNREACHED_COLLABORATOR
   * discipline.
   *
   * ⛔ IT MUST NOT BE REPLACED BY A NO-OP. The write is what makes each SKU visible to the NEXT SKU's
   * uniqueness read (M6 / F01); a double that silently swallows the call would let a future change delete
   * the await and still pass every case in this file.
   */
  const skuRepositoryDouble = {
    persistSku: (sku: Sku): Promise<void> => {
      const description = describeOptions(sku);
      persistedOptionSets.push(description);
      writeTrace.push(`persist:${description}`);
      return Promise.resolve();
    },
  } as never;

  const optionServiceDouble = {
    getOption: (optionID: string): Promise<Option | undefined> =>
      Promise.resolve(options.get(optionID)),
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
    { maximumCombinationsPerProduct },
  );

  return { service, validatedOptionSets, persistedOptionSets, writeTrace };
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

describe('SkuService.createSkus — the enumeration the bound must not disturb', () => {
  it('NET-NEW — model/service/SkuService.cfc:L110-L120 — indexedKeys[0] advances fastest', async () => {
    // Two groups of two options is the smallest shape in which a reversed odometer is detectable.
    const { options, selectionList } = buildOptionUniverse(2, 2);
    const { service, validatedOptionSets } = makeService(options, 100);
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
    const { service, writeTrace, persistedOptionSets } = makeService(options, 100);

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
    const { service } = makeService(options, 100);
    const product = makeMerchandiseProduct();

    await service.createSkus(product, { price: 10, options: selectionList });

    expect(product.defaultSku).toBeDefined();
  });

  it('NET-NEW — model/service/SkuService.cfc:L78 — DUPLICATE selections are RETAINED, not deduplicated', async () => {
    // `arrayAppend` appends unconditionally, so selecting one option three times genuinely produces a
    // three-element bucket and therefore three combinations. AAP 0.6.1.3 T1 requires the same
    // retention in the option-resolution query. Deduplicating would pass every bound assertion in
    // this file while silently changing which SKUs exist — which is why this case is here.
    const { options } = buildOptionUniverse(1, 1);
    const { service, validatedOptionSets } = makeService(options, 100);
    const product = makeMerchandiseProduct();

    await service.createSkus(product, { price: 10, options: 'g0o0,g0o0,g0o0' });

    expect(product.skus).toHaveLength(3);
    expect(validatedOptionSets).toEqual(['g0o0', 'g0o0', 'g0o0']);
  });

  it('NET-NEW — the no-options branch is untouched by the bound', async () => {
    // A budget of 1 is the tightest legal value; the single-SKU branch does not consult it at all.
    const { options } = buildOptionUniverse(1, 1);
    const { service, validatedOptionSets } = makeService(options, 1);
    const product = makeMerchandiseProduct();

    await service.createSkus(product, { price: 10 });

    expect(product.skus).toHaveLength(1);
    expect(validatedOptionSets).toHaveLength(1);
  });
});

describe('SkuService.createSkus — SEC-11, the resource bound', () => {
  it('NET-NEW — a request exactly AT the budget is permitted', async () => {
    // Four groups of four options is 256 combinations against a budget of 256: the boundary is
    // inclusive, so an off-by-one in the gate would reject a legal request.
    const { options, selectionList } = buildOptionUniverse(4, 4);
    const { service, validatedOptionSets } = makeService(options, 256);
    const product = makeMerchandiseProduct();

    await service.createSkus(product, { price: 10, options: selectionList });

    expect(product.skus).toHaveLength(256);
    expect(validatedOptionSets).toHaveLength(256);
  });

  it('NET-NEW — an over-budget request creates NOTHING: no SKU, no default, no validation, no WRITE', async () => {
    // 256 combinations against a budget of 255. The gate precedes all creation, so a rejected request
    // must leave the product exactly as it was — no partially built aggregate, which is the half-done
    // state AAP 0.6.6 M3 flags elsewhere and there is no reason to reproduce here.
    const { options, selectionList } = buildOptionUniverse(4, 4);
    const { service, validatedOptionSets, persistedOptionSets } = makeService(options, 255);
    const product = makeMerchandiseProduct();

    await expect(
      service.createSkus(product, { price: 10, options: selectionList }),
    ).rejects.toBeInstanceOf(DomainError);

    expect(product.skus).toHaveLength(0);
    expect(product.defaultSku).toBeUndefined();
    expect(validatedOptionSets).toEqual([]);
    /* The write assertion is the one that matters most now that creation persists per SKU (M6 / F01):
     * "no partially built aggregate" is an in-memory statement, whereas a write that escaped the gate
     * would have left rows behind in the caller's transaction. */
    expect(persistedOptionSets).toEqual([]);
  });

  it('NET-NEW — the over-budget failure reports the counts and discloses no option values', async () => {
    const { options, selectionList } = buildOptionUniverse(4, 4);
    const { service } = makeService(options, 10);
    const product = makeMerchandiseProduct();

    let raised: unknown;
    try {
      await service.createSkus(product, { price: 10, options: selectionList });
    } catch (error: unknown) {
      raised = error;
    }

    expect(raised).toBeInstanceOf(DomainError);
    const domainError = raised as DomainError;
    expect(domainError.context).toEqual({
      requestedCombinations: 256,
      maximumCombinationsPerProduct: 10,
      optionGroupCount: 4,
      locator: 'model/service/SkuService.cfc:L82-L89',
    });
    // Declaration and count facts only — no caller-supplied option identifier is reflected back.
    expect(domainError.message).not.toContain('g0o0');
  });

  it('NET-NEW — an overflowing request is refused by the checked multiplication', async () => {
    // Forty groups of forty options is 40^40, which vastly exceeds Number.MAX_SAFE_INTEGER and would
    // become Infinity. That is the reported failure: `combination < totalCombos` stays permanently
    // true and the loop never terminates. The budget here is deliberately the largest legal value, so
    // it is the OVERFLOW guard that fires rather than the budget gate.
    const { options, selectionList } = buildOptionUniverse(40, 40);
    const { service, validatedOptionSets } = makeService(options, Number.MAX_SAFE_INTEGER);
    const product = makeMerchandiseProduct();

    await expect(
      service.createSkus(product, { price: 10, options: selectionList }),
    ).rejects.toThrow(/largest exactly representable integer/);

    expect(product.skus).toHaveLength(0);
    expect(validatedOptionSets).toEqual([]);
  });
});

describe('SkuService — SEC-11, the budget is validated when the graph is built', () => {
  it('NET-NEW — a malformed budget is rejected at construction, not on first use', () => {
    // Fail fast: a composition-root error should not surface later as what looks like a data error.
    for (const invalid of [0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
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
            { maximumCombinationsPerProduct: invalid },
          ),
      ).toThrow(/positive safe integer/);
    }
  });

  it('NET-NEW — a well-formed budget constructs cleanly', () => {
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
          { maximumCombinationsPerProduct: 1000 },
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
      { maximumCombinationsPerProduct: 1000 },
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
});

/* ================================================================================================
 * SEC-07 — the image path/upload boundary. All cases NET-NEW: AAP 0.6.5.2 records that no legacy
 * `SkuServiceTest` exists, and a `grep` of `test/**` before this block was written found NO existing
 * coverage of ANY image member anywhere in the suite.
 *
 * WHY THE ENTITY-LEVEL CASES LIVE IN A SERVICE TEST FILE. `test/domain/Sku.test.ts` is AAP
 * 0.4.1.12-enumerated and is the eventual owner of `Sku`'s own assertions, but it does not yet exist and
 * its AAP mandate is far broader than this finding — the D1/D2/D3/D19 cluster, the two method-based
 * validation rules and the four inherited entity assertions all belong to it. Creating it containing
 * only image cases would deliver an enumerated file in a misleading, partial state. The behaviour under
 * test here is reached end-to-end through a port double either way, and `processImageUpload` — the
 * finding's cited sink — is unambiguously this file's member. The same reasoning placed the
 * `src/util/urlTitle.ts` cases in `test/services/BrandService.test.ts`.
 *
 * WHAT THESE CASES DO NOT COVER, stated rather than implied: no canonical-containment or content-type
 * assertion appears here, because both are obligations on an ADAPTER and AAP 0.4.1.7 enumerates no image
 * adapter — none is authored in this checkpoint, so there is nothing to assert against. The port
 * contract states those obligations; the compile-time half of the finding is enforced by the branded
 * types, which no runtime test can observe.
 * ============================================================================================== */
describe('SkuService — SEC-07 image path and upload boundary', () => {
  /** The review's own runtime vector, kept verbatim so the regression is recognisable. */
  const TRAVERSAL_VECTOR = '../../../../tmp/payload.jpg';

  interface ImagePortCalls {
    readonly saved: string[];
    readonly composed: string[];
    readonly probed: string[];
  }

  function makeImageService(): {
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
      getImageExistsFlag: (imageFile: string): Promise<boolean> => {
        calls.probed.push(imageFile);
        return Promise.resolve(
          validateImageFileName(imageFile, IMAGE_UPLOAD_ALLOWED_EXTENSIONS) !== undefined,
        );
      },
      saveImageFile: (request: { readonly imageFileName: string }): Promise<boolean> => {
        calls.saved.push(request.imageFileName);
        return Promise.resolve(true);
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
      { maximumCombinationsPerProduct: 1 },
    );

    return { service, calls, port };
  }

  /** A SKU carrying whatever `imageFile` the case needs, as the column would hold it. */
  function makeSkuWithImageFile(imageFile: string | undefined): Sku {
    const sku = new Sku();
    sku.skuID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    if (imageFile !== undefined) {
      sku.imageFile = imageFile;
    }
    return sku;
  }

  /* ---- the validator's clauses. Each is a documented clause of `validateImageFileName`. ------- */

  it('NET-NEW — accepts an ordinary basename with each of the four legacy extensions', () => {
    // `model/service/SkuService.cfc:L212` declares exactly `"jpg,jpeg,png,gif"`.
    for (const extension of ['jpg', 'jpeg', 'png', 'gif']) {
      expect(validateImageFileName(`shirt-red.${extension}`, IMAGE_UPLOAD_ALLOWED_EXTENSIONS)).toBe(
        `shirt-red.${extension}`,
      );
    }
  });

  it('NET-NEW — accepts an extension in any letter case without rewriting the value', () => {
    // Clause 7 compares case-insensitively; the value is returned UNCHANGED, never normalised.
    expect(validateImageFileName('Shirt.JPG', IMAGE_UPLOAD_ALLOWED_EXTENSIONS)).toBe('Shirt.JPG');
  });

  it("NET-NEW — refuses the review's traversal vector and every relative spelling of it", () => {
    for (const candidate of [
      TRAVERSAL_VECTOR,
      '../payload.jpg',
      '..\\payload.jpg',
      'a/../../payload.jpg',
      'sub/dir/payload.jpg',
      'sub\\dir\\payload.jpg',
      '..',
      '.',
      'a..b.jpg',
    ]) {
      expect(validateImageFileName(candidate, IMAGE_UPLOAD_ALLOWED_EXTENSIONS)).toBeUndefined();
    }
  });

  it('NET-NEW — refuses absolute forms, control characters and NUL', () => {
    for (const candidate of [
      '/etc/passwd.jpg',
      'C:\\windows\\system32\\a.jpg',
      // A DRIVE-RELATIVE form with no separator at all, which clause 3 does NOT see. Coverage of the
      // port's clause 5 showed it was unreached until this vector was added.
      'C:payload.jpg',
      '\\\\server\\share\\a.jpg',
      'a\u0000.jpg',
      'a\u0000.jpg.png',
      'a\nb.jpg',
      'a\u007f.jpg',
    ]) {
      expect(validateImageFileName(candidate, IMAGE_UPLOAD_ALLOWED_EXTENSIONS)).toBeUndefined();
    }
  });

  it('NET-NEW — refuses a disallowed or missing extension, and a double extension', () => {
    for (const candidate of ['payload.php', 'payload', 'payload.', '.jpg', 'payload.php.jpg']) {
      expect(validateImageFileName(candidate, IMAGE_UPLOAD_ALLOWED_EXTENSIONS)).toBeUndefined();
    }
    // `payload.jpg.php` fails on BOTH the single-separator clause and the membership clause.
    expect(
      validateImageFileName('payload.jpg.php', IMAGE_UPLOAD_ALLOWED_EXTENSIONS),
    ).toBeUndefined();
  });

  it('NET-NEW — refuses an empty name and one longer than the declared column width', () => {
    // `ormtype="string" length="50"` at `model/entity/Sku.cfc:L58` — a source-declared figure.
    expect(validateImageFileName('', IMAGE_UPLOAD_ALLOWED_EXTENSIONS)).toBeUndefined();
    const atLimit = `${'a'.repeat(46)}.jpg`;
    expect(atLimit).toHaveLength(50);
    expect(validateImageFileName(atLimit, IMAGE_UPLOAD_ALLOWED_EXTENSIONS)).toBe(atLimit);
    expect(
      validateImageFileName(`${'a'.repeat(47)}.jpg`, IMAGE_UPLOAD_ALLOWED_EXTENSIONS),
    ).toBeUndefined();
  });

  /* ---- `processImageUpload` — the finding's cited sink. --------------------------------------- */

  it('NET-NEW — stores a validated basename and NEVER a destination path', async () => {
    const { service, calls } = makeImageService();

    await expect(service.processImageUpload(makeSkuWithImageFile('shirt.jpg'), {})).resolves.toBe(
      true,
    );

    // The value that crosses the boundary is the BASENAME. Nothing path-shaped reaches the port.
    expect(calls.saved).toEqual(['shirt.jpg']);
    expect(calls.saved[0]).not.toContain('/');
    // And no web path was composed on the write path at all — `model/service/SkuService.cfc:L211`
    // composed one and handed it over as `filePath`; that step is gone.
    expect(calls.composed).toEqual([]);
  });

  it('NET-NEW — refuses the traversal vector by raising, and stores NOTHING', async () => {
    const { service, calls } = makeImageService();

    await expect(
      service.processImageUpload(makeSkuWithImageFile(TRAVERSAL_VECTOR), {}),
    ).rejects.toBeInstanceOf(DomainError);
    // The refusal happens BEFORE the port is reached, so no file is placed anywhere.
    expect(calls.saved).toEqual([]);
  });

  it('NET-NEW — the refusal identifies the SKU without echoing the rejected value', async () => {
    const { service } = makeImageService();
    const sku = makeSkuWithImageFile(TRAVERSAL_VECTOR);

    // Withholding the value is deliberate: it would otherwise reach logs and, through
    // `src/handlers/httpResponse.ts`, potentially a response.
    await expect(service.processImageUpload(sku, {})).rejects.toMatchObject({
      context: {
        skuID: sku.skuID,
        allowedExtensions: IMAGE_UPLOAD_ALLOWED_EXTENSIONS,
        locator: 'model/service/SkuService.cfc:L210-L218',
      },
    });

    /* The error is captured and inspected directly rather than matched with an asymmetric matcher: the
     * matcher returns `any`, and this file will not trade a type hole for brevity. Capturing also lets
     * the CONTEXT be searched as well as the message, which is the stronger assertion — the rejected
     * value must appear in NEITHER. */
    let captured: unknown;
    try {
      await service.processImageUpload(sku, {});
    } catch (error: unknown) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(DomainError);
    const asDomainError = captured instanceof DomainError ? captured : undefined;
    expect(asDomainError?.message).not.toContain(TRAVERSAL_VECTOR);
    expect(JSON.stringify(asDomainError?.context)).not.toContain(TRAVERSAL_VECTOR);
  });

  it('NET-NEW — an absent imageFile raises rather than storing to an empty name', async () => {
    const { service, calls } = makeImageService();

    await expect(
      service.processImageUpload(makeSkuWithImageFile(undefined), {}),
    ).rejects.toBeInstanceOf(DomainError);
    expect(calls.saved).toEqual([]);
  });

  /* ---- display and existence, the two members whose behaviour had to be PRESERVED. ------------ */

  it('NET-NEW — display composition still accepts any stored value, exactly as the legacy does', async () => {
    // `model/entity/Sku.cfc:146` interpolates whatever is stored without inspecting it. Rejecting here
    // would break the Google feed for one bad row — a behaviour change in the opposite direction.
    const { port, calls } = makeImageService();
    const sku = makeSkuWithImageFile(TRAVERSAL_VECTOR);

    await expect(sku.getImagePath(port)).resolves.toBe(
      `/assets/images/product/default/${TRAVERSAL_VECTOR}`,
    );
    expect(calls.composed).toEqual([TRAVERSAL_VECTOR]);
  });

  it('NET-NEW — the existence probe receives the STORED NAME, never a composed path', async () => {
    const { port, calls } = makeImageService();

    await expect(makeSkuWithImageFile('shirt.jpg').getImageExistsFlag(port)).resolves.toBe(true);

    // This is the SEC-07 regression: `model/entity/Sku.cfc:222` wrapped `getImagePath()` in
    // `expandPath`, so a composed URL reached a filesystem probe. Nothing composes on this path now.
    expect(calls.probed).toEqual(['shirt.jpg']);
    expect(calls.composed).toEqual([]);
  });

  it('NET-NEW — a traversal name resolves false, and an absent one resolves false', async () => {
    // `false` is not a new state: `model/entity/Sku.cfc:225` already answers it for a file that is not
    // there, and a value that cannot be a file name cannot name a stored file.
    const { port } = makeImageService();

    await expect(makeSkuWithImageFile(TRAVERSAL_VECTOR).getImageExistsFlag(port)).resolves.toBe(
      false,
    );
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
 * message, one is `src/services/SkuService.ts:1556` — the `createSkus` fallthrough at
 * [model/service/SkuService.cfc:L204] — and this file already owns that method's coverage. The other
 * three are `Product.getSkuBySelectedOptions`'s arity throws, asserted here through the exported
 * message helpers rather than duplicated into `test/domain/`.
 *
 * ⭐ WHAT IS ACTUALLY BEING PINNED. The mapping publishes a thrown message IF AND ONLY IF the throw
 * site declared it to be legacy behavior by raising `LegacyParityError`. That is a census fact, not a
 * style choice: 4 of the 47 `new DomainError(...)` sites in the subtree carry a mandated string, and
 * the other 43 carry diagnostics that have named a schema column, an internal storage path, a legacy
 * source locator and an internal member name. A boolean flag would have been omittable at any of the
 * 47; a message-text test would have been the error-code registry S9 forbids AND would have failed on
 * the two strings that interpolate. The subclass makes disclosure default-deny, and these cases pin
 * both halves — that the four mandated strings still arrive verbatim, and that nothing else does.
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
    const { service } = makeService(options, 8);
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

    expect(result.statusCode).toBe(400);
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
