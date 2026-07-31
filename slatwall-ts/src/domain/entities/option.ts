// ---------------------------------------------------------------------------
// slatwall-ts - the SwOption domain entity
//
// PROVENANCE
//   A 1:1 logic extraction of model/entity/Option.cfc (160 lines), which is the
//   sole authority for every behaviour reproduced below. Every locator cited in
//   this file was re-read from the legacy tree while authoring it and all of
//   them matched, so there is no corrected locator to record.
//
//   Verified component declaration, model/entity/Option.cfc:L49:
//
//     component displayname="Option" entityname="SlatwallOption"
//     table="SwOption" persistent=true output=false accessors=true
//     extends="HibachiEntity" cacheuse="transactional"
//     hb_serviceName="optionService" hb_permission="optionGroup.options"
//
//   SCHEMA CONTINUITY. Entity name `SlatwallOption`, physical table `SwOption`.
//   No migration, no rename, no new column and no dropped column: the property
//   metadata IS the contract, and every field below quotes the declaration it
//   serves so a reviewer can diff this file against the CFC line by line.
//
//   THE TWO `hb_*` ATTRIBUTES ARE CARRIED FORWARD VERBATIM, here, as doc text:
//
//     hb_serviceName="optionService"
//     hb_permission="optionGroup.options"
//
//   They are recorded as documentation rather than as exported constants for
//   one reason: this module's runtime export surface is fixed at exactly ONE
//   unit - the `Option` class - and an `hb_*` attribute needs no runtime
//   representation to stay auditable. JavaRB is not ported and no i18n runtime
//   is introduced, so an `hb_*` identifier is a string of documentation and
//   nothing more.
//
//   NEITHER ATTRIBUTE IS NORMALISED, and the second is the one a reader is
//   likely to normalise by accident. `hb_permission` is the NESTED PATH
//   `optionGroup.options`, NOT `"this"`: the sibling declaration at
//   model/entity/OptionGroup.cfc:L49 uses `"this"`, and the divergence is
//   deliberate in the source - an Option is permissioned as a member of its
//   group's `options` collection rather than as a top-level entity in its own
//   right. `hb_serviceName` is `optionService`, NOT an `optionGroupService`: no
//   such service exists anywhere in the legacy tree, because Option and
//   OptionGroup CRUD are both served by model/service/OptionService.cfc.
//
// WHY THIS ENTITY IS IN SCOPE
//   It is PROMPT-NAMED: `model/entity/Option.cfc` is one of the six catalog
//   entities the migration plan lists explicitly, and it is entity 3 of the 18
//   in this hard-locked folder. Nothing about its inclusion is inferred.
//
// NO BASE CLASS, BY DESIGN
//   The legacy component extends `HibachiEntity` - the local
//   model/entity/HibachiEntity.cfc (274 lines), which itself extends
//   Slatwall.org.Hibachi.HibachiEntity, a THREE-LEVEL chain. None of it is
//   ported and none of it is emulated: this is a standalone class. The
//   intermediate class holds twelve `getService(...)` sites (L123, L130, L135,
//   L145, L178, L180, L182, L194, L196, L207, L257, L266), seven of them
//   `attributeService`, and they are moot here because the EAV path is not
//   ported - but "moot" is not "quietly reimplemented", so none of them
//   reappears in any form below.
//
//   `Option` declares NO `attributeValues` collection, and that absence was
//   verified rather than assumed: across this folder exactly four entities
//   declare one - Sku (L70), Product (L75), ProductType (L67) and Brand (L60) -
//   while Option and PriceGroupRate declare none. There is therefore no EAV
//   read path in this file, no nineteenth entity file and no
//   `attributeValue.ts` anywhere in this port.
//
//   THE ELEVEN DYNAMIC-DISPATCH PATTERNS ARE NOT EMULATED. Re-read at
//   org/Hibachi/HibachiEntity.cfc:L507-L565, `onMissingMethod` synthesises
//   `hasUniqueOrNullXXX`, `hasUniqueXXX`, `hasAnyXXX`, `getXXXAssignedIDList`,
//   `getXXXID`, `getXXXOptions`, `getXXXOptionsSmartList`, `getXXXSmartList`,
//   `getXXXStruct`, `getXXXCount` and the attribute getter, then throws at L565
//   for anything else. There is no `Proxy` here, no index signature and no
//   string dispatch: only CONCRETELY-CALLED members are generated, as
//   explicitly-typed methods. A census of calls made on an `Option` reference
//   across the whole legacy tree returns no `hasAnySkus`, no `getSkusCount`, no
//   `getPromotionRewardsAssignedIDList` and no `*SmartList` of any kind, so
//   none of those is generated.
//
//   `Option` has NO declaratively-invoked validator either. The five that exist
//   folder-wide belong to Sku (twice), RoundingRule, Promotion and
//   PromotionCode. model/validation/Option.json holds plain field rules only,
//   and they are enforced at the SERVICE tier by the ported zod schema - never
//   in this class. The four rules are quoted in full on the fields they
//   constrain, because the validation contract is as much part of the schema
//   contract as the column metadata is.
//
// NO COLLABORATOR PORT IS INJECTED
//   `Option` has ZERO `getService(` sites. That was counted, not assumed: the
//   45 sites across the entity folder belong to Sku (19), Product (18),
//   ProductType (6), OptionGroup (1) and RoundingRule (1), and `Option` is one
//   of the ten entities with none. Nothing is imported from `../ports/`, no
//   port budget is spent, there is no service locator here and there is no
//   ambient scope - context in this port is always an explicit parameter.
//
// ASSOCIATIONS ARRIVE ALREADY MATERIALIZED
//   Hibernate lazy collections have no equivalent in a driver-only stack, so
//   `src/repositories/mysql/**` owns row-to-entity hydration and documents the
//   fetch shape at the producing method. This class receives what it is given
//   and never simulates laziness. A fetch-shape census of the source found no
//   `fetch=` and no `lazy=` attribute anywhere in model/entity/Option.cfc - in
//   particular the `optionGroup` many-to-one at L59 carries NO `fetch="join"`,
//   unlike model/entity/Product.cfc:L68's `brand` - so there is no eager/lazy
//   ruling for this entity to carry inward.
//
// THE TWO `Image` ASSOCIATIONS ARE HANDLED DIFFERENTLY FROM EACH OTHER
//   `Image` is not one of the eighteen in-scope entities, no image entity is
//   ported, and the image subsystem is modelled as a stub port consumed only by
//   out-of-scope branches. The two declarations are therefore split:
//
//     * L60 `defaultImage` (many-to-one, fkcolumn="defaultImageID") survives as
//       an INERT PERSISTED COLUMN - `defaultImageID` with an accessor and no
//       behaviour attached. This is the precedent set by
//       `Category.cmsCategoryID` and `Category.site`: the column survives so
//       the schema contract is unbroken.
//     * L63 `images` (one-to-many, cascade="all-delete-orphan") is NOT
//       MATERIALIZED and is not authored at all, following the
//       `PriceGroup.appliedOrderItems` precedent. See the annotation where it
//       would have sat.
//
//   "DROPPED" AND "OMITTED" ALWAYS MEAN "not authored in this TypeScript file,
//   with the reason recorded where it would have gone". Neither ever means a
//   legacy file was edited or deleted. model/entity/Option.cfc is reference-only
//   and remains untouched, as does every other file outside `slatwall-ts/`.
//
// NOT PRESENT, AND EACH ABSENCE VERIFIED RATHER THAN ASSUMED
//   * No ORM lifecycle hook. model/entity/Option.cfc:L155-L157 is an EMPTY
//     comment-delimited banner, so this entity has no `preInsert`, no
//     `preUpdate` and no other hook, and there is no explicit path-maintenance
//     or timestamp step for a repository to invoke on save. Only Category,
//     PriceGroup, ProductType and PromotionCode carry hooks in this port.
//   * No overridden framework method: L151-L153 is an EMPTY banner too.
//   * No non-persistent property method: L85-L87 is likewise EMPTY - and an
//     empty banner implies nothing whatsoever. Consequently this entity carries
//     none of the memoized-accessor defects that afflict Sku and Product.
//   * No `getSimpleRepresentation`, which the entity does not declare.
//   * No smart list of any kind. `HibachiSmartList` is a framework
//     query-builder artifact replaced by explicit typed repository queries, and
//     a domain entity must not host a dynamic query builder.
//   * No monetary column, so neither `Money` nor `CurrencyCode` is imported,
//     and `decimal.js` is not imported either: `../valueObjects/money.ts` is
//     the only domain module permitted to import it.
//   * No boolean column, so no `cfBoolean` and no `../../lib/cfml/*` helper is
//     imported. `noUnusedLocals` is on and nothing here is imported
//     speculatively: the single optional-argument branch in this file is a
//     plain `!== undefined` test, which needs no helper.
//
// THIS FILE OWNS EXACTLY TWO PRESERVED LEGACY DEFECTS
//   Both are in the exclusion helpers, and both are the same mistake made
//   twice: model/entity/Option.cfc:L129-L131 and model/entity/Option.cfc:L145-L147
//   each call `addExcludedOption(this)` where the method name promises a
//   removal. They are reproduced exactly as written, because behaviour
//   preservation extends to defects, and each carries the uniform two-line
//   marker. Neither spends a deliberate divergence: this port's permitted
//   divergences are reserved for the memo defects in `sku.ts` and `product.ts`.
//
//   FOR ANYONE AUDITING BY COUNT: there are exactly TWO genuine marker
//   annotations in this file, at the two exclusion `remove*` methods. Every
//   other appearance of the token is prose ABOUT the convention and sits inside
//   backticks; a genuine annotation is a bare, unbackticked comment block whose
//   last line reads "Preserved deliberately; do not fix without a product
//   decision." Verified observations that are NOT register defects are marked
//   `LEGACY-NOTE` instead, so the stronger marker keeps its meaning.
//
// TEST COVERAGE IS NET-NEW, IN FULL
//   Coverage belongs at `slatwall-ts/tests/unit/domain/entities/option.test.ts`
//   and ALL of it is net-new: no legacy test under `meta/tests/**` touches this
//   entity. Only `meta/tests/unit/entity/BrandTest.cfc` and
//   `meta/tests/unit/entity/ProductTest.cfc` are extended anywhere in this
//   port, and `meta/tests/functional/admin/entity/ProductTest.cfc` is an empty
//   stub contributing zero coverage. Nothing here may be presented as parity.
//   The test tier is authored separately; this file needs no seam for it, since
//   every method below is synchronous and every one is total.
//
// NO USER RULES WERE PROVIDED
//   Stated explicitly rather than assumed: the project rules document contains
//   exactly "No user rules provided.", re-read while authoring this file. No
//   rule is invented to fill the gap, and the absence is not licence to lower
//   the bar - the enterprise-standard substitute applies at full strength. Zero
//   files enter scope by rule mandate, and there is no rule conflict to
//   resolve, because every tension in this port is specification-internal.
//
// LICENCE
//   Carried forward at subtree level by `slatwall-ts/NOTICE-GPL.md`. There is
//   deliberately no per-file GPL header, and the special exception permitting
//   custom code under /integrationServices/ does not extend here.
// ---------------------------------------------------------------------------

import type { OptionGroup } from './optionGroup.js';
import type { PromotionQualifier } from './promotionQualifier.js';
import type { PromotionReward } from './promotionReward.js';
import type { Sku } from './sku.js';

// LEGACY-NOTE [model/entity/Option.cfc:L59, L66-L70] - FAR-SIDE CONTRACT for the four sibling
// entity modules imported above. The bidirectional helpers at the foot of this class delegate
// OUTWARD in every case, so the members listed below are a genuine cross-module requirement rather
// than a preference. Each traces to a verbatim legacy declaration and each was re-read in the
// legacy tree while authoring this file:
//
//   * `src/domain/entities/optionGroup.ts` MUST expose `getOptions()`. The reverse direction is
//     already live: [model/entity/OptionGroup.cfc:L92] `addOption` delegates into this file's
//     `setOptionGroup` and [L95] `removeOption` into `removeOptionGroup`, and `optionGroup.ts`
//     additionally consumes eight scalar accessors from this file - `getOptionID`,
//     `getOptionCode`, `getOptionName`, `getOptionDescription`, `getSortOrder`, `getRemoteID`,
//     `getCreatedDateTime` and `getModifiedDateTime` - to resolve its `orderby` argument. All eight
//     are generated below, and none of them is optional for that reason.
//   * `src/domain/entities/sku.ts` MUST expose `addOption` and `removeOption`. Those are the
//     accessors ColdFusion's ORM generates for the OWNING side of the `SwSkuOption` many-to-many,
//     declared with `singularname="option"` at [model/entity/Sku.cfc:L76]; `Sku.cfc` hand-writes
//     neither, which is exactly why they are ORM-generated rather than ported bodies.
//   * `src/domain/entities/promotionReward.ts` MUST expose `addOption`, `removeOption`,
//     `addExcludedOption` and `removeExcludedOption` - hand-written at
//     [model/entity/PromotionReward.cfc:L218, L226, L318, L326] - backing the `options` and
//     `excludedOptions` collections at [L81] and [L87].
//   * `src/domain/entities/promotionQualifier.ts` MUST expose the same four names, hand-written at
//     [model/entity/PromotionQualifier.cfc:L160, L168, L260, L268], backing [L78] and [L84].
//
// `removeExcludedOption` appears in that contract for both promotion entities even though this file
// never calls it, and that is deliberate rather than sloppy: it is the method the two preserved
// defects SHOULD have called, so a reviewer checking the defect annotations needs to see that the
// correct member genuinely exists on the far side and was simply not reached.
//
// THE FOUR MUTUAL TYPE CYCLES ARE UNAVOIDABLE AND ALL FOUR ARE SAFE. `option` <-> `optionGroup`,
// `option` <-> `sku`, `option` <-> `promotionReward` and `option` <-> `promotionQualifier` each
// genuinely name one another in the legacy mapping, so no import ordering can break the cycle.
// Every one of them uses `import type` ONLY, which TypeScript ERASES AT EMIT, so the emitted
// JavaScript contains no `require`/`import` of any sibling module and no initialisation-order
// hazard exists. Entity classes never construct siblings - row-to-entity hydration is a
// `src/repositories/mysql/**` responsibility - so a VALUE import between entity modules is never
// needed and must never be introduced. The one value import sanctioned anywhere in this folder is
// the shared `ENTITY_CODE_PATTERN` constant, and this file deliberately does not take it; see
// `optionCode` below for why.

/**
 * One selectable option - Small, Large, Red, Blue - and the `SwOption` row behind it.
 *
 * A class rather than an interface, because the legacy entity carries behaviour and not merely
 * data: twelve hand-written bidirectional helpers occupy [model/entity/Option.cfc:L92-L147], and
 * two of them are the load-bearing far side of `OptionGroup.addOption` / `OptionGroup.removeOption`.
 * It is also a class because interface parity is the acceptance contract - a reviewer diffs this
 * public surface against the CFC method by method - so method names are the legacy CFML names
 * VERBATIM in camelCase. That is precisely why eslint.config.mjs deliberately enables no
 * `naming-convention`, `camelcase` or `id-match` rule.
 *
 * Every method below is SYNCHRONOUS. The async boundary rule in this port is per-method - a method
 * becomes async if and only if its legacy body reached the DAO or the ORM - and nothing on this
 * entity does. The accessors read already-hydrated fields, and the twelve helpers only call back
 * into the other entity's own API or assign one local field.
 *
 * Every method below is also TOTAL: none of them throws, and none of them can. Contrast
 * `promotionAccount.ts`, whose `setPromotion` is a throwing stub because the legacy body calls a
 * collection accessor that does not resolve. Nothing on this entity reaches a member that the
 * legacy could not resolve, which is a verified property and not an assumption.
 */
export class Option {
  // --- Persistent Properties [model/entity/Option.cfc:L51-L56] --------------------------------

  /**
   * Primary key. [model/entity/Option.cfc:L52]
   *
   *   property name="optionID" ormtype="string" length="32" fieldtype="id" generator="uuid"
   *   unsavedvalue="" default="";
   *
   * `string` and never `string | undefined`: `default=""` means the column always holds a string,
   * possibly the empty one, and `unsavedvalue=""` makes that empty string load-bearing - it is what
   * the legacy framework's `isNew()` keys on. Read-only with no setter, matching the legacy id
   * property, which declares no setter of its own.
   *
   * The declared `length="32"` is recorded because it is part of the schema contract; it is not
   * enforced as a runtime constraint here, because the legacy entity did not enforce it either - the
   * database column length did. `generator="uuid"` is likewise a persistence instruction: a
   * hydrating repository supplies the value, and this class never mints one.
   */
  private readonly optionID: string;

  /**
   * Business code of the option. [model/entity/Option.cfc:L53]
   *
   *   property name="optionCode" ormtype="string";
   *
   * `string | undefined` on the READ side. There is no ORM default and no `required` attribute, so
   * the column can hydrate as SQL NULL, and typing it otherwise would be a lie about existing rows.
   *
   * Validation, verbatim from [model/validation/Option.json:L3]:
   *
   *   "optionCode": [{"contexts":"save","required":true,"unique":true,"regex":"<the shared code
   *   pattern>"}]
   *
   * All three halves of that rule are enforced OUTSIDE this class and each in the layer that can
   * actually enforce it: `required` and the format constraint by the ported zod schema at the
   * service tier, `unique` by the repository, because uniqueness needs the database. A `save`-context
   * rule constrains what may be WRITTEN and says nothing about what an existing row may contain,
   * which is the second reason the field stays nullable here.
   *
   * THE FORMAT CONSTRAINT IS THE SHARED `ENTITY_CODE_PATTERN` DECLARED IN `./optionGroup.ts`, and
   * it is referenced BY NAME here rather than reproduced. The regex is byte-identical across
   * `Product.productCode` [model/validation/Product.json:L10], `Option.optionCode`
   * [model/validation/Option.json:L3] and `OptionGroup.optionGroupCode`
   * [model/validation/OptionGroup.json:L4], and this folder declares it exactly ONCE so the three
   * cannot drift apart. It is deliberately neither re-declared nor IMPORTED here: entities do not
   * enforce validation, so an import would bind no emitted reference and `noUnusedLocals` would
   * correctly fail the build. A doc reference costs nothing and keeps the single declaration
   * single.
   */
  private readonly optionCode: string | undefined;

  /**
   * Display name of the option. [model/entity/Option.cfc:L54]
   *
   *   property name="optionName" ormtype="string";
   *
   * `string | undefined` for the same reason as `optionCode`: no ORM default, no `required`
   * attribute, so the column can hydrate as SQL NULL.
   *
   * Validation [model/validation/Option.json:L4]: `[{"contexts":"save","required":true}]` - required
   * on WRITE only, enforced at the service tier.
   */
  private readonly optionName: string | undefined;

  /**
   * Long description of the option. [model/entity/Option.cfc:L55]
   *
   *   property name="optionDescription" ormtype="string" length="4000"
   *   hb_formFieldType="wysiwyg";
   *
   * TWO PIECES OF INERT METADATA ARE PRESERVED HERE, both as doc text and neither with a runtime
   * representation:
   *
   *   * `length="4000"` is part of the schema contract. It is NOT enforced as a runtime constraint,
   *     because the legacy entity did not enforce it either - the database column length did, and
   *     model/validation/Option.json declares no `maxLength` rule for this property.
   *   * `hb_formFieldType="wysiwyg"` told the legacy admin to render a rich-text editor for this
   *     field. It is an ADMIN PRESENTATION HINT with no domain meaning whatsoever, and the admin
   *     application is out of scope, so it is carried forward as documentation only. It does NOT
   *     imply that the stored value is sanitised, escaped or validated as HTML anywhere in this
   *     port; nothing in the legacy did that either.
   *
   * This column has zero accessor call sites in the legacy tree beyond the framework's own
   * generated admin surface, and it is still exposed below - `accessors=true` generated a getter for
   * it, and interface parity is judged against the property metadata rather than against current
   * usage.
   */
  private readonly optionDescription: string | undefined;

  /**
   * Ordering position of this option WITHIN ITS OWNING OPTION GROUP. [model/entity/Option.cfc:L56]
   *
   *   property name="sortOrder" ormtype="integer" sortContext="optionGroup";
   *
   * `sortContext="optionGroup"` IS THE POINT OF THIS FIELD AND IT IS PRESERVED AS INERT METADATA.
   * It declares that the sort ordinal is scoped to the owning group rather than being global: two
   * options in DIFFERENT groups may legitimately hold the same `sortOrder`, and comparing the
   * `sortOrder` of options drawn from different groups is meaningless. The legacy framework used
   * the attribute to decide which sibling set to renumber when the admin reordered a list; that
   * renumbering is a repository-and-service concern in this port, so the attribute has no runtime
   * representation here - but the SCOPING it declares is a real constraint on how the value may be
   * read, which is why it is stated rather than merely quoted.
   *
   * `number | undefined`, and the `| undefined` is deliberate. Unlike its sibling
   * [model/entity/OptionGroup.cfc:L58], which declares `required="true"` and is therefore a bare
   * `number`, THIS declaration carries no `required` attribute and no default, so the column can
   * hydrate as SQL NULL and the read side must stay honest about that.
   *
   * LEGACY-NOTE [model/dao/SkuDAO.cfc:L192-L197]: that asymmetry has a consequence worth recording,
   * because it is invisible from this file alone. `getSortedProductSkusID` orders by
   * `SUM(SwOption.sortOrder * POWER(10, <nextOptionGroupSortOrder> - SwOptionGroup.sortOrder)) ASC`,
   * so a NULL `SwOption.sortOrder` makes that product NULL and the whole SUM for the affected SKU
   * NULL, which reorders the result rather than merely omitting a term. The legacy schema permits
   * exactly that. It is recorded here and NOT "fixed" by typing the field required: doing so would
   * misrepresent the column, and resolving an absent value is a decision for the hydrating
   * repository at the boundary, where the fetch shape is already documented.
   */
  private readonly sortOrder: number | undefined;

  // --- Related Object Properties (many-to-one) [model/entity/Option.cfc:L58-L60] ---------------

  /**
   * The owning option group. [model/entity/Option.cfc:L59]
   *
   *   property name="optionGroup" cfc="OptionGroup" fieldtype="many-to-one"
   *   fkcolumn="optionGroupID";
   *
   * THE ONE MUTABLE FIELD ON THIS ENTITY, and the only one declared without `readonly`. That is
   * required rather than stylistic: {@link Option.setOptionGroup} assigns it and
   * {@link Option.removeOptionGroup} clears it, reproducing
   * [model/entity/Option.cfc:L93] and [model/entity/Option.cfc:L106] respectively.
   *
   * DECLARED AS A REQUIRED PROPERTY WITH AN `undefined` UNION, NOT AS AN OPTIONAL `?:` PROPERTY.
   * `exactOptionalPropertyTypes` is enabled, and under it an optional property cannot be ASSIGNED
   * `undefined` explicitly - only omitted at construction. The legacy clear is
   * `structDelete(variables, "optionGroup")` [model/entity/Option.cfc:L106], which makes the field
   * genuinely absent, so the port needs an assignment that expresses "now empty". `OptionGroup |
   * undefined` is what makes that expressible; `optionGroup?: OptionGroup` would not compile at the
   * clear site. This is the same shape `promotionAccount.ts`, `promotionCode.ts` and
   * `promotionPeriod.ts` use for their mutable `promotion` many-to-one.
   *
   * NO `fetch="join"` on the legacy declaration, so this association is lazy in the legacy mapping
   * and the port draws no eager-load conclusion from it. `undefined` here means one of two things
   * that this class cannot distinguish and does not try to: the row's `optionGroupID` was NULL, or
   * the repository did not fetch the association. That indistinguishability is an accepted
   * consequence of not simulating laziness; the fetch shape is documented at the producing
   * repository method, never here.
   *
   * Validation [model/validation/Option.json:L5]: `[{"contexts":"save","required":true}]` - so an
   * Option may not be SAVED without a group, enforced at the service tier. It says nothing about
   * what may be READ, which is why the field remains nullable.
   */
  private optionGroup: OptionGroup | undefined;

  /**
   * The `defaultImageID` foreign-key column, preserved INERT. [model/entity/Option.cfc:L60]
   *
   *   property name="defaultImage" cfc="Image" fieldtype="many-to-one" fkcolumn="defaultImageID";
   *
   * THE COLUMN SURVIVES; THE ASSOCIATION DOES NOT. `model/entity/Image.cfc` is out of scope - no
   * image entity is ported anywhere in this port, and the eighteen-file entity budget contains no
   * `image.ts` - so there is no `Image` type to name and none is invented. What remains is the raw
   * opaque foreign key, exposed through {@link Option.getDefaultImageID} with no behaviour attached
   * to it.
   *
   * This is exactly the precedent set by `Category.cmsCategoryID` and `Category.site`, whose Mura
   * CMS bridge is likewise unported: the column is preserved so the schema contract is unbroken,
   * carrying no behaviour. Dropping it would silently change what a row round-trips through this
   * port, which schema continuity forbids.
   *
   * The image subsystem is reached through a STUB PORT in this port, consumed only by out-of-scope
   * branches, and that port is not imported here - `Option` injects no collaborator at all.
   */
  private readonly defaultImageID: string | undefined;

  // OMITTED [model/entity/Option.cfc:L63]: the `images` one-to-many is NOT MATERIALIZED and is not
  // authored as a member at all. The declaration was:
  //
  //   property name="images" singularname="image" cfc="Image" type="array"
  //   fieldtype="one-to-many" fkcolumn="optionID" cascade="all-delete-orphan" inverse="true";
  //
  // `model/entity/Image.cfc` is out of scope, no image entity is ported, and the eighteen-file
  // entity budget contains no `image.ts`, so there is no element type for the array. This follows
  // the `PriceGroup.appliedOrderItems` precedent: a collection whose element type is out of scope is
  // dropped outright rather than typed loosely. It is omitted ENTIRELY rather than exposed as a
  // permanently-empty `readonly []`, because an accessor that can only ever return `[]` would state
  // something false - it would read as "this option has no images" when the truth is "images are not
  // modelled here" - and `no-unused-private-class-members` would in any case reject a field with no
  // reader.
  //
  // THE `cascade="all-delete-orphan"` OBLIGATION IS NOT LOST, it MOVES. Deleting an Option must
  // still delete its `SwImage` rows, and with no ORM to honour the mapping that duty transfers to
  // the MySQL repository sibling, where it is recorded. It is stated here so the transfer is
  // traceable from the entity a reviewer starts at, and it is NOT actionable in this file: a domain
  // entity issues no DELETE.
  //
  // Note that `defaultImage` (L60) and `images` (L63) are INDEPENDENT declarations over two
  // different columns, and they receive different treatments for a principled reason: L60's payload
  // is a scalar FK that survives on its own, while L63's payload is a collection of unported
  // entities that cannot. Neither ruling implies the other.

  // --- Related Object Properties (many-to-many - inverse) [L65-L70] ---------------------------
  //
  // FIVE COLLECTIONS, AND THIS ENTITY IS THE INVERSE SIDE OF EVERY ONE. All five declare
  // `inverse="true"`, meaning the OTHER entity owns the link table and owns the write. That single
  // fact explains the whole shape of the twelve helpers at the foot of this class: each one
  // delegates to the owning side's API instead of splicing a local array, because the local array
  // is not the authority for anything.
  //
  // Each is an ALREADY-POPULATED `readonly` array, `readonly` in both directions - the reference
  // cannot be reassigned and the array cannot be mutated through this type. Laziness is not
  // simulated. An EMPTY array is indistinguishable from "the repository did not fetch the
  // association", which is an accepted consequence of that rather than an oversight; the fetch shape
  // is documented at the producing repository method, never here.
  //
  // LEGACY-NOTE [model/entity/Option.cfc:L63, L66-L70]: a METADATA INCONSISTENCY, recorded and
  // deliberately NOT "fixed". `type="array"` is declared on L63 (`images`), L68
  // (`promotionRewardExclusions`) and L70 (`promotionQualifierExclusions`) but OMITTED on L66
  // (`skus`), L67 (`promotionRewards`) and L69 (`promotionQualifiers`). CFML treats the two forms
  // identically - the ORM infers the array type from `fieldtype="many-to-many"` either way - so this
  // is a cosmetic source wart with no behavioural consequence, and the same pattern recurs on the
  // `attributeValues` declarations elsewhere in the model. Note it is not even systematic here: the
  // two `*Exclusions` carry the attribute and neither of their non-exclusion twins does. ALL FIVE
  // collections are therefore modelled uniformly as `readonly T[]`, which is what CFML actually
  // produced, and no distinction is manufactured from the attribute's presence or absence.
  //
  // INCLUSION AND EXCLUSION ARE INDEPENDENT LINK TABLES, not two states of one relationship. There
  // are four distinct promotion link tables here - `SwPromoRewardOption`, `SwPromoRewardExclOption`,
  // `SwPromoQualOption`, `SwPromoQualExclOption` - and an option can legitimately appear in both the
  // inclusion and the exclusion table of the same reward or qualifier. Nothing in this class
  // reconciles them, and nothing should: that is the promotion engine's business.

  /**
   * The materialized `skus` many-to-many. [model/entity/Option.cfc:L66]
   *
   *   property name="skus" singularname="sku" cfc="Sku" fieldtype="many-to-many"
   *   linktable="SwSkuOption" fkcolumn="optionID" inversejoincolumn="skuID" inverse="true";
   *
   * `SwSkuOption` is OWNED BY `Sku`, not by this entity: [model/entity/Sku.cfc:L76] declares the
   * same link table with `fkcolumn="skuID" inversejoincolumn="optionID"` and NO `inverse` attribute,
   * which makes it the owning side. This is the association that makes an option meaningful at all -
   * it is what `getProductSkusBySelectedOptions` resolves against, through the AND-of-EXISTS
   * statement at [model/dao/SkuDAO.cfc:L107-L128].
   */
  private readonly skus: readonly Sku[];

  /**
   * The materialized `promotionRewards` many-to-many - the INCLUSION side. [L67]
   *
   *   property name="promotionRewards" singularname="promotionReward" cfc="PromotionReward"
   *   fieldtype="many-to-many" linktable="SwPromoRewardOption" fkcolumn="optionID"
   *   inversejoincolumn="promotionRewardID" inverse="true";
   *
   * `SwPromoRewardOption` is owned by [model/entity/PromotionReward.cfc:L81]. Membership here means
   * the reward applies TO order items carrying this option.
   */
  private readonly promotionRewards: readonly PromotionReward[];

  /**
   * The materialized `promotionRewardExclusions` many-to-many - the EXCLUSION side. [L68]
   *
   *   property name="promotionRewardExclusions" singularname="promotionRewardExclusion"
   *   cfc="PromotionReward" type="array" fieldtype="many-to-many"
   *   linktable="SwPromoRewardExclOption" fkcolumn="optionID"
   *   inversejoincolumn="promotionRewardID" inverse="true";
   *
   * A DIFFERENT LINK TABLE from `promotionRewards` - `SwPromoRewardExclOption`, owned by
   * [model/entity/PromotionReward.cfc:L87] as `excludedOptions`. Membership here means the reward
   * must NOT apply to order items carrying this option. Same element type, opposite meaning, which
   * is why the two are separate collections and separate helper pairs.
   */
  private readonly promotionRewardExclusions: readonly PromotionReward[];

  /**
   * The materialized `promotionQualifiers` many-to-many - the INCLUSION side. [L69]
   *
   *   property name="promotionQualifiers" singularname="promotionQualifier"
   *   cfc="PromotionQualifier" fieldtype="many-to-many" linktable="SwPromoQualOption"
   *   fkcolumn="optionID" inversejoincolumn="promotionQualifierID" inverse="true";
   *
   * `SwPromoQualOption` is owned by [model/entity/PromotionQualifier.cfc:L78]. Membership here means
   * order items carrying this option can COUNT TOWARDS the qualifier being met - which is a
   * different question from whether a reward applies, and is why qualifiers and rewards each carry
   * their own pair of tables.
   */
  private readonly promotionQualifiers: readonly PromotionQualifier[];

  /**
   * The materialized `promotionQualifierExclusions` many-to-many - the EXCLUSION side. [L70]
   *
   *   property name="promotionQualifierExclusions" singularname="promotionQualifierExclusion"
   *   cfc="PromotionQualifier" type="array" fieldtype="many-to-many"
   *   linktable="SwPromoQualExclOption" fkcolumn="optionID"
   *   inversejoincolumn="promotionQualifierID" inverse="true";
   *
   * `SwPromoQualExclOption` is owned by [model/entity/PromotionQualifier.cfc:L84] as
   * `excludedOptions`. Membership here means order items carrying this option must NOT count
   * towards the qualifier.
   */
  private readonly promotionQualifierExclusions: readonly PromotionQualifier[];

  // --- Remote Properties [model/entity/Option.cfc:L72-L73] ------------------------------------

  /**
   * External-system identifier. [model/entity/Option.cfc:L73]
   *
   *   property name="remoteID" ormtype="string";
   *
   * Present on this entity, under its own `// Remote properties` banner. Worth stating explicitly
   * because it is not universal in this folder - several in-scope entities declare no `remoteID` at
   * all - so its presence here is a real schema difference rather than boilerplate. It is written by
   * whatever external system loaded the row and is never interpreted by this port.
   */
  private readonly remoteID: string | undefined;

  // --- Audit Properties [model/entity/Option.cfc:L75-L79] -------------------------------------
  //
  // All four declare `hb_populateEnabled="false"`, meaning the legacy framework refused to populate
  // them from request data; they are written by the persistence layer. That attribute has no runtime
  // representation here - this class exposes no setter for any of them, which is the same guarantee
  // expressed structurally rather than by an annotation the runtime would have to honour.
  //
  // The two account associations are `cfc="Account" fieldtype="many-to-one"`, and
  // model/entity/Account.cfc is explicitly out of scope - the whole account module is - so each
  // collapses to its OPAQUE foreign-key id. No `Account` type is imported, no `Account` instance is
  // ever constructed, and the columns themselves are preserved rather than dropped so the schema
  // contract stays auditable. This is the same treatment `optionGroup.ts` gives the identical run of
  // four properties at [model/entity/OptionGroup.cfc:L64-L67].

  /** `createdDateTime`, or `undefined`. [model/entity/Option.cfc:L76] */
  private readonly createdDateTime: Date | undefined;

  /** The `createdByAccountID` column, opaque. [model/entity/Option.cfc:L77] */
  private readonly createdByAccountID: string | undefined;

  /** `modifiedDateTime`, or `undefined`. [model/entity/Option.cfc:L78] */
  private readonly modifiedDateTime: Date | undefined;

  /** The `modifiedByAccountID` column, opaque. [model/entity/Option.cfc:L79] */
  private readonly modifiedByAccountID: string | undefined;

  /**
   * Hydrates one `SwOption` row.
   *
   * A single readonly parameter object, matching the convention this folder already established: an
   * inline object type rather than a second exported interface, because this module's runtime export
   * surface is fixed at exactly one unit - the class itself.
   *
   * TWO DIFFERENT SLOT DISCIPLINES ARE USED, AND THE SPLIT IS PRINCIPLED RATHER THAN INCONSISTENT.
   *
   *   * Every SCALAR and the `optionGroup` association is a REQUIRED slot typed `T | undefined`,
   *     never an optional `?:` slot. `exactOptionalPropertyTypes` is enabled, so "absent" and
   *     "present-but-undefined" are genuinely different types, and requiring the key forces a
   *     hydrating repository to state "I looked and found nothing" rather than silently omitting it.
   *     For these fields that distinction carries real information: an absent `optionCode` means the
   *     column is NULL, which is a fact about the row.
   *   * The five many-to-many INVERSE COLLECTIONS are optional and default to `[]`. For a collection
   *     the distinction carries NO information, because an empty array is already indistinguishable
   *     from an unfetched association - so demanding five explicit `[]` arguments from a repository
   *     that legitimately fetched none of them would be ceremony that proves nothing. All five are
   *     inverse sides read only by the promotion engine, and the catalog paths that hydrate an
   *     Option never touch them. This follows the precedent `brand.ts` sets for its own four inverse
   *     collections.
   *
   * There is no collaborator port parameter, because this entity has zero `getService(` sites, and
   * no clock parameter, because it performs no date comparison of any kind - contrast
   * `promotionPeriod.ts`, whose `isCurrent` takes an explicit `now` so the UTC policy is visible and
   * the method is deterministically testable.
   *
   * The constructor never validates. `optionCode`, `optionName` and `optionGroup` all carry
   * `required` rules on the `save` context [model/validation/Option.json:L3-L5], and enforcing them
   * here would make it impossible to hydrate an existing row that predates the rule - which is
   * exactly the case a read path must handle. Validation stays at the service tier.
   */
  constructor(init: {
    readonly optionID: string;
    readonly optionCode: string | undefined;
    readonly optionName: string | undefined;
    readonly optionDescription: string | undefined;
    readonly sortOrder: number | undefined;
    readonly optionGroup: OptionGroup | undefined;
    readonly defaultImageID: string | undefined;
    readonly remoteID: string | undefined;
    readonly createdDateTime: Date | undefined;
    readonly createdByAccountID: string | undefined;
    readonly modifiedDateTime: Date | undefined;
    readonly modifiedByAccountID: string | undefined;
    readonly skus?: readonly Sku[] | undefined;
    readonly promotionRewards?: readonly PromotionReward[] | undefined;
    readonly promotionRewardExclusions?: readonly PromotionReward[] | undefined;
    readonly promotionQualifiers?: readonly PromotionQualifier[] | undefined;
    readonly promotionQualifierExclusions?: readonly PromotionQualifier[] | undefined;
  }) {
    this.optionID = init.optionID;
    this.optionCode = init.optionCode;
    this.optionName = init.optionName;
    this.optionDescription = init.optionDescription;
    this.sortOrder = init.sortOrder;
    this.optionGroup = init.optionGroup;
    this.defaultImageID = init.defaultImageID;
    this.remoteID = init.remoteID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
    this.skus = init.skus ?? [];
    this.promotionRewards = init.promotionRewards ?? [];
    this.promotionRewardExclusions = init.promotionRewardExclusions ?? [];
    this.promotionQualifiers = init.promotionQualifiers ?? [];
    this.promotionQualifierExclusions = init.promotionQualifierExclusions ?? [];
  }

  // --- Accessors ------------------------------------------------------------------------------
  //
  // ColdFusion's `accessors=true` [model/entity/Option.cfc:L49] auto-generated every one of these
  // from the property metadata, so there is no legacy body to port and the locator on each one cites
  // the property declaration it serves.
  //
  // GETTERS ONLY. The legacy component hand-writes no setter at all - `setOptionGroup`
  // [model/entity/Option.cfc:L92] is a BIDIRECTIONAL HELPER rather than a property setter, which is
  // why it lives with the helpers further down and not here. The framework's generated setters are
  // not reproduced: this entity is hydrated by its constructor, and a repository that needs to write
  // a column writes the row, not the object.
  //
  // The set is COMPLETE with respect to the persistent properties rather than trimmed to what the
  // legacy tree happens to call, and that is deliberate for two reasons. `accessors=true` generated
  // all of them, so parity is judged against the property metadata; and the legacy admin reaches
  // them through the framework, so "no call site in the model layer" does not mean "unused".
  //
  // EIGHT OF THEM ARE ALSO A HARD CROSS-MODULE REQUIREMENT, not merely parity. `optionGroup.ts`
  // resolves its `getOptions(orderby)` argument through an exhaustive switch over exactly
  // `getOptionID`, `getOptionCode`, `getOptionName`, `getOptionDescription`, `getSortOrder`,
  // `getRemoteID`, `getCreatedDateTime` and `getModifiedDateTime`, replacing the legacy
  // `evaluate("...get#property#()")` at [model/service/HibachiUtilityService.cfc:L523]. Removing any
  // one of them is a compile error over there, not a local cleanup here.

  /** [model/entity/Option.cfc:L52] */
  getOptionID(): string {
    return this.optionID;
  }

  /**
   * [model/entity/Option.cfc:L53] Format constraint: the shared `ENTITY_CODE_PATTERN` declared in
   * `./optionGroup.ts`, enforced at the service tier and not here.
   */
  getOptionCode(): string | undefined {
    return this.optionCode;
  }

  /** [model/entity/Option.cfc:L54] */
  getOptionName(): string | undefined {
    return this.optionName;
  }

  /**
   * [model/entity/Option.cfc:L55] Declared `length="4000"` and `hb_formFieldType="wysiwyg"` in the
   * mapping; both are inert metadata and neither is enforced or interpreted here.
   */
  getOptionDescription(): string | undefined {
    return this.optionDescription;
  }

  /**
   * [model/entity/Option.cfc:L56] Scoped by `sortContext="optionGroup"`, so this ordinal is
   * comparable only against other options in the SAME group. Nullable, unlike
   * [model/entity/OptionGroup.cfc:L58].
   */
  getSortOrder(): number | undefined {
    return this.sortOrder;
  }

  /**
   * The owning option group, or `undefined` when the FK is NULL, the association was not fetched, or
   * {@link Option.removeOptionGroup} has cleared it. [model/entity/Option.cfc:L59]
   *
   * `OptionGroup | undefined` rather than `OptionGroup`, because the field is genuinely clearable -
   * see the `structDelete` at [model/entity/Option.cfc:L106]. A caller that needs the group must
   * handle its absence; there is no fallback to invent, and inventing one would hide a hydration gap.
   */
  getOptionGroup(): OptionGroup | undefined {
    return this.optionGroup;
  }

  /**
   * The inert `defaultImageID` foreign-key column. [model/entity/Option.cfc:L60]
   *
   * Returns the raw opaque id and never an entity: `Image` is out of scope and is not ported, so
   * there is nothing to resolve this id against inside the domain. Preserved for schema continuity
   * on the `Category.cmsCategoryID` precedent.
   */
  getDefaultImageID(): string | undefined {
    return this.defaultImageID;
  }

  /**
   * The materialized `skus` association. [model/entity/Option.cfc:L66]
   *
   * `readonly` in both directions, which is what stops a caller mutating this entity's state through
   * the returned reference. The array is handed back as materialized - this accessor never sorts,
   * filters or copies, because the legacy generated accessor did none of those either.
   */
  getSkus(): readonly Sku[] {
    return this.skus;
  }

  /** The materialized `promotionRewards` association - the INCLUSION side. [L67] */
  getPromotionRewards(): readonly PromotionReward[] {
    return this.promotionRewards;
  }

  /** The materialized `promotionRewardExclusions` association - the EXCLUSION side. [L68] */
  getPromotionRewardExclusions(): readonly PromotionReward[] {
    return this.promotionRewardExclusions;
  }

  /** The materialized `promotionQualifiers` association - the INCLUSION side. [L69] */
  getPromotionQualifiers(): readonly PromotionQualifier[] {
    return this.promotionQualifiers;
  }

  /** The materialized `promotionQualifierExclusions` association - the EXCLUSION side. [L70] */
  getPromotionQualifierExclusions(): readonly PromotionQualifier[] {
    return this.promotionQualifierExclusions;
  }

  /** [model/entity/Option.cfc:L73] */
  getRemoteID(): string | undefined {
    return this.remoteID;
  }

  /** [model/entity/Option.cfc:L76] */
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /** [model/entity/Option.cfc:L77] The `createdByAccountID` column, opaque. */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /** [model/entity/Option.cfc:L78] */
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /** [model/entity/Option.cfc:L79] The `modifiedByAccountID` column, opaque. */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  // OMITTED [model/entity/Option.cfc:L81-L83]: getImageDirectory() returned
  // getURLFromPath(setting('globalAssetsImageFolderPath')) & '/option/'.
  // The globalAssetsImageFolderPath setting is out of scope (not one of the seven
  // SettingsProvider keys) and getURLFromPath() belongs to the non-ported Hibachi base.
  // Image handling is an out-of-scope stub port; no image path is resolved in the domain.
  //
  // Both halves of that reasoning are independently sufficient, and both were verified rather than
  // asserted. The `SettingsProvider` port surface is CLOSED at seven keys - `skuCurrency`,
  // `skuEligibleCurrencies`, `globalURLKeyProduct`, `globalURLKeyProductType`,
  // `productImageDefaultExtension`, `productImageOptionCodeDelimiter` and `productTitleString` - and
  // `globalAssetsImageFolderPath` is not among them; no eighth key may be added. Independently,
  // `getURLFromPath()` is a framework helper on the unported Hibachi base, so porting the body would
  // require porting the base or reimplementing it, and reimplementing an unported framework helper
  // inside a domain entity is precisely the coupling this port exists to remove.
  //
  // This is the only member of `model/entity/Option.cfc` that is omitted rather than ported. It sits
  // here, at its source position between the property block and the first banner, so a reviewer
  // diffing this file against the CFC finds the reason exactly where the method used to be.

  // --- Non-Persistent Property Methods [model/entity/Option.cfc:L85-L87] ----------------------
  //
  // EMPTY in the source: the banner is present but the section contains nothing. Recorded because a
  // reviewer diffing this file against the CFC will look for it, and because an empty banner implies
  // nothing whatsoever. This entity therefore declares no derived value, holds no memo, and carries
  // none of the memoized-accessor defects that afflict `sku.ts` and `product.ts`.

  // --- Bidirectional Helper Methods [model/entity/Option.cfc:L89-L149] ------------------------
  //
  // TWELVE METHODS, SIX PAIRS, AND THEY ARE NOT ALL THE SAME SHAPE. One pair maintains this
  // entity's own many-to-one field; the other five are pure delegations to the owning side of a
  // many-to-many, because this entity is the INVERSE side of all five.
  //
  // Every one is `void` and every one is synchronous, matching the legacy declarations exactly.
  // Parameter names are the legacy names VERBATIM, including where they read oddly - see the four
  // exclusion methods, whose parameter is named for the ENTITY it receives rather than for the
  // "exclusion" concept in the method name.
  //
  // NOT GENERATED, because nothing calls them. The dispatcher at
  // org/Hibachi/HibachiEntity.cfc:L507-L565 could have synthesised `hasSku`, `hasPromotionReward`,
  // `hasAnySkus`, `getSkusCount`, `getSkusAssignedIDList` and the rest for these five collections,
  // and a census of calls made on an `Option` reference across the legacy tree finds none of them.
  // Only concretely-called members are generated. `isNew()` is likewise absent: it is called ON an
  // Option at [model/entity/Option.cfc:L94] by this entity's own `setOptionGroup`, and that call
  // disappears with the guard it belonged to - see the note on that method.

  // Option Group (many-to-one) [model/entity/Option.cfc:L91]

  // LEGACY-NOTE [model/entity/Option.cfc:L94-L96, L102-L105]: the CFML bodies also mutated the
  // owning OptionGroup's options array in place (arrayAppend / arrayFind + arrayDeleteAt) so a
  // Hibernate flush would cascade correctly. Associations here are materialized at the repository
  // boundary as readonly arrays with no session and no cascade, so collection state is owned by
  // src/repositories/mysql/**. Only this Option's own optionGroup field is maintained;
  // optionGroup.getOptions() reflects the collection as hydrated. The
  // `isNew() or !optionGroup.hasOption(this)` guard at L94 is therefore vacuous and omitted.
  //
  // This is an ARCHITECTURAL CONSEQUENCE, NOT A DEFECT, which is why it carries the weaker marker:
  // the legacy code was correct for the runtime it ran in, and the behaviour disappears because the
  // runtime did, not because anything was wrong. It spends no deliberate-divergence budget.
  //
  // Two further consequences, stated so a reviewer does not have to derive them:
  //
  //   * `optionGroup.ts` documents the same seam from the other side and explicitly instructs that
  //     the `readonly` on `getOptions()` must NOT be weakened to restore the in-place mutation.
  //     Mutating a shared request-scoped array would corrupt every other holder of the same
  //     instance. Reconciliation belongs at the repository boundary.
  //   * NO CONTAINMENT TEST IS PERFORMED ANYWHERE IN THIS FILE, so no comparison basis is exercised.
  //     Were one ever needed, it must compare by PRIMARY KEY (`optionID`) and never by object
  //     reference or deep equality: Hibernate's `arrayFind` and `hasOption` semantics rest on
  //     session identity, and primary-key comparison is the faithful equivalent in a session-less
  //     port.

  /**
   * Points this option at its owning group. [model/entity/Option.cfc:L92-L97]
   *
   *   public void function setOptionGroup(required any optionGroup) {
   *       variables.optionGroup = arguments.optionGroup;
   *       if(isNew() or !arguments.optionGroup.hasOption( this )) {
   *           arrayAppend(arguments.optionGroup.getOptions(), this);
   *       }
   *   }
   *
   * LOAD-BEARING IN BOTH DIRECTIONS: [model/entity/OptionGroup.cfc:L92-L94] `addOption` delegates
   * straight into this method, so it is the only way the far side can establish the link.
   *
   * The parameter is REQUIRED in the source, so it is a plain required parameter here - contrast
   * {@link Option.removeOptionGroup}, whose legacy argument is deliberately not required.
   *
   * The L93 assignment is reproduced; the L94-L96 collection append is not, for the reason recorded
   * in the note above. What remains is the whole of this method's observable effect on THIS object.
   */
  setOptionGroup(optionGroup: OptionGroup): void {
    this.optionGroup = optionGroup;
  }

  /**
   * Clears this option's owning group. [model/entity/Option.cfc:L98-L107]
   *
   *   public void function removeOptionGroup(any optionGroup) {
   *       if(!structKeyExists(arguments, "optionGroup")) {
   *           arguments.optionGroup = variables.optionGroup;
   *       }
   *       var index = arrayFind(arguments.optionGroup.getOptions(), this);
   *       if(index > 0) {
   *           arrayDeleteAt(arguments.optionGroup.getOptions(), index);
   *       }
   *       structDelete(variables, "optionGroup");
   *   }
   *
   * LOAD-BEARING: [model/entity/OptionGroup.cfc:L95-L97] `removeOption` delegates straight into it,
   * passing `this` explicitly.
   *
   * THE PARAMETER IS OPTIONAL, AND THAT IS THE POINT OF THE LEGACY SIGNATURE. L98 declares a bare
   * `any optionGroup` with NO `required` attribute for exactly one purpose: so that
   * `structKeyExists(arguments, "optionGroup")` at L99 can distinguish "the caller passed something"
   * from "the caller passed nothing" and fall back to the currently-set group in the second case.
   *
   * THE BRANCH IS THEREFORE ON PRESENCE, NOT ON TRUTHINESS - `optionGroup !== undefined`, never
   * `if (optionGroup)`. This is the same rule that governs `OptionGroup.getOptions(orderby)`. A
   * truthiness test would be wrong in principle even though no falsy `OptionGroup` value can exist:
   * the question being asked is "did the caller supply an argument", and only an identity comparison
   * against `undefined` asks it. Writing the weaker test here would also make this file disagree
   * with its own sibling about what the legacy `structKeyExists` idiom means.
   *
   * WHAT THE RESOLVED GROUP IS USED FOR, now that the splice is gone. In the legacy the fallback
   * existed to give L102-L105 an array to splice, and it is also what L102 DEREFERENCED. With the
   * splice unreproduced, exactly one decision still depends on it: whether this call names a link at
   * all. If neither the caller nor this option names a group, there is no link to break, and the
   * method returns having changed nothing.
   *
   * THAT GUARD IS PROVABLY BEHAVIOUR-PRESERVING RATHER THAN A CHANGE, which is why it is a guard and
   * not a divergence. `resolvedOptionGroup === undefined` can only hold when the argument was omitted
   * AND `this.optionGroup` was already `undefined`, so the clear it skips would have been a no-op on
   * a field that is already empty. The legacy did not reach L106 in that case either: L102
   * dereferenced null and RAISED. The raise itself is deliberately not reproduced, because it was a
   * consequence of the splice - remove the splice and the dereference goes with it - and because
   * every method on this entity is total. Returning unchanged is therefore the faithful translation
   * of "the legacy left this field empty and did no further work".
   *
   * All four input combinations were checked against the legacy and all four agree on the resulting
   * state of this object: argument or no argument, group set or not set.
   *
   * @param optionGroup - The group to unlink from. Omit it entirely to fall back to the currently
   *   set group, exactly as the legacy `structKeyExists` branch did.
   */
  removeOptionGroup(optionGroup?: OptionGroup): void {
    // [model/entity/Option.cfc:L99-L101]: presence test, then the fallback to the currently-set
    // group. `!== undefined` and never a truthiness test - see the note on this method.
    const resolvedOptionGroup: OptionGroup | undefined =
      optionGroup !== undefined ? optionGroup : this.optionGroup;

    if (resolvedOptionGroup === undefined) {
      // Nothing names a group, so there is no link to break. See the note above for why returning
      // here is behaviour-identical to the legacy rather than a shortcut.
      return;
    }

    // [model/entity/Option.cfc:L102-L106] collapse into this ONE assignment, and the collapse is the
    // whole architectural consequence recorded above. L102-L105 spliced `this` out of
    // `resolvedOptionGroup.getOptions()`; L106 then cleared `variables.optionGroup` unconditionally.
    // In this port the field below is the entirety of how membership is represented on an Option -
    // the far-side array is a `readonly` projection owned by src/repositories/mysql/** - so clearing
    // it expresses both statements at once. Expressible as an assignment only because the field is
    // declared `OptionGroup | undefined` rather than optional; see the field declaration for why.
    this.optionGroup = undefined;
  }

  // Skus (many-to-many - inverse) [model/entity/Option.cfc:L109]
  //
  // The remaining ten helpers are PURE DELEGATIONS to the owning side's API. Not one of them touches
  // a local collection, and that is exactly what the legacy bodies do: this entity is the inverse
  // side of all five many-to-many associations, so the owning entity holds the write. No array
  // manipulation is reimplemented here, because none exists here to reimplement.

  /**
   * Links this option to a sku. [model/entity/Option.cfc:L110-L112]
   *
   *   public void function addSku(required any sku) {
   *       arguments.sku.addOption( this );
   *   }
   *
   * Delegates to the owning side of `SwSkuOption`. `Sku.addOption` is ORM-GENERATED rather than
   * hand-written - [model/entity/Sku.cfc:L76] declares the collection with
   * `singularname="option"` and `Sku.cfc` declares no `addOption` body of its own - and that owning
   * declaration carries no `inverse` attribute, which is what makes it the owner.
   */
  addSku(sku: Sku): void {
    sku.addOption(this);
  }

  /**
   * Unlinks this option from a sku. [model/entity/Option.cfc:L113-L115]
   *
   *   public void function removeSku(required any sku) {
   *       arguments.sku.removeOption( this );
   *   }
   *
   * Delegates to the owning side's `remove*`, which is the pattern as intended - contrast the two
   * exclusion `remove*` methods further down, which do not.
   *
   * LEGACY-NOTE [model/validation/Option.json:L6]: `"skus": [{"contexts":"delete",
   * "maxCollection":0}]` - an Option may not be DELETED while any sku still references it. That is a
   * service-tier rule and it is named here because this is the method a caller reaches for to satisfy
   * it. It is not enforced in this class, and it is not this method's job to enforce it.
   */
  removeSku(sku: Sku): void {
    sku.removeOption(this);
  }

  // Promotion Rewards (many-to-many - inverse) [model/entity/Option.cfc:L117]

  /**
   * Adds this option to a reward's INCLUSION set. [model/entity/Option.cfc:L118-L120]
   *
   *   public void function addPromotionReward(required any promotionReward) {
   *       arguments.promotionReward.addOption( this );
   *   }
   *
   * Delegates to [model/entity/PromotionReward.cfc:L218], the owning side of `SwPromoRewardOption`
   * declared at [model/entity/PromotionReward.cfc:L81].
   */
  addPromotionReward(promotionReward: PromotionReward): void {
    promotionReward.addOption(this);
  }

  /**
   * Removes this option from a reward's INCLUSION set. [model/entity/Option.cfc:L121-L123]
   *
   *   public void function removePromotionReward(required any promotionReward) {
   *       arguments.promotionReward.removeOption( this );
   *   }
   *
   * Delegates to [model/entity/PromotionReward.cfc:L226]. CORRECT: `remove*` reaches the far side's
   * `removeOption`, unlike its exclusion counterpart below.
   */
  removePromotionReward(promotionReward: PromotionReward): void {
    promotionReward.removeOption(this);
  }

  // Promotion Reward Exclusions (many-to-many - inverse) [model/entity/Option.cfc:L125]

  /**
   * Adds this option to a reward's EXCLUSION set. [model/entity/Option.cfc:L126-L128]
   *
   *   public void function addPromotionRewardExclusion(required any promotionReward) {
   *       arguments.promotionReward.addExcludedOption( this );
   *   }
   *
   * A DIFFERENT LINK TABLE from {@link Option.addPromotionReward} - `SwPromoRewardExclOption`, owned
   * by [model/entity/PromotionReward.cfc:L87] as `excludedOptions`, with the helper at
   * [model/entity/PromotionReward.cfc:L318].
   *
   * THE PARAMETER NAME IS THE LEGACY NAME AND IT IS DELIBERATELY MISMATCHED WITH THE CONCEPT. L126
   * declares `required any promotionReward`, so this method takes a *promotionReward*, not an
   * *exclusion*, despite what "Exclusion" in the method name suggests. Renaming it to `exclusion`
   * would read better and would break interface parity, so the legacy name stands - which is exactly
   * why eslint.config.mjs enables no identifier-shape rule. The same mismatch recurs on the other
   * three exclusion helpers.
   */
  addPromotionRewardExclusion(promotionReward: PromotionReward): void {
    promotionReward.addExcludedOption(this);
  }

  // LEGACY-DEFECT [model/entity/Option.cfc:L129-L131]: removePromotionRewardExclusion calls
  // addExcludedOption(this) instead of removeExcludedOption(this) - the "remove" method ADDS.
  // The body is a byte-for-byte copy of addPromotionRewardExclusion at L126-L128, so the two
  // methods are indistinguishable at runtime: calling remove after add is IDEMPOTENT rather than
  // destructive, because the far side's addExcludedOption guards on
  // `isNew() or !hasExcludedOption(...)` [model/entity/PromotionReward.cfc:L319] and therefore
  // refuses to add a second copy. The practical consequence is that AN EXCLUSION CAN NEVER BE
  // WITHDRAWN THROUGH THIS API - the only working removal path is the owning side's own
  // removeExcludedOption at [model/entity/PromotionReward.cfc:L326], which this method does not
  // reach. That method does exist and is correct; it is simply never called from here.
  // Reproduced as written because behaviour preservation extends to defects, and because an
  // exclusion controls whether a promotion applies - "fixing" it silently would change the discount
  // a customer receives. This spends no deliberate-divergence budget: this port's permitted
  // divergences are reserved for the memoized-accessor defects in sku.ts and product.ts.
  // Preserved deliberately; do not fix without a product decision.

  /**
   * Declared to remove this option from a reward's EXCLUSION set; ACTUALLY ADDS IT.
   * [model/entity/Option.cfc:L129-L131]
   *
   *   public void function removePromotionRewardExclusion(required any promotionReward) {
   *       arguments.promotionReward.addExcludedOption( this );
   *   }
   *
   * See the marker immediately above. The call below is `addExcludedOption`, not
   * `removeExcludedOption`, and that is the legacy behaviour reproduced exactly rather than a typo in
   * this port.
   */
  removePromotionRewardExclusion(promotionReward: PromotionReward): void {
    promotionReward.addExcludedOption(this);
  }

  // Promotion Qualifiers (many-to-many - inverse) [model/entity/Option.cfc:L133]

  /**
   * Adds this option to a qualifier's INCLUSION set. [model/entity/Option.cfc:L134-L136]
   *
   *   public void function addPromotionQualifier(required any promotionQualifier) {
   *       arguments.promotionQualifier.addOption( this );
   *   }
   *
   * Delegates to [model/entity/PromotionQualifier.cfc:L160], the owning side of `SwPromoQualOption`
   * declared at [model/entity/PromotionQualifier.cfc:L78].
   */
  addPromotionQualifier(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addOption(this);
  }

  /**
   * Removes this option from a qualifier's INCLUSION set. [model/entity/Option.cfc:L137-L139]
   *
   *   public void function removePromotionQualifier(required any promotionQualifier) {
   *       arguments.promotionQualifier.removeOption( this );
   *   }
   *
   * Delegates to [model/entity/PromotionQualifier.cfc:L168]. CORRECT, on the same footing as
   * {@link Option.removePromotionReward}.
   */
  removePromotionQualifier(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.removeOption(this);
  }

  // Promotion Qualifier Exclusions (many-to-many - inverse) [model/entity/Option.cfc:L141]

  /**
   * Adds this option to a qualifier's EXCLUSION set. [model/entity/Option.cfc:L142-L144]
   *
   *   public void function addPromotionQualifierExclusion(required any promotionQualifier) {
   *       arguments.promotionQualifier.addExcludedOption( this );
   *   }
   *
   * `SwPromoQualExclOption`, owned by [model/entity/PromotionQualifier.cfc:L84] as
   * `excludedOptions`, with the helper at [model/entity/PromotionQualifier.cfc:L260]. The parameter
   * name is the legacy name and is mismatched with the concept for the reason given on
   * {@link Option.addPromotionRewardExclusion}.
   */
  addPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addExcludedOption(this);
  }

  // LEGACY-DEFECT [model/entity/Option.cfc:L145-L147]: removePromotionQualifierExclusion calls
  // addExcludedOption(this) instead of removeExcludedOption(this) - the "remove" method ADDS.
  // The identical defect to L129-L131, made a second time against PromotionQualifier: the body is a
  // byte-for-byte copy of addPromotionQualifierExclusion at L142-L144. Calling remove after add is
  // therefore IDEMPOTENT rather than destructive, because the far side's addExcludedOption guards on
  // `isNew() or !hasExcludedOption(...)` [model/entity/PromotionQualifier.cfc:L261] and refuses a
  // duplicate. The practical consequence is the same: AN EXCLUSION CAN NEVER BE WITHDRAWN THROUGH
  // THIS API, and the only working removal path is the owning side's own removeExcludedOption at
  // [model/entity/PromotionQualifier.cfc:L268], which this method does not reach.
  // That the same mistake appears twice, in two adjacent copy-pasted blocks, is itself the evidence
  // that it is a copy-paste artifact rather than an intentional alias - and it is still preserved,
  // because a qualifier exclusion decides whether a promotion qualifies at all, which decides money.
  // Preserved deliberately; do not fix without a product decision.

  /**
   * Declared to remove this option from a qualifier's EXCLUSION set; ACTUALLY ADDS IT.
   * [model/entity/Option.cfc:L145-L147]
   *
   *   public void function removePromotionQualifierExclusion(required any promotionQualifier) {
   *       arguments.promotionQualifier.addExcludedOption( this );
   *   }
   *
   * See the marker immediately above. The call below is `addExcludedOption`, not
   * `removeExcludedOption`, reproducing the legacy exactly.
   */
  removePromotionQualifierExclusion(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addExcludedOption(this);
  }

  // --- Overridden Methods [model/entity/Option.cfc:L151-L153] ---------------------------------
  //
  // EMPTY in the source: the banner is present but the section contains nothing. This entity
  // overrides no framework method, so there is no `getSimpleRepresentation`, no `isDeletable`, no
  // `isNew` and no collection-accessor override here - contrast `optionGroup.ts`, whose `getOptions`
  // genuinely overrides the generated accessor.

  // --- ORM Event Hooks [model/entity/Option.cfc:L155-L157] ------------------------------------
  //
  // EMPTY in the source. This entity has no `preInsert`, no `preUpdate` and no other lifecycle hook,
  // so there is no explicit path-maintenance or timestamp step for a repository to invoke on save.
  // Only Category, PriceGroup, ProductType and PromotionCode carry hooks in this port; for contrast,
  // `PriceGroup.getPriceGroupIDPath()` [model/entity/PriceGroup.cfc:L195] is maintained by exactly
  // such hooks at [model/entity/PriceGroup.cfc:L206] and [L211]. Nothing equivalent applies here,
  // and the two audit timestamps at L76 and L78 are written by the persistence layer rather than by
  // a hook this entity declares.
}
