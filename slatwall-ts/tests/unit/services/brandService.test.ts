// ---------------------------------------------------------------------------
// slatwall-ts - unit suite pinning `src/services/brandService.ts`
//
// 100% NET-NEW COVERAGE - NEVER TO BE PRESENTED AS PARITY
//   No assertion below has a legacy antecedent. `meta/tests/unit/service/` holds
//   exactly four components - AccountServiceTest, HibachiServiceTest,
//   PaymentServiceTest and UtilityRBServiceTest - none in scope and none touching
//   the brand service, so there is NO legacy `BrandServiceTest` under
//   `meta/tests/`. Presenting net-new coverage as parity would fail the
//   traceability gate.
//
//   THE TRAP WORTH NAMING: `meta/tests/unit/entity/BrandTest.cfc` DOES exist and
//   DOES carry one real legacy case - it builds a brand through the service
//   factory and asserts its products association answers an empty array. That
//   case covers the Brand ENTITY and is carried forward by the sibling-owned
//   `tests/unit/domain/entities/brand.test.ts`. It gives THIS file zero lineage,
//   and its coverage is deliberately not claimed here. The one legacy functional
//   stub for this area, `meta/tests/functional/admin/entity/ProductTest.cfc`, is
//   empty and contributes nothing to anybody.
//
// WHAT IS UNDER TEST
//   `model/service/BrandService.cfc` is 90 lines and declares exactly ONE
//   function, `saveBrand` [model/service/BrandService.cfc:L67-L77]. `getBrand`,
//   `newBrand`, `deleteBrand` and the smart-list accessor all arrived by
//   inheritance from the framework base component, deliberately not ported, so
//   that one method is the whole observable surface. The legacy body is a
//   four-clause gate wrapping a two-branch preference:
//
//     L68  (entity title is null OR empty) AND (payload has no urlTitle key OR
//          that key is empty)                  -> generation is attempted
//     L69    payload brandName non-empty       -> generate from the payload
//     L71    else entity brandName non-empty   -> generate from the entity
//     L73    there is NO trailing else         -> nothing is set, nothing throws
//     L76  return super.save(brand, data)      -> positional; the DURABLE half is
//                                                 framework-inherited generic CRUD
//                                                 and is left to the composition
//                                                 root, so the ported method
//                                                 answers the brand it was handed
//
//   Eight input shapes reach that gate and every one is exercised below. Each of
//   the three preserved translation decisions in the shipped service - the
//   `len()` emptiness semantics, the in-place payload write and the missing
//   trailing `else` - is pinned by an assertion rather than trusted to a comment.
//
// ★ WHY NO PERSISTENCE DOUBLE APPEARS BELOW. An earlier revision of this suite
// carried one, typed against a seventh member on `ProductRepository`. That member
// is gone: the port's set is locked at six, the thirteen-port inventory is closed
// and holds no brand repository, there is no `BrandDAO.cfc` anywhere in the legacy
// repository, and AAP 0.5.3 does not carry the Hibachi base classes forward -
// which is all `super.save` ever was. The shipped service carries the LEGACY-NOTE
// that records this at the statement itself, and the arity case below pins the
// one-collaborator constructor that follows from it.
//
// THE IN-MEMORY DOUBLE IDIOM THIS FILE ESTABLISHES
// ---------------------------------------------------------------------------
// The one port this service consumes is replaced by a hand-written in-memory
// double declared inline in this file, typed against the shipped contract,
// recording what it received and answering a deterministic synthetic value. Four
// properties make it a double rather than a mock, and each one is load-bearing:
//
//   1. It is TYPED against the shipped port, so a change to the contract breaks
//      compilation here instead of drifting silently past a permissive mock.
//   2. It RECORDS rather than asserts, so each test states its own expectation
//      and a reader sees the whole contract in one place.
//   3. It is PURE and DETERMINISTIC - no randomness, no clock reading, no
//      counter that survives a test - so no assertion can pass by accident.
//   4. It is CONSTRUCTED FRESH in `beforeEach`, so no state leaks between
//      cases. There is no mutable module-level state in this file at all.
//
// WHAT THIS SUITE DELIBERATELY DOES NOT DO
//   * NO SQL, PARAMETERISED OR OTHERWISE - AND THAT IS NOT A GAP. The project
//     holds every query to prepared statements, which is what preserves the
//     injection-safety guarantee the legacy `cfqueryparam` gave. That obligation
//     cannot be discharged from here, because the unit under test issues no
//     query at all: it hands the literal physical table name `'SwBrand'` to a
//     PORT as an argument [model/service/BrandService.cfc:L70, L72], and the
//     statement that consumes it lives behind an adapter. SQL-shape and
//     parameter-binding assertions therefore belong exclusively to the
//     sibling-owned `tests/integration/repositories/` tier, where a real
//     statement exists to assert against. Recording that here is the difference
//     between "not applicable" and "forgotten".
//   * NO DATABASE, NO NETWORK, NO FILESYSTEM AND NO ENVIRONMENT READ. The one
//     collaborator is an in-memory double, so this suite passes with a
//     completely empty environment and no `.env` present. `tests/setup.ts` loads
//     dotenv defensively for the tiers that need it; nothing here reads what it
//     loaded, and no credential, host name or connection value appears anywhere
//     in this file.
//   * NO MONETARY VALUE IS TOUCHED. There is no price, discount, rate or total
//     in this component, so the project rule that all money arithmetic passes
//     through the `Money` value object is vacuous here. Every number below is a
//     count of recorded calls, and no arithmetic is performed on one. Stated so
//     that nobody later introduces a raw numeric price here believing no rule
//     applies.
//   * NO ASSERTION ABOUT `brandWebsite`. The entity carries the column
//     [model/entity/Brand.cfc:L57] and `saveBrand` never reads it, so nothing
//     here asserts anything about the remote host it names - no reachability, no
//     name resolution, no protocol and no format check. No request is issued by
//     any line of this file.
//   * NO MOCKING LIBRARY AND NO SPY. `package.json` pins thirteen packages - three
//     runtime, ten development - and this
//     suite adds none. `vi` ships inside the runner and would have been
//     permitted, but hand-written doubles are the idiom here, so `vi` is not
//     imported at all - which also means this suite owes no spy restoration
//     beyond the global `afterEach` that `tests/setup.ts` already registers.
//   * NO SHARED FIXTURE MODULE. Brands are constructed inline from the shipped
//     entity; there is deliberately no `brandFixtures.ts` and none is created.
//   * NO EXPORT, NO BARREL, NO MXUNIT HARNESS. The legacy assertions are carried;
//     the legacy harness is not, and attribution is carried once in
//     `slatwall-ts/NOTICE-GPL.md` rather than restated per file.
//
// THREE SECONDARY-REGISTER ITEMS, EACH RECORDED BESIDE THE ASSERTION THAT MEETS IT
//   `model/service/BrandService.cfc` owns no numbered entry in the project defect
//   register, so no LEGACY-DEFECT marker appears below: the unqualified
//   `data.urlTitle` write [L70, L72], the positional `super.save` [L76], and a
//   duplicated section banner where L57 and L59 both read
//   `START: DAO Passthrough` so that section never closes.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it } from 'vitest';

import { Brand } from '../../../src/domain/entities/brand.js';
import type {
  UrlTitleGenerator,
  UrlTitleTableName,
} from '../../../src/domain/ports/urlTitleGenerator.js';
import {
  BrandPersistenceUnavailableError,
  BrandService,
} from '../../../src/services/brandService.js';
import type { BrandSaveInput } from '../../../src/services/brandService.js';

/**
 * Runs `saveBrand` to completion and asserts it FAILED CLOSED, leaving the payload
 * available for inspection.
 *
 * Every URL-title case in this suite goes through here, and the indirection is the
 * point rather than a convenience. `saveBrand` no longer returns: finding S-06
 * established that answering the brand made an unavailable durable write look like a
 * completed one, so the method now raises
 * {@link BrandPersistenceUnavailableError} after resolving the title. The ported
 * logic AAP 0.4.1 mandates is unchanged and still fully observable - it writes
 * through to the payload the caller supplied, which is the same route the legacy
 * `super.save` read the column from [model/service/BrandService.cfc:L76] - so each
 * case still asserts exactly what it asserted before, on the same object.
 *
 * The rejection is asserted here, once, rather than restated in a dozen places: a
 * case that forgot to await it would otherwise pass on an unhandled rejection and
 * assert nothing at all.
 */
async function runSaveExpectingFailClosed(
  service: BrandService,
  brand: Brand,
  data: BrandSaveInput,
): Promise<void> {
  await expect(service.saveBrand(brand, data)).rejects.toBeInstanceOf(
    BrandPersistenceUnavailableError,
  );
}

// ---------------------------------------------------------------------------
// The collaborator tuple, DERIVED from the shipped constructor
// ---------------------------------------------------------------------------

// JUDGMENT CALL: the constructor's parameter list is reached through
// `ConstructorParameters<typeof BrandService>` rather than being restated here.
// Deriving it from the SHIPPED CLASS means this suite can never drift from the
// class it constructs: reorder the parameters, retype one, or add a second
// collaborator, and this file stops compiling - which is exactly the signal a
// suite should give, rather than continuing to pass against a contract that has
// moved.
//
// ★ THE TUPLE HAS EXACTLY ONE ELEMENT, AND THIS SUITE PINS THAT. `BrandService`
// is the leanest service in the slice: the legacy component declares one
// collaborator, `property name="dataService" type="any";`
// [model/service/BrandService.cfc:L51], and the ported class takes exactly that
// one. An earlier revision took a SECOND - a persistence port standing in for
// `super.save(arguments.brand, arguments.data)`
// [model/service/BrandService.cfc:L76] - and that was wrong: `super.save` is
// framework-inherited generic Hibachi CRUD, which AAP 0.5.3 does not carry
// forward; there is no `BrandDAO.cfc` anywhere in the legacy repository; the
// thirteen-port set publishes no brand repository and is closed; and
// `ProductRepository`'s own member set is locked at six, so it cannot host a
// brand write either. The durable half therefore belongs to the composition root,
// which is what the service's LEGACY-NOTE records at the statement that used to
// perform it. The arity assertion below is what stops a second collaborator
// reappearing unnoticed.
type BrandServiceCollaborators = ConstructorParameters<typeof BrandService>;

// --- Deterministic synthetic values -----

/**
 * Derives the obviously-synthetic title the URL-title double answers with. Pure and total - no
 * clock, no counter, no random source - and the `generated-` prefix makes it impossible for an
 * assertion to pass because a test supplied a value that already looked like a slug.
 *
 * NOT a port of the legacy slug algorithm and never to be read as one.
 * `model/service/DataService.cfc:L57-L68` owns that algorithm - lowercasing, character stripping,
 * space collapsing and the `-2` collision suffix - and the adapter behind the port reproduces it.
 */
function synthesiseUrlTitle(titleString: string): string {
  const normalised = titleString.trim().toLowerCase();
  const slug = normalised.replace(/[^a-z0-9]+/g, '-');

  return `generated-${slug}`;
}

const PAYLOAD_BRAND_NAME = 'Acme Athletics';
const PAYLOAD_DERIVED_URL_TITLE = 'generated-acme-athletics';

const ENTITY_BRAND_NAME = 'Contoso Outfitters';
const ENTITY_DERIVED_URL_TITLE = 'generated-contoso-outfitters';

// ---------------------------------------------------------------------------
// The in-memory double
// ---------------------------------------------------------------------------

/** One recorded invocation of the URL-title port, exactly as it arrived. */
interface RecordedUrlTitleRequest {
  readonly titleString: string;
  readonly tableName: UrlTitleTableName;
}

/**
 * In-memory stand-in for the URL-title generator port, replacing the legacy
 *   `property name="dataService" type="any";`
 * [model/service/BrandService.cfc:L51] - the component's one and only declared collaborator,
 * narrowed by the port to the single method it ever consumed.
 *
 * Records both arguments of every call in arrival order, so a test can assert HOW MANY times
 * generation fired, WHICH title source won and WHICH table the uniqueness scope named - the three
 * facts the legacy branch structure decides.
 *
 * NOT `async`, deliberately: the port answers a promise, and returning a resolved one keeps the
 * double free of an `await` it has no work to wait for.
 */
class RecordingUrlTitleGenerator implements UrlTitleGenerator {
  readonly requests: RecordedUrlTitleRequest[] = [];

  createUniqueURLTitle(titleString: string, tableName: UrlTitleTableName): Promise<string> {
    this.requests.push({ titleString, tableName });

    return Promise.resolve(synthesiseUrlTitle(titleString));
  }
}

describe('BrandService', () => {
  let urlTitleGenerator: RecordingUrlTitleGenerator;
  let service: BrandService;

  beforeEach(() => {
    urlTitleGenerator = new RecordingUrlTitleGenerator();

    // JUDGMENT CALL: the collaborator is handed to the constructor, and that is
    // the whole wiring story. The legacy body reached it through
    // `getDataService()` [model/service/BrandService.cfc:L70, L72], a DI/1
    // convention lookup resolved at run time by scanning component properties;
    // the ported class takes it as an explicit, compile-checked constructor
    // argument instead, which is transformation rule T1. That is why no
    // container, composition root or locator is imported by this file, and why
    // constructing the subject needs nothing but one object.
    //
    // ONE argument, matching the ONE collaborator the legacy component declares
    // [model/service/BrandService.cfc:L51]. The durable half of `super.save`
    // [model/service/BrandService.cfc:L76] is NOT a second collaborator here: it
    // was framework-inherited generic CRUD with no DAO behind it, and the
    // thirteen-port set the AAP enumerates publishes no brand repository to replace
    // it. Since finding S-06 the service does not pretend otherwise - it resolves the
    // URL title and then FAILS CLOSED, because nothing anywhere writes `SwBrand` and
    // an earlier revision's deferral to "the composition root" named no actual owner.
    // This suite is typed against whatever the shipped constructor declares, so it
    // follows that surface rather than asserting a shape of its own.
    service = new BrandService(urlTitleGenerator);
  });

  describe('saveBrand', () => {
    it('carries the legacy method name verbatim and publishes no surface the legacy lacked', () => {
      const publishedMembers = Object.getOwnPropertyNames(BrandService.prototype);

      // CFML parity [model/service/BrandService.cfc:L67]: the name is `saveBrand`, in legacy CFML
      // camelCase, because method-level interface parity is this migration's acceptance contract.
      // Not `save`, `createBrand` or `persist`.
      expect(publishedMembers).toContain('saveBrand');

      // The legacy component declares ONE function; everything else came from the framework base
      // component, which is not ported, so none of these may be invented. An exact whole-list
      // assertion is deliberately not used: it would also fail for a private helper, which this
      // contract does not address.
      expect(publishedMembers).not.toContain('save');
      expect(publishedMembers).not.toContain('getBrand');
      expect(publishedMembers).not.toContain('newBrand');
      expect(publishedMembers).not.toContain('deleteBrand');
      expect(publishedMembers).not.toContain('getBrandSmartList');
      expect(publishedMembers).not.toContain('findBrands');
    });

    it('declares exactly one collaborator, the URL-title generator and nothing else', () => {
      // COMPILE-TIME half: the annotation only accepts `1`, so widening the
      // constructor to a second collaborator fails the build rather than this
      // assertion. It is the stronger of the two checks and is the reason the
      // tuple type is derived from the shipped class above.
      const declaredArity: BrandServiceCollaborators['length'] = 1;

      // RUN-TIME half, which also states the fact in the reporter's output.
      // `Function.length` counts declared parameters before any default, and the
      // ported constructor declares one.
      expect(declaredArity).toBe(1);
      expect(BrandService.length).toBe(1);

      // ★ THE SECOND COLLABORATOR IS ABSENT DELIBERATELY, AND THIS IS WHERE THAT
      // IS PINNED. An earlier revision injected a persistence port to perform
      // `super.save(arguments.brand, arguments.data)`
      // [model/service/BrandService.cfc:L76]. `super.save` is framework-inherited
      // generic Hibachi CRUD (AAP 0.5.3 does not carry it forward); there is no
      // `BrandDAO.cfc` anywhere in the legacy repository; the thirteen-port set is
      // closed and publishes no brand repository; and `ProductRepository`'s member
      // set is locked at six, so it cannot host a brand write either. A partial
      // brand write would have stored a WRONG ROW - `urlTitle` and `brandName`
      // only, with `activeFlag`, `publishedFlag` and `brandWebsite` dropped and
      // `model/validation/Brand.json` unenforced - which is strictly worse than no
      // write at all. So the flush belongs to the composition root, and this
      // service resolves the title and answers the brand.
      expect(new BrandService(urlTitleGenerator)).toBeInstanceOf(BrandService);
    });

    it('leaves an existing entity URL title alone and never calls the generator', async () => {
      const brand = new Brand({
        brandID: 'brand-with-an-existing-url-title',
        urlTitle: 'existing-url-title',
        brandName: ENTITY_BRAND_NAME,
      });

      // A payload brand name IS supplied, so this case proves the OUTER gate suppresses generation
      // on its own.
      const data: BrandSaveInput = { brandName: PAYLOAD_BRAND_NAME };

      await runSaveExpectingFailClosed(service, brand, data);

      expect(urlTitleGenerator.requests).toStrictEqual([]);

      expect(data).toStrictEqual({ brandName: PAYLOAD_BRAND_NAME });
      expect(Object.hasOwn(data, 'urlTitle')).toBe(false);
    });

    it('honours a non-empty payload urlTitle even when the entity carries none', async () => {
      const brand = new Brand({
        brandID: 'brand-without-an-url-title',
        brandName: ENTITY_BRAND_NAME,
      });
      const data: BrandSaveInput = {
        urlTitle: 'supplied-url-title',
        brandName: PAYLOAD_BRAND_NAME,
      };

      await runSaveExpectingFailClosed(service, brand, data);

      // The gate is a CONJUNCTION, so either half suppressing is enough: a usable payload title
      // stops generation even though the entity has nothing.
      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(data.urlTitle).toBe('supplied-url-title');
    });

    it('generates from the payload brandName when neither source carries a URL title', async () => {
      const brand = new Brand({ brandID: 'brand-needing-a-url-title' });
      const data: BrandSaveInput = { brandName: PAYLOAD_BRAND_NAME };

      await runSaveExpectingFailClosed(service, brand, data);

      // CFML parity [model/service/BrandService.cfc:L70]: `tableName="SwBrand"` is the PHYSICAL
      // table name [model/entity/Brand.cfc:L49], handed verbatim to the port. Schema continuity
      // requires the literal - not derived from the entity name, not resolved through a registry,
      // not "corrected" to `Brand`, because slug uniqueness is scoped to that table's `urlTitle`
      // column.
      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: PAYLOAD_BRAND_NAME, tableName: 'SwBrand' },
      ]);

      // CFML parity [model/service/BrandService.cfc:L70]: the legacy assignment target is the
      // UNQUALIFIED `data.urlTitle` rather than `arguments.data.urlTitle`. In CFML the unqualified
      // name still resolves through the arguments scope, so the caller's struct is mutated in place
      // and the missing qualification changes nothing - it is simply absent. A secondary-register
      // item, NOT a defect.
      expect(data.urlTitle).toBe(PAYLOAD_DERIVED_URL_TITLE);

      // The resolved title reaches persistence through the PAYLOAD, never the entity: the ported
      // `Brand` publishes no mutator, and the legacy save populated the entity FROM the struct.
      expect(brand.getUrlTitle()).toBeUndefined();
    });

    it('falls back to the entity brandName when the payload carries no name', async () => {
      const brand = new Brand({
        brandID: 'brand-with-only-an-entity-name',
        brandName: ENTITY_BRAND_NAME,
      });

      // The `brandName` key is OMITTED rather than present and valueless: absence and
      // present-but-null are different inputs, and absence is the one the legacy `structKeyExists`
      // test [model/service/BrandService.cfc:L69] answers false for.
      const data: BrandSaveInput = {};

      await runSaveExpectingFailClosed(service, brand, data);

      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: ENTITY_BRAND_NAME, tableName: 'SwBrand' },
      ]);
      expect(data.urlTitle).toBe(ENTITY_DERIVED_URL_TITLE);
    });

    it('prefers the payload brandName over the entity brandName when both are usable', async () => {
      const brand = new Brand({
        brandID: 'brand-carrying-both-names',
        brandName: ENTITY_BRAND_NAME,
      });
      const data: BrandSaveInput = { brandName: PAYLOAD_BRAND_NAME };

      await runSaveExpectingFailClosed(service, brand, data);

      // CFML parity [model/service/BrandService.cfc:L69-L72]: L69 tests the payload FIRST and L71
      // is its `else if`, so the entity name is consulted only where the payload has nothing
      // usable. Pinning both directions makes the precedence a contract rather than an accident of
      // which one ran.
      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: PAYLOAD_BRAND_NAME, tableName: 'SwBrand' },
      ]);
      expect(data.urlTitle).toBe(PAYLOAD_DERIVED_URL_TITLE);
      expect(data.urlTitle).not.toBe(ENTITY_DERIVED_URL_TITLE);
    });

    it('sets no urlTitle and invents no title-related failure when neither source carries a name', async () => {
      const brand = new Brand({ brandID: 'brand-with-no-name-anywhere' });
      const data: BrandSaveInput = {};

      // CFML parity [model/service/BrandService.cfc:L73]: there is NO trailing
      // `else`. When neither source yields a name the legacy body sets nothing at
      // all and still returns through the save, so this is a live, reachable
      // pass-through rather than an error path. No fallback, no slug derived from
      // the identifier, no empty-string assignment and no title-related error may be
      // added here. Whether the store then rejects the row on the `unique="true"`
      // constraint [model/entity/Brand.cfc:L55] belongs to the persistence tier,
      // and the framework validation service that used to answer first is not
      // ported.
      //
      // THE ASSERTION IS NOW ON THE ERROR'S IDENTITY, AND THAT IS WHAT PINS THE
      // PARITY. This case previously asserted `resolves`, precisely to prove the
      // no-name path raised nothing of its own. Since finding S-06 that method fails
      // closed on the absent durable write for EVERY input, so `resolves` no longer
      // separates the two possibilities - but the error's TYPE still does. Rejecting
      // with exactly `BrandPersistenceUnavailableError` says the refusal is about
      // persistence and nothing else; had a title fallback or a title validation
      // been introduced, this input is the one that would raise something else here.
      await expect(service.saveBrand(brand, data)).rejects.toBeInstanceOf(
        BrandPersistenceUnavailableError,
      );

      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(Object.hasOwn(data, 'urlTitle')).toBe(false);
      expect(data).toStrictEqual({});
    });

    it('treats an empty payload urlTitle as absent and generates', async () => {
      const brand = new Brand({ brandID: 'brand-with-an-empty-payload-title' });
      const data: BrandSaveInput = { urlTitle: '', brandName: PAYLOAD_BRAND_NAME };

      await runSaveExpectingFailClosed(service, brand, data);

      // CFML parity [model/service/BrandService.cfc:L68]: CFML len() truthiness means an empty
      // string is absent. The gate's second disjunction is
      //   `!structKeyExists(data,"urlTitle") || !len(data.urlTitle)`
      // A key that EXISTS while holding `''` therefore still opens the gate, which is what
      // separates this shape from the non-empty payload case above. The third emptiness shape, the
      // key present while holding `undefined`, reaches the same length test and so the same
      // outcome; it is not constructed here because this suite represents absence by omitting the
      // key.
      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: PAYLOAD_BRAND_NAME, tableName: 'SwBrand' },
      ]);
      expect(data.urlTitle).toBe(PAYLOAD_DERIVED_URL_TITLE);
    });

    it('treats an empty entity urlTitle as absent and generates', async () => {
      const brand = new Brand({
        brandID: 'brand-with-an-empty-entity-title',
        urlTitle: '',
        brandName: ENTITY_BRAND_NAME,
      });
      const data: BrandSaveInput = {};

      await runSaveExpectingFailClosed(service, brand, data);

      // CFML parity [model/service/BrandService.cfc:L68]: the gate's FIRST disjunction is
      // `isNull(brand.getURLTitle()) || !len(brand.getURLTitle())`, so the entity side applies the
      // same len() truthiness.
      //
      // LEGACY-NOTE [model/service/ProductService.cfc:L268]: the product save path is the other
      // half of an asymmetry worth naming - it tests only for null, so a product already holding an
      // empty urlTitle keeps it. That asymmetry belongs to the product path and is preserved there;
      // this assertion pins the BRAND half, which does test length. Neither is normalised.
      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: ENTITY_BRAND_NAME, tableName: 'SwBrand' },
      ]);
      expect(data.urlTitle).toBe(ENTITY_DERIVED_URL_TITLE);
    });

    it('folds payload key casing the way a CFML struct does, writing one key and not two', async () => {
      const brand = new Brand({ brandID: 'brand-with-a-differently-cased-payload' });

      // A CFML struct folds key case, so `data.urlTitle = value` UPDATES an existing `URLTitle`
      // entry [model/service/BrandService.cfc:L70]. A plain TypeScript object would instead gain a
      // SECOND entry and leave the first holding its stale value - which a case-insensitive read
      // would then answer with, shadowing the freshly generated title. The payload is typed as a
      // string record because a caller typed against the save input cannot express a
      // differently-cased key: this path opens at an untyped boundary, such as a handler forwarding
      // a parsed request body, which is precisely where CFML used to absorb the difference
      // silently.
      const payload: Record<string, string> = {
        URLTitle: '',
        BrandName: PAYLOAD_BRAND_NAME,
      };

      await runSaveExpectingFailClosed(service, brand, payload);

      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: PAYLOAD_BRAND_NAME, tableName: 'SwBrand' },
      ]);

      // Written back under the key already in use. Asserting the key list IN ORDER pins both
      // halves: the stored casing survives, and no second key was added.
      expect(Object.keys(payload)).toStrictEqual(['URLTitle', 'BrandName']);
      expect(payload['URLTitle']).toBe(PAYLOAD_DERIVED_URL_TITLE);
      expect(payload['BrandName']).toBe(PAYLOAD_BRAND_NAME);
      expect(Object.hasOwn(payload, 'urlTitle')).toBe(false);
    });

    it('★★ NEVER REPORTS SUCCESS for the durable write it cannot perform', async () => {
      // ★ THIS CASE IS THE INVERSE OF THE ONE IT REPLACES, AND THE INVERSION IS THE
      // POINT. It previously read 'answers the brand it was handed, leaving the
      // durable half to the composition root' and asserted `result).toBe(brand)` -
      // encoding as correct the very behaviour a security review then raised as
      // S-06 (CWE-703, CWE-840): `saveBrand` "returns a success-shaped mutated Brand
      // but performs no durable write and throws no unavailable-capability error".
      //
      // The deferral that assertion rested on was checked and found to name no
      // owner: NOTHING under `src/repositories/**` writes `SwBrand`, and
      // `mysqlProductRepository.ts` states that its eleven `SwBrand` columns are
      // read-only there. So the brand a caller "saved" was discarded, silently, and
      // this suite asserted that outcome was intended. A test that pins a defect as
      // a contract is worse than no test, because it makes the fix look like the
      // regression - which is exactly why the assertion is inverted here rather than
      // deleted.
      const brand = new Brand({
        brandID: 'brand-already-carrying-a-title',
        brandName: ENTITY_BRAND_NAME,
      });
      const data: BrandSaveInput = { urlTitle: 'already-resolved-url-title' };

      // The refusal is asserted on the error's IDENTITY, not on its message: a
      // message is prose and may be reworded, whereas the class is the contract a
      // caller branches on. Naming it also proves the rejection is deliberate rather
      // than an incidental `TypeError` from a half-written path.
      await expect(service.saveBrand(brand, data)).rejects.toBeInstanceOf(
        BrandPersistenceUnavailableError,
      );

      // ★ AND NOTHING WAS QUIETLY DONE ON THE WAY OUT. Failing closed must not become
      // an excuse for partial work: the entity is untouched, no identifier was
      // invented for the flush that did not happen [model/entity/Brand.cfc:L52,
      // `generator="uuid" unsavedvalue=""`], and the payload is exactly as supplied
      // because the outer gate suppressed generation on the strength of the title
      // already in it.
      expect(brand.getBrandID()).toBe('brand-already-carrying-a-title');
      expect(brand.getUrlTitle()).toBeUndefined();
      expect(brand.getBrandName()).toBe(ENTITY_BRAND_NAME);
      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(data).toStrictEqual({ urlTitle: 'already-resolved-url-title' });
    });

    it('still resolves the ported URL title before it refuses, so no ported logic is lost', async () => {
      // The other half of the fail-closed contract, and the reason the throw sits at
      // the END of the method rather than at its start. AAP 0.4.1 mandates this file
      // port `saveBrand` L67 with "the single `dataService` dependency becomes the
      // URL-title port"; that logic is the method's entire ported substance, and a
      // guard clause at the top would have deleted it while appearing to satisfy the
      // review. Here the generator IS called, and its answer IS written through to
      // the payload - the same route the legacy `super.save` read the column from -
      // and only then does the method refuse.
      const brand = new Brand({ brandID: 'brand-needing-a-generated-title' });
      const data: BrandSaveInput = { brandName: PAYLOAD_BRAND_NAME };

      await runSaveExpectingFailClosed(service, brand, data);

      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: PAYLOAD_BRAND_NAME, tableName: 'SwBrand' },
      ]);
      expect(data.urlTitle).toBe(PAYLOAD_DERIVED_URL_TITLE);
    });

    it('preserves every payload column the caller supplied, not just the two it reads', async () => {
      // ★ THE DEFECT THIS CASE EXISTS TO RULE OUT. `BrandSaveInput` declares only
      // the two keys the legacy body reads - `urlTitle` [L68, L70, L72] and
      // `brandName` [L69] - which invites the conclusion that the flags, the
      // website and the remote identifier are DROPPED somewhere in this service.
      // They are not: TypeScript types erase at run time, this method mutates the
      // caller's object in place rather than copying it, and it answers without
      // rebuilding it. So the payload the composition root goes on to flush carries
      // the COMPLETE column set the caller supplied plus the resolved `urlTitle` -
      // which is exactly what the legacy `super.save(brand, data)` needed, because
      // it populated the entity from the whole struct.
      //
      // The payload is typed as a loose record for the same reason the casing case
      // above is: excess-property checking would reject these keys on a fresh
      // literal typed as the save input, and the path that carries them opens at an
      // untyped boundary such as a handler forwarding a parsed request body.
      const payload: Record<string, unknown> = {
        brandName: PAYLOAD_BRAND_NAME,
        activeFlag: true,
        publishedFlag: false,
        brandWebsite: 'https://example.invalid/acme',
        remoteID: 'legacy-remote-identifier',
      };

      const brand = new Brand({ brandID: 'brand-with-a-full-payload' });
      await runSaveExpectingFailClosed(service, brand, payload);

      // The guard chain ran and resolved the title into the SAME object.
      expect(payload['urlTitle']).toBe(PAYLOAD_DERIVED_URL_TITLE);

      // ...and every other key the caller supplied is still there, unchanged. The
      // key ORDER is asserted too, because the resolved title is appended rather
      // than substituted for anything.
      expect(payload).toStrictEqual({
        brandName: PAYLOAD_BRAND_NAME,
        activeFlag: true,
        publishedFlag: false,
        brandWebsite: 'https://example.invalid/acme',
        remoteID: 'legacy-remote-identifier',
        urlTitle: PAYLOAD_DERIVED_URL_TITLE,
      });

      // `brandWebsite` is carried as an opaque string and nothing is done with the
      // host it names: no reachability check, no name resolution, no request. The
      // legacy `saveBrand` never reads the column either. That holds on the
      // fail-closed path too: refusing the write is not licence to touch a column the
      // method never read, so the assertion above is on the WHOLE payload.
      expect(brand.getBrandID()).toBe('brand-with-a-full-payload');
    });

    it('reaches its collaborator only through the constructor, never through a locator', async () => {
      // Two services, two independent doubles. Were either instance resolving its
      // collaborator from a registry, a module singleton or an ambient request
      // scope, the call would land somewhere other than the double that instance
      // was constructed with, and this case would fail. That is the whole proof,
      // and it is why no container, composition root or locator is imported
      // anywhere in this file.
      const isolatedGenerator = new RecordingUrlTitleGenerator();
      const isolatedService = new BrandService(isolatedGenerator);

      const brand = new Brand({ brandID: 'brand-routed-to-the-isolated-double' });
      const data: BrandSaveInput = { brandName: PAYLOAD_BRAND_NAME };

      await runSaveExpectingFailClosed(isolatedService, brand, data);

      expect(isolatedGenerator.requests).toStrictEqual([
        { titleString: PAYLOAD_BRAND_NAME, tableName: 'SwBrand' },
      ]);
      expect(data.urlTitle).toBe(PAYLOAD_DERIVED_URL_TITLE);

      // The double built in `beforeEach` was handed to a different instance and
      // recorded nothing, which also demonstrates the per-case isolation every
      // assertion in this file depends on.
      expect(urlTitleGenerator.requests).toStrictEqual([]);
    });
  });
});
