/**
 * The SKU Lambda boundary — API-02 identifier binding and TX-01 transaction integration.
 *
 * AAP authority: AAP §0.4.4 authorises `slatwall-ts/test/**` | CREATE. AAP §0.4.1.12 defines no
 * `test/handlers/` directory, and that absence is itself the reason this file exists: both findings it
 * covers are BOUNDARY defects, and an unexercised boundary is exactly how each of them shipped. The
 * service beneath was tested and correct in isolation; what nobody asserted was what the route did with
 * it.
 *
 * =================================================================================================
 * WHAT THESE CASES PROVE
 * =================================================================================================
 * API-02 — the route bound NO identifier. `TransactionExistsEvent` was `Pick<…,'headers'>` and the call
 * was `getTransactionExistsFlag()`, so the repository's "requires either a SKU identifier or a product
 * identifier" guard fired on every request and an operation typed `Promise<boolean>` could only fail. The
 * cases below assert the identifiers travel, and — the part a "does it get called" test would miss — that
 * they travel in the right SLOTS, since the service is SKU-first and the repository is product-first.
 *
 * TX-01 — the route called the CAPTURED service, which is bound to the pool. Every SKU in a batch was
 * therefore written outside any transaction and was durable before validation had an opinion, so an
 * invalid batch committed: `createSkus` returns `true` unconditionally, and per-SKU findings never reach
 * the product's bag. The cases below assert that the write path enters the runner, that it uses the
 * graph's members rather than the captured ones, and that the commit gate sees a SKU-only finding.
 *
 * NO AWS AND NO DATABASE. Each case builds the one- or two-member event slice the route declares, exactly
 * as the handler's own comments anticipate, and every collaborator is a plain recording object.
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP §0.6.5.2 records that no legacy test covers any service
 * in this slice, and no legacy equivalent of a Lambda boundary exists at all.
 */
import { MySqlTransactionalWriteRunner } from '../../src/adapters/mysql/MySqlTransactionalWriteRunner';
import { manageEntity } from '../../src/domain/base/populate';
import { Product } from '../../src/domain/product/Product';
import { SKU_ENTITY_METADATA, Sku } from '../../src/domain/sku/Sku';
import { DomainError } from '../../src/errors/DomainError';
import { createSkuHandler } from '../../src/handlers/skuHandler';

import type { UnitOfWorkRunner } from '../../src/adapters/mysql/MySqlTransactionalWriteRunner';
import type { TransactionScope } from '../../src/adapters/mysql/UnitOfWork';
import type { SkuSurface, SkuWriteGraph } from '../../src/handlers/skuHandler';
import type { RequestAuthorizationResolver } from '../../src/ports/AccountContextPort';
import type { TransactionalWriteRunner } from '../../src/ports/TransactionalWritePort';
import type { ProductWithErrorState } from '../../src/services/SkuService';

/** A 32-character identifier, the only width the schema declares (IR-6). */
const PRODUCT_ID = 'bbbbbbbb000000000000000000000001';

/**
 * An authorisation resolver that admits every request.
 *
 * ⚠️ PERMISSIVE ON PURPOSE, AND NOT A GAP IN THESE CASES. The gate is a separate concern with its own
 * ladder, and every route under test runs it FIRST — so a restrictive resolver here would short-circuit
 * each case before it reached the behaviour being asserted, and would prove only that the gate works.
 */
const ADMIT_EVERY_REQUEST: RequestAuthorizationResolver<{ headers: unknown }> = () => ({
  accountContext: {
    getCurrentAccount: () => ({
      accountID: 'aaaaaaaa000000000000000000000001',
      newFlag: false,
      adminAccountFlag: true,
    }),
  },
  entityAuthorization: { authenticateEntity: (): boolean => true },
});

/**
 * A SKU service surface whose every member fails loudly unless a case overrides it.
 *
 * The `UNREACHED_COLLABORATOR` discipline from `test/services/SkuService.test.ts`, applied per member: a
 * route that reaches a member this case did not intend fails on that member rather than passing against a
 * stub that answered something plausible.
 */
function makeSkuSurface(overrides: Partial<SkuSurface>): SkuSurface {
  const refuse = (member: string) => (): never => {
    throw new Error(`SkuSurface.${member} was not expected to be called by this case`);
  };

  return {
    createSkus: refuse('createSkus'),
    processImageUpload: refuse('processImageUpload'),
    getProductSkus: refuse('getProductSkus'),
    getSortedProductSkus: refuse('getSortedProductSkus'),
    searchSkusByProductType: refuse('searchSkusByProductType'),
    getSkuStocksDeletableFlag: refuse('getSkuStocksDeletableFlag'),
    getTransactionExistsFlag: refuse('getTransactionExistsFlag'),
    getSkuBySkuCode: refuse('getSkuBySkuCode'),
    getSkuSmartList: refuse('getSkuSmartList'),
    /*
     * The bounded reader is part of the surface because the boundary mounts a bounded route for it; a
     * double that omitted it would compile only while the surface happened not to require it.
     */
    searchSkusByProductTypeBounded: refuse('searchSkusByProductTypeBounded'),
    newSku: refuse('newSku'),
    ...overrides,
  };
}

/**
 * A write runner that reproduces `UnitOfWork.run`'s decision, without a pool.
 *
 * ⛔ IT MUST EVALUATE THE GATE AND THROW ON A ROLL-BACK, because that is the behaviour under test. A
 * double that ran the work and returned its value would make every TX-01 case pass while asserting
 * nothing about the commit decision — which is the whole finding.
 */
function makeWriteRunner(graph: SkuWriteGraph): {
  readonly runner: TransactionalWriteRunner<SkuWriteGraph>;
  readonly decisions: ('commit' | 'rollback')[];
} {
  const decisions: ('commit' | 'rollback')[] = [];

  return {
    decisions,
    runner: {
      runWrite: async <TResult>(
        work: (graph: SkuWriteGraph) => Promise<TResult>,
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

/** A product whose identifier the route will address. */
function makeProduct(): ProductWithErrorState {
  const product = new Product();
  product.productID = PRODUCT_ID;
  return product;
}

/** A SKU carrying the error bag `manageEntity` attaches; `Sku` alone declares none. */
function makeManagedSku(): ReturnType<typeof manageEntity<'skuID', Sku>> {
  return manageEntity(new Sku(), SKU_ENTITY_METADATA);
}

/** The event slice `createSkus` declares: a path parameter, a body and headers. */
function createSkusEvent(): {
  body: string;
  pathParameters: Record<string, string>;
  headers: Record<string, string>;
} {
  return {
    body: JSON.stringify({ price: 10 }),
    pathParameters: { productID: PRODUCT_ID },
    headers: {},
  };
}

describe('SkuHandler.createSkus — the write path enters a transaction (TX-01)', () => {
  it('NET-NEW — the CAPTURED service is never called; the graph’s is', async () => {
    const product = makeProduct();
    let graphCalls = 0;

    const graph: SkuWriteGraph = {
      resolveProduct: () => Promise.resolve(product),
      skuService: {
        createSkus: () => {
          graphCalls += 1;
          return Promise.resolve(true);
        },
      },
    };
    const { runner, decisions } = makeWriteRunner(graph);

    /* ⭐ THE CAPTURED SURFACE REFUSES EVERY MEMBER. Before this fix the route called exactly this
     * object — bound to the POOL — so if the fix regressed, `createSkus` here would throw and the case
     * would fail rather than quietly writing outside the transaction. */
    const handler = createSkuHandler(
      makeSkuSurface({}),
      () => {
        throw new Error('the CAPTURED product resolver must not be used by the write path');
      },
      ADMIT_EVERY_REQUEST,
      runner,
    );

    const response = await handler.createSkus(createSkusEvent());

    expect(graphCalls).toBe(1);
    expect(decisions).toEqual(['commit']);
    expect(response.statusCode).toBe(200);
  });

  it('NET-NEW — M6 — the product is READ through the transaction’s own graph', async () => {
    const product = makeProduct();
    let resolvedThroughGraph = 0;

    const graph: SkuWriteGraph = {
      resolveProduct: (productID: string) => {
        expect(productID).toBe(PRODUCT_ID);
        resolvedThroughGraph += 1;
        return Promise.resolve(product);
      },
      skuService: { createSkus: () => Promise.resolve(true) },
    };
    const { runner } = makeWriteRunner(graph);

    const handler = createSkuHandler(
      makeSkuSurface({}),
      () => {
        throw new Error('the CAPTURED product resolver must not be used by the write path');
      },
      ADMIT_EVERY_REQUEST,
      runner,
    );

    await handler.createSkus(createSkusEvent());

    /* AAP §0.6.2: `hasUniqueOptions` is a validation rule that QUERIES the sibling SKUs the same
     * operation is writing. Reading the aggregate on the pool while writing in the transaction would show
     * that rule a sibling set missing every SKU just created — M6's silent divergence exactly. */
    expect(resolvedThroughGraph).toBe(1);
  });

  it('NET-NEW — a clean batch COMMITS and the boolean is serialised unchanged', async () => {
    const graph: SkuWriteGraph = {
      resolveProduct: () => Promise.resolve(makeProduct()),
      skuService: { createSkus: () => Promise.resolve(true) },
    };
    const { runner, decisions } = makeWriteRunner(graph);

    const handler = createSkuHandler(
      makeSkuSurface({}),
      () => Promise.resolve(null),
      ADMIT_EVERY_REQUEST,
      runner,
    );

    const response = await handler.createSkus(createSkusEvent());

    expect(decisions).toEqual(['commit']);
    // Judgment (n): the boolean is the body, not wrapped in an envelope.
    expect(JSON.parse(response.body)).toBe(true);
  });

  it('NET-NEW — ⭐ a SKU-ONLY finding ROLLS BACK, which product.hasErrors() alone cannot detect', async () => {
    const product = makeProduct();

    const graph: SkuWriteGraph = {
      resolveProduct: () => Promise.resolve(product),
      skuService: {
        createSkus: () => {
          /* What the real `createSkus` does for a colliding SKU code: the finding lands on the SKU, the
           * product's bag stays empty, and `true` is returned regardless [model/service/SkuService.cfc:L207]. */
          const failed = makeManagedSku();
          failed.addError('skuCode', 'This SKU code is already in use.');
          product.skus = [failed];
          return Promise.resolve(true);
        },
      },
    };
    const { runner, decisions } = makeWriteRunner(graph);

    const handler = createSkuHandler(
      makeSkuSurface({}),
      () => Promise.resolve(null),
      ADMIT_EVERY_REQUEST,
      runner,
    );

    const response = await handler.createSkus(createSkusEvent());

    /* THE CASE THAT DEFINES THIS FIX. Both signals a naive gate would read say "success": the product
     * carries nothing and the work returned `true`. Only the per-SKU bag knows, so a gate narrowed to
     * `product.hasErrors()` would COMMIT an invalid batch. */
    expect(product.hasErrors()).toBe(false);
    expect(decisions).toEqual(['rollback']);
    expect(response.statusCode).not.toBe(200);

    /*
     * THE FINDINGS ARE PUBLISHED, NOT MASKED, AND THAT IS THE POINT OF LIFTING THEM. Declining to commit
     * is how the boundary expresses the legacy's "settled as a rollback" branch, but the findings live on
     * the SKU rather than on the rejection, so the route lifts them into a ../errors/ValidationError.
     * AAP 0.4.1.11 requires the error-key structure to be preserved "so validation failures remain
     * comparable to legacy output" — a caller has to be able to see WHICH rule refused, and a body
     * carrying `message` alone could not tell it. `errors` is a declared optional member of the error
     * body, present exactly when there are keys to report.
     */
    const body = JSON.parse(response.body) as { message: string; errors?: Record<string, unknown> };

    expect(Object.keys(body)).toStrictEqual(['message', 'errors']);
    /* The key is the SKU property the rule refused, and the text is copied UNCHANGED from the finding. */
    expect(body.errors).toStrictEqual({ skuCode: ['This SKU code is already in use.'] });
  });

  it('NET-NEW — a finding on the PRODUCT rolls back too', async () => {
    const product = makeProduct();

    const graph: SkuWriteGraph = {
      resolveProduct: () => Promise.resolve(product),
      skuService: {
        createSkus: () => {
          // [model/service/SkuService.cfc:L143/:L148/:L176] — branch preconditions go to the product.
          product.addError('productType', 'Options cannot be added to this product type.');
          return Promise.resolve(true);
        },
      },
    };
    const { runner, decisions } = makeWriteRunner(graph);

    const handler = createSkuHandler(
      makeSkuSurface({}),
      () => Promise.resolve(null),
      ADMIT_EVERY_REQUEST,
      runner,
    );

    await handler.createSkus(createSkusEvent());

    expect(decisions).toEqual(['rollback']);
  });

  it('NET-NEW — an unknown product is a 404, and the empty transaction still commits', async () => {
    const graph: SkuWriteGraph = {
      resolveProduct: () => Promise.resolve(null),
      skuService: {
        createSkus: () => {
          throw new Error('createSkus must not run for a product that does not exist');
        },
      },
    };
    const { runner, decisions } = makeWriteRunner(graph);

    const handler = createSkuHandler(
      makeSkuSurface({}),
      () => Promise.resolve(null),
      ADMIT_EVERY_REQUEST,
      runner,
    );

    const response = await handler.createSkus(createSkusEvent());

    /* Nothing was written, so there is nothing to discard: a missing product is a 404, not a failed
     * batch, and treating it as a roll-back would report a server-side failure for a client-side miss. */
    expect(response.statusCode).toBe(404);
    expect(decisions).toEqual(['commit']);
  });
});

describe('SkuHandler.getTransactionExistsFlag — the identifiers are bound (API-02)', () => {
  function makeHandler(): {
    readonly handler: ReturnType<typeof createSkuHandler>;
    readonly calls: (string | undefined)[][];
  } {
    const calls: (string | undefined)[][] = [];

    const handler = createSkuHandler(
      makeSkuSurface({
        getTransactionExistsFlag: (skuID?: string, productID?: string): Promise<boolean> => {
          calls.push([skuID, productID]);
          return Promise.resolve(true);
        },
      }),
      () => Promise.resolve(null),
      ADMIT_EVERY_REQUEST,
      makeWriteRunner({
        resolveProduct: () => Promise.resolve(null),
        skuService: { createSkus: () => Promise.resolve(true) },
      }).runner,
    );

    return { handler, calls };
  }

  it('NET-NEW — model/entity/Sku.cfc:L594 — a query-string skuID reaches the service, SKU slot first', async () => {
    const { handler, calls } = makeHandler();

    const response = await handler.getTransactionExistsFlag({
      queryStringParameters: { skuID: 'aaaaaaaa000000000000000000000009' },
      headers: {},
    });

    /* ⭐ THE SLOTS ARE THE ASSERTION. The service is `(skuID?, productID?)`; the repository beneath is
     * `(productID?, skuID?)`. Both identifiers are 32-character strings, so an inverted forward compiles
     * and silently asks about the wrong column — and since this flag gates a DELETE, the wrong answer
     * PERMITS a destructive delete the legacy blocks. */
    expect(calls).toEqual([['aaaaaaaa000000000000000000000009', undefined]]);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toBe(true);
  });

  it('NET-NEW — model/entity/Product.cfc:L626 — a query-string productID reaches the service', async () => {
    const { handler, calls } = makeHandler();

    await handler.getTransactionExistsFlag({
      queryStringParameters: { productID: PRODUCT_ID },
      headers: {},
    });

    expect(calls).toEqual([[undefined, PRODUCT_ID]]);
  });

  it('NET-NEW — model/dao/SkuDAO.cfc:L58-L64 — both are forwarded; the DAO, not the route, prefers the SKU', async () => {
    const { handler, calls } = makeHandler();

    await handler.getTransactionExistsFlag({
      queryStringParameters: { productID: PRODUCT_ID, skuID: 'aaaaaaaa000000000000000000000009' },
      headers: {},
    });

    // The boundary does not choose between them. Choosing here would move the precedence rule.
    expect(calls).toEqual([['aaaaaaaa000000000000000000000009', PRODUCT_ID]]);
  });

  it('NET-NEW — neither supplied still forwards nothing, so the failure stays where the legacy’s is', async () => {
    const { handler, calls } = makeHandler();

    await handler.getTransactionExistsFlag({ queryStringParameters: null, headers: {} });

    /* IR-9: no guard is added here. The legacy's own else-branch dereferences an unbound `:productID`
     * [model/dao/SkuDAO.cfc:L90], and the repository reproduces that refusal at the same layer. */
    expect(calls).toEqual([[undefined, undefined]]);
  });
});

describe('MySqlTransactionalWriteRunner — the graph is built for the transaction (TX-01)', () => {
  /** A scope carrying a recognisable executor, so a case can prove the graph was built from it. */
  const scope: TransactionScope = {
    /*
     * `executeMutation` is part of the transactional executor contract — the scoped executor reports an
     * affected-row count as well as rows, so a double that published only `execute` no longer satisfies
     * it. It refuses rather than answering zero: no case here issues a mutation through this scope, and
     * a plausible zero would hide one that did.
     */
    executor: {
      execute: () => Promise.resolve([]),
      executeMutation: (): Promise<number> => {
        throw new Error('executeMutation was not expected to be called by this case');
      },
    },
  };

  /** A UnitOfWork slice that runs the work against `scope` and reproduces the commit decision. */
  function makeUnitOfWork(): { readonly unitOfWork: UnitOfWorkRunner; readonly gates: boolean[] } {
    const gates: boolean[] = [];

    return {
      gates,
      unitOfWork: {
        run: async <T>(
          work: (scope: TransactionScope) => Promise<T>,
          hasErrors: () => boolean,
        ): Promise<T> => {
          const result = await work(scope);
          gates.push(hasErrors());
          return result;
        },
      },
    };
  }

  it('NET-NEW — the work receives a graph built from the transaction’s scope, not an ambient one', async () => {
    const { unitOfWork } = makeUnitOfWork();
    const seen: TransactionScope[] = [];

    const runner = new MySqlTransactionalWriteRunner(unitOfWork, (transactionScope) => {
      seen.push(transactionScope);
      return { executor: transactionScope.executor };
    });

    const graph = await runner.runWrite(
      (builtGraph) => Promise.resolve(builtGraph),
      () => false,
    );

    /* The point of the whole class: the graph's executor IS the transaction's. A graph built from the
     * pool would run its statements on another connection, outside the unit being committed, and a
     * roll-back would leave them behind with nothing reporting a problem. */
    expect(seen).toEqual([scope]);
    expect(graph.executor).toBe(scope.executor);
  });

  it('NET-NEW — the commit gate is forwarded UNCHANGED, so the decision lives in one place', async () => {
    const { unitOfWork, gates } = makeUnitOfWork();
    const runner = new MySqlTransactionalWriteRunner(unitOfWork, () => ({}));

    await runner.runWrite(
      () => Promise.resolve('done'),
      () => true,
    );

    // Not re-interpreted, not negated, not defaulted: `UnitOfWork.run` saw exactly what the caller said.
    expect(gates).toEqual([true]);
  });

  it('NET-NEW — M7 — the graph is rebuilt per invocation and never cached across them', async () => {
    const { unitOfWork } = makeUnitOfWork();
    let built = 0;

    const runner = new MySqlTransactionalWriteRunner(unitOfWork, () => {
      built += 1;
      return {};
    });

    await runner.runWrite(
      () => Promise.resolve(1),
      () => false,
    );
    await runner.runWrite(
      () => Promise.resolve(2),
      () => false,
    );

    /* A cached graph would be bound to a RELEASED connection, and on a warm container it would outlive
     * the request that made it — AAP §0.6.6 M7's cross-request bleed. */
    expect(built).toBe(2);
  });
});
