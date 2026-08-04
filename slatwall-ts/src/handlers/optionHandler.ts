/**
 * optionHandler — the AWS Lambda boundary for the Catalog's option surface.
 *
 * Authority: AAP §0.4.1.9 — exposes the `OptionService` surface. The exposed member set is fixed by
 * AAP §0.4.2.4 and constrained by AAP §0.4.2.5; the dependency classification is AAP §0.6.3.4.
 *
 * What this file is
 * AAP §0.3.2, quoting AWS's own reference layout for this architecture: "the handler responsible
 * only for translating AWS-specific input into domain calls." Each member below does exactly five
 * things, in order: run the authorisation gate, narrow the event, call one service member, shape the
 * outcome through `./httpResponse`, return. There is no query, no combination enumeration, no
 * validation rule, no field mapping and no statement text anywhere in this module.
 */

import type { CatalogContainer } from '../config/container';
import { Option } from '../domain/option/Option';

import {
  HTTP_STATUS,
  createActionDispatcher,
  errorResponse,
  forbiddenResponse,
  invalidRequestBodyResponse,
  isJsonObject,
  messageResponse,
  okResponse,
  readJsonObjectBody,
  readPathParameter,
  readQueryStringParameter,
  resolveRequestAuthorization,
  toInvocationSecurityRequest,
  unauthorizedResponse,
} from './httpResponse';

import type {
  ActionRoute,
  ActionRouteTable,
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  CatalogAuthorizationEvent,
} from './httpResponse';
import type { OptionService } from '../services/OptionService';
import type {
  EntityCrudType,
  HandlerAccessClassification,
  InvocationSecurityResolver,
  RequestAuthorizationContext,
} from '../ports/AccountContextPort';

/* Request member names — the legacy argument names, verbatim. */

/** The request-body member carrying the options to project. */
const OPTIONS_BODY_MEMBER = 'options';

/** The path parameter carrying the product identifier. */
const PRODUCT_ID_PATH_PARAMETER = 'productID';

/** The query-string parameter carrying the already-present option-group identifiers. */
const EXISTING_OPTION_GROUP_ID_LIST_QUERY_PARAMETER = 'existingOptionGroupIDList';

/** The identifier member read from one entry of the request body's options array. */
const OPTION_ID_ENTRY_MEMBER = 'optionID';

/** The display-name member read from one entry of the request body's options array. */
const OPTION_NAME_ENTRY_MEMBER = 'optionName';

/** The entity name the authorisation gate asks about. */
const OPTION_ENTITY_NAME = 'Option';

/**
 * The prefix every routed option action carries, so the resolver is told which action it is gating.
 */
const OPTION_ACTION_PREFIX = 'option.';

/* Neutral failure texts. */

const OPTIONS_MEMBER_MESSAGE = `The request body must carry an "${OPTIONS_BODY_MEMBER}" array`;

/** An entry of the options array was not usable. */
const OPTION_ENTRY_MESSAGE =
  `Every "${OPTIONS_BODY_MEMBER}" entry must be an object whose ` +
  `"${OPTION_ID_ENTRY_MEMBER}" and "${OPTION_NAME_ENTRY_MEMBER}" members are strings when present`;

const PRODUCT_ID_MESSAGE = `A "${PRODUCT_ID_PATH_PARAMETER}" path parameter is required`;

/** No option-group identifier list was supplied at all. */
const EXISTING_OPTION_GROUP_ID_LIST_MESSAGE =
  `An "${EXISTING_OPTION_GROUP_ID_LIST_QUERY_PARAMETER}" query parameter is required; ` +
  'an empty value is accepted';

/* Input narrowing. */

/**
 * Narrows an unknown value to an array whose elements are themselves unknown.
 *
 * @param value - Any value, typically a member read from a parsed request body.
 * @returns True when the value is an array, with its elements left unnarrowed.
 */
function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/**
 * Hydrates one entry of the request body's options array into a domain option.
 *
 * @param entry - One element of the request body's options array, unnarrowed.
 * @returns The hydrated option, or nothing when the entry is not usable.
 */
function readOptionEntry(entry: unknown): Option | undefined {
  if (!isJsonObject(entry)) {
    return undefined;
  }

  const option = new Option();

  const identifier: unknown = entry[OPTION_ID_ENTRY_MEMBER];

  if (typeof identifier === 'string') {
    option.optionID = identifier;
  } else if (identifier !== undefined && identifier !== null) {
    return undefined;
  }

  const name: unknown = entry[OPTION_NAME_ENTRY_MEMBER];

  if (typeof name === 'string') {
    option.optionName = name;
  } else if (name !== undefined && name !== null) {
    return undefined;
  }

  return option;
}

/**
 * The part of the option service this handler is a function of: its three declared members, and only
 * those.
 */
export type OptionSurface = Pick<
  OptionService,
  'getOptionsForSelect' | 'getUnusedProductOptions' | 'getUnusedProductOptionGroups'
>;

/* Event slices. */

/**
 * The event slice {@link OptionHandler.getOptionsForSelect} reads: the request body, plus the headers
 * the authorisation resolver is given.
 */
export type OptionsForSelectEvent = Pick<APIGatewayProxyEvent, 'body' | 'headers'>;

/**
 * The event slice {@link OptionHandler.getUnusedProductOptions} reads: the path parameters, which
 * carry the product identifier, and the query string, which carries the option-group identifier list —
 * plus the headers the authorisation resolver is given.
 */
export type UnusedProductOptionsEvent = Pick<
  APIGatewayProxyEvent,
  'pathParameters' | 'queryStringParameters' | 'headers'
>;

/**
 * The event slice {@link OptionHandler.getUnusedProductOptionGroups} reads: the query string, plus the
 * headers the authorisation resolver is given.
 */
export type UnusedProductOptionGroupsEvent = Pick<
  APIGatewayProxyEvent,
  'queryStringParameters' | 'headers'
>;

/** The slice of the proxy event the injected authorisation resolver is given. */
export type OptionAuthorizationEvent = CatalogAuthorizationEvent;

/** What one routed option operation requires of a principal, in the legacy's own vocabulary. */
type OptionAccessRequirement =
  | { readonly classification: Extract<HandlerAccessClassification, 'anyLogin'> }
  | {
      readonly classification: Extract<HandlerAccessClassification, 'secure'>;
      readonly crudType: EntityCrudType;
    };

/** The requirement `'anyLogin'` states: a logged-in account, and nothing further. */
const ANY_LOGIN_REQUIREMENT: OptionAccessRequirement = Object.freeze({
  classification: 'anyLogin',
});

/**
 * The requirement `'secure'` states for a read: a logged-in account whose permission groups grant
 * `read` on the entity {@link OPTION_ENTITY_NAME} names.
 */
const SECURE_READ_REQUIREMENT: OptionAccessRequirement = Object.freeze({
  classification: 'secure',
  crudType: 'read',
});

/** The access classification of every routed option operation, and the evidence for each row. */
export const OPTION_ACCESS_MATRIX: Readonly<Record<keyof OptionHandler, OptionAccessRequirement>> =
  Object.freeze({
    getOptionsForSelect: SECURE_READ_REQUIREMENT,
    getUnusedProductOptions: ANY_LOGIN_REQUIREMENT,
    getUnusedProductOptionGroups: ANY_LOGIN_REQUIREMENT,
  });

/**
 * The option surface exposed at the Lambda boundary — three members, one per declared service member.
 */
export interface OptionHandler {
  /** Projects options supplied in the request body into select entries. */
  readonly getOptionsForSelect: (event: OptionsForSelectEvent) => APIGatewayProxyResult;

  /** Lists the options a product may still be offered, as select entries. */
  readonly getUnusedProductOptions: (
    event: UnusedProductOptionsEvent,
  ) => Promise<APIGatewayProxyResult>;

  /** Lists the option groups not yet present on a product, as select entries. */
  readonly getUnusedProductOptionGroups: (
    event: UnusedProductOptionGroupsEvent,
  ) => Promise<APIGatewayProxyResult>;
}

/**
 * Binds the option surface to a service instance.
 *
 * @param optionService - The option service to delegate to, narrowed to its three declared members. A
 * full service instance satisfies it, and so does a three-member literal — which is what makes
 * the members assertable without a repository, a database, a network call or an AWS runtime.
 *
 * @param resolveAuthorization - Resolves this invocation's principal and its entity-authorisation
 * verdict from the request. required: there is no unauthorised construction of this handler.
 *
 * @returns The three request-shaped members, frozen.
 *
 * @example
 * ```ts
 * // In router.ts, which owns every route:
 * Const optionHandler = createOptionHandler(container.optionService, resolveAuthorization);
 * Const result = await optionHandler.getUnusedProductOptionGroups(event);
 * ```
 */
export function createOptionHandler(
  optionService: OptionSurface,
  resolveAuthorization: InvocationSecurityResolver,
): OptionHandler {
  /**
   * Runs the gate `setupRequest()` [org/Hibachi/Hibachi.cfc:L188] ran, for one routed member.
   */
  const refuseUnauthorized = (
    event: OptionAuthorizationEvent,
    member: keyof OptionHandler,
  ): APIGatewayProxyResult | undefined => {
    const requirement: OptionAccessRequirement = OPTION_ACCESS_MATRIX[member];

    /*
     * — one resolution, carrying the whole question. The resolver used to receive this
     * surface's bare header slice; it now receives the port's own `InvocationSecurityRequest`, built from
     * the event plus this row's declaration, so a deployment can scope a grant to the action invoked. An
     * `'anyLogin'` row still asks no entity question — the legacy branch that authorises it returns true
     * without one [org/Hibachi/HibachiAuthenticationService.cfc:L32-L34] — so its request carries the CRUD
     * type such a row would ask about if it were `'secure'`, which for every row here is `read`: this
     * surface performs nothing but reads. No resource identifier is carried, because no member addresses
     * one; both repository-backed members project a list.
     */
    const authorization: RequestAuthorizationContext = resolveAuthorization(
      toInvocationSecurityRequest(event, {
        action: `${OPTION_ACTION_PREFIX}${member}`,
        crudType: requirement.classification === 'secure' ? requirement.crudType : 'read',
        entityName: OPTION_ENTITY_NAME,
      }),
    );
    const account = authorization.accountContext.getCurrentAccount();

    // Steps 1 and 2 of the ladder. `newFlag` is `isNew()`, so true means "not logged in".
    if (account === undefined || account.newFlag) {
      return unauthorizedResponse();
    }

    // An 'anyLogin' row is decided here, because the legacy branch that authorises it returns true
    // without asking anything further. Nothing below this line runs for those two members.
    if (requirement.classification === 'anyLogin') {
      return undefined;
    }

    // Step 3, for the one 'secure' row. The port answers; the permission model stays behind the
    // boundary, and the entity name is the module constant, never a request value.
    if (
      authorization.entityAuthorization.authenticateEntity({
        crudType: requirement.crudType,
        entityName: OPTION_ENTITY_NAME,
      })
    ) {
      return undefined;
    }

    return forbiddenResponse();
  };

  /**
   * Ports the boundary for [model/service/OptionService.cfc:L55]
   * `public array function getOptionsForSelect(required any options)`.
   */
  const getOptionsForSelect = (event: OptionsForSelectEvent): APIGatewayProxyResult => {
    const refusal = refuseUnauthorized(event, 'getOptionsForSelect');

    if (refusal !== undefined) {
      return refusal;
    }

    const body = readJsonObjectBody(event);

    if (!body.present) {
      return invalidRequestBodyResponse(body.problem);
    }

    const entries: unknown = body.value[OPTIONS_BODY_MEMBER];

    if (!isUnknownArray(entries)) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, OPTIONS_MEMBER_MESSAGE);
    }

    const options: Option[] = [];

    for (const entry of entries) {
      const option = readOptionEntry(entry);

      if (option === undefined) {
        return messageResponse(HTTP_STATUS.BAD_REQUEST, OPTION_ENTRY_MESSAGE);
      }

      options.push(option);
    }

    try {
      return okResponse(optionService.getOptionsForSelect(options));
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/OptionService.cfc:L72]
   * `public array function getUnusedProductOptions(required string productID, required string
   * existingOptionGroupIDList)`.
   */
  const getUnusedProductOptions = async (
    event: UnusedProductOptionsEvent,
  ): Promise<APIGatewayProxyResult> => {
    const refusal = refuseUnauthorized(event, 'getUnusedProductOptions');

    if (refusal !== undefined) {
      return refusal;
    }

    const productID = readPathParameter(event, PRODUCT_ID_PATH_PARAMETER);

    if (productID === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, PRODUCT_ID_MESSAGE);
    }

    const existingOptionGroupIDList = readQueryStringParameter(
      event,
      EXISTING_OPTION_GROUP_ID_LIST_QUERY_PARAMETER,
    );

    if (existingOptionGroupIDList === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, EXISTING_OPTION_GROUP_ID_LIST_MESSAGE);
    }

    try {
      return okResponse(
        await optionService.getUnusedProductOptions(productID, existingOptionGroupIDList),
      );
    } catch (error) {
      return errorResponse(error);
    }
  };

  /**
   * Ports the boundary for [model/service/OptionService.cfc:L76]
   * `public array function getUnusedProductOptionGroups(required string existingOptionGroupIDList)`.
   */
  const getUnusedProductOptionGroups = async (
    event: UnusedProductOptionGroupsEvent,
  ): Promise<APIGatewayProxyResult> => {
    const refusal = refuseUnauthorized(event, 'getUnusedProductOptionGroups');

    if (refusal !== undefined) {
      return refusal;
    }

    const existingOptionGroupIDList = readQueryStringParameter(
      event,
      EXISTING_OPTION_GROUP_ID_LIST_QUERY_PARAMETER,
    );

    if (existingOptionGroupIDList === undefined) {
      return messageResponse(HTTP_STATUS.BAD_REQUEST, EXISTING_OPTION_GROUP_ID_LIST_MESSAGE);
    }

    try {
      return okResponse(
        await optionService.getUnusedProductOptionGroups(existingOptionGroupIDList),
      );
    } catch (error) {
      return errorResponse(error);
    }
  };

  return Object.freeze({
    getOptionsForSelect,
    getUnusedProductOptions,
    getUnusedProductOptionGroups,
  });
}

/* The Lambda entry point. */

/** The actions this entry point serves, in the legacy `slatAction` vocabulary. */
export type OptionRouteKey =
  | 'option.getOptionsForSelect'
  | 'option.getUnusedProductOptions'
  | 'option.getUnusedProductOptionGroups';

/**
 * Builds the option handler from the composition root.
 *
 * @param container the memoized service graph
 * @param resolveAuthorization the per-invocation authorisation resolver. Defaults to
 * `./httpResponse.ts`'s registered-resolver reader — the deployment's resolver when one is
 * registered, the constant deny-all context otherwise, so the default remains fail-closed.
 */
export function createOptionHandlerFromContainer(
  container: Pick<CatalogContainer, 'optionService'>,
  resolveAuthorization: InvocationSecurityResolver = resolveRequestAuthorization,
): OptionHandler {
  return createOptionHandler(container.optionService, resolveAuthorization);
}

/**
 * Maps each served action name onto the member that answers it.
 */
export function createOptionRoutes(handlers: OptionHandler): ActionRouteTable<OptionRouteKey> {
  /*
   * The literal is annotated before it is frozen, and the order is load-bearing. `object.freeze` takes
   * the literal through a generic parameter, which loses its freshness and with it TypeScript's
   * excess-property check — a route name not declared in the union above would then compile silently. A
   * first draft did exactly that and was caught by adding an undeclared key and watching it pass.
   * Annotating this binding restores the check in both directions: an undeclared key is rejected here,
   * and a declared key with no entry is reported as missing.
   */
  const routes: Record<OptionRouteKey, ActionRoute> = {
    'option.getOptionsForSelect': (event: APIGatewayProxyEvent) =>
      Promise.resolve(handlers.getOptionsForSelect(event)),
    'option.getUnusedProductOptions': (event: APIGatewayProxyEvent) =>
      handlers.getUnusedProductOptions(event),
    'option.getUnusedProductOptionGroups': (event: APIGatewayProxyEvent) =>
      handlers.getUnusedProductOptionGroups(event),
  };

  return Object.freeze(routes);
}

/** The dispatcher, built once per container and reused for every later invocation. */
let dispatchOptionAction: ActionRoute | undefined;

/**
 * The shape `../config/container`'s `getOptionSurfaceGraph` publishes, used to type the deferred require inside
 * {@link handler}.
 */
type OptionSurfaceModule = typeof import('../config/container');

/**
 * The Lambda entry point for the option surface.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (dispatchOptionAction === undefined) {
      /*
       * A deferred CommonJS `require`, deliberately not a dynamic `import`. The difference was
       * measured, not assumed, and it decided this line.
       */
      const { getOptionSurfaceGraph } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate; see above.
        require('../config/container') as OptionSurfaceModule;
      const container = getOptionSurfaceGraph();

      dispatchOptionAction = createActionDispatcher<OptionRouteKey>({
        routes: createOptionRoutes(createOptionHandlerFromContainer(container)),
        beginInvocation: () => {
          container.beginInvocation();
        },
      });
    }

    return await dispatchOptionAction(event);
  } catch (error: unknown) {
    return errorResponse(error);
  }
};

/** Compile-time proof that the export above satisfies the runtime's handler contract. */
type AssertHandlerAssignable<TActual extends TExpected, TExpected> = TActual;
type _OptionHandlerSatisfiesLambdaContract = AssertHandlerAssignable<
  typeof handler,
  APIGatewayProxyHandler
>;

/* The deployment registration seam, re-exported so it is reachable from the packaged artifact. */

/*
 * This artifact serves the gated option surface, so a deployment that mounts `handler` above — rather
 * than `./router.ts`'s aggregate — needs the registration seam on this module. Every option route is
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
