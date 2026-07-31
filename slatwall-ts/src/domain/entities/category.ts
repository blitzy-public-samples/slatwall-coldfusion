// ---------------------------------------------------------------------------
// slatwall-ts - the Category entity
//
// A 1:1 logic extraction of model/entity/Category.cfc (137 lines), which is the
// SOLE authority for everything below. Entity 5 of 18 in a hard-locked folder.
//
// THE VERIFIED COMPONENT DECLARATION [model/entity/Category.cfc:L49], verbatim:
//
//   component displayname="Category" entityname="SlatwallCategory"
//   table="SwCategory" persistent="true" accessors="true"
//   extends="HibachiEntity" cacheuse="transactional"
//   hb_serviceName="contentService" hb_permission="this"
//   hb_parentPropertyName="parentCategory" {
//
// Every `hb_*` value is preserved verbatim in this header as inert
// documentation, so the legacy admin can still resolve it. They are NOT
// re-emitted as runtime constants: this module exports exactly one runtime
// value, and JavaRB is not ported, so no i18n runtime is introduced and no
// resource-bundle identifier is resolved anywhere in this file.
//
//   *** hb_serviceName="contentService" - THERE IS NO CategoryService ***
//
// This attribute resolves the second documented ambiguity in the plan, and the
// SOURCE ITSELF resolves it: Category CRUD lives in ContentService.cfc BY
// DESIGN. A repository-wide check confirms there is no model/service/
// CategoryService.cfc anywhere in the legacy tree, so nothing is being omitted
// here - there was never a category service surface to convert. No
// `CategoryService` may be invented: not in this file, not in src/services/,
// not anywhere. ContentService is out of scope apart from the narrow
// category-access path, which is a service-tier concern and not this entity's.
// A future reader must not mistake that absence for an oversight.
//
//   hb_permission="this" - the literal four-character string `this`, not a
//   resolved permission path. Preserved exactly as written;
//   [model/entity/Brand.cfc:L49] uses the same literal.
//
//   hb_parentPropertyName="parentCategory" - a framework hint for
//   self-referential hierarchies, and the metadata counterpart to the
//   `buildIDPathList( "parentCategory" )` calls in the two ORM hooks at
//   [model/entity/Category.cfc:L128] and [model/entity/Category.cfc:L133]. It
//   names the many-to-one the framework base walks when it builds the ID path.
//   None of the four entities authored before this one carries it.
//
// TWO COSMETIC DECLARATION DIVERGENCES FROM ITS SIBLINGS, noted and NOT "fixed":
//   (1) there is no `output="false"` attribute on L49 at all, where the sibling
//       entities declare one; and
//   (2) `persistent` and `accessors` are QUOTED strings - `persistent="true"`,
//       `accessors="true"` - where [model/entity/Brand.cfc:L49] and
//       [model/entity/Option.cfc:L49] use the bare `true` form.
// Both are cosmetic in CFML, which does not distinguish the two spellings.
// [model/entity/SkuCurrency.cfc:L49] shares both divergences. They are recorded
// because the property metadata IS the schema contract, so a reader comparing
// declarations should not be left wondering whether something was dropped.
//
// SCHEMA CONTINUITY - THREE OUT-OF-SCOPE SURFACES, TWO DIFFERENT TREATMENTS
// This is the entity the plan names when it explains schema continuity, so the
// distinction is drawn precisely. The governing rule: an out-of-scope
// MANY-TO-ONE survives as an inert foreign-key ID column, whereas an
// out-of-scope COLLECTION is not materialized at all.
//
//   cmsCategoryID [L59]  KEPT as an inert persisted column. See the field.
//   site          [L62]  COLLAPSED to an inert `siteID`. See the field.
//   contents      [L70]  NOT MATERIALIZED. See the annotation where it would
//                        otherwise have been declared.
//
// No column is dropped, renamed or migrated by this port, and no migration is
// authored. Table `SwCategory` and entity name `SlatwallCategory` are unchanged.
//
// THE FRAMEWORK BASE IS DELIBERATELY NOT PORTED
// Category extends `HibachiEntity`, which is a THREE-level chain: the local
// model/entity/HibachiEntity.cfc (274 lines) extends
// Slatwall.org.Hibachi.HibachiEntity. The intermediate class alone holds twelve
// `getService(...)` sites - L123, L130, L135, L145, L178, L180, L182, L194,
// L196, L207, L257 and L266 - seven of them reaching `attributeService`. All
// twelve are MOOT here because the EAV path is not ported, but none is silently
// re-implemented either. This class is STANDALONE: no base class, no
// inheritance emulation, no `extends`.
//
// CATEGORY DECLARES NO `attributeValues`, AND THAT HAS A CONSEQUENCE
// A census across the eighteen in-scope entities finds `attributeValues`
// declared exactly four times - [model/entity/Sku.cfc:L70],
// [model/entity/Product.cfc:L75], [model/entity/ProductType.cfc:L67] and
// [model/entity/Brand.cfc:L60] - and Category is not among them. So in the
// legacy engine an unmatched `get...` call on a Category could never reach the
// EAV fallback at [org/Hibachi/HibachiEntity.cfc:L559], because that branch
// guards on `hasProperty("attributeValues")`; it would fall through all eleven
// dynamic-dispatch patterns at [org/Hibachi/HibachiEntity.cfc:L507-L565] and
// THROW DIRECTLY at [org/Hibachi/HibachiEntity.cfc:L565]. There is no
// nineteenth entity file and no attributeValue.ts, ever.
//
// TypeScript reproduces NONE of those eleven dispatch patterns. No Proxy, no
// index signature, no dynamic dispatch, no `evaluate()`, no `variables.` scope
// object and no `structDelete` emulation. Only concretely-called members are
// authored, each explicitly typed. A transliteration would violate the
// minimal-change directive, which scopes the FUNCTIONAL SURFACE and never the
// code style; idiomatic TypeScript is required, not merely permitted.
//
// THERE IS NO VALIDATION SCHEMA FOR THIS ENTITY
// model/validation/Category.json DOES NOT EXIST. Verified by direct
// enumeration: model/validation/ holds 96 files and none of them is
// Category.json. It must not be invented, and no validation rule, no
// declaratively-invoked validator method and no runtime length check is
// authored below. Validation coverage is ported AS IT IS and never completed.
// Four of the eighteen in-scope entities have no schema - Category,
// PromotionQualifier, PromotionApplied and PromotionAccount - and Category
// therefore contributed zero `"method"` entries to the folder-wide validator
// census (the five that exist belong to Sku x2, RoundingRule, Promotion and
// PromotionCode).
//
// NO COLLABORATOR, NO SERVICE LOCATOR, NO AMBIENT SCOPE
// Category has ZERO `getService(` sites. The verified census finds 45 across
// only five entities - Sku 19, Product 18, ProductType 6, OptionGroup 1,
// RoundingRule 1 - and Category is one of the ten with none. So no port is
// injected, nothing is imported from ../ports/, and no ambient request scope is
// consulted: context travels as an explicit parameter in this port, never as
// ambient state. This entity needs no context parameter at all, because it
// performs no date comparison, no setting lookup and no I/O of any kind.
//
// THIS FILE OWNS ZERO NUMBERED DEFECTS
// The port's twenty-entry defect register assigns nothing to Category, and none
// of the three deliberate divergences is spent here. Both of its bidirectional
// pairs are the CORRECT, non-defective pattern - each `remove*` genuinely
// removes, and neither calls an `add*`. So no `LEGACY-DEFECT` marker appears
// below, and none may be added. One `LEGACY-NOTE` does appear, on the
// deliberately-unreproduced in-memory graph symmetry; a LEGACY-NOTE records an
// architectural consequence of the target's shape rather than a source defect,
// and it spends no budget. There is also no legacy TODO anywhere in this
// source to carry forward - the port carries known source TODOs across as
// explicitly flagged TODOs rather than completing them silently, and there is
// simply none here to carry.
//
// NO USER RULES WERE PROVIDED
//   1. No user-specified rules were provided for this project: the project
//      rules document contains exactly "No user rules provided."
//   2. The absence was VERIFIED rather than assumed - the rules source was
//      queried directly while authoring this file and returned that single
//      line, and the plan's own rules section reports the same result
//      independently.
//   3. No rule has been invented to fill the gap, and nothing here paraphrases
//      or cites one.
//   4. The absence is NOT licence to lower the bar. The enterprise-standard
//      substitute applies at full strength, which in this file means maximal
//      strictness with no `any`, no suppression comment, no non-null assertion
//      and no cast; one cohesive exported unit and no barrel; no credential, no
//      SQL, no environment read and no module-scope mutable state; and every
//      judgment call annotated where it was made.
//   5. Zero files enter scope by rule mandate. This file traces to the plan's
//      transformation table, so there are consequently no rule conflicts to
//      resolve.
//
// TEST COVERAGE FOR THIS ENTITY IS NET-NEW
// Category has NO legacy test. Only two entities do - meta/tests/unit/entity/
// BrandTest.cfc and meta/tests/unit/entity/ProductTest.cfc - and
// meta/tests/functional/admin/entity/ProductTest.cfc is an empty stub
// contributing nothing. Coverage for this class therefore belongs at
// tests/unit/domain/entities/category.test.ts, is authored separately, and must
// be labelled NET-NEW and never presented as parity. Nothing here needs a seam
// for it: every member is synchronous and total, no member touches a clock, an
// environment or a collaborator, and the two path-maintenance methods are
// driven entirely by constructor input.
//
// THE IMPORT SURFACE, and why it is exactly three modules
// `src/domain/**` may import only from `src/lib/**` and from within
// `src/domain/**`; the ESLint `no-restricted-imports` boundary makes a breach a
// BUILD FAILURE rather than a review note. Deliberately absent, each for a
// stated reason: `decimal.js` and `../valueObjects/money.js`, because Category
// has NO monetary column and `noUnusedLocals` fails a speculative import;
// `../ports/*`, because no collaborator is injected; `src/lib/logger.js` and
// `src/lib/config.js`, which are out of bounds for an entity; and anything
// under src/repositories, src/handlers, src/integrations or src/services.
// ---------------------------------------------------------------------------

import { buildIdPathList } from '../valueObjects/materializedIdPath.js';
import { cfBoolean } from '../../lib/cfml/truthiness.js';

import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import type { Product } from './product.js';

/**
 * The prior persisted state of one `SwCategory` row, as handed to the ported
 * `preUpdate` maintenance method.
 *
 * This is the target's stand-in for the `struct oldData` parameter at
 * [model/entity/Category.cfc:L131]. In the legacy engine Hibernate populated
 * that struct with the row's PREVIOUS COLUMN VALUES before flushing an update,
 * which is why every slot below is a scalar: it models a row, not an object
 * graph. `parentCategoryID` accordingly appears as the raw foreign-key column
 * named at [model/entity/Category.cfc:L63] rather than as a `Category`.
 *
 * Every slot is a REQUIRED key typed `T | undefined`, not an optional `?:` slot.
 * `exactOptionalPropertyTypes` is enabled, so "absent" and "present-but-null"
 * are genuinely different types; a repository that has read the prior row knows
 * each column's value or knows the column was SQL NULL, and requiring the key
 * forces it to say which instead of silently omitting it. The two flag slots
 * accept the wide `CfBooleanInput` union so a raw driver value can be passed
 * through exactly as it arrived.
 *
 * It is `readonly` throughout and deliberately carries no methods: a snapshot
 * is evidence, never a second entity. This is a type-only declaration and is
 * erased at emit, so the module still exports exactly one runtime value.
 */
export interface CategoryPreUpdateSnapshot {
  /** [model/entity/Category.cfc:L52] */
  readonly categoryID: string | undefined;
  /** [model/entity/Category.cfc:L53] */
  readonly categoryIDPath: string | undefined;
  /** [model/entity/Category.cfc:L54] */
  readonly categoryName: string | undefined;
  /** [model/entity/Category.cfc:L55] */
  readonly restrictAccessFlag: CfBooleanInput;
  /** [model/entity/Category.cfc:L56] */
  readonly allowProductAssignmentFlag: CfBooleanInput;
  /** [model/entity/Category.cfc:L59] The inert Mura CMS join key. */
  readonly cmsCategoryID: string | undefined;
  /** The `siteID` foreign-key column [model/entity/Category.cfc:L62], inert. */
  readonly siteID: string | undefined;
  /** The `parentCategoryID` foreign-key column [model/entity/Category.cfc:L63]. */
  readonly parentCategoryID: string | undefined;
  /** [model/entity/Category.cfc:L73] */
  readonly remoteID: string | undefined;
  /** [model/entity/Category.cfc:L76] */
  readonly createdDateTime: Date | undefined;
  /** The `createdByAccountID` column [model/entity/Category.cfc:L77], opaque. */
  readonly createdByAccountID: string | undefined;
  /** [model/entity/Category.cfc:L78] */
  readonly modifiedDateTime: Date | undefined;
  /** The `modifiedByAccountID` column [model/entity/Category.cfc:L79], opaque. */
  readonly modifiedByAccountID: string | undefined;
}

/**
 * One `SwCategory` row: a read-mostly leaf in the catalog, and one of the three
 * in-scope entities carrying a materialized comma-delimited ID path.
 *
 * A CLASS rather than an interface, because the legacy component carries
 * BEHAVIOUR and not merely data: four bidirectional helpers at
 * [model/entity/Category.cfc:L92-L116] and two persistence-lifecycle hooks at
 * [model/entity/Category.cfc:L126-L134]. Collapsing those into free functions
 * would break interface parity, which is this port's acceptance contract.
 *
 * PUBLIC METHOD NAMES ARE THE LEGACY CFML NAMES VERBATIM, in camelCase, because
 * a reviewer must be able to diff the two surfaces directly. The lint profile
 * deliberately enables no naming-convention rule so that they survive.
 *
 * ASSOCIATIONS ARE MATERIALIZED AT THE REPOSITORY BOUNDARY and laziness is NOT
 * simulated. There is no Hibernate here, no session, no proxy and no lazy
 * collection. `src/repositories/mysql/**` owns row-to-entity hydration and
 * documents its fetch shape at the producing method; every collection below
 * therefore arrives already populated as a `readonly` array, and every
 * many-to-one arrives as a field. Nothing in this class performs I/O, so every
 * member is synchronous - there is not one `async` or `Promise` in the file.
 */
export class Category {
  // --- Persistent properties [model/entity/Category.cfc:L51-L56] --------------------------------

  /**
   * [model/entity/Category.cfc:L52]
   *
   *   property name="categoryID" ormtype="string" length="32" fieldtype="id"
   *            generator="uuid" unsavedvalue="" default="";
   *
   * `''` means unsaved, which is the legacy `unsavedvalue=""` / `default=""`
   * contract rather than a sentinel of this port's invention - `isNew()` reads
   * it directly. Never `undefined`: the legacy property genuinely defaults to
   * the empty string, and `buildIdPathList` requires a `string` identifier.
   */
  private readonly categoryID: string;

  /**
   * [model/entity/Category.cfc:L53]
   *
   *   property name="categoryIDPath" ormtype="string" length="4000";
   *
   * THE MATERIALIZED PATH. `length="4000"` is part of the `SwCategory` schema
   * contract and is recorded here for that reason; it is deliberately NOT
   * enforced at runtime. Length is a persistence concern, and this entity has
   * no validation schema at all, so inventing a check here would invent a rule
   * the source never had.
   *
   * MUTABLE, and one of only two mutable fields on this class: the two ported
   * lifecycle-maintenance methods assign it through `setCategoryIDPath`, exactly
   * as [model/entity/Category.cfc:L128] and [model/entity/Category.cfc:L133] do.
   *
   * `undefined` until hydration or maintenance supplies a value. That is a real
   * state and it is not papered over with `''`: the two are distinct, and the
   * shared path module's `resolveIdPath` treats a stored `''` as PRESENT.
   */
  private categoryIDPath: string | undefined;

  /** [model/entity/Category.cfc:L54] `property name="categoryName" ormtype="string";` */
  private readonly categoryName: string | undefined;

  // LEGACY-NOTE [model/entity/Category.cfc:L55-L56]: BOOLEAN HYDRATION. A case-insensitive read of
  // this source finds exactly TWO `ormtype="boolean"` properties - `restrictAccessFlag` L55 and
  // `allowProductAssignmentFlag` L56 - and NEITHER declares a `default=`. The only `default=` in the
  // whole file is the `default=""` on the id property at L52. That puts Category among the twelve of
  // eighteen in-scope entities declaring no boolean default whatsoever, so either column can
  // legitimately hydrate as SQL NULL, and the shared helper's own documentation names Category as one
  // of the five entities this case exists for. BOTH are therefore read through `cfBoolean()` from
  // ../../lib/cfml/truthiness.js - never through a hand-rolled coercion, and never by silently
  // assuming `false`. That helper already resolves NULL, `0`/`1` and the `"0"`/`"1"`/`"true"`/
  // `"false"` string forms to the answer the legacy engine gave, so the CFML semantics live in
  // exactly ONE place in this port instead of being re-decided per field. An undefaulted, unset flag
  // reads `false`, which is precisely the answer the legacy engine gave a flag it had no value for.

  /** [model/entity/Category.cfc:L55] Coerced through `cfBoolean()` during hydration. */
  private readonly restrictAccessFlag: boolean;

  /** [model/entity/Category.cfc:L56] Coerced through `cfBoolean()` during hydration. */
  private readonly allowProductAssignmentFlag: boolean;

  // --- CMS properties [model/entity/Category.cfc:L58-L59] ---------------------------------------

  /**
   * [model/entity/Category.cfc:L59]
   *
   *   property name="cmsCategoryID" ormtype="string" index="RI_CMSCATEGORYID";
   *
   * ★ AN INERT PERSISTED COLUMN, KEPT SOLELY FOR SCHEMA CONTINUITY.
   *
   * This is the Mura CMS bridge's join key. The Mura bridge is explicitly out of
   * scope and NO CMS BEHAVIOUR IS PORTED, so nothing in the target reads or
   * writes this value beyond hydrating it and round-tripping it back on save.
   *
   * It is nevertheless KEPT, because the property metadata IS the schema
   * contract: the column stays, its name stays, and the index name
   * `RI_CMSCATEGORYID` - recorded verbatim above - is part of that contract too.
   * Dropping it, renaming it or authoring a migration for it would break the
   * promise that this port reads and writes the existing `Sw*` schema unchanged.
   *
   * Contrast the treatment of `site` immediately below: that one is also inert,
   * but it is an ASSOCIATION and so collapses to an opaque ID. This one is
   * already a plain column and needs no collapsing.
   */
  private readonly cmsCategoryID: string | undefined;

  // --- Related object properties (many-to-one) [model/entity/Category.cfc:L61-L63] --------------

  /**
   * The `siteID` foreign-key column. [model/entity/Category.cfc:L62]
   *
   *   property name="site" cfc="Site" fieldtype="many-to-one" fkcolumn="siteID";
   *
   * ★ AN INERT FOREIGN KEY, COLLAPSED FROM AN ASSOCIATION TO AN OPAQUE ID.
   *
   * `Site` is a Mura CMS entity. It is NOT one of the eighteen in-scope
   * entities, no `site.ts` may be created, and no `Site` type may be invented -
   * so there is deliberately NO `getSite()` returning an entity anywhere in this
   * class. The association is preserved as a persisted COLUMN only, with no CMS
   * behaviour attached and no far side to traverse.
   *
   * This follows the precedent already set by `Option.defaultImage`
   * [model/entity/Option.cfc:L60], which collapses to a `defaultImageID` on the
   * same reasoning. It is the plan's anti-corruption treatment for an
   * out-of-scope many-to-one, so it is not a signature reshaping, not a
   * visibility change and not a deliberate divergence: it spends no budget.
   */
  private readonly siteID: string | undefined;

  /**
   * The far side of the `parentCategory` many-to-one. [model/entity/Category.cfc:L63]
   *
   *   property name="parentCategory" cfc="Category" fieldtype="many-to-one"
   *            fkcolumn="parentCategoryID";
   *
   * SELF-REFERENTIAL, so it is typed to this very class and needs no import at
   * all. `Category` is the only self-referential pair in the folder so far.
   *
   * ★ DECLARED AS A REQUIRED PROPERTY WITH AN `undefined` UNION, NOT AS AN
   * OPTIONAL `parentCategory?: Category`. This is a hard requirement of
   * `exactOptionalPropertyTypes`, not a style preference:
   * [model/entity/Category.cfc:L115] ends `removeParentCategory` with
   * `structDelete(variables, "parentCategory")`, which makes the field ABSENT.
   * Under that compiler flag an OPTIONAL property cannot be assigned `undefined`
   * explicitly, so the clear would not even compile. A required slot whose type
   * includes `undefined` is what makes the clear expressible - and `delete` on a
   * class field is not an option either, since it would leave the declared type
   * lying about the instance.
   *
   * MUTABLE - the second and last mutable field on this class. `setParentCategory`
   * assigns it and `removeParentCategory` clears it.
   *
   * There is deliberately NO `getParentCategoryID()`. Unlike `site`, whose far
   * class is out of scope and therefore had to collapse to an ID, this
   * association's far class IS in scope, so the `parentCategoryID` foreign-key
   * column is represented by the materialized association itself rather than
   * duplicated beside it. The raw column does still appear, exactly where a raw
   * column belongs: on {@link CategoryPreUpdateSnapshot}.
   */
  private parentCategory: Category | undefined;

  // --- Related object properties (one-to-many) [model/entity/Category.cfc:L65-L66] --------------

  /**
   * [model/entity/Category.cfc:L66]
   *
   *   property name="childCategories" singularname="childCategory" cfc="Category"
   *            type="array" fieldtype="one-to-many" fkcolumn="parentCategoryID"
   *            cascade="all-delete-orphan" inverse="true";
   *
   * SELF-REFERENTIAL, typed to this very class, no import required.
   *
   * ⚠ `cascade="all-delete-orphan"` IS NOT HONOURED BY THIS ENTITY, and no
   * attempt is made here to honour it. Cascading orphan deletion was a Hibernate
   * session behaviour; there is no session in the target, and persistence is an
   * explicit repository `save`. The unhonoured cascade obligation belongs to
   * `src/repositories/mysql/**`, which owns deletion, and is recorded there
   * rather than approximated here. An entity that quietly deleted rows would be
   * a far worse outcome than one that plainly does not.
   */
  private readonly childCategories: readonly Category[];

  // --- Related object properties (many-to-many, inverse) [L68-L70] ------------------------------

  // LEGACY-NOTE [model/entity/Category.cfc:L69-L70]: A METADATA INCONSISTENCY, reproduced uniformly
  // rather than propagated. `type="array"` is declared on `childCategories` (L66) and on `contents`
  // (L70) but is OMITTED on `products` (L69), even though all three are collections. This is
  // cosmetic in CFML, which infers the array shape for a one-to-many and a many-to-many regardless.
  // Every collection on this class is therefore modelled the same way, as a `readonly T[]`, and the
  // inconsistency is recorded here so a reader comparing the metadata does not conclude that
  // `products` was meant to be something other than a collection.

  /**
   * [model/entity/Category.cfc:L69]
   *
   *   property name="products" singularname="product" cfc="Product"
   *            fieldtype="many-to-many" linktable="SwProductCategory"
   *            fkcolumn="categoryID" inversejoincolumn="productID" inverse="true";
   *
   * `Product` IS in scope, so this is typed to the real sibling class through a
   * TYPE-ONLY import. That makes `category` <-> `product` a mutual type cycle,
   * and it is SAFE: both directions use `import type`, which is ERASED at emit,
   * and entity classes never instantiate one another - hydration is wholly a
   * repository responsibility. A value import between two entity modules would
   * create a real runtime cycle and must never be introduced.
   *
   * THERE IS NO `addProduct` / `removeProduct` ON THIS CLASS, because the source
   * declares neither. `products` is `inverse="true"` here and the legacy
   * component authors no helper pair for it - unlike [model/entity/Brand.cfc],
   * which does author one for its own products collection. Inventing a pair here
   * would add public surface the legacy never had, so `getProducts()` is the
   * whole of it.
   */
  private readonly products: readonly Product[];

  // ★ `contents` [model/entity/Category.cfc:L70] IS DELIBERATELY NOT DECLARED. Verbatim source:
  //
  //     property name="contents" singularname="content" cfc="Content" type="array"
  //              fieldtype="many-to-many" linktable="SwContentCategory" fkcolumn="categoryID"
  //              inversejoincolumn="contentID" inverse="true";
  //
  // `Content` is a Mura CMS entity: out of scope, not one of the eighteen, and no content.ts may be
  // created. This is the SECOND of the two treatments named in the header - an out-of-scope
  // COLLECTION is not materialized, whereas an out-of-scope MANY-TO-ONE (`site`, above) survives as
  // an inert ID. No member is authored for it, so there is no `getContents()`, and no `addContent` /
  // `removeContent` either - the source declares neither, and neither may be invented. It follows
  // the precedent of `PriceGroup.appliedOrderItems` [model/entity/PriceGroup.cfc:L62] and
  // `Option.images` [model/entity/Option.cfc:L63].
  //
  // "NOT MATERIALIZED" MEANS "NOT AUTHORED IN THIS NEW TYPESCRIPT FILE, AND ANNOTATED HERE SO THE
  // OMISSION IS AUDITABLE". It is NEVER a deletion from the legacy tree: model/entity/Category.cfc
  // is reference-only and remains completely untouched, the `SwContentCategory` link table is not
  // dropped, and no migration is authored. The CFML monolith keeps running exactly as it did.
  //
  // ONE BEHAVIOURAL CONSEQUENCE, STATED PLAINLY. Where a delete-context `maxCollection:0`
  // validation rule references a collection the domain deliberately does not materialize, that rule
  // TRIVIALLY PASSES in TypeScript where it would have BLOCKED the delete in CFML. For Category
  // specifically that consequence is VACUOUS: there is no model/validation/Category.json at all, so
  // no such rule exists here and nothing changes. The consequence is nonetheless real for the
  // entities that DO carry one - `PriceGroup.appliedOrderItems`, `PromotionCode.orders`, and
  // `physicals` on Sku, Product, Brand and ProductType - and it is recorded here because this is the
  // file where the two treatments are defined. Delete-context enforcement itself belongs to the
  // service and repository tiers, never to an entity.

  // --- Remote properties [model/entity/Category.cfc:L72-L73] ------------------------------------

  /**
   * [model/entity/Category.cfc:L73]
   *
   *   property name="remoteID" ormtype="string"
   *            hint="Only used when integrated with a remote system";
   *
   * The `hint` text is preserved verbatim above. This is the only `remoteID` in
   * the folder so far that carries one, which is why it is reproduced rather
   * than dropped as boilerplate.
   */
  private readonly remoteID: string | undefined;

  // --- Audit properties [model/entity/Category.cfc:L75-L79] -------------------------------------
  //
  // All four declare `hb_populateEnabled="false"`, so the legacy framework refused to populate them
  // from request data. They are `readonly` here with no setters, which is the target's equivalent of
  // that refusal: audit values are written by the persistence tier, and
  // `src/repositories/mysql/**` owns them. The two ACCOUNT associations at L77 and L79 declare
  // `cfc="Account"`, and model/entity/Account.cfc is out of scope, so each collapses to an OPAQUE
  // string ID on exactly the same reasoning as `siteID` above - no Account class is imported, none
  // is invented, and no Account instance is ever constructed by this port.

  /** [model/entity/Category.cfc:L76] `ormtype="timestamp"`, `hb_populateEnabled="false"`. */
  private readonly createdDateTime: Date | undefined;

  /** The `createdByAccountID` column [model/entity/Category.cfc:L77], opaque. */
  private readonly createdByAccountID: string | undefined;

  /** [model/entity/Category.cfc:L78] `ormtype="timestamp"`, `hb_populateEnabled="false"`. */
  private readonly modifiedDateTime: Date | undefined;

  /** The `modifiedByAccountID` column [model/entity/Category.cfc:L79], opaque. */
  private readonly modifiedByAccountID: string | undefined;

  // LEGACY-NOTE [model/entity/Category.cfc:L81-L88]: the "Non-Persistent Properties" banner at
  // L81-L84 is EMPTY - three blank lines - and the "Non-Persistent Property Methods" banner at
  // L86-L88 is empty too. An empty banner implies NOTHING, so no non-persistent property and no
  // non-persistent accessor is invented for either. Likewise the "Overridden Methods" banner at
  // L120-L122 is empty, which is the direct evidence for the plain-accessor decision recorded on
  // `getCategoryIDPath()` below.

  /**
   * Hydrates one `SwCategory` row.
   *
   * A single readonly parameter object, matching the convention the sibling
   * entities established: an inline object type rather than a second exported
   * interface, because this module exports exactly one runtime unit.
   *
   * EVERY SLOT IS A REQUIRED KEY, and each nullable one is typed `T | undefined`
   * rather than as an optional `?:`. Under `exactOptionalPropertyTypes` those are
   * genuinely different types, and requiring the key forces a hydrating
   * repository to state "I looked at that column and found nothing" instead of
   * silently omitting it - so a forgotten field surfaces in review as a compile
   * error rather than as a quietly-defaulted value. Category carries no legacy
   * test asserting a bare construction, unlike Brand, so nothing here needs an
   * all-optional shape or a defaulted parameter.
   *
   * The two flag slots accept `CfBooleanInput`, the input union published by
   * ../../lib/cfml/truthiness.js, so a repository may hand over the raw column
   * exactly as the driver produced it - a real `boolean`, `0`/`1`, one of the
   * string forms, or SQL NULL. The coercion to CFML semantics happens once, here,
   * on the way in.
   *
   * NEITHER LIFECYCLE-MAINTENANCE METHOD IS CALLED FROM HERE. Constructing an
   * entity is not saving one: the legacy hooks fired on an ORM flush, and their
   * ported equivalents are invoked by the repository at save time. Calling one
   * here would rebuild the path on every hydration and would overwrite the value
   * just read out of the database.
   *
   * There is no collaborator port parameter, because this entity has zero
   * `getService(` sites, and no clock parameter, because it performs no date
   * comparison of any kind.
   */
  constructor(init: {
    readonly categoryID: string | undefined;
    readonly categoryIDPath: string | undefined;
    readonly categoryName: string | undefined;
    readonly restrictAccessFlag: CfBooleanInput;
    readonly allowProductAssignmentFlag: CfBooleanInput;
    readonly cmsCategoryID: string | undefined;
    readonly siteID: string | undefined;
    readonly parentCategory: Category | undefined;
    readonly childCategories: readonly Category[] | undefined;
    readonly products: readonly Product[] | undefined;
    readonly remoteID: string | undefined;
    readonly createdDateTime: Date | undefined;
    readonly createdByAccountID: string | undefined;
    readonly modifiedDateTime: Date | undefined;
    readonly modifiedByAccountID: string | undefined;
  }) {
    // `default=""` and `unsavedvalue=""` at [model/entity/Category.cfc:L52] are ported as the literal
    // legacy default, not as a sentinel of this port's invention. `isNew()` reads it directly.
    this.categoryID = init.categoryID ?? '';

    this.categoryIDPath = init.categoryIDPath;
    this.categoryName = init.categoryName;

    // Both flags through the shared helper - see the boolean-hydration LEGACY-NOTE above. An
    // undefaulted, unset column reads `false`, which is the answer the legacy engine gave a flag it
    // had no value for. Neither L55 nor L56 declares a `default=`.
    this.restrictAccessFlag = cfBoolean(init.restrictAccessFlag);
    this.allowProductAssignmentFlag = cfBoolean(init.allowProductAssignmentFlag);

    this.cmsCategoryID = init.cmsCategoryID;
    this.siteID = init.siteID;
    this.parentCategory = init.parentCategory;

    // A collection defaults to EMPTY rather than to `undefined`, because a Hibernate-managed
    // collection never handed back null - an unpopulated one-to-many read as an empty array - so `[]`
    // is the parity-correct shape and the accessors below can promise `readonly T[]` outright.
    // Whether a given `[]` means "this category genuinely has none" or "the repository did not fetch
    // them" is a FETCH-SHAPE question, and fetch shape is documented at the producing repository
    // method rather than guessed at here. That is the whole point of materializing associations at
    // the boundary: the decision is explicit and recorded where it is made.
    this.childCategories = init.childCategories ?? [];
    this.products = init.products ?? [];

    this.remoteID = init.remoteID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
  }

  // --- Accessors --------------------------------------------------------------------------------
  //
  // `accessors="true"` on [model/entity/Category.cfc:L49] made ColdFusion generate every one of
  // these, so there is no hand-written legacy body to port; the locator on each cites the property
  // declaration it serves. Callers use them, which is why they are reproduced rather than replaced
  // by public fields.
  //
  // GETTERS ONLY, with exactly ONE exception. The legacy component hand-writes no setter at all, and
  // the only generated setter it CONCRETELY INVOKES on itself is `setCategoryIDPath`, at L128 and
  // L133. That one is therefore authored; no other setter is, because no other is called and a
  // speculative setter would widen the write surface of a read-mostly leaf.

  /** [model/entity/Category.cfc:L52] Always a string; `''` means unsaved. */
  getCategoryID(): string {
    return this.categoryID;
  }

  /**
   * [model/entity/Category.cfc:L53]
   *
   * ★ A PLAIN ACCESSOR. NO LAZY COMPUTATION AND NO MEMOIZATION. This is the
   * single most easily-missed asymmetry in the entity, so it is recorded
   * explicitly rather than left to inference.
   *
   * `PriceGroup` exposes TWO routes to its path: a LAZY MEMOIZED getter at
   * [model/entity/PriceGroup.cfc:L195-L200], which guards on
   * `isNull(variables.priceGroupIDPath)` and computes on demand, AND an EAGER
   * assignment in its two hooks at [model/entity/PriceGroup.cfc:L207] and
   * [model/entity/PriceGroup.cfc:L212] that calls the setter directly, bypassing
   * that getter. `ProductType` has the same two routes, at
   * [model/entity/ProductType.cfc:L250-L255] and
   * [model/entity/ProductType.cfc:L305-L313].
   *
   * CATEGORY HAS ONLY THE EAGER ROUTE. There is no `getCategoryIDPath()`
   * override anywhere in model/entity/Category.cfc - its "Overridden Methods"
   * banner at L120-L122 is literally empty and it declares no "Overridden
   * Implicet Getters" section at all - so the accessor is the plain generated
   * one and the two hooks are its only route. The shared path module's own
   * documentation reaches the same conclusion independently.
   *
   * Therefore NO lazy-compute fallback is added here. Doing so would import
   * PriceGroup's behaviour into an entity that never had it, and would silently
   * populate a column the legacy would have left NULL. This returns exactly what
   * hydration or `applyPreInsertCategoryIDPath` / `applyPreUpdateCategoryIDPath`
   * put there, and `undefined` when nothing has.
   */
  getCategoryIDPath(): string | undefined {
    return this.categoryIDPath;
  }

  /**
   * [model/entity/Category.cfc:L53] - the ORM-generated setter for the path.
   *
   * Concretely called at [model/entity/Category.cfc:L128] and
   * [model/entity/Category.cfc:L133], inside the two lifecycle hooks, which are
   * the only places the legacy component writes any property of its own. The
   * ported maintenance methods call it for the same reason, so the write goes
   * through the same one door the legacy used.
   */
  setCategoryIDPath(categoryIDPath: string): void {
    this.categoryIDPath = categoryIDPath;
  }

  /** [model/entity/Category.cfc:L54] `undefined` when the column is NULL. */
  getCategoryName(): string | undefined {
    return this.categoryName;
  }

  /** [model/entity/Category.cfc:L55] Coerced through `cfBoolean()`; no ORM default exists. */
  getRestrictAccessFlag(): boolean {
    return this.restrictAccessFlag;
  }

  /** [model/entity/Category.cfc:L56] Coerced through `cfBoolean()`; no ORM default exists. */
  getAllowProductAssignmentFlag(): boolean {
    return this.allowProductAssignmentFlag;
  }

  /**
   * [model/entity/Category.cfc:L59] The inert Mura CMS join key, index
   * `RI_CMSCATEGORYID`.
   *
   * Exposed so the column can be round-tripped on save and so the schema
   * contract stays whole. Nothing in the target interprets the value.
   */
  getCmsCategoryID(): string | undefined {
    return this.cmsCategoryID;
  }

  /**
   * The inert `siteID` foreign key. [model/entity/Category.cfc:L62]
   *
   * Returns the opaque column value and NOT an entity - there is no `Site` class
   * in this port and no `getSite()` on this class.
   */
  getSiteID(): string | undefined {
    return this.siteID;
  }

  /**
   * The materialized far side of the `parentCategory` many-to-one.
   * [model/entity/Category.cfc:L63]
   *
   * `undefined` for a root category, and also when the repository chose not to
   * fetch the parent. It is likewise `undefined` after `removeParentCategory`
   * has cleared it, which is the state `structDelete` produced at
   * [model/entity/Category.cfc:L115].
   *
   * This is the accessor `buildIdPathList` walks when either maintenance method
   * rebuilds the path, and it satisfies that module's `ParentNodeAccessor`
   * contract directly, since `Category | undefined` is assignable to
   * `Category | null | undefined`.
   */
  getParentCategory(): Category | undefined {
    return this.parentCategory;
  }

  /**
   * The materialized `childCategories` one-to-many.
   * [model/entity/Category.cfc:L66]
   *
   * `readonly` and never `undefined` - see the constructor note on collections.
   * The array is not defensively copied: it is already typed `readonly`, so the
   * compiler rejects mutation through this reference, and copying on every read
   * would be a silent behavioural change from the legacy, which handed back the
   * live collection.
   */
  getChildCategories(): readonly Category[] {
    return this.childCategories;
  }

  /**
   * The materialized `products` many-to-many. [model/entity/Category.cfc:L69]
   *
   * `readonly` and never `undefined`, on the same terms as
   * {@link Category.getChildCategories}. This is the whole of the products
   * surface on this class: the source authors no `addProduct` / `removeProduct`
   * pair, and none is invented.
   */
  getProducts(): readonly Product[] {
    return this.products;
  }

  /** [model/entity/Category.cfc:L73] "Only used when integrated with a remote system". */
  getRemoteID(): string | undefined {
    return this.remoteID;
  }

  /** [model/entity/Category.cfc:L76] */
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /** The `createdByAccountID` column [model/entity/Category.cfc:L77], opaque. */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /** [model/entity/Category.cfc:L78] */
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /** The `modifiedByAccountID` column [model/entity/Category.cfc:L79], opaque. */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  // --- Framework members ------------------------------------------------------------------------

  /**
   * Whether this instance has been persisted yet.
   *
   * Inherited from the framework base in the legacy tree, and concretely called
   * at exactly one site in this component: [model/entity/Category.cfc:L103],
   * inside the `setParentCategory` guard.
   *
   * The empty-string test is not an approximation of the framework - it is
   * literally what the framework does. `isNew()` at
   * [org/Hibachi/HibachiEntity.cfc:L707-L709] returns `getNewFlag()`, and
   * `getNewFlag()` at [org/Hibachi/HibachiEntity.cfc:L571-L576] is
   * `if(getPrimaryIDValue() == "") { return true; } return false;`. The empty
   * string it compares against is the `unsavedvalue=""` / `default=""` on the id
   * property at [model/entity/Category.cfc:L52].
   *
   * IT IS AUTHORED EVEN THOUGH THE PORTED GUARD NO LONGER CONSULTS IT, and that
   * is a deliberate, recorded choice rather than an oversight in either
   * direction. L103 is a real call site in the source being ported, so dropping
   * the member silently would erase evidence a reviewer needs; keeping it makes
   * the LEGACY-NOTE on `setParentCategory` checkable, and the `unsavedvalue=""`
   * semantics it encodes are part of the schema contract regardless. It is a
   * FRAMEWORK member, in the same category as the generated accessors above -
   * not a fifth behavioural method.
   *
   * This is the ONLY framework member authored on this entity. Nothing else the
   * dispatcher at [org/Hibachi/HibachiEntity.cfc:L507-L565] could synthesise is
   * concretely called here, so there is no `hasChildCategory` (see the note on
   * `setParentCategory`), no `hasAny*`, no `hasUnique*` (there is no validation
   * schema), no `get*Options`, `get*SmartList`, `get*Struct`, `get*Count` or
   * `get*AssignedIDList`, and no `getAttributeValue` - that last being
   * unreachable anyway, since the L559 guard requires an `attributeValues`
   * property this entity does not declare.
   */
  isNew(): boolean {
    return this.categoryID === '';
  }

  // ============= START: Bidirectional Helper Methods ===================
  // [model/entity/Category.cfc:L90-L118]
  //
  // These four are the ONLY behavioural methods the legacy component declares outside its two
  // lifecycle hooks, and BOTH PAIRS ARE THE CORRECT, NON-DEFECTIVE PATTERN. The mandatory
  // "remove-that-ADDs" inversion cross-check was run against all four, against the verbatim source
  // rather than taken on trust. VERDICT: CLEAN - zero inversions. `removeChildCategory` delegates to
  // `removeParentCategory`, never to `setParentCategory`; and `removeParentCategory` genuinely
  // searches and deletes, never appends. (Contrast [model/entity/Option.cfc:L129-L131] and
  // [model/entity/Option.cfc:L145-L147], where two `remove*` helpers each call an `add*` - real
  // inversions, preserved as defects in that entity.) Nothing here needs a LEGACY-DEFECT marker, and
  // none may be added.
  //
  // All four are `void` and SYNCHRONOUS, matching `public void function` in the source. None touches
  // a repository, a port, a clock or the network.

  // LEGACY-NOTE [model/entity/Category.cfc:L103-L105] and [model/entity/Category.cfc:L111-L113]: THE
  // IN-MEMORY GRAPH SYMMETRY IS DELIBERATELY NOT REPRODUCED. This is an architectural consequence of
  // the target's shape, NOT a source defect, so it carries no LEGACY-DEFECT marker and spends no
  // budget against any register.
  //
  // The two legacy many-to-one bodies mutate the OTHER side's collection as well as their own field:
  // L104 does `arrayAppend(arguments.parentCategory.getChildCategories(), this)` and L111-L113 do
  // `arrayFind` followed by `arrayDeleteAt` on that same array. Both relied on Hibernate handing back
  // a LIVE, MUTABLE session-managed collection whose in-memory state the ORM would later reconcile
  // and cascade to the database.
  //
  // In the target there is no session, no proxy, no cascade and no reconciliation. Associations are
  // materialized at the repository boundary as `readonly` arrays, and persistence is an explicit
  // repository `save`, so `src/repositories/mysql/**` OWNS COLLECTION STATE - not this entity. An
  // entity that spliced a local array would produce an in-memory graph that agreed with nothing and
  // that no `save` would ever read, which is strictly worse than not doing it: it would look correct
  // while changing nothing.
  //
  // One clean consequence follows and is worth naming: the `isNew() or
  // !arguments.parentCategory.hasChildCategory( this )` guard at L103 existed ONLY to decide whether
  // that append would duplicate an entry. With the append gone the guard has nothing left to guard,
  // so it goes with it - which is also why no `hasChildCategory` member is authored on this class.
  // Should a containment test ever be genuinely needed here, it must compare by PRIMARY KEY
  // (`categoryID`) against `getChildCategories()`, never by object reference and never by deep
  // equality: Hibernate's `arrayFind` and `hasChildCategory` semantics rested on session identity,
  // and primary-key comparison is the faithful equivalent in a session-less port.

  // Child Categories (one-to-many) [model/entity/Category.cfc:L92]

  /**
   * Bidirectional helper for the `childCategories` one-to-many.
   * [model/entity/Category.cfc:L93]
   *
   * A PURE DELEGATION, reproduced exactly: the legacy body is the single
   * statement `arguments.childCategory.setParentCategory( this )` at L94. The
   * array work is deliberately NOT reimplemented here - the one-to-many side
   * defers wholly to the many-to-one side, which is what makes this pair the
   * correct pattern.
   *
   * The parameter is `required` in the source, so it is a plain required
   * parameter here, and it is typed `Category` because the association is
   * SELF-REFERENTIAL - this very class, no import needed.
   *
   * (The source carries heavy trailing whitespace on L92-L97. Cosmetic, and not
   * something a TypeScript file can or should carry over.)
   */
  addChildCategory(childCategory: Category): void {
    childCategory.setParentCategory(this);
  }

  /**
   * Bidirectional helper for the `childCategories` one-to-many.
   * [model/entity/Category.cfc:L96]
   *
   * The mirror of {@link Category.addChildCategory}, and a pure delegation on the
   * same terms: the legacy body is the single statement
   * `arguments.childCategory.removeParentCategory( this )` at L97.
   *
   * NOTE THAT IT DELEGATES TO `removeParentCategory`, NOT to `setParentCategory`.
   * That is the inversion check passing, stated at the call site so it is
   * verifiable here and not only in the block comment above.
   */
  removeChildCategory(childCategory: Category): void {
    childCategory.removeParentCategory(this);
  }

  // Parent Category (many-to-one) [model/entity/Category.cfc:L100]

  /**
   * Bidirectional helper for the `parentCategory` many-to-one.
   * [model/entity/Category.cfc:L101]
   *
   * Assigns the local field, which is [model/entity/Category.cfc:L102] and the
   * whole of this method's surviving effect. The far-side append at L104 and the
   * guard at L103 that gated it are not reproduced - see the LEGACY-NOTE above
   * for why, and note that this method is consequently TOTAL: it cannot throw,
   * where the legacy would have thrown had it been handed a null parent.
   *
   * The parameter is `required` in the source, so it is a plain required
   * parameter here - deliberately NOT optional, which is the one asymmetry
   * between this method and its `remove*` counterpart.
   *
   * This shape - a required `set*` paired with an optional `remove*` that
   * defaults its argument - is the third occurrence of one pattern in the folder,
   * matching `Option.setOptionGroup` / `removeOptionGroup`
   * [model/entity/Option.cfc:L92-L107] and `SkuCurrency.setSku` / `removeSku`
   * [model/entity/SkuCurrency.cfc:L89-L104].
   */
  setParentCategory(parentCategory: Category): void {
    this.parentCategory = parentCategory;
  }

  /**
   * Bidirectional helper for the `parentCategory` many-to-one.
   * [model/entity/Category.cfc:L107]
   *
   * ⚠ THE SOURCE PARAMETER IS `any parentCategory` AND IS **NOT** `required`.
   * [model/entity/Category.cfc:L108-L110] probes
   * `structKeyExists(arguments, "parentCategory")` and, when the argument was
   * omitted, defaults it from `variables.parentCategory`. It is therefore ported
   * as an OPTIONAL parameter, and the probe becomes an explicit
   * `!== undefined` test - NEVER a truthiness test. That distinction is not
   * cosmetic: a truthiness test would additionally swallow any falsy argument,
   * where CFML's `structKeyExists` asks only whether the key was passed.
   *
   * There is deliberately no `variables.` scope object, no `structKeyExists`
   * helper and no `structDelete` emulation. The CFML clear at L115 becomes a
   * plain assignment of `undefined` to a field declared `Category | undefined` -
   * see that field for why the declaration could not be an optional `?:` one.
   *
   * BOTH BRANCHES CLEAR THE FIELD UNCONDITIONALLY, because the legacy does: the
   * `structDelete` at L115 sits outside every conditional and runs on every path.
   * One legacy asymmetry worth recording while it is visible: the method never
   * verifies that an explicitly-supplied argument actually IS this category's
   * current parent, so `a.removeParentCategory(b)` clears `a`'s parent even when
   * its parent was `c`. That is reproduced, not corrected.
   */
  removeParentCategory(parentCategory?: Category): void {
    if (parentCategory !== undefined) {
      // An explicit far side was supplied. In the legacy this selected WHOSE
      // `childCategories` array L111-L113 searched and spliced. That array work is not reproduced,
      // so an explicitly-passed parent reaches no further than this branch - and the clear at L115
      // then runs exactly as it does on the other path.
      this.parentCategory = undefined;
      return;
    }

    // [model/entity/Category.cfc:L109]: the argument was omitted, so CFML defaulted it from
    // `variables.parentCategory` - the very field L115 goes on to delete. With the far-side array
    // work gone, that default resolves to the field that is about to be cleared regardless, which is
    // why the two paths converge on the identical single statement.
    this.parentCategory = undefined;
  }

  // =============  END:  Bidirectional Helper Methods ===================
  // [model/entity/Category.cfc:L118]

  // ================== START: Overridden Methods ========================
  // [model/entity/Category.cfc:L120-L122] - EMPTY in the source, and nothing is authored for it.
  // This empty block is the direct evidence for the plain-accessor decision on `getCategoryIDPath()`:
  // it is where a `getCategoryIDPath()` override would have lived had Category had one, and it is
  // where PriceGroup and ProductType put their hooks. Category put its hooks in the ORM Event Hooks
  // block below instead, and overrode no getter at all.
  // ==================  END:  Overridden Methods ========================

  // =================== START: ORM Event Hooks  =========================
  // [model/entity/Category.cfc:L124-L136]
  //
  // Category is one of exactly FOUR hook-bearing in-scope entities, and one of exactly THREE carrying
  // a materialized ID path:
  //
  //   | entity        | hooks                                            | path column                 |
  //   |---------------|--------------------------------------------------|-----------------------------|
  //   | Category      | preInsert() L126, preUpdate(struct oldData) L131  | categoryIDPath L53 (4000)   |
  //   | PriceGroup    | preInsert() L206, preUpdate(struct oldData) L211  | priceGroupIDPath L53 (4000) |
  //   | ProductType   | preInsert() L305, preUpdate(struct oldData) L310  | productTypeIDPath (4000)    |
  //   | PromotionCode | preInsert() L179 ONLY                             | NONE                        |
  //
  // ORM LIFECYCLE HOOKS BECOME EXPLICIT MAINTENANCE METHODS INVOKED BY THE REPOSITORY ON SAVE. There
  // is no Hibernate in the target, no session, no event registration and no automatic firing, and
  // none of that is emulated. `src/repositories/mysql/**` calls the two methods below at save time,
  // which is precisely where the ORM event used to fire. Neither is called from the constructor:
  // hydrating a row is not saving one, and rebuilding the path on hydration would overwrite the value
  // just read out of the database.
  //
  // Reshaping these two hooks this way does NOT spend the port's signature-reshaping or
  // signature-widening budgets. Those govern the ported public BEHAVIOURAL surface policed by
  // interface parity, and this transformation is explicitly mandated for all four hook-bearing
  // entities - a directed transformation, not a discretionary widening. This file spends nothing:
  // zero reshapings, zero widenings, zero visibility changes, zero deliberate divergences, zero
  // defects.
  //
  // LEGACY-NOTE [model/entity/Category.cfc:L127] and [model/entity/Category.cfc:L132] - the `super`
  // calls. There is no base class in the target and none is emulated. What the framework base's own
  // hooks did is a PERSISTENCE-TIER concern owned by `src/repositories/mysql/**`: at
  // [org/Hibachi/HibachiEntity.cfc:L598-L607] a persistability check that THROWS, then at L609-L618
  // the `createdDateTime` / `modifiedDateTime` stamping, then at L621-L648 calculated properties, the
  // `createdByAccount` / `modifiedByAccount` assignment and the first `sortOrder`; `preUpdate` at
  // [org/Hibachi/HibachiEntity.cfc:L651-L679] does the same check, re-stamps `modifiedDateTime` and
  // re-assigns `modifiedByAccount`. That is exactly why the audit fields on this class are `readonly`
  // with no setters - the entity never wrote them and must not start now.
  //
  //   ★★ THE ORDERING DIVERGENCE - REPRODUCED EXACTLY, AND IT MUST NOT BE NORMALISED ★★
  //
  // CATEGORY DELEGATES FIRST AND ASSIGNS ITS PATH SECOND. Verbatim at
  // [model/entity/Category.cfc:L126-L129]:
  //
  //     public void function preInsert(){
  //         super.preInsert();
  //         setCategoryIDPath( buildIDPathList( "parentCategory" ) );
  //     }
  //
  // PRICEGROUP DOES THE EXACT OPPOSITE. Verbatim at [model/entity/PriceGroup.cfc:L206-L209]:
  //
  //     public void function preInsert(){
  //         setPriceGroupIDPath( buildIDPathList( "parentPriceGroup" ) );
  //         super.preInsert();
  //     }
  //
  // ProductType agrees with PriceGroup at [model/entity/ProductType.cfc:L305-L308]. So the entities
  // GENUINELY DISAGREE, two against one, and this port preserves EACH ONE'S OWN ORDER rather than
  // picking a house style and quietly imposing it. Category is the sole outlier, which is exactly the
  // kind of asymmetry a "tidy-up" erases.
  //
  // AND THE DIVERGENCE IS SEMANTICALLY OBSERVABLE, not cosmetic - which is the substantive reason it
  // may not be normalised. The framework's `preInsert` THROWS when `!this.isPersistable()`
  // [org/Hibachi/HibachiEntity.cfc:L599-L607]. For an entity with validation errors, Category
  // therefore throws BEFORE `categoryIDPath` is ever assigned, while PriceGroup and ProductType have
  // ALREADY assigned their path by the time the same throw happens. Two different observable end
  // states from the same failure. Normalising the order would silently change which one Category
  // produces.
  //
  // Because the `super` call itself is gone, the ORDER is preserved STRUCTURALLY and recorded as an
  // explicit marker comment inside each method below, so the relative sequence stays auditable: the
  // repository performs its audit-timestamp and persistability work BEFORE invoking the maintenance
  // method, which is exactly the sequence L127-L128 and L132-L133 produce.

  /**
   * The ported `preInsert` hook. [model/entity/Category.cfc:L126]
   *
   * Invoked by the repository at save time, mirroring where the ORM event fired.
   * Rebuilds `categoryIDPath` from the `parentCategory` chain and assigns it
   * through the same generated setter the legacy body calls at L128.
   *
   * THE PATH COMPUTATION IS DELEGATED, never hand-rolled here. The legacy calls
   * the framework helper `buildIDPathList( "parentCategory" )`, whose string
   * argument matches `hb_parentPropertyName` on the component declaration at
   * [model/entity/Category.cfc:L49]. Its target equivalent is `buildIdPathList`
   * from ../valueObjects/materializedIdPath.js, the module that owns
   * comma-delimited ID-path walking for all three path-bearing entities. CFML's
   * `evaluate()`-based property-name dispatch at
   * [org/Hibachi/HibachiEntity.cfc:L316] becomes two explicitly-typed callbacks -
   * no dynamic dispatch, no string-built getter name, no Proxy.
   *
   * The resulting path is root-first and self-last, always includes this
   * category, is never empty, and carries neither a leading nor a trailing
   * delimiter - the six properties that module reproduces from
   * [org/Hibachi/HibachiEntity.cfc:L308-L324], including the deliberate ABSENCE
   * of any cycle guard.
   */
  applyPreInsertCategoryIDPath(): void {
    // ★ ORDERING MARKER - [model/entity/Category.cfc:L127] `super.preInsert();` STOOD HERE, BEFORE
    // the assignment below. The base-class work it performed - the persistability check that throws,
    // the `createdDateTime` / `modifiedDateTime` stamping and the `createdByAccount` /
    // `modifiedByAccount` assignment - is a repository responsibility in the target and is therefore
    // absent from this body; only its POSITION survives, as this marker. The repository must do that
    // work BEFORE calling this method.
    //
    // This is the OPPOSITE of [model/entity/PriceGroup.cfc:L207], which assigns its path first and
    // only then calls `super.preInsert()` at L208. THE DIVERGENCE IS DELIBERATE AND MUST NOT BE
    // NORMALISED - see the block comment above for the observable difference it produces.

    // [model/entity/Category.cfc:L128]. The `buildIdPathList` call is written out in full in both
    // maintenance methods rather than factored into a shared private helper, mirroring the source,
    // which likewise repeats `buildIDPathList( "parentCategory" )` verbatim in both hooks.
    this.setCategoryIDPath(
      buildIdPathList<Category>(
        this,
        (node) => node.getCategoryID(),
        (node) => node.getParentCategory(),
      ),
    );
  }

  /**
   * The ported `preUpdate` hook. [model/entity/Category.cfc:L131]
   *
   * Invoked by the repository at save time. Its body is identical to the
   * `preInsert` equivalent - both legacy hooks rebuild the path with the same
   * call - and the ordering marker below records the same delegate-first
   * sequence.
   *
   * @param oldData - the prior persisted row, mirroring the `struct oldData`
   *   parameter at [model/entity/Category.cfc:L131]. It is OPTIONAL because the
   *   legacy parameter is not declared `required`, and it accepts `undefined` for
   *   the case where the repository has no prior snapshot to hand over.
   *
   *   THE PARAMETER IS DELIBERATELY NOT READ, because the legacy body does not
   *   read it either: L132-L133 forwards it to `super.preUpdate()` and then
   *   rebuilds the path unconditionally, so no branch of the ported behaviour can
   *   depend on it. It is retained for interface parity, and for the repository to
   *   pass through to the audit work that replaces the `super` call - which is
   *   exactly why `noUnusedParameters` is deliberately left unset in
   *   tsconfig.json. It is fully typed as {@link CategoryPreUpdateSnapshot} and
   *   never `any`.
   */
  applyPreUpdateCategoryIDPath(oldData?: CategoryPreUpdateSnapshot): void {
    // ★ ORDERING MARKER - [model/entity/Category.cfc:L132]
    // `super.preUpdate(argumentcollection=arguments);` STOOD HERE, BEFORE the assignment below,
    // forwarding `oldData` on. The base-class work - the persistability check that throws, the
    // `modifiedDateTime` re-stamp and the `modifiedByAccount` re-assignment
    // [org/Hibachi/HibachiEntity.cfc:L651-L679] - is a repository responsibility in the target, so
    // only its POSITION survives here. The repository must do that work, and consume `oldData`,
    // BEFORE calling this method.
    //
    // This is the OPPOSITE of [model/entity/PriceGroup.cfc:L212], which assigns its path first and
    // only then calls `super.preUpdate(...)` at L213. THE DIVERGENCE IS DELIBERATE AND MUST NOT BE
    // NORMALISED.

    // [model/entity/Category.cfc:L133], character-for-character the same call the `preInsert` hook
    // makes at L128 - the source repeats it, and so does this port.
    this.setCategoryIDPath(
      buildIdPathList<Category>(
        this,
        (node) => node.getCategoryID(),
        (node) => node.getParentCategory(),
      ),
    );
  }

  // ===================  END:  ORM Event Hooks  =========================
  // [model/entity/Category.cfc:L136]
}
