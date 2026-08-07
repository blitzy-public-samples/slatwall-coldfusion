// slatwall-ts - Brand save-override service.
//
// PORTED from: model/service/BrandService.cfc (90 lines), as a 1:1 logic extraction.
//
// LEGACY-NOTE [model/service/BrandService.cfc:L67]: `saveBrand` is the one `AND` only function
// declared anywhere in the 90-line legacy component.

// A VALUE import, where this was `import type` before.
import { Brand } from '../domain/entities/brand.js';
import type { UrlTitleGenerator } from '../domain/ports/urlTitleGenerator.js';
import { structFindKey, structGet, structKeyExists } from '../lib/cfml/struct.js';
import type { CfBooleanInput } from '../lib/cfml/truthiness.js';
import { cfLen, cfTruthy, isNullish } from '../lib/cfml/truthiness.js';

/**
 * The mutable data payload handed to {@link BrandService.saveBrand}, standing in for the legacy
 * `required struct data` argument [model/service/BrandService.cfc:L67].
 *
 * What is still not declared, deliberately: `brandID`, the four audit columns, and every
 * association.
 *
 * That the guard chain treats identically, and every one of them must work.
 */
export interface BrandSaveInput {
  /**
   * The URL title. Read by the outer gate [model/service/BrandService.cfc:L68] and written by
   * either inner branch [model/service/BrandService.cfc:L70, L72] when generation fires.
   */
  urlTitle?: string | undefined;

  /**
   * The preferred title source. Read by the first inner branch
   * [model/service/BrandService.cfc:L69] and never written.
   */
  readonly brandName?: string | undefined;

  /**
   * [model/entity/Brand.cfc:L53] `ormtype="boolean"`, undefaulted.
   *
   * Typed to the CFML boolean input union rather than to `boolean`, because that is what
   * `populate` fed the setter: it passed `trim(value)` - a STRING.
   */
  readonly activeFlag?: CfBooleanInput;

  /**
   * [model/entity/Brand.cfc:L54] Same input union and same reasoning as `activeFlag`.
   */
  readonly publishedFlag?: CfBooleanInput;

  /**
   * [model/entity/Brand.cfc:L57] Carried as an opaque string.
   *
   * `hb_formatType="url"` is presentation metadata, but `model/validation/Brand.json` separately
   * declares `{"contexts":"save","dataType":"url"}`, which is enforced.
   */
  readonly brandWebsite?: string | undefined;

  /**
   * [model/entity/Brand.cfc:L74] The external-system correlation key.
   *
   * Declared because `populate` copied it like any other simple column, and no validation rule
   * governs it.
   */
  readonly remoteID?: string | undefined;
}

/**
 * The CFML predicate `!isNull(value) && len(value)`, expressed once as a single narrowing test.
 *
 * Why this EXISTS at all, given that redeclaring an existing helper is forbidden: it declares
 * nothing new.
 *
 * CFML parity [model/service/BrandService.cfc:L68, L69, L71]: all three legacy emptiness tests in
 * this component route through here.
 */
function hasCfLength(value: string | undefined): value is string {
  return !isNullish(value) && cfTruthy(cfLen(value));
}

/**
 * Why a second type rather than reading the input directly.
 */
interface BrandTitleSource {
  readonly urlTitle?: string | undefined;
  readonly brandName?: string | undefined;
}

/**
 * Writes the resolved `urlTitle` into the save payload the way a CFML struct assignment writes:
 * updating the key ALREADY in USE when one is present in any casing, and creating the canonical
 * key only when none is.
 *
 * `data.urlTitle = value` is correct for a payload whose key is spelled canonically, and wrong for
 * one that is not.
 */
function writeResolvedUrlTitle(data: BrandSaveInput, urlTitle: string): void {
  const storedKey = structFindKey(data, 'urlTitle');

  if (storedKey === undefined || storedKey === 'urlTitle') {
    data.urlTitle = urlTitle;
    return;
  }

  Reflect.set(data, storedKey, urlTitle);
}

// The durable half of `super.save`, and the populate/validate steps that precede it.

/**
 * The persistence collaborator this service needs in order to be a save.
 *
 * What remains is exactly what the AAP already does with every other replaced framework
 * responsibility: put it in the composition root.
 *
 * `no-restricted-imports` boundary forbids `src/domain/**` from importing repositories, handlers
 * or integrations.
 */
export interface BrandFrameworkWrites {
  /**
   * Persist one brand - INSERT when `isNew()`, UPDATE otherwise - and answer the persisted row.
   *
   * The returned entity is not the argument: a new brand acquires the identifier the absent flush
   * used to mint [model/entity/Brand.cfc:L52, `generator="uuid" unsavedvalue=""`], and both paths
   * acquire audit stamps.
   */
  saveBrand(brand: Brand): Promise<Brand>;

  /**
   * Whether `urlTitle` is free - the query half of `model/validation/Brand.json`'s
   * `"urlTitle": {"unique":true}` save rule.
   *
   * It is a read on a write contract, and that is deliberate rather than untidy.
   *
   * @param urlTitle The candidate title, already known to be non-empty by the `required` rule.
   * @param brandID The saving brand's identifier, EXCLUDED from the probe.
   * @returns `true` when no OTHER brand holds the title.
   */
  isUrlTitleUnique(urlTitle: string, brandID: string): Promise<boolean>;
}

/**
 * One save-context rule of `model/validation/Brand.json` that a brand did not satisfy.
 *
 * This replaces `BrandValidationError`, and the replacement is the fix.
 *
 * The first clause was a true statement about the code as it then STOOD, and the conclusion drawn
 * from it was the wrong way round: the missing channel was the defect.
 */
export interface BrandSaveContextError {
  /**
   * The property the rule is declared on, used as the error name.
   */
  readonly propertyIdentifier: string;

  /**
   * The rule, stated. Server-authored; never carries the submitted value.
   */
  readonly errorMessage: string;
}

/**
 * One column's fate under `populate`: either the payload supplied it - in which case the resolved
 * value travels with the verdict, and `undefined` means SET to NULL - or it did not.
 *
 * The distinction cannot be collapsed into `string | undefined`, because "absent" and "present and
 * blank" are different instructions [org/Hibachi/HibachiTransient.cfc:L191-L196]: the first
 * preserves.
 */
type PopulatedColumn =
  { readonly supplied: true; readonly value: string | undefined } | { readonly supplied: false };

const COLUMN_NOT_SUPPLIED: PopulatedColumn = Object.freeze({ supplied: false });

/**
 * Read one simple column out of the save payload the way `HibachiTransient.populate`
 * [org/Hibachi/HibachiTransient.cfc:L169-L205] read it.
 *
 * The test is `structKeyExists(arguments.data, currentProperty.name)`
 * [org/Hibachi/HibachiTransient.cfc:L185]: a key the payload does not hold is not populated, and the
 * stored value survives.
 *
 * `null` and `undefined` have no CFML counterpart - a struct key cannot hold either - so both are
 * treated as the blank case.
 */
function populatedColumn(data: object, propertyName: string): PopulatedColumn {
  const storedKey = structFindKey(data, propertyName);

  if (storedKey === undefined) {
    return COLUMN_NOT_SUPPLIED;
  }

  const rawValue: unknown = Reflect.get(data, storedKey);

  if (rawValue === null || rawValue === undefined) {
    return { supplied: true, value: undefined };
  }

  if (
    typeof rawValue !== 'string' &&
    typeof rawValue !== 'number' &&
    typeof rawValue !== 'boolean' &&
    typeof rawValue !== 'bigint'
  ) {
    return COLUMN_NOT_SUPPLIED;
  }

  const trimmed = String(rawValue).trim();

  return { supplied: true, value: trimmed === '' ? undefined : trimmed };
}

/**
 * Fold the save payload onto the brand, reproducing the `populate` step `super.save` performed at
 * [org/Hibachi/HibachiService.cfc:L146] before it validated and flushed.
 *
 * A new instance, not a mutation, and the observable outcome is the same.
 */
function populateBrandFromSaveInput(brand: Brand, data: BrandSaveInput): Brand {
  const urlTitle = populatedColumn(data, 'urlTitle');
  const brandName = populatedColumn(data, 'brandName');
  const brandWebsite = populatedColumn(data, 'brandWebsite');
  const remoteID = populatedColumn(data, 'remoteID');
  const activeFlag = populatedColumn(data, 'activeFlag');
  const publishedFlag = populatedColumn(data, 'publishedFlag');

  return new Brand({
    brandID: brand.getBrandID(),
    urlTitle: urlTitle.supplied ? urlTitle.value : brand.getUrlTitle(),
    brandName: brandName.supplied ? brandName.value : brand.getBrandName(),
    brandWebsite: brandWebsite.supplied ? brandWebsite.value : brand.getBrandWebsite(),
    remoteID: remoteID.supplied ? remoteID.value : brand.getRemoteID(),
    activeFlag: activeFlag.supplied ? activeFlag.value : brand.getActiveFlag(),
    publishedFlag: publishedFlag.supplied ? publishedFlag.value : brand.getPublishedFlag(),
    products: brand.getProducts(),
    promotionRewards: brand.getPromotionRewards(),
    promotionRewardExclusions: brand.getPromotionRewardExclusions(),
    promotionQualifiers: brand.getPromotionQualifiers(),
    promotionQualifierExclusions: brand.getPromotionQualifierExclusions(),
    createdDateTime: brand.getCreatedDateTime(),
    createdByAccountID: brand.getCreatedByAccountID(),
    modifiedDateTime: brand.getModifiedDateTime(),
    modifiedByAccountID: brand.getModifiedByAccountID(),
  });
}

/**
 * The six protocols CFML's `isValid("url",...)` accepts, spelled as the WHATWG parser reports
 * them.
 *
 * Stored with the `:` the `URL#protocol` getter includes, so membership is a plain lookup against
 * the parser's own output.
 */
const CFML_URL_PROTOCOLS: ReadonlySet<string> = new Set([
  'http:',
  'https:',
  'ftp:',
  'file:',
  'mailto:',
  'news:',
]);

/**
 * `isValid("url", value)`, for the one `dataType` constraint Brand declares.
 *
 * Declares `hb_formatType="url"` on the property [model/entity/Brand.cfc:L57], and that format
 * type resolves to `formatValue_url`.
 *
 * This is a narrowing toward the source, not a divergence from it, so it adds no fourth entry to
 * the three-divergence budget [AAP 0.6.7].
 */
function isValidUrl(value: string): boolean {
  if (!URL.canParse(value)) {
    return false;
  }

  return CFML_URL_PROTOCOLS.has(new URL(value).protocol);
}

/**
 * Enforce the three save-context rules in `model/validation/Brand.json`, in the order the file
 * lists them.
 *
 * Runs on the POPULATED brand, not on the payload and not on the caller's instance, because that
 * is the order `super.save` used: populate [org/Hibachi/HibachiService.cfc:L146].
 *
 * It collects rather than throws, and accumulates all failures.
 */
async function collectBrandSaveContextErrors(
  brand: Brand,
  frameworkWrites: BrandFrameworkWrites,
): Promise<BrandSaveContextError[]> {
  const errors: BrandSaveContextError[] = [];

  if (!cfTruthy(cfLen(brand.getBrandName()))) {
    errors.push({ propertyIdentifier: 'brandName', errorMessage: 'brandName is required' });
  }

  const brandWebsite = brand.getBrandWebsite();

  if (brandWebsite !== undefined && !isValidUrl(brandWebsite)) {
    errors.push({
      propertyIdentifier: 'brandWebsite',
      errorMessage: 'brandWebsite must be a valid URL',
    });
  }

  const urlTitle = brand.getUrlTitle();

  if (!cfTruthy(cfLen(urlTitle))) {
    errors.push({ propertyIdentifier: 'urlTitle', errorMessage: 'urlTitle is required' });
  } else if (urlTitle !== undefined) {
    // The `unique` half of the same rule, and it runs only when the `required` half passed - which
    // is the legacy order: `validate_unique` is the second qualifier `model/validation/Brand.json`
    // declares on `urlTitle`, after `required`.
    const unique = await frameworkWrites.isUrlTitleUnique(urlTitle, brand.getBrandID());

    if (!unique) {
      errors.push({
        propertyIdentifier: 'urlTitle',
        errorMessage: 'urlTitle is already held by another brand and must be unique',
      });
    }
  }

  return errors;
}

//
// It was raised unconditionally at the end of `saveBrand`, and its own docblock argued: "this
// slice cannot durably write A BRAND... The durable half genuinely does not exist here.

/**
 * The ported surface of `model/service/BrandService.cfc`.
 *
 * One PUBLIC METHOD, because the legacy component declared one function.
 *
 * Per request, not per container, and the reason changed with the second argument.
 */
export class BrandService {
  /**
   * @param urlTitleGenerator Replaces the legacy `property name="dataService" type="any";`
   * [model/service/BrandService.cfc:L51] - the component's one and only DECLARED collaborator.
   * @param frameworkWrites The durable half of `super.save` [model/service/BrandService.cfc:L76],
   * which the legacy component inherited from `HibachiService` rather than declaring.
   */
  constructor(
    private readonly urlTitleGenerator: UrlTitleGenerator,
    private readonly frameworkWrites: BrandFrameworkWrites,
  ) {}

  /**
   * Ported 1:1 from `public any function saveBrand(required any brand, required struct data)`
   * [model/service/BrandService.cfc:L67-L77].
   *
   * Async because the legacy body reaches the data store - twice, and now both reaches are here.
   *
   * @param brand The brand being saved.
   * @param data The save payload.
   * @returns The PERSISTED brand, which is a different instance from the argument: a new brand
   * carries the identifier the flush minted [model/entity/Brand.cfc:L52].
   */
  async saveBrand(brand: Brand, data: BrandSaveInput): Promise<Brand> {
    // LEGACY-NOTE [model/service/BrandService.cfc:L68]: the legacy line reads the value back as
    // `arguments.brand.getURLTitle()` with a capital `URL`, while the ported entity publishes
    // `getUrlTitle()` with a lowercase `rl` `slatwall-ts/src/domain/entities/brand.ts`.
    // !structKeyExists(data, "urlTitle") || !len(data.urlTitle)
    if (
      !hasCfLength(brand.getUrlTitle()) &&
      (!structKeyExists(data, 'urlTitle') ||
        !hasCfLength(structGet<BrandTitleSource>(data, 'urlTitle')))
    ) {
      // CFML parity [model/service/BrandService.cfc:L69-L72]: the preference order is
      // `data.brandName` FIRST and the entity's own `getBrandName()` SECOND.
      const incomingBrandName = structGet<BrandTitleSource>(data, 'brandName');
      const entityBrandName = brand.getBrandName();

      if (structKeyExists(data, 'brandName') && hasCfLength(incomingBrandName)) {
        // CFML parity [model/service/BrandService.cfc:L70]: the legacy assignment target is the
        // UNQUALIFIED `data.urlTitle` rather than `arguments.data.urlTitle`.
        writeResolvedUrlTitle(
          data,
          await this.urlTitleGenerator.createUniqueURLTitle(incomingBrandName, 'SwBrand'),
        );
      } else if (hasCfLength(entityBrandName)) {
        // CFML parity [model/service/BrandService.cfc:L71]: the second branch is
        // `!isNull(arguments.brand.getBrandName()) && len(...)`, which is exactly the positive
        // form of `hasCfLength`. Reached only when the first branch's title source was absent or
        // empty.
        writeResolvedUrlTitle(
          data,
          await this.urlTitleGenerator.createUniqueURLTitle(entityBrandName, 'SwBrand'),
        );
      }

      // CFML parity [model/service/BrandService.cfc:L73]: there is no `else` branch. When neither
      // source yields a name, `urlTitle` is never set at all and the guard chain simply falls
      // through.
    }

    // The DURABLE HALF of `super.save`, PERFORMED here.

    // Step 1 - populate [org/Hibachi/HibachiService.cfc:L146].
    const populatedBrand = populateBrandFromSaveInput(brand, data);

    // Step 2 - validate [org/Hibachi/HibachiService.cfc:L151], on the populated entity and before
    // anything is written.
    const errors = await collectBrandSaveContextErrors(populatedBrand, this.frameworkWrites);

    // `HibachiService.save`'s own shape: flush only when `!hasErrors()`
    // [org/Hibachi/HibachiService.cfc:L153-L155], and return the entity either way, as
    // [model/service/BrandService.cfc:L76] does.
    if (errors.length > 0) {
      for (const error of errors) {
        populatedBrand.addError(error.propertyIdentifier, error.errorMessage);
      }

      return populatedBrand;
    }

    // Step 3 - flush [org/Hibachi/HibachiService.cfc:L155], and answer the persisted row rather
    // than the argument.
    //
    // Not reproduced, deliberately: the before/after save events the framework announced
    // [org/Hibachi/HibachiService.cfc:L140, and the failure announcement on the invalid path].
    return await this.frameworkWrites.saveBrand(populatedBrand);
  }
}
