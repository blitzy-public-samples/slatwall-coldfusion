// ---------------------------------------------------------------------------
// CHECKPOINT STATUS - FORWARD REFERENCES CARRY THE MARKER `(planned)`
//
// The subtree is authored in boundaries, and AAP 0.4.5 makes the authoring
// order "a compile-order convenience, not a schedule". Commentary in this file
// therefore names modules of the target layout that DO NOT EXIST YET. Every such
// name carries `(planned)` at its point of use, meaning exactly: a planned Agent
// Action Plan target that is ABSENT from the subtree at this checkpoint. Nothing
// here asserts that any of them exists now, and no behaviour in this file depends
// on one. The complete set named below, with the role each will play:
//
//   tests/unit/domain/entities/category.test.ts  category entity suite
// ---------------------------------------------------------------------------

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
// distinction is drawn precisely. The governing rule turns on the FIELD TYPE, and
// on neither the far side's scope nor convenience:
//   * an out-of-scope MANY-TO-ONE survives as an INERT FOREIGN-KEY ID COLUMN,
//     because the column lives on this entity's own row and a `Content`-shaped
//     object would be needed to say anything more about it;
//   * an out-of-scope COLLECTION is MATERIALIZED THROUGH A NARROW STRUCTURAL
//     PROJECTION over its join key, because the association itself is this
//     entity's data even when the far entity is not in scope.
//
//   cmsCategoryID [L59]  KEPT as an inert persisted column. See the field.
//   site          [L62]  COLLAPSED to an inert `siteID`. See the field.
//   contents      [L70]  MATERIALIZED as `readonly ContentCategoryLink[]`, the
//                        anti-corruption projection over `inversejoincolumn`
//                        `contentID`. See the field and `getContents()`.
//
// An earlier revision stated the second rule as "an out-of-scope COLLECTION is not
// materialized at all" and authored no member for `contents`. That was wrong for
// the reasons set out on the field, and the entry above is the correction rather
// than a restatement.
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
// RoundingRule 1 - so Category is one of the THIRTEEN in-scope entities with
// none, eighteen in scope minus those five. So no port is
// injected, nothing is imported from ../ports/, and no ambient request scope is
// consulted: context travels as an explicit parameter in this port, never as
// ambient state. This entity needs no context parameter at all, because it
// performs no date comparison, no setting lookup and no I/O of any kind.
//
// THIS FILE OWNS ZERO NUMBERED DEFECTS AND ZERO DELIBERATE DIVERGENCES
// The port's thirty-entry defect register assigns nothing to Category, and none
// of the three deliberate divergences is spent here - they sit in `sku.ts` and
// `product.ts`. An earlier revision of this file DID spend a fourth:
// `setParentCategory` refused a reparent that would close a cycle, under a
// three-star divergence banner, and this paragraph had to be qualified to admit
// it. Both are gone - the setter assigns whatever it is handed, exactly as
// [model/entity/Category.cfc:L101-L105] does - so the count above is unqualified
// again. Note that NO adapter materializes a category ancestry, because nothing
// in the ported slice reads one: `Category` is a read-mostly leaf here and its
// `categoryIDPath` is a persisted column this migration reads rather than
// rebuilds, so there is no fetch-shape termination decision to make anywhere for
// this entity. Both of its bidirectional
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
// tests/unit/domain/entities/category.test.ts (planned), is authored separately, and must
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
 *
 * DECLARED AS A TYPE ALIAS, NOT AN INTERFACE, AND THE DIFFERENCE IS LOAD-BEARING.
 * The uniform lifecycle contract every hook-bearing entity now publishes is
 * `preUpdate(oldData?: Readonly<Record<string, unknown>>)`, so that a repository
 * can drive the hook on ANY of them without entity-specific knowledge. An
 * `interface` is NOT assignable to an index-signature type - TypeScript reports
 * "Index signature for type 'string' is missing" - whereas a type alias receives
 * an IMPLICIT index signature and therefore is. Verified by compiling both forms
 * against the project's strict profile. Keeping this declaration as an alias is
 * consequently what lets the shape stay precisely typed AND flow into the shared
 * contract: a category repository holds a `CategoryPreUpdateSnapshot`, gets
 * per-column checking while it populates one, and hands it straight to
 * `preUpdate` with no cast and no widening at the call site.
 */
export type CategoryPreUpdateSnapshot = {
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
};

/**
 * The ANTI-CORRUPTION PROJECTION of one `SwContent` row, as reached across the
 * `SwContentCategory` link table. [model/entity/Category.cfc:L70]
 *
 * MODULE-LOCAL AND UN-EXPORTED, DELIBERATELY. `model/entity/Content.cfc` is a
 * Mura CMS entity: out of scope, not one of the eighteen the plan enumerates, and
 * no `content.ts` may be created. So the far side is named STRUCTURALLY rather
 * than nominally. Keeping the declaration un-exported keeps the module's runtime
 * export surface at exactly one value (the class) and prevents the shape leaking
 * outward as though it were a domain type in its own right - an `interface` is
 * erased at emit, so it costs nothing at runtime.
 *
 * THIS IS THE `*Link` PATTERN ALREADY ESTABLISHED IN THIS FOLDER, by
 * `src/domain/entities/brand.ts`, which names five out-of-scope far sides the same
 * way (`ProductBrandLink`, `PromotionRewardBrandLink`, `PromotionQualifierBrandLink`,
 * `VendorBrandLink`, `PhysicalBrandLink`). It is applied here for the same reason
 * and with the same discipline.
 *
 * WHY THE SHAPE IS EXACTLY ONE MEMBER, AND NOT MORE. The projection carries the
 * `inversejoincolumn` that [model/entity/Category.cfc:L70] itself names -
 * `contentID` - and nothing else. `model/entity/Content.cfc:L52` declares that
 * column as `ormtype="string" length="32" fieldtype="id" generator="uuid"`, so the
 * member is a plain non-optional string. Every further member would be surface
 * this port INVENTED for an out-of-scope entity: `title` [Content.cfc:L55],
 * `contentIDPath` [L53] and `activeFlag` [L54] all exist in the source, and none
 * of them is reachable from anything in scope, so none is declared. The link table
 * metadata is the authority for what may appear here, which makes the shape a
 * derivation rather than a judgement call.
 *
 * WHAT IT MAKES OBSERVABLE, which is the point. `arrayLen(getContents())` and
 * membership-by-id are exactly the two things the legacy generated accessor
 * supported and the only two an ID-keyed link row needs to support. A repository
 * that has joined `SwContentCategory` can hand real rows in; one that has not
 * hands in nothing and says so at its own fetch-shape note.
 */
interface ContentCategoryLink {
  /**
   * The `SwContent.contentID` primary key.
   * [model/entity/Content.cfc:L52], reached through
   * `inversejoincolumn="contentID"` on [model/entity/Category.cfc:L70].
   */
  getContentID(): string;
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
  private readonly childCategories: Category[];

  // --- Related object properties (many-to-many, inverse) [L68-L70] ------------------------------

  // LEGACY-NOTE [model/entity/Category.cfc:L69-L70]: A METADATA INCONSISTENCY, reproduced uniformly
  // rather than propagated. `type="array"` is declared on `childCategories` (L66) and on `contents`
  // (L70) but is OMITTED on `products` (L69), even though all three are collections. This is
  // cosmetic in CFML, which infers the array shape for a one-to-many and a many-to-many regardless.
  // All three are therefore modelled as arrays here and the inconsistency is recorded so a reader
  // comparing the metadata does not conclude that `products` was meant to be something other than a
  // collection.
  //
  // ⚠ "MODELLED THE SAME WAY" MEANS ARRAY-SHAPED, NOT IDENTICALLY TYPED, and the distinction is
  // load-bearing. An earlier revision of this note claimed all three were `readonly T[]`; that is no
  // longer true and was never the right test. MUTABILITY IS DECIDED BY THE OWNERSHIP CENSUS stated on
  // {@link Category.getChildCategories}, one association at a time: `childCategories` is `Category[]`
  // because [model/entity/Category.cfc:L104] and [model/entity/Category.cfc:L111-L113] mutate it in
  // place through the accessor, whereas `products` and `contents` are `readonly` because the same
  // census over the whole entity tree returns zero such sites for either. `type="array"` in the
  // metadata says nothing about mutability and is not evidence either way.

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

  /**
   * The materialized `contents` many-to-many. [model/entity/Category.cfc:L70]
   *
   *   property name="contents" singularname="content" cfc="Content" type="array"
   *            fieldtype="many-to-many" linktable="SwContentCategory" fkcolumn="categoryID"
   *            inversejoincolumn="contentID" inverse="true";
   *
   * ★ THIS IS A REAL, POPULATABLE ASSOCIATION, NOT A PERMANENTLY-EMPTY ONE. An
   * earlier revision declared no member for it at all and argued that an
   * out-of-scope COLLECTION is simply "not materialized". That reasoning does not
   * hold, and the correction is recorded here rather than quietly applied.
   *
   *   * THE OUT-OF-SCOPE ENTITY IS THE FAR SIDE, NOT THE ASSOCIATION. What is out
   *     of scope is `model/entity/Content.cfc` - its behaviour, its service, its
   *     CMS semantics. `SwContentCategory` is a link table on THIS entity's own
   *     `categoryID`, and the rows in it are Category's data. Declining to declare
   *     the collection did not keep an out-of-scope module out; it removed a
   *     surface the legacy component genuinely publishes.
   *   * SUPPRESSING IT MADE THE CLASS ASSERT SOMETHING FALSE. `accessors="true"`
   *     on [model/entity/Category.cfc:L49] generates `getContents()`, and callers
   *     can and do read `arrayLen()` off it. A class with no member at all cannot
   *     answer that question; a class returning a permanently-empty array answers
   *     it WRONGLY, saying "this category is on no content" when the truth is
   *     "nobody asked the database". Neither is parity.
   *   * THE APPROVED MECHANISM ALREADY EXISTED. The plan's anti-corruption
   *     boundary is precisely how an in-scope entity holds a reference to an
   *     out-of-scope one: a narrow structural projection over the join key. See
   *     {@link ContentCategoryLink}, and the five equivalents in
   *     `src/domain/entities/brand.ts`.
   *
   * `readonly`, AND THAT WAS PROVEN RATHER THAN ASSUMED against the ownership
   * contract stated on {@link Category.getChildCategories}. L70 declares `contents`
   * with `inverse="true"`, so `Content` is the OWNING side of `SwContentCategory` -
   * [model/entity/Content.cfc:L71] declares `categories` with NO `inverse`
   * attribute. Neither component authors a hand-written helper for its half:
   * `addContent`/`removeContent` are absent from model/entity/Category.cfc and
   * `addCategory`/`removeCategory` are absent from model/entity/Content.cfc, so
   * both pairs are ORM-GENERATED and a generated helper appends only to its OWN
   * collection. A census of the entire entity tree for `arrayAppend`/`arrayDeleteAt`
   * against `arguments.category.getContents()` returns ZERO hits, which is the
   * direct evidence. No `addContent`/`removeContent` is authored here for the same
   * reason none is authored for `products`: the source declares neither, and
   * inventing a pair would widen the surface.
   *
   * SCHEMA CONTINUITY IS UNAFFECTED IN EITHER DIRECTION. model/entity/Category.cfc
   * is reference-only and remains completely untouched, `SwContentCategory` is
   * neither dropped nor altered nor migrated, and the CFML monolith keeps running
   * exactly as it did.
   *
   * ONE VALIDATION NOTE, KEPT BECAUSE IT IS STILL TRUE OF OTHER ENTITIES. Where a
   * delete-context `maxCollection:0` rule references a collection the domain does
   * not materialize, the rule trivially passes in TypeScript where it would have
   * BLOCKED the delete in CFML. For Category the point is VACUOUS twice over:
   * there is no model/validation/Category.json at all, and this collection is no
   * longer unmaterialized. It remains real for `physicals` on
   * Sku/Product/Brand/ProductType. Delete-context enforcement itself belongs to
   * the service and repository tiers, never to an entity.
   */
  private readonly contents: readonly ContentCategoryLink[];

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
    readonly childCategories: Category[] | undefined;
    readonly products: readonly Product[] | undefined;
    readonly contents: readonly ContentCategoryLink[] | undefined;
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
    this.contents = init.contents ?? [];

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
   * hydration or the two lifecycle hooks - `preInsert()` / `preUpdate(oldData?)`
   * - put there, and `undefined` when nothing has.
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
   * THE ONE ASSOCIATION-OWNERSHIP CONTRACT. Across every entity in this folder the rule is single and
   * mechanical: an association accessor hands back the LIVE, mutable array if and only if some entity
   * in the legacy source mutates that very accessor's result in place - that is, if and only if
   * `arrayAppend(x.getY(), ...)` or `arrayDeleteAt(x.getY(), ...)` appears somewhere in
   * `model/entity/*.cfc`. Otherwise it hands back a `readonly` projection. The determination is a
   * census over the source, never a preference, so any accessor in the folder can be checked against
   * it independently.
   *
   * THIS ACCESSOR IS ON THE LIVE SIDE, by two sites in this very file's source:
   * [model/entity/Category.cfc:L104] `arrayAppend(arguments.parentCategory.getChildCategories(),
   * this)` and [model/entity/Category.cfc:L111-L113] `arrayFind` followed by `arrayDeleteAt` on the
   * same array. The hierarchy is self-referential, so the mutating far side IS a `Category` - which
   * makes this the one association in the folder whose live requirement is visible without leaving the
   * file.
   *
   * An earlier revision typed it `readonly` and argued that "copying on every read would be a silent
   * behavioural change from the legacy, which handed back the live collection". The observation was
   * right and the conclusion did not follow: refusing to copy preserves the array's IDENTITY, but
   * `readonly` then withholds the only thing that identity was for. Both halves of the legacy
   * behaviour are now reproduced instead of one.
   *
   * Never `undefined` - see the constructor note on collections. Not defensively copied, for the
   * reason above.
   */
  getChildCategories(): Category[] {
    return this.childCategories;
  }

  /**
   * The materialized `products` many-to-many. [model/entity/Category.cfc:L69]
   *
   * `readonly`, AND THAT WAS PROVEN RATHER THAN ASSUMED against the contract stated on
   * {@link Category.getChildCategories}. [model/entity/Category.cfc:L69] declares `products` with
   * `inverse="true"`, so `Product` is the owning side of `SwProductCategory` -
   * [model/entity/Product.cfc:L80] declares `categories` with NO `inverse` attribute. And `Product`
   * declares no hand-written `addCategory`/`removeCategory` at all: those are ORM-GENERATED, and a
   * generated collection helper appends only to its OWN collection. A census of the entire entity tree
   * for `arrayAppend`/`arrayDeleteAt` against `arguments.category.getProducts()` returns ZERO hits,
   * which is the direct evidence.
   *
   * Never `undefined`. This is the whole of the products surface on this class: the source authors no
   * `addProduct` / `removeProduct` pair, and none is invented.
   */
  getProducts(): readonly Product[] {
    return this.products;
  }

  /**
   * The materialized `contents` many-to-many, projected across the
   * `SwContentCategory` link table. [model/entity/Category.cfc:L70]
   *
   * `accessors="true"` on [model/entity/Category.cfc:L49] generated this in CFML,
   * so the name and the array-returning shape are the source's, not this port's.
   * The ELEMENT type is where the anti-corruption boundary sits: each row is a
   * {@link ContentCategoryLink} - the join key and nothing more - because
   * `model/entity/Content.cfc` is out of scope and no `content.ts` exists to name.
   *
   * `readonly`, and never `undefined`. See the field for the census evidence that
   * nothing in the entity tree mutates this array in place, and for why the surface
   * stops at this one accessor with no `addContent`/`removeContent` pair.
   *
   * AN EMPTY RESULT IS A FETCH-SHAPE STATEMENT, NOT A DOMAIN CLAIM, exactly as for
   * every other collection on this class. Whether `[]` means "this category is on
   * no content" or "the repository did not join `SwContentCategory`" is answered at
   * the producing repository method, which is required to document it. That is the
   * whole reason associations are materialized at the boundary.
   */
  getContents(): readonly ContentCategoryLink[] {
    return this.contents;
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

  // THE IN-MEMORY GRAPH SYMMETRY IS REPRODUCED IN FULL.
  // [model/entity/Category.cfc:L103-L105] appends this category to its parent's `childCategories`
  // array under a guard, and [model/entity/Category.cfc:L111-L113] removes it again; the near-side
  // `parentCategory` field is maintained alongside on both paths. All of it is ported, so
  // `parent.getChildCategories()` and `child.getParentCategory()` can never disagree.
  //
  // AN EARLIER REVISION DROPPED BOTH FAR-SIDE OPERATIONS, and the reasoning is kept here rather than
  // deleted because it is a plausible-sounding trap that also appeared in `option.ts` and
  // `skuCurrency.ts`. It argued that "there is no session, no proxy, no cascade and no
  // reconciliation", that "associations are materialized at the repository boundary as `readonly`
  // arrays" so "`src/repositories/mysql/**` OWNS COLLECTION STATE - not this entity", and that "an
  // entity that spliced a local array would produce an in-memory graph that agreed with nothing and
  // that no `save` would ever read". Three things are wrong with it:
  //
  //   * IT CONFLATES MATERIALIZATION WITH OWNERSHIP. The repository decides WHETHER an association was
  //     fetched and in what order. That does not make it the only party permitted to change the
  //     fetched array, and it cannot be, because it is not in the call path: `addChildCategory` and
  //     `setParentCategory` are pure in-memory, synchronous, port-free operations with no save and no
  //     later boundary at which a deferred reconciliation could run.
  //   * "NO SAVE WOULD EVER READ IT" IS AN ARGUMENT ABOUT PERSISTENCE, NOT ABOUT THE GRAPH. The
  //     hierarchy's own persisted state is `parentCategoryID` on the child row - which is what
  //     `preUpdate` recomputes `categoryIDPath` from - so a repository save has never needed to read
  //     the parent's array. The array is the IN-MEMORY view of the same link, and callers read it
  //     within the request. Declining to maintain it does not make persistence more correct; it makes
  //     the in-memory view wrong.
  //   * IT PRODUCED A SILENT INCONSISTENCY RATHER THAN AVOIDING ONE. With the append gone,
  //     `parent.addChildCategory(child)` left `parent.getChildCategories()` NOT containing a child
  //     whose own `getParentCategory()` returned that parent. Two accessors disagreeing about one
  //     link, with no error anywhere, is precisely the "graph that agreed with nothing" the revision
  //     set out to prevent - reached by the opposite route.
  //
  // The `isNew() or !arguments.parentCategory.hasChildCategory( this )` guard at L103 is therefore
  // ported too, together with the `hasChildCategory` member it calls. The earlier revision removed
  // both on the grounds that "with the append gone the guard has nothing left to guard" - which is
  // circular rather than observational, since the append was removed in the same edit.
  //
  // CONTAINMENT IS BY PRIMARY KEY WITH A REFERENCE FALLBACK FOR AN UNSAVED ROW, which is the folder's
  // one containment rule and is also what the earlier revision predicted would be needed "should a
  // containment test ever be genuinely needed here". It is needed, and that is what it uses.

  // Child Categories (one-to-many) [model/entity/Category.cfc:L92]

  /**
   * Bidirectional helper for the `childCategories` one-to-many.
   * [model/entity/Category.cfc:L93]
   *
   * A PURE DELEGATION, reproduced exactly: the legacy body is the single
   * statement `arguments.childCategory.setParentCategory( this )` at L94. No
   * array work is reimplemented HERE because there is none to reimplement - the
   * one-to-many side defers wholly to the many-to-one side, which is what makes
   * this pair the correct pattern. The append itself does happen, inside
   * {@link Category.setParentCategory}, reaching back through
   * {@link Category.getChildCategories}.
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
   * BOTH STATEMENTS ARE REPRODUCED, in the source's order: the near-side assignment at
   * [model/entity/Category.cfc:L102] runs FIRST and unconditionally, then the guarded far-side append
   * at [model/entity/Category.cfc:L103-L105]. The ordering matters because the guard calls back into
   * the parent, so the field is already set by the time anything else can observe it.
   *
   * THE SHORT-CIRCUIT IS LOAD-BEARING. `isNew() or !hasChildCategory(this)` evaluates `isNew()` first,
   * so for an unsaved category the parent's membership test is not performed AT ALL and the append
   * simply happens. `||` reproduces CFML `or` faithfully here because both operands are already
   * booleans. That ordering is also what makes the append safe for an unsaved row: every unsaved
   * category has an empty `categoryID`, so a key-based membership test could not tell them apart, and
   * the legacy arranged never to ask.
   *
   * The parameter is `required` in the source, so it is a plain required
   * parameter here - deliberately NOT optional, which is the one asymmetry
   * between this method and its `remove*` counterpart.
   *
   * This shape - a required `set*` paired with an optional `remove*` that
   * defaults its argument - is the third occurrence of one pattern in the folder,
   * matching `Option.setOptionGroup` / `removeOptionGroup`
   * [model/entity/Option.cfc:L92-L107] and `SkuCurrency.setSku` / `removeSku`
   * [model/entity/SkuCurrency.cfc:L89-L104]. All three now reproduce both sides of the link.
   *
   * ★ WHATEVER IT IS HANDED IS ASSIGNED, INCLUDING A DESCENDANT OF THIS NODE.
   * The legacy setter validates nothing, so choosing this node's own descendant as
   * its parent is accepted and a cyclic `parentCategory` chain is created. That is
   * reproduced rather than corrected, so no assignment this method accepts differs
   * from the assignment [model/entity/Category.cfc:L101-L105] would have accepted.
   *
   * ★ AN EARLIER REVISION REFUSED SUCH A REPARENT, AND THE RECORD OF ITS REMOVAL
   * BELONGS HERE. This method used to call a `wouldCreateIdPathCycle()` helper and
   * throw, under a three-star divergence banner. Three checkable reasons removed
   * it. (1) A port reproduces; it does not improve. The legacy setter has no such
   * check, so refusing an assignment it accepts is an unrequested behavioural
   * change rather than a migration. (2) The project's deliberate-divergence budget
   * is closed at THREE - the un-`var`'d `discountAmount`
   * [model/service/PromotionService.cfc:L1007], the `amountOff` branch routed
   * through `Money` [model/service/PromotionService.cfc:L998], and the entity memo
   * defects in `sku.ts`/`product.ts` - and a guard here was a FOURTH, justified
   * against itself rather than against that budget. (3) The one place a
   * termination decision genuinely arises is a hand-written recursive ancestry
   * read that replaces Hibernate's lazy traversal under transformation rule T3,
   * and NO SUCH READ EXISTS FOR CATEGORY: no adapter materializes a category
   * ancestry, because nothing in the ported slice reads one. `Category` is a
   * read-mostly leaf here and `categoryIDPath` is a persisted column this
   * migration reads rather than rebuilds. So unlike `productType.ts` and
   * `priceGroup.ts`, whose sibling guards moved to their adapters, this one had
   * nowhere to move to and simply had nothing to decide.
   *
   * THE CONSTRUCTOR IS LIKEWISE UNGUARDED: it is the hydration boundary and it
   * reproduces what the row set says.
   */
  setParentCategory(parentCategory: Category): void {
    // CFML parity [model/entity/Category.cfc:L101-L105]: the legacy body validates nothing before
    // assigning, and neither does this one. A cyclic parent chain is accepted here exactly as it is
    // accepted there.
    // [model/entity/Category.cfc:L102] - the near-side write, always.
    this.parentCategory = parentCategory;

    // [model/entity/Category.cfc:L103-L105] - the guarded append onto the parent's LIVE array. `push`
    // mutates in place, which is required: `arrayAppend` mutated the very array that
    // `getChildCategories()` hands back, which is why that accessor is typed mutable.
    if (this.isNew() || !parentCategory.hasChildCategory(this)) {
      parentCategory.getChildCategories().push(this);
    }
  }

  /**
   * Whether `childCategory` is already a member of this category's materialized children.
   *
   * GENERATED BECAUSE IT IS CONCRETELY CALLED, which is the whole test for whether a dynamic-dispatch
   * member survives into this port. The verified call site is
   * [model/entity/Category.cfc:L103] - `if(isNew() or !arguments.parentCategory.hasChildCategory(
   * this ))` - inside this file's own `setParentCategory`. Without it that guard cannot be ported.
   *
   * It has no hand-written legacy body: it is the accessor ColdFusion's ORM generates for a collection
   * property carrying `singularname="childCategory"` [model/entity/Category.cfc:L66], and it tests
   * membership of the collection. An earlier revision omitted it, because the guard that calls it had
   * been dropped; the guard is restored, so the method is too.
   *
   * MEMBERSHIP IS BY PRIMARY KEY, WITH A REFERENCE FALLBACK FOR AN UNSAVED ROW - the single
   * containment rule this folder uses, shared with `optionGroup.ts`, `priceGroup.ts`,
   * `promotionCode.ts`, `promotionApplied.ts` and `promotionPeriod.ts`. CFML's
   * `arrayFind(array, component)` is reference identity, but under Hibernate reference identity WAS
   * row identity, because a session returned one instance per row. A driver-only stack has no session,
   * so the two come apart and a literal reference comparison would reproduce the legacy's letter while
   * losing its meaning: `hasChildCategory` would answer `false` for a row the array already holds, and
   * L103's guard would then append a DUPLICATE.
   *
   * The fallback is not a courtesy. An unsaved `Category` has `categoryID === ''`, and so does every
   * other unsaved category, so keys alone would report all of them as the same member; only object
   * identity separates two unsaved rows.
   */
  hasChildCategory(childCategory: Category): boolean {
    const candidateCategoryID: string = childCategory.getCategoryID();

    if (candidateCategoryID === '' || this.childCategoriesContainUnsavedRow()) {
      return this.childCategories.some(
        (child) => child === childCategory || child.getCategoryID() === candidateCategoryID,
      );
    }

    return this.childCategories.some((child) => child.getCategoryID() === candidateCategoryID);
  }

  /**
   * Whether this category's materialized children include at least one row that has never been
   * persisted.
   *
   * Private, and it exists only to keep {@link Category.hasChildCategory} readable. It has no legacy
   * counterpart: CFML needed no such test because `arrayFind` compared references and was therefore
   * already correct for unsaved rows.
   */
  private childCategoriesContainUnsavedRow(): boolean {
    return this.childCategories.some((child) => child.getCategoryID() === '');
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
   * THE CLEAR AT L115 IS UNCONDITIONAL, because the legacy's `structDelete` sits outside every
   * conditional and runs on every path - including the path where the far-side search found nothing.
   * That placement is preserved exactly: the clear is not folded into the found branch.
   *
   * IT RAISES WHEN THE ARGUMENT IS OMITTED AND NO PARENT IS SET, and that is behaviour preservation
   * rather than defensiveness. In that state CFML reaches [model/entity/Category.cfc:L111] and calls
   * `getChildCategories()` on a null value, which is a runtime error there. Reproducing it as a throw
   * is faithful; returning silently would invent a success path the legacy system does not have. The
   * message names the source locator, matching `priceGroup.ts`, `option.ts`, `promotionCode.ts`,
   * `promotionApplied.ts` and `promotionPeriod.ts`.
   *
   * One legacy asymmetry worth recording while it is visible: the method never
   * verifies that an explicitly-supplied argument actually IS this category's
   * current parent, so `a.removeParentCategory(b)` clears `a`'s parent even when
   * its parent was `c` - and it searches `b`'s children rather than `c`'s, so the stale link from `c`
   * survives. That is reproduced, not corrected.
   *
   * @throws Error when the argument is omitted and this category has no parent set, reproducing the
   *   null dereference at [model/entity/Category.cfc:L111].
   */
  removeParentCategory(parentCategory?: Category): void {
    // [model/entity/Category.cfc:L108-L110]: presence test, then the fallback to the currently-set
    // parent. `!== undefined` and never a truthiness test - see the note on this method.
    const resolvedParentCategory: Category | undefined =
      parentCategory !== undefined ? parentCategory : this.parentCategory;

    if (resolvedParentCategory === undefined) {
      throw new Error(
        'Category.removeParentCategory was called with no argument on a category that has no ' +
          'parentCategory. This reproduces the legacy runtime failure at ' +
          'model/entity/Category.cfc:L108-L111, where the omitted argument defaults to a null ' +
          'parent and getChildCategories() is then invoked on it before any index guard runs.',
      );
    }

    // [model/entity/Category.cfc:L111] ARRAY INDEX BASE CHANGE: CFML `arrayFind` returns a 1-BASED
    // index, or 0 for "not found", which is why the source guards with `index > 0` at L112.
    // `Array.prototype.findIndex` returns a 0-BASED index, or -1 for "not found", so the guard MUST
    // become `!== -1`. Carrying `> 0` across would silently skip element 0 - the first child.
    //
    // Containment is BY PRIMARY KEY with a reference fallback for an unsaved row, exactly as in
    // `hasChildCategory` above; see that method for why a key comparison reproduces the legacy meaning
    // where a reference comparison would only reproduce its letter.
    const siblingCategories: Category[] = resolvedParentCategory.getChildCategories();
    const index: number = siblingCategories.findIndex((child: Category) => this.isSameRowAs(child));

    // [model/entity/Category.cfc:L112-L114]
    if (index !== -1) {
      siblingCategories.splice(index, 1);
    }

    // [model/entity/Category.cfc:L115] - `structDelete(variables, "parentCategory")`, UNCONDITIONAL
    // and outside the found-branch above.
    this.parentCategory = undefined;
  }

  /**
   * Whether `candidate` denotes the same `SwCategory` row as this instance.
   *
   * Private, with no legacy counterpart by name: it stands for CFML's `arrayFind(array, this)`
   * comparison, which was reference identity in the language and row identity under Hibernate's
   * session. With no session those come apart, so the comparison is made on the primary key and falls
   * back to reference identity when either side is unsaved - an unsaved category has an empty
   * `categoryID`, and so does every other unsaved category.
   *
   * Identical in shape to the helpers of the same name on `option.ts`, `promotionCode.ts` and
   * `promotionApplied.ts`, deliberately: one containment rule across the folder.
   */
  private isSameRowAs(candidate: Category): boolean {
    const candidateCategoryID: string = candidate.getCategoryID();

    if (candidateCategoryID === '' || this.categoryID === '') {
      return candidate === this;
    }

    return candidateCategoryID === this.categoryID;
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
  // entities - a directed transformation, not a discretionary widening. This file spends nothing
  // FROM THE BUDGETS: zero reshapings, zero widenings, zero visibility changes, zero deliberate
  // divergences, zero defects. That count needs no qualifier: the cycle refusal
  // `setParentCategory` once carried has been removed, and the reasoning is recorded at the setter.
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
   * ONE LIFECYCLE CONTRACT, SHARED BY EVERY HOOK-BEARING ENTITY IN THIS FOLDER:
   *
   *   preInsert(): void
   *   preUpdate(oldData?: Readonly<Record<string, unknown>>): void
   *
   * `category.ts`, `priceGroup.ts` and `promotionCode.ts` all publish exactly
   * that pair of names and shapes - `promotionCode.ts` declaring only
   * `preInsert`, because [model/entity/PromotionCode.cfc:L179] is its only hook
   * and no `preUpdate` may be invented for it. The names are the LEGACY public
   * names verbatim, so a reviewer diffing this class against the CFC finds them
   * where they expect.
   *
   * An earlier revision named these `applyPreInsertCategoryIDPath()` and
   * `applyPreUpdateCategoryIDPath()`, while `priceGroup.ts` used the legacy names
   * and `promotionCode.ts` used a third shape that took the generated code as a
   * REQUIRED PARAMETER. Three shapes meant a repository could not drive the hook
   * generically: it needed a hard-coded, undocumented method name per entity, and
   * for one of them it had to know to supply a value. The entity-specific names
   * also described the IMPLEMENTATION - what the hook happens to maintain today -
   * rather than the lifecycle POSITION, which is what a caller schedules against
   * and the only thing that is stable.
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
   * delimiter - the properties that module reproduces from
   * [org/Hibachi/HibachiEntity.cfc:L308-L324]. It reproduces the absence of a
   * cycle guard too: a cyclic `parentCategory` chain does not terminate there
   * because it does not terminate at [org/Hibachi/HibachiEntity.cfc:L314-L321]
   * either, and an earlier revision that refused one has been removed. Since
   * nothing in the ported slice materializes a category ancestry, no adapter-side
   * termination decision arises for this entity either.
   */
  preInsert(): void {
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
   *   TYPED AS THE SHARED CONTRACT SHAPE, `Readonly<Record<string, unknown>>`, so
   *   that this method is callable identically to `PriceGroup.preUpdate` and a
   *   repository needs no per-entity signature knowledge. That costs nothing in
   *   precision at the call site: {@link CategoryPreUpdateSnapshot} still models
   *   the row column-for-column, it is declared as a type alias precisely so it
   *   carries an implicit index signature, and it is therefore assignable here
   *   with no cast - the category repository gets full per-column checking while
   *   it POPULATES the snapshot, and hands it over unchanged. `unknown` rather
   *   than `any` for the value type, so any future reader must narrow first.
   *
   *   THE PARAMETER IS DELIBERATELY NOT READ, because the legacy body does not
   *   read it either: L132-L133 forwards it to `super.preUpdate()` and then
   *   rebuilds the path unconditionally, so no branch of the ported behaviour can
   *   depend on it. It is retained for interface parity, and for the repository to
   *   pass through to the audit work that replaces the `super` call - which is
   *   exactly why `noUnusedParameters` is deliberately left unset in
   *   tsconfig.json.
   */
  preUpdate(oldData?: Readonly<Record<string, unknown>>): void {
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
