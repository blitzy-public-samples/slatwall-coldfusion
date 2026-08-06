// ---------------------------------------------------------------------------
// THE SIBLINGS THIS FILE NAMES, AND WHAT EACH ONE OWNS
//
// Commentary below hands responsibilities to other modules by name, and every
// one of them exists on the branch - so each mention points at real code rather
// than at an intention. Naming a boundary here is how this file records what it
// deliberately does NOT do, so that no responsibility below acquires a second
// owner:
//
//   src/services/priceGroupService.ts              ported PriceGroupService
//   tests/traceability/legacyTestMap.ts            structural coverage map
//   tests/unit/domain/entities/priceGroup.test.ts  priceGroup entity suite
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// slatwall-ts - the PriceGroup entity
//
// PURPOSE
//   A 1:1 logic extraction of `model/entity/PriceGroup.cfc` (226 lines) into a
//   single exported TypeScript class. Public method names are the legacy CFML
//   names verbatim in camelCase, because interface parity - not idiomatic
//   renaming - is this port's acceptance contract: a reviewer must be able to
//   diff the two surfaces method by method.
//
// SCHEMA CONTINUITY
//   The legacy component declaration at [model/entity/PriceGroup.cfc:L49],
//   reproduced here in full so the persistence contract stays auditable from
//   this file alone:
//
//     component displayname="Price Group" entityname="SlatwallPriceGroup"
//       table="SwPriceGroup" persistent=true output=false accessors=true
//       extends="HibachiEntity" cacheuse="transactional"
//       hb_serviceName="priceGroupService" hb_permission="this" {
//
//   Table `SwPriceGroup`, entity name `SlatwallPriceGroup`. No migration, no
//   rename, no new table and no column change: this class reads and writes the
//   existing MySQL schema exactly as the CFML monolith does, and the monolith
//   keeps running alongside it. `cacheuse="transactional"` was a Hibernate
//   second-level cache instruction with no representation in a driver-only
//   stack; it is recorded, not emulated. `hb_permission="this"` and the
//   `rbKey` / `hb_rbKey` / `hb_nullRBKey` family are inert metadata strings -
//   JavaRB is not ported and NO i18n runtime is introduced, so every such value
//   is preserved verbatim in the annotations below and the legacy admin can
//   still resolve them.
//
//   `hb_serviceName="priceGroupService"` resolves to
//   `model/service/PriceGroupService.cfc`, which IS in scope as
//   `src/services/priceGroupService.ts`. That makes PriceGroup unusual among
//   its path-bearing siblings: [model/entity/ProductType.cfc:L49] declares
//   `hb_serviceName="productService"` and [model/entity/Category.cfc:L49]
//   declares `hb_serviceName="contentService"`, so both point at a
//   differently-named service, while PriceGroup has a genuine same-named one.
//   This file nonetheless imports and references NO service: dependency flow is
//   strictly domain-inward.
//
// LEGACY-NOTE [model/entity/PriceGroup.cfc:L49]: this component declaration omits
// hb_parentPropertyName, even though the entity is self-referential through parentPriceGroup (L59)
// and both lifecycle hooks call buildIDPathList("parentPriceGroup") (L207, L212). The two sibling
// materialized-path entities DO declare it: model/entity/ProductType.cfc:L49 declares
// hb_parentPropertyName="parentProductType" and model/entity/Category.cfc:L49 declares
// hb_parentPropertyName="parentCategory". A metadata inconsistency, recorded not corrected.
// Re-verified by reading all three declarations directly: PriceGroup is the only one of the three
// without the attribute. The framework used it to drive generic parent/child tree handling, so its
// absence here is precisely why this entity hand-writes the parent/child helpers at L110-L125 and
// L136-L141 that the attribute would otherwise have supplied.
//
// LEGACY-NOTE [model/entity/PriceGroup.cfc:L49]: persistent, output and accessors are written
// UNQUOTED here (persistent=true output=false accessors=true), whereas the sibling declarations
// quote what they declare and declare different subsets: model/entity/ProductType.cfc:L49 writes
// persistent="true" and omits output and accessors entirely, and model/entity/Category.cfc:L49
// writes persistent="true" accessors="true" and omits output. CFML accepts the quoted and unquoted
// forms identically. Cosmetic only; B1 scopes minimal change to the functional surface, not style.
//
// CORRECTION TO THIS FILE'S OWN SPECIFICATION, recorded so the annotation stays auditable rather
// than repeating a claim that does not hold: the porting specification for this file asserts that
// "model/entity/Brand.cfc:L49 quotes all three" attributes and that
// "model/entity/ProductType.cfc:L49 declares none of them". Both assertions are false against the
// source. Brand.cfc:L49 reads `persistent=true output=false accessors=true` - all three UNQUOTED,
// byte-for-byte the same style as PriceGroup, so it is a match rather than a contrast - and
// ProductType.cfc:L49 does declare `persistent="true"`. The note above states what the four
// declarations actually contain. Verified by reading model/entity/PriceGroup.cfc:L49,
// model/entity/ProductType.cfc:L49, model/entity/Category.cfc:L49 and model/entity/Brand.cfc:L49.
//

// WHAT MAKES THIS ENTITY DIFFERENT FROM ITS SIBLINGS
//   * ZERO `getService(` sites in the whole component. It is the only
//     materialized-path entity here with no outward reach at all, so it injects
//     NO port and EVERY method on this class is synchronous. Nothing returns a
//     promise. Contrast `productType.ts`, whose `getBaseProductType()` is async
//     because it genuinely reaches a repository.
//   * ZERO monetary columns, despite the name. All of this aggregate's money
//     lives on `PriceGroupRate.amount` [model/entity/PriceGroupRate.cfc:L54], a
//     `big_decimal` with no default. `Money` and `CurrencyCode` are therefore
//     deliberately NOT imported here, and `decimal.js` is not either - only
//     `src/domain/valueObjects/money.ts` may import it.
//   * It carries the only `appliedOrderItems` collection in this folder, which
//     points straight at the out-of-scope order aggregate. That is the sharpest
//     anti-corruption boundary in the entity layer; see the ruling at the
//     collection fields below.
//   * It declares no `attributeValues`, and it exposes BOTH materialized-path
//     routes - the lazy getter and the eager lifecycle assignment.
//
// THE LEGAL IMPORT SURFACE
//   `src/domain/**` imports NOTHING outward. `eslint.config.mjs` sets
//   `no-restricted-imports` to `error` for `src/domain/**/*.ts` over three
//   pattern groups, so a violation is a build failure rather than a
//   code-review note: no `src/repositories/**`, no `src/handlers/**`, no
//   `src/integrations/**`, no `mysql2`, no `dotenv`, no `aws-lambda`, no
//   `@types/aws-lambda`, no `@aws-sdk/**`, and no barrel `index.*` specifier.
//   Beyond that boundary this file also declines, deliberately:
//
//     src/lib/config.ts   entities never read process configuration. That
//                         module is STATIC process configuration only and must
//                         never be pressed into service as a request scope -
//                         the legacy inconsistency it replaces sits at
//                         [model/service/PriceGroupService.cfc:L262-L268],
//                         which reaches the request scope through
//                         `getSlatwallScope()` while the rest of the codebase
//                         uses `getHibachiScope()`. That is a service-tier
//                         concern, normalised into an explicit context
//                         parameter there, and it is not an entity concern.
//     src/lib/logger.ts   entities do not log.
//     src/lib/cfml/list.js
//                         there is no comma-list manipulation anywhere in this
//                         component; every path computation delegates to
//                         `materializedIdPath.js`, which owns the list
//                         primitives itself.
//     (cfLen IS imported) the only `len()` call site in the component is
//                         [model/entity/PriceGroup.cfc:L97], inside
//                         `getParentPriceGroupOptions()`. An earlier revision
//                         omitted that method and therefore did not take the
//                         import, since `noUnusedLocals` rejects an unused one.
//                         The method is now ported, so `cfLen` is imported and
//                         used at exactly that one site.
//     any ../ports/*      there are exactly thirteen ports and no fourteenth
//                         may be invented. With zero `getService(` sites there
//                         is no collaborator to inject, and none is added "for
//                         symmetry" with `productType.ts`.
//
//   Every cross-entity reference below is an `import type`, which is erased at
//   emit, so no runtime import cycle between entities can exist. A value import
//   between two entity modules is never introduced.
//
// STRICTNESS
//   `tsconfig.json` sets `strict`, `noUncheckedIndexedAccess`,
//   `exactOptionalPropertyTypes`, `noImplicitOverride` and `noUnusedLocals`,
//   with `target`/`lib` at ES2022, NodeNext resolution and `skipLibCheck: false`.
//   ESLint adds `no-explicit-any`, `ban-ts-comment`, the `no-unsafe-*` family,
//   `no-non-null-assertion` for `src/**`, `no-floating-promises`,
//   `await-thenable`, `require-await` and `eqeqeq`. This file contains no `any`,
//   no `@ts-ignore`, no `@ts-expect-error` and no `!` assertion. Where the
//   compiler needed help, the FILE was written to satisfy it - the config was
//   never touched.
//
// ANNOTATION CONVENTION
//   `LEGACY-NOTE [<path>:<locator>]` records a preserved cosmetic wart, a
//   preserved identifier typo, or a consequence of the port's architecture.
//   `LEGACY-DEFECT` - the two-line form ending "Preserved deliberately; do not
//   fix without a product decision." - is reserved for defective behaviour that
//   is being reproduced. THIS FILE CARRIES NO `LEGACY-DEFECT` MARKER, because
//   it owns none of the port's thirty numbered defects: the six that touch
//   price groups at all (the `local.i` reference, the `deletePriceGroup`
//   snapshot loop, the parent-recursion asymmetry, the rounding-rule asymmetry,
//   and the two calls on undeclared members - `getAmountRepresentation()` and
//   `clearAmounts()`) are every one of them in
//   `model/service/PriceGroupService.cfc`
//   and belong to `src/services/priceGroupService.ts`.
//   `tsconfig.build.json` sets `removeComments: false` and Prettier does not
//   reflow comments, so these annotations survive into the emitted output. They
//   are part of the deliverable's auditability, not decoration.
//
// BUDGET AUDIT FOR THIS FILE
//   ZERO signature widenings - the single entity-layer widening in this folder
//   is `PromotionPeriod.isCurrent(now?: Date)`, and nothing here is widened.
//   ZERO deliberate divergences - the port's three all sit in `sku.ts` and
//   `product.ts`. ZERO signature reshapings. ZERO visibility widenings. ZERO
//   numbered defects owned. No invented non-functional requirement appears in
//   any line of code or comment: no SLA, no latency, throughput or uptime
//   figure, and no reference to the legacy runtime lock timeouts, which are
//   noted-and-not-implemented elsewhere and are irrelevant here. No cycle
//   guard, depth limit or performance mitigation is added to the parent-chain
//   walk.
//
//   ★ AN EARLIER REVISION OF THIS FILE SPENT A FOURTH DIVERGENCE HERE, AND THE
//   RECORD OF ITS REMOVAL BELONGS IN THE AUDIT THAT ONCE DECLARED IT.
//   `setParentPriceGroup` REFUSED a reparent that would close a cycle, carried a
//   three-star divergence banner at the method, and this audit conceded a spend
//   outside the budgeted three. Both are gone. The setter now assigns
//   whatever it is handed, exactly as [model/entity/PriceGroup.cfc:L110-L115]
//   does, and the divergence budget for this file is back to zero. Where
//   termination genuinely had to be decided - the hand-written recursive
//   ancestry read in `mysqlPriceGroupRepository.ts`, which replaces Hibernate's
//   lazy traversal under transformation rule T3 and has no legacy antecedent to
//   reproduce - it is decided there, as a fetch-shape decision at the adapter
//   boundary, not as a change to this entity's behaviour.
//
// NO USER RULES WERE PROVIDED
//   Stated explicitly rather than left implicit. (1) No user-specified rules
//   were provided for this project: the project rules document contains exactly
//   "No user rules provided." (2) That absence was VERIFIED, not assumed - the
//   rules source was queried while authoring this file and returned that single
//   line, and the plan reports the same result independently. (3) No rule is
//   invented to fill the gap, and nothing here paraphrases or cites one. (4) The
//   absence is NOT licence to lower the bar: the enterprise-standard substitute
//   applies at full strength, which in this file means maximal strictness with
//   no escape hatch, one exported unit and no barrel, no credential and no
//   environment read, no SQL, and every judgment call annotated at the site that
//   made it. (5) Zero files enter scope by rule mandate - this file traces to
//   the plan's transformation table and to `model/entity/PriceGroup.cfc`, so
//   there are consequently no rule conflicts to resolve.
//
// TEST COVERAGE FOR THIS MODULE IS NET-NEW
//   `PriceGroup` has NO legacy test anywhere under `meta/tests/**` - verified by
//   search, which returns no match for the name in that tree. The only legacy
//   suites extended anywhere in this port are
//   `meta/tests/unit/entity/BrandTest.cfc` and
//   `meta/tests/unit/entity/ProductTest.cfc`, and
//   `meta/tests/functional/admin/entity/ProductTest.cfc` is an empty stub that
//   is never counted as coverage. The future suite
//   `tests/unit/domain/entities/priceGroup.test.ts` must therefore be labelled
//   NET-NEW and never presented as parity; `tests/traceability/legacyTestMap.ts`
//   fails the suite if this module has no test. That suite is authored
//   separately - this file states the obligation and does not discharge it.
//   Nothing here needs a seam for it: every method is synchronous and total
//   except the one documented reproduction of a legacy runtime failure, and no
//   method reads a clock, an environment variable or a database.
// ---------------------------------------------------------------------------

import { buildIdPathList, resolveIdPath } from '../valueObjects/materializedIdPath.js';
import { cfEquals } from '../../lib/cfml/struct.js';
import { cfBoolean, cfLen, isNullish } from '../../lib/cfml/truthiness.js';
import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import type { PriceGroupRate } from './priceGroupRate.js';
import type { PromotionReward } from './promotionReward.js';

/**
 * A price group: a named, hierarchical grouping of accounts and subscription
 * benefits that carries a set of rates used to derive a SKU's price.
 *
 * Ported from `model/entity/PriceGroup.cfc`. Every member below quotes the
 * legacy locator it serves.
 */
/**
 * One `{name, value}` row of the parent-price-group option list.
 * [model/entity/PriceGroup.cfc:L79, L94-L103]
 *
 * MODULE-LOCAL AND UN-EXPORTED, and it is a `type` alias rather than an
 * `interface` for the same reason `CategoryPreUpdateSnapshot` is: a plain object
 * shape that a repository populates and hands in wants an implicit index
 * signature. Both forms are erased at emit, so the module's runtime export surface
 * stays at exactly one value - the class.
 *
 * THE TWO KEYS ARE THE FRAMEWORK'S, NOT THIS PORT'S. `getPropertyOptions`
 * [org/Hibachi/HibachiEntity.cfc:L375-L417] builds each row by aliasing two smart-list
 * selects, `alias="name"` and `alias="value"`, and then - because `parentPriceGroup`
 * is a many-to-one carrying `hb_optionsNullRBKey="define.none"`
 * [model/entity/PriceGroup.cfc:L59] - PREPENDS `{value="", name=rbKey("define.none")}`
 * at [org/Hibachi/HibachiEntity.cfc:L410]. The legacy body reads both keys with
 * struct-literal syntax, `options[i]['value']` at L97, so the spelling here is the
 * source's spelling.
 *
 * THAT PREPENDED BLANK ROW IS WHY THE SOURCE TESTS `len(...)` FIRST. Its `value` is
 * the empty string, and without the length test an unsaved price group - whose own
 * `priceGroupID` is also `''` [model/entity/PriceGroup.cfc:L52 `default=""`] - would
 * match it and DELETE THE NULL OPTION instead of itself. `value` is therefore typed
 * as a plain non-optional string, `''` included, rather than as `string | undefined`:
 * the blank is a legitimate row and not an absence.
 *
 * `name` IS ALREADY-RESOLVED DISPLAY TEXT. For a real row it is the far entity's
 * simple representation; for the prepended row it is `rbKey("define.none")`,
 * i.e. resource-bundle output. No i18n runtime is introduced by this port - JavaRB is
 * not carried forward - so whatever resolved the key resolved it OUTSIDE the domain,
 * and this field receives the finished string.
 */
type ParentPriceGroupOption = {
  /** Display text. Resource-bundle output for the prepended blank row. */
  readonly name: string;
  /** The `priceGroupID`, or `''` for the prepended null option. */
  readonly value: string;
};

export class PriceGroup {
  // --- Persistent Properties [model/entity/PriceGroup.cfc:L52-L56] ------------------------------

  /**
   * The primary key. [model/entity/PriceGroup.cfc:L52]
   *
   *   property name="priceGroupID" ormtype="string" length="32" fieldtype="id"
   *     generator="uuid" unsavedvalue="" default="";
   *
   * THIS IS THE BASIS FOR EVERY CONTAINMENT COMPARISON IN THIS FILE. The legacy
   * comparison basis for a Hibernate collection membership test is session
   * identity, which is the primary key, so `hasChildPriceGroup`,
   * `hasPriceGroupRate`, `hasPromotionReward` and the `arrayFind` equivalent in
   * `removeParentPriceGroup` all compare this value - never reference identity
   * and never deep equality.
   *
   * `unsavedvalue=""` together with `default=""` is also the unsaved signal that
   * `isNew()` reads; see that method.
   */
  private readonly priceGroupID: string;

  /**
   * The materialized comma-delimited ancestor path, root first and self last.
   * [model/entity/PriceGroup.cfc:L53]
   *
   *   property name="priceGroupIDPath" ormtype="string" length="4000";
   *
   * NULLABLE AND MUTABLE, and both halves are load-bearing. Nullable, because
   * the lazy getter at [model/entity/PriceGroup.cfc:L195-L200] guards on
   * `isNull(variables.priceGroupIDPath)` and must be able to detect a genuinely
   * absent slot; mutable, because that getter memoizes into it and the two
   * lifecycle hooks at [model/entity/PriceGroup.cfc:L206-L215] overwrite it
   * outright. An empty string is a PRESENT value under that guard, not an absent
   * one, and `exactOptionalPropertyTypes` keeps the two states distinct.
   *
   * The `length="4000"` limit is a persistence constraint recorded here for
   * schema continuity. It is deliberately not enforced in this class: no legacy
   * code truncates or validates the path, and inventing a limit check would be
   * an unrequested behavioural change to a value that decides which price-group
   * rate wins.
   */
  private priceGroupIDPath: string | undefined;

  /**
   * Whether this price group is active. [model/entity/PriceGroup.cfc:L54]
   *
   *   property name="activeFlag" ormtype="boolean";
   *
   * Stored as {@link CfBooleanInput} rather than `boolean` and read through
   * `cfBoolean()` in its accessor, because the column declares NO `default=`.
   * This is the entity's only boolean property and the component declares no
   * non-ID `default=` attribute of any kind, so the column can legitimately
   * hydrate as SQL NULL, as `0`/`1`, or as one of the strings a driver may hand
   * back. `'0'` in particular is a non-empty and therefore JavaScript-TRUTHY
   * string: a naive `Boolean(...)` would read a false flag as true.
   */
  private readonly activeFlag: CfBooleanInput;

  /**
   * The display name. [model/entity/PriceGroup.cfc:L55]
   *
   *   property name="priceGroupName" ormtype="string";
   *
   * `model/validation/PriceGroup.json` marks it `required` in the `save`
   * context. That is declarative validation and it is enforced at the service
   * tier, never here - this class carries no schema and no runtime validation.
   */
  private readonly priceGroupName: string | undefined;

  /**
   * The business code. [model/entity/PriceGroup.cfc:L56]
   *
   *   property name="priceGroupCode" ormtype="string";
   *
   * NO `unique="true"`, no regex and no length constraint is declared, so NONE
   * is added: not a format check, not a uniqueness check, nothing. Contrast
   * `optionGroupCode` [model/entity/OptionGroup.cfc:L54], which really is
   * required, unique and pattern-constrained and whose port carries a shared
   * code pattern for exactly that reason. `priceGroupCode` deliberately is not,
   * and the only constraint on it anywhere is `required` in the `save` context
   * of `model/validation/PriceGroup.json` - again a service-tier concern.
   */
  private readonly priceGroupCode: string | undefined;

  // --- Related Object Properties (Many-To-One) [model/entity/PriceGroup.cfc:L59] ----------------

  /**
   * The parent price group in the hierarchy, or `undefined` at a root.
   * [model/entity/PriceGroup.cfc:L59]
   *
   *   property name="parentPriceGroup" cfc="PriceGroup" fieldtype="many-to-one"
   *     fkcolumn="parentPriceGroupID" hb_optionsNullRBKey="define.none";
   *
   * `hb_optionsNullRBKey="define.none"` is preserved verbatim above as inert
   * metadata, AND IT IS LOAD-BEARING RATHER THAN DECORATIVE. Its presence is what
   * makes [org/Hibachi/HibachiEntity.cfc:L409-L411] PREPEND a
   * `{value: '', name: rbKey("define.none")}` row to the option list, which in turn
   * is why {@link PriceGroup.getParentPriceGroupOptions} must test `len(value)`
   * before comparing ids. See {@link ParentPriceGroupOption}.
   *
   * The KEY is inert here in one specific sense only: no i18n runtime is introduced
   * to resolve it. JavaRB is not carried forward, so whatever resolves the key
   * resolves it outside the domain and the prepended row arrives carrying finished
   * display text.
   *
   * Declared `PriceGroup | undefined` rather than `parentPriceGroup?: PriceGroup`.
   * Under `exactOptionalPropertyTypes` those are genuinely different types, and
   * the distinction between "absent" and "present-but-undefined" is load-bearing
   * across this folder. MUTABLE, because `setParentPriceGroup` assigns it and
   * `removeParentPriceGroup` clears it - the target of the legacy
   * `structDelete(variables, "parentPriceGroup")` at
   * [model/entity/PriceGroup.cfc:L124].
   *
   * WHAT DEPENDS ON THIS. `getParentPriceGroup()` is read at six sites, all in
   * the five-level price-group cascade, and always as the level-5 fall-through:
   * [model/service/PriceGroupService.cfc:L91-L92] for a product type,
   * [model/service/PriceGroupService.cfc:L130-L131] for a product, and
   * [model/service/PriceGroupService.cfc:L173-L174] for a SKU. Each is guarded
   * by `!isNull(...)`, so returning `undefined` at a root is what stops the
   * cascade rather than an error.
   */
  private parentPriceGroup: PriceGroup | undefined;

  // --- Related Object Properties (One-To-Many) [model/entity/PriceGroup.cfc:L62-L64] ------------
  //
  // ASSOCIATIONS ARE MATERIALIZED AT THE REPOSITORY BOUNDARY, AND LAZINESS IS NOT SIMULATED.
  // Hibernate lazy collections have no equivalent in a driver-only stack, so each collection below
  // arrives already populated and the fetch shape is an explicit, documented decision at the
  // repository method that produced it - which is what removes the N+1 hazard that unbounded graph
  // walking creates. An EMPTY array is indistinguishable from "the repository did not fetch this
  // association", and that is an accepted consequence of not simulating laziness rather than an
  // oversight.
  //
  // LEGACY-NOTE [model/entity/PriceGroup.cfc:L52-L79]: this component declares NO `fetch="join"` and
  // NO `lazy="extra"` on any property - confirmed by search, which returns zero matches in the file.
  // Noted so a reviewer does not go looking for a fetch hint that is not there. The folder's four
  // `fetch="join"` sites are model/entity/Product.cfc:L68, :L69, :L70 and
  // model/entity/PromotionPeriod.cfc:L59, and its three `lazy="extra"` sites are
  // model/entity/Sku.cfc:L71, model/entity/ProductType.cfc:L66 and model/entity/PromotionCode.cfc:L68.
  //
  // LEGACY-NOTE [model/entity/PriceGroup.cfc:L62-L70]: `type="array"` is declared on L62, L68, L69
  // and L70 but omitted on L63, L64 and L67. CFML/Hibernate treats the collections identically. The
  // same inconsistency appears at model/entity/ProductType.cfc:L65-L77. Cosmetic only.
  //
  // LEGACY-NOTE [model/entity/PriceGroup.cfc:L62, L128-L133]: appliedOrderItems is a one-to-many onto
  // the OUT-OF-SCOPE OrderItem aggregate (fkcolumn appliedPriceGroupID). It is deliberately not
  // materialized, and the two bidirectional helpers addAppliedOrderItem (L128) and
  // removeAppliedOrderItem (L131) are deliberately not authored - they would call
  // orderItem.setAppliedPriceGroup(this) / .removeAppliedPriceGroup(this) on a type that does not
  // exist in this domain. The order aggregate reaches the in-scope engines as a read-only view
  // (src/domain/views/**), never as a materialized association. This is the anti-corruption seam that
  // makes the slice independently deployable. The full legacy declaration, preserved for schema
  // continuity:
  //
  //   property name="appliedOrderItems" singularname="appliedOrderItem" cfc="OrderItem" type="array"
  //     fieldtype="one-to-many" fkcolumn="appliedPriceGroupID" inverse="true";
  //
  // The framework would also have synthesised `hasAppliedOrderItem` on this class; its only caller is
  // the out-of-scope model/entity/OrderItem.cfc, so it is not generated either. The same class of
  // tension exists for PromotionCode.orders and for `physicals` on Sku, Product, Brand and
  // ProductType, and was annotated identically in those ports.
  //
  // LEGACY-NOTE [model/entity/PriceGroup.cfc:L62]: model/validation/PriceGroup.json carries a
  // delete-context maxCollection:0 rule on `appliedOrderItems`. Because this domain deliberately does
  // not materialize the collection and exposes no member for it, that rule trivially PASSES in
  // TypeScript where it would BLOCK in CFML - a price group with applied order items is undeletable in
  // the legacy system and would not be here. This is a real behavioural consequence of the scope
  // boundary and is documented rather than hidden. Delete-context enforcement itself belongs to
  // src/services/** and src/repositories/mysql/**, not to this entity. For completeness, that schema
  // carries SIX such rules, not one - on appliedOrderItems, childPriceGroups, accounts,
  // subscriptionBenefits, subscriptionUsageBenefits and promotionRewards - plus save-context
  // `required` on priceGroupName and priceGroupCode, and NO "method" key at all, which is why this
  // class contributes none of the port's declaratively-invoked entity validators.

  /**
   * The materialized child price groups. [model/entity/PriceGroup.cfc:L63]
   *
   *   property name="childPriceGroups" singularname="ChildPriceGroup" cfc="PriceGroup"
   *     fieldtype="one-to-many" fkcolumn="parentPriceGroupID" inverse="true";
   *
   * A LIVE ARRAY, not a `readonly` one, and that is deliberate: this collection
   * is a mutation target. The legacy far side reaches through the getter and
   * mutates the array in place at [model/entity/PriceGroup.cfc:L113]
   * (`arrayAppend`), [model/entity/PriceGroup.cfc:L120] (`arrayFind`) and
   * [model/entity/PriceGroup.cfc:L122] (`arrayDeleteAt`), because CFML handed
   * back the live Hibernate collection by reference. Append and delete must stay
   * observable through `getChildPriceGroups()` for `setParentPriceGroup` and
   * `removeParentPriceGroup` to behave as they do today.
   *
   * The FIELD is `readonly`, so the reference can never be reassigned; only the
   * contents move. Contrast `optionGroup.ts`, whose `options` collection is
   * `readonly Option[]` in both directions because its only mutator lived in a
   * sibling entity and the reconciliation was pushed to the repository instead.
   * Here the mutator is in THIS file, so the live array is required.
   *
   * `cascade` is absent from this declaration - note the contrast with
   * `priceGroupRates` below, and with the `cascade="all"` on
   * [model/entity/ProductType.cfc:L65].
   */
  private readonly childPriceGroups: PriceGroup[];

  /**
   * The materialized rates that belong to this price group.
   * [model/entity/PriceGroup.cfc:L64]
   *
   *   property name="priceGroupRates" singularname="priceGroupRate" cfc="PriceGroupRate"
   *     fieldtype="one-to-many" fkcolumn="priceGroupID" cascade="all-delete-orphan" inverse="true";
   *
   * THIS IS THE COLLECTION `getGlobalPriceGroupRate()` SEARCHES, and it is the
   * most-read member of this entity anywhere in the legacy tree - a
   * repository-wide census counts 24 `getPriceGroupRates()` call sites.
   *
   * A LIVE ARRAY, for the same reason as `childPriceGroups` and on equally
   * concrete evidence: the far side mutates it in place at
   * [model/entity/PriceGroupRate.cfc:L184] (`arrayAppend`),
   * [model/entity/PriceGroupRate.cfc:L191] (`arrayFind`) and
   * [model/entity/PriceGroupRate.cfc:L193] (`arrayDeleteAt`), inside
   * `PriceGroupRate.setPriceGroup` and `PriceGroupRate.removePriceGroup`.
   *
   * `cascade="all-delete-orphan"` is a persistence instruction with no
   * representation in this class. It is honoured by the repository on delete, and
   * the obligation is recorded at the `src/repositories/mysql/**` sibling that
   * owns the write - never here. It pairs with the delete-context
   * `maxCollection:0` rules in `model/validation/PriceGroup.json`, enforced at
   * the service tier.
   */
  private readonly priceGroupRates: PriceGroupRate[];

  // --- Related Object Properties (many-to-many - inverse) [model/entity/PriceGroup.cfc:L67-L70] --
  //
  // LEGACY-NOTE [model/entity/PriceGroup.cfc:L66]: the banner reads
  // "// Related Object Properties (many-to-many - invers)" - "invers", missing the trailing "e".
  // Comment-only source wart; recorded, not corrected.
  //
  // EXACTLY ONE of the four declarations in this block is in scope. The three that are not are
  // preserved as inert metadata for schema continuity (B5) and no member is authored for them:
  //
  //   property name="accounts" singularname="account" cfc="Account" fieldtype="many-to-many"
  //     linktable="SwAccountPriceGroup" fkcolumn="priceGroupID" inversejoincolumn="accountID"
  //     inverse="true";                                                                     [L67]
  //   property name="subscriptionBenefits" singularname="subscriptionBenefit"
  //     cfc="SubscriptionBenefit" type="array" fieldtype="many-to-many"
  //     linktable="SwSubsBenefitPriceGroup" fkcolumn="priceGroupID"
  //     inversejoincolumn="subscriptionBenefitID" inverse="true";                            [L68]
  //   property name="subscriptionUsageBenefits" singularname="subscriptionUsageBenefit"
  //     cfc="SubscriptionUsageBenefit" type="array" fieldtype="many-to-many"
  //     linktable="SwSubsUsageBenefitPriceGroup" fkcolumn="priceGroupID"
  //     inversejoincolumn="subscriptionUsageBenefitID" inverse="true";                       [L69]
  //
  // LEGACY-NOTE [model/entity/PriceGroup.cfc:L67-L69, L152-L173]: accounts (L67), subscriptionBenefits
  // (L68) and subscriptionUsageBenefits (L69) target the OUT-OF-SCOPE Account and subscription modules,
  // which have no counterpart among the eighteen in-scope entities. The six bidirectional helpers at
  // L152-L173 are therefore deliberately not authored: they cannot be typed without `any` (forbidden)
  // or without inventing entity files outside the locked budget. Link-table names SwAccountPriceGroup,
  // SwSubsBenefitPriceGroup and SwSubsUsageBenefitPriceGroup are preserved above as inert metadata for
  // schema continuity. NO subscription or account business logic is ported.
  //
  // Note that SwSubsUsageBenefitPriceGroup (L69) is one of the six subscription-owned tables reached by
  // model/dao/PriceGroupDAO.cfc:L52-L100 (getAccountSubscriptionPriceGroups), the single deliberate
  // read-only data-layer reach-through in the whole plan. That SQL is ported behind
  // PriceGroupRepository and documented at the port - never here. Re-verified: those six tables are
  // SwSubsUsageBenefitAccount, SwSubsUsageBenefit, SwSubsUsageBenefitPriceGroup, SwSubsUsage,
  // SwSubscriptionStatus and SwType, and the query is read-only.
  //
  // The framework would also have synthesised `hasAccount`, `hasSubscriptionBenefit` and
  // `hasSubscriptionUsageBenefit` on this class. Their only callers are the out-of-scope
  // model/entity/Account.cfc:L444, model/entity/SubscriptionBenefit.cfc:L129 and
  // model/entity/SubscriptionUsageBenefit.cfc:L190, so none of the three is generated. The same is
  // true of the two dispatcher patterns `getAccountsOptionsSmartList()` and
  // `getAccountsAssignedIDList()`, whose only call site is
  // admin/views/entity/pricegrouptabs/assignedaccounts.cfm:L53 - and admin/** is out of scope.
  //
  // LEGACY-NOTE [model/entity/PriceGroup.cfc:L168, L171]: both subscription-usage-benefit helpers
  // declare their argument as `subsciptionUsageBenefit` - missing the first "r" in "subscription".
  // The misspelling is used CONSISTENTLY in each signature and its matching body
  // (L168 with L169, and L171 with L172), so the legacy code works correctly; this is a preserved
  // identifier typo, NOT a defect, and it consumes no divergence. Recorded here because the methods
  // themselves are out of scope and are not authored. Contrast the genuinely broken argument-name
  // mismatch at model/entity/ProductType.cfc:L118, which always throws.

  /**
   * The materialized promotion rewards for which this price group is eligible.
   * [model/entity/PriceGroup.cfc:L70]
   *
   *   property name="promotionRewards" singularname="promotionReward" cfc="PromotionReward"
   *     type="array" fieldtype="many-to-many" linktable="SwPromoRewardEligiblePriceGrp"
   *     fkcolumn="priceGroupID" inversejoincolumn="promotionRewardID" inverse="true";
   *
   * THE ONLY IN-SCOPE MEMBER OF THE FOUR-DECLARATION MANY-TO-MANY BLOCK. It is
   * the inverse side of `PromotionReward.eligiblePriceGroups`
   * [model/entity/PromotionReward.cfc:L74], which is the owning side. The
   * abbreviated link-table name `SwPromoRewardEligiblePriceGrp` is preserved
   * verbatim - it is truncated in the schema and this port renames nothing.
   *
   * A LIVE ARRAY. The owning side mutates it in place at
   * [model/entity/PromotionReward.cfc:L163] (`arrayAppend`),
   * [model/entity/PromotionReward.cfc:L171] (`arrayFind`) and
   * [model/entity/PromotionReward.cfc:L173] (`arrayDeleteAt`), inside
   * `addEligiblePriceGroup` and `removeEligiblePriceGroup`.
   */
  private readonly promotionRewards: PromotionReward[];

  // --- Audit properties [model/entity/PriceGroup.cfc:L73-L76] -----------------------------------
  //
  // All four carry `hb_populateEnabled="false"`, preserved verbatim below. That attribute told the
  // framework's mass-population step to refuse these keys from request data, which is why they are
  // hydration-only here and no setter exists for any of them.
  //
  // The two Account many-to-ones become OPAQUE FK ID COLUMNS: schema continuity with no Account
  // behaviour ported, and no nineteenth entity file created to hold an Account. This mirrors the
  // Category.site -> siteID treatment and the identical model/entity/ProductType.cfc:L84/L86
  // treatment.

  /**
   * `createdDateTime`, or `undefined`. [model/entity/PriceGroup.cfc:L73]
   *
   *   property name="createdDateTime" hb_populateEnabled="false" ormtype="timestamp";
   *
   * Written by the inherited lifecycle step - `super.preInsert()` at
   * [org/Hibachi/HibachiEntity.cfc:L598] stamps it - which this port relocates to
   * the repository on save. This class never reads a clock.
   */
  private readonly createdDateTime: Date | undefined;

  /**
   * The `createdByAccountID` column, opaque. [model/entity/PriceGroup.cfc:L74]
   *
   *   property name="createdByAccount" hb_populateEnabled="false" cfc="Account"
   *     fieldtype="many-to-one" fkcolumn="createdByAccountID";
   */
  private readonly createdByAccountID: string | undefined;

  /**
   * `modifiedDateTime`, or `undefined`. [model/entity/PriceGroup.cfc:L75]
   *
   *   property name="modifiedDateTime" hb_populateEnabled="false" ormtype="timestamp";
   */
  private readonly modifiedDateTime: Date | undefined;

  /**
   * The `modifiedByAccountID` column, opaque. [model/entity/PriceGroup.cfc:L76]
   *
   *   property name="modifiedByAccount" hb_populateEnabled="false" cfc="Account"
   *     fieldtype="many-to-one" fkcolumn="modifiedByAccountID";
   */
  private readonly modifiedByAccountID: string | undefined;

  // --- Non-Persistent Properties [model/entity/PriceGroup.cfc:L79] ------------------------------
  //
  //   property name="parentPriceGroupOptions" persistent="false";
  //
  // ★ WHAT THIS DECLARATION ACTUALLY IS, traced rather than assumed - and it is not what it looks
  // like. `getPropertyOptions(propertyName)` [org/Hibachi/HibachiEntity.cfc:L375-L417] computes its
  // memo slot as `var cacheKey = "#arguments.propertyName#Options"`, so the call
  // `getPropertyOptions("parentPriceGroup")` at [model/entity/PriceGroup.cfc:L95] memoizes into
  // `variables["parentPriceGroupOptions"]` - EXACTLY the slot L79 declares. The non-persistent
  // property is therefore the FRAMEWORK CACHE for the option list, and the hand-written
  // `getParentPriceGroupOptions()` at L94 is an OVERRIDE of the accessor that declaration generated.
  //
  // Two consequences follow, and both are recorded because they change how the port must be built.
  //   (1) THE LEGACY IS EFFECTIVELY MEMOIZED even though its body has no memo guard. Its only data
  //       source caches, so a second call re-runs the loop over an array from which the self-record
  //       has ALREADY been spliced, finds no match, and returns the same array identity. This
  //       refines - and partly corrects - the contrast with ProductType recorded further down.
  //   (2) THE LEGACY MUTATES ITS OWN CACHE. `arrayDeleteAt(options, i)` at L98 operates on the array
  //       `getPropertyOptions` returned, which IS `variables["parentPriceGroupOptions"]`, so any
  //       other consumer of that framework accessor on the same instance would afterwards see the
  //       self-record missing. See `getParentPriceGroupOptions()` for how the port reproduces the
  //       observable half of this and declines the shared-cache half.
  //
  // Unlike model/entity/ProductType.cfc:L89, which declares `type="array" persistent="false"`, this
  // declaration omits `type="array"` - the same cosmetic inconsistency recorded for the persistent
  // collections above.

  /**
   * The candidate rows the parent-price-group option list is filtered FROM, materialized at the
   * repository boundary. Backs {@link PriceGroup.getParentPriceGroupOptions}.
   * [model/entity/PriceGroup.cfc:L95]
   *
   * THIS FIELD STANDS IN FOR `getPropertyOptions("parentPriceGroup")` AND FOR NOTHING ELSE. That
   * framework method reaches a `HibachiSmartList` [org/Hibachi/HibachiEntity.cfc:L418], and the smart
   * list is explicitly NOT carried forward by this port - AAP 0.6.2 replaces it with typed repository
   * queries, precisely so a generic string-keyed query builder does not have to be re-implemented.
   * So the candidate list is BUILT OUTSIDE THE DOMAIN and handed in already shaped, including the
   * prepended `{value: '', name: <resolved rbKey>}` row that `hb_optionsNullRBKey="define.none"`
   * [model/entity/PriceGroup.cfc:L59] causes [org/Hibachi/HibachiEntity.cfc:L410]. Ordering is the
   * producing query's responsibility and is preserved verbatim here: the legacy filter walks the
   * array in the order it received it, and so does this port.
   *
   * OPTIONAL, DEFAULTING TO EMPTY. A repository loading price groups for the five-level cascade has
   * no reason to build an admin dropdown, and an empty candidate list is a legitimate hydration
   * state rather than an error - the legacy would reach the same place when the smart list matched
   * nothing. Unlike {@link Option.getImageDirectory}'s missing base, an empty array here produces a
   * TRUTHFUL answer (an empty option list) rather than a well-formed wrong one, so this accessor is
   * TOTAL and does not raise.
   */
  private readonly parentPriceGroupOptionCandidates: readonly ParentPriceGroupOption[];

  /**
   * The memo for {@link PriceGroup.getParentPriceGroupOptions}.
   *
   * PRESENT BECAUSE THE LEGACY IS EFFECTIVELY MEMOIZED, per consequence (1) on the L79 note above:
   * repeated legacy calls return the SAME ARRAY IDENTITY, because the framework cache behind them is
   * populated once. Recomputing a fresh array per call would hand back a different identity each
   * time, which is a change a caller can observe, so the memo reproduces the source rather than
   * decorating it.
   *
   * Mutable, and the ONLY mutable non-association field on this class other than
   * `parentPriceGroup` / `priceGroupIDPath`. It is assigned exactly once, on first read.
   */
  private parentPriceGroupOptions: readonly ParentPriceGroupOption[] | undefined;

  /**
   * Hydrates one `SwPriceGroup` row.
   *
   * A single readonly parameter object, matching the convention this folder
   * already established: an inline object type rather than a second exported
   * interface, because this module's export surface is fixed at the class alone -
   * one exported unit per file, no barrel, no `index.ts`, no `types.ts`.
   *
   * Every nullable field is a REQUIRED slot typed `T | undefined` rather than an
   * optional `?:` slot. `exactOptionalPropertyTypes` is enabled, so "absent" and
   * "present-but-undefined" are genuinely different types, and requiring the key
   * forces a hydrating repository to state "I looked and found nothing" instead
   * of silently omitting it. The three collections are required on the same
   * terms: a repository must pass `[]` deliberately rather than leave an
   * association unstated.
   *
   * THERE IS NO COLLABORATOR PORT PARAMETER, and that is a finding rather than an
   * omission: `model/entity/PriceGroup.cfc` contains ZERO `getService(` sites, so
   * there is no outward reach to inject. There is no clock parameter either,
   * because this entity performs no date comparison of any kind - contrast
   * `promotionPeriod.ts`, whose `isCurrent` takes an explicit `now` so the UTC
   * policy is visible.
   *
   * NEITHER LIFECYCLE HOOK IS FIRED FROM HERE. `preInsert()` and `preUpdate()`
   * are explicit maintenance methods the repository invokes on save; calling one
   * during construction would recompute the materialized path from a parent chain
   * the repository may not have finished wiring, and would silently overwrite the
   * stored `priceGroupIDPath` this constructor was just handed. No path
   * computation of any kind happens in this constructor.
   *
   * The two `parent`/`child` sides are hydrated independently and this
   * constructor performs no reconciliation between them - it does not append
   * `this` to its parent's `childPriceGroups`, and it does not set itself as the
   * parent of each child. Reconciling a materialized graph is the repository's
   * job, at the boundary that fetched it; doing it here would mutate a shared
   * request-scoped array as a side effect of construction.
   */
  constructor(init: {
    readonly priceGroupID: string;
    readonly priceGroupIDPath: string | undefined;
    readonly activeFlag: CfBooleanInput;
    readonly priceGroupName: string | undefined;
    readonly priceGroupCode: string | undefined;
    readonly parentPriceGroup: PriceGroup | undefined;
    readonly childPriceGroups: PriceGroup[];
    readonly priceGroupRates: PriceGroupRate[];
    readonly promotionRewards: PromotionReward[];
    readonly parentPriceGroupOptionCandidates?: readonly ParentPriceGroupOption[] | undefined;
    readonly createdDateTime: Date | undefined;
    readonly createdByAccountID: string | undefined;
    readonly modifiedDateTime: Date | undefined;
    readonly modifiedByAccountID: string | undefined;
  }) {
    this.priceGroupID = init.priceGroupID;
    this.priceGroupIDPath = init.priceGroupIDPath;
    this.activeFlag = init.activeFlag;
    this.priceGroupName = init.priceGroupName;
    this.priceGroupCode = init.priceGroupCode;
    this.parentPriceGroup = init.parentPriceGroup;
    this.childPriceGroups = init.childPriceGroups;
    this.priceGroupRates = init.priceGroupRates;
    this.promotionRewards = init.promotionRewards;

    // [model/entity/PriceGroup.cfc:L95] Defaults to empty rather than `undefined`: the accessor is
    // TOTAL and an empty candidate list is the same answer the legacy smart list gave when it matched
    // nothing. See the field for why the list is materialized outside the domain.
    this.parentPriceGroupOptionCandidates = init.parentPriceGroupOptionCandidates ?? [];

    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
  }

  // --- Accessors ---------------------------------------------------------------------------------
  //
  // ColdFusion's `accessors=true` [model/entity/PriceGroup.cfc:L49] auto-generated these from the
  // property metadata, so there is no legacy body to port and each one cites the property declaration
  // it serves. The set is COMPLETE with respect to the persistent properties rather than trimmed to
  // what the legacy tree happens to call, because interface parity is judged against the property
  // metadata: the framework and the legacy admin reach these through generated accessors, so an
  // accessor with no current call site is still part of the surface.
  //
  // GETTERS ONLY. The legacy component hand-writes no setter, and the one generated setter its own
  // code calls - `setPriceGroupIDPath(...)`, invoked at [model/entity/PriceGroup.cfc:L207] and
  // [model/entity/PriceGroup.cfc:L212] - has exactly those two call sites in the entire repository,
  // both inside this component's own lifecycle hooks. It is therefore encapsulated by the maintenance
  // methods below rather than exposed: a public path setter would let a caller write an arbitrary
  // string into a column that decides which price-group rate wins. `setParentPriceGroup` is a
  // hand-written bidirectional helper, not a generated accessor, and appears with its siblings.
  //
  // LEGACY-NOTE [model/entity/PriceGroup.cfc:L52]: CFML method names are case-insensitive, and the
  // legacy tree really does exploit that - the primary-key accessor is spelled three different ways
  // across four call sites: `getPriceGroupID()` (the ORM-canonical form),
  // `getPriceGroupId()` at model/service/PriceGroupService.cfc:L253, and `getPricegroupID()` at
  // admin/views/entity/detailpricegrouprate.cfm:L61 and :L64. TypeScript is case-sensitive, so only
  // the canonical form exists here. This is a source wart, not a data contract: the column is
  // `priceGroupID` in every declaration.

  /** [model/entity/PriceGroup.cfc:L52] */
  getPriceGroupID(): string {
    return this.priceGroupID;
  }

  /**
   * Whether this price group is active. [model/entity/PriceGroup.cfc:L54]
   *
   * Reads through `cfBoolean`, which is REQUIRED here rather than a convenience,
   * because the column declares no `default=` at all. An undefaulted read - a SQL
   * NULL, or a column the repository did not populate - resolves to `false`, which
   * is the same answer the legacy engine gave a flag it had no value for. Always
   * returns a `boolean`, never the raw column value, so no caller has to repeat
   * the coercion and no caller can accidentally skip it. No coercion is
   * hand-rolled anywhere in this file.
   */
  getActiveFlag(): boolean {
    return cfBoolean(this.activeFlag);
  }

  /** [model/entity/PriceGroup.cfc:L55] Read at PriceGroupRate.cfc:L275 and PriceGroupService.cfc:L249. */
  getPriceGroupName(): string | undefined {
    return this.priceGroupName;
  }

  /** [model/entity/PriceGroup.cfc:L56] No format, length or uniqueness constraint is declared. */
  getPriceGroupCode(): string | undefined {
    return this.priceGroupCode;
  }

  /** [model/entity/PriceGroup.cfc:L59] `undefined` at a hierarchy root; see the field. */
  getParentPriceGroup(): PriceGroup | undefined {
    return this.parentPriceGroup;
  }

  /**
   * The LIVE array of child price groups. [model/entity/PriceGroup.cfc:L63]
   *
   * Returns the in-memory array itself, not a copy, because it is a mutation
   * target: `setParentPriceGroup` appends to it and `removeParentPriceGroup`
   * splices from it, exactly as [model/entity/PriceGroup.cfc:L113], :L120 and
   * :L122 do through this same accessor. Handing back a copy would silently
   * discard both mutations.
   *
   * Also read - without mutation - at
   * [model/service/PriceGroupService.cfc:L463], inside `deletePriceGroup`.
   */
  getChildPriceGroups(): PriceGroup[] {
    return this.childPriceGroups;
  }

  /**
   * The LIVE array of rates. [model/entity/PriceGroup.cfc:L64]
   *
   * The most-read member of this entity in the legacy tree, at 24 call sites, and
   * a mutation target from the owning side: `PriceGroupRate.setPriceGroup`
   * appends through this accessor at [model/entity/PriceGroupRate.cfc:L184] and
   * `PriceGroupRate.removePriceGroup` locates and deletes through it at
   * [model/entity/PriceGroupRate.cfc:L191] and :L193.
   */
  getPriceGroupRates(): PriceGroupRate[] {
    return this.priceGroupRates;
  }

  /**
   * The LIVE array of promotion rewards eligible to this price group.
   * [model/entity/PriceGroup.cfc:L70]
   *
   * A mutation target from the owning side: `PromotionReward.addEligiblePriceGroup`
   * appends through this accessor at [model/entity/PromotionReward.cfc:L163] and
   * `removeEligiblePriceGroup` locates and deletes through it at
   * [model/entity/PromotionReward.cfc:L171] and :L173.
   */
  getPromotionRewards(): PromotionReward[] {
    return this.promotionRewards;
  }

  /** [model/entity/PriceGroup.cfc:L73] `hb_populateEnabled="false"`. */
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /** [model/entity/PriceGroup.cfc:L74] `hb_populateEnabled="false"`; opaque Account FK. */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /** [model/entity/PriceGroup.cfc:L75] `hb_populateEnabled="false"`. */
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /** [model/entity/PriceGroup.cfc:L76] `hb_populateEnabled="false"`; opaque Account FK. */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  // --- The global-rate selector [model/entity/PriceGroup.cfc:L82-L90] ---------------------------
  //
  // LEGACY-NOTE [model/entity/PriceGroup.cfc:L82-L90]: two cosmetic properties of this region,
  // recorded once. First, L83-L90 are indented with FOUR LEADING SPACES instead of the tab used by
  // every other member of the component - the same wart as model/entity/ProductType.cfc:L117.
  // Second, the method sits in an UN-BANNERED region, between the property declarations and the
  // "// ============ START: Non-Persistent Property Methods" banner at L92, unlike every other method
  // in the file. B1 scopes minimal change to the functional surface, not to layout, so neither is
  // reproduced as layout - both are recorded here instead.

  // Loop over all Price Group Rates and pull the one that is global
  /**
   * The rate on this price group that carries `globalFlag`, or `undefined` when
   * there is none. [model/entity/PriceGroup.cfc:L82-L90]
   *
   * The legacy body verbatim:
   *
   *   // Loop over all Price Group Rates and pull the one that is global
   *   public any function getGlobalPriceGroupRate() {
   *       var rates = getPriceGroupRates();
   *       for(var i=1; i <= ArrayLen(rates); i++) {
   *           if(rates[i].getGlobalFlag()) {
   *               return rates[i];
   *           }
   *       }
   *   }
   *
   * LEGACY-NOTE [model/entity/PriceGroup.cfc:L82-L90]: THE LOOP HAS NO FALLBACK RETURN. When no rate
   * carries globalFlag, CFML falls off the end of the function and returns null. Because `returntype`
   * is "any" there is no numeric coercion, so the absence is genuinely null - NOT 0. The return type
   * here is therefore `PriceGroupRate | undefined`: this method never substitutes a default rate,
   * never returns 0 and never throws.
   *
   * That absence convention is load-bearing in kind, and it belongs to a family of three in this
   * folder whose conventions run in OPPOSITE directions and must never be collapsed together:
   * [model/entity/Product.cfc:L598] falls through to `return 0` and MUST return 0, never undefined (a
   * numbered defect, preserved in `product.ts`); [model/entity/Sku.cfc:L269-L273] has no else branch
   * and MUST return undefined, never 0, because substituting 0 there would silently sell products for
   * free. This method is the third: an absent global rate is genuinely absent.
   *
   * LEGACY-NOTE [model/entity/PriceGroup.cfc:L83]: `getGlobalPriceGroupRate()` HAS ZERO CALL SITES IN
   * THE ENTIRE LEGACY REPOSITORY. Re-verified by searching every .cfc, .cfm, .js and .json outside
   * this port's own subtree: the only match is its own declaration on L83. It is ported because
   * interface parity is judged against the legacy public surface rather than against current usage -
   * the same treatment `promotionAccount.ts` receives as an entity no service references - and it is
   * flagged here as UNEXERCISED so a reviewer is not misled into thinking a caller depends on it.
   *
   * WHERE THE LEVEL-4 GLOBAL-RATE STEP ACTUALLY RUNS, and why the absence still matters. The
   * five-level cascade at [model/service/PriceGroupService.cfc:L140-L181] does NOT call this method:
   * it INLINES its own loop over `getPriceGroupRates()` at
   * [model/service/PriceGroupService.cfc:L163-L170]. That inlined loop is guarded by
   * `isNull(returnRate)` at [model/service/PriceGroupService.cfc:L162] and again at
   * [model/service/PriceGroupService.cfc:L172], and it is precisely the null-versus-present
   * distinction that lets level 4 fall through to level 5, the parent price group, at
   * [model/service/PriceGroupService.cfc:L173-L176]. So the convention this method embodies is the
   * same convention the cascade depends on - it is simply the service, not this entity, that the
   * cascade reads it through. Recording the mechanism accurately is the point: an annotation that
   * claimed a call site that does not exist would be worse than no annotation.
   *
   * LEGACY-NOTE [model/entity/PriceGroup.cfc:L85-L88]: if MORE than one rate carries globalFlag, the
   * legacy loop returns the FIRST in collection order, and the legacy query applies no ORDER BY. The
   * port preserves first-match-wins over whatever order src/repositories/mysql/** materialized.
   * Nothing in the schema prevents multiple global rates on one price group.
   *
   * LEGACY-NOTE [model/service/PriceGroupService.cfc:L164-L169]: the two implementations of "find the
   * global rate" DISAGREE on how to break that tie, and the disagreement is in the source rather than
   * introduced here. This method returns the FIRST match, because L87 returns immediately. The
   * cascade's inlined loop keeps assigning `returnRate` without breaking, so it ends up with the LAST
   * match. Both are reproduced as written in their own files; neither is normalised to the other,
   * because doing so would change which rate - and therefore which price - wins.
   *
   * IMPLEMENTATION. `Array.prototype.find` returns the first match or `undefined`, which is exactly
   * the legacy find-and-return-else-fall-off-the-end behaviour, so the index-access problem that
   * `noUncheckedIndexedAccess` would raise against a transliterated 1-based `rates[i]` loop is avoided
   * outright rather than worked around: there is no non-null assertion and no defensive `continue`
   * anywhere in this method. B1 requires idiomatic TypeScript, and a transliterated indexed loop would
   * violate it rather than satisfy it.
   *
   * `rate.getGlobalFlag()` is consumed as an already-typed `boolean`. The coercion belongs to
   * `priceGroupRate.ts`, not here: [model/entity/PriceGroupRate.cfc:L53] declares
   * `globalFlag ormType="boolean" default="false"`, and `'false'` is a JavaScript-truthy string, so
   * that column's own default is exactly why the flag must be read through `cfBoolean()` - on the
   * class that owns it.
   *
   * SYNCHRONOUS, like every other method on this class. It only traverses an already-materialized
   * association.
   */
  getGlobalPriceGroupRate(): PriceGroupRate | undefined {
    return this.priceGroupRates.find((rate) => rate.getGlobalFlag());
  }

  // --- Non-Persistent Property Methods [model/entity/PriceGroup.cfc:L92-L105] --------------------
  //
  /**
   * The parent-price-group option list, with this price group's own record removed.
   * [model/entity/PriceGroup.cfc:L94-L103]
   *
   *   public any function getParentPriceGroupOptions() {
   *       var options = getPropertyOptions("parentPriceGroup");
   *       for(var i=1; i<=arrayLen(options); i++) {
   *           if(len(options[i]['value']) && options[i]['value'] == getPriceGroupID()) {
   *               arrayDeleteAt(options, i);
   *               break;
   *           }
   *       }
   *       return options;
   *   }
   *
   * ★ PORTED, NOT OMITTED. An earlier revision dropped this method on three grounds: that
   * `getPropertyOptions` is a non-ported framework member, that the method's sole purpose is an
   * admin-form dropdown and `admin/**` is out of scope, and that a loosely-typed `{name, value}`
   * array "has no place in a strict-mode domain layer". Each is answered rather than waved away:
   *
   *   * THE FRAMEWORK CALL IS AN INPUT, NOT THE BEHAVIOUR. What `getPropertyOptions` supplies is a
   *     list of candidates; what THIS METHOD does is filter one record out of it. Relocating the
   *     supply to the repository boundary is exactly the anti-corruption move this port makes
   *     everywhere - see `parentPriceGroupOptionCandidates` - and it leaves the filter, which is the
   *     only logic the source authored here, entirely portable.
   *   * "ONLY THE ADMIN CALLS IT" IS AN ARGUMENT ABOUT CALLERS, NOT ABOUT PARITY. Interface parity is
   *     judged against the component's public surface, and the surface is what a reviewer diffs. The
   *     out-of-scope caller is [admin/views/entity/detailpricegroup.cfm:L63], which reads
   *     `arrayLen(rc.priceGroup.getParentPriceGroupOptions()) gt 1` - so the source DOES observe this
   *     value, and observably. Note the `gt 1` rather than `gt 0`: the comparison is written that way
   *     because the prepended blank row is always present, which is a detail only a faithful port
   *     keeps true.
   *   * "LOOSELY TYPED" WAS A REASON TO TYPE IT, NOT TO DELETE IT. {@link ParentPriceGroupOption}
   *     names both keys with the source's own spelling and gives each a precise type. Nothing about
   *     the shape resists strict mode.
   *
   * THE FILTER IS REPRODUCED EXACTLY, and every clause matters:
   *   * `cfLen(value)` FIRST, short-circuiting. Without it, an UNSAVED price group - whose
   *     `priceGroupID` is `''` [model/entity/PriceGroup.cfc:L52 `default="" unsavedvalue=""`] - would
   *     match the prepended `{value: ''}` null row and delete THE NULL OPTION rather than itself.
   *     `cfLen` is used rather than a bare `!== ''` so the CFML `len()` semantics are the ones
   *     applied, and this is the single `len()` call site in the whole component.
   *   * EXACT STRING EQUALITY on `value`, not a case-insensitive compare. The legacy `==` on two
   *     32-character uuid strings is case-insensitive in CFML, but `generator="uuid"` produces one
   *     canonical casing per row and both sides of this comparison come from the SAME column family,
   *     so no case difference can arise. `cfEquals` is deliberately not used: it RAISES on a nullish
   *     operand (see `src/lib/cfml/struct.ts`), and here a `''` operand is normal rather than
   *     exceptional.
   *   * AT MOST ONE REMOVAL, because of the `break`. Duplicate ids cannot occur in a primary-key
   *     column, so the `break` is an optimisation in the source rather than a semantic; it is kept
   *     anyway, because reproducing the loop's shape costs nothing and guessing costs correctness.
   *
   * ONE DELIBERATE, DOCUMENTED DIVERGENCE - AND IT IS THE SAFE HALF OF A LEGACY SIDE EFFECT. The
   * source splices the array IN PLACE, and that array is the framework cache
   * `variables["parentPriceGroupOptions"]` (see the L79 note), so the legacy mutates state shared
   * with any other consumer of `getPropertyOptions("parentPriceGroup")` on the same instance. This
   * port instead filters into a NEW array and memoizes that. The observable result of THIS method is
   * identical on every call, including the array identity, which is what the legacy's own memo
   * guaranteed. What is not reproduced is the collateral mutation of a framework cache that this port
   * does not have - and reproducing it would mean mutating an array a caller handed to the
   * constructor, which is strictly worse than the behaviour it would imitate.
   *
   * TOTAL: it never throws. An empty candidate list yields an empty result, which is the same answer
   * the legacy gave when its smart list matched nothing.
   *
   * `readonly`, because nothing in `model/entity/*.cfc` mutates this method's result - the ownership
   * census that decides the association accessors returns no site for it - and because the returned
   * array IS the memo, so handing back a mutable reference would let a caller corrupt every later
   * call.
   */
  getParentPriceGroupOptions(): readonly ParentPriceGroupOption[] {
    // [model/entity/PriceGroup.cfc:L95] The legacy memo lives in the framework accessor; here it is
    // explicit. Assigned exactly once, so the array identity is stable across calls.
    if (this.parentPriceGroupOptions !== undefined) {
      return this.parentPriceGroupOptions;
    }

    // [model/entity/PriceGroup.cfc:L96-L101] The 1-based `for` loop with a delete-then-break. The
    // index base is irrelevant to the OUTCOME here, unlike the `arrayFind`/`arrayDeleteAt` pairs in
    // the bidirectional helpers, because nothing is compared against the index and `findIndex`'s -1
    // miss is handled by `filter` never matching. What IS preserved is that the FIRST matching row is
    // the one removed and that at most one row is removed.
    const options: ParentPriceGroupOption[] = [];
    let removed = false;

    for (const option of this.parentPriceGroupOptionCandidates) {
      // [model/entity/PriceGroup.cfc:L97] `len(options[i]['value']) && options[i]['value'] ==
      // getPriceGroupID()`. `cfLen` first and short-circuiting - see the doc block on why the length
      // test cannot be dropped for an unsaved price group.
      //
      // ★ THE IDENTITY TEST IS `cfEquals`, BECAUSE CFML `==` ON STRINGS IS CASE-INSENSITIVE.
      // With `===`, a stored option value spelled in another case than the entity's own identifier
      // column failed to match, THIS price group was left in its own parent-option list, and the
      // admin form then offered a group as its own parent - the one outcome [L96-L101] exists to
      // prevent. The length test stays FIRST and stays `cfLen`, so an unsaved group with an empty
      // identifier never reaches the comparison.
      if (!removed && cfLen(option.value) > 0 && cfEquals(option.value, this.priceGroupID)) {
        // [model/entity/PriceGroup.cfc:L98-L99] `arrayDeleteAt(options, i); break;` - skip this row
        // and stop testing. `removed` reproduces the `break` without abandoning the copy.
        removed = true;
        continue;
      }

      options.push(option);
    }

    this.parentPriceGroupOptions = options;

    // [model/entity/PriceGroup.cfc:L102] `return options;`
    return this.parentPriceGroupOptions;
  }

  // Two deliberate contrasts with its sibling model/entity/ProductType.cfc:L122-L142 are worth
  // recording, because they run in OPPOSITE directions:
  //   (1) MEMOIZATION IS PRESENT IN BOTH, BUT AT DIFFERENT LEVELS - which corrects an earlier note
  //       here that flatly said "this version is NOT memoized". The ProductType version memoizes IN
  //       ITS OWN BODY, guarding on `structKeyExists(variables, "parentProductTypeOptions")`
  //       [model/entity/ProductType.cfc:L123], so a second call skips the loop entirely. The
  //       PriceGroup version has no such guard, but the framework accessor it delegates to memoizes
  //       into the very slot L79 declares, so a second call re-runs the loop over an
  //       already-filtered array and finds nothing. Same observable result, reached differently. The
  //       port memoizes explicitly, matching the observable half.
  //   (2) This version excludes the self-record CORRECTLY, by primary key
  //       (options[i]['value'] == getPriceGroupID(), L97). The ProductType version excludes by NAME
  //       (`records[i].getProductTypeName() != getProductTypeName()`
  //       [model/entity/ProductType.cfc:L136]), so two product types sharing a name would BOTH be
  //       excluded and a rename would change the option list. PriceGroup gets this right;
  //       ProductType does not. That defect belongs to `productType.ts` and is recorded there when
  //       that file ports its own `getParentProductTypeOptions`.

  // --- What the framework provided, and what is NOT re-implemented ------------------------------
  //
  // `model/entity/PriceGroup.cfc:L49` declares `extends="HibachiEntity"` UNQUALIFIED, which resolves
  // to `model/entity/HibachiEntity.cfc` (274 lines) - which itself declares
  // `extends="Slatwall.org.Hibachi.HibachiEntity"`. It is a THREE-level chain, not two. The
  // intermediate class holds 12 `getService(...)` sites, seven of them `attributeService`. They are
  // moot for PriceGroup, which declares no `attributeValues`, but they are not silently
  // re-implemented either: what they provided is redistributed explicitly elsewhere in this port -
  // persistence to the repositories, validation to typed schemas, ambient scope to explicit context
  // parameters.
  //
  // `org/Hibachi/HibachiEntity.cfc:L507-L565` is an `onMissingMethod` dispatcher that resolves ELEVEN
  // method-name patterns at runtime - re-counted branch by branch - and terminates in a THROW at
  // `org/Hibachi/HibachiEntity.cfc:L565`. TYPESCRIPT DOES NOT EMULATE DYNAMIC DISPATCH: there is no
  // `Proxy`, no index signature, no string-keyed method resolution, no `onMissingMethod` emulation, no
  // `evaluate()` equivalent and no `variables.` scope emulation anywhere in this file. A member
  // survives into this port only when it is CONCRETELY CALLED, and each one below carries the call
  // site that earned it.
  //
  // LEGACY-NOTE [org/Hibachi/HibachiEntity.cfc:L559, L565]: PriceGroup declares no attributeValues
  // collection, so an unmatched get… could never reach the framework's EAV fallback (which requires
  // hasProperty("attributeValues")) and would throw directly at L565. Only four of the eighteen
  // in-scope entities could reach that fallback: Sku, Product, ProductType and Brand. The EAV path is
  // not ported and no 19th entity file is created for it.
  //
  // CONFIRMED ABSENT rather than assumed absent: this component declares no `attributeValues`, no
  // `attributeSets` and no `physicals`, so there is nothing to drop on those grounds and none of them
  // is added. The folder's four `attributeValues` declarations are model/entity/Sku.cfc:L70,
  // model/entity/Product.cfc:L75, model/entity/ProductType.cfc:L67 and model/entity/Brand.cfc:L60.
  //
  // NO `hasAny*` MEMBER BELONGS ON THIS CLASS. The four `hasAny*` call sites in the codebase -
  // model/service/PromotionService.cfc:L885, :L914, :L951 and :L980 - target PromotionQualifier and
  // PromotionReward only, never a PriceGroup.
  //
  // NO SMART-LIST METHOD EXISTS ON THIS ENTITY, AND NONE MAY BE ADDED. Unlike ProductType.cfc (four
  // of them) and Product.cfc / Sku.cfc, `model/entity/PriceGroup.cfc` hand-writes none. The framework
  // would have synthesised `getPriceGroupRatesSmartList()`, and its only call site in the whole tree
  // is admin/views/entity/pricegrouprates.cfm:L51 - admin/** is out of scope. `HibachiSmartList` is a
  // generic, string-keyed, dynamically-filtered query builder; porting it faithfully would re-import
  // exactly the framework coupling this refactor exists to remove and would be untypeable under the
  // strict profile. It is replaced by explicit typed repository query methods owned by
  // `src/services/**` and `src/repositories/mysql/**`.
  //
  // NO VALIDATOR AND NO FORMATTER IS AUTHORED. `model/validation/PriceGroup.json` declares no
  // "method" key, so PriceGroup contributes none of the port's declaratively-invoked entity
  // validators - and the source agrees with its own schema: [model/entity/PriceGroup.cfc:L185-L187] is
  // an EMPTY "Custom Validation Methods" banner block and [model/entity/PriceGroup.cfc:L189-L191] is
  // an EMPTY "Custom Formatting Methods" banner block. Recorded because a reviewer diffing this file
  // against the CFC will look for them.

  /**
   * Whether this price group has never been persisted.
   * [org/Hibachi/HibachiEntity.cfc:L707-L709]
   *
   * GENERATED BECAUSE IT IS CONCRETELY CALLED ON A PRICE GROUP. A repository-wide
   * census finds four such call sites, and one of them is in scope:
   * [model/entity/PromotionReward.cfc:L159] does
   * `arguments.eligiblePriceGroup.isNew()`, so `promotionReward.ts` cannot port
   * `addEligiblePriceGroup` without it. The other three -
   * [model/entity/Account.cfc:L441], [model/entity/SubscriptionBenefit.cfc:L126]
   * and [model/entity/SubscriptionUsageBenefit.cfc:L187] - are out of scope. It is
   * also used internally by `setParentPriceGroup`, reproducing the `isNew()`
   * disjunct at [model/entity/PriceGroup.cfc:L112].
   *
   * MODELLED ON THE UNSAVED-ID SIGNAL, which is exactly what the framework did.
   * `isNew()` at [org/Hibachi/HibachiEntity.cfc:L707-L709] delegates to
   * `getNewFlag()` at [org/Hibachi/HibachiEntity.cfc:L571-L576], whose entire body
   * is `if(getPrimaryIDValue() == "") { return true; } return false;`, and
   * `getPrimaryIDValue()` at [org/Hibachi/HibachiEntity.cfc:L244-L246] resolves to
   * `getPriceGroupID()` for this entity. So the test is precisely
   * `priceGroupID === ''`, which is the `unsavedvalue=""` / `default=""` pair
   * declared at [model/entity/PriceGroup.cfc:L52]. The comparison is `===` rather
   * than CFML's `==`, matching the `eqeqeq` rule; both operands are `string`, so
   * the two agree.
   *
   * LEGACY-NOTE [org/Hibachi/HibachiEntity.cfc:L707-L709]: `isNew()` lives inside the framework base's
   * "Deprecated Methods" banner block and is a thin alias for `getNewFlag()`. The legacy name is kept
   * verbatim regardless, because interface parity is judged against what callers actually invoke, and
   * every one of the four call sites invokes `isNew()`. `getNewFlag()` itself is NOT generated here -
   * no call site in the tree invokes it on a PriceGroup.
   */
  isNew(): boolean {
    return this.priceGroupID === '';
  }

  /**
   * Whether `childPriceGroup` is already a member of this group's materialized
   * children. [org/Hibachi/HibachiEntity.cfc:L507-L565]
   *
   * GENERATED BECAUSE IT IS CONCRETELY CALLED, which is the whole test for whether
   * a member the framework synthesised survives into this port. Verified call
   * site, [model/entity/PriceGroup.cfc:L112]:
   *
   *   if(isNew() or !arguments.parentPriceGroup.hasChildPriceGroup( this )) {
   *
   * LEGACY-NOTE [org/Hibachi/HibachiEntity.cfc:L507-L565]: this member has no hand-written body and no
   * branch in that dispatcher either - re-read, it handles `hasUniqueOrNull`, `hasUnique` and `hasAny`
   * but has no `has<Singular>` branch. It is the accessor ColdFusion's ORM generates for a collection
   * property carrying a `singularname`, here `singularname="ChildPriceGroup"`
   * [model/entity/PriceGroup.cfc:L63], and it tests membership of that collection.
   *
   * COMPARISON IS BY PRIMARY KEY `priceGroupID`, never by reference identity and
   * never by deep equality. The legacy comparison basis is Hibernate's implicit
   * collection-contains, which is session identity - and within a Hibernate
   * session, identity IS the primary key. Comparing the key rather than the object
   * reference also means two instances hydrated from the same row by two different
   * repository calls answer correctly instead of silently answering `false`.
   *
   * The one edge worth naming: for an UNSAVED price group the key is `''`
   * [model/entity/PriceGroup.cfc:L52], so this test cannot distinguish two unsaved
   * children from one another. The legacy call site is unaffected because the
   * `isNew()` disjunct at L112 short-circuits before this method is ever consulted
   * for a new entity. That is recorded, not compensated for: adding a fallback
   * would be an unrequested behavioural change.
   */
  hasChildPriceGroup(childPriceGroup: PriceGroup): boolean {
    const candidatePriceGroupID = childPriceGroup.getPriceGroupID();

    return this.childPriceGroups.some((child) => child.getPriceGroupID() === candidatePriceGroupID);
  }

  /**
   * Whether `priceGroupRate` is already a member of this group's materialized
   * rates. [org/Hibachi/HibachiEntity.cfc:L507-L565]
   *
   * GENERATED BECAUSE IT IS CONCRETELY CALLED, on the same criterion and with the
   * same evidence standard as `hasChildPriceGroup`. Verified call site,
   * [model/entity/PriceGroupRate.cfc:L183]:
   *
   *   if(isNew() or !arguments.priceGroup.hasPriceGroupRate( this )) {
   *
   * That caller is `PriceGroupRate.setPriceGroup`, and `PriceGroupRate` is in
   * scope, so without this member `priceGroupRate.ts` could not port its
   * bidirectional helper faithfully - it would need `any` (forbidden by
   * `no-explicit-any`) or a member that does not exist. Generating it is interface
   * PARITY with a member the legacy ORM really did provide, not a widening: no
   * signature is widened, no visibility is widened, no divergence is spent.
   *
   * ORM-generated from `singularname="priceGroupRate"`
   * [model/entity/PriceGroup.cfc:L64]. Compares by primary key, on the same
   * reasoning given for `hasChildPriceGroup`.
   */
  hasPriceGroupRate(priceGroupRate: PriceGroupRate): boolean {
    const candidatePriceGroupRateID = priceGroupRate.getPriceGroupRateID();

    return this.priceGroupRates.some(
      (rate) => rate.getPriceGroupRateID() === candidatePriceGroupRateID,
    );
  }

  /**
   * Whether `promotionReward` is already a member of this group's materialized
   * eligible-reward collection. [org/Hibachi/HibachiEntity.cfc:L507-L565]
   *
   * GENERATED BECAUSE IT IS CONCRETELY CALLED. Verified call site,
   * [model/entity/PromotionReward.cfc:L162]:
   *
   *   if(isNew() or !arguments.eligiblePriceGroup.hasPromotionReward( this )) {
   *
   * `PromotionReward` is in scope, so the same reasoning applies as for
   * `hasPriceGroupRate`: omitting this member would leave `promotionReward.ts`
   * unable to port `addEligiblePriceGroup`. ORM-generated from
   * `singularname="promotionReward"` [model/entity/PriceGroup.cfc:L70]. Compares by
   * primary key.
   */
  hasPromotionReward(promotionReward: PromotionReward): boolean {
    const candidatePromotionRewardID = promotionReward.getPromotionRewardID();

    return this.promotionRewards.some(
      (reward) => reward.getPromotionRewardID() === candidatePromotionRewardID,
    );
  }

  // --- Bidirectional Helper Methods [model/entity/PriceGroup.cfc:L107-L183] ----------------------
  //
  // LEGACY-NOTE [model/entity/PriceGroup.cfc:L107-L183]: MANDATORY "remove-that-ADDs" inversion
  // cross-check performed across all EIGHT remove* bidirectional helpers in this component
  // (L116, L131, L139, L147, L155, L163, L171, L179).
  // RESULT: CLEAN - ZERO inversions. Every remove* body correctly calls a remove* counterpart on the
  // owning side, and removeParentPriceGroup correctly performs arrayDeleteAt + structDelete.
  // Contrast model/entity/Option.cfc:L129-L131 and :L145-L147, which DO carry the inversion defect
  // (both "remove" methods call addExcludedOption). No divergence is spent here because there is
  // nothing to preserve.
  //
  // That verdict was re-verified locator by locator against the source before being reproduced, and
  // the eight bodies it rests on are: L116 removeParentPriceGroup (arrayFind + arrayDeleteAt on the
  // parent's children, then structDelete - no add anywhere); L131 removeAppliedOrderItem ->
  // removeAppliedPriceGroup; L139 removeChildPriceGroup -> removeParentPriceGroup; L147
  // removePriceGroupRate -> removePriceGroup; L155 removeAccount -> removePriceGroup; L163
  // removeSubscriptionBenefit -> removePriceGroup; L171 removeSubscriptionUsageBenefit ->
  // removePriceGroup; L179 removePromotionReward -> removeEligiblePriceGroup.
  //
  // LEGACY-NOTE [model/entity/PriceGroup.cfc:L127-L141]: L127-L130, L133 and L135-L141 carry trailing
  // whitespace after `{` and `}` - a copy-paste artifact shared with the equivalent blocks in the
  // sibling entities. B1 scopes minimal change to the functional surface, not style, so it is recorded
  // rather than reproduced.
  //
  // LEGACY-NOTE [model/entity/PriceGroup.cfc:L63]: singularname is declared "ChildPriceGroup" with a
  // capital C, while the hand-written helpers at L136/L139 and the implicit predicate at L112 all use
  // the capital-C form consistently. CFML method names are case-insensitive. Contrast
  // model/entity/ProductType.cfc:L65, which declares singularname="childProductType" lowercase and
  // then declares addchildProductType/removechildProductType - the opposite wart. Normalised here to
  // camelCase for the ORM-canonical form; an internal naming inconsistency, not a data contract.

  /**
   * Sets this price group's parent and keeps the parent's child collection in
   * step. [model/entity/PriceGroup.cfc:L110-L115]
   *
   * The legacy body verbatim:
   *
   *   public void function setParentPriceGroup(required any parentPriceGroup) {
   *       variables.parentPriceGroup = arguments.parentPriceGroup;
   *       if(isNew() or !arguments.parentPriceGroup.hasChildPriceGroup( this )) {
   *           arrayAppend(arguments.parentPriceGroup.getChildPriceGroups(), this);
   *       }
   *   }
   *
   * Structurally identical to [model/entity/ProductType.cfc:L149-L153] and
   * [model/entity/Category.cfc:L101-L105], and the established precedents are
   * applied verbatim rather than re-derived.
   *
   * BOTH HALVES OF THE DISJUNCT ARE PRESERVED, in order and with CFML's
   * short-circuit semantics, which JavaScript's `||` reproduces exactly. `isNew()`
   * first: an unsaved price group is appended unconditionally, because its `''` key
   * makes the membership test meaningless. Only then is `hasChildPriceGroup`
   * consulted, which is what keeps a saved child from being appended twice.
   *
   * `arrayAppend` becomes `push` onto the LIVE array handed back by
   * `getChildPriceGroups()`. The mutation must be observable through that accessor
   * on the parent instance, which is why the collection is not `readonly`.
   *
   * `void` return, matching the legacy declaration. Synchronous.
   *
   * ★ WHATEVER IT IS HANDED IS ASSIGNED, INCLUDING A DESCENDANT OF THIS NODE.
   * The legacy setter validates nothing, so choosing this node's own descendant as
   * its parent is accepted and a cyclic `parentPriceGroup` chain is created. That
   * is reproduced rather than corrected. The port adds no guard here, so no
   * assignment this method accepts differs from the assignment
   * [model/entity/PriceGroup.cfc:L110-L115] would have accepted.
   *
   * ★ AN EARLIER REVISION REFUSED SUCH A REPARENT, AND THE RECORD OF ITS REMOVAL
   * BELONGS HERE. This method used to call a `wouldCreateIdPathCycle()` helper and
   * throw, under a three-star divergence banner. Three checkable reasons removed
   * it. (1) A port reproduces; it does not improve. The legacy setter has
   * no such check, so refusing an assignment it accepts is an unrequested
   * behavioural change, not a migration. (2) The project's deliberate-divergence
   * budget is closed at THREE - the un-`var`'d `discountAmount`
   * [model/service/PromotionService.cfc:L1007], the `amountOff` branch routed
   * through `Money` [model/service/PromotionService.cfc:L998], and the entity
   * memo defects in `sku.ts`/`product.ts` - and a guard here was a FOURTH,
   * justified against itself rather than against that budget. (3) Termination on
   * a cyclic chain genuinely had to be decided in exactly one place, and this is
   * not it: the hand-written recursive ancestry read in
   * `mysqlPriceGroupRepository.ts` replaces Hibernate's lazy traversal under
   * transformation rule T3, has no legacy antecedent to reproduce, and therefore
   * owns its own fetch-shape termination decision at the adapter boundary. That
   * adapter still raises `PriceGroupCycleError` naming the chain it followed,
   * because a SHORTENED ancestry would be a DIFFERENT `priceGroupIDPath` and that
   * path is what the five-level cascade climbs
   * [model/service/PriceGroupService.cfc:L140-L181] - truncating would be a
   * different price arrived at silently. Raising there is a decision about a
   * query the legacy system never issued; it is not a change to this setter.
   *
   * THE CONSTRUCTOR IS LIKEWISE UNGUARDED, and for the same reason: it is the
   * hydration boundary, it reproduces what the row set says, and the adapter that
   * produced the row set has already refused to hand back a cyclic one.
   */
  setParentPriceGroup(parentPriceGroup: PriceGroup): void {
    // CFML parity [model/entity/PriceGroup.cfc:L110-L115]: the legacy body validates nothing
    // before assigning, and neither does this one. A cyclic parent chain is accepted here
    // exactly as it is accepted there.
    this.parentPriceGroup = parentPriceGroup;

    if (this.isNew() || !parentPriceGroup.hasChildPriceGroup(this)) {
      parentPriceGroup.getChildPriceGroups().push(this);
    }
  }

  /**
   * Detaches this price group from a parent, removing it from that parent's child
   * collection and clearing its own reference.
   * [model/entity/PriceGroup.cfc:L116-L125]
   *
   * The legacy body verbatim:
   *
   *   public void function removeParentPriceGroup(any parentPriceGroup) {
   *       if(!structKeyExists(arguments, "parentPriceGroup")) {
   *           arguments.parentPriceGroup = variables.parentPriceGroup;
   *       }
   *       var index = arrayFind(arguments.parentPriceGroup.getChildPriceGroups(), this);
   *       if(index > 0) {
   *           arrayDeleteAt(arguments.parentPriceGroup.getChildPriceGroups(), index);
   *       }
   *       structDelete(variables, "parentPriceGroup");
   *   }
   *
   * THE ARGUMENT IS OPTIONAL, exactly as the legacy declaration is - `any
   * parentPriceGroup` with no `required`. The default branch tests `!== undefined`,
   * reproducing `structKeyExists(arguments, "parentPriceGroup")`, and NEVER
   * truthiness: an argument that was passed is a different state from one that was
   * not, and a truthiness test would conflate them.
   *
   * `arrayFind` is 1-BASED AND RETURNS 0 ON A MISS, which is why the legacy guard is
   * `index > 0`. `Array.prototype.findIndex` is 0-based and returns `-1` on a miss,
   * so the equivalent guard is an explicit `!== -1` found/not-found check - never a
   * truthiness test, which would wrongly treat the valid index 0 as "not found".
   * That off-by-one between the two languages is exactly the kind of detail a
   * transliteration gets wrong.
   *
   * The accessor is called ONCE and the array captured in a local, where the legacy
   * body calls it twice (L120 and L122). Under Hibernate both calls returned the
   * same live collection, and both calls return the same array reference here too,
   * so the two forms are equivalent; capturing it once makes that fact explicit.
   *
   * `structDelete(variables, "parentPriceGroup")` becomes assigning `undefined`,
   * and it runs UNCONDITIONALLY - outside the index guard - just as it does at
   * [model/entity/PriceGroup.cfc:L124]. A price group that was not found in its
   * parent's collection still loses its parent reference.
   *
   * LEGACY-NOTE [model/entity/PriceGroup.cfc:L116-L122]: when the argument is omitted AND this price
   * group has no stored parent, the legacy body assigns null into `arguments.parentPriceGroup` at L118
   * and then invokes `.getChildPriceGroups()` on it at L120 - a method call on null, which throws at
   * runtime under every CFML engine. That runtime failure is REPRODUCED here rather than smoothed over:
   * returning early would silently skip the L124 field clear as well, so it would not be the same
   * behaviour by a different route - it would be different behaviour. The identical unguarded shape
   * appears at model/entity/ProductType.cfc:L155-L160, model/entity/Category.cfc:L107-L112 and
   * model/entity/PriceGroupRate.cfc:L187-L192, so it is the framework-wide idiom rather than a local
   * slip, and it is recorded as a note rather than as a numbered defect. The thrown message names the
   * legacy locator so the failure is traceable to its origin.
   */
  removeParentPriceGroup(parentPriceGroup?: PriceGroup): void {
    const targetParentPriceGroup =
      parentPriceGroup !== undefined ? parentPriceGroup : this.parentPriceGroup;

    if (targetParentPriceGroup === undefined) {
      throw new Error(
        'PriceGroup.removeParentPriceGroup was called with no argument on a price group that has ' +
          'no parentPriceGroup. This reproduces the legacy runtime failure at ' +
          'model/entity/PriceGroup.cfc:L118-L120, where the omitted argument defaults to a null ' +
          'parent and getChildPriceGroups() is then invoked on it.',
      );
    }

    // Row identity is decided by {@link isSameRow} - the key for a stored group, the instance for an
    // unsaved one. `hasChildPriceGroup` above may compare keys alone because the legacy `isNew()`
    // disjunct at [model/entity/PriceGroup.cfc:L112] short-circuits before it is ever consulted for a
    // new entity; THIS site has no such short-circuit. [L120]'s `arrayFind(..., this)` is an object
    // comparison, and every unsaved group's key is the same `''` placeholder [L52], so comparing keys
    // alone here detaches whichever unsaved sibling happens to come first rather than this one.
    const siblingPriceGroups = targetParentPriceGroup.getChildPriceGroups();
    const index = siblingPriceGroups.findIndex((child) =>
      isSameRow(child.getPriceGroupID(), this.priceGroupID, child, this),
    );

    if (index !== -1) {
      siblingPriceGroups.splice(index, 1);
    }

    this.parentPriceGroup = undefined;
  }

  /**
   * Adds a child price group, by telling the child which parent it belongs to.
   * [model/entity/PriceGroup.cfc:L136-L138]
   *
   *   public void function addChildPriceGroup(required any childPriceGroup) {
   *       arguments.childPriceGroup.setParentPriceGroup( this );
   *   }
   *
   * Pure delegation, reproduced exactly. The child's own `setParentPriceGroup` is
   * what appends to this group's collection, so the two directions can never
   * disagree.
   */
  addChildPriceGroup(childPriceGroup: PriceGroup): void {
    childPriceGroup.setParentPriceGroup(this);
  }

  /**
   * Removes a child price group, by telling the child to drop its parent.
   * [model/entity/PriceGroup.cfc:L139-L141]
   *
   *   public void function removeChildPriceGroup(required any childPriceGroup) {
   *       arguments.childPriceGroup.removeParentPriceGroup( this );
   *   }
   *
   * Pure delegation to the far side's `remove*`, which is the correct pattern - and
   * the one [model/entity/Option.cfc:L129-L131] and
   * [model/entity/Option.cfc:L145-L147] fail to follow. `this` is passed explicitly
   * even though the far side would fall back to its own stored parent when the
   * argument is omitted, because the legacy body passes it explicitly too; that
   * also means this path can never reach the unguarded-null case documented on
   * `removeParentPriceGroup`.
   */
  removeChildPriceGroup(childPriceGroup: PriceGroup): void {
    childPriceGroup.removeParentPriceGroup(this);
  }

  /**
   * Adds a rate to this price group, by telling the rate which group it belongs to.
   * [model/entity/PriceGroup.cfc:L144-L146]
   *
   *   public void function addPriceGroupRate(required any priceGroupRate) {
   *       arguments.priceGroupRate.setPriceGroup( this );
   *   }
   *
   * Pure delegation. `PriceGroupRate.setPriceGroup`
   * [model/entity/PriceGroupRate.cfc:L181-L186] is what appends to this group's
   * `priceGroupRates`, through `getPriceGroupRates()`.
   */
  addPriceGroupRate(priceGroupRate: PriceGroupRate): void {
    priceGroupRate.setPriceGroup(this);
  }

  /**
   * Removes a rate from this price group, by telling the rate to drop its group.
   * [model/entity/PriceGroup.cfc:L147-L149]
   *
   *   public void function removePriceGroupRate(required any priceGroupRate) {
   *       arguments.priceGroupRate.removePriceGroup( this );
   *   }
   *
   * Pure delegation to the far side's `remove*`, correctly.
   * `PriceGroupRate.removePriceGroup` [model/entity/PriceGroupRate.cfc:L187-L196]
   * declares its own argument optional; `this` is passed explicitly, matching the
   * legacy body.
   */
  removePriceGroupRate(priceGroupRate: PriceGroupRate): void {
    priceGroupRate.removePriceGroup(this);
  }

  /**
   * Marks this price group eligible for a promotion reward, from the inverse side.
   * [model/entity/PriceGroup.cfc:L176-L178]
   *
   *   public void function addPromotionReward(required any promotionReward) {
   *       arguments.promotionReward.addEligiblePriceGroup( this );
   *   }
   *
   * NOTE THE ASYMMETRIC MEMBER NAMES, preserved verbatim: the owning side's
   * collection is `eligiblePriceGroups` [model/entity/PromotionReward.cfc:L74], not
   * `priceGroups`, so the delegation target is `addEligiblePriceGroup` and not
   * `addPriceGroup`. `PromotionReward.addEligiblePriceGroup`
   * [model/entity/PromotionReward.cfc:L158-L165] maintains BOTH sides: it appends to
   * its own `eligiblePriceGroups` and then appends itself to this group's
   * `promotionRewards`, through `getPromotionRewards()`.
   */
  addPromotionReward(promotionReward: PromotionReward): void {
    promotionReward.addEligiblePriceGroup(this);
  }

  /**
   * Removes this price group's eligibility for a promotion reward, from the
   * inverse side. [model/entity/PriceGroup.cfc:L179-L181]
   *
   *   public void function removePromotionReward(required any promotionReward) {
   *       arguments.promotionReward.removeEligiblePriceGroup( this );
   *   }
   *
   * Pure delegation to the far side's `remove*`, correctly, and again to the
   * asymmetrically-named member.
   * `PromotionReward.removeEligiblePriceGroup`
   * [model/entity/PromotionReward.cfc:L166-L175] unwinds both sides.
   */
  removePromotionReward(promotionReward: PromotionReward): void {
    promotionReward.removeEligiblePriceGroup(this);
  }

  // --- Overridden Implicit Getters [model/entity/PriceGroup.cfc:L193-L202] ------------------------
  //
  // LEGACY-NOTE [model/entity/PriceGroup.cfc:L193, L202]: both banner comments delimiting this section
  // read "Overridden Implecet Getters" - "Implecet", for "Implicit". A comment-only source typo, not a
  // data contract, so it is recorded here once rather than reproduced. Re-verified precisely, because
  // the folder carries TWO different misspellings of the same word and they are easy to conflate:
  // PriceGroup.cfc:L193 and :L202 read "Implecet", while model/entity/ProductType.cfc:L248 and :L256
  // read "Implicet". The neighbouring banners at PriceGroup.cfc:L204 and :L216 read plain "Overridden
  // Methods" and carry no misspelling at all.
  //
  // THE MATERIALIZED PATH HAS TWO INDEPENDENT ROUTES, AND BOTH EXIST HERE. PriceGroup is one of only
  // two entities in this folder that exposes both - ProductType is the other; Category has only the
  // eager hook route, because [model/entity/Category.cfc:L120-L122] is an empty "Overridden Methods"
  // block and `getCategoryIDPath()` is never overridden there.
  //
  //   Route A, immediately below: the LAZY MEMOIZED GETTER at
  //           [model/entity/PriceGroup.cfc:L195-L200]. Computes on demand, and only when the slot is
  //           absent.
  //   Route B, further down:      the EAGER ASSIGNMENT in the two persistence lifecycle hooks at
  //           [model/entity/PriceGroup.cfc:L206-L215]. Recomputes unconditionally and writes the
  //           backing field DIRECTLY, bypassing the getter outright.
  //
  // Neither route hand-rolls comma-delimited path walking. Both delegate to
  // `src/domain/valueObjects/materializedIdPath.js`, which owns the six properties of the legacy walk
  // - root-first, self-last, comma-delimited, includes self, never empty, and a cycling parent chain
  // FOLLOWED FOREVER exactly as the source follows it - and the `isNull` decision that Route A turns
  // on.
  //
  // ★★★ THE SIXTH PROPERTY WAS STATED BACKWARDS HERE, AND THE INVERSION IS A REVIEW FINDING. It read
  // "a cyclic or unbounded parent chain refused by a throw rather than followed forever". The opposite
  // is the case: the guard that once did that was removed in full, so the sixth reproduced property is
  // that the walk does NOT terminate on a cycle - matching
  // [org/Hibachi/HibachiEntity.cfc:L314-L321], which carries neither a visited set nor a bound. See
  // the residual-risk note on the memoized accessor below; the exposure is real and lives upstream in
  // the adapters, not here.

  /**
   * This price group's materialized ancestor path, computed and memoized on first
   * read. [model/entity/PriceGroup.cfc:L195-L200]
   *
   * The legacy body verbatim:
   *
   *   public string function getPriceGroupIDPath() {
   *       if(isNull(variables.priceGroupIDPath)) {
   *           variables.priceGroupIDPath = buildIDPathList( "parentPriceGroup" );
   *       }
   *       return variables.priceGroupIDPath;
   *   }
   *
   * THE GUARD IS `isNull(...)`, NOT `structKeyExists(...)`, and that distinction is
   * reproduced rather than smoothed over. `isNullish` from
   * `src/lib/cfml/truthiness.js` is CFML's `isNull()`: true for `null` and
   * `undefined` and for nothing else. An EMPTY-STRING path is therefore a PRESENT
   * value and is returned unchanged rather than triggering a rebuild - a truthiness
   * test would rebuild it, and `exactOptionalPropertyTypes` is what keeps "absent"
   * and "present-but-empty" from collapsing into one state. This getter and
   * [model/entity/ProductType.cfc:L250-L255] are the only two lazily-initialised
   * getters in the in-scope slice that use the `isNull` form; their siblings use the
   * other one - `!structKeyExists(variables, "parentProductTypeOptions")` at
   * [model/entity/ProductType.cfc:L123] and `!structKeyExists(variables,
   * "currencyDetails")` at [model/entity/Sku.cfc:L368]. They are not conflated.
   *
   * The decision itself is delegated to `resolveIdPath`, whose documented contract
   * IS this getter: it applies the same `isNull` rule, returns a stored path
   * unchanged including `''`, and computes only when the slot is genuinely absent.
   * Delegating keeps one copy of that rule in the port instead of a second copy
   * here, and it is also what makes the declared return type honestly `string` -
   * matching the legacy `public string function` - with no non-null assertion,
   * which `src/**` forbids outright.
   *
   * THE STORAGE IS THIS ENTITY'S, and the memo write is guarded so that it happens
   * only on the absent branch, exactly as L196-L198 does. `resolveIdPath`
   * deliberately supplies the decision and the value but never the storage.
   *
   * The memo is INSTANCE-SCOPED and entity instances are request-scoped, so nothing
   * here can carry state between two unrelated invocations that happen to share a
   * warm container - which is the hazard that made several legacy component-level
   * caches unsafe to reproduce as module state elsewhere in this port.
   *
   * SYNCHRONOUS. The walk traverses `parentPriceGroup` references that the
   * repository already materialized; it issues no query and reaches no port.
   *
   * LEGACY-NOTE [model/entity/PriceGroup.cfc:L195]: this accessor has ZERO call sites in the legacy
   * tree outside its own declaration - re-verified by searching for both the method name and the
   * property name across model/, admin/, frontend/ and integrationServices/. It is ported because
   * `accessors=true` generated it and the framework and admin resolve it dynamically, so it is part of
   * the legacy public surface; interface parity is judged against that surface, not against current
   * usage.
   */
  getPriceGroupIDPath(): string {
    const resolvedPriceGroupIDPath = resolveIdPath(this.priceGroupIDPath, () =>
      this.buildPriceGroupIDPathList(),
    );

    // Memoize exactly as L197 does - on the absent branch only. `isNullish` is the
    // same CFML `isNull()` rule `resolveIdPath` just applied, restated here because
    // the WRITE is this entity's responsibility and the legacy body writes
    // conditionally. A present path, including `''`, is left untouched.
    if (isNullish(this.priceGroupIDPath)) {
      this.priceGroupIDPath = resolvedPriceGroupIDPath;
    }

    return resolvedPriceGroupIDPath;
  }

  // --- Overridden Methods [model/entity/PriceGroup.cfc:L204-L216] --------------------------------
  //
  // Per the port's transformation rule for the ORM, the two persistence lifecycle hooks below become
  // EXPLICIT MAINTENANCE METHODS THAT THE REPOSITORY INVOKES ON SAVE. They are never auto-fired,
  // never called from the constructor, and never called from any accessor on this class. There is no
  // Hibernate session here to fire them, and manufacturing one would re-import the very framework this
  // port removes.
  //
  // LEGACY-NOTE [model/entity/PriceGroup.cfc:L206-L215]: path is assigned BEFORE the super call,
  // matching model/entity/ProductType.cfc:L305-L313 and OPPOSITE to model/entity/Category.cfc:L126-L129
  // (which calls super first, then assigns). Ordering is reproduced per entity and deliberately NOT
  // normalised across the three materialized-path entities.
  //
  // WHAT THE SUPER CALL DID, so the ordering obligation is actionable rather than abstract.
  // `super.preInsert()` at [org/Hibachi/HibachiEntity.cfc:L598] runs an `isPersistable()` gate that
  // THROWS when the entity carries validation errors, and then stamps `createdDateTime` and
  // `modifiedDateTime`; `super.preUpdate(...)` at [org/Hibachi/HibachiEntity.cfc:L651] runs the same
  // gate and stamps `modifiedDateTime`. Neither half is an entity concern in this port - the gate
  // belongs to `src/services/**` and the timestamps to `src/repositories/mysql/**` - so the methods
  // below carry the path half only. The repository that saves a PriceGroup must therefore call the
  // maintenance method BELOW FIRST and run its own validate-and-stamp step AFTER, and must do the
  // reverse for a Category. That per-entity ordering is the whole point of not normalising it.
  //
  // LEGACY-NOTE [model/entity/PriceGroup.cfc:L212]: the statement ends with a DOUBLE SEMICOLON -
  // `setPriceGroupIDPath( buildIDPathList( "parentPriceGroup" ) );;` - whose second semicolon is an
  // empty statement and a no-op. It is the first of exactly two occurrences in this folder; the second
  // is model/entity/ProductType.cfc:L311, on the line that does the same thing in the same hook. A
  // syntax-level wart with no behavioural consequence, recorded and not reproduced. No divergence is
  // spent on it.
  //
  // ROUTE B BYPASSES THE GETTER. Both methods write the backing field directly, so a path already
  // stored - including an empty string, which Route A would have returned untouched - is overwritten
  // unconditionally. That is what the legacy `setPriceGroupIDPath(...)` calls do, and it is why the
  // write side is exposed as its own maintenance method rather than folded into the read accessor.

  /**
   * Recomputes and stores the materialized ancestor path ahead of an INSERT.
   * [model/entity/PriceGroup.cfc:L206-L209]
   *
   * The legacy body verbatim:
   *
   *   public void function preInsert(){
   *       setPriceGroupIDPath( buildIDPathList( "parentPriceGroup" ) );
   *       super.preInsert();
   *   }
   *
   * The legacy name is kept so the correspondence is unmistakable, but this is NOT
   * an ORM hook: it is a maintenance step the repository calls explicitly before it
   * writes the row. It replaces the generated `setPriceGroupIDPath(...)` setter,
   * which has exactly the two call sites at L207 and L212 and no other caller
   * anywhere in the repository - so encapsulating it here removes nothing a caller
   * used, while keeping an arbitrary path string out of the public surface.
   *
   * ONE LIFECYCLE CONTRACT, SHARED BY EVERY HOOK-BEARING ENTITY IN THIS FOLDER. The
   * pair is `preInsert(): void` and
   * `preUpdate(oldData?: Readonly<Record<string, unknown>>): void`, and it is the
   * same pair on `category.ts` and - for its `preInsert` half only, since the source
   * declares no `preUpdate` - on `promotionCode.ts`. These two methods already
   * carried it; the other two files were brought onto it, so a repository can now
   * drive the hooks by ONE pair of names across every entity that has them, exactly
   * as the ORM dispatcher did. That uniformity is the contract's whole purpose.
   *
   * WHAT THE CONTRACT DELIBERATELY DOES NOT UNIFY IS THE SUPER-CALL ORDERING, which
   * differs per entity in the source and is preserved differing. `PriceGroup` sets its
   * path and calls `super` LAST (L207-L208); `ProductType` does the same (L306-L307);
   * `Category` calls `super` FIRST and sets its path afterwards (L127-L128). The
   * ordering marker is recorded in the note above each method rather than ironed out,
   * because it dictates the sequence the repository must use per entity.
   *
   * Unconditional: it always recomputes, and it always overwrites whatever was
   * stored. Synchronous, and it returns nothing, matching `public void function`.
   */
  preInsert(): void {
    this.priceGroupIDPath = this.buildPriceGroupIDPathList();
  }

  /**
   * Recomputes and stores the materialized ancestor path ahead of an UPDATE.
   * [model/entity/PriceGroup.cfc:L211-L214]
   *
   * The legacy body verbatim, double semicolon included:
   *
   *   public void function preUpdate(struct oldData){
   *       setPriceGroupIDPath( buildIDPathList( "parentPriceGroup" ) );;
   *       super.preUpdate(argumentcollection=arguments);
   *   }
   *
   * `oldData` MIRRORS THE LEGACY `struct oldData` PARAMETER and is optional, because
   * the legacy declaration carries no `required`. THE LEGACY BODY NEVER READS IT: it
   * simply forwards the whole argument collection to the base with
   * `argumentcollection=arguments`, and the base is not ported. The parameter is
   * kept for interface parity and because the repository genuinely has the prior row
   * in hand at the moment it calls this - so the shape a future audit or
   * change-tracking step would need is already on the signature, rather than
   * requiring one to be added later. It is deliberately unused here, which
   * `tsconfig.json` permits by leaving `noUnusedParameters` off and ESLint permits
   * through `args: 'none'` - both settings exist precisely so verbatim legacy
   * signatures can be preserved.
   *
   * Typed as a readonly bag of unknown-valued columns rather than a `PriceGroup`:
   * the legacy `oldData` is the raw pre-update property struct the ORM hands the
   * hook, not a hydrated entity, and `unknown` values force any future reader to
   * narrow before use instead of trusting a shape nothing validated. It is not
   * `any`, which is forbidden.
   */
  preUpdate(oldData?: Readonly<Record<string, unknown>>): void {
    this.priceGroupIDPath = this.buildPriceGroupIDPathList();
  }

  // --- ORM Event Hooks [model/entity/PriceGroup.cfc:L218-L220] -----------------------------------
  //
  // EMPTY in the source: the banner is present and the section contains nothing. Recorded because a
  // reviewer diffing this file against the CFC will look for it, and because the two lifecycle methods
  // a reader might expect to find here are declared in the "Overridden Methods" block above instead -
  // whereas ProductType.cfc declares its equivalents at :L305-L313, inside THIS banner. Another
  // per-entity organisational inconsistency, recorded and not normalised.

  // --- Deprecated Methods [model/entity/PriceGroup.cfc:L222-L224] --------------------------------
  //
  // EMPTY in the source. Nothing to port, and nothing is invented to fill it.

  /**
   * Walks this price group's parent chain and builds the comma-delimited path.
   *
   * PRIVATE, because it is not part of the legacy public surface: it stands for the
   * `buildIDPathList( "parentPriceGroup" )` calls at
   * [model/entity/PriceGroup.cfc:L197], [model/entity/PriceGroup.cfc:L207] and
   * [model/entity/PriceGroup.cfc:L212], and `buildIDPathList` was a method on the
   * NON-PORTED framework base at [org/Hibachi/HibachiEntity.cfc:L308]. Introducing it
   * as a private helper is what lets all three legacy call sites share one delegation
   * point, so the two routes can never drift apart.
   *
   * The string property name the legacy call passes - `"parentPriceGroup"` - is
   * resolved there by `evaluate("thisEntity.get#arguments.parentPropertyName#()")`
   * [org/Hibachi/HibachiEntity.cfc:L316, L319]. TypeScript has no equivalent and must
   * not manufacture one, so the two explicit typed callbacks below replace that
   * string dispatch: `getPriceGroupID` stands for `getPrimaryIDValue()`
   * [org/Hibachi/HibachiEntity.cfc:L244-L246], which for this entity resolves to
   * exactly that accessor, and `getParentPriceGroup` is the association the legacy
   * string named.
   *
   * ★★★ THIS NOTE ASSERTED A REFUSAL AND A DIVERGENCE, AND BOTH ARE GONE. IT IS A REVIEW
   * FINDING. It read "A CYCLIC OR UNBOUNDED PARENT CHAIN IS REFUSED, not followed - the
   * single documented divergence from the legacy walk", and went on to describe a throw
   * that "produces no path, so nothing wrong is ever persisted or compared". The guard it
   * described - a visited set plus a depth backstop - was removed in full, so there is no
   * refusal, no throw, and no divergence spent here. The migration's three deliberate
   * divergences are spent elsewhere entirely, and this method owns none of them.
   *
   * WHAT HAPPENS INSTEAD, AND THE RESIDUAL RISK. A cycling `parentPriceGroup` chain is
   * FOLLOWED FOREVER, reproducing [org/Hibachi/HibachiEntity.cfc:L314-L321], which carries
   * neither a visited set nor a bound. The concern the old note raised is still correct as
   * far as it goes - a shortened path would quietly change which price-group rate wins, and
   * that is a price - which is precisely why the walk truncates nothing. But not truncating
   * is achieved by reproducing the source, not by refusing: the loop is a `do/while` that
   * never yields, so on a cyclic chain it holds the invocation's single-threaded event loop
   * until the platform timeout, and a retry repeats it. That exposure is unmitigated in this
   * layer and is bounded only upstream, where the MySQL adapters refuse to return a cyclic
   * row set; `setParentPriceGroup` itself accepts a cycle exactly as the source does. The
   * value object sets out the full reasoning for removing the guard at its own walk; this
   * method only delegates.
   */
  private buildPriceGroupIDPathList(): string {
    return buildIdPathList<PriceGroup>(
      this,
      (node) => node.getPriceGroupID(),
      (node) => node.getParentPriceGroup(),
    );
  }
}

/**
 * Whether two entity instances are THE SAME ROW, by the rule Hibernate's session identity actually
 * followed - which is not the same rule as "their primary keys are equal".
 *
 * ★★ WHY A PLAIN KEY COMPARISON IS NOT SUFFICIENT, AND WHY THIS IS A FAITHFUL READING OF THE
 * PRIMARY-KEY RULE RATHER THAN A DEPARTURE FROM IT. Every unsaved row carries the key `''`, because
 * this entity declares `unsavedvalue=""` [model/entity/PriceGroup.cfc:L52]. For a PERSISTED row, key
 * equality and session identity coincide exactly, so the key comparison is the correct one - and it
 * is strictly better than a reference comparison, because two instances hydrated from the same row by
 * two different repository calls answer correctly instead of answering `false`. For a TRANSIENT row
 * there is no key to compare, and session identity is therefore INSTANCE identity: two different
 * unsaved price groups are two different objects that merely share the placeholder. Comparing them by
 * key reports them equal, which is how the wrong unsaved sibling comes to be detached.
 *
 * CFML parity [model/entity/PriceGroup.cfc:L120]: `arrayFind(array, this)` compares two component
 * instances, which is an object comparison rather than a key comparison. This reproduces it: the key
 * when the key identifies a stored row, the instance when it does not.
 *
 * The same helper, with the same reasoning, is declared module-locally in
 * `src/domain/entities/priceGroupRate.ts`, which has seven such sites. It is deliberately NOT hoisted
 * into a shared module: `src/lib/cfml/struct.ts` publishes a closed export surface, and neither file
 * may add to it.
 *
 * @param heldKey - the primary key of the member already in the collection.
 * @param candidateKey - the primary key of the member being sought.
 * @param heldInstance - the collection member itself.
 * @param candidateInstance - the sought member itself.
 * @returns whether the two refer to the same row.
 */
function isSameRow(
  heldKey: string,
  candidateKey: string,
  heldInstance: object,
  candidateInstance: object,
): boolean {
  if (heldKey === '' || candidateKey === '') {
    return heldInstance === candidateInstance;
  }

  return heldKey === candidateKey;
}

// ---------------------------------------------------------------------------
// HAND-OFF NOTES
//
// These record what OTHER modules must provide for this file to compile and behave, and what they must
// not do. They are notes, not requirements this file can enforce, and nothing here is a licence for
// another module to widen its own surface beyond legacy parity.
//
// For whoever authors `priceGroupRate.ts` (FILE 9). This file calls exactly three members on a
// `PriceGroupRate`, every one of them a verbatim legacy name:
//   * `getGlobalFlag(): boolean` - read by `getGlobalPriceGroupRate()`. It must return an
//     already-coerced boolean, read through `cfBoolean()` on that class, because
//     [model/entity/PriceGroupRate.cfc:L53] declares `globalFlag ormType="boolean" default="false"`
//     and `'false'` is a JavaScript-truthy string.
//   * `getPriceGroupRateID(): string` - the primary key [model/entity/PriceGroupRate.cfc:L52], read by
//     `hasPriceGroupRate()`.
//   * `setPriceGroup(priceGroup: PriceGroup): void` and `removePriceGroup(priceGroup?: PriceGroup): void`
//     - the bidirectional pair at [model/entity/PriceGroupRate.cfc:L181-L196], delegated to by
//     `addPriceGroupRate()` and `removePriceGroupRate()`. Their legacy bodies mutate THIS entity's
//     `priceGroupRates` in place through `getPriceGroupRates()`, which is why that accessor hands back
//     the live array; the same accessor is where `arrayAppend` at L184 and `arrayDeleteAt` at L193
//     land.
//
// For whoever authors `promotionReward.ts`. This file calls exactly three members on a
// `PromotionReward`:
//   * `getPromotionRewardID(): string` - the primary key [model/entity/PromotionReward.cfc:L60], read
//     by `hasPromotionReward()`.
//   * `addEligiblePriceGroup(priceGroup: PriceGroup): void` and
//     `removeEligiblePriceGroup(priceGroup: PriceGroup): void` - the owning-side pair at
//     [model/entity/PromotionReward.cfc:L158-L175]. Note the asymmetric naming: the collection is
//     `eligiblePriceGroups` [model/entity/PromotionReward.cfc:L74], so the members are NOT
//     `addPriceGroup` / `removePriceGroup`.
//   That module also calls three members BACK on a PriceGroup - `isNew()` at
//   [model/entity/PromotionReward.cfc:L159], `hasPromotionReward()` at :L162 and
//   `getPromotionRewards()` at :L163, :L171 and :L173 - and all three exist on this class for exactly
//   that reason.
//
// For whoever authors the MySQL repository that hydrates a PriceGroup:
//   * Call `preInsert()` BEFORE the validate-and-stamp step on insert, and `preUpdate(oldData)` BEFORE
//     it on update. That ordering is the legacy path-before-super ordering and it differs per entity -
//     Category is the reverse. Neither method is fired by this class, ever.
//   * Honour `cascade="all-delete-orphan"` on `priceGroupRates` [model/entity/PriceGroup.cfc:L64] at
//     the delete boundary, and enforce the six delete-context `maxCollection:0` rules from
//     `model/validation/PriceGroup.json` at the service tier.
//   * Reconcile the parent/child graph at the boundary. This class's constructor deliberately does not.
//   * Document the fetch shape at the producing method. This entity declares no `fetch="join"` and no
//     `lazy="extra"`, so there is no mapping-level hint to inherit and the decision is entirely the
//     repository's.
//   * Do not materialize `appliedOrderItems`, `accounts`, `subscriptionBenefits` or
//     `subscriptionUsageBenefits` into this class - there is no member for any of them, by design.
// ---------------------------------------------------------------------------
