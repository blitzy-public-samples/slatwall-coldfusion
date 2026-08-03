/**
 * `OptionService` — the Catalog's option and option-group service.
 *
 * Legacy origin: `model/service/OptionService.cfc`. AAP §0.4.1.8 mandates this file, §0.4.2.4 fixes the
 * three DECLARED members and §0.4.2.5 fixes the four SYNTHESIZED members that had no declaration
 * anywhere in the legacy tree, so interface parity is checkable member by member (AAP §0.8.3.1).
 *
 * WHY THE PARITY SURFACE IS SEVEN MEMBERS AND NOT THREE. A reader who opens
 * `model/service/OptionService.cfc` finds three `public` declarations and might reasonably conclude the
 * port is three methods long. It is not, and the reason is IR-1: `onMissingMethod` at
 * `org/Hibachi/HibachiService.cfc:L255-L281` fabricated an implicit surface by prefix, dispatching a
 * `get`-prefixed name at `:L258` and splitting on the `smartlist` suffix at `:L259-L260`. That is why
 * four calls resolve at run time against a component that declares none of them:
 *   - `optionService.getOption(id)`             — `model/service/SkuService.cfc:L75`
 *   - `optionService.getOptionGroup(id)`        — `model/service/ProductService.cfc:L115`
 *   - `optionService.getOptionSmartList()`      — `model/entity/Product.cfc:L341`
 *   - `optionService.getOptionGroupSmartList()` — `model/entity/Product.cfc:L254`
 * TypeScript under `strict` has no equivalent facility, so under IR-1 and TR-3 each of those four is an
 * explicitly declared, typed member below. The dispatcher itself is never ported, and `org/Hibachi/**`
 * is read for contract only and never imported (AAP §0.8.3.2).
 *
 * ⛔ THE CLASS DECLARES EXACTLY SEVEN PUBLIC MEMBERS, AND THREE ADDITIONS WERE WITHDRAWN TO GET BACK
 * TO THAT NUMBER. An earlier revision also declared `getUnusedProductOptionsBounded`,
 * `getUnusedProductOptionGroupsBounded` and `getOptionsByIDs` — two window-at-a-time companions and one
 * identifier-batch loader — each argued for on the ground that it left the parity member it accompanied
 * untouched. That argument is not sufficient and the additions are gone. AAP §0.4.1.8 fixes this file at
 * "All 3 declared public members plus the four synthesized members the slice depends on"; §0.8.3.1 makes
 * the public surface the thing that must be checkable member by member, which a superset defeats; and
 * standard S9 forbids inventing a "default page size, cache, eager load, ordering, batch" the source does
 * not state — a bound and a batch are two of the named examples. A public member with no legacy
 * counterpart is therefore an interface-parity breach whether or not it displaces one, and the surface is
 * now closed at seven. {@link OptionService.getUnusedProductOptions} and
 * {@link OptionService.getUnusedProductOptionGroups} answer the whole list, exactly as
 * `model/dao/OptionDAO.cfc:L51-L116` does; a caller that cannot hold a whole list is an operator concern
 * for whichever adapter implements {@link OptionRepository}, which still declares its own bounded
 * members, and not a reason to widen this service.
 *
 * ⚠️ THE BATCH LOADER'S REMOVAL RESTORED A LEGACY CALL PATTERN AS WELL AS A LEGACY SURFACE.
 * `getOptionsByIDs` existed so `SkuService`'s combination engine could resolve a whole option list in one
 * statement; the legacy resolves it ONE IDENTIFIER AT A TIME, calling `optionService.getOption(id)` per
 * list position at `model/service/SkuService.cfc:L75`. That caller now does the same through
 * {@link OptionService.getOption}, so removing the batch made the port MORE faithful rather than less
 * capable.
 *
 * SYNTHESIS IS REPRODUCED ONLY WHERE IT IS USED. The legacy dispatcher would have answered `newOption`,
 * `saveOption`, `deleteOption`, `countOption`, `listOption`, `exportOption` and `processOption*` just as
 * readily (`org/Hibachi/HibachiService.cfc:L264-L277`). None has a call site in this slice, so none is
 * declared here: AAP §0.4.2.5 states the rule plainly — synthesis is not reproduced wholesale, only
 * where used — and declaring the unused remainder would manufacture a public API the legacy never
 * exercised.
 *
 * NO SAVE OR DELETE MEMBER EXISTS HERE, AND THAT IS NOT AN OVERSIGHT. The save and delete behaviour for
 * both entities is gated by `model/validation/Option.json` and `model/validation/OptionGroup.json`,
 * whose rule sets are owned by `src/validation/rules/option.rules.ts` and
 * `src/validation/rules/optionGroup.rules.ts`, and it is performed by `src/services/BaseService.ts` —
 * the port of the LOCAL overrides at `model/service/HibachiService.cfc:L68` and `:L86` (IR-8).
 *
 * DEPENDENCY UNTANGLING (AAP §0.6.3.4). The legacy component declares exactly two injected properties,
 * and only one of them is real:
 *   - `optionDAO` (`model/service/OptionService.cfc:L51`) — LIVE, two call sites at `:L73` and `:L77`.
 *     It becomes the injected {@link OptionRepository} constructor parameter, replacing both the DI/1
 *     property declaration and the `getOptionDAO()` accessor DI/1 synthesized for it (import rules R1
 *     and R2, AAP §0.4.3.1-§0.4.3.2).
 *   - `productService` (`model/service/OptionService.cfc:L53`) — DEAD INJECTION, zero call sites in the
 *     component. It is deliberately absent from the constructor, from the imports and from this file
 *     entirely. Dropping it is what keeps this service ACYCLIC: `ProductService` consumes
 *     `OptionService`, so wiring the reverse edge would recreate a cycle for a collaborator nothing ever
 *     called.
 * The second constructor parameter, {@link SmartListQueryPort}, has no legacy property to correspond to
 * precisely BECAUSE the members that need it were synthesized rather than declared — the legacy reached
 * its smart-list factory through inherited framework plumbing at
 * `org/Hibachi/HibachiService.cfc:L26`, not through an injected DAO.
 *
 * M7 — STATELESS BY CONSTRUCTION. Nothing survives between Lambda invocations except module-scope
 * state (AAP §0.6.6 M7), so a service held as a warm-container singleton must own no per-request state.
 * This one owns none: both fields are `private readonly` collaborator references, and the only
 * module-scope values are frozen constants and pure helper functions. It is recorded rather than left
 * implicit because a later maintainer adding a cache here would silently reintroduce cross-request
 * bleed on a warm container — which is precisely where the unscoped loop counter of
 * `model/service/OptionService.cfc:L58` leaked to on a CFC singleton.
 *
 * TEST PROVENANCE — ENTIRELY NET-NEW. No legacy `OptionServiceTest` exists, and the legacy suite
 * contains no service test for any of the four in-scope services (AAP §0.6.5.2), so all seven members
 * below are net-new coverage and no parity with a legacy test is implied (AAP §0.8.3.7). The class is
 * deliberately constructible from two plain object literals, so the planned shared test doubles can
 * satisfy both ports by hand — necessary because the legacy repository vendors no mocking library at
 * all (AAP §0.4.3.6).
 */

import type { ProductOptionFinder, ProductOptionGroupFinder } from '../domain/product/Product';
import type { Option } from '../domain/option/Option';
import type { OptionGroup } from '../domain/option/OptionGroup';
import type {
  SmartListInput,
  SmartListQueryPort,
  SmartListResult,
} from '../ports/SmartListQueryPort';
import type { OptionRepository } from '../ports/repositories/OptionRepository';
import { buildIdentifierQuery, translateSmartListInput } from '../ports/SmartListQueryPort';

/**
 * One entry of a select projection — a display label paired with the value that is submitted.
 *
 * PRODUCED BY THIS SERVICE, THEREFORE DECLARED BY THIS SERVICE. The type is owned by
 * {@link OptionService.getOptionsForSelect}, whose legacy body builds the pair inline at
 * [model/service/OptionService.cfc:L59] as `{name=..., value=...}`. It is declared here rather than
 * in a shared location because AAP §0.4.3.5 forbids module path aliases and a barrel, and the folder
 * inventory of AAP §0.4.1.8 admits no `types.ts` or `common.ts` in `src/services/` (S5 — add
 * nothing).
 *
 * THE TWO KEY NAMES ARE OBSERVABLE OUTPUT, NOT A LOCAL CONVENTION. The legacy rows are consumed
 * as drop-down entries whose renderer keys on the literal lowercase strings `name` and `value`, so
 * renaming either one would yield an entry with an empty label or an empty submitted value. The same
 * constraint is recorded, with its framework locators, on `UnusedOptionRow` in
 * `../ports/repositories/OptionRepository` — which is precisely why this type and that one are
 * STRUCTURALLY COMPATIBLE by design rather than by coincidence. See the OP-1 note on
 * {@link OptionService.getUnusedProductOptions} for why that compatibility is load-bearing.
 *
 * Both members are `readonly`: an entry is a projection computed for display, never an object
 * written back. That also means an `UnusedOptionRow[]` or an `UnusedOptionGroupRow[]` satisfies a
 * `SelectOption[]` without any conversion step, which is the whole point.
 */
export interface SelectOption {
  readonly name: string;
  readonly value: string;
}

/**
 * The ORM logical entity name for an option — `SwOption` rows.
 *
 * Declared at [model/entity/Option.cfc:L49] as `entityname="SlatwallOption"`. The legacy arrives at
 * the same string by a longer route: `onMissingGetSmartListMethod`
 * [org/Hibachi/HibachiService.cfc:L340-L351] strips the `get` prefix and the `SmartList` suffix from
 * the invoked member name to recover `Option`, then `HibachiDAO` prepends the application key to any
 * name not already carrying it, at [org/Hibachi/HibachiDAO.cfc:L104-L106] for the smart-list path
 * and [:L8-L10] for the get path. The application key is `Slatwall`, so the effective name is
 * `SlatwallOption`. Stated as a literal here because the prefixing was a run-time string operation
 * with no purpose other than reconstructing a name the entity metadata already declares (TR-3).
 *
 * This is the LOGICAL entity name, not the physical table name. `SmartListQuery.entityName` is
 * documented as "the ORM logical entity name being queried", and mapping it to a table is the
 * adapter's job; no table name appears anywhere in this file (S2).
 */
const OPTION_ENTITY_NAME = 'SlatwallOption';

/**
 * The ORM logical entity name for an option group — `SwOptionGroup` rows.
 *
 * Declared at [model/entity/OptionGroup.cfc:L49] as `entityname="SlatwallOptionGroup"`, and reached
 * by the legacy through the same prefix reconstruction described on {@link OPTION_ENTITY_NAME}.
 */
const OPTION_GROUP_ENTITY_NAME = 'SlatwallOptionGroup';

/* ================================================================================================
 * THE THREE PROPERTY PATHS PRODUCT'S TWO RELOCATED QUERIES FILTER AND ORDER ON
 * ================================================================================================
 * Written as named constants rather than inline literals for one specific reason: the two product
 * paths differ by exactly one hop, they are used in adjacent members, and an inline literal in the
 * wrong one of the two would be a silent behaviour change that reads as a harmless copy. Naming them
 * makes the difference legible at each use site and confines the strings to one place.
 *
 * These are LOGICAL property paths over the ORM object graph, not columns and not table names —
 * translating a path into joins is `src/adapters/mysql/SmartListQueryBuilder.ts`'s job (S2).
 *
 * HOP COUNTS BELOW COUNT RELATIONSHIP TRAVERSALS, NOT PATH SEGMENTS — the convention already
 * established for `SmartListPropertyIdentifier` in `src/ports/SmartListQueryPort.ts`, where
 * `brand.brandName` is one-hop and `product.productType.productTypeName` is two-hop. So the trailing
 * property name is never a hop, and a path's hop count is its segment count minus one. Stated
 * explicitly because the two conventions differ by exactly one and the counts here are the only thing
 * distinguishing the two product paths in prose.
 * ============================================================================================== */

/**
 * `options.skus.product.productID` — the option-group-side path, at [model/entity/Product.cfc:L256].
 *
 * THREE hops: option group -> its options -> their SKUs -> those SKUs' product. There is no direct
 * option-group-to-product relationship in the schema, so this path is the only way to ask the
 * question; shortening it would answer a different one.
 */
const PRODUCT_VIA_OPTIONS_PATH = 'options.skus.product.productID';

/**
 * `skus.product.productID` — the option-side path, at [model/entity/Product.cfc:L344].
 *
 * TWO hops: option -> its SKUs -> those SKUs' product. One hop shorter than
 * {@link PRODUCT_VIA_OPTIONS_PATH} because an option relates to SKUs directly, through the
 * `SwSkuOption` link table. The two paths are genuinely different and neither is a typo for the other.
 */
const PRODUCT_VIA_SKUS_PATH = 'skus.product.productID';

/**
 * `optionGroup.optionGroupID` — the group restriction, at [model/entity/Product.cfc:L343]. One hop,
 * over the required many-to-one at [model/entity/Option.cfc:L59].
 */
const OPTION_GROUP_ID_PATH = 'optionGroup.optionGroupID';

/**
 * `sortOrder` — the ordering property both relocated queries use, at
 * [model/entity/Product.cfc:L257] and [:L345], in both cases ascending.
 *
 * It is a persistent column on BOTH entities — [model/entity/OptionGroup.cfc:L58] and
 * [model/entity/Option.cfc:L56] — so one constant correctly serves both queries.
 */
const SORT_ORDER_PROPERTY = 'sortOrder';

/**
 * The primary-identifier property of an option, as declared at [model/entity/Option.cfc:L52]
 * (`fieldtype="id"`). Used as the filter property for the identifier lookup in
 * {@link OptionService.getOption}.
 */
const OPTION_ID_PROPERTY = 'optionID';

/**
 * The primary-identifier property of an option group, as declared at
 * [model/entity/OptionGroup.cfc:L52] (`fieldtype="id"`). Used as the filter property for the
 * identifier lookup in {@link OptionService.getOptionGroup}.
 */
const OPTION_GROUP_ID_PROPERTY = 'optionGroupID';

/* ================================================================================================
 * CALLER-INPUT PROJECTION — turning a `SmartListInput` into a `SmartListQuery`.
 *
 * WHY THIS SECTION EXISTS AT ALL, STATED UP FRONT BECAUSE IT LOOKS LIKE SCOPE CREEP OTHERWISE. The
 * two synthesized smart-list members are declared by AAP §0.4.2.5 to accept a `SmartListInput` — the
 * typed form of the untyped data structure the legacy passes as the first argument at
 * [org/Hibachi/HibachiService.cfc:L346-L350] — while both of the port's execution members,
 * `SmartListQueryPort.execute` and `executeRecords`, accept a `SmartListQuery`. Those are two shapes on
 * purpose: one is the flat prefix-keyed map a caller submits, the other is the structured
 * description an adapter compiles. Something has to project the first onto the second, and the
 * member whose signature accepts the input is the only place that holds both types. Skipping the
 * projection would silently DISCARD every filter, order and page bound a caller supplied, which is a
 * real behavioural loss rather than a simplification.
 *
 * WHAT THIS SECTION IS NOT. It is not a port of `org/Hibachi/HibachiSmartList.cfc`, and no line of
 * that component is carried over (AAP §0.8.3.2). The functions below are a DECLARATIVE PROJECTION
 * only: they translate key prefixes into typed members and stop. Everything the legacy did on top of
 * that stays with the adapter, exactly as `../ports/SmartListQueryPort` allocates it —
 * property-identifier and alias resolution, related-property join creation, absent-pagination
 * resolution (the source-declared first record of one and page size of ten at
 * [org/Hibachi/HibachiSmartList.cfc:L39], applied at [:L65-L66]), page-declaration coercion at
 * [:L793-L794], the fallback ordering of [:L729-L741], statement emission and parameter binding. No
 * statement text, table name, column name or placeholder appears anywhere in this file (S2).
 *
 * NO DEFAULT IS INVENTED (S9). When no input is supplied — which is what BOTH real call sites do,
 * at [model/entity/Product.cfc:L254] and [:L341] — the produced query carries its entity name and
 * NOTHING else: no filter, no order, no page size, no distinct flag. That is the exact post-setup
 * state of the legacy object, whose collections are all seeded empty at
 * [org/Hibachi/HibachiSmartList.cfc:L44-L59].
 *
 * S8 — THREE INPUT CONCERNS CANNOT BE MAPPED, AND ARE FLAGGED RATHER THAN FAKED:
 *
 *   1. `savedStateID` IS UNMAPPABLE. The legacy handles it first, ahead of the prefix scan, at
 *      [org/Hibachi/HibachiSmartList.cfc:L93-L95], by loading a previously stored query state out of
 *      SESSION scope — the containers are established as `session.entitySmartList.savedStates` at
 *      [:L41-L42] and read back by the loader at [:L999]. `SmartListQuery` declares no member for it,
 *      and correctly so: a stateless invocation has no session, which is mismatch M7's core
 *      consequence. The key is therefore RECOGNISED (it is part of `SmartListInput`) and DELIBERATELY
 *      NOT ACTED ON here. It is not silently dropped in the sense of being unnoticed — it is
 *      unimplementable above the port, and inventing a session substitute would be inventing
 *      infrastructure the source does not have. A caller supplying it gets an unrestored query.
 *
 *   2. KEYWORD PHRASES ARE NOT MODELLED BY THE PORT. The legacy derives, in addition to the term
 *      array, a cross-product of adjacent-term phrases at [org/Hibachi/HibachiSmartList.cfc:L153-L163]
 *      and stores it separately. `SmartListQuery` carries `keywords` and `keywordProperties` and no
 *      phrase collection, so the phrase derivation is the adapter's to perform from the terms if it
 *      performs it at all. The term array IS projected below, faithfully.
 *
 *   3. THE DISTINCT FLAG IS NOT EXPRESSIBLE THROUGH `SmartListInput`, AND IS THEREFORE NOT SET. Both
 *      in-scope callers switch it on imperatively — [model/entity/Product.cfc:L255] and [:L342] — but
 *      they do so on the smart-list OBJECT the legacy factory returns, whereas the AAP-declared
 *      target signature returns an already-executed `SmartListResult`. `SmartListInput` declares no
 *      member for the flag, so it is left ABSENT here, which `SmartListQuery` documents as meaning
 *      the legacy's seeded false of [org/Hibachi/HibachiSmartList.cfc:L59]. Setting it on the
 *      caller's behalf would be inventing behaviour this service never had: in the legacy the flag is
 *      the CALLER's decision, made after the factory returns. The mandated signature is preserved
 *      exactly as §0.4.2.5 states it rather than widened to accommodate the flag, because interface
 *      parity is the deliverable (AAP §0.8.3.1). Flagged here so the consequence is visible to
 *      whoever ports `model/entity/Product.cfc`.
 * ============================================================================================== */

/* ================================================================================================
 * SMART-LIST TRANSLATION — DELEGATED, NOT DUPLICATED
 * ================================================================================================
 * A LOCAL COPY OF THE ENTIRE `applyData` GRAMMAR USED TO LIVE HERE: the key delimiters and prefix
 * constants, the add/remove filter folding, pattern-value wrapping, range parsing, order-statement and
 * keyword parsing, page-figure acceptance and a query composer. An equivalent copy lived in
 * `./SkuService`, and both restated what `../ports/SmartListQueryPort` now owns.
 *
 * THE GRAMMAR IS ONE LEGACY BEHAVIOUR — `org/Hibachi/HibachiSmartList.cfc` `applyData` — SO IT IS
 * TRANSLATED ONCE. Both smart lists this service exposes now call `translateSmartListInput`, passing
 * only what is genuinely theirs: the entity name and the caller's input. The copies had already
 * diverged before they were consolidated — on the range length gate and on which delimiter the bounds
 * were sliced around — which is precisely the drift a single owner prevents.
 *
 * ⛔ DO NOT REINSTATE A LOCAL TRANSLATOR to add a key or change a precedence rule; extend
 * `../ports/SmartListQueryPort`, where every caller gets the change. That translator also resolves every
 * caller-supplied property path against the port's entity whitelist (SEC-09), so this service's two
 * smart lists inherit the closed-identifier guarantee without a copy here to keep in step. The branded `SmartListPropertyIdentifier` makes that
 * self-enforcing: an unresolved path is not assignable to a filter, so a future local copy could not
 * skip the check and still compile.
 * ============================================================================================== */

/* ================================================================================================
 * The primary-identifier load — WITHDRAWN FROM THIS FILE, NOT FROM THE SERVICE.
 *
 * `buildIdentifierQuery` used to stand here as a private local function, byte-identically in
 * `./ProductService`, with `../config/container.ts` writing the same query out inline a third time.
 * That is the same three-copy drift the paragraph above records for the input translator, so the shape
 * now lives once in `../ports/SmartListQueryPort` and this file imports it; {@link OptionService.getOption}
 * and {@link OptionService.getOptionGroup} call it exactly as before. Its own contract carries the
 * reasoning that used to sit here: why the legacy `onMissingGetMethod` load becomes a single-filter
 * query, why the UNPAGED collection is the faithful view, and why every caller executes it through
 * {@link SmartListQueryPort.executeRecords} so the page and count statements are never issued. No
 * statement text, driver reference or query runner is imported here (S2) — that is unchanged.
 * ============================================================================================== */

/**
 * The Catalog's option and option-group service.
 *
 * SEVEN public members and no eighth: the three declared by `model/service/OptionService.cfc` plus the
 * four the legacy synthesized at run time. The surface is CLOSED at seven — AAP §0.4.1.8 fixes the
 * membership and §0.8.3.1 makes it the artefact a reviewer checks member by member, so a superset is a
 * parity breach even when every added member leaves its neighbour untouched. See the module header for
 * the full provenance, for the three additions that were withdrawn to restore this count, for the
 * dependency untangling that reduced two injected properties to one, and for the M7 statelessness
 * guarantee.
 */
export class OptionService {
  /**
   * Constructs the service from its two collaborators.
   *
   * EXPLICIT CONSTRUCTOR INJECTION, REPLACING TWO SEPARATE RUN-TIME MECHANISMS (S3). The first
   * parameter replaces the DI/1 property at [model/service/OptionService.cfc:L51] together with the
   * `getOptionDAO()` accessor DI/1 synthesized for it (import rule R1). The second replaces the
   * framework plumbing the synthesized smart-list members reached through inheritance at
   * [org/Hibachi/HibachiService.cfc:L26] — never a string-keyed lookup (import rule R2). There is no
   * container, no service locator, no dynamic resolution and no DI library.
   *
   * THE DEAD `productService` INJECTION AT [model/service/OptionService.cfc:L53] IS ABSENT. It has
   * zero call sites in the component (AAP §0.6.3.4), and omitting it keeps this service acyclic —
   * `ProductService` and `SkuService` both consume this one, so the reverse edge would close a cycle
   * for a collaborator nothing ever called.
   *
   * Both fields are `private readonly`, so the instance is immutable after construction and carries
   * no per-request state (M7). Both parameters are declared as INTERFACES, so a plain object literal
   * satisfies either one — which is what makes the NET-NEW unit tests possible without a mocking
   * library (S6).
   *
   * @param optionRepository - The two option queries of `model/dao/OptionDAO.cfc`.
   * @param smartListQueryPort - The paginated dynamic-query abstraction.
   */
  public constructor(
    private readonly optionRepository: OptionRepository,
    private readonly smartListQueryPort: SmartListQueryPort,
  ) {}

  /**
   * Projects options into select entries — label and submitted value, one entry per input option.
   *
   * PORT OF [model/service/OptionService.cfc:L55-L63]:
   *
   *     public array function getOptionsForSelect(required any options){
   *         var sortedOptions = [];
   *         for(i=1; i <= arrayLen(arguments.options); i++){
   *             arrayAppend(sortedOptions,{name=arguments.options[i].getOptionName(),
   *                                        value=arguments.options[i].getOptionID()});
   *         }
   *         return sortedOptions;
   *     }
   *
   * SYNCHRONOUS AND I/O-FREE, AND THE ONLY MEMBER OF THIS SERVICE THAT IS. The legacy body touches
   * neither the data-access object nor any collaborator: it reads two accessors off objects the caller
   * already holds. There is nothing to await, so the target signature returns the array directly
   * rather than a promise. That is a deliberate asymmetry with the other six members, not an
   * oversight — wrapping this in a promise would change the call shape of a pure transformation.
   *
   * `sortedOptions` DOES NOT SORT. The local name is preserved above and below because it is part
   * of the source's own record, but there is NO sort in the legacy body — no `arraySort`, no
   * comparator, no ordered query, nothing. The name is a misnomer, and it is CARRIED rather than
   * corrected in either direction: no sorting is introduced (that would add behaviour, S9), and no
   * deduplication, filtering, locale comparison, case normalisation or trimming either. The input
   * array is not mutated. Input ORDER and CARDINALITY are preserved exactly, so N options in yields N
   * entries out in the same sequence — including duplicates, if the caller passes them.
   *
   * INDEX TRANSLATION, RECORDED. CFML arrays are ONE-BASED and the legacy loop runs
   * `for(i=1; i <= arrayLen(...); i++)` reading `arguments.options[i]`; TypeScript arrays are
   * ZERO-BASED. The target iterates the elements directly with `for...of`, which sidesteps the index
   * entirely while visiting the same elements in the same order. The observable result is identical;
   * only the traversal idiom changes, which the Minimal Change Clause explicitly licenses (AAP
   * §0.8.1).
   *
   * THE UNSCOPED LOOP COUNTER BECOMES BLOCK-SCOPED — A LANGUAGE-LEVEL SAFETY TRANSLATION. The
   * legacy declares its counter WITHOUT `var` at [model/service/OptionService.cfc:L58], so `i` lands
   * in the component's shared `variables` scope. On a DI/1 singleton that scope is shared across
   * concurrent requests, making it the same class of hazard as carried defect D10 in
   * `model/service/ProductService.cfc`. The `for...of` binding here cannot leak: it is scoped to the
   * loop and there is no shared mutable state to leak into (M7). NO NEW DEFECT IDENTIFIER IS MINTED
   * for this, and none is implied — this file introduces nothing beyond what is already carried, and
   * the two registers are stated canonically, and only once, in the header of
   * `src/ports/repositories/SkuRepository.ts`, and BOTH ARE FROZEN AT THE AAP's OWN BOUNDS — AAP
   * 0.6.7's D1-D21 and AAP 0.6.6's M1-M8. Nothing in this port mints an identifier beyond either
   * range; a further source observation is recorded by its `path:Lnnn` locator instead.
   * The change is recorded instead as a deliberate
   * translation decision in the manner AAP §0.8.2 Guideline 6 requires, exactly as the plan itself
   * treats D10.
   *
   * THE LABEL IS THE PLAIN OPTION NAME. `name` comes from the option's own name and nothing else —
   * contrast {@link OptionService.getUnusedProductOptions}, whose label is composed from two names by
   * the repository. The two members produce the same SHAPE with different label SEMANTICS, and
   * harmonising them would change output.
   *
   * A JUDGEMENT CALL ON THE ABSENT NAME, MADE EXPLICITLY. `Option.optionName` is optional in the
   * domain port, because [model/entity/Option.cfc:L54] declares a nullable column and CFML models a
   * null column as a key ABSENT from the object. In the legacy, `{name=<null>}` simply does not create
   * the key, and the drop-down renderer then emits an entry with an EMPTY label — it does not fail and
   * it does not skip the entry. The empty string reproduces that outcome while satisfying
   * `SelectOption.name`, whose type is fixed as a required string. The alternatives were rejected
   * deliberately: skipping such an option would change cardinality, and substituting the identifier or
   * the option code as a fallback label would invent a display rule the source does not have (S9). The
   * identifier needs no such treatment — [model/entity/Option.cfc:L52] declares `unsavedvalue=""
   * default=""`, so it is always a string.
   *
   * TR-1 TIGHTENING, RECORDED RATHER THAN MADE SILENTLY. The legacy parameter is declared
   * `required any options` at [model/service/OptionService.cfc:L55], but the body reads exactly two
   * accessors off each element — the option's name and its identifier — so the observed contract is an
   * array of options. AAP §0.4.2.4 fixes the tightened signature, and it is noted here because a
   * tightening is a narrowing of what callers may pass.
   *
   * TEST PROVENANCE: NET-NEW. No legacy `OptionServiceTest` exists (AAP §0.6.5.2).
   *
   * @param options - The options to project, in the order they should appear. Not mutated.
   * @returns One entry per input option, in input order. Empty when the input is empty.
   */
  public getOptionsForSelect(options: Option[]): SelectOption[] {
    const sortedOptions: SelectOption[] = [];

    for (const option of options) {
      sortedOptions.push({ name: option.optionName ?? '', value: option.optionID });
    }

    return sortedOptions;
  }

  /**
   * Lists the options a product may still be offered, as select entries.
   *
   * PORT OF [model/service/OptionService.cfc:L72-L74]:
   *
   *     public array function getUnusedProductOptions(required string productID,
   *                                                  required string existingOptionGroupIDList){
   *         return getOptionDAO().getUnusedProductOptions(argumentCollection=arguments);
   *     }
   *
   * A PURE PASS-THROUGH IN THE LEGACY, AND A PURE PASS-THROUGH HERE. The legacy body is one
   * statement, forwarding its whole argument collection to the data-access object. Every rule worth
   * preserving therefore lives in `model/dao/OptionDAO.cfc:L51-L92` and is documented on
   * `OptionRepository.findUnusedOptions`: the set-membership filter on the supplied group list, the
   * correlated non-existence guard against the product's SKU options, the two-level row ordering, and
   * the fact that an empty group list legitimately yields an empty result.
   *
   * OP-1 — THE REPOSITORY ROWS ARE RETURNED DIRECTLY, WITH NO RE-PROJECTION. This is the single
   * most important instruction on this member, and the failure mode is silent. The label was already
   * COMPOSED by the data-access object at [model/dao/OptionDAO.cfc:L88], as
   * `{name="#rs.optionGroupName# - #rs.optionName#", value=rs.optionID}` — the owning group's name,
   * then a SPACE, then a HYPHEN-MINUS, then a SPACE, then the option's own name. There is therefore
   * NO `map` call here, no rebuilt object literal and no reach for `optionName`. Mapping the rows
   * would replace a composed two-part label with a bare option name, producing a drop-down in which
   * every group's "Large" looks identical — a change no type check could catch, because
   * `UnusedOptionRow` and {@link SelectOption} are structurally identical BY DESIGN precisely so that
   * the rows pass through untouched.
   *
   * THE PUBLIC ARGUMENT ORDER IS PRESERVED EVEN THOUGH THE STATEMENT BINDS THE OTHER WAY ROUND. The
   * legacy declares `productID` first and `existingOptionGroupIDList` second, at
   * [model/service/OptionService.cfc:L72] and again at [model/dao/OptionDAO.cfc:L52-L53], while the
   * statement binds the group list at [model/dao/OptionDAO.cfc:L68] BEFORE the product identifier at
   * [:L78]. The signature order is what callers depend on and is what AAP §0.4.2.4 fixes, so it is
   * preserved here and the delegation is positional in that same order; reconciling the two orders is
   * the adapter's obligation, recorded on the port. Both parameters are same-typed strings, so
   * swapping them would compile cleanly and return wrong rows — which is why the order is called out
   * rather than assumed.
   *
   * TEST PROVENANCE: NET-NEW. No legacy `OptionServiceTest` exists (AAP §0.6.5.2).
   *
   * @param productID - The product whose SKUs determine what already counts as used.
   * @param existingOptionGroupIDList - Comma-delimited option-group identifiers already on that
   *        product. An empty string is a legal and ordinary input.
   * @returns The qualifying options as select entries, ordered by group name then option name.
   */
  public getUnusedProductOptions(
    productID: string,
    existingOptionGroupIDList: string,
  ): Promise<SelectOption[]> {
    return this.optionRepository.findUnusedOptions(productID, existingOptionGroupIDList);
  }

  /**
   * Lists the option groups not yet present on a product, as select entries.
   *
   * PORT OF [model/service/OptionService.cfc:L76-L78]:
   *
   *     public array function getUnusedProductOptionGroups(required string existingOptionGroupIDList){
   *         return getOptionDAO().getUnusedProductOptionGroups(argumentCollection=arguments);
   *     }
   *
   * A one-statement pass-through, ported as a one-statement delegation. The rows are returned
   * DIRECTLY — no `map`, no sort, no filter, no relabelling — for the same reason spelled out under
   * OP-1 on {@link OptionService.getUnusedProductOptions}.
   *
   * THE LABEL SEMANTICS DIFFER FROM THE SIBLING MEMBER, AND THE DIFFERENCE IS DELIBERATE. Here
   * `name` is the PLAIN group name and `value` is the group's own identifier —
   * [model/dao/OptionDAO.cfc:L113] builds `{name=rs.optionGroupName, value=rs.optionGroupID}` with no
   * composition of any kind. Contrast [:L88], which composes two names into one label. The two
   * members return the same shape carrying different meanings, so neither the labels nor the
   * identifier kinds may be harmonised.
   *
   * AND SO DOES THE SET POLARITY. Both members receive the same group list, and they filter on it
   * with INVERTED predicates: the sibling keeps rows whose group IS IN the list [:L68], this one keeps
   * rows whose group is NOT IN it [:L107]. One token of difference, opposite questions. The
   * consequence for empty input is opposite too: the sibling resolves to no rows, this member resolves
   * to EVERY option group — which is correct, since a product with no groups yet has none used. The
   * asymmetry is carried, not reconciled; the reasoning is recorded on the port.
   *
   * TEST PROVENANCE: NET-NEW. No legacy `OptionServiceTest` exists (AAP §0.6.5.2).
   *
   * @param existingOptionGroupIDList - Comma-delimited option-group identifiers already on the
   *        product. An empty string is a legal and ordinary input, and yields every group.
   * @returns The qualifying option groups as select entries, ordered by group name.
   */
  public getUnusedProductOptionGroups(existingOptionGroupIDList: string): Promise<SelectOption[]> {
    return this.optionRepository.findUnusedOptionGroups(existingOptionGroupIDList);
  }

  /**
   * Loads one option by its identifier, or resolves `null` when no such option exists.
   *
   * IR-1 — EXPLICITLY DECLARED, PREVIOUSLY SYNTHESIZED. There is NO declaration of this member
   * anywhere in `model/service/OptionService.cfc`. It resolved at run time through
   * `onMissingMethod` [org/Hibachi/HibachiService.cfc:L255-L281], which routed the `get` prefix at
   * [:L258] to `onMissingGetMethod` [:L305-L328], which called `get(entityName, id, ...)` at [:L326].
   * The real call sites are [model/service/SkuService.cfc:L75] and
   * [model/service/ProductService.cfc:L130]. AAP §0.4.2.5 mandates the explicit declaration; TR-3
   * mandates that the dispatcher itself never be reproduced.
   *
   * POSITIONAL, SINGLE-ARGUMENT, AND NULL ON NOT FOUND. The dispatcher's docblock states "Ordered
   * arguments only--named arguments not supported" [:L253], and its signature convention is
   * `getXXX(required any ID, boolean isReturnNewOnNotFound = false)` [:L234]. Both real call sites
   * pass the identifier ALONE, so the second argument takes its default of `false`, and
   * [org/Hibachi/HibachiDAO.cfc:L18-L25] then returns nothing at all when the load misses — the
   * new-instance branch at [:L23] is unreachable on this path. This member therefore NEVER creates
   * an option on a miss, and no `isReturnNewOnNotFound` parameter is offered, because no caller in the
   * slice supplies one and offering it would widen the surface beyond the observed contract.
   *
   * The lookup runs through {@link buildIdentifierQuery}; see that function for why a primary-key
   * filter through the query port is the faithful analogue of the legacy primary-key load, and why the
   * unpaged collection is the one read.
   *
   * TEST PROVENANCE: NET-NEW. No legacy `OptionServiceTest` exists (AAP §0.6.5.2).
   *
   * @param optionID - The 32-character identifier of the option to load.
   * @returns The option, or `null` when none matches.
   */
  public async getOption(optionID: string): Promise<Option | null> {
    const records = await this.smartListQueryPort.executeRecords(
      buildIdentifierQuery(OPTION_ENTITY_NAME, OPTION_ID_PROPERTY, optionID),
    );

    return records[0] ?? null;
  }

  /**
   * Loads one option group by its identifier, or resolves `null` when no such group exists.
   *
   * IR-1 — EXPLICITLY DECLARED, PREVIOUSLY SYNTHESIZED, by the same mechanism described on
   * {@link OptionService.getOption}. The real call site is [model/service/ProductService.cfc:L115],
   * inside `processProduct_addOptionGroup`, which resolves the group through this service before
   * attaching it to the product.
   *
   * Identical contract to {@link OptionService.getOption} in every respect that matters: one
   * positional identifier, `null` on a miss, and never a newly created entity. Declared separately
   * rather than generalised into one identifier-typed member, because the legacy surface is
   * per-entity — the dispatcher recovered the entity name from the member name at [:L308] — and
   * because a single generic member would let an option identifier be handed to a group lookup with
   * no compile error.
   *
   * TEST PROVENANCE: NET-NEW. No legacy `OptionServiceTest` exists (AAP §0.6.5.2).
   *
   * @param optionGroupID - The 32-character identifier of the option group to load.
   * @returns The option group, or `null` when none matches.
   */
  public async getOptionGroup(optionGroupID: string): Promise<OptionGroup | null> {
    const records = await this.smartListQueryPort.executeRecords(
      buildIdentifierQuery(OPTION_GROUP_ENTITY_NAME, OPTION_GROUP_ID_PROPERTY, optionGroupID),
    );

    return records[0] ?? null;
  }

  /**
   * Runs a dynamic query over options and returns its materialised outcome.
   *
   * IR-1 — EXPLICITLY DECLARED, PREVIOUSLY SYNTHESIZED. No declaration of this member exists in
   * `model/service/OptionService.cfc`; the legacy resolved it through `onMissingMethod`
   * [org/Hibachi/HibachiService.cfc:L255-L281], whose suffix test at [:L259-L260] routed it to
   * `onMissingGetSmartListMethod` [:L340-L351] and thence to `getSmartList(entityName, data)` at
   * [:L350]. The real call site is `Product.getOptionsByOptionGroup()` at
   * [model/entity/Product.cfc:L340-L347].
   *
   * ⭐ THE CALLER'S INPUT IS PRESERVED UNCHANGED AND NOTHING IS ADDED TO IT. The input is projected
   * onto the query description by {@link translateSmartListInput}, which maps exactly the keys
   * `SmartListInput` declares and adds no filter, no ordering, no page size, no distinct flag and no
   * current-URL behaviour of its own. Called with NO argument — which is precisely what the real call
   * site does at [model/entity/Product.cfc:L341] — the query carries the entity name and nothing
   * else, matching the all-collections-empty state the legacy object is left in by
   * [org/Hibachi/HibachiSmartList.cfc:L44-L59].
   *
   * S8 — ONE CONSEQUENCE FLAGGED FOR WHOEVER PORTS `model/entity/Product.cfc`. The legacy call site
   * receives a mutable smart-list OBJECT and then configures it — distinct at
   * [model/entity/Product.cfc:L342], two filters at [:L343-L344] and an ordering at [:L345] — before
   * reading records at [:L346]. The AAP-declared target signature returns an ALREADY-EXECUTED result,
   * so a caller must express those choices through the input instead. The filters and the ordering are
   * expressible; the distinct flag is NOT, because `SmartListInput` declares no member for it. That
   * gap is recorded in the projection section header rather than closed by widening this signature,
   * because the signature is the parity contract (AAP §0.8.3.1), and rather than closed by switching
   * the flag on here, because in the legacy the flag is the caller's decision and setting it
   * unilaterally would invent behaviour (S9).
   *
   * TEST PROVENANCE: NET-NEW. No legacy `OptionServiceTest` exists (AAP §0.6.5.2).
   *
   * @param input - The caller-supplied query input. Optional, because the real call site supplies
   *        none.
   * @returns The records, the current page, and the count and paging figures derived from them.
   */
  public getOptionSmartList(input?: SmartListInput): Promise<SmartListResult<Option>> {
    return this.smartListQueryPort.execute(
      translateSmartListInput({ entityName: OPTION_ENTITY_NAME, input }),
    );
  }

  /**
   * Runs a dynamic query over option groups and returns its materialised outcome.
   *
   * IR-1 — EXPLICITLY DECLARED, PREVIOUSLY SYNTHESIZED, by the same mechanism described on
   * {@link OptionService.getOptionSmartList}. The real call site is `Product.getOptionGroups()` at
   * [model/entity/Product.cfc:L251-L261], which is also the member that populates the group struct at
   * [:L241-L249] and therefore feeds the group list both unused-option members take as input.
   *
   * The caller's input is preserved unchanged and nothing is added to it, exactly as on
   * {@link OptionService.getOptionSmartList}; the same S8 note about the distinct flag applies, since
   * this call site sets it too, at [model/entity/Product.cfc:L255].
   *
   * TEST PROVENANCE: NET-NEW. No legacy `OptionServiceTest` exists (AAP §0.6.5.2).
   *
   * @param input - The caller-supplied query input. Optional, because the real call site supplies
   *        none.
   * @returns The records, the current page, and the count and paging figures derived from them.
   */
  public getOptionGroupSmartList(input?: SmartListInput): Promise<SmartListResult<OptionGroup>> {
    return this.smartListQueryPort.execute(
      translateSmartListInput({ entityName: OPTION_GROUP_ENTITY_NAME, input }),
    );
  }

  /* ==============================================================================================
   * PRODUCT'S TWO RELOCATED DISTINCT QUERIES
   * ==============================================================================================
   *
   * WHY THESE TWO QUERIES ARE NOT ROUTED THROUGH THE GENERIC PAIR ABOVE.
   * `model/entity/Product.cfc` builds two queries by hand. In the legacy that is unremarkable: the
   * synthesized `get*SmartList` members hand back a MUTABLE SmartList object and the caller configures
   * it before reading. The AAP-declared target signatures instead return an already-executed
   * `SmartListResult`, so a caller cannot configure anything after the fact — and `SmartListInput`,
   * which is the only thing those signatures accept, is the port of the STRING-KEY request protocol
   * and declares no select-distinct member.
   *
   * ⚠️ BE PRECISE ABOUT WHAT IS AND IS NOT EXPRESSIBLE, BECAUSE AN EARLIER REVISION OVERSTATED IT.
   * It said the two queries were "literally inexpressible", which reads as though the port cannot
   * describe them at all. It can: `SmartListQuery` in `../ports/SmartListQueryPort` declares
   * `selectDistinctFlag`, and `src/adapters/mysql/SmartListQueryBuilder.ts` already implements it and
   * cites `model/entity/Product.cfc:L254` and `:L341` — these very two call sites — as the reason it
   * exists. The accurate statement is narrower and is the one that matters: the queries are not
   * expressible through `SmartListInput`, so they are built as `SmartListQuery` values and handed to
   * {@link SmartListQueryPort.execute} directly. No parity signature is widened to accommodate them.
   *
   * ⭐ THE QUERY DEFINITIONS BELONG IN A NAMED, REVIEWABLE PLACE — BUT NOT ON THE SERVICE CLASS.
   * Two constraints pull in opposite directions and both are satisfied below rather than one being
   * sacrificed:
   *   • They must NOT be inlined into `src/config/container.ts`. That would put three pieces of real
   *     business logic — a DISTINCT projection, an exact multi-hop filter path, and an ordering other
   *     queries depend on — inside dependency wiring, where nothing tests it and no reader looks for it.
   *   • They must NOT be public members of {@link OptionService}, and the reason is WHOSE QUESTION THEY
   *     ANSWER, not how many members the class would then have. Both port ENTITY members —
   *     `Product.getOptionGroups()` [model/entity/Product.cfc:L251-L261] and
   *     `Product.getOptionsByOptionGroup()` [:L340-L347] — so the legacy does not put them on this
   *     service and neither does this port. An earlier revision put them on the class, which is what the
   *     review flagged.
   *
   *     ⚠️ AND THE MEMBERSHIP ARGUMENT REINFORCES THE OWNERSHIP ONE RATHER THAN COMPETING WITH IT.
   *     AAP §0.4.2.4 declares THREE public members and AAP §0.4.2.5 adds FOUR synthesized ones; that IS
   *     the whole surface, so an eighth member widens a contract the AAP freezes. An intermediate
   *     revision of this note withdrew that reading on the ground that "an arity budget is not what the
   *     AAP freezes — SIGNATURES are", and used the three additive members then present as its proof.
   *     That inverted the evidence: the additions were the defect, not the licence. AAP §0.8.3.1 asks
   *     for parity "checkable method-by-method", which a superset defeats however carefully each extra
   *     member is documented, and the three have since been withdrawn. Both readings therefore now point
   *     the same way — these two queries answer the ENTITY's question and would not belong on this class
   *     even if the surface had room for them.
   * The resolution is MODULE SCOPE in this file: {@link findProductOptionGroups} and
   * {@link findProductOptionsByOptionGroup} below, bound together by
   * {@link createProductOptionFinders}. They stay reviewable, testable and citable against the legacy
   * line that specifies each one, and they stay out of the wiring.
   *
   * ⭐ THESE BYPASS `SmartListInput` AND BUILD `SmartListQuery` DIRECTLY, and that is the faithful
   * shape rather than a shortcut. `SmartListInput` is the port of the legacy DATA-KEY interpreter at
   * [org/Hibachi/HibachiSmartList.cfc:L100-L133] — the `F:`, `R:`, `P:` string-key protocol an admin
   * request arrives in. Neither product query goes anywhere near that protocol: both configure the
   * object through direct method calls. Routing them through the string-key form would be inventing an
   * encode/decode round trip the legacy never performs.
   *
   * ⭐ BOTH READ `getRecords()`, NOT `getPageRecords()` — [model/entity/Product.cfc:L258] and [:L346].
   * So both return `result.records`, the FULL matching set, and neither applies pagination. Returning
   * the page instead would silently truncate to the default page size, which for a product with many
   * option groups would drop real rows with nothing to signal it.
   *
   * ⚠️ NO MEMOISATION IS CARRIED, AND THE ASYMMETRY IS DELIBERATE. `getOptionGroups` caches into
   * `variables.optionGroups` at [model/entity/Product.cfc:L252-L259] while `getOptionsByOptionGroup`
   * caches nothing at all [:L340-L347]. Per AAP §0.6.6 mismatch M7, any memoisation in the target must
   * be "scoped to the request object rather than the module, to avoid cross-tenant bleed on a warm
   * container" — a service-held cache is exactly the module-scope bleed that forbids. The entity keeps
   * ownership of its own lazy caching; these members are plain queries, and each call executes.
   * ============================================================================================ */
}

/* ================================================================================================
 * THE TWO PRODUCT-SCOPED OPTION QUERIES — MODULE SCOPE, NOT SERVICE MEMBERS
 * ================================================================================================
 * Relocated out of {@link OptionService} because they answer an ENTITY's question rather than the
 * service's — `Product.getOptionGroups()` and `Product.getOptionsByOptionGroup()` — and not because of
 * any limit on how many members the service may declare. The reasoning for the placement, and for building
 * `SmartListQuery` values rather than routing through `SmartListInput`, is recorded once on the
 * section comment inside the class and is not repeated here.
 *
 * ⛔ THESE ARE NOT A NEW CAPABILITY AND NOT A WIDER CONTRACT. Both were already present at this
 * checkpoint, as public members; only their HOME changed. The queries, the filter paths, the DISTINCT
 * projection, the ordering and the full-set (non-paginated) read are byte-for-byte what they were, so
 * `Product.getOptionGroups` and `Product.getOptionsByOptionGroup` observe identical behaviour.
 *
 * ⭐ THE PORT ARRIVES AS A PARAMETER, WHICH IS WHY THESE ARE TESTABLE WITHOUT A DATABASE. Each takes
 * {@link SmartListQueryPort} explicitly (S3 — no service locator, no module-scope singleton, nothing
 * resolved by name), so a hand-written double satisfies them exactly as it satisfies the service.
 * ============================================================================================== */

/**
 * Resolves the option groups in use by a product — the query relocated out of
 * [model/entity/Product.cfc:L251-L261].
 *
 * Supplies {@link ProductOptionGroupFinder.getOptionGroupsForProduct} for `Product.getOptionGroups`,
 * bound to the port by {@link createProductOptionFinders}. The three semantics
 * that travel with it, each carried verbatim from its legacy line:
 *   1. DISTINCT projection — `setSelectDistinctFlag(1)` at [:L255]. An option group reachable through
 *      several of the product's SKUs is returned ONCE.
 *   2. The filter path is `options.skus.product.productID` at [:L256] — THREE hops, from the option
 *      group out through its options, their SKUs and those SKUs' product. There is no direct
 *      option-group-to-product relationship, so a shorter path is not a simplification but a
 *      different question with a different answer.
 *   3. Ordering is `sortOrder` ASCENDING at [:L257] — the order callers observe, and the order the
 *      sorted-SKU query at `model/dao/SkuDAO.cfc:L172-L204` independently relies on.
 *
 * TEST PROVENANCE: NET-NEW. No legacy `OptionServiceTest` exists (AAP §0.6.5.2).
 *
 * @param smartListQueryPort - The paginated dynamic-query boundary (AAP §0.2.2.7).
 * @param productID - The product's 32-character identifier (IR-6).
 * @returns The product's option groups: distinct, ordered by `sortOrder` ascending, unpaginated.
 */
export async function findProductOptionGroups(
  smartListQueryPort: SmartListQueryPort,
  productID: string,
): Promise<OptionGroup[]> {
  const result = await smartListQueryPort.execute({
    entityName: OPTION_GROUP_ENTITY_NAME,
    selectDistinctFlag: true,
    whereGroups: [
      { filters: [{ propertyIdentifier: PRODUCT_VIA_OPTIONS_PATH, value: productID }] },
    ],
    orders: [{ propertyIdentifier: SORT_ORDER_PROPERTY, direction: 'ASC' }],
  });
  return [...result.records];
}

/**
 * Resolves the options of one option group that are in use by a product — the query relocated out of
 * [model/entity/Product.cfc:L340-L347].
 *
 * Supplies {@link ProductOptionFinder.getOptionsForProductByOptionGroup` } for
 * `Product.getOptionsByOptionGroup`, bound to the port by {@link createProductOptionFinders}. The three semantics:
 *   1. DISTINCT projection — [:L342].
 *   2. TWO filters in ONE where group, applied in the legacy's order: `optionGroup.optionGroupID` at
 *      [:L343] then `skus.product.productID` at [:L344]. Both land in the default group, which
 *      [org/Hibachi/HibachiSmartList.cfc:L590] conjoins — so this is "options of THIS group that are
 *      used by THIS product", not a union of the two conditions. Note the product path here is TWO
 *      hops (`skus.product.productID`), one shorter than the option-group query's, because an option
 *      relates to SKUs directly; the two paths are genuinely different and neither is a typo.
 *   3. Ordering is `sortOrder` ASCENDING — [:L345].
 *
 * TEST PROVENANCE: NET-NEW. No legacy `OptionServiceTest` exists (AAP §0.6.5.2).
 *
 * @param smartListQueryPort - The paginated dynamic-query boundary (AAP §0.2.2.7).
 * @param optionGroupID - The option group to restrict to; the legacy FIRST filter.
 * @param productID - The product's 32-character identifier; the legacy SECOND filter.
 * @returns The matching options: distinct, ordered by `sortOrder` ascending, unpaginated.
 */
export async function findProductOptionsByOptionGroup(
  smartListQueryPort: SmartListQueryPort,
  optionGroupID: string,
  productID: string,
): Promise<Option[]> {
  const result = await smartListQueryPort.execute({
    entityName: OPTION_ENTITY_NAME,
    selectDistinctFlag: true,
    whereGroups: [
      {
        filters: [
          { propertyIdentifier: OPTION_GROUP_ID_PATH, value: optionGroupID },
          { propertyIdentifier: PRODUCT_VIA_SKUS_PATH, value: productID },
        ],
      },
    ],
    orders: [{ propertyIdentifier: SORT_ORDER_PROPERTY, direction: 'ASC' }],
  });
  return [...result.records];
}

/**
 * Binds the two module-scope queries to a port and returns the pair of finder capabilities
 * `src/domain/product/Product.ts` asks for.
 *
 * ⭐ ONE FACTORY RATHER THAN TWO OBJECTS, BECAUSE PRODUCT'S MEMBERS ASK FOR BOTH TOGETHER.
 * `Product.getUnusedProductOptionGroups` and `Product.getUnusedProductOptions` each take an
 * option-group finder AND an option finder, so a caller that held two separate objects would pass two
 * arguments that must agree about which port they read. Returning one frozen object satisfying both
 * interfaces removes that possibility.
 *
 * ⭐ FROZEN, AND WITH NO STATE OF ITS OWN. Nothing is memoised here — per AAP §0.6.6 mismatch M7 a
 * cache at this level is exactly the module-scope bleed that is forbidden on a warm container, and the
 * entity keeps ownership of its own lazy caching. Each call executes.
 *
 * @param smartListQueryPort - The paginated dynamic-query boundary (AAP §0.2.2.7).
 * @returns One object satisfying both finder contracts, safe to share for the life of an invocation.
 */
export function createProductOptionFinders(
  smartListQueryPort: SmartListQueryPort,
): ProductOptionGroupFinder & ProductOptionFinder {
  return Object.freeze({
    getOptionGroupsForProduct: (productID: string): Promise<OptionGroup[]> =>
      findProductOptionGroups(smartListQueryPort, productID),
    getOptionsForProductByOptionGroup: (
      optionGroupID: string,
      productID: string,
    ): Promise<Option[]> =>
      findProductOptionsByOptionGroup(smartListQueryPort, optionGroupID, productID),
  });
}

/* ================================================================================================
 * COMPILE-TIME GUARDS — OptionService REALLY SATISFIES PRODUCT'S TWO INJECTED CONTRACTS
 * ================================================================================================
 * `src/domain/product/Product.ts` declares `ProductOptionGroupFinder` and `ProductOptionFinder` and
 * takes each as a parameter, because F9 puts paginated dynamic queries outside the domain layer. Those
 * two interfaces name the capability; the two members above are what provides it.
 *
 * These assignments are the link between the two halves, checked by the compiler rather than asserted
 * in prose. If a member here is renamed, changes an argument's type, or changes its return type, the
 * build fails HERE — at the seam — instead of at whatever future line first tries to wire the service
 * into the entity.
 *
 * The direction is forced and is the correct one: a domain module may not import a service, so the
 * guard cannot live beside the interfaces it checks. It lives here, in the implementor, with a
 * type-only import that erases at compile time — so no runtime dependency is created in either
 * direction and no import cycle is possible even in principle.
 *
 * These are TYPE-LEVEL declarations only. They emit nothing, so the guards cost zero bytes in the
 * bundle.
 *
 * ⭐ THE ASSERTION SHAPE IS DELIBERATE. `type X = A extends B ? true : never` would NOT work: when the
 * relation fails it quietly resolves to `never` and the build stays green, which is a guard that guards
 * nothing. Routing the boolean through {@link SatisfiesContract}, whose parameter is constrained to
 * `true`, means a failed relation yields `false`, `false` is not assignable to `true`, and the compiler
 * reports it.
 *
 * ⭐ WHAT WAS ACTUALLY MEASURED, AND THE ONE THING THESE GUARDS DO NOT CATCH. Each guard was proved to
 * fire by temporarily breaking the implementation and reading the compiler output, then restoring it:
 *
 *   - renaming `getOptionGroupsForProduct`            -> TS2344 on {@link ProductOptionFindersSatisfyGroupFinder}
 *   - renaming `getOptionsForProductByOptionGroup`    -> TS2344 on {@link ProductOptionFindersSatisfyOptionFinder}
 *   - typing `optionGroupID` as `number`              -> TS2344 on {@link ProductOptionFindersSatisfyOptionFinder}
 *   - returning `Promise<Option[]>` from the group finder -> TS2344 on {@link ProductOptionFindersSatisfyGroupFinder}
 *
 * DROPPING A TRAILING PARAMETER DOES NOT FAIL, and that is correct rather than a hole in the guard: a
 * one-argument function is assignable to a two-argument contract in TypeScript for the same reason it is
 * safe in JavaScript — the extra argument is simply ignored. So these guards prove the two members are
 * SUBSTITUTABLE for the interfaces, which is exactly the property a future composition root needs; they
 * do not and cannot prove that `getOptionsForProductByOptionGroup` READS both of its arguments. That
 * second property is behavioural, so it is verified behaviourally instead — by the captured-query
 * assertions that pin both filter predicates and their order.
 * ============================================================================================== */

/**
 * Fails to instantiate unless its argument is exactly `true`.
 *
 * The constraint is the whole mechanism: a `false` argument is not assignable to `true`, so the
 * compiler raises TS2344 at the use site rather than silently producing an unusable type.
 */
type SatisfiesContract<TRelation extends true> = TRelation;

/** `OptionService` provides `Product.getOptionGroups`'s injected capability. */
export type ProductOptionFindersSatisfyGroupFinder = SatisfiesContract<
  ReturnType<typeof createProductOptionFinders> extends ProductOptionGroupFinder ? true : false
>;

/** `OptionService` provides `Product.getOptionsByOptionGroup`'s injected capability. */
export type ProductOptionFindersSatisfyOptionFinder = SatisfiesContract<
  ReturnType<typeof createProductOptionFinders> extends ProductOptionFinder ? true : false
>;
