/*
 * Router — the thin routing layer (AAP §0.4.1.9, §0.1.2.1 "Routing")
 *
 * The FW/1 `slatAction` convention, re-expressed as an explicit, statically-typed route-to-handler
 * mapping in front of five per-service Lambda handlers. This is the file AAP §0.1.2.1 describes as
 * "Lambda handlers behind a thin router; all AWS coupling confined to the handler layer", and it is the
 * aggregate Lambda entry point: the one module that mounts the whole address space.
 *
 * It is not the only module that exports a `handler`, and this header used to say it was. All six
 * modules named in `build/esbuild.mjs`'s entry list export one — this file plus `./productHandler`,
 * `./skuHandler`, `./brandHandler`, `./optionHandler` and `./googleFeedHandler` — because each is
 * independently deployable, serving only its own addresses. A review measured the old claim as false and
 * recorded it as finding **F8**. The distinction that is true, and the one the rest of this header turns
 * on, is aggregate versus per-surface: this file answers all 34 addresses while each sibling answers its
 * own subset and 404s the rest.
 *
 * There is exactly one behavioural difference between them, and it is WHEN configuration is validated.
 * This file takes a static value import of `getCatalogContainer` and resolves the graph at module load,
 * so requiring it with a missing or malformed variable throws immediately, names the variable, and fails
 * the cold start rather than answering requests it cannot serve. The five per-surface modules take only
 * `import type` and defer their narrow graph to a CommonJS `require` inside the first invocation, so each
 * can be required with an empty environment and a misconfiguration surfaces per invocation as a
 * classified 500. The asymmetry is deliberate; README §6 owns the full record of it.
 */

import { getCatalogContainer, type CatalogContainer } from '../config/container';

import {
  createBrandHandlerFromContainer,
  createBrandRoutes,
  type BrandHandler,
  type BrandRouteKey,
} from './brandHandler';
import {
  createGoogleFeedHandlerFromContainer,
  createGoogleFeedRoutes,
  type GoogleFeedHandler,
  type GoogleFeedRouteKey,
} from './googleFeedHandler';
import {
  createOptionHandlerFromContainer,
  createOptionRoutes,
  type OptionHandler,
  type OptionRouteKey,
} from './optionHandler';
import {
  createProductHandlerFromContainer,
  createProductRoutes,
  type ProductHandler,
  type ProductRouteKey,
} from './productHandler';
import {
  createSkuHandlerFromContainer,
  createSkuRoutes,
  type SkuHandler,
  type SkuRouteKey,
} from './skuHandler';

import {
  createActionDispatcher,
  type APIGatewayProxyEvent,
  type APIGatewayProxyHandler,
  type APIGatewayProxyResult,
  type CatalogAuthorizationResolver,
} from './httpResponse';

/*
 * The edge values this file no longer declares — where they went, and why.
 *
 * Four values used to be declared here, and declaring them here made this file the accidental owner of
 * things its siblings also needed:
 *
 *   `SLAT_ACTION_PARAMETER` and `resolveFailClosedAuthorization` now live in `./httpResponse.ts`, §7 and
 *   §8, beside `createActionDispatcher` — the shared edge module every handler in this folder already
 *   imports. All six entry points need both, so both belong there rather than here, and their reasoning
 *   travelled with them: the `config/configFramework.cfm:L2` locator for the parameter name, and the
 *   deny-all remainder argument for the principal. §8.1 of that module additionally owns the deployment
 *   seam — the registration cell and the per-invocation reader that this file's `resolveAuthorization`
 *   parameter falls back to — because all six need it and none may hold a second copy of the fallback rule.
 *
 *   `FEED_RENDER_CLOCK` and the empty product-image reader now live in `./googleFeedHandler.ts`, in its
 *   own entry-point section, because that module owns the feed and is what knows which collaborators the
 *   feed needs. This file asks it for a wired handler instead of assembling one.
 *
 * What this file still owns is the aggregate surface: each handler module declares the actions it serves,
 * and this is where all five declarations are composed into one address space that {@link RouteKey} proves
 * complete.
 */

/* The route key — a closed literal union, which is the interface-parity artifact. */

/** Every address this service answers, as a closed union. */
export type RouteKey =
  ProductRouteKey | SkuRouteKey | BrandRouteKey | OptionRouteKey | GoogleFeedRouteKey;

/** What a route does: take the invocation event, answer a proxy result. */
type RouteEntry = (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;

/* Mounting the five handlers — constructor injection, one place, no lookup (AAP §0.7.3, R1, R2) */

/** The five handler façades this router mounts, each built from the injected graph. */
interface CatalogHandlers {
  readonly product: ProductHandler;
  readonly sku: SkuHandler;
  readonly brand: BrandHandler;
  readonly option: OptionHandler;
  readonly googleFeed: GoogleFeedHandler;
}

/**
 * Builds the five handler façades from a wired graph.
 *
 * @param container the wired service graph every façade is built from
 * @param resolveAuthorization the per-invocation authorisation resolver the four gated surfaces call;
 * omitted means each of those four defaults to `./httpResponse.ts` §8.1's `resolveRequestAuthorization`,
 * which answers the resolver a deployment registered and the deny-all context when none is registered.
 * The feed receives no resolver on either path
 * @returns the five mounted façades.
 */
function createCatalogHandlers(
  container: CatalogContainer,
  resolveAuthorization?: CatalogAuthorizationResolver,
): CatalogHandlers {
  return {
    /*
     * Each façade is built by the module that owns it, from the same graph this function received.
     * The wiring used to be written out here — which service, which resolver, which runner, per surface —
     * and each per-service module then had to repeat it for its own entry point. Asking each module for a
     * wired handler instead leaves exactly one place per surface that knows what that surface needs, and
     * this function is left doing what a router should: naming the five surfaces it mounts.
     */
    product: createProductHandlerFromContainer(container, resolveAuthorization),
    sku: createSkuHandlerFromContainer(container, resolveAuthorization),
    brand: createBrandHandlerFromContainer(container, resolveAuthorization),
    option: createOptionHandlerFromContainer(container, resolveAuthorization),

    /*
     * No authorisation resolver reaches the feed, and its absence is the port of `feed.cfc:L54-L56`.
     * The legacy feed controller declared `this.publicMethods="product";` with `this.anyAdminMethods=""`
     * and `this.secureMethods=""` both empty, so the feed demanded neither a login nor a permission. Its
     * collaborator set carries no resolver slot for exactly that reason, and adding a gate would be
     * introducing authorisation the legacy did not have, which the migration may not do. This is the one route reachable end to end.
     */
    googleFeed: createGoogleFeedHandlerFromContainer(container),
  };
}

/* The route table — a static declaration, not a registry (TR-3, AAP §0.7.3) */

/**
 * The whole reachable surface, one entry per address.
 *
 * @param handlers the five mounted façades
 * @returns the frozen route table.
 */
function createRouteTable(handlers: CatalogHandlers): Readonly<Record<RouteKey, RouteEntry>> {
  const routes: Record<RouteKey, RouteEntry> = {
    /*
     * Five per-surface tables, merged. Each is declared in the handler module that serves it, in the
     * source order of the legacy service it ports, and each carries the disclosures that belong to its
     * own members — M1 behind `product.loadDataFromFile`, M2 behind the feed, the D4 boundary behind
     * `sku.getSkuStocksDeletableFlag`, and the synchronous adaptation of
     * `option.getOptionsForSelect`. Restating those keys here would mean restating those disclosures
     * too, in a file that does not implement any of them.
     */
    ...createProductRoutes(handlers.product),
    ...createSkuRoutes(handlers.sku),
    ...createBrandRoutes(handlers.brand),
    ...createOptionRoutes(handlers.option),
    ...createGoogleFeedRoutes(handlers.googleFeed),
  };

  return Object.freeze(routes);
}

/* The dispatcher — a pure function of the injected graph (AAP §0.7.3) */

/**
 * Builds the dispatcher for a wired graph.
 *
 * @param container the wired service graph the five façades are mounted over; its
 * `beginInvocation` hook runs first on every request
 * @param resolveAuthorization the per-invocation authorisation resolver, forwarded to
 * {@link createCatalogHandlers} and defaulted there
 * @returns a dispatcher taking one invocation event and answering one proxy result.
 */
export function createRouter(
  container: CatalogContainer,
  resolveAuthorization?: CatalogAuthorizationResolver,
): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> {
  /*
   * The dispatch mechanics are shared, and sharing them is the point. `./httpResponse.ts` §7 owns the
   * four steps every entry point in this folder performs — begin the invocation, read
   * `SLAT_ACTION_PARAMETER` from the query string, answer a neutral 404 for an action this surface does
   * not serve, and convert every failure through `errorResponse`.
   */
  return createActionDispatcher<RouteKey>({
    routes: createRouteTable(createCatalogHandlers(container, resolveAuthorization)),
    beginInvocation: () => {
      container.beginInvocation();
    },
  });
}

/* The Lambda entry point. */

/** The dispatcher for the production graph, resolved once at module load. */
const routeCatalogRequest = createRouter(getCatalogContainer());

/**
 * The AWS Lambda entry point for the whole Catalog slice.
 */
export const handler = (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> =>
  routeCatalogRequest(event);

/* Compile-time guard — one pairing a comment could only assert. */
type AssertAssignable<TActual extends TExpected, TExpected> = TActual;

/*
 * The exported entry point must satisfy the runtime's own declared handler contract. Without this, a
 * signature drift — a renamed parameter type, a widened return, an accidentally synchronous body —
 * would keep compiling here and fail only when the platform invoked it, which is the latest and most
 * expensive place to learn about it. The type is taken from `./httpResponse`'s re-export rather than from
 * the AWS typings directly, so the coupling keeps its single declaration site in the subtree.
 */
type _HandlerSatisfiesLambdaContract = AssertAssignable<typeof handler, APIGatewayProxyHandler>;

/* The deployment registration seam, re-exported so it is reachable from the packaged artifact. */

/*
 * This is the aggregate artifact, so it is the one a single-function deployment holds. `handler` above
 * serves all thirty-four addresses, four of whose surfaces are gated; a deployment that mounts only this
 * module needs the registration seam here or it has no way to reach it at all.
 */
/*
 * Why a re-export is necessary and not merely tidy. `registerRequestAuthorizationResolver` is declared
 * in `./httpResponse.ts` §8.1, which is not a build entry point — `build/esbuild.mjs` lists it under
 * `NON_ENTRY_HANDLER_MODULES` precisely because it is a shared helper. esbuild therefore inlines it into
 * every entry it bundles, and an inlined module's exports do not survive: a deployment that requires the
 * emitted artifact sees only what the entry module exports. Measured before this block existed,
 * `Object.keys(require('./dist/handlers/router.js'))` was exactly `['createRouter', 'handler']`, and the
 * registration function appeared nowhere in any of the five gated bundles.
 */
export { registerRequestAuthorizationResolver } from './httpResponse';

export type { CatalogAuthorizationRequest, CatalogAuthorizationResolver } from './httpResponse';
