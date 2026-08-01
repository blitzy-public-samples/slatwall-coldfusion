/**
 * `brandHandler` — the authorization gate in front of the Brand boundary, and the projection it answers
 * with instead of the entity.
 *
 * AAP authority: the AAP §0.4.4 wildcard row authorises `slatwall-ts/test/**` | CREATE. The suite sits
 * beside `test/handlers/skuHandler.test.ts` and `test/handlers/productHandler.test.ts`, so every Lambda
 * boundary that has coverage is covered in the same place. `test/services/BrandService.test.ts` keeps the
 * SERVICE matrix — the slug pipeline, the collision-suffix sequence, `saveBrand`'s two-part guard,
 * `newBrand`, `getBrand` and `deleteBrand` — and this file keeps the BOUNDARY matrix; neither duplicates
 * the other.
 *
 * =============================================================================================
 * WHAT IS UNDER TEST
 * =============================================================================================
 *   - THE GATE. `src/handlers/brandHandler.ts` refuses before it reads a body and before it reads an
 *     identifier, so a refusal can neither report a body problem nor act as an existence oracle. The
 *     three-way outcome asserted here is the legacy's: no principal is 401, a logged-in principal without
 *     permission is 403, and a permitted principal reaches the service. `getLoggedInFlag()` is the
 *     NEGATION of `isNew()` [org/Hibachi/HibachiScope.cfc:L40-L45], which is why the admitted principal
 *     is the one whose `newFlag` is false.
 *   - THE CRUD QUESTION EACH MEMBER ASKS. `save` asks `create` first and then `update`, short-circuiting
 *     on the first grant [org/Hibachi/HibachiAuthenticationService.cfc:L71-L77]; every other member asks
 *     for its own crudType and only that one [:L55-L58].
 *   - THE PROJECTION. The response carries exactly the six persistent members a caller asked for. None of
 *     the eight relationship collections [model/entity/Brand.cfc:L60-L71] and neither `remoteID` nor the
 *     audit members [:L75-L80] reach the body, an unset optional member is OMITTED rather than published
 *     as null, and `deleteBrand` still answers the boolean verdict, which is not an entity at all.
 *
 * TEST PROVENANCE: every case below is **NET-NEW**. AAP §0.6.5.2 verified that no legacy
 * `BrandServiceTest` exists, and that the legacy suite contains no controller test of any kind. The
 * legacy signal for the brand slice is `meta/tests/unit/entity/BrandTest.cfc`, which is an ENTITY test and
 * is already carried in `test/domain/Brand.test.ts`. Nothing in this file extends a legacy assertion, and
 * none is labelled as though it did.
 *
 * WHAT THIS FILE DOES NOT COVER: `src/handlers/router.ts` does not exist yet, so nothing here asserts how
 * a route string reaches a member; and the URL-title probe sequence is asserted in the service suite, not
 * through the boundary. Stating that is preferable to implying a completeness this file does not have.
 */
import { BRAND_ENTITY_METADATA, Brand } from '../../src/domain/product/Brand';
import { manageEntity } from '../../src/domain/base/populate';
import { Product } from '../../src/domain/product/Product';
import { BRAND_ACCESS_MATRIX, createBrandHandler } from '../../src/handlers/brandHandler';
import type { ManagedBrand } from '../../src/services/BrandService';
import type {
  BrandAuthorizationEvent,
  BrandHandler,
  BrandHandlerService,
  BrandIdentifierEvent,
  BrandSaveEvent,
} from '../../src/handlers/brandHandler';
import type {
  AccountReference,
  EntityAuthorizationRequest,
  RequestAuthorizationResolver,
} from '../../src/ports/AccountContextPort';

/**
 * A principal, defaulting to the one shape the gate admits: logged in, non-admin, no groups needed.
 *
 * `newFlag: false` is the DEFAULT because `getLoggedInFlag()` is the NEGATION of `isNew()`
 * [org/Hibachi/HibachiScope.cfc:L40-L45] — so "logged in" is "not new", and a case that wants the
 * refused principal has to say `newFlag: true` explicitly.
 */
function account(overrides: Partial<AccountReference>): AccountReference {
  return {
    accountID: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    newFlag: false,
    adminAccountFlag: false,
    ...overrides,
  };
}

/** The identifier-addressed event slice, with the headers container the resolver is handed. */
function identifierEvent(brandID: string): BrandIdentifierEvent {
  return { pathParameters: { brandID }, headers: {} };
}

/** The save event slice. No identifier is addressed, so the save is a creation. */
function saveEvent(body: string): BrandSaveEvent {
  return { body, pathParameters: null, headers: {} };
}

describe('brandHandler — SEC-03, the gate `setupRequest()` ran', () => {
  interface Probe {
    /** Every entity question asked, in the order asked, so the legacy sequence is observable. */
    readonly asked: EntityAuthorizationRequest[];
    /** How many times the resolver was invoked, so per-request resolution is observable. */
    readonly resolutions: { count: number };
    /** Every service member reached, so "refused before the service" is observable. */
    readonly serviceCalls: string[];
    readonly handler: BrandHandler;
  }

  /**
   * @param account   the principal the resolver reports, or `undefined` for "no principal at all"
   * @param grant     the entity CRUD types the permission model grants
   */
  function makeHandler(account: AccountReference | undefined, grant: readonly string[]): Probe {
    const asked: EntityAuthorizationRequest[] = [];
    const resolutions = { count: 0 };
    const serviceCalls: string[] = [];

    const stored = managedBrand();
    stored.brandID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    stored.brandName = 'Stored Brand';
    stored.brandWebsite = 'https://example.com';
    stored.urlTitle = 'stored-brand';
    stored.activeFlag = true;
    stored.publishedFlag = false;
    stored.remoteID = 'REMOTE-1';
    stored.createdByAccount = 'account-1';
    stored.modifiedByAccount = 'account-2';

    const service: BrandHandlerService = {
      saveBrand: (brand: ManagedBrand): Promise<ManagedBrand> => {
        serviceCalls.push('saveBrand');
        return Promise.resolve(brand);
      },
      newBrand: (): ManagedBrand => {
        serviceCalls.push('newBrand');
        return stored;
      },
      getBrand: (): Promise<ManagedBrand | null> => {
        serviceCalls.push('getBrand');
        return Promise.resolve(stored);
      },
      deleteBrand: (): Promise<boolean> => {
        serviceCalls.push('deleteBrand');
        return Promise.resolve(true);
      },
    };

    const resolve: RequestAuthorizationResolver<BrandAuthorizationEvent> = () => {
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

    return { asked, resolutions, serviceCalls, handler: createBrandHandler(service, resolve) };
  }

  it('NET-NEW — org/Hibachi/HibachiAuthenticationService.cfc:L83 — NO principal refuses all three with 401', async () => {
    const probe = makeHandler(undefined, ['create', 'read', 'update', 'delete']);

    const results = [
      await probe.handler.getBrand(identifierEvent('any-id')),
      await probe.handler.saveBrand(saveEvent('{}')),
      await probe.handler.deleteBrand(identifierEvent('any-id')),
    ];

    for (const result of results) {
      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body)).toStrictEqual({ message: 'Authentication is required' });
    }

    // Refused BEFORE the service, so nothing was read, saved or deleted.
    expect(probe.serviceCalls).toStrictEqual([]);
    // And refused before any permission question, because there was no principal to ask about.
    expect(probe.asked).toStrictEqual([]);
  });

  it('NET-NEW — HibachiScope.cfc:L40-L45 — the logged-in test is the NEGATION of newFlag', async () => {
    // `getLoggedInFlag()` is `if(!getSession().getAccount().isNew())`, and `newFlag` carries
    // `isNew()`. A principal that is NEW is therefore NOT logged in.
    const notLoggedIn = makeHandler(account({ newFlag: true }), ['read']);
    expect((await notLoggedIn.handler.getBrand(identifierEvent('x'))).statusCode).toBe(401);
    expect(notLoggedIn.serviceCalls).toStrictEqual([]);

    // Inverting the predicate would have admitted exactly this caller and refused the next one.
    const loggedIn = makeHandler(account({ newFlag: false }), ['read']);
    expect((await loggedIn.handler.getBrand(identifierEvent('x'))).statusCode).toBe(200);
  });

  it('NET-NEW — L43-L49 — a logged-in principal without permission gets 403, not 401 and not 200', async () => {
    const probe = makeHandler(account({}), []);

    const results = [
      await probe.handler.getBrand(identifierEvent('x')),
      await probe.handler.saveBrand(saveEvent('{}')),
      await probe.handler.deleteBrand(identifierEvent('x')),
    ];

    for (const result of results) {
      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body)).toStrictEqual({ message: 'Not authorized' });
    }

    expect(probe.serviceCalls).toStrictEqual([]);
  });

  it('NET-NEW — L55-L58 — each member asks for its OWN legacy crudType and only that one', async () => {
    const read = makeHandler(account({}), []);
    await read.handler.getBrand(identifierEvent('x'));
    expect(read.asked).toStrictEqual([{ crudType: 'read', entityName: 'Brand' }]);

    const remove = makeHandler(account({}), []);
    await remove.handler.deleteBrand(identifierEvent('x'));
    expect(remove.asked).toStrictEqual([{ crudType: 'delete', entityName: 'Brand' }]);
  });

  it('NET-NEW — L71-L77 — save asks create FIRST, then update, and short-circuits on the first grant', async () => {
    const neither = makeHandler(account({}), []);
    expect((await neither.handler.saveBrand(saveEvent('{}'))).statusCode).toBe(403);
    expect(neither.asked.map((request) => request.crudType)).toStrictEqual(['create', 'update']);

    // `if(createOK) { return true; }` at :L73-L75 means `update` is never asked once create grants.
    const createOnly = makeHandler(account({}), ['create']);
    expect((await createOnly.handler.saveBrand(saveEvent('{}'))).statusCode).toBe(200);
    expect(createOnly.asked.map((request) => request.crudType)).toStrictEqual(['create']);

    // And `update` alone still grants, via `return updateOK` at :L77.
    const updateOnly = makeHandler(account({}), ['update']);
    expect((await updateOnly.handler.saveBrand(saveEvent('{}'))).statusCode).toBe(200);
    expect(updateOnly.asked.map((request) => request.crudType)).toStrictEqual(['create', 'update']);
  });

  it('NET-NEW — the resolver is invoked EXACTLY ONCE per request, even for the two-question save', async () => {
    // Two calls would ask the two questions of two separately resolved principals.
    const probe = makeHandler(account({}), ['update']);
    await probe.handler.saveBrand(saveEvent('{}'));
    expect(probe.resolutions.count).toBe(1);
  });

  it('NET-NEW — the gate runs BEFORE the identifier is read, so it is not an existence oracle', async () => {
    const probe = makeHandler(account({}), []);

    const existing = await probe.handler.getBrand(
      identifierEvent('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    );
    const absent = await probe.handler.getBrand(identifierEvent('does-not-exist'));
    const noIdentifierAtAll = await probe.handler.getBrand({ pathParameters: null, headers: {} });

    // Three different addressing outcomes, one indistinguishable refusal.
    expect(existing).toStrictEqual(absent);
    expect(absent).toStrictEqual(noIdentifierAtAll);
    expect(existing.statusCode).toBe(403);
  });

  it('NET-NEW — the gate runs BEFORE the body is read, so a refusal never reports a body problem', async () => {
    const probe = makeHandler(account({}), []);
    const result = await probe.handler.saveBrand({
      body: '<<not json>>',
      pathParameters: null,
      headers: {},
    });

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body)).toStrictEqual({ message: 'Not authorized' });
  });

  it('NET-NEW — no refusal carries a WWW-Authenticate header or names any scheme', async () => {
    const probe = makeHandler(undefined, []);
    const result = await probe.handler.getBrand(identifierEvent('x'));

    expect(result.headers).toStrictEqual({ 'Content-Type': 'application/json' });
    expect(result.body).not.toMatch(/bearer|basic|scheme|token/i);
  });

  it('NET-NEW — newBrand is NOT a member of the routed surface', () => {
    const probe = makeHandler(account({}), ['create']);

    // `admin/views/entity/` carries only detailbrand.cfm and listbrand.cfm — no create or edit view —
    // and `newBrand` had no source declaration at all: `onMissingMethod` fabricated it. It is
    // therefore absent from the frozen result, so `router.ts` has nothing to mount.
    expect(Object.keys(probe.handler).sort()).toStrictEqual([
      'deleteBrand',
      'getBrand',
      'saveBrand',
    ]);
    expect('newBrand' in probe.handler).toBe(false);
  });

  it('NET-NEW — every routed member carries an access classification, and all three are secure', () => {
    // admin/controllers/entity.cfc:L66 declares `this.publicMethods=''`, so not one Brand item is
    // public. The matrix is keyed on `keyof BrandHandler`, so the two sets cannot drift.
    expect(BRAND_ACCESS_MATRIX).toStrictEqual({
      saveBrand: 'secure',
      getBrand: 'secure',
      deleteBrand: 'secure',
    });
    expect(Object.isFrozen(BRAND_ACCESS_MATRIX)).toBe(true);
  });
});

/**
 * A brand carrying the error-surface members the base collaborator needs.
 *
 * `BrandService` and `BrandHandlerService` are both typed over `ManagedBrand` — a `Brand` INTERSECTED
 * with the metadata and error surface `manageEntity` supplies — because `../validation/Validator`
 * calls `getClassName()` and attaches findings to the entity's own bag at run time. A bare `new
 * Brand()` type-checked against those signatures only while the injected view was written in METHOD
 * syntax, which TypeScript compares bivariantly; the view is arrow-typed now, so the substitution is
 * correctly rejected. `manageEntity` augments and RETURNS THE SAME OBJECT, so every assertion below
 * observes the identical instance it would have without this call.
 */
function managedBrand(): ManagedBrand {
  return manageEntity(new Brand(), BRAND_ENTITY_METADATA);
}

describe('brandHandler — SEC-04, the response is a projection and not the entity', () => {
  function handlerReturning(stored: ManagedBrand): BrandHandler {
    const service: BrandHandlerService = {
      saveBrand: (brand: ManagedBrand): Promise<ManagedBrand> => Promise.resolve(brand),
      newBrand: (): ManagedBrand => stored,
      getBrand: (): Promise<ManagedBrand | null> => Promise.resolve(stored),
      deleteBrand: (): Promise<boolean> => Promise.resolve(true),
    };

    return createBrandHandler(service, () => ({
      accountContext: { getCurrentAccount: () => account({}) },
      entityAuthorization: { authenticateEntity: () => true },
    }));
  }

  function fullyPopulatedBrand(): ManagedBrand {
    const brand = managedBrand();
    brand.brandID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    brand.brandName = 'Acme';
    brand.brandWebsite = 'https://acme.example';
    brand.urlTitle = 'acme';
    brand.activeFlag = true;
    brand.publishedFlag = true;
    brand.remoteID = 'ERP-4711';
    brand.createdByAccount = 'account-created';
    brand.modifiedByAccount = 'account-modified';
    brand.createdDateTime = new Date(0);
    brand.modifiedDateTime = new Date(0);
    return brand;
  }

  it('NET-NEW — the body carries exactly the six persistent members a caller asked for', async () => {
    const result = await handlerReturning(fullyPopulatedBrand()).getBrand(identifierEvent('x'));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toStrictEqual({
      brandID: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      brandName: 'Acme',
      brandWebsite: 'https://acme.example',
      urlTitle: 'acme',
      activeFlag: true,
      publishedFlag: true,
    });
  });

  it('NET-NEW — model/entity/Brand.cfc:L75-L80 — remoteID and the audit members never reach the body', async () => {
    const result = await handlerReturning(fullyPopulatedBrand()).getBrand(identifierEvent('x'));
    const body: unknown = JSON.parse(result.body);

    for (const withheld of [
      'remoteID',
      'createdByAccount',
      'modifiedByAccount',
      'createdDateTime',
      'modifiedDateTime',
    ]) {
      expect(Object.prototype.hasOwnProperty.call(body, withheld)).toBe(false);
    }

    expect(result.body).not.toContain('ERP-4711');
    expect(result.body).not.toContain('account-created');
  });

  it('NET-NEW — model/entity/Brand.cfc:L60-L71 — none of the EIGHT relationship collections reaches the body', async () => {
    const result = await handlerReturning(fullyPopulatedBrand()).getBrand(identifierEvent('x'));
    const body: unknown = JSON.parse(result.body);

    // Six of the eight collaborators — promotion rewards and qualifiers with their exclusions,
    // vendors and physical counts — are EXPLICITLY out of scope (AAP §0.2.2.1), so publishing the
    // arrays would disclose structure this deliverable does not even model.
    for (const withheld of [
      'attributeValues',
      'products',
      'promotionRewards',
      'promotionRewardExclusions',
      'promotionQualifiers',
      'promotionQualifierExclusions',
      'vendors',
      'physicals',
    ]) {
      expect(Object.prototype.hasOwnProperty.call(body, withheld)).toBe(false);
    }
  });

  it('NET-NEW — a brand holding a product serializes, where the raw entity would have thrown', async () => {
    const brand = fullyPopulatedBrand();
    const product = new Product();
    product.productID = 'cccccccccccccccccccccccccccccccc';
    brand.addProduct(product);

    // `Brand.products` -> `Product.brand` is a CYCLE that `JSON.stringify` refuses outright, so
    // whole-entity serialization would have produced an opaque 500 for any brand with a product.
    expect(() => JSON.stringify(brand)).toThrow(TypeError);

    const result = await handlerReturning(brand).getBrand(identifierEvent('x'));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).not.toHaveProperty('products');
  });

  it('NET-NEW — an unset optional member is OMITTED rather than published as null', async () => {
    const sparse = managedBrand();
    sparse.brandID = 'dddddddddddddddddddddddddddddddd';

    const result = await handlerReturning(sparse).getBrand(identifierEvent('x'));

    expect(JSON.parse(result.body)).toStrictEqual({ brandID: 'dddddddddddddddddddddddddddddddd' });
    expect(result.body).not.toContain('null');
  });

  it('NET-NEW — deleteBrand still returns the boolean verdict, which is not an entity at all', async () => {
    const result = await handlerReturning(fullyPopulatedBrand()).deleteBrand(identifierEvent('x'));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toBe(true);
  });
});
