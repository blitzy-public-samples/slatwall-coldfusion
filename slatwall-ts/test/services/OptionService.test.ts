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
import {
  SMARTLIST_DISTINCT_ASYMMETRY,
  SmartListQueryBuilder,
} from '../../src/adapters/mysql/SmartListQueryBuilder';
import { OptionService } from '../../src/services/OptionService';
import type { Option } from '../../src/domain/option/Option';
import type { OptionGroup } from '../../src/domain/option/OptionGroup';

/* MIN-01 — the fanning cases below call `builder.execute(FANNING_QUERY)` with no element type, because
 * the port derives it from the query's root entity. This alias is what makes that derivation a checked
 * claim here: it stops compiling if `SlatwallOptionGroup` ever stops yielding an `OptionGroup`. */
type AssertAssignable<TActual extends TExpected, TExpected> = TActual;
type _OptionGroupRootYieldsOptionGroup = AssertAssignable<
  SmartListRecord<'SlatwallOptionGroup'>,
  OptionGroup
>;
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
import type {
  BoundedReadResult,
  BoundedReadWindow,
} from '../../src/ports/repositories/BoundedRead';
import type { SmartListQuery, SmartListRecord } from '../../src/ports/SmartListQueryPort';
import type { SelectOption } from '../../src/services/OptionService';

/** Stands in for the option repository, which none of these cases reaches. */
const UNREACHED_COLLABORATOR = {} as never;

/**
 * No injected aggregate loader for ANY root, so the builder's OWN association hydrator runs.
 *
 * The two mechanisms are exclusive per root: `SmartListQueryBuilder` consults `aggregateLoaders` first
 * and reaches `hydrateAssociations` only where the entry is `undefined`. It is that built-in hydrator
 * these suites assert, because their executors route on the `smartListAssociationOwnerKey` alias, which
 * ONLY it emits — an injected loader composes a plain `WHERE ... IN (...)` projection instead, so
 * handing one in here would silently retarget the assertion rather than strengthen it.
 *
 * `SlatwallOptionGroup` takes this same path in production: `createCatalogAggregateLoaders` leaves it
 * `undefined`, because `model/entity/OptionGroup.cfc` declares no many-to-one and its `options`
 * collection is the inverse side.
 */
const NO_INJECTED_AGGREGATE_LOADERS = {
  SlatwallSku: undefined,
  SlatwallProduct: undefined,
  SlatwallProductType: undefined,
  SlatwallBrand: undefined,
  SlatwallOption: undefined,
  SlatwallOptionGroup: undefined,
  SlatwallAlternateSkuCode: undefined,
} as const;

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

/**
 * Captures the composed query instead of executing it, so the description can be asserted.
 *
 * BOTH EXECUTION MEMBERS ARE PRESENT, pushing into the same log in call order. The service selects
 * `executeRecords` for the two members that return only a collection — `getOptionGroupsForProduct` and
 * `getOptionsForProductByOptionGroup`, relocated out of `model/entity/Product.cfc:L258` and `:L346`,
 * both of which read `getRecords()` alone — and `execute` for the two smart-list members that return
 * all three views. Doubling only one of them would make this harness answer `undefined` for whichever
 * member the service chose next, so it is doubled for the port rather than for today's call sites.
 */
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
    executeRecords: (query: SmartListQuery): Promise<unknown[]> => {
      queries.push(query);
      return Promise.resolve([]);
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
      /* ⛔ P9 — THE BOUNDED DOUBLES DO NOT DELEGATE TO THEIR UNBOUNDED SIBLINGS, AND MUST NOT. Slicing
       * an unbounded answer here would model a collaborator production does not have: the real bounded
       * members push the window into the STATEMENT, so a double that read everything and then trimmed
       * would let a test pass that the adapter could not. They record the window they were handed and
       * answer with a fixed shape, which is what makes the handler's forwarding observable. */
      getUnusedProductOptionsBounded: (
        window: BoundedReadWindow,
        productID: string,
        existingOptionGroupIDList: string,
      ): Promise<BoundedReadResult<SelectOption>> => {
        serviceCalls.push('getUnusedProductOptionsBounded');
        forwarded.push([window, productID, existingOptionGroupIDList]);
        return Promise.resolve({
          rows: [{ name: 'Group - Option', value: 'option-1' }],
          hasMore: true,
        });
      },
      getUnusedProductOptionGroupsBounded: (
        window: BoundedReadWindow,
        existingOptionGroupIDList: string,
      ): Promise<BoundedReadResult<SelectOption>> => {
        serviceCalls.push('getUnusedProductOptionGroupsBounded');
        forwarded.push([window, existingOptionGroupIDList]);
        return Promise.resolve({ rows: [{ name: 'Group', value: 'group-1' }], hasMore: false });
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
      'getUnusedProductOptionGroupsBounded',
      'getUnusedProductOptions',
      'getUnusedProductOptionsBounded',
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

    /* ⭐ P9 — EACH BOUNDED ROUTE CARRIES THE SAME REQUIREMENT AS ITS UNBOUNDED ORIGINAL, ASSERTED BY
     * COMPARING THE TWO ROWS RATHER THAN BY RESTATING A LITERAL. Written this way, a future change to
     * either classification cannot silently open a looser second door: the pair must move together or
     * this fails. A bound narrows how many rows arrive, never which, so it is not a reason to relax the
     * gate. */
    expect(OPTION_ACCESS_MATRIX.getUnusedProductOptionsBounded).toStrictEqual(
      OPTION_ACCESS_MATRIX.getUnusedProductOptions,
    );
    expect(OPTION_ACCESS_MATRIX.getUnusedProductOptionGroupsBounded).toStrictEqual(
      OPTION_ACCESS_MATRIX.getUnusedProductOptionGroups,
    );

    expect(Object.isFrozen(OPTION_ACCESS_MATRIX)).toBe(true);
    for (const requirement of Object.values(OPTION_ACCESS_MATRIX)) {
      expect(Object.isFrozen(requirement)).toBe(true);
    }
  });

  it('NET-NEW — AAP §0.4.2.5 — the four synthesized members are still unroutable', () => {
    const probe = makeHandler(account({}), ['read']);

    // The gate did not become a reason to expose them, and judgment (a) still holds. The two P9 bounded
    // routes are companions of DECLARED members, not newly routed synthesized ones.
    expect(Object.keys(probe.handler).sort()).toStrictEqual([
      'getOptionsForSelect',
      'getUnusedProductOptionGroups',
      'getUnusedProductOptionGroupsBounded',
      'getUnusedProductOptions',
      'getUnusedProductOptionsBounded',
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

/* ==================================================================================================
 * F-05 — RELATIONSHIP HYDRATION, DRIVEN THROUGH THE REAL SMART-LIST ADAPTER
 * ==================================================================================================
 * `OptionService.getOption` and `getOptionGroup` are synthesized CRUD members (IR-1) and both resolve
 * through the smart-list port, so the SmartList path is where their relationships have to be loaded.
 *
 * ⚠️ THESE TESTS DELIBERATELY DO **NOT** USE A SMART-LIST DOUBLE. The review's fifth Area of Concern is
 * that the test-support layer can model correct relationships while the production adapter does not, so a
 * double would report success no matter what the adapter did. Instead a real
 * {@link SmartListQueryBuilder} is constructed over a one-method SQL executor double, which means the
 * production statement composition, the production row mappers and the production hydrator all run.
 *
 * The executor routes on the owner-key alias, which only an association statement carries, and on the
 * count alias — so the routing itself asserts that a SECOND statement is issued at all.
 * ================================================================================================== */
describe('OptionService — F-05 relationship hydration through SmartListQueryBuilder', () => {
  const OPTION_GROUP_ROW = {
    optionGroupID: 'grp-1',
    optionGroupName: 'Size',
    optionGroupCode: 'size',
    imageGroupFlag: 1,
    sortOrder: 1,
  };

  /**
   * Routes statements by shape. `association` rows answer any statement carrying the owner-key alias,
   * `entity` rows answer the base record statements, and the count statement is answered from the entity
   * row count.
   */
  function makeBuilder(
    entityRows: readonly Record<string, unknown>[],
    associationRows: readonly Record<string, unknown>[],
  ): { readonly builder: SmartListQueryBuilder; readonly statements: string[] } {
    const statements: string[] = [];
    const executor = {
      execute: (sql: string): Promise<Record<string, unknown>[]> => {
        statements.push(sql);
        if (sql.includes('smartListAssociationOwnerKey')) {
          return Promise.resolve([...associationRows]);
        }
        if (sql.includes('recordsCount')) {
          return Promise.resolve([{ recordsCount: entityRows.length }]);
        }
        return Promise.resolve([...entityRows]);
      },
    } as never;
    return {
      builder: new SmartListQueryBuilder(executor, NO_INJECTED_AGGREGATE_LOADERS),
      statements,
    };
  }

  it('NET-NEW — getOption hydrates optionGroup, and a SECOND statement is issued to do it', async () => {
    const { builder, statements } = makeBuilder(
      [{ optionID: 'opt-1', optionName: 'Small', optionCode: 'sm', sortOrder: 1 }],
      [{ smartListAssociationOwnerKey: 'opt-1', ...OPTION_GROUP_ROW }],
    );
    const service = new OptionService(UNREACHED_COLLABORATOR, builder);

    const option = await service.getOption('opt-1');

    // Before F-05 this was `undefined`: `model/entity/Option.cfc:L59` declares the relationship and the
    // row mapper deliberately leaves it unresolved (RULE 3), so nothing filled it.
    expect(option?.optionGroup).toBeDefined();
    expect(option?.optionGroup?.optionGroupID).toBe('grp-1');
    expect(option?.optionGroup?.optionGroupName).toBe('Size');
    // The chain `Sku.hasOneOptionPerOptionGroup` walks — `model/entity/Sku.cfc:L772-L784`. The port
    // reads the FIELD rather than an accessor: `Option` declares `setOptionGroup` but no
    // `getOptionGroup`, because the CFML accessor is one the ORM synthesizes.
    expect(option?.optionGroup?.optionGroupID).toBe('grp-1');
    expect(statements.some((sql) => sql.includes('smartListAssociationOwnerKey'))).toBe(true);
  });

  it('NET-NEW — a NULL foreign key leaves optionGroup ABSENT rather than stubbed', async () => {
    // `SwOption.optionGroupID` has no `notnull` in the mapping, so this row is possible. RULE 3 forbids a
    // stub precisely because `option.getOptionGroup().getImageGroupFlag()` would read a class default off
    // one, so the association must be absent — not an object answering `false`.
    const { builder } = makeBuilder(
      [{ optionID: 'opt-1', optionName: 'Small', optionCode: 'sm', sortOrder: 1 }],
      [],
    );
    const service = new OptionService(UNREACHED_COLLABORATOR, builder);

    const option = await service.getOption('opt-1');

    expect(option).not.toBeNull();
    expect(option?.optionGroup).toBeUndefined();
  });

  it("NET-NEW — getOptionGroup hydrates options in the declared sortOrder, and sets each option's group back", async () => {
    // `model/entity/OptionGroup.cfc:L70` declares `orderby="sortOrder"`, so ORDER IS BEHAVIOUR here —
    // unlike `Sku.options`, which declares no `orderby` at all. The statement asks the database for that
    // order, so the rows arrive in it; this asserts the collection preserves what it was given.
    const { builder } = makeBuilder(
      [OPTION_GROUP_ROW],
      [
        {
          smartListAssociationOwnerKey: 'grp-1',
          optionID: 'opt-a',
          optionName: 'Small',
          optionCode: 'sm',
          sortOrder: 1,
        },
        {
          smartListAssociationOwnerKey: 'grp-1',
          optionID: 'opt-b',
          optionName: 'Medium',
          optionCode: 'md',
          sortOrder: 2,
        },
      ],
    );
    const service = new OptionService(UNREACHED_COLLABORATOR, builder);

    const group = await service.getOptionGroup('grp-1');

    // The D14 site indexes `options[1]` — `model/service/ProductService.cfc:L115-L119`. With an empty
    // collection that defect is not even reproducible, which is why this assertion is on the ORDER and
    // not merely on the length.
    expect(group?.options.map((option) => option.optionID)).toEqual(['opt-a', 'opt-b']);
    // Both directions consistent, as one Hibernate session would give — and by REFERENCE, so the
    // identity map is what is being asserted, not a value copy.
    expect(group?.options[0]?.optionGroup).toBe(group);
    expect(group?.options[1]?.optionGroup).toBe(group);
  });

  it('NET-NEW — two options of one group share ONE OptionGroup instance (the identity map)', async () => {
    // One instance per identifier per read is what a single Hibernate session gives, and it is what makes
    // `===` between two references to the same row meaningful. Two separate instances would also mean
    // `manageEntity` had been called twice for one row, which installs a FRESH error bag and discards
    // anything already accumulated.
    const { builder } = makeBuilder(
      [
        { optionID: 'opt-1', optionName: 'Small', optionCode: 'sm', sortOrder: 1 },
        { optionID: 'opt-2', optionName: 'Medium', optionCode: 'md', sortOrder: 2 },
      ],
      [
        { smartListAssociationOwnerKey: 'opt-1', ...OPTION_GROUP_ROW },
        { smartListAssociationOwnerKey: 'opt-2', ...OPTION_GROUP_ROW },
      ],
    );
    const service = new OptionService(UNREACHED_COLLABORATOR, builder);

    const result = await service.getOptionSmartList();

    expect(result.records).toHaveLength(2);
    const [first, second] = result.records;
    expect(first?.optionGroup).toBeDefined();
    expect(first?.optionGroup).toBe(second?.optionGroup);
  });
});

/* ==================================================================================================
 * F-20 — COUNT AND RECORDS UNDER A FANNING JOIN
 * ==================================================================================================
 *
 * WHY THESE CASES EXIST. The review's F-20 asks that the count/records behaviour under fan-out joins
 * keep EXPLICIT tests while the three-statement decision stays open for the sibling performance pass.
 * Before this block nothing asserted it: the harness above answers the counting statement from
 * `entityRows.length`, which is the INFERRED count the port deliberately refuses
 * (`org/Hibachi/HibachiSmartList.cfc:L783-L785`), so it could not have detected the real semantics
 * either way.
 *
 * WHY THIS FILE AND NOT A NEW ONE. AAP §0.4.1.12 declares no `SmartListQueryBuilder` test file, and
 * NF1 forbids creating a file the AAP does not declare. This file already constructs a REAL
 * `SmartListQueryBuilder` over a one-method executor double, and `OptionGroup.options`
 * (`model/entity/OptionGroup.cfc:L70`) is a genuine one-to-many inside the in-scope slice — so the
 * fan-out is modelled with real in-scope metadata rather than an invented relationship.
 *
 * WHY THE QUERY IS BUILT DIRECTLY. `SmartListInput` declares no join member and no distinct flag, so
 * `getOptionGroupSmartList` cannot express a fanning join — which is the same gap that member's own S8
 * note records. Building `SmartListQuery` directly is what the two relocated product queries in
 * `src/services/OptionService.ts` do for exactly this reason.
 * ================================================================================================ */
describe('SmartListQueryBuilder — F-20 count and records under a fanning join', () => {
  /** One group row, repeated by the join to model the fan-out. */
  const FANNED_GROUP_ROW = {
    optionGroupID: 'grp-fan',
    optionGroupName: 'Size',
    optionGroupCode: 'size',
    imageGroupFlag: 1,
    sortOrder: 1,
  };

  /**
   * A smart list over option groups that joins the `options` collection, with the distinct flag LEFT
   * ALONE so it carries `org/Hibachi/HibachiSmartList.cfc:L59`'s seeded false.
   */
  const FANNING_QUERY: SmartListQuery<'SlatwallOptionGroup'> = {
    entityName: 'SlatwallOptionGroup',
    joins: [{ parentEntityName: 'SlatwallOptionGroup', relatedProperty: 'options' }],
    /*
     * ⚠️ THE PAGE IS DELIBERATELY NARROWER THAN THE ROW COUNT, AND THE CASES BELOW DEPEND ON IT.
     * The builder no longer issues the paged statement when the page window already covers every row
     * it read: `pageRecordsStart === 1 && recordCount <= pageRecordsShow` takes the unpaged collection
     * as the page and skips the round trip. With the legacy default of ten
     * (`org/Hibachi/HibachiSmartList.cfc:L39`) the three fanned rows would be covered, so the paged
     * statement these cases inspect would never be emitted. Asking for two of three rows puts the read
     * back on the three-statement path, which is what the SQL assertions below are about — the shape of
     * each statement, not how many the builder chose to issue. The elision itself is pinned by its own
     * case at the foot of this block, so both behaviours are asserted rather than one masking the other.
     */
    pagination: { pageRecordsShow: 2 },
  };

  /** The same fan-out with the paging left alone, so the page window covers all three rows. */
  const FANNING_QUERY_WHOLE_PAGE: SmartListQuery<'SlatwallOptionGroup'> = {
    entityName: 'SlatwallOptionGroup',
    joins: [{ parentEntityName: 'SlatwallOptionGroup', relatedProperty: 'options' }],
  };

  /**
   * Answers the three base statements plus the association statement, and records every statement in
   * issue order. The counting statement answers `1` — the distinct total — while the record statements
   * answer three rows, which is what a fanning join returns for one group with three options.
   */
  function makeFanningBuilder(options?: {
    readonly materialisationBudget?: { readonly maximumRecordsPerQuery: number };
    readonly recordsCount?: number;
  }): {
    readonly builder: SmartListQueryBuilder;
    readonly statements: string[];
  } {
    const statements: string[] = [];
    const countedTotal = options?.recordsCount ?? 1;
    const executor = {
      execute: (sql: string): Promise<Record<string, unknown>[]> => {
        statements.push(sql);
        if (sql.includes('smartListAssociationOwnerKey')) {
          return Promise.resolve([]);
        }
        if (sql.includes('recordsCount')) {
          return Promise.resolve([{ recordsCount: countedTotal }]);
        }
        return Promise.resolve([
          { ...FANNED_GROUP_ROW },
          { ...FANNED_GROUP_ROW },
          { ...FANNED_GROUP_ROW },
        ]);
      },
    } as never;
    return {
      builder: new SmartListQueryBuilder(
        executor,
        NO_INJECTED_AGGREGATE_LOADERS,
        options?.materialisationBudget,
      ),
      statements,
    };
  }

  /*
   * ===================================================================================================
   * SEC-12 — THE MATERIALISATION BUDGET, WHICH ARRIVED WITH NO TEST OF ITS OWN
   * ===================================================================================================
   * The remediation that introduced the budget declared it verified but shipped no case exercising it,
   * and it also arrived as a REQUIRED constructor parameter. Both are addressed here. The parameter is
   * now OPTIONAL, because three separate reviews reached the same verdict on these ceilings — that a
   * required finite budget converts work the legacy performs into a bounded FAILURE, which AAP §0.6.7.7
   * licenses for D18 alone and §0.8.2 guideline 4 forbids as enhancement beyond the migration's need.
   *
   * ⚠️ ONLY THE PAIR BELOW PINS THE RESOLUTION. The refusal case alone would still pass if the budget
   * had stayed mandatory, and the parity case alone would still pass if the gate had been deleted
   * outright. Together they say: absent means unbounded, present means fail-closed.
   */
  describe('SmartListQueryBuilder — SEC-12 materialisation budget', () => {
    it('NET-NEW — SEC-12: with NO budget wired, a query materialises whatever it matches', async () => {
      /*
       * The parity default, and the reason the parameter is optional. `org/Hibachi/HibachiSmartList.cfc`
       * states no maximum anywhere, so an unwired builder behaves exactly as it did before the budget
       * existed — here a counted total far above any figure this suite would ever configure, materialised
       * without complaint.
       */
      const { builder, statements } = makeFanningBuilder({ recordsCount: 1_000_000 });

      const result = await builder.execute(FANNING_QUERY);

      expect(result.recordsCount).toBe(1_000_000);
      expect(result.records).toHaveLength(3);
      expect(statements).toHaveLength(4);
    });

    it('NET-NEW — SEC-12: an over-budget query is REFUSED after the count and before any row is read', async () => {
      /*
       * The gate's whole value is WHERE it sits. The count returns one row whatever the catalog holds,
       * so it is safe to issue first; the refusal then happens with exactly ONE statement spent and the
       * unbounded record statement never composed. Asserting the statement count is what proves the
       * ordering — a gate placed after the record read would leave two statements behind and would have
       * already materialised the collection it exists to prevent.
       */
      const { builder, statements } = makeFanningBuilder({
        recordsCount: 5,
        materialisationBudget: { maximumRecordsPerQuery: 4 },
      });

      await expect(builder.execute(FANNING_QUERY)).rejects.toThrow(
        /matched more records than the configured materialisation budget admits/,
      );

      expect(statements).toHaveLength(1);
      expect(statements[0]).toContain('recordsCount');
    });

    it('NET-NEW — SEC-12: a query exactly AT the budget is admitted, so the bound is not off by one', async () => {
      const { builder, statements } = makeFanningBuilder({
        recordsCount: 4,
        materialisationBudget: { maximumRecordsPerQuery: 4 },
      });

      const result = await builder.execute(FANNING_QUERY);

      expect(result.recordsCount).toBe(4);
      expect(statements).toHaveLength(4);
    });

    it('NET-NEW — SEC-12: a mis-wired budget is refused when the graph is built, not on first use', () => {
      /*
       * Fail fast at construction, for the reason the constructor records: a `NaN` comparison would
       * silently admit EVERY query and leave the finding open, so a wiring error must not be allowed to
       * surface later as a data error.
       */
      for (const maximumRecordsPerQuery of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() =>
          makeFanningBuilder({ materialisationBudget: { maximumRecordsPerQuery } }),
        ).toThrow(/materialisation budget must be a positive safe integer/);
      }

      /* A sane figure constructs cleanly, so the guard is not simply rejecting everything. */
      expect(() =>
        makeFanningBuilder({ materialisationBudget: { maximumRecordsPerQuery: 1 } }),
      ).not.toThrow();
    });
  });

  it('NET-NEW — F-20: the record projection is NOT distinct while the count ALWAYS is', async () => {
    // `org/Hibachi/HibachiSmartList.cfc:L502` counts `count(distinct ...)` unconditionally, while the
    // record branch at `:L505-L521` consults a flag seeded false at `:L59`. Both rules are asserted
    // here, on the emitted SQL, because the asymmetry is the legacy's and may not be normalised away.
    const { builder, statements } = makeFanningBuilder();

    await builder.execute(FANNING_QUERY);

    /*
     * ⚠️ THE COUNT IS STATEMENT ZERO, AND THAT ORDER IS SEC-12's. The count is hoisted above both row
     * statements so an over-budget query can be refused before the unbounded collection is read — see
     * `SmartListQueryBuilder.execute`. The hoist does not change the count's VALUE, because this port
     * always issues the dedicated counting statement and never infers a total from a materialised
     * length; it is also the legacy branch on which that dedicated statement is the one that runs
     * [`org/Hibachi/HibachiSmartList.cfc:L783-L785`]. The shape assertions below are unchanged.
     */
    const [countSql, recordsSql, pageRecordsSql] = statements;
    expect(recordsSql).toMatch(/^SELECT [A-Za-z0-9_]+\.\*/);
    expect(recordsSql).not.toContain('DISTINCT');
    expect(countSql).toMatch(
      /^SELECT COUNT\(DISTINCT [A-Za-z0-9_]+\.optionGroupID\) AS recordsCount/,
    );
    // The fan-out really is present — without the join there would be nothing to be distinct about.
    expect(recordsSql).toContain('JOIN SwOption ');
    expect(pageRecordsSql).toContain('JOIN SwOption ');
    // The declared contract, asserted so a future edit to either composer trips a test rather than
    // silently aligning the two branches.
    expect(SMARTLIST_DISTINCT_ASYMMETRY).toStrictEqual({
      recordProjectionHonoursFlag: true,
      countProjectionIsAlwaysDistinct: true,
    });
  });

  it('NET-NEW — F-20: the fanned record count and the distinct total DISAGREE, and the counted total wins', async () => {
    // This is the numeric consequence `meta/tests/unit/IssuesTest.cfc:L73-L89` (`issue_1296`) is
    // sensitive to: three rows for one group. The port reports the COUNTED total rather than inferring
    // it from the array, which is the ambiguity `org/Hibachi/HibachiSmartList.cfc:L783-L785` leaves
    // open and `src/ports/SmartListQueryPort.ts` resolves.
    const { builder } = makeFanningBuilder();

    const result = await builder.execute(FANNING_QUERY);

    expect(result.records).toHaveLength(3);
    expect(result.recordsCount).toBe(1);
    // One instance per identifier per read — the three fanned rows are the SAME object, not three.
    const [first, second, third] = result.records;
    expect(first).toBe(second);
    expect(first).toBe(third);
  });

  it('NET-NEW — F-20: THREE base statements are issued, in order, on one executor', async () => {
    // The eager three-statement shape, pinned so the open performance-pass review item cannot be
    // resolved by accident. The unpaged projection carries no bound, the paged one carries the
    // legacy's own offset/maximum pair from `:L762`, and the count carries neither bound nor ordering.
    const { builder, statements } = makeFanningBuilder();

    await builder.execute(FANNING_QUERY);

    /* Count first (SEC-12's gate order), then the two row statements, then the association pass. */
    const [countSql, recordsSql, pageRecordsSql] = statements;
    expect(recordsSql).not.toContain('LIMIT');
    expect(pageRecordsSql).toContain('LIMIT ? OFFSET ?');
    expect(countSql).not.toContain('LIMIT');
    expect(countSql).not.toContain('ORDER BY');
    // Three base statements, then the association statement the F-05 hydrator adds.
    expect(statements).toHaveLength(4);
    expect(statements[3]).toContain('smartListAssociationOwnerKey');
  });

  it('NET-NEW — F-20: when the page covers every record the paged statement is NOT issued', async () => {
    /*
     * The other half of the three-statement question, and the reason the fixture above asks for a
     * narrow page. When the first page already covers every row the unpaged statement returned, the
     * paged statement can only return those same rows in that same order, so it is not issued and the
     * unpaged collection IS the page. The compiled statement is unaffected — `build` still composes it
     * with its bound `LIMIT ? OFFSET ?` — which is what keeps the case above able to inspect it.
     *
     * Asserted here so neither behaviour can regress silently: the shape assertions above would still
     * pass if the elision were removed, and this one would still pass if the page were always elided,
     * so only the pair pins both.
     */
    const { builder, statements } = makeFanningBuilder();

    const result = await builder.execute(FANNING_QUERY_WHOLE_PAGE);

    // Records, count, association — and no paged statement between the first two.
    expect(statements).toHaveLength(3);
    /* Count, then the unpaged records, then the association pass — no paged statement anywhere. */
    expect(statements[0]).toContain('recordsCount');
    expect(statements[1]).not.toContain('LIMIT');
    expect(statements[2]).toContain('smartListAssociationOwnerKey');
    for (const sql of statements) {
      expect(sql).not.toContain('OFFSET');
    }

    // The page IS the unpaged collection, by identity — not a second array holding equal values.
    expect(result.pageRecords).toBe(result.records);
    // The paging figures still come from the COUNTED total, never inferred from the fanned rows.
    expect(result.recordsCount).toBe(1);
  });
});
