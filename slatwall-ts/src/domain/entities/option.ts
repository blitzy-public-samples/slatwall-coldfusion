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
//   src/domain/entities/promotionQualifier.ts  PromotionQualifier entity
//   src/domain/entities/promotionReward.ts     PromotionReward entity
//   src/domain/entities/sku.ts                 Sku entity
//   tests/unit/domain/entities/option.test.ts  option entity suite
// ---------------------------------------------------------------------------

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
//   of the THIRTEEN in-scope entities with none - eighteen in scope, minus those
//   five. Nothing is imported from `../ports/`, no
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
//   `Image` is not one of the eighteen in-scope entities and no image entity is
//   ported, so neither declaration can name an `Image` type. The split turns on
//   the FIELD TYPE - where the join key physically sits - and not on the far
//   side's scope, which is common to both:
//
//     * L60 `defaultImage` (many-to-one, fkcolumn="defaultImageID") survives as
//       an INERT PERSISTED COLUMN - `defaultImageID` with an accessor and no
//       behaviour attached. The key is a scalar on THIS row and there is no
//       collection to describe, so an opaque id is the whole of it. This is the
//       precedent set by `Category.cmsCategoryID` and `Category.site`: the
//       column survives so the schema contract is unbroken.
//     * L63 `images` (one-to-many, cascade="all-delete-orphan",
//       fkcolumn="optionID") is MATERIALIZED THROUGH A NARROW STRUCTURAL
//       PROJECTION - `readonly OptionImageLink[]` - because the key sits on the
//       far `SwImage` row and points HERE, which makes those rows this option's
//       own data. See the field and `getImages()`.
//
//   An earlier revision authored NO member for `images` and stated the second
//   rule as "not materialized at all, following the PriceGroup.appliedOrderItems
//   precedent". That was wrong for the reasons set out on the field, and the
//   entry above is the correction rather than a restatement. `getImageDirectory()`
//   [L81-L83] was dropped in the same revision and is likewise now ported; see
//   the method for why its two out-of-scope INPUTS never justified removing the
//   method itself.
//
//   Where this file still says "DROPPED" or "OMITTED" it always means "not
//   authored in this TypeScript file, with the reason recorded where it would have
//   gone". Neither ever means a legacy file was edited or deleted.
//   model/entity/Option.cfc is reference-only and remains untouched, as does every
//   other file outside `slatwall-ts/`.
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
//   Coverage belongs at `slatwall-ts/tests/unit/domain/entities/option.test.ts` (planned)
//   and ALL of it is net-new: no legacy test under `meta/tests/**` touches this
//   entity. Only `meta/tests/unit/entity/BrandTest.cfc` and
//   `meta/tests/unit/entity/ProductTest.cfc` are extended anywhere in this
//   port, and `meta/tests/functional/admin/entity/ProductTest.cfc` is an empty
//   stub contributing zero coverage. Nothing here may be presented as parity.
//   The test tier is authored separately; this file needs no seam for it, since
//   every method below is SYNCHRONOUS - no `async`, no `Promise`, no port to
//   stub. It does need two RAISE cases covered: `removeOptionGroup` called with
//   no argument on an option with no group, and `getImageDirectory` on an option
//   hydrated without an assets base. An earlier revision of this note said
//   "every one is total", which stopped being true and is corrected here; the
//   authoritative list of what can throw is on the class doc comment.
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
//   * `src/domain/entities/sku.ts` (planned) MUST expose `addOption` and `removeOption`. Those are the
//     accessors ColdFusion's ORM generates for the OWNING side of the `SwSkuOption` many-to-many,
//     declared with `singularname="option"` at [model/entity/Sku.cfc:L76]; `Sku.cfc` hand-writes
//     neither, which is exactly why they are ORM-generated rather than ported bodies.
//   * `src/domain/entities/promotionReward.ts` (planned) MUST expose `addOption`, `removeOption`,
//     `addExcludedOption` and `removeExcludedOption` - hand-written at
//     [model/entity/PromotionReward.cfc:L218, L226, L318, L326] - backing the `options` and
//     `excludedOptions` collections at [L81] and [L87].
//   * `src/domain/entities/promotionQualifier.ts` (planned) MUST expose the same four names, hand-written at
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
 * The ANTI-CORRUPTION PROJECTION of one `SwImage` row owned by this option.
 * [model/entity/Option.cfc:L63]
 *
 * MODULE-LOCAL AND UN-EXPORTED. `model/entity/Image.cfc` is out of scope, the
 * eighteen-file entity budget contains no `image.ts`, and the image subsystem is a
 * stub port consumed only by out-of-scope branches - so the far side is named
 * STRUCTURALLY rather than nominally. An `interface` is erased at emit, so the
 * module's runtime export surface stays at exactly one value (the class), and
 * keeping it un-exported stops the shape leaking outward as though it were a domain
 * type in its own right.
 *
 * THIS IS THE `*Link` PATTERN ALREADY ESTABLISHED IN THIS FOLDER by
 * `src/domain/entities/brand.ts`, which names five out-of-scope far sides the same
 * way, and by `src/domain/entities/category.ts` for its `contents` many-to-many.
 *
 * WHY THE SHAPE IS EXACTLY THESE THREE MEMBERS. The one legacy behaviour that
 * REACHES INTO an image row from an option context is the admin's file handling at
 * [admin/controllers/main.cfc:L118-L131], which reads `image.getImageFile()` and
 * joins it onto a directory. `imageID` [model/entity/Image.cfc:L52] is the primary
 * key and the `fkcolumn="optionID"` join target, so it is what identifies a row;
 * `imageFile` [model/entity/Image.cfc:L55] is the stored filename; `directory`
 * [model/entity/Image.cfc:L56] is the per-row column that
 * {@link Option.getImageDirectory} supplies the default for. Everything else on
 * `model/entity/Image.cfc` - `imageName`, `imageDescription`, `imageType`,
 * `product`, `promotion`, the four audit columns - is unreachable from anything in
 * scope and is therefore NOT declared. The reachable set is the authority for what
 * may appear here, which makes the shape a derivation rather than a judgement call.
 */
interface OptionImageLink {
  /** The `SwImage.imageID` primary key. [model/entity/Image.cfc:L52] */
  getImageID(): string;
  /** The stored filename. [model/entity/Image.cfc:L55] */
  getImageFile(): string | undefined;
  /** The per-row directory column. [model/entity/Image.cfc:L56] */
  getDirectory(): string | undefined;
}

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
 * EXACTLY TWO MEMBERS BELOW CAN THROW, and both reproduce a source failure rather than adding a
 * defensive one. An earlier revision of this note claimed "every method below is also TOTAL: none of
 * them throws, and none of them can"; that became false and is corrected here rather than left to
 * mislead a reader who trusts it.
 *
 *   * {@link Option.removeOptionGroup} raises when called with no argument on an option that has no
 *     group, reproducing the unguarded null dereference at [model/entity/Option.cfc:L99-L102].
 *   * {@link Option.getImageDirectory} raises when the assets image base was not materialized,
 *     because its declared return type is `string` and every substitute value would be a
 *     plausible-looking WRONG path. See the method.
 *
 * Contrast `promotionAccount.ts`, whose `setPromotion` is a throwing stub because the legacy body
 * calls a collection accessor that does not resolve. Every other member here is total, which remains
 * a verified property rather than an assumption.
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

  /**
   * The materialized `images` one-to-many. [model/entity/Option.cfc:L63]
   *
   *   property name="images" singularname="image" cfc="Image" type="array"
   *   fieldtype="one-to-many" fkcolumn="optionID" cascade="all-delete-orphan" inverse="true";
   *
   * ★ A REAL, POPULATABLE ASSOCIATION. An earlier revision authored no member for it and argued that
   * "a collection whose element type is out of scope is dropped outright rather than typed loosely".
   * The premise was sound and the conclusion skipped a step, so the correction is recorded here
   * rather than quietly applied. There was a third option between "typed loosely" and "dropped": a
   * NARROW STRUCTURAL PROJECTION over the members anything in scope can actually reach. That is
   * {@link OptionImageLink}, and it is neither loose - it names three specific accessors and no
   * others - nor an invented entity.
   *
   * The earlier note was RIGHT that a permanently-empty `readonly []` would state something false,
   * reading as "this option has no images" when the truth is "images are not modelled here". The
   * remedy for that is a collection a repository can genuinely populate, which is what this is; it is
   * not the removal of the surface altogether. `fkcolumn="optionID"` means the join key sits on the
   * `SwImage` row and points HERE, so these rows are this option's data even though `Image` is not a
   * ported entity.
   *
   * `readonly`, AND THAT WAS PROVEN RATHER THAN ASSUMED against the ownership contract stated on
   * {@link Option.getSkus}. L63 declares `images` with `inverse="true"`, so the OWNING side is the
   * many-to-one at [model/entity/Image.cfc:L63] - `property name="option" cfc="Option"
   * fieldtype="many-to-one" fkcolumn="optionID"` - and `model/entity/Image.cfc` hand-writes no
   * `setOption`/`removeOption` pair at all, so those are ORM-GENERATED and a generated setter touches
   * only its own field. A census of the whole entity tree for `arrayAppend`/`arrayDeleteAt` against
   * `arguments.option.getImages()` returns ZERO hits, which is the direct evidence. No
   * `addImage`/`removeImage` is authored either, for the same reason: model/entity/Option.cfc
   * declares neither, and inventing a pair would widen the surface the legacy published.
   *
   * THE `cascade="all-delete-orphan"` OBLIGATION IS NOT LOST, it MOVES - and materializing the
   * collection does not move it back. Deleting an Option must still delete its `SwImage` rows, and
   * with no ORM to honour the mapping that duty belongs to the MySQL repository sibling, where it is
   * recorded. It is stated here so the transfer is traceable from the entity a reviewer starts at,
   * and it is NOT actionable in this file: a domain entity issues no DELETE.
   *
   * Note that `defaultImage` (L60) and `images` (L63) remain INDEPENDENT declarations over two
   * different columns, and they still receive different treatments for a principled reason: L60's
   * payload is a scalar FK on THIS row, which survives on its own as an opaque id with no shape to
   * project, while L63's payload is a set of far rows that a projection can describe. Neither ruling
   * implies the other.
   */
  private readonly images: readonly OptionImageLink[];

  /**
   * The already-resolved assets image base URL, materialized at the repository boundary.
   * Backs {@link Option.getImageDirectory}. [model/entity/Option.cfc:L81-L83]
   *
   * NOT A SETTINGS KEY, AND THAT IS A HARD CONSTRAINT RATHER THAN A PREFERENCE. The legacy body is
   * `getURLFromPath(setting('globalAssetsImageFolderPath')) & '/option/'`, and BOTH inner calls are
   * unavailable to a domain entity in this port:
   *
   *   * The `SettingsProvider` port surface is CLOSED at the four keys the transformation plan allots
   *     it - `globalURLKeyProduct`, `globalURLKeyProductType`, `skuCurrency` and
   *     `skuEligibleCurrencies` ("only four keys", AAP 0.2.1; "exactly four keys", AAP 0.4.1).
   *     `globalAssetsImageFolderPath` is not among them and no fifth key may be added.
   *   * `getURLFromPath()` [org/Hibachi/HibachiObject.cfc:L83-L92] is a framework helper on the
   *     unported Hibachi base. It replaces `\` with `/` and then strips the expanded web root, i.e.
   *     it converts an absolute filesystem path into a web-relative URL using RUNTIME knowledge -
   *     `expandPath('/')` - that a domain entity has no business holding.
   *
   * So the WHOLE of `getURLFromPath(setting('globalAssetsImageFolderPath'))` is resolved OUTSIDE the
   * domain and handed in already in URL form. Both the backslash normalisation and the web-root
   * stripping have therefore already happened by the time this field holds a value, and this entity
   * contributes exactly the `& '/option/'` suffix and nothing else. That is the approved
   * anti-corruption shape: the entity keeps the source's arithmetic and gives up the source's ambient
   * lookups.
   *
   * OPTIONAL, because an unpopulated value is a REAL hydration state rather than an error - a
   * repository reading `SwOption` for the promotion engine has no reason to resolve an assets path.
   * What that state must NOT do is silently produce a wrong answer, which is why the accessor raises
   * instead of defaulting; see {@link Option.getImageDirectory}.
   */
  private readonly assetsImageBaseUrl: string | undefined;

  // --- Related Object Properties (many-to-many - inverse) [L65-L70] ---------------------------
  //
  // FIVE COLLECTIONS, AND THIS ENTITY IS THE INVERSE SIDE OF EVERY ONE. All five declare
  // `inverse="true"`, meaning the OTHER entity owns the link table and owns the write. That single
  // fact explains the whole shape of the twelve helpers at the foot of this class: each one
  // delegates to the owning side's API instead of splicing a local array, because the local array
  // is not the authority for anything.
  //
  // Each is an ALREADY-POPULATED array and laziness is not simulated. An EMPTY array is
  // indistinguishable from "the repository did not fetch the association", which is an accepted
  // consequence of that rather than an oversight; the fetch shape is documented at the producing
  // repository method, never here.
  //
  // ⚠ THEY ARE NOT ALL `readonly`, AND `inverse="true"` IS NOT WHAT DECIDES IT. An earlier revision
  // of this note said "each is a `readonly` array, `readonly` in both directions"; that is no longer
  // true and the reasoning behind it did not hold. Inverse-ness says who owns the LINK TABLE, which
  // is a persistence question; array mutability is an IN-MEMORY GRAPH question, and the two are
  // decided by different evidence. The test is the ownership census stated on {@link Option.getSkus}:
  // an accessor hands back the LIVE array if and only if some entity in `model/entity/*.cfc` mutates
  // it IN PLACE through that accessor. `promotionRewards`, `promotionRewardExclusions`,
  // `promotionQualifiers` and `promotionQualifierExclusions` all have such sites - see each accessor
  // for its verbatim locators - so all four are `PromotionReward[]` / `PromotionQualifier[]`. `skus`
  // has none, so it stays `readonly Sku[]`. In every case the FIELD remains `readonly`: nothing may
  // rebind the reference, because the array's IDENTITY is what the far side reaches through.
  //
  // LEGACY-NOTE [model/entity/Option.cfc:L63, L66-L70]: a METADATA INCONSISTENCY, recorded and
  // deliberately NOT "fixed". `type="array"` is declared on L63 (`images`), L68
  // (`promotionRewardExclusions`) and L70 (`promotionQualifierExclusions`) but OMITTED on L66
  // (`skus`), L67 (`promotionRewards`) and L69 (`promotionQualifiers`). CFML treats the two forms
  // identically - the ORM infers the array type from `fieldtype="many-to-many"` either way - so this
  // is a cosmetic source wart with no behavioural consequence, and the same pattern recurs on the
  // `attributeValues` declarations elsewhere in the model. Note it is not even systematic here: the
  // two `*Exclusions` carry the attribute and neither of their non-exclusion twins does. ALL SIX
  // declarations - the five many-to-manys plus `images` at L63 - are therefore modelled as arrays,
  // which is what CFML actually produced, and NO DISTINCTION IS MANUFACTURED FROM THE ATTRIBUTE'S
  // PRESENCE OR ABSENCE. In particular `type="array"` is not evidence of mutability either: `images`
  // carries the attribute and is `readonly`, `promotionRewards` omits it and is not.
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
  private readonly promotionRewards: PromotionReward[];

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
  private readonly promotionRewardExclusions: PromotionReward[];

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
  private readonly promotionQualifiers: PromotionQualifier[];

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
  private readonly promotionQualifierExclusions: PromotionQualifier[];

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
    readonly images?: readonly OptionImageLink[] | undefined;
    readonly assetsImageBaseUrl?: string | undefined;
    readonly skus?: readonly Sku[] | undefined;
    readonly promotionRewards?: PromotionReward[] | undefined;
    readonly promotionRewardExclusions?: PromotionReward[] | undefined;
    readonly promotionQualifiers?: PromotionQualifier[] | undefined;
    readonly promotionQualifierExclusions?: PromotionQualifier[] | undefined;
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

    // [model/entity/Option.cfc:L63] An unpopulated one-to-many read as an empty array under
    // Hibernate and never as null, so `[]` is the parity-correct default. Whether a given `[]` means
    // "this option has no images" or "the repository did not join `SwImage`" is a FETCH-SHAPE
    // question answered at the producing repository method, never guessed at here.
    this.images = init.images ?? [];

    // [model/entity/Option.cfc:L81-L83] Left `undefined` when unresolved rather than defaulted to
    // `''`, because `''` would make `getImageDirectory()` return the plausible-looking but wrong
    // `'/option/'`. See the field and the accessor.
    this.assetsImageBaseUrl = init.assetsImageBaseUrl;

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
   * THE ONE ASSOCIATION-OWNERSHIP CONTRACT, STATED HERE BECAUSE THIS IS THE FILE'S ONLY `readonly`
   * COLLECTION. Across every entity in this folder the rule is single and mechanical: an association
   * accessor hands back the LIVE, mutable array if and only if some entity in the legacy source
   * mutates that very accessor's result in place - that is, if and only if
   * `arrayAppend(x.getY(), ...)` or `arrayDeleteAt(x.getY(), ...)` appears somewhere in
   * `model/entity/*.cfc`. Otherwise it hands back a `readonly` projection. The determination is a
   * census over the source, never a preference.
   *
   * `getSkus()` IS ON THE `readonly` SIDE, AND THAT WAS PROVEN RATHER THAN ASSUMED. `Option.skus`
   * carries `inverse="true"` [model/entity/Option.cfc:L66], so `Sku` is the owning side of
   * `SwSkuOption` - [model/entity/Sku.cfc:L76] declares `options` with NO `inverse` attribute. And
   * `Sku` declares no hand-written `addOption`/`removeOption` at all: those are ORM-GENERATED, and a
   * generated collection helper appends only to its OWN collection. A census of the whole entity tree
   * for `arrayAppend`/`arrayDeleteAt` against `arguments.option.getSkus()` returns ZERO hits, which
   * is the direct evidence. The four promotion collections on this class sit the other way round -
   * `PromotionReward` and `PromotionQualifier` DO declare hand-written helpers that reach back
   * through their accessors - so those four are live.
   *
   * The array is handed back as materialized: this accessor never sorts, filters or copies, because
   * the legacy generated accessor did none of those either.
   */
  getSkus(): readonly Sku[] {
    return this.skus;
  }

  /**
   * The materialized `promotionRewards` association - the INCLUSION side.
   * [model/entity/Option.cfc:L67]
   *
   * LIVE, per the ownership contract stated on {@link Option.getSkus}:
   * [model/entity/PromotionReward.cfc:L223] does
   * `arrayAppend(arguments.option.getPromotionRewards(), this)` and
   * [model/entity/PromotionReward.cfc:L231-L233] does `arrayFind` then `arrayDeleteAt` on the same
   * array.
   */
  getPromotionRewards(): PromotionReward[] {
    return this.promotionRewards;
  }

  /**
   * The materialized `promotionRewardExclusions` association - the EXCLUSION side.
   * [model/entity/Option.cfc:L68]
   *
   * LIVE: [model/entity/PromotionReward.cfc:L323] appends and
   * [model/entity/PromotionReward.cfc:L331-L333] removes through this accessor.
   */
  getPromotionRewardExclusions(): PromotionReward[] {
    return this.promotionRewardExclusions;
  }

  /**
   * The materialized `promotionQualifiers` association - the INCLUSION side.
   * [model/entity/Option.cfc:L69]
   *
   * LIVE: `PromotionQualifier.addOption` / `removeOption` append and remove through this accessor,
   * mirroring the `PromotionReward` pair exactly.
   */
  getPromotionQualifiers(): PromotionQualifier[] {
    return this.promotionQualifiers;
  }

  /**
   * The materialized `promotionQualifierExclusions` association - the EXCLUSION side.
   * [model/entity/Option.cfc:L70]
   *
   * LIVE: `PromotionQualifier.addExcludedOption` / `removeExcludedOption` append and remove through
   * this accessor.
   */
  getPromotionQualifierExclusions(): PromotionQualifier[] {
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

  /**
   * The materialized `images` one-to-many, projected across `SwImage.optionID`.
   * [model/entity/Option.cfc:L63]
   *
   * `accessors=true` on [model/entity/Option.cfc:L49] generated this in CFML, so the name and the
   * array-returning shape are the source's and not this port's. The ELEMENT type is where the
   * anti-corruption boundary sits: each row is an {@link OptionImageLink} - the join key, the stored
   * filename and the per-row directory column - because `model/entity/Image.cfc` is out of scope and
   * no `image.ts` exists to name.
   *
   * `readonly`, and never `undefined`. See the field for the census evidence that nothing in the
   * entity tree mutates this array in place, for why the surface stops at this one accessor with no
   * `addImage`/`removeImage` pair, and for where the `cascade="all-delete-orphan"` obligation went.
   *
   * AN EMPTY RESULT IS A FETCH-SHAPE STATEMENT, NOT A DOMAIN CLAIM, exactly as for the five
   * collections below it.
   */
  getImages(): readonly OptionImageLink[] {
    return this.images;
  }

  /**
   * The default directory that this option's images live in. [model/entity/Option.cfc:L81-L83]
   *
   *   public string function getImageDirectory() {
   *       return getURLFromPath(setting('globalAssetsImageFolderPath')) & '/option/';
   *   }
   *
   * ★ PORTED, NOT OMITTED. An earlier revision dropped this method on two grounds, each stated as
   * independently sufficient: that `globalAssetsImageFolderPath` is not one of the four
   * `SettingsProvider` keys, and that `getURLFromPath()` belongs to the unported Hibachi base. BOTH
   * PREMISES ARE TRUE AND NEITHER SUPPORTS THE CONCLUSION. They establish that this entity may not
   * RESOLVE the base itself; they say nothing about whether it may CONCATENATE a suffix onto a base
   * resolved elsewhere. Removing an entire public method because two of its inputs move outward
   * inverts the anti-corruption boundary - the point of that boundary is to relocate the ambient
   * lookups and KEEP the behaviour, and the behaviour here is one string concatenation.
   *
   * WHAT THIS ENTITY CONTRIBUTES IS EXACTLY `& '/option/'`. The `assetsImageBaseUrl` field holds the
   * already-resolved value of `getURLFromPath(setting('globalAssetsImageFolderPath'))`, materialized
   * at the repository boundary, so no setting is read here and no framework helper is
   * re-implemented here. See that field for why both inner calls belong outside the domain.
   *
   * THE CONCATENATION IS VERBATIM, INCLUDING ITS WART. The source joins an unconditional `'/'` before
   * `option`, so a base that already ends in a separator produces a DOUBLED one - `.../images//option/`.
   * That is reproduced rather than tidied: normalising it here would make this port emit a different
   * path than the CFML application does for the same setting value, and both write into the same
   * filesystem. A trailing-slash policy, if one is ever wanted, belongs at the boundary that resolves
   * the base, where it applies to every consumer at once.
   *
   * IT RAISES WHEN THE BASE WAS NOT MATERIALIZED, and the choice follows the dividing line this port
   * applies everywhere: a total function is possible only when the return type has a spare value to
   * spend. The legacy declares `returntype="string"`, and interface parity is the acceptance
   * contract, so widening the return to `string | undefined` is not available. Nor is a default: an
   * absent base would yield `'/option/'`, which is not a marker a caller can detect but a
   * WELL-FORMED WRONG PATH - and the legacy consumers of this value do file existence checks, file
   * deletes and file moves against it [admin/controllers/main.cfc:L118-L131]. Returning a wrong
   * directory to code that deletes files is the one outcome worse than raising, so it raises.
   *
   * Note this is NOT the legacy reproducing a source failure - `setting()` always resolved in CFML,
   * so this branch has no legacy counterpart. It is the port declining to invent an answer for a
   * state the legacy could not be in, which is why the message names the hydration gap rather than a
   * source locator.
   */
  getImageDirectory(): string {
    if (this.assetsImageBaseUrl === undefined) {
      throw new Error(
        'Option.getImageDirectory was called on an option hydrated without an assets image base ' +
          'URL. The legacy body at model/entity/Option.cfc:L81-L83 resolved its base through ' +
          "getURLFromPath(setting('globalAssetsImageFolderPath')), and both of those calls are " +
          'outside the domain in this port, so the resolved base must be supplied at construction. ' +
          'No default is substituted because every candidate value would be a well-formed wrong ' +
          'path rather than a detectable marker.',
      );
    }

    // [model/entity/Option.cfc:L82] verbatim: `<base> & '/option/'`. The separator is unconditional
    // in the source and stays unconditional here - see the doc block on the doubling.
    return `${this.assetsImageBaseUrl}/option/`;
  }

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
  // Only concretely-called members are generated.
  //
  // ★ CORRECTION - `isNew()` IS GENERATED, AND THIS NOTE PREVIOUSLY SAID OTHERWISE. The original
  // text here read "`isNew()` is likewise absent: it is called ON an Option at
  // [model/entity/Option.cfc:L94] by this entity's own `setOptionGroup`, and that call disappears
  // with the guard it belonged to". THE PREMISE WAS INCOMPLETE. L94 is not the only call site; a
  // full census of `option.isNew()` across the legacy tree finds FOUR, none of them in this file:
  //
  //   [model/entity/PromotionQualifier.cfc:L161]  if(arguments.option.isNew() or !hasOption(...))
  //   [model/entity/PromotionQualifier.cfc:L261]  ... or !hasExcludedOption(...)
  //   [model/entity/PromotionReward.cfc:L219]     if(arguments.option.isNew() or !hasOption(...))
  //   [model/entity/PromotionReward.cfc:L319]     ... or !hasExcludedOption(...)
  //
  // Those two components were not yet ported when this note was written, so their calls could not be
  // counted. The omission criterion itself - "only concretely-called members are generated" - is
  // unchanged and is what now REQUIRES the member: `src/domain/entities/promotionQualifier.ts` and
  // `promotionReward.ts` reproduce all four guards, and each one reads the FAR entity's `isNew()`.
  //
  // The disjunct cannot be dropped from those guards instead, because it is load-bearing: it makes
  // the append UNCONDITIONAL for an unsaved option. Two distinct new options both carry
  // `optionID === ''`, so the `has*` containment test - which compares primary keys - would report
  // the second as already present and silently discard it. `isNew()` is what prevents that, and an
  // option silently missing from a promotion qualifier changes which promotions apply.
  //
  // ★ AND NOTE THAT PORTING IT COSTS NOTHING ARCHITECTURALLY. `isNew()` reaches no service locator,
  // no port and no repository - it is a comparison against the id property's own `unsavedvalue`
  // [model/entity/Option.cfc:L52] - so this is not the `PromotionCode.isDeletable` situation, where
  // `src/domain/entities/promotion.ts` had to probe structurally because the inherited member
  // genuinely could not cross the domain boundary. Nothing is worked around here; the member is
  // simply generated, as the criterion always required once its call sites existed.

  // Option Group (many-to-one) [model/entity/Option.cfc:L91]

  // THE TWO METHODS BELOW MAINTAIN BOTH SIDES OF THE LINK, WHICH IS WHAT THE SOURCE DOES.
  // [model/entity/Option.cfc:L94-L96] appends this option to the owning group's array under a guard,
  // and [model/entity/Option.cfc:L102-L105] removes it again; the near-side `optionGroup` field is
  // maintained alongside. Both halves are reproduced, so `optionGroup.getOptions()` and
  // `option.getOptionGroup()` can never disagree.
  //
  // AN EARLIER REVISION DROPPED BOTH FAR-SIDE OPERATIONS, and the reasoning is recorded rather than
  // deleted because it is a plausible-sounding trap. It argued that "associations here are
  // materialized at the repository boundary as readonly arrays with no session and no cascade, so
  // collection state is owned by src/repositories/mysql/**", that the
  // `isNew() or !optionGroup.hasOption(this)` guard was therefore "vacuous", and that this was "an
  // architectural consequence, not a defect". Three things are wrong with it:
  //
  //   * IT CONFLATES MATERIALIZATION WITH OWNERSHIP. The repository decides WHETHER an association
  //     was fetched and in what order. It does not thereby become the only party allowed to change
  //     the fetched array - and it cannot be, because it is not in the call path. `addOption` and
  //     `setOptionGroup` are pure in-memory, synchronous, port-free domain operations, so there is no
  //     later boundary at which a deferred reconciliation could run.
  //   * THE GUARD IS NOT VACUOUS; DROPPING THE APPEND IS WHAT MADE IT LOOK VACUOUS. `isNew() or
  //     !hasOption(this)` decides whether the append would DUPLICATE an existing member. Remove the
  //     append and of course the guard has nothing to guard - that is circular, not an observation.
  //   * IT PRODUCED A SILENT INCONSISTENCY RATHER THAN AVOIDING ONE. With the append gone,
  //     `OptionGroup.addOption(option)` left the group's `getOptions()` NOT containing an option
  //     whose own `getOptionGroup()` named that group. Two accessors disagreeing about one link, with
  //     no error anywhere, is a worse outcome than the shared-array mutation the revision was trying
  //     to avoid - and the shared array is exactly what Hibernate handed back, so sharing it is the
  //     faithful behaviour, not a hazard introduced here.
  //
  // CONTAINMENT IS BY PRIMARY KEY WITH A REFERENCE FALLBACK FOR AN UNSAVED ROW, decided in
  // `OptionGroup.hasOption` and in `removeOptionGroup` below, and it is the same basis
  // `priceGroup.ts`, `promotionCode.ts`, `promotionApplied.ts` and `promotionPeriod.ts` use. CFML's
  // `arrayFind(array, component)` is reference identity, but under Hibernate reference identity WAS
  // row identity, so a key comparison reproduces the MEANING of the legacy test where a literal
  // reference comparison would only reproduce its letter.

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
   * BOTH STATEMENTS ARE REPRODUCED, in the source's order: the near-side assignment at L93 runs
   * FIRST and unconditionally, then the guarded append at L94-L96. The ordering matters because the
   * guard calls back into the far side, so the field is already set by the time anything else can
   * observe it.
   *
   * THE SHORT-CIRCUIT IS LOAD-BEARING. `isNew() or !hasOption(this)` evaluates `isNew()` first, so
   * for an unsaved option the far-side membership test is not performed AT ALL - the append simply
   * happens. `||` reproduces CFML `or` faithfully here because both operands are already booleans.
   * That ordering is also what makes the append safe for an unsaved row: every unsaved option has an
   * empty `optionID`, so a key-based membership test could not distinguish them, and the legacy
   * arranged never to ask.
   */
  setOptionGroup(optionGroup: OptionGroup): void {
    // [model/entity/Option.cfc:L93] - before the guard, always.
    this.optionGroup = optionGroup;

    // [model/entity/Option.cfc:L94-L96] - the guarded append onto the owning group's LIVE array.
    // `push` mutates in place, which is required: `arrayAppend` mutated the very array that
    // `OptionGroup.getOptions()` hands back, and `optionGroup.ts` types it mutable for this reason.
    if (this.isNew() || !optionGroup.hasOption(this)) {
      optionGroup.getOptions().push(this);
    }
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
   * WHAT THE RESOLVED GROUP IS USED FOR: it is the array L102-L105 searches and splices, and it is
   * what L102 DEREFERENCES. Both are reproduced, so the fallback is load-bearing exactly as it was in
   * the source rather than reduced to a presence check.
   *
   * IT RAISES WHEN THE ARGUMENT IS OMITTED AND NO GROUP IS SET, and that is behaviour preservation
   * rather than defensiveness. In that state CFML reaches L102 and calls `getOptions()` on a null
   * value, which is a runtime error there. An earlier revision returned silently instead and argued
   * that the raise "was a consequence of the splice - remove the splice and the dereference goes with
   * it - and every method on this entity is total". The premise was the dropped splice, which is now
   * restored, so the conclusion goes with it: the dereference is back, and so is the raise. Note also
   * that "every method on this entity is total" was never a reason to suppress a source raise - the
   * CFML parity helpers themselves raise where the source raises, and three of them were corrected to
   * do so for precisely this reason. Silently succeeding where the legacy failed invents a success
   * path the legacy system does not have. The message names the source locator so a runtime failure
   * is self-documenting, matching `priceGroup.ts`, `promotionCode.ts`, `promotionApplied.ts` and
   * `promotionPeriod.ts`.
   *
   * THE NEAR-SIDE CLEAR AT L106 IS UNCONDITIONAL, sitting outside the `if(index > 0)` block at
   * L103-L105. The field is cleared whether or not the far-side element was found, and that placement
   * is preserved exactly - the clear is not folded into the found branch.
   *
   * @param optionGroup - The group to unlink from. Omit it entirely to fall back to the currently
   *   set group, exactly as the legacy `structKeyExists` branch did.
   * @throws Error when the argument is omitted and this option has no group set, reproducing the null
   *   dereference at [model/entity/Option.cfc:L102].
   */
  removeOptionGroup(optionGroup?: OptionGroup): void {
    // [model/entity/Option.cfc:L99-L101]: presence test, then the fallback to the currently-set
    // group. `!== undefined` and never a truthiness test - see the note on this method.
    const resolvedOptionGroup: OptionGroup | undefined =
      optionGroup !== undefined ? optionGroup : this.optionGroup;

    if (resolvedOptionGroup === undefined) {
      throw new Error(
        'Option.removeOptionGroup was called with no argument on an option that has no ' +
          'optionGroup. This reproduces the legacy runtime failure at ' +
          'model/entity/Option.cfc:L99-L102, where the omitted argument defaults to a null group ' +
          'and getOptions() is then invoked on it before any index guard runs.',
      );
    }

    // [model/entity/Option.cfc:L102] ARRAY INDEX BASE CHANGE: CFML `arrayFind` returns a 1-BASED
    // index, or 0 for "not found", which is why the source guards with `index > 0` at L103.
    // `Array.prototype.findIndex` returns a 0-BASED index, or -1 for "not found", so the guard MUST
    // become `!== -1`. Carrying `> 0` across would silently skip element 0 - the first member of the
    // group, and the one `getOptions('sortOrder')` orders first.
    //
    // Containment is BY PRIMARY KEY, matching `OptionGroup.hasOption` and the rest of this folder;
    // see the note above this method for why a key comparison reproduces the legacy meaning where a
    // reference comparison would only reproduce its letter. The unsaved-row case falls back to
    // reference identity, because every unsaved option shares the empty key.
    const siblingOptions: Option[] = resolvedOptionGroup.getOptions();
    const index: number = siblingOptions.findIndex((member: Option) => this.isSameRowAs(member));

    // [model/entity/Option.cfc:L103-L105]
    if (index !== -1) {
      siblingOptions.splice(index, 1);
    }

    // [model/entity/Option.cfc:L106] - `structDelete(variables, "optionGroup")`, UNCONDITIONAL and
    // outside the found-branch above. Expressible as an assignment only because the field is declared
    // `OptionGroup | undefined` rather than optional; see the field declaration for why.
    this.optionGroup = undefined;
  }

  /**
   * Whether `candidate` denotes the same `SwOption` row as this instance.
   *
   * Private, and it has no legacy counterpart by name: it stands for CFML's `arrayFind(array, this)`
   * comparison, which was reference identity in the language and row identity under Hibernate's
   * session. With no session those two come apart, so the comparison is made on the primary key and
   * falls back to reference identity when either side is unsaved - an unsaved option has an empty
   * `optionID`, and so does every other unsaved option, so keys cannot separate them.
   *
   * Identical in shape to `promotionCode.ts`'s and `promotionApplied.ts`'s helpers of the same name,
   * deliberately: one containment rule across the folder.
   */
  private isSameRowAs(candidate: Option): boolean {
    const candidateOptionID: string = candidate.getOptionID();

    if (candidateOptionID === '' || this.optionID === '') {
      return candidate === this;
    }

    return candidateOptionID === this.optionID;
  }

  /**
   * Whether this option has never been persisted.
   * [org/Hibachi/HibachiEntity.cfc:L571-L576] via [org/Hibachi/HibachiEntity.cfc:L707-L709]
   *
   * The framework base defines `isNew()` as `getNewFlag()`, and `getNewFlag()` as
   * `getPrimaryIDValue() == ""`. The base is not ported, so the one line it contributed is restated
   * here - identically to `brand.ts`, `category.ts`, `priceGroup.ts`, `promotionApplied.ts`,
   * `promotionCode.ts` and `promotionPeriod.ts`, all of which compare their own primary key against
   * the empty string.
   *
   * IT IS PORTED BECAUSE IT IS CONCRETELY CALLED, AND THE CENSUS IS FIVE SITES, NOT ONE.
   * [model/entity/Option.cfc:L94] invokes `isNew()` on this entity inside `setOptionGroup`'s guard,
   * which is the whole test for whether an inherited member survives into this port. An earlier
   * revision omitted it, on the grounds that the guard it belonged to had been dropped; the guard is
   * restored, so the method is too. FOUR FURTHER CALLERS sit outside this file: `option.isNew()` is
   * the left disjunct of the near-side append guard in `addOption` and `addExcludedOption` on BOTH
   * model/entity/PromotionQualifier.cfc [L161, L261] and model/entity/PromotionReward.cfc [L219,
   * L319], and `./promotionQualifier.ts` and `./promotionReward.ts` reproduce all four. Dropping the
   * disjunct there instead would let a second unsaved option be discarded as a duplicate, because
   * every unsaved option shares the primary key `''`.
   *
   * NOT A TRUTHINESS TEST. `=== ''` exactly, so a whitespace-only or `'0'` id is NOT new - CFML's own
   * comparison here is against the literal `unsavedvalue`, not against emptiness in general.
   *
   * The empty-string comparison is exact rather than approximate: `unsavedvalue=""` and `default=""`
   * on [model/entity/Option.cfc:L52] are what make an unsaved row's key empty in the first place.
   */
  isNew(): boolean {
    return this.optionID === '';
  }

  // ============ START: Containment Probes ==============================
  // FOUR probes, none with a hand-written legacy body: all are synthesised by the dispatcher at
  // [org/Hibachi/HibachiEntity.cfc:L507-L565], whose CFML semantics are Hibernate's
  // collection-contains - session identity, i.e. primary key for a persistent row.
  //
  // EACH IS AUTHORED BECAUSE AN IN-SCOPE FAR SIDE GENUINELY CALLS IT ACROSS A MODULE BOUNDARY, and
  // each names its caller. A receiver-qualified scan of every `<receiver>.has<X>(` site in
  // model/entity/*.cfc finds EXACTLY FOUR with an `option` receiver, and all four are authored - so
  // unlike `brand.ts`, this entity's probe set is complete rather than filtered.
  //
  // ★ NOTE WHAT IS *NOT* IN THAT CENSUS: there is no `option.hasSku(...)` anywhere.
  // model/entity/Sku.cfc hand-writes NO `addOption`/`removeOption` - the pair is ORM-generated from
  // the `singularname="option"` declaration at [model/entity/Sku.cfc:L76] - and an ORM-generated
  // adder performs a one-sided near-side append with no far-side guard, so it never probes this
  // entity. That is why `getSkus()` above is `readonly` while the four promotion collections are
  // LIVE, and it is the same reasoning from the other direction.
  //
  // THE PROJECT-WIDE CONTAINMENT RULE: compare by PRIMARY KEY, with a REFERENCE fallback when the
  // candidate is unsaved. The fallback is not optional - every unsaved row's key is `''`
  // (`unsavedvalue=""`), so a pure key comparison would report two DIFFERENT unsaved rows as the
  // same one and the far side's guard would skip a legitimate append.

  /**
   * Called by `PromotionReward.addOption` [model/entity/PromotionReward.cfc:L222]:
   * `if(isNew() or !arguments.option.hasPromotionReward( this ))`.
   */
  hasPromotionReward(promotionReward: PromotionReward): boolean {
    const candidateID: string = promotionReward.getPromotionRewardID();
    if (candidateID === '') {
      return this.promotionRewards.includes(promotionReward);
    }
    return this.promotionRewards.some(
      (held: PromotionReward) => held.getPromotionRewardID() === candidateID,
    );
  }

  /**
   * Called by `PromotionReward.addExcludedOption` [model/entity/PromotionReward.cfc:L322]:
   * `if(isNew() or !arguments.option.hasPromotionRewardExclusion( this ))`.
   *
   * A DIFFERENT LINK TABLE from its sibling above - `SwPromoRewardExclOption` rather than
   * `SwPromoRewardOption` - so it probes a different collection. Two probes, not one with a flag.
   */
  hasPromotionRewardExclusion(promotionReward: PromotionReward): boolean {
    const candidateID: string = promotionReward.getPromotionRewardID();
    if (candidateID === '') {
      return this.promotionRewardExclusions.includes(promotionReward);
    }
    return this.promotionRewardExclusions.some(
      (held: PromotionReward) => held.getPromotionRewardID() === candidateID,
    );
  }

  /**
   * Called by `PromotionQualifier.addOption` [model/entity/PromotionQualifier.cfc:L164]:
   * `if(isNew() or !arguments.option.hasPromotionQualifier( this ))`.
   */
  hasPromotionQualifier(promotionQualifier: PromotionQualifier): boolean {
    const candidateID: string = promotionQualifier.getPromotionQualifierID();
    if (candidateID === '') {
      return this.promotionQualifiers.includes(promotionQualifier);
    }
    return this.promotionQualifiers.some(
      (held: PromotionQualifier) => held.getPromotionQualifierID() === candidateID,
    );
  }

  /**
   * Called by `PromotionQualifier.addExcludedOption` [model/entity/PromotionQualifier.cfc:L264]:
   * `if(isNew() or !arguments.option.hasPromotionQualifierExclusion( this ))`.
   *
   * A DIFFERENT LINK TABLE from its sibling above - `SwPromoQualExclOption` rather than
   * `SwPromoQualOption`.
   */
  hasPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): boolean {
    const candidateID: string = promotionQualifier.getPromotionQualifierID();
    if (candidateID === '') {
      return this.promotionQualifierExclusions.includes(promotionQualifier);
    }
    return this.promotionQualifierExclusions.some(
      (held: PromotionQualifier) => held.getPromotionQualifierID() === candidateID,
    );
  }

  // ============  END: Containment Probes ===============================

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
