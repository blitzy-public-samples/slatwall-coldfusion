/**
 * Sku — the `SwSku` catalog entity of Slatwall 3.1.39, re-expressed as strict-mode TypeScript.
 *
 * Ported from [model/entity/Sku.cfc], whose component declaration at [:L49] reads
 * `entityname="SlatwallSku" table="SwSku" persistent=true accessors=true output=false
 * extends="HibachiEntity" cacheuse="transactional" hb_serviceName="skuService" hb_permission="this"`.
 * Scope per AAP §0.4.1.4: the persistent properties, the option-structure members, the two
 * method-based validation rules `hasUniqueOptions` [:L756-L769] and `hasOneOptionPerOptionGroup`
 * [:L772-L784], the image members behind `ImagePathPort`, and defects D1, D2, D3 and D16 carried as
 * flagged annotations.
 *
 * Three mistakes are near-inevitable unless consciously avoided, and each is refused explicitly at
 * the member that would suffer it:
 *
 * 1. making `hasUniqueOptions` a synchronous pure predicate. It executes a database query: the
 * chain is [:L762] -> `product.getSkusBySelectedOptions` [model/entity/Product.cfc:L366-L368] ->
 * `productService.getProductSkusBySelectedOptions` [model/service/ProductService.cfc:L104-L106],
 * a pure delegation to `SkuDAO.getSkusBySelectedOptions` and its hand-assembled query. See
 * {@link Sku.hasUniqueOptions}, which is `async` and takes an injected lookup.
 * 2. "fixing" D1, D2 or D3. Refactor Discipline Guideline 4 forbids it and AAP §0.7.3 is
 * preserve-and-annotate. See the register below and the three members themselves.
 *
 */

import type {
  AuditPropertyName,
  AuditableEntity,
  DeclaredPropertyNameSet,
  EntityPropertyMetaData,
  AuditableManagedEntity,
} from '../base/AuditableEntity';
import {
  AUDIT_PROPERTY_NAMES,
  hasDeclaredProperty,
  readValueByPropertyIdentifier,
  requireDeclaredPropertyMetaData,
} from '../base/AuditableEntity';
import type {
  ColumnPropertyDescriptor,
  EntityMetadataDeclaration,
  ManyToManyPropertyDescriptor,
  ManyToOnePropertyDescriptor,
  PopulatePropertyDescriptor,
  PropertyDescriptorSet,
  RelatedEntityLoader,
  SubPropertyPopulator,
} from '../base/populate';
import type { BaseProductType } from '../BaseProductType';
import { resolveBaseProductType } from '../BaseProductType';
import type { Option } from '../option/Option';
import type { OptionGroup } from '../option/OptionGroup';
import type { Product } from '../product/Product';
import { DomainError, NotImplementedError } from '../../errors/DomainError';
import { EXACT_DECIMAL_ZERO, exactDecimalFromNumber } from '../../util/formatting';
/*
 * Type-only, and the only `src/ports/**` reference in this file. The two names are branded with a
 * `unique symbol` the port never exports, so neither can be re-declared locally; the reasoning, and why
 * leaving these members on `string` would have left the traversal at [model/entity/Sku.cfc:L222]
 * compiling, is on {@link SkuImagePathResolver}. No runtime value is imported.
 */
import type { AccessContentReference } from '../../ports/AccessContentPort';
import type { ImageWebPath } from '../../ports/ImagePathPort';
import type { ExactDecimal } from '../../util/formatting';
import type { SubscriptionBenefitReference } from '../../ports/SubscriptionTermPort';

/* The boundary contracts (r-c) */

/**
 * A base product type as this entity is permitted to observe it: the closed union widened so that no
 * arm can ever be statically eliminated.
 */
export type SkuBaseProductTypeCode = BaseProductType | (string & {});

/** The one member of a product type this entity reads while resolving a base product type. */
export interface SkuProductTypeSystemCodeSource {
  readonly systemCode?: string;
}

/** Resolves the root product type of a hierarchy by identifier. */
export interface SkuProductTypeRootResolver {
  getProductType(productTypeID: string): Promise<SkuProductTypeSystemCodeSource | undefined>;
}

/**
 * The subscription term as this entity is permitted to see it — [model/entity/Sku.cfc:L66],
 * `cfc="SubscriptionTerm" fieldtype="many-to-one" fkcolumn="subscriptionTermID"`.
 */
export interface SubscriptionTermRef {
  readonly subscriptionTermID: string;
  readonly subscriptionTermName?: string;
}

/** Every setting key the ported code of this entity reads, and no other. */
export type SkuSettingName =
  | 'productImageOptionCodeDelimiter'
  | 'productImageDefaultExtension'
  | 'imageAltString'
  | 'imageMissingImagePath'
  | 'skuCurrency'
  | `productImage${string}Width`
  | `productImage${string}Height`;

/**
 * Which entity a setting is resolved against, and its identifier.
 *
 * TODO(boundary) [model/entity/HibachiEntity.cfc:L129] — the `filterEntities` and `formatValue`
 * arms of the legacy signature are deliberately not carried. No call site in this entity supplies
 * either; every one passes a settingName alone. Reproducing unused parameters would be inventing
 * surface (AAP §0.7.3).
 */
export interface SkuSettingResolutionContext {
  readonly entityName: 'Product' | 'Sku' | 'Option';
  readonly entityId: string;
}

/** Resolves an effective setting value. */
export interface SkuSettingResolver {
  setting(settingName: SkuSettingName, context?: SkuSettingResolutionContext): string;
}

/**
 * The request shape a resized-image path is computed from — the typed replacement for the argument
 * struct the legacy passed by `argumentcollection` at [model/entity/Sku.cfc:L218].
 */
export interface SkuResizedImagePathRequest {
  readonly imagePath: ImageWebPath;
  readonly missingImagePath: string;
  readonly size?: string;
  readonly width?: number;
  readonly height?: number;
  readonly resizeMethod?: string;
}

/** Path-level image operations. */
export interface SkuImagePathResolver {
  getImagePath(imageFile: string): Promise<ImageWebPath>;
  getResizedImagePath(request: SkuResizedImagePathRequest): Promise<ImageWebPath>;
  getImageExistsFlag(imagePath: ImageWebPath): Promise<boolean>;
}

/** The request shape rendered image markup is produced from — [model/entity/Sku.cfc:L189]. */
export interface SkuResizedImageRequest extends SkuResizedImagePathRequest {
  readonly alt?: string;
}

/**
 * Renders image markup rather than resolving a path — [model/entity/Sku.cfc:L189].
 *
 * TODO(boundary) [model/entity/Sku.cfc:L189] — `ImagePathPort` is the rightful owner of this member.
 * It is declared separately here so the capability is visible and typed instead of dropped (TR-5),
 * and so the composition root can supply it from whichever adapter ultimately renders markup.
 */
export interface SkuResizedImageRenderer {
  getResizedImage(request: SkuResizedImageRequest): Promise<string>;
}

/** Expands a template containing bracketed property identifiers against a subject. */
export type SkuStringTemplateExpander = (template: string) => string;

/** The collaborators the two markup-producing image members need, gathered into one object. */
export interface SkuResizedImageCollaborators {
  readonly renderer: SkuResizedImageRenderer;
  readonly imagePaths: SkuImagePathResolver;
  readonly settings: SkuSettingResolver;
  readonly expandStringTemplate: SkuStringTemplateExpander;
}

/**
 * The caller-supplied half of a resized-image request — the arguments the legacy accepted through
 * `argumentcollection` at [model/entity/Sku.cfc:L153] and [:L192].
 */
export interface SkuResizedImageOptions {
  readonly size?: string;
  readonly width?: number;
  readonly height?: number;
  readonly missingImagePath?: string;
  readonly alt?: string;
}

/** One SKU's sale-price detail, exactly as the real pricing port shapes it. */
export interface SkuSalePriceDetails {
  readonly salePrice?: number;
  readonly salePriceDiscountType?: string;
  readonly salePriceExpirationDateTime?: Date;
}

/**
 * Resolves sale-price detail for every SKU of one product, keyed by SKU identifier.
 *
 * TODO(boundary) [model/entity/Sku.cfc:L539-L565] — promotion evaluation is out of scope
 * (AAP §0.2.2.1, `model/**\/Promotion*.cfc`, 9 files). Retained behind this port rather than dropped,
 * per TR-5, because the Google product feed reads two of the members it feeds (AAP §0.6.4.2).
 */
export interface SkuSalePricingLookup {
  getSalePriceDetailsForProductSkus(
    productId: string,
  ): Promise<Readonly<Record<string, SkuSalePriceDetails>>>;
}

/** Answers whether any transaction references this SKU. */
export interface SkuTransactionExistenceChecker {
  /** declares which slot means what, and exists to make a mis-binding fail to compile. */
  readonly argumentOrder: 'skuID-first-productID-second';

  /**
   * @param skuID - The SKU to scope the question to; the legacy `Sku.cfc:L594` argument.
   * @param productID - Accepted so one implementation serves the product-side checker too. The DAO
   * lets `skuID` win when both are present [model/dao/SkuDAO.cfc:L58-L64]; this entity never
   * supplies it.
   */
  getTransactionExistsFlag(skuID?: string, productID?: string): Promise<boolean>;
}

/** Finds the SKUs of this SKU's product that carry a given option combination. */
export interface SkusBySelectedOptionsLookup {
  getSkusBySelectedOptions(selectedOptions: string): Promise<readonly Sku[]>;
}

/** Reads the identifier of a product's default SKU. */
export type DefaultSkuIdReader = (defaultSku: object) => string;

/*
 * — the three owning many-to-many families whose related type is out of scope
 * [model/entity/Sku.cfc:L77-L79] declares three persistent owning many-to-many relationships whose
 * related components are excluded by AAP §0.2.2.1 — `content` (five `content*` files) and
 * `SubscriptionBenefit` (eleven `Subscription*` files):
 *
 * [:L77] accessContents `cfc="content"` link `SwSkuAccessContent`
 * [:L78] subscriptionBenefits `cfc="subscriptionBenefit"` link `SwSkuSubsBenefit`
 * [:L79] renewalSubscriptionBenefits `cfc="subscriptionBenefit"` link `SwSkuRenewalSubsBenefit`
 */

/**
 * The minimum an out-of-scope related entity must expose for this SKU to hold it and for the
 * adapter to persist the link row.
 */
export interface SkuRelatedEntityRef {
  /** [org/Hibachi/HibachiEntity.cfc:L707] — `true` before the row is persisted. */
  isNew(): boolean;

  /**
   * [org/Hibachi/HibachiEntity.cfc:L244-L246] — the identifier the link row needs, `''` while new.
   */
  getPrimaryIDValue(): string;
}

/**
 * A related entity that also owns an inverse SKU collection, which the two hand-written two-sided
 * mutators on this class require.
 */
export interface SkuInverseSkuCollectionOwner extends SkuRelatedEntityRef {
  /** Read by [:L708] and [:L728]; ORM-synthesized on the inverse side from `singularname="sku"`. */
  hasSku(sku: Sku): boolean;

  /** Read by [:L709], [:L717], [:L729] and [:L737] — the live inverse collection, never a copy. */
  getSkus(): Sku[];
}

/* Module constants and CFML-semantics helpers. */

/**
 * `skuID` — the declared primary identifier, [model/entity/Sku.cfc:L52],
 * `fieldtype="id" generator="uuid" ormtype="string" length="32" unsavedvalue="" default=""`.
 */
export const SKU_PRIMARY_ID_PROPERTY_NAME = 'skuID';

/**
 * The value a `skuID` holds before the row is persisted — [model/entity/Sku.cfc:L52],
 * `unsavedvalue="" default=""`.
 */
export const SKU_UNSAVED_ID_VALUE = '';

/**
 * The property whose value stands in for a SKU in a human-facing list — [model/entity/Sku.cfc:L809],
 * whose body is `return "skuCode";`.
 */
export const SKU_SIMPLE_REPRESENTATION_PROPERTY_NAME = 'skuCode';

/**
 * The resize method both deprecated-size branches request — [model/entity/Sku.cfc:L186] and [:L214],
 * `arguments.resizeMethod = "scaleBest"`.
 */
export const SKU_RESIZE_METHOD_SCALE_BEST = 'scaleBest';

/**
 * The resource-bundle key the subscription arm of a SKU definition prefixes its label with —
 * [model/entity/Sku.cfc:L585], `#rbKey('entity.subscriptionTerm')#`.
 *
 * TODO(boundary) [model/entity/Sku.cfc:L585] — `rbKey` is framework localisation and is out of
 * scope. The raw key is carried as the default label so the value is honest about what it is: a key
 * awaiting resolution, not a translation this file invented (AAP §0.7.3). A caller that has a resource
 * bundle passes the resolved label to {@link Sku.getSkuDefinition} instead.
 */
export const SUBSCRIPTION_TERM_RESOURCE_BUNDLE_KEY = 'entity.subscriptionTerm';

/**
 * The default delimiter for a joined option display — [model/entity/Sku.cfc:L233] and [:L885], both
 * `delimiter=" "`. A single space, not a comma.
 */
export const SKU_OPTIONS_DISPLAY_DEFAULT_DELIMITER = ' ';

/**
 * The delimiter a SKU definition joins its option segments with — [model/entity/Sku.cfc:L581], the
 * third argument `","`.
 */
export const SKU_DEFINITION_SEGMENT_DELIMITER = ',';

/**
 * The deprecated one-letter image-size aliases — [model/entity/Sku.cfc:L177-L183] and [:L205-L211].
 */
export const DEPRECATED_IMAGE_SIZE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  l: 'Large',
  m: 'Medium',
  s: 'Small',
});

/**
 * The fallback the resized-path branch applies to an unrecognised size —
 * [model/entity/Sku.cfc:L209-L211], the unconditional `else { arguments.size = "Small" }`.
 */
export const DEPRECATED_IMAGE_SIZE_FALLBACK = 'Small';

/**
 * Appends one value to a comma-or-other-delimited string with CFML `listAppend` semantics.
 *
 */
function appendToDelimitedList(list: string, value: string, delimiter = ','): string {
  return list === '' ? value : `${list}${delimiter}${value}`;
}

/**
 * Strips every character a Slatwall image file name may not contain.
 *
 */
function stripDisallowedImageFileNameCharacters(value: string): string {
  return value.replace(/[^a-z0-9\-_]/gi, '');
}

/**
 * `SlatwallSku`, table `SwSku` — a Catalog stock-keeping unit.
 *
 * @see model/entity/Sku.cfc — the sole origin.
 */
export class Sku implements AuditableEntity, AuditableManagedEntity {
  /* persistent properties — [model/entity/Sku.cfc:L52-L96], in legacy declaration order. */

  /** `skuID` — [model/entity/Sku.cfc:L52]. */
  skuID: string = SKU_UNSAVED_ID_VALUE;

  /** `activeFlag` — [model/entity/Sku.cfc:L53], `ormtype="boolean" default="1"`. */
  activeFlag: boolean = true;

  /** `skuCode` — [model/entity/Sku.cfc:L54], `ormtype="string" unique="true" length="50"`. */
  declare skuCode?: string;

  /**
   * `listPrice` — [model/entity/Sku.cfc:L55], `ormtype="big_decimal" hb_formatType="currency"
   * default="0"`.
   */
  listPrice: ExactDecimal = EXACT_DECIMAL_ZERO;

  /**
   * `price` — [model/entity/Sku.cfc:L56], `ormtype="big_decimal" hb_formatType="currency"
   * default="0"`. See {@link Sku.listPrice} for the precision note.
   */
  price: ExactDecimal = EXACT_DECIMAL_ZERO;

  /**
   * `renewalPrice` — [model/entity/Sku.cfc:L57], `ormtype="big_decimal" hb_formatType="currency"
   * default="0"`. See {@link Sku.listPrice} for the precision note. Set by the subscription creation
   * branch at [model/service/SkuService.cfc:L157].
   */
  renewalPrice: ExactDecimal = EXACT_DECIMAL_ZERO;

  /** `imageFile` — [model/entity/Sku.cfc:L58], `ormtype="string" length="50"`. */
  declare imageFile?: string;

  /** `userDefinedPriceFlag` — [model/entity/Sku.cfc:L59], `ormtype="boolean" default="0"`. */
  userDefinedPriceFlag: boolean = false;

  /** `calculatedQATS` — [model/entity/Sku.cfc:L62], `ormtype="integer"`. */
  declare calculatedQATS?: number;

  /**
   * `product` — [model/entity/Sku.cfc:L65], `fieldtype="many-to-one" fkcolumn="productID"
   * cfc="Product" hb_cascadeCalculate="true"`.
   */
  declare product?: Product;

  /**
   * `subscriptionTerm` — [model/entity/Sku.cfc:L66], `cfc="SubscriptionTerm"
   * fieldtype="many-to-one" fkcolumn="subscriptionTermID"`.
   */
  declare subscriptionTerm?: SubscriptionTermRef;

  /**
   * `options` — [model/entity/Sku.cfc:L76], `singularname="option" cfc="Option"
   * fieldtype="many-to-many" linktable="SwSkuOption" fkcolumn="skuID" inversejoincolumn="optionID"`.
   */
  options: Option[] = [];

  /*
   * The other three owning many-to-many collections — [model/entity/Sku.cfc:L77-L79]
   * these are carried as live collections even though their element entities are out of scope, and
   * that is TR-5 applied rather than bent. `Content` and `SubscriptionBenefit` are excluded by §0.2.2.1,
   * so no element module is written — but the association is in scope, because this entity owns all three
   * link tables and `model/service/SkuService.cfc` populates all three inside `createSkus`.
   */

  /** `accessContents` — [model/entity/Sku.cfc:L77], owner side, singular `accessContent`. */
  accessContents: AccessContentReference[] = [];

  /**
   * `subscriptionBenefits` — [model/entity/Sku.cfc:L78], owner side, singular `subscriptionBenefit`.
   */
  subscriptionBenefits: SubscriptionBenefitReference[] = [];

  /**
   * `renewalSubscriptionBenefits` — [model/entity/Sku.cfc:L79], owner side, singular
   * `renewalSubscriptionBenefit`. Same element component as {@link Sku.subscriptionBenefits}; a
   * different link table.
   */
  renewalSubscriptionBenefits: SubscriptionBenefitReference[] = [];

  /** `remoteID` — [model/entity/Sku.cfc:L90], `ormtype="string"`, no default, so optional. */
  declare remoteID?: string;

  /* Audit properties — [model/entity/Sku.cfc:L93-L96], all four `hb_populateEnabled="false"` */

  /** `createdDateTime` — [model/entity/Sku.cfc:L93], `ormtype="timestamp"`. */
  declare createdDateTime?: Date;

  /**
   * `createdByAccount` — [model/entity/Sku.cfc:L94], `cfc="account" fkcolumn="createdByAccountID"`.
   */
  declare createdByAccount?: string;

  /** `modifiedDateTime` — [model/entity/Sku.cfc:L95], `ormtype="timestamp"`. */
  declare modifiedDateTime?: Date;

  /**
   * `modifiedByAccount` — [model/entity/Sku.cfc:L96], `cfc="account" fkcolumn="modifiedByAccountID"`.
   */
  declare modifiedByAccount?: string;

  /* Per-instance memoization (M7 / AAP §0.7.3) */

  /** Caches {@link Sku.getCurrencyCode} — the legacy guard is at [model/entity/Sku.cfc:L361]. */
  #currencyCode?: string;

  /** Caches {@link Sku.getOptionsIDList} — the legacy guard is at [model/entity/Sku.cfc:L525]. */
  #optionsIdList?: string;

  /** Caches {@link Sku.getSkuDefinition} — the legacy guard is at [model/entity/Sku.cfc:L575]. */
  #skuDefinition?: string;

  /** Caches {@link Sku.getImageName} — the legacy guard is at [model/entity/Sku.cfc:L795]. */
  #imageName?: string;

  /** Caches the always-empty D2 map — the legacy guard is at [model/entity/Sku.cfc:L513]. */
  #optionsByOptionGroupIdStruct?: Record<string, Option>;

  /**
   * The third, differently-named struct of defect D2 — [model/entity/Sku.cfc:L517].
   *
   * TODO(parity) [model/entity/Sku.cfc:L512-L522] — D2. Not repaired.
   */
  #discardedOptionsByGroupIdStruct: Record<string, Option> = {};

  /**
   * Caches {@link Sku.getSalePriceDetails} — the legacy guard is at [model/entity/Sku.cfc:L540].
   */
  #salePriceDetails?: SkuSalePriceDetails;

  /**
   * Caches {@link Sku.getTransactionExistsFlag} — the legacy guard is at [model/entity/Sku.cfc:L593].
   */
  #transactionExistsFlag?: boolean;

  /* The unguarded-dereference policy, stated once. */

  /**
   * Reads an option's option group, raising where the legacy would have raised.
   *
   */
  #requireOptionGroup(option: Option, locator: string): OptionGroup {
    const optionGroup = option.optionGroup;
    if (optionGroup === undefined) {
      throw new DomainError(
        `Sku ${this.skuID === SKU_UNSAVED_ID_VALUE ? '(unsaved)' : this.skuID} holds option ` +
          `${option.optionID === '' ? '(unsaved)' : option.optionID} with no option group, so ` +
          `${locator} cannot resolve. The legacy code dereferences the option group without a ` +
          `guard at that line and raises here too.`,
        { context: { skuID: this.skuID, optionID: option.optionID, locator } },
      );
    }
    return optionGroup;
  }

  /**
   * Reads this SKU's product, raising where the legacy would have raised.
   *
   */
  #requireProduct(locator: string): Product {
    const product = this.product;
    if (product === undefined) {
      throw new DomainError(
        `Sku ${this.skuID === SKU_UNSAVED_ID_VALUE ? '(unsaved)' : this.skuID} has no product, ` +
          `so ${locator} cannot resolve. The legacy code dereferences the product without a guard ` +
          `at that line and raises here too.`,
        { context: { skuID: this.skuID, locator } },
      );
    }
    return product;
  }

  /* identity. */

  /**
   * Whether this SKU has never been persisted.
   *
   * @returns `true` while `skuID` is still {@link SKU_UNSAVED_ID_VALUE}.
   */
  isNew(): boolean {
    return this.skuID === SKU_UNSAVED_ID_VALUE;
  }

  /**
   * The property whose value represents this SKU in a human-facing list.
   *
   * @returns the literal `'skuCode'`
   */
  getSimpleRepresentationPropertyName(): string {
    return SKU_SIMPLE_REPRESENTATION_PROPERTY_NAME;
  }

  /* Option membership — IR-1: three members with no legacy body anywhere. */

  /**
   * This SKU's options — the live array, not a copy.
   *
   * @returns the option collection, mutable and shared.
   */
  getOptions(): Option[] {
    return this.options;
  }

  /**
   * Whether this SKU already holds the given option.
   *
   */
  hasOption(option: Option): boolean {
    return this.options.includes(option);
  }

  /**
   * Adds an option to this SKU.
   *
   * @param option the option to associate.
   */
  addOption(option: Option): void {
    if (!this.hasOption(option)) {
      this.options.push(option);
    }
  }

  /**
   * Removes an option from this SKU.
   *
   * @param option the option to disassociate; a no-op when it is not held.
   */
  removeOption(option: Option): void {
    const index = this.options.indexOf(option);
    if (index !== -1) {
      this.options.splice(index, 1);
    }
  }

  /*
   * Relationship helpers for the other three owning collections — [model/entity/Sku.cfc:L77-L79]
   * same shape and same evidence as {@link Sku.addOption}: add-if-absent guarded by an identity
   * membership test, remove by `indexOf` with the `!== -1` sentinel translation. No legacy body exists
   * for any of the six — they are ORM-synthesized, and IR-1 requires each to be declared explicitly
   * because `model/service/SkuService.cfc` calls four of them by name at [:L161], [:L164], [:L187] and
   * [:L196]. The two `remove*` members have no in-scope call site; they are declared because the ORM
   * synthesizes `add`/`remove` as a pair and removing an association is otherwise impossible from the
   * owning side, which is the side that owns the link row.
   */

  /**
   * Whether this SKU already holds that access content.
   *
   */
  hasAccessContent(accessContent: AccessContentReference): boolean {
    return this.accessContents.includes(accessContent);
  }

  /**
   * Adds access content to this SKU — the member `model/service/SkuService.cfc:L187` and [`:L196`] call.
   *
   * @param accessContent the content reference to associate.
   */
  addAccessContent(accessContent: AccessContentReference): void {
    if (!this.hasAccessContent(accessContent)) {
      this.accessContents.push(accessContent);
    }
  }

  /**
   * Removes access content from this SKU.
   *
   * @param accessContent the content reference to disassociate; a no-op when it is not held.
   */
  removeAccessContent(accessContent: AccessContentReference): void {
    const index = this.accessContents.indexOf(accessContent);
    if (index !== -1) {
      this.accessContents.splice(index, 1);
    }
  }

  /**
   * Whether this SKU already holds that subscription benefit.
   *
   */
  hasSubscriptionBenefit(subscriptionBenefit: SubscriptionBenefitReference): boolean {
    return this.subscriptionBenefits.includes(subscriptionBenefit);
  }

  /**
   * Adds a subscription benefit to this SKU — the member `model/service/SkuService.cfc:L161` calls.
   *
   * @param subscriptionBenefit the benefit reference to associate.
   */
  addSubscriptionBenefit(subscriptionBenefit: SubscriptionBenefitReference): void {
    if (!this.hasSubscriptionBenefit(subscriptionBenefit)) {
      this.subscriptionBenefits.push(subscriptionBenefit);
    }
  }

  /**
   * Removes a subscription benefit from this SKU.
   *
   * @param subscriptionBenefit the benefit reference to disassociate; a no-op when it is not held.
   */
  removeSubscriptionBenefit(subscriptionBenefit: SubscriptionBenefitReference): void {
    const index = this.subscriptionBenefits.indexOf(subscriptionBenefit);
    if (index !== -1) {
      this.subscriptionBenefits.splice(index, 1);
    }
  }

  /**
   * Whether this SKU already holds that renewal subscription benefit.
   *
   */
  hasRenewalSubscriptionBenefit(renewalSubscriptionBenefit: SubscriptionBenefitReference): boolean {
    return this.renewalSubscriptionBenefits.includes(renewalSubscriptionBenefit);
  }

  /**
   * Adds a renewal subscription benefit — the member `model/service/SkuService.cfc:L164` calls.
   *
   * @param renewalSubscriptionBenefit the benefit reference to associate.
   */
  addRenewalSubscriptionBenefit(renewalSubscriptionBenefit: SubscriptionBenefitReference): void {
    if (!this.hasRenewalSubscriptionBenefit(renewalSubscriptionBenefit)) {
      this.renewalSubscriptionBenefits.push(renewalSubscriptionBenefit);
    }
  }

  /**
   * Removes a renewal subscription benefit from this SKU.
   *
   * @param renewalSubscriptionBenefit the reference to disassociate; a no-op when it is not held.
   */
  removeRenewalSubscriptionBenefit(renewalSubscriptionBenefit: SubscriptionBenefitReference): void {
    const index = this.renewalSubscriptionBenefits.indexOf(renewalSubscriptionBenefit);
    if (index !== -1) {
      this.renewalSubscriptionBenefits.splice(index, 1);
    }
  }

  /* Option structure — the seven members of the AAP row, three of them defective. */

  /**
   * The option names of this SKU joined by a delimiter — [model/entity/Sku.cfc:L233-L239].
   *
   */
  getOptionsDisplay(delimiter: string = SKU_OPTIONS_DISPLAY_DEFAULT_DELIMITER): string {
    let displayedOptions = '';
    for (const option of this.options) {
      /*
       * [:L236] appends `getOptions[i].getOptionName()` with no null guard. `optionName` is
       * optional on the ported Option because [model/entity/Option.cfc:L54] declares no default, so
       * an absent name is represented as the empty string here rather than raising: unlike the
       * option-group chains this is a scalar read, and CFML `listAppend` accepts an empty value and
       * appends an empty element for it. Raising would invent a failure the legacy does not have.
       */
      displayedOptions = appendToDelimitedList(
        displayedOptions,
        option.optionName ?? '',
        delimiter,
      );
    }
    return displayedOptions;
  }

  /**
   * The option belonging to a given option group, by group identifier —
   * [model/entity/Sku.cfc:L241-L245].
   *
   * @param optionGroupID the option group's identifier
   * @returns the matching option, or `undefined`
   */
  getOptionByOptionGroupID(optionGroupID: string): Option | undefined {
    const optionsByOptionGroupId = this.getOptionsByOptionGroupIDStruct();
    /*
     * The two-step read is the transliteration of `structKeyExists(...)` followed by an index, and
     * under `noUncheckedIndexedAccess` the index yields `Option | undefined` regardless — so the
     * narrowing is what the compiler requires and what the legacy shape describes.
     */
    if (Object.hasOwn(optionsByOptionGroupId, optionGroupID)) {
      return optionsByOptionGroupId[optionGroupID];
    }
    return undefined;
  }

  /**
   * The option belonging to a given option group, by group code — [model/entity/Sku.cfc:L247-L251].
   *
   * TODO(parity) [model/entity/Sku.cfc:L247-L251] — defect D3, carried not repaired.
   *
   */
  getOptionByOptionGroupCode(optionGroupCode: string): Option | undefined {
    /*
     * [:L248] — the guard consults the code-keyed map. This call is what raises D1, and it is placed
     * first because that is where the legacy places it.
     */
    const optionsByOptionGroupCode = this.getOptionsByOptionGroupCodeStruct();
    if (Object.hasOwn(optionsByOptionGroupCode, optionGroupCode)) {
      /* [:L249] — and the return indexes the identifier-keyed map. The mismatch is defect D3. */
      return this.getOptionsByOptionGroupIDStruct()[optionGroupCode];
    }
    return undefined;
  }

  /**
   * This SKU's options keyed by option group code — [model/entity/Sku.cfc:L500-L510].
   *
   * TODO(parity) [model/entity/Sku.cfc:L500-L510] — defect D1, carried not repaired.
   * This member fails on every call, by design of the port and by behaviour of the legacy.
   *
   */
  getOptionsByOptionGroupCodeStruct(): Record<string, Option> {
    /*
     * [:L502] — the wrong-variable initialisation, reproduced including its clobber of D2's cache,
     * and reproduced before the failure because that is the legacy order of execution. It is
     * unconditional because the legacy guard at [:L501] is dead.
     */
    this.#optionsByOptionGroupIdStruct = {};
    throw new DomainError(
      'Sku.getOptionsByOptionGroupCodeStruct is unusable: model/entity/Sku.cfc:L502 initialises ' +
        'the identifier-keyed struct while model/entity/Sku.cfc:L504 and :L509 read a ' +
        'code-keyed struct that is never created, so the legacy member raises an ' +
        'undefined-variable error on every call. Carried unrepaired as defect D1 per AAP §0.6.7.2 ' +
        'and Refactor Discipline Guideline 4. It has already reset the identifier-keyed cache, ' +
        'exactly as the legacy does.',
      {
        context: {
          skuID: this.skuID,
          defect: 'D1',
          locator: 'model/entity/Sku.cfc:L500-L510',
          optionCount: this.options.length,
        },
      },
    );
  }

  /**
   * This SKU's options keyed by option group identifier — [model/entity/Sku.cfc:L512-L522].
   *
   * TODO(parity) [model/entity/Sku.cfc:L512-L522] — defect D2, carried not repaired.
   * This member always returns an empty map, however many options are attached.
   *
   */
  getOptionsByOptionGroupIDStruct(): Record<string, Option> {
    if (this.#optionsByOptionGroupIdStruct === undefined) {
      /* [:L514] — the map that will be returned, and that nothing ever writes into. */
      this.#optionsByOptionGroupIdStruct = {};
      const returnedStruct = this.#optionsByOptionGroupIdStruct;
      for (const option of this.options) {
        /* [:L516] and [:L517] both dereference the option group; the legacy guards neither. */
        const optionGroup = this.#requireOptionGroup(option, 'model/entity/Sku.cfc:L516');
        const optionGroupId = optionGroup.optionGroupID;
        /* [:L516] — the existence check consults the map that is returned. */
        if (!Object.hasOwn(returnedStruct, optionGroupId)) {
          /* [:L517] — and the write goes to the third struct. This one line is defect D2. */
          this.#discardedOptionsByGroupIdStruct[optionGroupId] = option;
        }
      }
    }
    /* [:L521] — always the empty map. */
    return this.#optionsByOptionGroupIdStruct;
  }

  /**
   * This SKU's option identifiers as a comma-delimited string — [model/entity/Sku.cfc:L524-L533].
   *
   */
  getOptionsIDList(): string {
    if (this.#optionsIdList === undefined) {
      let optionsIdList = '';
      for (const option of this.options) {
        optionsIdList = appendToDelimitedList(optionsIdList, option.optionID);
      }
      this.#optionsIdList = optionsIdList;
    }
    return this.#optionsIdList;
  }

  /* The two method-based validation rules (ir-4 — behaviour, not helpers) */

  /**
   * Whether no other SKU of this product carries this SKU's exact option combination —
   * [model/entity/Sku.cfc:L756-L769].
   *
   * TODO(parity) AAP §0.6.2 / §0.6.1.3 T5 — defect D19, carried not repaired
   * for a SKU with zero options, `optionsList` is the empty string. AAP §0.6.1.3 T5 establishes that
   * an empty selection is a legal, meaningful input which makes the query degenerate to "all
   * option-bearing SKUs of this product". The guard at [:L764] can then only pass when the product has
   * no option-bearing SKUs at all.
   *
   */
  async hasUniqueOptions(lookup: SkusBySelectedOptionsLookup): Promise<boolean> {
    /*
     * [:L757-L761] — built independently of {@link Sku.getOptionsIDList} because the legacy builds it
     * independently too, with its own local accumulator and no memoization. Sharing the memoized
     * accessor would be a behavioural change on any SKU whose options were mutated between calls.
     */
    let optionsList = '';
    for (const option of this.options) {
      optionsList = appendToDelimitedList(optionsList, option.optionID);
    }

    /* [:L763] — the database round trip. */
    const skus = await lookup.getSkusBySelectedOptions(optionsList);

    /* [:L764] — `!arrayLen(skus)`. */
    if (skus.length === 0) {
      return true;
    }

    /*
     * [:L764] — `arrayLen(skus) == 1 && skus[1].getSkuID() == getSkuID()`. CFML arrays are 1-based, so
     * the legacy `skus[1]` is this `skus[0]`.
     */
    if (skus.length === 1) {
      const onlyMatch = skus[0];
      if (onlyMatch !== undefined && onlyMatch.skuID === this.skuID) {
        return true;
      }
    }

    /* [:L768]. */
    return false;
  }

  /**
   * Whether this SKU holds at most one option per option group — [model/entity/Sku.cfc:L772-L784].
   *
   */
  hasOneOptionPerOptionGroup(): boolean {
    const seenOptionGroupIds = new Set<string>();
    for (const option of this.options) {
      const optionGroupId = this.#requireOptionGroup(
        option,
        'model/entity/Sku.cfc:L776',
      ).optionGroupID;
      /* [:L776-L777] — `false` on the first repeat, before any further option is examined. */
      if (seenOptionGroupIds.has(optionGroupId)) {
        return false;
      }
      /* [:L779] — otherwise record it and continue. */
      seenOptionGroupIds.add(optionGroupId);
    }
    /* [:L783]. */
    return true;
  }

  /* Base product type and SKU definition. */

  /**
   * This SKU's base product type, delegated to its product — [model/entity/Sku.cfc:L356-L358], whose
   * body is `return getProduct().getBaseProductType;`.
   *
   *
   */
  async getBaseProductType(
    rootProductTypeResolver: SkuProductTypeRootResolver,
  ): Promise<SkuBaseProductTypeCode | undefined> {
    const product = this.#requireProduct('model/entity/Sku.cfc:L357');
    return product.getBaseProductType(rootProductTypeResolver);
  }

  /**
   * A human-readable definition of what distinguishes this SKU — [model/entity/Sku.cfc:L574-L590].
   *
   *
   */
  async getSkuDefinition(
    rootProductTypeResolver: SkuProductTypeRootResolver,
    subscriptionTermLabel: string = SUBSCRIPTION_TERM_RESOURCE_BUNDLE_KEY,
  ): Promise<string> {
    if (this.#skuDefinition !== undefined) {
      return this.#skuDefinition;
    }

    /* [:L576] — the result starts empty, and for a content-access SKU it stays that way. */
    this.#skuDefinition = '';
    let skuDefinition = '';
    const baseProductType = await this.getBaseProductType(rootProductTypeResolver);

    /*
     * The runtime recognition gate. An unrecognised code matches none of the three legacy arms and
     * leaves the definition empty — the `if` reproduces that outcome directly, and the exhaustive
     * switch inside it is what lets the compiler check the three arms without narrowing the value's
     * own type (see {@link SkuBaseProductTypeCode}). Recognition is the reason no cast is needed.
     */
    const recognisedBaseProductType = resolveBaseProductType(baseProductType);
    if (recognisedBaseProductType !== undefined) {
      switch (recognisedBaseProductType) {
        case 'contentAccess':
          /*
           * [:L577-L578] — deliberately empty, preserved as an explicit no-op arm. The definition of
           * a content-access SKU is the empty string. Do not collapse this branch: it is behaviour,
           * and removing it would erase the distinction between "no arm matched" and "the
           * content-access arm matched and chose to say nothing".
           */
          skuDefinition = '';
          break;

        case 'merchandise':
          /* [:L580-L582]. */
          for (const option of this.options) {
            const optionGroupName =
              this.#requireOptionGroup(option, 'model/entity/Sku.cfc:L581').optionGroupName ?? '';
            skuDefinition = appendToDelimitedList(
              skuDefinition,
              ` ${optionGroupName}: ${option.optionName ?? ''}`,
              SKU_DEFINITION_SEGMENT_DELIMITER,
            );
          }
          /*
           * [:L583] is `trim(variables.skuDefinition);` — a bare expression whose result is thrown
           * away. Not reproduced as a trim, deliberately. TODO(parity) [model/entity/Sku.cfc:L583] —
           * detail 3 above. The leading space of the first segment is part of the returned value.
           */
          break;

        case 'subscription':
          /*
           * [:L585]. TODO(boundary) [model/entity/Sku.cfc:L585] — the term name is read through
           * {@link SubscriptionTermRef}, the one member by which that shape exceeds the real
           * subscription-term port, and the label is a resource-bundle key awaiting resolution. The
           * legacy dereferences the term without a guard; an absent term yields an empty name here
           * rather than raising, because the arm is already boundary-flagged and raising would
           * attribute a failure to this entity that in fact belongs to the unported subscription
           * domain.
           */
          skuDefinition = `${subscriptionTermLabel}: ${
            this.subscriptionTerm?.subscriptionTermName ?? ''
          }`;
          break;
      }
    }

    this.#skuDefinition = skuDefinition;
    return skuDefinition;
  }

  /*
   * Image members — every one of them behind the image port
   *
   * Legacy origins [model/entity/Sku.cfc:L131-L227]. Four of the eight are required by declared
   * consumers rather than optional: `src/domain/product/Product.ts` exposes nine default-SKU
   * delegating guards — the ported form of [model/entity/Product.cfc:L556] and following — and four of
   * them call through to `getImagePath`, `getImage`, `getResizedImagePath` and `getImageExistsFlag`.
   * `processImageUpload` at [model/service/SkuService.cfc:L211] calls `getImagePath` as well.
   */

  /**
   * The file name this SKU's default image should carry — [model/entity/Sku.cfc:L131-L139].
   *
   */
  generateImageFileName(settings: SkuSettingResolver): string {
    const product = this.#requireProduct('model/entity/Sku.cfc:L135');
    const productContext: SkuSettingResolutionContext = {
      entityName: 'Product',
      entityId: product.productID,
    };

    /* [:L132-L137]. */
    let optionString = '';
    for (const option of this.options) {
      const optionGroup = this.#requireOptionGroup(option, 'model/entity/Sku.cfc:L134');
      if (optionGroup.imageGroupFlag) {
        optionString +=
          settings.setting('productImageOptionCodeDelimiter', productContext) +
          stripDisallowedImageFileNameCharacters(option.optionCode ?? '');
      }
    }

    /* [:L138]. */
    const sanitisedProductCode = stripDisallowedImageFileNameCharacters(product.productCode ?? '');
    const extension = settings.setting('productImageDefaultExtension', productContext);
    return `${sanitisedProductCode}${optionString}.${extension}`;
  }

  /**
   * The extension of this SKU's image file — [model/entity/Sku.cfc:L141-L143], whose body is
   * `return listLast(getImageFile(), ".");`.
   *
   */
  getImageExtension(): string {
    const elements = (this.imageFile ?? '').split('.').filter((element) => element !== '');
    return elements.length === 0 ? '' : (elements[elements.length - 1] ?? '');
  }

  /**
   * The URL path of this SKU's default image — [model/entity/Sku.cfc:L145-L147], whose body is
   * `return "#getHibachiScope().getBaseImageURL()#/product/default/#getImageFile()#";`.
   *
   */
  async getImagePath(imagePaths: SkuImagePathResolver): Promise<ImageWebPath> {
    return imagePaths.getImagePath(this.imageFile ?? '');
  }

  /**
   * Rendered markup for this SKU's image — [model/entity/Sku.cfc:L149-L151], whose body is
   * `return getResizedImage(argumentcollection=arguments);`.
   *
   */
  async getImage(
    collaborators: SkuResizedImageCollaborators,
    options: SkuResizedImageOptions = {},
  ): Promise<string> {
    return this.getResizedImage(collaborators, options);
  }

  /**
   * Rendered markup for this SKU's image at a requested size — [model/entity/Sku.cfc:L153-L190].
   *
   *
   *
   */
  async getResizedImage(
    collaborators: SkuResizedImageCollaborators,
    options: SkuResizedImageOptions = {},
  ): Promise<string> {
    /* [:L156]. */
    const imagePath = await this.getImagePath(collaborators.imagePaths);
    const skuContext: SkuSettingResolutionContext = { entityName: 'Sku', entityId: this.skuID };

    /* [:L159-L161] — only when absent and the setting has content. */
    let alt = options.alt;
    if (alt === undefined) {
      const imageAltString = collaborators.settings.setting('imageAltString', skuContext);
      if (imageAltString.length > 0) {
        alt = collaborators.expandStringTemplate(imageAltString);
      }
    }

    /* [:L164-L166]. */
    const missingImagePath =
      options.missingImagePath ??
      collaborators.settings.setting('imageMissingImagePath', skuContext);

    const dimensions = this.#applyDeprecatedImageSizeLogic(collaborators.settings, options, false);

    const request: {
      imagePath: ImageWebPath;
      missingImagePath: string;
      size?: string;
      width?: number;
      height?: number;
      resizeMethod?: string;
      alt?: string;
    } = { imagePath, missingImagePath };
    if (dimensions.size !== undefined) {
      request.size = dimensions.size;
    }
    if (dimensions.width !== undefined) {
      request.width = dimensions.width;
    }
    if (dimensions.height !== undefined) {
      request.height = dimensions.height;
    }
    if (dimensions.resizeMethod !== undefined) {
      request.resizeMethod = dimensions.resizeMethod;
    }
    if (alt !== undefined) {
      request.alt = alt;
    }

    /* [:L189] — AAP §0.7.3 mismatch M-iii: no declared port owns this capability. */
    return collaborators.renderer.getResizedImage(request);
  }

  /**
   * The path of this SKU's image at a requested size — [model/entity/Sku.cfc:L192-L219].
   *
   */
  async getResizedImagePath(
    imagePaths: SkuImagePathResolver,
    settings: SkuSettingResolver,
    options: SkuResizedImageOptions = {},
  ): Promise<ImageWebPath> {
    /* [:L195]. */
    const imagePath = await this.getImagePath(imagePaths);

    /* [:L198-L200]. */
    const missingImagePath =
      options.missingImagePath ??
      settings.setting('imageMissingImagePath', { entityName: 'Sku', entityId: this.skuID });

    const dimensions = this.#applyDeprecatedImageSizeLogic(settings, options, true);

    const request: {
      imagePath: ImageWebPath;
      missingImagePath: string;
      size?: string;
      width?: number;
      height?: number;
      resizeMethod?: string;
    } = { imagePath, missingImagePath };
    if (dimensions.size !== undefined) {
      request.size = dimensions.size;
    }
    if (dimensions.width !== undefined) {
      request.width = dimensions.width;
    }
    if (dimensions.height !== undefined) {
      request.height = dimensions.height;
    }
    if (dimensions.resizeMethod !== undefined) {
      request.resizeMethod = dimensions.resizeMethod;
    }

    /* [:L218]. */
    return imagePaths.getResizedImagePath(request);
  }

  /**
   * The deprecated size logic shared by the two resized-image members — [model/entity/Sku.cfc:L168-L187]
   * and [:L202-L216].
   *
   *
   */
  #applyDeprecatedImageSizeLogic(
    settings: SkuSettingResolver,
    options: SkuResizedImageOptions,
    forceRecognisedSize: boolean,
  ): { size?: string; width?: number; height?: number; resizeMethod?: string } {
    const product = this.product;
    const requestedSize = options.size;

    /*
     * The four-conjunct gate of [:L169] and [:L203]. Explicit dimensions win outright, and a SKU with
     * no product skips the mapping entirely — in which case the requested size stays in the request.
     */
    const mappingApplies =
      requestedSize !== undefined &&
      product !== undefined &&
      options.width === undefined &&
      options.height === undefined;

    if (!mappingApplies) {
      const untouched: { size?: string; width?: number; height?: number } = {};
      if (requestedSize !== undefined) {
        untouched.size = requestedSize;
      }
      if (options.width !== undefined) {
        untouched.width = options.width;
      }
      if (options.height !== undefined) {
        untouched.height = options.height;
      }
      return untouched;
    }

    /* [:L171] and [:L204] both lower-case before comparing. */
    const loweredSize = requestedSize.toLowerCase();
    const aliasedSize = DEPRECATED_IMAGE_SIZE_ALIASES[loweredSize];
    const mappedSize =
      aliasedSize ?? (forceRecognisedSize ? DEPRECATED_IMAGE_SIZE_FALLBACK : loweredSize);

    const productContext: SkuSettingResolutionContext = {
      entityName: 'Product',
      entityId: product.productID,
    };

    /* [:L184-L186] and [:L212-L214]. `size` is intentionally absent from the result. */
    return {
      width: Number(settings.setting(`productImage${mappedSize}Width`, productContext)),
      height: Number(settings.setting(`productImage${mappedSize}Height`, productContext)),
      resizeMethod: SKU_RESIZE_METHOD_SCALE_BEST,
    };
  }

  /**
   * Whether this SKU's image file actually exists — [model/entity/Sku.cfc:L221-L227], whose body is
   * `if( fileExists(expandPath(getImagePath)) ) { return true; } else { return false; }`.
   *
   */
  async getImageExistsFlag(imagePaths: SkuImagePathResolver): Promise<boolean> {
    /*
     * [:L222] — `fileExists(expandPath(getImagePath))`, in the legacy's own order: compose first,
     * probe second. The composition is the port's, as it is at [:L146].
     */
    const imagePath = await imagePaths.getImagePath(this.imageFile ?? '');

    return imagePaths.getImageExistsFlag(imagePath);
  }

  /**
   * This SKU's memoized image file name — [model/entity/Sku.cfc:L794-L799].
   *
   */
  getImageName(settings: SkuSettingResolver): string {
    if (this.#imageName === undefined) {
      this.#imageName = this.generateImageFileName(settings);
    }
    return this.#imageName;
  }

  /* The two delete-guard flags — both must be exposed. */

  /**
   * Whether this SKU is its product's default — [model/entity/Sku.cfc:L442-L447], whose body is
   * `if(getProduct().getDefaultSku().getSkuID() == getSkuID()) { return true; } return false;`.
   *
   * @param readDefaultSkuId reads the identifier of the product's default SKU
   * @returns `true` when this SKU is its product's default
   * @throws {DomainError} when this SKU has no product, or its product has no default SKU —
   * reproducing the two unguarded dereferences at [model/entity/Sku.cfc:L443]
   */
  getDefaultFlag(readDefaultSkuId: DefaultSkuIdReader): boolean {
    const product = this.#requireProduct('model/entity/Sku.cfc:L443');
    const defaultSku = product.defaultSku;
    if (defaultSku === undefined) {
      throw new DomainError(
        `Sku ${this.skuID === SKU_UNSAVED_ID_VALUE ? '(unsaved)' : this.skuID} belongs to product ` +
          `${product.productID === '' ? '(unsaved)' : product.productID}, which has no default SKU, ` +
          'so model/entity/Sku.cfc:L443 cannot resolve. The legacy code dereferences the default ' +
          'SKU without a guard at that line and raises here too.',
        {
          context: {
            skuID: this.skuID,
            productID: product.productID,
            locator: 'model/entity/Sku.cfc:L443',
          },
        },
      );
    }
    return readDefaultSkuId(defaultSku) === this.skuID;
  }

  /**
   * Whether any transaction references this SKU — [model/entity/Sku.cfc:L592-L597].
   *
   * @param checker answers the existence question
   * @returns `true` when a transaction references this SKU.
   */
  async getTransactionExistsFlag(checker: SkuTransactionExistenceChecker): Promise<boolean> {
    if (this.#transactionExistsFlag === undefined) {
      // skuID occupies the first parameter — model/service/SkuService.cfc:L285-L287 forwards whatever the
      // caller names, and [model/entity/Sku.cfc:L594] names this one, reaching the SKU-scoped branch at
      // SkuDAO.cfc:L58-L59.
      this.#transactionExistsFlag = await checker.getTransactionExistsFlag(this.skuID);
    }
    return this.#transactionExistsFlag;
  }

  /* Bidirectional helpers — [model/entity/Sku.cfc:L604-L637] */

  /**
   * Associates this SKU with a product, maintaining both sides — [model/entity/Sku.cfc:L604-L609]:
   *
   * Variables.product = arguments.product;
   * if(isNew or !arguments.product.hasSku( this )) {
   * arrayAppend(arguments.product.getSkus, this);
   * }
   *
   * TODO(parity) [model/entity/Sku.cfc:L606] — the short-circuit double-append is carried. CFML `or`
   * short-circuits, so for a NEW SKU the membership test is never evaluated and the append is
   * unconditional: calling `product.addSku(sku)` twice on the same new SKU appends it twice, inflating
   * the collection length so the next generated code skips a number. No idempotency guard is added and
   * the `||` below preserves the short-circuit exactly. The membership predicate is evaluated inline
   * inline, for the reason the file header records.
   *
   */
  setProduct(product: Product): void {
    this.product = product;
    const productSkus = product.getSkus();
    /*
     * [:L606] — the short-circuit is preserved by `||`. For a new SKU the right-hand side is never
     * evaluated, which is the double-append behaviour recorded above.
     */
    if (this.isNew() || !productSkus.includes(this)) {
      /* [:L607] — appends to the live array. See the ordering coupling above. */
      productSkus.push(this);
    }
  }

  /** Disassociates this SKU from a product — [model/entity/Sku.cfc:L610-L619]. */
  removeProduct(product?: Product): void {
    const removeFrom = product ?? this.product;
    if (removeFrom !== undefined) {
      const productSkus = removeFrom.getSkus();
      /* [:L614-L617] — `arrayFind` returns 0 when absent; `indexOf` returns −1. */
      const index = productSkus.indexOf(this);
      if (index !== -1) {
        productSkus.splice(index, 1);
      }
    }
    /* [:L618] — unconditional, outside the guard, exactly as the legacy places it. */
    delete this.product;
  }

  /**
   * Associates this SKU with a subscription term — [model/entity/Sku.cfc:L622-L627].
   *
   * TODO(boundary) [model/entity/Sku.cfc:L624-L626] — the far-side append belongs to a ported
   * `SubscriptionTerm`, and the short-circuit double-append of [:L624] is the same defect as
   * [:L606] applied to that relationship.
   *
   */
  setSubscriptionTerm(subscriptionTerm: SubscriptionTermRef): void {
    this.subscriptionTerm = subscriptionTerm;
  }

  /**
   * Disassociates this SKU from a subscription term — [model/entity/Sku.cfc:L628-L637].
   *
   * @param _subscriptionTerm the term to detach from; unread, see above.
   */
  removeSubscriptionTerm(_subscriptionTerm?: SubscriptionTermRef): void {
    /* [:L636] — unconditional, outside the guard the far side would have needed. */
    delete this.subscriptionTerm;
  }

  /* Price and currency. */

  /**
   * This SKU's price — the explicit form of the accessor synthesized from
   * [model/entity/Sku.cfc:L56].
   *
   * @returns the price, {@link EXACT_DECIMAL_ZERO} on a fresh SKU.
   */
  getPrice(): ExactDecimal {
    return this.price;
  }

  /**
   * This SKU's list price — the explicit form of the accessor synthesized from
   * [model/entity/Sku.cfc:L55]. Required by `Product.ts`'s default-SKU delegate.
   *
   */
  getListPrice(): ExactDecimal {
    return this.listPrice;
  }

  /**
   * This SKU's renewal price — the explicit form of the accessor synthesized from
   * [model/entity/Sku.cfc:L57]. Required by `Product.ts`'s default-SKU delegate, and set by the
   * subscription creation branch at [model/service/SkuService.cfc:L157].
   *
   */
  getRenewalPrice(): ExactDecimal {
    return this.renewalPrice;
  }

  /**
   * The currency this SKU is priced in — [model/entity/Sku.cfc:L360-L365], whose body memoizes
   * `this.setting('skuCurrency')`.
   *
   */
  getCurrencyCode(settings: SkuSettingResolver): string {
    if (this.#currencyCode === undefined) {
      this.#currencyCode = settings.setting('skuCurrency', {
        entityName: 'Sku',
        entityId: this.skuID,
      });
    }
    return this.#currencyCode;
  }

  /**
   * This SKU's sale-price detail — [model/entity/Sku.cfc:L539-L544], whose body memoizes
   * `getProduct().getSkuSalePriceDetails( getSkuID() )`.
   *
   * TODO(boundary) [model/entity/Sku.cfc:L541] — promotion evaluation is out of scope
   * (AAP §0.2.2.1). See {@link SkuSalePricingLookup} for why the lookup is keyed by product rather
   * than by SKU: that is the legacy shape and the real port's shape both.
   *
   */
  async getSalePriceDetails(pricing: SkuSalePricingLookup): Promise<SkuSalePriceDetails> {
    if (this.#salePriceDetails === undefined) {
      const product = this.product;
      if (product === undefined) {
        this.#salePriceDetails = {};
      } else {
        const detailsBySkuId = await pricing.getSalePriceDetailsForProductSkus(product.productID);
        this.#salePriceDetails = detailsBySkuId[this.skuID] ?? {};
      }
    }
    return this.#salePriceDetails;
  }

  /**
   * This SKU's sale price, falling back to its ordinary price —
   * [model/entity/Sku.cfc:L546-L551], whose body returns the detail entry when present and
   * `getPrice` otherwise.
   *
   */
  async getSalePrice(pricing: SkuSalePricingLookup): Promise<ExactDecimal> {
    const details = await this.getSalePriceDetails(pricing);
    const promoted = details.salePrice;
    return promoted === undefined ? this.getPrice() : exactDecimalFromNumber(promoted);
  }

  /**
   * The kind of discount producing this SKU's sale price — [model/entity/Sku.cfc:L553-L558], which
   * returns the detail entry when present and the empty string otherwise.
   *
   */
  async getSalePriceDiscountType(pricing: SkuSalePricingLookup): Promise<string> {
    const details = await this.getSalePriceDetails(pricing);
    return details.salePriceDiscountType ?? '';
  }

  /**
   * When this SKU's sale price stops applying — [model/entity/Sku.cfc:L560-L565], which returns the
   * detail entry when present and the empty string otherwise.
   *
   */
  async getSalePriceExpirationDateTime(pricing: SkuSalePricingLookup): Promise<Date | ''> {
    const details = await this.getSalePriceDetails(pricing);
    return details.salePriceExpirationDateTime ?? '';
  }

  /* Boundary-stubbed members — declared, typed, and honest about not being implementable here. */

  /**
   * This SKU's price under a promotion — [model/entity/Sku.cfc:L257-L259], which delegates to
   * `promotionService.calculateSkuPriceBasedOnPromotion`.
   *
   * TODO(boundary) [model/entity/Sku.cfc:L257-L259] — `promotionService` is out of scope
   * (AAP §0.2.2.1, `model/**\/Promotion*.cfc`, 9 files). No port in the plan exposes promotion price
   * CALCULATION; the pricing port exposes resolved sale-price detail, which is a different question,
   * so this cannot be satisfied by {@link SkuSalePricingLookup}.
   *
   */
  getPriceByPromotion(_promotion: object): never {
    throw new NotImplementedError(
      'Sku.getPriceByPromotion',
      'model/entity/Sku.cfc:L257-L259 delegates to promotionService, which AAP §0.2.2.1 excludes, ' +
        'and no port in the plan exposes promotion price calculation',
      { context: { skuID: this.skuID, locator: 'model/entity/Sku.cfc:L257-L259' } },
    );
  }

  /**
   * This SKU's price under a price group — [model/entity/Sku.cfc:L261-L263], which delegates to
   * `priceGroupService.calculateSkuPriceBasedOnPriceGroup`.
   *
   * TODO(boundary) [model/entity/Sku.cfc:L261-L263] — `priceGroupService` is out of scope
   * (AAP §0.2.2.1, `model/**\/PriceGroup*.cfc`, 4 files).
   *
   */
  getPriceByPriceGroup(_priceGroup: object): never {
    throw new NotImplementedError(
      'Sku.getPriceByPriceGroup',
      'model/entity/Sku.cfc:L261-L263 delegates to priceGroupService, which AAP §0.2.2.1 excludes',
      { context: { skuID: this.skuID, locator: 'model/entity/Sku.cfc:L261-L263' } },
    );
  }

  /**
   * The price-group rate applying to this SKU — [model/entity/Sku.cfc:L265-L267], which delegates to
   * `priceGroupService.getRateForSkuBasedOnPriceGroup`.
   *
   * TODO(boundary) [model/entity/Sku.cfc:L265-L267] — `priceGroupService` is out of scope, and the
   * rate entity itself is the excluded `priceGroupRates` relationship at [model/entity/Sku.cfc:L86].
   *
   */
  getAppliedPriceGroupRateByPriceGroup(_priceGroup: object): never {
    throw new NotImplementedError(
      'Sku.getAppliedPriceGroupRateByPriceGroup',
      'model/entity/Sku.cfc:L265-L267 delegates to priceGroupService, which AAP §0.2.2.1 excludes',
      { context: { skuID: this.skuID, locator: 'model/entity/Sku.cfc:L265-L267' } },
    );
  }

  /**
   * This SKU's price in a given currency — [model/entity/Sku.cfc:L269-L273].
   *
   * TODO(boundary) [model/entity/Sku.cfc:L269-L273] — it reads `getCurrencyDetails()`, one of the
   * thirteen excluded non-persistent members ([:L104], getter at [:L367]), which builds its map from
   * `currencyService` and the excluded `skuCurrencies` relationship at [:L72]. Both are out of scope
   * (AAP §0.2.2.1). The legacy has no `else` arm here, so it returns null on a miss — which is why the
   * member cannot simply be replaced by reading {@link Sku.getPrice}: an unknown currency is a
   * distinct answer from the base price.
   *
   */
  getPriceByCurrencyCode(_currencyCode: string): never {
    throw new NotImplementedError(
      'Sku.getPriceByCurrencyCode',
      'model/entity/Sku.cfc:L269-L273 reads getCurrencyDetails(), an excluded calculated member ' +
        'built from currencyService and the excluded skuCurrencies relationship',
      { context: { skuID: this.skuID, locator: 'model/entity/Sku.cfc:L269-L273' } },
    );
  }

  /**
   * This SKU's list price in a given currency — [model/entity/Sku.cfc:L275-L279].
   *
   * TODO(boundary) [model/entity/Sku.cfc:L275-L279] — same excluded dependency as
   * {@link Sku.getPriceByCurrencyCode}. Note the legacy guard here is a two-part test, checking both
   * that the currency is present and that its entry carries a list price, so an entry without one
   * returns null rather than falling back.
   *
   */
  getListPriceByCurrencyCode(_currencyCode: string): never {
    throw new NotImplementedError(
      'Sku.getListPriceByCurrencyCode',
      'model/entity/Sku.cfc:L275-L279 reads getCurrencyDetails(), an excluded calculated member',
      { context: { skuID: this.skuID, locator: 'model/entity/Sku.cfc:L275-L279' } },
    );
  }

  /**
   * This SKU's renewal price in a given currency — [model/entity/Sku.cfc:L281-L285].
   *
   * TODO(boundary) [model/entity/Sku.cfc:L281-L285] — same excluded dependency and the same two-part
   * guard as {@link Sku.getListPriceByCurrencyCode}.
   *
   */
  getRenewalPriceByCurrencyCode(_currencyCode: string): never {
    throw new NotImplementedError(
      'Sku.getRenewalPriceByCurrencyCode',
      'model/entity/Sku.cfc:L281-L285 reads getCurrencyDetails(), an excluded calculated member',
      { context: { skuID: this.skuID, locator: 'model/entity/Sku.cfc:L281-L285' } },
    );
  }

  /**
   * A quantity of this SKU of a requested type — [model/entity/Sku.cfc:L291-L316].
   *
   * TODO(boundary) [model/entity/Sku.cfc:L291-L316] — the largest boundary member of the entity. Its
   * four branches reach `locationService` [:L295], `stockService` [:L296] and [:L300],
   * `Product.getQuantity` [:L308] and `inventoryService` through a dynamic method-name composition at
   * [:L310] — `invokeMethod("get#arguments.quantityType#", …)`, which is the same metaprogramming
   * IR-1 exists to eliminate. Every one of those services is excluded (AAP §0.2.2.1:
   * `model/**\/Location*.cfc` 4 files, `model/**\/Stock*.cfc` 11, `model/**\/Inventory*.cfc` 3).
   *
   */
  getQuantity(_quantityType: string, _locationID?: string, _stockID?: string): never {
    throw new NotImplementedError(
      'Sku.getQuantity',
      'model/entity/Sku.cfc:L291-L316 reaches locationService, stockService and inventoryService, ' +
        'all excluded by AAP §0.2.2.1, and composes an inventory method name dynamically at :L310',
      { context: { skuID: this.skuID, locator: 'model/entity/Sku.cfc:L291-L316' } },
    );
  }

  /**
   * Whether this SKU's stock records may be deleted — [model/entity/Sku.cfc:L567-L572].
   *
   * TODO(parity) [model/entity/Sku.cfc:L567-L572] — defect D4, carried not repaired.
   * This member cannot resolve in the legacy system either.
   *
   */
  getStocksDeletableFlag(): never {
    throw new NotImplementedError(
      'Sku.getStocksDeletableFlag',
      'carried unrepaired as defect D4: model/entity/Sku.cfc:L569 calls ' +
        'SkuService.getSkuStocksDeletableFlag, which at model/service/SkuService.cfc:L281-L283 ' +
        'delegates to a DAO member that exists nowhere in the repository, so the chain is broken ' +
        'in the legacy source and no implementation is invented here',
      {
        context: {
          skuID: this.skuID,
          defect: 'D4',
          locator: 'model/entity/Sku.cfc:L567-L572',
        },
      },
    );
  }

  /* Deprecated members — [model/entity/Sku.cfc:L882-L912], carried with their hints (D16) */

  /**
   * The option names of this SKU joined by a delimiter — [model/entity/Sku.cfc:L885-L891].
   *
   * @deprecated use skuDefinition — the legacy hint at [model/entity/Sku.cfc:L884], verbatim.
   *
   */
  displayOptions(delimiter: string = SKU_OPTIONS_DISPLAY_DEFAULT_DELIMITER): string {
    return this.getOptionsDisplay(delimiter);
  }

  /**
   * This SKU's options keyed by option group identifier — [model/entity/Sku.cfc:L894-L896].
   *
   * @deprecated use getOptionsByOptionGroupIDStruct — the legacy hint at
   * [model/entity/Sku.cfc:L893], verbatim. Registered as part of defect D16.
   *
   */
  getOptionsByGroupIDStruct(): Record<string, Option> {
    return this.getOptionsByOptionGroupIDStruct();
  }

  /**
   * This SKU's option identifiers keyed by option group name — [model/entity/Sku.cfc:L899-L905].
   *
   * @deprecated never use — the legacy hint at [model/entity/Sku.cfc:L898], verbatim and unsoftened.
   * Registered as part of defect D16.
   *
   */
  getOptionsValueStruct(): Record<string, string> {
    const optionsByOptionGroupName: Record<string, string> = {};
    for (const option of this.options) {
      const optionGroupName =
        this.#requireOptionGroup(option, 'model/entity/Sku.cfc:L902').optionGroupName ?? '';
      /* [:L902] — unconditional assignment, so the last option for a name wins. */
      optionsByOptionGroupName[optionGroupName] = option.optionID;
    }
    return optionsByOptionGroupName;
  }

  /**
   * Whether this SKU is not its product's default — [model/entity/Sku.cfc:L908-L910], whose body is
   * `return !getDefaultFlag;`.
   *
   * @deprecated use getDefaultFlag — the legacy hint at [model/entity/Sku.cfc:L907], verbatim.
   * Registered as part of defect D16.
   *
   */
  isNotDefaultSku(readDefaultSkuId: DefaultSkuIdReader): boolean {
    return !this.getDefaultFlag(readDefaultSkuId);
  }

  /*
   * The managed-entity contract — [org/Hibachi/**], inherited in CFML, declared here (IR-1 / TR-3)
   * Seven members every legacy entity received down the
   * `HibachiObject` -> `HibachiTransient` -> `HibachiEntity` -> `model/entity/HibachiEntity.cfc`
   * inheritance chain, and which `src/validation/Validator.ts` and
   * `src/ports/UniquePropertyPort.ts` both require by name. Neither contract can be satisfied by a
   * plain data class, which is why they are declared rather than assumed.
   */

  /**
   * `Sku` — [org/Hibachi/HibachiObject.cfc:L135-L137], the last dot-delimited segment of the
   * component's fully qualified name. Interpolated into every validation message
   * [org/Hibachi/HibachiValidationService.cfc:L202, :L213, :L216].
   *
   * @returns The bare class name.
   */
  getClassName(): string {
    return SKU_CLASS_NAME;
  }

  /**
   * `SlatwallSku` — [org/Hibachi/HibachiEntity.cfc:L287-L289]. Live metadata reflection is replaced by the
   * declared constant, per TR-3.
   *
   * @returns The mapped ORM entity name, not the physical table name.
   */
  getEntityName(): string {
    return SKU_ENTITY_NAME;
  }

  /**
   * `skuID` — [org/Hibachi/HibachiEntity.cfc:L249-L251]. The legacy resolved this through
   * `getService("hibachiService")`; the string-keyed service locator is replaced by the declared
   * constant, per TR-3 and AAP §0.7.3.
   *
   * @returns The name of the primary identifier property.
   */
  getPrimaryIDPropertyName(): string {
    return SKU_PRIMARY_ID_PROPERTY_NAME;
  }

  /**
   * The primary identifier's value — [org/Hibachi/HibachiEntity.cfc:L244-L246], which forwards to
   * the generated getter for whichever property `getPrimaryIDPropertyName` names.
   *
   * @returns The identifier, or `''` while unsaved.
   */
  getPrimaryIDValue(): string {
    return this.skuID;
  }

  /**
   * Whether this entity declares the named property —
   * [org/Hibachi/HibachiTransient.cfc:L763-L765].
   *
   * @param propertyIdentifier - The name to test, in its declared casing.
   * @returns `true` when the property is declared.
   */
  hasProperty(propertyIdentifier: string): boolean {
    return hasDeclaredProperty(SKU_DECLARED_PROPERTIES, propertyIdentifier);
  }

  /**
   * Resolves a declared property's metadata, raising for an undeclared name —
   * [org/Hibachi/HibachiTransient.cfc:L738-L747], whose present-key branch is at [:L741-L743] and
   * whose throw is at [:L746]. The non-optional return type is faithful to that declaration.
   *
   * @param propertyName - The name to resolve.
   * @returns The metadata for that property.
   * @throws DomainError - When no property of that name is declared. Withheld from every response
   * by the deny-by-default presentation, because it signals a fault in the port rather than
   * anything a caller can provoke.
   */
  getPropertyMetaData(propertyName: string): EntityPropertyMetaData {
    return requireDeclaredPropertyMetaData(SKU_DECLARED_PROPERTIES, propertyName, SKU_CLASS_NAME);
  }

  /**
   * Reads a value by property identifier, walking a path delimited by either `.` or `_` —
   * [org/Hibachi/HibachiTransient.cfc:L466-L481]. An unresolvable path yields `''`, never an absent
   * value; `readValueByPropertyIdentifier` documents all four traversal rules and why each is
   * behaviour rather than convenience.
   *
   * @param propertyIdentifier - A property name, or a delimited path.
   * @returns The resolved value, or `''`.
   */
  getValueByPropertyIdentifier(propertyIdentifier: string): unknown {
    return readValueByPropertyIdentifier(this, propertyIdentifier);
  }
}

/* The population contract. */

/**
 * Every persistent property name [model/entity/Sku.cfc] declares — all thirty-one, in declaration
 * order: the eight scalars [`:L52-:L59`], the calculated column [`:L62`], the two many-to-one
 * relationships [`:L65-:L66`], the five one-to-many collections [`:L69-:L73`], the four owning
 * many-to-many relationships [`:L76-:L79`], the six inverse many-to-many relationships [`:L82-:L87`],
 * `remoteID` [`:L90`] and the four audit properties [`:L93-:L96`], the last of these reused from
 * {@link AuditPropertyName} rather than re-spelled so this union cannot drift from
 * `../base/AuditableEntity`.
 */
export type SkuPropertyName =
  | 'skuID'
  | 'activeFlag'
  | 'skuCode'
  | 'listPrice'
  | 'price'
  | 'renewalPrice'
  | 'imageFile'
  | 'userDefinedPriceFlag'
  | 'calculatedQATS'
  | 'product'
  | 'subscriptionTerm'
  | 'alternateSkuCodes'
  | 'attributeValues'
  | 'orderItems'
  | 'skuCurrencies'
  | 'stocks'
  | 'options'
  | 'accessContents'
  | 'subscriptionBenefits'
  | 'renewalSubscriptionBenefits'
  | 'promotionRewards'
  | 'promotionRewardExclusions'
  | 'promotionQualifiers'
  | 'promotionQualifierExclusions'
  | 'priceGroupRates'
  | 'physicals'
  | 'remoteID'
  | AuditPropertyName;

/**
 * Sku's frozen metadata declaration — what `manageEntity` reads to compose the seven framework
 * introspection members onto an instance.
 */
export const SKU_ENTITY_METADATA: EntityMetadataDeclaration<SkuPropertyName> = Object.freeze({
  className: 'Sku',
  entityName: 'SlatwallSku',
  primaryIDPropertyName: 'skuID',
  properties: Object.freeze({
    skuID: true,
    activeFlag: true,
    skuCode: true,
    listPrice: true,
    price: true,
    renewalPrice: true,
    imageFile: true,
    userDefinedPriceFlag: true,
    calculatedQATS: true,
    product: true,
    subscriptionTerm: true,
    alternateSkuCodes: true,
    attributeValues: true,
    orderItems: true,
    skuCurrencies: true,
    stocks: true,
    options: true,
    accessContents: true,
    subscriptionBenefits: true,
    renewalSubscriptionBenefits: true,
    promotionRewards: true,
    promotionRewardExclusions: true,
    promotionQualifiers: true,
    promotionQualifierExclusions: true,
    priceGroupRates: true,
    physicals: true,
    remoteID: true,
    createdDateTime: true,
    createdByAccount: true,
    modifiedDateTime: true,
    modifiedByAccount: true,
  } satisfies Readonly<Record<SkuPropertyName, true>>),
  declaredNonFieldProperties: Object.freeze({
    adminIcon: true,
    assignedOrderItemAttributeSetSmartList: true,
    baseProductType: true,
    currentAccountPrice: true,
    currencyCode: true,
    currencyDetails: true,
    defaultFlag: true,
    eligibleFulfillmentMethods: true,
    imageExistsFlag: true,
    livePrice: true,
    nextEstimatedAvailableDate: true,
    optionsByOptionGroupCodeStruct: true,
    optionsByOptionGroupIDStruct: true,
    optionsIDList: true,
    qats: true,
    salePriceDetails: true,
    salePrice: true,
    salePriceDiscountType: true,
    salePriceDiscountAmount: true,
    salePriceExpirationDateTime: true,
    skuDefinition: true,
    stocksDeletableFlag: true,
    transactionExistsFlag: true,
  } satisfies Readonly<Record<SkuNonPersistentPropertyName, true>>),
} satisfies EntityMetadataDeclaration<SkuPropertyName>);

/**
 * Every non-persistent property name [model/entity/Sku.cfc:L99-L121] declares — all twenty-three, in
 * declaration order.
 */
export type SkuNonPersistentPropertyName =
  | 'adminIcon'
  | 'assignedOrderItemAttributeSetSmartList'
  | 'baseProductType'
  | 'currentAccountPrice'
  | 'currencyCode'
  | 'currencyDetails'
  | 'defaultFlag'
  | 'eligibleFulfillmentMethods'
  | 'imageExistsFlag'
  | 'livePrice'
  | 'nextEstimatedAvailableDate'
  | 'optionsByOptionGroupCodeStruct'
  | 'optionsByOptionGroupIDStruct'
  | 'optionsIDList'
  | 'qats'
  | 'salePriceDetails'
  | 'salePrice'
  | 'salePriceDiscountType'
  | 'salePriceDiscountAmount'
  | 'salePriceExpirationDateTime'
  | 'skuDefinition'
  | 'stocksDeletableFlag'
  | 'transactionExistsFlag';

/**
 * The seven property identifiers [model/validation/Sku.json] names that this entity actually declares.
 */
export type SkuValidatedPropertyName =
  | Extract<SkuPropertyName, 'listPrice' | 'options' | 'price' | 'renewalPrice' | 'skuCode'>
  | Extract<SkuNonPersistentPropertyName, 'defaultFlag' | 'transactionExistsFlag'>;

/*
 * The managed-entity constants — what only this entity can state
 * `src/domain/base/AuditableEntity.ts` holds the shared managed-entity contract and every word of
 * its rationale. Three facts cannot be shared because they differ per entity, and the legacy
 * resolved all three at runtime — two by reflecting over live component metadata and one through the
 * DI/1 service locator. TR-3 and AAP §0.7.3 replace all three with declarations.
 */

/**
 * The bare class name — the value [org/Hibachi/HibachiObject.cfc:L135-L137] derives by taking the
 * last dot-delimited segment of the component's fully qualified name.
 */
export const SKU_CLASS_NAME = 'Sku';

/**
 * The mapped ORM entity name, declared by the `entityname` attribute on
 * [model/entity/Sku.cfc:L49] and read at runtime by [org/Hibachi/HibachiEntity.cfc:L287-L289].
 */
export const SKU_ENTITY_NAME = 'SlatwallSku';

/**
 * Every property this entity declares, as a keyed set — the port of `getPropertiesStruct()`, the
 * structure [org/Hibachi/HibachiTransient.cfc:L739] resolves and which both `hasProperty` [:L764]
 * and `getPropertyMetaData` [:L741] key into. A CFML struct keyed by property name is what the
 * legacy held; a keyed object is what this holds, and membership is an own-key test in both.
 */
export const SKU_DECLARED_PROPERTIES: DeclaredPropertyNameSet<
  SkuPropertyName | SkuNonPersistentPropertyName
> = Object.freeze({
  skuID: true,
  activeFlag: true,
  skuCode: true,
  listPrice: true,
  price: true,
  renewalPrice: true,
  imageFile: true,
  userDefinedPriceFlag: true,
  calculatedQATS: true,
  product: true,
  subscriptionTerm: true,
  alternateSkuCodes: true,
  attributeValues: true,
  orderItems: true,
  skuCurrencies: true,
  stocks: true,
  options: true,
  accessContents: true,
  subscriptionBenefits: true,
  renewalSubscriptionBenefits: true,
  promotionRewards: true,
  promotionRewardExclusions: true,
  promotionQualifiers: true,
  promotionQualifierExclusions: true,
  priceGroupRates: true,
  physicals: true,
  remoteID: true,
  createdDateTime: true,
  createdByAccount: true,
  modifiedDateTime: true,
  modifiedByAccount: true,
  adminIcon: true,
  assignedOrderItemAttributeSetSmartList: true,
  baseProductType: true,
  currentAccountPrice: true,
  currencyCode: true,
  currencyDetails: true,
  defaultFlag: true,
  eligibleFulfillmentMethods: true,
  imageExistsFlag: true,
  livePrice: true,
  nextEstimatedAvailableDate: true,
  optionsByOptionGroupCodeStruct: true,
  optionsByOptionGroupIDStruct: true,
  optionsIDList: true,
  qats: true,
  salePriceDetails: true,
  salePrice: true,
  salePriceDiscountType: true,
  salePriceDiscountAmount: true,
  salePriceExpirationDateTime: true,
  skuDefinition: true,
  stocksDeletableFlag: true,
  transactionExistsFlag: true,
});

/**
 * The eight populate-enabled simple properties, in legacy declaration order —
 * [model/entity/Sku.cfc:L53-:L59] plus the calculated column at [`:L62`].
 */
const SKU_SIMPLE_PROPERTY_DESCRIPTORS: readonly ColumnPropertyDescriptor<SkuPropertyName>[] = [
  { name: 'activeFlag', valueType: 'boolean' },
  { name: 'skuCode', valueType: 'string' },
  { name: 'listPrice', valueType: 'bigDecimal' },
  { name: 'price', valueType: 'bigDecimal' },
  { name: 'renewalPrice', valueType: 'bigDecimal' },
  { name: 'imageFile', valueType: 'string' },
  { name: 'userDefinedPriceFlag', valueType: 'boolean' },
  { name: 'calculatedQATS', valueType: 'integer' },
];

/**
 * `remoteID` — [model/entity/Sku.cfc:L90]. A populate-enabled simple property, declared apart from the
 * eight above because it sits after the relationship block in the legacy source and declaration order
 * is preserved.
 */
const SKU_REMOTE_ID_DESCRIPTOR: ColumnPropertyDescriptor<SkuPropertyName> = {
  name: 'remoteID',
  valueType: 'string',
};

/**
 * The four audit properties as populate-disabled descriptors, generated from
 * {@link AUDIT_PROPERTY_NAMES} so that each name is written exactly once in this file and cannot drift
 * from `../base/AuditableEntity`.
 */
const SKU_AUDIT_PROPERTY_DESCRIPTORS: readonly PopulatePropertyDescriptor<
  Sku,
  AuditPropertyName
>[] = AUDIT_PROPERTY_NAMES.map<PopulatePropertyDescriptor<Sku, AuditPropertyName>>(
  (auditPropertyName) => ({ name: auditPropertyName, populateEnabled: false }),
);

/** The collaborators the two in-scope relationships need before population can act on them. */
export interface SkuPopulationCollaborators {
  /**
   * Loads or creates a `product` by identifier, for the many-to-one at [model/entity/Sku.cfc:L65].
   */
  readonly productLoader: RelatedEntityLoader<Product>;

  readonly populateProduct: SubPropertyPopulator<Product>;

  /**
   * Loads or creates an `option` by identifier, for the many-to-many at [model/entity/Sku.cfc:L76].
   */
  readonly optionLoader: RelatedEntityLoader<Option>;

  readonly populateOption: SubPropertyPopulator<Option>;
}

/**
 * Builds this entity's population contract, wiring the two in-scope relationships when their
 * collaborators are supplied.
 *
 *
 */
export function createSkuPropertyDescriptors(
  collaborators?: SkuPopulationCollaborators,
): PropertyDescriptorSet<Sku, SkuPropertyName> {
  /* `product` — [model/entity/Sku.cfc:L65], `fieldtype="many-to-one" fkcolumn="productID"`. */
  const productDescriptors: readonly ManyToOnePropertyDescriptor<'product', Product>[] =
    collaborators === undefined
      ? []
      : [
          {
            kind: 'many-to-one',
            name: 'product',
            relatedPrimaryIdPropertyName: 'productID',
            loader: collaborators.productLoader,
            populateRelated(product, data) {
              collaborators.populateProduct(product, data);
            },
          },
        ];

  /*
   * `options` — [model/entity/Sku.cfc:L76], the many-to-many this entity owns. See
   * {@link Sku.options} for the ownership proof from both sides.
   */
  const optionsDescriptors: readonly ManyToManyPropertyDescriptor<Sku, 'options', Option>[] =
    collaborators === undefined
      ? []
      : [
          {
            kind: 'many-to-many',
            name: 'options',
            relatedPrimaryIdPropertyName: 'optionID',
            singularName: 'option',
            loader: collaborators.optionLoader,
            addRelated(sku, option) {
              sku.addOption(option);
            },
            populateRelated(option, data) {
              collaborators.populateOption(option, data);
            },
            removeRelated(sku, option) {
              sku.removeOption(option);
            },
            readRelated(sku) {
              return sku.getOptions();
            },
            readRelatedPrimaryId(option) {
              return option.optionID;
            },
          },
        ];

  return {
    /*
     * The legacy `getClassName` value [org/Hibachi/HibachiObject.cfc:L135-L137] for
     * [model/entity/Sku.cfc:L49] — the bare component name, which is the arm 3 operand of the
     * population gate [org/Hibachi/HibachiTransient.cfc:L190] and the key the out-of-scope permission
     * records are stored under [org/Hibachi/HibachiAuthenticationService.cfc:L131-L141].
     */
    entityName: SKU_CLASS_NAME,

    /*
     * [model/entity/Sku.cfc:L49] declares `persistent=true`, so this is `true` — and the flag is
     * load-bearing rather than informational: `../base/populate` uses it as the first arm of the
     * legacy authorisation test, where a transient process object populates freely and a persistent
     * entity such as this one has per-property access control consulted. All three arms are live in
     * that module, with arms 2 and 3 resolved through `PopulationAuthorizationPort` from
     * `../../ports/AccountContextPort`.
     */
    persistent: true,

    properties: [
      ...SKU_SIMPLE_PROPERTY_DESCRIPTORS,
      ...productDescriptors,
      ...optionsDescriptors,
      SKU_REMOTE_ID_DESCRIPTOR,
      ...SKU_AUDIT_PROPERTY_DESCRIPTORS,
    ],
  };
}

/** This entity's dependency-free population contract. */
export const SKU_PROPERTY_DESCRIPTORS: PropertyDescriptorSet<Sku, SkuPropertyName> =
  createSkuPropertyDescriptors();

/* The document-and-omit register. */
