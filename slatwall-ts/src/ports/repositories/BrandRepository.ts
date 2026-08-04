/**
 * `BrandRepository` — the repository port for the Catalog's brand persistence surface.
 *
 * Unlike its four siblings this port has no legacy DAO to transliterate: no brand data-access
 * component exists anywhere in the tree, and `model/service/BrandService.cfc:L51` declares
 * `property name="dataService" type="any";` as the component's only property, so there was never a
 * brand data-access injection or a generated accessor for one. `brandService` relies entirely on the
 * CRUD surface `onMissingMethod` fabricates [org/Hibachi/HibachiService.cfc:L255-L281], which IR-1
 * requires to be declared explicitly — that is what this file is (AAP §0.4.1.6).
 */

import type { ManagedEntity as EntitySideManagedEntity } from '../../domain/base/AuditableEntity';
import type { ManagedEntity } from '../../domain/base/populate';
import type { Brand } from '../../domain/product/Brand';

/**
 * A brand carrying the framework-inherited member surface the save and delete path calls at run time.
 */
export type ManagedBrand = ManagedEntity<Brand>;

/*
 * Compile-time proof of the two facts this port depends on: the entity class satisfies the
 * entity-side managed contract, and a managed brand is still usable wherever a `brand` is expected.
 */
type _BrandSatisfiesEntitySideContract = Brand extends EntitySideManagedEntity ? true : never;
const _brandSatisfiesEntitySideContract: _BrandSatisfiesEntitySideContract = true;
void _brandSatisfiesEntitySideContract;

type _ManagedBrandIsUsableAsBrand = ManagedBrand extends Brand ? true : never;
const _managedBrandIsUsableAsBrand: _ManagedBrandIsUsableAsBrand = true;
void _managedBrandIsUsableAsBrand;

/**
 * Port for the brand persistence primitives `BrandService` consumes, implemented against MySQL in
 * `src/adapters/mysql/**` and supplied to the service by explicit constructor injection.
 */
export interface BrandRepository {
  /**
   * Instantiates a new, unpersisted brand.
   *
   * @returns a newly instantiated, unpersisted, already-managed brand. Never null or undefined.
   */
  newBrand(): ManagedEntity<Brand>;

  /**
   * Reads one brand by its primary identifier.
   *
   * @param brandID - The brand's primary identifier, a 32-character string per IR-6. Required and
   * positional, matching the ordered-arguments-only convention at
   * `org/Hibachi/HibachiService.cfc:L253`.
   *
   * @returns The matching brand, or `null` when no row matches. Never undefined.
   */
  getBrand(brandID: string): Promise<ManagedEntity<Brand> | null>;

  /**
   * Persists an already-populated brand, inserting or updating as its identity requires.
   *
   * @param brand - The fully populated, already-validated, already-managed entity to persist.
   * Required and positional.
   *
   * @returns The persisted brand, still managed. Never null or undefined.
   */
  saveBrand(brand: ManagedEntity<Brand>): Promise<ManagedEntity<Brand>>;

  /**
   * Removes a brand.
   *
   * @param brand - The already-managed entity to remove. Required and positional, matching the
   * numeric-index read at `org/Hibachi/HibachiService.cfc:L287`. The delete guards evaluated above
   * this boundary read `getPropertyMetaData` and `getPrimaryIDValue` off the same value, so the
   * managed shape is what the caller necessarily holds by the time it gets here.
   *
   * @returns `true` when the brand was removed, `false` when it was not. Never null or undefined.
   */
  deleteBrand(brand: ManagedEntity<Brand>): Promise<boolean>;

  /**
   * Reports whether a candidate URL title is still free for a brand.
   *
   * TODO(parity): two divergent unique-url-title strategies coexist in the legacy system, and they
   * stay divergent. The strategy behind this member is the numeric-suffix retry of
   * `model/service/DataService.cfc:L53-L71`. A different strategy exists at
   * `model/dao/ProductDAO.cfc:L398-L409`, reached only when the importer's target is the product
   * table: it derives a filtered file name and, on collision, appends the product code rather than a
   * counter. Harmonising the two would change observable output on one path or the other, so the
   * divergence is documented and carried, not reconciled (AAP §0.7.3; AAP §0.8.2 Guideline 4). No
   * product-shaped variant is added to this brand interface, and no register identifier is minted here
   *
   * @param urlTitle - The candidate URL-title value to test. Required and positional. Bound as a
   * placeholder parameter, exactly as `model/dao/DataDAO.cfc:L123` binds it and nothing else.
   *
   * @returns `true` when the candidate is still available — no brand row already carries it — and
   * `false` when it is already in use. Never null or undefined.
   */
  isUrlTitleAvailable(urlTitle: string): Promise<boolean>;

  /**
   * Reads the identifiers of the products a brand currently owns.
   *
   * @param brandID - The identifier of the brand whose owned products are counted. Bound as a
   * placeholder parameter, never interpolated.
   *
   * @returns One identifier per product row whose `brandID` is this brand's, in the order the server
   * answers them. Empty when the brand owns none — which is the only state that satisfies
   * `model/validation/Brand.json:L6`.
   */
  findProductIdentifiersByBrand(brandID: string): Promise<string[]>;
}
