/**
 * `optionHandler` — the authorization gate in front of the Option boundary, and the two classifications
 * of member behind it.
 *
 * AAP authority: the AAP §0.4.4 wildcard row authorises `slatwall-ts/test/**` | CREATE. The suite sits
 * beside `test/handlers/skuHandler.test.ts`, `test/handlers/productHandler.test.ts` and
 * `test/handlers/brandHandler.test.ts`, so every Lambda boundary that has coverage is covered in the same
 * place. `test/services/OptionService.test.ts` states in its own header that `optionHandler` and the
 * account-authorisation gate are NOT covered there because they are "different modules at different
 * layers"; this file is where that layer is asserted, and neither file duplicates the other.
 *
 * =============================================================================================
 * WHAT IS UNDER TEST
 * =============================================================================================
 *   - THE GATE. `src/handlers/optionHandler.ts` refuses before it reads a body and before it reads an
 *     identifier, so a refusal can neither report a body problem nor act as an existence oracle. The
 *     three-way outcome asserted here is the legacy's: no principal is 401, a logged-in principal without
 *     permission is 403, and a permitted principal reaches the service. `getLoggedInFlag()` is the
 *     NEGATION of `isNew()` [org/Hibachi/HibachiScope.cfc:L40-L45], which is why the admitted principal is
 *     the one whose `newFlag` is false.
 *   - THE TWO CLASSIFICATIONS. This service's members split in two: the ones that read persisted rows and
 *     therefore ask the resolver for a `read` on their own entity, and the pure in-memory projection
 *     `getOptionsForSelect`, which touches no row at all. `OPTION_ACCESS_MATRIX` records which question
 *     each member asks, and the cases below pin that record against the handler's actual behaviour rather
 *     than trusting the table to stay in step on its own.
 *   - THE PROJECTION. Each answered body carries the `{ name, value }` select shape and nothing more — no
 *     entity, no relationship collection and no audit member reaches a caller.
 *
 * TEST PROVENANCE: every case below is **NET-NEW**. AAP §0.6.5.2 verified that no legacy
 * `OptionServiceTest` and no legacy `OptionDAOTest` exists, and that the legacy suite contains no
 * controller test of any kind. Nothing here extends a legacy assertion, and none is labelled as though it
 * did.
 *
 * WHAT THIS FILE DOES NOT COVER: how a route string reaches a member — `src/handlers/router.ts` owns the
 * `slatAction` table and mounts these members, and that seam is asserted in
 * `test/handlers/entrySurface.test.ts` for this surface and the four beside it rather than here; and the
 * SmartList identifier closure asserted through the service is
 * left in the service suite where it belongs. Stating that is preferable to implying a completeness this
 * file does not have.
 */
import { OPTION_ACCESS_MATRIX, createOptionHandler } from '../../src/handlers/optionHandler';
import type { Option } from '../../src/domain/option/Option';
import type {
  OptionAuthorizationEvent,
  OptionHandler,
  OptionSurface,
  OptionsForSelectEvent,
  UnusedProductOptionGroupsEvent,
  UnusedProductOptionsEvent,
} from '../../src/handlers/optionHandler';
import type {
  AccountReference,
  EntityAuthorizationRequest,
  RequestAuthorizationResolver,
} from '../../src/ports/AccountContextPort';
import type { SelectOption } from '../../src/services/OptionService';

/**
 * A principal, defaulting to the one shape the gate admits: logged in, non-admin.
 *
 * `newFlag: false` is the DEFAULT because `getLoggedInFlag()` is the NEGATION of `isNew()`
 * [org/Hibachi/HibachiScope.cfc:L40-L45], so a case that wants the refused principal says
 * `newFlag: true` explicitly.
 */
function account(overrides: Partial<AccountReference>): AccountReference {
  return {
    accountID: 'ffffffffffffffffffffffffffffffff',
    newFlag: false,
    adminAccountFlag: false,
    ...overrides,
  };
}

/** The projection member's event slice, with the headers container the resolver is handed. */
function optionsBodyEvent(body: string): OptionsForSelectEvent {
  return { body, headers: {} };
}

/** The two-input member's event slice. */
function unusedOptionsEvent(
  productID: string,
  existingOptionGroupIDList: string,
): UnusedProductOptionsEvent {
  return {
    pathParameters: { productID },
    queryStringParameters: { existingOptionGroupIDList },
    headers: {},
  };
}

/** The one-input member's event slice. */
function unusedGroupsEvent(existingOptionGroupIDList: string): UnusedProductOptionGroupsEvent {
  return { queryStringParameters: { existingOptionGroupIDList }, headers: {} };
}

describe('optionHandler — SEC-03, the gate and the two classifications', () => {
  interface Probe {
    readonly asked: EntityAuthorizationRequest[];
    readonly resolutions: { count: number };
    readonly serviceCalls: string[];
    /** The arguments each reached service member was handed, so verbatim forwarding is observable. */
    readonly forwarded: unknown[][];
    readonly handler: OptionHandler;
  }

  function makeHandler(account: AccountReference | undefined, grant: readonly string[]): Probe {
    const asked: EntityAuthorizationRequest[] = [];
    const resolutions = { count: 0 };
    const serviceCalls: string[] = [];
    const forwarded: unknown[][] = [];

    const surface: OptionSurface = {
      getOptionsForSelect: (options: Option[]): SelectOption[] => {
        serviceCalls.push('getOptionsForSelect');
        forwarded.push([options.length]);
        return options.map((option) => ({
          name: option.optionName ?? '',
          value: option.optionID,
        }));
      },
      getUnusedProductOptions: (
        productID: string,
        existingOptionGroupIDList: string,
      ): Promise<SelectOption[]> => {
        serviceCalls.push('getUnusedProductOptions');
        forwarded.push([productID, existingOptionGroupIDList]);
        return Promise.resolve([{ name: 'Group - Option', value: 'option-1' }]);
      },
      getUnusedProductOptionGroups: (
        existingOptionGroupIDList: string,
      ): Promise<SelectOption[]> => {
        serviceCalls.push('getUnusedProductOptionGroups');
        forwarded.push([existingOptionGroupIDList]);
        return Promise.resolve([{ name: 'Group', value: 'group-1' }]);
      },
    };

    const resolve: RequestAuthorizationResolver<OptionAuthorizationEvent> = () => {
      resolutions.count += 1;

      return {
        accountContext: { getCurrentAccount: () => account },
        entityAuthorization: {
          authenticateEntity: (request: EntityAuthorizationRequest): boolean => {
            asked.push(request);
            return grant.includes(request.crudType);
          },
        },
      };
    };

    return {
      asked,
      resolutions,
      serviceCalls,
      forwarded,
      handler: createOptionHandler(surface, resolve),
    };
  }

  it('NET-NEW — HibachiAuthenticationService.cfc:L83 — NO principal refuses all three with 401', async () => {
    const probe = makeHandler(undefined, ['read']);

    const results = [
      probe.handler.getOptionsForSelect(optionsBodyEvent('{"options":[]}')),
      await probe.handler.getUnusedProductOptions(unusedOptionsEvent('product-1', '')),
      await probe.handler.getUnusedProductOptionGroups(unusedGroupsEvent('')),
    ];

    for (const result of results) {
      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body)).toStrictEqual({ message: 'Authentication is required' });
    }

    expect(probe.serviceCalls).toStrictEqual([]);
    expect(probe.asked).toStrictEqual([]);
  });

  it('NET-NEW — optionHandler — HibachiScope.cfc:L40-L45 — the logged-in test is the NEGATION of newFlag', async () => {
    const notLoggedIn = makeHandler(account({ newFlag: true }), ['read']);
    expect(
      (await notLoggedIn.handler.getUnusedProductOptionGroups(unusedGroupsEvent(''))).statusCode,
    ).toBe(401);
    expect(notLoggedIn.serviceCalls).toStrictEqual([]);

    const loggedIn = makeHandler(account({ newFlag: false }), []);
    expect(
      (await loggedIn.handler.getUnusedProductOptionGroups(unusedGroupsEvent(''))).statusCode,
    ).toBe(200);
  });

  it('NET-NEW — L67-L68 — an anyLogin row asks NO entity question and succeeds on login alone', async () => {
    // The permission model grants NOTHING, and both rows still answer 200: the legacy `preProcess`
    // branch returns true outright once the :L30 logged-in gate has passed. Asking an entity question
    // here would refuse a caller the legacy admitted.
    const probe = makeHandler(account({}), []);

    expect(
      (await probe.handler.getUnusedProductOptions(unusedOptionsEvent('product-1', 'g1')))
        .statusCode,
    ).toBe(200);
    expect(
      (await probe.handler.getUnusedProductOptionGroups(unusedGroupsEvent('g1'))).statusCode,
    ).toBe(200);

    expect(probe.asked).toStrictEqual([]);
    expect(probe.serviceCalls).toStrictEqual([
      'getUnusedProductOptions',
      'getUnusedProductOptionGroups',
    ]);
  });

  it('NET-NEW — L43-L49 — the secure row DOES ask, and a logged-in principal without permission gets 403', () => {
    const probe = makeHandler(account({}), []);
    const result = probe.handler.getOptionsForSelect(optionsBodyEvent('{"options":[]}'));

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body)).toStrictEqual({ message: 'Not authorized' });
    expect(probe.serviceCalls).toStrictEqual([]);
  });

  it('NET-NEW — L55-L56 — the secure row asks exactly `read` on `Option`, from a module constant', () => {
    const probe = makeHandler(account({}), []);
    probe.handler.getOptionsForSelect(optionsBodyEvent('{"options":[]}'));

    // The entity name is never a request value, so no caller can redirect the question.
    expect(probe.asked).toStrictEqual([{ crudType: 'read', entityName: 'Option' }]);
  });

  it('NET-NEW — a granted secure row reaches the service and returns the projection unaltered', () => {
    const probe = makeHandler(account({}), ['read']);
    const result = probe.handler.getOptionsForSelect(
      optionsBodyEvent('{"options":[{"optionID":"o1","optionName":"Red"}]}'),
    );

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toStrictEqual([{ name: 'Red', value: 'o1' }]);
    expect(probe.asked).toStrictEqual([{ crudType: 'read', entityName: 'Option' }]);
  });

  it('NET-NEW — the gate runs BEFORE the body is parsed, so a refusal never reports a body problem', () => {
    const probe = makeHandler(account({}), []);

    // Four distinct bad-request texts exist below the gate; an unauthorised caller can reach none of
    // them, so none can be used to discover the request shape.
    for (const body of ['<<not json>>', '[]', '{}', '{"options":[7]}']) {
      const result = probe.handler.getOptionsForSelect(optionsBodyEvent(body));
      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body)).toStrictEqual({ message: 'Not authorized' });
    }
  });

  it('NET-NEW — the gate runs BEFORE the product identifier is read, so it is not an existence oracle', async () => {
    const probe = makeHandler(undefined, []);

    const addressed = await probe.handler.getUnusedProductOptions(
      unusedOptionsEvent('product-1', ''),
    );
    const other = await probe.handler.getUnusedProductOptions(
      unusedOptionsEvent('no-such-product', ''),
    );
    const missing = await probe.handler.getUnusedProductOptions({
      pathParameters: null,
      queryStringParameters: null,
      headers: {},
    });

    expect(addressed).toStrictEqual(other);
    expect(other).toStrictEqual(missing);
    expect(addressed.statusCode).toBe(401);
  });

  it('NET-NEW — the resolver is invoked exactly once per request, on every member', async () => {
    const projection = makeHandler(account({}), ['read']);
    projection.handler.getOptionsForSelect(optionsBodyEvent('{"options":[]}'));
    expect(projection.resolutions.count).toBe(1);

    const options = makeHandler(account({}), []);
    await options.handler.getUnusedProductOptions(unusedOptionsEvent('p', ''));
    expect(options.resolutions.count).toBe(1);

    const groups = makeHandler(account({}), []);
    await groups.handler.getUnusedProductOptionGroups(unusedGroupsEvent(''));
    expect(groups.resolutions.count).toBe(1);
  });

  it('NET-NEW — judgment (d) survives the gate: an EMPTY list is still forwarded verbatim', async () => {
    // An empty list resolves to EVERY option group [model/dao/OptionDAO.cfc:L107], which is the single
    // most useful call this member has. The gate must protect it, not suppress it.
    const probe = makeHandler(account({}), []);
    const result = await probe.handler.getUnusedProductOptionGroups(unusedGroupsEvent(''));

    expect(result.statusCode).toBe(200);
    expect(probe.forwarded).toStrictEqual([['']]);
  });

  it('NET-NEW — judgment (c) survives the gate: the list reaches the service byte for byte', async () => {
    const probe = makeHandler(account({}), []);
    await probe.handler.getUnusedProductOptions(unusedOptionsEvent('product-1', ' g1 ,,G2,'));

    // Not split, not trimmed, not de-duplicated, not re-ordered — and the identifier is FIRST.
    expect(probe.forwarded).toStrictEqual([['product-1', ' g1 ,,G2,']]);
  });

  it('NET-NEW — an authorised request still reports an ABSENT input as a bad request', async () => {
    const probe = makeHandler(account({}), []);
    const result = await probe.handler.getUnusedProductOptionGroups({
      queryStringParameters: null,
      headers: {},
    });

    // Absent is not empty: the gate passes, and only then is the required argument enforced.
    expect(result.statusCode).toBe(400);
    expect(probe.serviceCalls).toStrictEqual([]);
  });

  it('NET-NEW — optionHandler — no refusal carries a WWW-Authenticate header or names any scheme', () => {
    const probe = makeHandler(undefined, []);
    const result = probe.handler.getOptionsForSelect(optionsBodyEvent('{"options":[]}'));

    expect(result.headers).toStrictEqual({ 'Content-Type': 'application/json' });
    expect(result.body).not.toMatch(/bearer|basic|scheme|token/i);
  });

  it('NET-NEW — every routed member carries a requirement, and the matrix is frozen through and through', () => {
    /* ⛔ THE SET IS EXACTLY THREE, ONE PER DECLARED SERVICE MEMBER, AND CLOSURE IS THE ASSERTION.
     * The claim is not merely "every mounted member is classified" — `toStrictEqual` over the sorted keys
     * makes it bidirectional, so an unclassified addition and an invented fourth route both fail here.
     * Two bounded twins were previously mounted beside the unused-* members and were withdrawn: AAP
     * §0.4.1.8 and §0.4.2.4-§0.4.2.5 fix `OptionService` at seven public members, and §0.8.3.1 makes that
     * surface the artefact a reviewer checks method by method, so a route to a member that is not on it
     * could not survive. The next case states the other half: no door opened to any of the four members
     * the legacy fabricated at run time either. */
    expect(Object.keys(OPTION_ACCESS_MATRIX).sort()).toStrictEqual([
      'getOptionsForSelect',
      'getUnusedProductOptionGroups',
      'getUnusedProductOptions',
    ]);

    expect(OPTION_ACCESS_MATRIX.getOptionsForSelect).toStrictEqual({
      classification: 'secure',
      crudType: 'read',
    });
    expect(OPTION_ACCESS_MATRIX.getUnusedProductOptions).toStrictEqual({
      classification: 'anyLogin',
    });
    expect(OPTION_ACCESS_MATRIX.getUnusedProductOptionGroups).toStrictEqual({
      classification: 'anyLogin',
    });

    expect(Object.isFrozen(OPTION_ACCESS_MATRIX)).toBe(true);
    for (const requirement of Object.values(OPTION_ACCESS_MATRIX)) {
      expect(Object.isFrozen(requirement)).toBe(true);
    }
  });

  it('NET-NEW — AAP §0.4.2.5 — the four synthesized members are still unroutable', () => {
    const probe = makeHandler(account({}), ['read']);

    // The gate did not become a reason to expose them, and judgment (a) still holds.
    expect(Object.keys(probe.handler).sort()).toStrictEqual([
      'getOptionsForSelect',
      'getUnusedProductOptionGroups',
      'getUnusedProductOptions',
    ]);
    for (const synthesized of [
      'getOption',
      'getOptionGroup',
      'getOptionSmartList',
      'getOptionGroupSmartList',
    ]) {
      expect(synthesized in probe.handler).toBe(false);
    }
  });
});
