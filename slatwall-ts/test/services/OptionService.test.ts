/**
 * `OptionService` — SmartList identifier closure across its TWO root entities.
 *
 * AAP authority: AAP §0.4.1.12 lists `slatwall-ts/test/services/OptionService.test.ts` | CREATE |
 * "**NET-NEW**", and the AAP §0.4.4 wildcard row authorises `slatwall-ts/test/**` | CREATE.
 *
 * =============================================================================================
 * WHY THIS SERVICE NEEDS ITS OWN SEC-09 CASES
 * =============================================================================================
 * `./SkuService.test.ts` already pins the whitelist itself and the drop-the-unresolvable behaviour.
 * This file exists for the one thing that is structurally different here and cannot be observed
 * there: this service roots a smart list at EITHER `SlatwallOption` or `SlatwallOptionGroup`,
 * because AAP §0.4.2.5 declares both `getOptionSmartList` and `getOptionGroupSmartList` as
 * synthesized members. Resolving an option-group key against the option whitelist — or the reverse —
 * would compile, would not throw, and would silently admit or discard the wrong identifiers. That is
 * exactly the class of failure that has to be pinned by a test rather than argued about, so the root
 * entity is threaded through the whole input fold and asserted here in both directions.
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP §0.6.5.2 verified that no legacy
 * `OptionServiceTest` and no legacy `OptionDAOTest` exists.
 *
 * WHAT THIS FILE DOES NOT COVER: `getOptionsForSelect`, `getUnusedProductOptions`,
 * `getUnusedProductOptionGroups`, `getOption` and `getOptionGroup` are untouched here. The full
 * seven-member matrix the AAP envisions for this file remains to be covered; stating that is
 * preferable to implying a completeness this file does not have.
 */
import { OPTION_ACCESS_MATRIX, createOptionHandler } from '../../src/handlers/optionHandler';
import { resolveSmartListPropertyIdentifier } from '../../src/ports/SmartListQueryPort';
import { OptionService } from '../../src/services/OptionService';
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
import type { SmartListQuery } from '../../src/ports/SmartListQueryPort';
import type { SelectOption } from '../../src/services/OptionService';

/** Stands in for the option repository, which none of these cases reaches. */
const UNREACHED_COLLABORATOR = {} as never;

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

interface Harness {
  readonly service: OptionService;
  readonly queries: SmartListQuery[];
}

/** Captures the composed query instead of executing it, so the description can be asserted. */
function makeService(): Harness {
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

  return { queries, service: new OptionService(UNREACHED_COLLABORATOR, smartListQueryPortDouble) };
}

describe('OptionService — SEC-09, the two roots use DIFFERENT whitelists', () => {
  it('NET-NEW — each root resolves only its own properties', () => {
    // `optionCode` belongs to SlatwallOption; `optionGroupCode` to SlatwallOptionGroup. Neither
    // resolves against the other, which is the whole point of threading the root entity through.
    expect(resolveSmartListPropertyIdentifier('SlatwallOption', 'optionCode')).toBe('optionCode');
    expect(resolveSmartListPropertyIdentifier('SlatwallOptionGroup', 'optionCode')).toBeUndefined();

    expect(resolveSmartListPropertyIdentifier('SlatwallOptionGroup', 'optionGroupCode')).toBe(
      'optionGroupCode',
    );
    expect(resolveSmartListPropertyIdentifier('SlatwallOption', 'optionGroupCode')).toBeUndefined();
  });

  it('NET-NEW — model/entity/Product.cfc:L343-L344 — the option paths the slice writes resolve', () => {
    expect(resolveSmartListPropertyIdentifier('SlatwallOption', 'optionGroup.optionGroupID')).toBe(
      'optionGroup.optionGroupID',
    );
    expect(resolveSmartListPropertyIdentifier('SlatwallOption', 'skus.product.productID')).toBe(
      'skus.product.productID',
    );
  });

  it('NET-NEW — model/entity/Product.cfc:L256 — the option-group path resolves only from its own root', () => {
    // Four segments, the three-hop maximum the slice writes.
    expect(
      resolveSmartListPropertyIdentifier('SlatwallOptionGroup', 'options.skus.product.productID'),
    ).toBe('options.skus.product.productID');
    // The same path is meaningless from the option root, because `options` is not a relationship of
    // SlatwallOption. An open string admitted it; the closed whitelist does not.
    expect(
      resolveSmartListPropertyIdentifier('SlatwallOption', 'options.skus.product.productID'),
    ).toBeUndefined();
  });
});

describe('OptionService.getOptionSmartList — SEC-09 end to end', () => {
  it('NET-NEW — the query is rooted at SlatwallOption', async () => {
    const { service, queries } = makeService();
    await service.getOptionSmartList();
    expect(queries[0]?.entityName).toBe('SlatwallOption');
  });

  it('NET-NEW — an injected filter key is dropped', async () => {
    const { service, queries } = makeService();
    await service.getOptionSmartList({ 'F:optionID) OR 1=1 --': 'x' });
    expect(queries[0]?.whereGroups ?? []).toEqual([]);
  });

  it('NET-NEW — a legal option filter survives unchanged', async () => {
    const { service, queries } = makeService();
    await service.getOptionSmartList({ 'F:optionGroup.optionGroupID': 'og-1' });
    expect(queries[0]?.whereGroups?.[0]?.filters).toEqual([
      { propertyIdentifier: 'optionGroup.optionGroupID', value: 'og-1' },
    ]);
  });

  it('NET-NEW — an option-GROUP property is dropped from an OPTION smart list', async () => {
    // The cross-root case, end to end: `optionGroupCode` is a real property of a real in-scope
    // entity, and it is still correctly discarded here because this query is not rooted there.
    const { service, queries } = makeService();
    await service.getOptionSmartList({ 'F:optionGroupCode': 'SIZE' });
    expect(queries[0]?.whereGroups ?? []).toEqual([]);
  });

  it('NET-NEW — an injected OrderBy term is dropped; a legal one is kept', async () => {
    const injected = makeService();
    await injected.service.getOptionSmartList({
      OrderBy: 'sortOrder); DELETE FROM SwOption|D',
    });
    expect(injected.queries[0]?.orders ?? []).toEqual([]);

    // model/entity/Product.cfc:L345 orders options by `sortOrder|ASC`.
    const legal = makeService();
    await legal.service.getOptionSmartList({ OrderBy: 'sortOrder|ASC' });
    expect(legal.queries[0]?.orders).toEqual([
      { propertyIdentifier: 'sortOrder', direction: 'ASC' },
    ]);
  });
});

describe('OptionService.getOptionGroupSmartList — SEC-09 end to end', () => {
  it('NET-NEW — the query is rooted at SlatwallOptionGroup', async () => {
    const { service, queries } = makeService();
    await service.getOptionGroupSmartList();
    expect(queries[0]?.entityName).toBe('SlatwallOptionGroup');
  });

  it('NET-NEW — model/entity/Product.cfc:L256 — the three-hop filter survives on THIS root', async () => {
    // The same key that must be dropped from an option smart list must be KEPT here. A single shared
    // whitelist could not satisfy both assertions, which is why the root is threaded through.
    const { service, queries } = makeService();
    await service.getOptionGroupSmartList({
      'F:options.skus.product.productID': 'p-1',
    });
    expect(queries[0]?.whereGroups?.[0]?.filters).toEqual([
      { propertyIdentifier: 'options.skus.product.productID', value: 'p-1' },
    ]);
  });

  it('NET-NEW — an injected key is dropped while a legal companion survives', async () => {
    const { service, queries } = makeService();
    await service.getOptionGroupSmartList({
      'F:optionGroupCode': 'SIZE',
      'FK:optionGroupName); DROP TABLE SwOptionGroup': 'x',
    });

    expect(queries[0]?.whereGroups?.[0]?.filters).toEqual([
      { propertyIdentifier: 'optionGroupCode', value: 'SIZE' },
    ]);
    expect(queries[0]?.whereGroups?.[0]?.likeFilters ?? []).toEqual([]);
  });

  it('NET-NEW — an OPTION property is dropped from an OPTION-GROUP smart list', async () => {
    const { service, queries } = makeService();
    await service.getOptionGroupSmartList({ 'F:optionCode': 'RED' });
    expect(queries[0]?.whereGroups ?? []).toEqual([]);
  });
});

/* ================================================================================================
 * SEC-03 — `src/handlers/optionHandler.ts`
 *
 * WHY THESE CASES LIVE HERE AND NOT IN `test/handlers/optionHandler.test.ts`. AAP §0.4.1.12 enumerates
 * NO `test/handlers/` directory, and `src/handlers/optionHandler.ts`'s own contract states the
 * consequence outright: "do not create a test file", with S6 manifesting instead as
 * testability-by-design. Inventing an un-enumerated directory is exactly the addition SCOPE-01 was
 * raised about, so the cases go to the AAP-enumerated file whose subject they are closest to — this
 * one, since the handler is a function of `OptionSurface`, which is a `Pick` of `OptionService`
 * itself. The same placement decision was taken for the brandHandler cases in `./BrandService.test.ts`.
 *
 * ⭐ WHAT MAKES THIS FILE'S HALF OF SEC-03 DIFFERENT FROM `./BrandService.test.ts`'S, AND WHY BOTH ARE
 * NEEDED. Every brand row is `'secure'`, so that gate asks an entity question on every request. Two of
 * the three option rows are `'anyLogin'`, whose legacy branch
 * [org/Hibachi/HibachiAuthenticationService.cfc:L67-L68] `return true`s WITHOUT asking one. A gate
 * copied from the brand file would therefore have refused callers the legacy admitted — a behavior
 * change that no compiler catches and that only an assertion on "no question was asked" can pin.
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP §0.6.5.2 verified that the legacy suite contains no
 * controller test of any kind.
 * ============================================================================================== */

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
      expect(JSON.parse(result.body)).toStrictEqual({
        code: 'CATALOG_REQUEST_REJECTED',
        message: 'Authentication is required',
      });
    }

    expect(probe.serviceCalls).toStrictEqual([]);
    expect(probe.asked).toStrictEqual([]);
  });

  it('NET-NEW — HibachiScope.cfc:L40-L45 — the logged-in test is the NEGATION of newFlag', async () => {
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
    expect(JSON.parse(result.body)).toStrictEqual({
      code: 'CATALOG_REQUEST_REJECTED',
      message: 'Not authorized',
    });
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
      expect(JSON.parse(result.body)).toStrictEqual({
        code: 'CATALOG_REQUEST_REJECTED',
        message: 'Not authorized',
      });
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

  it('NET-NEW — no refusal carries a WWW-Authenticate header or names any scheme', () => {
    const probe = makeHandler(undefined, []);
    const result = probe.handler.getOptionsForSelect(optionsBodyEvent('{"options":[]}'));

    expect(result.headers).toStrictEqual({ 'Content-Type': 'application/json' });
    expect(result.body).not.toMatch(/bearer|basic|scheme|token/i);
  });

  it('NET-NEW — every routed member carries a requirement, and the matrix is frozen through and through', () => {
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
