/**
 * `productHandler` — the Lambda boundary that exposes the `ProductService` surface, and the contracts
 * that boundary must not silently alter.
 *
 * AAP authority: the AAP §0.4.4 wildcard row authorises `slatwall-ts/test/**` | CREATE. The suite sits
 * beside `test/handlers/skuHandler.test.ts`, which covers the SKU boundary the same way, so the two
 * Lambda boundaries that have coverage are covered in the same place. `test/services/ProductService.test.ts`
 * keeps the SERVICE matrix — the URL-title derivation, the validation merge and the per-member
 * persistence steps — and this file keeps the BOUNDARY matrix; neither duplicates the other.
 *
 * =============================================================================================
 * WHAT IS UNDER TEST
 * =============================================================================================
 * The handler is a thin, injectable function OF the service — its build specification requires exactly
 * that, so that it is "assertable without a database, a network call or an AWS runtime". What is under
 * test here is therefore the service's surface as observed through its boundary: member names, arity,
 * argument order, the transaction graph a write route enters, and the authorization gate in front of
 * them all.
 *
 *   - AAP §0.7.3 makes "one test per converted method, explicitly labelled" a BINDING standard, and
 *     §0.7.2 records that the absence of user rules "is not permission to relax standards". Eighteen
 *     routed operations with no coverage at all would violate that standard outright.
 *   - `src/handlers/productHandler.ts` declares eighteen routed members — the fifteen public functions
 *     `model/service/ProductService.cfc` declares across 367 lines, plus the three the legacy
 *     fabricated at run time (IR-1) — and the count is asserted here rather than assumed.
 *
 * TEST PROVENANCE: every case below is **NET-NEW**. AAP §0.6.5.2 verified that no legacy
 * `ProductServiceTest` exists — "therefore all 28 public service members of §0.4.2 are net-new
 * coverage" — and that the legacy suite contains no controller test of any kind, the one functional
 * scaffold at [meta/tests/functional/admin/entity/ProductTest.cfc:L49-L52] being an empty component
 * with zero test methods. Nothing in this file extends a legacy assertion, and none is labelled as
 * though it did. ⚠️ NO PARITY WITH A LEGACY ASSERTION IS CLAIMED OR IMPLIED ANYWHERE BELOW.
 *
 * WHAT THIS FILE DOES NOT COVER: the service's own internals are exercised only as far as the boundary
 * makes them observable, and `src/handlers/router.ts` does not exist yet, so nothing here asserts how a
 * route string reaches a member. Stating that is preferable to implying a completeness this file does
 * not have.
 */
import { Product } from '../../src/domain/product/Product';
import { ProductType } from '../../src/domain/product/ProductType';
import { SKU_ENTITY_METADATA, Sku } from '../../src/domain/sku/Sku';
import { DomainError, ImportSourceRejectedError } from '../../src/errors/DomainError';
import { PRODUCT_ACCESS_MATRIX, createProductHandler } from '../../src/handlers/productHandler';
import { manageEntity } from '../../src/domain/base/populate';
import { PRODUCT_TYPE_ENTITY_METADATA } from '../../src/domain/product/ProductType';
import type { ProductTypeWithErrorState } from '../../src/services/ProductService';
import type {
  LoadDataFromFileEvent,
  ProductAuthorizationEvent,
  NewProductEvent,
  ProductHandler,
  ProductHandlerService,
  ProductIdentifierEvent,
  ProductPayloadEvent,
  ProductSaveEvent,
  ProductSmartListEvent,
  ProductTypeIdentifierEvent,
  ProductTypePayloadEvent,
  ProductWriteGraph,
  SelectedOptionsEvent,
} from '../../src/handlers/productHandler';
import type {
  AccountReference,
  EntityAuthorizationRequest,
  RequestAuthorizationResolver,
} from '../../src/ports/AccountContextPort';
import type { SmartListInput, SmartListResult } from '../../src/ports/SmartListQueryPort';
import type { TransactionalWriteRunner } from '../../src/ports/TransactionalWritePort';
import type { ProductAddOption } from '../../src/domain/process/ProductAddOption';
import type { ProductAddOptionGroup } from '../../src/domain/process/ProductAddOptionGroup';
import type { ProductUpdateSkus } from '../../src/domain/process/ProductUpdateSkus';
import type { FormattedOptionGroup } from '../../src/services/ProductService';

/** A 32-character identifier, the width IR-6 fixes for every primary key in this schema. */
const PRODUCT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

/** A second, so "the route addressed the entity it was given" is observable. */
const PRODUCT_TYPE_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

/** Every entity CRUD type the permission model can be asked about. */
const EVERY_CRUD_TYPE: readonly string[] = ['create', 'read', 'update', 'delete'];

/** The eighteen operations AAP §0.4.2.1 (fifteen declared) and §0.4.2.5 (three synthesized) allow. */
const APPROVED_MEMBERS: readonly string[] = [
  'loadDataFromFile',
  'getFormattedOptionGroups',
  'getProductSkusBySelectedOptions',
  'processProductAddOptionGroup',
  'processProductAddOption',
  'processProductAddProductReview',
  'processProductAddSubscriptionTerm',
  'processProductDeleteDefaultImage',
  'processProductUpdateDefaultImageFileNames',
  'processProductUpdateSkus',
  'processProductUploadDefaultImage',
  'saveProduct',
  'saveProductType',
  'deleteProduct',
  'getProductSmartList',
  'newProduct',
  'getProductType',
  'getProduct',
];

/** A principal, defaulting to one that is logged in and is not an administrator. */
function account(overrides: Partial<AccountReference> = {}): AccountReference {
  return { accountID: 'account-1', newFlag: false, adminAccountFlag: false, ...overrides };
}

/** A product the routes can address. */
function makeProduct(productID: string = PRODUCT_ID): Product {
  const product = new Product();
  product.productID = productID;
  return product;
}

/**
 * A product type the two product-type routes can address.
 *
 * MANAGED, because `ProductTypeWithErrorState` is what `ProductService.saveProductType` resolves and what
 * `ProductWriteGraph` now declares. `../../src/domain/product/ProductType` is forbidden to declare the six
 * error members itself, so the surface is composed on exactly as the service composes it — with the same
 * `manageEntity`, which mutates and returns the SAME object so identity survives.
 */
function makeProductType(): ProductTypeWithErrorState {
  const productType = new ProductType();
  productType.productTypeID = PRODUCT_TYPE_ID;
  productType.productTypeName = 'Merchandise';
  return manageEntity(productType, PRODUCT_TYPE_ENTITY_METADATA);
}

/** An empty page of products, so the smart-list projection has a defined shape to assert. */
function emptyPage(): SmartListResult<Product> {
  return {
    records: [],
    pageRecords: [],
    recordsCount: 0,
    pageRecordsStart: 0,
    pageRecordsEnd: 0,
    currentPage: 1,
    totalPages: 0,
  };
}

/** How one assembled surface should behave. */
interface SurfaceOptions {
  /** What `getProduct` answers. `null` means "no such row"; omitted means a default product. */
  readonly product?: Product | null;
  /**
   * What `saveProduct` answers, when it must differ from its argument.
   *
   * ⚠️ THIS EXISTS BECAUSE THE SERVICE REBINDS ITS LOCAL. STEP 5 of `ProductService.saveProduct` is
   * `product = await this.persistProduct(product)`, so the persister MAY answer with a different
   * instance from the one validation accumulated onto. Without this option a gate narrowed to the
   * returned instance alone would look correct.
   */
  readonly savedProduct?: Product;
  /**
   * An error key `saveProductType` should attach to the product type it returns, expressing a REFUSED
   * save. Omitted means the save succeeded.
   *
   * ⚠️ IT IS A RETURNED FINDING AND NOT A REJECTION, WHICH IS THE WHOLE POINT.
   * `model/service/ProductService.cfc:L310` returns `arguments.productType` on every path, so a refusal
   * arrives on the entity's own bag. A double that rejected instead would let the boundary's commit gate
   * look correct while never being exercised.
   */
  readonly productTypeSaveError?: string;
  /** What `deleteProduct` answers. `false` is a guard REFUSING the delete, not an error. */
  readonly deleteResult?: boolean;
  /**
   * A failure `loadDataFromFile` rejects with instead of resolving.
   *
   * ⚠️ THIS EXISTS FOR REVIEW FINDING F9 AND FOR NOTHING ELSE. The importer's location gate lives at the
   * retrieval SINK — `MySqlProductRepository` — so a refusal reaches this route as a rejection from
   * beneath it, and the only thing the route owns is how that rejection is PRESENTED. Every other member
   * of this probe resolves, because no other member has a refusal to present.
   */
  readonly importFailure?: unknown;
}

/** What one invocation of the surface recorded. */
interface Invocation {
  /** Which member, and whether it arrived through the captured service or the transaction graph. */
  readonly member: string;
  readonly through: 'service' | 'graph';
  /** The arguments, so argument ORDER is observable and not merely arity. */
  readonly args: readonly unknown[];
}

/**
 * A recording surface that answers every one of the eighteen members.
 *
 * ⛔ THE SERVICE AND THE GRAPH ARE DISTINCT OBJECTS, and each records which one it was. A double that
 * shared one object between them would make TX-01's "the route calls the captured service instead of
 * the transaction-scoped graph" defect UNOBSERVABLE — which is the whole point of the distinction.
 */
function makeSurface(options: SurfaceOptions = {}): {
  readonly calls: Invocation[];
  readonly service: ProductHandlerService;
  readonly graph: ProductWriteGraph;
} {
  const calls: Invocation[] = [];
  const stored: Product | null = options.product === undefined ? makeProduct() : options.product;

  function build(through: 'service' | 'graph'): ProductHandlerService {
    function record(member: string, args: readonly unknown[]): void {
      calls.push({ member, through, args });
    }

    return {
      loadDataFromFile: (fileURL: string, textQualifier?: string): Promise<void> => {
        record('loadDataFromFile', [fileURL, textQualifier]);

        /* Recorded BEFORE the rejection, so a case can assert the route did forward the location it was
         * given rather than short-circuiting on a guess about it. */
        if (options.importFailure !== undefined) {
          const failure: unknown = options.importFailure;

          return Promise.resolve().then((): void => {
            throw failure;
          });
        }

        return Promise.resolve();
      },
      getFormattedOptionGroups: (product: Product): Promise<readonly FormattedOptionGroup[]> => {
        record('getFormattedOptionGroups', [product]);
        /* The service answers `FormattedOptionGroup[]` (AAP §0.4.2.1) — the group NAME travels on the
         * entry, not as a record key — so the stub answers that shape too. */
        return Promise.resolve([
          { optionGroupName: 'Size', options: [{ name: 'Large', value: 'large' }] },
        ]);
      },
      getProductSkusBySelectedOptions: (
        selectedOptions: string,
        productID: string,
      ): Promise<Sku[]> => {
        record('getProductSkusBySelectedOptions', [selectedOptions, productID]);
        return Promise.resolve([]);
      },
      processProductAddOptionGroup: (
        product: Product,
        processObject: ProductAddOptionGroup,
      ): Promise<Product> => {
        record('processProductAddOptionGroup', [product, processObject]);
        return Promise.resolve(product);
      },
      processProductAddOption: (
        product: Product,
        processObject: ProductAddOption,
      ): Promise<Product> => {
        record('processProductAddOption', [product, processObject]);
        return Promise.resolve(product);
      },
      processProductAddProductReview: (
        product: Product,
        processObject: unknown,
      ): Promise<Product> => {
        record('processProductAddProductReview', [product, processObject]);
        return Promise.resolve(product);
      },
      processProductAddSubscriptionTerm: (
        product: Product,
        processObject: unknown,
      ): Promise<Product> => {
        record('processProductAddSubscriptionTerm', [product, processObject]);
        return Promise.resolve(product);
      },
      processProductDeleteDefaultImage: (
        product: Product,
        data: Record<string, unknown>,
      ): Promise<Product> => {
        record('processProductDeleteDefaultImage', [product, data]);
        return Promise.resolve(product);
      },
      processProductUpdateDefaultImageFileNames: (product: Product): Promise<Product> => {
        record('processProductUpdateDefaultImageFileNames', [product]);
        return Promise.resolve(product);
      },
      processProductUpdateSkus: (
        product: Product,
        processObject: ProductUpdateSkus,
      ): Promise<Product> => {
        record('processProductUpdateSkus', [product, processObject]);
        return Promise.resolve(product);
      },
      processProductUploadDefaultImage: (
        product: Product,
        processObject: unknown,
      ): Promise<Product> => {
        record('processProductUploadDefaultImage', [product, processObject]);
        return Promise.resolve(product);
      },
      saveProduct: (product: Product, data: Record<string, unknown>): Promise<Product> => {
        record('saveProduct', [product, data]);
        return Promise.resolve(options.savedProduct ?? product);
      },
      saveProductType: (
        productType: ProductType,
        data: Record<string, unknown>,
      ): Promise<ProductTypeWithErrorState> => {
        record('saveProductType', [productType, data]);

        /*
         * The double reproduces the SERVICE's contract, not a convenience: `saveProductType` returns the
         * entity on every path and attaches its findings to that entity's own bag
         * (`model/service/ProductService.cfc:L310`). So a failing save is expressed by seeding a finding
         * here, never by rejecting.
         */
        const saved = manageEntity(productType, PRODUCT_TYPE_ENTITY_METADATA);

        if (options.productTypeSaveError !== undefined) {
          saved.addError(options.productTypeSaveError, 'refused');
        }

        return Promise.resolve(saved);
      },
      deleteProduct: (product: Product): Promise<boolean> => {
        record('deleteProduct', [product]);
        return Promise.resolve(options.deleteResult ?? true);
      },
      getProductSmartList: (
        data?: SmartListInput,
        currentURL?: string,
      ): Promise<SmartListResult<Product>> => {
        record('getProductSmartList', [data, currentURL]);
        return Promise.resolve(emptyPage());
      },
      newProduct: (): Product => {
        record('newProduct', []);
        return makeProduct('');
      },
      getProduct: (productID: string): Promise<Product | null> => {
        record('getProduct', [productID]);
        return Promise.resolve(stored);
      },
      getProductType: (productTypeID: string): Promise<ProductType | null> => {
        record('getProductType', [productTypeID]);
        return Promise.resolve(makeProductType());
      },
    };
  }

  const service = build('service');
  const graph = build('graph');

  return { calls, service, graph };
}

/**
 * A write runner that EVALUATES the gate and throws on a roll-back.
 *
 * ⛔ It must do both, because the commit DECISION is what TX-01 is about. A double that ran the work
 * and returned its value unconditionally would make every gate case pass while asserting nothing.
 */
function makeWriteRunner(graph: ProductWriteGraph): {
  readonly runner: TransactionalWriteRunner<ProductWriteGraph>;
  readonly decisions: ('commit' | 'rollback')[];
} {
  const decisions: ('commit' | 'rollback')[] = [];

  return {
    decisions,
    runner: {
      runWrite: async <TResult>(
        work: (graph: ProductWriteGraph) => Promise<TResult>,
        hasErrors: () => boolean,
      ): Promise<TResult> => {
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

/** Everything one assembled handler exposes for inspection. */
interface Probe {
  /** Every entity question asked, in order, so the legacy sequence is observable. */
  readonly asked: EntityAuthorizationRequest[];
  /** Every member reached, with its arguments and which object answered. */
  readonly calls: Invocation[];
  /** Every commit decision the runner took. */
  readonly decisions: ('commit' | 'rollback')[];
  readonly handler: ProductHandler;
}

/**
 * @param account the principal the resolver reports, or `undefined` for "no principal at all"
 * @param grant   the entity CRUD types the permission model grants
 * @param options see {@link SurfaceOptions}
 */
function makeHandler(
  principal: AccountReference | undefined,
  grant: readonly string[],
  options: SurfaceOptions = {},
): Probe {
  const asked: EntityAuthorizationRequest[] = [];
  const surface = makeSurface(options);
  const { runner, decisions } = makeWriteRunner(surface.graph);

  const resolve: RequestAuthorizationResolver<ProductAuthorizationEvent> = () => ({
    accountContext: { getCurrentAccount: () => principal },
    entityAuthorization: {
      authenticateEntity: (request: EntityAuthorizationRequest): boolean => {
        asked.push(request);
        return grant.includes(request.crudType);
      },
    },
  });

  return {
    asked,
    calls: surface.calls,
    decisions,
    handler: createProductHandler(surface.service, resolve, runner),
  };
}

/** A handler admitting every request, for cases about routing rather than the gate. */
function admitAll(options: SurfaceOptions = {}): Probe {
  return makeHandler(account(), EVERY_CRUD_TYPE, options);
}

/** The event slice the identifier-only routes declare. */
function identifierEvent(productID?: string): ProductIdentifierEvent & ProductTypeIdentifierEvent {
  return {
    pathParameters: productID === undefined ? {} : { productID, productTypeID: productID },
    headers: {},
  };
}

/** The event slice the payload routes declare. */
function payloadEvent(body: string, productID: string = PRODUCT_ID): ProductPayloadEvent {
  return { body, pathParameters: { productID }, headers: {} };
}

/** The event slice the product-type payload route declares. */
function productTypePayloadEvent(body: string, productTypeID?: string): ProductTypePayloadEvent {
  return {
    body,
    pathParameters: productTypeID === undefined ? {} : { productTypeID },
    headers: {},
  };
}

/* ==============================================================================================
 * API-01 — THE ROUTED SURFACE
 * ============================================================================================== */

describe('productHandler — API-01, the routed surface is exactly the eighteen approved operations', () => {
  it('NET-NEW — AAP §0.4.2.1 + §0.4.2.5 — routes all eighteen and not one more', () => {
    const probe = admitAll();

    // Sorted on both sides, so the assertion is about MEMBERSHIP rather than declaration order.
    expect(Object.keys(probe.handler).sort()).toStrictEqual([...APPROVED_MEMBERS].sort());
  });

  it('NET-NEW — AAP §0.4.2.5 restraint — reproduces synthesis ONLY where used', () => {
    const probe = admitAll();
    const routed = Object.keys(probe.handler);

    /* "Not called by the slice … Not declared — synthesis is not reproduced wholesale, only where
     * used." A prefix-driven port would have fabricated all of these. */
    for (const forbidden of [
      'countProduct',
      'listProduct',
      'exportProduct',
      'countProductType',
      'listProductType',
      'exportProductType',
      'buildSkuCombinations', // D15 — private and only self-recursive, therefore unreachable.
    ]) {
      expect(routed).not.toContain(forbidden);
    }
  });

  it('NET-NEW — the returned handler is frozen, so no route can be swapped after assembly', () => {
    const probe = admitAll();
    expect(Object.isFrozen(probe.handler)).toBe(true);
  });

  it('NET-NEW — the access matrix covers every routed member and nothing else', () => {
    const probe = admitAll();

    expect(Object.keys(PRODUCT_ACCESS_MATRIX).sort()).toStrictEqual(
      Object.keys(probe.handler).sort(),
    );
  });
});

/* ==============================================================================================
 * API-01 — THE GATE `setupRequest()` RAN
 * ============================================================================================== */

describe('productHandler — API-01, the authorization gate', () => {
  it('NET-NEW — org/Hibachi/HibachiAuthenticationService.cfc:L83 — NO principal refuses with 401', async () => {
    const probe = makeHandler(undefined, EVERY_CRUD_TYPE);

    const results = [
      await probe.handler.getProduct(identifierEvent(PRODUCT_ID)),
      await probe.handler.saveProduct(payloadEvent('{}')),
      await probe.handler.deleteProduct(identifierEvent(PRODUCT_ID)),
      await probe.handler.processProductUpdateSkus(payloadEvent('{}')),
      await probe.handler.loadDataFromFile({ queryStringParameters: {}, headers: {} }),
    ];

    for (const result of results) {
      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body)).toStrictEqual({ message: 'Authentication is required' });
    }

    // Refused BEFORE the service, so nothing was read, written or imported…
    expect(probe.calls).toStrictEqual([]);
    // …and before any permission question, because there was no principal to ask about.
    expect(probe.asked).toStrictEqual([]);
    // …and no transaction was opened.
    expect(probe.decisions).toStrictEqual([]);
  });

  it('NET-NEW — HibachiScope.cfc:L40-L45 — the logged-in test is the NEGATION of newFlag', async () => {
    /* `getLoggedInFlag()` is `if(!getSession().getAccount().isNew())`, and `newFlag` carries
     * `isNew()`. A principal that is NEW is therefore NOT logged in. Inverting this predicate would
     * have admitted exactly the first caller and refused the second. */
    const notLoggedIn = makeHandler(account({ newFlag: true }), ['read']);
    expect((await notLoggedIn.handler.getProduct(identifierEvent(PRODUCT_ID))).statusCode).toBe(
      401,
    );
    expect(notLoggedIn.calls).toStrictEqual([]);

    const loggedIn = makeHandler(account({ newFlag: false }), ['read']);
    expect((await loggedIn.handler.getProduct(identifierEvent(PRODUCT_ID))).statusCode).toBe(200);
  });

  it('NET-NEW — a logged-in principal WITHOUT permission gets 403, not 401 and not 200', async () => {
    const probe = makeHandler(account(), []);

    const result = await probe.handler.getProduct(identifierEvent(PRODUCT_ID));

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body)).toStrictEqual({ message: 'Not authorized' });
    expect(probe.calls).toStrictEqual([]);
  });

  it('NET-NEW — HibachiAuthenticationService.cfc:L68-L69 — every process member is anyLogin', async () => {
    /* The ladder's `process` branch is a bare `return true`: `left(itemName,7)=="process"` short-
     * circuits before any entity question. A logged-in principal with NO entity grant must therefore
     * be admitted, and the permission model must not be consulted at all. */
    const probe = makeHandler(account(), []);

    const processRoutes = [
      await probe.handler.processProductAddOptionGroup(payloadEvent('{"optionGroup":"g1"}')),
      await probe.handler.processProductAddOption(payloadEvent('{"option":"o1"}')),
      await probe.handler.processProductUpdateSkus(payloadEvent('{}')),
    ];

    for (const result of processRoutes) {
      expect(result.statusCode).not.toBe(401);
      expect(result.statusCode).not.toBe(403);
    }

    // ⛔ Removing the anyLogin short-circuit would have produced entity questions here.
    expect(probe.asked).toStrictEqual([]);
  });

  it('NET-NEW — HibachiAuthenticationService.cfc:L71-L77 — save asks create THEN update, in order', async () => {
    // A grant on `update` alone must still succeed, because either question granting is sufficient.
    const probe = makeHandler(account(), ['update']);

    await probe.handler.saveProduct(payloadEvent('{}'));

    expect(probe.asked.map((request) => request.crudType)).toStrictEqual(['create', 'update']);
    expect(probe.asked.every((request) => request.entityName === 'Product')).toBe(true);
  });

  it('NET-NEW — the create grant SHORT-CIRCUITS, so update is never asked', async () => {
    const probe = makeHandler(account(), ['create']);

    await probe.handler.saveProduct(payloadEvent('{}'));

    expect(probe.asked.map((request) => request.crudType)).toStrictEqual(['create']);
  });

  it('NET-NEW — AAP §0.4.2.1 — getProductSkusBySelectedOptions asks about Sku, not Product', async () => {
    /* The member answers with SKUs, so the entity whose read permission governs it is `Sku`. A
     * handler that asked about `Product` would admit and refuse the wrong callers. */
    const probe = makeHandler(account(), ['read']);

    await probe.handler.getProductSkusBySelectedOptions({
      pathParameters: { productID: PRODUCT_ID },
      queryStringParameters: { selectedOptions: 'o1' },
      headers: {},
    });

    expect(probe.asked).toStrictEqual([{ entityName: 'Sku', crudType: 'read' }]);
  });

  it('NET-NEW — the two product-type routes ask about ProductType, not Product', async () => {
    const read = makeHandler(account(), ['read']);
    await read.handler.getProductType(identifierEvent(PRODUCT_TYPE_ID));
    expect(read.asked).toStrictEqual([{ entityName: 'ProductType', crudType: 'read' }]);

    const save = makeHandler(account(), ['create']);
    await save.handler.saveProductType(productTypePayloadEvent('{}', PRODUCT_TYPE_ID));
    expect(save.asked).toStrictEqual([{ entityName: 'ProductType', crudType: 'create' }]);
  });

  it('NET-NEW — loadDataFromFile is SECURE create-then-update on Product, not anyLogin', async () => {
    /* Its `load` prefix matches no branch of the legacy ladder, so it falls through to the terminal
     * `return false` at [:L83] — i.e. it is NOT a process member and must not be admitted as one. */
    const refused = makeHandler(account(), []);
    const result = await refused.handler.loadDataFromFile({
      queryStringParameters: { fileURL: 'https://example.test/products.txt' },
      headers: {},
    });

    expect(result.statusCode).toBe(403);
    expect(refused.calls).toStrictEqual([]);
    expect(refused.asked.map((request) => request.crudType)).toStrictEqual(['create', 'update']);
    expect(refused.asked.every((request) => request.entityName === 'Product')).toBe(true);
  });

  it('NET-NEW — newProduct asks create ALONE, and deleteProduct asks delete ALONE', async () => {
    const create = makeHandler(account(), ['create']);
    await create.handler.newProduct({ headers: {} } satisfies NewProductEvent);
    expect(create.asked).toStrictEqual([{ entityName: 'Product', crudType: 'create' }]);

    const remove = makeHandler(account(), ['delete']);
    await remove.handler.deleteProduct(identifierEvent(PRODUCT_ID));
    expect(remove.asked).toStrictEqual([{ entityName: 'Product', crudType: 'delete' }]);
  });
});

/* ==============================================================================================
 * API-01 — THE PROMPT'S OWN WORKED EXAMPLE, AND ITS T5 EDGE CASE
 * ============================================================================================== */

describe('productHandler — API-01, getProductSkusBySelectedOptions argument order and T5', () => {
  it('NET-NEW — model/entity/Product.cfc:L366-L368 — selectedOptions FIRST, productID SECOND', async () => {
    /* ⛔ Both are 32-character-capable strings, so a forward written in the wrong order TYPE-CHECKS
     * PERFECTLY and silently asks the wrong question. Only an order assertion can catch it. */
    const probe = admitAll();

    await probe.handler.getProductSkusBySelectedOptions({
      pathParameters: { productID: PRODUCT_ID },
      queryStringParameters: { selectedOptions: 'opt-1,opt-2' },
      headers: {},
    });

    expect(probe.calls).toStrictEqual([
      {
        member: 'getProductSkusBySelectedOptions',
        through: 'service',
        args: ['opt-1,opt-2', PRODUCT_ID],
      },
    ]);
  });

  it('NET-NEW — AAP §0.6.1.3 T5 — an EMPTY selectedOptions is legal and must reach the service', async () => {
    /* `listLen("")` is zero, so zero EXISTS clauses are appended and the query legitimately degenerates
     * to "all option-bearing SKUs of this product". Both `Product.getSkuBySelectedOptions` and
     * `Sku.hasUniqueOptions` depend on that degenerate form — rejecting, defaulting or normalising it
     * would break both callers. */
    const probe = admitAll();

    const result = await probe.handler.getProductSkusBySelectedOptions({
      pathParameters: { productID: PRODUCT_ID },
      queryStringParameters: { selectedOptions: '' },
      headers: {},
    });

    expect(result.statusCode).toBe(200);
    expect(probe.calls).toStrictEqual([
      { member: 'getProductSkusBySelectedOptions', through: 'service', args: ['', PRODUCT_ID] },
    ]);
  });

  it('NET-NEW — an ABSENT selectedOptions parameter is a 400, which is not the same as an empty one', async () => {
    /* T5 makes the EMPTY STRING meaningful; it does not make the parameter optional. The distinction
     * is the reason the reader tests for presence rather than for truthiness. */
    const probe = admitAll();

    const result = await probe.handler.getProductSkusBySelectedOptions({
      pathParameters: { productID: PRODUCT_ID },
      queryStringParameters: {},
      headers: {},
    } satisfies SelectedOptionsEvent);

    expect(result.statusCode).toBe(400);
    expect(probe.calls).toStrictEqual([]);
  });

  it('NET-NEW — a missing productID path parameter is a 400 before the service is reached', async () => {
    const probe = admitAll();

    const result = await probe.handler.getProductSkusBySelectedOptions({
      pathParameters: {},
      queryStringParameters: { selectedOptions: 'o1' },
      headers: {},
    });

    expect(result.statusCode).toBe(400);
    expect(probe.calls).toStrictEqual([]);
  });
});

/* ==============================================================================================
 * API-01 — M1: THE IMPORTER, DISCLOSED AND DELIBERATELY NOT TRANSACTIONAL
 * ============================================================================================== */

describe('productHandler — API-01/M1, the importer entry point', () => {
  it('NET-NEW — AAP §0.6.6 M3 — the importer does NOT enter a transaction', async () => {
    /* [model/dao/ProductDAO.cfc:L177] opens `transaction{` INSIDE the record loop, so each row commits
     * independently: "one transaction per row, not one per import". Wrapping the whole import in a
     * single transaction would CHANGE that semantics, converting a partially-imported catalog into an
     * all-or-nothing one. `ProductWriteGraph` structurally excludes the member for this reason. */
    const probe = admitAll();

    const result = await probe.handler.loadDataFromFile({
      queryStringParameters: { fileURL: 'https://example.test/products.txt' },
      headers: {},
    });

    expect(result.statusCode).toBe(200);
    expect(probe.decisions).toStrictEqual([]);
    expect(probe.calls.map((call) => call.through)).toStrictEqual(['service']);
  });

  it('NET-NEW — L65 — textQualifier is OPTIONAL and is forwarded second when supplied', async () => {
    const supplied = admitAll();
    await supplied.handler.loadDataFromFile({
      queryStringParameters: { fileURL: 'https://example.test/p.txt', textQualifier: '"' },
      headers: {},
    });
    expect(supplied.calls[0]?.args).toStrictEqual(['https://example.test/p.txt', '"']);

    const omitted = admitAll();
    await omitted.handler.loadDataFromFile({
      queryStringParameters: { fileURL: 'https://example.test/p.txt' },
      headers: {},
    });
    expect(omitted.calls[0]?.args).toStrictEqual(['https://example.test/p.txt', undefined]);
  });

  it('NET-NEW — an absent fileURL is a 400, since L65 declares it required', async () => {
    const probe = admitAll();

    const result = await probe.handler.loadDataFromFile({
      queryStringParameters: {},
      headers: {},
    } satisfies LoadDataFromFileEvent);

    expect(result.statusCode).toBe(400);
    expect(probe.calls).toStrictEqual([]);
  });

  it('NET-NEW — F9 — a refused import location is a 400 naming neither the location nor the policy', async () => {
    const probe = admitAll({
      importFailure: new ImportSourceRejectedError(
        "The import location's scheme is not one this deployment permits retrieving from, so no " +
          'retrieval was attempted.',
        {
          context: {
            fileURL: 'file:///etc/passwd.csv',
            scheme: 'file',
            allowedSchemes: ['https'],
          },
        },
      ),
    });

    const result = await probe.handler.loadDataFromFile({
      queryStringParameters: { fileURL: 'file:///etc/passwd.csv' },
      headers: {},
    });

    /*
     * ⭐ SEC-HARDENING (D18-CLASS) — REVIEW FINDING F9 (CWE-918), ASSERTED AT THE ONE LAYER THAT OWNS
     * PRESENTATION. The refusal itself is the adapter's — see
     * `test/adapters/MySqlProductRepository.test.ts` — and what this route owes is a 400 rather than a
     * 500, because the caller CAN name a permitted location and the service is working exactly as
     * configured.
     */
    expect(result.statusCode).toBe(400);

    /*
     * ⛔ AND THE BODY DISCLOSES NOTHING BACK, WHICH IS THE HALF A PROBER CARES ABOUT. An allow-list is
     * precisely what a server-side-request-forgery prober wants to enumerate, so the internal account —
     * the location as supplied, the scheme that failed, and what the policy permits — must not travel:
     * echoing the caller's own string would make this response a probe oracle, and naming the permitted
     * scheme would hand over one bit of the deployment's map.
     */
    expect(result.body).not.toContain('passwd');
    expect(result.body).not.toContain('file:///');
    expect(result.body).not.toContain('https');
    expect(result.body).not.toContain('allowedSchemes');
    expect(result.body).toContain('The requested import location is not permitted');

    /* The route did forward the location before the refusal came back, so this is the presentation of a
     * real refusal from beneath and not a short-circuit here. */
    expect(probe.calls.map((call) => call.member)).toStrictEqual(['loadDataFromFile']);
    expect(probe.calls[0]?.args).toStrictEqual(['file:///etc/passwd.csv', undefined]);
  });
});

/* ==============================================================================================
 * API-01/TX-01 — THE PROCESS PIPELINE
 * ============================================================================================== */

describe('productHandler — API-01/TX-01, the process pipeline enters a transaction', () => {
  it('NET-NEW — every process route reaches the GRAPH, never the captured service', async () => {
    /* ⛔ This is TX-01's defect shape at the Product boundary. A route that closed over the injected
     * service would run identically in every happy-path assertion while performing its writes OUTSIDE
     * the transaction — so the only thing that catches it is asserting WHICH object answered. */
    const probe = admitAll();

    await probe.handler.processProductAddOptionGroup(payloadEvent('{"optionGroup":"g1"}'));
    await probe.handler.processProductAddOption(payloadEvent('{"option":"o1"}'));
    await probe.handler.processProductUpdateSkus(payloadEvent('{"updatePriceFlag":1,"price":10}'));

    // Both the read of the subject and the process call itself must be inside the transaction.
    expect(probe.calls.every((call) => call.through === 'graph')).toBe(true);
    expect(probe.decisions).toStrictEqual(['commit', 'commit', 'commit']);
  });

  it('NET-NEW — AAP §0.6.6 M6 — the subject is READ through the transaction graph', async () => {
    const probe = admitAll();

    await probe.handler.processProductUpdateSkus(payloadEvent('{}'));

    // getProduct precedes the process member, and both are on the graph.
    expect(probe.calls.map((call) => call.member)).toStrictEqual([
      'getProduct',
      'processProductUpdateSkus',
    ]);
    expect(probe.calls.map((call) => call.through)).toStrictEqual(['graph', 'graph']);
  });

  it('NET-NEW — an unknown identifier is a 404, and the process member is never reached', async () => {
    /* ⚠️ THE UNIT STILL COMMITS, and that is correct rather than a leak. The subject is read INSIDE the
     * transaction, so a miss returns early with the gate's `subject` still unset — leaving a read-only
     * unit with nothing to undo. Rolling a pure read back would raise a spurious failure. The assertion
     * that carries weight is therefore that NO WRITE MEMBER RAN, not that no transaction opened. */
    const probe = admitAll({ product: null });

    const result = await probe.handler.processProductUpdateSkus(payloadEvent('{}'));

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toStrictEqual({ message: 'Not found' });
    expect(probe.calls.map((call) => call.member)).toStrictEqual(['getProduct']);
    expect(probe.decisions).toStrictEqual(['commit']);
  });

  it('NET-NEW — TX-01 — a SKU-level finding ROLLS BACK, not only a product-level one', async () => {
    /* ⛔ THE COMPLETE PREDICATE, NOT `product.hasErrors()`. `skuBatchHasErrors` reads the product's own
     * bag OR any member SKU's bag. Narrowing the gate to the product alone would commit a batch whose
     * SKUs carry findings — exactly what AAP §0.6.2's read-back loop depends on being prevented. */
    const withFailingSku = makeProduct();
    /* `Sku` declares no error surface of its own; `manageEntity` is what attaches the bag, exactly as
     * the service's own creation path does. Using a bare `Sku` here would leave the member invisible to
     * `carriesErrorSurface` and the case would pass for the wrong reason. */
    const failing = manageEntity(new Sku(), SKU_ENTITY_METADATA);
    failing.skuID = 'cccccccccccccccccccccccccccccccc';
    failing.addError('skuCode', 'is not unique');
    withFailingSku.skus = [failing];

    const probe = admitAll({ product: withFailingSku });

    const result = await probe.handler.processProductUpdateSkus(payloadEvent('{}'));

    expect(probe.decisions).toStrictEqual(['rollback']);
    // The roll-back surfaces as a failure rather than as a 200 over discarded work.
    expect(result.statusCode).not.toBe(200);
  });

  it('NET-NEW — a product-level finding also rolls back', async () => {
    const withError = makeProduct();
    withError.addError('productName', 'is required');

    const probe = admitAll({ product: withError });

    await probe.handler.processProductUpdateSkus(payloadEvent('{}'));

    expect(probe.decisions).toStrictEqual(['rollback']);
  });

  it('NET-NEW — AAP §0.4.1.5 — a legitimate ZERO survives into the process object', async () => {
    /* `model/validation/Product_UpdateSkus.json` conditions the price rules on `{"eq":1}`, so the flag
     * values are data, not booleans. Reading them with truthiness would silently DROP a legitimate `0`
     * and turn "explicitly do not update" into "unspecified". */
    const probe = admitAll();

    await probe.handler.processProductUpdateSkus(
      payloadEvent('{"updatePriceFlag":0,"price":0,"updateListPriceFlag":0,"listPrice":0}'),
    );

    const call = probe.calls.find((entry) => entry.member === 'processProductUpdateSkus');
    const processObject = call?.args[1] as ProductUpdateSkus | undefined;

    expect(processObject?.updatePriceFlag).toBe(0);
    expect(processObject?.price).toBe(0);
    expect(processObject?.updateListPriceFlag).toBe(0);
    expect(processObject?.listPrice).toBe(0);
  });

  it('NET-NEW — the addOptionGroup and addOption payload keys land on their process objects', async () => {
    const groupProbe = admitAll();
    await groupProbe.handler.processProductAddOptionGroup(
      payloadEvent('{"optionGroup":"group-1"}'),
    );
    const groupCall = groupProbe.calls.find(
      (entry) => entry.member === 'processProductAddOptionGroup',
    );
    expect((groupCall?.args[1] as ProductAddOptionGroup | undefined)?.optionGroup).toBe('group-1');

    const optionProbe = admitAll();
    await optionProbe.handler.processProductAddOption(payloadEvent('{"option":"option-1"}'));
    const optionCall = optionProbe.calls.find(
      (entry) => entry.member === 'processProductAddOption',
    );
    expect((optionCall?.args[1] as ProductAddOption | undefined)?.option).toBe('option-1');
  });

  it('NET-NEW — a malformed body is a 400 before any transaction opens', async () => {
    const probe = admitAll();

    const result = await probe.handler.processProductUpdateSkus(payloadEvent('not json'));

    expect(result.statusCode).toBe(400);
    expect(probe.decisions).toStrictEqual([]);
  });

  it('NET-NEW — processProductUpdateDefaultImageFileNames takes ONE argument, not two', async () => {
    /* [model/service/ProductService.cfc:L208] declares `( required any product )` alone. It is the only
     * process member with that arity, and it reads no body. */
    const probe = admitAll();

    await probe.handler.processProductUpdateDefaultImageFileNames(identifierEvent(PRODUCT_ID));

    const call = probe.calls.find(
      (entry) => entry.member === 'processProductUpdateDefaultImageFileNames',
    );
    expect(call?.args).toHaveLength(1);
  });
});

/* ==============================================================================================
 * API-01 — SAVE, DELETE AND THE READ-ONLY ROUTES
 * ============================================================================================== */

describe('productHandler — API-01, saveProduct, saveProductType and deleteProduct', () => {
  it('NET-NEW — an ABSENT identifier CREATES through newProduct, and does not 404', async () => {
    const probe = admitAll();

    const result = await probe.handler.saveProduct({
      body: '{"productName":"New"}',
      pathParameters: {},
      headers: {},
    } satisfies ProductSaveEvent);

    expect(result.statusCode).toBe(200);
    expect(probe.calls.map((call) => call.member)).toStrictEqual(['newProduct', 'saveProduct']);
    expect(probe.calls.every((call) => call.through === 'graph')).toBe(true);
    expect(probe.decisions).toStrictEqual(['commit']);
  });

  it('NET-NEW — a PRESENT identifier UPDATES, and an unknown one is a 404', async () => {
    const present = admitAll();
    await present.handler.saveProduct(payloadEvent('{}'));
    expect(present.calls.map((call) => call.member)).toStrictEqual(['getProduct', 'saveProduct']);

    const missing = admitAll({ product: null });
    const result = await missing.handler.saveProduct(payloadEvent('{}'));
    expect(result.statusCode).toBe(404);
    // The read happened inside the unit, so it commits with nothing to undo; the SAVE never ran.
    expect(missing.calls.map((call) => call.member)).toStrictEqual(['getProduct']);
  });

  it('NET-NEW — the saveProduct gate reads the PRE-SAVE subject, not only the returned instance', async () => {
    /* ⛔ THE DECISIVE CASE FOR THE GATE'S FIRST HALF. STEP 5 of the service rebinds its local —
     * `product = await this.persistProduct(product)` — so the instance the persister answers with MAY
     * DIFFER from the one validation accumulated onto. Here the PRE-SAVE subject carries the finding and
     * the persister answers with a DIFFERENT, CLEAN product. A gate reading only the returned instance
     * would see no findings and COMMIT a subject that had them. */
    const withError = makeProduct();
    withError.addError('productCode', 'is not unique');

    const clean = makeProduct('dddddddddddddddddddddddddddddddd');

    const probe = admitAll({ product: withError, savedProduct: clean });

    await probe.handler.saveProduct(payloadEvent('{}'));

    expect(probe.decisions).toStrictEqual(['rollback']);
  });

  it('NET-NEW — the saveProduct gate ALSO reads the returned instance, not only the subject', async () => {
    /* The mirror of the case above, so neither half of the disjunction can be dropped: the subject is
     * clean and the instance the persister answers with carries the finding. */
    const clean = makeProduct();

    const withError = makeProduct('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    withError.addError('urlTitle', 'is not unique');

    const probe = admitAll({ product: clean, savedProduct: withError });

    await probe.handler.saveProduct(payloadEvent('{}'));

    expect(probe.decisions).toStrictEqual(['rollback']);
  });

  it('NET-NEW — L294 — saveProductType REQUIRES an identifier, so an absent one is a 400', async () => {
    /* Unlike `saveProduct` there is no create route here: AAP §0.4.2.5 approves `getProductType` but no
     * `newProductType`, and no `createproducttype.cfm` view exists to imply one. */
    const probe = admitAll();

    const result = await probe.handler.saveProductType(productTypePayloadEvent('{}'));

    expect(result.statusCode).toBe(400);
    expect(probe.calls).toStrictEqual([]);
    expect(probe.decisions).toStrictEqual([]);
  });

  it('NET-NEW — saveProductType commits when the returned product type carries no findings', async () => {
    /* The success half of the gate. `model/service/ProductService.cfc:L310` returns the product type on
     * every path, so "succeeded" is expressed as a returned entity with an EMPTY bag — not as the absence
     * of a rejection. */
    const probe = admitAll();

    const result = await probe.handler.saveProductType(
      productTypePayloadEvent('{"productTypeName":"Merchandise"}', PRODUCT_TYPE_ID),
    );

    expect(result.statusCode).toBe(200);
    expect(probe.decisions).toStrictEqual(['commit']);
    expect(probe.calls.map((call) => call.member)).toStrictEqual([
      'getProductType',
      'saveProductType',
    ]);
  });

  it('NET-NEW — saveProductType ROLLS BACK and refuses when the returned product type carries findings', async () => {
    /* ⛔ THE CASE THAT PINS THE COMMIT GATE, AND THE ONE AN EARLIER REVISION COULD NOT HAVE WRITTEN.
     * `../../src/handlers/productHandler`'s gate was hardcoded to `() => false` on the reasoning that
     * `ProductType` has no error surface and that `BaseService.save` raises. Both grounds are gone: the
     * service composes the surface with `manageEntity` and resolves `ProductTypeWithErrorState`, and the
     * base service reproduces `model/service/HibachiService.cfc:L103`'s single exit, so a validation
     * failure RETURNS. With a constant `false` this exact request would have committed the transaction and
     * answered 200 with a projection of a product type that was never written — a caller told its write
     * succeeded when it did not. The gate must therefore answer `true` here, and the boundary must refuse.
     *
     * The findings stay ON THE ENTITY, exactly where `:L306` reads them; the roll-back is what reports the
     * refusal, which is why nothing is lifted into a carrier at this boundary. */
    const probe = admitAll({ productTypeSaveError: 'productTypeName' });

    const result = await probe.handler.saveProductType(
      productTypePayloadEvent('{"productTypeName":""}', PRODUCT_TYPE_ID),
    );

    expect(probe.decisions).toStrictEqual(['rollback']);
    expect(result.statusCode).not.toBe(200);
    /* The work still ran in full — the gate is a COMMIT decision, not a pre-check that skips the save. */
    expect(probe.calls.map((call) => call.member)).toStrictEqual([
      'getProductType',
      'saveProductType',
    ]);
  });

  it('NET-NEW — L317 — deleteProduct reports its boolean UNINVERTED, and false is not a refusal', async () => {
    /* The legacy declares `public boolean function deleteProduct(...)`. `false` means "the delete was
     * refused by a validation guard", which is a 200 carrying `false` — NOT a 4xx. Reinterpreting it as
     * a status would invent a refusal the legacy does not express. */
    const probe = admitAll();

    const result = await probe.handler.deleteProduct(identifierEvent(PRODUCT_ID));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toBe(true);
    expect(probe.decisions).toStrictEqual(['commit']);
  });

  it('NET-NEW — L317 — a REFUSED delete is a 200 carrying false, NOT a 404 and NOT a 4xx', async () => {
    /* ⛔ THE CASE THAT PINS THE BOOLEAN'S MEANING. `model/validation/Product.json` guards the delete on
     * `transactionExistsFlag` and `physicalCounts`, and a guard that refuses makes the legacy member
     * answer `false` — a SUCCESSFUL call reporting "not deleted". Mapping that onto a 404 would conflate
     * "no such product" with "this product may not be deleted", and mapping it onto any 4xx would invent
     * a client error the legacy does not express. */
    const probe = admitAll({ deleteResult: false });

    const result = await probe.handler.deleteProduct(identifierEvent(PRODUCT_ID));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toBe(false);
    // The refusal is the service's answer, so the unit still commits: nothing was written to undo.
    expect(probe.decisions).toStrictEqual(['commit']);
  });

  it('NET-NEW — deleteProduct on an unknown identifier is a 404, distinct from a refused delete', async () => {
    /* Three outcomes must stay distinguishable: 404 "no such row", 200-carrying-`false` "a guard refused
     * the delete", and 200-carrying-`true` "deleted". Collapsing any pair would lose information the
     * legacy boolean carries. */
    const probe = admitAll({ product: null });

    const result = await probe.handler.deleteProduct(identifierEvent(PRODUCT_ID));

    expect(result.statusCode).toBe(404);
    expect(probe.calls.map((call) => call.member)).toStrictEqual(['getProduct']);
  });
});

describe('productHandler — API-01, the read-only routes', () => {
  it('NET-NEW — the read routes do NOT open a transaction', async () => {
    const probe = admitAll();

    await probe.handler.getProduct(identifierEvent(PRODUCT_ID));
    await probe.handler.getProductType(identifierEvent(PRODUCT_TYPE_ID));
    await probe.handler.getProductSmartList({ queryStringParameters: {}, headers: {} });
    await probe.handler.getFormattedOptionGroups(identifierEvent(PRODUCT_ID));

    expect(probe.decisions).toStrictEqual([]);
    expect(probe.calls.every((call) => call.through === 'service')).toBe(true);
  });

  it('NET-NEW — getProduct projects a response rather than returning the entity', async () => {
    const probe = admitAll();

    const result = await probe.handler.getProduct(identifierEvent(PRODUCT_ID));

    expect(result.statusCode).toBe(200);
    // A projection, so no domain method or private field can leak through the boundary.
    expect(JSON.parse(result.body)).toStrictEqual({ productID: PRODUCT_ID });
  });

  it('NET-NEW — getProduct on an unknown identifier is a 404, and an absent one is a 400', async () => {
    const missing = admitAll({ product: null });
    expect((await missing.handler.getProduct(identifierEvent(PRODUCT_ID))).statusCode).toBe(404);

    const absent = admitAll();
    const result = await absent.handler.getProduct(identifierEvent());
    expect(result.statusCode).toBe(400);
    expect(absent.calls).toStrictEqual([]);
  });

  it('NET-NEW — AAP §0.4.2.1 Discrepancy 1 — currentURL is NOT forwarded from the request', async () => {
    /* [L342] declares `getProductSmartList(struct data={}, currentURL="")`, and `currentURL` carries NO
     * CFML type at all. The target tightens it to an optional string and the boundary supplies no value
     * for it: a request-supplied URL is not the legacy's `currentURL`, which came from the framework. */
    const probe = admitAll();

    await probe.handler.getProductSmartList({
      queryStringParameters: { currentURL: 'https://attacker.test/' },
      headers: {},
    } satisfies ProductSmartListEvent);

    const call = probe.calls.find((entry) => entry.member === 'getProductSmartList');
    expect(call?.args[1]).toBeUndefined();
  });

  it('NET-NEW — only the legacy SmartList vocabulary is forwarded; unknown names are ignored', async () => {
    /* `org/Hibachi/HibachiSmartList.cfc` recognises seven exact names and seven prefixes. Anything else
     * is not a filter and must not be smuggled into the query as one. */
    const probe = admitAll();

    await probe.handler.getProductSmartList({
      queryStringParameters: {
        keyword: 'shirt',
        'P:Current': '2',
        'F:productName': 'shirt',
        bogus: 'ignored',
        joins: 'ignored-too',
      },
      headers: {},
    });

    const call = probe.calls.find((entry) => entry.member === 'getProductSmartList');
    const input = call?.args[0] as Record<string, unknown> | undefined;

    expect(input).toStrictEqual({ keyword: 'shirt', 'P:Current': '2', 'F:productName': 'shirt' });
  });

  it('NET-NEW — the smart-list projection preserves every pagination member', async () => {
    const probe = admitAll();

    const result = await probe.handler.getProductSmartList({
      queryStringParameters: {},
      headers: {},
    });

    expect(JSON.parse(result.body)).toStrictEqual({
      records: [],
      pageRecords: [],
      recordsCount: 0,
      pageRecordsStart: 0,
      pageRecordsEnd: 0,
      currentPage: 1,
      totalPages: 0,
    });
  });

  it('NET-NEW — newProduct answers a projection of an unsaved product without a transaction', async () => {
    const probe = admitAll();

    const result = await probe.handler.newProduct({ headers: {} });

    expect(result.statusCode).toBe(200);
    expect(probe.decisions).toStrictEqual([]);
    expect(probe.calls.map((call) => call.member)).toStrictEqual(['newProduct']);
  });

  it('NET-NEW — getFormattedOptionGroups answers the grouped select projection as an ARRAY', async () => {
    const probe = admitAll();

    const result = await probe.handler.getFormattedOptionGroups(identifierEvent(PRODUCT_ID));

    expect(result.statusCode).toBe(200);
    /* An ARRAY on the wire, one entry per option-group NAME, because that is the shape the service
     * answers (AAP §0.4.2.1) and a JSON object's member order is not a value a client may rely on. Both
     * option members are copied verbatim and nothing else is published — no `optionGroupID` (S9). */
    expect(JSON.parse(result.body)).toStrictEqual([
      { optionGroupName: 'Size', options: [{ name: 'Large', value: 'large' }] },
    ]);
  });
});

/* ==============================================================================================
 * API-01 — THE BOUNDARY-STUBBED MEMBERS: FLAGGED, NEVER DROPPED (TR-5)
 * ============================================================================================== */

describe('productHandler — API-01/TR-5, the boundary-stubbed members stay routable', () => {
  it('NET-NEW — TR-5 — all five stubbed process members are PRESENT on the surface', () => {
    /* "The member is never quietly dropped from the interface." Their unimplemented state is answered
     * at runtime by the SERVICE, so the handler must route them rather than omit them. */
    const probe = admitAll();

    for (const member of [
      'processProductAddProductReview',
      'processProductAddSubscriptionTerm',
      'processProductDeleteDefaultImage',
      'processProductUpdateDefaultImageFileNames',
      'processProductUploadDefaultImage',
    ]) {
      expect(Object.keys(probe.handler)).toContain(member);
      expect(typeof (probe.handler as unknown as Record<string, unknown>)[member]).toBe('function');
    }
  });

  it('NET-NEW — a stubbed member reaches the graph like any other write route', async () => {
    /* The handler hardcodes no not-implemented status of its own: whether the operation is available is
     * the service's answer, surfaced through the shared error shaping. */
    const probe = admitAll();

    const result = await probe.handler.processProductAddProductReview(payloadEvent('{}'));

    expect(result.statusCode).toBe(200);
    expect(probe.calls.map((call) => call.through)).toStrictEqual(['graph', 'graph']);
  });

  it('NET-NEW — D6 — addSubscriptionTerm still takes exactly TWO arguments', async () => {
    /* [model/service/ProductService.cfc:L180-L181] guards on `processObject.getListPrice()` and then
     * assigns from `arguments.data.listPrice`, an argument the signature does not declare. Guideline 4
     * forbids repairing it, and ⛔ adding a third parameter to make it work WOULD BE that repair. */
    const probe = admitAll();

    await probe.handler.processProductAddSubscriptionTerm(payloadEvent('{"listPrice":10}'));

    const call = probe.calls.find((entry) => entry.member === 'processProductAddSubscriptionTerm');
    expect(call?.args).toHaveLength(2);
  });
});
