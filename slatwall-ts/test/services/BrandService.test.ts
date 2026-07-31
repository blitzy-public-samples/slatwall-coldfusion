/**
 * `BrandService` — the bound on URL-title collision probing, and the suffix sequence it preserves.
 *
 * AAP authority: AAP 0.4.1.12 lists `slatwall-ts/test/services/BrandService.test.ts` | CREATE |
 * "**NET-NEW**", and the AAP 0.4.4 wildcard row authorises `slatwall-ts/test/**` | CREATE.
 *
 * =============================================================================================
 * WHY THE `src/util/urlTitle` CASES LIVE IN A SERVICE TEST FILE
 * =============================================================================================
 * SEC-13's finding site is `src/util/urlTitle.ts`, and a reader would reasonably expect
 * `test/util/urlTitle.test.ts`. No such file is enumerated anywhere in AAP 0.4.1.12, and inventing
 * one would be exactly the un-enumerated addition SCOPE-01 was raised about. This file is the
 * AAP-enumerated home instead, and it is the RIGHT home on the merits rather than merely the
 * permitted one:
 *
 *   - `BrandService.createUniqueBrandUrlTitle` at `src/services/BrandService.ts:700` is the utility's
 *     ONLY production caller anywhere in the subtree, verified by grep.
 *   - `BrandService` is where the `urlTitleAttemptBudget` collaborator is injected, so the budget's
 *     wiring contract belongs to this service's tests.
 *   - The suffix sequence is only observable end-to-end, through the `data.urlTitle` mutation at
 *     `model/service/BrandService.cfc:L70`/`:L72`.
 *
 * The utility is therefore covered twice on purpose: directly, where the probe sequence and the
 * failure shape are cleanest to assert, and through `saveBrand`, which proves the budget actually
 * reaches it and that the derived title lands where the legacy put it.
 *
 * TEST PROVENANCE: every case below is **NET-NEW**. AAP 0.6.5.2 verified that no legacy
 * `BrandServiceTest` exists. The legacy signal for the brand slice is `meta/tests/unit/entity/
 * BrandTest.cfc`, which is an ENTITY test and is already carried in `test/domain/Brand.test.ts`;
 * nothing in this file extends a legacy assertion, and none is labelled as though it did.
 *
 * WHAT THIS FILE DOES NOT COVER: `saveBrand`'s two-part guard, the payload-over-entity name
 * preference and the by-reference mutation are exercised only incidentally, as the vehicle for the
 * SEC-13 assertions. The full `saveBrand` matrix the AAP envisions for this file — and `newBrand`,
 * `getBrand` and `deleteBrand` — remain to be covered. Stating that is preferable to implying a
 * completeness this file does not have.
 */
import { BRAND_ENTITY_METADATA, Brand } from '../../src/domain/product/Brand';
import { manageEntity } from '../../src/domain/base/populate';
import { Product } from '../../src/domain/product/Product';
import { DomainError } from '../../src/errors/DomainError';
import { BRAND_ACCESS_MATRIX, createBrandHandler } from '../../src/handlers/brandHandler';
import { BrandService } from '../../src/services/BrandService';
import type { ManagedBrand } from '../../src/services/BrandService';
import { createUniqueURLTitle } from '../../src/util/urlTitle';
import type { UrlTitleAttemptBudget } from '../../src/util/urlTitle';
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

/** A budget literal, so each case reads as the one number it is varying. */
const budget = (maximumProbes: number): UrlTitleAttemptBudget => ({ maximumProbes });

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

/**
 * A uniqueness probe that reports the first `takenCount` candidates as TAKEN and everything after as
 * free, recording every candidate it was asked about.
 *
 * ⚠ THE POLARITY IS INVERTED FROM THE OBVIOUS READING, matching
 * `model/dao/DataDAO.cfc:L126-L130`: the probe resolves `true` when the candidate is still
 * AVAILABLE. Writing it the intuitive way round produces no compile error and either admits
 * duplicate titles or never terminates.
 */
function probeTaking(takenCount: number): {
  readonly probe: (tableName: string, candidate: string) => Promise<boolean>;
  readonly candidates: string[];
} {
  const candidates: string[] = [];
  let issued = 0;

  return {
    candidates,
    probe: (_tableName: string, candidate: string): Promise<boolean> => {
      candidates.push(candidate);
      issued++;
      return Promise.resolve(issued > takenCount);
    },
  };
}

describe('createUniqueURLTitle — the suffix sequence SEC-13 had to preserve', () => {
  it('NET-NEW — model/service/DataService.cfc:L62 — no collision means one probe and NO suffix', async () => {
    const { probe, candidates } = probeTaking(0);

    await expect(createUniqueURLTitle('My Brand', 'SwBrand', probe, budget(1))).resolves.toBe(
      'my-brand',
    );
    expect(candidates).toEqual(['my-brand']);
  });

  it('NET-NEW — model/service/DataService.cfc:L65 — the FIRST collision suffix is -2, never -1', async () => {
    // The counter is PRE-incremented, so the first suffix skips -1 entirely. AAP 0.4.1.11 calls this
    // out specifically. It is observable output, which is why the bound could not be implemented as
    // an atomic uniqueness strategy that renumbers.
    const { probe, candidates } = probeTaking(1);

    await expect(createUniqueURLTitle('My Brand', 'SwBrand', probe, budget(5))).resolves.toBe(
      'my-brand-2',
    );
    expect(candidates).toEqual(['my-brand', 'my-brand-2']);
  });

  it('NET-NEW — the sequence continues -2, -3, -4 with no gaps', async () => {
    const { probe, candidates } = probeTaking(3);

    await expect(createUniqueURLTitle('My Brand', 'SwBrand', probe, budget(10))).resolves.toBe(
      'my-brand-4',
    );
    expect(candidates).toEqual(['my-brand', 'my-brand-2', 'my-brand-3', 'my-brand-4']);
  });

  it('NET-NEW — the slug transformation is untouched by the bound', async () => {
    const { probe } = probeTaking(0);
    const slug = (input: string): Promise<string> =>
      createUniqueURLTitle(input, 'SwBrand', probe, budget(1));

    await expect(slug('A & B')).resolves.toBe('a-b');
    // Leading and trailing hyphens are RETAINED — the legacy trims whitespace, not punctuation.
    await expect(slug('! Foo')).resolves.toBe('-foo');
    await expect(slug('Foo !')).resolves.toBe('foo-');
    // FOUR hyphens: the two originals survive, and each of the two single-space runs becomes one
    // more. The docblock in `src/util/urlTitle.ts` previously claimed three; it was arithmetically
    // wrong and was corrected rather than left standing.
    await expect(slug('A -- B')).resolves.toBe('a----b');
    // An all-punctuation title legitimately slugs to the empty string. `urlTitle` is `required` in
    // `model/validation/Brand.json:L5`, so validation — not this utility — is what reports it.
    await expect(slug('!!!')).resolves.toBe('');
  });
});

describe('createUniqueURLTitle — SEC-13, the attempt bound', () => {
  it('NET-NEW — the probe count is bounded and the failure is deterministic', async () => {
    // Every candidate is taken, which is the unbounded case: the legacy loop at
    // `model/service/DataService.cfc:L64` has no ceiling and would probe forever.
    const { probe, candidates } = probeTaking(Number.MAX_SAFE_INTEGER);

    await expect(
      createUniqueURLTitle('My Brand', 'SwBrand', probe, budget(4)),
    ).rejects.toBeInstanceOf(DomainError);

    // Exactly four probes: the unsuffixed candidate plus three suffixed. The budget counts PROBES,
    // deliberately not suffixes — conflating the two would tie the bound to the suffix sequence and
    // change the observable output the cases above pin.
    expect(candidates).toEqual(['my-brand', 'my-brand-2', 'my-brand-3', 'my-brand-4']);
  });

  it('NET-NEW — a budget of 1 permits only the unsuffixed candidate', async () => {
    const { probe, candidates } = probeTaking(Number.MAX_SAFE_INTEGER);

    await expect(createUniqueURLTitle('X', 'SwBrand', probe, budget(1))).rejects.toThrow(
      /within 1 availability probes/,
    );
    expect(candidates).toEqual(['x']);
  });

  it('NET-NEW — exhaustion fabricates NO fallback title', async () => {
    // A generated fallback would hand back a title the probe never approved, against a column the
    // legacy declares unique. Failing is the only correct outcome.
    const { probe } = probeTaking(Number.MAX_SAFE_INTEGER);

    await expect(
      createUniqueURLTitle('My Brand', 'SwBrand', probe, budget(2)),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('NET-NEW — the failure reports declaration facts and discloses no candidate value', async () => {
    const { probe } = probeTaking(Number.MAX_SAFE_INTEGER);

    let raised: unknown;
    try {
      await createUniqueURLTitle('super-secret-brand', 'SwBrand', probe, budget(2));
    } catch (error: unknown) {
      raised = error;
    }

    expect(raised).toBeInstanceOf(DomainError);
    const domainError = raised as DomainError;
    expect(domainError.context).toEqual({
      tableName: 'SwBrand',
      maximumProbes: 2,
      probesIssued: 2,
      lastCandidateSuffix: 2,
      locator: 'model/service/DataService.cfc:L62-L68',
    });
    expect(domainError.message).not.toContain('super-secret-brand');
  });

  it('NET-NEW — a malformed budget is rejected before any probe is issued', async () => {
    for (const invalid of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { probe, candidates } = probeTaking(0);

      await expect(
        createUniqueURLTitle('X', 'SwBrand', probe, budget(invalid)),
      ).rejects.toBeInstanceOf(DomainError);
      // Nothing was asked of the database: a wiring error must not look like a data error.
      expect(candidates).toEqual([]);
    }
  });
});

describe('BrandService.saveBrand — SEC-13 end to end', () => {
  interface Harness {
    readonly service: BrandService;
    readonly candidates: string[];
    /** The payload the base collaborator was handed, so the by-reference write is observable. */
    readonly savedPayloads: Record<string, unknown>[];
  }

  function makeService(takenCount: number, maximumProbes: number): Harness {
    const { probe, candidates } = probeTaking(takenCount);
    const savedPayloads: Record<string, unknown>[] = [];

    const brandRepositoryDouble = {
      isUrlTitleAvailable: (candidate: string): Promise<boolean> => probe('SwBrand', candidate),
    } as never;

    const baseServiceDouble = {
      save: (brand: Brand, data?: Record<string, unknown>): Promise<Brand> => {
        savedPayloads.push(data ?? {});
        return Promise.resolve(brand);
      },
    } as never;

    return {
      candidates,
      savedPayloads,
      service: new BrandService(brandRepositoryDouble, baseServiceDouble, { maximumProbes }),
    };
  }

  it('NET-NEW — the derived title reaches the payload, suffixed, and the save proceeds', async () => {
    const { service, savedPayloads } = makeService(1, 5);
    const brand = managedBrand();
    brand.brandName = 'My Brand';

    await service.saveBrand(brand, {});

    // `model/service/BrandService.cfc:L72` writes the derived title into the PAYLOAD, not onto the
    // entity, because population is what carries it across.
    expect(savedPayloads).toHaveLength(1);
    expect(savedPayloads[0]?.['urlTitle']).toBe('my-brand-2');
  });

  it('NET-NEW — an exhausted budget rejects and the brand is never saved', async () => {
    // The failure has to stop the save. Swallowing it would persist a brand with no URL title
    // against a unique-constrained column.
    const { service, savedPayloads, candidates } = makeService(Number.MAX_SAFE_INTEGER, 3);
    const brand = managedBrand();
    brand.brandName = 'My Brand';

    await expect(service.saveBrand(brand, {})).rejects.toBeInstanceOf(DomainError);

    expect(savedPayloads).toEqual([]);
    expect(candidates).toEqual(['my-brand', 'my-brand-2', 'my-brand-3']);
  });

  it('NET-NEW — model/service/BrandService.cfc:L68 — an explicit payload title bypasses probing entirely', async () => {
    // The two-part guard means no probe is issued at all, so the budget is irrelevant on this path.
    // A budget of 1 would fail immediately if the guard were not honoured.
    const { service, savedPayloads, candidates } = makeService(Number.MAX_SAFE_INTEGER, 1);
    const brand = managedBrand();
    brand.brandName = 'My Brand';

    await service.saveBrand(brand, { urlTitle: 'chosen-by-the-caller' });

    expect(candidates).toEqual([]);
    expect(savedPayloads[0]?.['urlTitle']).toBe('chosen-by-the-caller');
  });

  it('NET-NEW — model/service/BrandService.cfc:L73 — with no usable name, nothing is derived and the save still proceeds', async () => {
    // `urlTitle` being `required` in `model/validation/Brand.json:L5` means the base collaborator's
    // validation reports the failure, exactly as the legacy did. No probe, and no throw here.
    const { service, savedPayloads, candidates } = makeService(0, 5);
    const brand = managedBrand();

    await service.saveBrand(brand, {});

    expect(candidates).toEqual([]);
    expect(savedPayloads).toHaveLength(1);
    expect(savedPayloads[0]?.['urlTitle']).toBeUndefined();
  });
});

/* ================================================================================================
 * SEC-03 AND SEC-04 — `src/handlers/brandHandler.ts`
 *
 * WHY THESE CASES LIVE HERE AND NOT IN `test/handlers/brandHandler.test.ts`. AAP §0.4.1.12 enumerates
 * NO `test/handlers/` directory, and `src/handlers/brandHandler.ts`'s own contract states the
 * consequence outright: "do not create a test file", with S6 manifesting instead as
 * testability-by-design. Inventing an un-enumerated directory is exactly the addition SCOPE-01 was
 * raised about, so the cases go to the AAP-enumerated file whose subject they are closest to. This
 * file already owns the brand slice's remediation coverage, and the handler under test is a function
 * of `BrandHandlerService` — the very surface `BrandService` implements — so the pairing is on the
 * merits and not merely permitted. The same placement decision was taken for the `src/util/urlTitle`
 * cases above, and for SEC-07's entity-level cases in `./SkuService.test.ts`.
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP §0.6.5.2 verified that the legacy suite contains no
 * controller test of any kind — the one functional scaffold,
 * [meta/tests/functional/admin/entity/ProductTest.cfc:L49-L52], is an empty component with zero test
 * methods — so no parity with a legacy assertion is claimed or implied.
 * ============================================================================================== */

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
