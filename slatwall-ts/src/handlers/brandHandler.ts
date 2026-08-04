/**
 * brandHandler — the AWS boundary for the extracted Catalog brand surface.
 *
 * Authority: AAP §0.4.1.9 — exposes the `brandService` surface. The member surface is fixed by
 * AAP §0.4.2.3 (the one declared member) and AAP §0.4.2.5 (the three synthesized members).
 *
 * What this file is
 * Each member below narrows the proxy event, calls the brand service, and shapes the outcome through
 * /httpResponse (AAP §0.3.2). There is no query, no combination enumeration, no validation rule, no
 * field mapping and no SQL anywhere in this file, because every one of those belongs to a layer beneath
 * it.
 */

import type { CatalogContainer, TransactionalWriteRunner } from '../config/container';
import type { Brand } from '../domain/product/Brand';
import type {
  EntityCrudType,
  HandlerAccessClassification,
  InvocationSecurityResolver,
  RequestAuthorizationContext,
} from '../ports/AccountContextPort';
import { ValidationError } from '../errors/ValidationError';
import type { BrandService, ManagedBrand } from '../services/BrandService';

import {
  createActionDispatcher,
  errorResponse,
  forbiddenResponse,
  invalidRequestBodyResponse,
  messageResponse,
  notFoundResponse,
  okResponse,
  readJsonObjectBody,
  readPathParameter,
  resolveRequestAuthorization,
  toInvocationSecurityRequest,
  unauthorizedResponse,
  HTTP_STATUS,
  type ActionRoute,
  type ActionRouteTable,
  type APIGatewayProxyEvent,
  type APIGatewayProxyHandler,
  type APIGatewayProxyResult,
  type CatalogAuthorizationEvent,
} from './httpResponse';

/** The name of the path parameter carrying a brand's primary identifier. */
const BRAND_ID_PATH_PARAMETER = 'brandID';

/** The identifier value that means "this brand has never been persisted". */
const UNSAVED_BRAND_ID = '';

/** The refusal text for a request that addressed no brand at all. */
const BRAND_ID_REQUIRED_MESSAGE = `A "${BRAND_ID_PATH_PARAMETER}" path parameter is required`;

/** The entity name every authorisation question from this handler is asked about. */
const BRAND_ENTITY_NAME = 'Brand';

/**
 * The prefix every routed brand action carries, so the resolver is told which action it is gating.
 */
const BRAND_ACTION_PREFIX = 'brand.';

/** What the gate answers: either the refusal to return, or the authorised invocation context. */
type BrandAuthorizationOutcome =
  | { readonly refusal: APIGatewayProxyResult; readonly authorization?: undefined }
  | { readonly refusal?: undefined; readonly authorization: RequestAuthorizationContext };

/** The slice of the proxy event a member needs in order to address one brand. */
export type BrandIdentifierEvent = Pick<APIGatewayProxyEvent, 'pathParameters' | 'headers'>;

/**
 * The slice of the proxy event the save member needs: the payload, plus the optional identifier that
 * decides whether the save is an update or a creation.
 */
export type BrandSaveEvent = Pick<APIGatewayProxyEvent, 'body' | 'pathParameters' | 'headers'>;

/** The slice of the proxy event the injected authorisation resolver is given. */
export type BrandAuthorizationEvent = CatalogAuthorizationEvent;

/** The access classification of every routed brand operation, and the evidence for each row. */
export const BRAND_ACCESS_MATRIX: Readonly<
  Record<keyof BrandHandler, HandlerAccessClassification>
> = Object.freeze({
  saveBrand: 'secure',
  getBrand: 'secure',
  deleteBrand: 'secure',
});

/**
 * The brand representation a route returns: an explicit, minimal projection of the domain object.
 */
export interface BrandResponse {
  readonly brandID: string;
  readonly brandName?: string;
  readonly brandWebsite?: string;
  readonly urlTitle?: string;
  readonly activeFlag?: boolean;
  readonly publishedFlag?: boolean;
}

/** The brand-service surface this handler consumes — the injection seam. */
export interface BrandHandlerService {
  readonly saveBrand: (brand: ManagedBrand, data: Record<string, unknown>) => Promise<ManagedBrand>;
  readonly newBrand: () => ManagedBrand;
  readonly getBrand: (brandID: string) => Promise<ManagedBrand | null>;
  readonly deleteBrand: (brand: ManagedBrand) => Promise<boolean>;
}

/**
 * Compile-time assertion helper: resolves to `TActual` when it is assignable to `TExpected`, and
 * fails the build otherwise. Type-only, so it contributes nothing to the bundle. The same helper
 * ./services/BrandService uses for its own two guards, spelled identically so the pattern is
 * recognisable across the subtree.
 */
type AssertAssignable<TActual extends TExpected, TExpected> = TActual;

/** The parity guard — the real `brandService` really does satisfy {@link BrandHandlerService}. */
type _BrandServiceSatisfiesBrandHandlerService = AssertAssignable<
  BrandService,
  BrandHandlerService
>;

/** The routed brand operations, ready to be mounted by src/handlers/router.ts. */
export interface BrandHandler {
  readonly saveBrand: (event: BrandSaveEvent) => Promise<APIGatewayProxyResult>;
  readonly getBrand: (event: BrandIdentifierEvent) => Promise<APIGatewayProxyResult>;
  readonly deleteBrand: (event: BrandIdentifierEvent) => Promise<APIGatewayProxyResult>;
}

/**
 * Projects a brand onto the minimal representation a route returns.
 */
function toBrandResponse(brand: Brand): BrandResponse {
  const response: BrandResponse = {
    brandID: brand.brandID,
    ...(brand.brandName !== undefined ? { brandName: brand.brandName } : {}),
    ...(brand.brandWebsite !== undefined ? { brandWebsite: brand.brandWebsite } : {}),
    ...(brand.urlTitle !== undefined ? { urlTitle: brand.urlTitle } : {}),
    ...(brand.activeFlag !== undefined ? { activeFlag: brand.activeFlag } : {}),
    ...(brand.publishedFlag !== undefined ? { publishedFlag: brand.publishedFlag } : {}),
  };

  return response;
}

/**
 * Reads the addressed brand identifier, or reports that none was addressed.
 */
function readBrandIdentifier(event: BrandIdentifierEvent): string | undefined {
  const brandID: string | undefined = readPathParameter(event, BRAND_ID_PATH_PARAMETER);

  if (brandID === undefined || brandID === UNSAVED_BRAND_ID) {
    return undefined;
  }

  return brandID;
}

/**
 * Binds the brand service to the AWS-facing operations it backs.
 *
 * @param brandService - The brand service. Typed as {@link BrandHandlerService} so a hand-written
 * double satisfies it; the guard above proves the real `BrandService` does too.
 *
 * @param resolveAuthorization - Resolves this invocation's principal and its entity-authorisation
 * verdict. Required; see above.
 *
 * @returns The three routed operations, frozen.
 *
 * @example
 * ```ts
 * // src/handlers/router.ts wires it once, from the composition root:
 * Const brandHandler = createBrandHandler(brandService, resolveAuthorization);
 * Const response = await brandHandler.getBrand(event);
 * ```
 */
export function createBrandHandler(
  brandService: BrandHandlerService,
  resolveAuthorization: InvocationSecurityResolver,
  writeRunner: TransactionalWriteRunner<BrandHandlerService>,
): BrandHandler {
  /**
   * Runs the gate `setupRequest()` [org/Hibachi/Hibachi.cfc:L188] ran, for one CRUD type.
   */
  const refuseUnauthorized = (
    event: BrandAuthorizationEvent,
    member: keyof BrandHandler,
    crudType: EntityCrudType,
    brandID?: string,
  ): BrandAuthorizationOutcome => {
    /*
     * One resolution per invocation, and it now carries the whole question
     * The resolver is handed the routed action, the single operation being attempted, the
     * entity from this file's own constant and the addressed identifier, instead of the bare header
     * slice it used to receive. It is still called exactly once, which a test pins.
     */
    const authorization: RequestAuthorizationContext = resolveAuthorization(
      toInvocationSecurityRequest(event, {
        action: `${BRAND_ACTION_PREFIX}${member}`,
        crudType,
        entityName: BRAND_ENTITY_NAME,
        ...(brandID === undefined ? {} : { entityID: brandID }),
      }),
    );
    const account = authorization.accountContext.getCurrentAccount();

    // Steps 1 and 2 of the ladder. `newFlag` is `isNew()`, so true means "not logged in".
    if (account === undefined || account.newFlag) {
      return { refusal: unauthorizedResponse() };
    }

    /*
     * Step 3. The port answers; the permission model stays behind the boundary. Exactly one question
     * is asked — the one that matches the operation this route performs. The addressed
     * identifier travels with it so a deployment may scope the grant to the row.
     */
    if (
      !authorization.entityAuthorization.authenticateEntity({
        crudType,
        entityName: BRAND_ENTITY_NAME,
        ...(brandID === undefined ? {} : { entityID: brandID }),
      })
    ) {
      return { refusal: forbiddenResponse() };
    }

    /*
     * The authorised context is returned, not discarded. The write
     * routes hand it to the transaction boundary so property population and audit stamping run under
     * the principal this gate just approved, rather than under whatever the composition root
     * memoised. A gate that answered only `undefined` could not make that guarantee.
     */
    return { authorization };
  };
  /**
   * Saves a brand, creating it when no identifier was addressed and updating it otherwise.
   */
  const saveBrand = async (event: BrandSaveEvent): Promise<APIGatewayProxyResult> => {
    /*
     * The gate runs first, before the body is even parsed. The legacy order is not negotiable:
     * `setupRequest()` refuses at [org/Hibachi/Hibachi.cfc:L188] before a controller method runs at
     * all, so nothing about the request is examined on an unauthorised invocation. Keeping that order
     * here also means an unauthorised caller learns nothing from the shape of its own payload — the
     * three body-problem responses ./httpResponse distinguishes are never reached.
     */
    const brandID: string | undefined = readBrandIdentifier(event);
    const { refusal, authorization } = refuseUnauthorized(
      event,
      'saveBrand',
      brandID === undefined ? 'create' : 'update',
      brandID,
    );

    if (refusal !== undefined) {
      return refusal;
    }

    const body = readJsonObjectBody(event);

    if (!body.present) {
      return invalidRequestBodyResponse(body.problem);
    }

    try {
      /*
       * — the whole operation runs inside one transaction, resolution included
       * `BaseService.save` persists and then runs `settingCleanup`, and that cleanup can fail. On the
       * pool-bound graph each statement auto-commits on its own connection, so a cleanup failure left
       * a committed brand row behind while this member answered an error — the caller was told its
       * write failed against a row that exists. The boundary is what makes the two outcomes agree.
       */
      /*
       * The gate is read off a separate capture, not off `saved`. `runWrite` calls the gate before it
       * commits — and therefore before the `const` below is initialised — so a gate closing over `saved`
       * would throw a `ReferenceError` from its temporal dead zone on the very path that matters most.
       * `./productHandler` captures its subject the same way and for the same reason.
       */
      let outcome: ManagedBrand | null = null;

      const saved: ManagedBrand | null = await writeRunner.runWrite<ManagedBrand | null>(
        /*
         * — the gate's own context, so population and audit run as the principal just
         * authorised. `authorization` is defined on this path: the refusal arm returned above.
         */
        authorization,
        async (graph) => {
          // Judgment (f): no identifier addressed is a creation; an addressed identifier is an update
          // and must resolve to a real row. `newBrand` never yields null, so the single null test
          // below rejects exactly the missing-row case and nothing else.
          const brand: ManagedBrand | null =
            brandID === undefined ? graph.newBrand() : await graph.getBrand(brandID);

          if (brand === null) {
            return null;
          }

          // Model/service/BrandService.cfc:L67 — brand first, payload second, positional, unaltered.
          outcome = await graph.saveBrand(brand, body.value);

          return outcome;
        },
        /*
         * M5 — the rollback gate. A failed validation is a successful call returning an invalid entity
         * [`model/service/HibachiService.cfc:L103`], so without this the transaction would commit and
         * any cleanup the operation performed would commit with it. `null` is the missing-row path,
         * which wrote nothing and must not be reported as a failure.
         */
        () => outcome !== null && outcome.hasErrors(),
      );

      /*
       * The empty transaction on the missing-row path is committed, not rolled back: nothing was
       * written, and a rollback would report a failure the caller did not cause.
       */
      if (saved === null) {
        return notFoundResponse();
      }

      /*
       * The failure is read off the returned brand, because that is where the service puts it.
       * `model/service/BrandService.cfc:L76` returns whatever the local override at
       * `model/service/HibachiService.cfc:L103` returns, and that member returns the entity on every
       * path — a failed save comes back as a brand carrying findings, not as a raised error. So the
       * boundary must ask, and this is the ask.
       */
      if (saved.hasErrors()) {
        const failure = new ValidationError();

        failure.addErrors(saved.getErrors());

        return errorResponse(failure);
      }

      // The saved entity is projected, never serialised whole; see {@link BrandResponse}.
      return okResponse(toBrandResponse(saved));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Reads one brand by its primary identifier.
   */
  const getBrand = async (event: BrandIdentifierEvent): Promise<APIGatewayProxyResult> => {
    /*
     * The gate runs before the identifier is even read, and that order is the anti-enumeration
     * property. It reproduces the legacy order — `setupRequest()` refuses at
     * [org/Hibachi/Hibachi.cfc:L188] before a controller method runs — and it has a specific
     * consequence worth stating: because the refusal is decided without consulting the identifier or
     * the repository, an unauthorised caller receives the same response for an identifier that
     * exists and one that does not. Gating after the lookup would have turned this member into an
     * existence oracle, which is exactly the non-disclosure the paragraph above is about.
     */
    const brandID: string | undefined = readBrandIdentifier(event);
    const { refusal } = refuseUnauthorized(event, 'getBrand', 'read', brandID);

    if (refusal !== undefined) {
      return refusal;
    }

    // A request that addressed nothing is a request fault, not a missing brand; see the convention on
    // {@link BRAND_ID_REQUIRED_MESSAGE}. The gate above has already run, so this discloses nothing.
    if (brandID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, BRAND_ID_REQUIRED_MESSAGE);
    }

    try {
      const brand: ManagedBrand | null = await brandService.getBrand(brandID);

      /*
       * An identifier was addressed and matched nothing, which is the one condition 404 is reserved
       * for here. Projected, never serialised whole; see {@link BrandResponse}.
       */
      return brand === null ? notFoundResponse() : okResponse(toBrandResponse(brand));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Removes a brand, subject to the delete guards the validation layer owns.
   */
  const deleteBrand = async (event: BrandIdentifierEvent): Promise<APIGatewayProxyResult> => {
    /*
     * The identifier is read first so the gate can name the addressed row's binding half),
     * and the gate still runs before anything is done with it — the bad-request and not-found branches
     * below are both after the refusal, so this member is no more of an existence oracle than it was.
     * `delete` is the legacy crudType for a `delete` item
     * [org/Hibachi/HibachiAuthenticationService.cfc:L57-L58].
     */
    const brandID: string | undefined = readBrandIdentifier(event);
    const { refusal, authorization } = refuseUnauthorized(event, 'deleteBrand', 'delete', brandID);

    if (refusal !== undefined) {
      return refusal;
    }

    /*
     * Same convention as `getBrand`, and it matters more on a removal: a client that received 404 for
     * its own malformed request could conclude the brand was already gone and stop retrying with a
     * corrected request. See {@link BRAND_ID_REQUIRED_MESSAGE}.
     */
    if (brandID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, BRAND_ID_REQUIRED_MESSAGE);
    }

    try {
      /*
       * And together, and the two are inseparable on this path. `baseService.delete` removes
       * the row and then runs both cleanup ports; on the pool-bound graph a cleanup failure left the
       * row gone while this member answered an error. And the delete guard itself now reads
       * [`model/validation/Brand.json:L6`] — a live products count — which must observe the same
       * connection the DELETE writes on, or it can pass against a state the transaction never sees.
       * One boundary satisfies both.
       */
      const verdict: boolean | null = await writeRunner.runWrite<boolean | null>(
        /* — the gate's own context; see `saveBrand` for the full note. */
        authorization,
        async (graph) => {
          // Judgment (e): the service contract takes the entity, so the identifier is resolved first —
          // inside the unit, so the read and the removal share one connection.
          const brand: ManagedBrand | null = await graph.getBrand(brandID);

          // Addressed but absent — nothing is removed and no removal is attempted.
          if (brand === null) {
            return null;
          }

          return graph.deleteBrand(brand);
        },
        /*
         * Nothing this member produces is an "errors" state: the verdict is a boolean and a refusal is
         * a committed no-op. A raise rolls back on its own, inside the runner.
         */
        () => false,
      );

      if (verdict === null) {
        return notFoundResponse();
      }

      // Judgment (g): the verdict is serialised exactly as returned — not inverted, not restated as a
      // status, not wrapped.
      return okResponse(verdict);
    } catch (error) {
      return errorResponse(error);
    }
  };

  return Object.freeze({ saveBrand, getBrand, deleteBrand });
}

/* The Lambda entry point. */

/** The actions this entry point serves, in the legacy `slatAction` vocabulary. */
export type BrandRouteKey = 'brand.saveBrand' | 'brand.getBrand' | 'brand.deleteBrand';

/**
 * Builds the brand handler from the composition root.
 *
 * @param container the memoized service graph
 * @param resolveAuthorization the per-invocation authorisation resolver. Defaults to
 * `./httpResponse.ts`'s registered-resolver reader, which answers with the deployment's resolver when
 * one is registered and with the constant deny-all context otherwise — so the default is fail-closed
 * and the fallback is the only thing this file decides about identity.
 */
export function createBrandHandlerFromContainer(
  container: Pick<CatalogContainer, 'brandService' | 'brandWriteRunner'>,
  resolveAuthorization: InvocationSecurityResolver = resolveRequestAuthorization,
): BrandHandler {
  return createBrandHandler(
    container.brandService,
    resolveAuthorization,
    container.brandWriteRunner,
  );
}

/**
 * Maps each served action name onto the member that answers it.
 */
export function createBrandRoutes(handlers: BrandHandler): ActionRouteTable<BrandRouteKey> {
  /*
   * The literal is annotated before it is frozen, and the order is load-bearing. `object.freeze` takes
   * the literal through a generic parameter, which loses its freshness and with it TypeScript's
   * excess-property check — a route name not declared in the union above would then compile silently. A
   * first draft did exactly that and was caught by adding an undeclared key and watching it pass.
   * Annotating this binding restores the check in both directions: an undeclared key is rejected here,
   * and a declared key with no entry is reported as missing.
   */
  const routes: Record<BrandRouteKey, ActionRoute> = {
    'brand.saveBrand': (event: APIGatewayProxyEvent) => handlers.saveBrand(event),
    'brand.getBrand': (event: APIGatewayProxyEvent) => handlers.getBrand(event),
    'brand.deleteBrand': (event: APIGatewayProxyEvent) => handlers.deleteBrand(event),
  };

  return Object.freeze(routes);
}

/**
 * The shape `../config/container`'s `getBrandSurfaceGraph` publishes, used to type the deferred require inside
 * {@link handler}.
 */
type BrandSurfaceModule = typeof import('../config/container');

/** The dispatcher, built once per container and reused for every later invocation. */
let dispatchBrandAction: ActionRoute | undefined;

/**
 * The Lambda entry point for the brand surface.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (dispatchBrandAction === undefined) {
      /*
       * A deferred CommonJS `require`, deliberately not a dynamic `import`. The difference was
       * measured, not assumed, and it decided this line.
       */
      const { getBrandSurfaceGraph } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate; see above.
        require('../config/container') as BrandSurfaceModule;
      const container = getBrandSurfaceGraph();

      dispatchBrandAction = createActionDispatcher<BrandRouteKey>({
        routes: createBrandRoutes(createBrandHandlerFromContainer(container)),
        beginInvocation: () => {
          container.beginInvocation();
        },
      });
    }

    return await dispatchBrandAction(event);
  } catch (error: unknown) {
    return errorResponse(error);
  }
};

/** Compile-time proof that the export above satisfies the runtime's handler contract. */
type _BrandHandlerSatisfiesLambdaContract = AssertAssignable<
  typeof handler,
  APIGatewayProxyHandler
>;

/* The deployment registration seam, re-exported so it is reachable from the packaged artifact. */

/*
 * This artifact serves the gated brand surface, so a deployment that mounts `handler` above — rather
 * than `./router.ts`'s aggregate — needs the registration seam on this module. Every brand route is
 * gated, so without a registered resolver this artifact answers `401` and nothing else.
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
