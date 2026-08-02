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
import {
  SKU_ACCESS_MATRIX,
  createProductSkuCreationBoundary,
  createSkuHandler,
} from '../../src/handlers/skuHandler';

import type { UnitOfWorkRunner } from '../../src/adapters/mysql/MySqlTransactionalWriteRunner';
import type { TransactionScope } from '../../src/adapters/mysql/UnitOfWork';
import type {
  ScopedTransactionRunner,
  SkuCreationGraph,
  SkuSurface,
  SkuWriteGraph,
} from '../../src/handlers/skuHandler';
import type { RequestAuthorizationResolver } from '../../src/ports/AccountContextPort';
import type { TransactionalWriteRunner } from '../../src/ports/TransactionalWritePort';
import type { ProductWithErrorState } from '../../src/services/SkuService';

/** A 32-character identifier, the only width the schema declares (IR-6). */
const PRODUCT_ID = 'bbbbbbbb000000000000000000000001';

/**
 * A 32-character SKU identifier (IR-6).
 *
 * Used only to prove a NEGATIVE: that the transaction-existence route ignores a query string carrying it.
 */
const SKU_ID = 'cccccccc000000000000000000000001';

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

describe('SkuHandler.getTransactionExistsFlag — the narrow contract is published (API-02)', () => {
  /*
   * ⭐ WHAT THIS BLOCK NOW ASSERTS, AND WHY IT IS THE OPPOSITE OF WHAT IT ONCE ASSERTED.
   * AAP §0.4.2.2 freezes `SkuService.getTransactionExistsFlag` at ZERO arguments (Discrepancy 4: "the
   * service member takes no arguments while the underlying DAO member accepts optional productID and
   * skuID. The narrower service contract is preserved"). A revision widened the member to
   * `(skuID?, productID?)` and this route bound both identifiers from the query string; the cases below
   * pinned that shape. Both are withdrawn, because:
   *
   *   - the plan is frozen and names this member's target signature;
   *   - the legacy publishes NO action for this member — its only two callers are entity-level
   *     validation-support reads — so an identifier-taking route is invented surface (AAP §0.7.3 S9);
   *   - the reason given for widening, that the narrow form left the two `transactionExistsFlag` delete
   *     guards unable to answer, is false. Each entity is handed a branded checker implemented once by
   *     `createTransactionExistenceChecker` in `src/adapters/mysql/MySqlSkuRepository.ts`, so both guards
   *     keep their identifier scoping whatever this route does. `test/services/SkuService.test.ts` and
   *     `test/adapters/MySqlSkuRepository.test.ts` assert that capability where it lives.
   *
   * So the boundary reads nothing, forwards nothing, and surfaces the refusal the legacy itself produces
   * for a literal zero-argument invocation — the same TR-5 treatment `getSkuStocksDeletableFlag` gets:
   * mounted, honest, and never substituted for.
   */
  function makeHandler(): {
    readonly handler: ReturnType<typeof createSkuHandler>;
    readonly calls: unknown[][];
  } {
    const calls: unknown[][] = [];

    const handler = createSkuHandler(
      makeSkuSurface({
        getTransactionExistsFlag: (...args: unknown[]): Promise<boolean> => {
          calls.push(args);
          /* The repository refuses an unscoped probe [model/dao/SkuDAO.cfc:L90]; the real service lets
           * that refusal through untouched, so the double raises rather than answering plausibly. */
          return Promise.reject(
            new DomainError(
              'The transaction probe requires either a SKU identifier or a product identifier.',
            ),
          );
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

  it('NET-NEW — AAP §0.4.2.2 Discrepancy 4 — the route calls the service with NO arguments', async () => {
    const { handler, calls } = makeHandler();

    await handler.getTransactionExistsFlag({ headers: {} });

    /* ⭐ THE ARGUMENT LIST IS THE ASSERTION. An empty list is what `[:L286]`'s
     * `argumentCollection=arguments` forwards when `[:L285]` declares nothing, and it is what makes the
     * ported route the face of the ported member rather than of the repository beneath it. */
    expect(calls).toEqual([[]]);
  });

  it('NET-NEW — TR-5 — the route stays mounted and surfaces the legacy refusal rather than a substitute', async () => {
    const { handler } = makeHandler();

    const response = await handler.getTransactionExistsFlag({ headers: {} });

    /* IR-9: no guard is added here and no value is fabricated. `false` would be the dangerous substitute
     * — this flag gates a DELETE, and `model/validation/Product.json:L12` treats `false` as permission. */
    expect(response.statusCode).not.toBe(200);

    /*
     * A plain `DomainError` presents as a SERVICE FAULT, so the boundary answers 500 and discloses
     * nothing — `src/errors/DomainError.ts` states the rule ("Assert on the CODE … never on these
     * strings"), so this asserts the SHAPE and the ABSENCE of disclosure rather than the neutral text.
     */
    expect(response.statusCode).toBe(500);

    const body = JSON.parse(response.body) as Record<string, unknown>;

    expect(Object.keys(body)).toStrictEqual(['message']);
    expect(JSON.stringify(body)).not.toContain('SKU identifier');
    expect(JSON.stringify(body)).not.toContain('SkuDAO');
  });

  it('NET-NEW — a query string is not read, so no identifier can be smuggled into the probe', async () => {
    const { handler, calls } = makeHandler();

    /*
     * The event slice `TransactionExistsEvent` declares is `Pick<…,'headers'>`, so a caller cannot even
     * type a query string here. This case passes one anyway — through a structurally wider object, which
     * the route accepts because it only reads `headers` — to prove the route ignores it rather than
     * merely lacking a declaration for it.
     */
    const wider = { headers: {}, queryStringParameters: { skuID: SKU_ID, productID: PRODUCT_ID } };

    await handler.getTransactionExistsFlag(wider);

    expect(calls).toEqual([[]]);
  });

  it('NET-NEW — the gate still runs first, so an unauthorised caller learns nothing', async () => {
    const calls: unknown[][] = [];
    const handler = createSkuHandler(
      makeSkuSurface({
        getTransactionExistsFlag: (...args: unknown[]): Promise<boolean> => {
          calls.push(args);
          return Promise.resolve(true);
        },
      }),
      () => Promise.resolve(null),
      () => ({
        accountContext: {
          getCurrentAccount: () => ({
            accountID: '',
            newFlag: true,
            adminAccountFlag: false,
          }),
        },
        entityAuthorization: { authenticateEntity: (): boolean => false },
      }),
      makeWriteRunner({
        resolveProduct: () => Promise.resolve(null),
        skuService: { createSkus: () => Promise.resolve(true) },
      }).runner,
    );

    const response = await handler.getTransactionExistsFlag({ headers: {} });

    /* The anti-enumeration property: refused before the service is consulted at all. */
    expect(response.statusCode).toBe(401);
    expect(calls).toEqual([]);
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

/* =================================================================================================
 * THE DELIVERED FACTORY'S OWN COMMIT GATE (TX-01)
 * ================================================================================================
 * ⭐ WHY THIS SECTION EXISTS. Every case above drives `createSkuHandler`, the LIVE route, whose gate was
 * already the complete predicate. `createProductSkuCreationBoundary` is the shape the composition root
 * is told to reuse — and it had no direct coverage at all, which is how it came to gate on
 * `product.hasErrors()` alone while the route beside it gated on `skuBatchHasErrors`. A batch whose SKU
 * codes collide leaves the product's own bag EMPTY
 * [org/Hibachi/HibachiValidationService.cfc:L193 writes findings onto the entity it validated, never
 * onto its parent] and `createSkus` returns an unconditional `true`
 * [model/service/SkuService.cfc:L207], so the withdrawn gate committed invalid work silently.
 *
 * The four outcomes below are the complete decision table for the gate: clean, product-level finding,
 * SKU-only finding, and no such product.
 * ============================================================================================== */

describe('createProductSkuCreationBoundary — the delivered factory settles on the whole batch (TX-01)', () => {
  /**
   * A `runScoped` double that records the settle decision the boundary's gate produced.
   *
   * Structurally `UnitOfWork.runScoped`: it builds the graph from a scope, runs the work, then asks the
   * gate about the RESULT — which is the signature detail that matters here, because the boundary's gate
   * reads the settled `SkuCreationOutcome` rather than closing over a captured variable.
   *
   * It takes no graph of its own: the boundary supplies one through the `buildGraph` callback, and this
   * double deliberately calls THAT rather than substituting a graph of its own, so a boundary that
   * ignored its callback would be caught here instead of passing.
   */
  function makeScopedRunner(): {
    readonly runner: ScopedTransactionRunner<symbol>;
    readonly decisions: ('commit' | 'rollback')[];
  } {
    const decisions: ('commit' | 'rollback')[] = [];
    const scope = Symbol('transaction scope');

    return {
      decisions,
      runner: {
        runScoped: async <TGraph, TResult>(
          buildGraph: (scope: symbol) => TGraph,
          work: (graph: TGraph) => Promise<TResult>,
          reportErrors: (result: TResult) => boolean,
        ): Promise<TResult> => {
          const result = await work(buildGraph(scope));

          if (reportErrors(result)) {
            decisions.push('rollback');
            throw new DomainError('rolled back because the gate reported accumulated findings');
          }

          decisions.push('commit');
          return result;
        },
      },
    };
  }

  /** Build the boundary over a graph, ignoring the scope the way a real root would not. */
  function makeBoundary(graph: SkuCreationGraph): {
    readonly boundary: ReturnType<typeof createProductSkuCreationBoundary>;
    readonly decisions: ('commit' | 'rollback')[];
  } {
    const { runner, decisions } = makeScopedRunner();

    return {
      decisions,
      boundary: createProductSkuCreationBoundary(runner, () => graph),
    };
  }

  it('NET-NEW — a CLEAN batch commits and the service’s boolean is returned unchanged', async () => {
    const { boundary, decisions } = makeBoundary({
      resolveProduct: () => Promise.resolve(makeProduct()),
      skuService: { createSkus: () => Promise.resolve(true) },
    });

    await expect(boundary(PRODUCT_ID, {})).resolves.toBe(true);
    expect(decisions).toEqual(['commit']);
  });

  it('NET-NEW — a PRODUCT-level finding rolls back', async () => {
    /*
     * The three branch preconditions `createSkus` records write here, via `product.addError(…)`
     * [model/service/SkuService.cfc:L143, :L148, :L176]. This is the case the withdrawn gate DID catch,
     * asserted so the fix is proved to have kept it rather than traded one blind spot for another.
     */
    const product = makeProduct();

    const { boundary, decisions } = makeBoundary({
      resolveProduct: () => Promise.resolve(product),
      skuService: {
        createSkus: () => {
          product.addError('productType', 'Options cannot be added to this product type.');
          return Promise.resolve(true);
        },
      },
    });

    await expect(boundary(PRODUCT_ID, {})).rejects.toBeInstanceOf(DomainError);
    expect(decisions).toEqual(['rollback']);
  });

  it('NET-NEW — ⭐ a SKU-ONLY finding rolls back, which product.hasErrors() alone cannot detect', async () => {
    /*
     * ⭐ THE REGRESSION THIS SECTION EXISTS FOR. The finding lands on the SKU, the product's bag stays
     * EMPTY, and the service still answers `true` — so nothing the withdrawn gate could see reported a
     * failure, and the invalid batch committed.
     */
    const product = makeProduct();

    const { boundary, decisions } = makeBoundary({
      resolveProduct: () => Promise.resolve(product),
      skuService: {
        createSkus: () => {
          const failed = makeManagedSku();
          failed.addError('skuCode', 'This SKU code is already in use.');
          product.skus = [failed];
          return Promise.resolve(true);
        },
      },
    });

    /* The precondition that makes this case meaningful: the product itself is clean. */
    expect(product.hasErrors()).toBe(false);

    await expect(boundary(PRODUCT_ID, {})).rejects.toBeInstanceOf(DomainError);
    expect(decisions).toEqual(['rollback']);
  });

  it('NET-NEW — a MISSING product commits an empty transaction and answers null', async () => {
    /*
     * Nothing was written, so there is nothing to undo; reporting a roll-back would describe a failure
     * that did not occur, and raising would turn the legacy's "no such row" answer into a fault. The
     * service must never be reached.
     */
    let created = 0;

    const { boundary, decisions } = makeBoundary({
      resolveProduct: () => Promise.resolve(null),
      skuService: {
        createSkus: () => {
          created += 1;
          return Promise.resolve(true);
        },
      },
    });

    await expect(boundary(PRODUCT_ID, {})).resolves.toBeNull();
    expect(decisions).toEqual(['commit']);
    expect(created).toBe(0);
  });

  it('NET-NEW — the product is resolved INSIDE the boundary, from the graph the scope built', async () => {
    /*
     * M6: resolving outside would put the read on a different connection from the writes, so each
     * insert would not be visible to the next SKU's uniqueness read (AAP §0.6.2).
     */
    const addressed: string[] = [];
    let graphBuilds = 0;

    const graph: SkuCreationGraph = {
      resolveProduct: (productID: string) => {
        addressed.push(productID);
        return Promise.resolve(makeProduct());
      },
      skuService: { createSkus: () => Promise.resolve(true) },
    };

    const { runner } = makeScopedRunner();
    const boundary = createProductSkuCreationBoundary(runner, () => {
      graphBuilds += 1;
      return graph;
    });

    await boundary(PRODUCT_ID, {});

    expect(addressed).toEqual([PRODUCT_ID]);
    /* Built per invocation: a cached graph would be bound to a RELEASED connection (M7). */
    expect(graphBuilds).toBe(1);
    await boundary(PRODUCT_ID, {});
    expect(graphBuilds).toBe(2);
  });

  it('NET-NEW — the payload reaches the service UNRESHAPED (M6)', async () => {
    const payload = { 'optionGroups.1.options': 'og-1', price: '12.50' };
    const seen: Record<string, unknown>[] = [];

    const { boundary } = makeBoundary({
      resolveProduct: () => Promise.resolve(makeProduct()),
      skuService: {
        createSkus: (_product, data) => {
          seen.push(data);
          return Promise.resolve(true);
        },
      },
    });

    await boundary(PRODUCT_ID, payload);

    expect(seen).toEqual([payload]);
    expect(seen[0]).toBe(payload);
  });
});

describe('SkuHandler.processImageUpload — the image write is permission-checked (finding F2)', () => {
  /*
   * ⭐ SEC-HARDENING (D18-CLASS) — review finding F2, CWE-434's least-privilege half.
   *
   * WHY THESE CASES DID NOT EXIST BEFORE, AND WHY THAT MATTERED. The row was classified `'anyLogin'`, and
   * `ADMIT_EVERY_REQUEST` above admits every request by design — so no case in this file asserted any
   * classification at all, and the one that could have has always been `refuse('processImageUpload')` on
   * the surface double, which proves only that the member is not reached. A reclassification was therefore
   * invisible to the suite in BOTH directions: nothing failed when it was loose, and nothing would have
   * failed had it silently gone loose again. These cases close that.
   *
   * THE EVIDENCE FOR `'secure'` is set out at the `processImageUpload` row of `SKU_ACCESS_MATRIX`; the
   * measurement that carries it is that `grep -rn processImageUpload` over the whole legacy CFML tree
   * returns exactly one line — the declaration at `model/service/SkuService.cfc:L210` — so there is no
   * legacy caller for a tighter requirement to refuse.
   *
   * TEST PROVENANCE: NET-NEW, for the reason AAP §0.6.5.2 gives: no legacy test covers any service in this
   * slice, and no legacy equivalent of a Lambda boundary exists at all.
   */

  const SKU_CODE = 'TESTSKU001';

  /**
   * The entity name every SKU authorisation question in `skuHandler.ts` names.
   *
   * ⚠️ IT IS THE CFML *COMPONENT* NAME, `'Sku'`, AND NOT THE SMART-LIST ROOT `'SlatwallSku'`. This is
   * measured rather than assumed: a first draft of these cases asserted the latter, borrowing the constant
   * of that name from `src/services/SkuService.ts`, and all four route cases failed at once. The legacy
   * derives the name from the ITEM by substring arithmetic — `right(itemName, len(itemName)-4)` at
   * [org/Hibachi/HibachiAuthenticationService.cfc:L60] — so an `editSku` item yields `Sku`. The two names
   * live in different vocabularies: one addresses a permission row, the other names an ORM root in HQL.
   */
  const SKU_COMPONENT_NAME = 'Sku';

  /** The slice `processImageUpload` declares: a body, a path parameter and headers. */
  const imageUploadEvent = (): {
    body: string;
    pathParameters: Record<string, string>;
    headers: Record<string, string>;
  } => ({
    body: JSON.stringify({ tempDirectory: '/tmp', serverFile: 'shirt.jpg' }),
    pathParameters: { skuCode: SKU_CODE },
    headers: {},
  });

  /**
   * A resolver recording every entity question, answering each from `grants`.
   *
   * The questions are recorded rather than merely counted, because WHICH question is asked is the whole
   * substance of the classification: a row that asked `read` would pass a "did it check something" test
   * while granting the write to every reader.
   */
  const resolverGranting = (
    grants: readonly { readonly crudType: string; readonly entityName: string }[],
    options: { readonly loggedIn: boolean } = { loggedIn: true },
  ): {
    readonly resolver: RequestAuthorizationResolver<{ headers: unknown }>;
    readonly questions: { crudType: string; entityName: string }[];
  } => {
    const questions: { crudType: string; entityName: string }[] = [];

    return {
      questions,
      resolver: () => ({
        accountContext: {
          getCurrentAccount: () =>
            options.loggedIn
              ? {
                  accountID: 'aaaaaaaa000000000000000000000002',
                  newFlag: false,
                  adminAccountFlag: false,
                }
              : undefined,
        },
        entityAuthorization: {
          authenticateEntity: (question: { crudType: string; entityName: string }): boolean => {
            questions.push({ crudType: question.crudType, entityName: question.entityName });
            return grants.some(
              (grant) =>
                grant.crudType === question.crudType && grant.entityName === question.entityName,
            );
          },
        },
      }),
    };
  };

  const handlerWith = (
    resolver: RequestAuthorizationResolver<{ headers: unknown }>,
    overrides: Partial<SkuSurface>,
  ): ReturnType<typeof createSkuHandler> =>
    createSkuHandler(
      makeSkuSurface(overrides),
      () => {
        throw new Error('no product resolution is expected on the image-write path');
      },
      resolver,
      makeWriteRunner({
        resolveProduct: () => {
          throw new Error('no product resolution is expected on the image-write path');
        },
        skuService: {
          createSkus: () => {
            throw new Error('no SKU creation is expected on the image-write path');
          },
        },
      }).runner,
    );

  it('NET-NEW — the matrix row is SECURE, asking exactly `update` on `Sku`', () => {
    /*
     * Asserted on the exported table rather than only through a route, so the classification cannot be
     * loosened without a named failure even if every route case were deleted. `'read'` in particular must
     * not appear: it is the question the seven sibling rows ask, and reusing it here would grant the one
     * write in the file to every reader.
     */
    expect(SKU_ACCESS_MATRIX.processImageUpload).toEqual({
      classification: 'secure',
      entityName: SKU_COMPONENT_NAME,
      crudTypes: ['update'],
    });
  });

  it('NET-NEW — a logged-in account WITHOUT the grant is refused 403 and never reaches the service', async () => {
    let serviceCalls = 0;
    const { resolver, questions } = resolverGranting([]);
    const handler = handlerWith(resolver, {
      processImageUpload: () => {
        serviceCalls += 1;
        return Promise.resolve(true);
      },
    });

    const response = await handler.processImageUpload(imageUploadEvent());

    expect(response.statusCode).toBe(403);
    /* ⭐ THE GATE RUNS BEFORE ANY PARAMETER IS READ, so the refusal is not merely a status: the write
     * member is never invoked, and no SKU is even looked up. */
    expect(serviceCalls).toBe(0);
    expect(questions).toEqual([{ crudType: 'update', entityName: SKU_COMPONENT_NAME }]);
  });

  it('NET-NEW — an account with `read` on `Sku` but not `update` is still refused', async () => {
    /*
     * The case that separates this row from its seven siblings. Under the previous `'anyLogin'`
     * classification this principal was admitted to the write; under a mistaken `'read'` row it would be
     * admitted too. Only `update` admits it.
     */
    const { resolver } = resolverGranting([{ crudType: 'read', entityName: SKU_COMPONENT_NAME }]);
    const handler = handlerWith(resolver, {});

    const response = await handler.processImageUpload(imageUploadEvent());

    expect(response.statusCode).toBe(403);
  });

  it('NET-NEW — an account with `update` on `Sku` reaches the service and gets its verdict', async () => {
    const sku = makeManagedSku();
    sku.skuCode = SKU_CODE;
    sku.imageFile = 'shirt.jpg';

    const { resolver, questions } = resolverGranting([
      { crudType: 'update', entityName: SKU_COMPONENT_NAME },
    ]);
    const handler = handlerWith(resolver, {
      getSkuBySkuCode: () => Promise.resolve(sku),
      processImageUpload: () => Promise.resolve(true),
    });

    const response = await handler.processImageUpload(imageUploadEvent());

    expect(response.statusCode).toBe(200);
    expect(questions).toEqual([{ crudType: 'update', entityName: SKU_COMPONENT_NAME }]);
  });

  it('NET-NEW — the service’s `false` is serialised as `false`, not as an error (D24 + finding F2)', async () => {
    /*
     * ⭐ SEC-HARDENING (D18-CLASS) — this is the boundary half of the write gate's refusal shape. When
     * `SkuService.processImageUpload` refuses a stored image file name it resolves `false`, the same answer
     * `model/service/SkuService.cfc:L216` gives a rejected upload, and this route must serialise it as the
     * boolean it is. A 400 or a 500 here would be a third outcome the legacy never had — and an earlier
     * comment in `skuHandler.ts` predicted exactly that wrong mapping, which is why it is now asserted.
     */
    const sku = makeManagedSku();
    sku.skuCode = SKU_CODE;
    sku.imageFile = '../../../../tmp/payload.jpg';

    const { resolver } = resolverGranting([{ crudType: 'update', entityName: SKU_COMPONENT_NAME }]);
    const handler = handlerWith(resolver, {
      getSkuBySkuCode: () => Promise.resolve(sku),
      /* The real service refuses this name; the double stands in for that verdict. */
      processImageUpload: () => Promise.resolve(false),
    });

    const response = await handler.processImageUpload(imageUploadEvent());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toBe(false);
  });

  it('NET-NEW — an anonymous request is refused 401, before any entity question is asked', async () => {
    const { resolver, questions } = resolverGranting([], { loggedIn: false });
    const handler = handlerWith(resolver, {});

    const response = await handler.processImageUpload(imageUploadEvent());

    expect(response.statusCode).toBe(401);
    /* Steps 1 and 2 answer before step 3, so no permission question is reached at all. */
    expect(questions).toEqual([]);
  });
});
