/**
 * `BrandService` — the port of `model/service/BrandService.cfc`: the smallest and cleanest of the four
 * in-scope Catalog services.
 *
 * Authority: AAP §0.4.1.8. The method contract is fixed by AAP §0.4.2.3, the three synthesized members by
 * AAP §0.4.2.5, and the dependency classification by AAP §0.6.3.3.
 *
 * What the legacy component actually contains — one member, one dependency, zero DAO
 * Between `model/service/BrandService.cfc:L49` and the closing brace at `:L89` there is exactly one
 * function — `saveBrand` at `:L67-L77` — and exactly one injected property, `dataService` at `:L51`.
 * Everything else in the file is section banners.
 */

import type { ManagedEntity } from '../domain/base/populate';
import type { Brand, BrandPropertyName } from '../domain/product/Brand';
import type { UniquePropertyEntity } from '../ports/UniquePropertyPort';
import type {
  BrandRepository,
  ManagedBrand as PortManagedBrand,
} from '../ports/repositories/BrandRepository';
import { createUniqueURLTitle } from '../util/urlTitle';
import type { UniqueValueProbe, UrlTitleProbeBudget } from '../util/urlTitle';
import type { ValidationContext } from '../validation/Validator';
import type { BrandValidationSubject } from '../validation/rules/brand.rules';
import type { BaseService, BaseServiceEntity } from './BaseService';

/**
 * The physical table the brand URL title must be unique on — the literal passed at
 * `model/service/BrandService.cfc:L70` and `:L72` as `tableName="SwBrand"`, matching
 * `table="SwBrand"` on `model/entity/Brand.cfc:L49`.
 */
const BRAND_TABLE_NAME = 'SwBrand';

/**
 * The payload key read by the guard at `model/service/BrandService.cfc:L68` and written at `:L70`
 * and `:L72`. It matches `property name="urlTitle"` on `model/entity/Brand.cfc:L55`, which is the
 * `unique="true"` column the derivation exists to keep unique.
 */
const URL_TITLE_DATA_KEY = 'urlTitle';

/**
 * The payload key read by the preferred branch at `model/service/BrandService.cfc:L69-L70`,
 * matching `property name="brandName"` on `model/entity/Brand.cfc:L56`.
 */
const BRAND_NAME_DATA_KEY = 'brandName';

/**
 * A brand as the base collaborator has to see it: the domain entity plus the three contracts the
 * retired framework base classes used to supply for it.
 */
type BrandBaseServiceRequirement = Brand &
  BaseServiceEntity<BrandPropertyName> &
  UniquePropertyEntity;

/**
 * What every caller of this service actually handles: a `Brand` plus the error-surface members
 * `manageEntity` supplies.
 */
export type ManagedBrand = ManagedEntity<Brand>;

/** The two members of `baseService` this service delegates to, viewed over {@link ManagedBrand}. */
export interface BrandBaseService {
  readonly save: (
    brand: ManagedBrand,
    data?: Record<string, unknown>,
    context?: ValidationContext,
  ) => Promise<ManagedBrand>;
  readonly delete: (brand: ManagedBrand) => Promise<boolean>;
}

/**
 * Compile-time assertion helper: resolves to `TActual` when it is assignable to `TExpected`, and
 * fails the build otherwise. Type-only, so it contributes nothing to the bundle.
 */
type AssertAssignable<TActual extends TExpected, TExpected> = TActual;

/**
 * Guard 1 — a real `BaseService` instantiated at {@link ManagedBrand} really does satisfy
 * {@link BrandBaseService}. This is the assignment the composition root performs, checked here so
 * that any drift in `./BaseService`'s `save` or `delete` signature breaks the build in the file that
 * depends on it rather than silently at the wiring site.
 */
type _BaseServiceSatisfiesBrandBaseService = AssertAssignable<
  BaseService<ManagedBrand, BrandPropertyName>,
  BrandBaseService
>;

/**
 * Guard 2 — {@link ManagedBrand} really is a legal subject for the ported brand rule set, which
 * `../validation/rules/brand.rules` exports as
 * `ValidationRuleSet<BrandValidationSubject & UniquePropertyEntity>`. This is what makes
 * `brandValidationRules` a valid `ruleSet` for the base collaborator, and therefore what makes the
 * save-context rules of `model/validation/Brand.json:L3-L5` and the delete guards at `:L6-L7` reach
 * every brand this service saves or removes.
 */
type _ManagedBrandIsBrandValidationSubject = AssertAssignable<
  ManagedBrand,
  BrandValidationSubject & UniquePropertyEntity
>;

/**
 * Guard 3 — the managed runtime shape really does satisfy everything the base collaborator demands.
 */
type _ManagedBrandSatisfiesBaseServiceRequirement = AssertAssignable<
  ManagedBrand,
  BrandBaseServiceRequirement
>;

/**
 * Guard 4 — the port's managed alias and this service's own are the same shape, in both directions.
 */
type _PortManagedBrandMatchesServiceManagedBrand = AssertAssignable<PortManagedBrand, ManagedBrand>;
type _ServiceManagedBrandMatchesPortManagedBrand = AssertAssignable<ManagedBrand, PortManagedBrand>;

/** CFML `structKeyExists(struct, key)` for an inbound payload. */
function dataKeyExists(data: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(data, key);
}

/**
 * Renders a CFML simple value the way it reaches a `string`-typed parameter.
 *
 * TODO(parity): a `Date` renders here through `toISOString()`, whereas CFML would render it with the
 * engine's own date-time mask. The two differ in format for the single pathological case of a
 * date-valued `brandName` or `urlTitle` in the payload; no in-scope caller supplies one, and picking
 * a mask would mean inventing one the source does not state (AAP §0.7.3). Recorded rather than
 * guessed, per AAP §0.8.3.6.
 */
function renderSimpleDataValue(value: string | number | boolean | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * CFML `len()` as the two guards at `model/service/BrandService.cfc:L68-L69` use it, with a missing
 * key folded in as zero so `!structKeyExists(...) || !len(...)` becomes one reading.
 *
 * TODO(parity): CFML raises on `len()` of a value that is none of those shapes; this returns zero,
 * reading it as "not supplied". The divergence is confined to `null`, `undefined` and function-valued
 * payload entries.
 */
function dataValueLength(data: Record<string, unknown>, key: string): number {
  if (!dataKeyExists(data, key)) {
    return 0;
  }

  const value: unknown = data[key];

  if (typeof value === 'string') {
    return value.length;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) {
    return renderSimpleDataValue(value).length;
  }
  if (typeof value === 'object' && value !== null) {
    return Object.keys(value).length;
  }

  return 0;
}

/**
 * Reads a payload entry as the `required string titleString` parameter at
 * `model/service/DataService.cfc:L53` would receive it.
 */
function dataValueText(data: Record<string, unknown>, key: string): string | undefined {
  const value: unknown = data[key];

  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) {
    return renderSimpleDataValue(value);
  }

  return undefined;
}

/** Reproduces CFML's `!isNull(x) && len(x)` for a typed entity string property, and narrows. */
function hasEntityText(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

/**
 * The extracted Catalog brand service — the port of `model/service/BrandService.cfc`.
 *
 * @example
 * ```ts
 * const brandService = new BrandService(brandRepository, baseService);
 * ```
 */
export class BrandService {
  /**
   * @param brandRepository - The brand persistence port. Replaces both legacy resolution
   * mechanisms at once: the DI/1 property at `model/service/BrandService.cfc:L51` (R1) and the
   * prefix synthesis of `org/Hibachi/HibachiService.cfc:L255-L281` (R2, IR-1). It backs the three
   * synthesized members below and supplies the uniqueness read the save path performs. No
   * `BrandDAO` exists in the legacy repository to correspond to it.
   *
   * @param urlTitleProbeBudget The ceiling on how many uniqueness probes one URL-title derivation may
   *  issue — see {@link UrlTitleProbeBudget} in `../util/urlTitle`.
   */
  public constructor(
    private readonly brandRepository: BrandRepository,
    private readonly baseService: BrandBaseService,
    private readonly urlTitleProbeBudget: UrlTitleProbeBudget,
  ) {}

  /**
   * Assigns a unique URL title when none was supplied, then delegates the save.
   *
   * @param brand - The brand to save. Required and positional, per `:L67`.
   * @param data - The inbound payload. Required and positional, per `:L67`. mutated in place when a
   * URL title is derived, reproducing the by-reference write at `:L70` and `:L72`.
   *
   * @returns The brand, as returned by the base collaborator — the same instance that was passed in,
   * whether the save succeeded or failed. On failure nothing was persisted and the findings are on the
   * returned brand's own bag; on success it is the persisted instance.
   */
  public async saveBrand(
    brand: ManagedBrand,
    data: Record<string, unknown>,
  ): Promise<ManagedBrand> {
    // `:L68` — the two-part guard, both halves evaluated exactly as declared.
    if (!hasEntityText(brand.urlTitle) && dataValueLength(data, URL_TITLE_DATA_KEY) === 0) {
      // `:L69` — `structKeyExists(arguments.data, "brandName") && len(arguments.data.brandName)`.
      if (dataValueLength(data, BRAND_NAME_DATA_KEY) > 0) {
        const payloadBrandName = dataValueText(data, BRAND_NAME_DATA_KEY);

        // Nested rather than folded into the condition above, so that a payload value with a
        // non-zero `len()` which CFML could not coerce to a string keeps the legacy control flow:
        // The first arm is entered and the `else if` at `:L71` is never reached. See
        // {@link dataValueText}.
        if (payloadBrandName !== undefined) {
          // `:L70` — by-reference write onto the caller's payload.
          data[URL_TITLE_DATA_KEY] = await this.createUniqueBrandUrlTitle(payloadBrandName);
        }
      } else {
        // `:L71` — `!isNull(arguments.brand.getBrandName()) && len(arguments.brand.getBrandName())`.
        const entityBrandName = brand.brandName;

        if (hasEntityText(entityBrandName)) {
          // `:L72` — same by-reference write, from the entity's own name.
          data[URL_TITLE_DATA_KEY] = await this.createUniqueBrandUrlTitle(entityBrandName);
        }
      }
    }

    // `:L76` — `return super.save(arguments.brand, arguments.data);`
    return this.baseService.save(brand, data);
  }

  /**
   * Instantiates a new, unpersisted brand.
   *
   * @returns a newly instantiated, unpersisted brand. Never null or undefined.
   */
  public newBrand(): ManagedBrand {
    return this.brandRepository.newBrand();
  }

  /**
   * Reads one brand by its primary identifier.
   *
   * @param brandID - The brand's primary identifier, a 32-character string per IR-6. Required and
   * positional, per the ordered-arguments-only convention at
   * `org/Hibachi/HibachiService.cfc:L253`.
   *
   * @returns The matching brand, or `null` when no row matches. Never undefined.
   */
  public getBrand(brandID: string): Promise<ManagedBrand | null> {
    return this.brandRepository.getBrand(brandID);
  }

  /**
   * Removes a brand, subject to the ported delete guards.
   *
   * @param brand - The entity to remove. Required and positional, matching the numeric-index read at
   * `org/Hibachi/HibachiService.cfc:L287`.
   *
   * @returns `true` when the brand was removed, `false` when a delete guard blocked it.
   */
  public deleteBrand(brand: ManagedBrand): Promise<boolean> {
    return this.baseService.delete(brand);
  }

  /**
   * Derives a brand URL title that is free on `SwBrand`, reproducing both call sites at
   * `model/service/BrandService.cfc:L70` and `:L72`.
   *
   * @param titleString - The human-readable source title, passed through untouched. Every
   * transformation belongs to `createUniqueURLTitle`.
   *
   * @returns a URL title free on `SwBrand`, suffixed `-2`, `-3`, … on successive collisions.
   */
  private createUniqueBrandUrlTitle(titleString: string): Promise<string> {
    const probe: UniqueValueProbe = (_tableName, candidateUrlTitle) =>
      this.brandRepository.isUrlTitleAvailable(candidateUrlTitle);

    return createUniqueURLTitle(titleString, BRAND_TABLE_NAME, probe, this.urlTitleProbeBudget);
  }
}
