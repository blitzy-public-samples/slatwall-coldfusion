/**
 * The Lambda entry surface — the six `handler` exports, the five per-surface route tables, and the shared
 * action dispatcher they all run through.
 *
 * AAP authority: the AAP §0.4.4 wildcard row authorises `slatwall-ts/test/**` | CREATE. The suite sits
 * beside the five per-boundary suites in this folder and covers what none of them can: the seam BETWEEN a
 * `slatAction` string and the member that answers it.
 *
 * =============================================================================================
 * WHY THIS FILE EXISTS
 * =============================================================================================
 * The addressable surface used to be written out twice — once as a literal table inside
 * `src/handlers/router.ts` and once, implicitly, as the set of members each handler exposed — and nothing
 * compared the two. It is now declared once per surface, in the module that serves it, and
 * `src/handlers/router.ts` composes those declarations. That removes the drift, and this suite pins what
 * the composition must add up to, so a route added to one surface and forgotten in the aggregate, or a
 * key silently renamed, is a failing test rather than a 404 discovered in production.
 *
 * It also pins the property a QA pass found missing: EVERY ARTIFACT THE BUILD EMITS MUST EXPORT AN
 * INVOCABLE `handler`. Five of the six bundles previously exported factories only, so the packaged
 * artifacts could not be addressed by the runtime at all.
 *
 * =============================================================================================
 * WHAT IS UNDER TEST, AND WHAT IS DELIBERATELY NOT
 * =============================================================================================
 *   - THE KEY SETS. Each per-surface table declares exactly the actions its service exposes, every key
 *     carries its own surface prefix, the five sets are disjoint, and their union is the 34-address space
 *     AAP §0.4.2 preserves: 18 product, 9 SKU, 3 brand, 3 option, 1 feed.
 *   - THE DELEGATION. Each key resolves to the matching member of the façade it was built from, so a
 *     transposed pair — `getProduct` mounted at `product.getProductType` — fails here.
 *   - THE DISPATCHER. `beginInvocation` runs first and unconditionally, an absent or unrecognised action
 *     answers a neutral 404, an inherited property name is not a route, and a thrown failure is converted
 *     rather than escaping.
 *   - THE ENTRY EXPORTS of the five per-service modules, which must be present and must be reachable
 *     WITHOUT any environment — the property that keeps them loadable in a test process and in a cold
 *     artifact inspection.
 *
 * ⛔ `src/handlers/router.ts` IS NOT IMPORTED HERE, AND THAT IS ITS CONTRACT RATHER THAN A GAP. That
 * module resolves the composition root at module load, deliberately, so a misconfigured deployment fails
 * its cold start loudly; importing it from a test process with no database configuration would therefore
 * throw during collection. Its `handler` export is verified against the BUILT ARTIFACT instead, by
 * invoking `dist/handlers/router.js`, which is the same evidence a QA pass gathers. The aggregate table it
 * builds is covered here through the union assertion below, which is exactly the set it spreads.
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP §0.6.5.2 records that the legacy suite contains no
 * controller test and no routing test of any kind — `meta/tests/functional/admin/entity/ProductTest.cfc`
 * is an empty component with zero test methods — so nothing here extends a legacy assertion and none is
 * labelled as though it did.
 */
import {
  createBrandRoutes,
  handler as brandLambdaHandler,
  type BrandHandler,
  type BrandRouteKey,
} from '../../src/handlers/brandHandler';
import {
  createGoogleFeedRoutes,
  handler as googleFeedLambdaHandler,
  type GoogleFeedHandler,
  type GoogleFeedRouteKey,
} from '../../src/handlers/googleFeedHandler';
import {
  createActionDispatcher,
  HTTP_STATUS,
  SLAT_ACTION_PARAMETER,
  type ActionRoute,
  type ActionRouteTable,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../../src/handlers/httpResponse';
import {
  createOptionRoutes,
  handler as optionLambdaHandler,
  type OptionHandler,
  type OptionRouteKey,
} from '../../src/handlers/optionHandler';
import {
  createProductRoutes,
  handler as productLambdaHandler,
  type ProductHandler,
  type ProductRouteKey,
} from '../../src/handlers/productHandler';
import type { RouteKey } from '../../src/handlers/router';
import {
  createSkuRoutes,
  handler as skuLambdaHandler,
  type SkuHandler,
  type SkuRouteKey,
} from '../../src/handlers/skuHandler';

/* -----------------------------------------------------------------------------------------------------
 * Harness.
 * -------------------------------------------------------------------------------------------------- */

/**
 * The union `src/handlers/router.ts` must add up to, assembled here from the five surfaces themselves.
 *
 * ⚠️ THE ROUTER IS REACHED TYPE-ONLY, WHICH IS WHY THIS IS POSSIBLE AT ALL. `import type` is erased by the
 * transform, so naming `RouteKey` costs no module load — the router's own module-scope resolution of the
 * composition root never runs, and this suite keeps needing no environment.
 */
type SurfaceRouteKey =
  ProductRouteKey | SkuRouteKey | BrandRouteKey | OptionRouteKey | GoogleFeedRouteKey;

/** True only when the two unions are mutually assignable — that is, exactly equal. */
type Exact<TLeft, TRight> = [TLeft] extends [TRight]
  ? [TRight] extends [TLeft]
    ? true
    : false
  : false;

/** The invocation shape the dispatcher reads: nothing but the action, which is all it consults. */
function eventFor(action: string | undefined): APIGatewayProxyEvent {
  return {
    queryStringParameters: action === undefined ? null : { [SLAT_ACTION_PARAMETER]: action },
  } as unknown as APIGatewayProxyEvent;
}

/**
 * Builds a façade double whose every member records its own name and answers a recognisable result.
 *
 * The double is assembled from the member names rather than hand-written, so a member added to a façade
 * cannot be silently absent from the double — the key-set assertions compare the table against the same
 * list and would report the discrepancy.
 *
 * @param memberNames every member the façade exposes
 * @param calls the array each invocation appends its member name to
 * @returns the double, typed as the façade under test
 */
function recordingFacade<TFacade>(memberNames: readonly string[], calls: string[]): TFacade {
  const members = memberNames.map((memberName) => [
    memberName,
    (): Promise<APIGatewayProxyResult> => {
      calls.push(memberName);
      return Promise.resolve({
        statusCode: HTTP_STATUS.OK,
        headers: {},
        body: memberName,
      } as APIGatewayProxyResult);
    },
  ]);

  return Object.fromEntries(members) as TFacade;
}

/** Reads a table's keys as plain strings, sorted, so a comparison is order-independent. */
function keysOf(table: Readonly<Record<string, ActionRoute>>): readonly string[] {
  return Object.keys(table).sort();
}

const PRODUCT_MEMBERS: readonly string[] = [
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

const SKU_MEMBERS: readonly string[] = [
  'createSkus',
  'processImageUpload',
  'getProductSkus',
  'getSortedProductSkus',
  'searchSkusByProductType',
  'getSkuStocksDeletableFlag',
  'getTransactionExistsFlag',
  'getSkuBySkuCode',
  'getSkuSmartList',
];

const BRAND_MEMBERS: readonly string[] = ['saveBrand', 'getBrand', 'deleteBrand'];

const OPTION_MEMBERS: readonly string[] = [
  'getOptionsForSelect',
  'getUnusedProductOptions',
  'getUnusedProductOptionGroups',
];

const FEED_MEMBERS: readonly string[] = ['product'];

/* =====================================================================================================
 * §1 — The key sets, per surface and in aggregate.
 * ================================================================================================== */

describe('NET-NEW entry surface — each surface declares exactly the actions its service exposes', () => {
  it.each([
    ['product', 'product.', PRODUCT_MEMBERS, 18],
    ['sku', 'sku.', SKU_MEMBERS, 9],
    ['brand', 'brand.', BRAND_MEMBERS, 3],
    ['option', 'option.', OPTION_MEMBERS, 3],
  ])(
    '[NET-NEW] %s mounts every member once, under its own prefix',
    (surface, prefix, memberNames, expectedCount) => {
      const calls: string[] = [];
      const table = {
        product: () =>
          createProductRoutes(recordingFacade<ProductHandler>(PRODUCT_MEMBERS, calls)) as Readonly<
            Record<string, ActionRoute>
          >,
        sku: () =>
          createSkuRoutes(recordingFacade<SkuHandler>(SKU_MEMBERS, calls)) as Readonly<
            Record<string, ActionRoute>
          >,
        brand: () =>
          createBrandRoutes(recordingFacade<BrandHandler>(BRAND_MEMBERS, calls)) as Readonly<
            Record<string, ActionRoute>
          >,
        option: () =>
          createOptionRoutes(recordingFacade<OptionHandler>(OPTION_MEMBERS, calls)) as Readonly<
            Record<string, ActionRoute>
          >,
      }[surface as 'product' | 'sku' | 'brand' | 'option']();

      /* The expected keys are the member names under the surface prefix, which is the addressing scheme
       * `org/Hibachi/FW1/framework.cfc:L1965-L1969` gave the legacy: section, then item. */
      expect(keysOf(table)).toEqual([...memberNames].map((member) => `${prefix}${member}`).sort());
      expect(Object.keys(table)).toHaveLength(expectedCount);
      expect(Object.isFrozen(table)).toBe(true);
    },
  );

  it('[NET-NEW] the feed keeps the one legacy-attested action, colon and all', () => {
    const calls: string[] = [];
    const table = createGoogleFeedRoutes(recordingFacade<GoogleFeedHandler>(FEED_MEMBERS, calls));

    /* `integrationServices/google/views/main/default.cfm:L50` links `?slatAction=google:feed.product`.
     * The colon is FW/1's subsystem separator, so this key does NOT follow the `<surface>.<member>` shape
     * the four catalog surfaces use — the existing caller's address wins over internal consistency. */
    expect(keysOf(table)).toEqual(['google:feed.product']);
    expect(Object.isFrozen(table)).toBe(true);
  });

  it('[NET-NEW] the router aggregate is exactly the union of the five surfaces, by type', () => {
    /* A COMPILE-TIME assertion with a runtime witness. If a surface gains a key the router's `RouteKey`
     * does not include — or the router declares one no surface serves — the two unions stop being mutually
     * assignable and `true` is no longer assignable to the annotated type, so `npm run typecheck` fails at
     * this line. The `expect` exists so the case reports as a case; the guarantee is the annotation. */
    const aggregateMatchesSurfaces: Exact<RouteKey, SurfaceRouteKey> = true;

    expect(aggregateMatchesSurfaces).toBe(true);
  });

  it('[NET-NEW] the five sets are disjoint and their union is the 34-address space', () => {
    const calls: string[] = [];
    const everyKey = [
      ...keysOf(createProductRoutes(recordingFacade<ProductHandler>(PRODUCT_MEMBERS, calls))),
      ...keysOf(createSkuRoutes(recordingFacade<SkuHandler>(SKU_MEMBERS, calls))),
      ...keysOf(createBrandRoutes(recordingFacade<BrandHandler>(BRAND_MEMBERS, calls))),
      ...keysOf(createOptionRoutes(recordingFacade<OptionHandler>(OPTION_MEMBERS, calls))),
      ...keysOf(createGoogleFeedRoutes(recordingFacade<GoogleFeedHandler>(FEED_MEMBERS, calls))),
    ];

    /* 28 preserved public service members (AAP §0.4.2: 15 product, 9 SKU, 1 brand, 3 option), plus the
     * five IR-1 members the slice genuinely uses and `onMissingMethod` fabricated at run time, plus the
     * one feed action. `src/handlers/router.ts` spreads exactly these five tables, so this count is the
     * aggregate surface. */
    expect(everyKey).toHaveLength(34);
    expect(new Set(everyKey).size).toBe(34);
  });
});

/* =====================================================================================================
 * §2 — The delegation: every key resolves to the member of the same name.
 * ================================================================================================== */

describe('NET-NEW entry surface — every action reaches the member that shares its name', () => {
  it('[NET-NEW] a transposed mounting would fail here, so each key is invoked and traced', async () => {
    const calls: string[] = [];
    const tables: readonly Readonly<Record<string, ActionRoute>>[] = [
      createProductRoutes(recordingFacade<ProductHandler>(PRODUCT_MEMBERS, calls)),
      createSkuRoutes(recordingFacade<SkuHandler>(SKU_MEMBERS, calls)),
      createBrandRoutes(recordingFacade<BrandHandler>(BRAND_MEMBERS, calls)),
      createOptionRoutes(recordingFacade<OptionHandler>(OPTION_MEMBERS, calls)),
    ];

    for (const table of tables) {
      for (const [key, route] of Object.entries(table)) {
        calls.length = 0;
        const response = await route(eventFor(key));

        /* The member name is everything after the surface prefix, and the double answers with its own
         * name — so the body IS the assertion that the right member ran. */
        const expectedMember = key.slice(key.indexOf('.') + 1);
        expect(calls).toEqual([expectedMember]);
        expect(response.body).toBe(expectedMember);
      }
    }
  });

  it('[NET-NEW] the feed route calls `product` and forwards no event to it', async () => {
    const calls: string[] = [];
    const table = createGoogleFeedRoutes(recordingFacade<GoogleFeedHandler>(FEED_MEMBERS, calls));
    const route = table['google:feed.product'];

    expect(route).toBeDefined();
    await route?.(eventFor('google:feed.product'));

    /* `product` takes invocation OPTIONS rather than a request, and the legacy controller read nothing
     * from its own request context either. */
    expect(calls).toEqual(['product']);
  });
});

/* =====================================================================================================
 * §3 — The shared dispatcher.
 * ================================================================================================== */

describe('NET-NEW entry surface — the dispatcher every entry point runs through', () => {
  const dispatcherFor = (
    routes: ActionRouteTable<string>,
    beginInvocation: () => void,
  ): ActionRoute => createActionDispatcher<string>({ routes, beginInvocation });

  it('[NET-NEW] begins the invocation before the action is read, even for an action it does not serve', async () => {
    const order: string[] = [];
    const dispatch = dispatcherFor(
      Object.freeze({
        'brand.getBrand': (): Promise<APIGatewayProxyResult> => {
          order.push('route');
          return Promise.resolve({
            statusCode: HTTP_STATUS.OK,
            headers: {},
            body: '',
          } as APIGatewayProxyResult);
        },
      }),
      () => {
        order.push('beginInvocation');
      },
    );

    await dispatch(eventFor('brand.getBrand'));
    expect(order).toEqual(['beginInvocation', 'route']);

    /* And on a miss too: a warm container must not carry a previous invocation's request-scoped value
     * into this one just because this one addressed nothing (mismatch M7). */
    order.length = 0;
    await dispatch(eventFor('brand.nothing'));
    expect(order).toEqual(['beginInvocation']);
  });

  it.each([
    ['an unrecognised action', 'brand.doesNotExist'],
    ['an absent action', undefined],
    ['an inherited property name', '__proto__'],
    ['another inherited property name', 'constructor'],
    ['a third inherited property name', 'toString'],
  ])('[NET-NEW] answers a neutral 404 for %s', async (_situation, action) => {
    const dispatch = dispatcherFor(
      Object.freeze({
        'brand.getBrand': (): Promise<APIGatewayProxyResult> =>
          Promise.resolve({
            statusCode: HTTP_STATUS.OK,
            headers: {},
            body: '',
          } as APIGatewayProxyResult),
      }),
      () => undefined,
    );

    const response = await dispatch(eventFor(action));

    expect(response.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
    /* Neutral: the body names no action, no member and no surface, so a caller cannot enumerate what the
     * service does serve by reading refusals. */
    expect(response.body).not.toContain('brand');
    expect(response.body).not.toContain('doesNotExist');
  });

  it('[NET-NEW] converts a route failure instead of letting it escape', async () => {
    const dispatch = dispatcherFor(
      Object.freeze({
        'brand.getBrand': (): Promise<APIGatewayProxyResult> => {
          throw new Error('a failure with detail that must not reach the caller');
        },
      }),
      () => undefined,
    );

    const response = await dispatch(eventFor('brand.getBrand'));

    /* Whatever status the classification chooses, the contract asserted here is that a response is
     * produced at all — no unhandled rejection — and that the thrown text is not published. */
    expect(response.statusCode).toBeGreaterThanOrEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    expect(response.body).not.toContain('must not reach the caller');
  });

  it('[NET-NEW] converts a failure from the invocation hook itself', async () => {
    const dispatch = dispatcherFor(Object.freeze({}), () => {
      throw new Error('resetting request state failed');
    });

    const response = await dispatch(eventFor('brand.getBrand'));

    expect(response.statusCode).toBeGreaterThanOrEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    expect(response.body).not.toContain('resetting request state failed');
  });
});

/* =====================================================================================================
 * §4 — The entry exports themselves.
 * ================================================================================================== */

describe('NET-NEW entry surface — every per-service module exports an invocable handler', () => {
  it.each([
    ['productHandler', productLambdaHandler],
    ['skuHandler', skuLambdaHandler],
    ['brandHandler', brandLambdaHandler],
    ['optionHandler', optionLambdaHandler],
    ['googleFeedHandler', googleFeedLambdaHandler],
  ])('[NET-NEW] %s exports a one-argument handler', (_moduleName, entryPoint) => {
    /* The property a QA pass found missing: the bundle `build/esbuild.mjs` writes from each of these
     * modules has to carry a symbol the runtime can address. Presence and arity are asserted here;
     * behaviour is asserted against the built artifact, because invoking it resolves the composition root
     * and therefore needs a configured environment. */
    expect(typeof entryPoint).toBe('function');
    expect(entryPoint).toHaveLength(1);
  });

  it('[NET-NEW] importing these modules constructs no container and reads no environment', () => {
    /* This suite has no `DB_*` variable set and no database available, and it imported all five modules at
     * the top of the file. Reaching this assertion at all is the proof: a static import of
     * `../config/container` would have run the eager environment validation and the module-scope pool
     * construction during collection, and every case in this file would have failed on the same error.
     * The five entry points reach the composition root through a DYNAMIC import for exactly that reason. */
    expect(process.env['DB_HOST']).toBeUndefined();
    expect(typeof productLambdaHandler).toBe('function');
  });
});
