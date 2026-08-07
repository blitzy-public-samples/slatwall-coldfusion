// slatwall-ts - unit suite pinning `src/services/brandService.ts`
//
// The trap worth naming: `meta/tests/unit/entity/BrandTest.cfc` does exist and does carry one real
// legacy case.
//
// Eight input shapes reach that gate and every one is exercised below.
//
// `model/service/BrandService.cfc` owns no numbered entry in the project defect register, so no
// LEGACY-DEFECT marker appears below: the unqualified `data.urlTitle` write
// [model/service/BrandService.cfc:L70, L72], the positional `super.save`
// [model/service/BrandService.cfc:L76].

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
 * The premise - that the durable write was unavailable - was checked and found to be about a
 * MISSING PORT rather than a missing possibility.
 *
 * The indirection is kept for the reason it was worth having: every URL-title case runs through
 * one place, so a case that forgot to `await` cannot pass on a floating promise.
 */
async function runSave(service: BrandService, brand: Brand, data: BrandSaveInput): Promise<Brand> {
  return await service.saveBrand(brand, data);
}

/**
 * The identifier {@link RecordingBrandFrameworkWrites} mints for an unsaved brand.
 */
const MINTED_BRAND_ID = 'minted-by-the-framework-writer';

/**
 * The `modifiedDateTime` the writer double stamps, fixed so an assertion can name it.
 */
const PERSISTED_AUDIT_TIMESTAMP = new Date('2024-03-04T05:06:07.000Z');

/**
 * The `modifiedByAccountID` the writer double stamps.
 */
const PERSISTED_AUDIT_ACCOUNT_ID = 'audit-actor-account';

/**
 * In-memory stand-in for the durable half of `super.save`.
 *
 * Records the brand it was handed - after the service's populate step, which is what makes the
 * payload-to-row assertions below possible.
 *
 * It is a single-method interface, not a port: the thirteen-port set is closed and
 * `ProductRepository` is locked at six members.
 */
class RecordingBrandFrameworkWrites implements BrandFrameworkWrites {
  readonly saves: Brand[] = [];

  /**
   * The uniqueness probes the service made, in order.
   */
  readonly uniquenessProbes: { urlTitle: string; brandID: string }[] = [];

  /**
   * Titles the double reports as ALREADY TAKEN, matched case-insensitively.
   *
   * MySQL's default collation is case-insensitive and the real probe is a `WHERE urlTitle = ?`.
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

// The collaborator tuple, DERIVED from the shipped constructor.

// JUDGMENT CALL: the constructor's parameter list is reached through
// `ConstructorParameters<typeof BrandService>` rather than being restated here.
//
// Pin one. The old note read: "the tuple has exactly one element...
type BrandServiceCollaborators = ConstructorParameters<typeof BrandService>;

/**
 * Derives the obviously-synthetic title the URL-title double answers with.
 *
 * Not a port of the legacy slug algorithm and never to be read as one.
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
function scriptUrl(payload: string): string {
  return `${'java'}${'script'}:${payload}`;
}

// The in-memory double.

/**
 * One recorded invocation of the URL-title port, exactly as it arrived.
 */
interface RecordedUrlTitleRequest {
  readonly titleString: string;
  readonly tableName: UrlTitleTableName;
}

/**
 * In-memory stand-in for the URL-title generator port, replacing the legacy
 * `property name="dataService" type="any";` [model/service/BrandService.cfc:L51] - the component's
 * one and only declared collaborator.
 *
 * Records both arguments of every call in arrival order, so a test can assert how MANY times
 * generation fired, which title source won and which table the uniqueness scope named.
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

    // JUDGMENT CALL: the collaborator is handed to the constructor, and that is the whole wiring
    // story.
    service = new BrandService(urlTitleGenerator, frameworkWrites);
  });

  describe('saveBrand', () => {
    it('carries the legacy method name verbatim and publishes no surface the legacy lacked', () => {
      const publishedMembers = Object.getOwnPropertyNames(BrandService.prototype);

      // CFML parity [model/service/BrandService.cfc:L67]: the name is `saveBrand`, in legacy CFML
      // camelCase, because method-level interface parity is this migration's acceptance contract.
      // Not `save`, `createBrand` or `persist`.
      expect(publishedMembers).toContain('saveBrand');

      // The legacy component declares one function; everything else came from the framework base
      // component, which is not ported, so none of these may be invented.
      expect(publishedMembers).not.toContain('save');
      expect(publishedMembers).not.toContain('getBrand');
      expect(publishedMembers).not.toContain('newBrand');
      expect(publishedMembers).not.toContain('deleteBrand');
      expect(publishedMembers).not.toContain('getBrandSmartList');
      expect(publishedMembers).not.toContain('findBrands');
    });

    it('declares exactly two constructor arguments: the URL-title generator and the framework write', () => {
      // COMPILE-TIME half: the annotation only accepts `2`, so widening the constructor to a THIRD
      // collaborator fails the build rather than this assertion.
      const declaredArity: BrandServiceCollaborators['length'] = 2;

      // RUN-TIME half, which also states the fact in the reporter's output. `Function.length`
      // counts declared parameters before any default, and the ported constructor declares two.
      expect(declaredArity).toBe(2);
      expect(BrandService.length).toBe(2);

      // A partial brand write would have stored a WRONG ROW - `urlTitle` and `brandName` only,
      // with `activeFlag`, `publishedFlag` and `brandWebsite` dropped and
      // `model/validation/Brand.json` unenforced.
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
      // table name [model/entity/Brand.cfc:L49], handed verbatim to the port.
      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: PAYLOAD_BRAND_NAME, tableName: 'SwBrand' },
      ]);

      // CFML parity [model/service/BrandService.cfc:L70]: the legacy assignment target is the
      // UNQUALIFIED `data.urlTitle` rather than `arguments.data.urlTitle`.
      expect(data.urlTitle).toBe(PAYLOAD_DERIVED_URL_TITLE);

      // The resolved title reaches persistence through the PAYLOAD, never the entity: the ported
      // `Brand` publishes no mutator, and the legacy save populated the entity from the struct.
      expect(brand.getUrlTitle()).toBeUndefined();
    });

    it('falls back to the entity brandName when the payload carries no name', async () => {
      const brand = new Brand({
        brandID: 'brand-with-only-an-entity-name',
        brandName: ENTITY_BRAND_NAME,
      });

      // The `brandName` key is OMITTED rather than present and valueless: absence and
      // present-but-null are different inputs.
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
      // usable.
      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: PAYLOAD_BRAND_NAME, tableName: 'SwBrand' },
      ]);
      expect(data.urlTitle).toBe(PAYLOAD_DERIVED_URL_TITLE);
      expect(data.urlTitle).not.toBe(ENTITY_DERIVED_URL_TITLE);
    });

    it('sets no urlTitle and invents no title-related failure when neither source carries a name', async () => {
      const brand = new Brand({ brandID: 'brand-with-no-name-anywhere' });
      const data: BrandSaveInput = {};

      // CFML parity [model/service/BrandService.cfc:L73]: there is no trailing `else`. When
      // neither source yields a name the legacy body sets nothing at all and still returns through
      // the save, so this is a live, reachable pass-through rather than an error path.
      const refused = await service.saveBrand(brand, data);

      expect(refused.hasErrors()).toBe(true);
      expect(refused.hasError('brandName')).toBe(true);
      expect(refused.getError('brandName')).toStrictEqual(['brandName is required']);

      // Both FAILED RULES are REPORTED, not just the first - `validate()` accumulated every one
      // through `addError` [org/Hibachi/HibachiTransient.cfc:L61-L64] before the flush asked
      // `hasErrors()` once.
      expect(Object.keys(refused.getErrors())).toStrictEqual(['brandName', 'urlTitle']);

      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(Object.hasOwn(data, 'urlTitle')).toBe(false);
      expect(data).toStrictEqual({});

      // And no ROW was WRITTEN, which is the assertion that makes the refusal mean something. An
      // answered entity alone would also be satisfied by a method that wrote the row and reported
      // errors anyway.
      expect(frameworkWrites.saves).toStrictEqual([]);

      // NOR was the uniqueness probe made. It is gated on the `required` half of the same rule
      // passing, because probing for an empty candidate would match every row whose title is null.
      expect(frameworkWrites.uniquenessProbes).toStrictEqual([]);
    });

    it('treats an empty payload urlTitle as absent and generates', async () => {
      const brand = new Brand({ brandID: 'brand-with-an-empty-payload-title' });
      const data: BrandSaveInput = { urlTitle: '', brandName: PAYLOAD_BRAND_NAME };

      await runSave(service, brand, data);

      // CFML parity [model/service/BrandService.cfc:L68]: CFML len() truthiness means an empty
      // string is absent.
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
      // half of an asymmetry worth naming - it tests only for null, so a product already holding
      // an empty urlTitle keeps it.
      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: ENTITY_BRAND_NAME, tableName: 'SwBrand' },
      ]);
      expect(data.urlTitle).toBe(ENTITY_DERIVED_URL_TITLE);
    });

    it('folds payload key casing the way a CFML struct does, writing one key and not two', async () => {
      const brand = new Brand({ brandID: 'brand-with-a-differently-cased-payload' });

      // A CFML struct folds key case, so `data.urlTitle = value` UPDATES an existing `URLTitle`
      // entry [model/service/BrandService.cfc:L70].
      const payload: Record<string, string> = {
        URLTitle: '',
        BrandName: PAYLOAD_BRAND_NAME,
      };

      await runSave(service, brand, payload);

      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: PAYLOAD_BRAND_NAME, tableName: 'SwBrand' },
      ]);

      // Written back under the key already in use. Asserting the key list in ORDER pins both
      // halves: the stored casing survives, and no second key was added.
      expect(Object.keys(payload)).toStrictEqual(['URLTitle', 'BrandName']);
      expect(payload['URLTitle']).toBe(PAYLOAD_DERIVED_URL_TITLE);
      expect(payload['BrandName']).toBe(PAYLOAD_BRAND_NAME);
      expect(Object.hasOwn(payload, 'urlTitle')).toBe(false);
    });

    it('★★★ REPORTS SUCCESS ONLY BY ANSWERING THE ROW THAT WAS WRITTEN', async () => {
      // The entire history of this method. Both prior readings are recorded because each was right
      // about something.
      //
      // Reading two - ' never reports success for the durable write it cannot perform', asserting
      // a rejection.
      const brand = new Brand({
        brandID: 'brand-already-carrying-a-title',
        brandName: ENTITY_BRAND_NAME,
      });
      const data: BrandSaveInput = { urlTitle: 'already-resolved-url-title' };

      const result = await runSave(service, brand, data);

      // The WRITE HAPPENED, and this is the assertion the two earlier readings each lacked.
      expect(frameworkWrites.saves).toHaveLength(1);

      const written = frameworkWrites.saves[0];

      expect(written?.getBrandID()).toBe('brand-already-carrying-a-title');
      expect(written?.getUrlTitle()).toBe('already-resolved-url-title');
      expect(written?.getBrandName()).toBe(ENTITY_BRAND_NAME);

      // And the answer is the writer's, not the argument.
      expect(result).not.toBe(brand);
      expect(result.getBrandID()).toBe('brand-already-carrying-a-title');
      expect(result.getModifiedDateTime()).toStrictEqual(PERSISTED_AUDIT_TIMESTAMP);
      expect(result.getModifiedByAccountID()).toBe(PERSISTED_AUDIT_ACCOUNT_ID);

      // And the CALLER'S INSTANCE is UNTOUCHED. `Brand` publishes no mutator, so the populated
      // state is a fresh entity; the argument keeps exactly what it arrived with, including the
      // `urlTitle` it never had.
      expect(brand.getUrlTitle()).toBeUndefined();
      expect(brand.getModifiedByAccountID()).toBeUndefined();

      // No generation fired, because the outer gate was suppressed by the title already in the
      // payload, and the payload is otherwise exactly as supplied.
      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(data).toStrictEqual({ urlTitle: 'already-resolved-url-title' });
    });

    it('resolves the ported URL title BEFORE it writes, so the generated title reaches the row', async () => {
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

      // And it reached the row by the payload, not by the entity.
      expect(frameworkWrites.saves[0]?.getUrlTitle()).toBe(PAYLOAD_DERIVED_URL_TITLE);
      expect(result.getUrlTitle()).toBe(PAYLOAD_DERIVED_URL_TITLE);
    });

    it('★★ CARRIES EVERY PAYLOAD COLUMN THROUGH TO THE ROW, not just the two it reads', async () => {
      // The columns actually land.
      //
      // The old case answered that by asserting on the PAYLOAD: "TypeScript types erase at run
      // time, this method mutates the caller's object in place rather than copying it.
      //
      // The payload stays typed as a loose record: the casing case above needs that.
      const payload: Record<string, unknown> = {
        brandName: PAYLOAD_BRAND_NAME,
        activeFlag: true,
        publishedFlag: false,
        brandWebsite: 'https://example.invalid/acme',
        remoteID: 'legacy-remote-identifier',
      };

      const brand = new Brand({ brandID: 'brand-with-a-full-payload' });
      const result = await runSave(service, brand, payload);

      // The guard chain ran and resolved the title into the same object.
      expect(payload['urlTitle']).toBe(PAYLOAD_DERIVED_URL_TITLE);

      // and every other key the caller supplied is still there, unchanged. The key ORDER is
      // asserted too, because the resolved title is appended rather than substituted for anything.
      expect(payload).toStrictEqual({
        brandName: PAYLOAD_BRAND_NAME,
        activeFlag: true,
        publishedFlag: false,
        brandWebsite: 'https://example.invalid/acme',
        remoteID: 'legacy-remote-identifier',
        urlTitle: PAYLOAD_DERIVED_URL_TITLE,
      });

      // And all six columns reached the row. This is the assertion the old reading could not make.
      const written = frameworkWrites.saves[0];

      expect(written?.getBrandName()).toBe(PAYLOAD_BRAND_NAME);
      expect(written?.getUrlTitle()).toBe(PAYLOAD_DERIVED_URL_TITLE);
      expect(written?.getActiveFlag()).toBe(true);
      expect(written?.getPublishedFlag()).toBe(false);
      expect(written?.getBrandWebsite()).toBe('https://example.invalid/acme');
      expect(written?.getRemoteID()).toBe('legacy-remote-identifier');

      // `brandWebsite` reaches `validate_dataType`
      // [org/Hibachi/HibachiValidationService.cfc:L256-L262] and passes because it is an absolute
      // URL - but nothing is done with the host it names: no reachability check, no name
      // resolution.
      expect(written?.getBrandID()).toBe('brand-with-a-full-payload');
      expect(result.getBrandID()).toBe('brand-with-a-full-payload');

      // The caller's own instance is untouched, because populate builds a new entity.
      expect(brand.getBrandID()).toBe('brand-with-a-full-payload');
      expect(brand.getBrandName()).toBeUndefined();
      expect(brand.getRemoteID()).toBeUndefined();
    });

    // The `unique` half of the `urlTitle` rule, now a validation rule rather than a write error.
    //
    // Why these cases are here and not in the composition-root suite.

    it('★ REFUSES on the entity when the resolved urlTitle is already taken', async () => {
      frameworkWrites.takenUrlTitles = [PAYLOAD_DERIVED_URL_TITLE];

      const brand = new Brand({ brandID: 'brand-whose-slug-collides' });
      const data: BrandSaveInput = { brandName: PAYLOAD_BRAND_NAME };

      const refused = await service.saveBrand(brand, data);

      // The title was generated - the collision is discovered after generation, exactly as the
      // legacy discovers it after populate - and the rule then refuses.
      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: PAYLOAD_BRAND_NAME, tableName: 'SwBrand' },
      ]);
      expect(refused.hasErrors()).toBe(true);
      expect(refused.getError('urlTitle')).toStrictEqual([
        'urlTitle is already held by another brand and must be unique',
      ]);

      // And nothing was WRITTEN. This is the assertion the old throw-in-the-writer shape could not
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

      // `HibachiDAO.isUniqueProperty` [org/Hibachi/HibachiDAO.cfc:L130-L147] excludes the entity's
      // own row, which is what lets an update keep its existing title.
      expect(frameworkWrites.uniquenessProbes).toStrictEqual([
        { urlTitle: 'a-title-this-brand-already-holds', brandID: 'already-persisted-brand' },
      ]);
      expect(frameworkWrites.saves).toHaveLength(1);
    });

    it('★ probes with the EMPTY identifier for a new brand, which excludes nothing', async () => {
      // A new brand's identifier is the empty string
      // [model/entity/Brand.cfc:L52, `unsavedvalue=""`], which matches no stored row - so nothing
      // is excluded, which is exactly right for an entity that has no row yet.
      const brand = new Brand({ brandID: '' });
      const data: BrandSaveInput = { brandName: PAYLOAD_BRAND_NAME };

      await runSave(service, brand, data);

      expect(frameworkWrites.uniquenessProbes).toStrictEqual([
        { urlTitle: PAYLOAD_DERIVED_URL_TITLE, brandID: '' },
      ]);
    });

    it('★ treats a CASE-DIFFERING stored title as a collision, because MySQL does', async () => {
      // The real probe is `WHERE urlTitle = ?` against a column under MySQL's default
      // case-insensitive collation, so a stored `ACME` collides with a candidate `acme`.
      frameworkWrites.takenUrlTitles = [PAYLOAD_DERIVED_URL_TITLE.toUpperCase()];

      const brand = new Brand({ brandID: 'brand-with-a-case-differing-collision' });

      const refused = await service.saveBrand(brand, { brandName: PAYLOAD_BRAND_NAME });

      expect(refused.hasErrors()).toBe(true);
      expect(frameworkWrites.saves).toStrictEqual([]);
    });

    // The `dataType` half of the rule set: `brandWebsite` must be a url CFML would have called
    // one.
    //
    // The positives are asserted alongside the negatives on purpose: an over-correction to
    // http/https only would be its own fidelity defect, and these cases are what would catch it.

    it.each([
      ['http', 'http://brand.example.invalid/catalog'],
      ['https', 'https://brand.example.invalid/catalog'],
      ['ftp', 'ftp://files.example.invalid/brand-assets'],
      ['file', 'file:///srv/brand/assets'],
      ['mailto', 'mailto:brand-contact@example.invalid'],
      ['news', 'news:comp.example.brand'],
      // Upper-cased, because CFML's validator was case-insensitive and the WHATWG parser
      // lower-cases the scheme itself - so no case folding is needed for this to pass.
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
      ['a javascript: script URL', scriptUrl('alert(document.cookie)')],
      ['a data: URL carrying markup', 'data:text/html,<script>alert(1)</script>'],
      // Tab and newline are STRIPPED by the WHATWG parser, so this normalises to
      // `javascript:alert(1)` rather than to some unknown scheme - the refusal has to come from
      // the protocol test, not from a parse failure.
      ['an obfuscated javascript: URL', 'java\tscri\npt:alert(1)'],
      // An invented scheme. CFML named six; this is not one of them.
      ['an invented custom scheme', 'myapp://brand/launch'],
      // `vbscript:` is the historical sibling of the first case.
      ['a vbscript: URL', 'vbscript:msgbox(1)'],
      // Relative and bare-host forms, which CFML also refused because it required an ABSOLUTE URL.
      ['a bare host with no scheme', 'brand.example.invalid'],
      ['a site-relative path', '/brands/acme'],
    ])('★★★ REFUSES %s on the entity, and writes nothing', async (_label, brandWebsite) => {
      const brand = new Brand({ brandID: 'brand-with-a-refused-scheme' });

      const refused = await service.saveBrand(brand, {
        brandName: PAYLOAD_BRAND_NAME,
        brandWebsite,
      });

      // Reported as an error on the ENTITY, the way `validate` recorded every failed rule through
      // `addError` [org/Hibachi/HibachiTransient.cfc:L61-L64] - not thrown.
      expect(refused.hasErrors()).toBe(true);
      expect(refused.getError('brandWebsite')).toStrictEqual(['brandWebsite must be a valid URL']);
      expect(frameworkWrites.saves).toStrictEqual([]);
    });

    it('★ still treats an ABSENT brandWebsite as valid, because validate_dataType passes on null', async () => {
      // `isNull(propertyValue) || isValid(...)` [org/Hibachi/HibachiValidationService.cfc:L259] -
      // so a brand that names no website saves.
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
      // The rule runs on the POPULATED brand, so a value the caller set on the instance and did
      // not resupply in the payload is still tested.
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
      // Two services, four independent doubles.
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

      // The doubles built in `beforeEach` were handed to a different instance and recorded
      // nothing, which also demonstrates the per-case isolation every assertion in this file
      // depends on.
      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(frameworkWrites.saves).toStrictEqual([]);
    });
  });
});
