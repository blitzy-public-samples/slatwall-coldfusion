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
import { BrandService } from '../../../src/services/brandService.js';
import type { BrandFrameworkWrites, BrandSaveInput } from '../../../src/services/brandService.js';

/**
 * Runs `saveBrand` to completion and answers the PERSISTED brand.
 *
 * ★★★ THIS HELPER REPLACES `runSaveExpectingFailClosed`, AND THE REPLACEMENT IS THE
 * WHOLE STORY OF THIS SUITE'S REVISION. That helper existed because every case had to
 * absorb an unconditional rejection: it documented itself as "`saveBrand` no longer
 * returns: finding S-06 established that answering the brand made an unavailable durable
 * write look like a completed one, so the method now raises
 * `BrandPersistenceUnavailableError` after resolving the title."
 *
 * The premise - that the durable write was unavailable - was checked and found to be
 * about a MISSING PORT rather than a missing possibility. `super.save`
 * [model/service/BrandService.cfc:L76] is now performed through a narrow collaborator the
 * service declares and the composition root satisfies, so the method returns again and the
 * cases below assert on its answer.
 *
 * The indirection is kept for the reason it was worth having: every URL-title case runs
 * through one place, so a case that forgot to `await` cannot pass on a floating promise.
 */
async function runSave(service: BrandService, brand: Brand, data: BrandSaveInput): Promise<Brand> {
  return await service.saveBrand(brand, data);
}

/** The identifier {@link RecordingBrandFrameworkWrites} mints for an unsaved brand. */
const MINTED_BRAND_ID = 'minted-by-the-framework-writer';

/** The `modifiedDateTime` the writer double stamps, fixed so an assertion can name it. */
const PERSISTED_AUDIT_TIMESTAMP = new Date('2024-03-04T05:06:07.000Z');

/** The `modifiedByAccountID` the writer double stamps. */
const PERSISTED_AUDIT_ACCOUNT_ID = 'audit-actor-account';

/**
 * In-memory stand-in for the durable half of `super.save`.
 *
 * Records the brand it was handed - AFTER the service's populate step, which is what makes
 * the payload-to-row assertions below possible - and answers a DISTINCT instance carrying a
 * minted identifier and audit stamps, exactly as the real writer does. Answering the
 * argument would let a service that forgot to return the writer's result still pass.
 *
 * It is a single-method interface, not a port: the thirteen-port set is closed and
 * `ProductRepository` is locked at six members, so the contract is declared by the service
 * and satisfied module-locally in `src/handlers/bootstrap.ts` over the request's executor.
 * Doubling it here mirrors that wiring rather than inventing one.
 */
class RecordingBrandFrameworkWrites implements BrandFrameworkWrites {
  readonly saves: Brand[] = [];

  /** The uniqueness probes the service made, in order. */
  readonly uniquenessProbes: { urlTitle: string; brandID: string }[] = [];

  /**
   * Titles the double reports as ALREADY TAKEN, matched case-insensitively.
   *
   * MySQL's default collation is case-insensitive and the real probe is a `WHERE urlTitle = ?`, so a
   * double that compared case-sensitively would let a case-only collision pass a test the datastore
   * would refuse.
   */
  takenUrlTitles: readonly string[] = [];

  isUrlTitleUnique(urlTitle: string, brandID: string): Promise<boolean> {
    this.uniquenessProbes.push({ urlTitle, brandID });

    const wanted = urlTitle.toLowerCase();

    return Promise.resolve(!this.takenUrlTitles.some((taken) => taken.toLowerCase() === wanted));
  }

  saveBrand(brand: Brand): Promise<Brand> {
    this.saves.push(brand);

    return Promise.resolve(
      new Brand({
        brandID: brand.isNew() ? MINTED_BRAND_ID : brand.getBrandID(),
        activeFlag: brand.getActiveFlag(),
        publishedFlag: brand.getPublishedFlag(),
        urlTitle: brand.getUrlTitle(),
        brandName: brand.getBrandName(),
        brandWebsite: brand.getBrandWebsite(),
        remoteID: brand.getRemoteID(),
        products: brand.getProducts(),
        createdDateTime: brand.getCreatedDateTime(),
        createdByAccountID: brand.getCreatedByAccountID(),
        modifiedDateTime: PERSISTED_AUDIT_TIMESTAMP,
        modifiedByAccountID: PERSISTED_AUDIT_ACCOUNT_ID,
      }),
    );
  }
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
// ★★ THE TUPLE HAS EXACTLY TWO ELEMENTS, AND THIS SUITE PINS THAT - WHERE IT USED TO
// PIN ONE. The old note read: "THE TUPLE HAS EXACTLY ONE ELEMENT... An earlier revision
// took a SECOND - a persistence port standing in for `super.save(arguments.brand,
// arguments.data)` [model/service/BrandService.cfc:L76] - and that was wrong... The
// durable half therefore belongs to the composition root, which is what the service's
// LEGACY-NOTE records at the statement that used to perform it."
//
// Every constraint it cited is still binding and still honoured: `super.save` is
// framework-inherited generic Hibachi CRUD that AAP 0.5.3 does not carry forward, there
// is no `BrandDAO.cfc` in the legacy repository, the thirteen-port set is closed, and
// `ProductRepository` is locked at six members. What changed is the CONCLUSION. "The
// durable half belongs to the composition root" was correct - and the composition root
// now SUPPLIES it, as a narrow single-method contract the service declares. So the second
// element is not a legacy collaborator (`dataService`
// [model/service/BrandService.cfc:L51] remains the only one of those, and this is still
// the leanest service in the slice by that measure); it is the persistence the legacy
// component inherited.
//
// The arity assertion below still does its job, inverted: it stops a THIRD collaborator
// reappearing unnoticed, and it would fail if the write were ever hung on a repository
// port instead.
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

/**
 * Build a script URL for the SEC-L rejection cases, ASSEMBLED RATHER THAN WRITTEN LITERALLY.
 *
 * ★ WHY IT IS NOT JUST A STRING LITERAL. ESLint's `no-script-url` refuses a literal `javascript:`
 * anywhere in the tree, and the rule is right to: a script URL in source is nearly always a sink.
 * Here it is the opposite - the value the validator must REFUSE - so the rule's premise does not
 * hold. It is honoured anyway, by composing the scheme, rather than silenced with a disable comment:
 * a suppression sitting inside a security test is indistinguishable, to a later reader, from a
 * suppression hiding a real one. The assembled value is byte-identical to the literal, so the
 * assertions lose nothing.
 */
function scriptUrl(payload: string): string {
  return `${'java'}${'script'}:${payload}`;
}

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
  let frameworkWrites: RecordingBrandFrameworkWrites;
  let service: BrandService;

  beforeEach(() => {
    urlTitleGenerator = new RecordingUrlTitleGenerator();
    frameworkWrites = new RecordingBrandFrameworkWrites();

    // JUDGMENT CALL: the collaborator is handed to the constructor, and that is
    // the whole wiring story. The legacy body reached it through
    // `getDataService()` [model/service/BrandService.cfc:L70, L72], a DI/1
    // convention lookup resolved at run time by scanning component properties;
    // the ported class takes it as an explicit, compile-checked constructor
    // argument instead, which is transformation rule T1. That is why no
    // container, composition root or locator is imported by this file, and why
    // constructing the subject needs nothing but one object.
    //
    // TWO arguments, and they are different KINDS of thing. The first is the ONE
    // collaborator the legacy component declares
    // [model/service/BrandService.cfc:L51]. The second is the durable half of
    // `super.save` [model/service/BrandService.cfc:L76], which the component inherited
    // from `HibachiService` rather than declaring - framework-inherited generic CRUD
    // with no DAO behind it, which is exactly why it arrives as a narrow contract the
    // service declares and the composition root satisfies rather than as a fourteenth
    // port. This suite is typed against whatever the shipped constructor declares, so it
    // follows that surface rather than asserting a shape of its own.
    service = new BrandService(urlTitleGenerator, frameworkWrites);
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

    it('declares exactly two constructor arguments: the URL-title generator and the framework write', () => {
      // COMPILE-TIME half: the annotation only accepts `2`, so widening the
      // constructor to a THIRD collaborator fails the build rather than this
      // assertion. It is the stronger of the two checks and is the reason the
      // tuple type is derived from the shipped class above.
      const declaredArity: BrandServiceCollaborators['length'] = 2;

      // RUN-TIME half, which also states the fact in the reporter's output.
      // `Function.length` counts declared parameters before any default, and the
      // ported constructor declares two.
      expect(declaredArity).toBe(2);
      expect(BrandService.length).toBe(2);

      // ★★ THIS CASE ASSERTED `1` AND IS INVERTED, WITH ITS REASONING PARTLY UPHELD AND
      // PARTLY OVERTURNED. It argued: "THE SECOND COLLABORATOR IS ABSENT DELIBERATELY...
      // A partial brand write would have stored a WRONG ROW - `urlTitle` and `brandName`
      // only, with `activeFlag`, `publishedFlag` and `brandWebsite` dropped and
      // `model/validation/Brand.json` unenforced - which is strictly worse than no write
      // at all. So the flush belongs to the composition root, and this service resolves
      // the title and answers the brand."
      //
      // UPHELD: the flush does belong to the composition root, every port constraint it
      // cited still binds, and a partial write would indeed be worse than none.
      // OVERTURNED: the conclusion that the service must therefore write NOTHING. The
      // hazard was PARTIALNESS, and the write that exists is not partial - all eleven
      // `SwBrand` columns are written, `populate`
      // [org/Hibachi/HibachiTransient.cfc:L169-L205] is reproduced so no supplied column
      // is dropped, and every save-context rule in `model/validation/Brand.json` is
      // enforced. The cases below assert each of those individually.
      expect(
        new BrandService(urlTitleGenerator, new RecordingBrandFrameworkWrites()),
      ).toBeInstanceOf(BrandService);
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

      await runSave(service, brand, data);

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

      await runSave(service, brand, data);

      // The gate is a CONJUNCTION, so either half suppressing is enough: a usable payload title
      // stops generation even though the entity has nothing.
      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(data.urlTitle).toBe('supplied-url-title');
    });

    it('generates from the payload brandName when neither source carries a URL title', async () => {
      const brand = new Brand({ brandID: 'brand-needing-a-url-title' });
      const data: BrandSaveInput = { brandName: PAYLOAD_BRAND_NAME };

      await runSave(service, brand, data);

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

      await runSave(service, brand, data);

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

      await runSave(service, brand, data);

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
      // ★★★ AND THE FAILURE THIS INPUT DOES REACH IS `brandName`, NOT `urlTitle`,
      // WHICH IS THE WHOLE PARITY CLAIM. Two intermediate revisions of this case are
      // worth recording, because the assertion has now been inverted twice and only the
      // third reading is the legacy's.
      //
      // It first asserted `resolves` - proving the no-name path raised nothing of its
      // own. It then asserted `BrandPersistenceUnavailableError`, on the argument that
      // "since finding S-06 that method fails closed on the absent durable write for
      // EVERY input, so `resolves` no longer separates the two possibilities - but the
      // error's TYPE still does".
      //
      // That second reading was right about the METHOD - the type is what separates the
      // possibilities - and wrong about which type. With the durable write in place, an
      // input carrying no name anywhere is refused by `model/validation/Brand.json`
      // itself, and the legacy refused it too: `validate(context="save")`
      // [org/Hibachi/HibachiService.cfc:L151] flagged `brandName` required, `hasErrors()`
      // answered true, and L155 SKIPPED the DAO call. So no row was written then and none
      // is written now.
      //
      // The reported property is `brandName` because the rules run in the JSON's own
      // listed order and `brandName` is first. `urlTitle` is also unset and also
      // required, so a port that evaluated the rules in a different order would report
      // the other one - which is exactly why the property is asserted rather than just
      // the class.
      // ★★★ THE REFUSAL COMES BACK ON THE ENTITY, AND THAT IS THE THIRD READING OF THIS CASE. It
      // asserted `rejects.toBeInstanceOf(BrandValidationError)` and
      // `rejects.toMatchObject({propertyName: 'brandName'})` - a throw. Code review recorded the
      // throw itself as the divergence: `HibachiService.save`
      // [org/Hibachi/HibachiService.cfc:L151-L167] leaves the errors on the entity, skips the flush,
      // and RETURNS THE ENTITY. `src/domain/entities/brand.ts` now publishes that register, so the
      // refusal is read off the answer rather than caught.
      const refused = await service.saveBrand(brand, data);

      expect(refused.hasErrors()).toBe(true);
      expect(refused.hasError('brandName')).toBe(true);
      expect(refused.getError('brandName')).toStrictEqual(['brandName is required']);

      // ★ BOTH FAILED RULES ARE REPORTED, not just the first - `validate()` accumulated every one
      // through `addError` [org/Hibachi/HibachiTransient.cfc:L61-L64] before the flush asked
      // `hasErrors()` once. `urlTitle` is unset and also required, and the ORDER is the JSON's own
      // listed order, which is why the names are asserted as a sequence.
      expect(Object.keys(refused.getErrors())).toStrictEqual(['brandName', 'urlTitle']);

      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(Object.hasOwn(data, 'urlTitle')).toBe(false);
      expect(data).toStrictEqual({});

      // ★ AND NO ROW WAS WRITTEN, which is the assertion that makes the refusal mean
      // something. An answered entity alone would also be satisfied by a method that wrote the row
      // and reported errors anyway.
      expect(frameworkWrites.saves).toStrictEqual([]);

      // ★ NOR WAS THE UNIQUENESS PROBE MADE. It is gated on the `required` half of the SAME rule
      // passing, because probing for an empty candidate would match every row whose title is null.
      expect(frameworkWrites.uniquenessProbes).toStrictEqual([]);
    });

    it('treats an empty payload urlTitle as absent and generates', async () => {
      const brand = new Brand({ brandID: 'brand-with-an-empty-payload-title' });
      const data: BrandSaveInput = { urlTitle: '', brandName: PAYLOAD_BRAND_NAME };

      await runSave(service, brand, data);

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

      await runSave(service, brand, data);

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

      await runSave(service, brand, payload);

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

    it('★★★ REPORTS SUCCESS ONLY BY ANSWERING THE ROW THAT WAS WRITTEN', async () => {
      // ★★★ THIS CASE HAS NOW BEEN INVERTED TWICE, AND THE TWO INVERSIONS TOGETHER ARE
      // THE ENTIRE HISTORY OF THIS METHOD. Both prior readings are recorded because each
      // was right about something.
      //
      // READING ONE - 'answers the brand it was handed, leaving the durable half to the
      // composition root', asserting `result).toBe(brand)`. That encoded as correct the
      // behaviour a security review then raised as S-06 (CWE-703, CWE-840): `saveBrand`
      // "returns a success-shaped mutated Brand but performs no durable write and throws
      // no unavailable-capability error". It was wrong, and its own reasoning shows why:
      // the deferral it rested on named no owner.
      //
      // READING TWO - '★★ NEVER REPORTS SUCCESS for the durable write it cannot
      // perform', asserting a rejection. It argued: "NOTHING under `src/repositories/**`
      // writes `SwBrand`... So the brand a caller 'saved' was discarded, silently, and
      // this suite asserted that outcome was intended. A test that pins a defect as a
      // contract is worse than no test, because it makes the fix look like the
      // regression."
      //
      // Every word of that diagnosis stands. What it got wrong was the REMEDY: it read
      // "no port is available" as "no write is possible", and those are different claims
      // - only the first was ever established. Refusing every save is not a fix for a
      // dropped write; it is the same lost row with a louder failure mode, and it left
      // `saveBrand` unable to do the one thing its name promises. The write now exists as
      // a narrow contract the service declares and the composition root satisfies over
      // the request's executor, so the third reading is the legacy's own: populate,
      // validate, flush, ANSWER THE PERSISTED ROW.
      const brand = new Brand({
        brandID: 'brand-already-carrying-a-title',
        brandName: ENTITY_BRAND_NAME,
      });
      const data: BrandSaveInput = { urlTitle: 'already-resolved-url-title' };

      const result = await runSave(service, brand, data);

      // ★★ THE WRITE HAPPENED, and this is the assertion the two earlier readings each
      // lacked. The writer was reached exactly once, and what reached it is the POPULATED
      // brand - the payload's `urlTitle` folded onto the caller's entity - which is the
      // order `super.save` used [org/Hibachi/HibachiService.cfc:L146, L151, L155].
      expect(frameworkWrites.saves).toHaveLength(1);

      const written = frameworkWrites.saves[0];

      expect(written?.getBrandID()).toBe('brand-already-carrying-a-title');
      expect(written?.getUrlTitle()).toBe('already-resolved-url-title');
      expect(written?.getBrandName()).toBe(ENTITY_BRAND_NAME);

      // ★★★ AND THE ANSWER IS THE WRITER'S, NOT THE ARGUMENT. `toBe` on the caller's
      // instance is precisely what reading one asserted, so `not.toBe` is what pins the
      // correction: a service that populated, validated, flushed and then answered its own
      // argument would still be discarding the persisted state - the audit stamps most of
      // all - and would pass every other assertion in this case.
      expect(result).not.toBe(brand);
      expect(result.getBrandID()).toBe('brand-already-carrying-a-title');
      expect(result.getModifiedDateTime()).toStrictEqual(PERSISTED_AUDIT_TIMESTAMP);
      expect(result.getModifiedByAccountID()).toBe(PERSISTED_AUDIT_ACCOUNT_ID);

      // ★ AND THE CALLER'S INSTANCE IS UNTOUCHED. `Brand` publishes no mutator, so the
      // populated state is a fresh entity; the argument keeps exactly what it arrived
      // with, including the `urlTitle` it never had.
      expect(brand.getUrlTitle()).toBeUndefined();
      expect(brand.getModifiedByAccountID()).toBeUndefined();

      // No generation fired, because the outer gate was suppressed by the title already
      // in the payload, and the payload is otherwise exactly as supplied.
      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(data).toStrictEqual({ urlTitle: 'already-resolved-url-title' });
    });

    it('resolves the ported URL title BEFORE it writes, so the generated title reaches the row', async () => {
      // ★★ THE ORDER IS THE ASSERTION, AND ITS JUSTIFICATION HAS CHANGED WHILE ITS
      // SUBJECT HAS NOT. This case previously read 'still resolves the ported URL title
      // before it refuses, so no ported logic is lost' and argued: "the reason the throw
      // sits at the END of the method rather than at its start. AAP 0.4.1 mandates this
      // file port `saveBrand` L67 with 'the single `dataService` dependency becomes the
      // URL-title port'; that logic is the method's entire ported substance, and a guard
      // clause at the top would have deleted it while appearing to satisfy the review."
      //
      // The AAP citation and the ordering claim both stand. What was provisional was the
      // DESTINATION: the title was resolved and then thrown away with the rest of the
      // save. Now the same ordering carries it into the written row, which is the outcome
      // the ordering existed to make possible. So this case no longer proves "no ported
      // logic is lost on the way to a refusal" - it proves the generated title is what
      // `populate` folds onto the entity the writer receives.
      const brand = new Brand({
        brandID: 'brand-needing-a-generated-title',
        brandName: ENTITY_BRAND_NAME,
      });
      const data: BrandSaveInput = { brandName: PAYLOAD_BRAND_NAME };

      const result = await runSave(service, brand, data);

      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: PAYLOAD_BRAND_NAME, tableName: 'SwBrand' },
      ]);
      expect(data.urlTitle).toBe(PAYLOAD_DERIVED_URL_TITLE);

      // ★ AND IT REACHED THE ROW BY THE PAYLOAD, NOT BY THE ENTITY. The legacy wrote the
      // generated slug into `data` [model/service/BrandService.cfc:L70] and let
      // `super.save` populate the entity from the struct; the ported `Brand` publishes no
      // `urlTitle` mutator, so that is the only route available and this pins that it is
      // the route taken. Were generation moved after populate, the payload assertion above
      // would still pass and this one would not.
      expect(frameworkWrites.saves[0]?.getUrlTitle()).toBe(PAYLOAD_DERIVED_URL_TITLE);
      expect(result.getUrlTitle()).toBe(PAYLOAD_DERIVED_URL_TITLE);
    });

    it('★★ CARRIES EVERY PAYLOAD COLUMN THROUGH TO THE ROW, not just the two it reads', async () => {
      // ★★★ THE DEFECT THIS CASE EXISTS TO RULE OUT, AND ITS ASSERTION HAS MOVED TO WHERE
      // THE COLUMNS ACTUALLY LAND. `BrandSaveInput` used to declare only the two keys the
      // legacy body reads - `urlTitle` [L68, L70, L72] and `brandName` [L69] - which
      // invited the conclusion that the flags, the website and the remote identifier were
      // DROPPED somewhere in this service.
      //
      // The old case answered that by asserting on the PAYLOAD: "TypeScript types erase at
      // run time, this method mutates the caller's object in place rather than copying it,
      // and it answers without rebuilding it. So the payload the composition root goes on
      // to flush carries the COMPLETE column set the caller supplied plus the resolved
      // `urlTitle` - which is exactly what the legacy `super.save(brand, data)` needed,
      // because it populated the entity from the whole struct."
      //
      // Every clause was true, and the conclusion no longer follows FROM IT ALONE, because
      // there is now a populate step in this file rather than a hypothetical one downstream.
      // An intact payload proves nothing about the row if populate reads only two of its
      // keys. So the payload assertion is KEPT - the caller's object must still not be
      // damaged - and the load-bearing assertion is now on the brand the writer received.
      // The input type is widened to all six columns for the same reason.
      //
      // The payload stays typed as a loose record: the casing case above needs that, and
      // the path that carries these keys opens at an untyped boundary such as a handler
      // forwarding a parsed request body.
      const payload: Record<string, unknown> = {
        brandName: PAYLOAD_BRAND_NAME,
        activeFlag: true,
        publishedFlag: false,
        brandWebsite: 'https://example.invalid/acme',
        remoteID: 'legacy-remote-identifier',
      };

      const brand = new Brand({ brandID: 'brand-with-a-full-payload' });
      const result = await runSave(service, brand, payload);

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

      // ★★★ AND ALL SIX COLUMNS REACHED THE ROW. This is the assertion the old reading
      // could not make. `populate` [org/Hibachi/HibachiTransient.cfc:L169-L205] folds every
      // simple key the payload holds, not the two the branch logic reads, so a port that
      // populated only `urlTitle` and `brandName` would satisfy every assertion above and
      // fail here - which is the exact shape of the dropped-column defect.
      const written = frameworkWrites.saves[0];

      expect(written?.getBrandName()).toBe(PAYLOAD_BRAND_NAME);
      expect(written?.getUrlTitle()).toBe(PAYLOAD_DERIVED_URL_TITLE);
      expect(written?.getActiveFlag()).toBe(true);
      expect(written?.getPublishedFlag()).toBe(false);
      expect(written?.getBrandWebsite()).toBe('https://example.invalid/acme');
      expect(written?.getRemoteID()).toBe('legacy-remote-identifier');

      // `brandWebsite` reaches `validate_dataType` [org/Hibachi/HibachiValidationService.cfc:L256-L262]
      // and passes because it is an absolute URL - but nothing is done with the host it
      // names: no reachability check, no name resolution, no request. The legacy
      // `saveBrand` never read the column at all, and the ported validator only inspects
      // the string's shape.
      expect(written?.getBrandID()).toBe('brand-with-a-full-payload');
      expect(result.getBrandID()).toBe('brand-with-a-full-payload');

      // The caller's own instance is untouched, because populate builds a new entity.
      expect(brand.getBrandID()).toBe('brand-with-a-full-payload');
      expect(brand.getBrandName()).toBeUndefined();
      expect(brand.getRemoteID()).toBeUndefined();
    });

    // -----------------------------------------------------------------------
    // THE `unique` HALF OF THE `urlTitle` RULE, NOW A VALIDATION RULE RATHER THAN A WRITE ERROR
    //
    // ★★★ WHY THESE CASES ARE HERE AND NOT IN THE COMPOSITION-ROOT SUITE. The probe used to run
    // inside the writer, which threw `BrandUrlTitleNotUniqueError` on a collision - so a rule
    // declared in [model/validation/Brand.json] alongside `required` was reported by a different
    // mechanism from its own sibling. The legacy evaluated it in `validate`
    // [org/Hibachi/HibachiService.cfc:L151], reaching `HibachiDAO.isUniqueProperty`
    // [org/Hibachi/HibachiDAO.cfc:L130-L147] from there, so the service is where it belongs and the
    // service's suite is where it is asserted.
    // -----------------------------------------------------------------------

    it('★ REFUSES on the entity when the resolved urlTitle is already taken', async () => {
      frameworkWrites.takenUrlTitles = [PAYLOAD_DERIVED_URL_TITLE];

      const brand = new Brand({ brandID: 'brand-whose-slug-collides' });
      const data: BrandSaveInput = { brandName: PAYLOAD_BRAND_NAME };

      const refused = await service.saveBrand(brand, data);

      // The title WAS generated - the collision is discovered after generation, exactly as the legacy
      // discovers it after populate - and the rule then refuses.
      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: PAYLOAD_BRAND_NAME, tableName: 'SwBrand' },
      ]);
      expect(refused.hasErrors()).toBe(true);
      expect(refused.getError('urlTitle')).toStrictEqual([
        'urlTitle is already held by another brand and must be unique',
      ]);

      // ★ AND NOTHING WAS WRITTEN. This is the assertion the old throw-in-the-writer shape could not
      // make honestly: the writer had already begun its work before it decided to refuse.
      expect(frameworkWrites.saves).toStrictEqual([]);
    });

    it('★ EXCLUDES the saving brand from the uniqueness probe, so re-saving is not a self-collision', async () => {
      const brand = new Brand({
        brandID: 'already-persisted-brand',
        urlTitle: 'a-title-this-brand-already-holds',
        brandName: 'Entity Brand',
      });

      await runSave(service, brand, {});

      // `HibachiDAO.isUniqueProperty` [org/Hibachi/HibachiDAO.cfc:L130-L147] excludes the entity's own
      // row, which is what lets an update keep its existing title. The probe therefore carries BOTH
      // the candidate and the identifier to exclude.
      expect(frameworkWrites.uniquenessProbes).toStrictEqual([
        { urlTitle: 'a-title-this-brand-already-holds', brandID: 'already-persisted-brand' },
      ]);
      expect(frameworkWrites.saves).toHaveLength(1);
    });

    it('★ probes with the EMPTY identifier for a new brand, which excludes nothing', async () => {
      // A new brand's identifier is the empty string [model/entity/Brand.cfc:L52, `unsavedvalue=""`],
      // which matches no stored row - so nothing is excluded, which is exactly right for an entity
      // that has no row yet.
      const brand = new Brand({ brandID: '' });
      const data: BrandSaveInput = { brandName: PAYLOAD_BRAND_NAME };

      await runSave(service, brand, data);

      expect(frameworkWrites.uniquenessProbes).toStrictEqual([
        { urlTitle: PAYLOAD_DERIVED_URL_TITLE, brandID: '' },
      ]);
    });

    it('★ treats a CASE-DIFFERING stored title as a collision, because MySQL does', async () => {
      // The real probe is `WHERE urlTitle = ?` against a column under MySQL's default
      // case-insensitive collation, so a stored `ACME` collides with a candidate `acme`. A port that
      // compared case-sensitively would report the save as clean and then hit the column constraint.
      frameworkWrites.takenUrlTitles = [PAYLOAD_DERIVED_URL_TITLE.toUpperCase()];

      const brand = new Brand({ brandID: 'brand-with-a-case-differing-collision' });

      const refused = await service.saveBrand(brand, { brandName: PAYLOAD_BRAND_NAME });

      expect(refused.hasErrors()).toBe(true);
      expect(frameworkWrites.saves).toStrictEqual([]);
    });

    // -----------------------------------------------------------------------
    // THE `dataType` HALF OF THE RULE SET: `brandWebsite` MUST BE A URL CFML WOULD HAVE CALLED ONE
    //
    // ★★★ WHY THESE CASES EXIST (SEC-L, CWE-20, POTENTIAL CWE-79). The ported validator was
    // `URL.canParse(value)`, which accepts EVERY scheme a parser can read - including
    // `javascript:` and `data:`. That was wider than the thing it stood in for: CFML's
    // reference defines the `url` validation type as an http, https, ftp, file, mailto or
    // news URL, a CLOSED set of six, and `{"dataType":"url"}` [model/validation/Brand.json]
    // reaches exactly that validator through `validate_dataType`
    // [org/Hibachi/HibachiValidationService.cfc:L256-L259]. So every value the negatives below
    // refuse is a value the LEGACY refused too, and the fix is a narrowing toward parity
    // rather than a divergence from it.
    //
    // The positives are asserted alongside the negatives on purpose: an over-correction to
    // http/https only would be its own fidelity defect, and these cases are what would catch
    // it. The stakes are concrete - the stored column is rendered by `formatValue_url`, whose
    // body interpolates it into an anchor with no encoding whatsoever
    // [org/Hibachi/HibachiUtilityService.cfc:L66-L68], reached from both admin brand views
    // [admin/views/entity/detailbrand.cfm:L60, admin/views/entity/listbrand.cfm:L59]. That
    // renderer is out-of-scope framework code [AAP 0.2.2] and is untouched, which is the
    // argument for refusing the value at the write this migration does own.
    // -----------------------------------------------------------------------

    it.each([
      ['http', 'http://brand.example.invalid/catalog'],
      ['https', 'https://brand.example.invalid/catalog'],
      ['ftp', 'ftp://files.example.invalid/brand-assets'],
      ['file', 'file:///srv/brand/assets'],
      ['mailto', 'mailto:brand-contact@example.invalid'],
      ['news', 'news:comp.example.brand'],
      // Upper-cased, because CFML's validator was case-insensitive and the WHATWG parser
      // lower-cases the scheme itself - so no case folding is needed for this to pass, and a
      // port that compared raw input against lower-case literals would fail here.
      ['HTTPS upper-cased', 'HTTPS://brand.example.invalid/catalog'],
    ])(
      '★ ACCEPTS a %s brandWebsite, because isValid("url") named that protocol',
      async (_label, brandWebsite) => {
        const brand = new Brand({ brandID: 'brand-with-an-accepted-scheme' });

        const saved = await runSave(service, brand, {
          brandName: PAYLOAD_BRAND_NAME,
          brandWebsite,
        });

        expect(saved.hasErrors()).toBe(false);
        expect(saved.getError('brandWebsite')).toStrictEqual([]);
        expect(frameworkWrites.saves).toHaveLength(1);
        expect(frameworkWrites.saves[0]?.getBrandWebsite()).toBe(brandWebsite);
      },
    );

    it.each([
      // The two that make this a security finding rather than a tidiness one. Both PARSE, so
      // both reached the row under `URL.canParse`.
      ['a javascript: script URL', scriptUrl('alert(document.cookie)')],
      ['a data: URL carrying markup', 'data:text/html,<script>alert(1)</script>'],
      // Tab and newline are STRIPPED by the WHATWG parser, so this normalises to
      // `javascript:alert(1)` rather than to some unknown scheme - the refusal has to come
      // from the protocol test, not from a parse failure.
      ['an obfuscated javascript: URL', 'java\tscri\npt:alert(1)'],
      // An invented scheme. CFML named six; this is not one of them.
      ['an invented custom scheme', 'myapp://brand/launch'],
      // `vbscript:` is the historical sibling of the first case.
      ['a vbscript: URL', 'vbscript:msgbox(1)'],
      // Relative and bare-host forms, which CFML also refused because it required an
      // ABSOLUTE URL. These fail at the parse rather than at the protocol test, and they are
      // asserted so the parse half of the check is not lost in the change.
      ['a bare host with no scheme', 'brand.example.invalid'],
      ['a site-relative path', '/brands/acme'],
    ])('★★★ REFUSES %s on the entity, and writes nothing', async (_label, brandWebsite) => {
      const brand = new Brand({ brandID: 'brand-with-a-refused-scheme' });

      const refused = await service.saveBrand(brand, {
        brandName: PAYLOAD_BRAND_NAME,
        brandWebsite,
      });

      // Reported as an error ON THE ENTITY, the way `validate` recorded every failed rule
      // through `addError` [org/Hibachi/HibachiTransient.cfc:L61-L64] - not thrown.
      expect(refused.hasErrors()).toBe(true);
      expect(refused.getError('brandWebsite')).toStrictEqual(['brandWebsite must be a valid URL']);

      // ★ AND THE ROW WAS NEVER WRITTEN. This is the assertion that makes the finding closed
      // rather than merely reported: a validator that collected the error but let the save
      // through would satisfy the assertion above and fail this one.
      expect(frameworkWrites.saves).toStrictEqual([]);
    });

    it('★ still treats an ABSENT brandWebsite as valid, because validate_dataType passes on null', async () => {
      // `isNull(propertyValue) || isValid(...)` [org/Hibachi/HibachiValidationService.cfc:L259]
      // - so a brand that names no website saves. The scheme allow-list must not have turned
      // the optional column into a required one.
      const brand = new Brand({ brandID: 'brand-with-no-website' });

      const saved = await runSave(service, brand, { brandName: PAYLOAD_BRAND_NAME });

      expect(saved.hasErrors()).toBe(false);
      expect(frameworkWrites.saves).toHaveLength(1);
      expect(frameworkWrites.saves[0]?.getBrandWebsite()).toBeUndefined();
    });

    it.each([
      ['an empty string', ''],
      ['a whitespace-only string', '   '],
    ])(
      '★★ CLEARS rather than refuses %s, because populate nulls a blank BEFORE the rule sees it',
      async (_label, brandWebsite) => {
        // ★ THIS CASE EXISTS BECAUSE THE OBVIOUS EXPECTATION IS WRONG, AND IT WAS WRITTEN AS A
        // NEGATIVE FIRST AND CORRECTED BY THE IMPLEMENTATION. A blank does NOT reach the URL
        // test at all: `populate` transcribes `trim(...) == "" && !notNull -> _setProperty(name)`
        // [org/Hibachi/HibachiTransient.cfc:L194-L195], so a supplied blank NULLS the column -
        // and `validate_dataType` then passes on null [org/Hibachi/HibachiValidationService.cfc:L259].
        // Clearing a website is a legitimate edit, and refusing it would have been a fabricated
        // restriction introduced by the SEC-L fix rather than a consequence of it.
        const brand = new Brand({
          brandID: 'brand-clearing-its-website',
          brandWebsite: 'https://brand.example.invalid/catalog',
        });

        const saved = await runSave(service, brand, {
          brandName: PAYLOAD_BRAND_NAME,
          brandWebsite,
        });

        expect(saved.hasErrors()).toBe(false);
        expect(frameworkWrites.saves).toHaveLength(1);
        expect(frameworkWrites.saves[0]?.getBrandWebsite()).toBeUndefined();
      },
    );

    it('★ refuses a script URL that arrives on the ENTITY rather than in the payload', async () => {
      // The rule runs on the POPULATED brand, so a value the caller set on the instance and
      // did NOT resupply in the payload is still tested. A validator that inspected only the
      // payload would let this one through - and this is the realistic shape for an update,
      // where the loaded row carries the column and the payload changes something else.
      const brand = new Brand({
        brandID: 'brand-carrying-a-stored-script-url',
        urlTitle: 'a-title-this-brand-already-holds',
        brandName: 'Entity Brand',
        brandWebsite: scriptUrl('alert(1)'),
      });

      const refused = await service.saveBrand(brand, { brandName: PAYLOAD_BRAND_NAME });

      expect(refused.hasErrors()).toBe(true);
      expect(refused.getError('brandWebsite')).toStrictEqual(['brandWebsite must be a valid URL']);
      expect(frameworkWrites.saves).toStrictEqual([]);
    });

    it('reaches BOTH collaborators only through the constructor, never through a locator', async () => {
      // Two services, FOUR independent doubles. Were either instance resolving a
      // collaborator from a registry, a module singleton or an ambient request
      // scope, the call would land somewhere other than the double that instance
      // was constructed with, and this case would fail. That is the whole proof,
      // and it is why no container, composition root or locator is imported
      // anywhere in this file.
      //
      // ★ THE WRITE COLLABORATOR IS NOW HALF OF THAT PROOF, AND IT IS THE HALF THAT
      // MATTERS MOST. The composition root builds `SqlBrandFrameworkWrites` PER REQUEST
      // because it closes over the request's audit actor, so a brand service that reached
      // its writer through module state would stamp one request's account onto another
      // request's row. This case is where that cannot happen unnoticed: the isolated
      // instance's write must land in the isolated writer and nowhere else.
      const isolatedGenerator = new RecordingUrlTitleGenerator();
      const isolatedWrites = new RecordingBrandFrameworkWrites();
      const isolatedService = new BrandService(isolatedGenerator, isolatedWrites);

      const brand = new Brand({ brandID: 'brand-routed-to-the-isolated-double' });
      const data: BrandSaveInput = { brandName: PAYLOAD_BRAND_NAME };

      await runSave(isolatedService, brand, data);

      expect(isolatedGenerator.requests).toStrictEqual([
        { titleString: PAYLOAD_BRAND_NAME, tableName: 'SwBrand' },
      ]);
      expect(data.urlTitle).toBe(PAYLOAD_DERIVED_URL_TITLE);
      expect(isolatedWrites.saves).toHaveLength(1);
      expect(isolatedWrites.saves[0]?.getUrlTitle()).toBe(PAYLOAD_DERIVED_URL_TITLE);

      // The doubles built in `beforeEach` were handed to a different instance and
      // recorded nothing, which also demonstrates the per-case isolation every
      // assertion in this file depends on.
      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(frameworkWrites.saves).toStrictEqual([]);
    });
  });
});
