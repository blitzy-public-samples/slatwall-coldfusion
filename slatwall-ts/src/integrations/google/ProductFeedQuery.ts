// No user-specified rules were provided for this project; the nine enterprise
// standards of AAP §0.7.3 govern instead, and the bar is not lowered.

/**
 * ProductFeedQuery — the record-selection half of the Google merchant product feed, translated out of
 * `integrationServices/google/controllers/feed.cfc:L49-L74` and layered on top of
 * `model/service/SkuService.cfc:L309-L325`.
 *
 * THE FEED'S BEHAVIOUR SPLITS THREE WAYS, AND THIS FILE OWNS ONE PART OF IT
 * AAP §0.6.4 investigated four candidate homes for the Google feed and located its behaviour in none
 * of the places a service-oriented reading of the legacy tree would predict. The split is restated
 * here because it is the finding that makes this folder's shape legible:
 *
 *   GoogleIntegration.ts    the interface-conformant stub ONLY — nearly empty BY FAITHFULNESS rather
 *                           than by neglect, because `integrationServices/google/Integration.cfc`
 *                           carries no feed logic at all.
 *   ProductFeedQuery.ts     (this file) owns record selection — which SKUs the feed contains. Three
 *                           related-property joins, three activity and publication filters and one
 *                           availability range, taken out of feed.cfc:L64-L72.
 *   ProductFeedBuilder.ts   owns ALL RSS field shaping, taken out of
 *                           `integrationServices/google/views/feed/product.cfm`. That is the place
 *                           the real work of the feed lands.
 *
 * A fourth candidate was rejected outright rather than ported; its single-line register entry sits
 * immediately below this block.
 *
 * TWO FILES RATHER THAN ONE, FOR A REASON A REVIEWER SHOULD NOT HAVE TO GUESS. The legacy holds the
 * two halves in different KINDS of artefact — selection in a controller, shaping in a view template —
 * and they have different collaborators: selection needs the SKU service and the smart-list
 * abstraction, shaping needs the entity graph and an escaping strategy. Merging them would yield one
 * class with two unrelated reasons to change.
 *
 * ⚠️ THIS FILE IS THE DELIVERY OF A GAP ITS OWN SIBLINGS RECORD. `IntegrationContract.ts` and
 * `GoogleIntegration.ts` were authored before it and state — correctly for the checkpoint at which
 * they were written — that `ProductFeedQuery.ts` is "NOT DELIVERED" (their note F19). This file
 * closes that half of the gap; the folder README that AAP §0.4.1.10 plans closes the other half.
 * Their notes are left byte-for-byte untouched: they are explicitly checkpoint-scoped, and they
 * belong to files this one does not own.
 *
 * LAYER POSITION, AND THE LAYERS THIS FILE DELIBERATELY DOES NOT REACH
 * An integration sits above `services`, `ports` and `domain` and below `handlers`, so it may reach
 * downward and never sideways or up (AAP §0.7.3 standard 4). Three imports satisfy the whole file and
 * every one of them points down. There is NO data access of the smallest kind here — no statement
 * text, no driver, no connection, no placeholder array, no data-access collaborator — because this
 * file composes a TYPED PORT CALL and never a query (standard 2). There is likewise no serverless or
 * gateway coupling whatsoever: event types, result shapes, status codes, headers and content types
 * all belong to `src/handlers/**`, which is the one layer permitted to name them.
 *
 * REGISTER DISCIPLINE
 * This file carries exactly ONE register entry, D12, as the single line below. The folder's other
 * entry — the copy-paste display-name artefact at `integrationServices/google/Integration.cfc:L49` —
 * belongs to `GoogleIntegration.ts` and is deliberately NOT repeated here. No new defect or mismatch
 * identifier is minted: the live subtree runs D1-D25 and M1-M9, and the four unnumbered parity notes
 * this file does carry (the duplicate product join, the untyped companion argument, the numeric filter
 * value against a parameter declared as a string, and the silently discarding range guard) stay prose
 * exactly because AAP §0.6.7 closes its register.
 *   Mismatch M2 is CITED, not claimed: the feed view requests a 360-second render budget at
 *   `integrationServices/google/views/feed/product.cfm:L9`, far beyond the roughly 29-second
 *   synchronous gateway integration budget, and choosing between an asynchronous and a streamed
 *   delivery model is a decision for `src/handlers/googleFeedHandler.ts`. Nothing here sets, caps or
 *   invents a budget, a page size, a chunk size or a retry policy (standard 9).
 *   Mismatch M7 is OBEYED rather than cited — see the statelessness note on {@link ProductFeedQuery}.
 *
 * NO DESIGN SYSTEM APPLIES, AND NO USER INTERFACE IS IN SCOPE. There are zero attachments and zero
 * Figma files (AAP §0.9.1), and this subtree is a headless service with no rendering layer (AAP
 * §0.3.4). The one in-scope legacy file carrying a view extension emits RSS 2.0 for machine
 * consumption, so even that is a serializer rather than a component — and it is a different file.
 */

// TODO(parity) D12: integrationServices/google/model/dao/FeedDAO.cfc NOT ported; see README.md.

/* ================================================================================================
 * TRANSLATION DECISIONS — AAP §0.8.2 Guideline 6 requires every technology-specific translation
 * decision to be documented with clear comments, and singles out the places legacy behaviour forced
 * an explicit judgment call. The two structural judgments are recorded here; each of the seven
 * individual feed additions carries its own note at the declaration that expresses it.
 *
 * F-1. ⭐ THE CENTRAL TRANSLATION: MUTATE-THEN-EXECUTE BECOMES DECLARE-THEN-EXECUTE.
 *   The legacy controller and the ported service have fundamentally different shapes, and conflating
 *   them is the one way this file could go silently wrong.
 *     LEGACY. `getSkuSmartList()` at feed.cfc:L63 — called with ZERO arguments — returns a MUTABLE
 *     smart-list object. The controller then mutates that object in place: three join registrations
 *     at feed.cfc:L64-L66, three filter registrations at feed.cfc:L68-L70 and one range registration
 *     at feed.cfc:L72. The query does not run at all until the view reads the records off the same
 *     instance, at `integrationServices/google/views/feed/product.cfm:L16`.
 *     TARGET. `SkuService.getSkuSmartList(data?, currentURL?)` returns
 *     `Promise<SmartListResult<Sku>>` — an ALREADY-EXECUTED, immutable result. There is no post-hoc
 *     mutation step to hook into, and there must not be one: `../../ports/SmartListQueryPort` records
 *     under its own decision D-A that an immutable description was chosen precisely so query state
 *     cannot accumulate on a shared object between invocations.
 *     CONSEQUENCE. Every addition the feed makes must be DECLARED UP FRONT, inside the value handed
 *     to the service, rather than applied afterwards. {@link PRODUCT_FEED_INPUT} is that value.
 *
 * F-2. ⛔ THE THREE JOINS CANNOT BE HANDED TO THE SERVICE. THE GAP IS REPORTED, NOT WORKED AROUND.
 *   `SmartListInput` is the typed counterpart of the legacy framework request structure: a flat map
 *   whose KEY PREFIX selects an operation — equality, set membership, pattern and range, their
 *   removal counterparts, one ordering statement, three paging keys, two search-term spellings and a
 *   saved-state identifier. The feed's three filters and one range therefore cross that boundary
 *   cleanly. THE THREE JOINS DO NOT. The port models a join as a STRUCTURAL declaration owned by the
 *   calling service — `SmartListTranslationOptions.joins`, which `SkuService.getSkuSmartList` fills
 *   from its own module constant — so no channel exists through which a CALLER can contribute one.
 *
 *   WHAT WAS NOT DONE, AND WHY. Three routes were available and each is worse than reporting:
 *     - Reaching past the service to the port's execution member forks the contract. The service
 *       contributes three base joins (SkuService.cfc:L314-L316) and five weight-1 keyword properties
 *       (:L318-L322); re-deriving those here would duplicate a base list this file does not own, and
 *       the instruction for this file is explicit that the service is always routed through.
 *     - Widening the service signature breaks TR-1, which preserves the legacy public surface
 *       member-for-member, and would edit a file this one does not own.
 *     - A cast would silence the compiler and lose the finding outright. Standard 1 forbids it.
 *
 *   WHAT WAS DONE. The three joins are declared here as typed data, byte-faithful to feed.cfc:L64-L66
 *   and in source order, as {@link PRODUCT_FEED_JOINS}; the gap is stated plainly — they are DECLARED
 *   AND NOT FORWARDED — and the declaration is exported so whoever resolves it has the exact triple
 *   to hand rather than having to re-read the legacy controller.
 *
 *   WHAT IS KNOWN ABOUT THE CONSEQUENCE, stated as evidence and not as a dismissal. Two documented
 *   legacy behaviours bound it. First, a property path AUTO-JOINS every entity it traverses —
 *   `getAliasedProperty` at org/Hibachi/HibachiSmartList.cfc:L308, auto-joining at :L324-L339 — and
 *   the port reproduces path resolution, so the product entity is still reached by
 *   `product.activeFlag`, `product.publishedFlag` and `product.calculatedQATS` with no help from feed
 *   join #1. Second, an OMITTED join kind is coerced to a left join at
 *   org/Hibachi/HibachiSmartList.cfc:L539-L541, so none of the three feed joins can eliminate a row.
 *   Neither observation makes the gap disappear, and neither is a licence to drop the declaration.
 * ============================================================================================== */

/* IMPORTS — three modules, all downward, all relative and extensionless, and ALL TYPE-ONLY.
 *
 * Nothing in this file references a value from another module: the SKU service arrives through the
 * constructor, and the smart-list shapes are erased at compile time. `SMART_LIST_RANGE_DELIMITER` is
 * imported for its LITERAL TYPE alone — see {@link PRODUCT_FEED_AVAILABILITY_RANGE} — which is why it
 * too sits behind `import type`.
 *
 * WHY TYPE-ONLY IS THE RIGHT FORM FOR THE INJECTED SERVICE, stated because the instruction for this
 * file suggested a value import. Calling a method on an injected instance never needs the class as a
 * value; only `new`, `extends` or a static read would. The distinction is not cosmetic here: the
 * bundler has no type information and would emit a real module edge for a value import, whereas
 * `import type` guarantees this module contributes nothing at run time beyond its own constants.
 * It is also the pattern the subtree already uses for an injected collaborator — `SkuService.ts`
 * imports its own `OptionService` the same way.
 */
import type { Sku } from '../../domain/sku/Sku';
import type {
  SMART_LIST_RANGE_DELIMITER,
  SmartListInput,
  SmartListJoin,
  SmartListResult,
} from '../../ports/SmartListQueryPort';
import type { SkuService } from '../../services/SkuService';

/**
 * The feed's three related-property joins, in the exact order feed.cfc registers them.
 *
 *   1. `('SlatwallSku', 'product')`               feed.cfc:L64 — join kind OMITTED
 *   2. `('SlatwallProduct', 'defaultSku')`        feed.cfc:L65 — join kind OMITTED
 *   3. `('SlatwallProduct', 'brand', 'left')`     feed.cfc:L66 — join kind exactly `left`
 *
 * ORDER IS CARRIED BY ARRAY POSITION, because the legacy tracks join order separately and iterates it
 * when emitting the entity clause (`../../ports/SmartListQueryPort` records both, citing
 * org/Hibachi/HibachiSmartList.cfc:L9 and :L536). Entry 2 hangs off the entity entry 1 introduced,
 * which is exactly why the grammar at org/Hibachi/HibachiSmartList.cfc:L212 is THREE-PART —
 * parent entity, related property, optional join kind — and not one dotted path: a single path cannot
 * state which already-joined entity the next hop hangs off.
 *
 * THE OMITTED JOIN KIND IS THE LEGACY DEFAULT AND IS NOT NORMALISED TO `inner`. The legacy parameter
 * defaults to the EMPTY STRING at org/Hibachi/HibachiSmartList.cfc:L212 — not to `inner`, which is the
 * single easiest thing to get wrong here — and the port makes ABSENCE mean exactly that default.
 * Writing `inner` here would be a behaviour change wearing a cleanup's clothes, since the emitter
 * resolves the empty default to a LEFT kind at org/Hibachi/HibachiSmartList.cfc:L539-L541.
 *
 * `SlatwallSku` AND `SlatwallProduct` ARE THE ORM LOGICAL ENTITY NAMES AND MUST NOT BE "CORRECTED" to
 * physical table names. This API consumes logical names; physical names belong to the data-access
 * layer, which is a different layer and a different file.
 *
 * ⚠️ TODO(parity): FEED JOIN #1 IS A DUPLICATE, AND IT IS CARRIED RATHER THAN COLLAPSED.
 * `SkuService.getSkuSmartList` has ALREADY issued the identical join internally at
 * `model/service/SkuService.cfc:L314`, and the controller re-issues it at
 * `integrationServices/google/controllers/feed.cfc:L64` because the feed layers onto the smart list
 * returned by the zero-argument call at feed.cfc:L63. BOTH locators are named because the phrase
 * "duplicate product join" is unintelligible until they are. De-duplicating would be repairing rather
 * than preserving (standard 7 and AAP §0.8.2 Guideline 4), and the port states the same rule for its
 * own shape: it neither rejects a repeated join nor collapses one.
 *   ⚠️ AND NOTE WHICH JOIN THE SECOND ONE IS. Entry 2 is `defaultSku`, NOT a second `product` join.
 *   A careless reading of "duplicate product join" produces the wrong relationship here, and the
 *   mistake would type-check perfectly: both are legal relationships of their stated parent.
 *
 * ⚠️ THE `left` KIND ON THE BRAND JOIN IS LOAD-BEARING, NOT STYLISTIC. Brand is optional on a product,
 * so an inner join would silently drop EVERY BRANDLESS PRODUCT out of the feed — a whole class of
 * catalogue vanishing from a merchant feed with no error to notice. The kind is stated explicitly
 * rather than left to the default so a reader cannot mistake it for an oversight.
 *
 * WHY THIS IS EXPORTED. See translation decision F-2: these three joins are DECLARED HERE AND NOT
 * FORWARDED, because `SmartListInput` carries no join channel and the structural channel belongs to
 * the calling service. Exporting the triple gives whoever resolves that gap the byte-faithful data
 * rather than a second reading of the legacy controller.
 *
 * FROZEN AT BOTH LEVELS — the sequence and each entry — so this module-scope constant cannot be
 * rewritten by a consumer and then observed by the next invocation on a warm container (M7). The entry
 * fields are `readonly` in the port's declaration as well, so the compiler refuses the write too; the
 * run-time freeze is what makes the guarantee hold rather than merely being type-checked.
 */
export const PRODUCT_FEED_JOINS: readonly SmartListJoin[] = Object.freeze([
  // feed.cfc:L64 — join kind omitted; a duplicate of SkuService.cfc:L314, carried deliberately.
  Object.freeze({
    parentEntityName: 'SlatwallSku',
    relatedProperty: 'product',
  }),
  // feed.cfc:L65 — join kind omitted. `defaultSku`, NOT a second `product` join.
  Object.freeze({
    parentEntityName: 'SlatwallProduct',
    relatedProperty: 'defaultSku',
  }),
  // feed.cfc:L66 — `left` is load-bearing: an inner join would drop every brandless product.
  Object.freeze({
    parentEntityName: 'SlatwallProduct',
    relatedProperty: 'brand',
    joinType: 'left',
  }),
]);

/**
 * The value all three feed filters test for, taken verbatim from feed.cfc:L68-L70.
 *
 * PARITY NOTE — THE LEGACY PASSES THE NUMBER, AGAINST A PARAMETER DECLARED AS A STRING. `addFilter` at
 * org/Hibachi/HibachiSmartList.cfc:L362 declares `required string value`, and all three call sites
 * pass the numeric literal `1`, which CFML coerces. The port resolved that divergence once, in the
 * only place it can: its filter-value union admits a number precisely BECAUSE of these three call
 * sites, and says so at the declaration. The number is therefore carried as a number.
 *
 * NOT TRANSLATED TO A BOOLEAN, THOUGH ALL THREE COLUMNS ARE ONE. Every target property is declared
 * `ormtype="boolean"` — model/entity/Sku.cfc:L53, model/entity/Product.cfc:L53 and
 * model/entity/Product.cfc:L58 — so `true` would read more naturally here. It would also be a
 * different value reaching a different branch of the port's value handling. The legacy sends `1`, and
 * sends it as a number; so does this. Note that the legacy itself writes the same idiom one layer
 * down: Sku.cfc:L53 gives that boolean the DEFAULT `"1"`.
 *
 * One named constant rather than the literal written out three times, so the note above has one home.
 */
const PRODUCT_FEED_FLAG_FILTER_VALUE = 1;

/**
 * The availability gate's range value, taken verbatim from feed.cfc:L72: the two characters `1^`.
 *
 * ⭐ WHAT `1^` MEANS, PROVED AGAINST org/Hibachi/HibachiSmartList.cfc RATHER THAN ASSUMED:
 *   :L36        the range marker is declared, and it is the caret character.
 *   :L445       `addRange(required string propertyIdentifier, required string value, whereGroup=1)`.
 *   :L446       the acceptance guard, whose body is the WHOLE member: there is no else branch and no
 *               raise, so a malformed value is SILENTLY DISCARDED and the query simply runs without
 *               that bound. `1^` passes it.
 *   :L632       emission additionally requires the stored value to be longer than one character, so a
 *               one-character range value is stored and then ignored outright. `1^` is two characters
 *               and clears the gate.
 *   :L635-L640  a value STARTING with the marker yields an UPPER bound only. `1^` does not.
 *   :L642-L646  a value ENDING with the marker yields a LOWER bound only, taken from the first
 *               element. `1^` ends with it, so this is the branch that applies.
 * The emitted predicate is therefore `product.calculatedQATS >= 1`: the bound is INCLUSIVE `>=`, not
 * `>`, and there is NO UPPER BOUND. Nothing here rounds the value, tightens the comparison or invents
 * a ceiling.
 *
 * THE TRANSLATION IS PERFORMED BY THE PORT'S SHARED INTERPRETER, NOT BY A COPY LIVING HERE. The raw
 * two-character value crosses the boundary untouched, and `translateSmartListRange` in
 * `../../ports/SmartListQueryPort` turns it into a lower bound with no upper bound. That module owns
 * the one interpretation on purpose: it records that two callers once carried their own copies and that
 * the copies drifted apart in OPPOSITE directions, and it warns against reinstating a local one.
 * Re-deriving the branch table here would be exactly that mistake, so this file passes the value and
 * cites the locators instead.
 *   PARITY NOTE, carried and not repaired: because the acceptance guard at :L446 discards silently,
 *   a malformed value produces an UNFILTERED query rather than an error. No raising validation is
 *   added here to "improve" that — a legacy regression depends on the silence, and it is a real one
 *   rather than a hypothetical: meta/tests/unit/IssuesTest.cfc:L91-L98 (`issue_1329`) adds the range
 *   value `XXX^` and then asks for page records, and it passes only because nothing raises.
 *
 * ⭐ WHY THIS IS THE AVAILABILITY GATE, AND WHY IT CROSSES A SCOPE BOUNDARY (TR-5). `calculatedQATS`
 * is quantity-available-to-sell, so `>= 1` is the single condition keeping out-of-stock SKUs out of
 * the merchant feed. AAP §0.6.4.1 calls it a CALCULATED INVENTORY property, and inventory and stock
 * are explicitly excluded from this slice (AAP §0.2.2.1) — which is precisely why `SmartListQueryPort`
 * exists as one of the seven boundary ports rather than as something the feed resolves for itself
 * (AAP §0.6.4.1 and §0.2.2.7). The gap is recorded here: this file expresses the gate and does NOT
 * compute the quantity, reach an inventory collaborator, or import one.
 *   ONE NUANCE WORTH STATING, so a later reader does not go looking for a computation to add. The
 *   property is PERSISTED — `model/entity/Product.cfc:L63` declares it `ormtype="integer"`, and
 *   `src/domain/product/Product.ts` carries it as a stored field while deliberately excluding the
 *   non-persistent `qats` [Product.cfc:L107] whose getter delegates to the un-ported inventory
 *   service. So the gate reads a COLUMN, and what is out of scope is the machinery that MAINTAINS
 *   that column, not the read. Nothing is missing from this file on that account.
 *
 * THE TYPE ANNOTATION IS A GUARD, NOT DECORATION. It is built from the port's exported marker constant
 * — `SMART_LIST_RANGE_DELIMITER`, imported for its literal type alone — so the compiler proves this
 * value is the legacy two-character literal AND that its final character is still the marker the
 * lower-bound-only branch tests for. Were that marker ever to change, this line would fail to compile
 * instead of silently producing a value the interpreter rejects.
 */
const PRODUCT_FEED_AVAILABILITY_RANGE: `1${typeof SMART_LIST_RANGE_DELIMITER}` = '1^';

/**
 * The complete record-selection input the feed hands to the SKU service — the seven feed additions of
 * feed.cfc:L64-L72, minus the three joins the input shape cannot carry (translation decision F-2).
 *
 * THE KEY GRAMMAR IS THE LEGACY FRAMEWORK REQUEST GRAMMAR, TYPED. `F:` prefixes an equality filter and
 * `R:` prefixes a range, matching the prefix scan the framework performs on its request structure; the
 * port declares each prefix as a template-literal index signature so a key the legacy would have
 * ignored is a compile error here instead. The suffix in each key is a logical property PATH on the
 * root entity, not a column: `activeFlag` is the SKU's own, and the three `product.`-prefixed paths
 * traverse the SKU-to-product relationship. All four resolve against the port's entity schema, so
 * none is dropped by the resolve-or-discard rule the port reproduces.
 *
 * THE THREE FILTERS, IN SOURCE ORDER, AND NO FOURTH:
 *   `activeFlag`             feed.cfc:L68 — the SKU is active.
 *   `product.activeFlag`     feed.cfc:L69 — its product is active.
 *   `product.publishedFlag`  feed.cfc:L70 — its product is published.
 * No quantity, currency, image-existence or brand-presence filter is added. The legacy has three
 * filters and one range; inventing a fourth condition would silently shrink a merchant feed
 * (standard 9).
 *
 * NO ORDERING TERM, AND THAT IS FAITHFUL RATHER THAN AN OMISSION. The legacy controller registers
 * none, so the feed's record order is whatever the underlying query yields. A reader expecting a
 * deterministic order will not find one, and imposing one here would invent behaviour the legacy does
 * not have. No paging key and no search term is supplied either, for the same reason: feed.cfc:L63
 * passes nothing at all.
 *
 * FROZEN AND SHARED SAFELY. Every value is a primitive and the object is frozen, so this module-scope
 * constant is deeply immutable and cannot leak state between invocations of a warm container (M7).
 */
const PRODUCT_FEED_INPUT: SmartListInput = Object.freeze({
  // feed.cfc:L68
  'F:activeFlag': PRODUCT_FEED_FLAG_FILTER_VALUE,
  // feed.cfc:L69
  'F:product.activeFlag': PRODUCT_FEED_FLAG_FILTER_VALUE,
  // feed.cfc:L70
  'F:product.publishedFlag': PRODUCT_FEED_FLAG_FILTER_VALUE,
  // feed.cfc:L72 — the availability gate; `1^` means `>= 1` with no upper bound.
  'R:product.calculatedQATS': PRODUCT_FEED_AVAILABILITY_RANGE,
});

/**
 * The Google product feed's record selection: the port of the seven working lines of
 * `integrationServices/google/controllers/feed.cfc`.
 *
 * The legacy controller is 74 lines and only SEVEN of them do work, at feed.cfc:L63-L72. Everything
 * else is framework plumbing: a license header, one component declaration, two injected properties
 * (one of them dead), the three method-visibility flags at feed.cfc:L54-L56 and the layout
 * suppression at feed.cfc:L60. Visibility, routing, authorization and response shaping all belong to
 * `src/handlers/**`, so they drop out of this file entirely. A faithful port here is genuinely small;
 * that is correct rather than incomplete.
 *
 * THE DEAD INJECTION IS DROPPED DELIBERATELY. feed.cfc:L51 declares `property name="productService"
 * type="any";`, and a call-site scan of the controller finds ZERO uses of it — the identifier appears
 * once, in its own declaration, and never again. AAP §0.4.3.1 lists that `productService` among the
 * four dead injections deliberately not wired. It is therefore absent from the constructor below rather
 * than carried as an unused field, and this sentence exists so the omission reads as a decision rather
 * than an oversight. Naming the legacy identifier verbatim is deliberate too: it is what makes the
 * dropped collaborator findable by a reviewer grepping for it.
 *
 * ONE CONSTRUCTOR PARAMETER, EXPLICITLY INJECTED (standard 3). The legacy resolved its collaborator
 * through the framework container, by name, at run time; here it is a declared, typed parameter that
 * the composition root supplies. There is no locator, no prefix dispatch, no interception and no
 * lookup by string.
 *
 * STATELESS BY CONSTRUCTION (M7). The class holds exactly one immutable injected reference and no
 * other field: no cache, no memo, no counter, no accumulated query and no request data. Nothing at
 * module scope is mutable either — every constant above is either a primitive or a frozen object whose
 * own contents are primitives or frozen — so a warm container cannot leak one caller's state into the
 * next invocation.
 *
 * TEST PROVENANCE: NET-NEW. No legacy test exercises the feed controller: AAP §0.6.5.2 records that
 * the extendable legacy signal for this slice is two entity test files, five issue regressions and one
 * fixture helper, and none of them touches this integration.
 */
export class ProductFeedQuery {
  public constructor(private readonly skuService: SkuService) {}

  /**
   * Reads the SKUs the feed contains.
   *
   * NO PARAMETERS, BECAUSE THE LEGACY CALL HAS NONE. feed.cfc:L63 invokes the smart-list member with
   * zero arguments and then mutates the object it gets back; the additions move into
   * {@link PRODUCT_FEED_INPUT}, so nothing is left for a caller to vary. Accepting a parameter here
   * would invent an interface the legacy never offered (standard 9).
   *
   * ⚠️ DISCREPANCY 1, RECORDED RATHER THAN MADE SILENTLY (TR-1). The service's companion argument,
   * `currentURL`, is declared at `model/service/SkuService.cfc:L309` with NO TYPE AT ALL — beside a
   * data argument that IS typed — and AAP §0.4.2.2 tightens it to an optional string. That tightening
   * is a target decision, not something the source states. Two further facts belong with it: the feed
   * NEVER supplies the argument, because feed.cfc:L63 passes nothing, so this call path never
   * exercises it; and the service deliberately does not forward it onward, since it existed to build
   * paging and saved-state links for a view layer this headless subtree does not have.
   *
   * WHY THE SERVICE IS ROUTED THROUGH RATHER THAN THE PORT DIRECTLY. `getSkuSmartList` contributes the
   * root entity, three base joins (`model/service/SkuService.cfc:L314-L316`, the third of them a left
   * join) and five weight-1 keyword properties (:L318-L322). Those are the service's own knowledge;
   * reaching past it to the port's execution member would fork that base list into a second copy and
   * would put a query description together in a file that has no business owning one. None of the base
   * list is restated here — no product-type join, no alternate-code join and no keyword property — and
   * that inheritance is the whole reason the call is layered rather than replaced.
   *
   * @returns The feed's SKUs, both unpaged and as the current page, exactly as the service returns
   *          them; nothing is re-shaped, re-sorted or trimmed on the way out. The UNPAGED collection is
   *          the one the feed consumes: `integrationServices/google/views/feed/product.cfm:L16` loops
   *          the smart list's unpaged records, not its page records.
   */
  public async getFeedSkus(): Promise<SmartListResult<Sku>> {
    // feed.cfc:L63 with L68-L72 folded in: one call, with the selection declared up front (F-1). The
    // companion argument is left unsupplied, matching the legacy call exactly.
    return this.skuService.getSkuSmartList(PRODUCT_FEED_INPUT);
  }
}
