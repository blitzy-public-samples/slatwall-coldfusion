// ---------------------------------------------------------------------------
// slatwall-ts - unit suite pinning `src/services/brandService.ts`
//
// ---------------------------------------------------------------------------
// 100% NET-NEW COVERAGE - NEVER TO BE PRESENTED AS PARITY
// ---------------------------------------------------------------------------
// Not one assertion below has a legacy antecedent. `meta/tests/unit/service/`
// holds exactly four components - AccountServiceTest, HibachiServiceTest,
// PaymentServiceTest and UtilityRBServiceTest - none of them in scope and none
// of them touching the brand service, so there is NO legacy `BrandServiceTest`
// anywhere under `meta/tests/`. This suite is net-new in full, and saying so is
// a requirement rather than a courtesy: presenting net-new coverage as parity
// would fail the traceability gate.
//
// ! THE TRAP WORTH NAMING. `meta/tests/unit/entity/BrandTest.cfc` DOES exist,
// and it DOES carry one real legacy case - it builds a brand through the service
// factory and asserts that its products association answers an empty array.
// That case covers the Brand ENTITY, and it is carried forward by the
// sibling-owned `tests/unit/domain/entities/brand.test.ts`. It gives THIS file
// zero coverage lineage, and its coverage is deliberately NOT claimed here.
// Nothing below asserts anything about the entity's own defaults, its products
// association, or the cases its legacy base component contributed. The one
// legacy functional stub for this area,
// `meta/tests/functional/admin/entity/ProductTest.cfc`, is empty and
// contributes nothing to anybody.
//
// ---------------------------------------------------------------------------
// WHAT IS UNDER TEST
// ---------------------------------------------------------------------------
// `model/service/BrandService.cfc` is 90 lines and declares exactly ONE
// function, `saveBrand` [model/service/BrandService.cfc:L67-L77]. Everything
// else a caller might expect of a service - `getBrand`, `newBrand`,
// `deleteBrand`, a smart-list accessor - arrived by inheritance from the
// framework base component, which is deliberately not ported. So the whole
// observable surface of the ported class is that one method, and this suite pins
// all of it.
//
// The legacy body is a four-clause gate wrapping a two-branch preference:
//
//   L68  (entity title is null OR empty) AND (payload has no urlTitle key OR
//        that key is empty)                  -> generation is attempted
//   L69    payload brandName non-empty       -> generate from the payload
//   L71    else entity brandName non-empty   -> generate from the entity
//   L73    there is NO trailing else         -> nothing is set, nothing throws
//   L76  return super.save(brand, data)      -> positional, and its result is
//                                               what the method answers
//
// Eight input shapes reach that gate. Every one of them is exercised below, and
// each of the three preserved translation decisions in the shipped service - the
// `len()` emptiness semantics, the in-place payload write, and the missing
// trailing `else` - is pinned by an assertion rather than trusted to a comment.
//
// ---------------------------------------------------------------------------
// THE IN-MEMORY DOUBLE IDIOM THIS FILE ESTABLISHES
// ---------------------------------------------------------------------------
// Every port is replaced by a hand-written in-memory double declared inline in
// this file, typed against the shipped contract, recording what it received and
// answering a deterministic synthetic value. Four properties make it a double
// rather than a mock, and each one is load-bearing:
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
// ---------------------------------------------------------------------------
// WHAT THIS SUITE DELIBERATELY DOES NOT DO, EACH STATED RATHER THAN LEFT SILENT
// ---------------------------------------------------------------------------
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
//   * NO DATABASE, NO NETWORK, NO FILESYSTEM AND NO ENVIRONMENT READ. Both
//     collaborators are in-memory doubles, so this suite passes with a
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
//   * NO MOCKING LIBRARY AND NO SPY. The project pins fourteen packages and this
//     suite adds none. `vi` ships inside the runner and would have been
//     permitted, but hand-written doubles are the idiom here, so `vi` is not
//     imported at all - which also means this suite owes no spy restoration
//     beyond the global `afterEach` that `tests/setup.ts` already registers.
//   * NO SHARED FIXTURE MODULE. Brands are constructed inline from the shipped
//     entity. There is deliberately no `brandFixtures.ts` among the fixture
//     modules and none is created here: inline construction inside the consuming
//     suite is the intended shape.
//   * NO EXPORT, NO BARREL. A `.test.ts` file exports nothing, and no helper
//     module or shared base suite is created or imported.
//   * NO MXUNIT HARNESS. The legacy assertions are carried; the legacy harness
//     is not. There is no assertion shim, no set-up/tear-down base component
//     analogue, no test-helper class port and no browser-driver analogue.
//   * NO LICENCE HEADER. Attribution is carried once, in
//     `slatwall-ts/NOTICE-GPL.md`, and is never restated per file.
//
// ---------------------------------------------------------------------------
// WHY NO `LEGACY-DEFECT` MARKER APPEARS BELOW - AN ABSENCE, NOT AN OVERSIGHT
// ---------------------------------------------------------------------------
// `model/service/BrandService.cfc` owns no numbered entry in the project defect
// register. It owns three secondary-register items, and each is recorded next to
// the assertion that meets it: the unqualified `data.urlTitle` write [L70, L72],
// the positional `super.save` [L76], and a duplicated section banner where L57
// and L59 both read `START: DAO Passthrough` so that section never closes.
// Writing a `LEGACY-DEFECT` marker for any of those would falsely promote it to
// a numbered defect, so none is written; the marker forms that do appear here
// are LEGACY-NOTE, JUDGMENT CALL and CFML parity.
//
// This suite also spends from none of the project budget ledgers: no signature
// reshaping, no visibility widening, no signature widening and no deliberate
// divergence. `saveBrand` is called by its verbatim legacy name with its shipped
// parameter list, and every expectation below is the legacy outcome.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it } from 'vitest';

import { Brand } from '../../../src/domain/entities/brand.js';
import type {
  UrlTitleGenerator,
  UrlTitleTableName,
} from '../../../src/domain/ports/urlTitleGenerator.js';
import { BrandService } from '../../../src/services/brandService.js';
import type { BrandSaveInput } from '../../../src/services/brandService.js';

// ---------------------------------------------------------------------------
// Port types, and the one that is DERIVED rather than imported
// ---------------------------------------------------------------------------

// JUDGMENT CALL: the persistence port is reached through
// `ConstructorParameters<typeof BrandService>` instead of being imported by
// name. Two reasons, and the second is the stronger one. First, this suite's
// declared dependency set names the service, the Brand entity and the
// URL-title port, and nothing else - so importing a fourth module would widen it
// without need. Second, and independently worth doing: deriving the type from
// the SHIPPED CONSTRUCTOR means the double can never drift from the class it is
// handed to. Reorder the constructor, retype a parameter, or add a third
// collaborator, and this file stops compiling - which is exactly the signal a
// suite should give, rather than continuing to pass against a contract that has
// moved. Nothing is asserted about the port's own name here, because its name is
// not this file's business; its SHAPE is.
type BrandPersistencePort = ConstructorParameters<typeof BrandService>[1];

// The payload type the persistence port promises to carry, derived the same way
// and for the same reason. The service's own `BrandSaveInput` is structurally
// assignable to it, which is why no conversion, copy or cast appears anywhere
// below.
type BrandSavePayloadShape = Parameters<BrandPersistencePort['saveBrand']>[1];

// ---------------------------------------------------------------------------
// Deterministic synthetic values
// ---------------------------------------------------------------------------

/**
 * Derives the obviously-synthetic title the URL-title double answers with.
 *
 * Pure and total: same input, same output, no clock, no counter and no random
 * source. The `generated-` prefix makes it impossible to mistake a double's
 * answer for a real slug, and impossible for an assertion to pass because a test
 * happened to supply a value that already looked like one.
 *
 * This is NOT a port of the legacy slug algorithm and must never be read as one.
 * `model/service/DataService.cfc:L57-L68` owns that algorithm - lowercasing,
 * character stripping, space collapsing and the `-2` collision suffix - and it
 * is the adapter behind the port that reproduces it. What the service tier
 * consumes is a string it did not compute, so a stand-in string is the honest
 * stimulus here.
 */
function synthesiseUrlTitle(titleString: string): string {
  const normalised = titleString.trim().toLowerCase();
  const slug = normalised.replace(/[^a-z0-9]+/g, '-');

  return `generated-${slug}`;
}

/** Payload-supplied brand name, and the title the double derives from it. */
const PAYLOAD_BRAND_NAME = 'Acme Athletics';
const PAYLOAD_DERIVED_URL_TITLE = 'generated-acme-athletics';

/** Entity-supplied brand name, and the title the double derives from it. */
const ENTITY_BRAND_NAME = 'Contoso Outfitters';
const ENTITY_DERIVED_URL_TITLE = 'generated-contoso-outfitters';

/**
 * Identifier carried ONLY by the instance the persistence double answers with.
 *
 * The legacy save is where a new brand acquires its generated identifier
 * [model/entity/Brand.cfc:L52, `generator="uuid" unsavedvalue=""`], and the
 * ported entity is immutable, so that identifier cannot be back-filled into the
 * argument. Keeping the value distinct is what lets the delegation cases below
 * prove the returned brand is the persisted one rather than the input.
 */
const PERSISTED_BRAND_ID = 'persisted-brand-identifier';

/** Title carried only by the persisted instance, for the same reason. */
const PERSISTED_BRAND_URL_TITLE = 'persisted-url-title';

// ---------------------------------------------------------------------------
// The in-memory doubles
// ---------------------------------------------------------------------------

/** One recorded invocation of the URL-title port, exactly as it arrived. */
interface RecordedUrlTitleRequest {
  readonly titleString: string;
  readonly tableName: UrlTitleTableName;
}

/** One recorded invocation of the persistence port, exactly as it arrived. */
interface RecordedBrandSave {
  readonly brand: Brand;
  readonly data: BrandSavePayloadShape;
}

/**
 * In-memory stand-in for the URL-title generator port.
 *
 * Replaces the legacy `property name="dataService" type="any";`
 * [model/service/BrandService.cfc:L51] - the component's one and only declared
 * collaborator, narrowed by the port to the single method this component ever
 * consumed.
 *
 * Records both arguments of every call in arrival order, so a test can assert
 * HOW MANY times generation fired, WHICH title source won, and WHICH table the
 * uniqueness scope named - the three facts the legacy branch structure decides.
 *
 * NOT `async`, deliberately: the port answers a promise, and returning a
 * resolved one keeps the double free of an `await` it has no work to wait for.
 */
class RecordingUrlTitleGenerator implements UrlTitleGenerator {
  readonly requests: RecordedUrlTitleRequest[] = [];

  createUniqueURLTitle(titleString: string, tableName: UrlTitleTableName): Promise<string> {
    this.requests.push({ titleString, tableName });

    return Promise.resolve(synthesiseUrlTitle(titleString));
  }
}

/**
 * Raised by any persistence member this suite proves is never reached.
 *
 * A double that answered a plausible value for an unexercised member would let a
 * regression pass unnoticed; one that raises turns the same regression into a
 * named failure. That makes these members a complete implementation of a test
 * double rather than deferred work - the behaviour they implement IS "this must
 * not happen, and here is which member happened".
 */
function unreachedPersistenceMember(member: string): never {
  throw new Error(
    `the persistence double's ${member} was reached. The ported saveBrand delegates to ` +
      'saveBrand and to nothing else, so reaching any other member of the port means the ' +
      'service under test has grown a collaboration this suite does not describe.',
  );
}

/**
 * In-memory stand-in for the persistence port that `super.save(...)`
 * [model/service/BrandService.cfc:L76] became.
 *
 * Records the brand and the payload it received - by reference, so the payload
 * recorded is the very object the service wrote into, which is what lets the
 * cases below assert BOTH the resolved value and CFML's pass-by-reference
 * semantics with one identity check.
 *
 * Answers a DISTINCT brand instance rather than the one it was handed, because
 * that is what the legacy save did: it returned the entity the data store had
 * seen, carrying the identifier the store assigned.
 *
 * Every other member of the port raises. That is not padding - it is the
 * strongest available statement that the brand save path touches exactly one
 * persistence operation, enforced at run time rather than asserted in prose.
 */
class RecordingBrandPersistence implements BrandPersistencePort {
  readonly saves: RecordedBrandSave[] = [];

  constructor(private readonly persistedBrand: Brand) {}

  saveBrand(brand: Brand, data: BrandSavePayloadShape): Promise<Brand> {
    this.saves.push({ brand, data });

    return Promise.resolve(this.persistedBrand);
  }

  readonly getAttributeSets: BrandPersistencePort['getAttributeSets'] = () =>
    unreachedPersistenceMember('getAttributeSets');

  readonly loadDataFromFile: BrandPersistencePort['loadDataFromFile'] = () =>
    unreachedPersistenceMember('loadDataFromFile');

  readonly searchProductsByProductType: BrandPersistencePort['searchProductsByProductType'] = () =>
    unreachedPersistenceMember('searchProductsByProductType');

  readonly getProductByProductID: BrandPersistencePort['getProductByProductID'] = () =>
    unreachedPersistenceMember('getProductByProductID');

  readonly saveProduct: BrandPersistencePort['saveProduct'] = () =>
    unreachedPersistenceMember('saveProduct');

  readonly deleteProduct: BrandPersistencePort['deleteProduct'] = () =>
    unreachedPersistenceMember('deleteProduct');
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('BrandService', () => {
  let urlTitleGenerator: RecordingUrlTitleGenerator;
  let persistence: RecordingBrandPersistence;
  let persistedBrand: Brand;
  let service: BrandService;

  beforeEach(() => {
    urlTitleGenerator = new RecordingUrlTitleGenerator();

    // The instance the persistence double answers with. It carries the
    // identifier and the title that only a saved row has, so no case can
    // conflate it with the brand it was handed.
    persistedBrand = new Brand({
      brandID: PERSISTED_BRAND_ID,
      urlTitle: PERSISTED_BRAND_URL_TITLE,
      brandName: 'Persisted Brand Name',
    });

    persistence = new RecordingBrandPersistence(persistedBrand);

    // JUDGMENT CALL: the collaborators are handed to the constructor, and that
    // is the whole wiring story. The legacy body reached its collaborator
    // through `getDataService()` [model/service/BrandService.cfc:L70, L72], a
    // DI/1 convention lookup resolved at run time by scanning component
    // properties; the ported class takes it as an explicit, compile-checked
    // constructor argument instead, which is transformation rule T1. That is
    // why no container, composition root or locator is imported by this file,
    // and why constructing the subject needs nothing but two objects.
    //
    // TWO arguments where the legacy component DECLARED one, and the asymmetry
    // is faithful rather than an addition. The legacy `property name="dataService"`
    // [model/service/BrandService.cfc:L51] became the first; the second stands in
    // for `super.save(...)` [model/service/BrandService.cfc:L76], which needed no
    // declaration because it arrived by inheritance from the framework base
    // component. Both legacy collaborations survive - one of them simply used to
    // be invisible at the top of the file. This suite is typed against whatever
    // the shipped constructor declares, so it follows that surface rather than
    // asserting a shape of its own.
    service = new BrandService(urlTitleGenerator, persistence);
  });

  describe('saveBrand', () => {
    it('carries the legacy method name verbatim and publishes no surface the legacy lacked', () => {
      const publishedMembers = Object.getOwnPropertyNames(BrandService.prototype);

      // CFML parity [model/service/BrandService.cfc:L67]: the name is
      // `saveBrand`, in legacy CFML camelCase, because method-level interface
      // parity is this migration's acceptance contract. Not `save`, not
      // `createBrand`, not `persist`.
      expect(publishedMembers).toContain('saveBrand');

      // The legacy component declares ONE function; everything else came from
      // the framework base component, which is not ported. Its absence here is
      // faithful, not incomplete, so none of these may be invented. An exact
      // whole-list assertion is deliberately not used: it would also fail for a
      // private helper, which is an implementation detail this contract does not
      // speak to.
      expect(publishedMembers).not.toContain('save');
      expect(publishedMembers).not.toContain('getBrand');
      expect(publishedMembers).not.toContain('newBrand');
      expect(publishedMembers).not.toContain('deleteBrand');
      expect(publishedMembers).not.toContain('getBrandSmartList');
      expect(publishedMembers).not.toContain('findBrands');
    });

    it('leaves an existing entity URL title alone and never calls the generator', async () => {
      const brand = new Brand({
        brandID: 'brand-with-an-existing-url-title',
        urlTitle: 'existing-url-title',
        brandName: ENTITY_BRAND_NAME,
      });

      // A payload brand name IS supplied here, so this case proves the OUTER
      // gate suppresses generation on its own rather than merely showing that no
      // title source happened to be available.
      const data: BrandSaveInput = { brandName: PAYLOAD_BRAND_NAME };

      await service.saveBrand(brand, data);

      expect(urlTitleGenerator.requests).toStrictEqual([]);

      // The payload is handed on untouched: no key added, none rewritten.
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

      await service.saveBrand(brand, data);

      // The gate is a CONJUNCTION, so either half suppressing is enough: a usable
      // payload title stops generation even though the entity has nothing and
      // both name sources are populated.
      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(data.urlTitle).toBe('supplied-url-title');
    });

    it('generates from the payload brandName when neither source carries a URL title', async () => {
      const brand = new Brand({ brandID: 'brand-needing-a-url-title' });
      const data: BrandSaveInput = { brandName: PAYLOAD_BRAND_NAME };

      await service.saveBrand(brand, data);

      // CFML parity [model/service/BrandService.cfc:L70]: `tableName="SwBrand"`
      // is the PHYSICAL table name [model/entity/Brand.cfc:L49], handed verbatim
      // to the port. Schema continuity requires the literal - it is not derived
      // from the entity name, not resolved through a table registry and not
      // "corrected" to `Brand`, because slug uniqueness is scoped to that one
      // table's `urlTitle` column.
      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: PAYLOAD_BRAND_NAME, tableName: 'SwBrand' },
      ]);

      // CFML parity [model/service/BrandService.cfc:L70]: the legacy assignment
      // target is the UNQUALIFIED `data.urlTitle` rather than
      // `arguments.data.urlTitle`. In CFML the unqualified name still resolves
      // through the arguments scope, so the caller's struct is mutated in place
      // and the missing qualification changes nothing - it is simply absent. A
      // secondary-register item, NOT a defect, and pinned here as the in-place
      // write it always was.
      expect(data.urlTitle).toBe(PAYLOAD_DERIVED_URL_TITLE);

      // The resolved title reaches persistence through the PAYLOAD, never through
      // the entity: the ported `Brand` publishes no mutator, and the legacy save
      // populated the entity FROM the struct rather than the other way round.
      expect(brand.getUrlTitle()).toBeUndefined();

      // ...and the object the save received is that same object, so what the
      // guard chain resolved is what reaches the store.
      const recordedSave = persistence.saves[0];

      if (recordedSave === undefined) {
        throw new Error('the persistence double recorded no save, so there is nothing to assert');
      }

      expect(recordedSave.data).toBe(data);
      expect(recordedSave.data.urlTitle).toBe(PAYLOAD_DERIVED_URL_TITLE);
    });

    it('falls back to the entity brandName when the payload carries no name', async () => {
      const brand = new Brand({
        brandID: 'brand-with-only-an-entity-name',
        brandName: ENTITY_BRAND_NAME,
      });

      // The `brandName` key is OMITTED rather than present and valueless: absence
      // and present-but-null are different inputs, and absence is the one the
      // legacy `structKeyExists` test at [model/service/BrandService.cfc:L69]
      // answers false for.
      const data: BrandSaveInput = {};

      await service.saveBrand(brand, data);

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

      await service.saveBrand(brand, data);

      // CFML parity [model/service/BrandService.cfc:L69-L72]: L69 tests the
      // payload FIRST and L71 is its `else if`, so the entity name is consulted
      // only where the payload has nothing usable. Pinning both directions - this
      // case and the fallback case above - is what makes the precedence a
      // contract rather than an accident of which one happened to run.
      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: PAYLOAD_BRAND_NAME, tableName: 'SwBrand' },
      ]);
      expect(data.urlTitle).toBe(PAYLOAD_DERIVED_URL_TITLE);
      expect(data.urlTitle).not.toBe(ENTITY_DERIVED_URL_TITLE);
    });

    it('sets no urlTitle and does not throw when neither source carries a name', async () => {
      const brand = new Brand({ brandID: 'brand-with-no-name-anywhere' });
      const data: BrandSaveInput = {};

      // CFML parity [model/service/BrandService.cfc:L73]: there is NO trailing
      // `else`. When neither source yields a name the legacy body sets nothing at
      // all and still returns through the save, so this is a live, reachable
      // pass-through rather than an error path. No fallback, no slug derived from
      // the identifier, no empty-string assignment and no raised error may be
      // added here - and `resolves` is asserted precisely to pin that it does not
      // raise. Whether the store then rejects the row on the `unique="true"`
      // constraint [model/entity/Brand.cfc:L55] belongs to the persistence tier,
      // and the framework validation service that used to answer first is not
      // ported.
      await expect(service.saveBrand(brand, data)).resolves.toBe(persistedBrand);

      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(Object.hasOwn(data, 'urlTitle')).toBe(false);
      expect(data).toStrictEqual({});
    });

    it('treats an empty payload urlTitle as absent and generates', async () => {
      const brand = new Brand({ brandID: 'brand-with-an-empty-payload-title' });
      const data: BrandSaveInput = { urlTitle: '', brandName: PAYLOAD_BRAND_NAME };

      await service.saveBrand(brand, data);

      // CFML parity [model/service/BrandService.cfc:L68]: CFML len() truthiness
      // means an empty string is absent. The gate's second disjunction is
      // `!structKeyExists(data,"urlTitle") || !len(data.urlTitle)`, so a key that
      // EXISTS while holding `''` still opens the gate - which is exactly what
      // separates this shape from the non-empty payload case above.
      //
      // The third emptiness shape - the key present while holding `undefined`,
      // which is what a caller writes after reading a NULL column - reaches the
      // same length test and therefore the same outcome. It is not constructed
      // here: this suite represents absence by omitting the key, and asserting an
      // explicitly valueless key would state the opposite convention for the
      // sibling suites that follow this one.
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

      await service.saveBrand(brand, data);

      // CFML parity [model/service/BrandService.cfc:L68]: the gate's FIRST
      // disjunction is `isNull(brand.getURLTitle()) || !len(brand.getURLTitle())`,
      // so the entity side applies the same len() truthiness and a stored empty
      // string is absent there too.
      //
      // LEGACY-NOTE [model/service/ProductService.cfc:L268]: the product save
      // path is the other half of an asymmetry worth naming - it tests only for
      // null, so a product already holding an empty urlTitle keeps it. That
      // asymmetry belongs to the product path and is preserved there; this
      // assertion pins the BRAND half, which does test length. Neither is
      // normalised towards the other, here or anywhere.
      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: ENTITY_BRAND_NAME, tableName: 'SwBrand' },
      ]);
      expect(data.urlTitle).toBe(ENTITY_DERIVED_URL_TITLE);
    });

    it('folds payload key casing the way a CFML struct does, writing one key and not two', async () => {
      const brand = new Brand({ brandID: 'brand-with-a-differently-cased-payload' });

      // A CFML struct folds key case, so `data.urlTitle = value` UPDATES an
      // existing `URLTitle` entry [model/service/BrandService.cfc:L70]. A plain
      // TypeScript object would instead gain a SECOND entry and leave the first
      // holding its stale value - which a case-insensitive read would then answer
      // with, shadowing the freshly generated title. The payload is typed as a
      // string record rather than as a save input because a caller typed against
      // the save input cannot express a differently-cased key at all: this path
      // opens at an untyped boundary, such as a handler forwarding a parsed
      // request body, which is precisely where CFML used to absorb the difference
      // silently.
      const payload: Record<string, string> = {
        URLTitle: '',
        BrandName: PAYLOAD_BRAND_NAME,
      };

      await service.saveBrand(brand, payload);

      // Both keys answered a case-insensitive read: the empty `URLTitle` opened
      // the gate and `BrandName` supplied the title source.
      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: PAYLOAD_BRAND_NAME, tableName: 'SwBrand' },
      ]);

      // Written back under the key already in use. Asserting the key list in
      // order pins both halves at once: the stored casing survives, and no second
      // `urlTitle` key was added alongside it.
      expect(Object.keys(payload)).toStrictEqual(['URLTitle', 'BrandName']);
      expect(payload['URLTitle']).toBe(PAYLOAD_DERIVED_URL_TITLE);
      expect(payload['BrandName']).toBe(PAYLOAD_BRAND_NAME);
      expect(Object.hasOwn(payload, 'urlTitle')).toBe(false);
    });

    it('delegates persistence with the brand and the payload, and answers the save result', async () => {
      const brand = new Brand({ brandName: ENTITY_BRAND_NAME });
      const data: BrandSaveInput = { urlTitle: 'already-resolved-url-title' };

      // Called exactly as shipped, and the result typed with no cast: under the
      // strict profile that annotation IS the interface-parity check, because a
      // renamed method or a reshaped return would fail to compile here.
      const result: Brand = await service.saveBrand(brand, data);

      // CFML parity [model/service/BrandService.cfc:L76]: the legacy statement is
      // `return super.save(arguments.brand, arguments.data)` - POSITIONAL, where
      // [model/service/RoundingRuleService.cfc:L63] forwards the whole argument
      // collection for the same operation. A gratuitous inconsistency across the
      // slice, recorded so a reviewer can see it was observed rather than missed;
      // a secondary-register item, not a defect. BOTH arguments are forwarded,
      // and by identity, because the payload the save populates from has to be
      // the very object the guard chain wrote into.
      expect(persistence.saves).toHaveLength(1);

      const recordedSave = persistence.saves[0];

      if (recordedSave === undefined) {
        throw new Error('the persistence double recorded no save, so there is nothing to assert');
      }

      expect(recordedSave.brand).toBe(brand);
      expect(recordedSave.data).toBe(data);

      // The RESULT is the save's product - not the input, and not a fresh object.
      // That is the only channel available: the legacy save is where a new brand
      // acquires its generated identifier [model/entity/Brand.cfc:L52,
      // `generator="uuid" unsavedvalue=""`], and the ported entity is immutable,
      // so a caller that read the argument back would still see the unsaved
      // sentinel and could not reference the row it had just saved.
      expect(result).toBe(persistedBrand);
      expect(result).not.toBe(brand);
      expect(result.getBrandID()).toBe(PERSISTED_BRAND_ID);
      expect(result.getUrlTitle()).toBe(PERSISTED_BRAND_URL_TITLE);
      expect(brand.getBrandID()).toBe('');
    });

    it('reaches its collaborators only through the constructor, never through a locator', async () => {
      // Two services, two independent sets of doubles. Were either instance
      // resolving a collaborator from a registry, a module singleton or an
      // ambient request scope, the calls would land somewhere other than the
      // doubles that instance was constructed with, and this case would fail.
      // That is the whole proof, and it is why no container, composition root or
      // locator is imported anywhere in this file.
      const isolatedGenerator = new RecordingUrlTitleGenerator();
      const isolatedPersistedBrand = new Brand({ brandID: 'isolated-persisted-brand' });
      const isolatedPersistence = new RecordingBrandPersistence(isolatedPersistedBrand);
      const isolatedService = new BrandService(isolatedGenerator, isolatedPersistence);

      const brand = new Brand({ brandID: 'brand-routed-to-the-isolated-doubles' });
      const data: BrandSaveInput = { brandName: PAYLOAD_BRAND_NAME };

      const result = await isolatedService.saveBrand(brand, data);

      expect(isolatedGenerator.requests).toStrictEqual([
        { titleString: PAYLOAD_BRAND_NAME, tableName: 'SwBrand' },
      ]);
      expect(isolatedPersistence.saves).toHaveLength(1);
      expect(result).toBe(isolatedPersistedBrand);

      // The doubles built in `beforeEach` were handed to a different instance and
      // recorded nothing, which also demonstrates the per-case isolation every
      // assertion in this file depends on.
      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(persistence.saves).toStrictEqual([]);

      // Reaching any persistence member other than `saveBrand` raises, so every
      // case above is also a standing assertion that the brand save path performs
      // exactly one persistence operation and consults no other collaborator.
      expect(isolatedPersistence.saves).toHaveLength(1);
    });
  });
});
