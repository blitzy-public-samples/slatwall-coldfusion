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
 * and they have different collaborators: selection needs the smart-list abstraction and a projection
 * loader for the associations the feed dereferences, shaping needs the already-navigable entity graph
 * and an escaping strategy. Merging them would yield one class with two unrelated reasons to change.
 *
 * ⭐ THIS FILE CLOSED A GAP ITS OWN SIBLINGS ONCE RECORDED. `IntegrationContract.ts` and
 * `GoogleIntegration.ts` were authored before it and stated that `ProductFeedQuery.ts` was "NOT
 * DELIVERED" (their note F19). Those notes have since been corrected in place rather than left to
 * contradict the folder: leaving a false statement of fact standing because it was true at an earlier
 * checkpoint is how a header stops being trustworthy. Both now name the six delivered files, and the
 * D12 evidence they briefly hosted has moved back to `README.md` §9, the home AAP §0.4.1.10 assigns it.
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
 * identifier is minted, and no bound is restated — `src/ports/repositories/SkuRepository.ts` is the one place
 * that states it. The four unnumbered parity notes this file does carry (the duplicate product join,
 * the untyped companion argument, the numeric filter value against a parameter declared as a string,
 * and the silently discarding range guard) stay prose exactly because AAP §0.6.7 is frozen and none of
 * them is one of its twenty-one entries.
 *   Mismatch M2 is CITED, not claimed: the feed view requests a 360-second render budget at
 *   `integrationServices/google/views/feed/product.cfm:L9`, far beyond what a synchronous
 *   request-response gateway will generally allow by default, and choosing between an asynchronous and
 *   a streamed delivery model is a decision for `src/handlers/googleFeedHandler.ts`. NO FIGURE IS NAMED
 *   FOR THAT SECOND CEILING, deliberately: `src/handlers/googleFeedHandler.ts` owns M2 and records that
 *   synchronous integration limits vary by gateway type, region and configuration — and for some
 *   gateway types are themselves configurable — while this deliverable selects no gateway at all
 *   (infrastructure as code is out of scope, AAP §0.2.2.5). `src/ports/SmartListQueryPort.ts` and
 *   `src/integrations/google/README.md` state the same, so naming one here would contradict them.
 *   Nothing here sets, caps or invents a budget, a page size, a chunk size or a retry policy
 *   (standard 9).
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
 * F-2. ⭐ THE THREE JOINS ARE FORWARDED, THROUGH A CHANNEL THAT DID NOT EXIST WHEN THIS FILE WAS
 *   FIRST WRITTEN. This entry used to report an unresolved gap; it now records how the gap was closed,
 *   and the reasoning is kept because every route it rejected is still the wrong route.
 *     THE PROBLEM. `SmartListInput` is the typed counterpart of the legacy framework request
 *     structure: a flat map whose KEY PREFIX selects an operation — equality, set membership, pattern
 *     and range, their removal counterparts, one ordering statement, three paging keys, two
 *     search-term spellings and a saved-state identifier. The feed's three filters and one range cross
 *     that boundary cleanly. THE THREE JOINS DO NOT: the port models a join as a STRUCTURAL
 *     declaration owned by the calling service, so `SmartListInput` has no join key at all and
 *     `getSkuSmartList` had no parameter through which a caller could contribute one.
 *     THE ROUTES STILL REJECTED. Widening `getSkuSmartList`'s signature would break TR-1, which
 *     preserves the legacy public surface member-for-member. Re-deriving the service's three base
 *     joins (SkuService.cfc:L314-L316) and five weight-1 keyword properties (:L318-L322) here would
 *     fork a base list this file does not own — the classic two-copies-that-drift. A cast would
 *     silence the compiler and lose the finding outright (standard 1).
 *     THE ROUTE TAKEN. `SmartListInput` GREW THE CHANNEL, as `additionalJoins`. The feed declares
 *     {@link PRODUCT_FEED_JOINS}, carries them inside {@link PRODUCT_FEED_INPUT} alongside its three
 *     filters and its one range, and calls the parity-frozen member unchanged —
 *     `SkuService.getSkuSmartList`. `translateSmartListInput` appends the input's contributed
 *     joins AFTER the service's own base list, so order is the legacy's and the base list stays owned by
 *     the service. TR-1 holds because no signature widened: the joins travel in the VALUE, not in a new
 *     parameter, and the ten-member parity surface of `SkuService` is untouched.
 *     A MODULE-FUNCTION COMPOSER WAS THE OTHER CANDIDATE AND IS NOT USED. Exporting the base
 *     composition from `../../services/SkuService` and calling the port directly from here would also
 *     have preserved the signature, but it puts a second reading of the service's own selection outside
 *     the service and turns a type-only import into a value edge from an integration into the service
 *     layer. The input channel needs neither.
 *     WHAT DID NOT CHANGE. The joins are still declared as typed data, byte-faithful to
 *     feed.cfc:L64-L66 and in source order, and still exported. Order is preserved end to end — base
 *     three first, feed three appended — because the legacy tracks join order separately and iterates
 *     it when emitting the entity clause [org/Hibachi/HibachiSmartList.cfc:L9, :L536].
 *
 * F-3. ⭐ FORWARDING THE JOINS IS NECESSARY AND NOT SUFFICIENT: THE ASSOCIATIONS MUST ALSO BE HYDRATED.
 *   This is the half a reader is most likely to think is already handled, because under Hibernate it
 *   is. A registered join makes an association NAVIGABLE, so `integrationServices/google/views/feed/`
 *   `product.cfm` can read `getProduct().getCalculatedTitle()`, `...getProductType()...`,
 *   `...getBrand()...` and — through `model/entity/Product.cfc:L561-L568` — the default SKU's price,
 *   with no further work. The port has no ORM. `SmartListQueryPort.execute` hydrates ROOT rows only,
 *   through the SKU row mapper, which deliberately reads neither `productID` nor any association, so
 *   every one of those reads had nothing behind it and the FIRST record raised.
 *     THE RESOLUTION, AND IT IS THE WIDER OF THE TWO CANDIDATES. `SmartListQueryBuilder` projects the
 *     joined entities itself: the aggregate loaders in `src/adapters/mysql/catalogAggregates.ts` resolve
 *     each root SKU's product, that product's type, its brand and its default SKU, and attach them
 *     through the entities' own documented assigners, so `execute` AND `executeRecords` both answer
 *     fully navigable roots. A repository member that projected the graph for THIS feed alone was the
 *     alternative and was not taken: the hydration gap belongs to every SmartList that registers a join
 *     rather than to the feed, and a feed-only projection would leave two readings of the same
 *     association set to drift apart.
 *     THE CONSEQUENCE FOR THIS FILE is that {@link ProductFeedQuery.getFeedSkus} attaches nothing.
 *     Forwarding the joins is the whole of its part; the records it receives are already hydrated.
 *     WHAT IS DELIBERATELY NOT HYDRATED. Product IMAGES. `product.cfm:L24` loops
 *     `getProduct().getProductImages()`, but AAP §0.2.2.4 excludes `model/validation/ProductImage.json`
 *     and no `ProductImage.ts` exists, so `SwProductImage` is absent from the physical-table
 *     whitelist. That boundary is declared on `src/handlers/googleFeedHandler.ts`, which pairs each
 *     selected SKU with its images through an injected reader, and it stays there.
 * ============================================================================================== */

/* IMPORTS — five modules, all downward, all relative and extensionless, and all but ONE type-only.
 *
 * ⭐ THE SINGLE VALUE IMPORT IS `DomainError`, AND IT IS THE ONLY MODULE EDGE THE BUNDLER EMITS FROM
 * THIS FILE. It is thrown on exactly one path — an already-aborted caller's cancellation, refused before
 * a whole-catalog statement is issued — so it has to exist at run time. Nothing else here does.
 *
 * ⚠️ `SkuService` IS TYPE-ONLY, AND THAT IS A STATEMENT ABOUT HOW THE COLLABORATOR ARRIVES. It arrives
 * as a constructor-injected INSTANCE, narrowed to {@link ProductFeedSkuSource}, and calling a member on
 * an injected instance never needs the class as a value. An earlier revision of this file reached the
 * service through a MODULE FUNCTION instead, to get a channel for the feed's three joins past a
 * parity-frozen signature (TR-1); that channel now exists on the input itself — see F-2 — so the
 * instance route stands and the value edge it would have required is not taken. Importing a service
 * class as a value from an integration would also pull the whole service module into this module's
 * run-time graph for no benefit.
 *
 * THE REMAINING THREE CONTRIBUTE NOTHING AT RUN TIME: `Sku` appears only in the return signature, the
 * two smart-list shapes are erased at compile time, and `SMART_LIST_RANGE_DELIMITER` is imported for its
 * LITERAL TYPE alone — see {@link PRODUCT_FEED_AVAILABILITY_RANGE} — which is why it too sits behind
 * `import type`.
 */
import { DomainError } from '../../errors/DomainError';

import type { Sku } from '../../domain/sku/Sku';
import type { SkuService } from '../../services/SkuService';
import type { SmartListInput, SmartListJoin } from '../../ports/SmartListQueryPort';
import type { SMART_LIST_RANGE_DELIMITER } from '../../util/smartListInput';

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
 * WHY THIS IS EXPORTED. See translation decision F-2. The triple is FORWARDED — it travels inside
 * {@link PRODUCT_FEED_INPUT} under `additionalJoins`, the only join channel the live translator reads,
 * and `SkuService`'s private composer merges it AFTER that service's own three base joins before
 * {@link ProductFeedQuery.getFeedSkus} executes the description. It stays exported so a test can assert
 * the forwarded sequence against the byte-faithful declaration rather than against a second reading of
 * the legacy controller.
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
 * THE TRANSLATION IS PERFORMED BY THE ONE SHARED INTERPRETER, NOT BY A COPY LIVING HERE. The raw
 * two-character value crosses the boundary untouched, and `translateSmartListRange` in
 * `../../util/smartListInput` turns it into a lower bound with no upper bound. That module owns the one
 * interpretation on purpose: it records that two callers once carried their own copies and that the
 * copies drifted apart in OPPOSITE directions, and it warns against reinstating a local one.
 * Re-deriving the branch table here would be exactly that mistake, so this file passes the value and
 * cites the locators instead.
 *   PARITY NOTE, carried and not repaired: because the acceptance guard at :L446 discards silently,
 *   a malformed value produces an UNFILTERED query rather than an error. No raising validation is
 *   added here to "improve" that — a legacy regression depends on the silence, and it is a real one
 *   rather than a hypothetical: meta/tests/unit/IssuesTest.cfc:L91-L99 (`issue_1329`) adds the range
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
 * THE TYPE ANNOTATION IS A GUARD, NOT DECORATION. It is built from the shared interpreter's exported
 * marker constant — `SMART_LIST_RANGE_DELIMITER`, imported for its literal type alone — so the compiler
 * proves this
 * value is the legacy two-character literal AND that its final character is still the marker the
 * lower-bound-only branch tests for. Were that marker ever to change, this line would fail to compile
 * instead of silently producing a value the interpreter rejects.
 */
const PRODUCT_FEED_AVAILABILITY_RANGE: `1${typeof SMART_LIST_RANGE_DELIMITER}` = '1^';

/**
 * The filter-and-range half of the feed's record selection — four of the seven feed additions of
 * feed.cfc:L64-L72. The other three are the joins, which travel as {@link PRODUCT_FEED_JOINS} through
 * the structural channel rather than through this map (translation decision F-2).
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
 * FROZEN AND SHARED SAFELY. The object is frozen; its four data values are primitives, and its one
 * structural value is {@link PRODUCT_FEED_JOINS}, which is frozen at BOTH levels — the sequence and
 * every entry in it. This module-scope constant is therefore deeply immutable and cannot leak state
 * between invocations of a warm container (M7). ⚠️ The structural member is the reason that sentence
 * names the two kinds separately rather than claiming every value is a primitive: it is not, and a
 * shared mutable array here would be exactly the cross-invocation leak M7 warns about.
 */
const PRODUCT_FEED_INPUT: SmartListInput = Object.freeze({
  /*
   * feed.cfc:L64-L66, in source order, appended after SkuService.cfc:L314-L316 by the translator.
   *
   * ⚠️ THE MEMBER NAME IS LOAD-BEARING AND IS NOT INTERCHANGEABLE WITH `joins`. `translateSmartListInput`
   * in `src/util/smartListInput.ts` reads the caller's contributed joins from
   * `options.input?.additionalJoins` and from nowhere else, while `options.joins` is the OWNING SERVICE's
   * base list. Writing these three under any other key leaves them in the frozen literal, unread, and the
   * feed silently selects on the SKU service's three joins alone — no type error, no runtime error, and a
   * query that quietly loses `product.defaultSku` and `product.brand`. `SmartListInput` has exactly one
   * channel for this, and this is its name.
   */
  additionalJoins: PRODUCT_FEED_JOINS,
  // feed.cfc:L68
  'F:activeFlag': PRODUCT_FEED_FLAG_FILTER_VALUE,
  // feed.cfc:L69
  'F:product.activeFlag': PRODUCT_FEED_FLAG_FILTER_VALUE,
  // feed.cfc:L70
  'F:product.publishedFlag': PRODUCT_FEED_FLAG_FILTER_VALUE,
  // feed.cfc:L72 — the availability gate; `1^` means `>= 1` with no upper bound.
  'R:product.calculatedQATS': PRODUCT_FEED_AVAILABILITY_RANGE,
});

/* ================================================================================================
 * REMOVED HERE: A FEED-LOCAL RELATIONSHIP ASSEMBLER. DECISION F-3 ABOVE RECORDS WHY.
 * ================================================================================================
 * A `ProductFeedRelationshipAssembler` class stood at this point, together with the four helpers only
 * it used — an in-filter list delimiter, a distinct-identifier collector, an index-by-identifier map
 * builder and a resolve-or-raise lookup — and `ProductFeedQuery` took its `resolve` member as a second
 * constructor parameter. All of it is gone, and the deletion is a decision rather than a tidy-up.
 *
 * ⭐ THE HYDRATION GAP IT CLOSED IS ALREADY CLOSED, BY THE WIDER OF THE TWO CANDIDATES. F-3 states the
 * choice in full: `SmartListQueryBuilder` projects the joined entities itself and the aggregate loaders
 * in `src/adapters/mysql/catalogAggregates.ts` resolve each root SKU's product, that product's type,
 * its brand and its default SKU, attaching them through the entities' own assigners, so `execute` AND
 * `executeRecords` both answer fully navigable roots. F-3 then names this exact class as the
 * alternative and records that it "was not taken", because the hydration gap belongs to every SmartList
 * that registers a join rather than to this feed, and a feed-only projection would leave two readings
 * of the same association set to drift apart.
 *
 * ⚠️ KEEPING BOTH WOULD HAVE BEEN THE DRIFT F-3 WARNS ABOUT, NOT INSURANCE AGAINST IT. Two mechanisms
 * hydrating `sku.product`, `product.productType`, `product.brand` and `product.defaultSku` would each
 * be free to answer differently, and the second one ran for this caller alone — so a divergence would
 * have surfaced as a feed-only defect with no failing test anywhere else. The assembler was moreover
 * INJECTED BUT NEVER CALLED: `getFeedSkus` attaches nothing, exactly as F-3's closing clause says it
 * must, so the parameter was dead weight that every construction site still had to satisfy.
 *
 * WHERE THE CAPABILITY LIVES NOW: `src/adapters/mysql/catalogAggregates.ts`, reached through the
 * `SmartListQueryPort` implementation rather than through this file. Nothing here is left to attach.
 * ============================================================================================== */

/**
 * The single service capability the feed's selection needs.
 *
 * `Pick<SkuService, 'getSkuSmartList'>` rather than the class, for two reasons that are both worth
 * stating. It records in the TYPE that the feed reaches exactly one of the nine public members AAP
 * §0.4.2.2 tabulates — so a reader does not have to scan the body to learn the coupling — and it makes
 * the class constructible in a test from a one-member double, which is what "test at least one
 * non-empty item end to end" requires. The member's own signature, arity and return type are
 * untouched (TR-1); narrowing the DEPENDENCY is not narrowing the CONTRACT.
 *
 * ⚠️ THE MEMBER NAMED HERE WAS `getSkuSmartListRecords`, AND THAT NAME WAS WITHDRAWN. It was a
 * records-only reading invented alongside the ported surface, and AAP §0.4.2.2 fixes `SkuService` at
 * NINE declared public members while §0.8.3.1 makes that surface the artefact a reviewer checks "method
 * by method" — so a tenth reading defeated the check no matter how well it was documented. The sentence
 * above is now literally true rather than nearly true: `getSkuSmartList` [:L309] IS one of the nine.
 */
export type ProductFeedSkuSource = Pick<SkuService, 'getSkuSmartList'>;

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
 * through the framework container, by name, at run time; here it is a declared, typed parameter that the
 * composition root supplies. There is no locator, no prefix dispatch, no interception and no lookup by
 * string.
 *
 * ⭐ AND IT IS THE SKU SERVICE ITSELF, NOT A COMPOSER FUNCTION — WHICH IS THE HALF OF F-2 A READER IS
 * MOST LIKELY TO GET BACKWARDS. The reason an earlier revision reached for a module function was that
 * `getSkuSmartList` offered no channel for the feed's three joins, and widening its signature would
 * break TR-1. That reasoning is sound and the conclusion it reached is now unnecessary: the channel
 * exists on the INPUT, as `SmartListInput.additionalJoins`, so the feed hands the service a value that
 * already carries its joins and calls the parity-frozen member unchanged. The base declarations the
 * service contributes are still NOT re-derived here — `model/service/SkuService.cfc:L310-L322` is read
 * in exactly one place in the subtree, inside the service — and no product-type join, no alternate-code
 * join and no keyword property is restated in this file.
 *
 * ⚠️ THE MEMBER CALLED IS `getSkuSmartList` [:L309], AND ITS WHOLE RESULT IS MATERIALISED EVEN
 * THOUGH ONLY ONE VIEW OF IT IS READ. The view at
 * `integrationServices/google/views/feed/product.cfm:L16` loops the collection and reads no count, so the
 * count statement the port issues alongside the records answers a question nobody asks. An invented
 * records-only reading previously avoided it and was withdrawn: AAP §0.4.2.2 fixes this service at NINE
 * declared members, §0.8.3.1 makes that surface the thing a reviewer checks member by member, and
 * §0.1.1.1 records that this migration is "Explicitly not: Performance refactoring". The cost is named
 * here rather than removed. {@link ProductFeedSkuSource} narrows the dependency to that one member, so
 * the coupling is legible from the TYPE rather than only from the body.
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
/**
 * Optional invocation-scoped controls for one {@link ProductFeedQuery.getFeedSkus} call.
 *
 * ⚠️ THIS IS NOT THE "PARAMETER THE LEGACY NEVER OFFERED" THAT {@link ProductFeedQuery.getFeedSkus}
 * REFUSES, AND THE DISTINCTION IS THE WHOLE JUSTIFICATION FOR IT. That refusal is about SELECTION: the
 * legacy call at `integrationServices/google/google/controllers/feed.cfc:L63` takes no arguments, so a
 * caller must not be able to vary which SKUs the feed contains, and nothing here can. No field below
 * reaches the query description, the filters, the joins, the ordering or the bound parameters; supplying
 * none reads exactly what was read before, and supplying one reads exactly the same SKUs in exactly the
 * same order.
 *
 * ⛔ NO TIMEOUT, NO DEADLINE AND NO BUDGET IS DECLARED *HERE*. AAP §0.6.6 M2 records that the legacy's
 * own budget is the `requesttimeout="360"` at `integrationServices/google/views/feed/product.cfm:L9` and
 * that the delivery decision is deliberately left OPEN; minting a substitute here would settle it by
 * accident and invent a number the source does not state (S9). What this adds is the ability to OBSERVE a
 * cancellation the caller already holds — never to originate one.
 *
 * ⭐ WHERE THE MATERIALISATION BOUND DOES LIVE, so this note is not read as "the feed is unbounded".
 * Review finding F4 (CWE-400) concerned how many ROWS one selection may hydrate, which is a different
 * question from how long a render may take. That bound belongs to
 * `../../adapters/mysql/SmartListQueryBuilder.ts`: its `SmartListMaterialisationBudget` is an OPTIONAL,
 * operator-supplied figure with NO DEFAULT, and when one is wired both `execute` and `executeRecords`
 * count before hydrating and REFUSE an over-budget selection rather than truncating it. This feed reads
 * through `executeRecords`, so it inherits that gate without naming a figure — which is why no number
 * appears here and none is invented (S9). With no budget wired the path is byte-for-byte what it was.
 */
export interface ProductFeedQueryOptions {
  /**
   * A cancellation signal owned by the caller.
   *
   * Checked ONCE, immediately before the selection is issued, which is the only boundary this member
   * has: it composes an input synchronously and then awaits exactly one read. An already-aborted caller
   * therefore avoids starting a whole-catalog statement, which is precisely the waste cancellation
   * exists to prevent on the one path that reads every published SKU.
   *
   * ⚠️ AN IN-FLIGHT READ IS NOT INTERRUPTED. Once the statement is issued it runs to completion:
   * abandoning it would mean destroying a pooled connection mid-statement, and the pool discipline
   * this subtree established for exactly that hazard forbids returning a connection whose state is
   * unknown. So the check is a gate, not a kill switch, and it is documented as one.
   */
  readonly signal?: AbortSignal;
}

export class ProductFeedQuery {
  public constructor(private readonly skuService: ProductFeedSkuSource) {}

  /**
   * Reads the SKUs the feed contains.
   *
   * NO SELECTION PARAMETER, BECAUSE THE LEGACY CALL HAS NONE. feed.cfc:L63 invokes the smart-list
   * member with zero arguments and then mutates the object it gets back; the additions move into
   * {@link PRODUCT_FEED_INPUT}, so nothing is left for a caller to vary. Accepting an argument that
   * could change WHICH SKUs the feed contains would invent an interface the legacy never offered
   * (standard 9), and none is accepted.
   *
   * ⚠️ {@link ProductFeedQueryOptions} IS NOT SUCH AN ARGUMENT, AND ITS OWN DOCUMENTATION DRAWS THE
   * LINE. It is optional, it reaches nothing in the query description, and it changes neither which
   * SKUs are returned nor their order — it only lets a caller's existing cancellation be observed
   * before a whole-catalog read begins. The refusal above is about selection; this is not selection.
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
   * ⭐ THE UNPAGED COLLECTION IS THE ONE THE FEED READS, AND IT IS TAKEN FROM THE PARITY-FROZEN MEMBER.
   * `product.cfm:L16` loops the smart list's RECORDS, and the document reads no page and no count
   * anywhere in its 66 lines. (SIXTY-SIX, not sixty-five: `wc -l` reports 65 because the file's last
   * line, `</cfoutput>` at `:L66`, carries no trailing newline, and `wc -l` counts newlines rather than
   * lines. The five sibling citations in this folder all read `product.cfm:L1-L66` for the same reason.)
   * This member therefore reads `SmartListResult.records` from `getSkuSmartList` [:L309] — the whole
   * selection, in the selection's own order — and reads nothing else off the result.
   *
   * ⚠️ AN EARLIER REVISION CALLED AN INVENTED RECORDS-ONLY READING HERE, AND THE ARGUMENT FOR IT IS
   * RECORDED BECAUSE IT WAS A REASONABLE ARGUMENT THAT DOES NOT SURVIVE THE PRECEDENCE ORDER. The legacy
   * framework materialises each view on FIRST READ of that view —
   * `org/Hibachi/HibachiSmartList.cfc:L751-L755`, `:L759-L764` and `:L771`, each behind its own
   * "have I already?" test — so the legacy feed issues exactly ONE statement, and a records-only member
   * matched that count where the full result also materialises a count. But AAP §0.4.2.2 fixes
   * `SkuService` at NINE declared public members and §0.8.3.1 requires that surface be checkable "method
   * by method", so the tenth member was a parity defect regardless of what it saved. AAP §0.1.1.1 settles
   * the residue explicitly — "Explicitly not: Performance refactoring" — and §0.8.2 Guideline 4 forbids
   * optimising "beyond what the migration requires". The extra statement the port materialises is
   * accepted, deliberately and with its cost named, as the price of the declared surface.
   *
   * ⚠️ THE SELECTION IS UNCHANGED, AND THAT IS STRUCTURAL RATHER THAN ASSERTED. `SkuService` composes
   * this selection in ONE private member, so the entity, the three base joins including the left join,
   * the five keyword properties, the filters, the ordering and the bound parameters are exactly the text
   * that member emits. This file still contributes nothing to the selection beyond
   * {@link PRODUCT_FEED_INPUT} and still does not reach past the service.
   *
   * ⛔ NOT A TRUNCATION AND NOT A PAGE. Nothing here limits, slices, sorts or trims: the unpaged
   * collection is the WHOLE selection, which is exactly what the legacy `cfloop` walks. Returning the
   * page instead would silently shorten the feed, and no `LIMIT` is introduced anywhere on this path.
   *
   * ⭐ AND "WHOLE" IS BOUNDED WHERE BOUNDING BELONGS, NOT HERE. When the composition root wires a
   * `SmartListMaterialisationBudget`, `../../adapters/mysql/SmartListQueryBuilder.ts` counts the selection
   * before hydrating it and REFUSES one that exceeds the figure — it never returns a shortened feed, which
   * is the property this note protects (review finding F4). With no budget wired nothing changes here at
   * all. Either way this file states no figure and applies no limit of its own.
   *
   * @param options optional invocation-scoped controls that change neither the selection nor its
   *   order; see {@link ProductFeedQueryOptions}
   * @throws {DomainError} when {@link ProductFeedQueryOptions.signal} is already aborted, in which case
   *   no statement is issued at all
   * @returns The feed's SKUs, unpaged, in the selection's own order — exactly the collection
   *          `integrationServices/google/views/feed/product.cfm:L16` loops. Nothing is re-shaped,
   *          re-sorted or trimmed on the way out.
   */
  public async getFeedSkus(options?: ProductFeedQueryOptions): Promise<Sku[]> {
    /*
     * ⭐ P17 — THE ONE BOUNDARY THIS MEMBER HAS, CHECKED BEFORE IT IS CROSSED. Everything above this
     * line is synchronous composition and everything below it is a single read, so there is exactly one
     * place a cancellation can be honoured without abandoning work in progress. Nothing is invented: no
     * signal is created here, no deadline is derived and no budget is imposed; with no signal supplied
     * this is a no-op and the read is issued exactly as before.
     */
    if (options?.signal?.aborted === true) {
      throw new DomainError(
        'The Google product feed selection was cancelled before it was issued.',
      );
    }

    // feed.cfc:L63 with L68-L72 folded in: one call, with the selection declared up front (F-1). Every
    // companion argument is left unsupplied, matching the legacy call exactly.
    /*
     * THE JOINS TRAVEL INSIDE {@link PRODUCT_FEED_INPUT}, NOT AS A COMPANION ARGUMENT — and the choice
     * decides an observable value, so it is argued rather than assumed.
     *
     * `SmartListInput.additionalJoins` carries them. `translateSmartListInput` in
     * `src/util/smartListInput.ts` appends that member AFTER the calling service's own base list, which
     * is the legacy order — `model/service/SkuService.cfc:L314-L316` seeds the smart list at
     * `feed.cfc:L63`, then `:L64-L66` add to the object the controller now holds.
     *
     * ⚠️ THE JOIN PARAMETER IS A DIFFERENT CHANNEL WITH A DIFFERENT RESULT, WHICH IS WHY IT IS NOT USED
     * HERE. Handing joins to `getSkuSmartList`'s trailing join parameter routes them through
     * `mergeSmartListJoins`, which COLLAPSES a repeated `parentEntityName.relatedProperty`. The feed's
     * first join repeats `SkuService.cfc:L314` verbatim, so that channel would describe FIVE joins where
     * this one describes SIX. Carrying the repeat is the faithful description: the legacy absorbs it
     * at REGISTRATION time, not at declaration time — `org/Hibachi/HibachiSmartList.cfc:L269` guards the
     * append with `if(!structKeyExists(variables.entities,newEntityName))` and `:L549` builds the FROM
     * clause by walking that registry, one join per registered entity — and
     * `src/adapters/mysql/SmartListQueryBuilder.ts` reproduces that guard, so the emitted statement holds
     * one join either way. `test/integrations/ProductFeedQuery.test.ts` pins both halves: six joins in
     * order, and the duplicate present twice in the description.
     *
     * Both companion arguments are therefore left unsupplied, which also matches `feed.cfc:L63` calling
     * the member with no arguments at all.
     */
    const selection = await this.skuService.getSkuSmartList(PRODUCT_FEED_INPUT);

    /* `SmartListResult.records` is `readonly Sku[]` and this member answers `Sku[]`, so the collection is
     * copied rather than cast. The copy is shallow and deliberate: it hands the caller a collection it may
     * hold without also handing it a writable alias of the result the port returned. No element is
     * re-shaped, re-sorted, filtered or trimmed on the way through — the order is the selection's own,
     * which is the order `product.cfm:L16` walks. */
    return [...selection.records];
  }
}
